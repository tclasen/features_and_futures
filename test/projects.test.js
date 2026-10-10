import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('launch contract, project and task validation, ownership, completion, and restart persistence', { timeout: 15000 }, async () => {
  await mkdir(resolve('data'), { recursive: true });
  const directory = await mkdtemp(resolve('data/test-'));
  const databasePath = resolve(directory, 'projects.sqlite');
  // Start from the Task 002 schema to exercise the archive migration.
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)));
  `);
  legacy.close();
  let child;
  let base;

  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: databasePath },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise((resolve, reject) => {
      let output = '';
      let errors = '';
      child.stderr.on('data', (chunk) => { errors += chunk; });
      child.once('error', reject);
      child.once('exit', (code) => reject(new Error(`Server exited: ${code}\n${errors}`)));
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) {
          base = `http://127.0.0.1:${match[1]}`;
          resolve();
        }
      });
    });
  }

  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }

  try {
    await start();
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const home = await fetch(base);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /<title>Workboard<\/title>/);
    for (const asset of ['/app.js', '/style.css']) {
      assert.equal((await fetch(`${base}${asset}`)).status, 200);
    }
    const list = async () => (await fetch(`${base}/api/projects`)).json();
    const create = (name) => fetch(`${base}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    assert.deepEqual(await list(), []);
    for (const name of ['', ' \t\n ']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
      assert.deepEqual(await list(), []);
    }
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    assert.equal(first.archived, 0);
    assert.equal(first.total_count, 0);
    assert.equal(first.completed_count, 0);
    const second = await (await create('<script> & Second')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await list(), [first, second]);
    const detail = await fetch(`${base}/api/projects/${first.id}`);
    assert.equal(detail.status, 200);
    assert.deepEqual(await detail.json(), first);
    const page = await fetch(`${base}/projects/${first.id}`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /src="\/app.js"/);
    assert.equal((await fetch(`${base}/api/projects/999999`)).status, 404);
    const taskList = async (projectId) => (await fetch(`${base}/api/projects/${projectId}/tasks`)).json();
    const createTask = (projectId, title) => fetch(`${base}/api/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const completeTask = (projectId, taskId, completed) => fetch(`${base}/api/projects/${projectId}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed }),
    });
    assert.deepEqual(await taskList(first.id), []);
    for (const title of ['', ' \t\n ']) {
      const response = await createTask(first.id, title);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
      assert.deepEqual(await taskList(first.id), []);
    }
    const taskResponse = await createTask(first.id, '  First task  ');
    assert.equal(taskResponse.status, 201);
    const firstTask = await taskResponse.json();
    assert.equal(firstTask.title, 'First task');
    assert.equal(firstTask.completed, false);
    const secondTask = await (await createTask(first.id, '<script> & Second task')).json();
    const otherTask = await (await createTask(second.id, 'Other project task')).json();
    assert.deepEqual(await taskList(first.id), [firstTask, secondTask]);
    assert.deepEqual(await taskList(second.id), [otherTask]);
    assert.equal((await completeTask(second.id, firstTask.id, true)).status, 404);
    assert.equal((await createTask(999999, 'Missing project')).status, 404);
    assert.equal((await completeTask(first.id, firstTask.id, 'true')).status, 400);
    assert.deepEqual(await taskList(first.id), [firstTask, secondTask]);
    const checked = await completeTask(first.id, firstTask.id, true);
    assert.equal(checked.status, 200);
    assert.deepEqual(await checked.json(), { ...firstTask, completed: true });
    assert.deepEqual(await taskList(first.id), [{ ...firstTask, completed: true }, secondTask]);
    first.total_count = 2;
    first.completed_count = 1;
    second.total_count = 1;
    assert.deepEqual(await list(), [first, second]);
    const renameProject = (id, name) => fetch(`${base}/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    assert.equal((await renameProject(999999, 'Missing')).status, 404);
    for (const name of ['', ' \t\n ']) {
      const response = await renameProject(first.id, name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
      assert.deepEqual(await list(), [first, second]);
    }
    const renamed = await renameProject(first.id, '  Renamed first  ');
    assert.equal(renamed.status, 200);
    first.name = 'Renamed first';
    assert.deepEqual(await renamed.json(), first);
    assert.deepEqual(await list(), [first, second]);
    assert.deepEqual(await taskList(first.id), [{ ...firstTask, completed: true }, secondTask]);
    const archiveProject = (id, archived) => fetch(`${base}/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived }),
    });
    assert.equal((await archiveProject(999999, true)).status, 404);
    assert.equal((await archiveProject(first.id, 'true')).status, 400);
    const archived = await archiveProject(first.id, true);
    assert.equal(archived.status, 200);
    first.archived = 1;
    assert.deepEqual(await archived.json(), first);
    assert.equal((await renameProject(first.id, 'Blocked rename')).status, 409);
    assert.deepEqual(await list(), [first, second]);
    assert.equal((await createTask(first.id, 'Blocked task')).status, 409);
    assert.equal((await completeTask(first.id, firstTask.id, false)).status, 409);
    assert.deepEqual(await taskList(first.id), [{ ...firstTask, completed: true }, secondTask]);
    await stop();
    await start();
    assert.deepEqual(await list(), [first, second]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    assert.equal((await fetch(`${base}/projects/${first.id}`)).status, 200);
    assert.deepEqual(await taskList(first.id), [{ ...firstTask, completed: true }, secondTask]);
    assert.deepEqual(await taskList(second.id), [otherTask]);
    const restored = await archiveProject(first.id, false);
    assert.equal(restored.status, 200);
    first.archived = 0;
    assert.deepEqual(await restored.json(), first);
    const renamedAfterRestore = await renameProject(first.id, '  Restored first  ');
    assert.equal(renamedAfterRestore.status, 200);
    first.name = 'Restored first';
    assert.deepEqual(await renamedAfterRestore.json(), first);
    const unchecked = await completeTask(first.id, firstTask.id, false);
    assert.equal(unchecked.status, 200);
    assert.deepEqual(await unchecked.json(), firstTask);
    first.completed_count = 0;
    await stop();
    await start();
    assert.deepEqual(await list(), [first, second]);
    assert.deepEqual(await taskList(first.id), [firstTask, secondTask]);
    const thirdTask = await (await createTask(first.id, 'Third task')).json();
    assert.ok(thirdTask.id > otherTask.id);
    assert.deepEqual(await taskList(first.id), [firstTask, secondTask, thirdTask]);
    first.total_count = 3;
    const third = await (await create('Third')).json();
    assert.ok(third.id > second.id);
    assert.deepEqual(await list(), [first, second, third]);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
