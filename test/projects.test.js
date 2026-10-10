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
    const original = { id: 1, name: 'Existing project', archived: false, default_task_priority: 'Normal', total_count: 1, completed_count: 1 };
    assert.deepEqual(await (await request(projectPath)).json(), original);
    const other = await (await request('/api/projects', 'POST', { name: 'Other project' })).json();
    assert.equal(other.total_count, 0);
    assert.equal(other.completed_count, 0);
    await request(taskPath, 'POST', { title: 'Open task' });
    const tasks = await (await request(taskPath)).json();
    assert.deepEqual(tasks.map((task) => task.priority), ['Normal', 'Normal']);
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

test('renaming preserves identity, creation order, tasks, and summaries across restarts and restoration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  let server;
  try {
    const databasePath = join(directory, 'workboard.sqlite');
    server = await start(databasePath);
    const request = (path, method = 'GET', body) => fetch(`${server.base}${path}`, {
      method, ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }),
    });
    const first = await (await request('/api/projects', 'POST', { name: 'Original name' })).json();
    const second = await (await request('/api/projects', 'POST', { name: 'Second project' })).json();
    const path = `/api/projects/${first.id}`;
    const taskPath = `${path}/tasks`;
    const completed = await (await request(taskPath, 'POST', { title: 'Completed task' })).json();
    await request(`${taskPath}/${completed.id}`, 'PATCH', { completed: true });
    await request(taskPath, 'POST', { title: 'Open task' });
    const tasks = await (await request(taskPath)).json();
    const original = { ...first, total_count: 2, completed_count: 1 };
    for (const name of ['', ' \t\n ', null, 42]) {
      const response = await request(path, 'PATCH', { name });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
      assert.deepEqual(await (await request(path)).json(), original);
    }
    assert.equal((await request('/api/projects/999999', 'PATCH', { name: 'Missing' })).status, 404);
    const renamed = { ...original, name: 'Renamed project' };
    const response = await request(path, 'PATCH', { name: '  Renamed project \n' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), renamed);
    assert.deepEqual(await (await request('/api/projects')).json(), [renamed, second]);
    assert.deepEqual(await (await request(taskPath)).json(), tasks);
    assert.equal((await request(`/projects/${first.id}`)).status, 200);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request('/api/projects')).json(), [renamed, second]);
    assert.deepEqual(await (await request(taskPath)).json(), tasks);
    const archived = { ...renamed, archived: true };
    assert.deepEqual(await (await request(path, 'PATCH', { archived: true })).json(), archived);
    const blocked = await request(path, 'PATCH', { name: 'Blocked rename' });
    assert.equal(blocked.status, 409);
    assert.deepEqual(await blocked.json(), { error: 'Archived project' });
    assert.deepEqual(await (await request(path)).json(), archived);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(path)).json(), archived);
    assert.deepEqual(await (await request(path, 'PATCH', { archived: false })).json(), renamed);
    const restored = { ...renamed, name: '<b>Restored project</b>' };
    assert.deepEqual(await (await request(path, 'PATCH', { name: restored.name })).json(), restored);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request('/api/projects')).json(), [restored, second]);
    assert.deepEqual(await (await request(taskPath)).json(), tasks);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task renaming preserves ownership, order, completion, and summaries through restart and restoration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  let server;
  try {
    const databasePath = join(directory, 'workboard.sqlite');
    server = await start(databasePath);
    const request = (path, method = 'GET', body) => fetch(`${server.base}${path}`, {
      method, ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }),
    });
    const project = await (await request('/api/projects', 'POST', { name: 'Rename tasks' })).json();
    const other = await (await request('/api/projects', 'POST', { name: 'Other project' })).json();
    const projectPath = `/api/projects/${project.id}`;
    const path = `${projectPath}/tasks`;
    const otherPath = `/api/projects/${other.id}/tasks`;
    const first = await (await request(path, 'POST', { title: 'Original title' })).json();
    const second = await (await request(path, 'POST', { title: 'Open task' })).json();
    const taskPath = `${path}/${first.id}`;
    const completed = { ...first, completed: true };
    assert.deepEqual(await (await request(taskPath, 'PATCH', { completed: true })).json(), completed);
    const summary = { ...project, total_count: 2, completed_count: 1 };
    for (const title of ['', ' \t\n ', null, 42]) {
      const response = await request(taskPath, 'PATCH', { title });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
      assert.deepEqual(await (await request(path)).json(), [completed, second]);
    }
    assert.equal((await request(`${otherPath}/${first.id}`, 'PATCH', { title: 'Wrong owner' })).status, 404);
    assert.equal((await request(`${path}/999999`, 'PATCH', { title: 'Missing task' })).status, 404);
    assert.equal((await request(taskPath, 'PATCH', { title: 'Invalid completion', completed: 'yes' })).status, 400);
    assert.deepEqual(await (await request(path)).json(), [completed, second]);
    const renamed = { ...completed, title: 'Renamed completed task' };
    const response = await request(taskPath, 'PATCH', { title: ' \tRenamed completed task\n ' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), renamed);
    const renamedOpen = { ...second, title: 'Renamed open task' };
    assert.deepEqual(await (await request(`${path}/${second.id}`, 'PATCH', { title: ' Renamed open task ' })).json(), renamedOpen);
    assert.deepEqual(await (await request(projectPath)).json(), summary);
    assert.deepEqual(await (await request(path)).json(), [renamed, renamedOpen]);
    assert.deepEqual(await (await request(otherPath)).json(), []);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(path)).json(), [renamed, renamedOpen]);
    assert.deepEqual(await (await request(projectPath)).json(), summary);
    await request(projectPath, 'PATCH', { archived: true });
    for (const task of [renamed, renamedOpen]) {
      const blocked = await request(`${path}/${task.id}`, 'PATCH', { title: 'Blocked rename' });
      assert.equal(blocked.status, 409);
      assert.deepEqual(await blocked.json(), { error: 'Archived project' });
    }
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(path)).json(), [renamed, renamedOpen]);
    assert.deepEqual(await (await request(projectPath)).json(), { ...summary, archived: true });
    await request(projectPath, 'PATCH', { archived: false });
    const restored = { ...renamed, title: '<b>Restored task</b>' };
    assert.deepEqual(await (await request(taskPath, 'PATCH', { title: restored.title })).json(), restored);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(path)).json(), [restored, renamedOpen]);
    assert.deepEqual(await (await request(otherPath)).json(), []);
    assert.deepEqual(await (await request(projectPath)).json(), summary);
    // Completion changes after a rename retain the new title.
    assert.deepEqual(await (await request(taskPath, 'PATCH', { completed: false })).json(), { ...restored, completed: false });
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('priorities persist independently and survive renaming, completion changes, and archive/restore', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  let server;
  try {
    const databasePath = join(directory, 'workboard.sqlite');
    server = await start(databasePath);
    const request = (path, method = 'GET', body) => fetch(`${server.base}${path}`, {
      method, ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }),
    });
    const project = await (await request('/api/projects', 'POST', { name: 'Priorities' })).json();
    const other = await (await request('/api/projects', 'POST', { name: 'Other' })).json();
    const projectPath = `/api/projects/${project.id}`;
    const path = `${projectPath}/tasks`;
    const otherPath = `/api/projects/${other.id}/tasks`;
    const first = await (await request(path, 'POST', { title: 'First' })).json();
    const second = await (await request(path, 'POST', { title: 'Second' })).json();
    const separate = await (await request(otherPath, 'POST', { title: 'Separate' })).json();
    for (const task of [first, second, separate]) assert.equal(task.priority, 'Normal');
    const taskPath = `${path}/${first.id}`;
    const high = { ...first, completed: true, priority: 'High' };
    await request(taskPath, 'PATCH', { completed: true });
    assert.deepEqual(await (await request(taskPath, 'PATCH', { priority: 'High' })).json(), high);
    const low = { ...second, priority: 'Low' };
    assert.deepEqual(await (await request(`${path}/${second.id}`, 'PATCH', { priority: 'Low' })).json(), low);
    const summary = { ...project, total_count: 2, completed_count: 1 };
    assert.deepEqual(await (await request(projectPath)).json(), summary);
    assert.deepEqual(await (await request(path)).json(), [high, low]);
    assert.deepEqual(await (await request(otherPath)).json(), [separate]);
    for (const priority of ['', 'high', 'Urgent', null, 1]) {
      assert.equal((await request(taskPath, 'PATCH', { priority })).status, 400);
    }
    assert.equal((await request(`${otherPath}/${first.id}`, 'PATCH', { priority: 'Low' })).status, 404);
    assert.deepEqual(await (await request(path)).json(), [high, low]);
    const renamed = { ...high, title: 'Renamed' };
    assert.deepEqual(await (await request(taskPath, 'PATCH', { title: ' Renamed ' })).json(), renamed);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(path)).json(), [renamed, low]);
    assert.deepEqual(await (await request(projectPath)).json(), summary);
    assert.deepEqual(await (await request(otherPath)).json(), [separate]);
    await request(projectPath, 'PATCH', { archived: true });
    assert.equal((await request(taskPath, 'PATCH', { priority: 'Normal' })).status, 409);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(path)).json(), [renamed, low]);
    assert.deepEqual(await (await request(projectPath)).json(), { ...summary, archived: true });
    await request(projectPath, 'PATCH', { archived: false });
    assert.deepEqual(await (await request(taskPath, 'PATCH', { priority: 'Normal' })).json(), { ...renamed, priority: 'Normal' });
    assert.deepEqual(await (await request(`${path}/${second.id}`, 'PATCH', { completed: true })).json(), { ...low, completed: true });
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(path)).json(), [{ ...renamed, priority: 'Normal' }, { ...low, completed: true }]);
    assert.deepEqual(await (await request(projectPath)).json(), { ...summary, completed_count: 2 });
    assert.deepEqual(await (await request(otherPath)).json(), [separate]);
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

