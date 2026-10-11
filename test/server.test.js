import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const port = await new Promise((resolve, reject) => {
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(match[1]);
    });
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`Server exited: ${code}`)));
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('legacy project databases migrate without losing IDs or tasks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-migration-'));
  const databasePath = join(directory, 'legacy.sqlite');
  let server;
  try {
    const legacy = new DatabaseSync(databasePath);
    legacy.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)));
      INSERT INTO projects (id, name) VALUES (17, 'Legacy');
      INSERT INTO tasks (id, project_id, title, completed) VALUES (23, 17, 'Saved task', 1);
    `);
    legacy.close();
    server = await start(databasePath);
    const expected = [{ id: 17, name: 'Legacy', archived: false, totalCount: 1, completedCount: 1 }];
    assert.deepEqual(await (await fetch(`${server.url}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${server.url}/api/projects/17/tasks`)).json(), [
      { id: 23, title: 'Saved task', completed: true },
    ]);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await fetch(`${server.url}/api/projects`)).json(), expected);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('health, project validation, creation order, routes, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let server;
  try {
    const databasePath = join(directory, 'nested', 'projects.sqlite');
    server = await start(databasePath);
    const request = (path, options) => fetch(`${server.url}${path}`, options);
    const create = (name) => request('/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    const health = await request('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    for (const name of ['', '  \t\n', null, 42]) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      assert.match((await invalid.json()).error, /Project name is required/);
    }
    assert.deepEqual(await (await request('/api/projects')).json(), []);
    const malformed = await request('/api/projects', { method: 'POST', body: '{' });
    assert.equal(malformed.status, 400);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('<script>Not HTML</script>')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await (await request('/api/projects')).json(), [first, second]);
    assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), first);
    for (const path of ['/', `/projects/${first.id}`]) {
      const page = await request(path);
      assert.equal(page.status, 200);
      assert.match(await page.text(), /<title>Workboard<\/title>/);
    }
    assert.equal((await request('/api/projects/999999')).status, 404);

    const tasksPath = `/api/projects/${first.id}/tasks`;
    const otherTasksPath = `/api/projects/${second.id}/tasks`;
    const createTask = (title, path = tasksPath) => request(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
    });
    const completeTask = (id, completed, path = tasksPath) => request(`${path}/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed }),
    });
    for (const title of ['', ' \t\n ', null, 42]) {
      const invalid = await createTask(title);
      assert.equal(invalid.status, 400);
      assert.match((await invalid.json()).error, /Task title is required/);
    }
    assert.deepEqual(await (await request(tasksPath)).json(), []);
    const taskResponse = await createTask('  First task  ');
    assert.equal(taskResponse.status, 201);
    const task = await taskResponse.json();
    assert.equal(task.title, 'First task');
    assert.equal(task.completed, false);
    const nextTask = await (await createTask('<script>Task text</script>')).json();
    assert.deepEqual(await (await request(tasksPath)).json(), [task, nextTask]);
    assert.deepEqual(await (await request(otherTasksPath)).json(), []);
    const otherTask = await (await createTask('Other project task', otherTasksPath)).json();
    assert.equal((await completeTask(task.id, true, otherTasksPath)).status, 404);
    assert.equal((await completeTask(task.id, 'true')).status, 400);
    assert.equal((await completeTask(task.id, null)).status, 400);
    assert.equal((await createTask('Missing', '/api/projects/999999/tasks')).status, 404);
    assert.equal((await request('/api/projects/999999/tasks')).status, 404);
    const completedResponse = await completeTask(task.id, true);
    assert.equal(completedResponse.status, 200);
    assert.deepEqual(await completedResponse.json(), { ...task, completed: true });
    assert.deepEqual(await (await completeTask(task.id, false)).json(), task);
    await completeTask(task.id, true);
    assert.deepEqual(await (await request(otherTasksPath)).json(), [otherTask]);
    await server.stop();
    server = await start(databasePath);
    const firstSummary = { ...first, totalCount: 2, completedCount: 1 };
    const secondSummary = { ...second, totalCount: 1, completedCount: 0 };
    assert.deepEqual(await (await request('/api/projects')).json(), [firstSummary, secondSummary]);
    assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), firstSummary);
    assert.deepEqual(await (await request(tasksPath)).json(), [{ ...task, completed: true }, nextTask]);
    assert.deepEqual(await (await request(otherTasksPath)).json(), [otherTask]);
    assert.deepEqual(await (await completeTask(task.id, false)).json(), task);
    assert.equal((await request(`/projects/${first.id}`)).status, 200);
    await completeTask(task.id, true);
    const archiveProject = (archived) => request(`/api/projects/${first.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived }),
    });
    assert.equal((await archiveProject('true')).status, 400);
    assert.deepEqual(await (await archiveProject(true)).json(), { ...firstSummary, archived: true });
    assert.equal((await createTask('Forbidden')).status, 409);
    assert.equal((await completeTask(task.id, false)).status, 409);
    assert.deepEqual(await (await request(tasksPath)).json(), [{ ...task, completed: true }, nextTask]);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request('/api/projects')).json(), [
      { ...firstSummary, archived: true }, secondSummary,
    ]);
    assert.deepEqual(await (await archiveProject(false)).json(), firstSummary);
    assert.deepEqual(await (await request(tasksPath)).json(), [{ ...task, completed: true }, nextTask]);
    assert.equal((await completeTask(task.id, false)).status, 200);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), {
      ...firstSummary, completedCount: 0,
    });
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
