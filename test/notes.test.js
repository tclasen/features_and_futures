import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { openWorkboard } from '../database.js';

test('notes preserve exact text and task data, enforce ownership and archive state, and clear independently', () => {
  const store = openWorkboard(':memory:');
  try {
    const source = store.create('Source').id;
    const destination = store.create('Destination').id;
    const first = store.tasks.create(source, 'First');
    const second = store.tasks.create(source, 'Second');
    assert.equal(first.notes, '');
    store.tasks.setCompleted(source, first.id, true);
    store.tasks.setPriority(source, first.id, 'high');
    store.tasks.setDueDate(source, first.id, '0001-01-01');
    const before = { ...store.tasks.list(source)[0] };
    const summary = store.list();
    const notes = '\n  Unicode: café 日本語 😀\r\n<literal> & "quotes"\n \t ';
    assert.equal(store.tasks.setNotes(source, first.id, notes), true);
    assert.deepEqual({ ...store.tasks.list(source)[0] }, { ...before, notes });
    assert.equal(store.tasks.list(source)[1].notes, '');
    assert.deepEqual(store.list(), summary);
    assert.equal(store.tasks.setNotes(destination, first.id, 'Wrong owner'), false);
    assert.equal(store.tasks.setNotes(source, 999, 'Missing task'), false);
    for (const invalid of [null, undefined, 1, {}]) {
      assert.equal(store.tasks.setNotes(source, first.id, invalid), false);
    }
    assert.deepEqual(store.tasks.list(source, 'completed', 'high', { from: '0001-01-01', through: '0001-01-01' }, 'first').map((task) => task.id), [first.id]);
    assert.deepEqual(store.tasks.list(source, 'all', 'all', {}, 'unicode'), []);
    store.setArchived(source, true);
    assert.equal(store.tasks.setNotes(source, first.id, 'Blocked'), false);
    store.setArchived(source, false);
    store.tasks.rename(source, first.id, 'Renamed');
    store.tasks.move(source, first.id, destination);
    assert.deepEqual({ ...store.tasks.list(destination)[0] }, { ...before, title: 'Renamed', notes });
    assert.equal(store.tasks.setNotes(source, first.id, 'Old owner'), false);
    store.tasks.move(destination, first.id, source);
    assert.deepEqual(store.tasks.list(source).map((task) => task.id), [first.id, second.id]);
    assert.equal(store.tasks.setNotes(source, first.id, ' \t\n '), true);
    assert.equal(store.tasks.list(source)[0].notes, ' \t\n ');
    assert.equal(store.tasks.setNotes(source, first.id, ''), true);
    assert.equal(store.tasks.list(source)[0].notes, '');
  } finally {
    store.close();
  }
});

test('notes upgrade only adds empty notes and preserves saved fields and remembered positions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-notes-upgrade-'));
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
      CREATE TABLE task_project_positions (task_id INTEGER NOT NULL REFERENCES tasks(id),
        project_id INTEGER NOT NULL REFERENCES projects(id), position INTEGER NOT NULL,
        PRIMARY KEY (task_id, project_id));
      INSERT INTO projects VALUES (7, 'Original  Project', 1, 'low'), (8, 'Destination', 0, 'high');
      INSERT INTO tasks VALUES (12, 7, 'Original  Title', 1, 'high', '2024-02-29', 2),
        (13, 8, 'Away', 0, 'low', '', 1);
      INSERT INTO task_project_positions VALUES (12, 7, 2), (13, 7, 1), (13, 8, 1);
    `);
    const tasksBefore = database.prepare('SELECT * FROM tasks ORDER BY id').all();
    const projectsBefore = database.prepare('SELECT * FROM projects ORDER BY id').all();
    const positionsBefore = database.prepare('SELECT * FROM task_project_positions ORDER BY task_id, project_id').all();
    database.close();
    store = openWorkboard(path);
    assert.equal(store.tasks.list(7)[0].notes, '');
    assert.equal(store.tasks.list(8)[0].notes, '');
    const inspect = new DatabaseSync(path);
    try {
      assert.deepEqual(inspect.prepare('SELECT id, project_id, title, completed, priority, due_date, sort_position FROM tasks ORDER BY id').all(), tasksBefore);
      assert.deepEqual(inspect.prepare('SELECT * FROM projects ORDER BY id').all(), projectsBefore);
      assert.deepEqual(inspect.prepare('SELECT * FROM task_project_positions ORDER BY task_id, project_id').all(), positionsBefore);
    } finally {
      inspect.close();
    }
    store.setArchived(7, false);
    store.tasks.setNotes(7, 12, '\n Saved notes 日本語 \n');
    store.close();
    store = openWorkboard(path);
    assert.equal(store.tasks.list(7)[0].notes, '\n Saved notes 日本語 \n');
    assert.equal(store.tasks.move(8, 13, 7), true);
    assert.deepEqual(store.tasks.list(7).map((task) => task.id), [13, 12]);
    assert.equal(store.tasks.create(7, 'New').notes, '');
  } finally {
    store?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
