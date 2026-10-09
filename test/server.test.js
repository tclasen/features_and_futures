import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

async function start(databasePath) {
  // Port zero lets the OS select an available port without a reservation race.
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import http from 'node:http';
    const listen = http.Server.prototype.listen;
    http.Server.prototype.listen = function (...args) {
      this.once('listening', () => console.log('PORT=' + this.address().port));
      return listen.apply(this, args);
    };
    await import('./server.js');
  `], { env: { ...process.env, PORT: '0', DB_PATH: databasePath }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${stderr}`));
    }, 5000);
    child.stdout.on('data', (chunk) => {
      const match = chunk.toString().match(/PORT=(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error(stderr)); });
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

test('launch contract, project validation, ordering, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let server;
  try {
    const databasePath = join(directory, 'nested', 'projects.sqlite');
    server = await start(databasePath);
    const get = (path) => fetch(server.url + path);
    const create = (name) => fetch(server.url + '/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.deepEqual(await (await get('/api/projects')).json(), []);
    const html = await (await get('/')).text();
    assert.match(html, /<h1[^>]*>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, /Create project/);
    for (const name of ['', ' \t\n ', null, 42]) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await get('/api/projects')).json(), []);
    const firstResponse = await create('  Pilot  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'Pilot');
    const second = await (await create('<script>alert(1)</script>')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await (await get('/api/projects')).json(), [first, second]);
    assert.deepEqual(await (await get(`/api/projects/${first.id}`)).json(), first);
    assert.equal((await get(`/projects/${first.id}`)).status, 200);
    assert.equal((await get('/api/projects/999999')).status, 404);
    assert.equal((await get('/missing')).status, 404);
    const malformed = await fetch(server.url + '/api/projects', { method: 'POST', body: '{' });
    assert.equal(malformed.status, 400);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.deepEqual(await (await get('/api/projects')).json(), [first, second]);
    assert.deepEqual(await (await get(`/api/projects/${first.id}`)).json(), first);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks upgrade existing databases, validate, isolate projects, and persist completion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const databasePath = join(directory, 'workboard.sqlite');
  // Simulate the Task 001 schema to verify a non-destructive upgrade.
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    INSERT INTO projects (name) VALUES ('Existing project'), ('Other project');`);
  legacy.close();
  let server;
  try {
    server = await start(databasePath);
    const getTasks = (id = 1) => fetch(`${server.url}/api/projects/${id}/tasks`);
    const createTask = (title, id = 1) => fetch(`${server.url}/api/projects/${id}/tasks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
    });
    const complete = (id, completed, projectId = 1) => fetch(`${server.url}/api/projects/${projectId}/tasks/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed }),
    });
    assert.equal((await getTasks(999)).status, 404);
    assert.equal((await createTask('Missing project', 999)).status, 404);
    for (const title of ['', ' \t\n ', null, 42]) {
      const response = await createTask(title);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await (await getTasks()).json(), []);
    const response = await createTask('  First task  ');
    assert.equal(response.status, 201);
    const first = await response.json();
    assert.equal(first.title, 'First task');
    assert.equal(first.completed, false);
    assert.equal(first.project_id, 1);
    const second = await (await createTask('<img src=x onerror=alert(1)>')).json();
    assert.deepEqual(await (await getTasks()).json(), [first, second]);
    assert.deepEqual(await (await getTasks(2)).json(), []);
    assert.equal((await complete(first.id, true, 2)).status, 404);
    for (const completed of [1, 'true', null]) {
      assert.equal((await complete(first.id, completed)).status, 400);
    }
    assert.equal((await complete(999, true)).status, 404);
    const saved = await (await complete(first.id, true)).json();
    assert.deepEqual(saved, { ...first, completed: true });
    assert.deepEqual(await (await getTasks()).json(), [saved, second]);
    assert.deepEqual(await (await complete(first.id, false)).json(), first);
    await complete(first.id, true);
    const other = await (await createTask('Other task', 2)).json();
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.deepEqual(await (await getTasks()).json(), [saved, second]);
    assert.deepEqual(await (await getTasks(2)).json(), [other]);
    assert.deepEqual(await (await fetch(`${server.url}/api/projects/1`)).json(), { id: 1, name: 'Existing project' });
    const html = await (await fetch(`${server.url}/projects/1`)).text();
    assert.match(html, /<label for="task-title">Task title<\/label>/);
    assert.match(html, /Create task/);
    assert.match(html, /<label for="task-filter">Task filter<\/label>/);
    assert.match(html, /<option value="all" selected>All<\/option>/);
    assert.match(html, />Open<\/option>/);
    assert.match(html, />Completed<\/option>/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
