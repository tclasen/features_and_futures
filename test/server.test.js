import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('projects and tasks validate, stay isolated and ordered, and survive server restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const port = 20000 + Math.floor(Math.random() * 30000);
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'projects.sqlite') },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    for (let i = 0; i < 100; i++) {
      try {
        const response = await fetch(`${base}/health`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'ok' });
        return;
      } catch { await new Promise(resolve => setTimeout(resolve, 30)); }
    }
    throw new Error('Server did not become healthy');
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  async function create(name) {
    return fetch(`${base}/api/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
  }
  try {
    // Start with the Task 002 schema to verify the archive migration.
    const legacy = new DatabaseSync(join(directory, 'projects.sqlite'));
    legacy.exec('CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
    legacy.close();
    await start();
    const page = await (await fetch(base)).text();
    assert.match(page, /<h1>Workboard<\/h1>/);
    const script = await (await fetch(`${base}/app.js`)).text();
    for (const label of ['Project name', 'Create project', 'Open project', 'Projects', 'project-row', 'Task title', 'Create task', 'Task filter', 'All', 'Open', 'Completed', 'task-row', 'Complete ${task.title}', 'Project filter', 'Active', 'Archived', 'Archive project', 'Restore project', 'Archived project', 'project-summary', 'New project name', 'Rename project', 'New task title', 'Rename task', 'Task priority', 'Low', 'Normal', 'High']) {
      assert.ok(script.includes(label));
    }
    for (const blank of ['', '  \t\n']) {
      const response = await create(blank);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), []);
    const response = await create('  First project  ');
    assert.equal(response.status, 201);
    const first = await response.json();
    assert.equal(first.name, 'First project');
    assert.equal(first.default_priority, 'Normal');
    const second = await (await create('Second project')).json();
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [first, second]);
    assert.equal((await fetch(`${base}/projects/${first.id}`)).status, 200);
    const taskUrl = `${base}/api/projects/${first.id}/tasks`;
    const getTasks = async (id = first.id) => (await fetch(`${base}/api/projects/${id}/tasks`)).json();
    const createTask = title => fetch(taskUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
    });
    const complete = (task, completed, projectId = first.id) => fetch(`${base}/api/projects/${projectId}/tasks/${task.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed }),
    });
    for (const title of ['', '  \t\n']) {
      const invalid = await createTask(title);
      assert.equal(invalid.status, 400);
      assert.deepEqual(await invalid.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await getTasks(), []);
    const taskResponse = await createTask('  First task  ');
    assert.equal(taskResponse.status, 201);
    const task = await taskResponse.json();
    assert.equal(task.title, 'First task');
    assert.equal(task.completed, false);
    assert.equal(task.priority, 'Normal');
    assert.equal(task.due_date, '');
    const nextTask = await (await createTask('Second task')).json();
    assert.deepEqual(await getTasks(), [task, nextTask]);
    assert.deepEqual(await getTasks(second.id), []);
    assert.equal((await complete(task, true, second.id)).status, 404);
    assert.equal((await complete(task, 'true')).status, 400);
    assert.equal((await complete(task, true)).status, 200);
    const completedTask = { ...task, completed: true };
    assert.deepEqual(await getTasks(), [completedTask, nextTask]);
    assert.equal((await fetch(`${base}/api/projects/999999/tasks`)).status, 404);
    await stop();
    // Simulate a Task 005 database with existing open and completed tasks.
    const beforePriority = new DatabaseSync(join(directory, 'projects.sqlite'));
    beforePriority.exec('ALTER TABLE tasks DROP COLUMN priority; ALTER TABLE tasks DROP COLUMN due_date; ALTER TABLE projects DROP COLUMN default_priority');
    beforePriority.close();
    await start();
    assert.deepEqual(await getTasks(), [completedTask, nextTask]);
    assert.deepEqual(await getTasks(second.id), []);
    assert.equal((await fetch(`${base}/projects/${first.id}`)).status, 200);
    assert.equal((await complete(task, false)).status, 200);
    assert.deepEqual(await getTasks(), [task, nextTask]);
    await stop();
    await start();
    assert.deepEqual(await getTasks(), [task, nextTask]);
    const current = { ...first, total: 2, completed: 0 };
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [current, second]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), current);
    assert.equal((await complete(task, true)).status, 200);
    const setArchive = archived => fetch(`${base}/api/projects/${first.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived }),
    });
    const rename = name => fetch(`${base}/api/projects/${first.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    assert.equal((await setArchive('yes')).status, 400);
    const archived = { ...current, completed: 1, archived: 1 };
    assert.deepEqual(await (await setArchive(true)).json(), archived);
    assert.equal((await rename('Not allowed')).status, 409);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), archived);
    assert.equal((await createTask('Not allowed')).status, 409);
    assert.equal((await complete(task, false)).status, 409);
    assert.deepEqual(await getTasks(), [completedTask, nextTask]);
    await stop();
    await start();
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [archived, second]);
    assert.deepEqual(await getTasks(), [completedTask, nextTask]);
    const restored = { ...archived, archived: 0 };
    assert.deepEqual(await (await setArchive(false)).json(), restored);
    await stop();
    await start();
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), restored);
    assert.deepEqual(await getTasks(), [completedTask, nextTask]);
    assert.equal((await complete(task, false)).status, 200);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), current);
    for (const name of ['', '  \t\n']) {
      const invalid = await rename(name);
      assert.equal(invalid.status, 400);
      assert.deepEqual(await invalid.json(), { error: 'Project name is required' });
      assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), current);
    }
    await complete(task, true);
    const renamed = { ...current, name: 'Renamed project', completed: 1 };
    const renamedResponse = await rename('  Renamed project  ');
    assert.equal(renamedResponse.status, 200);
    assert.deepEqual(await renamedResponse.json(), renamed);
    assert.deepEqual(await getTasks(), [completedTask, nextTask]);
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [renamed, second]);
    await stop();
    await start();
    assert.equal((await fetch(`${base}/projects/${first.id}`)).status, 200);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), renamed);
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [renamed, second]);
    assert.deepEqual(await getTasks(), [completedTask, nextTask]);
    const renameTask = (title, projectId = first.id) => fetch(`${base}/api/projects/${projectId}/tasks/${task.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
    });
    for (const title of ['', '  \t\n']) {
      const invalid = await renameTask(title);
      assert.equal(invalid.status, 400);
      assert.deepEqual(await invalid.json(), { error: 'Task title is required' });
      assert.deepEqual(await getTasks(), [completedTask, nextTask]);
    }
    assert.equal((await renameTask('Wrong project', second.id)).status, 404);
    const renamedTask = { ...completedTask, title: 'Renamed task' };
    const taskRenameResponse = await renameTask('  Renamed task  ');
    assert.equal(taskRenameResponse.status, 200);
    assert.deepEqual(await taskRenameResponse.json(), renamedTask);
    assert.deepEqual(await getTasks(), [renamedTask, nextTask]);
    assert.deepEqual(await getTasks(second.id), []);
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [renamed, second]);
    await stop();
    await start();
    assert.deepEqual(await getTasks(), [renamedTask, nextTask]);
    await setArchive(true);
    assert.equal((await renameTask('Blocked title')).status, 409);
    assert.deepEqual(await getTasks(), [renamedTask, nextTask]);
    await stop();
    await start();
    assert.equal((await renameTask('Still blocked')).status, 409);
    await setArchive(false);
    const restoredTask = { ...renamedTask, title: 'Restored task' };
    assert.deepEqual(await (await renameTask(' Restored task ')).json(), restoredTask);
    assert.deepEqual(await getTasks(), [restoredTask, nextTask]);
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [renamed, second]);
    await stop();
    await start();
    assert.deepEqual(await getTasks(), [restoredTask, nextTask]);
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [renamed, second]);
    const prioritize = (priority, projectId = first.id, taskId = task.id) => fetch(`${base}/api/projects/${projectId}/tasks/${taskId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ priority }),
    });
    for (const invalid of ['', 'Urgent', 'high', null, 1]) {
      assert.equal((await prioritize(invalid)).status, 400);
    }
    assert.equal((await prioritize('High', second.id)).status, 404);
    const highTask = { ...restoredTask, priority: 'High' };
    assert.deepEqual(await (await prioritize('High')).json(), highTask);
    const lowTask = { ...nextTask, priority: 'Low' };
    assert.deepEqual(await (await prioritize('Low', first.id, nextTask.id)).json(), lowTask);
    assert.deepEqual(await getTasks(), [highTask, lowTask]);
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [renamed, second]);
    await stop();
    await start();
    assert.deepEqual(await getTasks(), [highTask, lowTask]);
    await setArchive(true);
    assert.equal((await prioritize('Normal')).status, 409);
    await stop();
    await start();
    assert.deepEqual(await getTasks(), [highTask, lowTask]);
    assert.equal((await prioritize('Low')).status, 409);
    await setArchive(false);
    const finalTask = { ...highTask, title: 'Priority preserved' };
    assert.deepEqual(await (await renameTask(' Priority preserved ')).json(), finalTask);
    assert.deepEqual(await getTasks(), [finalTask, lowTask]);
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [renamed, second]);
    assert.deepEqual(await (await prioritize('Normal')).json(), { ...finalTask, priority: 'Normal' });
    await stop();
    await start();
    assert.deepEqual(await getTasks(), [{ ...finalTask, priority: 'Normal' }, lowTask]);
    const getProject = async (id = first.id) => (await fetch(`${base}/api/projects/${id}`)).json();
    const setDefault = (default_priority, id = first.id) => fetch(`${base}/api/projects/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ default_priority }),
    });
    for (const invalid of ['', 'Urgent', 'high', null, 1]) {
      assert.equal((await setDefault(invalid)).status, 400);
    }
    assert.deepEqual(await getProject(), renamed);
    assert.deepEqual(await (await setDefault('High')).json(), { ...renamed, default_priority: 'High' });
    assert.equal((await getProject(second.id)).default_priority, 'Normal');
    const existingTasks = await getTasks();
    assert.deepEqual(existingTasks, [{ ...finalTask, priority: 'Normal' }, lowTask]);
    const inherited = await (await createTask('Inherited high')).json();
    assert.equal(inherited.priority, 'High');
    assert.equal(inherited.completed, false);
    await setDefault('Low');
    assert.deepEqual(await getTasks(), [...existingTasks, inherited]);
    const inheritedLow = await (await createTask('Inherited low')).json();
    assert.equal(inheritedLow.priority, 'Low');
    const savedProject = { ...renamed, default_priority: 'Low', total: 4 };
    assert.deepEqual(await getProject(), savedProject);
    await rename('Default preserved');
    await setArchive(true);
    assert.equal((await setDefault('Normal')).status, 409);
    await stop();
    await start();
    assert.deepEqual(await getProject(), { ...savedProject, name: 'Default preserved', archived: 1 });
    assert.deepEqual(await getTasks(), [...existingTasks, inherited, inheritedLow]);
    await setArchive(false);
    assert.equal((await getProject()).default_priority, 'Low');
    const restoredDefaultTask = await (await createTask('Restored default')).json();
    assert.equal(restoredDefaultTask.priority, 'Low');
    await setDefault('High', second.id);
    assert.equal((await getProject()).default_priority, 'Low');
    const otherTask = await (await fetch(`${base}/api/projects/${second.id}/tasks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Independent' }),
    })).json();
    assert.equal(otherTask.priority, 'High');
    await stop();
    await start();
    assert.deepEqual(await getTasks(), [...existingTasks, inherited, inheritedLow, restoredDefaultTask]);
    assert.equal((await getProject()).default_priority, 'Low');
    assert.equal((await getProject(second.id)).default_priority, 'High');
    const saveDate = (due_date, projectId = first.id, taskId = task.id) => fetch(`${base}/api/projects/${projectId}/tasks/${taskId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ due_date }),
    });
    const beforeDates = await getTasks();
    const beforeProject = await getProject();
    assert.ok(beforeDates.every(task => task.due_date === ''));
    assert.equal((await saveDate('2024-01-01', second.id)).status, 404);
    for (const date of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '1900-02-28']) {
      const saved = await saveDate(`  ${date}  `);
      assert.equal(saved.status, 200);
      assert.deepEqual(await saved.json(), { ...beforeDates[0], due_date: date });
    }
    const dated = { ...beforeDates[0], due_date: '1900-02-28' };
    for (const invalid of ['0000-01-01', '10000-01-01', '1900-02-29', '2023-02-29', '2024-04-31', '2024-00-01', '2024-13-01', '2024-01-00', '2024-01-32', '2024-1-01', '24-01-01', '2024-01-01T00:00:00Z', 'nonsense', null, 20240101]) {
      const response = await saveDate(invalid);
      assert.equal(response.status, 400, String(invalid));
      assert.deepEqual(await response.json(), { error: 'Due date must be a valid YYYY-MM-DD date' });
      assert.deepEqual(await getTasks(), [dated, ...beforeDates.slice(1)]);
    }
    assert.deepEqual(await getProject(), beforeProject);
    await stop();
    await start();
    assert.deepEqual(await getTasks(), [dated, ...beforeDates.slice(1)]);
    const datedRenamed = { ...dated, title: 'Date preserved' };
    assert.deepEqual(await (await renameTask(' Date preserved ')).json(), datedRenamed);
    await setArchive(true);
    assert.equal((await saveDate('')).status, 409);
    assert.equal((await saveDate('2025-01-01')).status, 409);
    await stop();
    await start();
    assert.deepEqual(await getTasks(), [datedRenamed, ...beforeDates.slice(1)]);
    await setArchive(false);
    assert.deepEqual(await getProject(), beforeProject);
    for (const blank of ['', '  \t\n']) {
      assert.deepEqual(await (await saveDate(blank)).json(), { ...datedRenamed, due_date: '' });
      assert.equal((await saveDate('2024-02-29')).status, 200);
    }
    await saveDate('');
    assert.equal((await saveDate('0001-12-31', second.id, otherTask.id)).status, 200);
    await stop();
    await start();
    assert.deepEqual(await getTasks(), [{ ...datedRenamed, due_date: '' }, ...beforeDates.slice(1)]);
    assert.equal((await getTasks(second.id))[0].due_date, '0001-12-31');
    assert.deepEqual(await getProject(), beforeProject);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
