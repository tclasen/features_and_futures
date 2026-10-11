import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openProjects } from '../projects.js';
import { createTaskStore } from '../tasks.js';

test('notes migration preserves all existing fields and remembered project positions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-notes-migration-'));
  const path = join(directory, 'existing.sqlite');
  let store;
  try {
    const database = new DatabaseSync(path);
    try {
      database.exec(`
        CREATE TABLE projects (
          id INTEGER PRIMARY KEY, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0,
          default_task_priority TEXT NOT NULL DEFAULT 'Normal'
        );
        CREATE TABLE tasks (
          id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id),
          title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
          priority TEXT NOT NULL DEFAULT 'Normal', due_date TEXT NOT NULL DEFAULT '',
          position INTEGER NOT NULL
        );
        CREATE TABLE task_project_positions (
          task_id INTEGER NOT NULL REFERENCES tasks(id), project_id INTEGER NOT NULL REFERENCES projects(id),
          position INTEGER NOT NULL, PRIMARY KEY (task_id, project_id), UNIQUE (project_id, position)
        );
        INSERT INTO projects VALUES (1, 'Source  Project', 0, 'Low'), (2, 'Archived', 1, 'High');
        INSERT INTO tasks VALUES
          (20, 1, 'First  TITLE', 1, 'High', '0004-02-29', 2),
          (10, 1, 'Second', 0, 'Low', '', 5),
          (30, 2, 'Elsewhere', 1, 'Normal', '9999-12-31', 1);
        INSERT INTO task_project_positions VALUES (20, 1, 2), (10, 1, 5), (30, 1, 3), (30, 2, 1);
      `);
    } finally {
      database.close();
    }
    store = openProjects(path);
    const source = [
      { id: 20, title: 'First  TITLE', completed: true, priority: 'High', due_date: '0004-02-29', notes: '', deleted: false },
      { id: 10, title: 'Second', completed: false, priority: 'Low', due_date: '', notes: '', deleted: false },
    ];
    const elsewhere = { id: 30, title: 'Elsewhere', completed: true, priority: 'Normal', due_date: '9999-12-31', notes: '', deleted: false };
    assert.deepEqual(store.tasks.list(1), source);
    assert.deepEqual(store.tasks.list(2), [elsewhere]);
    assert.deepEqual(store.list(), [
      { id: 1, name: 'Source  Project', archived: false, default_task_priority: 'Low', total_count: 2, completed_count: 1 },
      { id: 2, name: 'Archived', archived: true, default_task_priority: 'High', total_count: 1, completed_count: 1 },
    ]);
    store.tasks.setNotes(1, 20, '  Saved\nnotes 🙂  ');
    source[0].notes = '  Saved\nnotes 🙂  ';
    store.close();
    store = openProjects(path);
    assert.deepEqual(store.tasks.list(1), source);
    store.setArchived(2, false);
    store.tasks.move(2, 30, 1);
    assert.deepEqual(store.tasks.list(1), [source[0], elsewhere, source[1]]);
    assert.equal(store.tasks.create(1, 'New').notes, '');
  } finally {
    store?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('move ordering migrates legacy ID order and survives repeated moves and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-move-migration-'));
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
          completed INTEGER NOT NULL DEFAULT 0,
          priority TEXT NOT NULL DEFAULT 'Normal',
          due_date TEXT NOT NULL DEFAULT ''
        );
        INSERT INTO projects (id, name) VALUES (1, 'Source'), (2, 'Destination');
        INSERT INTO tasks (id, project_id, title, completed, priority, due_date) VALUES
          (10, 1, 'First', 1, 'High', '0004-02-29'),
          (20, 2, 'Destination first', 0, 'Low', ''),
          (30, 1, 'Second', 0, 'Normal', '9999-12-31');
      `);
    } finally {
      previousDatabase.close();
    }
    store = openProjects(path);
    const originalSource = store.tasks.list(1);
    const originalDestination = store.tasks.list(2);
    assert.deepEqual(originalSource.map((task) => task.id), [10, 30]);
    store.tasks.move(1, 10, 2);
    assert.deepEqual(store.tasks.list(1), [originalSource[1]]);
    assert.deepEqual(store.tasks.list(2), [...originalDestination, originalSource[0]]);
    store.close();
    store = openProjects(path);
    assert.deepEqual(store.tasks.list(2), [...originalDestination, originalSource[0]]);
    // Returning restores the position seeded during migration.
    store.tasks.move(2, 10, 1);
    assert.deepEqual(store.tasks.list(1), originalSource);
    const newTask = store.tasks.create(1, 'After moved task');
    assert.deepEqual(store.tasks.list(1), [...originalSource, newTask]);
    store.close();
    store = openProjects(path);
    assert.deepEqual(store.tasks.list(1), [...originalSource, newTask]);
    assert.deepEqual(store.tasks.list(2), originalDestination);
    assert.equal(store.get(1).completed_count, 1);
    assert.equal(store.get(1).total_count, 3);
  } finally {
    store?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project default migration preserves Task 007 priorities, identities, and summaries', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-default-migration-'));
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
          completed INTEGER NOT NULL DEFAULT 0,
          priority TEXT NOT NULL DEFAULT 'Normal'
        );
        INSERT INTO projects (id, name, archived) VALUES (9, 'Active project', 0), (10, 'Archived project', 1);
        INSERT INTO tasks (id, project_id, title, completed, priority) VALUES
          (30, 9, 'High completed', 1, 'High'), (31, 9, 'Low open', 0, 'Low'),
          (32, 10, 'Archived task', 1, 'High');
      `);
    } finally {
      previousDatabase.close();
    }
    store = openProjects(path);
    const projects = [
      { id: 9, name: 'Active project', archived: false, default_task_priority: 'Normal', total_count: 2, completed_count: 1 },
      { id: 10, name: 'Archived project', archived: true, default_task_priority: 'Normal', total_count: 1, completed_count: 1 },
    ];
    const tasks = [
      { id: 30, title: 'High completed', completed: true, priority: 'High', due_date: '', notes: '', deleted: false },
      { id: 31, title: 'Low open', completed: false, priority: 'Low', due_date: '', notes: '', deleted: false },
    ];
    assert.deepEqual(store.list(), projects);
    assert.deepEqual(store.tasks.list(9), tasks);
    store.tasks.setDueDate(9, 30, ' 2000-02-29 ');
    tasks[0].due_date = '2000-02-29';
    store.setDefaultPriority(9, 'Low');
    projects[0].default_task_priority = 'Low';
    assert.throws(() => store.setDefaultPriority(10, 'High'), /Archived project/);
    store.close();
    store = openProjects(path);
    assert.deepEqual(store.list(), projects);
    assert.deepEqual(store.tasks.list(9), tasks);
    assert.deepEqual(store.tasks.list(10), [{ id: 32, title: 'Archived task', completed: true, priority: 'High', due_date: '', notes: '', deleted: false }]);
  } finally {
    store?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

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
    assert.deepEqual(store.list(), [{ id: 42, name: 'Existing project', archived: false, default_task_priority: 'Normal', total_count: 0, completed_count: 0 }]);
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
      id: 7, name: 'Existing tasks', archived: false, default_task_priority: 'Normal', total_count: 2, completed_count: 1,
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
      { id: 21, title: 'Renamed completed task', completed: true, priority: 'Normal', due_date: '', notes: '', deleted: false },
      { id: 22, title: 'Open task', completed: false, priority: 'Normal', due_date: '', notes: '', deleted: false },
    ];
    const expectedProject = { id: 7, name: 'Legacy project', archived: true, default_task_priority: 'Normal', total_count: 2, completed_count: 1 };
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
