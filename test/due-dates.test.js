import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';

test('due dates validate calendar days, preserve task data, and survive migration and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-due-dates-'));
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
    assert.ok(tasks.every((task) => task.due_date === ''));
    const otherTasks = await get('/api/projects/2/tasks');
    const created = await (await write(tasksPath, { title: 'New' }, 'POST')).json();
    assert.equal(created.due_date, '');
    tasks.push(created);
    const summaries = await get('/api/projects');
    for (const due_date of ['0001-01-01', '0099-12-31', '2000-02-29', '2024-02-29', '9999-12-31', '  2026-10-10  ']) {
      const response = await write(`${tasksPath}/1`, { due_date });
      assert.equal(response.status, 200, due_date);
      tasks[0].due_date = due_date.trim();
      assert.deepEqual(await response.json(), tasks[0]);
      assert.deepEqual(await get(tasksPath), tasks);
      assert.deepEqual(await get('/api/projects/2/tasks'), otherTasks);
      assert.deepEqual(await get('/api/projects'), summaries);
    }
    for (const due_date of ['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2025-02-29', '2024-04-31', '2024-00-01', '2024-13-01', '2024-01-00', '2024-01-32', '2024-1-01', '2024-01-1', '2024-01-01T00:00:00Z', 'invalid', null, 20240101]) {
      const response = await write(`${tasksPath}/1`, { due_date });
      assert.equal(response.status, 400, String(due_date));
      assert.deepEqual(await response.json(), { error: 'Due date must be a valid YYYY-MM-DD date' });
      assert.deepEqual(await get(tasksPath), tasks);
    }
    assert.equal((await write('/api/projects/2/tasks/1', { due_date: '2024-01-01' })).status, 404);
    await write(`${tasksPath}/2`, { due_date: '2027-01-02' });
    tasks[1].due_date = '2027-01-02';
    await write(`${tasksPath}/1`, { title: 'Renamed' });
    tasks[0].title = 'Renamed';
    await write(`${tasksPath}/1`, { priority: 'High' });
    tasks[0].priority = 'High';
    await write('/api/projects/1', { archived: true });
    assert.equal((await write(`${tasksPath}/1`, { due_date: '' })).status, 409);
    await stop();
    await start();
    assert.deepEqual(await get(tasksPath), tasks);
    await write('/api/projects/1', { archived: false });
    for (const due_date of ['', ' \t\n ']) {
      const response = await write(`${tasksPath}/1`, { due_date });
      assert.equal(response.status, 200);
      tasks[0].due_date = '';
      assert.deepEqual(await get(tasksPath), tasks);
    }
    await stop();
    await start();
    assert.deepEqual(await get(tasksPath), tasks);
    assert.deepEqual(await get('/api/projects/2/tasks'), otherTasks);
    assert.equal((await get('/api/projects/1')).completed, 1);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
