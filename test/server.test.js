import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

const port = 18080;
const base = `http://127.0.0.1:${port}`;

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(errors);
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) return child;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  child.kill();
  throw new Error(`Server did not start: ${errors}`);
}

async function stop(child) {
  const exit = once(child, 'exit');
  child.kill('SIGTERM');
  await exit;
}

async function create(name) {
  return fetch(`${base}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

test('projects and tasks validate, stay isolated, and survive process restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const dbPath = join(directory, 'nested', 'test.sqlite');
  let child;
  try {
    child = await start(dbPath);
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), []);
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
    const second = await (await create('Second project')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [first, second]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    for (const path of ['/', `/projects/${first.id}`]) {
      const page = await fetch(`${base}${path}`);
      assert.equal(page.status, 200);
      assert.match(await page.text(), /<script type="module" src="\/app.js">/);
    }
    assert.equal((await fetch(`${base}/api/projects/999999`)).status, 404);
    const tasksURL = `${base}/api/projects/${first.id}/tasks`;
    const otherTasksURL = `${base}/api/projects/${second.id}/tasks`;
    const postTask = title => fetch(tasksURL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const completeTask = (url, completed) => fetch(url, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed }),
    });
    for (const title of ['', ' \t\n ']) {
      const invalid = await postTask(title);
      assert.equal(invalid.status, 400);
      assert.match((await invalid.json()).error, /Task title is required/);
    }
    assert.deepEqual(await (await fetch(tasksURL)).json(), []);
    const taskResponse = await postTask('  First task  ');
    assert.equal(taskResponse.status, 201);
    const task = await taskResponse.json();
    assert.equal(task.title, 'First task');
    assert.equal(task.completed, false);
    const nextTask = await (await postTask('Next task')).json();
    assert.deepEqual(await (await fetch(tasksURL)).json(), [task, nextTask]);
    assert.deepEqual(await (await fetch(otherTasksURL)).json(), []);
    assert.equal((await completeTask(`${otherTasksURL}/${task.id}`, true)).status, 404);
    const completed = await (await completeTask(`${tasksURL}/${task.id}`, true)).json();
    assert.equal(completed.completed, true);
    assert.deepEqual(await (await fetch(tasksURL)).json(), [completed, nextTask]);
    assert.equal((await completeTask(`${tasksURL}/${task.id}`, 'true')).status, 400);
    assert.equal((await fetch(`${base}/api/projects/999999/tasks`)).status, 404);
    await stop(child);
    child = undefined;
    child = await start(dbPath);
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [first, second]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    assert.deepEqual(await (await fetch(tasksURL)).json(), [completed, nextTask]);
    assert.deepEqual(await (await fetch(otherTasksURL)).json(), []);
    const reopened = await (await completeTask(`${tasksURL}/${task.id}`, false)).json();
    assert.equal(reopened.completed, false);
    assert.deepEqual(await (await fetch(tasksURL)).json(), [reopened, nextTask]);
  } finally {
    if (child) await stop(child);
    await rm(directory, { recursive: true, force: true });
  }
});
