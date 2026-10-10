import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

async function start(databasePath) {
  const process = spawn(globalThis.process.execPath, ['server.js'], {
    cwd: new URL('../', import.meta.url),
    env: { ...globalThis.process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  process.stderr.on('data', (data) => { errors += data; });
  const base = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      process.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 10000);
    process.once('error', (error) => { clearTimeout(timeout); reject(error); });
    process.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    process.stdout.on('data', (data) => {
      output += data;
      const match = output.match(/listening on port (\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  return {
    base,
    async stop() {
      if (process.exitCode !== null) return;
      const exited = once(process, 'exit');
      process.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects are trimmed, ordered, addressable, and persistent across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let server;
  try {
    const databasePath = join(directory, 'nested', 'projects.sqlite');
    server = await start(databasePath);
    const request = (path, options) => fetch(`${server.base}${path}`, options);
    const create = (name) => request('/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const health = await request('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.deepEqual(await (await request('/api/projects')).json(), []);
    for (const name of ['', ' \t\n ']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await request('/api/projects')).json(), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('<script>literal text</script>')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await (await request('/api/projects')).json(), [first, second]);
    assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), first);
    for (const path of ['/', `/projects/${first.id}`]) {
      const response = await request(path);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /text\/html/);
      assert.match(await response.text(), /<script type="module" src="\/app.js"><\/script>/);
    }
    for (const path of ['/app.js', '/style.css']) {
      assert.equal((await request(path)).status, 200);
    }
    assert.equal((await request('/api/projects/999999')).status, 404);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request('/api/projects')).json(), [first, second]);
    assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), first);
    const third = await (await create('After restart')).json();
    assert.ok(third.id > second.id);
    assert.deepEqual(await (await request('/api/projects')).json(), [first, second, third]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('existing projects migrate and archive/restore preserves tasks and completion summaries', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  let server;
  try {
    const databasePath = join(directory, 'workboard.sqlite');
    const legacy = new DatabaseSync(databasePath);
    legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      INSERT INTO projects (name) VALUES ('Existing project');
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)));
      INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing completed task', 1);`);
    legacy.close();
    server = await start(databasePath);
    const request = (path, method = 'GET', body) => fetch(`${server.base}${path}`, {
      method, ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }),
    });
    const projectPath = '/api/projects/1';
    const taskPath = `${projectPath}/tasks`;
    const original = { id: 1, name: 'Existing project', archived: false, total_count: 1, completed_count: 1 };
    assert.deepEqual(await (await request(projectPath)).json(), original);
    const other = await (await request('/api/projects', 'POST', { name: 'Other project' })).json();
    assert.equal(other.total_count, 0);
    assert.equal(other.completed_count, 0);
    await request(taskPath, 'POST', { title: 'Open task' });
    const tasks = await (await request(taskPath)).json();
    const active = { ...original, total_count: 2 };
    assert.deepEqual(await (await request(projectPath)).json(), active);
    assert.equal((await request(projectPath, 'PATCH', { archived: 'yes' })).status, 400);
    assert.equal((await request('/api/projects/999999', 'PATCH', { archived: true })).status, 404);
    const archived = { ...active, archived: true };
    assert.deepEqual(await (await request(projectPath, 'PATCH', { archived: true })).json(), archived);
    assert.deepEqual(await (await request('/api/projects')).json(), [archived, other]);
    assert.equal((await request(taskPath, 'POST', { title: 'Blocked task' })).status, 409);
    for (const task of tasks) {
      assert.equal((await request(`${taskPath}/${task.id}`, 'PATCH', { completed: !task.completed })).status, 409);
    }
    assert.deepEqual(await (await request(taskPath)).json(), tasks);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(projectPath)).json(), archived);
    assert.deepEqual(await (await request(taskPath)).json(), tasks);
    assert.equal((await request('/projects/1')).status, 200);
    assert.deepEqual(await (await request(projectPath, 'PATCH', { archived: false })).json(), active);
    await request(`${taskPath}/${tasks[1].id}`, 'PATCH', { completed: true });
    const restored = { ...active, completed_count: 2 };
    assert.deepEqual(await (await request(projectPath)).json(), restored);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request('/api/projects')).json(), [restored, other]);
    assert.deepEqual(await (await request(taskPath)).json(), tasks.map((task) => ({ ...task, completed: true })));
    await request(`${taskPath}/${tasks[0].id}`, 'PATCH', { completed: false });
    assert.deepEqual(await (await request(projectPath)).json(), active);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate titles, retain order and completion, and belong to their project', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  let server;
  try {
    const databasePath = join(directory, 'workboard.sqlite');
    server = await start(databasePath);
    const request = (path, method = 'GET', body) => fetch(`${server.base}${path}`, {
      method, ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }),
    });
    const project = await (await request('/api/projects', 'POST', { name: 'Tasks project' })).json();
    const other = await (await request('/api/projects', 'POST', { name: 'Other project' })).json();
    const path = `/api/projects/${project.id}/tasks`;
    const otherPath = `/api/projects/${other.id}/tasks`;
    assert.deepEqual(await (await request(path)).json(), []);
    for (const title of ['', ' \t\n ', null, 42]) {
      const response = await request(path, 'POST', { title });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await (await request(path)).json(), []);
    const firstResponse = await request(path, 'POST', { title: '  First task  ' });
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.title, 'First task');
    assert.equal(first.completed, false);
    assert.equal(first.project_id, project.id);
    const second = await (await request(path, 'POST', { title: '<b>Second task</b>' })).json();
    assert.deepEqual(await (await request(path)).json(), [first, second]);
    assert.deepEqual(await (await request(otherPath)).json(), []);
    assert.equal((await request(`${otherPath}/${first.id}`, 'PATCH', { completed: true })).status, 404);
    assert.equal((await request(`${path}/${first.id}`, 'PATCH', { completed: 'yes' })).status, 400);
    const completeResponse = await request(`${path}/${first.id}`, 'PATCH', { completed: true });
    assert.equal(completeResponse.status, 200);
    const completed = { ...first, completed: true };
    assert.deepEqual(await completeResponse.json(), completed);
    assert.deepEqual(await (await request(path)).json(), [completed, second]);
    assert.equal((await request('/api/projects/999999/tasks', 'POST', { title: 'Orphan' })).status, 404);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(path)).json(), [completed, second]);
    assert.deepEqual(await (await request(otherPath)).json(), []);
    assert.equal((await request(`/projects/${project.id}`)).status, 200);
    assert.deepEqual(await (await request(`${path}/${first.id}`, 'PATCH', { completed: false })).json(), first);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(path)).json(), [first, second]);
    const third = await (await request(path, 'POST', { title: 'After restart' })).json();
    assert.ok(third.id > second.id);
    assert.equal(third.completed, false);
    assert.deepEqual(await (await request(path)).json(), [first, second, third]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
