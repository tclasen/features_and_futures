import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const url = await new Promise((resolveUrl, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 10000);
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolveUrl(`http://127.0.0.1:${match[1]}`);
      }
    });
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Server exited (${code}): ${errors}`));
    });
  });
  return { url, async stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  } };
}

test('projects and tasks validate, stay isolated, and survive a restart', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'test-'));
  const databasePath = resolve(directory, 'projects.sqlite');
  let server;
  try {
    // Upgrade a database with the schema used before archive support.
    const legacy = new DatabaseSync(databasePath);
    legacy.exec(`CREATE TABLE projects (
      position INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, name TEXT NOT NULL
    ); INSERT INTO projects (id, name) VALUES ('legacy', 'Existing project');
    CREATE TABLE tasks (
      position INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
      project_id TEXT NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
    ); INSERT INTO tasks (id, project_id, title, completed)
      VALUES ('legacy-task', 'legacy', 'Existing task', 1)`);
    legacy.close();
    server = await start(databasePath);
    const get = async path => {
      const response = await fetch(server.url + path);
      assert.equal(response.status, 200);
      return response.json();
    };
    const create = name => fetch(server.url + '/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    assert.deepEqual(await get('/health'), { status: 'ok' });
    const existing = { id: 'legacy', name: 'Existing project', archived: false, default_task_priority: 'Normal', total: 1, completed: 1 };
    assert.deepEqual(await get('/api/projects'), [existing]);
    const legacyTasks = [{ id: 'legacy-task', title: 'Existing task', completed: true, priority: 'Normal', due_date: '' }];
    assert.deepEqual(await get('/api/projects/legacy/tasks'), legacyTasks);
    for (const name of ['', ' \t\n ']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await get('/api/projects'), [existing]);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    assert.ok(first.id);
    const secondResponse = await create('Second project');
    const second = await secondResponse.json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await get('/api/projects'), [existing, first, second]);
    assert.equal(first.archived, false);
    assert.equal(first.total, 0);
    assert.equal(first.completed, 0);
    assert.deepEqual(await get(`/api/projects/${first.id}`), first);
    const firstTasks = `/api/projects/${first.id}/tasks`;
    const secondTasks = `/api/projects/${second.id}/tasks`;
    const createTask = (path, title) => fetch(server.url + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const completeTask = (path, completed) => fetch(server.url + path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed }),
    });
    assert.deepEqual(await get(firstTasks), []);
    for (const title of ['', ' \t\n ']) {
      const response = await createTask(firstTasks, title);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await get(firstTasks), []);
    const taskResponse = await createTask(firstTasks, '  First task  ');
    assert.equal(taskResponse.status, 201);
    const firstTask = await taskResponse.json();
    assert.ok(firstTask.id);
    assert.equal(firstTask.title, 'First task');
    assert.equal(firstTask.completed, false);
    assert.equal(firstTask.priority, 'Normal');
    const nextTaskResponse = await createTask(firstTasks, 'Second task');
    const secondTask = await nextTaskResponse.json();
    assert.notEqual(firstTask.id, secondTask.id);
    assert.deepEqual(await get(firstTasks), [firstTask, secondTask]);
    assert.deepEqual(await get(secondTasks), []);
    const otherTaskResponse = await createTask(secondTasks, 'Other project task');
    const otherTask = await otherTaskResponse.json();
    assert.equal(secondTask.priority, 'Normal');
    assert.equal(otherTask.priority, 'Normal');
    assert.deepEqual(await get(secondTasks), [otherTask]);
    const wrongProject = await completeTask(`${secondTasks}/${firstTask.id}`, true);
    assert.equal(wrongProject.status, 404);
    const invalidCompletion = await completeTask(`${firstTasks}/${firstTask.id}`, 'true');
    assert.equal(invalidCompletion.status, 400);
    assert.deepEqual(await get(firstTasks), [firstTask, secondTask]);
    const completion = await completeTask(`${firstTasks}/${firstTask.id}`, true);
    assert.equal(completion.status, 200);
    firstTask.completed = true;
    assert.deepEqual(await completion.json(), firstTask);
    const reopened = await completeTask(`${firstTasks}/${firstTask.id}`, false);
    assert.equal(reopened.status, 200);
    firstTask.completed = false;
    assert.deepEqual(await reopened.json(), firstTask);
    await completeTask(`${firstTasks}/${firstTask.id}`, true);
    firstTask.completed = true;
    assert.deepEqual(await get(firstTasks), [firstTask, secondTask]);
    assert.deepEqual(await get(secondTasks), [otherTask]);
    const unknownProject = await createTask('/api/projects/missing/tasks', 'Orphan');
    assert.equal(unknownProject.status, 404);
    first.total = 2;
    first.completed = 1;
    second.total = 1;
    const setPriority = (path, priority) => fetch(server.url + path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority }),
    });
    assert.equal((await setPriority(`${secondTasks}/${firstTask.id}`, 'High')).status, 404);
    for (const priority of ['', 'high', 'Urgent', null, 123]) {
      assert.equal((await setPriority(`${firstTasks}/${firstTask.id}`, priority)).status, 400);
      assert.deepEqual(await get(firstTasks), [firstTask, secondTask]);
    }
    for (const priority of ['Low', 'Normal', 'High']) {
      const response = await setPriority(`${firstTasks}/${firstTask.id}`, priority);
      assert.equal(response.status, 200);
      firstTask.priority = priority;
      assert.deepEqual(await response.json(), firstTask);
      assert.deepEqual(await get(firstTasks), [firstTask, secondTask]);
      assert.deepEqual(await get(secondTasks), [otherTask]);
      assert.deepEqual(await get('/api/projects'), [existing, first, second]);
    }
    assert.equal((await setPriority(`${firstTasks}/${secondTask.id}`, 'Low')).status, 200);
    secondTask.priority = 'Low';
    const renameTask = (path, title) => fetch(server.url + path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    assert.equal((await renameTask(`${secondTasks}/${firstTask.id}`, 'Wrong owner')).status, 404);
    for (const title of ['', ' \t\n ', null, 123]) {
      const response = await renameTask(`${firstTasks}/${firstTask.id}`, title);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
      assert.deepEqual(await get(firstTasks), [firstTask, secondTask]);
    }
    const renamedTask = await renameTask(`${firstTasks}/${firstTask.id}`, '  Renamed completed task  ');
    assert.equal(renamedTask.status, 200);
    firstTask.title = 'Renamed completed task';
    assert.deepEqual(await renamedTask.json(), firstTask);
    const renamedOpenTask = await renameTask(`${firstTasks}/${secondTask.id}`, '  Renamed open task  ');
    assert.equal(renamedOpenTask.status, 200);
    secondTask.title = 'Renamed open task';
    assert.deepEqual(await renamedOpenTask.json(), secondTask);
    assert.deepEqual(await get(firstTasks), [firstTask, secondTask]);
    assert.deepEqual(await get(secondTasks), [otherTask]);
    assert.deepEqual(await get('/api/projects'), [existing, first, second]);
    const rename = name => fetch(server.url + `/api/projects/${first.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    for (const name of ['', ' \t\n ', null, 123]) {
      const response = await rename(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
      assert.deepEqual(await get(`/api/projects/${first.id}`), first);
    }
    const renamed = await rename('  Renamed project  ');
    assert.equal(renamed.status, 200);
    first.name = 'Renamed project';
    assert.deepEqual(await renamed.json(), first);
    assert.deepEqual(await get('/api/projects'), [existing, first, second]);
    assert.deepEqual(await get(firstTasks), [firstTask, secondTask]);
    const setArchived = archived => fetch(server.url + `/api/projects/${first.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived }),
    });
    assert.equal((await setArchived('true')).status, 400);
    const archiveResponse = await setArchived(true);
    assert.equal(archiveResponse.status, 200);
    first.archived = true;
    assert.deepEqual(await archiveResponse.json(), first);
    assert.deepEqual(await get('/api/projects'), [existing, first, second]);
    assert.equal((await createTask(firstTasks, 'Blocked')).status, 409);
    assert.equal((await completeTask(`${firstTasks}/${firstTask.id}`, false)).status, 409);
    assert.equal((await renameTask(`${firstTasks}/${firstTask.id}`, 'Blocked task rename')).status, 409);
    assert.equal((await setPriority(`${firstTasks}/${firstTask.id}`, 'Low')).status, 409);
    assert.equal((await rename('Blocked rename')).status, 409);
    assert.deepEqual(await get(`/api/projects/${first.id}`), first);
    assert.deepEqual(await get(firstTasks), [firstTask, secondTask]);
    for (const path of ['/', `/projects/${first.id}`]) {
      const response = await fetch(server.url + path);
      assert.equal(response.status, 200);
      const page = await response.text();
      assert.match(page, /<h1>Workboard<\/h1>/);
      assert.match(page, /<label for="project-name">Project name<\/label>/);
      assert.match(page, /Create project/);
      assert.match(page, /role="alert"/);
      assert.match(page, /<label for="new-project-name">New project name<\/label>/);
      assert.match(page, /Rename project/);
    }
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.deepEqual(await get('/api/projects/legacy/tasks'), legacyTasks);
    assert.deepEqual(await get('/api/projects'), [existing, first, second]);
    assert.deepEqual(await get(`/api/projects/${first.id}`), first);
    assert.deepEqual(await get(firstTasks), [firstTask, secondTask]);
    assert.deepEqual(await get(secondTasks), [otherTask]);
    assert.equal((await createTask(firstTasks, 'Still blocked')).status, 409);
    assert.equal((await renameTask(`${firstTasks}/${firstTask.id}`, 'Still blocked rename')).status, 409);
    assert.equal((await setPriority(`${firstTasks}/${firstTask.id}`, 'Normal')).status, 409);
    const restored = await setArchived(false);
    first.archived = false;
    assert.equal(restored.status, 200);
    assert.deepEqual(await restored.json(), first);
    assert.equal((await setPriority(`${firstTasks}/${firstTask.id}`, 'Low')).status, 200);
    firstTask.priority = 'Low';
    const renamedAfterRestoration = await rename('  Restored and renamed  ');
    assert.equal(renamedAfterRestoration.status, 200);
    first.name = 'Restored and renamed';
    assert.deepEqual(await renamedAfterRestoration.json(), first);
    const taskRenamedAfterRestoration = await renameTask(`${firstTasks}/${firstTask.id}`, '  Restored task  ');
    assert.equal(taskRenamedAfterRestoration.status, 200);
    firstTask.title = 'Restored task';
    assert.deepEqual(await taskRenamedAfterRestoration.json(), firstTask);
    const reopenedAfterRestart = await completeTask(`${firstTasks}/${firstTask.id}`, false);
    assert.equal(reopenedAfterRestart.status, 200);
    firstTask.completed = false;
    assert.deepEqual(await get(firstTasks), [firstTask, secondTask]);
    first.completed = 0;
    assert.deepEqual(await get('/api/projects'), [existing, first, second]);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.deepEqual(await get('/api/projects'), [existing, first, second]);
    assert.deepEqual(await get(firstTasks), [firstTask, secondTask]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project defaults affect only future tasks and persist through rename, archive, restore, and restart', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'defaults-test-'));
  let server;
  try {
    const databasePath = resolve(directory, 'defaults.sqlite');
    server = await start(databasePath);
    const api = async (path, method = 'GET', body, status = 200) => {
      const response = await fetch(server.url + path, {
        method,
        ...(body === undefined ? {} : {
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        }),
      });
      assert.equal(response.status, status);
      return response.json();
    };
    const first = await api('/api/projects', 'POST', { name: 'First' }, 201);
    const second = await api('/api/projects', 'POST', { name: 'Second' }, 201);
    const path = `/api/projects/${first.id}`;
    const otherPath = `/api/projects/${second.id}`;
    assert.equal(first.default_task_priority, 'Normal');
    assert.equal(second.default_task_priority, 'Normal');
    const original = await api(`${path}/tasks`, 'POST', { title: 'Original' }, 201);
    assert.equal(original.priority, 'Normal');
    for (const invalid of ['', 'high', 'Urgent', null, 123]) {
      await api(path, 'PATCH', { default_task_priority: invalid }, 400);
      assert.equal((await api(path)).default_task_priority, 'Normal');
    }
    await api(path, 'PATCH', { default_task_priority: 'High' });
    const inherited = await api(`${path}/tasks`, 'POST', { title: 'Inherited' }, 201);
    assert.equal(inherited.priority, 'High');
    await api(`${path}/tasks/${inherited.id}`, 'PATCH', { completed: true });
    inherited.completed = true;
    await api(`${path}/tasks/${inherited.id}`, 'PATCH', { title: 'Renamed task' });
    inherited.title = 'Renamed task';
    const unchanged = [original, inherited];
    await api(path, 'PATCH', { default_task_priority: 'Low' });
    assert.deepEqual(await api(`${path}/tasks`), unchanged);
    assert.equal((await api(otherPath)).default_task_priority, 'Normal');
    const otherTask = await api(`${otherPath}/tasks`, 'POST', { title: 'Other' }, 201);
    assert.equal(otherTask.priority, 'Normal');
    await api(otherPath, 'PATCH', { default_task_priority: 'High' });
    await api(path, 'PATCH', { name: 'Renamed project' });
    const renamed = await api(path);
    assert.equal(renamed.default_task_priority, 'Low');
    assert.equal(renamed.completed, 1);
    assert.equal(renamed.total, 2);
    await api(path, 'PATCH', { archived: true });
    await api(path, 'PATCH', { default_task_priority: 'Normal' }, 409);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await api(path), { ...renamed, archived: true });
    assert.deepEqual(await api(`${path}/tasks`), unchanged);
    assert.equal((await api(otherPath)).default_task_priority, 'High');
    await api(path, 'PATCH', { archived: false });
    const lowTask = await api(`${path}/tasks`, 'POST', { title: 'After restoration' }, 201);
    assert.equal(lowTask.priority, 'Low');
    await api(path, 'PATCH', { default_task_priority: 'Normal' });
    assert.deepEqual(await api(`${path}/tasks`), [...unchanged, lowTask]);
    assert.deepEqual(await api(`${otherPath}/tasks`), [otherTask]);
    await server.stop();
    server = await start(databasePath);
    assert.equal((await api(path)).default_task_priority, 'Normal');
    assert.deepEqual(await api(`${path}/tasks`), [...unchanged, lowTask]);
    assert.deepEqual((await api('/api/projects')).map(project => project.id), [first.id, second.id]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('due dates validate calendar days and persist independently through edits, archive, and restart', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'dates-test-'));
  let server;
  try {
    const databasePath = resolve(directory, 'dates.sqlite');
    server = await start(databasePath);
    const api = async (path, method = 'GET', body, status = 200) => {
      const response = await fetch(server.url + path, {
        method,
        ...(body === undefined ? {} : {
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        }),
      });
      assert.equal(response.status, status);
      return response.json();
    };
    const project = await api('/api/projects', 'POST', { name: 'Dates' }, 201);
    const other = await api('/api/projects', 'POST', { name: 'Other' }, 201);
    const path = `/api/projects/${project.id}`;
    const task = await api(`${path}/tasks`, 'POST', { title: 'First' }, 201);
    const second = await api(`${path}/tasks`, 'POST', { title: 'Second' }, 201);
    const taskPath = `${path}/tasks/${task.id}`;
    assert.equal(task.due_date, '');
    assert.equal(second.due_date, '');
    await api(taskPath, 'PATCH', { completed: true });
    task.completed = true;
    await api(taskPath, 'PATCH', { priority: 'High' });
    task.priority = 'High';
    const summary = await api(path);
    for (const date of ['0001-01-01', '0004-02-29', '2000-02-29', '2024-02-29', '9999-12-31']) {
      const saved = await api(taskPath, 'PATCH', { due_date: `  ${date} \t` });
      task.due_date = date;
      assert.deepEqual(saved, task);
      assert.deepEqual(await api(`${path}/tasks`), [task, second]);
      assert.deepEqual(await api(path), summary);
    }
    for (const date of ['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29',
      '2023-02-29', '2024-04-31', '2024-00-01', '2024-13-01', '2024-01-00',
      '2024-01-32', '2024-1-01', '24-01-01', '2024-01-01T00:00:00Z', 'invalid', null, 20240101]) {
      assert.deepEqual(await api(taskPath, 'PATCH', { due_date: date }, 400), {
        error: 'Due date must be a valid YYYY-MM-DD date',
      });
      assert.deepEqual(await api(`${path}/tasks`), [task, second]);
      assert.deepEqual(await api(path), summary);
    }
    await api(`/api/projects/${other.id}/tasks/${task.id}`, 'PATCH', { due_date: '2024-01-01' }, 404);
    await api(taskPath, 'PATCH', { title: 'Renamed' });
    task.title = 'Renamed';
    assert.deepEqual(await api(`${path}/tasks`), [task, second]);
    await api(path, 'PATCH', { archived: true });
    await api(taskPath, 'PATCH', { due_date: '' }, 409);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await api(`${path}/tasks`), [task, second]);
    await api(taskPath, 'PATCH', { due_date: '2025-01-01' }, 409);
    await api(path, 'PATCH', { archived: false });
    assert.deepEqual(await api(path), summary);
    for (const date of ['', ' \t\n ']) {
      task.due_date = '';
      assert.deepEqual(await api(taskPath, 'PATCH', { due_date: date }), task);
      await server.stop();
      server = await start(databasePath);
      assert.deepEqual(await api(`${path}/tasks`), [task, second]);
    }
    await api(`${path}/tasks/${second.id}`, 'PATCH', { due_date: '2026-10-11' });
    second.due_date = '2026-10-11';
    assert.deepEqual(await api(`${path}/tasks`), [task, second]);
    assert.deepEqual(await api(path), summary);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('moves append tasks, preserve data and summaries, reject archived projects, and survive restart', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'moves-'));
  let server;
  try {
    const databasePath = resolve(directory, 'moves.sqlite');
    server = await start(databasePath);
    const api = async (path, method = 'GET', body, status = 200) => {
      const response = await fetch(server.url + '/api/projects' + path, {
        method, ...(body === undefined ? {} : {
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        }),
      });
      assert.equal(response.status, status);
      return response.json();
    };
    const source = await api('', 'POST', { name: 'Source' }, 201);
    const destination = await api('', 'POST', { name: 'Destination' }, 201);
    const sourcePath = `/${source.id}`;
    const destinationPath = `/${destination.id}`;
    // Create the moved task first to ensure moving really changes its order.
    const moved = await api(sourcePath + '/tasks', 'POST', { title: 'Moved' }, 201);
    const remaining = await api(sourcePath + '/tasks', 'POST', { title: 'Remaining' }, 201);
    const existing = await api(destinationPath + '/tasks', 'POST', { title: 'Existing' }, 201);
    const taskPath = sourcePath + '/tasks/' + moved.id;
    await api(taskPath, 'PATCH', { completed: true });
    await api(taskPath, 'PATCH', { priority: 'High' });
    const saved = await api(taskPath, 'PATCH', { due_date: '0001-01-01' });
    await api(destinationPath, 'PATCH', { default_task_priority: 'Low' });
    for (const id of [source.id, 'missing', null]) {
      await api(taskPath, 'PATCH', { destination_project_id: id }, 400);
    }
    await api(destinationPath, 'PATCH', { archived: true });
    await api(taskPath, 'PATCH', { destination_project_id: destination.id }, 400);
    await api(destinationPath, 'PATCH', { archived: false });
    await api(sourcePath, 'PATCH', { archived: true });
    await api(taskPath, 'PATCH', { destination_project_id: destination.id }, 409);
    await api(sourcePath, 'PATCH', { archived: false });
    assert.deepEqual(await api(taskPath, 'PATCH', { destination_project_id: destination.id }), saved);
    assert.deepEqual(await api(sourcePath + '/tasks'), [remaining]);
    assert.deepEqual(await api(destinationPath + '/tasks'), [existing, saved]);
    const afterMove = await api(destinationPath + '/tasks', 'POST', { title: 'After move' }, 201);
    assert.equal(afterMove.priority, 'Low');
    assert.deepEqual(await api(destinationPath + '/tasks'), [existing, saved, afterMove]);
    const summaries = await api('');
    assert.deepEqual(summaries.map(p => [p.completed, p.total]), [[0, 1], [1, 3]]);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await api(destinationPath + '/tasks'), [existing, saved, afterMove]);
    assert.deepEqual(await api(''), summaries);
    await api(destinationPath + '/tasks/' + moved.id, 'PATCH', { destination_project_id: source.id });
    assert.deepEqual(await api(sourcePath + '/tasks'), [remaining, saved]);
    // Blank dates also survive moving independently.
    await api(sourcePath + '/tasks/' + remaining.id, 'PATCH', { destination_project_id: destination.id });
    assert.deepEqual(await api(destinationPath + '/tasks'), [existing, afterMove, remaining]);
    await api(taskPath, 'PATCH', { title: 'Renamed after move' });
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await api(sourcePath + '/tasks'), [{ ...saved, title: 'Renamed after move' }]);
    assert.deepEqual(await api(destinationPath + '/tasks'), [existing, afterMove, remaining]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
