import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { DatabaseSync } from 'node:sqlite';

test('moves preserve data, append order, filters, summaries and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-moves-'));
  const dbPath = join(directory, 'db.sqlite');
  // Simulate the previous schema and ordering before migration.
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects(name) VALUES ('Source'), ('Destination'), ('Archived');
    INSERT INTO tasks(project_id,title) VALUES (1,'First'), (1,'Remaining'), (2,'Existing');`);
  db.close();
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port), DB_PATH: dbPath }, stdio: 'ignore' });
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
  const post = (path, data = {}) => fetch(base + path, { method: 'POST', body: new URLSearchParams(data), redirect: 'manual' });
  const get = async path => (await fetch(base + path)).text();
  const rows = html => [...html.matchAll(/aria-label="Complete ([^"]*)"/g)].map(m => m[1]);
  const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-01-01', dueThrough: '2024-12-31' };
  try {
    await start();
    assert.deepEqual(rows(await get('/projects/1')), ['First', 'Remaining']);
    await post('/projects/3/archive');
    await post('/projects/2/rename', { name: 'Renamed destination' });
    let html = await get('/projects/1');
    assert.match(html, /name="destination">\s*<option value="2">Renamed destination<\/option>\s*<\/select>/);
    await post('/projects/1/tasks/1', { completed: '1' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
    await post('/projects/2/default-priority', { priority: 'Low' });
    for (const destination of ['1', '3', '999', 'bad', '']) {
      assert.equal((await post('/projects/1/tasks/1/move', { destination })).status, 400);
    }
    const moved = await post('/projects/1/tasks/1/move', { destination: '2', ...state });
    assert.equal(moved.status, 303);
    const location = moved.headers.get('location');
    for (const [key, value] of Object.entries(state)) assert.equal(new URL(location, base).searchParams.get(key), value);
    assert.deepEqual(rows(await get(location)), []);
    assert.deepEqual(rows(await get('/projects/1')), ['Remaining']);
    html = await get('/projects/2');
    assert.deepEqual(rows(html), ['Existing', 'First']);
    assert.match(html, /aria-label="Complete First" checked/);
    assert.match(html, /<option selected>High<\/option>/);
    assert.match(html, /id="task-due-date-1"[^>]*value="2024-02-29"/);
    assert.match(await get('/'), /0\/1 completed/);
    assert.match(await get('/'), /1\/2 completed/);
    await post('/projects/2/tasks', { title: 'New' });
    assert.deepEqual(rows(await get('/projects/2')), ['Existing', 'First', 'New']);
    await stop();
    await start();
    assert.deepEqual(rows(await get('/projects/2')), ['Existing', 'First', 'New']);
    await post('/projects/2/archive');
    assert.equal((await post('/projects/2/tasks/1/move', { destination: '1' })).status, 403);
    html = await get('/projects/2');
    assert.match(html, /name="destination" disabled/);
    assert.match(html, /<button type="submit" disabled>Move task/);
    html = await get('/projects/1');
    assert.match(html, /name="destination" disabled>\s*<\/select>/);
    await post('/projects/2/restore');
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(rows(await get('/projects/1')), ['Remaining', 'First']);
    // Move an undated task too, then move it back: both append correctly.
    await post('/projects/2/tasks/3/move', { destination: '1' });
    assert.deepEqual(rows(await get('/projects/1')), ['Remaining', 'First', 'Existing']);
    assert.match(await get('/projects/1'), /id="task-due-date-3"[^>]*value=""/);
    await post('/projects/1/tasks/3/move', { destination: '2' });
    assert.deepEqual(rows(await get('/projects/2')), ['New', 'Existing']);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
