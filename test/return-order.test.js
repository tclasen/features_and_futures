import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openProjectStore } from '../projects.js';

test('multiple returning tasks recover independent project positions across restarts', () => {
  const directory = mkdtempSync(join(tmpdir(), 'workboard-return-order-'));
  const path = join(directory, 'db.sqlite');
  let store = openProjectStore(path);
  try {
    const source = store.create('Source');
    const destination = store.create('Destination');
    const a = store.createTask(source, 'A');
    const b = store.createTask(source, 'B');
    const c = store.createTask(source, 'C');
    const existing = store.createTask(destination, 'Existing');
    const ids = (project) => store.listTasks(project).map((task) => task.id);
    assert.equal(store.moveTask(source, b, destination), true);
    assert.equal(store.moveTask(source, a, destination), true);
    assert.deepEqual(ids(destination), [existing, b, a]);
    const newSource = store.createTask(source, 'New source');
    assert.equal(store.moveTask(source, c, destination), true);
    // All original positions are absent, but must not be reused by creation.
    const laterSource = store.createTask(source, 'Later source');
    store.rename(source, 'Renamed source');
    store.setArchived(source, true);
    assert.equal(store.moveTask(destination, a, source), false);
    store.close();
    store = openProjectStore(path);
    store.setArchived(source, false);
    store.renameTask(destination, a, 'Current A');
    store.setTaskCompleted(destination, a, true);
    store.setTaskPriority(destination, a, 'High');
    store.setTaskDueDate(destination, a, '2028-02-29');
    const currentA = store.listTasks(destination).find((task) => task.id === a);
    for (const task of [c, a, b]) assert.equal(store.moveTask(destination, task, source), true);
    assert.deepEqual(ids(source), [a, b, c, newSource, laterSource]);
    assert.deepEqual(store.listTasks(source)[0], currentA);
    const newDestination = store.createTask(destination, 'New destination');
    for (const task of [c, a, b]) assert.equal(store.moveTask(source, task, destination), true);
    assert.deepEqual(ids(destination), [existing, b, a, c, newDestination]);
    store.close();
    store = openProjectStore(path);
    assert.deepEqual(ids(destination), [existing, b, a, c, newDestination]);
    assert.deepEqual(store.listTasks(destination)[2], currentA);
    assert.deepEqual(store.list().map(({ total, completed }) => [total, completed]), [[2, 0], [5, 1]]);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('migration remembers current project-local positions rather than task ID order', () => {
  const directory = mkdtempSync(join(tmpdir(), 'workboard-position-migration-'));
  const path = join(directory, 'db.sqlite');
  let store;
  try {
    const db = new DatabaseSync(path);
    db.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL
      );
      INSERT INTO projects (name) VALUES ('Source'), ('Destination');
      INSERT INTO tasks (project_id, title, position) VALUES (1, 'Moved before migration', 8), (1, 'Earlier position', 2);
    `);
    db.close();
    store = openProjectStore(path);
    assert.deepEqual(store.listTasks(1).map((task) => task.id), [2, 1]);
    for (const task of [2, 1]) assert.equal(store.moveTask(1, task, 2), true);
    const newTask = store.createTask(1, 'After remembered positions');
    for (const task of [1, 2]) assert.equal(store.moveTask(2, task, 1), true);
    assert.deepEqual(store.listTasks(1).map((task) => task.id), [2, 1, newTask]);
  } finally {
    store?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
