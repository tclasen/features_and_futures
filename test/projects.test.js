import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server failed to start: ${errors}`));
    }, 5000);
    child.once('exit', () => {
      clearTimeout(timer);
      reject(new Error(`Server exited: ${errors}`));
    });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  return {
    url,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects and tasks validate input, isolate ownership, and persist across restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const request = (path, options) => fetch(server.url + path, options);
    const create = (name) => request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const health = await request('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.deepEqual(await (await request('/api/projects')).json(), []);
    for (const name of ['', '   \t\n']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await request('/api/projects')).json(), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('<script>second</script>')).json();
    assert.ok(second.id > first.id);
    const expected = [first, second];
    assert.deepEqual(await (await request('/api/projects')).json(), expected);
    assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), first);
    assert.equal((await request('/api/projects/99999')).status, 404);
    const page = await request(`/projects/${first.id}`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<script type="module" src="\/app.js"><\/script>/);
    assert.equal((await request('/app.js')).status, 200);
    assert.equal((await request('/styles.css')).status, 200);
    const tasksPath = `/api/projects/${first.id}/tasks`;
    const otherTasksPath = `/api/projects/${second.id}/tasks`;
    const createTask = (title, path = tasksPath) => request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const completeTask = (id, completed, path = tasksPath) => request(`${path}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed }),
    });
    assert.deepEqual(await (await request(tasksPath)).json(), []);
    for (const title of ['', ' \t\n ']) {
      const response = await createTask(title);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await (await request(tasksPath)).json(), []);
    const taskResponse = await createTask('  First task  ');
    assert.equal(taskResponse.status, 201);
    const firstTask = await taskResponse.json();
    assert.equal(firstTask.title, 'First task');
    assert.equal(firstTask.completed, false);
    const secondTask = await (await createTask('Second task')).json();
    assert.ok(secondTask.id > firstTask.id);
    assert.deepEqual(await (await request(otherTasksPath)).json(), []);
    const otherTask = await (await createTask('Other project task', otherTasksPath)).json();
    assert.equal((await completeTask(firstTask.id, true, otherTasksPath)).status, 404);
    assert.equal((await createTask('Missing project', '/api/projects/99999/tasks')).status, 404);
    assert.equal((await completeTask(firstTask.id, 'true')).status, 400);
    assert.deepEqual(await (await completeTask(firstTask.id, true)).json(), { ...firstTask, completed: true });
    assert.deepEqual(await (await completeTask(firstTask.id, false)).json(), firstTask);
    assert.equal((await completeTask(secondTask.id, true)).status, 200);
    const expectedTasks = [firstTask, { ...secondTask, completed: true }];
    assert.deepEqual(await (await request(tasksPath)).json(), expectedTasks);
    assert.deepEqual(await (await request(otherTasksPath)).json(), [otherTask]);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.deepEqual(await (await request('/api/projects')).json(), expected);
    assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), first);
    assert.deepEqual(await (await request(tasksPath)).json(), expectedTasks);
    assert.deepEqual(await (await request(otherTasksPath)).json(), [otherTask]);
    assert.equal((await request(`/projects/${first.id}`)).status, 200);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
