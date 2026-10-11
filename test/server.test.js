import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

const port = 18080;
const base = `http://127.0.0.1:${port}`;

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(errors);
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) return child;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  child.kill();
  throw new Error(`Server did not start: ${errors}`);
}

async function stop(child) {
  const exit = once(child, 'exit');
  child.kill('SIGTERM');
  await exit;
}

async function create(name) {
  return fetch(`${base}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

test('projects, renames, tasks, archives, and summaries survive process restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const dbPath = join(directory, 'nested', 'test.sqlite');
  let child;
  try {
    child = await start(dbPath);
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), []);
    for (const name of ['', '   \t\n']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      assert.match((await invalid.json()).error, /Project name is required/);
    }
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    assert.equal(first.archived, 0);
    assert.equal(first.completed, 0);
    assert.equal(first.total, 0);
    const second = await (await create('Second project')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [first, second]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    for (const path of ['/', `/projects/${first.id}`]) {
      const page = await fetch(`${base}${path}`);
      assert.equal(page.status, 200);
      assert.match(await page.text(), /<script type="module" src="\/app.js">/);
    }
    assert.equal((await fetch(`${base}/api/projects/999999`)).status, 404);
    const tasksURL = `${base}/api/projects/${first.id}/tasks`;
    const otherTasksURL = `${base}/api/projects/${second.id}/tasks`;
    const postTask = title => fetch(tasksURL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const completeTask = (url, completed) => fetch(url, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed }),
    });
    for (const title of ['', ' \t\n ']) {
      const invalid = await postTask(title);
      assert.equal(invalid.status, 400);
      assert.match((await invalid.json()).error, /Task title is required/);
    }
    assert.deepEqual(await (await fetch(tasksURL)).json(), []);
    const taskResponse = await postTask('  First task  ');
    assert.equal(taskResponse.status, 201);
    const task = await taskResponse.json();
    assert.equal(task.title, 'First task');
    assert.equal(task.completed, false);
    assert.equal(task.priority, 'Normal');
    const nextTask = await (await postTask('Next task')).json();
    assert.equal(nextTask.priority, 'Normal');
    assert.deepEqual(await (await fetch(tasksURL)).json(), [task, nextTask]);
    assert.deepEqual(await (await fetch(otherTasksURL)).json(), []);
    assert.equal((await completeTask(`${otherTasksURL}/${task.id}`, true)).status, 404);
    let completed = await (await completeTask(`${tasksURL}/${task.id}`, true)).json();
    assert.equal(completed.completed, true);
    assert.deepEqual(await (await fetch(tasksURL)).json(), [completed, nextTask]);
    assert.equal((await completeTask(`${tasksURL}/${task.id}`, 'true')).status, 400);
    assert.equal((await fetch(`${base}/api/projects/999999/tasks`)).status, 404);
    const prioritize = (url, priority) => fetch(url, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority }),
    });
    for (const priority of ['', 'high', ' High ', null, 1]) {
      assert.equal((await prioritize(`${tasksURL}/${task.id}`, priority)).status, 400);
      assert.deepEqual(await (await fetch(tasksURL)).json(), [completed, nextTask]);
    }
    assert.equal((await prioritize(`${otherTasksURL}/${task.id}`, 'High')).status, 404);
    assert.equal((await prioritize(`${tasksURL}/999999`, 'High')).status, 404);
    const highResponse = await prioritize(`${tasksURL}/${task.id}`, 'High');
    assert.equal(highResponse.status, 200);
    const highTask = await highResponse.json();
    assert.deepEqual(highTask, { ...completed, priority: 'High' });
    completed = highTask;
    assert.deepEqual(await (await fetch(tasksURL)).json(), [completed, nextTask]);
    const lowTask = await (await prioritize(`${tasksURL}/${nextTask.id}`, 'Low')).json();
    assert.deepEqual(lowTask, { ...nextTask, priority: 'Low' });
    Object.assign(nextTask, lowTask);
    assert.deepEqual(await (await fetch(tasksURL)).json(), [completed, nextTask]);
    const renameTask = (url, title) => fetch(url, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    for (const title of ['', ' \t\n ', null]) {
      const invalid = await renameTask(`${tasksURL}/${task.id}`, title);
      assert.equal(invalid.status, 400);
      assert.match((await invalid.json()).error, /Task title is required/);
      assert.deepEqual(await (await fetch(tasksURL)).json(), [completed, nextTask]);
    }
    assert.equal((await renameTask(`${otherTasksURL}/${task.id}`, 'Wrong project')).status, 404);
    assert.equal((await renameTask(`${tasksURL}/999999`, 'Missing task')).status, 404);
    const renameResponse = await renameTask(`${tasksURL}/${task.id}`, '  Renamed completed task  ');
    assert.equal(renameResponse.status, 200);
    const renamedTask = await renameResponse.json();
    assert.deepEqual(renamedTask, { ...completed, title: 'Renamed completed task' });
    completed = renamedTask;
    const renamedOpenTask = await (await renameTask(`${tasksURL}/${nextTask.id}`, '  Renamed open task  ')).json();
    assert.deepEqual(renamedOpenTask, { ...nextTask, title: 'Renamed open task' });
    Object.assign(nextTask, renamedOpenTask);
    assert.deepEqual(await (await fetch(tasksURL)).json(), [completed, nextTask]);
    assert.deepEqual(await (await fetch(otherTasksURL)).json(), []);
    const patchProject = archived => fetch(`${base}/api/projects/${first.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived }),
    });
    const rename = name => fetch(`${base}/api/projects/${first.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    for (const name of ['', ' \t\n ', null]) {
      const invalid = await rename(name);
      assert.equal(invalid.status, 400);
      assert.match((await invalid.json()).error, /Project name is required/);
      assert.equal((await (await fetch(`${base}/api/projects/${first.id}`)).json()).name, first.name);
    }
    const renamed = await (await rename('  Renamed project  ')).json();
    assert.deepEqual(renamed, { ...first, name: 'Renamed project', total: 2, completed: 1 });
    Object.assign(first, renamed);
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [first, second]);
    assert.deepEqual(await (await fetch(tasksURL)).json(), [completed, nextTask]);
    assert.equal((await patchProject('true')).status, 400);
    const archived = await (await patchProject(true)).json();
    assert.deepEqual(archived, { ...first, archived: 1, total: 2, completed: 1 });
    Object.assign(first, archived);
    assert.equal((await rename('Forbidden rename')).status, 409);
    assert.equal((await (await fetch(`${base}/api/projects/${first.id}`)).json()).name, 'Renamed project');
    assert.equal((await postTask('Not allowed')).status, 409);
    assert.equal((await completeTask(`${tasksURL}/${task.id}`, false)).status, 409);
    assert.equal((await renameTask(`${tasksURL}/${task.id}`, 'Forbidden task rename')).status, 409);
    assert.equal((await prioritize(`${tasksURL}/${task.id}`, 'Normal')).status, 409);
    assert.deepEqual(await (await fetch(tasksURL)).json(), [completed, nextTask]);
    await stop(child);
    child = undefined;
    child = await start(dbPath);
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [first, second]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    assert.deepEqual(await (await fetch(tasksURL)).json(), [completed, nextTask]);
    assert.deepEqual(await (await fetch(otherTasksURL)).json(), []);
    const restored = await (await patchProject(false)).json();
    assert.deepEqual(restored, { ...first, archived: 0 });
    const renamedAgain = await (await rename('  Restored and renamed  ')).json();
    assert.deepEqual(renamedAgain, { ...restored, name: 'Restored and renamed' });
    Object.assign(restored, renamedAgain);
    const restoredTask = await (await renameTask(`${tasksURL}/${task.id}`, '  Renamed after restoration  ')).json();
    assert.deepEqual(restoredTask, { ...completed, title: 'Renamed after restoration' });
    completed = restoredTask;
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), restored);
    const normalTask = await (await prioritize(`${tasksURL}/${task.id}`, 'Normal')).json();
    assert.deepEqual(normalTask, { ...completed, priority: 'Normal' });
    completed = normalTask;
    assert.deepEqual(await (await fetch(tasksURL)).json(), [completed, nextTask]);
    const reopened = await (await completeTask(`${tasksURL}/${task.id}`, false)).json();
    assert.equal(reopened.completed, false);
    assert.deepEqual(await (await fetch(tasksURL)).json(), [reopened, nextTask]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), {
      ...restored, completed: 0,
    });
    await stop(child);
    child = undefined;
    child = await start(dbPath);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), {
      ...restored, completed: 0,
    });
    assert.deepEqual(await (await fetch(tasksURL)).json(), [reopened, nextTask]);
  } finally {
    if (child) await stop(child);
    await rm(directory, { recursive: true, force: true });
  }
});

test('existing project databases migrate without losing IDs or tasks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-migration-'));
  const dbPath = join(directory, 'test.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)));
    INSERT INTO projects (id, name) VALUES (7, 'Existing project');
    INSERT INTO tasks (project_id, title, completed) VALUES (7, 'Existing task', 1);`);
  db.close();
  let child;
  try {
    child = await start(dbPath);
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [{
      id: 7, name: 'Existing project', archived: 0, default_priority: 'Normal', total: 1, completed: 1,
    }]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/7/tasks`)).json(), [{
      id: 1, project_id: 7, title: 'Existing task', completed: true, priority: 'Normal', due_date: '',
    }]);
  } finally {
    if (child) await stop(child);
    await rm(directory, { recursive: true, force: true });
  }
});


test('project defaults affect only subsequent tasks and survive rename, archive, and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-defaults-'));
  const dbPath = join(directory, 'test.sqlite');
  let child;
  const get = async path => (await fetch(`${base}${path}`)).json();
  const patch = (path, body) => fetch(`${base}${path}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  try {
    child = await start(dbPath);
    const first = await (await create('First')).json();
    const second = await (await create('Second')).json();
    assert.equal(first.default_priority, 'Normal');
    assert.equal(second.default_priority, 'Normal');
    const projectPath = `/api/projects/${first.id}`;
    const tasksPath = `${projectPath}/tasks`;
    const add = async (path, title) => (await fetch(`${base}${path}/tasks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
    })).json();
    const original = await add(projectPath, 'Original');
    for (const value of ['', 'high', ' High ', null, 1]) {
      assert.equal((await patch(projectPath, { default_priority: value })).status, 400);
    }
    for (const value of ['Low', 'High', 'Normal']) {
      const saved = await (await patch(projectPath, { default_priority: value })).json();
      assert.equal(saved.default_priority, value);
      assert.deepEqual(await get(tasksPath), [original]);
      assert.equal(saved.total, 1);
      assert.equal(saved.completed, 0);
    }
    await patch(projectPath, { default_priority: 'High' });
    const inherited = await add(projectPath, 'Inherited');
    assert.equal(inherited.priority, 'High');
    assert.equal((await add(`/api/projects/${second.id}`, 'Other')).priority, 'Normal');
    const completed = await (await patch(`${tasksPath}/${inherited.id}`, { completed: true })).json();
    await patch(projectPath, { default_priority: 'Low' });
    await patch(projectPath, { name: 'Renamed' });
    await patch(projectPath, { archived: true });
    assert.equal((await patch(projectPath, { default_priority: 'Normal' })).status, 409);
    await stop(child);
    child = undefined;
    child = await start(dbPath);
    const saved = await get(projectPath);
    assert.equal(saved.default_priority, 'Low');
    assert.equal(saved.archived, 1);
    assert.equal(saved.name, 'Renamed');
    assert.equal(saved.total, 2);
    assert.equal(saved.completed, 1);
    assert.deepEqual(await get(tasksPath), [original, completed]);
    assert.equal((await get(`/api/projects/${second.id}`)).default_priority, 'Normal');
    await patch(projectPath, { archived: false });
    assert.equal((await add(projectPath, 'After restore')).priority, 'Low');
    await patch(projectPath, { default_priority: 'High' });
    assert.equal((await add(projectPath, 'After edit')).priority, 'High');
  } finally {
    if (child) await stop(child);
    await rm(directory, { recursive: true, force: true });
  }
});


test('due dates validate Gregorian days and persist independently through edits and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-dates-'));
  const dbPath = join(directory, 'test.sqlite');
  let child;
  const get = async path => (await fetch(`${base}${path}`)).json();
  const patch = (path, body) => fetch(`${base}${path}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  try {
    child = await start(dbPath);
    const first = await (await create('Dates')).json();
    const other = await (await create('Other')).json();
    const projectPath = `/api/projects/${first.id}`;
    const tasksPath = `${projectPath}/tasks`;
    const add = async title => (await fetch(`${base}${tasksPath}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
    })).json();
    let task = await add('First');
    const second = await add('Second');
    assert.equal(task.due_date, '');
    assert.equal(second.due_date, '');
    const taskPath = `${tasksPath}/${task.id}`;
    for (const date of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '1900-02-28', '  2025-04-30  ']) {
      const response = await patch(taskPath, { due_date: date });
      assert.equal(response.status, 200);
      const saved = await response.json();
      assert.deepEqual(saved, { ...task, due_date: date.trim() });
      task = saved;
    }
    for (const date of ['0000-01-01', '10000-01-01', '1900-02-29', '2023-02-29', '2025-04-31',
      '2025-00-01', '2025-13-01', '2025-01-00', '2025-01-32', '2025-1-01', '25-01-01',
      '2025-01-01T00:00:00Z', 'not a date', null, 20250101]) {
      const response = await patch(taskPath, { due_date: date });
      assert.equal(response.status, 400, String(date));
      assert.match((await response.json()).error, /Due date must be a valid YYYY-MM-DD date/);
      assert.deepEqual(await get(tasksPath), [task, second]);
    }
    assert.equal((await patch(`/api/projects/${other.id}/tasks/${task.id}`, { due_date: '2025-01-01' })).status, 404);
    for (const body of [{ title: 'Renamed' }, { completed: true }, { priority: 'High' }]) {
      const saved = await (await patch(taskPath, body)).json();
      assert.deepEqual(saved, { ...task, ...body });
      task = saved;
    }
    const summary = await get(projectPath);
    assert.equal(summary.total, 2);
    assert.equal(summary.completed, 1);
    await patch(projectPath, { archived: true });
    assert.equal((await patch(taskPath, { due_date: '' })).status, 409);
    await stop(child);
    child = undefined;
    child = await start(dbPath);
    assert.deepEqual(await get(tasksPath), [task, second]);
    await patch(projectPath, { archived: false });
    for (const date of ['', '  \t\n ']) {
      const saved = await (await patch(taskPath, { due_date: date })).json();
      assert.deepEqual(saved, { ...task, due_date: '' });
      task = saved;
    }
    assert.deepEqual(await get(projectPath), summary);
    await stop(child);
    child = undefined;
    child = await start(dbPath);
    assert.deepEqual(await get(tasksPath), [task, second]);
  } finally {
    if (child) await stop(child);
    await rm(directory, { recursive: true, force: true });
  }
});
