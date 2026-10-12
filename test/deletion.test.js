import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApplication } from '../server.js';

test('soft deletion preserves fields and positions, intersects filters, and persists safely', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-deletion-'));
  const dbPath = join(directory, 'database.sqlite');
  let server;
  let url;
  const start = async () => {
    server = createApplication(dbPath);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    url = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  const post = (path, values = {}) => fetch(`${url}${path}`, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const html = async path => (await fetch(`${url}${path}`)).text();
  const snapshot = () => {
    const db = new DatabaseSync(dbPath);
    try {
      return {
        tasks: db.prepare('SELECT * FROM tasks ORDER BY id').all().map(row => ({ ...row })),
        positions: db.prepare('SELECT * FROM task_positions ORDER BY project_id, position').all().map(row => ({ ...row })),
      };
    } finally { db.close(); }
  };
  const ids = text => [...text.matchAll(/id="task-(\d+)"/g)].map(match => Number(match[1]));
  const filters = { filter: 'Completed', priorityFilter: 'High', rangeFrom: '2025-01-01', rangeThrough: '2025-12-31', search: 'FIRST TASK' };
  const deletedFilters = { ...filters, filter: 'Deleted' };
  const filteredPath = `/projects/1?${new URLSearchParams(filters)}`;
  const deletedPath = `/projects/1?${new URLSearchParams(deletedFilters)}`;
  try {
    // Upgrade a pre-deletion database; every old field and position must survive.
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal');
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal',
        due_date TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', task_order INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE task_positions (task_id INTEGER NOT NULL, project_id INTEGER NOT NULL,
        position INTEGER NOT NULL, PRIMARY KEY (task_id, project_id));
      INSERT INTO projects (name) VALUES ('Source'), ('Destination');
      INSERT INTO tasks (project_id, title, completed, priority, due_date, notes, task_order)
        VALUES (1, 'First\t  task', 1, 'High', '2025-06-15', '  notes 雪\n<literal>  ', 4),
        (1, 'Second', 0, 'Low', '', '', 8);
      INSERT INTO task_positions VALUES (1, 1, 4), (2, 1, 8);`);
    legacy.close();
    const original = snapshot();
    await start();
    const migrated = snapshot();
    assert.deepEqual(migrated, { ...original, tasks: original.tasks.map(task => ({ ...task, deleted: 0 })) });
    assert.deepEqual(ids(await html('/projects/1')), [1, 2]);
    assert.match(await html('/projects/1'), /<option>All<\/option>|<option selected>All<\/option>/);
    assert.match(await html('/projects/1'), /<option>Open<\/option>\s*<option>Completed<\/option>\s*<option>Deleted<\/option>/);
    // Reserve positions in another project before deleting in the original project.
    await post('/projects/1/tasks/1/move', { destinationId: 2 });
    await post('/projects/2/tasks/1/move', { destinationId: 1 });
    const before = snapshot();
    const response = await post('/projects/1/tasks/1/delete', filters);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), filteredPath);
    assert.deepEqual(snapshot(), { ...before, tasks: before.tasks.map(task => ({ ...task, deleted: task.id === 1 ? 1 : 0 })) });
    for (const filter of ['All', 'Open', 'Completed']) {
      assert.ok(!ids(await html(`/projects/1?filter=${filter}`)).includes(1));
    }
    assert.deepEqual(ids(await html(filteredPath)), []);
    assert.match(await html('/'), /data-testid="project-summary">0\/1 completed/);
    const deleted = await html(deletedPath);
    assert.deepEqual(ids(deleted), [1]);
    assert.match(deleted, /<option selected>Deleted<\/option>/);
    assert.match(deleted, /<option selected>High<\/option>/);
    assert.match(deleted, /id="due-from" name="dueFrom" value="2025-01-01"/);
    assert.match(deleted, /id="task-search" name="search" value="FIRST TASK"/);
    assert.match(deleted, />Restore task<\/button>/);
    assert.doesNotMatch(deleted, />Delete task<\/button>/);
    for (const control of deleted.matchAll(/<(?:input|select|textarea)\b[^>]*(?:id="task-(?:\d+|[a-z-]+-\d+)"|id="new-task-title-[^"]*"|id="destination-project-[^"]*")[^>]*>/g)) {
      assert.match(control[0], / disabled/);
    }
    for (const label of ['Save due date', 'Save notes', 'Rename task', 'Move task']) {
      assert.ok(deleted.includes(`<button type="submit" disabled>${label}</button>`));
    }
    assert.deepEqual(ids(await html('/projects/1?filter=Deleted&priorityFilter=Low')), []);
    assert.deepEqual(ids(await html('/projects/1?filter=Deleted&rangeFrom=2026-01-01')), []);
    assert.deepEqual(ids(await html('/projects/1?filter=Deleted&search=notes')), []);
    const deletedSnapshot = snapshot();
    for (const [action, values] of [
      ['completion', { completed: 0 }], ['rename', { title: 'Forbidden' }],
      ['priority', { priority: 'Low' }], ['due-date', { dueDate: '' }],
      ['notes', { notes: 'Forbidden' }], ['move', { destinationId: 2 }],
    ]) {
      assert.equal((await post(`/projects/1/tasks/1/${action}`, values)).status, 403);
      assert.deepEqual(snapshot(), deletedSnapshot);
    }
    assert.equal((await post('/projects/2/tasks/1/restore')).status, 404);
    assert.equal((await post('/projects/1/tasks/999/delete')).status, 404);
    await post('/projects/1/tasks/2/delete');
    assert.match(await html('/'), /data-testid="project-summary">0\/0 completed/);
    await stop();
    await start();
    assert.deepEqual(snapshot().tasks.map(task => task.deleted), [1, 1]);
    assert.equal(await html(deletedPath), deleted);
    await post('/projects/1/archive');
    const archived = await html(deletedPath);
    assert.match(archived, /disabled>Restore task<\/button>/);
    assert.match(archived, /id="task-filter" name="filter" data-auto-submit>/);
    assert.match(archived, /id="due-from" name="dueFrom" value="2025-01-01">/);
    assert.match(archived, /id="task-search" name="search" value="FIRST TASK">/);
    for (const action of ['delete', 'restore']) {
      assert.equal((await post(`/projects/1/tasks/1/${action}`)).status, 403);
    }
    assert.deepEqual(snapshot().tasks.map(task => task.deleted), [1, 1]);
    await post('/projects/1/restore');
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Later' });
    assert.equal(snapshot().tasks[2].deleted, 0);
    // Restore in reverse order, retaining the Deleted filter and all other filters.
    await post('/projects/1/tasks/2/restore', { filter: 'Deleted' });
    const restored = await post('/projects/1/tasks/1/restore', deletedFilters);
    assert.equal(restored.headers.get('location'), deletedPath);
    assert.deepEqual(ids(await html(deletedPath)), []);
    assert.deepEqual(ids(await html('/projects/1')), [1, 2, 3]);
    assert.deepEqual(snapshot().tasks[0], before.tasks[0]);
    assert.deepEqual(snapshot().positions.slice(0, 2), before.positions.slice(0, 2));
    assert.match(await html('/'), /data-testid="project-summary">1\/3 completed/);
    // Restored tasks can move, preserve current fields and return to their reserved slot.
    await post('/projects/1/tasks/1/move', { destinationId: 2 });
    assert.deepEqual(ids(await html('/projects/2')), [1]);
    await post('/projects/2/tasks/1/move', { destinationId: 1 });
    await stop();
    await start();
    assert.deepEqual(ids(await html('/projects/1')), [1, 2, 3]);
    assert.deepEqual(snapshot().tasks[0], before.tasks[0]);
    assert.deepEqual(ids(await html(filteredPath)), [1]);
    // Archived live rows cannot be deleted either.
    await post('/projects/1/archive');
    assert.match(await html('/projects/1'), /disabled>Delete task<\/button>/);
    assert.equal((await post('/projects/1/tasks/1/delete')).status, 403);
  } finally {
    if (server?.listening) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
