import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('projects and tasks: validation, order, ownership, archive, summaries, and persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const port = await new Promise((resolve, reject) => {
      let output = '';
      let errors = '';
      const timer = setTimeout(() => reject(new Error('Server startup timed out')), 10000);
      child.stderr.on('data', (chunk) => { errors += chunk; });
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${errors}`)); });
    });
    base = `http://127.0.0.1:${port}`;
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGTERM');
    await exited;
  }
  const create = (name) => fetch(`${base}/api/projects`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
  });
  const createTask = (projectId, title) => fetch(`${base}/api/projects/${projectId}/tasks`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
  });
  const tasks = async (projectId) => (await fetch(`${base}/api/projects/${projectId}/tasks`)).json();
  const complete = (projectId, taskId, completed) => fetch(`${base}/api/projects/${projectId}/tasks/${taskId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed }),
  });
  const archive = (projectId, archived) => fetch(`${base}/api/projects/${projectId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived }),
  });
  const projects = async () => (await fetch(`${base}/api/projects`)).json();
  try {
    // Start from the previous schema with an existing project to verify migration.
    const legacy = new DatabaseSync(join(directory, 'projects.sqlite'));
    legacy.exec("CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL); INSERT INTO projects (name) VALUES ('Legacy project')");
    legacy.close();
    await start();
    const legacyProject = (await projects())[0];
    assert.deepEqual(legacyProject, { id: 1, name: 'Legacy project', archived: 0, total_count: 0, completed_count: 0 });
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    for (const name of ['', ' \n\t ']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await projects(), [legacyProject]);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    assert.equal(first.archived, 0);
    assert.equal(first.total_count, 0);
    assert.equal(first.completed_count, 0);
    const second = await (await create('<Second & project>')).json();
    assert.notEqual(first.id, second.id);
    const expected = [legacyProject, first, second];
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    for (const path of ['/', `/projects/${first.id}`]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /<script type="module" src="\/app.js"><\/script>/);
    }
    assert.equal((await fetch(`${base}/api/projects/999999`)).status, 404);
    for (const title of ['', ' \n\t ']) {
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
    const secondTask = await (await createTask(first.id, '<Second & task>')).json();
    const otherTask = await (await createTask(second.id, 'Other project task')).json();
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
    assert.deepEqual(await tasks(second.id), [otherTask]);
    assert.equal((await createTask(999999, 'Missing project')).status, 404);
    assert.equal((await fetch(`${base}/api/projects/999999/tasks`)).status, 404);
    assert.equal((await complete(second.id, firstTask.id, true)).status, 404);
    assert.equal((await complete(first.id, firstTask.id, 'true')).status, 400);
    const completedResponse = await complete(first.id, firstTask.id, true);
    assert.equal(completedResponse.status, 200);
    firstTask.completed = true;
    assert.deepEqual(await completedResponse.json(), firstTask);
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
    first.total_count = 2;
    first.completed_count = 1;
    second.total_count = 1;
    assert.deepEqual(await projects(), expected);
    assert.equal((await archive(first.id, 'true')).status, 400);
    assert.equal((await archive(999999, true)).status, 404);
    const archivedResponse = await archive(first.id, true);
    assert.equal(archivedResponse.status, 200);
    first.archived = 1;
    assert.deepEqual(await archivedResponse.json(), first);
    assert.equal((await createTask(first.id, 'Blocked task')).status, 409);
    assert.equal((await complete(first.id, firstTask.id, false)).status, 409);
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
    await stop();
    await start();
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${second.id}`)).json(), second);
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
    assert.deepEqual(await tasks(second.id), [otherTask]);
    assert.equal((await createTask(first.id, 'Still blocked')).status, 409);
    assert.equal((await complete(first.id, firstTask.id, false)).status, 409);
    const restoredResponse = await archive(first.id, false);
    assert.equal(restoredResponse.status, 200);
    first.archived = 0;
    assert.deepEqual(await restoredResponse.json(), first);
    const reopenedResponse = await complete(first.id, firstTask.id, false);
    assert.equal(reopenedResponse.status, 200);
    firstTask.completed = false;
    assert.deepEqual(await reopenedResponse.json(), firstTask);
    first.completed_count = 0;
    await stop();
    await start();
    assert.deepEqual(await projects(), expected);
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
    assert.deepEqual(await tasks(second.id), [otherTask]);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
