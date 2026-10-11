import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openProjects } from '../projects.js';

test('directory includes migrated and imported tasks in current owner and reserved position order without writes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-directory-'));
  const path = join(directory, 'workboard.sqlite');
  let store;
  try {
    const legacy = new DatabaseSync(path);
    legacy.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (name) VALUES ('First'), ('Second');
      INSERT INTO tasks (project_id, title, completed) VALUES
        (1, 'First task', 1), (1, 'Second task', 0), (2, 'Destination task', 0);
    `);
    legacy.close();
    store = openProjects(path);
    const titles = (scope = 'Active', filters = {}) => store.listDirectoryTasks(scope, filters).map((task) => task.title);
    assert.deepEqual(titles(), ['First task', 'Second task', 'Destination task']);
    const upgraded = store.listDirectoryTasks()[0];
    assert.equal(upgraded.project_name, 'First');
    assert.equal(upgraded.completed, 1);
    assert.equal(upgraded.priority, 'Normal');
    assert.equal(upgraded.due_date, '');
    assert.equal(upgraded.notes, '');
    assert.equal(upgraded.deleted, 0);
    store.moveTask(1, 1, 2);
    store.moveTask(1, 2, 2);
    assert.deepEqual(titles(), ['Destination task', 'First task', 'Second task']);
    store.moveTask(2, 2, 1);
    store.moveTask(2, 1, 1);
    store.setTaskDeleted(1, 1, true);
    store.createTask(1, 'Later task');
    store.setTaskDeleted(1, 2, true);
    assert.deepEqual(titles('Active', { completion: 'Deleted' }), ['First task', 'Second task']);
    store.setTaskDeleted(1, 2, false);
    store.setTaskDeleted(1, 1, false);
    assert.deepEqual(titles(), ['First task', 'Second task', 'Later task', 'Destination task']);
    const imported = store.importProject(JSON.stringify({
      format: 'workboard-project', version: 1,
      project: { name: 'Portable', archived: false, defaultPriority: 'Low', tasks: [
        { title: '  Imported live  ', completed: true, priority: 'High', dueDate: '0001-01-01', notes: '\n exact <b> 😀  \n', deleted: false },
        { title: 'Imported deleted', completed: false, priority: 'Low', dueDate: '', notes: '', deleted: true },
      ] },
    }), 'Copy');
    assert.equal(imported.id, 3);
    store.rename(3, 'Renamed copy');
    const live = store.listDirectoryTasks('Active', { priority: 'High', dueThrough: '0001-01-01' });
    assert.equal(live.length, 1);
    assert.equal(live[0].title, '  Imported live  ');
    assert.equal(live[0].project_name, 'Renamed copy');
    assert.equal(live[0].notes, '\n exact <b> 😀  \n');
    assert.deepEqual(titles('Active', { completion: 'Deleted' }), ['Imported deleted']);
    store.setArchived(3, true);
    assert.deepEqual(titles('Archived'), ['  Imported live  ']);
    assert.deepEqual(titles('Archived', { completion: 'Deleted' }), ['Imported deleted']);
    const before = [1, 2, 3].map((id) => store.exportProject(id));
    const expectedActive = store.listDirectoryTasks();
    const expectedDeleted = store.listDirectoryTasks('Archived', { completion: 'Deleted' });
    store.close();
    store = openProjects(path);
    assert.deepEqual(store.listDirectoryTasks(), expectedActive);
    assert.deepEqual(store.listDirectoryTasks('Archived', { completion: 'Deleted' }), expectedDeleted);
    assert.deepEqual([1, 2, 3].map((id) => store.exportProject(id)), before);
  } finally {
    store?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
