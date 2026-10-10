import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stderr.on('data', (data) => { logs += data; });
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${logs}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${logs}`)); });
    child.stdout.on('data', (data) => {
      const match = /listening on port (\d+)/.exec(String(data));
      if (match) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
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

test('project validation, creation order, routes and persistence across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let server;
  try {
    const databasePath = join(directory, 'nested', 'projects.sqlite');
    server = await start(databasePath);
    const request = (path, options) => fetch(server.base + path, options);
    const create = (name) => request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const health = await request('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    for (const name of ['', ' \t\n ', null, 23]) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await request('/api/projects')).json(), []);
    const firstResponse = await create('  First project \n');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('<script>Second</script>')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await (await request('/api/projects')).json(), [first, second]);
    assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), first);
    assert.equal((await request('/api/projects/99999')).status, 404);
    const invalidJson = await request('/api/projects', { method: 'POST', body: '{' });
    assert.equal(invalidJson.status, 400);
    assert.equal((await request('/api/projects', { method: 'POST', body: 'x'.repeat(65537) })).status, 413);
    const html = await (await request('/')).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, /Create project/);
    assert.match(html, /role="alert"/);
    assert.equal(await (await request(`/projects/${first.id}`)).text(), html);
    assert.match(await (await request('/app.js')).text(), /row.dataset.testid = 'project-row'/);
    assert.equal((await request('/styles.css')).status, 200);
    assert.equal((await request('/missing')).status, 404);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request('/api/projects')).json(), [first, second]);
    assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), first);
    const third = await (await create('Third')).json();
    assert.ok(third.id > second.id);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate titles, remain project-owned, and persist completion across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-test-'));
  let server;
  try {
    const databasePath = join(directory, 'workboard.sqlite');
    server = await start(databasePath);
    const request = (path, method = 'GET', body) => fetch(server.base + path, {
      method,
      ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    });
    const firstProject = await (await request('/api/projects', 'POST', { name: 'First' })).json();
    const secondProject = await (await request('/api/projects', 'POST', { name: 'Second' })).json();
    const firstPath = `/api/projects/${firstProject.id}/tasks`;
    const secondPath = `/api/projects/${secondProject.id}/tasks`;
    for (const title of ['', ' \t\n ', null, 42]) {
      const response = await request(firstPath, 'POST', { title });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await (await request(firstPath)).json(), []);
    const created = await request(firstPath, 'POST', { title: '  First task \n' });
    assert.equal(created.status, 201);
    const firstTask = await created.json();
    assert.equal(firstTask.title, 'First task');
    assert.equal(firstTask.completed, false);
    const secondTask = await (await request(firstPath, 'POST', { title: '<b>Second task</b>' })).json();
    assert.ok(secondTask.id > firstTask.id);
    assert.deepEqual(await (await request(firstPath)).json(), [firstTask, secondTask]);
    assert.deepEqual(await (await request(secondPath)).json(), []);
    assert.equal((await request(`${secondPath}/${firstTask.id}`, 'PATCH', { completed: true })).status, 404);
    assert.equal((await request('/api/projects/99999/tasks')).status, 404);
    assert.equal((await request('/api/projects/99999/tasks', 'POST', { title: 'Orphan' })).status, 404);
    assert.equal((await request(`${firstPath}/99999`, 'PATCH', { completed: true })).status, 404);
    for (const completed of [null, 'true', 1]) {
      assert.equal((await request(`${firstPath}/${firstTask.id}`, 'PATCH', { completed })).status, 400);
    }
    const complete = await request(`${firstPath}/${firstTask.id}`, 'PATCH', { completed: true });
    assert.equal(complete.status, 200);
    assert.deepEqual(await complete.json(), { ...firstTask, completed: true });
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(firstPath)).json(), [{ ...firstTask, completed: true }, secondTask]);
    assert.deepEqual(await (await request(secondPath)).json(), []);
    assert.equal((await request(`/projects/${firstProject.id}`)).status, 200);
    const reopened = await request(`${firstPath}/${firstTask.id}`, 'PATCH', { completed: false });
    assert.deepEqual(await reopened.json(), firstTask);
    const otherTask = await (await request(secondPath, 'POST', { title: 'Other project task' })).json();
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(firstPath)).json(), [firstTask, secondTask]);
    assert.deepEqual(await (await request(secondPath)).json(), [otherTask]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('existing databases migrate; archives, restoration and summaries persist without losing tasks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-test-'));
  let server;
  try {
    const databasePath = join(directory, 'workboard.sqlite');
    const legacy = new DatabaseSync(databasePath);
    legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (name) VALUES ('Existing project');
      INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Saved completed task', 1), (1, 'Saved open task', 0)`);
    legacy.close();
    server = await start(databasePath);
    const request = (path, method = 'GET', body) => fetch(server.base + path, {
      method,
      ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    });
    const read = async (path) => (await request(path)).json();
    const projectPath = '/api/projects/1';
    const tasksPath = `${projectPath}/tasks`;
    const existing = { id: 1, name: 'Existing project', archived: false, completed: 1, total: 2 };
    assert.deepEqual(await read('/api/projects'), [existing]);
    const savedTasks = await read(tasksPath);
    const empty = await (await request('/api/projects', 'POST', { name: 'Empty' })).json();
    assert.equal(empty.completed, 0);
    assert.equal(empty.total, 0);
    assert.equal((await request('/api/projects?filter=unknown')).status, 400);
    assert.equal((await request('/api/projects/9999', 'PATCH', { archived: true })).status, 404);
    for (const archived of [null, 'true', 1]) {
      assert.equal((await request(projectPath, 'PATCH', { archived })).status, 400);
    }
    assert.deepEqual(await read(projectPath), existing);
    const archived = await request(projectPath, 'PATCH', { archived: true });
    assert.equal(archived.status, 200);
    assert.deepEqual(await archived.json(), { ...existing, archived: true });
    assert.deepEqual(await read('/api/projects'), [empty]);
    assert.deepEqual(await read('/api/projects?filter=archived'), [{ ...existing, archived: true }]);
    assert.deepEqual(await read(tasksPath), savedTasks);
    assert.equal((await request(tasksPath, 'POST', { title: 'Blocked task' })).status, 409);
    assert.equal((await request(`${tasksPath}/1`, 'PATCH', { completed: false })).status, 409);
    assert.deepEqual(await read(tasksPath), savedTasks);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await read(projectPath), { ...existing, archived: true });
    assert.deepEqual(await read('/api/projects?filter=archived'), [{ ...existing, archived: true }]);
    assert.deepEqual(await read(tasksPath), savedTasks);
    assert.equal((await request('/projects/1')).status, 200);
    const restored = await request(projectPath, 'PATCH', { archived: false });
    assert.deepEqual(await restored.json(), existing);
    assert.deepEqual(await read('/api/projects'), [existing, empty]);
    assert.deepEqual(await read('/api/projects?filter=archived'), []);
    assert.deepEqual(await read(tasksPath), savedTasks);
    await request(`${tasksPath}/2`, 'PATCH', { completed: true });
    assert.deepEqual(await read(projectPath), { ...existing, completed: 2 });
    await request(tasksPath, 'POST', { title: 'New open task' });
    assert.deepEqual(await read(projectPath), { ...existing, completed: 2, total: 3 });
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await read('/api/projects'), [{ ...existing, completed: 2, total: 3 }, empty]);
    assert.deepEqual((await read(tasksPath)).map((task) => task.completed), [true, true, false]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
