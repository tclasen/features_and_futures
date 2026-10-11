import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('project defaults migrate, persist independently and affect only subsequent tasks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-defaults-'));
  const dbPath = join(dir, 'db.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Existing');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Legacy task', 1);`);
  legacy.close();
  let child, base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'inherit']
    });
    base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Startup timeout')), 5000);
      child.stdout.on('data', chunk => {
        const match = /listening on port (\d+)/.exec(String(chunk));
        if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
      });
    });
  }
  async function stop() { const exited = once(child, 'exit'); child.kill(); await exited; child = null; }
  const html = async path => (await fetch(base + path)).text();
  const post = (path, values = {}) => fetch(base + path, { method: 'POST', body: new URLSearchParams(values), redirect: 'manual' });
  const select = (text, id) => text.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`))[1];
  const selected = (text, id) => select(text, id).match(/<option selected>([^<]+)/)[1];
  try {
    await start();
    let text = await html('/projects/1');
    assert.equal(selected(text, 'default-task-priority'), 'Normal');
    assert.deepEqual([...select(text, 'default-task-priority').matchAll(/<option[^>]*>([^<]+)/g)].map(m => m[1]), ['Low', 'Normal', 'High']);
    assert.equal(selected(text, 'task-priority-1'), 'Normal');
    await post('/projects', { name: 'Independent' });
    assert.equal(selected(await html('/projects/2'), 'default-task-priority'), 'Normal');
    const filters = { filter: 'Completed', priorityFilter: 'Normal' };
    const response = await post('/projects/1/default-priority', { ...filters, priority: 'High' });
    assert.equal(response.headers.get('location'), '/projects/1?filter=Completed&priorityFilter=Normal');
    text = await html(response.headers.get('location'));
    assert.equal(selected(text, 'task-filter'), 'Completed');
    assert.equal(selected(text, 'priority-filter'), 'Normal');
    assert.match(text, /Complete Legacy task/);
    assert.equal(selected(text, 'task-priority-1'), 'Normal');
    await post('/projects/1/tasks', { title: 'Inherited high' });
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Inherited low' });
    await post('/projects/2/tasks', { title: 'Independent normal' });
    await post('/projects/1/tasks/2', { completed: '1' });
    await post('/projects/1/tasks/2/rename', { title: ' Renamed high ' });
    await post('/projects/1/rename', { name: ' Renamed project ' });
    assert.equal((await post('/projects/1/default-priority', { priority: 'Invalid' })).status, 400);
    text = await html('/projects/1');
    assert.equal(selected(text, 'default-task-priority'), 'Low');
    assert.equal(selected(text, 'task-priority-2'), 'High');
    assert.equal(selected(text, 'task-priority-3'), 'Low');
    assert.match(text, /Complete Renamed high" checked/);
    assert.match(await html('/'), /2\/3 completed/);
    assert.equal(selected(await html('/projects/2'), 'task-priority-4'), 'Normal');
    await post('/projects/1/archive');
    text = await html('/projects/1');
    assert.match(text, /id="default-task-priority" name="priority" disabled/);
    assert.equal((await post('/projects/1/default-priority', { priority: 'High' })).status, 403);
    await stop();
    await start();
    assert.equal(selected(await html('/projects/1'), 'default-task-priority'), 'Low');
    await post('/projects/1/restore');
    text = await html('/projects/1');
    assert.doesNotMatch(text, / disabled/);
    assert.match(text, /<h1>Renamed project<\/h1>/);
    assert.equal(selected(text, 'task-priority-2'), 'High');
    assert.match(text, /Complete Renamed high" checked/);
    await post('/projects/1/tasks', { title: 'After restart' });
    assert.equal(selected(await html('/projects/1'), 'task-priority-5'), 'Low');
    assert.match(await html('/'), /2\/4 completed/);
  } finally {
    if (child) await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
