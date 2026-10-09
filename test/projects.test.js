import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', (data) => { errors += data; });
  try {
    const port = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Server startup timed out: ${errors}`)), 5000);
      child.once('error', (error) => { clearTimeout(timeout); reject(error); });
      child.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Server exited (${code}): ${errors}`)); });
      child.stdout.on('data', (data) => {
        output += data;
        const match = output.match(/listening on port (\d+)/);
        if (match) { clearTimeout(timeout); resolve(match[1]); }
      });
    });
    return {
      url: `http://127.0.0.1:${port}`,
      async stop() {
        if (child.exitCode !== null) return;
        const exited = once(child, 'exit');
        child.kill('SIGTERM');
        await exited;
      },
    };
  } catch (error) {
    child.kill();
    throw error;
  }
}

test('projects validate names, retain creation order, and persist across server restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
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
    for (const name of ['', ' \t\n ', null, 42]) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await request('/api/projects')).json(), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('<script> & another project')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await (await request('/api/projects')).json(), [first, second]);
    assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), first);
    assert.equal((await request('/api/projects/999999')).status, 404);
    assert.equal((await request('/api/projects/99999999999999999999')).status, 404);
    const malformed = await request('/api/projects', { method: 'POST', body: '{broken' });
    assert.equal(malformed.status, 400);
    const home = await request('/');
    assert.equal(home.status, 200);
    assert.match(await home.text(), /<h1>Workboard<\/h1>/);
    assert.equal((await request(`/projects/${first.id}`)).status, 200);
    assert.equal((await request('/app.js')).status, 200);
    assert.equal((await request('/style.css')).status, 200);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await (await request('/api/projects')).json(), [first, second]);
    assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), first);
    const third = await (await create('Third')).json();
    assert.ok(third.id > second.id);
  } finally {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate titles, belong to projects, and preserve completion across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const request = (path, method = 'GET', body) => fetch(`${server.url}${path}`, {
      method,
      ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    });
    const firstProject = await (await request('/api/projects', 'POST', { name: 'First' })).json();
    const secondProject = await (await request('/api/projects', 'POST', { name: 'Second' })).json();
    const firstPath = `/api/projects/${firstProject.id}/tasks`;
    const secondPath = `/api/projects/${secondProject.id}/tasks`;
    assert.deepEqual(await (await request(firstPath)).json(), []);
    for (const title of ['', ' \t\n ', null, 42]) {
      const invalid = await request(firstPath, 'POST', { title });
      assert.equal(invalid.status, 400);
      assert.deepEqual(await invalid.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await (await request(firstPath)).json(), []);
    const created = await request(firstPath, 'POST', { title: '  First task  ' });
    assert.equal(created.status, 201);
    const first = await created.json();
    assert.equal(first.title, 'First task');
    assert.equal(first.completed, false);
    const second = await (await request(firstPath, 'POST', { title: '<script> & task' })).json();
    assert.ok(second.id > first.id);
    assert.deepEqual(await (await request(firstPath)).json(), [first, second]);
    assert.deepEqual(await (await request(secondPath)).json(), []);
    assert.equal((await request(`${secondPath}/${first.id}`, 'PATCH', { completed: true })).status, 404);
    assert.equal((await request('/api/projects/999999/tasks', 'POST', { title: 'Unknown' })).status, 404);
    for (const completed of [null, 1, 'true']) {
      assert.equal((await request(`${firstPath}/${first.id}`, 'PATCH', { completed })).status, 400);
    }
    assert.equal((await request(`${firstPath}/99999999999999999999`, 'PATCH', { completed: true })).status, 404);
    assert.deepEqual(await (await request(firstPath)).json(), [first, second]);
    const completedResponse = await request(`${firstPath}/${first.id}`, 'PATCH', { completed: true });
    assert.equal(completedResponse.status, 200);
    const completed = await completedResponse.json();
    assert.deepEqual(completed, { ...first, completed: true });
    const other = await (await request(secondPath, 'POST', { title: 'Other project task' })).json();
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await (await request(firstPath)).json(), [completed, second]);
    assert.deepEqual(await (await request(secondPath)).json(), [other]);
    assert.equal((await request(`/projects/${firstProject.id}`)).status, 200);
    const reopened = await request(`${firstPath}/${first.id}`, 'PATCH', { completed: false });
    assert.deepEqual(await reopened.json(), first);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await (await request(firstPath)).json(), [first, second]);
  } finally {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
