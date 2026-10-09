import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApplication } from '../server.js';

test('existing projects and tasks survive archive schema migration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-migration-'));
  const path = join(directory, 'old.sqlite');
  let server;
  try {
    const database = new DatabaseSync(path);
    database.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (id, name) VALUES (42, 'Existing');
      INSERT INTO tasks (project_id, title, completed) VALUES (42, 'Saved task', 1);
    `);
    database.close();
    server = createApplication(path);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const url = `http://127.0.0.1:${server.address().port}`;
    const projects = await (await fetch(`${url}/api/projects`)).json();
    assert.deepEqual(projects, [{ id: 42, name: 'Existing', archived: false, total: 1, completed: 1 }]);
    const tasks = await (await fetch(`${url}/api/projects/42/tasks`)).json();
    assert.deepEqual(tasks, [{ id: 1, title: 'Saved task', completed: true }]);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
