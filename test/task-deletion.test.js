import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { DatabaseSync } from 'node:sqlite';

test('deletion migrates live tasks, preserves data and positions, protects writes and persists', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-deletion-'));
  const dbPath = join(directory, 'tasks.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
    title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal',
    due_date TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL);
    CREATE TABLE task_positions (project_id INTEGER NOT NULL, task_id INTEGER NOT NULL,
      position INTEGER NOT NULL, PRIMARY KEY (project_id, task_id));
    INSERT INTO projects (name) VALUES ('Source'), ('Destination');
    INSERT INTO tasks (project_id, title, completed, priority, due_date, notes, position) VALUES
      (1, 'First', 1, 'High', '2024-02-29', '  literal <b>雪</b>' || char(10), 10),
      (1, 'Second', 0, 'Low', '', '', 20), (2, 'Other', 0, 'Normal', '', '', 20);
    INSERT INTO task_positions VALUES (1, 1, 10), (1, 2, 20), (2, 1, 10), (2, 3, 20);`);
  legacy.close();
  let child;
  let base;
  let output = '';
  const { createServer } = await import('node:net');
  const reservation = createServer();
  reservation.listen(0, '0.0.0.0');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  base = `http://127.0.0.1:${port}`;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(output);
      try {
        const response = await fetch(base + '/health');
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'ok' });
        return;
      } catch { await delay(25); }
    }
    throw new Error(output || 'Server did not become healthy');
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  const get = async path => (await fetch(base + path)).json();
  async function write(path, input, status = 200, method = 'PATCH') {
    const response = await fetch(base + path, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    });
    assert.equal(response.status, status);
    return response.json();
  }
  const tasks = id => get(`/api/projects/${id}/tasks`);
  const taskPath = '/api/projects/1/tasks/1';
  async function summary(id, completed, total) {
    const project = await get(`/api/projects/${id}`);
    assert.equal(project.completed_count, completed);
    assert.equal(project.total_count, total);
    const listed = (await get('/api/projects')).find(item => item.id === id);
    assert.deepEqual(listed, project);
  }
  try {
    await start();
    const originals = await tasks(1);
    assert.ok(originals.every(task => task.deleted === false));
    await summary(1, 1, 2);
    await write(taskPath, { deleted: 'true' }, 400);
    assert.deepEqual(await tasks(1), originals);
    assert.deepEqual(await write(taskPath, { deleted: true }), { ...originals[0], deleted: true });
    await summary(1, 0, 1);
    for (const input of [{ title: 'Changed' }, { completed: false }, { priority: 'Low' },
      { due_date: '' }, { notes: 'Changed' }, { destination_project_id: 2 }]) {
      await write(taskPath, input, 409);
    }
    await write('/api/projects/2/tasks/1', { deleted: false }, 404);
    await write('/api/projects/1/tasks/2', { deleted: true });
    await summary(1, 0, 0);
    await write('/api/projects/1', { default_priority: 'Low' });
    const newTask = await write('/api/projects/1/tasks', { title: 'Newer' }, 201, 'POST');
    assert.equal(newTask.deleted, false);
    assert.equal(newTask.priority, 'Low');
    await write('/api/projects/1', { archived: true });
    await write(taskPath, { deleted: false }, 409);
    await write('/api/projects/1/tasks/3', { deleted: true }, 404);
    await write(`/api/projects/1/tasks/${newTask.id}`, { deleted: true }, 409);
    await stop();
    await start();
    assert.deepEqual(await tasks(1), originals.map(task => ({ ...task, deleted: true })).concat(newTask));
    await summary(1, 0, 1);
    await write('/api/projects/1', { archived: false });
    await write('/api/projects/1/tasks/2', { deleted: false });
    assert.deepEqual(await write(taskPath, { deleted: false }), originals[0]);
    assert.deepEqual(await tasks(1), [...originals, newTask]);
    await summary(1, 1, 3);
    // Previously established destination positions also survive deletion/restoration.
    await write(taskPath, { destination_project_id: 2 });
    assert.deepEqual((await tasks(2)).map(task => task.id), [1, 3]);
    const destinationPath = '/api/projects/2/tasks/1';
    await write(destinationPath, { deleted: true });
    await summary(2, 0, 1);
    await write(destinationPath, { deleted: false });
    await write(destinationPath, { destination_project_id: 1 });
    assert.deepEqual(await tasks(1), [...originals, newTask]);
    await stop();
    await start();
    assert.deepEqual(await tasks(1), [...originals, newTask]);
    await summary(1, 1, 3);
    await summary(2, 0, 1);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
