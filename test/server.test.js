import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function availablePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test('projects and tasks validate, remain isolated, and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const port = await availablePort();
  const base = `http://127.0.0.1:${port}`;
  let child;
  let output = '';
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'db.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await fetch(`${base}/health`);
        if (response.ok) return;
      } catch {}
      if (child.exitCode !== null) throw new Error(output);
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    throw new Error(`Server did not start: ${output}`);
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  async function create(name) {
    return fetch(`${base}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  }
  async function tasks(projectId, suffix = '', method = 'GET', body) {
    return fetch(`${base}/api/projects/${projectId}/tasks${suffix}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  try {
    await start();
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    for (const name of ['', '  \n\t ']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('<script>literal name</script>')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [first, second]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    for (const path of ['/', `/projects/${first.id}`]) {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /<title>Workboard<\/title>/);
    }
    assert.equal((await fetch(`${base}/api/projects/999999`)).status, 404);
    const malformed = await fetch(`${base}/api/projects`, { method: 'POST', body: '{' });
    assert.equal(malformed.status, 400);
    for (const title of ['', '  \n\t ', null, 42]) {
      const response = await tasks(first.id, '', 'POST', { title });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await (await tasks(first.id)).json(), []);
    const taskResponse = await tasks(first.id, '', 'POST', { title: '  First task  ' });
    assert.equal(taskResponse.status, 201);
    const firstTask = await taskResponse.json();
    assert.equal(firstTask.title, 'First task');
    assert.equal(firstTask.completed, false);
    const secondTask = await (await tasks(first.id, '', 'POST', { title: '<b>Second task</b>' })).json();
    const otherTask = await (await tasks(second.id, '', 'POST', { title: 'Other project task' })).json();
    assert.deepEqual(await (await tasks(first.id)).json(), [firstTask, secondTask]);
    assert.deepEqual(await (await tasks(second.id)).json(), [otherTask]);
    assert.equal((await tasks(second.id, `/${firstTask.id}`, 'PATCH', { completed: true })).status, 404);
    assert.equal((await tasks(999999)).status, 404);
    assert.equal((await tasks(999999, '', 'POST', { title: 'No project' })).status, 404);
    assert.equal((await tasks(first.id, '/999999', 'PATCH', { completed: true })).status, 404);
    for (const completed of [1, 'true', null]) {
      assert.equal((await tasks(first.id, `/${firstTask.id}`, 'PATCH', { completed })).status, 400);
    }
    const completedResponse = await tasks(first.id, `/${firstTask.id}`, 'PATCH', { completed: true });
    assert.equal(completedResponse.status, 200);
    assert.deepEqual(await completedResponse.json(), { ...firstTask, completed: true });
    assert.deepEqual(await (await tasks(first.id, `/${firstTask.id}`, 'PATCH', { completed: false })).json(), firstTask);
    await tasks(first.id, `/${firstTask.id}`, 'PATCH', { completed: true });
    await stop();
    await start();
    assert.deepEqual(await (await tasks(first.id)).json(), [{ ...firstTask, completed: true }, secondTask]);
    assert.deepEqual(await (await tasks(second.id)).json(), [otherTask]);
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [first, second]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
