import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('projects and tasks are validated, isolated, ordered, and retained after restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  // Start from the prior schema to exercise migration of durable databases.
  await mkdir(join(directory, 'nested'));
  const legacy = new DatabaseSync(join(directory, 'nested', 'projects.sqlite'));
  legacy.exec('CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
  legacy.exec("INSERT INTO projects (name) VALUES ('Existing project')");
  legacy.close();
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'nested', 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Server startup timed out')), 5000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
      child.stdout.on('data', data => {
        output += data;
        const match = output.match(/listening on port (\d+)/);
        if (match) {
          base = `http://127.0.0.1:${match[1]}`;
          clearTimeout(timer);
          resolve();
        }
      });
    });
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = undefined;
  }
  async function create(name) {
    return fetch(`${base}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  }
  async function taskRequest(projectId, method = 'GET', body, taskId) {
    return fetch(`${base}/api/projects/${projectId}/tasks${taskId === undefined ? '' : `/${taskId}`}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  try {
    await start();
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [{ id: 1, name: 'Existing project', archived: 0, total: 0, completed: 0 }]);
    for (const name of ['', '   ', '\t\n']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [{ id: 1, name: 'Existing project', archived: 0, total: 0, completed: 0 }]);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('Second project')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual((await (await fetch(`${base}/api/projects`)).json()).slice(1), [first, second]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    for (const path of ['/', `/projects/${first.id}`, '/app.js', '/styles.css']) {
      assert.equal((await fetch(`${base}${path}`)).status, 200);
    }
    assert.equal((await fetch(`${base}/api/projects/9999`)).status, 404);
    assert.deepEqual(await (await taskRequest(first.id)).json(), []);
    for (const title of ['', '   ', '\t\n']) {
      const response = await taskRequest(first.id, 'POST', { title });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await (await taskRequest(first.id)).json(), []);
    const taskResponse = await taskRequest(first.id, 'POST', { title: '  First task  ' });
    assert.equal(taskResponse.status, 201);
    const firstTask = await taskResponse.json();
    assert.equal(firstTask.title, 'First task');
    assert.equal(firstTask.completed, false);
    const secondTask = await (await taskRequest(first.id, 'POST', { title: 'Second task' })).json();
    const otherTask = await (await taskRequest(second.id, 'POST', { title: 'Other project task' })).json();
    assert.deepEqual(await (await taskRequest(first.id)).json(), [firstTask, secondTask]);
    assert.deepEqual(await (await taskRequest(second.id)).json(), [otherTask]);
    assert.equal((await taskRequest(second.id, 'PATCH', { completed: true }, firstTask.id)).status, 404);
    assert.equal((await taskRequest(9999, 'POST', { title: 'Orphan' })).status, 404);
    assert.equal((await taskRequest(first.id, 'PATCH', { completed: 'false' }, firstTask.id)).status, 400);
    for (const completed of [true, false, true]) {
      const response = await taskRequest(first.id, 'PATCH', { completed }, firstTask.id);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ...firstTask, completed });
    }
    firstTask.completed = true;
    Object.assign(first, { total: 2, completed: 1 });
    Object.assign(second, { total: 1, completed: 0 });
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    async function archive(archived) {
      return fetch(`${base}/api/projects/${first.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived }),
      });
    }
    assert.equal((await archive('yes')).status, 400);
    const archived = await archive(true);
    assert.equal(archived.status, 200);
    first.archived = 1;
    assert.deepEqual(await archived.json(), first);
    assert.equal((await taskRequest(first.id, 'POST', { title: 'Blocked task' })).status, 409);
    assert.equal((await taskRequest(first.id, 'PATCH', { completed: false }, firstTask.id)).status, 409);
    assert.deepEqual(await (await taskRequest(first.id)).json(), [firstTask, secondTask]);
    await stop();
    await start();
    assert.deepEqual((await (await fetch(`${base}/api/projects`)).json()).slice(1), [first, second]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    assert.deepEqual(await (await taskRequest(first.id)).json(), [firstTask, secondTask]);
    assert.deepEqual(await (await taskRequest(second.id)).json(), [otherTask]);
    assert.equal((await fetch(`${base}/projects/${first.id}`)).status, 200);
    const restored = await archive(false);
    first.archived = 0;
    assert.deepEqual(await restored.json(), first);
    await stop();
    await start();
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    assert.deepEqual(await (await taskRequest(first.id)).json(), [firstTask, secondTask]);
    const thirdTask = await (await taskRequest(first.id, 'POST', { title: 'Third task' })).json();
    assert.ok(thirdTask.id > otherTask.id);
    assert.equal(thirdTask.completed, false);
    const third = await (await create('Third project')).json();
    assert.ok(third.id > second.id);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
