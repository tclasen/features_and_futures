import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('projects, tasks, archive/restore, summaries, migration, and restart persistence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const port = 18000 + Math.floor(Math.random() * 20000);
  const base = `http://127.0.0.1:${port}`;
  const legacy = new DatabaseSync(join(dir, 'projects.sqlite'));
  legacy.exec('CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
  legacy.close();
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(dir, 'projects.sqlite') },
      stdio: 'ignore'
    });
    for (let attempt = 0; attempt < 100; attempt++) {
      try { if ((await fetch(`${base}/health`)).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Server did not become healthy');
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }
  async function create(name) {
    return fetch(`${base}/api/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
    });
  }
  try {
    await start();
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const blank = await create('   ');
    assert.equal(blank.status, 400);
    assert.deepEqual(await blank.json(), { error: 'Project name is required' });
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    assert.equal(first.archived, 0);
    assert.equal(first.completed, 0);
    assert.equal(first.total, 0);
    const second = await (await create('Second project')).json();
    const expected = [first, second];
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    for (const path of ['/', `/projects/${first.id}`, '/app.js', '/style.css']) {
      assert.equal((await fetch(`${base}${path}`)).status, 200);
    }
    const taskPath = `/api/projects/${first.id}/tasks`;
    async function tasksFor(projectId) {
      return (await fetch(`${base}/api/projects/${projectId}/tasks`)).json();
    }
    async function createTask(title) {
      return fetch(`${base}${taskPath}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title })
      });
    }
    async function complete(taskId, completed, projectId = first.id) {
      return fetch(`${base}/api/projects/${projectId}/tasks/${taskId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed })
      });
    }
    assert.deepEqual(await tasksFor(first.id), []);
    const blankTask = await createTask('  ');
    assert.equal(blankTask.status, 400);
    assert.deepEqual(await blankTask.json(), { error: 'Task title is required' });
    assert.deepEqual(await tasksFor(first.id), []);
    const taskResponse = await createTask('  First task  ');
    assert.equal(taskResponse.status, 201);
    const task = await taskResponse.json();
    assert.equal(task.title, 'First task');
    assert.equal(task.completed, false);
    const nextTask = await (await createTask('Second task')).json();
    assert.deepEqual(await tasksFor(first.id), [task, nextTask]);
    assert.deepEqual(await tasksFor(second.id), []);
    assert.equal((await complete(task.id, true, second.id)).status, 404);
    assert.equal((await complete(task.id, 'true')).status, 400);
    task.completed = true;
    assert.deepEqual(await (await complete(task.id, true)).json(), task);
    task.completed = false;
    assert.deepEqual(await (await complete(task.id, false)).json(), task);
    task.completed = true;
    await complete(task.id, true);
    async function archive(archived) {
      return fetch(`${base}/api/projects/${first.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived })
      });
    }
    assert.equal((await archive('true')).status, 400);
    first.total = 2;
    first.completed = 1;
    first.archived = 1;
    assert.deepEqual(await (await archive(true)).json(), first);
    assert.equal((await createTask('Forbidden')).status, 409);
    assert.equal((await complete(task.id, false)).status, 409);
    assert.deepEqual(await tasksFor(first.id), [task, nextTask]);
    await stop();
    await start();
    assert.deepEqual(await tasksFor(first.id), [task, nextTask]);
    assert.deepEqual(await tasksFor(second.id), []);
    assert.equal((await fetch(`${base}/projects/${first.id}`)).status, 200);
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    first.archived = 0;
    assert.deepEqual(await (await archive(false)).json(), first);
    assert.deepEqual(await tasksFor(first.id), [task, nextTask]);
    task.completed = false;
    await complete(task.id, false);
    first.completed = 0;
    await stop();
    await start();
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), expected);
    assert.deepEqual(await tasksFor(first.id), [task, nextTask]);
  } finally {
    await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
