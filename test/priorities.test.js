import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';

test('priorities migrate existing tasks and persist independently across archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priorities-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('First'), ('Second');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing done', 1), (1, 'Existing open', 0), (2, 'Other project', 0);
  `);
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
    child.stderr.on('data', (chunk) => { output += chunk; });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(`Server exited: ${output}`);
      try { if ((await fetch(`${base}/health`)).ok) return; } catch {}
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
  const get = async (path) => (await fetch(`${base}${path}`)).json();
  const write = (path, body, method = 'PATCH') => fetch(`${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const tasksPath = '/api/projects/1/tasks';
  try {
    await start();
    const tasks = await get(tasksPath);
    assert.equal((await get('/api/projects/1')).default_priority, 'Normal');
    assert.equal((await get('/api/projects/2')).default_priority, 'Normal');
    assert.deepEqual(tasks, [
      { id: 1, title: 'Existing done', completed: true, priority: 'Normal', due_date: '', notes: '' },
      { id: 2, title: 'Existing open', completed: false, priority: 'Normal', due_date: '', notes: '' },
    ]);
    const otherTasks = await get('/api/projects/2/tasks');
    const created = await (await write(tasksPath, { title: 'New' }, 'POST')).json();
    assert.equal(created.priority, 'Normal');
    tasks.push(created);
    const summaries = await get('/api/projects');
    for (const priority of ['High', 'Low', 'Normal', 'High']) {
      const response = await write(`${tasksPath}/1`, { priority });
      assert.equal(response.status, 200);
      tasks[0].priority = priority;
      assert.deepEqual(await response.json(), tasks[0]);
      assert.deepEqual(await get(tasksPath), tasks);
      assert.deepEqual(await get('/api/projects/2/tasks'), otherTasks);
      assert.deepEqual(await get('/api/projects'), summaries);
    }
    for (const priority of ['', 'Urgent', 'high', null, 1]) {
      assert.equal((await write(`${tasksPath}/1`, { priority })).status, 400);
      assert.deepEqual(await get(tasksPath), tasks);
    }
    assert.equal((await write('/api/projects/2/tasks/1', { priority: 'Low' })).status, 404);
    await write(`${tasksPath}/1`, { title: '  Renamed  ' });
    tasks[0].title = 'Renamed';
    assert.deepEqual(await get(tasksPath), tasks);
    await write('/api/projects/1', { archived: true });
    assert.equal((await write(`${tasksPath}/1`, { priority: 'Low' })).status, 409);
    await stop();
    await start();
    assert.deepEqual(await get(tasksPath), tasks);
    assert.equal((await get('/api/projects/1')).archived, 1);
    await write('/api/projects/1', { archived: false });
    await write(`${tasksPath}/2`, { priority: 'Low' });
    tasks[1].priority = 'Low';
    await write(`${tasksPath}/1`, { completed: false });
    tasks[0].completed = false;
    await stop();
    await start();
    assert.deepEqual(await get(tasksPath), tasks);
    assert.deepEqual(await get('/api/projects/2/tasks'), otherTasks);
    assert.equal((await get('/api/projects/1')).completed, 0);

    // Project defaults affect only future tasks and never alter existing task data.
    const originalProject = await get('/api/projects/1');
    const secondProject = await get('/api/projects/2');
    const newProject = await (await write('/api/projects', { name: 'Third' }, 'POST')).json();
    assert.equal(newProject.default_priority, 'Normal');
    for (const default_priority of ['Low', 'High', 'Normal', 'High']) {
      const response = await write('/api/projects/1', { default_priority });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ...originalProject, default_priority });
      assert.deepEqual(await get(tasksPath), tasks);
      assert.deepEqual(await get('/api/projects/2'), secondProject);
    }
    for (const default_priority of ['', 'Urgent', 'high', null, 1]) {
      assert.equal((await write('/api/projects/1', { default_priority })).status, 400);
      assert.equal((await get('/api/projects/1')).default_priority, 'High');
      assert.deepEqual(await get(tasksPath), tasks);
    }
    assert.equal((await write('/api/projects/99999', { default_priority: 'Low' })).status, 404);
    await write('/api/projects/2', { default_priority: 'Low' });
    const inheritedHigh = await (await write(tasksPath, { title: 'Inherits High' }, 'POST')).json();
    assert.equal(inheritedHigh.priority, 'High');
    assert.equal(inheritedHigh.completed, false);
    tasks.push(inheritedHigh);
    const inheritedLow = await (await write('/api/projects/2/tasks', { title: 'Inherits Low' }, 'POST')).json();
    assert.equal(inheritedLow.priority, 'Low');
    otherTasks.push(inheritedLow);
    await write('/api/projects/1', { default_priority: 'Low' });
    assert.deepEqual(await get(tasksPath), tasks, 'Previously inherited priorities stay unchanged');
    await write('/api/projects/1', { name: 'Renamed project' });
    await write(`${tasksPath}/${inheritedHigh.id}`, { title: 'Renamed inherited task' });
    inheritedHigh.title = 'Renamed inherited task';
    await write('/api/projects/1', { archived: true });
    assert.equal((await write('/api/projects/1', { default_priority: 'Normal' })).status, 409);
    await stop();
    await start();
    const archivedProject = await get('/api/projects/1');
    assert.deepEqual(archivedProject, {
      ...originalProject, name: 'Renamed project', archived: 1, default_priority: 'Low', total: 4,
    });
    assert.equal((await get('/api/projects/2')).default_priority, 'Low');
    assert.deepEqual(await get(tasksPath), tasks);
    assert.deepEqual(await get('/api/projects/2/tasks'), otherTasks);
    await write('/api/projects/1', { archived: false });
    const restoredTask = await (await write(tasksPath, { title: 'After restoration' }, 'POST')).json();
    assert.equal(restoredTask.priority, 'Low');
    tasks.push(restoredTask);
    await write('/api/projects/1', { default_priority: 'Normal' });
    await stop();
    await start();
    assert.equal((await get('/api/projects/1')).default_priority, 'Normal');
    assert.deepEqual(await get(tasksPath), tasks);
    const normalTask = await (await write(tasksPath, { title: 'Normal again' }, 'POST')).json();
    assert.equal(normalTask.priority, 'Normal');
    assert.equal((await get('/api/projects/1')).completed, 0);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
