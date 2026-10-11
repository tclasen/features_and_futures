import { test } from 'node:test';
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
  let output = '';
  const port = await new Promise((resolve, reject) => {
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(match[1]);
    });
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`Server exited: ${code}`)));
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

test('legacy project databases migrate without losing IDs or tasks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-migration-'));
  const databasePath = join(directory, 'legacy.sqlite');
  let server;
  try {
    const legacy = new DatabaseSync(databasePath);
    legacy.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)));
      INSERT INTO projects (id, name) VALUES (17, 'Legacy');
      INSERT INTO tasks (id, project_id, title, completed) VALUES (23, 17, 'Saved task', 1);
    `);
    legacy.close();
    server = await start(databasePath);
    const expected = [{ id: 17, name: 'Legacy', archived: false, defaultTaskPriority: 'Normal', totalCount: 1, completedCount: 1 }];
    assert.deepEqual(await (await fetch(`${server.url}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${server.url}/api/projects/17/tasks`)).json(), [
      { id: 23, title: 'Saved task', completed: true, priority: 'Normal', dueDate: '', notes: '', deleted: false },
    ]);
    const portable = {
      format: 'workboard-project', version: 1,
      project: {
        name: 'Legacy', archived: false, defaultPriority: 'Normal',
        tasks: [{ title: 'Saved task', completed: true, priority: 'Normal', dueDate: '', notes: '', deleted: false }],
      },
    };
    assert.deepEqual(await (await fetch(`${server.url}/api/projects/17/export`)).json(), portable);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await fetch(`${server.url}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${server.url}/api/projects/17/export`)).json(), portable);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('health, project validation, creation order, routes, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let server;
  try {
    const databasePath = join(directory, 'nested', 'projects.sqlite');
    server = await start(databasePath);
    const request = (path, options) => fetch(`${server.url}${path}`, options);
    const create = (name) => request('/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    const health = await request('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    for (const name of ['', '  \t\n', null, 42]) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      assert.match((await invalid.json()).error, /Project name is required/);
    }
    assert.deepEqual(await (await request('/api/projects')).json(), []);
    const malformed = await request('/api/projects', { method: 'POST', body: '{' });
    assert.equal(malformed.status, 400);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('<script>Not HTML</script>')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await (await request('/api/projects')).json(), [first, second]);
    assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), first);
    for (const path of ['/', `/projects/${first.id}`]) {
      const page = await request(path);
      assert.equal(page.status, 200);
      const html = await page.text();
      assert.match(html, /<title>Workboard<\/title>/);
      assert.match(html, /<script type="module" src="\/app.js"><\/script>/);
    }
    const dateModule = await request('/due-date.js');
    assert.equal(dateModule.status, 200);
    assert.match(dateModule.headers.get('content-type'), /text\/javascript/);
    assert.match(await dateModule.text(), /export function normalizeDueDate/);
    assert.equal((await request('/api/projects/999999')).status, 404);

    const tasksPath = `/api/projects/${first.id}/tasks`;
    const otherTasksPath = `/api/projects/${second.id}/tasks`;
    const createTask = (title, path = tasksPath) => request(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
    });
    const completeTask = (id, completed, path = tasksPath) => request(`${path}/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed }),
    });
    for (const title of ['', ' \t\n ', null, 42]) {
      const invalid = await createTask(title);
      assert.equal(invalid.status, 400);
      assert.match((await invalid.json()).error, /Task title is required/);
    }
    assert.deepEqual(await (await request(tasksPath)).json(), []);
    const taskResponse = await createTask('  First task  ');
    assert.equal(taskResponse.status, 201);
    const task = await taskResponse.json();
    assert.equal(task.title, 'First task');
    assert.equal(task.completed, false);
    const nextTask = await (await createTask('<script>Task text</script>')).json();
    assert.deepEqual(await (await request(tasksPath)).json(), [task, nextTask]);
    assert.deepEqual(await (await request(otherTasksPath)).json(), []);
    const otherTask = await (await createTask('Other project task', otherTasksPath)).json();
    assert.equal((await completeTask(task.id, true, otherTasksPath)).status, 404);
    assert.equal((await completeTask(task.id, 'true')).status, 400);
    assert.equal((await completeTask(task.id, null)).status, 400);
    assert.equal((await createTask('Missing', '/api/projects/999999/tasks')).status, 404);
    assert.equal((await request('/api/projects/999999/tasks')).status, 404);
    const completedResponse = await completeTask(task.id, true);
    assert.equal(completedResponse.status, 200);
    assert.deepEqual(await completedResponse.json(), { ...task, completed: true });
    assert.deepEqual(await (await completeTask(task.id, false)).json(), task);
    await completeTask(task.id, true);
    assert.deepEqual(await (await request(otherTasksPath)).json(), [otherTask]);
    await server.stop();
    server = await start(databasePath);
    let firstSummary = { ...first, totalCount: 2, completedCount: 1 };
    const secondSummary = { ...second, totalCount: 1, completedCount: 0 };
    assert.deepEqual(await (await request('/api/projects')).json(), [firstSummary, secondSummary]);
    assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), firstSummary);
    assert.deepEqual(await (await request(tasksPath)).json(), [{ ...task, completed: true }, nextTask]);
    assert.deepEqual(await (await request(otherTasksPath)).json(), [otherTask]);
    assert.deepEqual(await (await completeTask(task.id, false)).json(), task);
    assert.equal((await request(`/projects/${first.id}`)).status, 200);
    await completeTask(task.id, true);
    const rename = (name) => request(`/api/projects/${first.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    for (const name of ['', ' \t\n ', null, 42]) {
      const invalid = await rename(name);
      assert.equal(invalid.status, 400);
      assert.match((await invalid.json()).error, /Project name is required/);
      assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), firstSummary);
    }
    const renamed = await rename('  Renamed project  ');
    assert.equal(renamed.status, 200);
    firstSummary = { ...firstSummary, name: 'Renamed project' };
    assert.deepEqual(await renamed.json(), firstSummary);
    assert.deepEqual(await (await request('/api/projects')).json(), [firstSummary, secondSummary]);
    assert.deepEqual(await (await request(tasksPath)).json(), [{ ...task, completed: true }, nextTask]);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request('/api/projects')).json(), [firstSummary, secondSummary]);
    assert.equal((await request(`/projects/${first.id}`)).status, 200);
    const archiveProject = (archived) => request(`/api/projects/${first.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived }),
    });
    assert.equal((await archiveProject('true')).status, 400);
    assert.deepEqual(await (await archiveProject(true)).json(), { ...firstSummary, archived: true });
    assert.equal((await rename('Forbidden rename')).status, 409);
    assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), {
      ...firstSummary, archived: true,
    });
    assert.equal((await createTask('Forbidden')).status, 409);
    assert.equal((await completeTask(task.id, false)).status, 409);
    assert.deepEqual(await (await request(tasksPath)).json(), [{ ...task, completed: true }, nextTask]);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request('/api/projects')).json(), [
      { ...firstSummary, archived: true }, secondSummary,
    ]);
    assert.deepEqual(await (await archiveProject(false)).json(), firstSummary);
    firstSummary = { ...firstSummary, name: 'Restored and renamed' };
    assert.deepEqual(await (await rename(' Restored and renamed ')).json(), firstSummary);
    assert.deepEqual(await (await request(tasksPath)).json(), [{ ...task, completed: true }, nextTask]);
    assert.equal((await completeTask(task.id, false)).status, 200);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), {
      ...firstSummary, completedCount: 0,
    });
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});


