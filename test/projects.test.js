import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';

test('projects and tasks validate, stay ordered and isolated, and persist across restarts', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data/test-'));
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  let child;
  let output = '';
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: resolve(directory, 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(output);
      try {
        const response = await fetch(origin + '/health');
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'ok' });
        return;
      } catch { await new Promise(resolve => setTimeout(resolve, 30)); }
    }
    throw new Error('Server failed to start: ' + output);
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }
  async function create(name) {
    return fetch(origin + '/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
    });
  }
  async function list() {
    return (await fetch(origin + '/api/projects')).json();
  }
  async function taskRequest(projectId, method = 'GET', input, taskId) {
    return fetch(origin + `/api/projects/${projectId}/tasks` + (taskId ? `/${taskId}` : ''), {
      method, headers: { 'Content-Type': 'application/json' },
      ...(input === undefined ? {} : { body: JSON.stringify(input) })
    });
  }
  try {
    await start();
    assert.deepEqual(await list(), []);
    for (const name of ['', '  \n\t ']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
      assert.deepEqual(await list(), []);
    }
    const response = await create('  First project  ');
    assert.equal(response.status, 201);
    const first = await response.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('<Second & project>')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await list(), [first, second]);
    for (const path of ['/', `/projects/${first.id}`]) {
      const page = await fetch(origin + path);
      assert.equal(page.status, 200);
      assert.match(page.headers.get('content-type'), /text\/html/);
      const html = await page.text();
      assert.match(html, /<label for="project-name">Project name<\/label>/);
      assert.match(html, /Create project/);
      assert.match(html, /row\.dataset\.testid = 'project-row'/);
    }
    assert.deepEqual(await (await fetch(origin + `/api/projects/${first.id}`)).json(), first);
    assert.equal((await fetch(origin + '/api/projects/999999')).status, 404);
    assert.deepEqual(await (await taskRequest(first.id)).json(), []);
    for (const title of ['', ' \n\t ', null]) {
      const invalid = await taskRequest(first.id, 'POST', { title });
      assert.equal(invalid.status, 400);
      assert.deepEqual(await invalid.json(), { error: 'Task title is required' });
      assert.deepEqual(await (await taskRequest(first.id)).json(), []);
    }
    const created = await taskRequest(first.id, 'POST', { title: '  First task  ' });
    assert.equal(created.status, 201);
    const firstTask = await created.json();
    assert.equal(firstTask.title, 'First task');
    assert.equal(firstTask.completed, false);
    const secondTask = await (await taskRequest(first.id, 'POST', { title: '<Second & task>' })).json();
    const otherTask = await (await taskRequest(second.id, 'POST', { title: 'Other project task' })).json();
    assert.deepEqual(await (await taskRequest(first.id)).json(), [firstTask, secondTask]);
    assert.deepEqual(await (await taskRequest(second.id)).json(), [otherTask]);
    assert.equal((await taskRequest(second.id, 'PATCH', { completed: true }, firstTask.id)).status, 404);
    assert.equal((await taskRequest(999999, 'POST', { title: 'Orphan' })).status, 404);
    assert.equal((await taskRequest(first.id, 'PATCH', { completed: 'true' }, firstTask.id)).status, 400);
    for (const completed of [true, false, true]) {
      const changed = await taskRequest(first.id, 'PATCH', { completed }, firstTask.id);
      assert.equal(changed.status, 200);
      firstTask.completed = completed;
      assert.deepEqual(await changed.json(), firstTask);
      assert.deepEqual(await (await taskRequest(first.id)).json(), [firstTask, secondTask]);
    }
    await stop();
    await start();
    assert.deepEqual(await list(), [first, second]);
    assert.deepEqual(await (await fetch(origin + `/api/projects/${first.id}`)).json(), first);
    assert.deepEqual(await (await taskRequest(first.id)).json(), [firstTask, secondTask]);
    assert.deepEqual(await (await taskRequest(second.id)).json(), [otherTask]);
    assert.equal((await fetch(origin + `/projects/${first.id}`)).status, 200);
    const thirdTask = await (await taskRequest(first.id, 'POST', { title: 'After restart' })).json();
    assert.ok(thirdTask.id > secondTask.id);
    assert.equal(thirdTask.completed, false);
    assert.deepEqual(await (await taskRequest(first.id)).json(), [firstTask, secondTask, thirdTask]);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
