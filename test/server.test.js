import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('projects and tasks validate, stay isolated, and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const port = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Server startup timed out')), 5000);
      child.once('error', reject);
      child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    return `http://127.0.0.1:${port}`;
  }
  async function stop() {
    const done = once(child, 'exit');
    child.kill('SIGTERM');
    await done;
    child = undefined;
  }
  try {
    let base = await start();
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const create = (name) => fetch(`${base}/api/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    for (const name of ['', '   \t\n']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      assert.match((await invalid.json()).error, /Project name is required/);
    }
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('<Second & project>')).json();
    assert.notEqual(first.id, second.id);
    const expected = [first, second];
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), expected);
    const page = await fetch(`${base}/projects/${first.id}`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<label for="project-name">Project name<\/label>/);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    const taskUrl = (project, id = '') => `${base}/api/projects/${project.id}/tasks${id ? `/${id}` : ''}`;
    const createTask = (project, title) => fetch(taskUrl(project), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
    });
    const completeTask = (project, task, completed) => fetch(taskUrl(project, task.id), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed }),
    });
    const readTasks = async (project) => (await fetch(taskUrl(project))).json();
    for (const title of ['', '  \t\n']) {
      const invalid = await createTask(first, title);
      assert.equal(invalid.status, 400);
      assert.match((await invalid.json()).error, /Task title is required/);
    }
    assert.deepEqual(await readTasks(first), []);
    const taskResponse = await createTask(first, '  First task  ');
    assert.equal(taskResponse.status, 201);
    const task = await taskResponse.json();
    assert.equal(task.title, 'First task');
    assert.equal(task.completed, false);
    const nextTask = await (await createTask(first, '<Another & task>')).json();
    const otherTask = await (await createTask(second, 'Other project task')).json();
    assert.deepEqual(await readTasks(first), [task, nextTask]);
    assert.deepEqual(await readTasks(second), [otherTask]);
    assert.equal((await completeTask(second, task, true)).status, 404);
    assert.equal((await completeTask(first, task, 'true')).status, 400);
    assert.deepEqual(await readTasks(first), [task, nextTask]);
    const completed = await (await completeTask(first, task, true)).json();
    assert.deepEqual(completed, { ...task, completed: true });
    assert.deepEqual(await (await completeTask(first, task, false)).json(), task);
    await completeTask(first, task, true);
    await stop();
    base = await start();
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${second.id}`)).json(), second);
    assert.deepEqual(await readTasks(first), [completed, nextTask]);
    assert.deepEqual(await readTasks(second), [otherTask]);
    assert.equal((await fetch(`${base}/projects/${first.id}`)).status, 200);
    assert.equal((await fetch(`${base}/api/projects/99999/tasks`)).status, 404);
    assert.equal((await fetch(`${base}/api/projects/99999`)).status, 404);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
