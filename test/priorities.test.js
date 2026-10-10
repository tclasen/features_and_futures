import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('priorities migrate, remain independent, persist and respect archived projects', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  const dbPath = join(directory, 'db.sqlite');
  const oldDatabase = new DatabaseSync(dbPath);
  oldDatabase.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('First'), ('Other');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing', 1), (2, 'Separate', 0);
  `);
  oldDatabase.close();
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: dbPath },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const port = await new Promise((resolve, reject) => {
      let output = '';
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) resolve(match[1]);
      });
      child.once('error', reject);
      child.once('exit', code => reject(new Error(`Server exited: ${code}`)));
    });
    base = `http://127.0.0.1:${port}`;
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }
  const get = async path => (await fetch(base + path)).text();
  const post = (path, data = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
  });
  const options = '<option>Low</option><option selected>Normal</option><option>High</option>';
  try {
    await start();
    await post('/projects/1/tasks', { title: 'New' });
    const initial = await get('/projects/1');
    assert.equal(initial.split(options).length - 1, 3);
    assert.match(initial, /<label for="task-priority-1">Task priority<\/label>/);
    const other = await get('/projects/2');
    const summaries = await get('/');
    const result = await post('/projects/1/tasks/1/priority', { priority: 'High', filter: 'Completed' });
    assert.equal(result.status, 303);
    assert.equal(result.headers.get('location'), '/projects/1?filter=Completed');
    const high = initial.replace(/(<select id="task-priority-1"[^>]*>\s*)[^<]*(?:<option[^>]*>[^<]*<\/option>){3}/, '$1<option>Low</option><option>Normal</option><option selected>High</option>');
    assert.equal(await get('/projects/1'), high);
    assert.equal(await get('/projects/2'), other);
    assert.equal(await get('/'), summaries);
    assert.match(await get('/projects/1?filter=Completed'), /Complete Existing/);
    assert.doesNotMatch(await get('/projects/1?filter=Open'), /Complete Existing/);
    assert.equal((await post('/projects/2/tasks/1/priority', { priority: 'Low' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/priority', { priority: 'Low' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Urgent' })).status, 400);
    assert.equal(await get('/projects/1'), high);
    await post('/projects/1/tasks/1/rename', { title: 'Renamed' });
    const renamed = high.replaceAll('Existing', 'Renamed');
    assert.equal(await get('/projects/1'), renamed);
    await post('/projects/1/tasks/3/priority', { priority: 'Low' });
    const saved = renamed.replace(/(<select id="task-priority-3"[^>]*>\s*)[^<]*(?:<option[^>]*>[^<]*<\/option>){3}/, '$1<option selected>Low</option><option>Normal</option><option>High</option>');
    assert.equal(await get('/projects/1'), saved);
    await stop();
    await start();
    assert.equal(await get('/projects/1'), saved);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.match(archived, /id="task-priority-1" name="priority" disabled/);
    assert.match(archived, /id="task-priority-3" name="priority" disabled/);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Normal' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await stop();
    await start();
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), saved);
    await post('/projects/1/tasks/1/priority', { priority: 'Normal' });
    assert.match(await get('/projects/1'), /<option>Low<\/option><option selected>Normal<\/option><option>High<\/option>/);
    assert.equal(await get('/'), summaries);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
