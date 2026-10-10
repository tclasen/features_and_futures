import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';

test('projects and tasks validate input, stay isolated, and survive a server restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  // Start with the original project schema to exercise upgrades of existing databases.
  const databasePath = join(directory, 'projects.sqlite');
  const database = new DatabaseSync(databasePath);
  database.exec('CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
  database.close();
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  let output = '';

  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, PORT: String(port), DB_PATH: databasePath },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(`Server exited: ${output}`);
      try {
        const response = await fetch(`${base}/health`);
        if (response.ok) return;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`Server did not become healthy: ${output}`);
  }

  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }

  const get = (path) => fetch(`${base}${path}`);
  const create = (name) => fetch(`${base}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });

  try {
    await start();
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const home = await get('/');
    assert.equal(home.status, 200);
    const html = await home.text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, /<button type="submit">Create project<\/button>/);
    assert.match(html, /role="alert"/);
    assert.match(html, /<label for="project-filter">Project filter<\/label>/);
    assert.match(html, /<option>Active<\/option>/);
    assert.match(html, /<option>Archived<\/option>/);
    assert.match(html, /<label for="new-project-name">New project name<\/label>/);
    assert.match(html, />Rename project<\/button>/);
    assert.deepEqual(await (await get('/api/projects')).json(), []);

    for (const name of ['', ' \t\n ']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await get('/api/projects')).json(), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    assert.deepEqual(first, { id: first.id, name: 'First project', archived: 0, default_priority: 'Normal', total: 0, completed: 0 });
    const second = await (await create('Second <project>')).json();
    assert.notEqual(first.id, second.id);
    const expected = [first, second];
    assert.deepEqual(await (await get('/api/projects')).json(), expected);
    assert.deepEqual(await (await get(`/api/projects/${first.id}`)).json(), first);
    const detail = await get(`/projects/${first.id}`);
    assert.equal(detail.status, 200);
    assert.match(await detail.text(), />Projects<\/button>/);
    for (const path of ['/app.js', '/date.js', '/styles.css']) {
      assert.equal((await get(path)).status, 200);
    }
    assert.equal((await get('/api/projects/99999')).status, 404);

    const tasksPath = `/api/projects/${first.id}/tasks`;
    const otherTasksPath = `/api/projects/${second.id}/tasks`;
    const write = (path, method, body) => fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    for (const title of ['', ' \t\n ']) {
      const response = await write(tasksPath, 'POST', { title });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await (await get(tasksPath)).json(), []);
    const taskResponse = await write(tasksPath, 'POST', { title: '  First task  ' });
    assert.equal(taskResponse.status, 201);
    const firstTask = await taskResponse.json();
    assert.equal(firstTask.title, 'First task');
    assert.equal(firstTask.completed, false);
    const secondTask = await (await write(tasksPath, 'POST', { title: 'Second <task>' })).json();
    assert.deepEqual(await (await get(tasksPath)).json(), [firstTask, secondTask]);
    assert.deepEqual(await (await get(otherTasksPath)).json(), []);
    assert.equal((await write(`${otherTasksPath}/${firstTask.id}`, 'PATCH', { completed: true })).status, 404);
    assert.equal((await write('/api/projects/99999/tasks', 'POST', { title: 'Orphan' })).status, 404);
    assert.equal((await write(`${tasksPath}/${firstTask.id}`, 'PATCH', { completed: 'true' })).status, 400);
    const completedTask = await (await write(`${tasksPath}/${firstTask.id}`, 'PATCH', { completed: true })).json();
    assert.deepEqual(completedTask, { ...firstTask, completed: true });
    for (const title of ['', ' \t\n ', null]) {
      const response = await write(`${tasksPath}/${firstTask.id}`, 'PATCH', { title });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
      assert.deepEqual(await (await get(tasksPath)).json(), [completedTask, secondTask]);
    }
    assert.equal((await write(`${otherTasksPath}/${firstTask.id}`, 'PATCH', { title: 'Wrong project' })).status, 404);
    assert.equal((await write(`${tasksPath}/99999`, 'PATCH', { title: 'Missing task' })).status, 404);
    const taskRename = await write(`${tasksPath}/${firstTask.id}`, 'PATCH', { title: '  Renamed <task>  ' });
    assert.equal(taskRename.status, 200);
    completedTask.title = 'Renamed <task>';
    firstTask.title = completedTask.title;
    assert.deepEqual(await taskRename.json(), completedTask);
    assert.deepEqual(await (await get(tasksPath)).json(), [completedTask, secondTask]);
    first.total = 2;
    first.completed = 1;
    assert.deepEqual(await (await get('/api/projects')).json(), expected);
    const projectPath = `/api/projects/${first.id}`;
    for (const name of ['', ' \t\n ']) {
      const response = await write(projectPath, 'PATCH', { name });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
      assert.deepEqual(await (await get(projectPath)).json(), first);
    }
    assert.equal((await write('/api/projects/99999', 'PATCH', { name: 'Missing' })).status, 404);
    const renamed = await write(projectPath, 'PATCH', { name: '  Renamed <project>  ' });
    assert.equal(renamed.status, 200);
    first.name = 'Renamed <project>';
    assert.deepEqual(await renamed.json(), first);
    assert.deepEqual(await (await get('/api/projects')).json(), expected);
    assert.deepEqual(await (await get(tasksPath)).json(), [completedTask, secondTask]);
    assert.equal((await write(projectPath, 'PATCH', { archived: 'true' })).status, 400);
    assert.equal((await write('/api/projects/99999', 'PATCH', { archived: true })).status, 404);
    first.archived = 1;
    assert.deepEqual(await (await write(projectPath, 'PATCH', { archived: true })).json(), first);
    const blockedRename = await write(projectPath, 'PATCH', { name: 'Blocked rename' });
    assert.equal(blockedRename.status, 409);
    assert.deepEqual(await blockedRename.json(), { error: 'Archived project' });
    assert.deepEqual(await (await get(projectPath)).json(), first);
    assert.equal((await write(tasksPath, 'POST', { title: 'Blocked task' })).status, 409);
    assert.equal((await write(`${tasksPath}/${firstTask.id}`, 'PATCH', { completed: false })).status, 409);
    const blockedTaskRename = await write(`${tasksPath}/${firstTask.id}`, 'PATCH', { title: 'Blocked rename' });
    assert.equal(blockedTaskRename.status, 409);
    assert.deepEqual(await blockedTaskRename.json(), { error: 'Archived project' });
    assert.deepEqual(await (await get(tasksPath)).json(), [completedTask, secondTask]);

    await stop();
    await start();
    assert.deepEqual(await (await get('/api/projects')).json(), expected);
    assert.deepEqual(await (await get(`/api/projects/${first.id}`)).json(), first);
    assert.deepEqual(await (await get(tasksPath)).json(), [completedTask, secondTask]);
    assert.deepEqual(await (await get(otherTasksPath)).json(), []);
    assert.equal((await get(`/projects/${first.id}`)).status, 200);
    first.archived = 0;
    assert.deepEqual(await (await write(projectPath, 'PATCH', { archived: false })).json(), first);
    first.name = 'Restored and renamed';
    assert.deepEqual(await (await write(projectPath, 'PATCH', { name: first.name })).json(), first);
    assert.deepEqual(await (await get(tasksPath)).json(), [completedTask, secondTask]);
    const restoredTaskRename = await write(`${tasksPath}/${secondTask.id}`, 'PATCH', { title: '  Restored task  ' });
    assert.equal(restoredTaskRename.status, 200);
    secondTask.title = 'Restored task';
    assert.deepEqual(await restoredTaskRename.json(), secondTask);
    const reopenedTask = await (await write(`${tasksPath}/${firstTask.id}`, 'PATCH', { completed: false })).json();
    assert.deepEqual(reopenedTask, firstTask);
    first.completed = 0;
    await stop();
    await start();
    assert.deepEqual(await (await get(tasksPath)).json(), [firstTask, secondTask]);
    assert.deepEqual(await (await get(projectPath)).json(), first);
    const third = await (await create('Third')).json();
    assert.ok(third.id > second.id);
    assert.deepEqual(await (await get('/api/projects')).json(), [...expected, third]);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
