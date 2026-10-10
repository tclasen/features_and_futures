import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('projects and tasks: validation, order, ownership, routes, completion, and persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const port = await new Promise((resolve, reject) => {
      let output = '';
      let errors = '';
      const timer = setTimeout(() => reject(new Error('Server startup timed out')), 10000);
      child.stderr.on('data', (chunk) => { errors += chunk; });
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${errors}`)); });
    });
    base = `http://127.0.0.1:${port}`;
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGTERM');
    await exited;
  }
  const create = (name) => fetch(`${base}/api/projects`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
  });
  const createTask = (projectId, title) => fetch(`${base}/api/projects/${projectId}/tasks`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
  });
  const tasks = async (projectId) => (await fetch(`${base}/api/projects/${projectId}/tasks`)).json();
  const complete = (projectId, taskId, completed) => fetch(`${base}/api/projects/${projectId}/tasks/${taskId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed }),
  });
  try {
    await start();
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    for (const name of ['', ' \n\t ']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('<Second & project>')).json();
    assert.notEqual(first.id, second.id);
    const expected = [first, second];
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    for (const path of ['/', `/projects/${first.id}`]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /<script type="module" src="\/app.js"><\/script>/);
    }
    assert.equal((await fetch(`${base}/api/projects/999999`)).status, 404);
    for (const title of ['', ' \n\t ']) {
      const response = await createTask(first.id, title);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await tasks(first.id), []);
    const taskResponse = await createTask(first.id, '  First task  ');
    assert.equal(taskResponse.status, 201);
    const firstTask = await taskResponse.json();
    assert.equal(firstTask.title, 'First task');
    assert.equal(firstTask.completed, false);
    const secondTask = await (await createTask(first.id, '<Second & task>')).json();
    const otherTask = await (await createTask(second.id, 'Other project task')).json();
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
    assert.deepEqual(await tasks(second.id), [otherTask]);
    assert.equal((await createTask(999999, 'Missing project')).status, 404);
    assert.equal((await fetch(`${base}/api/projects/999999/tasks`)).status, 404);
    assert.equal((await complete(second.id, firstTask.id, true)).status, 404);
    assert.equal((await complete(first.id, firstTask.id, 'true')).status, 400);
    const completedResponse = await complete(first.id, firstTask.id, true);
    assert.equal(completedResponse.status, 200);
    firstTask.completed = true;
    assert.deepEqual(await completedResponse.json(), firstTask);
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
    await stop();
    await start();
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${second.id}`)).json(), second);
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
    assert.deepEqual(await tasks(second.id), [otherTask]);
    const reopenedResponse = await complete(first.id, firstTask.id, false);
    assert.equal(reopenedResponse.status, 200);
    firstTask.completed = false;
    assert.deepEqual(await reopenedResponse.json(), firstTask);
    await stop();
    await start();
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
    assert.deepEqual(await tasks(second.id), [otherTask]);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
