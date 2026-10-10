import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { openWorkboard } from '../database.js';

test('return positions survive reverse returns, new arrivals, edits, archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-return-order-'));
  const path = join(directory, 'workboard.sqlite');
  let store;
  try {
    store = openWorkboard(path);
    const first = store.create('First').id;
    const second = store.create('Second').id;
    const third = store.create('Third').id;
    const a = store.tasks.create(first, 'A').id;
    const b = store.tasks.create(first, 'B').id;
    const c = store.tasks.create(first, 'C').id;
    const d = store.tasks.create(second, 'D').id;
    const ids = (project) => store.tasks.list(project).map((task) => task.id);
    assert.equal(store.tasks.move(first, a, second), true);
    assert.equal(store.tasks.move(first, c, second), true);
    assert.deepEqual(ids(second), [d, a, c]);
    const e = store.tasks.create(first, 'Created while A and C are away').id;
    assert.equal(store.tasks.move(second, d, first), true);
    assert.deepEqual(ids(first), [b, e, d]);
    store.tasks.rename(second, a, 'Current A');
    store.tasks.setCompleted(second, a, true);
    store.tasks.setPriority(second, a, 'high');
    store.tasks.setDueDate(second, a, '2024-02-29');
    store.rename(first, 'Renamed first');
    store.setArchived(first, true);
    assert.equal(store.tasks.move(second, c, first), false);
    store.close();
    store = openWorkboard(path);
    assert.equal(store.tasks.move(second, a, first), false);
    store.setArchived(first, false);
    assert.equal(store.tasks.move(second, c, first), true);
    assert.deepEqual(ids(first), [b, c, e, d]);
    assert.equal(store.tasks.move(second, a, first), true);
    assert.deepEqual(ids(first), [a, b, c, e, d]);
    assert.deepEqual({ ...store.tasks.list(first)[0] }, {
      id: a, title: 'Current A', completed: 1, priority: 'high', due_date: '2024-02-29',
    });
    assert.deepEqual(store.list().map((project) => [project.completed_count, project.total_count]),
      [[1, 5], [0, 0], [0, 0]]);
    // Even an empty project reserves all departed tasks' positions.
    const f = store.tasks.create(second, 'Created in empty second').id;
    assert.equal(store.tasks.move(first, c, second), true);
    assert.equal(store.tasks.move(first, a, second), true);
    assert.equal(store.tasks.move(first, d, second), true);
    assert.deepEqual(ids(second), [d, a, c, f]);
    // A third project gets an independent order based on its first arrivals.
    assert.equal(store.tasks.move(second, c, third), true);
    assert.equal(store.tasks.move(second, a, third), true);
    assert.deepEqual(ids(third), [c, a]);
    assert.equal(store.tasks.move(third, a, first), true);
    assert.equal(store.tasks.move(third, c, first), true);
    assert.deepEqual(ids(first), [a, b, c, e]);
    store.close();
    store = openWorkboard(path);
    assert.equal(store.tasks.move(first, a, third), true);
    assert.equal(store.tasks.move(first, c, third), true);
    assert.deepEqual(ids(third), [c, a]);
    assert.deepEqual(ids(second), [d, f]);
  } finally {
    store?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('Task 011 migration preserves current non-ID order and remembers it across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-position-migration-'));
  const path = join(directory, 'workboard.sqlite');
  let store;
  try {
    const database = new DatabaseSync(path);
    database.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0, default_task_priority TEXT NOT NULL DEFAULT 'normal');
      CREATE TABLE tasks (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id),
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'normal',
        due_date TEXT NOT NULL DEFAULT '', sort_position INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (id, name) VALUES (1, 'First'), (2, 'Second');
      INSERT INTO tasks (id, project_id, title, sort_position) VALUES
        (1, 1, 'Previously moved', 9), (2, 1, 'First here', 4), (3, 1, 'Second here', 7);
    `);
    database.close();
    store = openWorkboard(path);
    const ids = () => store.tasks.list(1).map((task) => task.id);
    assert.deepEqual(ids(), [2, 3, 1]);
    assert.equal(store.tasks.move(1, 1, 2), true);
    assert.equal(store.tasks.move(1, 2, 2), true);
    const created = store.tasks.create(1, 'New').id;
    store.close();
    store = openWorkboard(path);
    assert.equal(store.tasks.move(2, 1, 1), true);
    assert.equal(store.tasks.move(2, 2, 1), true);
    assert.deepEqual(ids(), [2, 3, 1, created]);
    store.close();
    store = openWorkboard(path);
    assert.deepEqual(ids(), [2, 3, 1, created]);
  } finally {
    store?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
