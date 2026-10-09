import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';

test('projects, tasks, archive summaries and renames survive migration and server restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const legacy = new DatabaseSync(join(directory, 'projects.sqlite'));
  legacy.exec('CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
  legacy.close();
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
    const projectPath = `/api/projects/${first.id}`;
    const summary = { ...first, total: 2, completed: 1 };
    assert.deepEqual(await (await fetch(base + projectPath)).json(), summary);
    const archived = await taskRequest(projectPath, 'PATCH', { archived: true });
    assert.equal(archived.status, 200);
    assert.deepEqual(await archived.json(), { ...summary, archived: 1 });
    const blockedRename = await taskRequest(projectPath, 'PATCH', { name: 'Forbidden rename' });
    assert.equal(blockedRename.status, 409);
    assert.deepEqual(await (await fetch(base + projectPath)).json(), { ...summary, archived: 1 });
    assert.equal((await taskRequest(tasksPath, 'POST', { title: 'Forbidden task' })).status, 409);
    assert.equal((await taskRequest(`${tasksPath}/${task.id}`, 'PATCH', { completed: false })).status, 409);
    assert.equal((await taskRequest(`${tasksPath}/${task.id}`, 'PATCH', { title: 'Forbidden title' })).status, 409);
    await stop();
    await start();
    assert.deepEqual(await (await fetch(base + projectPath)).json(), { ...summary, archived: 1 });
    assert.deepEqual(await (await fetch(base + tasksPath)).json(), [{ ...task, completed: true }, nextTask]);
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [{ ...summary, archived: 1 }, second]);
    const restored = await taskRequest(projectPath, 'PATCH', { archived: false });
    assert.equal(restored.status, 200);
    assert.deepEqual(await restored.json(), summary);
    for (const name of ['', '   ']) {
      const invalidRename = await taskRequest(projectPath, 'PATCH', { name });
      assert.equal(invalidRename.status, 400);
      assert.equal((await invalidRename.json()).error, 'Project name is required');
      assert.deepEqual(await (await fetch(base + projectPath)).json(), summary);
    }
    const renamedResponse = await taskRequest(projectPath, 'PATCH', { name: '  Renamed project  ' });
    assert.equal(renamedResponse.status, 200);
    const renamed = { ...summary, name: 'Renamed project' };
    assert.deepEqual(await renamedResponse.json(), renamed);
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [renamed, second]);
    assert.deepEqual(await (await fetch(base + tasksPath)).json(), [{ ...task, completed: true }, nextTask]);
    for (const title of ['', '   ', null]) {
      const invalidRename = await taskRequest(`${tasksPath}/${task.id}`, 'PATCH', { title });
      assert.equal(invalidRename.status, 400);
      assert.equal((await invalidRename.json()).error, 'Task title is required');
      assert.deepEqual(await (await fetch(base + tasksPath)).json(), [{ ...task, completed: true }, nextTask]);
    }
    assert.equal((await taskRequest(`${otherPath}/${task.id}`, 'PATCH', { title: 'Wrong owner' })).status, 404);
    const renamedTask = await taskRequest(`${tasksPath}/${task.id}`, 'PATCH', { title: '  Renamed task  ' });
    assert.equal(renamedTask.status, 200);
    task.title = 'Renamed task';
    assert.deepEqual(await renamedTask.json(), { ...task, completed: true });
    assert.deepEqual(await (await fetch(base + tasksPath)).json(), [{ ...task, completed: true }, nextTask]);
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [renamed, second]);
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
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [{ ...renamed, completed: 0 }, second]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), { ...renamed, completed: 0 });
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
