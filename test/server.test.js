import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';

async function availablePort() {
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

async function start(port, databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(port), DB_PATH: databasePath },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(errors);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return child;
    } catch { /* Wait until the listener is ready. */ }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  child.kill();
  throw new Error(`Server did not start: ${errors}`);
}

async function stop(child) {
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await exited;
}

test('projects and owned tasks validate, preserve order and state, and persist through restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  const port = await availablePort();
  const base = `http://127.0.0.1:${port}`;
  let child;
  const post = (body) => fetch(`${base}/api/projects`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  try {
    child = await start(port, databasePath);
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), []);
    for (const name of ['', ' \t\n ', null]) {
      const response = await post({ name });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), []);
    const firstResponse = await post({ name: '  First project  ' });
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await post({ name: '<script>not HTML</script>' })).json();
    assert.notEqual(first.id, second.id);
    const expected = [first, second];
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    assert.equal((await fetch(`${base}/api/projects/99999`)).status, 404);
    const malformed = await fetch(`${base}/api/projects`, { method: 'POST', body: '{' });
    assert.equal(malformed.status, 400);
    const home = await (await fetch(base)).text();
    assert.match(home, /<h1[^>]*>Workboard<\/h1>/);
    assert.match(home, /<label for="project-name">Project name<\/label>/);
    assert.match(home, /Create project/);
    assert.equal((await fetch(`${base}/projects/${first.id}`)).status, 200);
    assert.match(home, /<label for="task-title">Task title<\/label>/);
    assert.match(home, /<label for="task-filter">Task filter<\/label>/);
    assert.match(home, /<option value="all" selected>All<\/option>/);
    assert.match(home, /<option value="open">Open<\/option>/);
    assert.match(home, /<option value="completed">Completed<\/option>/);
    const tasksUrl = `${base}/api/projects/${first.id}/tasks`;
    const sendTask = (url, method, body) => fetch(url, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const getTasks = async (id = first.id) => (await fetch(`${base}/api/projects/${id}/tasks`)).json();
    assert.deepEqual(await getTasks(), []);
    for (const title of ['', ' \t\n ', null, 42]) {
      const response = await sendTask(tasksUrl, 'POST', { title });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await getTasks(), []);
    const created = await sendTask(tasksUrl, 'POST', { title: '  First task  ' });
    assert.equal(created.status, 201);
    const task = await created.json();
    assert.equal(task.title, 'First task');
    assert.equal(task.completed, false);
    const otherTask = await (await sendTask(tasksUrl, 'POST', { title: '<b>Second task</b>' })).json();
    assert.deepEqual(await getTasks(), [task, otherTask]);
    assert.deepEqual(await getTasks(second.id), []);
    assert.equal((await sendTask(`${base}/api/projects/${second.id}/tasks/${task.id}`, 'PATCH', { completed: true })).status, 404);
    assert.equal((await sendTask(`${base}/api/projects/99999/tasks`, 'POST', { title: 'Orphan' })).status, 404);
    const taskUrl = `${tasksUrl}/${task.id}`;
    for (const completed of [1, 'true', null]) {
      assert.equal((await sendTask(taskUrl, 'PATCH', { completed })).status, 400);
    }
    for (const completed of [true, false, true]) {
      const response = await sendTask(taskUrl, 'PATCH', { completed });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ...task, completed });
      assert.deepEqual(await getTasks(), [{ ...task, completed }, otherTask]);
    }
    const isolatedTask = await (await sendTask(`${base}/api/projects/${second.id}/tasks`, 'POST', { title: 'Other project task' })).json();
    assert.deepEqual(await getTasks(second.id), [isolatedTask]);
    await stop(child);
    child = undefined;
    child = await start(port, databasePath);
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    assert.deepEqual(await getTasks(), [{ ...task, completed: true }, otherTask]);
    assert.deepEqual(await getTasks(second.id), [isolatedTask]);
    assert.equal((await fetch(`${base}/projects/${first.id}`)).status, 200);
    assert.equal((await sendTask(taskUrl, 'PATCH', { completed: false })).status, 200);
    assert.deepEqual(await getTasks(), [task, otherTask]);
  } finally {
    if (child) await stop(child);
    await rm(directory, { recursive: true, force: true });
  }
});
