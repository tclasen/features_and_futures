import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';

test('moves append persistently, preserve task data, update summaries, and reject invalid ownership', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-moves-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Source'), ('Destination'), ('Archived');
    INSERT INTO tasks (project_id, title, completed) VALUES
      (1, 'Oldest', 1), (2, 'Destination first', 0), (1, 'Source remaining', 0);
  `);
  legacy.close();
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: databasePath },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let errors = '';
    child.stderr.on('data', (data) => { errors += data; });
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error(errors);
      try {
        if ((await fetch(`${base}/health`)).ok) return;
      } catch { /* Wait until the server listens. */ }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`Server did not start: ${errors}`);
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }
  const request = (path, method, body) => fetch(`${base}/api/projects${path}`, {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const tasks = async (project) => (await request(`/${project}/tasks`, 'GET')).json();
  const move = (source, task, destination) => request(`/${source}/tasks/${task}/move`, 'POST', {
    destination_project_id: destination,
  });
  try {
    await start();
    assert.deepEqual((await tasks(1)).map((task) => task.id), [1, 3]);
    await request('/1/tasks/1', 'PATCH', { priority: 'High' });
    await request('/1/tasks/1', 'PATCH', { due_date: '2024-02-29' });
    await request('/2', 'PATCH', { default_task_priority: 'Low' });
    await request('/2', 'PATCH', { name: 'Renamed destination' });
    await request('/3', 'PATCH', { archived: true });
    const [original, remaining] = await tasks(1);
    for (const value of [1, 0, -1, null, '2', 1.5]) {
      assert.equal((await move(1, 1, value)).status, 400);
    }
    assert.equal((await move(1, 1, 999)).status, 404);
    assert.equal((await move(1, 1, 3)).status, 409);
    assert.equal((await move(2, 1, 1)).status, 404);
    assert.equal((await move(1, 999, 2)).status, 404);
    assert.deepEqual((await tasks(1))[0], original);
    const moved = await move(1, 1, 2);
    assert.equal(moved.status, 200);
    assert.deepEqual(await moved.json(), original);
    assert.deepEqual((await tasks(1)).map((task) => task.id), [3]);
    assert.deepEqual((await tasks(2)).map((task) => task.id), [2, 1]);
    const projects = await (await request('', 'GET')).json();
    assert.deepEqual(projects.map(({ completed, total }) => [completed, total]), [[0, 1], [1, 2], [0, 0]]);
    const created = await (await request('/2/tasks', 'POST', { title: 'After move' })).json();
    assert.equal(created.priority, 'Low');
    assert.deepEqual((await tasks(2)).map((task) => task.id), [2, 1, created.id]);
    await stop();
    await start();
    assert.deepEqual((await tasks(2))[1], original);
    assert.deepEqual((await tasks(2)).map((task) => task.id), [2, 1, created.id]);
    await request('/2', 'PATCH', { archived: true });
    assert.equal((await move(2, 1, 1)).status, 409);
    await request('/2', 'PATCH', { archived: false });
    assert.equal((await move(2, 1, 1)).status, 200);
    assert.deepEqual(await tasks(1), [remaining, original]);
    assert.deepEqual((await tasks(1)).map((task) => task.id), [3, 1]);
    // Blank dates and open completion state also survive a subsequent move.
    const blank = (await tasks(2))[0];
    assert.equal((await move(2, blank.id, 1)).status, 200);
    assert.deepEqual((await tasks(1))[2], blank);
    await stop();
    await start();
    assert.deepEqual((await tasks(1)).map((task) => task.id), [3, 1, 2]);
    assert.deepEqual((await tasks(1))[1], original);
    assert.deepEqual((await tasks(1))[2], blank);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
