import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openProjects } from '../projects.js';

test('notes migration preserves all prior task data and remembered positions; notes persist independently', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-notes-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let projects;
  try {
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0, default_task_priority TEXT NOT NULL DEFAULT 'Normal');
      CREATE TABLE tasks (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id),
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
        priority TEXT NOT NULL DEFAULT 'Normal', due_date TEXT NOT NULL DEFAULT '');
      CREATE TABLE task_project_positions (task_id INTEGER NOT NULL REFERENCES tasks(id),
        project_id INTEGER NOT NULL REFERENCES projects(id), position INTEGER NOT NULL,
        PRIMARY KEY (task_id, project_id), UNIQUE (project_id, position));
      INSERT INTO projects (id, name, default_task_priority) VALUES (1, 'Source', 'Low'), (2, 'Destination', 'High');
      INSERT INTO tasks VALUES (1, 1, 'Saved', 1, 'High', '2024-02-29'), (2, 1, 'Earlier', 0, 'Low', '');
      INSERT INTO task_project_positions VALUES (1, 1, 7), (2, 1, 3), (1, 2, 1);
    `);
    const priorTasks = database.prepare('SELECT * FROM tasks ORDER BY id').all();
    const priorPositions = database.prepare('SELECT * FROM task_project_positions ORDER BY project_id, position').all();
    database.close();
    projects = openProjects(databasePath);
    const migrated = new DatabaseSync(databasePath);
    assert.deepEqual(migrated.prepare('SELECT * FROM tasks ORDER BY id').all().map((task) => ({ ...task })),
      priorTasks.map((task) => ({ ...task, notes: '' })));
    assert.deepEqual(migrated.prepare('SELECT * FROM task_project_positions ORDER BY project_id, position').all(), priorPositions);
    migrated.close();
    const before = projects.listTasks(1);
    const summary = projects.list();
    const notes = '\n  Unicode café 😀\n\t</textarea><script>alert("literal")</script> & <b>text</b>  \n';
    assert.equal(projects.setTaskNotes(1, 1, notes), true);
    const saved = Object.assign(Object.create(null), before[1], { notes });
    assert.deepEqual(projects.listTasks(1), [before[0], saved]);
    assert.deepEqual(projects.list(), summary);
    assert.deepEqual(projects.listTasks(1, 'All', 'All', { search: 'literal' }), []);
    for (const [project, task] of [[2, 1], [1, 999]]) {
      assert.equal(projects.setTaskNotes(project, task, 'wrong owner'), false);
    }
    projects.createTask(1, 'New');
    assert.equal(projects.listTasks(1)[2].notes, '');
    projects.moveTask(1, 1, 2);
    assert.deepEqual(projects.listTasks(2), [saved]);
    projects.setArchived(2, true);
    assert.equal(projects.setTaskNotes(2, 1, ''), false);
    projects.close();
    projects = openProjects(databasePath);
    assert.deepEqual(projects.listTasks(2), [saved]);
    projects.setArchived(2, false);
    projects.renameTask(2, 1, 'Renamed');
    projects.moveTask(2, 1, 1);
    assert.deepEqual(projects.listTasks(1).map((task) => task.id), [2, 1, 3]);
    assert.deepEqual(projects.listTasks(1)[1], Object.assign(Object.create(null), saved, { title: 'Renamed' }));
    assert.equal(projects.setTaskNotes(1, 1, ' \t\n '), true);
    assert.equal(projects.listTasks(1)[1].notes, ' \t\n ');
    assert.equal(projects.setTaskNotes(1, 1, ''), true);
    projects.close();
    projects = openProjects(databasePath);
    assert.equal(projects.listTasks(1)[1].notes, '');
  } finally {
    if (projects) projects.close();
    await rm(directory, { recursive: true, force: true });
  }
});
