import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('projects and tasks validate, remain isolated, and survive a process restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return new Promise((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(() => reject(new Error('Server startup timed out')), 10000);
      child.once('error', reject);
      child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited: ${code}`)); });
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) { clearTimeout(timeout); resolve(`http://127.0.0.1:${match[1]}`); }
      });
    });
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = undefined;
  }
  try {
    let base = await start();
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const create = name => fetch(`${base}/api/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    for (const name of ['', ' \n\t ']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      assert.equal((await invalid.json()).error, 'Project name is required');
    }
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('Second project')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [first, second]);
    assert.equal((await fetch(`${base}/projects/${first.id}`)).status, 200);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    const tasksUrl = project => `${base}/api/projects/${project.id}/tasks`;
    const listTasks = async project => (await fetch(tasksUrl(project))).json();
    const createTask = (project, title) => fetch(tasksUrl(project), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
    });
    const complete = (project, task, completed) => fetch(`${tasksUrl(project)}/${task.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed }),
    });
    for (const title of ['', ' \n\t ']) {
      const invalid = await createTask(first, title);
      assert.equal(invalid.status, 400);
      assert.equal((await invalid.json()).error, 'Task title is required');
    }
    assert.deepEqual(await listTasks(first), []);
    const firstTaskResponse = await createTask(first, '  First task  ');
    assert.equal(firstTaskResponse.status, 201);
    const firstTask = await firstTaskResponse.json();
    assert.equal(firstTask.title, 'First task');
    assert.equal(firstTask.completed, false);
    const secondTask = await (await createTask(first, 'Second task')).json();
    assert.ok(secondTask.id > firstTask.id);
    assert.deepEqual(await listTasks(first), [firstTask, secondTask]);
    assert.deepEqual(await listTasks(second), []);
    const foreignTask = await (await createTask(second, 'Other project task')).json();
    assert.equal((await complete(second, firstTask, true)).status, 404);
    const completedResponse = await complete(first, firstTask, true);
    assert.equal(completedResponse.status, 200);
    assert.deepEqual(await completedResponse.json(), { ...firstTask, completed: true });
    assert.equal((await complete(first, firstTask, 'true')).status, 400);
    assert.deepEqual(await listTasks(first), [{ ...firstTask, completed: true }, secondTask]);
    assert.deepEqual(await listTasks(second), [foreignTask]);
    assert.equal((await createTask({ id: 999999 }, 'Missing project')).status, 404);
    const invalidJson = await fetch(tasksUrl(first), { method: 'POST', body: '{' });
    assert.equal(invalidJson.status, 400);
    await stop();
    base = await start();
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [first, second]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    assert.equal((await fetch(`${base}/projects/${first.id}`)).status, 200);
    assert.deepEqual(await listTasks(first), [{ ...firstTask, completed: true }, secondTask]);
    assert.deepEqual(await listTasks(second), [foreignTask]);
    assert.deepEqual(await (await complete(first, firstTask, false)).json(), firstTask);
    await stop();
    base = await start();
    assert.deepEqual(await listTasks(first), [firstTask, secondTask]);
    const third = await (await create('Third project')).json();
    assert.ok(third.id > second.id);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
