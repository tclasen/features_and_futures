import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { join } from 'node:path';

test('projects and tasks validate, stay ordered and isolated, and persist across restarts', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(join(process.cwd(), 'data', 'test-'));
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
    const firstTask = await taskResponse.json();
    assert.equal(firstTask.title, 'First task');
    assert.equal(firstTask.completed, false);
    assert.equal(firstTask.project_id, first.id);
    const secondTask = await (await taskRequest(taskPath, 'POST', { title: 'Second task' })).json();
    assert.ok(secondTask.id > firstTask.id);
    assert.deepEqual(await (await fetch(base + taskPath)).json(), [firstTask, secondTask]);
    const otherTaskPath = `/api/projects/${second.id}/tasks`;
    assert.deepEqual(await (await fetch(base + otherTaskPath)).json(), []);
    assert.equal((await taskRequest(`${otherTaskPath}/${firstTask.id}`, 'PATCH', { completed: true })).status, 404);
    assert.equal((await taskRequest(`${taskPath}/${firstTask.id}`, 'PATCH', { completed: 'yes' })).status, 400);
    const completedResponse = await taskRequest(`${taskPath}/${firstTask.id}`, 'PATCH', { completed: true });
    assert.equal(completedResponse.status, 200);
    const completedTask = await completedResponse.json();
    assert.deepEqual(completedTask, { ...firstTask, completed: true });
    assert.equal((await taskRequest('/api/projects/999999/tasks', 'POST', { title: 'Orphan' })).status, 404);
    for (const path of ['/', `/projects/${first.id}`]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /text\/html/);
      assert.match(await response.text(), /\/app\.js/);
    }
    await stop();
    await start();
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    assert.deepEqual(await (await fetch(base + taskPath)).json(), [completedTask, secondTask]);
    assert.deepEqual(await (await fetch(base + otherTaskPath)).json(), []);
    const reopened = await taskRequest(`${taskPath}/${firstTask.id}`, 'PATCH', { completed: false });
    assert.equal(reopened.status, 200);
    assert.deepEqual(await reopened.json(), firstTask);
    await stop();
    await start();
    assert.deepEqual(await (await fetch(base + taskPath)).json(), [firstTask, secondTask]);
    const third = await (await create('Third')).json();
    assert.ok(third.id > second.id);
    assert.equal((await fetch(`${base}/api/projects/999999`)).status, 404);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
