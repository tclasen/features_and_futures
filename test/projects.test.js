import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let output = '';
  const url = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => reject(new Error(`Server exited: ${code}`)));
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
  });
  return {
    url,
    async stop() {
      const stopped = once(child, 'exit');
      child.kill('SIGTERM');
      await stopped;
    },
  };
}

test('tasks: validation, ownership, completion, and persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const dbPath = join(directory, 'tasks.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const api = (path, method = 'GET', body) => fetch(server.url + path, {
      method, headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const first = await (await api('/api/projects', 'POST', { name: 'First' })).json();
    const second = await (await api('/api/projects', 'POST', { name: 'Second' })).json();
    const path = `/api/projects/${first.id}/tasks`;
    const other = `/api/projects/${second.id}/tasks`;
    for (const title of ['', '  \t ']) {
      const response = await api(path, 'POST', { title });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, 'Task title is required');
    }
    assert.deepEqual(await (await api(path)).json(), []);
    const task = await (await api(path, 'POST', { title: '  Build it  ' })).json();
    const next = await (await api(path, 'POST', { title: 'Ship it' })).json();
    assert.equal(task.title, 'Build it');
    assert.equal(task.completed, false);
    assert.deepEqual(await (await api(path)).json(), [task, next]);
    assert.deepEqual(await (await api(other)).json(), []);
    assert.equal((await api(`${other}/${task.id}`, 'PATCH', { completed: true })).status, 404);
    assert.equal((await api(`${path}/${task.id}`, 'PATCH', { completed: 'yes' })).status, 400);
    const completed = await (await api(`${path}/${task.id}`, 'PATCH', { completed: true })).json();
    assert.equal(completed.completed, true);
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual(await (await api(path)).json(), [completed, next]);
    assert.equal((await api(`/projects/${first.id}`)).status, 200);
    const reopened = await (await api(`${path}/${task.id}`, 'PATCH', { completed: false })).json();
    assert.equal(reopened.completed, false);
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual(await (await api(path)).json(), [reopened, next]);
    assert.deepEqual(await (await api(other)).json(), []);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('projects: validation, ordering, routes, and persistence across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const dbPath = join(directory, 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const get = (path) => fetch(server.url + path);
    const create = (name) => fetch(server.url + '/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.deepEqual(await (await get('/api/projects')).json(), []);
    for (const name of ['', '  \t\n ']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, 'Project name is required');
    }
    assert.deepEqual(await (await get('/api/projects')).json(), []);
    const first = await (await create('  First project  ')).json();
    const second = await (await create('Second project')).json();
    assert.equal(first.name, 'First project');
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await (await get('/api/projects')).json(), [first, second]);
    assert.deepEqual(await (await get(`/api/projects/${first.id}`)).json(), first);
    assert.equal((await get(`/projects/${first.id}`)).status, 200);
    assert.match(await (await get('/')).text(), /<title>Workboard<\/title>/);
    assert.equal((await get('/app.js')).status, 200);
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual(await (await get('/api/projects')).json(), [first, second]);
    assert.deepEqual(await (await get(`/api/projects/${first.id}`)).json(), first);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
