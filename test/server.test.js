import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';

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
    const savedTasks = [{ ...task, completed: true }, nextTask];
    await stop();
    await start();
    assert.deepEqual(await (await fetch(`${base}${taskPath}`)).json(), savedTasks);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${second.id}/tasks`)).json(), []);
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
