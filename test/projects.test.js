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

test('project downloads include all owned task state in remembered order without writing data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-export-test-'));
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
      assert.ok(response.ok);
      return response.json();
    };
    const project = await api('/api/projects', 'POST', { name: '日本語  <em>Project</em>' });
    const other = await api('/api/projects', 'POST', { name: 'Other' });
    const path = `/api/projects/${project.id}`;
    const otherPath = `/api/projects/${other.id}`;
    const first = await api(`${path}/tasks`, 'POST', { title: 'First\t Task' });
    const second = await api(`${path}/tasks`, 'POST', { title: 'Second' });
    const notes = '  😀\r\n<script>literal</script>\rEnd  ';
    for (const body of [{ completed: true }, { priority: 'High' }, { dueDate: '2024-02-29' }, { notes }]) {
      await api(`${path}/tasks/${first.id}`, 'PATCH', body);
    }
    await api(`${otherPath}/tasks`, 'POST', { title: 'Other project only' });
    await api(`${path}/tasks/${first.id}`, 'PATCH', { destinationProjectId: other.id });
    await api(`${otherPath}/tasks/${first.id}`, 'PATCH', { destinationProjectId: project.id });
    await api(`${path}/tasks/${first.id}`, 'PATCH', { deleted: true });
    await api(path, 'PATCH', { defaultPriority: 'Low' });
    await api(path, 'PATCH', { archived: true });
    const beforeTasks = await api(`${path}/tasks`);
    const beforeProject = await api(path);
    const expected = {
      format: 'workboard-project', version: 1,
      project: {
        name: project.name, archived: true, defaultPriority: 'Low',
        tasks: [
          { title: first.title, completed: true, priority: 'High', dueDate: '2024-02-29', notes: '  😀\n<script>literal</script>\nEnd  ', deleted: true },
          { title: second.title, completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false },
        ],
      },
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch(`${server.url}${path}/export?completion=Open&search=missing`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
      assert.equal(response.headers.get('content-disposition'), 'attachment; filename="workboard-project.json"');
      assert.deepEqual(JSON.parse(await response.text()), expected);
      assert.deepEqual(await api(`${path}/tasks`), beforeTasks);
      assert.deepEqual(await api(path), beforeProject);
      if (attempt === 0) {
        await server.stop();
        server = await startServer(databasePath);
      }
    }
    await api(path, 'PATCH', { archived: false });
    await api(`${path}/tasks/${second.id}`, 'PATCH', { deleted: true });
    assert.equal((await api(`${path}/export`)).project.tasks.length, 2);
    assert.deepEqual((await api(path)).totalCount, 0);
    const empty = await api('/api/projects', 'POST', { name: 'Empty' });
    assert.deepEqual((await api(`/api/projects/${empty.id}/export`)).project.tasks, []);
    const missing = await fetch(`${server.url}/api/projects/999999/export`);
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get('content-disposition'), null);
    // The export has not disturbed remembered return positions.
    await api(`${path}/tasks/${first.id}`, 'PATCH', { deleted: false });
    await api(`${path}/tasks/${first.id}`, 'PATCH', { destinationProjectId: other.id });
    await api(`${otherPath}/tasks/${first.id}`, 'PATCH', { destinationProjectId: project.id });
    assert.deepEqual((await api(`${path}/tasks`)).map((task) => task.id), [first.id, second.id]);
  } finally {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('exporting an upgraded early database uses public defaults and preserves original data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-export-upgrade-'));
  const databasePath = join(directory, 'legacy.sqlite');
  let server;
  try {
    const legacy = new DatabaseSync(databasePath);
    legacy.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects VALUES (1, 'Legacy  Project');
      INSERT INTO tasks VALUES (8, 1, 'Original Task', 1);
    `);
    legacy.close();
    for (let attempt = 0; attempt < 2; attempt++) {
      server = await startServer(databasePath);
      const response = await fetch(`${server.url}/api/projects/1/export`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        format: 'workboard-project', version: 1,
        project: {
          name: 'Legacy  Project', archived: false, defaultPriority: 'Normal',
          tasks: [{ title: 'Original Task', completed: true, priority: 'Normal', dueDate: '', notes: '', deleted: false }],
        },
      });
      await server.stop();
    }
  } finally {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

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
      { id: 1, title: 'Done task', completed: true, priority: 'Normal', dueDate: '', notes: '', deleted: false },
      { id: 2, title: 'Open task', completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false },
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
      { id: 1, title: 'Done', completed: true, priority: 'Normal', dueDate: '', notes: '', deleted: false },
      { id: 2, title: 'Open', completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false },
    ];
    const otherTasks = [{ id: 3, title: 'Other task', completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false }];
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

test('per-project positions restore reverse returns and reserve absent slots through migration and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-return-order-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  // Task 011 schema, with an order deliberately different from task ID order.
  legacy.exec(`
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal'
    );
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'Normal', due_date TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO projects (name) VALUES ('Original'), ('Second'), ('Third');
    INSERT INTO tasks (project_id, title, position) VALUES
      (1, 'Middle', 20), (1, 'First', 10), (1, 'Last', 30),
      (2, 'Second resident', 1), (3, 'Third resident', 1);
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
    const tasks = async (project) => (await api(`/api/projects/${project}/tasks`)).body;
    const move = async (source, task, destinationProjectId, status = 200) => {
      const result = await api(`/api/projects/${source}/tasks/${task}`, 'PATCH', { destinationProjectId });
      assert.equal(result.status, status);
      return result.body;
    };
    const create = async (project, title) => {
      const result = await api(`/api/projects/${project}/tasks`, 'POST', { title });
      assert.equal(result.status, 201);
      return result.body;
    };
    const original = await tasks(1);
    assert.deepEqual(original.map((task) => task.id), [2, 1, 3]);
    const [first, middle, last] = original;
    const secondResident = (await tasks(2))[0];
    const thirdResident = (await tasks(3))[0];
    for (const task of original) await move(1, task.id, 2);
    assert.deepEqual(await tasks(1), []);
    assert.deepEqual(await tasks(2), [secondResident, ...original]);
    // New and first-arrival tasks must follow positions of all absent tasks.
    const newOriginal = await create(1, 'Created while everyone was away');
    await move(3, thirdResident.id, 1);
    let editedFirst = first;
    for (const edit of [{ title: 'Current title' }, { priority: 'High' }, { completed: true }, { dueDate: '2024-02-29' }]) {
      editedFirst = { ...editedFirst, ...edit };
      assert.deepEqual((await api(`/api/projects/2/tasks/${first.id}`, 'PATCH', edit)).body, editedFirst);
    }
    await api('/api/projects/1', 'PATCH', { name: 'Renamed original' });
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await tasks(1), [newOriginal, thirdResident]);
    // Return out of order, across restarts, without reverting the edited fields.
    await move(2, middle.id, 1);
    assert.deepEqual(await tasks(1), [middle, newOriginal, thirdResident]);
    await server.stop();
    server = await startServer(databasePath);
    await move(2, last.id, 1);
    await move(2, first.id, 1);
    const restored = [editedFirst, middle, last, newOriginal, thirdResident];
    assert.deepEqual(await tasks(1), restored);
    assert.deepEqual(await tasks(2), [secondResident]);
    const newSecond = await create(2, 'Created after visitors left');
    await api('/api/projects/2', 'PATCH', { name: 'Renamed second' });
    await api('/api/projects/2', 'PATCH', { archived: true });
    await move(1, first.id, 2, 409);
    assert.deepEqual(await tasks(1), restored);
    await server.stop();
    server = await startServer(databasePath);
    await api('/api/projects/2', 'PATCH', { archived: false });
    // Each destination remembers its own order, including reserved visitor slots.
    for (const task of [last, middle, editedFirst]) await move(1, task.id, 2);
    const secondOrder = [secondResident, editedFirst, middle, last, newSecond];
    assert.deepEqual(await tasks(2), secondOrder);
    assert.deepEqual(await tasks(1), [newOriginal, thirdResident]);
    const summaries = (await api('/api/projects')).body;
    assert.deepEqual(summaries.map((project) => [project.completedCount, project.totalCount]),
      [[0, 2], [1, 5], [0, 0]]);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await tasks(2), secondOrder);
    assert.deepEqual((await api('/api/projects')).body, summaries);
    await api('/api/projects/2', 'PATCH', { archived: true });
    await move(2, first.id, 1, 409);
    await api('/api/projects/2', 'PATCH', { archived: false });
    for (const task of [last, middle, editedFirst]) await move(2, task.id, 1);
    // Returning to a third project also reuses its independent remembered slot.
    await move(1, thirdResident.id, 3);
    assert.deepEqual(await tasks(3), [thirdResident]);
    await move(3, thirdResident.id, 1);
    assert.deepEqual(await tasks(1), restored);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await tasks(1), restored);
    assert.deepEqual(await tasks(2), [secondResident, newSecond]);
  } finally {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('notes migration and saves preserve task data, remembered order, and summaries across moves and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-notes-test-'));
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
      priority TEXT NOT NULL DEFAULT 'Normal', due_date TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE task_project_positions (
      task_id INTEGER NOT NULL REFERENCES tasks(id), project_id INTEGER NOT NULL REFERENCES projects(id),
      position INTEGER NOT NULL, PRIMARY KEY (task_id, project_id)
    );
    INSERT INTO projects (name) VALUES ('Source'), ('Destination');
    INSERT INTO tasks (project_id, title, completed, priority, due_date, position) VALUES
      (1, 'Later', 0, 'Low', '', 20), (1, 'First', 1, 'High', '2024-02-29', 10);
    INSERT INTO task_project_positions VALUES (1, 1, 20), (2, 1, 10), (2, 2, 5);
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
    const taskPath = `${path}/2`;
    const original = [
      { id: 2, title: 'First', completed: true, priority: 'High', dueDate: '2024-02-29', notes: '', deleted: false },
      { id: 1, title: 'Later', completed: false, priority: 'Low', dueDate: '', notes: '', deleted: false },
    ];
    assert.deepEqual((await api(path)).body, original);
    const created = (await api(path, 'POST', { title: 'New' })).body;
    assert.equal(created.notes, '');
    const summary = (await api('/api/projects')).body;
    const notes = '  Leading spaces\n\t日本語 😀 <script>alert("literal")</script>\nTrailing spaces  ';
    let saved = { ...original[0], notes };
    assert.deepEqual(await api(taskPath, 'PATCH', { notes }), { status: 200, body: saved });
    for (const invalid of [null, false, 123, [], {}]) {
      assert.equal((await api(taskPath, 'PATCH', { notes: invalid })).status, 400);
    }
    for (const edit of [{ title: 'Changed' }, { completed: false }, { priority: 'Low' }, { dueDate: '' }, { destinationProjectId: 2 }]) {
      assert.equal((await api(taskPath, 'PATCH', { notes: 'Combined', ...edit })).status, 400);
    }
    assert.equal((await api('/api/projects/2/tasks/2', 'PATCH', { notes: 'Wrong owner' })).status, 404);
    assert.equal((await api(`${path}/999`, 'PATCH', { notes: 'Missing' })).status, 404);
    assert.deepEqual((await api(path)).body, [saved, original[1], created]);
    assert.deepEqual((await api('/api/projects')).body, summary);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual((await api(path)).body, [saved, original[1], created]);
    for (const edit of [{ title: 'Renamed' }, { priority: 'Low' }, { completed: false }, { dueDate: '' }]) {
      saved = { ...saved, ...edit };
      assert.deepEqual((await api(taskPath, 'PATCH', edit)).body, saved);
    }
    await api('/api/projects/1', 'PATCH', { name: 'Renamed source' });
    assert.deepEqual((await api(taskPath, 'PATCH', { destinationProjectId: 2 })).body, saved);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual((await api('/api/projects/2/tasks')).body, [saved]);
    assert.deepEqual((await api('/api/projects/2/tasks/2', 'PATCH', { destinationProjectId: 1 })).body, saved);
    assert.deepEqual((await api(path)).body, [saved, original[1], created]);
    await api('/api/projects/1', 'PATCH', { archived: true });
    assert.equal((await api(taskPath, 'PATCH', { notes: 'Blocked' })).status, 409);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual((await api(path)).body, [saved, original[1], created]);
    await api('/api/projects/1', 'PATCH', { archived: false });
    for (const notes of [' \t\n ', '']) {
      saved = { ...saved, notes };
      const beforeSummary = (await api('/api/projects')).body;
      assert.deepEqual((await api(taskPath, 'PATCH', { notes })).body, saved);
      assert.deepEqual((await api('/api/projects')).body, beforeSummary);
    }
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual((await api(path)).body, [saved, original[1], created]);
  } finally {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('deletion preserves fields and reserved positions, rejects edits, and persists across archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-deletion-test-'));
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
    await api('/api/projects', 'POST', { name: 'Source' });
    await api('/api/projects', 'POST', { name: 'Destination' });
    const project = '/api/projects/1';
    const path = `${project}/tasks`;
    const first = (await api(path, 'POST', { title: 'First' })).body;
    const second = (await api(path, 'POST', { title: 'Second' })).body;
    assert.equal(first.deleted, false);
    const taskPath = `${path}/${first.id}`;
    for (const edit of [{ completed: true }, { priority: 'High' }, { dueDate: '0001-01-01' }, { notes: '  Unicode 日本語\n<script>literal</script>  ' }]) {
      await api(taskPath, 'PATCH', edit);
    }
    const original = (await api(path)).body[0];
    // Remember a destination position before deletion; neither visit is lost.
    await api(taskPath, 'PATCH', { destinationProjectId: 2 });
    await api(`/api/projects/2/tasks/${first.id}`, 'PATCH', { destinationProjectId: 1 });
    for (const deleted of [null, 1, 'true']) {
      assert.equal((await api(taskPath, 'PATCH', { deleted })).status, 400);
    }
    assert.equal((await api(taskPath, 'PATCH', { deleted: true, notes: 'Overwrite' })).status, 400);
    assert.equal((await api(`/api/projects/2/tasks/${first.id}`, 'PATCH', { deleted: true })).status, 404);
    const deletedFirst = { ...original, deleted: true };
    assert.deepEqual((await api(taskPath, 'PATCH', { deleted: true })).body, deletedFirst);
    for (const edit of [{ title: 'Changed' }, { completed: false }, { priority: 'Low' }, { dueDate: '' }, { notes: '' }, { destinationProjectId: 2 }]) {
      assert.equal((await api(taskPath, 'PATCH', edit)).status, 409);
    }
    assert.deepEqual((await api(path)).body, [deletedFirst, second]);
    assert.equal((await api(project)).body.totalCount, 1);
    assert.equal((await api(project)).body.completedCount, 0);
    await api(`${path}/${second.id}`, 'PATCH', { deleted: true });
    assert.equal((await api(project)).body.totalCount, 0);
    assert.equal((await api(project)).body.completedCount, 0);
    await api(project, 'PATCH', { defaultPriority: 'Low' });
    const third = (await api(path, 'POST', { title: 'Third' })).body;
    await api(project, 'PATCH', { archived: true });
    for (const deleted of [true, false]) {
      assert.equal((await api(taskPath, 'PATCH', { deleted })).status, 409);
    }
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual((await api(path)).body, [deletedFirst, { ...second, deleted: true }, third]);
    await api(project, 'PATCH', { archived: false });
    // Restore in reverse order without changing fields or reserved slots.
    await api(`${path}/${second.id}`, 'PATCH', { deleted: false });
    assert.deepEqual((await api(taskPath, 'PATCH', { deleted: false })).body, original);
    assert.deepEqual((await api(path)).body, [original, second, third]);
    assert.equal((await api(project)).body.totalCount, 3);
    assert.equal((await api(project)).body.completedCount, 1);
    await api(taskPath, 'PATCH', { destinationProjectId: 2 });
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual((await api('/api/projects/2/tasks')).body, [original]);
    await api(`/api/projects/2/tasks/${first.id}`, 'PATCH', { destinationProjectId: 1 });
    assert.deepEqual((await api(path)).body, [original, second, third]);
  } finally {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('imports are atomic independent copies with persistent fields, deletion and remembered order', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-import-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const api = async (path, method = 'GET', body, status = 200) => {
      const response = await fetch(`${server.url}${path}`, {
        method, ...(body === undefined ? {} : {
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        }),
      });
      assert.equal(response.status, status);
      return response.json();
    };
    const original = await api('/api/projects', 'POST', { name: 'Original' }, 201);
    const originalPath = `/api/projects/${original.id}`;
    const task = await api(`${originalPath}/tasks`, 'POST', { title: 'Original task' }, 201);
    await api(`${originalPath}/tasks/${task.id}`, 'PATCH', { completed: true });
    const before = await api('/api/projects');
    const originalExport = await api(`${originalPath}/export`);
    const document = {
      format: 'workboard-project', version: 1,
      project: {
        id: original.id, name: 'Portable', archived: true, defaultPriority: 'Low',
        tasks: [
          { id: task.id, position: 900, title: '  Deleted 😀  ', completed: true, priority: 'High', dueDate: '0001-01-01', notes: '  <script>literal</script>\r\n😀\rEnd  ', deleted: true },
          { title: 'Live', completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false },
        ],
      },
    };
    for (const json of ['{', JSON.stringify({ ...document, version: '1' }), JSON.stringify({
      ...document, project: { ...document.project, tasks: [...document.project.tasks, {
        ...document.project.tasks[1], dueDate: '1900-02-29',
      }] },
    })]) {
      assert.deepEqual(await api('/api/projects/import', 'POST', { name: 'Copy', json }, 400), { error: 'Invalid project JSON' });
      assert.deepEqual(await api('/api/projects'), before);
      assert.deepEqual(await api(`${originalPath}/export`), originalExport);
    }
    assert.deepEqual(await api('/api/projects/import', 'POST', { name: ' \t ', json: JSON.stringify(document) }, 400), { error: 'Project name is required' });
    assert.deepEqual(await api('/api/projects'), before);
    const copy = await api('/api/projects/import', 'POST', { name: '  Copy  ', json: JSON.stringify(document) }, 201);
    assert.notEqual(copy.id, original.id);
    assert.equal(copy.name, 'Copy');
    assert.equal(copy.archived, true);
    assert.equal(copy.defaultPriority, 'Low');
    assert.equal(copy.totalCount, 1);
    assert.equal(copy.completedCount, 0);
    const copyPath = `/api/projects/${copy.id}`;
    const tasks = await api(`${copyPath}/tasks`);
    assert.ok(tasks.every((item) => item.id !== task.id));
    const expectedTasks = document.project.tasks.map(({ id, position, ...fields }) => ({ ...fields, notes: fields.notes.replace(/\r\n?/g, '\n') }));
    assert.deepEqual(tasks.map(({ id, ...fields }) => fields), expectedTasks);
    await api(`${copyPath}/tasks/${tasks[0].id}`, 'PATCH', { deleted: false }, 409);
    await api(copyPath, 'PATCH', { archived: false });
    await api(`${copyPath}/tasks/${tasks[0].id}`, 'PATCH', { title: 'Cannot edit deleted' }, 409);
    await api(`${copyPath}/tasks/${tasks[0].id}`, 'PATCH', { destinationProjectId: original.id }, 409);
    const third = await api(`${copyPath}/tasks`, 'POST', { title: 'Later' }, 201);
    assert.equal(third.priority, 'Low');
    await api(`${copyPath}/tasks/${tasks[0].id}`, 'PATCH', { deleted: false });
    assert.deepEqual((await api(`${copyPath}/tasks`)).map((item) => item.id), [tasks[0].id, tasks[1].id, third.id]);
    assert.equal((await api(copyPath)).completedCount, 1);
    await api(`${copyPath}/tasks/${tasks[0].id}`, 'PATCH', { destinationProjectId: original.id });
    await server.stop();
    server = await startServer(databasePath);
    await api(`${originalPath}/tasks/${tasks[0].id}`, 'PATCH', { destinationProjectId: copy.id });
    const returned = await api(`${copyPath}/tasks`);
    assert.deepEqual(returned.map((item) => item.id), [tasks[0].id, tasks[1].id, third.id]);
    assert.deepEqual(returned[0], { ...tasks[0], deleted: false });
    assert.deepEqual(await api(`${originalPath}/export`), originalExport);
    const empty = await api('/api/projects/import', 'POST', {
      name: 'Empty copy', json: JSON.stringify({ ...document, project: { ...document.project, tasks: [] } }),
    }, 201);
    assert.deepEqual((await api(`/api/projects/${empty.id}/export`)).project.tasks, []);
    // Export-sized imports are not restricted to an ordinary small edit body.
    const large = structuredClone(document);
    large.project.archived = false;
    large.project.tasks[0].notes = '😀\n'.repeat(10000);
    const largeCopy = await api('/api/projects/import', 'POST', { name: 'Large', json: JSON.stringify(large) }, 201);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual((await api(`/api/projects/${largeCopy.id}/export`)).project.tasks, large.project.tasks.map(({ id, position, ...fields }) => fields));
    assert.deepEqual(await api(`${copyPath}/tasks`), returned);
    assert.deepEqual(await api('/health'), { status: 'ok' });
  } finally {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('directory reads current ownership and saved order including imported, deleted and upgraded tasks without writes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-directory-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    const legacy = new DatabaseSync(databasePath);
    legacy.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (name) VALUES ('Legacy owner');
      INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Legacy task', 0);
    `);
    legacy.close();
    server = await startServer(databasePath);
    const api = async (path, method = 'GET', body) => {
      const response = await fetch(`${server.url}${path}`, {
        method,
        ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      });
      assert.ok(response.ok, `${method} ${path}: ${response.status}`);
      return response.json();
    };
    const first = await api('/api/projects/1/tasks', 'POST', { title: 'First\t  Title' });
    const second = await api('/api/projects/1/tasks', 'POST', { title: 'Second' });
    const other = await api('/api/projects', 'POST', { name: 'Other owner' });
    const otherTask = await api(`/api/projects/${other.id}/tasks`, 'POST', { title: 'Other task' });
    const notes = '  😀\r\n<script>literal</script>\nEnd  ';
    for (const body of [{ completed: true }, { priority: 'High' }, { dueDate: '2024-02-29' }, { notes }]) {
      await api(`/api/projects/1/tasks/${first.id}`, 'PATCH', body);
    }
    await api(`/api/projects/1/tasks/${first.id}`, 'PATCH', { destinationProjectId: other.id });
    await api(`/api/projects/1/tasks/${second.id}`, 'PATCH', { destinationProjectId: other.id });
    await api(`/api/projects/${other.id}/tasks/${second.id}`, 'PATCH', { destinationProjectId: 1 });
    await api(`/api/projects/${other.id}/tasks/${first.id}`, 'PATCH', { destinationProjectId: 1 });
    await api(`/api/projects/1/tasks/${first.id}`, 'PATCH', { deleted: true });
    await api('/api/projects/1/tasks', 'POST', { title: 'Later' });
    await api(`/api/projects/${other.id}`, 'PATCH', { name: 'Renamed owner' });
    await api(`/api/projects/${other.id}`, 'PATCH', { archived: true });
    const document = {
      format: 'workboard-project', version: 1,
      project: { name: 'Portable', archived: true, defaultPriority: 'Low', tasks: [
        { title: 'Deleted copy', completed: true, priority: 'High', dueDate: '', notes: 'copy\r\nnotes', deleted: true },
        { title: 'Live copy', completed: false, priority: 'Normal', dueDate: '0001-01-01', notes: '', deleted: false },
      ] },
    };
    const imported = await api('/api/projects/import', 'POST', { name: 'Imported', json: JSON.stringify(document) });
    const snapshot = async () => {
      const projects = await api('/api/projects');
      return Promise.all(projects.map(async (project) => ({ project, tasks: await api(`/api/projects/${project.id}/tasks`) })));
    };
    const before = await snapshot();
    let expected;
    for (let attempt = 0; attempt < 2; attempt++) {
      const rows = await api('/api/task-directory');
      if (attempt === 0) expected = rows;
      else assert.deepEqual(rows, expected);
      assert.deepEqual(rows.map((task) => task.title), ['Legacy task', first.title, second.title, 'Later', otherTask.title, 'Deleted copy', 'Live copy']);
      assert.deepEqual(rows[0], { id: 1, title: 'Legacy task', completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false, projectId: 1, projectName: 'Legacy owner', archived: false });
      assert.equal(rows[1].notes, notes);
      assert.equal(rows[1].deleted, true);
      assert.equal(rows[1].completed, true);
      assert.equal(rows[1].priority, 'High');
      assert.equal(rows[1].dueDate, '2024-02-29');
      assert.equal(rows[4].projectName, 'Renamed owner');
      assert.equal(rows[4].archived, true);
      assert.equal(rows[5].projectId, imported.id);
      assert.equal(rows[5].notes, 'copy\nnotes');
      assert.equal(rows[5].deleted, true);
      assert.equal(rows[6].dueDate, '0001-01-01');
      assert.deepEqual(await snapshot(), before);
      const page = await fetch(`${server.url}/task-directory`);
      assert.equal(page.status, 200);
      assert.match(await page.text(), /src="\/app.js"/);
      if (attempt === 0) {
        await server.stop();
        server = await startServer(databasePath);
      }
    }
  } finally {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('directory bulk completion is bounded by saved filters and preserves fields, positions and summaries through restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-bulk-test-'));
  let server;
  try {
    const databasePath = join(directory, 'workboard.sqlite');
    server = await startServer(databasePath);
    const api = async (path, method = 'GET', body, status = 200) => {
      const response = await fetch(`${server.url}${path}`, { method,
        ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
      assert.equal(response.status, status);
      return response.json();
    };
    const projects = [];
    for (const name of ['First', 'Second', 'Archive']) {
      projects.push(await api('/api/projects', 'POST', { name }, 201));
    }
    const taskPath = (project, task) => `/api/projects/${project.id}/tasks/${task.id}`;
    const created = [];
    for (const [index, title] of [[0, 'MATCH\t task'], [1, 'Match  task'], [0, 'Other'], [0, 'Match task'], [0, 'Match task'], [0, 'Match task'], [2, 'Match task']]) {
      const project = projects[index];
      const task = await api(`/api/projects/${project.id}/tasks`, 'POST', { title }, 201);
      for (const body of [{ priority: 'High' }, { dueDate: '2024-02-29' }, { notes: '  literal <b>\n日本語  ' }]) {
        await api(taskPath(project, task), 'PATCH', body);
      }
      created.push({ project, task });
    }
    await api(taskPath(created[3].project, created[3].task), 'PATCH', { priority: 'Low' });
    await api(taskPath(created[4].project, created[4].task), 'PATCH', { dueDate: '' });
    await api(taskPath(created[5].project, created[5].task), 'PATCH', { deleted: true });
    await api(`/api/projects/${projects[2].id}`, 'PATCH', { archived: true });
    const before = await api('/api/task-directory');
    const filters = { scope: 'Active', completion: 'Open', priority: 'High',
      dueRange: { from: '2024-02-29', through: '2024-02-29' }, query: ' match \t task ' };
    const after = await api('/api/task-directory/completion', 'POST', { ...filters, completed: true });
    assert.deepEqual(after, before.map((task) => ({ ...task, completed: [created[0].task.id, created[1].task.id].includes(task.id) })));
    const summaries = await api('/api/projects');
    assert.deepEqual(summaries.map((project) => [project.completedCount, project.totalCount]), [[1, 4], [1, 1], [0, 1]]);
    for (const invalid of [
      { scope: 'Archived' }, { completion: 'Deleted' }, { priority: 'Invalid' }, { completed: 'true' },
      { dueRange: { from: '1900-02-29', through: '' } },
      { dueRange: { from: '2024-03-01', through: '2024-02-29' } },
    ]) {
      await api('/api/task-directory/completion', 'POST', { ...filters, completed: true, ...invalid },
        invalid.scope || invalid.completion ? 409 : 400);
      assert.deepEqual(await api('/api/task-directory'), after);
    }
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await api('/api/task-directory'), after);
    const first = created[0];
    await api(taskPath(first.project, first.task), 'PATCH', { destinationProjectId: projects[1].id });
    await api(taskPath(projects[1], first.task), 'PATCH', { destinationProjectId: first.project.id });
    assert.deepEqual(await api('/api/task-directory'), after);
    const reopened = await api('/api/task-directory/completion', 'POST', { ...filters, completion: 'Completed', completed: false });
    assert.deepEqual(reopened, before);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await api('/api/task-directory'), before);
    assert.deepEqual(await api('/health'), { status: 'ok' });
  } finally {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
