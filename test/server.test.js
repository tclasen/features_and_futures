import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

test('projects, tasks, archive state, and summaries persist across server restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  let output = '';

  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(`Server exited: ${output}`);
      try {
        const response = await fetch(`${base}/health`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'ok' });
        return;
      } catch {
        await delay(20);
      }
    }
    throw new Error(`Server did not start: ${output}`);
  }

  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = null;
  }

  async function create(name) {
    return fetch(`${base}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  }

  async function createTask(projectId, title) {
    return fetch(`${base}/api/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
  }

  async function setCompleted(projectId, taskId, completed) {
    return fetch(`${base}/api/projects/${projectId}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed }),
    });
  }

  async function listTasks(projectId) {
    const response = await fetch(`${base}/api/projects/${projectId}/tasks`);
    assert.equal(response.status, 200);
    return response.json();
  }

  async function setArchived(projectId, archived) {
    return fetch(`${base}/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived }),
    });
  }

  async function getProject(projectId) {
    return (await fetch(`${base}/api/projects/${projectId}`)).json();
  }

  try {
    await start();
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), []);
    for (const name of ['', ' \t\n ', null, 123]) {
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
    const second = await (await create('<script> & second')).json();
    assert.notEqual(first.id, second.id);
    const expected = [first, second];
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    assert.equal((await fetch(`${base}/api/projects/999999`)).status, 404);
    for (const path of ['/', `/projects/${first.id}`]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /<script type="module" src="\/app.js">/);
    }
    assert.equal((await fetch(`${base}/app.js`)).status, 200);
    assert.equal((await fetch(`${base}/style.css`)).status, 200);
    const malformed = await fetch(`${base}/api/projects`, { method: 'POST', body: '{' });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await listTasks(first.id), []);
    for (const title of ['', ' \t\n ', null, 123]) {
      const response = await createTask(first.id, title);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await listTasks(first.id), []);
    const firstTaskResponse = await createTask(first.id, '  First task  ');
    assert.equal(firstTaskResponse.status, 201);
    const firstTask = await firstTaskResponse.json();
    assert.equal(firstTask.title, 'First task');
    assert.equal(firstTask.completed, false);
    const secondTask = await (await createTask(first.id, '<script> & second task')).json();
    assert.notEqual(firstTask.id, secondTask.id);
    assert.deepEqual(await listTasks(first.id), [firstTask, secondTask]);
    assert.deepEqual(await listTasks(second.id), []);
    const otherTask = await (await createTask(second.id, 'Other project task')).json();
    assert.equal((await setCompleted(second.id, firstTask.id, true)).status, 404);
    assert.equal((await setCompleted(first.id, 999999, true)).status, 404);
    assert.equal((await createTask(999999, 'Missing project')).status, 404);
    assert.equal((await fetch(`${base}/api/projects/999999/tasks`)).status, 404);
    for (const completed of [null, 1, 'true']) {
      assert.equal((await setCompleted(first.id, firstTask.id, completed)).status, 400);
    }
    assert.deepEqual(await listTasks(first.id), [firstTask, secondTask]);
    const completedResponse = await setCompleted(first.id, firstTask.id, true);
    assert.equal(completedResponse.status, 200);
    const completedTask = { ...firstTask, completed: true };
    assert.deepEqual(await completedResponse.json(), completedTask);
    assert.deepEqual(await listTasks(first.id), [completedTask, secondTask]);
    const firstWithTasks = { ...first, total_count: 2, completed_count: 1 };
    const secondWithTasks = { ...second, total_count: 1 };
    assert.deepEqual(await getProject(first.id), firstWithTasks);
    for (const archived of [null, 1, 'true']) {
      assert.equal((await setArchived(first.id, archived)).status, 400);
    }
    assert.equal((await setArchived(999999, true)).status, 404);
    assert.deepEqual(await (await setArchived(first.id, true)).json(), { ...firstWithTasks, archived: true });
    assert.equal((await createTask(first.id, 'Blocked task')).status, 409);
    assert.equal((await setCompleted(first.id, firstTask.id, false)).status, 409);
    assert.deepEqual(await listTasks(first.id), [completedTask, secondTask]);
    await stop();
    await start();
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [{ ...firstWithTasks, archived: true }, secondWithTasks]);
    assert.deepEqual(await getProject(first.id), { ...firstWithTasks, archived: true });
    assert.deepEqual(await listTasks(first.id), [completedTask, secondTask]);
    assert.deepEqual(await listTasks(second.id), [otherTask]);
    assert.equal((await fetch(`${base}/projects/${first.id}`)).status, 200);
    assert.deepEqual(await (await setArchived(first.id, false)).json(), firstWithTasks);
    assert.deepEqual(await (await setCompleted(first.id, firstTask.id, false)).json(), firstTask);
    await stop();
    await start();
    assert.deepEqual(await getProject(first.id), { ...firstWithTasks, completed_count: 0 });
    assert.deepEqual(await listTasks(first.id), [firstTask, secondTask]);
    const thirdTask = await (await createTask(first.id, 'Third task')).json();
    assert.ok(thirdTask.id > otherTask.id);
    assert.deepEqual(await listTasks(first.id), [firstTask, secondTask, thirdTask]);
    const third = await (await create('Third')).json();
    assert.ok(third.id > second.id);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
