import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const base = await new Promise((resolve, reject) => {
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
    base,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects validate, retain creation order, and persist across server restarts', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.test-db-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const health = await fetch(`${server.base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.deepEqual(await (await fetch(`${server.base}/api/projects`)).json(), []);
    const create = (name) => fetch(`${server.base}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    for (const name of ['', '   \t\n']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await fetch(`${server.base}/api/projects`)).json(), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('Second <project>')).json();
    assert.notEqual(first.id, second.id);
    const expected = [first, second];
    assert.deepEqual(await (await fetch(`${server.base}/api/projects`)).json(), expected);
    const html = await (await fetch(`${server.base}/`)).text();
    assert.match(html, /<title>Workboard<\/title>/);
    for (const path of ['/app.js', '/style.css', `/projects/${first.id}`]) {
      assert.equal((await fetch(`${server.base}${path}`)).status, 200);
    }
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.deepEqual(await (await fetch(`${server.base}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${server.base}/api/projects/${first.id}`)).json(), first);
    assert.equal((await fetch(`${server.base}/api/projects/999999`)).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, stay within their project, and retain completion after restart', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.test-db-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  const send = (path, method, body) => fetch(`${server.base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const get = async (path) => (await fetch(`${server.base}${path}`)).json();
  try {
    server = await start(databasePath);
    const firstProject = await (await send('/api/projects', 'POST', { name: 'First' })).json();
    const secondProject = await (await send('/api/projects', 'POST', { name: 'Second' })).json();
    const firstPath = `/api/projects/${firstProject.id}/tasks`;
    const secondPath = `/api/projects/${secondProject.id}/tasks`;
    for (const title of ['', ' \t\n ']) {
      const response = await send(firstPath, 'POST', { title });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await get(firstPath), []);
    const firstResponse = await send(firstPath, 'POST', { title: '  First task  ' });
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.title, 'First task');
    assert.equal(first.completed, false);
    const second = await (await send(firstPath, 'POST', { title: 'Second <task>' })).json();
    assert.notEqual(first.id, second.id);
    const other = await (await send(secondPath, 'POST', { title: 'Other project task' })).json();
    assert.deepEqual(await get(firstPath), [first, second]);
    assert.deepEqual(await get(secondPath), [other]);
    assert.equal((await send(`${secondPath}/${first.id}`, 'PATCH', { completed: true })).status, 404);
    assert.equal((await send(`${firstPath}/${first.id}`, 'PATCH', { completed: 'true' })).status, 400);
    assert.equal((await send('/api/projects/999999/tasks', 'POST', { title: 'Missing project' })).status, 404);
    assert.equal((await fetch(`${server.base}/api/projects/999999/tasks`)).status, 404);
    assert.deepEqual(await get(firstPath), [first, second]);
    const completedResponse = await send(`${firstPath}/${first.id}`, 'PATCH', { completed: true });
    assert.equal(completedResponse.status, 200);
    const completed = { ...first, completed: true };
    assert.deepEqual(await completedResponse.json(), completed);
    assert.deepEqual(await get(firstPath), [completed, second]);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal((await fetch(`${server.base}/projects/${firstProject.id}`)).status, 200);
    assert.deepEqual(await get(firstPath), [completed, second]);
    assert.deepEqual(await get(secondPath), [other]);
    const reopenedResponse = await send(`${firstPath}/${first.id}`, 'PATCH', { completed: false });
    assert.equal(reopenedResponse.status, 200);
    assert.deepEqual(await reopenedResponse.json(), first);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.deepEqual(await get(firstPath), [first, second]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive and restore preserve tasks and summaries, including an existing database', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.test-db-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO projects (name) VALUES ('Existing project');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Done', 1), (1, 'Pending', 0);
  `);
  database.close();
  let server;
  const get = async (path) => (await fetch(`${server.base}${path}`)).json();
  const send = (path, method, body) => fetch(`${server.base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  try {
    server = await start(databasePath);
    const projectPath = '/api/projects/1';
    const taskPath = `${projectPath}/tasks`;
    const active = { id: 1, name: 'Existing project', archived: false, total_count: 2, completed_count: 1 };
    assert.deepEqual(await get(projectPath), active);
    const tasks = await get(taskPath);
    const empty = await (await send('/api/projects', 'POST', { name: 'Empty' })).json();
    assert.equal(empty.total_count, 0);
    assert.equal(empty.completed_count, 0);
    assert.equal(empty.archived, false);
    assert.equal((await send(projectPath, 'PATCH', { archived: 'true' })).status, 400);
    assert.equal((await send('/api/projects/999999', 'PATCH', { archived: true })).status, 404);
    const archived = { ...active, archived: true };
    assert.deepEqual(await (await send(projectPath, 'PATCH', { archived: true })).json(), archived);
    assert.deepEqual(await get('/api/projects'), [archived, empty]);
    assert.equal((await send(taskPath, 'POST', { title: 'Blocked task' })).status, 409);
    assert.equal((await send(`${taskPath}/${tasks[0].id}`, 'PATCH', { completed: false })).status, 409);
    assert.deepEqual(await get(taskPath), tasks);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.deepEqual(await get(projectPath), archived);
    assert.deepEqual(await get(taskPath), tasks);
    assert.equal((await fetch(`${server.base}/projects/1`)).status, 200);
    assert.deepEqual(await (await send(projectPath, 'PATCH', { archived: false })).json(), active);
    assert.equal((await send(`${taskPath}/${tasks[1].id}`, 'PATCH', { completed: true })).status, 200);
    const completed = { ...active, completed_count: 2 };
    assert.deepEqual(await get('/api/projects'), [completed, empty]);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.deepEqual(await get(projectPath), completed);
    assert.deepEqual(await get(taskPath), tasks.map((task) => ({ ...task, completed: true })));
    assert.equal((await send(`${taskPath}/${tasks[0].id}`, 'PATCH', { completed: false })).status, 200);
    assert.deepEqual(await get(projectPath), active);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
