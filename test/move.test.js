import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { createApplication } from '../server.js';

test('moving appends, preserves task data and filters, validates ownership and survives restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-move-'));
  const dbPath = join(directory, 'db.sqlite');
  // Exercise upgrading the original ordering schema as well as new writes.
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Source'), ('Destination'), ('Archived');
    INSERT INTO tasks (project_id, title) VALUES (1, 'First'), (1, 'Remaining'), (2, 'Existing');`);
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
  const titles = text => [...text.matchAll(/aria-label="Complete ([^"]+)"/g)].map(match => match[1]);
  const move = (source, task, destination, filters = {}) => post(`/projects/${source}/tasks/${task}/move`, { destinationId: destination, ...filters });
  const filters = { filter: 'Completed', priorityFilter: 'High', rangeFrom: '2025-01-01', rangeThrough: '2025-12-31' };
  try {
    await start();
    await post('/projects/3/archive');
    await post('/projects/2/rename', { name: 'New destination' });
    await post('/projects/2/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks/1/completion', { completed: '1' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2025-06-15' });
    const before = await html('/projects/1');
    assert.match(before, /<select id="destination-project-1" name="destinationId">\s*<option value="2">New destination<\/option>\s*<\/select>/);
    for (const destination of ['1', '3', '999', '', 'invalid']) {
      assert.equal((await move(1, 1, destination)).status, 400);
    }
    assert.equal((await move(2, 1, 1)).status, 404);
    const moved = await move(1, 1, 2, filters);
    assert.equal(moved.status, 303);
    assert.equal(moved.headers.get('location'), `/projects/1?${new URLSearchParams(filters)}`);
    const source = await html(moved.headers.get('location'));
    assert.deepEqual(titles(source), []);
    assert.match(source, /<option selected>Completed<\/option>/);
    assert.match(source, /<option selected>High<\/option>/);
    assert.match(source, /name="dueFrom" value="2025-01-01"/);
    assert.deepEqual(titles(await html('/projects/1')), ['Remaining']);
    let destination = await html('/projects/2');
    assert.deepEqual(titles(destination), ['Existing', 'First']);
    assert.match(destination, /aria-label="Complete First" checked/);
    assert.match(destination, /id="task-priority-1"[^>]*>\s*<option>Low<\/option>\s*<option>Normal<\/option>\s*<option selected>High/);
    assert.match(destination, /id="task-due-date-1" name="dueDate" value="2025-06-15"/);
    const summaries = await html('/');
    assert.match(summaries, /0\/1 completed/);
    assert.match(summaries, /1\/2 completed/);
    await stop();
    await start();
    assert.equal(await html('/projects/2'), destination);
    await post('/projects/2/tasks', { title: 'Later' });
    assert.deepEqual(titles(await html('/projects/2')), ['Existing', 'First', 'Later']);
    assert.equal((await move(2, 1, 1)).status, 303);
    assert.deepEqual(titles(await html('/projects/1')), ['First', 'Remaining']);
    // Blank dates and subsequent creations also retain their proper order.
    assert.equal((await move(2, 3, 1)).status, 303);
    await post('/projects/1/tasks', { title: 'Last' });
    assert.deepEqual(titles(await html('/projects/1')), ['First', 'Remaining', 'Existing', 'Last']);
    assert.match(await html('/projects/1'), /id="task-due-date-3" name="dueDate" value=""/);
    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    assert.match(archived, /id="destination-project-1" name="destinationId" disabled/);
    assert.match(archived, /<button type="submit" disabled>Move task/);
    assert.equal((await move(1, 1, 2)).status, 403);
    assert.equal((await move(2, 4, 1)).status, 400);
    await post('/projects/1/restore');
    assert.match(await html('/projects/1'), /id="destination-project-1" name="destinationId">/);
    await post('/projects/2/archive');
    const noDestinations = await html('/projects/1');
    assert.match(noDestinations, /id="destination-project-1" name="destinationId" disabled>\s*<\/select>/);
    assert.match(noDestinations, /<button type="submit" disabled>Move task/);
    await post('/projects/3/restore');
    assert.equal((await move(1, 1, 3)).status, 303);
    destination = await html('/projects/3');
    await stop();
    await start();
    assert.equal(await html('/projects/3'), destination);
  } finally {
    if (server?.listening) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
