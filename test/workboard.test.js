import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { openProjectStore } from '../project-store.js';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let diagnostics = '';
  child.stderr.on('data', (chunk) => { diagnostics += chunk; });
  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${diagnostics}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited (${code}): ${diagnostics}`));
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
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects validate, retain creation order, and persist across process restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    async function create(name) {
      return fetch(`${server.url}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
    }
    for (const name of ['', ' \t\n ', null, 42]) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await fetch(`${server.url}/api/projects`)).json(), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('<b>Second project</b>')).json();
    assert.notEqual(second.id, first.id);
    const expected = [first, second];
    assert.deepEqual(await (await fetch(`${server.url}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${server.url}/api/projects/${first.id}`)).json(), first);

    for (const route of ['/', `/projects/${first.id}`]) {
      const response = await fetch(`${server.url}${route}`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /text\/html/);
      assert.match(await response.text(), /<script type="module" src="\/app.js">/);
    }
    const missing = await fetch(`${server.url}/api/projects/99999`);
    assert.equal(missing.status, 404);
    const malformed = await fetch(`${server.url}/api/projects`, { method: 'POST', body: '{' });
    assert.equal(malformed.status, 400);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.deepEqual(await (await fetch(`${server.url}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${server.url}/api/projects/${first.id}`)).json(), first);
    const third = await (await create('Third project')).json();
    assert.ok(third.id > second.id);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, stay within their project, and persist completion across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    async function api(path, method = 'GET', body) {
      return fetch(`${server.url}/api/projects${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    }
    const first = await (await api('', 'POST', { name: 'First' })).json();
    const second = await (await api('', 'POST', { name: 'Second' })).json();
    const tasksPath = `/${first.id}/tasks`;
    for (const title of ['', ' \t\n ', null, 42]) {
      const response = await api(tasksPath, 'POST', { title });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await (await api(tasksPath)).json(), []);
    const created = await api(tasksPath, 'POST', { title: '  First task  ' });
    assert.equal(created.status, 201);
    const task = await created.json();
    assert.equal(task.title, 'First task');
    assert.equal(task.project_id, first.id);
    assert.equal(task.completed, false);
    const next = await (await api(tasksPath, 'POST', { title: '<b>Second task</b>' })).json();
    assert.ok(next.id > task.id);
    assert.deepEqual(await (await api(tasksPath)).json(), [task, next]);
    assert.deepEqual(await (await api(`/${second.id}/tasks`)).json(), []);

    for (const completed of [null, 1, 'true']) {
      assert.equal((await api(`${tasksPath}/${task.id}`, 'PATCH', { completed })).status, 400);
    }
    assert.equal((await api(`/${second.id}/tasks/${task.id}`, 'PATCH', { completed: true })).status, 404);
    assert.equal((await api(`${tasksPath}/999999`, 'PATCH', { completed: true })).status, 404);
    assert.equal((await api('/999999/tasks', 'POST', { title: 'Orphan' })).status, 404);
    assert.equal((await api('/999999/tasks')).status, 404);
    const malformed = await fetch(`${server.url}/api/projects${tasksPath}`, { method: 'POST', body: '{' });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await (await api(tasksPath)).json(), [task, next]);

    const completed = await api(`${tasksPath}/${task.id}`, 'PATCH', { completed: true });
    assert.equal(completed.status, 200);
    assert.deepEqual(await completed.json(), { ...task, completed: true });
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.deepEqual(await (await api(tasksPath)).json(), [{ ...task, completed: true }, next]);
    assert.deepEqual(await (await api(`/${second.id}/tasks`)).json(), []);
    assert.deepEqual(await (await api(`/${first.id}`)).json(), first);
    assert.equal((await fetch(`${server.url}/projects/${first.id}`)).status, 200);
    const reopened = await api(`${tasksPath}/${task.id}`, 'PATCH', { completed: false });
    assert.deepEqual(await reopened.json(), task);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.deepEqual(await (await api(tasksPath)).json(), [task, next]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('opening a project-only database preserves existing identities and adds tasks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-upgrade-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let store;
  try {
    const original = new DatabaseSync(databasePath);
    try {
      original.exec(`
        CREATE TABLE projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL CHECK(length(trim(name)) > 0)
        );
        INSERT INTO projects (id, name) VALUES (7, 'Existing project');
      `);
    } finally {
      original.close();
    }
    store = openProjectStore(databasePath);
    assert.deepEqual(store.list().map((project) => ({ ...project })), [{ id: 7, name: 'Existing project' }]);
    assert.deepEqual(store.listTasks(7), []);
    const task = store.createTask(7, '  Existing project task  ');
    assert.equal(task.title, 'Existing project task');
    assert.equal(task.completed, false);
    assert.throws(() => store.createTask(999, 'Orphan'), /FOREIGN KEY/);
    assert.ok(store.create('Next project').id > 7);
  } finally {
    store?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
