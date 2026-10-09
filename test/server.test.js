import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { DatabaseSync } from 'node:sqlite';

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test('project and task validation, isolation, order, and persistence across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let child;
  let errors = '';
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'nested', 'projects.sqlite') },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    child.stderr.on('data', (data) => { errors += data; });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(errors);
      try {
        const response = await fetch(`${base}/health`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'ok' });
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    throw new Error(`Server did not start: ${errors}`);
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  async function create(name) {
    return fetch(`${base}/api/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
  }
  try {
    await start();
    for (const name of ['', ' \n\t ', null, 12]) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), []);
    const firstResponse = await create('  Alpha 🐱  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'Alpha 🐱');
    assert.equal(first.archived, false);
    assert.equal(first.total, 0);
    assert.equal(first.completed, 0);
    const second = await (await create('<script>Second</script>')).json();
    const expected = [first, second];
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    for (const path of ['/', `/projects/${first.id}`]) {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /<title>Workboard<\/title>/);
    }
    assert.equal((await fetch(`${base}/api/projects/99999`)).status, 404);
    const invalidJson = await fetch(`${base}/api/projects`, { method: 'POST', body: '{' });
    assert.equal(invalidJson.status, 400);
    const taskPath = `/api/projects/${first.id}/tasks`;
    async function taskRequest(path, method, body) {
      return fetch(`${base}${path}`, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
    }
    for (const title of ['', ' \n\t ', null, 12]) {
      const response = await taskRequest(taskPath, 'POST', { title });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await (await fetch(`${base}${taskPath}`)).json(), []);
    const taskResponse = await taskRequest(taskPath, 'POST', { title: '  First task 🐱  ' });
    assert.equal(taskResponse.status, 201);
    const task = await taskResponse.json();
    assert.equal(task.title, 'First task 🐱');
    assert.equal(task.completed, false);
    const nextTask = await (await taskRequest(taskPath, 'POST', { title: 'Second task' })).json();
    assert.deepEqual(await (await fetch(`${base}${taskPath}`)).json(), [task, nextTask]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${second.id}/tasks`)).json(), []);
    assert.equal((await taskRequest(`/api/projects/${second.id}/tasks/${task.id}`, 'PATCH', { completed: true })).status, 404);
    assert.equal((await taskRequest('/api/projects/99999/tasks', 'POST', { title: 'Orphan' })).status, 404);
    assert.equal((await taskRequest(`${taskPath}/${task.id}`, 'PATCH', { completed: 'true' })).status, 400);
    for (const completed of [true, false, true]) {
      const response = await taskRequest(`${taskPath}/${task.id}`, 'PATCH', { completed });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ...task, completed });
    }
    task.completed = true;
    for (const title of ['', ' \n\t ', null, 12]) {
      const response = await taskRequest(`${taskPath}/${task.id}`, 'PATCH', { title });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
      assert.deepEqual(await (await fetch(`${base}${taskPath}`)).json(), [task, nextTask]);
    }
    assert.equal((await taskRequest(`${taskPath}/${task.id}`, 'PATCH', { title: 'Combined', completed: false })).status, 400);
    assert.equal((await taskRequest(`/api/projects/${second.id}/tasks/${task.id}`, 'PATCH', { title: 'Wrong owner' })).status, 404);
    assert.equal((await taskRequest(`${taskPath}/99999`, 'PATCH', { title: 'Missing' })).status, 404);
    for (const item of [task, nextTask]) {
      const response = await taskRequest(`${taskPath}/${item.id}`, 'PATCH', { title: `  Renamed ${item.id} 🐱  ` });
      assert.equal(response.status, 200);
      item.title = `Renamed ${item.id} 🐱`;
      assert.deepEqual(await response.json(), item);
    }
    const savedTasks = [task, nextTask];
    assert.deepEqual(await (await fetch(`${base}${taskPath}`)).json(), savedTasks);
    Object.assign(first, { total: 2, completed: 1 });
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), expected);
    const projectPath = `/api/projects/${first.id}`;
    for (const name of ['', ' \n\t ', null, 12]) {
      const response = await taskRequest(projectPath, 'PATCH', { name });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
      assert.deepEqual(await (await fetch(`${base}${projectPath}`)).json(), first);
    }
    assert.equal((await taskRequest(projectPath, 'PATCH', { name: 'Invalid combined update', archived: true })).status, 400);
    assert.equal((await taskRequest('/api/projects/99999', 'PATCH', { name: 'Missing' })).status, 404);
    const renameResponse = await taskRequest(projectPath, 'PATCH', { name: '  Renamed 🐱  ' });
    assert.equal(renameResponse.status, 200);
    first.name = 'Renamed 🐱';
    assert.deepEqual(await renameResponse.json(), first);
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${base}${taskPath}`)).json(), savedTasks);
    assert.equal((await taskRequest(`/api/projects/${first.id}`, 'PATCH', { archived: 'true' })).status, 400);
    assert.equal((await taskRequest('/api/projects/99999', 'PATCH', { archived: true })).status, 404);
    const archiveResponse = await taskRequest(`/api/projects/${first.id}`, 'PATCH', { archived: true });
    assert.equal(archiveResponse.status, 200);
    first.archived = true;
    assert.deepEqual(await archiveResponse.json(), first);
    assert.equal((await taskRequest(projectPath, 'PATCH', { name: 'Blocked rename' })).status, 409);
    assert.deepEqual(await (await fetch(`${base}${projectPath}`)).json(), first);
    assert.equal((await taskRequest(taskPath, 'POST', { title: 'Blocked' })).status, 409);
    assert.equal((await taskRequest(`${taskPath}/${task.id}`, 'PATCH', { completed: false })).status, 409);
    assert.equal((await taskRequest(`${taskPath}/${task.id}`, 'PATCH', { title: 'Blocked task rename' })).status, 409);
    assert.deepEqual(await (await fetch(`${base}${taskPath}`)).json(), savedTasks);
    await stop();
    await start();
    assert.deepEqual(await (await fetch(`${base}${taskPath}`)).json(), savedTasks);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${second.id}/tasks`)).json(), []);
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    const restoreResponse = await taskRequest(`/api/projects/${first.id}`, 'PATCH', { archived: false });
    assert.equal(restoreResponse.status, 200);
    first.archived = false;
    assert.deepEqual(await restoreResponse.json(), first);
    const restoredRename = await taskRequest(projectPath, 'PATCH', { name: '  Restored name  ' });
    assert.equal(restoredRename.status, 200);
    first.name = 'Restored name';
    assert.deepEqual(await restoredRename.json(), first);
    const restoredTaskRename = await taskRequest(`${taskPath}/${task.id}`, 'PATCH', { title: '  Restored task title  ' });
    assert.equal(restoredTaskRename.status, 200);
    task.title = 'Restored task title';
    assert.deepEqual(await restoredTaskRename.json(), task);
    assert.deepEqual(await (await fetch(`${base}${taskPath}`)).json(), savedTasks);
    await stop();
    await start();
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${base}${taskPath}`)).json(), savedTasks);
    assert.equal((await taskRequest(`${taskPath}/${task.id}`, 'PATCH', { completed: false })).status, 200);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), { ...first, completed: 0 });
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('upgrades a pre-archive database without losing existing data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-migration-'));
  const databasePath = join(directory, 'legacy.sqlite');
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
    );
    INSERT INTO projects (id, name) VALUES (7, 'Existing project');
    INSERT INTO tasks (id, project_id, title, completed) VALUES (9, 7, 'Existing task', 1);
  `);
  database.close();
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(port), DB_PATH: databasePath },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let errors = '';
  child.stderr.on('data', (data) => { errors += data; });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(errors);
      try {
        ready = (await fetch(`${base}/health`)).ok;
        if (ready) break;
      } catch { /* Wait for the server to bind. */ }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.ok(ready, errors);
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [
      { id: 7, name: 'Existing project', archived: false, total: 1, completed: 1 },
    ]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/7/tasks`)).json(), [
      { id: 9, title: 'Existing task', completed: true },
    ]);
  } finally {
    if (child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
