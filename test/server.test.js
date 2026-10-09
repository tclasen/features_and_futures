import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exited = once(child, 'exit');
  let output = '';
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const baseUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server did not start: ${errors}`));
    }, 5000);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = /listening on port (\d+)/.exec(output);
      if (match) {
        clearTimeout(timeout);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  return {
    baseUrl,
    async stop() {
      child.kill('SIGTERM');
      const [code] = await exited;
      assert.equal(code, 0, errors);
    },
  };
}

test('project validation, creation order, navigation assets, and process restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let running;
  try {
    running = await startServer(databasePath);
    const request = (path, options) => fetch(`${running.baseUrl}${path}`, options);
    const create = (name) => request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });

    const health = await request('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.deepEqual(await (await request('/api/projects')).json(), []);
    for (const name of ['', ' \t\n ', null, 42]) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      assert.deepEqual(await invalid.json(), { error: 'Project name is required' });
    }
    const malformed = await request('/api/projects', { method: 'POST', body: '{' });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await (await request('/api/projects')).json(), []);

    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('<script>literal name</script>')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await (await request('/api/projects')).json(), [first, second]);
    assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), first);
    assert.equal((await request('/api/projects/999999')).status, 404);
    assert.equal((await request('/missing')).status, 404);
    const home = await request('/');
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-type'), /text\/html/);
    assert.match(await home.text(), /<title>Workboard<\/title>/);
    assert.equal((await request(`/projects/${first.id}`)).status, 200);
    assert.equal((await request('/app.js')).status, 200);
    assert.equal((await request('/style.css')).status, 200);

    await running.stop();
    running = undefined;
    running = await startServer(databasePath);
    assert.deepEqual(await (await request('/api/projects')).json(), [first, second]);
    assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), first);
    const third = await (await create('After restart')).json();
    assert.ok(third.id > second.id);
  } finally {
    if (running) await running.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task validation, project ownership, completion changes, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  let running;
  try {
    const databasePath = join(directory, 'workboard.sqlite');
    running = await startServer(databasePath);
    const request = (path, method = 'GET', body) => fetch(`${running.baseUrl}${path}`, {
      method,
      ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    });
    const first = await (await request('/api/projects', 'POST', { name: 'First' })).json();
    const second = await (await request('/api/projects', 'POST', { name: 'Second' })).json();
    const tasksPath = `/api/projects/${first.id}/tasks`;
    const otherPath = `/api/projects/${second.id}/tasks`;
    assert.deepEqual(await (await request(tasksPath)).json(), []);
    for (const title of ['', ' \t\n ', null, 42]) {
      const response = await request(tasksPath, 'POST', { title });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
    }
    const malformed = await fetch(`${running.baseUrl}${tasksPath}`, { method: 'POST', body: '{' });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await (await request(tasksPath)).json(), []);
    assert.equal((await request('/api/projects/999999/tasks', 'POST', { title: 'Missing' })).status, 404);

    const created = await request(tasksPath, 'POST', { title: '  First task  ' });
    assert.equal(created.status, 201);
    const task = await created.json();
    assert.deepEqual(task, { id: task.id, title: 'First task', completed: false });
    const later = await (await request(tasksPath, 'POST', { title: '<script>literal task</script>' })).json();
    const other = await (await request(otherPath, 'POST', { title: 'Other project task' })).json();
    assert.ok(later.id > task.id);
    assert.deepEqual(await (await request(tasksPath)).json(), [task, later]);
    assert.deepEqual(await (await request(otherPath)).json(), [other]);

    for (const completed of ['true', 1, null]) {
      assert.equal((await request(`${tasksPath}/${task.id}`, 'PATCH', { completed })).status, 400);
    }
    assert.equal((await request(`${otherPath}/${task.id}`, 'PATCH', { completed: true })).status, 404);
    assert.equal((await request(`${tasksPath}/999999`, 'PATCH', { completed: true })).status, 404);
    const completedResponse = await request(`${tasksPath}/${task.id}`, 'PATCH', { completed: true });
    assert.equal(completedResponse.status, 200);
    const completedTask = { ...task, completed: true };
    assert.deepEqual(await completedResponse.json(), completedTask);
    assert.deepEqual(await (await request(tasksPath)).json(), [completedTask, later]);
    assert.deepEqual(await (await request(otherPath)).json(), [other]);

    await running.stop();
    running = undefined;
    running = await startServer(databasePath);
    assert.deepEqual(await (await request(tasksPath)).json(), [completedTask, later]);
    assert.deepEqual(await (await request(otherPath)).json(), [other]);
    assert.equal((await request(`/projects/${first.id}`)).status, 200);
    const reopened = await request(`${tasksPath}/${task.id}`, 'PATCH', { completed: false });
    assert.deepEqual(await reopened.json(), task);
    const afterRestart = await (await request(tasksPath, 'POST', { title: 'After restart' })).json();
    assert.ok(afterRestart.id > other.id);
    await running.stop();
    running = undefined;
    running = await startServer(databasePath);
    assert.deepEqual(await (await request(tasksPath)).json(), [task, later, afterRestart]);
  } finally {
    if (running) await running.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
