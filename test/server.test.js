import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';

async function availablePort() {
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}

async function start(port, database) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(port), DB_PATH: database },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stderr.on('data', chunk => { output += chunk; });
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(output);
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) return { child, base };
    } catch { /* Wait for the server to bind. */ }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  child.kill();
  throw new Error(`Server did not start: ${output}`);
}

async function stop(child) {
  const exit = once(child, 'exit');
  child.kill('SIGTERM');
  await exit;
}

test('legacy databases migrate without losing project IDs or tasks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-migration-'));
  const database = join(directory, 'legacy.sqlite');
  const db = new DatabaseSync(database);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)));
    INSERT INTO projects (id, name) VALUES (42, 'Existing project');
    INSERT INTO tasks (project_id, title, completed) VALUES (42, 'Existing task', 1);`);
  db.close();
  let running;
  try {
    running = await start(await availablePort(), database);
    const projects = await (await fetch(`${running.base}/api/projects`)).json();
    assert.deepEqual(projects, [{ id: 42, name: 'Existing project', archived: false, completed: 1, total: 1 }]);
    const tasks = await (await fetch(`${running.base}/api/projects/42/tasks`)).json();
    assert.deepEqual(tasks, [{ id: 1, title: 'Existing task', completed: true }]);
  } finally {
    if (running && running.child.exitCode === null) await stop(running.child);
    await rm(directory, { recursive: true, force: true });
  }
});

test('projects and tasks validate, preserve ownership and order, and survive restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-'));
  const port = await availablePort();
  const database = join(directory, 'nested', 'projects.sqlite');
  let running;
  try {
    running = await start(port, database);
    const get = path => fetch(`${running.base}${path}`);
    const create = name => fetch(`${running.base}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.deepEqual(await (await get('/api/projects')).json(), []);
    for (const name of ['', ' \t\n ', null]) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    assert.equal(first.archived, false);
    assert.equal(first.completed, 0);
    assert.equal(first.total, 0);
    const second = await (await create('<Second project>')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await (await get('/api/projects')).json(), [first, second]);
    assert.deepEqual(await (await get(`/api/projects/${first.id}`)).json(), first);
    assert.equal((await get('/api/projects/99999')).status, 404);
    for (const path of ['/', `/projects/${first.id}`, '/app.js', '/style.css']) {
      assert.equal((await get(path)).status, 200);
    }
    const tasksPath = `/api/projects/${first.id}/tasks`;
    const otherTasksPath = `/api/projects/${second.id}/tasks`;
    const createTask = title => fetch(`${running.base}${tasksPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const completeTask = (path, completed) => fetch(`${running.base}${path}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed }),
    });
    assert.deepEqual(await (await get(tasksPath)).json(), []);
    for (const title of ['', ' \t\n ', null, 12]) {
      const response = await createTask(title);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await (await get(tasksPath)).json(), []);
    const taskResponse = await createTask('  First task  ');
    assert.equal(taskResponse.status, 201);
    const task = await taskResponse.json();
    assert.equal(task.title, 'First task');
    assert.equal(task.completed, false);
    const secondTask = await (await createTask('<Second task>')).json();
    assert.deepEqual(await (await get(tasksPath)).json(), [task, secondTask]);
    assert.deepEqual(await (await get(otherTasksPath)).json(), []);
    assert.equal((await get('/api/projects/99999/tasks')).status, 404);
    assert.equal((await completeTask(`${otherTasksPath}/${task.id}`, true)).status, 404);
    assert.equal((await completeTask(`${tasksPath}/99999`, true)).status, 404);
    assert.equal((await completeTask(`${tasksPath}/${task.id}`, 'true')).status, 400);
    assert.deepEqual(await (await get(tasksPath)).json(), [task, secondTask]);
    const completed = { ...task, completed: true };
    assert.deepEqual(await (await completeTask(`${tasksPath}/${task.id}`, true)).json(), completed);
    assert.deepEqual(await (await completeTask(`${tasksPath}/${task.id}`, false)).json(), task);
    assert.deepEqual(await (await completeTask(`${tasksPath}/${task.id}`, true)).json(), completed);
    await stop(running.child);
    running = await start(port, database);
    assert.deepEqual(await (await get(tasksPath)).json(), [completed, secondTask]);
    assert.deepEqual(await (await get(otherTasksPath)).json(), []);
    assert.equal((await get(`/projects/${first.id}`)).status, 200);
    const summary = { ...first, completed: 1, total: 2 };
    assert.deepEqual(await (await get('/api/projects')).json(), [summary, second]);
    assert.deepEqual(await (await get(`/api/projects/${first.id}`)).json(), summary);
    const setArchived = archived => fetch(`${running.base}/api/projects/${first.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived }),
    });
    assert.equal((await setArchived('true')).status, 400);
    const archived = { ...summary, archived: true };
    assert.deepEqual(await (await setArchived(true)).json(), archived);
    assert.equal((await createTask('Forbidden')).status, 409);
    assert.equal((await completeTask(`${tasksPath}/${task.id}`, false)).status, 409);
    assert.deepEqual(await (await get(tasksPath)).json(), [completed, secondTask]);
    await stop(running.child);
    running = await start(port, database);
    assert.deepEqual(await (await get('/api/projects')).json(), [archived, second]);
    assert.deepEqual(await (await get(`/api/projects/${first.id}`)).json(), archived);
    assert.deepEqual(await (await setArchived(false)).json(), summary);
    assert.deepEqual(await (await get(tasksPath)).json(), [completed, secondTask]);
    assert.deepEqual(await (await completeTask(`${tasksPath}/${task.id}`, false)).json(), task);
    await stop(running.child);
    running = await start(port, database);
    assert.deepEqual(await (await get('/api/projects')).json(), [{ ...summary, completed: 0 }, second]);
    const malformed = await fetch(`${running.base}/api/projects`, { method: 'POST', body: '{' });
    assert.equal(malformed.status, 400);
  } finally {
    if (running && running.child.exitCode === null) await stop(running.child);
    await rm(directory, { recursive: true, force: true });
  }
});
