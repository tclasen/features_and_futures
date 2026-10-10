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
    const renamed = { ...original, name: 'ReNamed  \t project' };
    const response = await request(path, 'PATCH', { name: '  ReNamed  \t project \t' });
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
    const restored = { ...renamed, name: 'ReNamed  \t after restore' };
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
    const renamed = { ...first, title: 'ReNamed \t\t  task' };
    const response = await request(taskPath, 'PATCH', { title: '  ReNamed \t\t  task \t' });
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
    const restored = { ...renamed, title: 'After \t  restore' };
    assert.deepEqual(await (await request(taskPath, 'PATCH', { title: ` ${restored.title} ` })).json(), restored);
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
      { id: 23, title: 'Existing task', completed: true, priority: 'Normal', due_date: '', notes: '' },
    ]);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request('/api/projects/17')).json(), expected);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});


test('moves append first arrivals, restore returning order, and preserve data and summaries across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-move-'));
  let server;
  try {
    const db = join(directory, 'db.sqlite');
    server = await start(db);
    const request = (path, method = 'GET', body) => fetch(`${server.url}${path}`, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const a = await (await request('/api/projects', 'POST', { name: 'Source' })).json();
    const b = await (await request('/api/projects', 'POST', { name: 'Destination' })).json();
    const path = p => `/api/projects/${p.id}`;
    const tasks = p => `${path(p)}/tasks`;
    const create = async (p, title) => (await request(tasks(p), 'POST', { title })).json();
    const first = await create(a, 'Older ID');
    const remaining = await create(a, 'Remaining');
    const existing = await create(b, 'Destination first');
    const taskPath = (p, t) => `${tasks(p)}/${t.id}`;
    const move = (p, t, destination) => request(taskPath(p, t), 'PATCH', { destination_project_id: destination });
    for (const change of [{ completed: true }, { priority: 'High' }, { due_date: '0001-01-01' }]) {
      Object.assign(first, await (await request(taskPath(a, first), 'PATCH', change)).json());
    }
    await request(path(b), 'PATCH', { default_priority: 'Low' });
    await request(path(b), 'PATCH', { name: 'Renamed destination' });
    for (const invalid of [a.id, 0, null, String(b.id), 1.5]) {
      assert.equal((await move(a, first, invalid)).status, 400);
    }
    assert.equal((await move(a, first, 99999)).status, 404);
    assert.equal((await request(taskPath(a, first), 'PATCH', { destination_project_id: b.id, title: 'Mixed' })).status, 400);
    await request(path(b), 'PATCH', { archived: true });
    assert.equal((await move(a, first, b.id)).status, 409);
    await request(path(b), 'PATCH', { archived: false });
    await request(path(a), 'PATCH', { archived: true });
    assert.equal((await move(a, first, b.id)).status, 409);
    await request(path(a), 'PATCH', { archived: false });
    assert.deepEqual(await (await move(a, first, b.id)).json(), first);
    assert.deepEqual(await (await request(tasks(a))).json(), [remaining]);
    assert.deepEqual(await (await request(tasks(b))).json(), [existing, first]);
    assert.equal((await move(a, first, b.id)).status, 404);
    const source = await (await request(path(a))).json();
    const destination = await (await request(path(b))).json();
    assert.equal(source.total, 1);
    assert.equal(source.completed, 0);
    assert.equal(destination.total, 2);
    assert.equal(destination.completed, 1);
    const newest = await create(b, 'Created after move');
    assert.equal(newest.priority, 'Low');
    await server.stop();
    server = await start(db);
    assert.deepEqual(await (await request(tasks(b))).json(), [existing, first, newest]);
    assert.deepEqual(await (await move(b, first, a.id)).json(), first);
    assert.deepEqual(await (await request(tasks(a))).json(), [first, remaining]);
    assert.deepEqual(await (await move(b, existing, a.id)).json(), existing);
    assert.deepEqual(await (await request(tasks(a))).json(), [first, remaining, existing]);
    await server.stop();
    server = await start(db);
    assert.deepEqual(await (await request(tasks(a))).json(), [first, remaining, existing]);
    assert.deepEqual(await (await request(tasks(b))).json(), [newest]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('remembered positions survive reverse returns, vacant slots, archive, and migration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-order-'));
  const db = join(directory, 'db.sqlite');
  let server;
  try {
    // Task 011 database: task IDs need not match the current display order.
    const legacy = new DatabaseSync(db);
    legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (id, name) VALUES (1, 'A'), (2, 'B'), (3, 'C');
      INSERT INTO tasks (id, project_id, title, position) VALUES
        (10, 1, 'First', 2), (5, 1, 'Second', 7), (7, 1, 'Third', 9),
        (3, 2, 'Other', 1);`);
    legacy.close();
    server = await start(db);
    const request = async (path, method = 'GET', body) => {
      const response = await fetch(`${server.url}${path}`, {
        method, headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, data: await response.json() };
    };
    const tasks = p => `/api/projects/${p}/tasks`;
    const ids = async p => (await request(tasks(p))).data.map(task => task.id);
    const move = async (p, t, destination) => {
      const result = await request(`${tasks(p)}/${t}`, 'PATCH', { destination_project_id: destination });
      assert.equal(result.status, 200);
      return result.data;
    };
    const projectChange = (p, body) => request(`/api/projects/${p}`, 'PATCH', body);
    assert.deepEqual(await ids(1), [10, 5, 7]);
    await move(1, 10, 2);
    await move(1, 5, 2);
    await move(1, 7, 2);
    assert.deepEqual(await ids(2), [3, 10, 5, 7]);
    // Even an empty project reserves all former positions for future returns.
    const created = (await request(tasks(1), 'POST', { title: 'New' })).data;
    await move(2, 3, 1);
    assert.deepEqual(await ids(1), [created.id, 3]);
    const changes = { title: 'Current title', completed: true, priority: 'High', due_date: '2024-02-29' };
    for (const [key, value] of Object.entries(changes)) {
      assert.equal((await request(`${tasks(2)}/5`, 'PATCH', { [key]: value })).status, 200);
    }
    await projectChange(1, { name: 'Renamed A' });
    await projectChange(1, { archived: true });
    assert.equal((await request(`${tasks(2)}/5`, 'PATCH', { destination_project_id: 1 })).status, 409);
    await server.stop();
    server = await start(db);
    await projectChange(1, { archived: false });
    // Reverse return order restores the old relative positions, not arrival order.
    await move(2, 7, 1);
    const returned = await move(2, 5, 1);
    assert.deepEqual(returned, { id: 5, notes: '', ...changes });
    assert.deepEqual(await ids(1), [5, 7, created.id, 3]);
    await move(2, 10, 1);
    assert.deepEqual(await ids(1), [10, 5, 7, created.id, 3]);
    const summary = (await request('/api/projects/1')).data;
    assert.equal(summary.total, 5);
    assert.equal(summary.completed, 1);
    assert.equal((await request('/api/projects/2')).data.total, 0);
    // Third-project history is independent, and new arrivals follow absent slots.
    await move(1, 5, 3);
    await move(3, 5, 2);
    await move(1, 7, 2);
    assert.deepEqual(await ids(2), [5, 7]);
    const later = (await request(tasks(2), 'POST', { title: 'Later' })).data;
    await move(1, 10, 2);
    await move(1, 3, 2);
    assert.deepEqual(await ids(2), [3, 10, 5, 7, later.id]);
    await server.stop();
    server = await start(db);
    assert.deepEqual(await ids(2), [3, 10, 5, 7, later.id]);
    await move(2, 5, 3);
    assert.deepEqual(await ids(3), [5]);
    await move(3, 5, 1);
    assert.deepEqual(await ids(1), [5, created.id]);
    assert.deepEqual((await request(tasks(1))).data[0], returned);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('notes preserve exact text, other fields and remembered order through migration, moves and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-notes-'));
  const db = join(directory, 'db.sqlite');
  let server;
  try {
    // Pre-notes schema with non-ID ordering and saved task fields.
    const legacy = new DatabaseSync(db);
    legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal');
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal',
        due_date TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (id, name, default_priority) VALUES (1, 'Source', 'High'), (2, 'Destination', 'Low');
      INSERT INTO tasks (id, project_id, title, completed, priority, due_date, position) VALUES
        (10, 1, 'Original', 1, 'High', '0001-01-01', 1), (5, 1, 'Other', 0, 'Low', '', 2);`);
    legacy.close();
    server = await start(db);
    const request = (path, method = 'GET', body) => fetch(`${server.url}${path}`, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const list = async p => (await request(`/api/projects/${p}/tasks`)).json();
    const patch = (p, changes) => request(`/api/projects/${p}/tasks/10`, 'PATCH', changes);
    let expected = { id: 10, title: 'Original', completed: true, priority: 'High', due_date: '0001-01-01', notes: '' };
    const other = { id: 5, title: 'Other', completed: false, priority: 'Low', due_date: '', notes: '' };
    assert.deepEqual(await list(1), [expected, other]);
    const summary = await (await request('/api/projects/1')).json();
    const notes = '  <script>literal markup</script> & <b>text</b>\n\n雪 🐈\t trailing  ';
    expected.notes = notes;
    assert.deepEqual(await (await patch(1, { notes })).json(), expected);
    for (const invalid of [null, 42, {}, ['text'], true]) {
      assert.equal((await patch(1, { notes: invalid })).status, 400);
    }
    assert.equal((await patch(1, { notes: 'Mixed', title: 'Changed' })).status, 400);
    assert.equal((await patch(2, { notes: 'Wrong owner' })).status, 404);
    assert.deepEqual(await list(1), [expected, other]);
    assert.deepEqual(await (await request('/api/projects/1')).json(), summary);
    const created = await (await request('/api/projects/2/tasks', 'POST', { title: 'New task' })).json();
    assert.equal(created.notes, '');
    await server.stop();
    server = await start(db);
    assert.deepEqual(await list(1), [expected, other]);
    expected.title = 'Renamed';
    assert.deepEqual(await (await patch(1, { title: ' Renamed ' })).json(), expected);
    assert.deepEqual(await (await patch(1, { destination_project_id: 2 })).json(), expected);
    assert.deepEqual(await list(2), [created, expected]);
    await request('/api/projects/2', 'PATCH', { archived: true });
    assert.equal((await patch(2, { notes: 'Blocked' })).status, 409);
    await server.stop();
    server = await start(db);
    assert.deepEqual(await list(2), [created, expected]);
    await request('/api/projects/2', 'PATCH', { archived: false });
    expected.notes = ' Current\nnotes 🐈 ';
    assert.deepEqual(await (await patch(2, { notes: expected.notes })).json(), expected);
    assert.deepEqual(await (await patch(2, { destination_project_id: 1 })).json(), expected);
    assert.deepEqual(await list(1), [expected, other]);
    for (const value of [' \n\t ', '']) {
      expected.notes = value;
      assert.deepEqual(await (await patch(1, { notes: value })).json(), expected);
    }
    await server.stop();
    server = await start(db);
    assert.deepEqual(await list(1), [expected, other]);
    assert.deepEqual(await (await request('/api/projects/1')).json(), summary);
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
