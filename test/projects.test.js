import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';

test('projects and tasks validate, stay isolated, and survive a server restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
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
    assert.deepEqual(await (await fetch(`${origin}/api/projects`)).json(), []);
    const response = await create('  First project  ');
    assert.equal(response.status, 201);
    const first = await response.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('Second project')).json();
    assert.notEqual(first.id, second.id);
    const expected = [first, second];
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
    await stop();
    await start();
    assert.deepEqual(await (await fetch(`${origin}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${origin}/api/projects/${first.id}`)).json(), first);
    assert.deepEqual(await tasks(), expectedTasks);
    assert.deepEqual(await tasks(second.id), [otherTask]);
    assert.equal((await fetch(`${origin}/projects/${first.id}`)).status, 200);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
