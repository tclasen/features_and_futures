import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';

test('remembered positions survive reverse returns, empty projects, edits and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-return-'));
  const dbPath = join(directory, 'db.sqlite');
  // Task 011 database: order differs from IDs and must survive the migration.
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL);
    INSERT INTO projects (name) VALUES ('A'), ('B'), ('C');
    INSERT INTO tasks (project_id, title, position) VALUES (1, 'Second', 12), (1, 'First', 7), (1, 'Third', 20), (2, 'Resident', 1);`);
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
  const move = async (source, id, destination) => {
    assert.equal((await post(`/projects/${source}/tasks/${id}/move`, { destination })).status, 303);
  };
  const get = async path => (await fetch(base + path)).text();
  const titles = async id => [...(await get(`/projects/${id}`)).matchAll(/<\/form><span>([^<]*)<\/span>/g)].map(match => match[1]);
  try {
    await start();
    assert.deepEqual(await titles(1), ['First', 'Second', 'Third']);
    await move(1, 2, 2);
    await move(1, 1, 2);
    await move(1, 3, 2);
    assert.deepEqual(await titles(2), ['Resident', 'First', 'Second', 'Third']);
    // New positions are allocated after remembered positions, even when empty.
    await post('/projects/1/tasks', { title: 'New' });
    await move(2, 4, 1);
    await post('/projects/1/rename', { name: 'Renamed A' });
    await post('/projects/2/tasks/2/rename', { title: 'Changed first' });
    await post('/projects/2/tasks/2/completion', { completed: '1' });
    await post('/projects/2/tasks/2/priority', { priority: 'High' });
    await post('/projects/2/tasks/2/due-date', { dueDate: '0001-01-01' });
    await post('/projects/1/archive');
    assert.equal((await post('/projects/2/tasks/2/move', { destination: '1' })).status, 400);
    await stop();
    await start();
    await post('/projects/1/restore');
    await move(2, 3, 1);
    await move(2, 1, 1);
    await move(2, 2, 1);
    assert.deepEqual(await titles(1), ['Changed first', 'Second', 'Third', 'New', 'Resident']);
    const page = await get('/projects/1');
    assert.match(page, /aria-label="Complete Changed first" checked/);
    assert.match(page, /id="task-priority-2"[^>]*><option>Low<\/option><option>Normal<\/option><option selected>High<\/option>/);
    assert.match(page, /id="task-due-date-2" name="dueDate" value="0001-01-01"/);
    // First visits to C append; returns to B restore B's independent positions.
    await move(1, 1, 3);
    await move(1, 2, 3);
    assert.deepEqual(await titles(3), ['Second', 'Changed first']);
    await move(3, 1, 2);
    await move(3, 2, 2);
    await move(1, 4, 2);
    assert.deepEqual(await titles(2), ['Resident', 'Changed first', 'Second']);
    await stop();
    await start();
    assert.deepEqual(await titles(2), ['Resident', 'Changed first', 'Second']);
    await move(2, 1, 1);
    await move(2, 2, 1);
    assert.deepEqual(await titles(1), ['Changed first', 'Second', 'Third', 'New']);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
