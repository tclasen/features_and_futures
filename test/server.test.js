import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stderr.on('data', (chunk) => { output += chunk; });
  const baseUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server did not start: ${output}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with ${code}: ${output}`));
    });
    child.stdout.on('data', (chunk) => {
      const match = chunk.toString().match(/listening on port (\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  return {
    baseUrl,
    async stop() {
      if (child.exitCode !== null) return;
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects validate, retain creation order, and persist across server restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const request = (path, options) => fetch(server.baseUrl + path, options);
    const create = (name) => request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });

    const health = await request('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.deepEqual(await (await request('/api/projects')).json(), []);

    for (const name of ['', ' \t\n ', null, 123]) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      assert.deepEqual(await invalid.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await request('/api/projects')).json(), []);

    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    assert.equal(first.archived, false);
    assert.equal(first.totalCount, 0);
    assert.equal(first.completedCount, 0);
    assert.ok(Number.isInteger(first.id));
    const second = await (await create('<script>Special & safe</script>')).json();
    assert.notEqual(second.id, first.id);
    const expected = [first, second];
    assert.deepEqual(await (await request('/api/projects')).json(), expected);
    assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), first);
    assert.equal((await request('/api/projects/99999')).status, 404);
    assert.equal((await request(`/projects/${first.id}`)).status, 200);
    const page = await (await request('/')).text();
    assert.match(page, /<title>Workboard<\/title>/);
    assert.match(page, /src="\/app.js"/);
    assert.equal((await request('/app.js')).status, 200);
    assert.equal((await request('/styles.css')).status, 200);
    const malformed = await request('/api/projects', { method: 'POST', body: '{' });
    assert.equal(malformed.status, 400);
    const oversized = await request('/api/projects', {
      method: 'POST', body: JSON.stringify({ name: 'x'.repeat(70_000) }),
    });
    assert.equal(oversized.status, 413);
    assert.deepEqual(await (await request('/api/projects')).json(), expected);

    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await (await request('/api/projects')).json(), expected);
    assert.deepEqual(await (await request(`/api/projects/${second.id}`)).json(), second);
    const third = await (await create('Third project')).json();
    assert.ok(third.id > second.id);
    assert.deepEqual(await (await request('/api/projects')).json(), [...expected, third]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, belong to their project, and retain completion across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  // Start with the Task 001 schema and data to verify the additive migration.
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL CHECK (length(trim(name)) > 0)
    );
    INSERT INTO projects (name) VALUES ('Existing project'), ('Other project');
  `);
  database.close();
  let server;
  try {
    server = await startServer(databasePath);
    const request = (path, method = 'GET', body) => fetch(server.baseUrl + path, {
      method,
      ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    });
    const taskPath = '/api/projects/1/tasks';
    const list = async (path = taskPath) => (await request(path)).json();
    assert.deepEqual(await (await request('/api/projects')).json(), [
      { id: 1, name: 'Existing project', archived: false, totalCount: 0, completedCount: 0 },
      { id: 2, name: 'Other project', archived: false, totalCount: 0, completedCount: 0 },
    ]);
    assert.deepEqual(await list(), []);
    for (const title of ['', ' \t\n ', null, 123]) {
      const invalid = await request(taskPath, 'POST', { title });
      assert.equal(invalid.status, 400);
      assert.deepEqual(await invalid.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await list(), []);
    assert.equal((await request('/api/projects/999/tasks', 'POST', { title: 'Missing' })).status, 404);
    assert.equal((await request('/api/projects/999/tasks')).status, 404);
    const firstResponse = await request(taskPath, 'POST', { title: '  First task  ' });
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.deepEqual(first, { id: first.id, title: 'First task', completed: false });
    assert.ok(Number.isInteger(first.id));
    const second = await (await request(taskPath, 'POST', { title: '<b>Second & safe</b>' })).json();
    assert.ok(second.id > first.id);
    assert.deepEqual(await list(), [first, second]);
    assert.deepEqual(await list('/api/projects/2/tasks'), []);
    for (const completed of ['true', 1, null]) {
      assert.equal((await request(`${taskPath}/${first.id}`, 'PATCH', { completed })).status, 400);
    }
    assert.deepEqual(await list(), [first, second]);
    assert.equal((await request(`/api/projects/2/tasks/${first.id}`, 'PATCH', { completed: true })).status, 404);
    assert.equal((await request(`${taskPath}/999`, 'PATCH', { completed: true })).status, 404);
    const completion = await request(`${taskPath}/${first.id}`, 'PATCH', { completed: true });
    assert.equal(completion.status, 200);
    first.completed = true;
    assert.deepEqual(await completion.json(), first);
    const other = await (await request('/api/projects/2/tasks', 'POST', { title: 'Other task' })).json();
    assert.deepEqual(await list(), [first, second]);
    assert.deepEqual(await list('/api/projects/2/tasks'), [other]);

    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await list(), [first, second]);
    assert.deepEqual(await list('/api/projects/2/tasks'), [other]);
    assert.equal((await request('/projects/1')).status, 200);
    const reopened = await request(`${taskPath}/${first.id}`, 'PATCH', { completed: false });
    first.completed = false;
    assert.deepEqual(await reopened.json(), first);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await list(), [first, second]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive migration, summaries, and restoration preserve tasks across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  // A Task 002 database already contains tasks but has no archive column.
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
    );
    INSERT INTO projects (name) VALUES ('Existing project'), ('Other project');
    INSERT INTO tasks (project_id, title, completed)
    VALUES (1, 'Completed task', 1), (1, 'Open task', 0), (2, 'Other task', 1);
  `);
  database.close();
  let server;
  try {
    server = await startServer(databasePath);
    const request = (path, method = 'GET', body) => fetch(server.baseUrl + path, {
      method,
      ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    });
    const projectPath = '/api/projects/1';
    const taskPath = `${projectPath}/tasks`;
    const getProject = async () => (await request(projectPath)).json();
    const getTasks = async () => (await request(taskPath)).json();
    const original = { id: 1, name: 'Existing project', archived: false, totalCount: 2, completedCount: 1 };
    const other = { id: 2, name: 'Other project', archived: false, totalCount: 1, completedCount: 1 };
    assert.deepEqual(await getProject(), original);
    assert.deepEqual(await (await request('/api/projects')).json(), [original, other]);
    const tasks = await getTasks();
    assert.deepEqual(tasks, [
      { id: 1, title: 'Completed task', completed: true },
      { id: 2, title: 'Open task', completed: false },
    ]);
    for (const archived of ['true', 1, null]) {
      assert.equal((await request(projectPath, 'PATCH', { archived })).status, 400);
    }
    assert.deepEqual(await getProject(), original);
    assert.equal((await request('/api/projects/999', 'PATCH', { archived: true })).status, 404);
    const archived = { ...original, archived: true };
    const archiveResponse = await request(projectPath, 'PATCH', { archived: true });
    assert.equal(archiveResponse.status, 200);
    assert.deepEqual(await archiveResponse.json(), archived);
    assert.deepEqual(await getTasks(), tasks);
    assert.equal((await request(taskPath, 'POST', { title: 'Forbidden task' })).status, 409);
    for (const task of tasks) {
      assert.equal((await request(`${taskPath}/${task.id}`, 'PATCH', { completed: !task.completed })).status, 409);
    }
    assert.deepEqual(await getTasks(), tasks);
    assert.deepEqual(await (await request('/api/projects')).json(), [archived, other]);

    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await getProject(), archived);
    assert.deepEqual(await getTasks(), tasks);
    assert.equal((await request('/projects/1')).status, 200);
    const restoreResponse = await request(projectPath, 'PATCH', { archived: false });
    assert.equal(restoreResponse.status, 200);
    assert.deepEqual(await restoreResponse.json(), original);
    assert.deepEqual(await getTasks(), tasks);
    assert.equal((await request(`${taskPath}/2`, 'PATCH', { completed: true })).status, 200);
    const added = await request(taskPath, 'POST', { title: '  Restored task  ' });
    assert.equal(added.status, 201);
    const newTask = await added.json();
    assert.equal(newTask.title, 'Restored task');
    assert.equal(newTask.completed, false);
    const restored = { ...original, totalCount: 3, completedCount: 2 };
    assert.deepEqual(await getProject(), restored);
    tasks[1].completed = true;
    tasks.push(newTask);

    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await getProject(), restored);
    assert.deepEqual(await getTasks(), tasks);
    assert.deepEqual(await (await request('/api/projects')).json(), [restored, other]);
    assert.equal((await request(`${taskPath}/1`, 'PATCH', { completed: false })).status, 200);
    assert.deepEqual(await getProject(), { ...restored, completedCount: 1 });
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
