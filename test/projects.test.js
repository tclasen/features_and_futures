import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('projects and tasks validate, rename, set priorities, archive, restore, and survive migration and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  // Seed the previous schema to verify upgrades preserve existing records.
  const legacy = new DatabaseSync(join(directory, 'projects.sqlite'));
  legacy.exec('CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
  legacy.exec(`CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
  )`);
  legacy.exec("INSERT INTO projects (name) VALUES ('Existing project')");
  legacy.exec("INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing task', 1)");
  legacy.close();
  const existing = { id: 1, name: 'Existing project', archived: 0, total: 1, completed: 1 };
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return new Promise((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(() => reject(new Error('Server startup timed out')), 10000);
      child.once('error', reject);
      child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited: ${code}`)); });
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) { clearTimeout(timeout); resolve(`http://127.0.0.1:${match[1]}`); }
      });
    });
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = undefined;
  }
  try {
    let base = await start();
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const create = name => fetch(`${base}/api/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    for (const name of ['', ' \n\t ']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      assert.equal((await invalid.json()).error, 'Project name is required');
    }
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [existing]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/1/tasks`)).json(), [
      { id: 1, title: 'Existing task', completed: true, priority: 'Normal' },
    ]);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    assert.deepEqual(first, { id: first.id, name: 'First project', archived: 0, total: 0, completed: 0 });
    const second = await (await create('Second project')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [existing, first, second]);
    assert.equal((await fetch(`${base}/projects/${first.id}`)).status, 200);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    const projectData = async project => (await fetch(`${base}/api/projects/${project.id}`)).json();
    const archive = (project, archived) => fetch(`${base}/api/projects/${project.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived }),
    });
    const rename = (project, name) => fetch(`${base}/api/projects/${project.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    const tasksUrl = project => `${base}/api/projects/${project.id}/tasks`;
    const listTasks = async project => (await fetch(tasksUrl(project))).json();
    const createTask = (project, title) => fetch(tasksUrl(project), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
    });
    const complete = (project, task, completed) => fetch(`${tasksUrl(project)}/${task.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed }),
    });
    const renameTask = (project, task, title) => fetch(`${tasksUrl(project)}/${task.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
    });
    const setPriority = (project, task, priority) => fetch(`${tasksUrl(project)}/${task.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ priority }),
    });
    for (const title of ['', ' \n\t ']) {
      const invalid = await createTask(first, title);
      assert.equal(invalid.status, 400);
      assert.equal((await invalid.json()).error, 'Task title is required');
    }
    assert.deepEqual(await listTasks(first), []);
    const firstTaskResponse = await createTask(first, '  First task  ');
    assert.equal(firstTaskResponse.status, 201);
    const firstTask = await firstTaskResponse.json();
    assert.equal(firstTask.title, 'First task');
    assert.equal(firstTask.completed, false);
    assert.equal(firstTask.priority, 'Normal');
    const secondTask = await (await createTask(first, 'Second task')).json();
    assert.equal(secondTask.priority, 'Normal');
    assert.ok(secondTask.id > firstTask.id);
    assert.deepEqual(await listTasks(first), [firstTask, secondTask]);
    assert.deepEqual(await listTasks(second), []);
    const foreignTask = await (await createTask(second, 'Other project task')).json();
    assert.equal((await complete(second, firstTask, true)).status, 404);
    const completedResponse = await complete(first, firstTask, true);
    assert.equal(completedResponse.status, 200);
    assert.deepEqual(await completedResponse.json(), { ...firstTask, completed: true });
    assert.equal((await complete(first, firstTask, 'true')).status, 400);
    assert.deepEqual(await listTasks(first), [{ ...firstTask, completed: true }, secondTask]);
    assert.deepEqual(await listTasks(second), [foreignTask]);
    for (const priority of ['', 'Urgent', 'high', null, 42]) {
      const invalid = await setPriority(first, firstTask, priority);
      assert.equal(invalid.status, 400);
      assert.deepEqual(await listTasks(first), [{ ...firstTask, completed: true }, secondTask]);
    }
    assert.equal((await setPriority(second, firstTask, 'High')).status, 404);
    assert.equal((await setPriority(first, { id: 999999 }, 'High')).status, 404);
    for (const priority of ['Low', 'Normal', 'High']) {
      const updated = await setPriority(first, firstTask, priority);
      assert.equal(updated.status, 200);
      firstTask.priority = priority;
      assert.deepEqual(await updated.json(), { ...firstTask, completed: true });
      assert.deepEqual(await listTasks(first), [{ ...firstTask, completed: true }, secondTask]);
      assert.deepEqual(await listTasks(second), [foreignTask]);
      assert.deepEqual(await projectData(first), { ...first, total: 2, completed: 1 });
    }
    assert.equal((await setPriority(first, secondTask, 'Low')).status, 200);
    secondTask.priority = 'Low';
    for (const title of ['', ' \n\t ', null, 42]) {
      const invalid = await renameTask(first, firstTask, title);
      assert.equal(invalid.status, 400);
      assert.equal((await invalid.json()).error, 'Task title is required');
      assert.deepEqual(await listTasks(first), [{ ...firstTask, completed: true }, secondTask]);
    }
    assert.equal((await renameTask(second, firstTask, 'Wrong project')).status, 404);
    assert.equal((await renameTask(first, { id: 999999 }, 'Missing task')).status, 404);
    const renamedTaskResponse = await renameTask(first, firstTask, '  Renamed completed task \n ');
    assert.equal(renamedTaskResponse.status, 200);
    firstTask.title = 'Renamed completed task';
    assert.deepEqual(await renamedTaskResponse.json(), { ...firstTask, completed: true });
    const renamedOpenResponse = await renameTask(first, secondTask, '  Renamed open task  ');
    assert.equal(renamedOpenResponse.status, 200);
    secondTask.title = 'Renamed open task';
    assert.deepEqual(await renamedOpenResponse.json(), secondTask);
    assert.deepEqual(await listTasks(first), [{ ...firstTask, completed: true }, secondTask]);
    assert.deepEqual(await listTasks(second), [foreignTask]);
    assert.equal((await createTask({ id: 999999 }, 'Missing project')).status, 404);
    const invalidJson = await fetch(tasksUrl(first), { method: 'POST', body: '{' });
    assert.equal(invalidJson.status, 400);
    Object.assign(first, { total: 2, completed: 1 });
    Object.assign(second, { total: 1, completed: 0 });
    assert.deepEqual(await projectData(first), first);
    assert.deepEqual(await projectData(second), second);
    for (const name of ['', ' \n\t ', null, 42]) {
      const invalid = await rename(first, name);
      assert.equal(invalid.status, 400);
      assert.equal((await invalid.json()).error, 'Project name is required');
      assert.deepEqual(await projectData(first), first);
    }
    assert.equal((await rename({ id: 999999 }, 'Missing project')).status, 404);
    const renamedResponse = await rename(first, '  Renamed project \n ');
    assert.equal(renamedResponse.status, 200);
    Object.assign(first, { name: 'Renamed project' });
    assert.deepEqual(await renamedResponse.json(), first);
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [existing, first, second]);
    assert.equal((await fetch(`${base}/projects/${first.id}`)).status, 200);
    assert.deepEqual(await listTasks(first), [{ ...firstTask, completed: true }, secondTask]);
    assert.equal((await archive(first, 'true')).status, 400);
    const archivedResponse = await archive(first, true);
    assert.equal(archivedResponse.status, 200);
    Object.assign(first, { archived: 1 });
    assert.deepEqual(await archivedResponse.json(), first);
    const archivedRename = await rename(first, 'Cannot rename');
    assert.equal(archivedRename.status, 409);
    assert.equal((await archivedRename.json()).error, 'Archived project');
    assert.deepEqual(await projectData(first), first);
    assert.equal((await createTask(first, 'Cannot create')).status, 409);
    assert.equal((await complete(first, firstTask, false)).status, 409);
    assert.equal((await setPriority(first, firstTask, 'Low')).status, 409);
    const archivedTaskRename = await renameTask(first, firstTask, 'Cannot rename task');
    assert.equal(archivedTaskRename.status, 409);
    assert.equal((await archivedTaskRename.json()).error, 'Archived project');
    assert.deepEqual(await listTasks(first), [{ ...firstTask, completed: true }, secondTask]);
    await stop();
    base = await start();
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [existing, first, second]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    assert.equal((await fetch(`${base}/projects/${first.id}`)).status, 200);
    assert.deepEqual(await listTasks(first), [{ ...firstTask, completed: true }, secondTask]);
    assert.deepEqual(await listTasks(second), [foreignTask]);
    assert.equal((await createTask(first, 'Still archived')).status, 409);
    assert.equal((await rename(first, 'Still archived')).status, 409);
    assert.equal((await renameTask(first, secondTask, 'Still archived')).status, 409);
    assert.equal((await setPriority(first, secondTask, 'High')).status, 409);
    Object.assign(first, { archived: 0 });
    assert.deepEqual(await (await archive(first, false)).json(), first);
    const restoredPriority = await setPriority(first, secondTask, 'High');
    assert.equal(restoredPriority.status, 200);
    secondTask.priority = 'High';
    assert.deepEqual(await restoredPriority.json(), secondTask);
    const restoredRename = await rename(first, '  Restored project  ');
    assert.equal(restoredRename.status, 200);
    Object.assign(first, { name: 'Restored project' });
    assert.deepEqual(await restoredRename.json(), first);
    assert.deepEqual(await listTasks(first), [{ ...firstTask, completed: true }, secondTask]);
    const restoredTaskRename = await renameTask(first, firstTask, '  Restored task  ');
    assert.equal(restoredTaskRename.status, 200);
    firstTask.title = 'Restored task';
    assert.deepEqual(await restoredTaskRename.json(), { ...firstTask, completed: true });
    assert.deepEqual(await projectData(first), first);
    assert.deepEqual(await (await complete(first, firstTask, false)).json(), firstTask);
    Object.assign(first, { completed: 0 });
    assert.deepEqual(await projectData(first), first);
    await stop();
    base = await start();
    assert.deepEqual(await listTasks(first), [firstTask, secondTask]);
    assert.deepEqual(await projectData(first), first);
    const third = await (await create('Third project')).json();
    assert.ok(third.id > second.id);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
