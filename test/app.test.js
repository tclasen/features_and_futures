import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

async function launch(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Startup timed out: ${errors}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited (${code}): ${errors}`));
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
    base,
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('launch contract, validation, ordered projects, and process-restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let server;
  try {
    const dbPath = join(directory, 'nested', 'projects.sqlite');
    server = await launch(dbPath);
    const get = (path) => fetch(`${server.base}${path}`);
    const create = (name) => fetch(`${server.base}/api/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.deepEqual(await (await get('/api/projects')).json(), []);
    for (const name of ['', ' \t\n ', null, 123]) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await get('/api/projects')).json(), []);
    const response = await create('  First project  ');
    assert.equal(response.status, 201);
    const first = await response.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('<script>not markup</script>')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await (await get('/api/projects')).json(), [first, second]);
    assert.deepEqual(await (await get(`/api/projects/${first.id}`)).json(), first);
    const page = await get(`/projects/${first.id}`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /id="project-detail"/);
    const home = await (await get('/')).text();
    assert.match(home, /<h1 id="heading">Workboard<\/h1>/);
    assert.match(home, /<label for="project-name">Project name<\/label>/);
    assert.match(home, /Create project/);
    assert.equal((await get('/api/projects/999999')).status, 404);
    const invalid = await fetch(`${server.base}/api/projects`, { method: 'POST', body: '{' });
    assert.equal(invalid.status, 400);
    const taskPath = `/api/projects/${first.id}/tasks`;
    const sendTask = (path, method, data) => fetch(`${server.base}${path}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    });
    assert.deepEqual(await (await get(taskPath)).json(), []);
    for (const title of ['', ' \t\n ', null, 123]) {
      const invalidTask = await sendTask(taskPath, 'POST', { title });
      assert.equal(invalidTask.status, 400);
      assert.deepEqual(await invalidTask.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await (await get(taskPath)).json(), []);
    const createdTask = await sendTask(taskPath, 'POST', { title: '  First task  ' });
    assert.equal(createdTask.status, 201);
    const task = await createdTask.json();
    assert.equal(task.title, 'First task');
    assert.equal(task.completed, false);
    const nextTask = await (await sendTask(taskPath, 'POST', { title: '<b>Second task</b>' })).json();
    assert.deepEqual(await (await get(taskPath)).json(), [task, nextTask]);
    const otherTaskPath = `/api/projects/${second.id}/tasks`;
    assert.deepEqual(await (await get(otherTaskPath)).json(), []);
    assert.equal((await sendTask(`${otherTaskPath}/${task.id}`, 'PATCH', { completed: true })).status, 404);
    assert.equal((await sendTask('/api/projects/999999/tasks', 'POST', { title: 'Orphan' })).status, 404);
    for (const completed of [null, 1, 'true']) {
      assert.equal((await sendTask(`${taskPath}/${task.id}`, 'PATCH', { completed })).status, 400);
    }
    const completed = await (await sendTask(`${taskPath}/${task.id}`, 'PATCH', { completed: true })).json();
    assert.equal(completed.completed, true);
    const reopened = await (await sendTask(`${taskPath}/${task.id}`, 'PATCH', { completed: false })).json();
    assert.deepEqual(reopened, task);
    await sendTask(`${taskPath}/${task.id}`, 'PATCH', { completed: true });
    const detailHtml = await (await get(`/projects/${first.id}`)).text();
    assert.match(detailHtml, /<label for="task-title">Task title<\/label>/);
    assert.match(detailHtml, /Create task/);
    assert.match(detailHtml, /<label for="task-filter">Task filter<\/label>/);
    for (const option of ['All', 'Open', 'Completed']) {
      assert.ok(detailHtml.includes(`>${option}</option>`));
    }
    await server.stop();
    server = await launch(dbPath);
    const firstWithCounts = { ...first, completedCount: 1, totalCount: 2 };
    assert.deepEqual(await (await get('/api/projects')).json(), [firstWithCounts, second]);
    assert.deepEqual(await (await get(`/api/projects/${first.id}`)).json(), firstWithCounts);
    assert.deepEqual(await (await get(taskPath)).json(), [completed, nextTask]);

    for (const archived of [null, 1, 'true']) {
      assert.equal((await sendTask(`/api/projects/${first.id}`, 'PATCH', { archived })).status, 400);
    }
    assert.equal((await sendTask('/api/projects/999999', 'PATCH', { archived: true })).status, 404);
    const archivedProject = await (await sendTask(`/api/projects/${first.id}`, 'PATCH', { archived: true })).json();
    assert.deepEqual(archivedProject, { ...firstWithCounts, archived: true });
    assert.equal((await sendTask(taskPath, 'POST', { title: 'Blocked' })).status, 409);
    assert.equal((await sendTask(`${taskPath}/${task.id}`, 'PATCH', { completed: false })).status, 409);
    assert.deepEqual(await (await get(taskPath)).json(), [completed, nextTask]);
    await server.stop();
    server = await launch(dbPath);
    assert.deepEqual(await (await get(`/api/projects/${first.id}`)).json(), archivedProject);
    assert.deepEqual(await (await get('/api/projects')).json(), [archivedProject, second]);
    assert.deepEqual(await (await get(taskPath)).json(), [completed, nextTask]);
    const restored = await (await sendTask(`/api/projects/${first.id}`, 'PATCH', { archived: false })).json();
    assert.deepEqual(restored, firstWithCounts);
    await server.stop();
    server = await launch(dbPath);
    assert.deepEqual(await (await get(`/api/projects/${first.id}`)).json(), restored);
    assert.deepEqual(await (await get(taskPath)).json(), [completed, nextTask]);
    assert.equal((await sendTask(`${taskPath}/${task.id}`, 'PATCH', { completed: false })).status, 200);
    assert.equal((await sendTask(taskPath, 'POST', { title: 'After restoration' })).status, 201);
    assert.deepEqual(await (await get(`/api/projects/${first.id}`)).json(), { ...first, totalCount: 3, completedCount: 0 });
    assert.deepEqual(await (await get(otherTaskPath)).json(), []);
    assert.equal((await get(`/projects/${first.id}`)).status, 200);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
