import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('project defaults are independent, persistent and only apply to future tasks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-default-'));
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'db.sqlite') },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`${base}/health`)).ok) return; } catch {}
      if (child.exitCode !== null) throw new Error('Server exited');
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Server did not start');
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = null;
  }
  async function request(path, method = 'GET', body) {
    return fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  }
  async function data(path, method, body) {
    const response = await request(path, method, body);
    assert.ok(response.ok);
    return response.json();
  }
  try {
    await start();
    const first = await data('/api/projects', 'POST', { name: 'First' });
    const second = await data('/api/projects', 'POST', { name: 'Second' });
    assert.equal(first.default_priority, 'Normal');
    assert.equal(second.default_priority, 'Normal');
    const path = `/api/projects/${first.id}`;
    const other = `/api/projects/${second.id}`;
    const initial = await data(`${path}/tasks`, 'POST', { title: 'Initial' });
    await data(`${path}/tasks/${initial.id}`, 'PATCH', { completed: true });
    for (const value of ['Low', 'High', 'Normal']) {
      await data(path, 'PATCH', { default_priority: value });
      const task = await data(`${path}/tasks`, 'POST', { title: value });
      assert.equal(task.priority, value);
    }
    await data(path, 'PATCH', { default_priority: 'High' });
    await data(other, 'PATCH', { default_priority: 'Low' });
    assert.equal((await data(`${other}/tasks`, 'POST', { title: 'Other' })).priority, 'Low');
    const savedTasks = await data(`${path}/tasks`);
    assert.deepEqual(savedTasks[0], { ...initial, completed: true });
    for (const value of ['', null, 'Urgent']) {
      assert.equal((await request(path, 'PATCH', { default_priority: value })).status, 400);
    }
    await data(path, 'PATCH', { name: 'Renamed' });
    const savedProject = await data(path);
    assert.equal(savedProject.default_priority, 'High');
    assert.equal(savedProject.total, 4);
    assert.equal(savedProject.completed, 1);
    await data(path, 'PATCH', { archived: true });
    assert.equal((await request(path, 'PATCH', { default_priority: 'Low' })).status, 403);
    await stop();
    await start();
    assert.deepEqual(await data(path), { ...savedProject, archived: 1 });
    assert.deepEqual(await data(`${path}/tasks`), savedTasks);
    assert.equal((await data(other)).default_priority, 'Low');
    await data(path, 'PATCH', { archived: false });
    assert.deepEqual(await data(path), savedProject);
    assert.equal((await data(`${path}/tasks`, 'POST', { title: 'After restore' })).priority, 'High');
    await data(path, 'PATCH', { default_priority: 'Low' });
    assert.equal((await data(`${path}/tasks`, 'POST', { title: 'After change' })).priority, 'Low');
    assert.deepEqual((await data(`${path}/tasks`)).slice(0, 4), savedTasks);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
