import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stderr.on('data', (chunk) => { output += chunk; });
  const baseUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server did not start: ${output}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with ${code}: ${output}`));
    });
    child.stdout.on('data', (chunk) => {
      const match = chunk.toString().match(/listening on port (\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  return {
    baseUrl,
    async stop() {
      if (child.exitCode !== null) return;
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects validate, retain creation order, and persist across server restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const request = (path, options) => fetch(server.baseUrl + path, options);
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
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      assert.deepEqual(await invalid.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await request('/api/projects')).json(), []);

    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    assert.ok(Number.isInteger(first.id));
    const second = await (await create('<script>Special & safe</script>')).json();
    assert.notEqual(second.id, first.id);
    const expected = [first, second];
    assert.deepEqual(await (await request('/api/projects')).json(), expected);
    assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), first);
    assert.equal((await request('/api/projects/99999')).status, 404);
    assert.equal((await request(`/projects/${first.id}`)).status, 200);
    const page = await (await request('/')).text();
    assert.match(page, /<title>Workboard<\/title>/);
    assert.match(page, /src="\/app.js"/);
    assert.equal((await request('/app.js')).status, 200);
    assert.equal((await request('/styles.css')).status, 200);
    const malformed = await request('/api/projects', { method: 'POST', body: '{' });
    assert.equal(malformed.status, 400);
    const oversized = await request('/api/projects', {
      method: 'POST', body: JSON.stringify({ name: 'x'.repeat(70_000) }),
    });
    assert.equal(oversized.status, 413);
    assert.deepEqual(await (await request('/api/projects')).json(), expected);

    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await (await request('/api/projects')).json(), expected);
    assert.deepEqual(await (await request(`/api/projects/${second.id}`)).json(), second);
    const third = await (await create('Third project')).json();
    assert.ok(third.id > second.id);
    assert.deepEqual(await (await request('/api/projects')).json(), [...expected, third]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, belong to their project, and retain completion across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  // Start with the Task 001 schema and data to verify the additive migration.
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL CHECK (length(trim(name)) > 0)
    );
    INSERT INTO projects (name) VALUES ('Existing project'), ('Other project');
  `);
  database.close();
  let server;
  try {
    server = await startServer(databasePath);
    const request = (path, method = 'GET', body) => fetch(server.baseUrl + path, {
      method,
      ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    });
    const taskPath = '/api/projects/1/tasks';
    const list = async (path = taskPath) => (await request(path)).json();
    assert.deepEqual(await (await request('/api/projects')).json(), [
      { id: 1, name: 'Existing project' }, { id: 2, name: 'Other project' },
    ]);
    assert.deepEqual(await list(), []);
    for (const title of ['', ' \t\n ', null, 123]) {
      const invalid = await request(taskPath, 'POST', { title });
      assert.equal(invalid.status, 400);
      assert.deepEqual(await invalid.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await list(), []);
    assert.equal((await request('/api/projects/999/tasks', 'POST', { title: 'Missing' })).status, 404);
    assert.equal((await request('/api/projects/999/tasks')).status, 404);
    const firstResponse = await request(taskPath, 'POST', { title: '  First task  ' });
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.deepEqual(first, { id: first.id, title: 'First task', completed: false });
    assert.ok(Number.isInteger(first.id));
    const second = await (await request(taskPath, 'POST', { title: '<b>Second & safe</b>' })).json();
    assert.ok(second.id > first.id);
    assert.deepEqual(await list(), [first, second]);
    assert.deepEqual(await list('/api/projects/2/tasks'), []);
    for (const completed of ['true', 1, null]) {
      assert.equal((await request(`${taskPath}/${first.id}`, 'PATCH', { completed })).status, 400);
    }
    assert.deepEqual(await list(), [first, second]);
    assert.equal((await request(`/api/projects/2/tasks/${first.id}`, 'PATCH', { completed: true })).status, 404);
    assert.equal((await request(`${taskPath}/999`, 'PATCH', { completed: true })).status, 404);
    const completion = await request(`${taskPath}/${first.id}`, 'PATCH', { completed: true });
    assert.equal(completion.status, 200);
    first.completed = true;
    assert.deepEqual(await completion.json(), first);
    const other = await (await request('/api/projects/2/tasks', 'POST', { title: 'Other task' })).json();
    assert.deepEqual(await list(), [first, second]);
    assert.deepEqual(await list('/api/projects/2/tasks'), [other]);

    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await list(), [first, second]);
    assert.deepEqual(await list('/api/projects/2/tasks'), [other]);
    assert.equal((await request('/projects/1')).status, 200);
    const reopened = await request(`${taskPath}/${first.id}`, 'PATCH', { completed: false });
    first.completed = false;
    assert.deepEqual(await reopened.json(), first);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await list(), [first, second]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