test('task renaming preserves ownership, order, completion, summaries and restart data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const request = async (path, method, body) => fetch(`${server.url}/api/projects${path}`, method ? {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    } : undefined);
    const first = await (await request('', 'POST', { name: 'First' })).json();
    const second = await (await request('', 'POST', { name: 'Second' })).json();
    const tasksPath = `/${first.id}/tasks`;
    const task = await (await request(tasksPath, 'POST', { title: 'Original' })).json();
    const next = await (await request(tasksPath, 'POST', { title: 'Next' })).json();
    await request(`${tasksPath}/${task.id}`, 'PATCH', { completed: true });
    const rename = (title, path = tasksPath) => request(`${path}/${task.id}`, 'PATCH', { title });
    const summary = await (await request(`/${first.id}`)).json();
    for (const title of ['', ' \t\n ', null, 42]) {
      const invalid = await rename(title);
      assert.equal(invalid.status, 400);
      assert.equal((await invalid.json()).error, 'Task title is required');
    }
    assert.equal((await rename('Wrong owner', `/${second.id}/tasks`)).status, 404);
    const renamed = { ...task, title: 'Renamed task', completed: true };
    const response = await rename('  Renamed task  ');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), renamed);
    assert.deepEqual(await (await request(tasksPath)).json(), [renamed, next]);
    assert.deepEqual(await (await request(`/${second.id}/tasks`)).json(), []);
    assert.deepEqual(await (await request(`/${first.id}`)).json(), summary);
    await request(`/${first.id}`, 'PATCH', { archived: true });
    assert.equal((await rename('Forbidden')).status, 409);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(tasksPath)).json(), [renamed, next]);
    assert.deepEqual(await (await request(`/${first.id}`)).json(), { ...summary, archived: true });
    await request(`/${first.id}`, 'PATCH', { archived: false });
    assert.deepEqual(await (await rename(' Restored title ')).json(), { ...renamed, title: 'Restored title' });
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(tasksPath)).json(), [{ ...renamed, title: 'Restored title' }, next]);
    assert.deepEqual(await (await request(`/${first.id}`)).json(), summary);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});


