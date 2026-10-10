import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

async function availablePort() {
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

async function start(port, databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(port), DB_PATH: databasePath },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(errors);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return child;
    } catch { /* Wait until the listener is ready. */ }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  child.kill();
  throw new Error(`Server did not start: ${errors}`);
}

async function stop(child) {
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await exited;
}

test('projects and owned tasks validate, preserve order and state, and persist through restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  const port = await availablePort();
  const base = `http://127.0.0.1:${port}`;
  let child;
  const post = (body) => fetch(`${base}/api/projects`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  try {
    child = await start(port, databasePath);
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), []);
    for (const name of ['', ' \t\n ', null]) {
      const response = await post({ name });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), []);
    const firstResponse = await post({ name: '  First project  ' });
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    assert.equal(first.archived, false);
    assert.equal(first.totalCount, 0);
    assert.equal(first.completedCount, 0);
    const second = await (await post({ name: '<script>not HTML</script>' })).json();
    assert.notEqual(first.id, second.id);
    const expected = [first, second];
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    assert.equal((await fetch(`${base}/api/projects/99999`)).status, 404);
    const malformed = await fetch(`${base}/api/projects`, { method: 'POST', body: '{' });
    assert.equal(malformed.status, 400);
    const home = await (await fetch(base)).text();
    assert.match(home, /<h1[^>]*>Workboard<\/h1>/);
    assert.match(home, /<label for="project-name">Project name<\/label>/);
    assert.match(home, /Create project/);
    assert.equal((await fetch(`${base}/projects/${first.id}`)).status, 200);
    assert.match(home, /<label for="task-title">Task title<\/label>/);
    assert.match(home, /<label for="task-filter">Task filter<\/label>/);
    assert.match(home, /<option value="all" selected>All<\/option>/);
    assert.match(home, /<option value="open">Open<\/option>/);
    assert.match(home, /<option value="completed">Completed<\/option>/);
    const tasksUrl = `${base}/api/projects/${first.id}/tasks`;
    const sendTask = (url, method, body) => fetch(url, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const getTasks = async (id = first.id) => (await fetch(`${base}/api/projects/${id}/tasks`)).json();
    assert.deepEqual(await getTasks(), []);
    for (const title of ['', ' \t\n ', null, 42]) {
      const response = await sendTask(tasksUrl, 'POST', { title });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await getTasks(), []);
    const created = await sendTask(tasksUrl, 'POST', { title: '  First task  ' });
    assert.equal(created.status, 201);
    const task = await created.json();
    assert.equal(task.title, 'First task');
    assert.equal(task.completed, false);
    const otherTask = await (await sendTask(tasksUrl, 'POST', { title: '<b>Second task</b>' })).json();
    assert.deepEqual(await getTasks(), [task, otherTask]);
    assert.deepEqual(await getTasks(second.id), []);
    assert.equal((await sendTask(`${base}/api/projects/${second.id}/tasks/${task.id}`, 'PATCH', { completed: true })).status, 404);
    assert.equal((await sendTask(`${base}/api/projects/99999/tasks`, 'POST', { title: 'Orphan' })).status, 404);
    const taskUrl = `${tasksUrl}/${task.id}`;
    for (const completed of [1, 'true', null]) {
      assert.equal((await sendTask(taskUrl, 'PATCH', { completed })).status, 400);
    }
    for (const completed of [true, false, true]) {
      const response = await sendTask(taskUrl, 'PATCH', { completed });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ...task, completed });
      assert.deepEqual(await getTasks(), [{ ...task, completed }, otherTask]);
    }
    const isolatedTask = await (await sendTask(`${base}/api/projects/${second.id}/tasks`, 'POST', { title: 'Other project task' })).json();
    assert.deepEqual(await getTasks(second.id), [isolatedTask]);
    const projectUrl = `${base}/api/projects/${first.id}`;
    const setArchived = (archived) => sendTask(projectUrl, 'PATCH', { archived });
    for (const archived of [1, 'true', null]) {
      assert.equal((await setArchived(archived)).status, 400);
    }
    const archivedFirst = { ...first, archived: true, totalCount: 2, completedCount: 1 };
    assert.deepEqual(await (await setArchived(true)).json(), archivedFirst);
    assert.equal((await sendTask(tasksUrl, 'POST', { title: 'Blocked' })).status, 409);
    assert.equal((await sendTask(taskUrl, 'PATCH', { completed: false })).status, 409);
    assert.deepEqual(await getTasks(), [{ ...task, completed: true }, otherTask]);
    assert.match(home, /<label for="project-filter">Project filter<\/label>/);
    assert.match(home, /<option value="active" selected>Active<\/option>/);
    assert.match(home, /<option value="archived">Archived<\/option>/);
    await stop(child);
    child = undefined;
    child = await start(port, databasePath);
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [
      archivedFirst, { ...second, totalCount: 1 },
    ]);
    assert.deepEqual(await (await fetch(projectUrl)).json(), archivedFirst);
    assert.deepEqual(await (await setArchived(false)).json(), { ...archivedFirst, archived: false });
    assert.deepEqual(await getTasks(), [{ ...task, completed: true }, otherTask]);
    assert.deepEqual(await getTasks(second.id), [isolatedTask]);
    assert.equal((await fetch(`${base}/projects/${first.id}`)).status, 200);
    assert.equal((await sendTask(taskUrl, 'PATCH', { completed: false })).status, 200);
    assert.deepEqual(await getTasks(), [task, otherTask]);
    assert.deepEqual(await (await fetch(projectUrl)).json(), { ...first, totalCount: 2 });
    await stop(child);
    child = undefined;
    child = await start(port, databasePath);
    assert.deepEqual(await (await fetch(projectUrl)).json(), { ...first, totalCount: 2 });
  } finally {
    if (child) await stop(child);
    await rm(directory, { recursive: true, force: true });
  }
});

