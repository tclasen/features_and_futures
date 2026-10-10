import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  return {
    url,
    async stop() {
      if (child.exitCode !== null) return;
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('project validation, order, stable IDs, routes, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let server;
  try {
    const databasePath = join(directory, 'nested', 'projects.sqlite');
    server = await start(databasePath);
    const request = (path, options) => fetch(`${server.url}${path}`, options);
    const create = (name) => request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });

    const health = await request('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.deepEqual(await (await request('/api/projects')).json(), []);
    for (const name of ['', ' \t\n ', null, 123]) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    const malformed = await request('/api/projects', { method: 'POST', body: '{' });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await (await request('/api/projects')).json(), []);

    const firstResponse = await create('  First project \n');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    assert.equal(typeof first.id, 'number');
    const second = await (await create('<script>second</script>')).json();
    assert.ok(second.id > first.id);
    const expected = [first, second];
    assert.deepEqual(await (await request('/api/projects')).json(), expected);
    assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), first);
    assert.equal((await request('/api/projects/999999')).status, 404);
    for (const path of ['/', `/projects/${first.id}`, '/app.js', '/styles.css']) {
      assert.equal((await request(path)).status, 200);
    }
    const html = await (await request('/')).text();
    assert.match(html, /type="module" src="\/app.js"/);

    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request('/api/projects')).json(), expected);
    assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), first);
    const third = await (await create('Third')).json();
    assert.ok(third.id > second.id);
  } finally {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task validation, project ownership, completion, order, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-test-'));
  let server;
  try {
    const databasePath = join(directory, 'workboard.sqlite');
    server = await start(databasePath);
    const request = (path, method = 'GET', body) => fetch(`${server.url}${path}`, {
      method,
      ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    });
    const firstProject = await (await request('/api/projects', 'POST', { name: 'First' })).json();
    const secondProject = await (await request('/api/projects', 'POST', { name: 'Second' })).json();
    const tasksPath = `/api/projects/${firstProject.id}/tasks`;
    const otherTasksPath = `/api/projects/${secondProject.id}/tasks`;
    assert.deepEqual(await (await request(tasksPath)).json(), []);

    for (const title of ['', ' \t\n ', null, 123]) {
      const response = await request(tasksPath, 'POST', { title });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
    }
    const malformed = await fetch(`${server.url}${tasksPath}`, { method: 'POST', body: '{' });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await (await request(tasksPath)).json(), []);
    assert.equal((await request('/api/projects/999999/tasks', 'POST', { title: 'Orphan' })).status, 404);

    const firstResponse = await request(tasksPath, 'POST', { title: '  First task \n' });
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.title, 'First task');
    assert.equal(first.completed, false);
    const second = await (await request(tasksPath, 'POST', { title: '<script>Second</script>' })).json();
    assert.ok(second.id > first.id);
    const other = await (await request(otherTasksPath, 'POST', { title: 'Other project task' })).json();
    assert.deepEqual(await (await request(tasksPath)).json(), [first, second]);
    assert.deepEqual(await (await request(otherTasksPath)).json(), [other]);
    assert.equal((await request(`${otherTasksPath}/${first.id}`, 'PATCH', { completed: true })).status, 404);
    assert.equal((await request(`${tasksPath}/999999`, 'PATCH', { completed: true })).status, 404);
    for (const completed of [0, 1, 'true', null]) {
      assert.equal((await request(`${tasksPath}/${first.id}`, 'PATCH', { completed })).status, 400);
    }
    assert.deepEqual(await (await request(tasksPath)).json(), [first, second]);
    const completedResponse = await request(`${tasksPath}/${first.id}`, 'PATCH', { completed: true });
    assert.equal(completedResponse.status, 200);
    assert.deepEqual(await completedResponse.json(), { ...first, completed: true });
    assert.deepEqual(await (await request(tasksPath)).json(), [{ ...first, completed: true }, second]);

    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(tasksPath)).json(), [{ ...first, completed: true }, second]);
    assert.deepEqual(await (await request(otherTasksPath)).json(), [other]);
    assert.equal((await request(`/projects/${firstProject.id}`)).status, 200);
    const reopenedResponse = await request(`${tasksPath}/${first.id}`, 'PATCH', { completed: false });
    assert.equal(reopenedResponse.status, 200);
    assert.deepEqual(await reopenedResponse.json(), first);
    const third = await (await request(tasksPath, 'POST', { title: 'Third' })).json();
    assert.ok(third.id > other.id);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(tasksPath)).json(), [first, second, third]);
  } finally {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
