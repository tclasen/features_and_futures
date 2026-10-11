import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openProjects } from '../projects.js';

test('portable export includes live and deleted tasks in remembered order without changing saved data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-export-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let projects;
  try {
    projects = openProjects(databasePath);
    projects.create('Board  café\tA');
    projects.create('Other');
    projects.createTask(1, 'First  TITLE');
    projects.createTask(1, 'Second');
    projects.createTask(2, 'Private');
    const notes = '  😀 <b>literal</b> & "text"\r\n\tline\rfinal\n  ';
    projects.setTaskCompleted(1, 1, true);
    projects.setTaskPriority(1, 1, 'High');
    projects.setTaskDueDate(1, 1, '0001-01-01');
    projects.setTaskNotes(1, 1, notes);
    projects.moveTask(1, 1, 2);
    projects.createTask(1, 'Later');
    projects.moveTask(2, 1, 1);
    projects.setTaskDeleted(1, 1, true);
    projects.setDefaultTaskPriority(1, 'Low');
    projects.setArchived(1, true);
    const live = projects.listTasks(1);
    const deleted = projects.listTasks(1, 'Deleted');
    const summary = projects.list('Archived');
    const expected = {
      format: 'workboard-project', version: 1,
      project: {
        name: 'Board  café\tA', archived: true, defaultPriority: 'Low',
        tasks: [
          { title: 'First  TITLE', completed: true, priority: 'High', dueDate: '0001-01-01',
            notes: notes.replace(/\r\n?/g, '\n'), deleted: true },
          { title: 'Second', completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false },
          { title: 'Later', completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false },
        ],
      },
    };
    assert.deepEqual(projects.exportProject(1), expected);
    assert.deepEqual(projects.listTasks(1), live);
    assert.deepEqual(projects.listTasks(1, 'Deleted'), deleted);
    assert.equal(projects.listTasks(1, 'Deleted')[0].notes, notes);
    assert.deepEqual(projects.list('Archived'), summary);
    assert.equal(projects.exportProject(999), null);
    projects.create('Empty');
    assert.deepEqual(projects.exportProject(3).project.tasks, []);
    projects.close();
    projects = openProjects(databasePath);
    assert.deepEqual(projects.exportProject(1), expected);
    projects.setArchived(1, false);
    projects.setTaskDeleted(1, 1, false);
    projects.moveTask(1, 1, 2);
    projects.moveTask(2, 1, 1);
    assert.deepEqual(projects.listTasks(1).map((task) => task.title), ['First  TITLE', 'Second', 'Later']);
    assert.equal(projects.listTasks(1)[0].notes, notes);
  } finally {
    if (projects) projects.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('export of upgraded legacy records uses public defaults and preserves existing data and order', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-export-upgrade-'));
  let projects;
  try {
    const path = join(directory, 'workboard.sqlite');
    const database = new DatabaseSync(path);
    database.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL,
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects VALUES (1, 'Old  Board');
      INSERT INTO tasks VALUES (2, 1, 'Earlier', 1), (5, 1, 'Later', 0);
    `);
    database.close();
    const expected = {
      format: 'workboard-project', version: 1,
      project: {
        name: 'Old  Board', archived: false, defaultPriority: 'Normal',
        tasks: [
          { title: 'Earlier', completed: true, priority: 'Normal', dueDate: '', notes: '', deleted: false },
          { title: 'Later', completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false },
        ],
      },
    };
    projects = openProjects(path);
    assert.deepEqual(projects.exportProject(1), expected);
    projects.close();
    projects = openProjects(path);
    assert.deepEqual(projects.exportProject(1), expected);
  } finally {
    if (projects) projects.close();
    await rm(directory, { recursive: true, force: true });
  }
});
