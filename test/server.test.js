import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import net from 'node:net';

test('projects and tasks validate, stay isolated and survive server restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let server;
  async function start() {
    server = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'projects.sqlite') },
      stdio: 'ignore',
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
    if (server && server.exitCode === null) {
      const exited = once(server, 'exit');
      server.kill('SIGTERM');
      await exited;
    }
  }
  async function create(name) {
    return fetch(`${base}/api/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
  }
  try {
    await start();
    const invalid = await create('   ');
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error, 'Project name is required');
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('Second project')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [first, second]);
    const tasksPath = `/api/projects/${first.id}/tasks`;
    async function taskRequest(path, method, body) {
      return fetch(base + path, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
    }
    for (const title of ['', '   ']) {
      const response = await taskRequest(tasksPath, 'POST', { title });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, 'Task title is required');
    }
    assert.deepEqual(await (await fetch(base + tasksPath)).json(), []);
    const taskResponse = await taskRequest(tasksPath, 'POST', { title: '  First task  ' });
    assert.equal(taskResponse.status, 201);
    const task = await taskResponse.json();
    assert.equal(task.title, 'First task');
    assert.equal(task.completed, false);
    const nextTask = await (await taskRequest(tasksPath, 'POST', { title: 'Second task' })).json();
    assert.deepEqual(await (await fetch(base + tasksPath)).json(), [task, nextTask]);
    const otherPath = `/api/projects/${second.id}/tasks`;
    assert.deepEqual(await (await fetch(base + otherPath)).json(), []);
    const wrongOwner = await taskRequest(`${otherPath}/${task.id}`, 'PATCH', { completed: true });
    assert.equal(wrongOwner.status, 404);
    const checked = await taskRequest(`${tasksPath}/${task.id}`, 'PATCH', { completed: true });
    assert.equal(checked.status, 200);
    assert.equal((await checked.json()).completed, true);
    const invalidCompletion = await taskRequest(`${tasksPath}/${task.id}`, 'PATCH', { completed: 'false' });
    assert.equal(invalidCompletion.status, 400);
    await stop();
    await start();
    assert.deepEqual(await (await fetch(base + tasksPath)).json(), [{ ...task, completed: true }, nextTask]);
    assert.deepEqual(await (await fetch(base + otherPath)).json(), []);
    const unchecked = await taskRequest(`${tasksPath}/${task.id}`, 'PATCH', { completed: false });
    assert.equal(unchecked.status, 200);
    assert.equal((await unchecked.json()).completed, false);
    await stop();
    await start();
    assert.deepEqual(await (await fetch(base + tasksPath)).json(), [task, nextTask]);
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [first, second]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    for (const path of ['/', `/projects/${first.id}`]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /<title>Workboard<\/title>/);
    }
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
