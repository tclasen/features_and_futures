import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openProjects } from '../projects.js';

test('deletion migration, read-only state, summaries and reserved return positions persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-deletion-'));
  const path = join(directory, 'workboard.sqlite');
  let projects;
  try {
    const database = new DatabaseSync(path);
    database.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0, default_task_priority TEXT NOT NULL DEFAULT 'Normal');
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal',
        due_date TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '');
      CREATE TABLE task_project_positions (task_id INTEGER NOT NULL REFERENCES tasks(id),
        project_id INTEGER NOT NULL REFERENCES projects(id), position INTEGER NOT NULL,
        PRIMARY KEY (task_id, project_id), UNIQUE (project_id, position));
      INSERT INTO projects (name) VALUES ('Source'), ('Destination');
      INSERT INTO tasks (project_id, title, completed, priority, due_date, notes) VALUES
        (1, 'Match first', 1, 'High', '2024-02-29', '  café\n<literal>  '),
        (1, 'Match second', 0, 'Low', '', '');
      INSERT INTO task_project_positions VALUES (1, 1, 3), (2, 1, 8), (1, 2, 5);
    `);
    const prior = database.prepare('SELECT * FROM tasks ORDER BY id').all();
    const positions = database.prepare('SELECT * FROM task_project_positions ORDER BY project_id, position').all();
    database.close();
    projects = openProjects(path);
    const migrated = new DatabaseSync(path);
    assert.deepEqual(migrated.prepare('SELECT * FROM tasks ORDER BY id').all().map((t) => ({ ...t })),
      prior.map((t) => ({ ...t, deleted: 0 })));
    assert.deepEqual(migrated.prepare('SELECT * FROM task_project_positions ORDER BY project_id, position').all(), positions);
    migrated.close();
    const saved = projects.listTasks(1);
    assert.equal(projects.setTaskDeleted(2, 1, true), false);
    assert.equal(projects.setTaskDeleted(1, 999, true), false);
    for (const id of [1, 2]) assert.equal(projects.setTaskDeleted(1, id, true), true);
    for (const filter of ['All', 'Open', 'Completed']) assert.deepEqual(projects.listTasks(1, filter), []);
    assert.deepEqual(projects.list().map((p) => [p.completed_count, p.total_count]), [[0, 0], [0, 0]]);
    assert.deepEqual(projects.listTasks(1, 'Deleted').map((t) => ({ ...t, deleted: 0 })), saved.map((t) => ({ ...t })));
    assert.deepEqual(projects.listTasks(1, 'Deleted', 'High', {
      dueFrom: '2024-02-29', dueThrough: '2024-02-29', search: 'MATCH  first',
    }).map((t) => t.id), [1]);
    assert.deepEqual(projects.listTasks(1, 'Deleted', 'High', { search: 'literal' }), []);
    assert.deepEqual(projects.listTasks(2, 'Deleted'), []);
    for (const change of [
      () => projects.setTaskCompleted(1, 1, false),
      () => projects.renameTask(1, 1, 'Changed'),
      () => projects.setTaskPriority(1, 1, 'Normal'),
      () => projects.setTaskDueDate(1, 1, ''),
      () => projects.setTaskNotes(1, 1, ''),
      () => projects.moveTask(1, 1, 2),
    ]) assert.equal(change(), false);
    projects.setDefaultTaskPriority(1, 'Normal');
    projects.createTask(1, 'Later');
    projects.setArchived(1, true);
    assert.equal(projects.setTaskDeleted(1, 1, false), false);
    assert.equal(projects.setTaskDeleted(1, 3, true), false);
    projects.close();
    projects = openProjects(path);
    assert.deepEqual(projects.listTasks(1, 'Deleted').map((t) => t.id), [1, 2]);
    projects.setArchived(1, false);
    // Reverse restoration still recovers order, ahead of the new task.
    for (const id of [2, 1]) assert.equal(projects.setTaskDeleted(1, id, false), true);
    assert.deepEqual(projects.listTasks(1).slice(0, 2), saved);
    assert.deepEqual(projects.listTasks(1).map((t) => t.id), [1, 2, 3]);
    assert.deepEqual(projects.listTasks(1, 'Deleted'), []);
    assert.deepEqual(projects.list().map((p) => [p.completed_count, p.total_count]), [[1, 3], [0, 0]]);
    assert.equal(projects.moveTask(1, 1, 2), true);
    assert.equal(projects.setTaskDeleted(2, 1, true), true);
    projects.createTask(2, 'Destination later');
    assert.equal(projects.setTaskDeleted(2, 1, false), true);
    assert.deepEqual(projects.listTasks(2).map((t) => t.id), [1, 4]);
    assert.equal(projects.moveTask(2, 1, 1), true);
    projects.close();
    projects = openProjects(path);
    assert.deepEqual(projects.listTasks(1).map((t) => t.id), [1, 2, 3]);
    assert.deepEqual(projects.listTasks(1)[0], saved[0]);
  } finally {
    if (projects) projects.close();
    await rm(directory, { recursive: true, force: true });
  }
});
