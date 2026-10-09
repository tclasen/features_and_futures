import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', (data) => { errors += data; });
  try {
    const port = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Server startup timed out: ${errors}`)), 5000);
      child.once('error', (error) => { clearTimeout(timeout); reject(error); });
      child.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Server exited (${code}): ${errors}`)); });
      child.stdout.on('data', (data) => {
        output += data;
        const match = output.match(/listening on port (\d+)/);
        if (match) { clearTimeout(timeout); resolve(match[1]); }
      });
    });
    return {
      url: `http://127.0.0.1:${port}`,
      async stop() {
        if (child.exitCode !== null) return;
        const exited = once(child, 'exit');
        child.kill('SIGTERM');
        await exited;
      },
    };
  } catch (error) {
    child.kill();
    throw error;
  }
}

test('projects validate names, retain creation order, and persist across server restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const request = (path, options) => fetch(`${server.url}${path}`, options);
    const create = (name) => request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const health = await request('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.deepEqual(await (await request('/api/projects')).json(), []);
    for (const name of ['', ' \t\n ', null, 42]) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await request('/api/projects')).json(), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('<script> & another project')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await (await request('/api/projects')).json(), [first, second]);
    assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), first);
    assert.equal((await request('/api/projects/999999')).status, 404);
    assert.equal((await request('/api/projects/99999999999999999999')).status, 404);
    const malformed = await request('/api/projects', { method: 'POST', body: '{broken' });
    assert.equal(malformed.status, 400);
    const home = await request('/');
    assert.equal(home.status, 200);
    assert.match(await home.text(), /<h1>Workboard<\/h1>/);
    assert.equal((await request(`/projects/${first.id}`)).status, 200);
    assert.equal((await request('/app.js')).status, 200);
    assert.equal((await request('/style.css')).status, 200);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await (await request('/api/projects')).json(), [first, second]);
    assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), first);
    const third = await (await create('Third')).json();
    assert.ok(third.id > second.id);
  } finally {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('existing projects migrate safely; archives, task protection, and summaries persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archives-'));
  const databasePath = join(directory, 'workboard.sqlite');
  // Seed the schema used before archive support to exercise the real upgrade path.
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO projects (id, name) VALUES (7, 'Existing project');
    INSERT INTO tasks (id, project_id, title, completed) VALUES (11, 7, 'Saved task', 1);
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(databasePath);
    const request = (path, method = 'GET', body) => fetch(`${server.url}${path}`, {
      method,
      ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }),
    });
    const projectPath = '/api/projects/7';
    const taskPath = `${projectPath}/tasks`;
    const project = { id: 7, name: 'Existing project', archived: false, totalCount: 1, completedCount: 1 };
    assert.deepEqual(await (await request(projectPath)).json(), project);
    const empty = await (await request('/api/projects', 'POST', { name: 'Empty' })).json();
    assert.ok(empty.id > project.id);
    assert.equal(empty.totalCount, 0);
    assert.equal(empty.completedCount, 0);
    assert.equal(empty.archived, false);
    const openTask = await (await request(taskPath, 'POST', { title: 'Open task' })).json();
    assert.ok(openTask.id > 11);
    const tasks = await (await request(taskPath)).json();
    const summary = { ...project, totalCount: 2 };
    assert.deepEqual(await (await request('/api/projects')).json(), [summary, empty]);
    for (const archived of [null, 1, 'true']) {
      assert.equal((await request(projectPath, 'PATCH', { archived })).status, 400);
    }
    assert.equal((await request('/api/projects/999999', 'PATCH', { archived: true })).status, 404);
    const archived = await request(projectPath, 'PATCH', { archived: true });
    assert.equal(archived.status, 200);
    assert.deepEqual(await archived.json(), { ...summary, archived: true });
    assert.equal((await request(taskPath, 'POST', { title: 'Blocked task' })).status, 409);
    assert.equal((await request(`${taskPath}/11`, 'PATCH', { completed: false })).status, 409);
    assert.equal((await request(`${taskPath}/${openTask.id}`, 'PATCH', { completed: true })).status, 409);
    assert.deepEqual(await (await request(taskPath)).json(), tasks);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await (await request('/api/projects')).json(), [{ ...summary, archived: true }, empty]);
    assert.deepEqual(await (await request(taskPath)).json(), tasks);
    assert.equal((await request('/projects/7')).status, 200);
    const restored = await request(projectPath, 'PATCH', { archived: false });
    assert.equal(restored.status, 200);
    assert.deepEqual(await restored.json(), summary);
    assert.deepEqual(await (await request(taskPath)).json(), tasks);
    assert.equal((await request(`${taskPath}/11`, 'PATCH', { completed: false })).status, 200);
    const added = await request(taskPath, 'POST', { title: 'After restoration' });
    assert.equal(added.status, 201);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await (await request(projectPath)).json(), { ...summary, totalCount: 3, completedCount: 0 });
    assert.equal((await (await request(taskPath)).json()).length, 3);
  } finally {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate titles, belong to projects, and preserve completion across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const request = (path, method = 'GET', body) => fetch(`${server.url}${path}`, {
      method,
      ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    });
    const firstProject = await (await request('/api/projects', 'POST', { name: 'First' })).json();
    const secondProject = await (await request('/api/projects', 'POST', { name: 'Second' })).json();
    const firstPath = `/api/projects/${firstProject.id}/tasks`;
    const secondPath = `/api/projects/${secondProject.id}/tasks`;
    assert.deepEqual(await (await request(firstPath)).json(), []);
    for (const title of ['', ' \t\n ', null, 42]) {
      const invalid = await request(firstPath, 'POST', { title });
      assert.equal(invalid.status, 400);
      assert.deepEqual(await invalid.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await (await request(firstPath)).json(), []);
    const created = await request(firstPath, 'POST', { title: '  First task  ' });
    assert.equal(created.status, 201);
    const first = await created.json();
    assert.equal(first.title, 'First task');
    assert.equal(first.completed, false);
    const second = await (await request(firstPath, 'POST', { title: '<script> & task' })).json();
    assert.ok(second.id > first.id);
    assert.deepEqual(await (await request(firstPath)).json(), [first, second]);
    assert.deepEqual(await (await request(secondPath)).json(), []);
    assert.equal((await request(`${secondPath}/${first.id}`, 'PATCH', { completed: true })).status, 404);
    assert.equal((await request('/api/projects/999999/tasks', 'POST', { title: 'Unknown' })).status, 404);
    for (const completed of [null, 1, 'true']) {
      assert.equal((await request(`${firstPath}/${first.id}`, 'PATCH', { completed })).status, 400);
    }
    assert.equal((await request(`${firstPath}/99999999999999999999`, 'PATCH', { completed: true })).status, 404);
    assert.deepEqual(await (await request(firstPath)).json(), [first, second]);
    const completedResponse = await request(`${firstPath}/${first.id}`, 'PATCH', { completed: true });
    assert.equal(completedResponse.status, 200);
    const completed = await completedResponse.json();
    assert.deepEqual(completed, { ...first, completed: true });
    const other = await (await request(secondPath, 'POST', { title: 'Other project task' })).json();
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await (await request(firstPath)).json(), [completed, second]);
    assert.deepEqual(await (await request(secondPath)).json(), [other]);
    assert.equal((await request(`/projects/${firstProject.id}`)).status, 200);
    const reopened = await request(`${firstPath}/${first.id}`, 'PATCH', { completed: false });
    assert.deepEqual(await reopened.json(), first);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await (await request(firstPath)).json(), [first, second]);
  } finally {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('renaming preserves identity, ordering, tasks, summaries, and archive protection', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-renames-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const request = (path, method = 'GET', body) => fetch(`${server.url}${path}`, {
      method,
      ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }),
    });
    const first = await (await request('/api/projects', 'POST', { name: 'Original' })).json();
    const second = await (await request('/api/projects', 'POST', { name: 'Second' })).json();
    const path = `/api/projects/${first.id}`;
    const taskPath = `${path}/tasks`;
    const task = await (await request(taskPath, 'POST', { title: 'Saved task' })).json();
    await request(`${taskPath}/${task.id}`, 'PATCH', { completed: true });
    await request(taskPath, 'POST', { title: 'Open task' });
    const tasks = await (await request(taskPath)).json();
    const original = { ...first, totalCount: 2, completedCount: 1 };
    for (const name of ['', ' \t\n ', null, 42, false]) {
      const invalid = await request(path, 'PATCH', { name });
      assert.equal(invalid.status, 400);
      assert.deepEqual(await invalid.json(), { error: 'Project name is required' });
      assert.deepEqual(await (await request(path)).json(), original);
    }
    assert.equal((await request('/api/projects/999999', 'PATCH', { name: 'Missing' })).status, 404);
    assert.equal((await request(path, 'PATCH', { name: 'Mixed', archived: true })).status, 400);
    assert.deepEqual(await (await request(path)).json(), original);
    const renamed = { ...original, name: 'Renamed <project> & details' };
    const response = await request(path, 'PATCH', { name: '  Renamed <project> & details \n' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), renamed);
    assert.deepEqual(await (await request('/api/projects')).json(), [renamed, second]);
    assert.deepEqual(await (await request(taskPath)).json(), tasks);
    assert.equal((await request(`/projects/${first.id}`)).status, 200);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await (await request(path)).json(), renamed);
    assert.deepEqual(await (await request('/api/projects')).json(), [renamed, second]);
    assert.deepEqual(await (await request(taskPath)).json(), tasks);
    await request(path, 'PATCH', { archived: true });
    const blocked = await request(path, 'PATCH', { name: 'Blocked' });
    assert.equal(blocked.status, 409);
    assert.deepEqual(await (await request(path)).json(), { ...renamed, archived: true });
    await server.stop();
    server = await startServer(databasePath);
    assert.equal((await request(path, 'PATCH', { name: 'Still blocked' })).status, 409);
    await request(path, 'PATCH', { archived: false });
    const restored = { ...renamed, name: 'After restoration' };
    assert.deepEqual(await (await request(path, 'PATCH', { name: ' After restoration ' })).json(), restored);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await (await request('/api/projects')).json(), [restored, second]);
    assert.deepEqual(await (await request(taskPath)).json(), tasks);
  } finally {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task renaming preserves ownership, order, completion, summaries, and persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-renames-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const request = (path, method = 'GET', body) => fetch(`${server.url}${path}`, {
      method,
      ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }),
    });
    const project = await (await request('/api/projects', 'POST', { name: 'First' })).json();
    const otherProject = await (await request('/api/projects', 'POST', { name: 'Other' })).json();
    const projectPath = `/api/projects/${project.id}`;
    const taskPath = `${projectPath}/tasks`;
    const otherPath = `/api/projects/${otherProject.id}/tasks`;
    const first = await (await request(taskPath, 'POST', { title: 'First task' })).json();
    const second = await (await request(taskPath, 'POST', { title: 'Second task' })).json();
    const other = await (await request(otherPath, 'POST', { title: 'Other task' })).json();
    const firstPath = `${taskPath}/${first.id}`;
    const completed = await (await request(firstPath, 'PATCH', { completed: true })).json();
    const summary = await (await request(projectPath)).json();
    for (const title of ['', ' \t\n ', null, 42, false]) {
      const invalid = await request(firstPath, 'PATCH', { title });
      assert.equal(invalid.status, 400);
      assert.deepEqual(await invalid.json(), { error: 'Task title is required' });
      assert.deepEqual(await (await request(taskPath)).json(), [completed, second]);
    }
    assert.equal((await request(`${otherPath}/${first.id}`, 'PATCH', { title: 'Wrong owner' })).status, 404);
    assert.equal((await request(`${taskPath}/999999`, 'PATCH', { title: 'Missing' })).status, 404);
    assert.equal((await request(`${taskPath}/99999999999999999999`, 'PATCH', { title: 'Missing' })).status, 404);
    assert.equal((await request(firstPath, 'PATCH', { title: 'Mixed', completed: false })).status, 400);
    const renamed = { ...completed, title: 'Renamed <task> & details' };
    const response = await request(firstPath, 'PATCH', { title: '  Renamed <task> & details \n' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), renamed);
    const renamedOpen = { ...second, title: 'Renamed open task' };
    assert.deepEqual(await (await request(`${taskPath}/${second.id}`, 'PATCH', { title: ' Renamed open task ' })).json(), renamedOpen);
    assert.deepEqual(await (await request(taskPath)).json(), [renamed, renamedOpen]);
    assert.deepEqual(await (await request(otherPath)).json(), [other]);
    assert.deepEqual(await (await request(projectPath)).json(), summary);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await (await request(taskPath)).json(), [renamed, renamedOpen]);
    assert.deepEqual(await (await request(projectPath)).json(), summary);
    await request(projectPath, 'PATCH', { archived: true });
    assert.equal((await request(firstPath, 'PATCH', { title: 'Blocked' })).status, 409);
    assert.deepEqual(await (await request(taskPath)).json(), [renamed, renamedOpen]);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal((await request(firstPath, 'PATCH', { title: 'Still blocked' })).status, 409);
    await request(projectPath, 'PATCH', { archived: false });
    const restored = { ...renamed, title: 'After restoration' };
    assert.deepEqual(await (await request(firstPath, 'PATCH', { title: ' After restoration ' })).json(), restored);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await (await request(taskPath)).json(), [restored, renamedOpen]);
    assert.deepEqual(await (await request(otherPath)).json(), [other]);
    assert.deepEqual(await (await request(projectPath)).json(), summary);
  } finally {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
