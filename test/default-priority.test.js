import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { DatabaseSync } from 'node:sqlite';

test('project defaults migrate, inherit independently, preserve filters and survive archives and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-default-'));
  const databasePath = join(directory, 'db.sqlite');
  const db = new DatabaseSync(databasePath);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Existing');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing task', 1);`);
  db.close();
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: databasePath }, stdio: 'ignore',
    });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + '/health')).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Server did not start');
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = undefined;
  }
  const post = (path, data = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
  });
  const get = async path => (await fetch(base + path)).text();
  const select = (html, id) => html.match(new RegExp(`<select id="${id}"[^>]*>\\s*(.*?)\\s*</select>`, 's'));
  const options = priority => ['Low', 'Normal', 'High'].map(value => `<option${value === priority ? ' selected' : ''}>${value}</option>`).join('');
  try {
    await start();
    await post('/projects', { name: 'New project' });
    for (const id of [1, 2]) assert.equal(select(await get(`/projects/${id}`), 'default-task-priority')[1], options('Normal'));
    await post('/projects/1/tasks', { title: 'Normal inherited' });
    const filteredPath = '/projects/1?filter=Completed&priorityFilter=Normal';
    const before = await get(filteredPath);
    const changed = await post('/projects/1/default-priority', { priority: 'High', filter: 'Completed', priorityFilter: 'Normal' });
    assert.equal(changed.status, 303);
    assert.equal(changed.headers.get('location'), filteredPath);
    const after = await get(filteredPath);
    assert.equal(after, before.replace(select(before, 'default-task-priority')[0], select(before, 'default-task-priority')[0].replace(options('Normal'), options('High'))));
    await post('/projects/1/tasks', { title: 'High inherited' });
    await post('/projects/2/tasks', { title: 'Independent normal' });
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Low inherited' });
    let html = await get('/projects/1');
    for (const [id, priority] of [[1, 'Normal'], [2, 'Normal'], [3, 'High'], [5, 'Low']]) {
      assert.equal(select(html, `task-priority-${id}`)[1], options(priority));
    }
    assert.equal(select(await get('/projects/2'), 'task-priority-4')[1], options('Normal'));
    assert.match(await get('/'), /1\/4 completed/);
    assert.equal((await post('/projects/1/default-priority', { priority: 'Urgent' })).status, 400);
    assert.equal((await post('/projects/999/default-priority', { priority: 'Low' })).status, 404);
    await post('/projects/1/rename', { name: 'Renamed' });
    await post('/projects/1/tasks/3/rename', { title: 'Renamed high' });
    html = await get('/projects/1');
    await stop();
    await start();
    assert.equal(await get('/projects/1'), html);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.match(select(archived, 'default-task-priority')[0], /disabled/);
    assert.equal(select(archived, 'default-task-priority')[1], options('Low'));
    assert.equal((await post('/projects/1/default-priority', { priority: 'High' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await stop();
    await start();
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), html);
    await post('/projects/1/tasks', { title: 'Restored low' });
    assert.equal(select(await get('/projects/1'), 'task-priority-6')[1], options('Low'));
    assert.match(await get('/'), /1\/5 completed/);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
