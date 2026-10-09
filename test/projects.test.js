import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const url = await new Promise((resolveUrl, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited (${code}): ${errors}`));
    });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolveUrl(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  return {
    url,
    async stop() {
      const stopped = once(child, 'exit');
      child.kill('SIGTERM');
      await stopped;
    },
  };
}

test('projects and tasks validate, preserve order and ownership, and survive a server restart', async () => {
  const directory = await mkdtemp(resolve('.test-workboard-'));
  let server;
  try {
    const databasePath = resolve(directory, 'nested/projects.sqlite');
    server = await startServer(databasePath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const create = (name) => fetch(`${server.url}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    for (const name of ['', '  \n\t ']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await fetch(`${server.url}/api/projects`)).json(), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('<Example> & "project"')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(first, { id: first.id, name: 'First project', archived: false, totalCount: 0, completedCount: 0 });
    const expected = [first, second];
    assert.deepEqual(await (await fetch(`${server.url}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${server.url}/api/projects/${first.id}`)).json(), first);

    const tasks = (projectId) => fetch(`${server.url}/api/projects/${projectId}/tasks`).then((response) => response.json());
    const createTask = (projectId, title) => fetch(`${server.url}/api/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const completeTask = (projectId, taskId, completed) => fetch(`${server.url}/api/projects/${projectId}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed }),
    });
    for (const title of ['', '  \n\t ']) {
      const response = await createTask(first.id, title);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await tasks(first.id), []);
    const taskResponse = await createTask(first.id, '  First task  ');
    assert.equal(taskResponse.status, 201);
    const firstTask = await taskResponse.json();
    assert.equal(firstTask.title, 'First task');
    assert.equal(firstTask.completed, false);
    const secondTask = await (await createTask(first.id, '<Second> & "task"')).json();
    const otherTask = await (await createTask(second.id, 'Other project task')).json();
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
    assert.deepEqual(await tasks(second.id), [otherTask]);
    assert.equal((await completeTask(second.id, firstTask.id, true)).status, 404);
    assert.equal((await createTask(999999, 'Missing project')).status, 404);
    assert.equal((await completeTask(first.id, firstTask.id, 'true')).status, 400);
    assert.deepEqual(await (await completeTask(first.id, firstTask.id, true)).json(), { ...firstTask, completed: true });
    assert.deepEqual(await (await completeTask(first.id, firstTask.id, false)).json(), firstTask);
    await completeTask(first.id, firstTask.id, true);
    const expectedTasks = [{ ...firstTask, completed: true }, secondTask];
    assert.deepEqual(await tasks(first.id), expectedTasks);

    const home = await fetch(`${server.url}/`);
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-type'), /text\/html/);
    const html = await home.text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    const projectPage = await fetch(`${server.url}/projects/${first.id}`);
    assert.equal(projectPage.status, 200);
    assert.equal(await projectPage.text(), html);
    assert.equal((await fetch(`${server.url}/api/projects/999999`)).status, 404);

    const archiveProject = (projectId, archived) => fetch(`${server.url}/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived }),
    });
    assert.equal((await archiveProject(first.id, 'true')).status, 400);
    assert.equal((await archiveProject(999999, true)).status, 404);
    const archivedFirst = { ...first, archived: true, totalCount: 2, completedCount: 1 };
    assert.deepEqual(await (await archiveProject(first.id, true)).json(), archivedFirst);
    const archivedCreate = await createTask(first.id, 'Cannot add');
    assert.equal(archivedCreate.status, 409);
    assert.deepEqual(await archivedCreate.json(), { error: 'Archived project' });
    assert.equal((await completeTask(first.id, firstTask.id, false)).status, 409);
    assert.deepEqual(await tasks(first.id), expectedTasks);
    expected[0] = archivedFirst;
    expected[1] = { ...second, totalCount: 1 };
    assert.deepEqual(await (await fetch(`${server.url}/api/projects`)).json(), expected);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.deepEqual(await (await fetch(`${server.url}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${server.url}/api/projects/${first.id}`)).json(), archivedFirst);
    assert.equal((await createTask(first.id, 'Still archived')).status, 409);
    assert.equal((await completeTask(first.id, secondTask.id, true)).status, 409);
    assert.deepEqual(await tasks(first.id), expectedTasks);
    assert.deepEqual(await tasks(second.id), [otherTask]);
    assert.equal((await fetch(`${server.url}/projects/${first.id}`)).status, 200);
    expected[0] = { ...archivedFirst, archived: false };
    assert.deepEqual(await (await archiveProject(first.id, false)).json(), expected[0]);
    assert.deepEqual(await tasks(first.id), expectedTasks);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await (await fetch(`${server.url}/api/projects`)).json(), expected);
    const thirdTask = await (await createTask(first.id, 'Third task')).json();
    assert.ok(thirdTask.id > otherTask.id);
    assert.deepEqual(await tasks(first.id), [...expectedTasks, thirdTask]);
    await completeTask(first.id, firstTask.id, false);
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask, thirdTask]);
    expected[0] = { ...first, totalCount: 3, completedCount: 0 };
    const third = await (await create('Third project')).json();
    assert.ok(third.id > second.id);
    assert.deepEqual(await (await fetch(`${server.url}/api/projects`)).json(), [...expected, third]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});


test('renaming preserves identity, order, tasks, summaries, and persistence, and requires an active project', async () => {
  const directory = await mkdtemp(resolve('.test-workboard-'));
  let server;
  try {
    const databasePath = resolve(directory, 'rename.sqlite');
    server = await startServer(databasePath);
    const send = (path, method, body) => fetch(`${server.url}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const get = (path) => fetch(`${server.url}${path}`).then((response) => response.json());
    const first = await (await send('/api/projects', 'POST', { name: 'Original' })).json();
    const second = await (await send('/api/projects', 'POST', { name: 'Second' })).json();
    const path = `/api/projects/${first.id}`;
    const task = await (await send(`${path}/tasks`, 'POST', { title: 'Keep this task' })).json();
    const completedTask = await (await send(`${path}/tasks/${task.id}`, 'PATCH', { completed: true })).json();
    const original = { ...first, totalCount: 1, completedCount: 1 };

    for (const name of ['', ' \n\t ', null, 42]) {
      const response = await send(path, 'PATCH', { name });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
      assert.deepEqual(await get(path), original);
    }
    assert.equal((await send('/api/projects/999999', 'PATCH', { name: 'Missing' })).status, 404);
    const renamed = { ...original, name: '<Renamed> & "project"' };
    const response = await send(path, 'PATCH', { name: '  <Renamed> & "project" \n' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), renamed);
    assert.deepEqual(await get('/api/projects'), [renamed, second]);
    assert.deepEqual(await get(`${path}/tasks`), [completedTask]);
    assert.equal((await fetch(`${server.url}/projects/${first.id}`)).status, 200);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.deepEqual(await get('/api/projects'), [renamed, second]);
    assert.deepEqual(await get(`${path}/tasks`), [completedTask]);
    const archived = { ...renamed, archived: true };
    assert.deepEqual(await (await send(path, 'PATCH', { archived: true })).json(), archived);
    const blocked = await send(path, 'PATCH', { name: 'Cannot rename' });
    assert.equal(blocked.status, 409);
    assert.deepEqual(await blocked.json(), { error: 'Archived project' });
    assert.deepEqual(await get(path), archived);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal((await send(path, 'PATCH', { name: 'Still archived' })).status, 409);
    assert.deepEqual(await (await send(path, 'PATCH', { archived: false })).json(), renamed);
    const restoredRename = { ...renamed, name: 'Restored and renamed' };
    assert.deepEqual(await (await send(path, 'PATCH', { name: ' Restored and renamed ' })).json(), restoredRename);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.deepEqual(await get('/api/projects'), [restoredRename, second]);
    assert.deepEqual(await get(`${path}/tasks`), [completedTask]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task renaming preserves completion, ownership, order, summaries, and persistence across archive and restore', async () => {
  const directory = await mkdtemp(resolve('.test-workboard-'));
  let server;
  try {
    const databasePath = resolve(directory, 'task-rename.sqlite');
    server = await startServer(databasePath);
    const send = (path, method, body) => fetch(`${server.url}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const get = (path) => fetch(`${server.url}${path}`).then((response) => response.json());
    const first = await (await send('/api/projects', 'POST', { name: 'First' })).json();
    const second = await (await send('/api/projects', 'POST', { name: 'Second' })).json();
    const path = `/api/projects/${first.id}`;
    const otherPath = `/api/projects/${second.id}`;
    const task = await (await send(`${path}/tasks`, 'POST', { title: 'Original' })).json();
    const nextTask = await (await send(`${path}/tasks`, 'POST', { title: 'Next' })).json();
    const otherTask = await (await send(`${otherPath}/tasks`, 'POST', { title: 'Other' })).json();
    const taskPath = `${path}/tasks/${task.id}`;
    const completed = await (await send(taskPath, 'PATCH', { completed: true })).json();
    const summary = { ...first, totalCount: 2, completedCount: 1 };

    for (const title of ['', ' \n\t ', null, 42]) {
      const response = await send(taskPath, 'PATCH', { title });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
      assert.deepEqual(await get(`${path}/tasks`), [completed, nextTask]);
    }
    assert.equal((await send(`${otherPath}/tasks/${task.id}`, 'PATCH', { title: 'Wrong project' })).status, 404);
    assert.equal((await send(`${path}/tasks/999999`, 'PATCH', { title: 'Missing task' })).status, 404);
    const renamed = { ...completed, title: '<Renamed> & "task"' };
    const response = await send(taskPath, 'PATCH', { title: '  <Renamed> & "task" \n' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), renamed);
    const renamedOpen = { ...nextTask, title: 'Renamed open task' };
    assert.deepEqual(await (await send(`${path}/tasks/${nextTask.id}`, 'PATCH', { title: ' Renamed open task ' })).json(), renamedOpen);
    assert.deepEqual(await get(`${path}/tasks`), [renamed, renamedOpen]);
    assert.deepEqual(await get(`${otherPath}/tasks`), [otherTask]);
    assert.deepEqual(await get(path), summary);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.deepEqual(await get(`${path}/tasks`), [renamed, renamedOpen]);
    assert.deepEqual(await get(path), summary);
    await send(path, 'PATCH', { archived: true });
    const blocked = await send(taskPath, 'PATCH', { title: 'Cannot rename' });
    assert.equal(blocked.status, 409);
    assert.deepEqual(await blocked.json(), { error: 'Archived project' });
    assert.deepEqual(await get(`${path}/tasks`), [renamed, renamedOpen]);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal((await send(taskPath, 'PATCH', { title: 'Still archived' })).status, 409);
    await send(path, 'PATCH', { archived: false });
    const restoredRename = { ...renamed, title: 'Renamed after restore' };
    assert.deepEqual(await (await send(taskPath, 'PATCH', { title: ' Renamed after restore ' })).json(), restoredRename);
    assert.deepEqual(await get(path), summary);
    assert.deepEqual(await (await send(taskPath, 'PATCH', { completed: false })).json(), { ...restoredRename, completed: false });
    await send(taskPath, 'PATCH', { completed: true });

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.deepEqual(await get(`${path}/tasks`), [restoredRename, renamedOpen]);
    assert.deepEqual(await get(`${otherPath}/tasks`), [otherTask]);
    assert.deepEqual(await get('/api/projects'), [summary, { ...second, totalCount: 1 }]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('migrates an existing projects database without losing projects or tasks', async () => {
  const directory = await mkdtemp(resolve('.test-workboard-'));
  let server;
  try {
    const databasePath = resolve(directory, 'legacy.sqlite');
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id),
        title TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
      );
      INSERT INTO projects (id, name) VALUES (7, 'Existing project');
      INSERT INTO tasks (id, project_id, title, completed) VALUES (12, 7, 'Existing task', 1);
    `);
    database.close();
    server = await startServer(databasePath);
    assert.deepEqual(await (await fetch(`${server.url}/api/projects`)).json(), [
      { id: 7, name: 'Existing project', archived: false, totalCount: 1, completedCount: 1 },
    ]);
    assert.deepEqual(await (await fetch(`${server.url}/api/projects/7/tasks`)).json(), [
      { id: 12, title: 'Existing task', completed: true },
    ]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
