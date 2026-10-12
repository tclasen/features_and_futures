import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { createApplication } from '../server.js';

test('per-project positions survive reverse returns, absent tasks, migration and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-return-'));
  const dbPath = join(directory, 'db.sqlite');
  // Task 011 order need not agree with global task IDs.
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, task_order INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('A'), ('B'), ('C');
    INSERT INTO tasks (project_id, title, task_order) VALUES
      (1, 'Second', 20), (1, 'First', 10), (1, 'Third', 30), (2, 'B original', 4);`);
  db.close();
  let server;
  let url;
  const start = async () => {
    server = createApplication(dbPath);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    url = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = () => new Promise(resolve => server.close(resolve));
  const html = async path => (await fetch(url + path)).text();
  const post = (path, values = {}) => fetch(url + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const move = async (source, task, destination, filters = {}) => {
    const response = await post(`/projects/${source}/tasks/${task}/move`, { destinationId: destination, ...filters });
    assert.equal(response.status, 303);
    return response;
  };
  const order = async (project, expected) => {
    const text = await html(`/projects/${project}`);
    assert.deepEqual([...text.matchAll(/aria-label="Complete ([^"]+)"/g)].map(match => match[1]), expected);
  };
  try {
    await start();
    await order(1, ['First', 'Second', 'Third']);
    await move(1, 2, 2);
    await move(1, 1, 2);
    await move(1, 3, 2);
    await order(2, ['B original', 'First', 'Second', 'Third']);
    await post('/projects/1/tasks', { title: 'New while away' });
    // A first-time arrival also comes after every reserved position.
    await move(2, 4, 1);
    await order(1, ['New while away', 'B original']);
    await post('/projects/2/tasks/1/rename', { title: 'Updated second' });
    await post('/projects/2/tasks/1/completion', { completed: '1' });
    await post('/projects/2/tasks/1/priority', { priority: 'High' });
    await post('/projects/2/tasks/1/due-date', { dueDate: '0001-01-01' });
    await post('/projects/1/rename', { name: 'Renamed A' });
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/archive');
    assert.equal((await post('/projects/2/tasks/1/move', { destinationId: '1' })).status, 400);
    await stop();
    await start();
    await post('/projects/1/restore');
    // Return in reverse order across a restart.
    await move(2, 3, 1);
    await move(2, 1, 1);
    await stop();
    await start();
    const filters = { filter: 'Open', priorityFilter: 'Normal', rangeFrom: '2020-01-01' };
    const response = await move(2, 2, 1, filters);
    assert.equal(response.headers.get('location'), `/projects/2?${new URLSearchParams(filters)}`);
    await order(1, ['First', 'Updated second', 'Third', 'New while away', 'B original']);
    const restored = await html('/projects/1');
    assert.match(restored, /aria-label="Complete Updated second" checked/);
    assert.match(restored, /id="task-priority-1"[^>]*>\s*<option>Low<\/option>\s*<option>Normal<\/option>\s*<option selected>High/);
    assert.match(restored, /id="task-due-date-1" name="dueDate" value="0001-01-01"/);
    assert.match(await html('/'), /1\/5 completed/);
    // Each destination remembers its own order, not the most recent source order.
    await move(1, 3, 3);
    await move(1, 1, 3);
    await move(1, 2, 3);
    await order(3, ['Third', 'Updated second', 'First']);
    await move(3, 3, 2);
    await move(3, 1, 2);
    await move(3, 2, 2);
    await move(1, 4, 2);
    await order(2, ['B original', 'First', 'Updated second', 'Third']);
    await post('/projects/2/tasks', { title: 'Newest' });
    await stop();
    await start();
    await order(2, ['B original', 'First', 'Updated second', 'Third', 'Newest']);
  } finally {
    if (server?.listening) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
