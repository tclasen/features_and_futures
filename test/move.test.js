import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';

test('moves append, preserve data and filters, enforce active ownership, and persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-move-'));
  const dbPath = join(directory, 'db.sqlite');
  // Legacy rows must retain their original order after the ordering migration.
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Source'), ('Destination'), ('Archived');
    INSERT INTO tasks (project_id, title) VALUES (1, 'First'), (1, 'Moving'), (2, 'Existing'), (1, 'Last');`);
  db.close();
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: dbPath }, stdio: 'ignore'
    });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + '/health')).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Server did not start');
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exit = once(child, 'exit');
      child.kill('SIGTERM');
      await exit;
    }
  }
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
  });
  const get = async path => (await fetch(base + path)).text();
  const titles = html => [...html.matchAll(/<\/form><span>([^<]*)<\/span>/g)].map(match => match[1]);
  const destinations = html => [...html.matchAll(/<select id="destination-project-\d+"[^>]*>(.*?)<\/select>/g)].map(match => match[1]);
  const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-01-01', dueThrough: '2024-12-31' };
  try {
    await start();
    assert.deepEqual(titles(await get('/projects/1')), ['First', 'Moving', 'Last']);
    await post('/projects/3/archive');
    await post('/projects/2/rename', { name: 'Renamed destination' });
    await post('/projects/2/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks/2/completion', { completed: '1' });
    await post('/projects/1/tasks/2/priority', { priority: 'High' });
    await post('/projects/1/tasks/2/due-date', { dueDate: '2024-02-29' });
    assert.deepEqual(destinations(await get('/projects/1')), Array(3).fill('<option value="2">Renamed destination</option>'));
    for (const destination of ['1', '3', '999', '']) {
      assert.equal((await post('/projects/1/tasks/2/move', { ...state, destination })).status, 400);
    }
    assert.equal((await post('/projects/2/tasks/2/move', { destination: '1' })).status, 404);
    const moved = await post('/projects/1/tasks/2/move', { ...state, destination: '2' });
    assert.equal(moved.status, 303);
    assert.equal(moved.headers.get('location'), `/projects/1?${new URLSearchParams(state)}`);
    assert.deepEqual(titles(await get(moved.headers.get('location'))), []);
    assert.deepEqual(titles(await get('/projects/1')), ['First', 'Last']);
    assert.deepEqual(titles(await get('/projects/2')), ['Existing', 'Moving']);
    let page = await get('/projects/2');
    assert.match(page, /aria-label="Complete Moving" checked/);
    assert.match(page, /id="task-priority-2"[^>]*><option>Low<\/option><option>Normal<\/option><option selected>High<\/option>/);
    assert.match(page, /id="task-due-date-2" name="dueDate" value="2024-02-29"/);
    assert.match(await get('/'), /project-summary">0\/2 completed/);
    assert.match(await get('/'), /project-summary">1\/2 completed/);
    // Returning recovers the original position; subsequent creation still appends.
    await post('/projects/2/tasks/2/move', { destination: '1' });
    await post('/projects/1/tasks', { title: 'New' });
    assert.deepEqual(titles(await get('/projects/1')), ['First', 'Moving', 'Last', 'New']);
    await post('/projects/1/tasks/1/move', { destination: '2' });
    assert.deepEqual(titles(await get('/projects/2')), ['Existing', 'First']);
    await post('/projects/1/archive');
    page = await get('/projects/1');
    assert.match(page, /id="destination-project-2" name="destination" disabled/);
    assert.match(page, /<button type="submit" disabled>Move task/);
    assert.equal((await post('/projects/1/tasks/2/move', { destination: '2' })).status, 403);
    page = await get('/projects/2');
    assert.deepEqual(destinations(page), ['', '']);
    assert.match(page, /id="destination-project-1" name="destination" disabled/);
    await post('/projects/1/restore');
    await post('/projects/3/restore');
    assert.deepEqual(destinations(await get('/projects/2')), Array(2).fill('<option value="1">Source</option><option value="3">Archived</option>'));
    await stop();
    await start();
    assert.deepEqual(titles(await get('/projects/1')), ['Moving', 'Last', 'New']);
    assert.deepEqual(titles(await get('/projects/2')), ['Existing', 'First']);
    page = await get('/projects/1');
    assert.match(page, /aria-label="Complete Moving" checked/);
    assert.match(page, /id="task-due-date-2" name="dueDate" value="2024-02-29"/);
    assert.match(await get('/projects/2'), /id="task-due-date-1" name="dueDate" value=""/);
    assert.equal((await post('/projects/1/tasks/2/move', { destination: '2' })).status, 303);
    assert.deepEqual(titles(await get('/projects/2')), ['Existing', 'Moving', 'First']);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
