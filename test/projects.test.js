import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', () => { clearTimeout(timeout); reject(new Error(errors)); });
    child.stdout.on('data', (chunk) => {
      const match = chunk.toString().match(/listening on port (\d+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects and owned tasks validate, preserve order, and survive a server-process restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const dbPath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const create = (name) => fetch(`${server.url}/api/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    for (const name of ['', '  \t\n', null, 42]) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await fetch(`${server.url}/api/projects`)).json(), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('<Second project>')).json();
    assert.notEqual(first.id, second.id);
    const expected = [first, second];
    assert.deepEqual(await (await fetch(`${server.url}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${server.url}/api/projects/${first.id}`)).json(), first);
    for (const path of ['/', `/projects/${first.id}`]) {
      const response = await fetch(`${server.url}${path}`);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /<title>Workboard<\/title>/);
    }
    assert.equal((await fetch(`${server.url}/api/projects/999999`)).status, 404);
    const malformed = await fetch(`${server.url}/api/projects`, { method: 'POST', body: '{' });
    assert.equal(malformed.status, 400);
    const tasksPath = `/api/projects/${first.id}/tasks`;
    const otherTasksPath = `/api/projects/${second.id}/tasks`;
    const send = (path, method, body) => fetch(`${server.url}${path}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const list = async (path) => (await fetch(`${server.url}${path}`)).json();
    for (const title of ['', '  \t\n', null, 42]) {
      const response = await send(tasksPath, 'POST', { title });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await list(tasksPath), []);
    const taskResponse = await send(tasksPath, 'POST', { title: '  First task  ' });
    assert.equal(taskResponse.status, 201);
    const task = await taskResponse.json();
    assert.equal(task.title, 'First task');
    assert.equal(task.completed, false);
    const nextTask = await (await send(tasksPath, 'POST', { title: '<Next task>' })).json();
    const otherTask = await (await send(otherTasksPath, 'POST', { title: 'Other project task' })).json();
    assert.deepEqual(await list(tasksPath), [task, nextTask]);
    assert.deepEqual(await list(otherTasksPath), [otherTask]);
    assert.equal((await send(`${otherTasksPath}/${task.id}`, 'PATCH', { completed: true })).status, 404);
    assert.equal((await send('/api/projects/999999/tasks', 'POST', { title: 'Missing project' })).status, 404);
    for (const completed of ['true', 1, null]) {
      assert.equal((await send(`${tasksPath}/${task.id}`, 'PATCH', { completed })).status, 400);
    }
    assert.deepEqual(await list(tasksPath), [task, nextTask]);
    const completedResponse = await send(`${tasksPath}/${task.id}`, 'PATCH', { completed: true });
    assert.equal(completedResponse.status, 200);
    const completedTask = { ...task, completed: true };
    assert.deepEqual(await completedResponse.json(), completedTask);
    assert.deepEqual(await list(tasksPath), [completedTask, nextTask]);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.deepEqual(await (await fetch(`${server.url}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${server.url}/api/projects/${first.id}`)).json(), first);
    assert.deepEqual(await list(tasksPath), [completedTask, nextTask]);
    assert.deepEqual(await list(otherTasksPath), [otherTask]);
    const reopened = await send(`${tasksPath}/${task.id}`, 'PATCH', { completed: false });
    assert.equal(reopened.status, 200);
    assert.deepEqual(await reopened.json(), task);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.deepEqual(await list(tasksPath), [task, nextTask]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
