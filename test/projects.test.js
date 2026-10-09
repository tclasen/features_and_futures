import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const url = await new Promise((resolveUrl, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited (${code}): ${errors}`));
    });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolveUrl(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  return {
    url,
    async stop() {
      const stopped = once(child, 'exit');
      child.kill('SIGTERM');
      await stopped;
    },
  };
}

test('projects and tasks validate, preserve order and ownership, and survive a server restart', async () => {
  const directory = await mkdtemp(resolve('.test-workboard-'));
  let server;
  try {
    const databasePath = resolve(directory, 'nested/projects.sqlite');
    server = await startServer(databasePath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const create = (name) => fetch(`${server.url}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    for (const name of ['', '  \n\t ']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await fetch(`${server.url}/api/projects`)).json(), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('<Example> & "project"')).json();
    assert.notEqual(first.id, second.id);
    const expected = [first, second];
    assert.deepEqual(await (await fetch(`${server.url}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${server.url}/api/projects/${first.id}`)).json(), first);

    const tasks = (projectId) => fetch(`${server.url}/api/projects/${projectId}/tasks`).then((response) => response.json());
    const createTask = (projectId, title) => fetch(`${server.url}/api/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const completeTask = (projectId, taskId, completed) => fetch(`${server.url}/api/projects/${projectId}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed }),
    });
    for (const title of ['', '  \n\t ']) {
      const response = await createTask(first.id, title);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await tasks(first.id), []);
    const taskResponse = await createTask(first.id, '  First task  ');
    assert.equal(taskResponse.status, 201);
    const firstTask = await taskResponse.json();
    assert.equal(firstTask.title, 'First task');
    assert.equal(firstTask.completed, false);
    const secondTask = await (await createTask(first.id, '<Second> & "task"')).json();
    const otherTask = await (await createTask(second.id, 'Other project task')).json();
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
    assert.deepEqual(await tasks(second.id), [otherTask]);
    assert.equal((await completeTask(second.id, firstTask.id, true)).status, 404);
    assert.equal((await createTask(999999, 'Missing project')).status, 404);
    assert.equal((await completeTask(first.id, firstTask.id, 'true')).status, 400);
    assert.deepEqual(await (await completeTask(first.id, firstTask.id, true)).json(), { ...firstTask, completed: true });
    assert.deepEqual(await (await completeTask(first.id, firstTask.id, false)).json(), firstTask);
    await completeTask(first.id, firstTask.id, true);
    const expectedTasks = [{ ...firstTask, completed: true }, secondTask];
    assert.deepEqual(await tasks(first.id), expectedTasks);

    const home = await fetch(`${server.url}/`);
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-type'), /text\/html/);
    const html = await home.text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    const projectPage = await fetch(`${server.url}/projects/${first.id}`);
    assert.equal(projectPage.status, 200);
    assert.equal(await projectPage.text(), html);
    assert.equal((await fetch(`${server.url}/api/projects/999999`)).status, 404);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.deepEqual(await (await fetch(`${server.url}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${server.url}/api/projects/${first.id}`)).json(), first);
    assert.deepEqual(await tasks(first.id), expectedTasks);
    assert.deepEqual(await tasks(second.id), [otherTask]);
    assert.equal((await fetch(`${server.url}/projects/${first.id}`)).status, 200);
    const thirdTask = await (await createTask(first.id, 'Third task')).json();
    assert.ok(thirdTask.id > otherTask.id);
    assert.deepEqual(await tasks(first.id), [...expectedTasks, thirdTask]);
    await completeTask(first.id, firstTask.id, false);
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask, thirdTask]);
    const third = await (await create('Third project')).json();
    assert.ok(third.id > second.id);
    assert.deepEqual(await (await fetch(`${server.url}/api/projects`)).json(), [...expected, third]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
