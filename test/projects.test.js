import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('projects and tasks validate, stay ordered and isolated, archive and restore, and persist across restarts', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(join(process.cwd(), 'data', 'test-'));
  // Start from the previous checkpoint's schema to exercise the archive migration.
  const legacy = new DatabaseSync(join(directory, 'projects.sqlite'));
  legacy.exec('CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
  legacy.close();
  const reservation = createServer();
  reservation.listen(0, '0.0.0.0');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  let output = '';
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(output);
      try {
        const response = await fetch(`${base}/health`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'ok' });
        return;
      } catch {
        await delay(25);
      }
    }
    throw new Error(`Server did not become healthy: ${output}`);
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
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  }
  try {
    await start();
    for (const name of ['', ' \t\n ']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    assert.equal(first.archived, false);
    assert.equal(first.total_count, 0);
    assert.equal(first.completed_count, 0);
    const second = await (await create('Second project')).json();
    assert.notEqual(first.id, second.id);
    const expected = [first, second];
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), expected);
    const taskPath = `/api/projects/${first.id}/tasks`;
    async function taskRequest(path, method, input) {
      return fetch(base + path, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
    }
    for (const title of ['', ' \t\n ']) {
      const response = await taskRequest(taskPath, 'POST', { title });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await (await fetch(base + taskPath)).json(), []);
    const taskResponse = await taskRequest(taskPath, 'POST', { title: '  First task  ' });
    assert.equal(taskResponse.status, 201);
    let firstTask = await taskResponse.json();
    assert.equal(firstTask.title, 'First task');
    assert.equal(firstTask.completed, false);
    assert.equal(firstTask.priority, 'Normal');
    assert.equal(firstTask.project_id, first.id);
    let secondTask = await (await taskRequest(taskPath, 'POST', { title: 'Second task' })).json();
    const otherTaskPath = `/api/projects/${second.id}/tasks`;
    assert.ok(secondTask.id > firstTask.id);
    assert.equal(secondTask.priority, 'Normal');
    for (const priority of ['', 'Urgent', null, 1]) {
      assert.equal((await taskRequest(`${taskPath}/${firstTask.id}`, 'PATCH', { priority })).status, 400);
    }
    assert.equal((await taskRequest(`${otherTaskPath}/${firstTask.id}`, 'PATCH', { priority: 'High' })).status, 404);
    for (const priority of ['Low', 'Normal', 'High']) {
      const response = await taskRequest(`${taskPath}/${firstTask.id}`, 'PATCH', { priority });
      assert.equal(response.status, 200);
      firstTask = { ...firstTask, priority };
      assert.deepEqual(await response.json(), firstTask);
      assert.deepEqual(await (await fetch(base + taskPath)).json(), [firstTask, secondTask]);
    }
    assert.deepEqual(await (await fetch(base + taskPath)).json(), [firstTask, secondTask]);
    assert.deepEqual(await (await fetch(base + otherTaskPath)).json(), []);
    assert.equal((await taskRequest(`${otherTaskPath}/${firstTask.id}`, 'PATCH', { completed: true })).status, 404);
    assert.equal((await taskRequest(`${taskPath}/${firstTask.id}`, 'PATCH', { completed: 'yes' })).status, 400);
    const completedResponse = await taskRequest(`${taskPath}/${firstTask.id}`, 'PATCH', { completed: true });
    assert.equal(completedResponse.status, 200);
    let completedTask = await completedResponse.json();
    assert.deepEqual(completedTask, { ...firstTask, completed: true });
    for (const title of ['', ' \t\n ', null]) {
      const response = await taskRequest(`${taskPath}/${firstTask.id}`, 'PATCH', { title });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
      assert.deepEqual(await (await fetch(base + taskPath)).json(), [completedTask, secondTask]);
    }
    assert.equal((await taskRequest(`${otherTaskPath}/${firstTask.id}`, 'PATCH', { title: 'Wrong project' })).status, 404);
    const renamedTask = await taskRequest(`${taskPath}/${firstTask.id}`, 'PATCH', { title: '  Renamed completed task  ' });
    assert.equal(renamedTask.status, 200);
    completedTask = { ...completedTask, title: 'Renamed completed task' };
    firstTask = { ...firstTask, title: completedTask.title };
    assert.deepEqual(await renamedTask.json(), completedTask);
    assert.deepEqual(await (await fetch(base + taskPath)).json(), [completedTask, secondTask]);
    let firstWithTasks = { ...first, total_count: 2, completed_count: 1 };
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), firstWithTasks);
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [firstWithTasks, second]);
    for (const name of ['', ' \t\n ', null]) {
      const response = await taskRequest(`/api/projects/${first.id}`, 'PATCH', { name });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
      assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), firstWithTasks);
    }
    const renamed = await taskRequest(`/api/projects/${first.id}`, 'PATCH', { name: '  Renamed project  ' });
    assert.equal(renamed.status, 200);
    firstWithTasks = { ...firstWithTasks, name: 'Renamed project' };
    assert.deepEqual(await renamed.json(), firstWithTasks);
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [firstWithTasks, second]);
    assert.deepEqual(await (await fetch(base + taskPath)).json(), [completedTask, secondTask]);
    assert.equal((await taskRequest(`/api/projects/${first.id}`, 'PATCH', { archived: 'yes' })).status, 400);
    assert.equal((await taskRequest('/api/projects/999999', 'PATCH', { archived: true })).status, 404);
    const archiveResponse = await taskRequest(`/api/projects/${first.id}`, 'PATCH', { archived: true });
    assert.equal(archiveResponse.status, 200);
    const archived = { ...firstWithTasks, archived: true };
    assert.deepEqual(await archiveResponse.json(), archived);
    const blockedRename = await taskRequest(`/api/projects/${first.id}`, 'PATCH', { name: 'Blocked rename' });
    assert.equal(blockedRename.status, 409);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), archived);
    assert.equal((await taskRequest(taskPath, 'POST', { title: 'Blocked' })).status, 409);
    assert.equal((await taskRequest(`${taskPath}/${firstTask.id}`, 'PATCH', { completed: false })).status, 409);
    assert.equal((await taskRequest(`${taskPath}/${firstTask.id}`, 'PATCH', { title: 'Blocked rename' })).status, 409);
    assert.equal((await taskRequest(`${taskPath}/${firstTask.id}`, 'PATCH', { priority: 'Low' })).status, 409);
    assert.deepEqual(await (await fetch(base + taskPath)).json(), [completedTask, secondTask]);
    assert.equal((await taskRequest('/api/projects/999999/tasks', 'POST', { title: 'Orphan' })).status, 404);
    for (const path of ['/', `/projects/${first.id}`]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /text\/html/);
      assert.match(await response.text(), /\/app\.js/);
    }
    await stop();
    await start();
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [archived, second]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), archived);
    assert.deepEqual(await (await fetch(base + taskPath)).json(), [completedTask, secondTask]);
    assert.deepEqual(await (await fetch(base + otherTaskPath)).json(), []);
    const restored = await taskRequest(`/api/projects/${first.id}`, 'PATCH', { archived: false });
    assert.equal(restored.status, 200);
    assert.deepEqual(await restored.json(), firstWithTasks);
    const priorityAfterRestore = await taskRequest(`${taskPath}/${secondTask.id}`, 'PATCH', { priority: 'Low' });
    assert.equal(priorityAfterRestore.status, 200);
    secondTask = { ...secondTask, priority: 'Low' };
    assert.deepEqual(await priorityAfterRestore.json(), secondTask);
    const taskRenameAfterRestore = await taskRequest(`${taskPath}/${secondTask.id}`, 'PATCH', { title: '  Renamed open task  ' });
    assert.equal(taskRenameAfterRestore.status, 200);
    secondTask = { ...secondTask, title: 'Renamed open task' };
    assert.deepEqual(await taskRenameAfterRestore.json(), secondTask);
    const renameAfterRestore = await taskRequest(`/api/projects/${first.id}`, 'PATCH', { name: '  Restored and renamed  ' });
    assert.equal(renameAfterRestore.status, 200);
    firstWithTasks = { ...firstWithTasks, name: 'Restored and renamed' };
    assert.deepEqual(await renameAfterRestore.json(), firstWithTasks);
    await stop();
    await start();
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [firstWithTasks, second]);
    assert.deepEqual(await (await fetch(base + taskPath)).json(), [completedTask, secondTask]);
    const reopened = await taskRequest(`${taskPath}/${firstTask.id}`, 'PATCH', { completed: false });
    assert.equal(reopened.status, 200);
    assert.deepEqual(await reopened.json(), firstTask);
    await stop();
    await start();
    assert.deepEqual(await (await fetch(base + taskPath)).json(), [firstTask, secondTask]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), {
      ...firstWithTasks, completed_count: 0,
    });
    const third = await (await create('Third')).json();
    assert.ok(third.id > second.id);
    assert.equal((await fetch(`${base}/api/projects/999999`)).status, 404);
    await stop();
    await rm(join(directory, 'projects.sqlite'));
    const populatedLegacy = new DatabaseSync(join(directory, 'projects.sqlite'));
    populatedLegacy.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)));
      INSERT INTO projects (id, name) VALUES (7, 'Existing project');
      INSERT INTO tasks (id, project_id, title, completed) VALUES (9, 7, 'Existing task', 1);
    `);
    populatedLegacy.close();
    await start();
    const migratedProject = { id: 7, name: 'Existing project', archived: false, total_count: 1, completed_count: 1 };
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [migratedProject]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/7/tasks`)).json(), [
      { id: 9, project_id: 7, title: 'Existing task', completed: true, priority: 'Normal' },
    ]);
    await stop();
    await start();
    assert.deepEqual(await (await fetch(`${base}/api/projects/7`)).json(), migratedProject);
    assert.deepEqual(await (await fetch(`${base}/api/projects/7/tasks`)).json(), [
      { id: 9, project_id: 7, title: 'Existing task', completed: true, priority: 'Normal' },
    ]);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
