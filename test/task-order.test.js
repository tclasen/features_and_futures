import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openProjects } from '../projects.js';

test('legacy order becomes independent persistent positions, including tasks currently away', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-return-order-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let projects;
  try {
    // Task 011 positions can differ from ID order after prior moves.
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO projects (name) VALUES ('First'), ('Second'), ('Third');
      INSERT INTO tasks (project_id, title, position) VALUES
        (1, 'Late', 9), (1, 'Early', 4), (2, 'Resident', 3), (1, 'Middle', 7);
    `);
    database.close();
    projects = openProjects(databasePath);
    const ids = (projectId) => projects.listTasks(projectId).map((task) => task.id);
    const move = (source, task, destination) => assert.equal(projects.moveTask(source, task, destination), true);
    assert.deepEqual(ids(1), [2, 4, 1]);
    for (const task of [2, 4, 1]) move(1, task, 2);
    assert.deepEqual(ids(2), [3, 2, 4, 1]);
    assert.deepEqual(ids(1), []);
    projects.createTask(1, 'Created while all away');
    projects.createTask(2, 'Created after arrivals');
    assert.deepEqual(ids(1), [5]);
    assert.deepEqual(ids(2), [3, 2, 4, 1, 6]);

    // Travel through a third project and edit current values there.
    move(2, 2, 3);
    projects.renameTask(3, 2, 'Renamed early');
    projects.setTaskCompleted(3, 2, true);
    projects.setTaskPriority(3, 2, 'High');
    projects.setTaskDueDate(3, 2, '2024-02-29');
    const saved = projects.listTasks(3)[0];
    projects.setDefaultTaskPriority(1, 'Low');
    projects.rename(1, 'Renamed first');
    projects.setArchived(1, true);
    assert.equal(projects.moveTask(2, 1, 1), false);
    projects.close();
    projects = openProjects(databasePath);
    projects.setArchived(1, false);

    // Return in reverse order, including the task traveling through project 3.
    move(2, 1, 1);
    move(2, 4, 1);
    move(3, 2, 1);
    assert.deepEqual(ids(1), [2, 4, 1, 5]);
    assert.deepEqual(projects.listTasks(1)[0], saved);
    assert.deepEqual(ids(2), [3, 6]);
    assert.deepEqual(ids(3), []);
    assert.deepEqual(projects.listTasks(1, 'Completed', 'High', {
      dueFrom: '2024-02-29', dueThrough: '2024-02-29',
    }), [saved]);
    projects.createTask(1, 'Created after returns');
    assert.deepEqual(ids(1), [2, 4, 1, 5, 7]);

    // Project 2 retains its own positions, even with opposite arrival order.
    move(1, 1, 2);
    move(1, 4, 2);
    move(1, 2, 2);
    assert.deepEqual(ids(2), [3, 2, 4, 1, 6]);
    assert.deepEqual(projects.listTasks(2)[1], saved);
    assert.deepEqual(projects.list().map((project) => [project.completed_count, project.total_count]),
      [[0, 2], [1, 5], [0, 0]]);
    projects.close();
    projects = openProjects(databasePath);
    assert.deepEqual(ids(2), [3, 2, 4, 1, 6]);
    move(2, 4, 1);
    move(2, 2, 1);
    move(2, 1, 1);
    assert.deepEqual(ids(1), [2, 4, 1, 5, 7]);
    assert.deepEqual(projects.listTasks(1)[0], saved);
    assert.deepEqual(ids(2), [3, 6]);
  } finally {
    if (projects) projects.close();
    await rm(directory, { recursive: true, force: true });
  }
});
