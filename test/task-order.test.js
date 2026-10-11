import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openProjects } from '../projects.js';

test('each project remembers order across reverse returns, field edits, archival, and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-return-order-'));
  const path = join(directory, 'projects.sqlite');
  let store;
  try {
    store = openProjects(path);
    const source = store.create('Source').id;
    const destination = store.create('Destination').id;
    const third = store.create('Third').id;
    const first = store.tasks.create(source, 'First');
    const second = store.tasks.create(source, 'Second');
    const last = store.tasks.create(source, 'Last');
    const resident = store.tasks.create(destination, 'Resident');
    const ids = (projectId) => store.tasks.list(projectId).map((task) => task.id);

    // Establish destination order independently from source order.
    store.tasks.move(source, second.id, destination);
    store.tasks.move(source, first.id, destination);
    assert.deepEqual(ids(destination), [resident.id, second.id, first.id]);
    store.tasks.move(source, last.id, third);
    const newcomer = store.tasks.create(source, 'Created while everyone is away');
    store.tasks.move(destination, second.id, source);
    store.tasks.move(destination, first.id, source);
    store.tasks.move(third, last.id, source);
    assert.deepEqual(ids(source), [first.id, second.id, last.id, newcomer.id]);

    store.tasks.rename(source, first.id, 'Current title');
    store.tasks.setCompleted(source, first.id, true);
    store.tasks.setPriority(source, first.id, 'High');
    store.tasks.setDueDate(source, first.id, '2028-02-29');
    store.tasks.setNotes(source, first.id, '  Current notes\n日本語 <b>literal</b>  ');
    const currentFirst = store.tasks.list(source)[0];
    store.rename(destination, 'Renamed destination');
    store.setDefaultPriority(destination, 'Low');
    const laterResident = store.tasks.create(destination, 'Later resident', 'Low');
    store.setArchived(destination, true);
    assert.throws(() => store.tasks.move(source, first.id, destination), /Archived/);
    store.close();
    store = openProjects(path);
    store.setArchived(destination, false);
    // Returning in the opposite order still restores destination's own order.
    store.tasks.move(source, first.id, destination);
    store.tasks.move(source, second.id, destination);
    assert.deepEqual(store.tasks.list(destination), [resident, second, currentFirst, laterResident]);
    assert.equal(store.get(source).total_count, 2);
    assert.equal(store.get(source).completed_count, 0);
    assert.equal(store.get(destination).total_count, 4);
    assert.equal(store.get(destination).completed_count, 1);

    // Failed moves leave ownership and remembered order intact.
    assert.throws(() => store.tasks.move(source, first.id, third), /Task not found/);
    store.tasks.move(destination, first.id, third);
    assert.deepEqual(store.tasks.list(third), [currentFirst]);
    store.close();
    store = openProjects(path);
    store.tasks.move(third, first.id, source);
    store.tasks.move(destination, second.id, source);
    assert.deepEqual(store.tasks.list(source), [currentFirst, second, last, newcomer]);
    assert.deepEqual(store.tasks.list(destination), [resident, laterResident]);
    store.close();
    store = openProjects(path);
    assert.deepEqual(store.tasks.list(source), [currentFirst, second, last, newcomer]);
  } finally {
    store?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('Task 011 migration retains current explicit order instead of sorting by task ID', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-position-migration-'));
  const path = join(directory, 'existing.sqlite');
  let store;
  try {
    const database = new DatabaseSync(path);
    try {
      database.exec(`
        CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
        CREATE TABLE tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL REFERENCES projects(id),
          title TEXT NOT NULL,
          completed INTEGER NOT NULL DEFAULT 0,
          position INTEGER NOT NULL
        );
        INSERT INTO projects VALUES (1, 'Source'), (2, 'Destination');
        INSERT INTO tasks (id, project_id, title, position) VALUES
          (30, 1, 'First', 2), (10, 1, 'Second', 5), (20, 2, 'Other', 1);
      `);
    } finally {
      database.close();
    }
    store = openProjects(path);
    const original = store.tasks.list(1);
    assert.deepEqual(original.map((task) => task.id), [30, 10]);
    store.tasks.move(1, 30, 2);
    store.tasks.move(1, 10, 2);
    const created = store.tasks.create(1, 'New after reserved positions');
    store.close();
    store = openProjects(path);
    store.tasks.move(2, 10, 1);
    store.tasks.move(2, 30, 1);
    assert.deepEqual(store.tasks.list(1), [...original, created]);
  } finally {
    store?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
