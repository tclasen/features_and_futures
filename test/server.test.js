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
    for (const label of ['Project name', 'Create project', 'Open project', 'Projects', 'project-row', 'Task title', 'Create task', 'Task filter', 'All', 'Open', 'Completed', 'task-row', 'Complete ${task.title}', 'Project filter', 'Active', 'Archived', 'Archive project', 'Restore project', 'Archived project', 'project-summary']) {
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
    assert.equal((await setArchive('yes')).status, 400);
    const archived = { ...current, completed: 1, archived: 1 };
    assert.deepEqual(await (await setArchive(true)).json(), archived);
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
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
