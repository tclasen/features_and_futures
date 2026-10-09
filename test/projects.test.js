import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

test('health, projects, project-owned tasks, completion, routes, and restart persistence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(dir, 'projects.sqlite') },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(stderr);
      try {
        const response = await fetch(`${base}/health`);
        if (response.ok) return;
      } catch {}
      await delay(30);
    }
    throw new Error('Server did not start');
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = undefined;
  }
  async function create(name) {
    return fetch(`${base}/api/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  }
  try {
    // Exercise migration from the previous projects schema.
    const legacy = new DatabaseSync(join(dir, 'projects.sqlite'));
    legacy.exec('CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
    legacy.close();
    await start();
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), []);
    for (const name of ['', '   ', '\n\t']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /Project name is required/);
    }
    const created = await create('  First project  ');
    assert.equal(created.status, 201);
    const first = await created.json();
    assert.equal(first.name, 'First project');
    assert.equal(first.archived, 0);
    assert.equal(first.completed_count, 0);
    assert.equal(first.total_count, 0);
    const second = await (await create('Second project')).json();
    assert.notEqual(first.id, second.id);
    const expected = [first, second];
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    for (const route of ['/', `/projects/${first.id}`]) {
      const response = await fetch(base + route);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /<label for="project-name">Project name<\/label>/);
    }
    assert.equal((await fetch(`${base}/api/projects/999999`)).status, 404);
    const tasksUrl = `${base}/api/projects/${first.id}/tasks`;
    async function createTask(title) {
      return fetch(tasksUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
    }
    async function completeTask(id, completed, projectId = first.id) {
      return fetch(`${base}/api/projects/${projectId}/tasks/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed }),
      });
    }
    assert.deepEqual(await (await fetch(tasksUrl)).json(), []);
    for (const title of ['', '   ', '\n\t']) {
      const response = await createTask(title);
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /Task title is required/);
    }
    assert.deepEqual(await (await fetch(tasksUrl)).json(), []);
    const taskResponse = await createTask('  First task  ');
    assert.equal(taskResponse.status, 201);
    const task = await taskResponse.json();
    assert.equal(task.title, 'First task');
    assert.equal(task.completed, false);
    assert.equal(task.project_id, first.id);
    const otherTask = await (await createTask('Second task')).json();
    assert.deepEqual(await (await fetch(tasksUrl)).json(), [task, otherTask]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${second.id}/tasks`)).json(), []);
    assert.equal((await completeTask(task.id, true, second.id)).status, 404);
    assert.equal((await completeTask(task.id, 'true')).status, 400);
    assert.equal((await fetch(`${base}/api/projects/999999/tasks`)).status, 404);
    const completedTask = await (await completeTask(task.id, true)).json();
    assert.equal(completedTask.completed, true);
    assert.deepEqual(await (await fetch(tasksUrl)).json(), [completedTask, otherTask]);
    assert.equal((await (await completeTask(task.id, false)).json()).completed, false);
    await completeTask(task.id, true);
    async function archive(archived) {
      return fetch(`${base}/api/projects/${first.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived }),
      });
    }
    assert.equal((await archive('true')).status, 400);
    const archivedProject = await (await archive(true)).json();
    assert.deepEqual(archivedProject, { ...first, archived: 1, completed_count: 1, total_count: 2 });
    assert.equal((await createTask('Forbidden')).status, 409);
    assert.equal((await completeTask(task.id, false)).status, 409);
    assert.deepEqual(await (await fetch(tasksUrl)).json(), [completedTask, otherTask]);
    await stop();
    await start();
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [archivedProject, second]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), archivedProject);
    assert.deepEqual(await (await fetch(tasksUrl)).json(), [completedTask, otherTask]);
    const restored = await (await archive(false)).json();
    assert.deepEqual(restored, { ...first, total_count: 2, completed_count: 1 });
    await stop();
    await start();
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), restored);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${second.id}/tasks`)).json(), []);
    assert.equal((await (await completeTask(task.id, false)).json()).completed, false);
    const summary = await (await fetch(`${base}/api/projects/${first.id}`)).json();
    assert.equal(summary.completed_count, 0);
    assert.equal(summary.total_count, 2);
  } finally {
    await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
