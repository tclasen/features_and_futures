import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', () => { clearTimeout(timeout); reject(new Error(errors)); });
    child.stdout.on('data', (chunk) => {
      const match = chunk.toString().match(/listening on port (\d+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
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

test('due dates preserve other task data and persist through rename, archive, clearing, and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-due-date-'));
  const dbPath = join(directory, 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const send = (path, method, body) => fetch(`${server.url}${path}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const list = async (path) => (await fetch(`${server.url}${path}`)).json();
    const first = await (await send('/api/projects', 'POST', { name: 'First' })).json();
    const second = await (await send('/api/projects', 'POST', { name: 'Second' })).json();
    const projectPath = `/api/projects/${first.id}`;
    const tasksPath = `${projectPath}/tasks`;
    const otherTasksPath = `/api/projects/${second.id}/tasks`;
    const task = await (await send(tasksPath, 'POST', { title: 'Original' })).json();
    const next = await (await send(tasksPath, 'POST', { title: 'Next' })).json();
    const other = await (await send(otherTasksPath, 'POST', { title: 'Other' })).json();
    for (const created of [task, next, other]) assert.equal(created.dueDate, '');
    const taskPath = `${tasksPath}/${task.id}`;
    await send(taskPath, 'PATCH', { completed: true });
    const completed = await (await send(taskPath, 'PATCH', { priority: 'High' })).json();
    const summaries = await list('/api/projects');
    let expected = { ...completed, dueDate: '2000-02-29' };
    const saved = await send(taskPath, 'PATCH', { dueDate: ' \t2000-02-29\n ' });
    assert.equal(saved.status, 200);
    assert.deepEqual(await saved.json(), expected);
    for (const dueDate of ['1900-02-29', '2026-04-31', '0000-01-01', '2026-1-01', 'nonsense', null, 42]) {
      const response = await send(taskPath, 'PATCH', { dueDate });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Due date must be a valid YYYY-MM-DD date' });
      assert.deepEqual(await list(tasksPath), [expected, next]);
    }
    assert.equal((await send(`${otherTasksPath}/${task.id}`, 'PATCH', { dueDate: '2026-01-01' })).status, 404);
    assert.equal((await send(taskPath, 'PATCH', { dueDate: '', title: 'Changed' })).status, 400);
    expected = { ...expected, title: 'Renamed' };
    assert.deepEqual(await (await send(taskPath, 'PATCH', { title: ' Renamed ' })).json(), expected);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.deepEqual(await list(tasksPath), [expected, next]);
    assert.deepEqual(await list(otherTasksPath), [other]);
    assert.deepEqual(await list('/api/projects'), summaries);
    await send(projectPath, 'PATCH', { archived: true });
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    for (const dueDate of ['', '2026-01-01']) {
      assert.equal((await send(taskPath, 'PATCH', { dueDate })).status, 409);
    }
    assert.deepEqual(await list(tasksPath), [expected, next]);
    await send(projectPath, 'PATCH', { archived: false });
    for (const dueDate of ['', ' \t\n ']) {
      await send(taskPath, 'PATCH', { dueDate: '9999-12-31' });
      expected = { ...expected, dueDate: '' };
      assert.deepEqual(await (await send(taskPath, 'PATCH', { dueDate })).json(), expected);
    }
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.deepEqual(await list(tasksPath), [expected, next]);
    assert.deepEqual(await list(otherTasksPath), [other]);
    assert.deepEqual(await list('/api/projects'), summaries);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('projects and owned tasks validate, preserve order, and survive a server-process restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const dbPath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const create = (name) => fetch(`${server.url}/api/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    for (const name of ['', '  \t\n', null, 42]) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await fetch(`${server.url}/api/projects`)).json(), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('<Second project>')).json();
    assert.notEqual(first.id, second.id);
    let expected = [first, second];
    assert.deepEqual(first, { id: first.id, name: 'First project', archived: false, defaultTaskPriority: 'Normal', totalCount: 0, completedCount: 0 });
    assert.deepEqual(await (await fetch(`${server.url}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${server.url}/api/projects/${first.id}`)).json(), first);
    for (const path of ['/', `/projects/${first.id}`]) {
      const response = await fetch(`${server.url}${path}`);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /<title>Workboard<\/title>/);
    }
    assert.equal((await fetch(`${server.url}/api/projects/999999`)).status, 404);
    const malformed = await fetch(`${server.url}/api/projects`, { method: 'POST', body: '{' });
    assert.equal(malformed.status, 400);
    const tasksPath = `/api/projects/${first.id}/tasks`;
    const otherTasksPath = `/api/projects/${second.id}/tasks`;
    const send = (path, method, body) => fetch(`${server.url}${path}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const list = async (path) => (await fetch(`${server.url}${path}`)).json();
    for (const title of ['', '  \t\n', null, 42]) {
      const response = await send(tasksPath, 'POST', { title });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await list(tasksPath), []);
    const taskResponse = await send(tasksPath, 'POST', { title: '  First task  ' });
    assert.equal(taskResponse.status, 201);
    const task = await taskResponse.json();
    assert.equal(task.title, 'First task');
    assert.equal(task.completed, false);
    const nextTask = await (await send(tasksPath, 'POST', { title: '<Next task>' })).json();
    const otherTask = await (await send(otherTasksPath, 'POST', { title: 'Other project task' })).json();
    assert.deepEqual(await list(tasksPath), [task, nextTask]);
    assert.deepEqual(await list(otherTasksPath), [otherTask]);
    assert.equal((await send(`${otherTasksPath}/${task.id}`, 'PATCH', { completed: true })).status, 404);
    assert.equal((await send('/api/projects/999999/tasks', 'POST', { title: 'Missing project' })).status, 404);
    for (const completed of ['true', 1, null]) {
      assert.equal((await send(`${tasksPath}/${task.id}`, 'PATCH', { completed })).status, 400);
    }
    assert.deepEqual(await list(tasksPath), [task, nextTask]);
    const completedResponse = await send(`${tasksPath}/${task.id}`, 'PATCH', { completed: true });
    assert.equal(completedResponse.status, 200);
    const completedTask = { ...task, completed: true };
    assert.deepEqual(await completedResponse.json(), completedTask);
    assert.deepEqual(await list(tasksPath), [completedTask, nextTask]);
    const firstWithTasks = { ...first, totalCount: 2, completedCount: 1 };
    expected = [firstWithTasks, { ...second, totalCount: 1 }];
    assert.deepEqual(await list('/api/projects'), expected);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.deepEqual(await (await fetch(`${server.url}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${server.url}/api/projects/${first.id}`)).json(), firstWithTasks);
    assert.deepEqual(await list(tasksPath), [completedTask, nextTask]);
    assert.deepEqual(await list(otherTasksPath), [otherTask]);
    const projectPath = `/api/projects/${first.id}`;
    for (const archived of [null, 1, 'true']) {
      assert.equal((await send(projectPath, 'PATCH', { archived })).status, 400);
    }
    assert.equal((await send('/api/projects/999999', 'PATCH', { archived: true })).status, 404);
    const archivedProject = { ...firstWithTasks, archived: true };
    const archivedResponse = await send(projectPath, 'PATCH', { archived: true });
    assert.equal(archivedResponse.status, 200);
    assert.deepEqual(await archivedResponse.json(), archivedProject);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.deepEqual(await list(projectPath), archivedProject);
    assert.deepEqual(await list('/api/projects'), [archivedProject, expected[1]]);
    assert.deepEqual(await list(tasksPath), [completedTask, nextTask]);
    assert.equal((await send(tasksPath, 'POST', { title: 'Blocked' })).status, 409);
    assert.equal((await send(`${tasksPath}/${task.id}`, 'PATCH', { completed: false })).status, 409);
    assert.deepEqual(await list(tasksPath), [completedTask, nextTask]);
    assert.deepEqual(await list(projectPath), archivedProject);
    assert.deepEqual(await (await send(projectPath, 'PATCH', { archived: false })).json(), firstWithTasks);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.deepEqual(await list(projectPath), firstWithTasks);
    assert.deepEqual(await list(tasksPath), [completedTask, nextTask]);
    const reopened = await send(`${tasksPath}/${task.id}`, 'PATCH', { completed: false });
    assert.equal(reopened.status, 200);
    assert.deepEqual(await reopened.json(), task);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.deepEqual(await list(tasksPath), [task, nextTask]);
    assert.deepEqual(await list(projectPath), { ...firstWithTasks, completedCount: 0 });
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});


test('renaming preserves project identity, order, tasks, summaries, and archived protection across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const dbPath = join(directory, 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const send = (path, method, body) => fetch(`${server.url}${path}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const list = async (path) => (await fetch(`${server.url}${path}`)).json();
    const first = await (await send('/api/projects', 'POST', { name: 'Original' })).json();
    const second = await (await send('/api/projects', 'POST', { name: 'Second' })).json();
    const projectPath = `/api/projects/${first.id}`;
    const tasksPath = `${projectPath}/tasks`;
    const task = await (await send(tasksPath, 'POST', { title: 'Saved task' })).json();
    const completedTask = await (await send(`${tasksPath}/${task.id}`, 'PATCH', { completed: true })).json();
    const openTask = await (await send(tasksPath, 'POST', { title: 'Open task' })).json();
    const original = { ...first, totalCount: 2, completedCount: 1 };
    for (const name of ['', ' \t\n ', null, 42]) {
      const response = await send(projectPath, 'PATCH', { name });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
      assert.deepEqual(await list(projectPath), original);
    }
    assert.equal((await send('/api/projects/999999', 'PATCH', { name: 'Missing' })).status, 404);
    const renamed = { ...original, name: 'Renamed project' };
    const response = await send(projectPath, 'PATCH', { name: '  Renamed project \t\n' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), renamed);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.deepEqual(await list(projectPath), renamed);
    assert.deepEqual(await list('/api/projects'), [renamed, second]);
    assert.deepEqual(await list(tasksPath), [completedTask, openTask]);
    assert.equal((await fetch(`${server.url}/projects/${first.id}`)).status, 200);
    const archived = { ...renamed, archived: true };
    assert.deepEqual(await (await send(projectPath, 'PATCH', { archived: true })).json(), archived);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.equal((await send(projectPath, 'PATCH', { name: 'Blocked' })).status, 409);
    assert.equal((await send(projectPath, 'PATCH', { name: 'Blocked', archived: false })).status, 400);
    assert.deepEqual(await list(projectPath), archived);
    assert.deepEqual(await list(tasksPath), [completedTask, openTask]);
    assert.deepEqual(await (await send(projectPath, 'PATCH', { archived: false })).json(), renamed);
    const restored = { ...renamed, name: '<Restored project>' };
    assert.deepEqual(await (await send(projectPath, 'PATCH', { name: ' <Restored project> ' })).json(), restored);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.deepEqual(await list('/api/projects'), [restored, second]);
    assert.deepEqual(await list(tasksPath), [completedTask, openTask]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task renaming preserves ownership, order, completion, and summaries through archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  const dbPath = join(directory, 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const send = (path, method, body) => fetch(`${server.url}${path}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const list = async (path) => (await fetch(`${server.url}${path}`)).json();
    const first = await (await send('/api/projects', 'POST', { name: 'First' })).json();
    const second = await (await send('/api/projects', 'POST', { name: 'Second' })).json();
    const projectPath = `/api/projects/${first.id}`;
    const tasksPath = `${projectPath}/tasks`;
    const otherTasksPath = `/api/projects/${second.id}/tasks`;
    const task = await (await send(tasksPath, 'POST', { title: 'Original' })).json();
    const taskPath = `${tasksPath}/${task.id}`;
    const completed = await (await send(taskPath, 'PATCH', { completed: true })).json();
    const open = await (await send(tasksPath, 'POST', { title: 'Open' })).json();
    const other = await (await send(otherTasksPath, 'POST', { title: 'Other' })).json();
    const projects = [
      { ...first, totalCount: 2, completedCount: 1 },
      { ...second, totalCount: 1 },
    ];
    for (const title of ['', ' \t\n ', null, 42]) {
      const response = await send(taskPath, 'PATCH', { title });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
      assert.deepEqual(await list(tasksPath), [completed, open]);
    }
    assert.equal((await send(`${otherTasksPath}/${task.id}`, 'PATCH', { title: 'Wrong owner' })).status, 404);
    assert.equal((await send(`${tasksPath}/999999`, 'PATCH', { title: 'Missing' })).status, 404);
    assert.equal((await send(taskPath, 'PATCH', { title: 'Ambiguous', completed: false })).status, 400);
    const renamed = { ...completed, title: '<Renamed task>' };
    const response = await send(taskPath, 'PATCH', { title: ' \t<Renamed task>\n ' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), renamed);
    assert.deepEqual(await list(tasksPath), [renamed, open]);
    assert.deepEqual(await list(otherTasksPath), [other]);
    assert.deepEqual(await list('/api/projects'), projects);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.deepEqual(await list(tasksPath), [renamed, open]);
    assert.deepEqual(await list('/api/projects'), projects);
    await send(projectPath, 'PATCH', { archived: true });
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    const blocked = await send(taskPath, 'PATCH', { title: 'Blocked' });
    assert.equal(blocked.status, 409);
    assert.deepEqual(await blocked.json(), { error: 'Archived project is read-only' });
    assert.deepEqual(await list(tasksPath), [renamed, open]);
    assert.deepEqual(await list(projectPath), { ...projects[0], archived: true });
    await send(projectPath, 'PATCH', { archived: false });
    const restored = { ...renamed, title: 'Restored task' };
    assert.deepEqual(await (await send(taskPath, 'PATCH', { title: ' Restored task ' })).json(), restored);
    const renamedOpen = { ...open, title: 'Renamed open task' };
    assert.deepEqual(await (await send(`${tasksPath}/${open.id}`, 'PATCH', { title: ' Renamed open task ' })).json(), renamedOpen);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.deepEqual(await list(tasksPath), [restored, renamedOpen]);
    assert.deepEqual(await list(otherTasksPath), [other]);
    assert.deepEqual(await list('/api/projects'), projects);
    const reopened = { ...restored, completed: false };
    assert.deepEqual(await (await send(taskPath, 'PATCH', { completed: false })).json(), reopened);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('priorities persist independently and preserve task data through rename, archive, and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  const dbPath = join(directory, 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const send = (path, method, body) => fetch(`${server.url}${path}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const list = async (path) => (await fetch(`${server.url}${path}`)).json();
    const first = await (await send('/api/projects', 'POST', { name: 'First' })).json();
    const second = await (await send('/api/projects', 'POST', { name: 'Second' })).json();
    const projectPath = `/api/projects/${first.id}`;
    const tasksPath = `${projectPath}/tasks`;
    const otherTasksPath = `/api/projects/${second.id}/tasks`;
    const task = await (await send(tasksPath, 'POST', { title: 'Original' })).json();
    const next = await (await send(tasksPath, 'POST', { title: 'Next' })).json();
    const other = await (await send(otherTasksPath, 'POST', { title: 'Other' })).json();
    for (const created of [task, next, other]) assert.equal(created.priority, 'Normal');
    const taskPath = `${tasksPath}/${task.id}`;
    const completed = await (await send(taskPath, 'PATCH', { completed: true })).json();
    const projects = [
      { ...first, totalCount: 2, completedCount: 1 },
      { ...second, totalCount: 1 },
    ];
    for (const priority of ['', 'high', ' High ', null, 1, true, {}, []]) {
      const response = await send(taskPath, 'PATCH', { priority });
      assert.equal(response.status, 400);
      assert.deepEqual(await list(tasksPath), [completed, next]);
    }
    for (const body of [{ priority: 'High', title: 'Changed' }, { priority: 'High', completed: false }]) {
      assert.equal((await send(taskPath, 'PATCH', body)).status, 400);
      assert.deepEqual(await list(tasksPath), [completed, next]);
    }
    assert.equal((await send(`${otherTasksPath}/${task.id}`, 'PATCH', { priority: 'High' })).status, 404);
    assert.equal((await send(`${tasksPath}/999999`, 'PATCH', { priority: 'High' })).status, 404);
    for (const priority of ['Low', 'Normal', 'High']) {
      const response = await send(taskPath, 'PATCH', { priority });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ...completed, priority });
      assert.deepEqual(await list(tasksPath), [{ ...completed, priority }, next]);
      assert.deepEqual(await list(otherTasksPath), [other]);
      assert.deepEqual(await list('/api/projects'), projects);
    }
    const renamed = { ...completed, title: 'Renamed', priority: 'High' };
    assert.deepEqual(await (await send(taskPath, 'PATCH', { title: ' Renamed ' })).json(), renamed);
    const lowNext = { ...next, priority: 'Low' };
    assert.deepEqual(await (await send(`${tasksPath}/${next.id}`, 'PATCH', { priority: 'Low' })).json(), lowNext);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.deepEqual(await list(tasksPath), [renamed, lowNext]);
    assert.deepEqual(await list(otherTasksPath), [other]);
    assert.deepEqual(await list('/api/projects'), projects);
    await send(projectPath, 'PATCH', { archived: true });
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    const blocked = await send(taskPath, 'PATCH', { priority: 'Low' });
    assert.equal(blocked.status, 409);
    assert.deepEqual(await blocked.json(), { error: 'Archived project is read-only' });
    assert.deepEqual(await list(tasksPath), [renamed, lowNext]);
    await send(projectPath, 'PATCH', { archived: false });
    const restored = { ...renamed, priority: 'Normal' };
    assert.deepEqual(await (await send(taskPath, 'PATCH', { priority: 'Normal' })).json(), restored);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.deepEqual(await list(tasksPath), [restored, lowNext]);
    assert.deepEqual(await list(otherTasksPath), [other]);
    assert.deepEqual(await list('/api/projects'), projects);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('migrates existing projects and tasks without changing IDs or completion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-migration-'));
  const dbPath = join(directory, 'legacy.sqlite');
  let server;
  try {
    const database = new DatabaseSync(dbPath);
    database.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (id, name) VALUES (7, 'Existing project');
      INSERT INTO tasks (id, project_id, title, completed) VALUES (11, 7, 'Existing task', 1);`);
    database.close();
    for (let restart = 0; restart < 2; restart++) {
      server = await start(dbPath);
      assert.deepEqual(await (await fetch(`${server.url}/api/projects`)).json(), [
        { id: 7, name: 'Existing project', archived: false, defaultTaskPriority: 'Normal', totalCount: 1, completedCount: 1 },
      ]);
      assert.deepEqual(await (await fetch(`${server.url}/api/projects/7/tasks`)).json(), [
        { id: 11, title: 'Existing task', completed: true, priority: 'Normal', dueDate: '' },
      ]);
      await server.stop();
      server = undefined;
    }
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project defaults affect only future owned tasks and survive rename, archive, restoration, and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-default-priority-'));
  const dbPath = join(directory, 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const send = (path, method, body) => fetch(`${server.url}${path}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const list = async (path) => (await fetch(`${server.url}${path}`)).json();
    const first = await (await send('/api/projects', 'POST', { name: 'First' })).json();
    const second = await (await send('/api/projects', 'POST', { name: 'Second' })).json();
    assert.equal(first.defaultTaskPriority, 'Normal');
    assert.equal(second.defaultTaskPriority, 'Normal');
    const projectPath = `/api/projects/${first.id}`;
    const tasksPath = `${projectPath}/tasks`;
    const otherProjectPath = `/api/projects/${second.id}`;
    const otherTasksPath = `${otherProjectPath}/tasks`;
    const original = await (await send(tasksPath, 'POST', { title: 'Original' })).json();
    const completed = await (await send(`${tasksPath}/${original.id}`, 'PATCH', { completed: true })).json();
    const summary = { ...first, totalCount: 1, completedCount: 1 };
    for (const defaultTaskPriority of ['', 'high', ' High ', null, 1, true, {}, []]) {
      assert.equal((await send(projectPath, 'PATCH', { defaultTaskPriority })).status, 400);
      assert.deepEqual(await list(projectPath), summary);
    }
    for (const body of [
      { defaultTaskPriority: 'High', name: 'Changed' },
      { defaultTaskPriority: 'High', archived: true },
    ]) {
      assert.equal((await send(projectPath, 'PATCH', body)).status, 400);
      assert.deepEqual(await list(projectPath), summary);
    }
    assert.equal((await send('/api/projects/999999', 'PATCH', { defaultTaskPriority: 'High' })).status, 404);
    const expectedTasks = [completed];
    for (const defaultTaskPriority of ['Low', 'Normal', 'High']) {
      const response = await send(projectPath, 'PATCH', { defaultTaskPriority });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        ...summary, totalCount: expectedTasks.length, defaultTaskPriority,
      });
      assert.deepEqual(await list(tasksPath), expectedTasks);
      assert.deepEqual(await list(otherProjectPath), second);
      const inherited = await (await send(tasksPath, 'POST', { title: `${defaultTaskPriority} task` })).json();
      assert.equal(inherited.priority, defaultTaskPriority);
      assert.equal(inherited.completed, false);
      expectedTasks.push(inherited);
    }
    await send(otherProjectPath, 'PATCH', { defaultTaskPriority: 'Low' });
    const otherTask = await (await send(otherTasksPath, 'POST', { title: 'Other' })).json();
    assert.equal(otherTask.priority, 'Low');
    const renamed = {
      ...summary, name: 'Renamed', totalCount: expectedTasks.length, defaultTaskPriority: 'High',
    };
    assert.deepEqual(await (await send(projectPath, 'PATCH', { name: ' Renamed ' })).json(), renamed);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.deepEqual(await list(projectPath), renamed);
    assert.deepEqual(await list(tasksPath), expectedTasks);
    await send(projectPath, 'PATCH', { archived: true });
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.deepEqual(await list(projectPath), { ...renamed, archived: true });
    assert.equal((await send(projectPath, 'PATCH', { defaultTaskPriority: 'Low' })).status, 409);
    assert.deepEqual(await list(tasksPath), expectedTasks);
    assert.deepEqual(await (await send(projectPath, 'PATCH', { archived: false })).json(), renamed);
    const restoredTask = await (await send(tasksPath, 'POST', { title: 'After restoration' })).json();
    assert.equal(restoredTask.priority, 'High');
    expectedTasks.push(restoredTask);
    await send(projectPath, 'PATCH', { defaultTaskPriority: 'Normal' });
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.deepEqual(await list(tasksPath), expectedTasks);
    assert.deepEqual(await list(otherTasksPath), [otherTask]);
    assert.deepEqual(await list(projectPath), {
      ...renamed, defaultTaskPriority: 'Normal', totalCount: expectedTasks.length,
    });
    assert.equal((await list(otherProjectPath)).defaultTaskPriority, 'Low');
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
