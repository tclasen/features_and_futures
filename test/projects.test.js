import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const url = await new Promise((resolveUrl, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 10000);
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolveUrl(`http://127.0.0.1:${match[1]}`);
      }
    });
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Server exited (${code}): ${errors}`));
    });
  });
  return { url, async stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  } };
}

test('projects and tasks validate, stay isolated, and survive a restart', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'test-'));
  const databasePath = resolve(directory, 'projects.sqlite');
  let server;
  try {
    // Upgrade a database with the schema used before archive support.
    const legacy = new DatabaseSync(databasePath);
    legacy.exec(`CREATE TABLE projects (
      position INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, name TEXT NOT NULL
    ); INSERT INTO projects (id, name) VALUES ('legacy', 'Existing project')`);
    legacy.close();
    server = await start(databasePath);
    const get = async path => {
      const response = await fetch(server.url + path);
      assert.equal(response.status, 200);
      return response.json();
    };
    const create = name => fetch(server.url + '/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    assert.deepEqual(await get('/health'), { status: 'ok' });
    const existing = { id: 'legacy', name: 'Existing project', archived: false, total: 0, completed: 0 };
    assert.deepEqual(await get('/api/projects'), [existing]);
    for (const name of ['', ' \t\n ']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await get('/api/projects'), [existing]);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    assert.ok(first.id);
    const secondResponse = await create('Second project');
    const second = await secondResponse.json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await get('/api/projects'), [existing, first, second]);
    assert.equal(first.archived, false);
    assert.equal(first.total, 0);
    assert.equal(first.completed, 0);
    assert.deepEqual(await get(`/api/projects/${first.id}`), first);
    const firstTasks = `/api/projects/${first.id}/tasks`;
    const secondTasks = `/api/projects/${second.id}/tasks`;
    const createTask = (path, title) => fetch(server.url + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const completeTask = (path, completed) => fetch(server.url + path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed }),
    });
    assert.deepEqual(await get(firstTasks), []);
    for (const title of ['', ' \t\n ']) {
      const response = await createTask(firstTasks, title);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await get(firstTasks), []);
    const taskResponse = await createTask(firstTasks, '  First task  ');
    assert.equal(taskResponse.status, 201);
    const firstTask = await taskResponse.json();
    assert.ok(firstTask.id);
    assert.equal(firstTask.title, 'First task');
    assert.equal(firstTask.completed, false);
    const nextTaskResponse = await createTask(firstTasks, 'Second task');
    const secondTask = await nextTaskResponse.json();
    assert.notEqual(firstTask.id, secondTask.id);
    assert.deepEqual(await get(firstTasks), [firstTask, secondTask]);
    assert.deepEqual(await get(secondTasks), []);
    const otherTaskResponse = await createTask(secondTasks, 'Other project task');
    const otherTask = await otherTaskResponse.json();
    assert.deepEqual(await get(secondTasks), [otherTask]);
    const wrongProject = await completeTask(`${secondTasks}/${firstTask.id}`, true);
    assert.equal(wrongProject.status, 404);
    const invalidCompletion = await completeTask(`${firstTasks}/${firstTask.id}`, 'true');
    assert.equal(invalidCompletion.status, 400);
    assert.deepEqual(await get(firstTasks), [firstTask, secondTask]);
    const completion = await completeTask(`${firstTasks}/${firstTask.id}`, true);
    assert.equal(completion.status, 200);
    firstTask.completed = true;
    assert.deepEqual(await completion.json(), firstTask);
    const reopened = await completeTask(`${firstTasks}/${firstTask.id}`, false);
    assert.equal(reopened.status, 200);
    firstTask.completed = false;
    assert.deepEqual(await reopened.json(), firstTask);
    await completeTask(`${firstTasks}/${firstTask.id}`, true);
    firstTask.completed = true;
    assert.deepEqual(await get(firstTasks), [firstTask, secondTask]);
    assert.deepEqual(await get(secondTasks), [otherTask]);
    const unknownProject = await createTask('/api/projects/missing/tasks', 'Orphan');
    assert.equal(unknownProject.status, 404);
    first.total = 2;
    first.completed = 1;
    second.total = 1;
    const rename = name => fetch(server.url + `/api/projects/${first.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    for (const name of ['', ' \t\n ', null, 123]) {
      const response = await rename(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
      assert.deepEqual(await get(`/api/projects/${first.id}`), first);
    }
    const renamed = await rename('  Renamed project  ');
    assert.equal(renamed.status, 200);
    first.name = 'Renamed project';
    assert.deepEqual(await renamed.json(), first);
    assert.deepEqual(await get('/api/projects'), [existing, first, second]);
    assert.deepEqual(await get(firstTasks), [firstTask, secondTask]);
    const setArchived = archived => fetch(server.url + `/api/projects/${first.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived }),
    });
    assert.equal((await setArchived('true')).status, 400);
    const archiveResponse = await setArchived(true);
    assert.equal(archiveResponse.status, 200);
    first.archived = true;
    assert.deepEqual(await archiveResponse.json(), first);
    assert.deepEqual(await get('/api/projects'), [existing, first, second]);
    assert.equal((await createTask(firstTasks, 'Blocked')).status, 409);
    assert.equal((await completeTask(`${firstTasks}/${firstTask.id}`, false)).status, 409);
    assert.equal((await rename('Blocked rename')).status, 409);
    assert.deepEqual(await get(`/api/projects/${first.id}`), first);
    assert.deepEqual(await get(firstTasks), [firstTask, secondTask]);
    for (const path of ['/', `/projects/${first.id}`]) {
      const response = await fetch(server.url + path);
      assert.equal(response.status, 200);
      const page = await response.text();
      assert.match(page, /<h1>Workboard<\/h1>/);
      assert.match(page, /<label for="project-name">Project name<\/label>/);
      assert.match(page, /Create project/);
      assert.match(page, /role="alert"/);
      assert.match(page, /<label for="new-project-name">New project name<\/label>/);
      assert.match(page, /Rename project/);
    }
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.deepEqual(await get('/api/projects'), [existing, first, second]);
    assert.deepEqual(await get(`/api/projects/${first.id}`), first);
    assert.deepEqual(await get(firstTasks), [firstTask, secondTask]);
    assert.deepEqual(await get(secondTasks), [otherTask]);
    assert.equal((await createTask(firstTasks, 'Still blocked')).status, 409);
    const restored = await setArchived(false);
    first.archived = false;
    assert.equal(restored.status, 200);
    assert.deepEqual(await restored.json(), first);
    const renamedAfterRestoration = await rename('  Restored and renamed  ');
    assert.equal(renamedAfterRestoration.status, 200);
    first.name = 'Restored and renamed';
    assert.deepEqual(await renamedAfterRestoration.json(), first);
    const reopenedAfterRestart = await completeTask(`${firstTasks}/${firstTask.id}`, false);
    assert.equal(reopenedAfterRestart.status, 200);
    firstTask.completed = false;
    assert.deepEqual(await get(firstTasks), [firstTask, secondTask]);
    first.completed = 0;
    assert.deepEqual(await get('/api/projects'), [existing, first, second]);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.deepEqual(await get('/api/projects'), [existing, first, second]);
    assert.deepEqual(await get(firstTasks), [firstTask, secondTask]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
