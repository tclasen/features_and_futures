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

test('projects migrate, validate, archive and restore with persistent tasks and summaries', async () => {
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
    assert.equal(first.total, 0);
    assert.equal(first.completed, 0);
    const second = await (await create('Second project')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await list(), [first, second]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    for (const path of ['/', `/projects/${first.id}`]) {
      const page = await fetch(`${base}${path}`);
      assert.equal(page.status, 200);
      assert.match(await page.text(), /<title>Workboard<\/title>/);
    }
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
    first.total = 2;
    first.completed = 1;
    second.total = 1;
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
    await stop();
    await start();
    assert.deepEqual(await list(), [first, second]);
    assert.equal((await complete(task, false)).status, 200);
    first.completed = 0;
    assert.deepEqual(await list(), [first, second]);
    assert.equal((await createTask('Restored task')).status, 201);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
