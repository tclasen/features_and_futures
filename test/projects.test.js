import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { DatabaseSync } from 'node:sqlite';

async function availablePort() {
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}

test('projects and tasks validate, rename, remain isolated and persist through restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const port = await availablePort();
  const base = `http://127.0.0.1:${port}`;
  let child;
  let output = '';
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'nested', 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(`Server exited: ${output}`);
      try {
        const health = await fetch(`${base}/health`);
        assert.equal(health.status, 200);
        assert.deepEqual(await health.json(), { status: 'ok' });
        return;
      } catch {
        await delay(25);
      }
    }
    throw new Error(`Server did not become healthy: ${output}`);
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGTERM');
    await exited;
  }
  async function create(name) {
    return fetch(`${base}/api/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  }
  try {
    await start();
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), []);
    for (const name of ['', ' \t\n ', null]) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, 'Project name is required');
    }
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    assert.equal(first.archived, false);
    assert.equal(first.totalCount, 0);
    assert.equal(first.completedCount, 0);
    const second = await (await create('<Second> & project')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [first, second]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    for (const path of ['/', `/projects/${first.id}`, '/app.js', '/style.css']) {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, 200);
      assert.ok((await response.text()).length > 0);
    }
    assert.equal((await fetch(`${base}/api/projects/999999`)).status, 404);
    const tasksPath = `/api/projects/${first.id}/tasks`;
    async function createTask(title, path = tasksPath) {
      return fetch(`${base}${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
    }
    async function completeTask(taskId, completed, projectId = first.id) {
      return fetch(`${base}/api/projects/${projectId}/tasks/${taskId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed }),
      });
    }
    for (const title of ['', ' \t\n ', null]) {
      const response = await createTask(title);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, 'Task title is required');
    }
    assert.deepEqual(await (await fetch(`${base}${tasksPath}`)).json(), []);
    const taskResponse = await createTask('  First task  ');
    assert.equal(taskResponse.status, 201);
    const firstTask = await taskResponse.json();
    assert.equal(firstTask.title, 'First task');
    assert.equal(firstTask.completed, false);
    const secondTask = await (await createTask('<Second> & task')).json();
    const otherTask = await (await createTask('Other project task', `/api/projects/${second.id}/tasks`)).json();
    assert.deepEqual(await (await fetch(`${base}${tasksPath}`)).json(), [firstTask, secondTask]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${second.id}/tasks`)).json(), [otherTask]);
    assert.equal((await completeTask(firstTask.id, true, second.id)).status, 404);
    assert.equal((await completeTask(firstTask.id, 'true')).status, 400);
    assert.equal((await completeTask(firstTask.id, true)).status, 200);
    assert.equal((await completeTask(firstTask.id, false)).status, 200);
    assert.equal((await completeTask(firstTask.id, true)).status, 200);
    firstTask.completed = true;
    first.totalCount = 2;
    first.completedCount = 1;
    second.totalCount = 1;
    assert.deepEqual(await (await fetch(`${base}${tasksPath}`)).json(), [firstTask, secondTask]);
    async function renameProject(name) {
      return fetch(`${base}/api/projects/${first.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
    }
    for (const name of ['', ' \t\n ', null]) {
      const response = await renameProject(name);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, 'Project name is required');
      assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    }
    const renamed = await renameProject('  Renamed <project> & work  ');
    assert.equal(renamed.status, 200);
    first.name = 'Renamed <project> & work';
    assert.deepEqual(await renamed.json(), first);
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [first, second]);
    assert.deepEqual(await (await fetch(`${base}${tasksPath}`)).json(), [firstTask, secondTask]);
    assert.equal((await createTask('Missing project', '/api/projects/999999/tasks')).status, 404);
    assert.equal((await fetch(`${base}/api/projects/999999/tasks`)).status, 404);
    async function archiveProject(archived) {
      return fetch(`${base}/api/projects/${first.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived }),
      });
    }
    assert.equal((await archiveProject('true')).status, 400);
    assert.equal((await archiveProject(true)).status, 200);
    first.archived = true;
    const blockedRename = await renameProject('Blocked rename');
    assert.equal(blockedRename.status, 409);
    assert.equal((await blockedRename.json()).error, 'Archived project');
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [first, second]);
    assert.equal((await createTask('Blocked task')).status, 409);
    assert.equal((await completeTask(firstTask.id, false)).status, 409);
    assert.deepEqual(await (await fetch(`${base}${tasksPath}`)).json(), [firstTask, secondTask]);
    await stop();
    await start();
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [first, second]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    assert.deepEqual(await (await fetch(`${base}${tasksPath}`)).json(), [firstTask, secondTask]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${second.id}/tasks`)).json(), [otherTask]);
    assert.equal((await fetch(`${base}/projects/${first.id}`)).status, 200);
    assert.equal((await archiveProject(false)).status, 200);
    first.archived = false;
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    const restoredRename = await renameProject('  Restored project  ');
    assert.equal(restoredRename.status, 200);
    first.name = 'Restored project';
    assert.deepEqual(await restoredRename.json(), first);
    assert.equal((await completeTask(firstTask.id, false)).status, 200);
    firstTask.completed = false;
    first.completedCount = 0;
    await stop();
    await start();
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [first, second]);
    assert.deepEqual(await (await fetch(`${base}${tasksPath}`)).json(), [firstTask, secondTask]);
    const thirdTask = await (await createTask('Third task')).json();
    assert.ok(thirdTask.id > otherTask.id);
    const third = await (await create('Third project')).json();
    assert.ok(third.id > second.id);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('migrates an existing database without changing project IDs or tasks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-migration-'));
  const databasePath = join(directory, 'legacy.sqlite');
  const db = new DatabaseSync(databasePath);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)));
    INSERT INTO projects (id, name) VALUES (42, 'Existing project');
    INSERT INTO tasks (id, project_id, title, completed) VALUES (51, 42, 'Existing task', 1);`);
  db.close();
  const port = await availablePort();
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(port), DB_PATH: databasePath }, stdio: 'ignore',
  });
  try {
    let response;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error('Server exited during migration');
      try {
        response = await fetch(`http://127.0.0.1:${port}/api/projects/42`);
        break;
      } catch { await delay(25); }
    }
    assert.ok(response, 'Server became ready');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      id: 42, name: 'Existing project', archived: false, totalCount: 1, completedCount: 1,
    });
    const tasks = await fetch(`http://127.0.0.1:${port}/api/projects/42/tasks`);
    assert.deepEqual(await tasks.json(), [{ id: 51, title: 'Existing task', completed: true }]);
  } finally {
    if (child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill('SIGTERM');
      await exited;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
