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
      { id: 23, title: 'Saved task', completed: true, priority: 'Normal' },
    ]);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await fetch(`${server.url}/api/projects`)).json(), expected);
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
      assert.match(await page.text(), /<title>Workboard<\/title>/);
    }
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
