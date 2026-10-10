import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

test('task moves append, preserve data and filters, reject archived projects, and persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-move-'));
  const path = join(directory, 'db.sqlite');
  // Upgrade an existing database whose tasks previously sorted by ID.
  const legacy = new DatabaseSync(path);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Source'), ('Destination'), ('Other');
    INSERT INTO tasks (project_id, title) VALUES (1, 'First'), (1, 'Remaining'), (2, 'Existing');`);
  legacy.close();
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: path }, stdio: 'ignore'
    });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + '/health')).ok) return; } catch {}
      if (child.exitCode !== null) throw new Error('Server exited');
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Server did not start');
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
  }
  const get = async url => (await fetch(base + url)).text();
  const post = (url, values = {}) => fetch(base + url, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
  });
  const rows = html => [...html.matchAll(/aria-label="Complete ([^"]+)"/g)].map(match => match[1]);
  const selected = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-01-01', dueThrough: '2024-12-31' };
  function saved(id) {
    const db = new DatabaseSync(path);
    try { return { ...db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) }; }
    finally { db.close(); }
  }
  try {
    await start();
    assert.deepEqual(rows(await get('/projects/1')), ['First', 'Remaining']);
    let html = await get('/projects/1');
    assert.match(html, /id="destination-project-1"[^>]*>[\s\S]*?<option value="2">Destination<\/option>\s*<option value="3">Other<\/option>\s*<\/select>/);
    await post('/projects/2/rename', { name: 'Renamed destination' });
    assert.match(await get('/projects/1'), /<option value="2">Renamed destination<\/option>/);
    await post('/projects/1/tasks/1', { completed: '1' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
    await post('/projects/2/default-priority', { priority: 'Low' });
    const original = saved(1);
    const response = await post('/projects/1/tasks/1/move', { ...selected, destination: '2' });
    assert.equal(response.status, 303);
    const location = response.headers.get('location');
    assert.equal(new URL(location, base).pathname, '/projects/1');
    for (const [key, value] of Object.entries(selected)) assert.equal(new URL(location, base).searchParams.get(key), value);
    html = await get(location);
    assert.deepEqual(rows(html), []);
    assert.match(html, /id="task-filter"[\s\S]*?<option selected>Completed<\/option>/);
    assert.match(html, /id="priority-filter"[\s\S]*?<option selected>High<\/option>/);
    assert.match(html, /id="due-from"[^>]*value="2024-01-01"/);
    assert.match(html, /id="due-through"[^>]*value="2024-12-31"/);
    assert.deepEqual(rows(await get('/projects/1')), ['Remaining']);
    assert.deepEqual(rows(await get('/projects/2')), ['Existing', 'First']);
    const moved = saved(1);
    assert.deepEqual({ ...moved, project_id: original.project_id, position: original.position }, original);
    assert.match(await get('/'), /project-summary">0\/1 completed/);
    assert.match(await get('/'), /project-summary">1\/2 completed/);
    await post('/projects/2/tasks', { title: 'New after move' });
    assert.deepEqual(rows(await get('/projects/2')), ['Existing', 'First', 'New after move']);
    await stop();
    await start();
    assert.deepEqual(saved(1), moved);
    assert.deepEqual(rows(await get('/projects/2')), ['Existing', 'First', 'New after move']);
    // Move an undated task and move the original back: each appends to its destination.
    await post('/projects/1/tasks/2/move', { destination: '2' });
    assert.equal(saved(2).due_date, '');
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(rows(await get('/projects/1')), ['First']);
    assert.deepEqual(rows(await get('/projects/2')), ['Existing', 'New after move', 'Remaining']);
    await post('/projects/2/tasks/2/move', { destination: '1' });
    assert.deepEqual(rows(await get('/projects/1')), ['First', 'Remaining']);
    // Invalid and archived destinations cannot change ownership or data.
    const beforeInvalid = saved(1);
    for (const destination of ['1', '999', '', 'not-an-id']) {
      assert.equal((await post('/projects/1/tasks/1/move', { destination })).status, 400);
      assert.deepEqual(saved(1), beforeInvalid);
    }
    await post('/projects/2/archive');
    html = await get('/projects/1');
    assert.doesNotMatch(html, /<option value="2">/);
    assert.equal((await post('/projects/1/tasks/1/move', { destination: '2' })).status, 400);
    await post('/projects/3/archive');
    html = await get('/projects/1');
    assert.match(html, /id="destination-project-1"[^>]* disabled>\s*<\/select>/);
    assert.match(html, /<button type="submit" disabled>Move task<\/button>/);
    await post('/projects/1/archive');
    html = await get('/projects/1');
    assert.match(html, /id="destination-project-1"[^>]* disabled>/);
    assert.equal((await post('/projects/1/tasks/1/move', { destination: '2' })).status, 403);
    assert.deepEqual(saved(1), beforeInvalid);
    await post('/projects/2/restore');
    html = await get('/projects/1');
    assert.match(html, /id="destination-project-1"[^>]* disabled>[\s\S]*?<option value="2">Renamed destination<\/option>/);
    await post('/projects/1/restore');
    html = await get('/projects/1');
    assert.match(html, /id="destination-project-1" name="destination">/);
    assert.equal((await post('/projects/1/tasks/1/move', { destination: '2' })).status, 303);
    assert.deepEqual(rows(await get('/projects/2')), ['Existing', 'New after move', 'First']);
    // A stale source URL must not move a task now owned by another project.
    assert.equal((await post('/projects/1/tasks/1/move', { destination: '2' })).status, 404);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
