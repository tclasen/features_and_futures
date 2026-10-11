import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openProjects } from '../projects.js';
import { createTaskStore } from '../tasks.js';

test('adding tasks preserves an existing Task 001 project database', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-migration-'));
  const path = join(directory, 'existing.sqlite');
  let store;
  try {
    const previousDatabase = new DatabaseSync(path);
    try {
      previousDatabase.exec(`
        CREATE TABLE projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL CHECK (length(trim(name)) > 0)
        );
        INSERT INTO projects (id, name) VALUES (42, 'Existing project');
      `);
    } finally {
      previousDatabase.close();
    }
    store = openProjects(path);
    assert.deepEqual(store.list(), [{ id: 42, name: 'Existing project', archived: false, total_count: 0, completed_count: 0 }]);
    assert.deepEqual(store.tasks.list(42), []);
    const task = store.tasks.create(42, '  Existing project task  ');
    assert.equal(task.title, 'Existing project task');
    assert.equal(task.completed, false);
    assert.throws(() => store.tasks.create(999, 'Orphan'), /FOREIGN KEY/);
    assert.throws(() => store.tasks.create(42, ' \t\n '), /Task title is required/);
    assert.deepEqual(store.tasks.list(42), [task]);
    store.tasks.setCompleted(42, task.id, true);
    assert.equal(store.get(42).completed_count, 1);
    assert.equal(store.get(42).total_count, 1);
    store.setArchived(42, true);
    store.close();
    store = openProjects(path);
    assert.equal(store.get(42).archived, true);
    assert.deepEqual(store.tasks.list(42), [{ ...task, completed: true }]);
    store.setArchived(42, false);
    assert.equal(store.get(42).completed_count, 1);
    assert.ok(store.create('Next project').id > 42);
  } finally {
    store?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive migration preserves existing Task 002 tasks and completion counts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-migration-'));
  const path = join(directory, 'existing.sqlite');
  let store;
  try {
    const previousDatabase = new DatabaseSync(path);
    try {
      previousDatabase.exec(`
        CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
        INSERT INTO projects (id, name) VALUES (7, 'Existing tasks');
      `);
      const tasks = createTaskStore(previousDatabase);
      const completed = tasks.create(7, 'Completed task');
      tasks.setCompleted(7, completed.id, true);
      tasks.create(7, 'Open task');
    } finally {
      previousDatabase.close();
    }
    store = openProjects(path);
    assert.deepEqual(store.get(7), {
      id: 7, name: 'Existing tasks', archived: false, total_count: 2, completed_count: 1,
    });
    assert.deepEqual(store.tasks.list(7).map((task) => task.completed), [true, false]);
    store.setArchived(7, true);
    store.close();
    store = openProjects(path);
    assert.equal(store.get(7).archived, true);
    assert.equal(store.get(7).completed_count, 1);
    assert.deepEqual(store.tasks.list(7).map((task) => task.title), ['Completed task', 'Open task']);
  } finally {
    store?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('priority migration defaults legacy tasks to Normal and preserves saved data on reopening', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-migration-'));
  const path = join(directory, 'existing.sqlite');
  let store;
  try {
    const previousDatabase = new DatabaseSync(path);
    try {
      previousDatabase.exec(`
        CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL REFERENCES projects(id),
          title TEXT NOT NULL,
          completed INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO projects (id, name, archived) VALUES (7, 'Legacy project', 1), (8, 'Other project', 0);
        INSERT INTO tasks (id, project_id, title, completed) VALUES
          (21, 7, 'Renamed completed task', 1), (22, 7, 'Open task', 0), (23, 8, 'Other task', 0);
      `);
    } finally {
      previousDatabase.close();
    }
    store = openProjects(path);
    const expectedTasks = [
      { id: 21, title: 'Renamed completed task', completed: true, priority: 'Normal' },
      { id: 22, title: 'Open task', completed: false, priority: 'Normal' },
    ];
    const expectedProject = { id: 7, name: 'Legacy project', archived: true, total_count: 2, completed_count: 1 };
    assert.deepEqual(store.tasks.list(7), expectedTasks);
    assert.deepEqual(store.get(7), expectedProject);
    store.setArchived(7, false);
    store.tasks.setPriority(7, 21, 'High');
    expectedTasks[0].priority = 'High';
    store.close();
    store = openProjects(path);
    assert.deepEqual(store.tasks.list(7), expectedTasks);
    assert.deepEqual(store.get(7), { ...expectedProject, archived: false });
    assert.equal(store.tasks.list(8)[0].priority, 'Normal');
    assert.equal(store.tasks.create(7, 'New task').priority, 'Normal');
  } finally {
    store?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
