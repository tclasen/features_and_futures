import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function launch(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const port = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(match[1]);
    });
    child.once('error', reject);
    child.once('exit', () => reject(new Error('Server exited')));
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; },
  };
}

test('remembered positions survive reverse returns, absent tasks, edits, archival and restart', async () => {
  const directory = await mkdtemp(path.resolve('data/return-order-test-'));
  const dbPath = path.join(directory, 'db.sqlite');
  // A Task011 database with order different from task IDs must retain that order.
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL);
    INSERT INTO projects (name) VALUES ('A'), ('B'), ('C');
    INSERT INTO tasks (project_id, title, position) VALUES
      (1, 'First', 10), (1, 'Third', 30), (1, 'Second', 20), (2, 'Resident', 1);`);
  db.close();
  let server;
  try {
    server = await launch(dbPath);
    const post = (route, values = {}) => fetch(server.url + route, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async (route) => (await fetch(server.url + route)).text();
    const rows = async (id) => [...(await html(`/projects/${id}`)).matchAll(/aria-label="Complete ([^"]+)"/g)].map((m) => m[1]);
    const move = async (source, task, destination) => {
      assert.equal((await post(`/projects/${source}/tasks/${task}/move`, { destination })).status, 303);
    };
    assert.deepEqual(await rows(1), ['First', 'Second', 'Third']);
    await move(1, 1, 2);
    await move(1, 3, 2);
    await move(1, 2, 2);
    assert.deepEqual(await rows(2), ['Resident', 'First', 'Second', 'Third']);
    // All source positions are reserved even when the source is empty.
    await post('/projects/1/tasks', { title: 'New' });
    await move(2, 4, 1);
    await post('/projects/2/tasks/1/rename', { title: 'Updated' });
    await post('/projects/2/tasks/1', { completed: '1' });
    await post('/projects/2/tasks/1/priority', { priority: 'High' });
    await post('/projects/2/tasks/1/due-date', { dueDate: '0001-01-01' });
    await post('/projects/1/rename', { name: 'Renamed A' });
    await post('/projects/1/archive');
    assert.equal((await post('/projects/2/tasks/1/move', { destination: 1 })).status, 403);
    await server.stop();
    server = await launch(dbPath);
    await post('/projects/1/restore');
    // Return in reverse order, with intervening new tasks and first arrivals.
    await move(2, 2, 1);
    await move(2, 3, 1);
    await move(2, 1, 1);
    assert.deepEqual(await rows(1), ['Updated', 'Second', 'Third', 'New', 'Resident']);
    const markup = await html('/projects/1');
    assert.match(markup, /aria-label="Complete Updated" checked/);
    assert.match(markup, /<option selected>High<\/option>/);
    assert.match(markup, /name="dueDate" type="text" value="0001-01-01"/);
    assert.match(await html('/'), /1\/5 completed/);
    // B remembers both its original resident and first-arrival positions.
    await move(1, 2, 3);
    await move(1, 1, 2);
    await move(1, 4, 2);
    await move(3, 2, 2);
    assert.deepEqual(await rows(2), ['Resident', 'Updated', 'Third']);
    await move(1, 3, 2);
    assert.deepEqual(await rows(2), ['Resident', 'Updated', 'Second', 'Third']);
    await server.stop();
    server = await launch(dbPath);
    assert.deepEqual(await rows(2), ['Resident', 'Updated', 'Second', 'Third']);
    await move(2, 3, 1);
    await move(2, 1, 1);
    await move(2, 2, 1);
    assert.deepEqual(await rows(1), ['Updated', 'Second', 'Third', 'New']);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
