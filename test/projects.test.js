import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('projects, tasks, summaries, and archive state survive migration and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const legacy = new DatabaseSync(join(directory, 'projects.sqlite'));
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)));
    INSERT INTO projects (id, name) VALUES (7, 'Existing project');
    INSERT INTO tasks (id, project_id, title, completed) VALUES (11, 7, 'Existing task', 1);`);
  legacy.close();
  const existing = { id: 7, name: 'Existing project', archived: 0, total_count: 1, completed_count: 1 };
  const portProbe = createServer();
  portProbe.listen(0, '127.0.0.1');
  await once(portProbe, 'listening');
  const port = portProbe.address().port;
  await new Promise(resolve => portProbe.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  let child;
  let output = '';
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await fetch(`${origin}/health`);
        if (response.ok) return;
      } catch {}
      if (child.exitCode !== null) throw new Error(output);
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error(`Server did not become healthy: ${output}`);
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  async function create(name) {
    return fetch(`${origin}/api/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  }
  try {
    await start();
    const health = await fetch(`${origin}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    for (const name of ['', '   \t\n']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await fetch(`${origin}/api/projects`)).json(), [existing]);
    assert.deepEqual(await (await fetch(`${origin}/api/projects/7/tasks`)).json(), [
      { id: 11, project_id: 7, title: 'Existing task', completed: true },
    ]);
    const response = await create('  First project  ');
    assert.equal(response.status, 201);
    const first = await response.json();
    assert.equal(first.name, 'First project');
    assert.equal(first.archived, 0);
    assert.equal(first.total_count, 0);
    assert.equal(first.completed_count, 0);
    const second = await (await create('Second project')).json();
    assert.notEqual(first.id, second.id);
    const expected = [existing, first, second];
    assert.deepEqual(await (await fetch(`${origin}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${origin}/api/projects/${first.id}`)).json(), first);
    for (const path of ['/', `/projects/${first.id}`]) {
      const page = await fetch(`${origin}${path}`);
      assert.equal(page.status, 200);
      assert.match(await page.text(), /<script type="module" src="\/app.js">/);
    }
    assert.equal((await fetch(`${origin}/app.js`)).status, 200);
    assert.equal((await fetch(`${origin}/style.css`)).status, 200);
    assert.equal((await fetch(`${origin}/api/projects/999999`)).status, 404);
    const tasksPath = `/api/projects/${first.id}/tasks`;
    async function writeTask(path, method, data) {
      return fetch(`${origin}${path}`, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    }
    async function tasks(projectId = first.id) {
      return (await fetch(`${origin}/api/projects/${projectId}/tasks`)).json();
    }
    for (const title of ['', '   \t\n']) {
      const response = await writeTask(tasksPath, 'POST', { title });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await tasks(), []);
    const createdTask = await writeTask(tasksPath, 'POST', { title: '  First task  ' });
    assert.equal(createdTask.status, 201);
    const firstTask = await createdTask.json();
    assert.equal(firstTask.title, 'First task');
    assert.equal(firstTask.project_id, first.id);
    assert.equal(firstTask.completed, false);
    const secondTask = await (await writeTask(tasksPath, 'POST', { title: 'Second task' })).json();
    assert.deepEqual(await tasks(), [firstTask, secondTask]);
    assert.deepEqual(await tasks(second.id), []);
    const otherPath = `/api/projects/${second.id}/tasks`;
    const otherTask = await (await writeTask(otherPath, 'POST', { title: 'Other project task' })).json();
    assert.equal((await writeTask(`${otherPath}/${firstTask.id}`, 'PATCH', { completed: true })).status, 404);
    assert.equal((await writeTask(`${tasksPath}/${firstTask.id}`, 'PATCH', { completed: 'true' })).status, 400);
    for (const completed of [true, false, true]) {
      const response = await writeTask(`${tasksPath}/${firstTask.id}`, 'PATCH', { completed });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ...firstTask, completed });
    }
    const expectedTasks = [{ ...firstTask, completed: true }, secondTask];
    assert.deepEqual(await tasks(), expectedTasks);
    assert.deepEqual(await tasks(second.id), [otherTask]);
    assert.equal((await writeTask('/api/projects/999999/tasks', 'POST', { title: 'Missing project' })).status, 404);
    const summarizedFirst = { ...first, total_count: 2, completed_count: 1 };
    const summarizedSecond = { ...second, total_count: 1 };
    async function project(id) {
      return (await fetch(`${origin}/api/projects/${id}`)).json();
    }
    async function archive(id, archived) {
      return writeTask(`/api/projects/${id}`, 'PATCH', { archived });
    }
    assert.deepEqual(await project(first.id), summarizedFirst);
    assert.equal((await archive(first.id, 'true')).status, 400);
    assert.equal((await archive(999999, true)).status, 404);
    assert.deepEqual(await (await archive(first.id, true)).json(), { ...summarizedFirst, archived: 1 });
    assert.equal((await writeTask(tasksPath, 'POST', { title: 'Forbidden' })).status, 409);
    assert.equal((await writeTask(`${tasksPath}/${firstTask.id}`, 'PATCH', { completed: false })).status, 409);
    assert.deepEqual(await tasks(), expectedTasks);
    await stop();
    await start();
    assert.deepEqual(await (await fetch(`${origin}/api/projects`)).json(), [existing, { ...summarizedFirst, archived: 1 }, summarizedSecond]);
    assert.deepEqual(await project(first.id), { ...summarizedFirst, archived: 1 });
    assert.deepEqual(await tasks(), expectedTasks);
    assert.deepEqual(await tasks(second.id), [otherTask]);
    assert.equal((await fetch(`${origin}/projects/${first.id}`)).status, 200);
    assert.deepEqual(await (await archive(first.id, false)).json(), summarizedFirst);
    assert.deepEqual(await tasks(), expectedTasks);
    assert.equal((await writeTask(`${tasksPath}/${firstTask.id}`, 'PATCH', { completed: false })).status, 200);
    await stop();
    await start();
    assert.deepEqual(await project(first.id), { ...summarizedFirst, completed_count: 0 });
    assert.deepEqual(await tasks(), [firstTask, secondTask]);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
