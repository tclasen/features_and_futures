import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with ${code}: ${errors}`));
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
      if (child.exitCode !== null) return;
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('task rename preserves ownership, order, completion, and counts through restarts and restore', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const api = async (path, method = 'GET', body) => {
      const response = await fetch(`${server.url}${path}`, {
        method,
        ...(body === undefined ? {} : {
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        }),
      });
      return { status: response.status, body: await response.json() };
    };
    const project = (await api('/api/projects', 'POST', { name: 'First' })).body;
    const other = (await api('/api/projects', 'POST', { name: 'Other' })).body;
    const projectPath = `/api/projects/${project.id}`;
    const path = `${projectPath}/tasks`;
    const first = (await api(path, 'POST', { title: 'Original' })).body;
    const second = (await api(path, 'POST', { title: 'Second' })).body;
    const completed = (await api(`${path}/${first.id}`, 'PATCH', { completed: true })).body;
    const summary = { ...project, completedCount: 1, totalCount: 2 };
    for (const title of ['', ' \t\n ', null, 42]) {
      assert.deepEqual(await api(`${path}/${first.id}`, 'PATCH', { title }), {
        status: 400, body: { error: 'Task title is required' },
      });
    }
    assert.equal((await api(`${path}/${first.id}`, 'PATCH', { title: 'Combined', completed: false })).status, 400);
    assert.equal((await api(`/api/projects/${other.id}/tasks/${first.id}`, 'PATCH', { title: 'Wrong owner' })).status, 404);
    assert.equal((await api(`${path}/999999`, 'PATCH', { title: 'Missing' })).status, 404);
    assert.deepEqual((await api(path)).body, [completed, second]);
    const renamed = { ...completed, title: '<b>Renamed task</b>' };
    assert.deepEqual(await api(`${path}/${first.id}`, 'PATCH', { title: '  <b>Renamed task</b> \n' }), {
      status: 200, body: renamed,
    });
    assert.deepEqual((await api(path)).body, [renamed, second]);
    assert.deepEqual((await api(projectPath)).body, summary);
    assert.deepEqual((await api(`/api/projects/${other.id}/tasks`)).body, []);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual((await api(path)).body, [renamed, second]);
    assert.deepEqual((await api(projectPath)).body, summary);
    await api(projectPath, 'PATCH', { archived: true });
    assert.deepEqual(await api(`${path}/${first.id}`, 'PATCH', { title: 'Blocked' }), {
      status: 409, body: { error: 'Archived project cannot be changed' },
    });
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual((await api(path)).body, [renamed, second]);
    await api(projectPath, 'PATCH', { archived: false });
    const restored = { ...renamed, title: 'After restoration' };
    assert.deepEqual(await api(`${path}/${first.id}`, 'PATCH', { title: restored.title }), {
      status: 200, body: restored,
    });
    const renamedOpen = { ...second, title: 'Renamed open task' };
    await api(`${path}/${second.id}`, 'PATCH', { title: renamedOpen.title });
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual((await api(path)).body, [restored, renamedOpen]);
    assert.deepEqual((await api('/api/projects')).body, [summary, other]);
  } finally {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('projects validate, keep creation order, and persist names and IDs after restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const api = async (path, options) => {
      const response = await fetch(`${server.url}${path}`, options);
      return { status: response.status, body: await response.json() };
    };
    const create = (name) => api('/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });

    assert.deepEqual(await api('/health'), { status: 200, body: { status: 'ok' } });
    assert.deepEqual((await api('/api/projects')).body, []);
    for (const name of ['', ' \t\n ', null, 42]) {
      assert.deepEqual(await create(name), { status: 400, body: { error: 'Project name is required' } });
    }
    assert.deepEqual((await api('/api/projects')).body, []);
    const first = await create('  First project \n');
    const second = await create('<script>literal text</script>');
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(first.body.name, 'First project');
    assert.ok(Number.isInteger(first.body.id));
    assert.ok(second.body.id > first.body.id);
    const projects = [first.body, second.body];
    assert.deepEqual((await api('/api/projects')).body, projects);
    assert.deepEqual(await api(`/api/projects/${first.body.id}`), { status: 200, body: first.body });
    assert.equal((await api('/api/projects/999999')).status, 404);
    assert.equal((await api('/missing')).status, 404);
    const invalid = await api('/api/projects', { method: 'POST', body: '{' });
    assert.equal(invalid.status, 400);
    assert.deepEqual((await api('/api/projects')).body, projects);
    for (const path of ['/', `/projects/${first.body.id}`]) {
      const response = await fetch(`${server.url}${path}`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /text\/html/);
      assert.match(await response.text(), /<title>Workboard<\/title>/);
    }
    for (const path of ['/app.js', '/styles.css']) {
      assert.equal((await fetch(`${server.url}${path}`)).status, 200);
    }
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual((await api('/api/projects')).body, projects);
    assert.deepEqual((await api(`/api/projects/${first.body.id}`)).body, first.body);
    const third = await create('Third');
    assert.ok(third.body.id > second.body.id);
    assert.deepEqual((await api('/api/projects')).body, [...projects, third.body]);
  } finally {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, belong to one project, and persist completion across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  // Start from the original projects-only schema to verify existing data survives.
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL CHECK (length(trim(name)) > 0)
    );
    INSERT INTO projects (name) VALUES ('Existing project');
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(databasePath);
    const api = async (path, method = 'GET', body) => {
      const response = await fetch(`${server.url}${path}`, {
        method,
        ...(body === undefined ? {} : {
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        }),
      });
      return { status: response.status, body: await response.json() };
    };
    assert.deepEqual((await api('/api/projects')).body, [{ id: 1, name: 'Existing project', archived: false, defaultPriority: 'Normal', totalCount: 0, completedCount: 0 }]);
    const other = (await api('/api/projects', 'POST', { name: 'Other project' })).body;
    const path = '/api/projects/1/tasks';
    const otherPath = `/api/projects/${other.id}/tasks`;
    assert.deepEqual(await api(path), { status: 200, body: [] });
    for (const title of ['', ' \t\n ', null, 42]) {
      assert.deepEqual(await api(path, 'POST', { title }), {
        status: 400, body: { error: 'Task title is required' },
      });
    }
    assert.deepEqual((await api(path)).body, []);
    const first = await api(path, 'POST', { title: '  First task \n' });
    const second = await api(path, 'POST', { title: '<b>Literal title</b>' });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(first.body.title, 'First task');
    assert.equal(first.body.completed, false);
    assert.equal(second.body.completed, false);
    assert.ok(second.body.id > first.body.id);
    const tasks = [first.body, second.body];
    assert.deepEqual((await api(path)).body, tasks);
    assert.deepEqual((await api(otherPath)).body, []);
    const otherTask = (await api(otherPath, 'POST', { title: 'Other task' })).body;
    assert.equal((await api(`${otherPath}/${first.body.id}`, 'PATCH', { completed: true })).status, 404);
    assert.equal((await api('/api/projects/999999/tasks')).status, 404);
    assert.equal((await api('/api/projects/999999/tasks', 'POST', { title: 'Missing project' })).status, 404);
    assert.equal((await api(`${path}/999999`, 'PATCH', { completed: true })).status, 404);
    for (const completed of [0, 1, 'true', null]) {
      assert.equal((await api(`${path}/${first.body.id}`, 'PATCH', { completed })).status, 400);
    }
    for (const [endpoint, method] of [[path, 'POST'], [`${path}/${first.body.id}`, 'PATCH']]) {
      const response = await fetch(`${server.url}${endpoint}`, { method, body: '{' });
      assert.equal(response.status, 400);
    }
    assert.deepEqual((await api(path)).body, tasks);
    const completed = await api(`${path}/${first.body.id}`, 'PATCH', { completed: true });
    assert.deepEqual(completed, { status: 200, body: { ...first.body, completed: true } });
    tasks[0] = completed.body;
    assert.deepEqual((await api(path)).body, tasks);
    assert.deepEqual((await api(otherPath)).body, [otherTask]);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual((await api(path)).body, tasks);
    assert.deepEqual((await api(otherPath)).body, [otherTask]);
    assert.deepEqual((await api('/api/projects/1')).body, { id: 1, name: 'Existing project', archived: false, defaultPriority: 'Normal', totalCount: 2, completedCount: 1 });
    assert.equal((await fetch(`${server.url}/projects/1`)).status, 200);
    assert.deepEqual(await api(`${path}/${first.body.id}`, 'PATCH', { completed: false }), {
      status: 200, body: first.body,
    });
    const third = (await api(path, 'POST', { title: 'Third task' })).body;
    assert.equal(third.completed, false);
    assert.ok(third.id > otherTask.id);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual((await api(path)).body, [first.body, second.body, third]);
  } finally {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive and restore preserve tasks, summaries, and IDs through migration and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO projects (name) VALUES ('Existing project');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Done task', 1), (1, 'Open task', 0);
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(databasePath);
    const api = async (path, method = 'GET', body) => {
      const response = await fetch(`${server.url}${path}`, {
        method,
        ...(body === undefined ? {} : {
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        }),
      });
      return { status: response.status, body: await response.json() };
    };
    const path = '/api/projects/1';
    const project = { id: 1, name: 'Existing project', archived: false, defaultPriority: 'Normal', totalCount: 2, completedCount: 1 };
    const tasks = [
      { id: 1, title: 'Done task', completed: true, priority: 'Normal', dueDate: '' },
      { id: 2, title: 'Open task', completed: false, priority: 'Normal', dueDate: '' },
    ];
    assert.deepEqual((await api(path)).body, project);
    assert.deepEqual((await api(`${path}/tasks`)).body, tasks);
    const empty = (await api('/api/projects', 'POST', { name: 'Empty project' })).body;
    assert.deepEqual(empty, { id: 2, name: 'Empty project', archived: false, defaultPriority: 'Normal', totalCount: 0, completedCount: 0 });
    for (const archived of [null, 0, 1, 'true']) {
      assert.equal((await api(path, 'PATCH', { archived })).status, 400);
    }
    assert.equal((await api(path, 'PATCH', {})).status, 400);
    assert.equal((await fetch(`${server.url}${path}`, { method: 'PATCH', body: '{' })).status, 400);
    assert.equal((await api('/api/projects/999999', 'PATCH', { archived: true })).status, 404);
    assert.deepEqual((await api(path)).body, project);
    const archived = { ...project, archived: true };
    assert.deepEqual(await api(path, 'PATCH', { archived: true }), { status: 200, body: archived });
    assert.deepEqual((await api('/api/projects')).body, [archived, empty]);
    const blocked = { status: 409, body: { error: 'Archived project cannot be changed' } };
    assert.deepEqual(await api(`${path}/tasks`, 'POST', { title: 'Blocked task' }), blocked);
    assert.deepEqual(await api(`${path}/tasks/1`, 'PATCH', { completed: false }), blocked);
    assert.deepEqual(await api(`${path}/tasks/2`, 'PATCH', { completed: true }), blocked);
    assert.deepEqual((await api(`${path}/tasks`)).body, tasks);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual((await api('/api/projects')).body, [archived, empty]);
    assert.deepEqual((await api(`${path}/tasks`)).body, tasks);
    assert.equal((await fetch(`${server.url}/projects/1`)).status, 200);
    assert.deepEqual(await api(path, 'PATCH', { archived: false }), { status: 200, body: project });
    assert.deepEqual((await api(`${path}/tasks`)).body, tasks);
    await api(`${path}/tasks/2`, 'PATCH', { completed: true });
    assert.deepEqual((await api(path)).body, { ...project, completedCount: 2 });
    await api(`${path}/tasks/1`, 'PATCH', { completed: false });
    const third = (await api(`${path}/tasks`, 'POST', { title: 'After restore' })).body;
    assert.equal(third.completed, false);
    assert.ok(third.id > tasks[1].id);
    const restored = { ...project, totalCount: 3 };
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual((await api('/api/projects')).body, [restored, empty]);
    assert.deepEqual((await api(`${path}/tasks`)).body, [
      { ...tasks[0], completed: false }, { ...tasks[1], completed: true }, third,
    ]);
  } finally {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('rename preserves identity, order, tasks, and summaries across archive, restore, and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const api = async (path, method = 'GET', body) => {
      const response = await fetch(`${server.url}${path}`, {
        method,
        ...(body === undefined ? {} : {
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        }),
      });
      return { status: response.status, body: await response.json() };
    };
    const first = (await api('/api/projects', 'POST', { name: 'Original' })).body;
    const second = (await api('/api/projects', 'POST', { name: 'Second' })).body;
    const path = `/api/projects/${first.id}`;
    const task = (await api(`${path}/tasks`, 'POST', { title: 'Saved task' })).body;
    const completed = (await api(`${path}/tasks/${task.id}`, 'PATCH', { completed: true })).body;
    const original = { ...first, totalCount: 1, completedCount: 1 };
    for (const name of ['', ' \t\n ', null, 42]) {
      assert.deepEqual(await api(path, 'PATCH', { name }), {
        status: 400, body: { error: 'Project name is required' },
      });
      assert.deepEqual((await api(path)).body, original);
    }
    assert.equal((await api('/api/projects/999999', 'PATCH', { name: 'Missing' })).status, 404);
    assert.equal((await api(path, 'PATCH', { name: 'Combined', archived: true })).status, 400);
    assert.deepEqual((await api(path)).body, original);
    const renamed = { ...original, name: 'Renamed project' };
    assert.deepEqual(await api(path, 'PATCH', { name: '  Renamed project \n' }), {
      status: 200, body: renamed,
    });
    assert.deepEqual((await api('/api/projects')).body, [renamed, second]);
    assert.deepEqual((await api(`${path}/tasks`)).body, [completed]);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual((await api('/api/projects')).body, [renamed, second]);
    assert.equal((await fetch(`${server.url}/projects/${first.id}`)).status, 200);
    await api(path, 'PATCH', { archived: true });
    assert.deepEqual(await api(path, 'PATCH', { name: 'Blocked rename' }), {
      status: 409, body: { error: 'Archived project cannot be changed' },
    });
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual((await api(path)).body, { ...renamed, archived: true });
    await api(path, 'PATCH', { archived: false });
    const restored = { ...renamed, name: 'After restoration' };
    assert.deepEqual(await api(path, 'PATCH', { name: restored.name }), { status: 200, body: restored });
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual((await api('/api/projects')).body, [restored, second]);
    assert.deepEqual((await api(`${path}/tasks`)).body, [completed]);
  } finally {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('priorities migrate and persist independently through rename, completion, archive, and restore', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO projects (name) VALUES ('First'), ('Other');
    INSERT INTO tasks (project_id, title, completed) VALUES
      (1, 'Done', 1), (1, 'Open', 0), (2, 'Other task', 0);
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(databasePath);
    const api = async (path, method = 'GET', body) => {
      const response = await fetch(`${server.url}${path}`, {
        method,
        ...(body === undefined ? {} : {
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        }),
      });
      return { status: response.status, body: await response.json() };
    };
    const path = '/api/projects/1/tasks';
    const tasks = [
      { id: 1, title: 'Done', completed: true, priority: 'Normal', dueDate: '' },
      { id: 2, title: 'Open', completed: false, priority: 'Normal', dueDate: '' },
    ];
    const otherTasks = [{ id: 3, title: 'Other task', completed: false, priority: 'Normal', dueDate: '' }];
    const summaries = (await api('/api/projects')).body;
    assert.deepEqual((await api(path)).body, tasks);
    for (const priority of ['', 'normal', 'Urgent', ' High ', null, 1, true, {}]) {
      assert.equal((await api(`${path}/1`, 'PATCH', { priority })).status, 400);
    }
    for (const body of [{ priority: 'High', title: 'Changed' }, { priority: 'High', completed: false }]) {
      assert.equal((await api(`${path}/1`, 'PATCH', body)).status, 400);
    }
    assert.equal((await api('/api/projects/2/tasks/1', 'PATCH', { priority: 'High' })).status, 404);
    assert.equal((await api(`${path}/999999`, 'PATCH', { priority: 'High' })).status, 404);
    assert.deepEqual((await api(path)).body, tasks);
    for (const priority of ['Low', 'Normal', 'High']) {
      tasks[0] = { ...tasks[0], priority };
      assert.deepEqual(await api(`${path}/1`, 'PATCH', { priority }), { status: 200, body: tasks[0] });
      assert.deepEqual((await api(path)).body, tasks);
      assert.deepEqual((await api('/api/projects/2/tasks')).body, otherTasks);
      assert.deepEqual((await api('/api/projects')).body, summaries);
    }
    tasks[1].priority = 'Low';
    await api(`${path}/2`, 'PATCH', { priority: 'Low' });
    tasks[0].title = 'Renamed';
    assert.deepEqual((await api(`${path}/1`, 'PATCH', { title: '  Renamed  ' })).body, tasks[0]);
    const created = (await api(path, 'POST', { title: 'New' })).body;
    assert.equal(created.priority, 'Normal');
    tasks.push(created);
    tasks[2].completed = true;
    assert.deepEqual((await api(`${path}/${created.id}`, 'PATCH', { completed: true })).body, tasks[2]);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual((await api(path)).body, tasks);
    await api('/api/projects/1', 'PATCH', { archived: true });
    assert.deepEqual(await api(`${path}/1`, 'PATCH', { priority: 'Low' }), {
      status: 409, body: { error: 'Archived project cannot be changed' },
    });
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual((await api(path)).body, tasks);
    await api('/api/projects/1', 'PATCH', { archived: false });
    tasks[0].priority = 'Low';
    assert.deepEqual((await api(`${path}/1`, 'PATCH', { priority: 'Low' })).body, tasks[0]);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual((await api(path)).body, tasks);
    assert.deepEqual((await api('/api/projects/2/tasks')).body, otherTasks);
    assert.deepEqual((await api('/api/projects')).body, [
      { ...summaries[0], totalCount: 3, completedCount: 2 }, summaries[1],
    ]);
  } finally {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project defaults migrate and apply only to future owned tasks through rename, restore, and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-default-priority-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'Normal'
    );
    INSERT INTO projects (name, archived) VALUES ('Existing', 0), ('Already archived', 1);
    INSERT INTO tasks (project_id, title, completed, priority) VALUES
      (1, 'Done', 1, 'High'), (1, 'Open', 0, 'Low'), (2, 'Archived task', 1, 'Normal');
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(databasePath);
    const api = async (path, method = 'GET', body) => {
      const response = await fetch(`${server.url}${path}`, {
        method,
        ...(body === undefined ? {} : {
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        }),
      });
      return { status: response.status, body: await response.json() };
    };
    const path = '/api/projects/1';
    const original = (await api(path)).body;
    const existingTasks = (await api(`${path}/tasks`)).body;
    const archivedTasks = (await api('/api/projects/2/tasks')).body;
    assert.equal(original.defaultPriority, 'Normal');
    assert.equal((await api('/api/projects/2')).body.defaultPriority, 'Normal');
    const other = (await api('/api/projects', 'POST', { name: 'Other' })).body;
    assert.equal(other.defaultPriority, 'Normal');
    const inheritedNormal = (await api(`${path}/tasks`, 'POST', { title: 'First new task' })).body;
    assert.equal(inheritedNormal.priority, 'Normal');
    const tasks = [...existingTasks, inheritedNormal];
    const summary = { ...original, totalCount: 3 };
    for (const defaultPriority of ['', 'normal', ' High ', 'Urgent', null, true, 1, {}]) {
      assert.equal((await api(path, 'PATCH', { defaultPriority })).status, 400);
    }
    for (const body of [{ defaultPriority: 'High', name: 'Combined' }, { defaultPriority: 'High', archived: true }]) {
      assert.equal((await api(path, 'PATCH', body)).status, 400);
    }
    assert.equal((await api('/api/projects/999999', 'PATCH', { defaultPriority: 'High' })).status, 404);
    assert.deepEqual((await api(path)).body, summary);
    for (const defaultPriority of ['Low', 'Normal', 'High']) {
      summary.defaultPriority = defaultPriority;
      assert.deepEqual(await api(path, 'PATCH', { defaultPriority }), { status: 200, body: { ...summary } });
      assert.deepEqual((await api(`${path}/tasks`)).body, tasks);
      const task = (await api(`${path}/tasks`, 'POST', { title: `Inherit ${defaultPriority}` })).body;
      assert.equal(task.priority, defaultPriority);
      assert.equal(task.completed, false);
      assert.ok(task.id > tasks.at(-1).id);
      tasks.push(task);
      summary.totalCount++;
      assert.deepEqual((await api(`/api/projects/${other.id}`)).body, other);
      assert.deepEqual((await api('/api/projects/2/tasks')).body, archivedTasks);
    }
    const independentTask = (await api(`/api/projects/${other.id}/tasks`, 'POST', { title: 'Independent' })).body;
    assert.equal(independentTask.priority, 'Normal');
    tasks[0].title = 'Renamed task';
    await api(`${path}/tasks/${tasks[0].id}`, 'PATCH', { title: tasks[0].title });
    summary.name = 'Renamed project';
    await api(path, 'PATCH', { name: summary.name });
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual((await api(path)).body, summary);
    assert.deepEqual((await api(`${path}/tasks`)).body, tasks);
    await api(path, 'PATCH', { archived: true });
    assert.equal((await api(path, 'PATCH', { defaultPriority: 'Low' })).status, 409);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual((await api(path)).body, { ...summary, archived: true });
    assert.deepEqual((await api(`${path}/tasks`)).body, tasks);
    await api(path, 'PATCH', { archived: false });
    const restoredTask = (await api(`${path}/tasks`, 'POST', { title: 'After restore' })).body;
    assert.equal(restoredTask.priority, 'High');
    tasks.push(restoredTask);
    summary.totalCount++;
    summary.defaultPriority = 'Low';
    await api(path, 'PATCH', { defaultPriority: 'Low' });
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual((await api(path)).body, summary);
    assert.deepEqual((await api(`${path}/tasks`)).body, tasks);
    assert.equal((await api(`${path}/tasks`, 'POST', { title: 'Saved low default' })).body.priority, 'Low');
  } finally {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('due dates persist independently through edits, restart, archive, and restore', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-due-date-test-'));
  let server;
  try {
    const databasePath = join(directory, 'workboard.sqlite');
    server = await startServer(databasePath);
    const api = async (path, method = 'GET', body) => {
      const response = await fetch(`${server.url}${path}`, {
        method,
        ...(body === undefined ? {} : {
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        }),
      });
      return { status: response.status, body: await response.json() };
    };
    const project = (await api('/api/projects', 'POST', { name: 'Dates' })).body;
    const other = (await api('/api/projects', 'POST', { name: 'Other' })).body;
    const projectPath = `/api/projects/${project.id}`;
    const path = `${projectPath}/tasks`;
    const first = (await api(path, 'POST', { title: 'First' })).body;
    const second = (await api(path, 'POST', { title: 'Second' })).body;
    const otherTask = (await api(`/api/projects/${other.id}/tasks`, 'POST', { title: 'Other' })).body;
    assert.equal(first.dueDate, '');
    assert.equal(second.dueDate, '');
    const taskPath = `${path}/${first.id}`;
    const summary = (await api(projectPath)).body;
    let saved = { ...first, dueDate: '0001-01-01' };
    assert.deepEqual(await api(taskPath, 'PATCH', { dueDate: ' \t0001-01-01\n' }), { status: 200, body: saved });
    for (const dueDate of ['1900-02-29', '2024-04-31', '0000-01-01', '9999-13-01', '2025-1-01', null, 1]) {
      assert.deepEqual(await api(taskPath, 'PATCH', { dueDate }), {
        status: 400, body: { error: 'Due date must be a valid YYYY-MM-DD date' },
      });
      assert.deepEqual((await api(path)).body, [saved, second]);
    }
    for (const edit of [{ title: 'Changed' }, { priority: 'High' }, { completed: true }]) {
      assert.equal((await api(taskPath, 'PATCH', { dueDate: '2024-02-29', ...edit })).status, 400);
    }
    assert.equal((await api(`/api/projects/${other.id}/tasks/${first.id}`, 'PATCH', { dueDate: '2024-02-29' })).status, 404);
    assert.deepEqual((await api(projectPath)).body, summary);
    assert.deepEqual((await api(`/api/projects/${other.id}/tasks`)).body, [otherTask]);
    for (const edit of [{ title: 'Renamed' }, { priority: 'High' }, { completed: true }]) {
      saved = { ...saved, ...edit };
      assert.deepEqual((await api(taskPath, 'PATCH', edit)).body, saved);
    }
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual((await api(path)).body, [saved, second]);
    const completedSummary = (await api(projectPath)).body;
    assert.equal(completedSummary.completedCount, 1);
    await api(projectPath, 'PATCH', { archived: true });
    assert.equal((await api(taskPath, 'PATCH', { dueDate: '' })).status, 409);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual((await api(path)).body, [saved, second]);
    await api(projectPath, 'PATCH', { archived: false });
    assert.deepEqual((await api(taskPath, 'PATCH', { dueDate: '2000-02-29' })).body, { ...saved, dueDate: '2000-02-29' });
    assert.deepEqual((await api(taskPath, 'PATCH', { dueDate: ' \t\n' })).body, { ...saved, dueDate: '' });
    assert.deepEqual((await api(projectPath)).body, completedSummary);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual((await api(path)).body, [{ ...saved, dueDate: '' }, second]);
  } finally {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task moves append after migration, preserve data and summaries, and survive restart and repeated moves', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-move-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal'
    );
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'Normal', due_date TEXT NOT NULL DEFAULT ''
    );
    INSERT INTO projects (name, default_priority) VALUES ('Source', 'High'), ('Destination', 'Low'), ('Archived', 'Normal');
    UPDATE projects SET archived = 1 WHERE id = 3;
    INSERT INTO tasks (project_id, title, completed, priority, due_date) VALUES
      (1, 'Oldest', 1, 'High', '0001-01-01'), (2, 'Destination first', 0, 'Normal', ''),
      (1, 'Undated', 0, 'Low', ''), (2, 'Destination second', 1, 'High', '9999-12-31');
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(databasePath);
    const api = async (path, method = 'GET', body) => {
      const response = await fetch(`${server.url}${path}`, {
        method,
        ...(body === undefined ? {} : {
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        }),
      });
      return { status: response.status, body: await response.json() };
    };
    const tasks = async (id) => (await api(`/api/projects/${id}/tasks`)).body;
    const move = (source, task, destinationProjectId) =>
      api(`/api/projects/${source}/tasks/${task}`, 'PATCH', { destinationProjectId });
    const originalSource = await tasks(1);
    const originalDestination = await tasks(2);
    assert.deepEqual(originalSource.map((task) => task.id), [1, 3]);
    assert.deepEqual(originalDestination.map((task) => task.id), [2, 4]);
    for (const destination of [1, 0, -1, 1.5, null, '2']) {
      assert.equal((await move(1, 1, destination)).status, 400);
    }
    assert.equal((await move(1, 1, 9999)).status, 404);
    assert.equal((await move(1, 1, 3)).status, 409);
    assert.equal((await move(2, 1, 1)).status, 404);
    assert.equal((await api('/api/projects/1/tasks/1', 'PATCH', { destinationProjectId: 2, priority: 'Low' })).status, 400);
    await api('/api/projects/1', 'PATCH', { archived: true });
    assert.equal((await move(1, 1, 2)).status, 409);
    assert.deepEqual(await tasks(1), originalSource);
    await api('/api/projects/1', 'PATCH', { archived: false });
    assert.deepEqual(await move(1, 1, 2), { status: 200, body: originalSource[0] });
    assert.deepEqual(await tasks(1), [originalSource[1]]);
    assert.deepEqual(await tasks(2), [...originalDestination, originalSource[0]]);
    assert.equal((await move(1, 1, 2)).status, 404);
    const checkCounts = async (sourceCompleted, sourceTotal, destCompleted, destTotal) => {
      const projects = (await api('/api/projects')).body;
      assert.deepEqual(projects.map((project) => [project.completedCount, project.totalCount]),
        [[sourceCompleted, sourceTotal], [destCompleted, destTotal], [0, 0]]);
      assert.deepEqual(projects.map((project) => project.defaultPriority), ['High', 'Low', 'Normal']);
    };
    await checkCounts(0, 1, 2, 3);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await tasks(2), [...originalDestination, originalSource[0]]);
    await checkCounts(0, 1, 2, 3);
    const created = (await api('/api/projects/2/tasks', 'POST', { title: 'Created after move' })).body;
    assert.equal(created.priority, 'Low');
    assert.deepEqual(await tasks(2), [...originalDestination, originalSource[0], created]);
    assert.deepEqual(await move(1, 3, 2), { status: 200, body: originalSource[1] });
    assert.deepEqual(await tasks(2), [...originalDestination, originalSource[0], created, originalSource[1]]);
    assert.deepEqual(await move(2, 1, 1), { status: 200, body: originalSource[0] });
    assert.deepEqual(await move(2, 3, 1), { status: 200, body: originalSource[1] });
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await tasks(1), originalSource);
    assert.deepEqual(await tasks(2), [...originalDestination, created]);
    await checkCounts(1, 2, 1, 3);
  } finally {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
