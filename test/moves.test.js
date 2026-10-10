import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openProjectStore } from '../projects.js';

test('moves append on first arrival, restore prior positions, preserve data, and persist order', () => {
  const directory = mkdtempSync(join(tmpdir(), 'workboard-moves-'));
  const path = join(directory, 'db.sqlite');
  let store;
  try {
    // A previous schema must keep its original ID-based creation order.
    const db = new DatabaseSync(path);
    db.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (name) VALUES ('Source'), ('Destination'), ('Other');
      INSERT INTO tasks (project_id, title) VALUES (1, 'Oldest'), (1, 'Remaining'), (2, 'Existing');
    `);
    db.close();
    store = openProjectStore(path);
    assert.deepEqual(store.listTasks(1).map((task) => task.id), [1, 2]);
    store.setTaskCompleted(1, 1, true);
    store.setTaskPriority(1, 1, 'High');
    store.setTaskDueDate(1, 1, '2028-02-29');
    store.setDefaultTaskPriority(2, 'Low');
    const original = store.listTasks(1)[0];
    for (const destination of [1, 999, 0, NaN, 2.5]) {
      assert.equal(store.moveTask(1, 1, destination), false);
    }
    assert.equal(store.moveTask(3, 1, 2), false);
    store.setArchived(2, true);
    assert.equal(store.moveTask(1, 1, 2), false);
    store.setArchived(2, false);
    store.setArchived(1, true);
    assert.equal(store.moveTask(1, 1, 2), false);
    store.setArchived(1, false);
    assert.equal(store.moveTask(1, 1, 2), true);
    assert.deepEqual(store.listTasks(1).map((task) => task.id), [2]);
    assert.deepEqual(store.listTasks(2).map((task) => task.id), [3, 1]);
    assert.deepEqual(store.listTasks(2)[1], original);
    assert.deepEqual(store.list().map(({ total, completed }) => [total, completed]), [[1, 0], [2, 1], [0, 0]]);
    const newTask = store.createTask(2, 'After move');
    assert.deepEqual(store.listTasks(2).map((task) => task.id), [3, 1, newTask]);
    assert.equal(store.listTasks(2)[2].priority, 'Low');
    assert.equal(store.moveTask(2, 3, 1), true); // Blank due date stays blank.
    assert.equal(store.listTasks(1)[1].due_date, '');
    assert.equal(store.moveTask(2, 1, 1), true);
    assert.deepEqual(store.listTasks(1).map((task) => task.id), [1, 2, 3]);
    store.close();
    store = openProjectStore(path);
    assert.deepEqual(store.listTasks(1).map((task) => task.id), [1, 2, 3]);
    assert.deepEqual(store.listTasks(1)[0], original);
    assert.equal(store.moveTask(1, 1, 3), true);
    assert.deepEqual(store.listTasks(3), [original]);
  } finally {
    store?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
