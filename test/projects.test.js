import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

test('projects and tasks validate input, stay isolated, and survive a server restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  let output = '';

  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'nested', 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(`Server exited: ${output}`);
      try {
        const response = await fetch(`${base}/health`);
        if (response.ok) return;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`Server did not become healthy: ${output}`);
  }

  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }

  const get = (path) => fetch(`${base}${path}`);
  const create = (name) => fetch(`${base}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });

  try {
    await start();
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const home = await get('/');
    assert.equal(home.status, 200);
    const html = await home.text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, /<button type="submit">Create project<\/button>/);
    assert.match(html, /role="alert"/);
    assert.deepEqual(await (await get('/api/projects')).json(), []);

    for (const name of ['', ' \t\n ']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await get('/api/projects')).json(), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('Second <project>')).json();
    assert.notEqual(first.id, second.id);
    const expected = [first, second];
    assert.deepEqual(await (await get('/api/projects')).json(), expected);
    assert.deepEqual(await (await get(`/api/projects/${first.id}`)).json(), first);
    const detail = await get(`/projects/${first.id}`);
    assert.equal(detail.status, 200);
    assert.match(await detail.text(), />Projects<\/button>/);
    for (const path of ['/app.js', '/styles.css']) {
      assert.equal((await get(path)).status, 200);
    }
    assert.equal((await get('/api/projects/99999')).status, 404);

    const tasksPath = `/api/projects/${first.id}/tasks`;
    const otherTasksPath = `/api/projects/${second.id}/tasks`;
    const write = (path, method, body) => fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    for (const title of ['', ' \t\n ']) {
      const response = await write(tasksPath, 'POST', { title });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await (await get(tasksPath)).json(), []);
    const taskResponse = await write(tasksPath, 'POST', { title: '  First task  ' });
    assert.equal(taskResponse.status, 201);
    const firstTask = await taskResponse.json();
    assert.equal(firstTask.title, 'First task');
    assert.equal(firstTask.completed, false);
    const secondTask = await (await write(tasksPath, 'POST', { title: 'Second <task>' })).json();
    assert.deepEqual(await (await get(tasksPath)).json(), [firstTask, secondTask]);
    assert.deepEqual(await (await get(otherTasksPath)).json(), []);
    assert.equal((await write(`${otherTasksPath}/${firstTask.id}`, 'PATCH', { completed: true })).status, 404);
    assert.equal((await write('/api/projects/99999/tasks', 'POST', { title: 'Orphan' })).status, 404);
    assert.equal((await write(`${tasksPath}/${firstTask.id}`, 'PATCH', { completed: 'true' })).status, 400);
    const completedTask = await (await write(`${tasksPath}/${firstTask.id}`, 'PATCH', { completed: true })).json();
    assert.deepEqual(completedTask, { ...firstTask, completed: true });
    assert.deepEqual(await (await get(tasksPath)).json(), [completedTask, secondTask]);

    await stop();
    await start();
    assert.deepEqual(await (await get('/api/projects')).json(), expected);
    assert.deepEqual(await (await get(`/api/projects/${first.id}`)).json(), first);
    assert.deepEqual(await (await get(tasksPath)).json(), [completedTask, secondTask]);
    assert.deepEqual(await (await get(otherTasksPath)).json(), []);
    assert.equal((await get(`/projects/${first.id}`)).status, 200);
    const reopenedTask = await (await write(`${tasksPath}/${firstTask.id}`, 'PATCH', { completed: false })).json();
    assert.deepEqual(reopenedTask, firstTask);
    await stop();
    await start();
    assert.deepEqual(await (await get(tasksPath)).json(), [firstTask, secondTask]);
    const third = await (await create('Third')).json();
    assert.ok(third.id > second.id);
    assert.deepEqual(await (await get('/api/projects')).json(), [...expected, third]);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
