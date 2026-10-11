import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('migration preserves preexisting movement order and reserves absent positions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-return-order-'));
  const dbPath = join(directory, 'db.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (id, name) VALUES (1, 'A'), (2, 'B');
    INSERT INTO tasks (id, project_id, title, position) VALUES
      (1, 1, 'Previously moved', 9), (2, 1, 'First', 3), (3, 1, 'Middle', 7);`);
  db.close();
  let child;
  async function request(path, method = 'GET', body) {
    const response = await fetch(`http://127.0.0.1:18082${path}`, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.ok(response.ok);
    return response.json();
  }
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '18082', DB_PATH: dbPath }, stdio: 'ignore',
    });
    for (let i = 0; i < 100; i++) {
      try { await request('/health'); return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Server did not start');
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = null;
  }
  const order = async () => (await request('/api/projects/1/tasks')).map(task => task.id);
  const move = (source, id, destination) => request(`/api/projects/${source}/tasks/${id}`, 'PATCH', { destination_project_id: destination });
  try {
    await start();
    assert.deepEqual(await order(), [2, 3, 1]);
    // Empty A completely: new tasks must still follow all reserved positions.
    for (const id of [2, 3, 1]) await move(1, id, 2);
    const created = await request('/api/projects/1/tasks', 'POST', { title: 'New' });
    const arrival = await request('/api/projects/2/tasks', 'POST', { title: 'First arrival' });
    await move(2, arrival.id, 1);
    await stop();
    await start();
    for (const id of [1, 3, 2]) await move(2, id, 1);
    assert.deepEqual(await order(), [2, 3, 1, created.id, arrival.id]);
    await stop();
    await start();
    assert.deepEqual(await order(), [2, 3, 1, created.id, arrival.id]);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
