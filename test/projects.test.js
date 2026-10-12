import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';

test('projects, tasks, archives, and summaries persist with the original schema migrated', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const legacy = new DatabaseSync(join(directory, 'projects.sqlite'));
  legacy.exec('CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
  legacy.close();
  const portReservation = createServer();
  portReservation.listen(0, '127.0.0.1');
  await once(portReservation, 'listening');
  const port = portReservation.address().port;
  await new Promise((resolve) => portReservation.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  let diagnostics = '';
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stderr.on('data', (chunk) => { diagnostics += chunk; });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(`Server exited: ${diagnostics}`);
      try {
        const health = await fetch(`${base}/health`);
        assert.equal(health.status, 200);
        assert.deepEqual(await health.json(), { status: 'ok' });
        return;
      } catch { await new Promise((resolve) => setTimeout(resolve, 25)); }
    }
    throw new Error(`Server did not start: ${diagnostics}`);
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
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
  }
  async function createTask(projectId, title) {
    return fetch(`${base}/api/projects/${projectId}/tasks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
    });
  }
  async function completeTask(projectId, taskId, completed) {
    return fetch(`${base}/api/projects/${projectId}/tasks/${taskId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed }),
    });
  }
  async function archiveProject(projectId, archived) {
    return fetch(`${base}/api/projects/${projectId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived }),
    });
  }
  async function projects() {
    return (await fetch(`${base}/api/projects`)).json();
  }
  async function tasks(projectId) {
    return (await fetch(`${base}/api/projects/${projectId}/tasks`)).json();
  }
  try {
    await start();
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), []);
    for (const name of ['', '  \t\n  ']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), []);
    const response = await create('  First project  ');
    assert.equal(response.status, 201);
    const first = await response.json();
    assert.equal(first.name, 'First project');
    assert.equal(first.archived, false);
    assert.equal(first.total, 0);
    assert.equal(first.completed, 0);
    const second = await (await create('<script>Example</script>')).json();
    assert.notEqual(first.id, second.id);
    const expected = [first, second];
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    const page = await fetch(`${base}/projects/${first.id}`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /src="\/app.js"/);
    assert.deepEqual(await tasks(first.id), []);
    for (const title of ['', '  \t\n  ']) {
      const invalid = await createTask(first.id, title);
      assert.equal(invalid.status, 400);
      assert.deepEqual(await invalid.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await tasks(first.id), []);
    const created = await createTask(first.id, '  First task  ');
    assert.equal(created.status, 201);
    const firstTask = await created.json();
    assert.equal(firstTask.title, 'First task');
    assert.equal(firstTask.completed, false);
    const secondTask = await (await createTask(first.id, '<b>Second task</b>')).json();
    const otherTask = await (await createTask(second.id, 'Other project task')).json();
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
    assert.deepEqual(await tasks(second.id), [otherTask]);
    assert.equal((await completeTask(second.id, firstTask.id, true)).status, 404);
    assert.equal((await completeTask(first.id, firstTask.id, 'true')).status, 400);
    assert.equal((await createTask(99999, 'Orphan task')).status, 404);
    const completedResponse = await completeTask(first.id, firstTask.id, true);
    assert.equal(completedResponse.status, 200);
    const completedTask = await completedResponse.json();
    assert.deepEqual(completedTask, { ...firstTask, completed: true });
    assert.deepEqual(await tasks(first.id), [completedTask, secondTask]);
    Object.assign(first, { total: 2, completed: 1 });
    Object.assign(second, { total: 1, completed: 0 });
    assert.deepEqual(await projects(), expected);
    assert.equal((await archiveProject(first.id, 'true')).status, 400);
    assert.equal((await archiveProject(99999, true)).status, 404);
    const archived = await archiveProject(first.id, true);
    assert.equal(archived.status, 200);
    first.archived = true;
    assert.deepEqual(await archived.json(), first);
    assert.equal((await createTask(first.id, 'Blocked')).status, 409);
    assert.equal((await completeTask(first.id, firstTask.id, false)).status, 409);
    assert.deepEqual(await tasks(first.id), [completedTask, secondTask]);
    await stop();
    await start();
    assert.deepEqual(await projects(), expected);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${second.id}`)).json(), second);
    assert.deepEqual(await tasks(first.id), [completedTask, secondTask]);
    assert.deepEqual(await tasks(second.id), [otherTask]);
    assert.equal((await fetch(`${base}/projects/${first.id}`)).status, 200);
    const restored = await archiveProject(first.id, false);
    assert.equal(restored.status, 200);
    first.archived = false;
    assert.deepEqual(await restored.json(), first);
    assert.deepEqual(await tasks(first.id), [completedTask, secondTask]);
    assert.deepEqual(await (await completeTask(first.id, firstTask.id, false)).json(), firstTask);
    first.completed = 0;
    await stop();
    await start();
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
    assert.deepEqual(await projects(), expected);
    assert.equal((await fetch(`${base}/api/projects/99999`)).status, 404);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
