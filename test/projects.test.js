import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';

test('projects and tasks validate, migrate, rename, archive, restore, and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  let output = '';
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'nested', 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await fetch(base + '/health');
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'ok' });
        return;
      } catch {
        if (child.exitCode !== null) throw new Error(output);
        await new Promise(resolve => setTimeout(resolve, 30));
      }
    }
    throw new Error('Server did not become healthy: ' + output);
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }
  async function create(name) {
    return fetch(base + '/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
    });
  }
  async function createTask(projectId, title) {
    return fetch(`${base}/api/projects/${projectId}/tasks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title })
    });
  }
  async function complete(projectId, taskId, completed) {
    return fetch(`${base}/api/projects/${projectId}/tasks/${taskId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed })
    });
  }
  async function archive(projectId, archived) {
    return fetch(`${base}/api/projects/${projectId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived })
    });
  }
  async function rename(projectId, name) {
    return fetch(`${base}/api/projects/${projectId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
    });
  }
  async function renameTask(projectId, taskId, title) {
    return fetch(`${base}/api/projects/${projectId}/tasks/${taskId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title })
    });
  }
  async function tasks(projectId) {
    return (await fetch(`${base}/api/projects/${projectId}/tasks`)).json();
  }
  try {
    await start();
    assert.deepEqual(await (await fetch(base + '/api/projects')).json(), []);
    for (const name of ['', '  \n\t ']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await fetch(base + '/api/projects')).json(), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    assert.equal(first.archived, 0);
    assert.equal(first.total_count, 0);
    assert.equal(first.completed_count, 0);
    const second = await (await create('Second <project>')).json();
    assert.notEqual(first.id, second.id);
    const expected = [first, second];
    assert.deepEqual(await (await fetch(base + '/api/projects')).json(), expected);
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
    const secondTask = await (await createTask(first.id, 'Second <task>')).json();
    const otherTask = await (await createTask(second.id, 'Other project task')).json();
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
    assert.deepEqual(await tasks(second.id), [otherTask]);
    assert.equal((await complete(second.id, firstTask.id, true)).status, 404);
    assert.equal((await complete(first.id, firstTask.id, 'true')).status, 400);
    assert.equal((await complete(first.id, firstTask.id, true)).status, 200);
    firstTask.completed = true;
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
    assert.equal((await createTask(99999, 'Missing project')).status, 404);
    first.total_count = 2;
    first.completed_count = 1;
    second.total_count = 1;
    for (const title of ['', '  \n\t ', null, 123]) {
      const response = await renameTask(first.id, firstTask.id, title);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
      assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
    }
    assert.equal((await renameTask(second.id, firstTask.id, 'Wrong project')).status, 404);
    assert.equal((await renameTask(first.id, 99999, 'Missing task')).status, 404);
    assert.equal((await renameTask(99999, firstTask.id, 'Missing project')).status, 404);
    const renamedTaskResponse = await renameTask(first.id, firstTask.id, '  Renamed <task> \n ');
    assert.equal(renamedTaskResponse.status, 200);
    firstTask.title = 'Renamed <task>';
    assert.deepEqual(await renamedTaskResponse.json(), firstTask);
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
    assert.deepEqual(await tasks(second.id), [otherTask]);
    assert.deepEqual(await (await fetch(base + '/api/projects')).json(), expected);
    for (const name of ['', '  \n\t ', null, 123]) {
      const response = await rename(first.id, name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
      assert.deepEqual(await (await fetch(base + '/api/projects/' + first.id)).json(), first);
    }
    assert.equal((await rename(99999, 'Missing project')).status, 404);
    const renamedResponse = await rename(first.id, '  Renamed <project> \n ');
    assert.equal(renamedResponse.status, 200);
    first.name = 'Renamed <project>';
    assert.deepEqual(await renamedResponse.json(), first);
    assert.deepEqual(await (await fetch(base + '/api/projects')).json(), expected);
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
    await stop();
    // Simulate a Task 002 database containing existing projects and completed tasks.
    const legacy = new DatabaseSync(join(directory, 'nested', 'projects.sqlite'));
    legacy.exec('ALTER TABLE projects DROP COLUMN archived');
    legacy.close();
    await start();
    assert.deepEqual(await (await fetch(base + '/api/projects')).json(), expected);
    assert.deepEqual(await (await fetch(base + '/api/projects/' + first.id)).json(), first);
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
    assert.deepEqual(await tasks(second.id), [otherTask]);
    assert.equal((await complete(first.id, firstTask.id, false)).status, 200);
    firstTask.completed = false;
    first.completed_count = 0;
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
    await stop();
    await start();
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
    assert.equal((await archive(first.id, 'true')).status, 400);
    assert.equal((await archive(99999, true)).status, 404);
    assert.equal((await complete(first.id, secondTask.id, true)).status, 200);
    secondTask.completed = true;
    first.completed_count = 1;
    const archivedResponse = await archive(first.id, true);
    assert.equal(archivedResponse.status, 200);
    first.archived = 1;
    assert.deepEqual(await archivedResponse.json(), first);
    const blockedRename = await rename(first.id, 'Blocked rename');
    assert.equal(blockedRename.status, 409);
    assert.deepEqual(await blockedRename.json(), { error: 'Archived project' });
    assert.deepEqual(await (await fetch(base + '/api/projects/' + first.id)).json(), first);
    assert.equal((await createTask(first.id, 'Blocked task')).status, 409);
    assert.equal((await complete(first.id, firstTask.id, true)).status, 409);
    assert.equal((await complete(first.id, secondTask.id, false)).status, 409);
    const blockedTaskRename = await renameTask(first.id, firstTask.id, 'Blocked task rename');
    assert.equal(blockedTaskRename.status, 409);
    assert.deepEqual(await blockedTaskRename.json(), { error: 'Archived project' });
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
    await stop();
    await start();
    assert.deepEqual(await (await fetch(base + '/api/projects')).json(), expected);
    assert.deepEqual(await (await fetch(base + '/api/projects/' + first.id)).json(), first);
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
    assert.deepEqual(await tasks(second.id), [otherTask]);
    const restoredResponse = await archive(first.id, false);
    assert.equal(restoredResponse.status, 200);
    first.archived = 0;
    assert.deepEqual(await restoredResponse.json(), first);
    const restoredRename = await rename(first.id, '  Renamed after restoration  ');
    assert.equal(restoredRename.status, 200);
    first.name = 'Renamed after restoration';
    assert.deepEqual(await restoredRename.json(), first);
    const restoredTaskRename = await renameTask(first.id, secondTask.id, '  Task renamed after restoration  ');
    assert.equal(restoredTaskRename.status, 200);
    secondTask.title = 'Task renamed after restoration';
    assert.deepEqual(await restoredTaskRename.json(), secondTask);
    const openTaskRename = await renameTask(first.id, firstTask.id, '  Renamed open task  ');
    assert.equal(openTaskRename.status, 200);
    firstTask.title = 'Renamed open task';
    assert.deepEqual(await openTaskRename.json(), firstTask);
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
    assert.deepEqual(await (await fetch(base + '/api/projects')).json(), expected);
    await stop();
    await start();
    assert.deepEqual(await (await fetch(base + '/api/projects')).json(), expected);
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
    assert.equal((await complete(first.id, firstTask.id, true)).status, 200);
    firstTask.completed = true;
    first.completed_count = 2;
    assert.deepEqual(await (await fetch(base + '/api/projects/' + first.id)).json(), first);
    const restoredTask = await (await createTask(first.id, 'After restoration')).json();
    first.total_count = 3;
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask, restoredTask]);
    assert.deepEqual(await (await fetch(base + '/api/projects')).json(), expected);
    await stop();
    await start();
    assert.deepEqual(await (await fetch(base + '/api/projects')).json(), expected);
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask, restoredTask]);
    for (const path of ['/', '/projects/' + first.id]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /text\/html/);
    }
    assert.equal((await fetch(base + '/api/projects/99999')).status, 404);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
