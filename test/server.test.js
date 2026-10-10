import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';

async function availablePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test('projects migrate, validate, rename, archive and restore with persistent tasks and summaries', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-'));
  // Start with the original schema to exercise a real upgrade.
  await mkdir(join(directory, 'nested'));
  const legacy = new DatabaseSync(join(directory, 'nested', 'projects.sqlite'));
  legacy.exec('CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
  legacy.close();
  const port = await availablePort();
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'nested', 'projects.sqlite') },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (data) => { stderr += data; });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(stderr);
      try {
        const health = await fetch(`${base}/health`);
        assert.equal(health.status, 200);
        assert.deepEqual(await health.json(), { status: 'ok' });
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    throw new Error(`Server did not start: ${stderr}`);
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }
  const list = async () => (await fetch(`${base}/api/projects`)).json();
  const create = (name) => fetch(`${base}/api/projects`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
  });
  try {
    await start();
    assert.deepEqual(await list(), []);
    for (const name of ['', '   ', null, 123]) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await list(), []);
    const response = await create('  First project  ');
    assert.equal(response.status, 201);
    const first = await response.json();
    assert.equal(first.name, 'First project');
    assert.equal(first.archived, 0);
    assert.equal(first.default_task_priority, 'Normal');
    assert.equal(first.total, 0);
    assert.equal(first.completed, 0);
    const second = await (await create('Second project')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await list(), [first, second]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    for (const path of ['/app.js', '/task-filters.js', '/due-dates.js']) {
      const asset = await fetch(`${base}${path}`);
      assert.equal(asset.status, 200);
      assert.match(asset.headers.get('content-type'), /text\/javascript/);
      assert.ok((await asset.text()).length > 0);
    }
    for (const path of ['/', `/projects/${first.id}`]) {
      const page = await fetch(`${base}${path}`);
      assert.equal(page.status, 200);
      assert.match(await page.text(), /<title>Workboard<\/title>/);
    }
    const filtersModule = await fetch(`${base}/task-filters.js`);
    assert.equal(filtersModule.status, 200);
    assert.match(filtersModule.headers.get('content-type'), /javascript/);
    assert.match(await filtersModule.text(), /export function matchesTaskFilters/);
    assert.equal((await fetch(`${base}/api/projects/999999`)).status, 404);
    assert.equal((await fetch(`${base}/api/projects`, { method: 'POST', body: '{' })).status, 400);
    const tasksUrl = `${base}/api/projects/${first.id}/tasks`;
    const otherTasksUrl = `${base}/api/projects/${second.id}/tasks`;
    const tasks = async (url = tasksUrl) => (await fetch(url)).json();
    const createTask = (title, url = tasksUrl) => fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
    });
    const complete = (task, completed, url = tasksUrl) => fetch(`${url}/${task.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed }),
    });
    assert.deepEqual(await tasks(), []);
    for (const title of ['', ' \t\n ', null, 123]) {
      const invalid = await createTask(title);
      assert.equal(invalid.status, 400);
      assert.deepEqual(await invalid.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await tasks(), []);
    const taskResponse = await createTask('  First task  ');
    assert.equal(taskResponse.status, 201);
    const task = await taskResponse.json();
    assert.equal(task.title, 'First task');
    assert.equal(task.completed, false);
    assert.equal(task.priority, 'Normal');
    assert.equal(task.due_date, '');
    const nextTask = await (await createTask('Second task')).json();
    assert.notEqual(task.id, nextTask.id);
    assert.deepEqual(await tasks(), [task, nextTask]);
    assert.deepEqual(await tasks(otherTasksUrl), []);
    assert.equal((await complete(task, true, otherTasksUrl)).status, 404);
    for (const completed of [null, 1, 'true']) {
      assert.equal((await complete(task, completed)).status, 400);
    }
    assert.deepEqual(await tasks(), [task, nextTask]);
    assert.equal((await complete(task, true)).status, 200);
    task.completed = true;
    assert.deepEqual(await tasks(), [task, nextTask]);
    assert.equal((await complete(task, false)).status, 200);
    task.completed = false;
    assert.deepEqual(await tasks(), [task, nextTask]);
    await complete(task, true);
    task.completed = true;
    const otherTask = await (await createTask('Other project task', otherTasksUrl)).json();
    assert.deepEqual(await tasks(otherTasksUrl), [otherTask]);
    assert.equal((await fetch(`${base}/api/projects/999999/tasks`)).status, 404);
    assert.equal((await createTask('Missing project', `${base}/api/projects/999999/tasks`)).status, 404);
    assert.equal((await complete({ id: 999999 }, true)).status, 404);
    // Simulate the pre-priority schema with saved open and completed tasks.
    await stop();
    const prePriority = new DatabaseSync(join(directory, 'nested', 'projects.sqlite'));
    prePriority.exec('ALTER TABLE tasks DROP COLUMN priority');
    prePriority.exec('ALTER TABLE tasks DROP COLUMN due_date');
    prePriority.exec('ALTER TABLE projects DROP COLUMN default_task_priority');
    prePriority.close();
    await start();
    assert.deepEqual(await tasks(), [task, nextTask]);
    assert.deepEqual(await tasks(otherTasksUrl), [otherTask]);
    const setPriority = (task, priority, url = tasksUrl) => fetch(`${url}/${task.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ priority }),
    });
    for (const priority of ['', 'low', 'Urgent', null, 1]) {
      assert.equal((await setPriority(task, priority)).status, 400);
    }
    assert.equal((await setPriority(task, 'High', otherTasksUrl)).status, 404);
    assert.equal((await setPriority({ id: 999999 }, 'Low')).status, 404);
    for (const update of [{ priority: 'High', title: 'Mixed' }, { priority: 'High', completed: false }]) {
      assert.equal((await fetch(`${tasksUrl}/${task.id}`, {
        method: 'PATCH', body: JSON.stringify(update),
      })).status, 400);
    }
    assert.deepEqual(await tasks(), [task, nextTask]);
    for (const priority of ['Low', 'Normal', 'High']) {
      const saved = await setPriority(task, priority);
      assert.equal(saved.status, 200);
      task.priority = priority;
      assert.deepEqual(await saved.json(), task);
    }
    assert.equal((await setPriority(nextTask, 'Low')).status, 200);
    nextTask.priority = 'Low';
    assert.deepEqual(await tasks(), [task, nextTask]);
    assert.deepEqual(await tasks(otherTasksUrl), [otherTask]);
    const renameTask = (task, title, url = tasksUrl) => fetch(`${url}/${task.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
    });
    for (const title of ['', ' \t\n ', null, 123]) {
      const invalid = await renameTask(task, title);
      assert.equal(invalid.status, 400);
      assert.deepEqual(await invalid.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await tasks(), [task, nextTask]);
    assert.equal((await renameTask(task, 'Wrong project', otherTasksUrl)).status, 404);
    assert.equal((await renameTask({ id: 999999 }, 'Missing task')).status, 404);
    assert.equal((await fetch(`${tasksUrl}/${task.id}`, {
      method: 'PATCH', body: JSON.stringify({ title: 'Mixed', completed: false }),
    })).status, 400);
    const renamedTask = await renameTask(task, '  Renamed completed task  ');
    assert.equal(renamedTask.status, 200);
    task.title = 'Renamed completed task';
    assert.deepEqual(await renamedTask.json(), task);
    const renamedOpenTask = await renameTask(nextTask, '  Renamed open task  ');
    assert.equal(renamedOpenTask.status, 200);
    nextTask.title = 'Renamed open task';
    assert.deepEqual(await renamedOpenTask.json(), nextTask);
    assert.deepEqual(await tasks(), [task, nextTask]);
    assert.deepEqual(await tasks(otherTasksUrl), [otherTask]);
    first.total = 2;
    first.completed = 1;
    second.total = 1;
    const rename = (name) => fetch(`${base}/api/projects/${first.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    for (const name of ['', ' \t\n ', null, 123]) {
      const invalid = await rename(name);
      assert.equal(invalid.status, 400);
      assert.deepEqual(await invalid.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await list(), [first, second]);
    const renamed = await rename('  Renamed project  ');
    assert.equal(renamed.status, 200);
    first.name = 'Renamed project';
    assert.deepEqual(await renamed.json(), first);
    assert.deepEqual(await list(), [first, second]);
    assert.deepEqual(await tasks(), [task, nextTask]);
    assert.equal((await fetch(`${base}/api/projects/999999`, {
      method: 'PATCH', body: JSON.stringify({ name: 'Missing' }),
    })).status, 404);
    assert.equal((await fetch(`${base}/api/projects/${first.id}`, {
      method: 'PATCH', body: JSON.stringify({ name: 'Mixed', archived: true }),
    })).status, 400);
    assert.deepEqual(await list(), [first, second]);
    const archive = (archived) => fetch(`${base}/api/projects/${first.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived }),
    });
    for (const invalid of [null, 1, 'true']) {
      assert.equal((await archive(invalid)).status, 400);
    }
    assert.equal((await archive(true)).status, 200);
    first.archived = 1;
    assert.deepEqual(await list(), [first, second]);
    assert.deepEqual(await tasks(), [task, nextTask]);
    assert.equal((await createTask('Not allowed')).status, 409);
    assert.equal((await complete(task, false)).status, 409);
    assert.equal((await rename('Blocked rename')).status, 409);
    assert.equal((await renameTask(task, 'Blocked task rename')).status, 409);
    assert.equal((await setPriority(task, 'Normal')).status, 409);
    assert.deepEqual(await tasks(), [task, nextTask]);
    assert.deepEqual(await list(), [first, second]);
    await stop();
    await start();
    assert.deepEqual(await tasks(), [task, nextTask]);
    assert.deepEqual(await tasks(otherTasksUrl), [otherTask]);
    assert.deepEqual(await list(), [first, second]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    const restored = await archive(false);
    assert.equal(restored.status, 200);
    first.archived = 0;
    assert.deepEqual(await restored.json(), first);
    assert.deepEqual(await tasks(), [task, nextTask]);
    assert.equal((await setPriority(task, 'Low')).status, 200);
    task.priority = 'Low';
    const renamedAfterRestore = await rename('  Restored project name  ');
    assert.equal(renamedAfterRestore.status, 200);
    first.name = 'Restored project name';
    assert.deepEqual(await renamedAfterRestore.json(), first);
    const taskRenamedAfterRestore = await renameTask(task, '  Restored task title  ');
    assert.equal(taskRenamedAfterRestore.status, 200);
    task.title = 'Restored task title';
    assert.deepEqual(await taskRenamedAfterRestore.json(), task);
    assert.deepEqual(await tasks(), [task, nextTask]);
    assert.deepEqual(await list(), [first, second]);
    await stop();
    await start();
    assert.deepEqual(await list(), [first, second]);
    assert.deepEqual(await tasks(), [task, nextTask]);
    assert.equal((await complete(task, false)).status, 200);
    first.completed = 0;
    assert.deepEqual(await list(), [first, second]);
    assert.equal((await createTask('Restored task')).status, 201);

    const setDefault = (project, priority) => fetch(`${base}/api/projects/${project.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ default_task_priority: priority }),
    });
    const beforeDefaultChange = await tasks();
    const beforeProjects = await list();
    for (const invalid of ['', 'normal', 'Urgent', null, 1]) {
      assert.equal((await setDefault(first, invalid)).status, 400);
    }
    for (const extra of [{ name: 'Mixed' }, { archived: true }]) {
      assert.equal((await fetch(`${base}/api/projects/${first.id}`, {
        method: 'PATCH', body: JSON.stringify({ default_task_priority: 'High', ...extra }),
      })).status, 400);
    }
    assert.deepEqual(await list(), beforeProjects);
    assert.equal((await setDefault({ id: 999999 }, 'High')).status, 404);
    for (const priority of ['Low', 'Normal', 'High']) {
      const saved = await setDefault(first, priority);
      assert.equal(saved.status, 200);
      assert.deepEqual(await saved.json(), { ...beforeProjects[0], default_task_priority: priority });
      assert.deepEqual(await tasks(), beforeDefaultChange);
    }
    assert.equal((await setDefault(second, 'Low')).status, 200);
    const inheritedHigh = await (await createTask('Inherits High')).json();
    assert.equal(inheritedHigh.priority, 'High');
    const inheritedLow = await (await createTask('Inherits Low', otherTasksUrl)).json();
    assert.equal(inheritedLow.priority, 'Low');
    assert.equal((await setDefault(first, 'Normal')).status, 200);
    assert.equal((await rename('Project with default')).status, 200);
    assert.equal((await renameTask(inheritedHigh, 'Renamed inherited task')).status, 200);
    const savedTasks = await tasks();
    assert.deepEqual(savedTasks.slice(0, beforeDefaultChange.length), beforeDefaultChange);
    assert.equal(savedTasks.at(-1).priority, 'High');
    assert.equal((await archive(true)).status, 200);
    assert.equal((await setDefault(first, 'Low')).status, 409);
    const savedProjects = await list();
    assert.equal(savedProjects[0].default_task_priority, 'Normal');
    assert.equal(savedProjects[1].default_task_priority, 'Low');
    await stop();
    await start();
    assert.deepEqual(await list(), savedProjects);
    assert.deepEqual(await tasks(), savedTasks);
    assert.equal((await archive(false)).status, 200);
    assert.equal((await setDefault(first, 'High')).status, 200);
    assert.equal((await (await createTask('After restoration')).json()).priority, 'High');
    const freshProject = await (await create('Fresh project')).json();
    assert.equal(freshProject.default_task_priority, 'Normal');
    const freshTask = await (await createTask('Fresh task', `${base}/api/projects/${freshProject.id}/tasks`)).json();
    assert.equal(freshTask.priority, 'Normal');
    assert.equal(freshTask.due_date, '');

    const setDate = (target, due_date, url = tasksUrl) => fetch(`${url}/${target.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ due_date }),
    });
    const projectsBeforeDates = await list();
    const tasksBeforeDates = await tasks();
    const target = tasksBeforeDates[0];
    assert.equal((await setDate(target, '2024-02-29', otherTasksUrl)).status, 404);
    assert.equal((await setDate({ id: 999999 }, '2024-02-29')).status, 404);
    const savedDate = await setDate(target, '  0001-01-01  ');
    assert.equal(savedDate.status, 200);
    target.due_date = '0001-01-01';
    assert.deepEqual(await savedDate.json(), target);
    for (const invalid of ['0000-01-01', '1900-02-29', '2025-04-31', '2025-1-01', null, 123]) {
      const rejected = await setDate(target, invalid);
      assert.equal(rejected.status, 400);
      assert.deepEqual(await rejected.json(), { error: 'Due date must be a valid YYYY-MM-DD date' });
      assert.deepEqual(await tasks(), tasksBeforeDates);
    }
    for (const extra of [{ title: 'Mixed' }, { priority: 'Low' }, { completed: true }]) {
      assert.equal((await fetch(`${tasksUrl}/${target.id}`, {
        method: 'PATCH', body: JSON.stringify({ due_date: '2024-02-29', ...extra }),
      })).status, 400);
    }
    assert.deepEqual(await list(), projectsBeforeDates);
    assert.equal((await renameTask(target, 'Dated task')).status, 200);
    target.title = 'Dated task';
    assert.deepEqual(await tasks(), tasksBeforeDates);
    assert.equal((await setDate(otherTask, '9999-12-31', otherTasksUrl)).status, 200);
    const otherDatedTasks = await tasks(otherTasksUrl);
    await stop();
    await start();
    assert.deepEqual(await tasks(), tasksBeforeDates);
    assert.deepEqual(await tasks(otherTasksUrl), otherDatedTasks);
    assert.deepEqual(await list(), projectsBeforeDates);
    assert.equal((await archive(true)).status, 200);
    assert.equal((await setDate(target, '')).status, 409);
    assert.deepEqual(await tasks(), tasksBeforeDates);
    assert.equal((await archive(false)).status, 200);
    const cleared = await setDate(target, ' \t\n ');
    assert.equal(cleared.status, 200);
    target.due_date = '';
    assert.deepEqual(await cleared.json(), target);
    assert.deepEqual(await tasks(), tasksBeforeDates);
    assert.deepEqual(await tasks(otherTasksUrl), otherDatedTasks);
    await stop();
    await start();
    assert.deepEqual(await tasks(), tasksBeforeDates);
    assert.deepEqual(await list(), projectsBeforeDates);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
