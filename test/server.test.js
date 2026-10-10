import test from 'node:test';
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
  let output = '';
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Server exited (${code}): ${errors}`));
    });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
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

test('projects and tasks: validation, ordering, ownership, completion, routes, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const request = async (path, options) => fetch(`${server.url}${path}`, options);
    const create = name => request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const health = await request('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.deepEqual(await (await request('/api/projects')).json(), []);
    for (const name of ['', '   \t\n', null]) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await request('/api/projects')).json(), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    assert.equal(first.archived, false);
    assert.equal(first.completed, 0);
    assert.equal(first.total, 0);
    const second = await (await create('<script>Example</script>')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await (await request('/api/projects')).json(), [first, second]);
    assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), first);
    assert.equal((await request('/api/projects/99999')).status, 404);
    assert.equal((await request('/projects/' + first.id)).status, 200);
    const html = await (await request('/')).text();
    assert.match(html, /<title>Workboard<\/title>/);
    assert.equal((await request('/app.js')).status, 200);
    const dateModule = await request('/due-date.js');
    assert.equal(dateModule.status, 200);
    assert.match(dateModule.headers.get('content-type'), /text\/javascript/);
    assert.match(await dateModule.text(), /export function normalizeDueDate/);
    assert.equal((await request('/style.css')).status, 200);
    const malformed = await request('/api/projects', { method: 'POST', body: '{' });
    assert.equal(malformed.status, 400);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request('/api/projects')).json(), [first, second]);
    assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), first);
    const third = await (await create('Third')).json();
    assert.ok(third.id > second.id);

    const tasksPath = `/api/projects/${first.id}/tasks`;
    const otherTasksPath = `/api/projects/${second.id}/tasks`;
    const createTask = title => request(tasksPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const completeTask = (path, completed) => request(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed }),
    });
    assert.deepEqual(await (await request(tasksPath)).json(), []);
    for (const title of ['', '  \t\n', null, 42]) {
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
    assert.deepEqual(await (await request(tasksPath)).json(), [firstTask, secondTask]);
    assert.deepEqual(await (await request(otherTasksPath)).json(), []);
    assert.equal((await completeTask(`${otherTasksPath}/${firstTask.id}`, true)).status, 404);
    assert.equal((await request('/api/projects/99999/tasks')).status, 404);
    assert.equal((await completeTask(`${tasksPath}/99999`, true)).status, 404);
    for (const invalid of ['true', 1, null]) {
      assert.equal((await completeTask(`${tasksPath}/${firstTask.id}`, invalid)).status, 400);
    }
    const completed = await completeTask(`${tasksPath}/${firstTask.id}`, true);
    assert.equal(completed.status, 200);
    firstTask.completed = true;
    assert.deepEqual(await completed.json(), firstTask);
    assert.deepEqual(await (await request(tasksPath)).json(), [firstTask, secondTask]);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(tasksPath)).json(), [firstTask, secondTask]);
    assert.deepEqual(await (await request(otherTasksPath)).json(), []);
    assert.equal((await request(`/projects/${first.id}`)).status, 200);
    const archiveProject = archived => request(`/api/projects/${first.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived }),
    });
    for (const invalid of ['true', 1, null]) {
      assert.equal((await archiveProject(invalid)).status, 400);
    }
    assert.equal((await request('/api/projects/99999', {
      method: 'PATCH', body: JSON.stringify({ archived: true }),
    })).status, 404);
    const summary = { ...first, completed: 1, total: 2 };
    assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), summary);
    const archived = { ...summary, archived: true };
    const archivedResponse = await archiveProject(true);
    assert.equal(archivedResponse.status, 200);
    assert.deepEqual(await archivedResponse.json(), archived);
    assert.equal((await createTask('Blocked task')).status, 409);
    assert.equal((await completeTask(`${tasksPath}/${firstTask.id}`, false)).status, 409);
    assert.deepEqual(await (await request(tasksPath)).json(), [firstTask, secondTask]);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), archived);
    assert.deepEqual(await (await request('/api/projects')).json(), [archived, second, third]);
    assert.deepEqual(await (await request(tasksPath)).json(), [firstTask, secondTask]);
    assert.deepEqual(await (await archiveProject(false)).json(), summary);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), summary);
    const reopened = await completeTask(`${tasksPath}/${firstTask.id}`, false);
    assert.equal(reopened.status, 200);
    firstTask.completed = false;
    assert.deepEqual(await reopened.json(), firstTask);
    assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), { ...first, total: 2 });
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(tasksPath)).json(), [firstTask, secondTask]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('rename preserves identity, order, tasks, summaries, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  let server;
  try {
    const databasePath = join(directory, 'projects.sqlite');
    server = await start(databasePath);
    const request = (path, method = 'GET', body) => fetch(`${server.url}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const first = await (await request('/api/projects', 'POST', { name: 'Original' })).json();
    const second = await (await request('/api/projects', 'POST', { name: 'Second' })).json();
    const path = `/api/projects/${first.id}`;
    const task = await (await request(`${path}/tasks`, 'POST', { title: 'Keep this task' })).json();
    task.completed = true;
    await request(`${path}/tasks/${task.id}`, 'PATCH', { completed: true });
    const original = { ...first, total: 1, completed: 1 };
    for (const name of ['', ' \t\n ', null, 123]) {
      const invalid = await request(path, 'PATCH', { name });
      assert.equal(invalid.status, 400);
      assert.deepEqual(await invalid.json(), { error: 'Project name is required' });
      assert.deepEqual(await (await request(path)).json(), original);
    }
    assert.equal((await request('/api/projects/99999', 'PATCH', { name: 'Missing' })).status, 404);
    const renamed = { ...original, name: 'Renamed project' };
    const response = await request(path, 'PATCH', { name: '  Renamed project \t' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), renamed);
    assert.deepEqual(await (await request('/api/projects')).json(), [renamed, second]);
    assert.deepEqual(await (await request(`${path}/tasks`)).json(), [task]);
    assert.equal((await request(`/projects/${first.id}`)).status, 200);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(path)).json(), renamed);
    assert.deepEqual(await (await request('/api/projects')).json(), [renamed, second]);
    assert.deepEqual(await (await request(`${path}/tasks`)).json(), [task]);
    await request(path, 'PATCH', { archived: true });
    assert.equal((await request(path, 'PATCH', { name: 'Blocked' })).status, 409);
    assert.equal((await request(path, 'PATCH', { name: 'Blocked', archived: false })).status, 400);
    assert.deepEqual(await (await request(path)).json(), { ...renamed, archived: true });
    await request(path, 'PATCH', { archived: false });
    const restored = { ...renamed, name: 'Renamed after restore' };
    assert.deepEqual(await (await request(path, 'PATCH', { name: restored.name })).json(), restored);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request('/api/projects')).json(), [restored, second]);
    assert.deepEqual(await (await request(`${path}/tasks`)).json(), [task]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task rename preserves ownership, order, completion, summaries, and persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  let server;
  try {
    const databasePath = join(directory, 'projects.sqlite');
    server = await start(databasePath);
    const request = (path, method = 'GET', body) => fetch(`${server.url}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const project = await (await request('/api/projects', 'POST', { name: 'Owner' })).json();
    const other = await (await request('/api/projects', 'POST', { name: 'Other' })).json();
    const path = `/api/projects/${project.id}`;
    const tasksPath = `${path}/tasks`;
    const first = await (await request(tasksPath, 'POST', { title: 'First' })).json();
    const second = await (await request(tasksPath, 'POST', { title: 'Second' })).json();
    const taskPath = `${tasksPath}/${first.id}`;
    first.completed = true;
    await request(taskPath, 'PATCH', { completed: true });
    const summary = { ...project, total: 2, completed: 1 };
    for (const title of ['', ' \t\n ', null, 123]) {
      const response = await request(taskPath, 'PATCH', { title });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
      assert.deepEqual(await (await request(tasksPath)).json(), [first, second]);
    }
    assert.equal((await request(`/api/projects/${other.id}/tasks/${first.id}`, 'PATCH', { title: 'Wrong owner' })).status, 404);
    assert.equal((await request(`${tasksPath}/99999`, 'PATCH', { title: 'Missing' })).status, 404);
    assert.equal((await request(taskPath, 'PATCH', { title: 'Mixed', completed: false })).status, 400);
    const renamed = { ...first, title: 'Renamed task' };
    const response = await request(taskPath, 'PATCH', { title: '  Renamed task \t' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), renamed);
    assert.deepEqual(await (await request(tasksPath)).json(), [renamed, second]);
    assert.deepEqual(await (await request(`/api/projects/${other.id}/tasks`)).json(), []);
    assert.deepEqual(await (await request(path)).json(), summary);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(tasksPath)).json(), [renamed, second]);
    assert.deepEqual(await (await request(path)).json(), summary);
    await request(path, 'PATCH', { archived: true });
    assert.equal((await request(taskPath, 'PATCH', { title: 'Blocked' })).status, 409);
    assert.deepEqual(await (await request(tasksPath)).json(), [renamed, second]);
    await server.stop();
    server = await start(databasePath);
    assert.equal((await request(taskPath, 'PATCH', { title: 'Still blocked' })).status, 409);
    await request(path, 'PATCH', { archived: false });
    const restored = { ...renamed, title: 'After restore' };
    assert.deepEqual(await (await request(taskPath, 'PATCH', { title: ' After restore ' })).json(), restored);
    const renamedOpen = { ...second, title: 'Renamed open task' };
    assert.deepEqual(await (await request(`${tasksPath}/${second.id}`, 'PATCH', { title: renamedOpen.title })).json(), renamedOpen);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(tasksPath)).json(), [restored, renamedOpen]);
    assert.deepEqual(await (await request(path)).json(), summary);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('priorities are independent, validated, archived read-only, and persistent', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  let server;
  try {
    const databasePath = join(directory, 'projects.sqlite');
    server = await start(databasePath);
    const request = (path, method = 'GET', body) => fetch(`${server.url}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const project = await (await request('/api/projects', 'POST', { name: 'Owner' })).json();
    const other = await (await request('/api/projects', 'POST', { name: 'Other' })).json();
    const path = `/api/projects/${project.id}`;
    const tasksPath = `${path}/tasks`;
    const first = await (await request(tasksPath, 'POST', { title: 'First' })).json();
    const second = await (await request(tasksPath, 'POST', { title: 'Second' })).json();
    const otherTasks = `/api/projects/${other.id}/tasks`;
    const otherTask = await (await request(otherTasks, 'POST', { title: 'Other task' })).json();
    assert.equal(first.priority, 'Normal');
    assert.equal(second.priority, 'Normal');
    const taskPath = `${tasksPath}/${first.id}`;
    await request(taskPath, 'PATCH', { completed: true });
    first.completed = true;
    const summary = { ...project, total: 2, completed: 1 };
    for (const priority of ['High', 'Low', 'Normal', 'High']) {
      const response = await request(taskPath, 'PATCH', { priority });
      assert.equal(response.status, 200);
      first.priority = priority;
      assert.deepEqual(await response.json(), first);
      assert.deepEqual(await (await request(tasksPath)).json(), [first, second]);
      assert.deepEqual(await (await request(otherTasks)).json(), [otherTask]);
      assert.deepEqual(await (await request(path)).json(), summary);
    }
    for (const priority of ['', 'high', ' High ', null, 1, {}, ['Low']]) {
      assert.equal((await request(taskPath, 'PATCH', { priority })).status, 400);
    }
    for (const changes of [{ priority: 'Low', title: 'Mixed' }, { priority: 'Low', completed: false }]) {
      assert.equal((await request(taskPath, 'PATCH', changes)).status, 400);
    }
    assert.equal((await request(`${otherTasks}/${first.id}`, 'PATCH', { priority: 'Low' })).status, 404);
    assert.equal((await request(`${tasksPath}/99999`, 'PATCH', { priority: 'Low' })).status, 404);
    first.title = 'Renamed';
    assert.deepEqual(await (await request(taskPath, 'PATCH', { title: ' Renamed ' })).json(), first);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(tasksPath)).json(), [first, second]);
    await request(path, 'PATCH', { archived: true });
    assert.equal((await request(taskPath, 'PATCH', { priority: 'Low' })).status, 409);
    await server.stop();
    server = await start(databasePath);
    assert.equal((await request(taskPath, 'PATCH', { priority: 'Low' })).status, 409);
    assert.deepEqual(await (await request(tasksPath)).json(), [first, second]);
    await request(path, 'PATCH', { archived: false });
    first.priority = 'Low';
    assert.deepEqual(await (await request(taskPath, 'PATCH', { priority: 'Low' })).json(), first);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(tasksPath)).json(), [first, second]);
    assert.deepEqual(await (await request(path)).json(), summary);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project defaults affect only future tasks and survive rename, archive, restore, and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-default-'));
  let server;
  try {
    const databasePath = join(directory, 'projects.sqlite');
    server = await start(databasePath);
    const request = (path, method = 'GET', body) => fetch(`${server.url}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const project = await (await request('/api/projects', 'POST', { name: 'Owner' })).json();
    const other = await (await request('/api/projects', 'POST', { name: 'Other' })).json();
    assert.equal(project.default_priority, 'Normal');
    assert.equal(other.default_priority, 'Normal');
    const path = `/api/projects/${project.id}`;
    const tasksPath = `${path}/tasks`;
    const tasks = [await (await request(tasksPath, 'POST', { title: 'Existing' })).json()];
    await request(`${tasksPath}/${tasks[0].id}`, 'PATCH', { completed: true });
    tasks[0].completed = true;
    for (const priority of ['High', 'Low', 'Normal']) {
      const response = await request(path, 'PATCH', { default_priority: priority });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ...project, default_priority: priority, total: tasks.length, completed: 1 });
      assert.deepEqual(await (await request(tasksPath)).json(), tasks);
      const task = await (await request(tasksPath, 'POST', { title: `Inherit ${priority}` })).json();
      assert.equal(task.priority, priority);
      tasks.push(task);
      assert.deepEqual(await (await request(`/api/projects/${other.id}`)).json(), other);
    }
    for (const default_priority of ['', 'high', ' High ', null, 1, {}, ['Low']]) {
      assert.equal((await request(path, 'PATCH', { default_priority })).status, 400);
    }
    assert.equal((await request(path, 'PATCH', { default_priority: 'High', name: 'Mixed' })).status, 400);
    assert.equal((await request(path, 'PATCH', { default_priority: 'High', archived: true })).status, 400);
    assert.equal((await request('/api/projects/99999', 'PATCH', { default_priority: 'High' })).status, 404);
    await request(path, 'PATCH', { default_priority: 'High' });
    await request(path, 'PATCH', { name: 'Renamed' });
    await request(path, 'PATCH', { archived: true });
    const expected = { ...project, name: 'Renamed', archived: true, default_priority: 'High', total: 4, completed: 1 };
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(path)).json(), expected);
    assert.deepEqual(await (await request(tasksPath)).json(), tasks);
    assert.equal((await request(path, 'PATCH', { default_priority: 'Low' })).status, 409);
    assert.equal((await request(tasksPath, 'POST', { title: 'Blocked' })).status, 409);
    await request(path, 'PATCH', { archived: false });
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(path)).json(), { ...expected, archived: false });
    assert.deepEqual(await (await request(tasksPath)).json(), tasks);
    const inherited = await (await request(tasksPath, 'POST', { title: 'After restore' })).json();
    assert.equal(inherited.priority, 'High');
    const independent = await (await request(`/api/projects/${other.id}/tasks`, 'POST', { title: 'Independent' })).json();
    assert.equal(independent.priority, 'Normal');
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive and priority migrations preserve existing project IDs, tasks, and completion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-migration-'));
  const databasePath = join(directory, 'legacy.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (id, name) VALUES (17, 'Existing project');
    INSERT INTO tasks (id, project_id, title, completed) VALUES (23, 17, 'Existing task', 1);`);
  legacy.close();
  let server;
  try {
    server = await start(databasePath);
    const request = path => fetch(`${server.url}${path}`);
    const expected = { id: 17, name: 'Existing project', archived: false, default_priority: 'Normal', total: 1, completed: 1 };
    assert.deepEqual(await (await request('/api/projects')).json(), [expected]);
    assert.deepEqual(await (await request('/api/projects/17/tasks')).json(), [
      { id: 23, title: 'Existing task', completed: true, priority: 'Normal', due_date: '' },
    ]);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request('/api/projects/17')).json(), expected);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});


test('due dates preserve task data, ownership and summaries across restart and archive/restore', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-due-date-'));
  const databasePath = join(directory, 'projects.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const request = (path, method = 'GET', body) => fetch(`${server.url}${path}`, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const project = await (await request('/api/projects', 'POST', { name: 'Owner' })).json();
    const other = await (await request('/api/projects', 'POST', { name: 'Other' })).json();
    const path = `/api/projects/${project.id}`;
    const tasksPath = `${path}/tasks`;
    const first = await (await request(tasksPath, 'POST', { title: 'First' })).json();
    const second = await (await request(tasksPath, 'POST', { title: 'Second' })).json();
    const taskPath = `${tasksPath}/${first.id}`;
    assert.equal(first.due_date, '');
    assert.equal(second.due_date, '');
    await request(taskPath, 'PATCH', { completed: true });
    await request(taskPath, 'PATCH', { priority: 'High' });
    first.completed = true;
    first.priority = 'High';
    const summary = { ...project, total: 2, completed: 1 };
    for (const due_date of [' 0001-01-01 ', '2000-02-29', '9999-12-31']) {
      const response = await request(taskPath, 'PATCH', { due_date });
      assert.equal(response.status, 200);
      first.due_date = due_date.trim();
      assert.deepEqual(await response.json(), first);
      assert.deepEqual(await (await request(tasksPath)).json(), [first, second]);
      assert.deepEqual(await (await request(path)).json(), summary);
    }
    for (const due_date of ['1900-02-29', '2024-04-31', '0000-01-01', '2024-1-01', null, 123]) {
      const response = await request(taskPath, 'PATCH', { due_date });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Due date must be a valid YYYY-MM-DD date' });
      assert.deepEqual(await (await request(tasksPath)).json(), [first, second]);
    }
    assert.equal((await request(`/api/projects/${other.id}/tasks/${first.id}`, 'PATCH', { due_date: '2024-01-01' })).status, 404);
    assert.equal((await request(taskPath, 'PATCH', { due_date: '', title: 'Mixed' })).status, 400);
    first.title = 'Renamed';
    assert.deepEqual(await (await request(taskPath, 'PATCH', { title: 'Renamed' })).json(), first);
    await request(path, 'PATCH', { archived: true });
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(tasksPath)).json(), [first, second]);
    assert.equal((await request(taskPath, 'PATCH', { due_date: '' })).status, 409);
    await request(path, 'PATCH', { archived: false });
    assert.deepEqual(await (await request(tasksPath)).json(), [first, second]);
    for (const due_date of ['', ' \t\n ']) {
      first.due_date = '';
      assert.deepEqual(await (await request(taskPath, 'PATCH', { due_date })).json(), first);
    }
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(tasksPath)).json(), [first, second]);
    assert.deepEqual(await (await request(path)).json(), summary);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
