import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
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
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server failed to start: ${errors}`));
    }, 5000);
    child.once('exit', () => {
      clearTimeout(timer);
      reject(new Error(`Server exited: ${errors}`));
    });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) {
        clearTimeout(timer);
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

test('projects and tasks validate input, isolate ownership, and persist across restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const request = (path, options) => fetch(server.url + path, options);
    const create = (name) => request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const health = await request('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.deepEqual(await (await request('/api/projects')).json(), []);
    for (const name of ['', '   \t\n']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await request('/api/projects')).json(), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('<script>second</script>')).json();
    assert.ok(second.id > first.id);
    const expected = [first, second];
    assert.deepEqual(await (await request('/api/projects')).json(), expected);
    assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), first);
    assert.equal((await request('/api/projects/99999')).status, 404);
    const page = await request(`/projects/${first.id}`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<script type="module" src="\/app.js"><\/script>/);
    assert.equal((await request('/app.js')).status, 200);
    assert.equal((await request('/styles.css')).status, 200);
    const tasksPath = `/api/projects/${first.id}/tasks`;
    const otherTasksPath = `/api/projects/${second.id}/tasks`;
    const createTask = (title, path = tasksPath) => request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const completeTask = (id, completed, path = tasksPath) => request(`${path}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed }),
    });
    assert.deepEqual(await (await request(tasksPath)).json(), []);
    for (const title of ['', ' \t\n ']) {
      const response = await createTask(title);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await (await request(tasksPath)).json(), []);
    const taskResponse = await createTask('  First task  ');
    assert.equal(taskResponse.status, 201);
    const firstTask = await taskResponse.json();
    assert.equal(firstTask.title, 'First task');
    assert.equal(firstTask.completed, false);
    const secondTask = await (await createTask('Second task')).json();
    assert.ok(secondTask.id > firstTask.id);
    assert.deepEqual(await (await request(otherTasksPath)).json(), []);
    const otherTask = await (await createTask('Other project task', otherTasksPath)).json();
    assert.equal((await completeTask(firstTask.id, true, otherTasksPath)).status, 404);
    assert.equal((await createTask('Missing project', '/api/projects/99999/tasks')).status, 404);
    assert.equal((await completeTask(firstTask.id, 'true')).status, 400);
    assert.deepEqual(await (await completeTask(firstTask.id, true)).json(), { ...firstTask, completed: true });
    assert.deepEqual(await (await completeTask(firstTask.id, false)).json(), firstTask);
    assert.equal((await completeTask(secondTask.id, true)).status, 200);
    const expectedTasks = [firstTask, { ...secondTask, completed: true }];
    assert.deepEqual(await (await request(tasksPath)).json(), expectedTasks);
    assert.deepEqual(await (await request(otherTasksPath)).json(), [otherTask]);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    const firstWithTasks = { ...first, totalCount: 2, completedCount: 1 };
    const secondWithTasks = { ...second, totalCount: 1, completedCount: 0 };
    assert.deepEqual(await (await request('/api/projects')).json(), [firstWithTasks, secondWithTasks]);
    assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), firstWithTasks);
    assert.deepEqual(await (await request(tasksPath)).json(), expectedTasks);
    assert.deepEqual(await (await request(otherTasksPath)).json(), [otherTask]);
    assert.equal((await request(`/projects/${first.id}`)).status, 200);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive and restore preserve tasks and summaries, including an existing database migration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const databasePath = join(directory, 'legacy.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)));
    INSERT INTO projects (name) VALUES ('Existing'), ('Empty');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Open task', 0), (1, 'Done task', 1);
  `);
  legacy.close();
  let server;
  try {
    server = await start(databasePath);
    const request = (path, options) => fetch(server.url + path, options);
    const patch = (path, body) => request(path, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const active = { id: 1, name: 'Existing', archived: false, totalCount: 2, completedCount: 1 };
    const empty = { id: 2, name: 'Empty', archived: false, totalCount: 0, completedCount: 0 };
    const archived = { ...active, archived: true };
    const tasks = await (await request('/api/projects/1/tasks')).json();
    assert.deepEqual(await (await request('/api/projects')).json(), [active, empty]);
    assert.equal((await patch('/api/projects/1', { archived: 'true' })).status, 400);
    assert.equal((await patch('/api/projects/99999', { archived: true })).status, 404);
    assert.deepEqual(await (await patch('/api/projects/1', { archived: true })).json(), archived);
    const blockedCreate = await request('/api/projects/1/tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Blocked' }),
    });
    assert.equal(blockedCreate.status, 409);
    assert.equal((await patch('/api/projects/1/tasks/1', { completed: true })).status, 409);
    assert.deepEqual(await (await request('/api/projects/1/tasks')).json(), tasks);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.deepEqual(await (await request('/api/projects')).json(), [archived, empty]);
    assert.deepEqual(await (await request('/api/projects/1')).json(), archived);
    assert.equal((await request('/projects/1')).status, 200);
    assert.deepEqual(await (await request('/api/projects/1/tasks')).json(), tasks);
    assert.deepEqual(await (await patch('/api/projects/1', { archived: false })).json(), active);
    assert.equal((await patch('/api/projects/1/tasks/1', { completed: true })).status, 200);
    const completed = { ...active, completedCount: 2 };
    assert.deepEqual(await (await request('/api/projects/1')).json(), completed);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.deepEqual(await (await request('/api/projects')).json(), [completed, empty]);
    assert.deepEqual(await (await request('/api/projects/1/tasks')).json(), tasks.map((task) => ({ ...task, completed: true })));
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('renaming preserves project identity, order, tasks, and summaries across restarts and restoration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const databasePath = join(directory, 'projects.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const request = (path, method = 'GET', body) => fetch(server.url + path, {
      method,
      ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }),
    });
    const first = await (await request('/api/projects', 'POST', { name: 'Original' })).json();
    const second = await (await request('/api/projects', 'POST', { name: 'Second' })).json();
    const projectPath = `/api/projects/${first.id}`;
    const tasksPath = `${projectPath}/tasks`;
    const openTask = await (await request(tasksPath, 'POST', { title: 'Open task' })).json();
    const doneTask = await (await request(tasksPath, 'POST', { title: 'Done task' })).json();
    await request(`${tasksPath}/${doneTask.id}`, 'PATCH', { completed: true });
    const tasks = [openTask, { ...doneTask, completed: true }];
    const original = { ...first, totalCount: 2, completedCount: 1 };
    for (const name of ['', ' \t\n ', null, 123]) {
      const invalid = await request(projectPath, 'PATCH', { name });
      assert.equal(invalid.status, 400);
      assert.deepEqual(await invalid.json(), { error: 'Project name is required' });
      assert.deepEqual(await (await request(projectPath)).json(), original);
    }
    assert.equal((await request('/api/projects/99999', 'PATCH', { name: 'Missing' })).status, 404);
    const rename = await request(projectPath, 'PATCH', { name: ' \tRenamed project\n ' });
    assert.equal(rename.status, 200);
    const renamed = { ...original, name: 'Renamed project' };
    assert.deepEqual(await rename.json(), renamed);
    assert.deepEqual(await (await request('/api/projects')).json(), [renamed, second]);
    assert.deepEqual(await (await request(tasksPath)).json(), tasks);
    assert.equal((await request(`/projects/${first.id}`)).status, 200);

    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.deepEqual(await (await request(projectPath)).json(), renamed);
    assert.deepEqual(await (await request('/api/projects')).json(), [renamed, second]);
    assert.deepEqual(await (await request(tasksPath)).json(), tasks);
    await request(projectPath, 'PATCH', { archived: true });
    const blocked = await request(projectPath, 'PATCH', { name: 'Blocked rename' });
    assert.equal(blocked.status, 409);
    assert.deepEqual(await blocked.json(), { error: 'Archived project' });
    assert.deepEqual(await (await request(projectPath)).json(), { ...renamed, archived: true });
    await request(projectPath, 'PATCH', { archived: false });
    const restored = { ...renamed, name: 'Restored name' };
    assert.deepEqual(await (await request(projectPath, 'PATCH', { name: ' Restored name ' })).json(), restored);

    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.deepEqual(await (await request('/api/projects')).json(), [restored, second]);
    assert.deepEqual(await (await request(tasksPath)).json(), tasks);
    assert.equal((await request(`/projects/${first.id}`)).status, 200);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
