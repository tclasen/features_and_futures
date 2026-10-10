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
    INSERT INTO projects (name) VALUES ('Legacy project');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Legacy task', 1);
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
    const migratedTasks = await (await fetch(`${base}/api/projects/1/tasks`)).json();
    assert.deepEqual(migratedTasks, [{ id: 1, project_id: 1, title: 'Legacy task',
      completed: true, priority: 'Normal', due_date: '' }]);
    // Remove the migration fixture before exercising creation on an empty board.
    const fixtures = new DatabaseSync(databasePath);
    fixtures.exec('DELETE FROM tasks; DELETE FROM projects;');
    fixtures.close();
    const home = await fetch(base);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /<title>Workboard<\/title>/);
    for (const asset of ['/app.js', '/dates.js', '/style.css']) {
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
    assert.equal(first.default_task_priority, 'Normal');
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
    assert.equal(firstTask.priority, 'Normal');
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
    // Simulate a populated Task 005 database, then verify migration preserves its data.
    await stop();
    const previousSchema = new DatabaseSync(databasePath);
    previousSchema.exec('ALTER TABLE tasks DROP COLUMN priority');
    previousSchema.exec('ALTER TABLE projects DROP COLUMN default_task_priority');
    previousSchema.close();
    await start();
    assert.deepEqual(await list(), [first, second]);
    assert.deepEqual(await taskList(first.id), [{ ...firstTask, completed: true }, secondTask]);
    assert.deepEqual(await taskList(second.id), [otherTask]);
    const setPriority = (projectId, taskId, priority) => fetch(`${base}/api/projects/${projectId}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority }),
    });
    assert.equal((await setPriority(second.id, firstTask.id, 'High')).status, 404);
    assert.equal((await setPriority(first.id, 999999, 'High')).status, 404);
    for (const priority of ['', 'high', 'Urgent', null, 1]) {
      assert.equal((await setPriority(first.id, firstTask.id, priority)).status, 400);
    }
    for (const priority of ['Low', 'Normal', 'High']) {
      const response = await setPriority(first.id, firstTask.id, priority);
      assert.equal(response.status, 200);
      firstTask.priority = priority;
      assert.deepEqual(await response.json(), { ...firstTask, completed: true });
      assert.deepEqual(await taskList(first.id), [{ ...firstTask, completed: true }, secondTask]);
      assert.deepEqual(await taskList(second.id), [otherTask]);
      assert.deepEqual(await list(), [first, second]);
    }
    const renameTask = (projectId, taskId, title) => fetch(`${base}/api/projects/${projectId}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const setDueDate = (projectId, taskId, due_date) => fetch(`${base}/api/projects/${projectId}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ due_date }),
    });
    assert.equal(firstTask.due_date, '');
    assert.equal(secondTask.due_date, '');
    assert.equal((await setDueDate(second.id, firstTask.id, '2026-01-01')).status, 404);
    for (const date of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '1900-02-28', '2026-04-30']) {
      const response = await setDueDate(first.id, firstTask.id, `  ${date}  `);
      assert.equal(response.status, 200);
      firstTask.due_date = date;
      assert.deepEqual(await response.json(), { ...firstTask, completed: true });
    }
    for (const date of ['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2026-02-29',
      '2024-02-30', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '2026-01-32',
      '2026-1-01', '2026-01-1', '2026-01-01T00:00:00Z', 'not a date', null, 20260101]) {
      const response = await setDueDate(first.id, firstTask.id, date);
      assert.equal(response.status, 400, String(date));
      assert.deepEqual(await response.json(), { error: 'Due date must be a valid YYYY-MM-DD date' });
      assert.deepEqual(await taskList(first.id), [{ ...firstTask, completed: true }, secondTask]);
    }
    assert.deepEqual(await taskList(second.id), [otherTask]);
    assert.deepEqual(await list(), [first, second]);
    assert.equal((await renameTask(second.id, firstTask.id, 'Wrong project')).status, 404);
    assert.equal((await renameTask(first.id, 999999, 'Missing')).status, 404);
    for (const title of ['', ' \t\n ', null]) {
      const response = await renameTask(first.id, firstTask.id, title);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
      assert.deepEqual(await taskList(first.id), [{ ...firstTask, completed: true }, secondTask]);
    }
    const renamedTask = await renameTask(first.id, firstTask.id, '  Renamed task  ');
    assert.equal(renamedTask.status, 200);
    firstTask.title = 'Renamed task';
    assert.deepEqual(await renamedTask.json(), { ...firstTask, completed: true });
    assert.deepEqual(await taskList(first.id), [{ ...firstTask, completed: true }, secondTask]);
    assert.deepEqual(await taskList(second.id), [otherTask]);
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
    assert.equal((await renameTask(first.id, firstTask.id, 'Blocked task rename')).status, 409);
    assert.equal((await setPriority(first.id, firstTask.id, 'Low')).status, 409);
    assert.equal((await setDueDate(first.id, firstTask.id, '')).status, 409);
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
    for (const date of ['', ' \t\n ']) {
      const response = await setDueDate(first.id, firstTask.id, date);
      firstTask.due_date = '';
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ...firstTask, completed: true });
    }
    await setDueDate(first.id, firstTask.id, '2028-02-29');
    firstTask.due_date = '2028-02-29';
    const priorityAfterRestore = await setPriority(first.id, firstTask.id, 'Low');
    assert.equal(priorityAfterRestore.status, 200);
    firstTask.priority = 'Low';
    assert.deepEqual(await priorityAfterRestore.json(), { ...firstTask, completed: true });
    const renamedAfterRestore = await renameProject(first.id, '  Restored first  ');
    assert.equal(renamedAfterRestore.status, 200);
    first.name = 'Restored first';
    assert.deepEqual(await renamedAfterRestore.json(), first);
    const taskRenamedAfterRestore = await renameTask(first.id, firstTask.id, '  Restored task  ');
    assert.equal(taskRenamedAfterRestore.status, 200);
    firstTask.title = 'Restored task';
    assert.deepEqual(await taskRenamedAfterRestore.json(), { ...firstTask, completed: true });
    const unchecked = await completeTask(first.id, firstTask.id, false);
    assert.equal(unchecked.status, 200);
    assert.deepEqual(await unchecked.json(), firstTask);
    first.completed_count = 0;
    await stop();
    await start();
    assert.deepEqual(await list(), [first, second]);
    assert.deepEqual(await taskList(first.id), [firstTask, secondTask]);
    const thirdTask = await (await createTask(first.id, 'Third task')).json();
    assert.equal(thirdTask.priority, 'Normal');
    assert.ok(thirdTask.id > otherTask.id);
    assert.deepEqual(await taskList(first.id), [firstTask, secondTask, thirdTask]);
    first.total_count = 3;
    const third = await (await create('Third')).json();
    assert.ok(third.id > second.id);
    assert.deepEqual(await list(), [first, second, third]);
    const setDefault = (projectId, priority) => fetch(`${base}/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ default_task_priority: priority }),
    });
    for (const invalid of ['', 'high', 'Urgent', null, 1]) {
      assert.equal((await setDefault(first.id, invalid)).status, 400);
    }
    for (const value of ['Low', 'Normal', 'High']) {
      assert.equal((await setDefault(first.id, value)).status, 200);
      first.default_task_priority = value;
      assert.deepEqual(await list(), [first, second, third]);
      assert.deepEqual(await taskList(first.id), [firstTask, secondTask, thirdTask]);
    }
    const inherited = await (await createTask(first.id, 'Inherited high')).json();
    assert.equal(inherited.priority, 'High');
    first.total_count++;
    await setDefault(first.id, 'Low');
    first.default_task_priority = 'Low';
    const independent = await (await createTask(second.id, 'Independent normal')).json();
    assert.equal(independent.priority, 'Normal');
    second.total_count++;
    await renameProject(first.id, 'Default preserved');
    first.name = 'Default preserved';
    await fetch(`${base}/api/projects/${first.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: true }),
    });
    first.archived = 1;
    assert.equal((await setDefault(first.id, 'High')).status, 409);
    await stop();
    await start();
    assert.deepEqual(await list(), [first, second, third]);
    assert.deepEqual(await taskList(first.id), [firstTask, secondTask, thirdTask, inherited]);
    await fetch(`${base}/api/projects/${first.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: false }),
    });
    first.archived = 0;
    const restoredTask = await (await createTask(first.id, 'Inherited after restore')).json();
    assert.equal(restoredTask.priority, 'Low');
    first.total_count++;
    await stop();
    await start();
    assert.deepEqual(await list(), [first, second, third]);
    assert.deepEqual(await taskList(first.id), [firstTask, secondTask, thirdTask, inherited, restoredTask]);
    assert.deepEqual(await taskList(second.id), [otherTask, independent]);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