test('renaming preserves identity, order, tasks and summaries across restarts and restoration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const databasePath = join(directory, 'projects.sqlite');
  const port = await availablePort();
  const base = `http://127.0.0.1:${port}`;
  let child;
  const send = async (path, method, body) => fetch(`${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const get = async (path) => (await fetch(`${base}${path}`)).json();
  try {
    child = await start(port, databasePath);
    const first = await (await send('/api/projects', 'POST', { name: 'Original' })).json();
    const second = await (await send('/api/projects', 'POST', { name: 'Second' })).json();
    const path = `/api/projects/${first.id}`;
    const task = await (await send(`${path}/tasks`, 'POST', { title: 'Keep me' })).json();
    await send(`${path}/tasks/${task.id}`, 'PATCH', { completed: true });
    const original = { ...first, totalCount: 1, completedCount: 1 };
    for (const name of ['', ' \t\n ', null, 42]) {
      const response = await send(path, 'PATCH', { name });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
      assert.deepEqual(await get(path), original);
    }
    assert.equal((await send(path, 'PATCH', { name: 'Mixed', archived: true })).status, 400);
    assert.equal((await send('/api/projects/99999', 'PATCH', { name: 'Missing' })).status, 404);
    const renamed = { ...original, name: 'Renamed project' };
    const response = await send(path, 'PATCH', { name: '  Renamed project  ' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), renamed);
    assert.deepEqual(await get('/api/projects'), [renamed, second]);
    assert.deepEqual(await get(`${path}/tasks`), [{ ...task, completed: true }]);
    assert.equal((await fetch(`${base}/projects/${first.id}`)).status, 200);
    const html = await (await fetch(base)).text();
    assert.match(html, /<label for="new-project-name">New project name<\/label>/);
    assert.match(html, /Rename project/);
    await stop(child);
    child = undefined;
    child = await start(port, databasePath);
    assert.deepEqual(await get('/api/projects'), [renamed, second]);
    await send(path, 'PATCH', { archived: true });
    assert.equal((await send(path, 'PATCH', { name: 'Blocked' })).status, 409);
    assert.deepEqual(await get(path), { ...renamed, archived: true });
    await stop(child);
    child = undefined;
    child = await start(port, databasePath);
    assert.deepEqual(await get(path), { ...renamed, archived: true });
    await send(path, 'PATCH', { archived: false });
    const restored = await send(path, 'PATCH', { name: '  Restored name  ' });
    assert.equal(restored.status, 200);
    const finalProject = { ...renamed, name: 'Restored name' };
    assert.deepEqual(await restored.json(), finalProject);
    assert.deepEqual(await get(`${path}/tasks`), [{ ...task, completed: true }]);
    await stop(child);
    child = undefined;
    child = await start(port, databasePath);
    assert.deepEqual(await get('/api/projects'), [finalProject, second]);
    assert.deepEqual(await get(`${path}/tasks`), [{ ...task, completed: true }]);
  } finally {
    if (child) await stop(child);
    await rm(directory, { recursive: true, force: true });
  }
});

test('task renaming preserves ownership, order, completion and summaries through restart and restoration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  const databasePath = join(directory, 'projects.sqlite');
  const port = await availablePort();
  const base = `http://127.0.0.1:${port}`;
  let child;
  const send = (path, method, body) => fetch(`${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const get = async (path) => (await fetch(`${base}${path}`)).json();
  try {
    child = await start(port, databasePath);
    const project = await (await send('/api/projects', 'POST', { name: 'First' })).json();
    const other = await (await send('/api/projects', 'POST', { name: 'Other' })).json();
    const path = `/api/projects/${project.id}`;
    const tasksPath = `${path}/tasks`;
    const first = await (await send(tasksPath, 'POST', { title: 'Original' })).json();
    const second = await (await send(tasksPath, 'POST', { title: 'Second' })).json();
    const taskPath = `${tasksPath}/${first.id}`;
    await send(taskPath, 'PATCH', { completed: true });
    const completed = { ...first, completed: true };
    const summary = { ...project, totalCount: 2, completedCount: 1 };
    for (const title of ['', ' \t\n ', null, 42]) {
      const response = await send(taskPath, 'PATCH', { title });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
      assert.deepEqual(await get(tasksPath), [completed, second]);
    }
    assert.equal((await send(taskPath, 'PATCH', { title: 'Mixed', completed: false })).status, 400);
    assert.equal((await send(`${tasksPath}/99999`, 'PATCH', { title: 'Missing' })).status, 404);
    assert.equal((await send(`/api/projects/${other.id}/tasks/${first.id}`, 'PATCH', { title: 'Wrong owner' })).status, 404);
    const renamed = { ...completed, title: 'Renamed task' };
    const response = await send(taskPath, 'PATCH', { title: '  Renamed task  ' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), renamed);
    assert.deepEqual(await get(tasksPath), [renamed, second]);
    assert.deepEqual(await get(`/api/projects/${other.id}/tasks`), []);
    assert.deepEqual(await get(path), summary);
    await stop(child);
    child = undefined;
    child = await start(port, databasePath);
    assert.deepEqual(await get(tasksPath), [renamed, second]);
    assert.deepEqual(await get(path), summary);
    await send(path, 'PATCH', { archived: true });
    assert.equal((await send(taskPath, 'PATCH', { title: 'Blocked' })).status, 409);
    await stop(child);
    child = undefined;
    child = await start(port, databasePath);
    assert.deepEqual(await get(tasksPath), [renamed, second]);
    await send(path, 'PATCH', { archived: false });
    const restored = { ...renamed, title: '<b>Restored task</b>' };
    assert.deepEqual(await (await send(taskPath, 'PATCH', { title: `  ${restored.title}  ` })).json(), restored);
    const renamedOpen = { ...second, title: 'Renamed open task' };
    assert.deepEqual(await (await send(`${tasksPath}/${second.id}`, 'PATCH', { title: renamedOpen.title })).json(), renamedOpen);
    assert.deepEqual(await get(path), summary);
    await stop(child);
    child = undefined;
    child = await start(port, databasePath);
    assert.deepEqual(await get(tasksPath), [restored, renamedOpen]);
    assert.deepEqual(await get(path), summary);
  } finally {
    if (child) await stop(child);
    await rm(directory, { recursive: true, force: true });
  }
});

test('priorities default to Normal and preserve task data through edits, archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  const databasePath = join(directory, 'projects.sqlite');
  const port = await availablePort();
  const base = `http://127.0.0.1:${port}`;
  let child;
  const send = (path, method, body) => fetch(`${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const get = async (path) => (await fetch(`${base}${path}`)).json();
  try {
    child = await start(port, databasePath);
    const project = await (await send('/api/projects', 'POST', { name: 'First' })).json();
    const other = await (await send('/api/projects', 'POST', { name: 'Other' })).json();
    const path = `/api/projects/${project.id}`;
    const tasksPath = `${path}/tasks`;
    const first = await (await send(tasksPath, 'POST', { title: 'First task' })).json();
    const second = await (await send(tasksPath, 'POST', { title: 'Second task' })).json();
    const otherPath = `/api/projects/${other.id}/tasks`;
    const isolated = await (await send(otherPath, 'POST', { title: 'Isolated' })).json();
    assert.equal(first.priority, 'Normal');
    assert.equal(second.priority, 'Normal');
    const taskPath = `${tasksPath}/${first.id}`;
    await send(taskPath, 'PATCH', { completed: true });
    const expected = { ...first, completed: true };
    const summary = { ...project, totalCount: 2, completedCount: 1 };
    for (const priority of ['Low', 'High', 'Normal', 'High']) {
      expected.priority = priority;
      const response = await send(taskPath, 'PATCH', { priority });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), expected);
      assert.deepEqual(await get(tasksPath), [expected, second]);
      assert.deepEqual(await get(otherPath), [isolated]);
      assert.deepEqual(await get(path), summary);
    }
    for (const priority of ['', 'high', ' High ', null, 1]) {
      assert.equal((await send(taskPath, 'PATCH', { priority })).status, 400);
      assert.deepEqual(await get(tasksPath), [expected, second]);
    }
    assert.equal((await send(taskPath, 'PATCH', { priority: 'Low', title: 'Mixed' })).status, 400);
    assert.equal((await send(taskPath, 'PATCH', { priority: 'Low', completed: false })).status, 400);
    assert.equal((await send(`${otherPath}/${first.id}`, 'PATCH', { priority: 'Low' })).status, 404);
    expected.title = 'Renamed';
    assert.deepEqual(await (await send(taskPath, 'PATCH', { title: ' Renamed ' })).json(), expected);
    await send(path, 'PATCH', { archived: true });
    assert.equal((await send(taskPath, 'PATCH', { priority: 'Low' })).status, 409);
    await stop(child);
    child = undefined;
    child = await start(port, databasePath);
    assert.deepEqual(await get(tasksPath), [expected, second]);
    assert.deepEqual(await get(path), { ...summary, archived: true });
    await send(path, 'PATCH', { archived: false });
    expected.priority = 'Low';
    assert.deepEqual(await (await send(taskPath, 'PATCH', { priority: 'Low' })).json(), expected);
    await stop(child);
    child = undefined;
    child = await start(port, databasePath);
    assert.deepEqual(await get(tasksPath), [expected, second]);
    assert.deepEqual(await get(otherPath), [isolated]);
    assert.deepEqual(await get(path), summary);
  } finally {
    if (child) await stop(child);
    await rm(directory, { recursive: true, force: true });
  }
});

test('existing project databases migrate without losing IDs or names', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-migration-'));
  const databasePath = join(directory, 'legacy.sqlite');
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    INSERT INTO projects (id, name) VALUES (7, 'Legacy project');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO tasks (project_id, title, completed) VALUES (7, 'Saved task', 1);
  `);
  database.close();
  const port = await availablePort();
  let child;
  try {
    child = await start(port, databasePath);
    assert.deepEqual(await (await fetch(`http://127.0.0.1:${port}/api/projects`)).json(), [
      { id: 7, name: 'Legacy project', archived: false, totalCount: 1, completedCount: 1 },
    ]);
    const tasksUrl = `http://127.0.0.1:${port}/api/projects/7/tasks`;
    const expected = [{ id: 1, title: 'Saved task', completed: true, priority: 'Normal' }];
    assert.deepEqual(await (await fetch(tasksUrl)).json(), expected);
    await stop(child);
    child = undefined;
    child = await start(port, databasePath);
    assert.deepEqual(await (await fetch(tasksUrl)).json(), expected);
  } finally {
    if (child) await stop(child);
    await rm(directory, { recursive: true, force: true });
  }
});
