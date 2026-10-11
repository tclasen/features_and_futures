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

test('projects, tasks, archives, and summaries survive process restart', async () => {
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
    const nextTask = await (await postTask('Next task')).json();
    assert.deepEqual(await (await fetch(tasksURL)).json(), [task, nextTask]);
    assert.deepEqual(await (await fetch(otherTasksURL)).json(), []);
    assert.equal((await completeTask(`${otherTasksURL}/${task.id}`, true)).status, 404);
    const completed = await (await completeTask(`${tasksURL}/${task.id}`, true)).json();
    assert.equal(completed.completed, true);
    assert.deepEqual(await (await fetch(tasksURL)).json(), [completed, nextTask]);
    assert.equal((await completeTask(`${tasksURL}/${task.id}`, 'true')).status, 400);
    assert.equal((await fetch(`${base}/api/projects/999999/tasks`)).status, 404);
    const patchProject = archived => fetch(`${base}/api/projects/${first.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived }),
    });
    assert.equal((await patchProject('true')).status, 400);
    const archived = await (await patchProject(true)).json();
    assert.deepEqual(archived, { ...first, archived: 1, total: 2, completed: 1 });
    Object.assign(first, archived);
    assert.equal((await postTask('Not allowed')).status, 409);
    assert.equal((await completeTask(`${tasksURL}/${task.id}`, false)).status, 409);
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
      id: 7, name: 'Existing project', archived: 0, total: 1, completed: 1,
    }]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/7/tasks`)).json(), [{
      id: 1, project_id: 7, title: 'Existing task', completed: true,
    }]);
  } finally {
    if (child) await stop(child);
    await rm(directory, { recursive: true, force: true });
  }
});
