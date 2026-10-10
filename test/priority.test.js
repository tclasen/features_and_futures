import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { DatabaseSync } from 'node:sqlite';

test('priorities migrate, persist independently, and respect ownership and archives', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  const databasePath = join(directory, 'db.sqlite');
  const db = new DatabaseSync(databasePath);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('First'), ('Second');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing', 1);`);
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
  const options = (priority) => ['Low', 'Normal', 'High'].map(value => `<option${value === priority ? ' selected' : ''}>${value}</option>`).join('');
  const select = (html, id) => html.match(new RegExp(`<select id="task-priority-${id}"[^>]*>\\s*(.*?)\\s*</select>`, 's'));
  try {
    await start();
    await post('/projects/1/tasks', { title: 'New' });
    await post('/projects/2/tasks', { title: 'Other' });
    const original = await get('/projects/1');
    assert.equal(select(original, 1)[1], options('Normal'));
    assert.equal(select(original, 2)[1], options('Normal'));
    for (const priority of ['High', 'Low', 'Normal', 'High']) {
      const result = await post('/projects/1/tasks/1/priority', { priority, filter: 'Completed' });
      assert.equal(result.status, 303);
      assert.equal(result.headers.get('location'), '/projects/1?filter=Completed');
      assert.equal(select(await get('/projects/1'), 1)[1], options(priority));
    }
    assert.equal(select(await get('/projects/1'), 2)[1], options('Normal'));
    assert.equal(select(await get('/projects/2'), 3)[1], options('Normal'));
    assert.equal((await post('/projects/2/tasks/1/priority', { priority: 'Low' })).status, 404);
    assert.equal((await post('/projects/1/tasks/99/priority', { priority: 'Low' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Urgent' })).status, 400);
    const updated = await get('/projects/1');
    assert.equal(updated, original.replace(options('Normal'), options('High')));
    assert.match(await get('/'), /1\/2 completed/);
    assert.match(await get('/projects/1?filter=Completed'), /Complete Existing/);
    assert.doesNotMatch(await get('/projects/1?filter=Open'), /Complete Existing/);
    await post('/projects/1/tasks/1/rename', { title: 'Renamed' });
    const renamed = await get('/projects/1');
    assert.equal(select(renamed, 1)[1], options('High'));
    await stop();
    await start();
    assert.equal(await get('/projects/1'), renamed);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.match(select(archived, 1)[0], /disabled/);
    assert.match(select(archived, 2)[0], /disabled/);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Low' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await stop();
    await start();
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), renamed);
    await post('/projects/1/tasks/1/priority', { priority: 'Low' });
    assert.equal(select(await get('/projects/1'), 1)[1], options('Low'));
    assert.match(await get('/'), /1\/2 completed/);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
