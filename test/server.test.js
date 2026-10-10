import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('renaming preserves identity, order, tasks, summaries, and persistence; archives block rename', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
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
    const first = (await request('/api/projects', 'POST', { name: 'Original' })).body;
    const second = (await request('/api/projects', 'POST', { name: 'Second' })).body;
    const path = `/api/projects/${first.id}`;
    const taskPath = `${path}/tasks`;
    const task = (await request(taskPath, 'POST', { title: 'Completed task' })).body;
    await request(`${taskPath}/${task.id}`, 'PATCH', { completed: true });
    await request(taskPath, 'POST', { title: 'Open task' });
    const original = (await request(path)).body;
    const tasks = (await request(taskPath)).body;
    for (const name of ['', ' \t\n ', null]) {
      assert.deepEqual(await request(path, 'PATCH', { name }), {
        status: 400, body: { error: 'Project name is required' },
      });
      assert.deepEqual((await request(path)).body, original);
    }
    const renamed = { ...original, name: 'Renamed project' };
    assert.deepEqual(await request(path, 'PATCH', { name: '  Renamed project \t ' }), {
      status: 200, body: renamed,
    });
    assert.deepEqual((await request('/api/projects')).body, [renamed, second]);
    assert.deepEqual((await request(taskPath)).body, tasks);
    assert.equal((await fetch(`${server.url}/projects/${first.id}`)).status, 200);
    assert.equal((await request('/api/projects/999999', 'PATCH', { name: 'Missing' })).status, 404);
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual((await request(path)).body, renamed);
    assert.deepEqual((await request('/api/projects')).body, [renamed, second]);
    assert.deepEqual((await request(taskPath)).body, tasks);
    await request(path, 'PATCH', { archived: true });
    assert.deepEqual(await request(path, 'PATCH', { name: 'Blocked' }), {
      status: 409, body: { error: 'Archived project' },
    });
    assert.deepEqual((await request(path)).body, { ...renamed, archived: 1 });
    await request(path, 'PATCH', { archived: false });
    const restored = { ...renamed, name: 'Restored and renamed' };
    assert.deepEqual((await request(path, 'PATCH', { name: restored.name })).body, restored);
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual((await request('/api/projects')).body, [restored, second]);
    assert.deepEqual((await request(taskPath)).body, tasks);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

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

test('existing databases migrate; archive, summaries, and restored tasks persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  let server;
  try {
    const dbPath = join(directory, 'workboard.sqlite');
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)));
      INSERT INTO projects (name) VALUES ('Existing project');
      INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Done', 1), (1, 'Pending', 0);`);
    legacy.close();
    server = await start(dbPath);
    const request = async (path, method = 'GET', body) => {
      const response = await fetch(`${server.url}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json() };
    };
    const projectPath = '/api/projects/1';
    const tasksPath = `${projectPath}/tasks`;
    const active = { id: 1, name: 'Existing project', archived: 0, total_count: 2, completed_count: 1 };
    assert.deepEqual((await request(projectPath)).body, active);
    const originalTasks = (await request(tasksPath)).body;
    const empty = (await request('/api/projects', 'POST', { name: 'Empty' })).body;
    assert.equal(empty.archived, 0);
    assert.equal(empty.total_count, 0);
    assert.equal(empty.completed_count, 0);
    assert.equal((await request(projectPath, 'PATCH', { archived: 'true' })).status, 400);
    assert.equal((await request('/api/projects/999', 'PATCH', { archived: true })).status, 404);
    const archived = { ...active, archived: 1 };
    assert.deepEqual(await request(projectPath, 'PATCH', { archived: true }), { status: 200, body: archived });
    assert.deepEqual((await request('/api/projects')).body, [archived, empty]);
    assert.deepEqual((await request(tasksPath)).body, originalTasks);
    assert.equal((await request(tasksPath, 'POST', { title: 'Blocked task' })).status, 409);
    for (const task of originalTasks) {
      assert.equal((await request(`${tasksPath}/${task.id}`, 'PATCH', { completed: !task.completed })).status, 409);
    }
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual((await request(projectPath)).body, archived);
    assert.deepEqual((await request(tasksPath)).body, originalTasks);
    assert.equal((await fetch(`${server.url}/projects/1`)).status, 200);
    assert.deepEqual((await request(projectPath, 'PATCH', { archived: false })).body, active);
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual((await request(projectPath)).body, active);
    assert.deepEqual((await request(tasksPath)).body, originalTasks);
    await request(`${tasksPath}/${originalTasks[1].id}`, 'PATCH', { completed: true });
    assert.equal((await request(projectPath)).body.completed_count, 2);
    await request(tasksPath, 'POST', { title: 'New task' });
    assert.equal((await request(projectPath)).body.total_count, 3);
    assert.equal((await request(projectPath)).body.completed_count, 2);
    assert.equal((await request('/api/projects')).body[1].total_count, 0);
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual((await request(projectPath)).body, { ...active, total_count: 3, completed_count: 2 });
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
