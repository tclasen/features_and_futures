import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openProjects } from '../projects.js';

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
    assert.deepEqual(store.list().map((project) => ({ ...project })), [{ id: 42, name: 'Existing project' }]);
    assert.deepEqual(store.tasks.list(42), []);
    const task = store.tasks.create(42, '  Existing project task  ');
    assert.equal(task.title, 'Existing project task');
    assert.equal(task.completed, false);
    assert.throws(() => store.tasks.create(999, 'Orphan'), /FOREIGN KEY/);
    assert.throws(() => store.tasks.create(42, ' \t\n '), /Task title is required/);
    assert.deepEqual(store.tasks.list(42), [task]);
    assert.ok(store.create('Next project').id > 42);
  } finally {
    store?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
