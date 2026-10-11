import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openProjects } from '../projects.js';
import { filterTasks } from '../public/task-filters.js';

test('deletion preserves fields and per-project positions across reverse restoration and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-deletion-'));
  const path = join(directory, 'projects.sqlite');
  let store;
  try {
    store = openProjects(path);
    const source = store.create('Source').id;
    const destination = store.create('Destination').id;
    const first = store.tasks.create(source, 'First');
    const second = store.tasks.create(source, 'Second');
    const resident = store.tasks.create(destination, 'Resident');
    store.tasks.setCompleted(source, first.id, true);
    store.tasks.setPriority(source, first.id, 'High');
    store.tasks.setDueDate(source, first.id, '0004-02-29');
    store.tasks.setNotes(source, first.id, '  Notes\n🙂 <script>literal</script>\t ');
    const currentFirst = store.tasks.list(source)[0];
    // Establish a different order at the destination, then return to the source.
    store.tasks.move(source, second.id, destination);
    store.tasks.move(source, first.id, destination);
    store.tasks.move(destination, first.id, source);
    store.tasks.move(destination, second.id, source);
    assert.deepEqual(store.tasks.list(source), [currentFirst, second]);
    store.tasks.setDeleted(source, first.id, true);
    store.tasks.setDeleted(source, second.id, true);
    const deletedFirst = { ...currentFirst, deleted: true };
    const deletedSecond = { ...second, deleted: true };
    assert.deepEqual(store.tasks.list(source), [deletedFirst, deletedSecond]);
    assert.equal(store.get(source).total_count, 0);
    assert.equal(store.get(source).completed_count, 0);
    assert.deepEqual(filterTasks(store.tasks.list(source), 'all', 'all'), []);
    assert.deepEqual(filterTasks(store.tasks.list(source), 'deleted', 'all'), [deletedFirst, deletedSecond]);
    for (const edit of [
      () => store.tasks.setCompleted(source, first.id, false),
      () => store.tasks.rename(source, first.id, 'Other title'),
      () => store.tasks.setPriority(source, first.id, 'Low'),
      () => store.tasks.setDueDate(source, first.id, ''),
      () => store.tasks.setNotes(source, first.id, 'Other notes'),
      () => store.tasks.move(source, first.id, destination),
    ]) {
      assert.throws(edit, { status: 409, message: 'Deleted task must be restored before editing' });
      assert.deepEqual(store.tasks.list(source), [deletedFirst, deletedSecond]);
    }
    store.setDefaultPriority(source, 'Low');
    const later = store.tasks.create(source, 'Later', 'Low');
    store.rename(source, 'Renamed source');
    store.setArchived(source, true);
    assert.throws(() => store.tasks.setDeleted(source, first.id, false), { status: 409 });
    assert.throws(() => store.tasks.setDeleted(source, later.id, true), { status: 409 });
    store.close();
    store = openProjects(path);
    assert.deepEqual(store.tasks.list(source), [deletedFirst, deletedSecond, later]);
    store.setArchived(source, false);
    // Reverse restoration cannot change order or apply the project's new default.
    store.tasks.setDeleted(source, second.id, false);
    store.tasks.setDeleted(source, first.id, false);
    assert.deepEqual(store.tasks.list(source), [currentFirst, second, later]);
    assert.equal(store.get(source).total_count, 3);
    assert.equal(store.get(source).completed_count, 1);
    assert.deepEqual(filterTasks(store.tasks.list(source), 'deleted', 'all'), []);
    store.close();
    store = openProjects(path);
    store.tasks.move(source, first.id, destination);
    store.tasks.move(source, second.id, destination);
    assert.deepEqual(store.tasks.list(destination), [resident, second, currentFirst]);
    store.tasks.move(destination, second.id, source);
    store.tasks.move(destination, first.id, source);
    assert.deepEqual(store.tasks.list(source), [currentFirst, second, later]);
  } finally {
    store?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('Task 015 upgrade initializes only deletion state and preserves notes and reserved positions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-deletion-migration-'));
  const path = join(directory, 'existing.sqlite');
  let store;
  try {
    const database = new DatabaseSync(path);
    const notes = '  Saved\nUnicode 日本語 🙂\n<b>literal</b>  ';
    try {
      database.exec(`
        CREATE TABLE projects (
          id INTEGER PRIMARY KEY, name TEXT NOT NULL, archived INTEGER NOT NULL,
          default_task_priority TEXT NOT NULL
        );
        CREATE TABLE tasks (
          id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id),
          title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal',
          due_date TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL
        );
        CREATE TABLE task_project_positions (
          task_id INTEGER NOT NULL REFERENCES tasks(id), project_id INTEGER NOT NULL REFERENCES projects(id),
          position INTEGER NOT NULL, PRIMARY KEY (task_id, project_id), UNIQUE (project_id, position)
        );
        INSERT INTO projects VALUES (1, 'Source', 0, 'Low'), (2, 'Archived', 1, 'High');
        INSERT INTO tasks VALUES
          (20, 1, 'First  TITLE', 1, 'High', '0004-02-29', '', 2),
          (10, 1, 'Second', 0, 'Low', '', '', 5),
          (30, 2, 'Elsewhere', 1, 'Normal', '9999-12-31', '', 1);
        INSERT INTO task_project_positions VALUES (20, 1, 2), (10, 1, 5), (30, 1, 3), (30, 2, 1);
      `);
      database.prepare('UPDATE tasks SET notes = ? WHERE id = 20').run(notes);
    } finally {
      database.close();
    }
    store = openProjects(path);
    const expected = [
      { id: 20, title: 'First  TITLE', completed: true, priority: 'High', due_date: '0004-02-29', notes, deleted: false },
      { id: 10, title: 'Second', completed: false, priority: 'Low', due_date: '', notes: '', deleted: false },
    ];
    const elsewhere = { id: 30, title: 'Elsewhere', completed: true, priority: 'Normal', due_date: '9999-12-31', notes: '', deleted: false };
    assert.deepEqual(store.tasks.list(1), expected);
    assert.deepEqual(store.tasks.list(2), [elsewhere]);
    assert.equal(store.get(1).completed_count, 1);
    assert.equal(store.get(1).total_count, 2);
    assert.equal(store.get(1).default_task_priority, 'Low');
    assert.equal(store.get(2).archived, true);
    store.tasks.setDeleted(1, 20, true);
    store.close();
    store = openProjects(path);
    assert.deepEqual(store.tasks.list(1), [{ ...expected[0], deleted: true }, expected[1]]);
    store.setArchived(2, false);
    store.tasks.move(2, 30, 1);
    const created = store.tasks.create(1, 'New');
    assert.equal(created.deleted, false);
    assert.equal(created.notes, '');
    store.tasks.setDeleted(1, 20, false);
    assert.deepEqual(store.tasks.list(1), [expected[0], elsewhere, expected[1], created]);
  } finally {
    store?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
