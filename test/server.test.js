import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

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
      reject(new Error(`Startup timed out: ${errors}`));
    }, 5000);
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited (${code}): ${errors}`));
    });
    child.once('error', reject);
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

test('health, projects, scoped tasks, completion, validation, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const request = (path, options) => fetch(`${server.url}${path}`, options);
    const create = (name) => request('/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
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
    const response = await create('  First project  ');
    assert.equal(response.status, 201);
    const first = await response.json();
    assert.equal(first.name, 'First project');
    assert.equal(first.archived, false);
    assert.equal(first.total, 0);
    assert.equal(first.completed, 0);
    const second = await (await create('<script>Second</script>')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await (await request('/api/projects')).json(), [first, second]);
    assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), first);
    const page = await request(`/projects/${first.id}`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<script type="module" src="\/app.js"/);
    assert.match(await (await request('/')).text(), /<title>Workboard<\/title>/);
    assert.equal((await request('/app.js')).status, 200);
    assert.equal((await request('/style.css')).status, 200);
    assert.equal((await request('/api/projects/999999')).status, 404);
    assert.equal((await request('/unknown')).status, 404);
    const malformed = await request('/api/projects', { method: 'POST', body: '{' });
    assert.equal(malformed.status, 400);
    const taskPath = `/api/projects/${first.id}/tasks`;
    const otherTaskPath = `/api/projects/${second.id}/tasks`;
    const createTask = (title, path = taskPath) => request(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
    });
    const complete = (task, completed, path = taskPath) => request(`${path}/${task.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed }),
    });
    assert.deepEqual(await (await request(taskPath)).json(), []);
    for (const title of ['', ' \t\n ', null, 42]) {
      const invalid = await createTask(title);
      assert.equal(invalid.status, 400);
      assert.deepEqual(await invalid.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await (await request(taskPath)).json(), []);
    const taskResponse = await createTask('  First task  ');
    assert.equal(taskResponse.status, 201);
    const task = await taskResponse.json();
    assert.equal(task.title, 'First task');
    assert.equal(task.completed, false);
    const nextTask = await (await createTask('<script>Next task</script>')).json();
    const otherTask = await (await createTask('Other project task', otherTaskPath)).json();
    assert.deepEqual(await (await request(taskPath)).json(), [task, nextTask]);
    assert.deepEqual(await (await request(otherTaskPath)).json(), [otherTask]);
    assert.equal((await complete(task, true, otherTaskPath)).status, 404);
    for (const invalid of [1, 'true', null]) {
      assert.equal((await complete(task, invalid)).status, 400);
    }
    assert.equal((await createTask('Orphan', '/api/projects/999999/tasks')).status, 404);
    assert.equal((await request('/api/projects/999999/tasks')).status, 404);
    assert.equal((await request(`${taskPath}/999999`, {
      method: 'PATCH', body: JSON.stringify({ completed: true }),
    })).status, 404);
    assert.equal((await request(taskPath, { method: 'POST', body: '{' })).status, 400);
    assert.deepEqual(await (await complete(task, true)).json(), { ...task, completed: true });
    assert.deepEqual(await (await complete(task, false)).json(), task);
    await complete(task, true);
    const archive = (archived) => request(`/api/projects/${first.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived }),
    });
    for (const invalid of [null, 1, 'true']) {
      assert.equal((await archive(invalid)).status, 400);
    }
    assert.deepEqual(await (await archive(true)).json(), { ...first, archived: true, total: 2, completed: 1 });
    assert.equal((await createTask('Blocked')).status, 409);
    assert.equal((await complete(task, false)).status, 409);
    assert.deepEqual(await (await request(taskPath)).json(), [{ ...task, completed: true }, nextTask]);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    const archivedFirst = { ...first, archived: true, total: 2, completed: 1 };
    assert.deepEqual(await (await request('/api/projects')).json(), [archivedFirst, { ...second, total: 1 }]);
    assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), archivedFirst);
    assert.deepEqual(await (await request(taskPath)).json(), [{ ...task, completed: true }, nextTask]);
    assert.deepEqual(await (await request(otherTaskPath)).json(), [otherTask]);
    assert.equal((await request(`/projects/${first.id}`)).status, 200);
    assert.equal((await complete(task, false)).status, 409);
    assert.deepEqual(await (await archive(false)).json(), { ...first, total: 2, completed: 1 });
    assert.deepEqual(await (await complete(task, false)).json(), task);
    assert.deepEqual(await (await request(taskPath)).json(), [task, nextTask]);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), { ...first, total: 2 });
    assert.deepEqual(await (await request(taskPath)).json(), [task, nextTask]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('upgrades a previous database without losing projects or completed tasks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-migration-'));
  const databasePath = join(directory, 'legacy.sqlite');
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
    );
    INSERT INTO projects (id, name) VALUES (7, 'Existing project');
    INSERT INTO tasks (id, project_id, title, completed) VALUES (12, 7, 'Existing task', 1);
  `);
  database.close();
  let server;
  try {
    for (let restart = 0; restart < 2; restart++) {
      server = await start(databasePath);
      assert.deepEqual(await (await fetch(`${server.url}/api/projects`)).json(), [
        { id: 7, name: 'Existing project', archived: false, total: 1, completed: 1 },
      ]);
      assert.deepEqual(await (await fetch(`${server.url}/api/projects/7/tasks`)).json(), [
        { id: 12, title: 'Existing task', completed: true },
      ]);
      await server.stop();
      server = undefined;
    }
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
