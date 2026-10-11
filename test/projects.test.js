import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('projects and tasks: validation, ownership, completion, rename, archive, summaries, and restart persistence', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data/test-'));
  // Start with the previous schema to exercise the archive-column migration.
  const legacy = new DatabaseSync(`${directory}/projects.sqlite`);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)));`);
  legacy.close();
  let child;
  let origin;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: `${directory}/projects.sqlite` },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise((resolveReady, reject) => {
      let output = '';
      const timeout = setTimeout(() => reject(new Error('Server startup timed out')), 5000);
      child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited: ${code}`)); });
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) { origin = `http://127.0.0.1:${match[1]}`; clearTimeout(timeout); resolveReady(); }
      });
    });
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = new Promise(resolveExit => child.once('exit', resolveExit));
      child.kill('SIGTERM');
      await exited;
    }
  }
  const get = path => fetch(`${origin}${path}`);
  const create = name => fetch(`${origin}/api/projects`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
  });
  const createTask = (projectId, title) => fetch(`${origin}/api/projects/${projectId}/tasks`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
  });
  const completeTask = (projectId, taskId, completed) => fetch(`${origin}/api/projects/${projectId}/tasks/${taskId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed }),
  });
  const renameTask = (projectId, taskId, title) => fetch(`${origin}/api/projects/${projectId}/tasks/${taskId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
  });
  const tasks = async projectId => (await get(`/api/projects/${projectId}/tasks`)).json();
  const archiveProject = (projectId, archived) => fetch(`${origin}/api/projects/${projectId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived }),
  });
  const renameProject = (projectId, name) => fetch(`${origin}/api/projects/${projectId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
  });
  try {
    await start();
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.deepEqual(await (await get('/api/projects')).json(), []);
    for (const name of ['', ' \t\n ', null]) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      assert.deepEqual(await invalid.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await get('/api/projects')).json(), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    assert.equal(first.archived, 0);
    assert.equal(first.completed, 0);
    assert.equal(first.total, 0);
    const second = await (await create('Second project')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await (await get('/api/projects')).json(), [first, second]);
    assert.deepEqual(await (await get(`/api/projects/${first.id}`)).json(), first);
    for (const path of ['/', `/projects/${first.id}`, '/app.js', '/style.css']) {
      assert.equal((await get(path)).status, 200);
    }
    assert.equal((await get('/api/projects/999999')).status, 404);
    assert.deepEqual(await tasks(first.id), []);
    for (const title of ['', ' \t\n ', null]) {
      const invalid = await createTask(first.id, title);
      assert.equal(invalid.status, 400);
      assert.deepEqual(await invalid.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await tasks(first.id), []);
    const taskResponse = await createTask(first.id, '  First task  ');
    assert.equal(taskResponse.status, 201);
    let firstTask = await taskResponse.json();
    assert.equal(firstTask.title, 'First task');
    assert.equal(firstTask.completed, false);
    const secondTask = await (await createTask(first.id, 'Second task')).json();
    assert.ok(secondTask.id > firstTask.id);
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
    assert.deepEqual(await tasks(second.id), []);
    const otherTask = await (await createTask(second.id, 'Other project task')).json();
    assert.deepEqual(await tasks(second.id), [otherTask]);
    assert.equal((await completeTask(second.id, firstTask.id, true)).status, 404);
    assert.equal((await completeTask(first.id, firstTask.id, 'true')).status, 400);
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
    assert.equal((await createTask(999999, 'Missing project')).status, 404);
    assert.equal((await get('/api/projects/999999/tasks')).status, 404);
    const completedResponse = await completeTask(first.id, firstTask.id, true);
    assert.equal(completedResponse.status, 200);
    firstTask = await completedResponse.json();
    assert.equal(firstTask.completed, true);
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
    Object.assign(first, { total: 2, completed: 1 });
    Object.assign(second, { total: 1 });
    assert.deepEqual(await (await get('/api/projects')).json(), [first, second]);
    for (const title of ['', ' \t\n ', null, 123]) {
      const invalid = await renameTask(first.id, firstTask.id, title);
      assert.equal(invalid.status, 400);
      assert.deepEqual(await invalid.json(), { error: 'Task title is required' });
      assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
    }
    assert.equal((await renameTask(second.id, firstTask.id, 'Wrong project')).status, 404);
    assert.equal((await renameTask(first.id, 999999, 'Missing task')).status, 404);
    assert.equal((await renameTask(999999, firstTask.id, 'Missing project')).status, 404);
    const renamedTaskResponse = await renameTask(first.id, firstTask.id, '  Renamed completed task  ');
    assert.equal(renamedTaskResponse.status, 200);
    firstTask.title = 'Renamed completed task';
    assert.deepEqual(await renamedTaskResponse.json(), firstTask);
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
    assert.deepEqual(await tasks(second.id), [otherTask]);
    assert.deepEqual(await (await get('/api/projects')).json(), [first, second]);
    for (const name of ['', ' \t\n ', null]) {
      const invalid = await renameProject(first.id, name);
      assert.equal(invalid.status, 400);
      assert.deepEqual(await invalid.json(), { error: 'Project name is required' });
      assert.deepEqual(await (await get(`/api/projects/${first.id}`)).json(), first);
    }
    assert.equal((await renameProject(999999, 'Missing project')).status, 404);
    const renamedResponse = await renameProject(first.id, '  Renamed project  ');
    assert.equal(renamedResponse.status, 200);
    first.name = 'Renamed project';
    assert.deepEqual(await renamedResponse.json(), first);
    assert.deepEqual(await (await get('/api/projects')).json(), [first, second]);
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
    await stop();
    await start();
    assert.deepEqual(await (await get(`/api/projects/${first.id}`)).json(), first);
    assert.deepEqual(await (await get('/api/projects')).json(), [first, second]);
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
    assert.equal((await archiveProject(first.id, 'true')).status, 400);
    assert.equal((await archiveProject(999999, true)).status, 404);
    const archivedResponse = await archiveProject(first.id, true);
    assert.equal(archivedResponse.status, 200);
    first.archived = 1;
    assert.deepEqual(await archivedResponse.json(), first);
    assert.equal((await renameProject(first.id, 'Blocked rename')).status, 409);
    assert.deepEqual(await (await get(`/api/projects/${first.id}`)).json(), first);
    assert.equal((await createTask(first.id, 'Blocked task')).status, 409);
    assert.equal((await completeTask(first.id, firstTask.id, false)).status, 409);
    assert.equal((await renameTask(first.id, firstTask.id, 'Blocked task rename')).status, 409);
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
    await stop();
    await start();
    assert.deepEqual(await (await get('/api/projects')).json(), [first, second]);
    assert.deepEqual(await (await get(`/api/projects/${second.id}`)).json(), second);
    assert.equal((await get(`/projects/${first.id}`)).status, 200);
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
    assert.deepEqual(await tasks(second.id), [otherTask]);
    assert.equal((await createTask(first.id, 'Still blocked after restart')).status, 409);
    assert.equal((await renameProject(first.id, 'Still blocked rename')).status, 409);
    assert.equal((await renameTask(first.id, firstTask.id, 'Still blocked task rename')).status, 409);
    const restoredResponse = await archiveProject(first.id, false);
    assert.equal(restoredResponse.status, 200);
    first.archived = 0;
    assert.deepEqual(await restoredResponse.json(), first);
    const restoredRename = await renameProject(first.id, '  Restored project  ');
    assert.equal(restoredRename.status, 200);
    first.name = 'Restored project';
    assert.deepEqual(await restoredRename.json(), first);
    const restoredTaskRename = await renameTask(first.id, firstTask.id, '  Restored task  ');
    assert.equal(restoredTaskRename.status, 200);
    firstTask.title = 'Restored task';
    assert.deepEqual(await restoredTaskRename.json(), firstTask);
    const openTaskRename = await renameTask(first.id, secondTask.id, '  Renamed open task  ');
    assert.equal(openTaskRename.status, 200);
    secondTask.title = 'Renamed open task';
    assert.deepEqual(await openTaskRename.json(), secondTask);
    assert.deepEqual(await (await get('/api/projects')).json(), [first, second]);
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
    const reopenedResponse = await completeTask(first.id, firstTask.id, false);
    assert.equal(reopenedResponse.status, 200);
    firstTask = await reopenedResponse.json();
    assert.equal(firstTask.completed, false);
    first.completed = 0;
    await stop();
    await start();
    assert.deepEqual(await (await get('/api/projects')).json(), [first, second]);
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
    const thirdTask = await (await createTask(first.id, 'Third task')).json();
    assert.ok(thirdTask.id > otherTask.id);
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask, thirdTask]);
    const third = await (await create('Third project')).json();
    assert.ok(third.id > second.id);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('migration preserves existing project IDs, tasks, and completion state', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data/migration-'));
  const dbPath = `${directory}/legacy.sqlite`;
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)));
    INSERT INTO projects VALUES (42, 'Existing project');
    INSERT INTO tasks VALUES (71, 42, 'Existing completed task', 1);
    INSERT INTO tasks VALUES (72, 42, 'Existing open task', 0);`);
  legacy.close();
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    const origin = await new Promise((resolveReady, reject) => {
      let output = '';
      const timeout = setTimeout(() => reject(new Error('Server startup timed out')), 5000);
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited: ${code}`)); });
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) { clearTimeout(timeout); resolveReady(`http://127.0.0.1:${match[1]}`); }
      });
    });
    assert.deepEqual(await (await fetch(`${origin}/api/projects`)).json(), [
      { id: 42, name: 'Existing project', archived: 0, total: 2, completed: 1 },
    ]);
    assert.deepEqual(await (await fetch(`${origin}/api/projects/42/tasks`)).json(), [
      { id: 71, title: 'Existing completed task', completed: true },
      { id: 72, title: 'Existing open task', completed: false },
    ]);
  } finally {
    if (child.exitCode === null) {
      const exited = new Promise(resolveExit => child.once('exit', resolveExit));
      child.kill('SIGTERM');
      await exited;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
