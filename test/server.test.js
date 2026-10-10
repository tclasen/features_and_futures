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
  const base = await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('Server startup timed out'));
    }, 5000);
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Server exited: ${code}`)); });
  });
  return {
    base,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('health, project validation, creation order, detail, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'test.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const get = (path) => fetch(server.base + path);
    const create = (name) => fetch(server.base + '/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    for (const name of ['', ' \t\n ', null, 42]) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await get('/api/projects')).json(), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('<script>Second</script>')).json();
    const expected = [first, second];
    assert.deepEqual(await (await get('/api/projects')).json(), expected);
    assert.deepEqual(await (await get(`/api/projects/${first.id}`)).json(), first);
    assert.equal((await get('/api/projects/99999')).status, 404);
    for (const path of ['/', `/projects/${first.id}`]) {
      const page = await get(path);
      assert.equal(page.status, 200);
      assert.match(await page.text(), /<script type="module" src="\/app.js">/);
    }
    assert.equal((await get('/app.js')).status, 200);
    const dateModule = await get('/due-date.js');
    assert.equal(dateModule.status, 200);
    assert.match(dateModule.headers.get('content-type'), /text\/javascript/);
    assert.match(await dateModule.text(), /export function normalizeDueDate/);
    const filtersModule = await get('/task-filters.js');
    assert.equal(filtersModule.status, 200);
    assert.match(filtersModule.headers.get('content-type'), /text\/javascript/);
    assert.match(await filtersModule.text(), /export function filterTasks/);
    assert.equal((await get('/style.css')).status, 200);
    assert.equal((await get('/missing')).status, 404);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.deepEqual(await (await get('/api/projects')).json(), expected);
    assert.deepEqual(await (await get(`/api/projects/${second.id}`)).json(), second);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive migration, summaries, write protection, restore, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const databasePath = join(directory, 'test.sqlite');
  // Simulate the schema and saved data from the previous checkpoint.
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Existing');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Done', 1), (1, 'Open', 0);
  `);
  legacy.close();
  let server;
  try {
    server = await start(databasePath);
    const request = (path, method = 'GET', body) => fetch(server.base + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const projectPath = '/api/projects/1';
    const tasksPath = `${projectPath}/tasks`;
    const original = await (await request(projectPath)).json();
    assert.deepEqual(original, {
      id: 1, name: 'Existing', archived: false, default_task_priority: 'Normal', total_count: 2, completed_count: 1,
    });
    const tasks = await (await request(tasksPath)).json();
    const empty = await (await request('/api/projects', 'POST', { name: 'Empty' })).json();
    assert.equal(empty.total_count, 0);
    assert.equal(empty.completed_count, 0);
    for (const archived of [1, 'true', null]) {
      assert.equal((await request(projectPath, 'PATCH', { archived })).status, 400);
    }
    assert.equal((await request('/api/projects/9999', 'PATCH', { archived: true })).status, 404);
    const archived = { ...original, archived: true };
    assert.deepEqual(await (await request(projectPath, 'PATCH', { archived: true })).json(), archived);
    assert.deepEqual(await (await request('/api/projects')).json(), [archived, empty]);
    assert.equal((await request(tasksPath, 'POST', { title: 'Blocked' })).status, 409);
    assert.equal((await request(`${tasksPath}/1`, 'PATCH', { completed: false })).status, 409);
    assert.deepEqual(await (await request(tasksPath)).json(), tasks);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.deepEqual(await (await request(projectPath)).json(), archived);
    assert.deepEqual(await (await request(tasksPath)).json(), tasks);
    assert.deepEqual(await (await request(projectPath, 'PATCH', { archived: false })).json(), original);
    assert.equal((await request(`${tasksPath}/2`, 'PATCH', { completed: true })).status, 200);
    assert.equal((await request(tasksPath, 'POST', { title: 'After restore' })).status, 201);
    const restored = { ...original, total_count: 3, completed_count: 2 };
    assert.deepEqual(await (await request(projectPath)).json(), restored);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.deepEqual(await (await request('/api/projects')).json(), [restored, empty]);
    const savedTasks = await (await request(tasksPath)).json();
    assert.equal(savedTasks.length, 3);
    assert.deepEqual(savedTasks.map((task) => task.completed), [true, true, false]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('renaming preserves identity, order, tasks, summaries, and archive protection across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const databasePath = join(directory, 'test.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const request = (path, method = 'GET', body) => fetch(server.base + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const first = await (await request('/api/projects', 'POST', { name: 'Original' })).json();
    const second = await (await request('/api/projects', 'POST', { name: 'Second' })).json();
    const projectPath = `/api/projects/${first.id}`;
    const tasksPath = `${projectPath}/tasks`;
    const task = await (await request(tasksPath, 'POST', { title: 'Keep me' })).json();
    await request(`${tasksPath}/${task.id}`, 'PATCH', { completed: true });
    await request(tasksPath, 'POST', { title: 'Still open' });
    const tasks = await (await request(tasksPath)).json();
    const original = { ...first, total_count: 2, completed_count: 1 };
    for (const name of ['', ' \t\n ', null, 42]) {
      const response = await request(projectPath, 'PATCH', { name });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
      assert.deepEqual(await (await request(projectPath)).json(), original);
    }
    assert.equal((await request('/api/projects/999999', 'PATCH', { name: 'Missing' })).status, 404);
    const renamed = { ...original, name: 'New name' };
    const response = await request(projectPath, 'PATCH', { name: '  New name \t' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), renamed);
    assert.deepEqual(await (await request('/api/projects')).json(), [renamed, second]);
    assert.deepEqual(await (await request(tasksPath)).json(), tasks);
    assert.equal((await request(`/projects/${first.id}`)).status, 200);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.deepEqual(await (await request(projectPath)).json(), renamed);
    assert.deepEqual(await (await request('/api/projects')).json(), [renamed, second]);
    await request(projectPath, 'PATCH', { archived: true });
    for (const body of [{ name: 'Blocked' }, { name: 'Blocked', archived: false }]) {
      assert.equal((await request(projectPath, 'PATCH', body)).status, 409);
    }
    assert.deepEqual(await (await request(projectPath)).json(), { ...renamed, archived: true });
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.deepEqual(await (await request(projectPath)).json(), { ...renamed, archived: true });
    await request(projectPath, 'PATCH', { archived: false });
    const restored = { ...renamed, name: '<b>Restored name</b>' };
    assert.deepEqual(await (await request(projectPath, 'PATCH', { name: restored.name })).json(), restored);
    assert.deepEqual(await (await request(tasksPath)).json(), tasks);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.deepEqual(await (await request('/api/projects')).json(), [restored, second]);
    assert.deepEqual(await (await request(tasksPath)).json(), tasks);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task renaming preserves completion, ownership, order, and summaries across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  const databasePath = join(directory, 'test.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const request = (path, method = 'GET', body) => fetch(server.base + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const first = await (await request('/api/projects', 'POST', { name: 'First' })).json();
    const second = await (await request('/api/projects', 'POST', { name: 'Second' })).json();
    const projectPath = `/api/projects/${first.id}`;
    const tasksPath = `${projectPath}/tasks`;
    const otherPath = `/api/projects/${second.id}/tasks`;
    const open = await (await request(tasksPath, 'POST', { title: 'Open' })).json();
    const done = await (await request(tasksPath, 'POST', { title: 'Done' })).json();
    await request(`${tasksPath}/${done.id}`, 'PATCH', { completed: true });
    const summary = await (await request(projectPath)).json();
    const original = [open, { ...done, completed: true }];
    for (const title of ['', ' \t\n ', null, 42]) {
      const response = await request(`${tasksPath}/${done.id}`, 'PATCH', { title, completed: false });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
      assert.deepEqual(await (await request(tasksPath)).json(), original);
    }
    assert.equal((await request(`${otherPath}/${done.id}`, 'PATCH', { title: 'Wrong owner' })).status, 404);
    assert.equal((await request(`${tasksPath}/99999`, 'PATCH', { title: 'Missing' })).status, 404);
    assert.equal((await request(`${tasksPath}/${done.id}`, 'PATCH', { title: 'Invalid', completed: 'true' })).status, 400);
    const renamed = [
      { ...open, title: 'Renamed open' },
      { ...done, title: '<b>Renamed done</b>', completed: true },
    ];
    for (const task of renamed) {
      const response = await request(`${tasksPath}/${task.id}`, 'PATCH', { title: `  ${task.title}\t ` });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), task);
    }
    assert.deepEqual(await (await request(tasksPath)).json(), renamed);
    assert.deepEqual(await (await request(otherPath)).json(), []);
    assert.deepEqual(await (await request(projectPath)).json(), summary);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.deepEqual(await (await request(tasksPath)).json(), renamed);
    assert.deepEqual(await (await request(projectPath)).json(), summary);
    await request(projectPath, 'PATCH', { archived: true });
    assert.equal((await request(`${tasksPath}/${done.id}`, 'PATCH', { title: 'Blocked' })).status, 409);
    assert.deepEqual(await (await request(tasksPath)).json(), renamed);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal((await request(`${tasksPath}/${done.id}`, 'PATCH', { title: 'Still blocked' })).status, 409);
    await request(projectPath, 'PATCH', { archived: false });
    const restored = { ...renamed[1], title: 'Restored title' };
    assert.deepEqual(await (await request(`${tasksPath}/${done.id}`, 'PATCH', { title: restored.title })).json(), restored);
    assert.deepEqual(await (await request(projectPath)).json(), summary);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.deepEqual(await (await request(tasksPath)).json(), [renamed[0], restored]);
    assert.deepEqual(await (await request(otherPath)).json(), []);
    assert.deepEqual(await (await request(projectPath)).json(), summary);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('priority defaults, validation, independence, archive protection, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  const databasePath = join(directory, 'test.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Existing'), ('Other');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Done', 1), (1, 'Open', 0), (2, 'Other task', 0);
  `);
  legacy.close();
  let server;
  try {
    server = await start(databasePath);
    const request = (path, method = 'GET', body) => fetch(server.base + path, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const projectPath = '/api/projects/1';
    const tasksPath = `${projectPath}/tasks`;
    const taskPath = `${tasksPath}/1`;
    const original = await (await request(tasksPath)).json();
    assert.deepEqual(original, [
      { id: 1, title: 'Done', completed: true, priority: 'Normal', due_date: '' },
      { id: 2, title: 'Open', completed: false, priority: 'Normal', due_date: '' },
    ]);
    const created = await (await request(tasksPath, 'POST', { title: 'New' })).json();
    assert.equal(created.priority, 'Normal');
    const summary = await (await request(projectPath)).json();
    const other = await (await request('/api/projects/2/tasks')).json();
    assert.equal((await request('/api/projects/2/tasks/1', 'PATCH', { priority: 'High' })).status, 404);
    for (const priority of ['', 'high', ' High ', null, 42]) {
      const response = await request(taskPath, 'PATCH', { priority, title: 'Not saved', completed: false });
      assert.equal(response.status, 400);
      assert.deepEqual(await (await request(tasksPath)).json(), [...original, created]);
    }
    for (const priority of ['Low', 'Normal', 'High']) {
      const response = await request(taskPath, 'PATCH', { priority });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ...original[0], priority });
    }
    const renamed = { ...original[0], title: 'Renamed', priority: 'High' };
    assert.deepEqual(await (await request(taskPath, 'PATCH', { title: ' Renamed ' })).json(), renamed);
    assert.deepEqual(await (await request(`${tasksPath}/2`, 'PATCH', { priority: 'Low' })).json(), { ...original[1], priority: 'Low' });
    const expected = [renamed, { ...original[1], priority: 'Low' }, created];
    assert.deepEqual(await (await request(tasksPath)).json(), expected);
    assert.deepEqual(await (await request(projectPath)).json(), summary);
    assert.deepEqual(await (await request('/api/projects/2/tasks')).json(), other);
    await request(projectPath, 'PATCH', { archived: true });
    assert.equal((await request(taskPath, 'PATCH', { priority: 'Normal' })).status, 409);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.deepEqual(await (await request(tasksPath)).json(), expected);
    assert.equal((await request(taskPath, 'PATCH', { priority: 'Normal' })).status, 409);
    await request(projectPath, 'PATCH', { archived: false });
    assert.deepEqual(await (await request(projectPath)).json(), summary);
    assert.deepEqual(await (await request(tasksPath)).json(), expected);
    const restored = { ...renamed, priority: 'Low' };
    assert.deepEqual(await (await request(taskPath, 'PATCH', { priority: 'Low' })).json(), restored);
    // Completion updates must preserve priority too.
    const completed = { ...restored, completed: false };
    assert.deepEqual(await (await request(taskPath, 'PATCH', { completed: false })).json(), completed);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.deepEqual(await (await request(tasksPath)).json(), [completed, expected[1], created]);
    assert.deepEqual(await (await request('/api/projects/2/tasks')).json(), other);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project default migration, inheritance, independence, validation, and persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-default-'));
  const databasePath = join(directory, 'test.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
    INSERT INTO projects (name) VALUES ('Existing'), ('Other');
    INSERT INTO tasks (project_id, title, completed, priority) VALUES
      (1, 'Done', 1, 'High'), (1, 'Open', 0, 'Low'), (2, 'Other task', 0, 'Normal');
  `);
  legacy.close();
  let server;
  try {
    server = await start(databasePath);
    const request = (path, method = 'GET', body) => fetch(server.base + path, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const projectPath = '/api/projects/1';
    const tasksPath = `${projectPath}/tasks`;
    const original = await (await request(projectPath)).json();
    assert.equal(original.default_task_priority, 'Normal');
    const other = await (await request('/api/projects/2')).json();
    assert.equal(other.default_task_priority, 'Normal');
    const otherTasks = await (await request('/api/projects/2/tasks')).json();
    const fresh = await (await request('/api/projects', 'POST', { name: 'Fresh' })).json();
    assert.equal(fresh.default_task_priority, 'Normal');
    const tasks = await (await request(tasksPath)).json();
    assert.deepEqual(tasks.map((task) => task.priority), ['High', 'Low']);
    const first = await (await request(tasksPath, 'POST', { title: 'Normal task' })).json();
    assert.equal(first.priority, 'Normal');
    tasks.push(first);
    let expected = { ...original, total_count: 3 };
    for (const default_task_priority of ['', 'high', ' High ', null, 42]) {
      const response = await request(projectPath, 'PATCH', { default_task_priority, name: 'Not saved' });
      assert.equal(response.status, 400);
      assert.deepEqual(await (await request(projectPath)).json(), expected);
    }
    assert.equal((await request('/api/projects/9999', 'PATCH', { default_task_priority: 'High' })).status, 404);
    for (const priority of ['Low', 'Normal', 'High']) {
      expected = { ...expected, default_task_priority: priority };
      const response = await request(projectPath, 'PATCH', { default_task_priority: priority });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), expected);
      assert.deepEqual(await (await request(tasksPath)).json(), tasks);
      const task = await (await request(tasksPath, 'POST', { title: `${priority} inherited` })).json();
      assert.equal(task.priority, priority);
      assert.equal(task.completed, false);
      tasks.push(task);
      expected = { ...expected, total_count: tasks.length };
    }
    assert.deepEqual(await (await request('/api/projects/2')).json(), other);
    assert.deepEqual(await (await request('/api/projects/2/tasks')).json(), otherTasks);
    expected = { ...expected, name: 'Renamed' };
    assert.deepEqual(await (await request(projectPath, 'PATCH', { name: ' Renamed ' })).json(), expected);
    await request(projectPath, 'PATCH', { archived: true });
    for (const body of [{ default_task_priority: 'Low' }, { default_task_priority: 'Low', archived: false }]) {
      assert.equal((await request(projectPath, 'PATCH', body)).status, 409);
    }
    assert.deepEqual(await (await request(projectPath)).json(), { ...expected, archived: true });
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.deepEqual(await (await request(projectPath)).json(), { ...expected, archived: true });
    assert.deepEqual(await (await request(tasksPath)).json(), tasks);
    assert.equal((await request(projectPath, 'PATCH', { default_task_priority: 'Low' })).status, 409);
    assert.deepEqual(await (await request(projectPath, 'PATCH', { archived: false })).json(), expected);
    const inherited = await (await request(tasksPath, 'POST', { title: 'After restart and restore' })).json();
    assert.equal(inherited.priority, 'High');
    tasks.push(inherited);
    expected = { ...expected, total_count: tasks.length, default_task_priority: 'Low' };
    assert.deepEqual(await (await request(projectPath, 'PATCH', { default_task_priority: 'Low' })).json(), expected);
    assert.deepEqual(await (await request(tasksPath)).json(), tasks);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.deepEqual(await (await request(projectPath)).json(), expected);
    assert.deepEqual(await (await request(tasksPath)).json(), tasks);
    assert.deepEqual(await (await request('/api/projects/2')).json(), other);
    assert.deepEqual(await (await request('/api/projects/2/tasks')).json(), otherTasks);
    const next = await (await request(tasksPath, 'POST', { title: 'Saved Low default' })).json();
    assert.equal(next.priority, 'Low');
    const independent = await (await request('/api/projects/2/tasks', 'POST', { title: 'Independent default' })).json();
    assert.equal(independent.priority, 'Normal');
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('due date migration, atomic validation, independence, preservation, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-due-date-'));
  const databasePath = join(directory, 'test.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Existing'), ('Other');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Done', 1), (2, 'Other task', 0);
  `);
  legacy.close();
  let server;
  try {
    server = await start(databasePath);
    const request = (path, method = 'GET', body) => fetch(server.base + path, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const projectPath = '/api/projects/1';
    const tasksPath = `${projectPath}/tasks`;
    const taskPath = `${tasksPath}/1`;
    const original = (await (await request(tasksPath)).json())[0];
    assert.equal(original.due_date, '');
    const created = await (await request(tasksPath, 'POST', { title: 'New' })).json();
    assert.equal(created.due_date, '');
    const otherTasks = await (await request('/api/projects/2/tasks')).json();
    const summary = await (await request(projectPath)).json();
    let saved = { ...original, due_date: '2000-02-29' };
    const response = await request(taskPath, 'PATCH', { due_date: ' 2000-02-29 \t' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), saved);
    for (const due_date of ['1900-02-29', '0000-01-01', '2024-04-31', '2024-1-01', null, 42]) {
      const invalid = await request(taskPath, 'PATCH', { due_date, title: 'Not saved', completed: false, priority: 'Low' });
      assert.equal(invalid.status, 400);
      assert.deepEqual(await invalid.json(), { error: 'Due date must be a valid YYYY-MM-DD date' });
      assert.deepEqual(await (await request(tasksPath)).json(), [saved, created]);
    }
    assert.equal((await request('/api/projects/2/tasks/1', 'PATCH', { due_date: '2024-01-01' })).status, 404);
    saved = { ...saved, title: 'Renamed', priority: 'High' };
    assert.deepEqual(await (await request(taskPath, 'PATCH', { title: ' Renamed ', priority: 'High' })).json(), saved);
    await request(taskPath, 'PATCH', { completed: false });
    assert.deepEqual(await (await request(taskPath, 'PATCH', { completed: true })).json(), saved);
    assert.deepEqual(await (await request(projectPath)).json(), summary);
    assert.deepEqual(await (await request('/api/projects/2/tasks')).json(), otherTasks);
    await request(projectPath, 'PATCH', { archived: true });
    assert.equal((await request(taskPath, 'PATCH', { due_date: '' })).status, 409);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.deepEqual(await (await request(tasksPath)).json(), [saved, created]);
    assert.equal((await request(taskPath, 'PATCH', { due_date: '2024-01-01' })).status, 409);
    await request(projectPath, 'PATCH', { archived: false });
    assert.deepEqual(await (await request(projectPath)).json(), summary);
    saved = { ...saved, due_date: '' };
    assert.deepEqual(await (await request(taskPath, 'PATCH', { due_date: ' \t\n ' })).json(), saved);
    const next = { ...created, due_date: '0001-01-01' };
    assert.deepEqual(await (await request(`${tasksPath}/${created.id}`, 'PATCH', { due_date: next.due_date })).json(), next);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.deepEqual(await (await request(tasksPath)).json(), [saved, next]);
    assert.deepEqual(await (await request(projectPath)).json(), summary);
    assert.deepEqual(await (await request('/api/projects/2/tasks')).json(), otherTasks);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task validation, project isolation, completion updates, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const databasePath = join(directory, 'test.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const request = (path, method = 'GET', body) => fetch(server.base + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const first = await (await request('/api/projects', 'POST', { name: 'First' })).json();
    const second = await (await request('/api/projects', 'POST', { name: 'Second' })).json();
    const tasksPath = `/api/projects/${first.id}/tasks`;
    const otherPath = `/api/projects/${second.id}/tasks`;
    for (const title of ['', ' \t\n ', null, 42]) {
      const response = await request(tasksPath, 'POST', { title });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await (await request(tasksPath)).json(), []);
    const created = await request(tasksPath, 'POST', { title: '  First task  ' });
    assert.equal(created.status, 201);
    const task = await created.json();
    assert.equal(task.title, 'First task');
    assert.equal(task.completed, false);
    const next = await (await request(tasksPath, 'POST', { title: '<b>Next</b>' })).json();
    assert.deepEqual(await (await request(tasksPath)).json(), [task, next]);
    assert.deepEqual(await (await request(otherPath)).json(), []);
    assert.equal((await request(`${otherPath}/${task.id}`, 'PATCH', { completed: true })).status, 404);
    assert.equal((await request('/api/projects/999999/tasks', 'POST', { title: 'Missing' })).status, 404);
    for (const completed of [1, 'true', null]) {
      assert.equal((await request(`${tasksPath}/${task.id}`, 'PATCH', { completed })).status, 400);
    }
    assert.equal((await request(`${tasksPath}/999999`, 'PATCH', { completed: true })).status, 404);
    for (const completed of [true, false, true]) {
      const response = await request(`${tasksPath}/${task.id}`, 'PATCH', { completed });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ...task, completed });
    }
    const expected = [{ ...task, completed: true }, next];
    assert.deepEqual(await (await request(tasksPath)).json(), expected);
    const malformed = await fetch(server.base + tasksPath, { method: 'POST', body: '{' });
    assert.equal(malformed.status, 400);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.deepEqual(await (await request(tasksPath)).json(), expected);
    assert.deepEqual(await (await request(otherPath)).json(), []);
    assert.equal((await request(`/projects/${first.id}`)).status, 200);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('moves append on first arrival, restore return order, preserve data, and reject ineligible projects', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-move-'));
  const databasePath = join(directory, 'test.sqlite');
  // Ordering migrates from IDs without losing existing tasks.
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Source'), ('Destination'), ('Archived');
    INSERT INTO tasks (project_id, title, completed) VALUES
      (1, 'First', 1), (1, 'Second', 0), (2, 'Destination existing', 0);
  `);
  legacy.close();
  let server;
  try {
    server = await start(databasePath);
    const request = (path, method = 'GET', body) => fetch(server.base + path, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const value = async (path, method = 'GET', body) => {
      const response = await request(path, method, body);
      assert.ok(response.ok, await response.clone().text());
      return response.json();
    };
    const tasks = (id) => value(`/api/projects/${id}/tasks`);
    const move = (source, task, destination) => request(`/api/projects/${source}/tasks/${task}/move`, 'POST', {
      destination_project_id: destination,
    });
    await value('/api/projects/2', 'PATCH', { default_task_priority: 'Low', name: 'Renamed destination' });
    await value('/api/projects/3', 'PATCH', { archived: true });
    const first = await value('/api/projects/1/tasks/1', 'PATCH', { priority: 'High', due_date: '0001-01-01', title: 'Renamed task' });
    const second = (await tasks(1))[1];
    const existing = (await tasks(2))[0];
    for (const [destination, status] of [[1, 400], [3, 409], [9999, 404], [null, 400], ['2', 400]]) {
      assert.equal((await move(1, first.id, destination)).status, status);
      assert.deepEqual(await tasks(1), [first, second]);
      assert.deepEqual(await tasks(2), [existing]);
    }
    assert.equal((await move(1, 9999, 2)).status, 404);
    assert.equal((await move(9999, first.id, 2)).status, 404);
    assert.deepEqual(await (await move(1, first.id, 2)).json(), first);
    assert.deepEqual(await tasks(1), [second]);
    assert.deepEqual(await tasks(2), [existing, first]);
    assert.equal((await move(1, first.id, 2)).status, 404);
    const summaries = await value('/api/projects');
    assert.deepEqual(summaries.map((project) => [project.completed_count, project.total_count]), [[0, 1], [1, 2], [0, 0]]);
    const appended = await value('/api/projects/2/tasks', 'POST', { title: 'New after move' });
    assert.equal(appended.priority, 'Low');
    assert.deepEqual(await tasks(2), [existing, first, appended]);
    await value('/api/projects/2', 'PATCH', { archived: true });
    assert.equal((await move(2, first.id, 1)).status, 409);
    await value('/api/projects/2', 'PATCH', { archived: false });
    assert.deepEqual(await (await move(2, first.id, 1)).json(), first);
    assert.deepEqual(await tasks(1), [first, second]);
    assert.deepEqual(await (await move(1, second.id, 2)).json(), second); // Blank due date preserved.
    assert.deepEqual(await tasks(2), [existing, appended, second]);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.deepEqual(await tasks(1), [first]);
    assert.deepEqual(await tasks(2), [existing, appended, second]);
    assert.deepEqual(await (await move(2, second.id, 1)).json(), second);
    assert.deepEqual(await tasks(1), [first, second]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('remembered positions survive reverse returns, empty projects, renames, archives, and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-return-order-'));
  const databasePath = join(directory, 'test.sqlite');
  // Task 011 data can have an order unlike global task IDs after movement.
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('A'), ('B'), ('C');
    INSERT INTO tasks (project_id, title, completed, position) VALUES
      (1, 'Later', 0, 8), (1, 'Earlier', 1, 4), (2, 'B existing', 0, 1);
  `);
  legacy.close();
  let server;
  try {
    server = await start(databasePath);
    const request = (path, method = 'GET', body) => fetch(server.base + path, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const value = async (path, method = 'GET', body) => {
      const response = await request(path, method, body);
      assert.ok(response.ok, await response.clone().text());
      return response.json();
    };
    const tasks = (project) => value(`/api/projects/${project}/tasks`);
    const ids = async (project) => (await tasks(project)).map((task) => task.id);
    const move = (source, task, destination) => value(`/api/projects/${source}/tasks/${task}/move`, 'POST', {
      destination_project_id: destination,
    });
    const create = (project, title) => value(`/api/projects/${project}/tasks`, 'POST', { title });
    const patch = (project, body) => value(`/api/projects/${project}`, 'PATCH', body);
    assert.deepEqual(await ids(1), [2, 1]);
    await move(1, 2, 2);
    await move(1, 1, 2);
    assert.deepEqual(await ids(1), []);
    assert.deepEqual(await ids(2), [3, 2, 1]);
    // Even an empty source must append beyond its reserved positions.
    const newA = await create(1, 'New A');
    // First arrival also appends beyond reservations left by absent tasks.
    await move(2, 3, 1);
    await patch(1, { name: 'Renamed A' });
    const latest = await value('/api/projects/2/tasks/2', 'PATCH', {
      title: 'Latest title', completed: false, priority: 'High', due_date: '2024-02-29',
    });
    await patch(1, { archived: true });
    const blocked = await request('/api/projects/2/tasks/2/move', 'POST', { destination_project_id: 1 });
    assert.equal(blocked.status, 409);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.deepEqual(await ids(1), [newA.id, 3]);
    assert.deepEqual(await ids(2), [2, 1]);
    await patch(1, { archived: false });
    // Return in reverse order, including after a restart between returns.
    await move(2, 1, 1);
    assert.deepEqual(await ids(1), [1, newA.id, 3]);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.deepEqual(await move(2, 2, 1), latest);
    assert.deepEqual(await ids(1), [2, 1, newA.id, 3]);
    const summaries = await value('/api/projects');
    assert.deepEqual(summaries.map((p) => [p.completed_count, p.total_count]), [[0, 4], [0, 0], [0, 0]]);
    // Another project's history is independent, with reversed first arrivals.
    await move(1, 1, 3);
    await move(1, 2, 3);
    assert.deepEqual(await ids(3), [1, 2]);
    await move(3, 1, 2);
    await move(3, 2, 2);
    assert.deepEqual(await ids(2), [2, 1]);
    const newB = await create(2, 'New B');
    await move(1, 3, 2);
    assert.deepEqual(await ids(2), [3, 2, 1, newB.id]);
    await move(2, 2, 3);
    await move(2, 1, 3);
    assert.deepEqual(await ids(3), [1, 2]);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.deepEqual(await ids(3), [1, 2]);
    assert.deepEqual((await tasks(3))[1], latest);
    await move(3, 1, 1);
    await move(3, 2, 1);
    assert.deepEqual(await ids(1), [2, 1, newA.id]);
    assert.deepEqual(await ids(2), [3, newB.id]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
