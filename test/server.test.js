import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  return {
    url,
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects validate, keep creation order, and survive server restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const request = (path, options) => fetch(server.url + path, options);
    const create = (name) => request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const health = await request('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    for (const name of ['', '   ', null, 42]) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await request('/api/projects')).json(), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('<b>Second project</b>')).json();
    assert.notEqual(first.id, second.id);
    const expected = [first, second];
    assert.deepEqual(await (await request('/api/projects')).json(), expected);
    assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), first);
    const detail = await request(`/projects/${first.id}`);
    assert.equal(detail.status, 200);
    assert.match(await detail.text(), /<script type="module" src="\/app.js">/);
    assert.equal((await request('/api/projects/99999')).status, 404);
    const invalidJson = await request('/api/projects', { method: 'POST', body: '{' });
    assert.equal(invalidJson.status, 400);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await (await request('/api/projects')).json(), expected);
    assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), first);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, remain project-owned, and persist completion across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const request = (path, method = 'GET', body) => fetch(server.url + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const firstProject = await (await request('/api/projects', 'POST', { name: 'First' })).json();
    const secondProject = await (await request('/api/projects', 'POST', { name: 'Second' })).json();
    const path = `/api/projects/${firstProject.id}/tasks`;
    const otherPath = `/api/projects/${secondProject.id}/tasks`;
    for (const title of ['', ' \t\n ', null, 42]) {
      const response = await request(path, 'POST', { title });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await (await request(path)).json(), []);
    const firstResponse = await request(path, 'POST', { title: '  First task  ' });
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.title, 'First task');
    assert.equal(first.completed, false);
    const second = await (await request(path, 'POST', { title: '<b>Second task</b>' })).json();
    assert.deepEqual(await (await request(path)).json(), [first, second]);
    assert.deepEqual(await (await request(otherPath)).json(), []);
    assert.equal((await request(`${otherPath}/${first.id}`, 'PATCH', { completed: true })).status, 404);
    assert.equal((await request('/api/projects/99999/tasks', 'POST', { title: 'Orphan' })).status, 404);
    for (const completed of [null, 1, 'true']) {
      assert.equal((await request(`${path}/${first.id}`, 'PATCH', { completed })).status, 400);
    }
    const completed = await request(`${path}/${first.id}`, 'PATCH', { completed: true });
    assert.equal(completed.status, 200);
    assert.deepEqual(await completed.json(), { ...first, completed: true });
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await (await request(path)).json(), [{ ...first, completed: true }, second]);
    assert.deepEqual(await (await request(otherPath)).json(), []);
    assert.equal((await request(`/projects/${firstProject.id}`)).status, 200);
    const reopened = await request(`${path}/${first.id}`, 'PATCH', { completed: false });
    assert.deepEqual(await reopened.json(), first);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await (await request(path)).json(), [first, second]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive and restore preserve tasks and summaries across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const request = (path, method = 'GET', body) => fetch(server.url + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const project = await (await request('/api/projects', 'POST', { name: 'Archive me' })).json();
    assert.deepEqual(project, {
      id: project.id, name: 'Archive me', archived: false, totalCount: 0, completedCount: 0,
    });
    const projectPath = `/api/projects/${project.id}`;
    const tasksPath = `${projectPath}/tasks`;
    const first = await (await request(tasksPath, 'POST', { title: 'Finished' })).json();
    const second = await (await request(tasksPath, 'POST', { title: 'Pending' })).json();
    await request(`${tasksPath}/${first.id}`, 'PATCH', { completed: true });
    const expectedTasks = [{ ...first, completed: true }, second];
    const expectedProject = { ...project, totalCount: 2, completedCount: 1 };
    assert.deepEqual(await (await request('/api/projects')).json(), [expectedProject]);
    for (const archived of [null, 1, 'true']) {
      assert.equal((await request(projectPath, 'PATCH', { archived })).status, 400);
    }
    assert.equal((await request('/api/projects/99999', 'PATCH', { archived: true })).status, 404);
    const archiveResponse = await request(projectPath, 'PATCH', { archived: true });
    assert.equal(archiveResponse.status, 200);
    assert.deepEqual(await archiveResponse.json(), { ...expectedProject, archived: true });
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await (await request('/api/projects')).json(), [{ ...expectedProject, archived: true }]);
    assert.deepEqual(await (await request(projectPath)).json(), { ...expectedProject, archived: true });
    assert.equal((await request(`/projects/${project.id}`)).status, 200);
    assert.equal((await request(tasksPath, 'POST', { title: 'Blocked' })).status, 409);
    assert.equal((await request(`${tasksPath}/${first.id}`, 'PATCH', { completed: false })).status, 409);
    assert.deepEqual(await (await request(tasksPath)).json(), expectedTasks);
    const restoreResponse = await request(projectPath, 'PATCH', { archived: false });
    assert.equal(restoreResponse.status, 200);
    assert.deepEqual(await restoreResponse.json(), expectedProject);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await (await request('/api/projects')).json(), [expectedProject]);
    assert.deepEqual(await (await request(tasksPath)).json(), expectedTasks);
    assert.equal((await request(`${tasksPath}/${first.id}`, 'PATCH', { completed: false })).status, 200);
    assert.deepEqual(await (await request(projectPath)).json(), { ...expectedProject, completedCount: 0 });
    assert.equal((await request(tasksPath, 'POST', { title: 'Allowed' })).status, 201);
    assert.deepEqual(await (await request(projectPath)).json(), { ...expectedProject, totalCount: 3, completedCount: 0 });
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('existing databases migrate without losing project IDs, tasks, or completion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-migration-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    const database = new DatabaseSync(databasePath);
    try {
      database.exec(`
        CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
        CREATE TABLE tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL REFERENCES projects(id),
          title TEXT NOT NULL,
          completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
        );
        INSERT INTO projects (id, name) VALUES (7, 'Existing project');
        INSERT INTO tasks (id, project_id, title, completed) VALUES (12, 7, 'Existing task', 1);
      `);
    } finally {
      database.close();
    }
    server = await startServer(databasePath);
    const expected = [{ id: 7, name: 'Existing project', archived: false, totalCount: 1, completedCount: 1 }];
    assert.deepEqual(await (await fetch(`${server.url}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${server.url}/api/projects/7/tasks`)).json(), [
      { id: 12, title: 'Existing task', completed: true },
    ]);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await (await fetch(`${server.url}/api/projects`)).json(), expected);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
