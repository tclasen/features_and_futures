import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    stop: () => new Promise(resolve => {
      child.once('exit', resolve);
      child.kill('SIGTERM');
    }),
  };
}

test('project validation, creation order, routing, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let server;
  try {
    const dbPath = join(directory, 'nested', 'projects.sqlite');
    server = await start(dbPath);
    let response = await fetch(`${server.url}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
    assert.deepEqual(await (await fetch(`${server.url}/api/projects`)).json(), []);
    const create = name => fetch(`${server.url}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    for (const name of ['', ' \t\n ']) {
      response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await fetch(`${server.url}/api/projects`)).json(), []);
    response = await create('  First project  ');
    assert.equal(response.status, 201);
    const first = await response.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('Second project')).json();
    assert.notEqual(first.id, second.id);
    const expected = [first, second];
    assert.deepEqual(await (await fetch(`${server.url}/api/projects`)).json(), expected);
    for (const path of ['/', `/projects/${first.id}`]) {
      response = await fetch(`${server.url}${path}`);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, /<h1>Workboard<\/h1>/);
      assert.match(html, /<label for="project-name">Project name<\/label>/);
      assert.match(html, /Create project/);
      assert.match(html, /role="alert"/);
    }
    assert.equal((await fetch(`${server.url}/api/projects/99999`)).status, 404);
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual(await (await fetch(`${server.url}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${server.url}/api/projects/${first.id}`)).json(), first);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate titles, belong to a project, and persist completion through restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  let server;
  try {
    const dbPath = join(directory, 'workboard.sqlite');
    server = await start(dbPath);
    const request = async (path, method = 'GET', body) => {
      const response = await fetch(`${server.url}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json() };
    };
    const first = (await request('/api/projects', 'POST', { name: 'First' })).body;
    const second = (await request('/api/projects', 'POST', { name: 'Second' })).body;
    const path = `/api/projects/${first.id}/tasks`;
    const otherPath = `/api/projects/${second.id}/tasks`;
    for (const title of ['', ' \t\n ', null]) {
      assert.deepEqual(await request(path, 'POST', { title }), {
        status: 400, body: { error: 'Task title is required' },
      });
    }
    assert.deepEqual((await request(path)).body, []);
    const created = await request(path, 'POST', { title: '  First task  ' });
    assert.equal(created.status, 201);
    const task = created.body;
    assert.equal(task.title, 'First task');
    assert.equal(task.completed, false);
    const next = (await request(path, 'POST', { title: 'Second task' })).body;
    assert.deepEqual((await request(path)).body, [task, next]);
    assert.deepEqual((await request(otherPath)).body, []);
    assert.equal((await request(`${otherPath}/${task.id}`, 'PATCH', { completed: true })).status, 404);
    assert.equal((await request('/api/projects/99999/tasks', 'POST', { title: 'Orphan' })).status, 404);
    assert.equal((await request(`${path}/${task.id}`, 'PATCH', { completed: 'true' })).status, 400);
    const completed = { ...task, completed: true };
    assert.deepEqual((await request(`${path}/${task.id}`, 'PATCH', { completed: true })).body, completed);
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual((await request(path)).body, [completed, next]);
    assert.deepEqual((await request(otherPath)).body, []);
    assert.equal((await fetch(`${server.url}/projects/${first.id}`)).status, 200);
    assert.deepEqual((await request(`${path}/${task.id}`, 'PATCH', { completed: false })).body, task);
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual((await request(path)).body, [task, next]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
