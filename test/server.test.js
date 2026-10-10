import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('projects, tasks, archives, renames and summaries persist; older databases migrate', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const legacy = new DatabaseSync(join(directory, 'projects.sqlite'));
  legacy.exec('CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
  legacy.close();
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
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
      } catch {
        if (child.exitCode !== null) throw new Error('Server exited during startup');
        await new Promise(resolve => setTimeout(resolve, 30));
      }
    }
    throw new Error('Server did not become healthy');
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = null;
  }
  async function create(name) {
    return fetch(`${base}/api/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
  }
  async function list() { return (await fetch(`${base}/api/projects`)).json(); }
  try {
    await start();
    assert.deepEqual(await list(), []);
    for (const name of ['', '   \t\n']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, 'Project name is required');
    }
    assert.deepEqual(await list(), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    const second = await (await create('Second project')).json();
    assert.equal(first.name, 'First project');
    assert.equal(first.archived, 0);
    assert.equal(first.total, 0);
    assert.equal(first.completed, 0);
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await list(), [first, second]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    for (const path of ['/', `/projects/${first.id}`]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /<script type="module" src="\/app.js">/);
    }
    const tasksPath = `/api/projects/${first.id}/tasks`;
    async function tasks(project = first) {
      return (await fetch(`${base}/api/projects/${project.id}/tasks`)).json();
    }
    async function createTask(title) {
      return fetch(base + tasksPath, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
      });
    }
    async function complete(task, completed, project = first) {
      return fetch(`${base}/api/projects/${project.id}/tasks/${task.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed }),
      });
    }
    assert.deepEqual(await tasks(), []);
    for (const title of ['', '  \t\n']) {
      const response = await createTask(title);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, 'Task title is required');
    }
    assert.deepEqual(await tasks(), []);
    const created = await createTask('  First task  ');
    assert.equal(created.status, 201);
    const task = await created.json();
    assert.equal(task.title, 'First task');
    assert.equal(task.completed, false);
    const next = await (await createTask('Second task')).json();
    assert.deepEqual(await tasks(), [task, next]);
    assert.deepEqual(await tasks(second), []);
    assert.equal((await complete(task, true, second)).status, 404);
    assert.equal((await complete(task, 'true')).status, 400);
    assert.equal((await complete(task, true)).status, 200);
    assert.deepEqual(await tasks(), [{ ...task, completed: true }, next]);
    async function renameTask(item, title, project = first) {
      return fetch(`${base}/api/projects/${project.id}/tasks/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
      });
    }
    for (const title of ['', '  \t\n', null, 123]) {
      const response = await renameTask(task, title);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, 'Task title is required');
    }
    assert.deepEqual(await tasks(), [{ ...task, completed: true }, next]);
    assert.equal((await renameTask(task, 'Wrong project', second)).status, 404);
    assert.equal((await renameTask({ id: 999999 }, 'Missing')).status, 404);
    const renamedTask = await renameTask(task, '  Renamed completed task  ');
    assert.equal(renamedTask.status, 200);
    task.title = 'Renamed completed task';
    assert.deepEqual(await renamedTask.json(), { ...task, completed: true });
    const renamedOpen = await renameTask(next, '  Renamed open task  ');
    assert.equal(renamedOpen.status, 200);
    next.title = 'Renamed open task';
    assert.deepEqual(await renamedOpen.json(), next);
    assert.deepEqual(await tasks(), [{ ...task, completed: true }, next]);
    assert.deepEqual(await tasks(second), []);
    assert.equal((await fetch(`${base}/api/projects/999999/tasks`)).status, 404);
    async function archive(archived) {
      return fetch(`${base}/api/projects/${first.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived }),
      });
    }
    async function rename(name, id = first.id) {
      return fetch(`${base}/api/projects/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
      });
    }
    for (const name of ['', '  \t\n', null, 123]) {
      const response = await rename(name);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, 'Project name is required');
    }
    assert.equal((await rename('Missing', 999999)).status, 404);
    assert.equal((await (await fetch(`${base}/api/projects/${first.id}`)).json()).name, first.name);
    const renamedResponse = await rename('  Renamed project  ');
    assert.equal(renamedResponse.status, 200);
    first.name = 'Renamed project';
    assert.deepEqual(await renamedResponse.json(), { ...first, total: 2, completed: 1 });
    assert.deepEqual(await list(), [{ ...first, total: 2, completed: 1 }, second]);
    assert.deepEqual(await tasks(), [{ ...task, completed: true }, next]);
    assert.equal((await archive('true')).status, 400);
    const archived = await (await archive(true)).json();
    assert.deepEqual(archived, { ...first, archived: 1, total: 2, completed: 1 });
    assert.deepEqual(await list(), [archived, second]);
    assert.equal((await rename('Not allowed')).status, 403);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), archived);
    assert.equal((await renameTask(task, 'Not allowed')).status, 403);
    assert.equal((await createTask('Not allowed')).status, 403);
    assert.equal((await complete(task, false)).status, 403);
    await stop();
    await start();
    assert.deepEqual(await list(), [archived, second]);
    assert.deepEqual(await tasks(), [{ ...task, completed: true }, next]);
    assert.deepEqual(await tasks(second), []);
    assert.equal((await complete(task, false)).status, 403);
    const restored = await (await archive(false)).json();
    assert.deepEqual(restored, { ...first, total: 2, completed: 1 });
    const restoredTaskRename = await renameTask(task, '  Renamed after restore  ');
    assert.equal(restoredTaskRename.status, 200);
    task.title = 'Renamed after restore';
    assert.deepEqual(await restoredTaskRename.json(), { ...task, completed: true });
    assert.deepEqual(await tasks(), [{ ...task, completed: true }, next]);
    assert.deepEqual(await list(), [{ ...first, total: 2, completed: 1 }, second]);
    const renamedAgain = await rename('  Restored and renamed  ');
    assert.equal(renamedAgain.status, 200);
    first.name = 'Restored and renamed';
    assert.deepEqual(await renamedAgain.json(), { ...first, total: 2, completed: 1 });
    assert.equal((await complete(task, false)).status, 200);
    assert.deepEqual(await tasks(), [task, next]);
    await stop();
    await start();
    assert.deepEqual(await tasks(), [task, next]);
    const finalProject = { ...first, total: 2 };
    assert.deepEqual(await list(), [finalProject, second]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), finalProject);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