test('project defaults affect only subsequent tasks and persist through rename, archive, restore, and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-default-'));
  let server;
  try {
    const databasePath = join(directory, 'workboard.sqlite');
    server = await start(databasePath);
    const request = async (path, method = 'GET', body) => fetch(`${server.base}${path}`, {
      method, ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }),
    });
    const project = await (await request('/api/projects', 'POST', { name: 'Defaults' })).json();
    const other = await (await request('/api/projects', 'POST', { name: 'Independent' })).json();
    assert.equal(project.default_task_priority, 'Normal');
    assert.equal(other.default_task_priority, 'Normal');
    const path = `/api/projects/${project.id}`;
    const taskPath = `${path}/tasks`;
    const create = async (title) => (await request(taskPath, 'POST', { title })).json();
    const normal = await create('Normal task');
    await request(`${taskPath}/${normal.id}`, 'PATCH', { completed: true });
    normal.completed = true;
    const before = await (await request(path)).json();
    assert.deepEqual(await (await request(path, 'PATCH', { default_task_priority: 'High' })).json(), {
      ...before, default_task_priority: 'High',
    });
    assert.deepEqual(await (await request(taskPath)).json(), [normal]);
    const high = await create('High task');
    assert.equal(high.priority, 'High');
    for (const priority of ['', 'high', 'Urgent', null, 42]) {
      assert.equal((await request(path, 'PATCH', { default_task_priority: priority })).status, 400);
    }
    assert.equal((await (await request(path)).json()).default_task_priority, 'High');
    await request(path, 'PATCH', { default_task_priority: 'Low' });
    const low = await create('Low task');
    assert.equal(low.priority, 'Low');
    assert.deepEqual(await (await request(taskPath)).json(), [normal, high, low]);
    const separate = await (await request(`/api/projects/${other.id}/tasks`, 'POST', { title: 'Separate' })).json();
    assert.equal(separate.priority, 'Normal');
    await request(path, 'PATCH', { name: 'Renamed default project' });
    const saved = await (await request(path)).json();
    assert.equal(saved.default_task_priority, 'Low');
    assert.equal(saved.total_count, 3);
    assert.equal(saved.completed_count, 1);
    await request(path, 'PATCH', { archived: true });
    assert.equal((await request(path, 'PATCH', { default_task_priority: 'Normal' })).status, 409);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(path)).json(), { ...saved, archived: true });
    assert.deepEqual(await (await request(taskPath)).json(), [normal, high, low]);
    await request(path, 'PATCH', { archived: false });
    assert.deepEqual(await (await request(path)).json(), saved);
    const restored = await create('Restored low');
    assert.equal(restored.priority, 'Low');
    await request(path, 'PATCH', { default_task_priority: 'Normal' });
    await server.stop();
    server = await start(databasePath);
    const subsequent = await create('Subsequent normal');
    assert.equal(subsequent.priority, 'Normal');
    assert.deepEqual(await (await request(taskPath)).json(), [normal, high, low, restored, subsequent]);
    assert.equal((await (await request(`/api/projects/${other.id}`)).json()).default_task_priority, 'Normal');
    assert.deepEqual(await (await request(`/api/projects/${other.id}/tasks`)).json(), [separate]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('due dates validate calendar days, preserve task data, and survive archive and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-dates-'));
  let server;
  try {
    const databasePath = join(directory, 'workboard.sqlite');
    // A Task 008 database must gain empty dates without losing existing data.
    const legacy = new DatabaseSync(databasePath);
    legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0, default_task_priority TEXT NOT NULL DEFAULT 'Normal');
      INSERT INTO projects (name) VALUES ('Dates'), ('Other');
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
      INSERT INTO tasks (project_id, title, completed, priority) VALUES (1, 'Existing', 1, 'High');`);
    legacy.close();
    server = await start(databasePath);
    const request = (path, method = 'GET', body) => fetch(`${server.base}${path}`, {
      method, ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }),
    });
    const projectPath = '/api/projects/1';
    const path = `${projectPath}/tasks`;
    const first = (await (await request(path)).json())[0];
    assert.equal(first.due_date, '');
    const second = await (await request(path, 'POST', { title: 'New' })).json();
    assert.equal(second.due_date, '');
    const separate = await (await request('/api/projects/2/tasks', 'POST', { title: 'Separate' })).json();
    const summary = await (await request(projectPath)).json();
    const taskPath = `${path}/${first.id}`;
    let saved = first;
    for (const date of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '1900-02-28', '2026-04-30']) {
      const response = await request(taskPath, 'PATCH', { due_date: ` \t${date}\n ` });
      assert.equal(response.status, 200);
      saved = { ...first, due_date: date };
      assert.deepEqual(await response.json(), saved);
    }
    for (const date of ['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2025-02-29',
      '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '2026-01-32', '2026-1-01',
      '26-01-01', '2026-01-01T00:00:00Z', 'tomorrow', null, 20260101]) {
      const response = await request(taskPath, 'PATCH', { due_date: date, title: 'Must not change' });
      assert.equal(response.status, 400, String(date));
      assert.deepEqual(await response.json(), { error: 'Due date must be a valid YYYY-MM-DD date' });
      assert.deepEqual(await (await request(path)).json(), [saved, second]);
    }
    assert.equal((await request(`/api/projects/2/tasks/${first.id}`, 'PATCH', { due_date: '2026-01-01' })).status, 404);
    saved.title = 'Renamed';
    assert.deepEqual(await (await request(taskPath, 'PATCH', { title: ' Renamed ' })).json(), saved);
    assert.deepEqual(await (await request(projectPath)).json(), summary);
    await request(projectPath, 'PATCH', { archived: true });
    assert.equal((await request(taskPath, 'PATCH', { due_date: '' })).status, 409);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(path)).json(), [saved, second]);
    assert.deepEqual(await (await request('/api/projects/2/tasks')).json(), [separate]);
    await request(projectPath, 'PATCH', { archived: false });
    for (const blank of ['', ' \t\n ']) {
      assert.deepEqual(await (await request(taskPath, 'PATCH', { due_date: blank })).json(), { ...saved, due_date: '' });
    }
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(path)).json(), [{ ...saved, due_date: '' }, second]);
    assert.deepEqual(await (await request(projectPath)).json(), summary);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
