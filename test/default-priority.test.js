import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('project defaults migrate, persist and affect only subsequent tasks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-defaults-'));
  const dbPath = join(directory, 'db.sqlite');
  // A pre-defaults database must preserve its projects and tasks.
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
    INSERT INTO projects (name) VALUES ('Existing');
    INSERT INTO tasks (project_id, title, completed, priority) VALUES (1, 'Existing task', 1, 'Low');`);
  db.close();
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
  const selected = (html, id) => html.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`))[1].match(/<option selected>([^<]+)</)[1];
  const titles = html => [...html.matchAll(/aria-label="Complete ([^"]+)"/g)].map(match => match[1]);
  try {
    await start();
    assert.deepEqual(await (await fetch(base + '/health')).json(), { status: 'ok' });
    let html = await get('/projects/1');
    assert.equal(selected(html, 'default-task-priority'), 'Normal');
    assert.equal(selected(html, 'task-priority-1'), 'Low');
    assert.match(html, /<option>Low<\/option><option selected>Normal<\/option><option>High<\/option>/);
    await post('/projects', { name: 'Independent' });
    await post('/projects/1/tasks', { title: 'Normal inherited' });
    const state = { filter: 'Completed', priorityFilter: 'Low' };
    const path = '/projects/1?filter=Completed&priorityFilter=Low';
    const summary = await get('/');
    const changed = await post('/projects/1/default-priority', { ...state, priority: 'High' });
    assert.equal(changed.headers.get('location'), path);
    html = await get(path);
    assert.equal(selected(html, 'default-task-priority'), 'High');
    assert.equal(selected(html, 'task-filter'), 'Completed');
    assert.equal(selected(html, 'priority-filter'), 'Low');
    assert.deepEqual(titles(html), ['Existing task']);
    assert.equal(await get('/'), summary);
    await post('/projects/1/tasks', { title: 'High inherited' });
    await post('/projects/2/tasks', { title: 'Independent task' });
    html = await get('/projects/1');
    assert.deepEqual(titles(html), ['Existing task', 'Normal inherited', 'High inherited']);
    assert.equal(selected(html, 'task-priority-2'), 'Normal');
    assert.equal(selected(html, 'task-priority-3'), 'High');
    assert.equal(selected(await get('/projects/2'), 'default-task-priority'), 'Normal');
    assert.equal(selected(await get('/projects/2'), 'task-priority-4'), 'Normal');
    assert.equal((await post('/projects/1/default-priority', { priority: 'Invalid' })).status, 400);
    await post('/projects/1/rename', { name: ' Renamed project ' });
    await post('/projects/1/archive');
    html = await get(path);
    assert.match(html, /id="default-task-priority" name="priority" disabled/);
    assert.equal(selected(html, 'default-task-priority'), 'High');
    assert.equal((await post('/projects/1/default-priority', { priority: 'Low' })).status, 403);
    await stop();
    await start();
    assert.equal(await get(path), html);
    await post('/projects/1/restore');
    html = await get('/projects/1');
    assert.doesNotMatch(html, /id="default-task-priority"[^>]*disabled/);
    assert.equal(selected(html, 'default-task-priority'), 'High');
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Low inherited' });
    html = await get('/projects/1');
    assert.equal(selected(html, 'task-priority-3'), 'High');
    assert.equal(selected(html, 'task-priority-5'), 'Low');
    assert.match(html, /<h1>Renamed project<\/h1>/);
    assert.match(await get('/'), /1\/4 completed/);
    await stop();
    await start();
    assert.equal(await get('/projects/1'), html);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