test('priorities default, validate, remain independent, and persist through rename/archive/restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const request = (path, method, body) => fetch(`${server.url}/api/projects${path}`, method ? {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    } : undefined);
    const first = await (await request('', 'POST', { name: 'First' })).json();
    const other = await (await request('', 'POST', { name: 'Other' })).json();
    const path = `/${first.id}/tasks`;
    const task = await (await request(path, 'POST', { title: 'Task' })).json();
    const next = await (await request(path, 'POST', { title: 'Next' })).json();
    const otherTask = await (await request(`/${other.id}/tasks`, 'POST', { title: 'Other task' })).json();
    assert.equal(task.priority, 'Normal');
    assert.equal(next.priority, 'Normal');
    const patch = (body) => request(`${path}/${task.id}`, 'PATCH', body);
    await patch({ completed: true });
    const summary = await (await request(`/${first.id}`)).json();
    for (const priority of ['', 'high', ' High ', null, 42]) {
      assert.equal((await patch({ priority })).status, 400);
    }
    assert.equal((await request(`/${other.id}/tasks/${task.id}`, 'PATCH', { priority: 'High' })).status, 404);
    for (const priority of ['Low', 'Normal', 'High']) {
      const response = await patch({ priority });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ...task, completed: true, priority });
    }
    const saved = { ...task, title: 'Renamed', completed: true, priority: 'High' };
    assert.deepEqual(await (await patch({ title: ' Renamed ' })).json(), saved);
    assert.deepEqual(await (await request(path)).json(), [saved, next]);
    assert.deepEqual(await (await request(`/${other.id}/tasks`)).json(), [otherTask]);
    assert.deepEqual(await (await request(`/${first.id}`)).json(), summary);
    await request(`/${first.id}`, 'PATCH', { archived: true });
    assert.equal((await patch({ priority: 'Low' })).status, 409);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(path)).json(), [saved, next]);
    await request(`/${first.id}`, 'PATCH', { archived: false });
    assert.deepEqual(await (await patch({ priority: 'Low' })).json(), { ...saved, priority: 'Low' });
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(path)).json(), [{ ...saved, priority: 'Low' }, next]);
    assert.deepEqual(await (await request(`/${first.id}`)).json(), summary);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('due dates validate, clear, remain independent and persist through edits/archive/restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-dates-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const request = (path, method, body) => fetch(`${server.url}/api/projects${path}`, method ? {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    } : undefined);
    const project = await (await request('', 'POST', { name: 'Dates' })).json();
    const other = await (await request('', 'POST', { name: 'Other' })).json();
    const path = `/${project.id}/tasks`;
    const task = await (await request(path, 'POST', { title: 'First' })).json();
    const next = await (await request(path, 'POST', { title: 'Next' })).json();
    assert.equal(task.dueDate, '');
    const patch = (body) => request(`${path}/${task.id}`, 'PATCH', body);
    await patch({ completed: true });
    await patch({ priority: 'High' });
    const summary = await (await request(`/${project.id}`)).json();
    let saved = { ...task, completed: true, priority: 'High', dueDate: '2000-02-29' };
    assert.deepEqual(await (await patch({ dueDate: ' 2000-02-29 ' })).json(), saved);
    for (const dueDate of ['1900-02-29', '0000-01-01', '2024-04-31', '2025-1-01', null, 123]) {
      const invalid = await patch({ dueDate });
      assert.equal(invalid.status, 400);
      assert.equal((await invalid.json()).error, 'Due date must be a valid YYYY-MM-DD date');
      assert.deepEqual(await (await request(path)).json(), [saved, next]);
    }
    assert.equal((await request(`/${other.id}/tasks/${task.id}`, 'PATCH', { dueDate: '2025-01-01' })).status, 404);
    saved = { ...saved, title: 'Renamed' };
    assert.deepEqual(await (await patch({ title: ' Renamed ' })).json(), saved);
    assert.deepEqual(await (await request(`/${project.id}`)).json(), summary);
    await request(`/${project.id}`, 'PATCH', { archived: true });
    assert.equal((await patch({ dueDate: '' })).status, 409);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(path)).json(), [saved, next]);
    await request(`/${project.id}`, 'PATCH', { archived: false });
    for (const dueDate of ['', ' \t\n ']) {
      assert.deepEqual(await (await patch({ dueDate })).json(), { ...saved, dueDate: '' });
    }
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(path)).json(), [{ ...saved, dueDate: '' }, next]);
    assert.deepEqual(await (await request(`/${project.id}`)).json(), summary);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project defaults apply only to future tasks and survive rename, archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-default-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const request = (path, method, body) => fetch(`${server.url}/api/projects${path}`, method ? {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    } : undefined);
    const first = await (await request('', 'POST', { name: 'First' })).json();
    const other = await (await request('', 'POST', { name: 'Other' })).json();
    assert.equal(first.defaultTaskPriority, 'Normal');
    assert.equal(other.defaultTaskPriority, 'Normal');
    const path = `/${first.id}`;
    const createTask = async (title) => (await request(`${path}/tasks`, 'POST', { title })).json();
    const original = await createTask('Original');
    await request(`${path}/tasks/${original.id}`, 'PATCH', { completed: true });
    const patchDefault = (defaultTaskPriority) => request(path, 'PATCH', { defaultTaskPriority });
    for (const value of ['', 'high', ' High ', null, 42]) {
      assert.equal((await patchDefault(value)).status, 400);
    }
    const tasks = [{ ...original, completed: true }];
    for (const priority of ['Low', 'Normal', 'High']) {
      const response = await patchDefault(priority);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).defaultTaskPriority, priority);
      assert.deepEqual(await (await request(`${path}/tasks`)).json(), tasks);
      const task = await createTask(priority);
      assert.equal(task.priority, priority);
      tasks.push(task);
    }
    assert.deepEqual(await (await request(`/${other.id}`)).json(), other);
    await request(path, 'PATCH', { name: 'Renamed' });
    const summary = await (await request(path)).json();
    assert.equal(summary.defaultTaskPriority, 'High');
    assert.equal(summary.completedCount, 1);
    assert.equal(summary.totalCount, 4);
    await request(path, 'PATCH', { archived: true });
    assert.equal((await patchDefault('Low')).status, 409);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(path)).json(), { ...summary, archived: true });
    assert.deepEqual(await (await request(`${path}/tasks`)).json(), tasks);
    await request(path, 'PATCH', { archived: false });
    assert.deepEqual(await (await request(path)).json(), summary);
    const inherited = await createTask('After restore');
    assert.equal(inherited.priority, 'High');
    await patchDefault('Low');
    await server.stop();
    server = await start(databasePath);
    assert.equal((await (await request(path)).json()).defaultTaskPriority, 'Low');
    assert.deepEqual(await (await request(`${path}/tasks`)).json(), [...tasks, inherited]);
    assert.equal((await createTask('After restart')).priority, 'Low');
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('remembered positions migrate current order and survive reverse returns, absences and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-return-order-'));
  const databasePath = join(directory, 'tasks.sqlite');
  let server;
  try {
    // Task 011 database: its current order need not follow task IDs.
    const legacy = new DatabaseSync(databasePath);
    legacy.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL);
      INSERT INTO projects VALUES (1, 'Home'), (2, 'Away'), (3, 'Third');
      INSERT INTO tasks VALUES (10, 1, 'First', 0, 3), (5, 1, 'Second', 1, 7),
        (8, 1, 'Third', 0, 9), (20, 2, 'Existing', 0, 1);
    `);
    legacy.close();
    server = await start(databasePath);
    async function request(path, method = 'GET', body, status = 200) {
      const response = await fetch(`${server.url}/api/projects${path}`, {
        method, headers: { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      assert.equal(response.status, status);
      return response.json();
    }
    const ids = async (project) => (await request(`/${project}/tasks`)).map((task) => task.id);
    const move = (task, source, destination, status = 200) =>
      request(`/${source}/tasks/${task}`, 'PATCH', { destinationProjectId: destination }, status);
    assert.deepEqual(await ids(1), [10, 5, 8]);
    await move(10, 1, 2);
    await move(5, 1, 2);
    await move(8, 1, 2);
    assert.deepEqual(await ids(2), [20, 10, 5, 8]);
    // Reserve departed positions even if no tasks remain in the home project.
    const newest = await request('/1/tasks', 'POST', { title: 'New' }, 201);
    await move(20, 2, 1);
    await request('/1', 'PATCH', { name: 'Renamed home' });
    const edited = await request('/2/tasks/5', 'PATCH', { title: 'Current title' });
    await request('/2/tasks/5', 'PATCH', { priority: 'High' });
    const saved = await request('/2/tasks/5', 'PATCH', { dueDate: '2028-02-29' });
    assert.equal(edited.completed, true);
    await request('/1', 'PATCH', { archived: true });
    await move(8, 2, 1, 409);
    await server.stop();
    server = await start(databasePath);
    await request('/1', 'PATCH', { archived: false });
    await move(8, 2, 1);
    await move(5, 2, 1);
    await move(10, 2, 1);
    assert.deepEqual(await ids(1), [10, 5, 8, newest.id, 20]);
    assert.deepEqual((await request('/1/tasks'))[1], saved);
    assert.deepEqual(await ids(2), []);
    const summary = await request('/1');
    assert.equal(summary.totalCount, 5);
    assert.equal(summary.completedCount, 1);
    // Independent positions for a third project and repeated trips.
    await move(5, 1, 3);
    await move(10, 1, 3);
    await move(5, 3, 2);
    await move(10, 3, 2);
    assert.deepEqual(await ids(2), [10, 5]);
    await move(10, 2, 3);
    await move(5, 2, 3);
    assert.deepEqual(await ids(3), [5, 10]);
    await move(5, 3, 1);
    await move(10, 3, 1);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await ids(1), [10, 5, 8, newest.id, 20]);
    assert.deepEqual((await request('/1/tasks'))[1], saved);
    assert.deepEqual(await request('/1'), summary);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('moves preserve task data, first-arrival order, summaries and ownership across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-moves-'));
  const databasePath = join(directory, 'tasks.sqlite');
  let server;
  try {
    server = await start(databasePath);
    async function request(path, method = 'GET', body, status = 200) {
      const response = await fetch(`${server.url}/api/projects${path}`, {
        method, headers: { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      assert.equal(response.status, status);
      return response.json();
    }
    const source = await request('', 'POST', { name: 'Source' }, 201);
    const destination = await request('', 'POST', { name: 'Destination' }, 201);
    const archived = await request('', 'POST', { name: 'Archived' }, 201);
    const sourcePath = `/${source.id}`;
    const destinationPath = `/${destination.id}`;
    const first = await request(`${sourcePath}/tasks`, 'POST', { title: 'First' }, 201);
    const remaining = await request(`${sourcePath}/tasks`, 'POST', { title: 'Remaining' }, 201);
    // This newer task must stay before the older moved task in the destination.
    const existing = await request(`${destinationPath}/tasks`, 'POST', { title: 'Existing' }, 201);
    await request(destinationPath, 'PATCH', { defaultTaskPriority: 'Low' });
    const taskPath = `${sourcePath}/tasks/${first.id}`;
    await request(taskPath, 'PATCH', { priority: 'High' });
    await request(taskPath, 'PATCH', { completed: true });
    const saved = await request(taskPath, 'PATCH', { dueDate: '0001-01-01' });
    await request(`/${archived.id}`, 'PATCH', { archived: true });
    for (const invalid of [source.id, null, '2', 1.5]) {
      await request(taskPath, 'PATCH', { destinationProjectId: invalid }, 400);
    }
    await request(taskPath, 'PATCH', { destinationProjectId: 99999 }, 404);
    await request(taskPath, 'PATCH', { destinationProjectId: archived.id }, 409);
    await request(sourcePath, 'PATCH', { archived: true });
    await request(taskPath, 'PATCH', { destinationProjectId: destination.id }, 409);
    await request(sourcePath, 'PATCH', { archived: false });
    assert.deepEqual(await request(taskPath, 'PATCH', { destinationProjectId: destination.id }), saved);
    assert.deepEqual(await request(`${sourcePath}/tasks`), [remaining]);
    assert.deepEqual(await request(`${destinationPath}/tasks`), [existing, saved]);
    await request(taskPath, 'PATCH', { completed: false }, 404);
    const sourceSummary = await request(sourcePath);
    const destinationSummary = await request(destinationPath);
    assert.equal(sourceSummary.totalCount, 1);
    assert.equal(sourceSummary.completedCount, 0);
    assert.equal(destinationSummary.totalCount, 2);
    assert.equal(destinationSummary.completedCount, 1);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await request(`${destinationPath}/tasks`), [existing, saved]);
    assert.deepEqual(await request(sourcePath), sourceSummary);
    assert.deepEqual(await request(destinationPath), destinationSummary);
    await request(`${destinationPath}/tasks/${first.id}`, 'PATCH', { destinationProjectId: source.id });
    assert.deepEqual(await request(`${sourcePath}/tasks`), [saved, remaining]);
    // New tasks append after established positions; blank-date moves preserve data.
    const newest = await request(`${sourcePath}/tasks`, 'POST', { title: 'Newest' }, 201);
    await request(`${sourcePath}/tasks/${remaining.id}`, 'PATCH', { destinationProjectId: destination.id });
    assert.deepEqual(await request(`${sourcePath}/tasks`), [saved, newest]);
    assert.deepEqual(await request(`${destinationPath}/tasks`), [existing, remaining]);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await request(`${sourcePath}/tasks`), [saved, newest]);
    assert.deepEqual(await request(`${destinationPath}/tasks`), [existing, remaining]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('soft deletion preserves fields, reserved positions and live summaries across restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-deletion-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const request = (path, method, body) => fetch(`${server.url}/api/projects${path}`, method ? {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    } : undefined);
    const source = await (await request('', 'POST', { name: 'Source' })).json();
    const destination = await (await request('', 'POST', { name: 'Destination' })).json();
    const path = `/${source.id}/tasks`;
    const task = await (await request(path, 'POST', { title: 'First' })).json();
    const second = await (await request(path, 'POST', { title: 'Second' })).json();
    assert.equal(task.deleted, false);
    const patch = (changes, projectId = source.id) => request(`/${projectId}/tasks/${task.id}`, 'PATCH', changes);
    for (const changes of [{ completed: true }, { priority: 'High' }, { dueDate: '0001-01-01' }, { notes: '  雪\n<literal>  ' }]) {
      Object.assign(task, await (await patch(changes)).json());
    }
    await patch({ destinationProjectId: destination.id });
    await patch({ destinationProjectId: source.id }, destination.id);
    const deleted = { ...task, deleted: true };
    assert.deepEqual(await (await patch({ deleted: true })).json(), deleted);
    for (const changes of [{ title: 'Changed' }, { completed: false }, { priority: 'Low' }, { dueDate: '' }, { notes: '' }, { destinationProjectId: destination.id }]) {
      assert.equal((await patch(changes)).status, 409);
    }
    assert.equal((await patch({ deleted: 'false' })).status, 400);
    assert.equal((await patch({ deleted: false, title: 'Changed' })).status, 400);
    assert.equal((await request(`${path}/${second.id}`, 'PATCH', { deleted: true })).status, 200);
    const summary = await (await request(`/${source.id}`)).json();
    assert.equal(summary.totalCount, 0);
    assert.equal(summary.completedCount, 0);
    await request(`/${source.id}`, 'PATCH', { archived: true });
    assert.equal((await patch({ deleted: false })).status, 409);
    assert.equal((await patch({ deleted: true })).status, 409);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(path)).json(), [deleted, { ...second, deleted: true }]);
    await request(`/${source.id}`, 'PATCH', { archived: false });
    await request(`/${source.id}`, 'PATCH', { defaultTaskPriority: 'Low' });
    const later = await (await request(path, 'POST', { title: 'Later' })).json();
    await request(`${path}/${second.id}`, 'PATCH', { deleted: false });
    assert.deepEqual(await (await patch({ deleted: false })).json(), task);
    assert.deepEqual(await (await request(path)).json(), [task, second, later]);
    const restoredSummary = await (await request(`/${source.id}`)).json();
    assert.equal(restoredSummary.totalCount, 3);
    assert.equal(restoredSummary.completedCount, 1);
    await patch({ destinationProjectId: destination.id });
    await patch({ deleted: true }, destination.id);
    assert.equal((await patch({ destinationProjectId: source.id }, destination.id)).status, 409);
    await server.stop();
    server = await start(databasePath);
    await patch({ deleted: false }, destination.id);
    await patch({ destinationProjectId: source.id }, destination.id);
    assert.deepEqual(await (await request(path)).json(), [task, second, later]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('notes preserve exact text, task data, remembered positions and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-notes-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const request = (path, method, body) => fetch(`${server.url}/api/projects${path}`, method ? {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    } : undefined);
    const source = await (await request('', 'POST', { name: 'Source' })).json();
    const destination = await (await request('', 'POST', { name: 'Destination' })).json();
    const path = `/${source.id}/tasks`;
    const task = await (await request(path, 'POST', { title: 'Title' })).json();
    const next = await (await request(path, 'POST', { title: 'Next' })).json();
    assert.equal(task.notes, '');
    const patch = (changes, projectId = source.id) => request(`/${projectId}/tasks/${task.id}`, 'PATCH', changes);
    await patch({ completed: true });
    await patch({ priority: 'High' });
    await patch({ dueDate: '2028-02-29' });
    const notes = '  First line\n\n\tUnicode: 雪 🚀\n<script>literal & markup</script>  ';
    let expected = { ...task, completed: true, priority: 'High', dueDate: '2028-02-29', notes };
    assert.deepEqual(await (await patch({ notes })).json(), expected);
    for (const invalid of [null, 42, {}, []]) {
      assert.equal((await patch({ notes: invalid })).status, 400);
    }
    assert.equal((await patch({ notes }, destination.id)).status, 404);
    assert.deepEqual(await (await request(path)).json(), [expected, next]);
    expected = { ...expected, title: 'Renamed' };
    assert.deepEqual(await (await patch({ title: ' Renamed ' })).json(), expected);
    assert.deepEqual(await (await patch({ destinationProjectId: destination.id })).json(), expected);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(`/${destination.id}/tasks`)).json(), [expected]);
    assert.deepEqual(await (await patch({ destinationProjectId: source.id }, destination.id)).json(), expected);
    assert.deepEqual(await (await request(path)).json(), [expected, next]);
    const summary = await (await request(`/${source.id}`)).json();
    await request(`/${source.id}`, 'PATCH', { archived: true });
    assert.equal((await patch({ notes: '' })).status, 409);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(path)).json(), [expected, next]);
    await request(`/${source.id}`, 'PATCH', { archived: false });
    for (const value of [' \t\n ', '']) {
      expected = { ...expected, notes: value };
      assert.deepEqual(await (await patch({ notes: value })).json(), expected);
    }
    assert.deepEqual(await (await request(`/${source.id}`)).json(), summary);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request(path)).json(), [expected, next]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('portable export includes current live/deleted state in remembered order without mutation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-export-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const request = (path, method, body) => fetch(`${server.url}/api/projects${path}`, method ? {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    } : undefined);
    const project = await (await request('', 'POST', { name: '  MiXeD  雪 <name>  ' })).json();
    const other = await (await request('', 'POST', { name: 'Other' })).json();
    const empty = await (await request('', 'POST', { name: 'Empty' })).json();
    const path = `/${project.id}`;
    const first = await (await request(`${path}/tasks`, 'POST', { title: '  First\t  TITLE  ' })).json();
    const second = await (await request(`${path}/tasks`, 'POST', { title: 'Second' })).json();
    await request(`/${other.id}/tasks`, 'POST', { title: 'Never export me' });
    const patch = (body, owner = project.id) => request(`/${owner}/tasks/${first.id}`, 'PATCH', body);
    const notes = '  雪 🚀\r\n\r\n\t<script>literal & markup</script>\rLast  ';
    for (const changes of [{ completed: true }, { priority: 'High' }, { dueDate: '0001-01-01' }, { notes }]) {
      await patch(changes);
    }
    await patch({ destinationProjectId: other.id });
    await patch({ title: 'Current  TITLE' }, other.id);
    await patch({ destinationProjectId: project.id }, other.id);
    await patch({ deleted: true });
    await request(path, 'PATCH', { defaultTaskPriority: 'Low' });
    await request(path, 'PATCH', { archived: true });
    const snapshot = async () => ({
      projects: await (await request('')).json(),
      tasks: await (await request(`${path}/tasks`)).json(),
      otherTasks: await (await request(`/${other.id}/tasks`)).json(),
    });
    const before = await snapshot();
    const expected = {
      format: 'workboard-project', version: 1,
      project: {
        name: project.name, archived: true, defaultPriority: 'Low',
        tasks: [
          { title: 'Current  TITLE', completed: true, priority: 'High', dueDate: '0001-01-01', notes: notes.replace(/\r\n?/g, '\n'), deleted: true },
          { title: second.title, completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false },
        ],
      },
    };
    const checkExport = async () => {
      const response = await request(`${path}/export`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
      assert.equal(response.headers.get('content-disposition'), 'attachment; filename="workboard-project.json"');
      assert.deepEqual(await response.json(), expected);
      assert.deepEqual(await snapshot(), before);
      assert.equal((await snapshot()).tasks[0].notes, notes);
    };
    await checkExport();
    await server.stop();
    server = await start(databasePath);
    await checkExport();
    // Projects with only deleted tasks and empty projects remain downloadable.
    await request(path, 'PATCH', { archived: false });
    await request(`${path}/tasks/${second.id}`, 'PATCH', { deleted: true });
    expected.project.archived = false;
    expected.project.tasks[1].deleted = true;
    assert.deepEqual(await (await request(`${path}/export`)).json(), expected);
    assert.deepEqual(await (await request(`/${empty.id}/export`)).json(), {
      format: 'workboard-project', version: 1,
      project: { name: 'Empty', archived: false, defaultPriority: 'Normal', tasks: [] },
    });
    assert.equal((await request('/999999/export')).status, 404);
    assert.equal((await request(`${path}/export`, 'POST', {})).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
