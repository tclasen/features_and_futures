import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';

test('moves append tasks, preserve their data, enforce active ownership, and persist after restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-moves-'));
  const databasePath = join(directory, 'workboard.sqlite');
  // Start with the Task 010 schema to verify the ordering migration.
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0,
      default_priority TEXT NOT NULL DEFAULT 'Normal');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal', due_date TEXT NOT NULL DEFAULT '');
    INSERT INTO projects (name, default_priority) VALUES ('Source', 'High'), ('Destination', 'Low'), ('Third', 'Normal');
    INSERT INTO tasks (project_id, title, completed, priority, due_date) VALUES
      (1, 'Older completed', 1, 'High', '0001-01-01'), (1, 'Blank date', 0, 'Normal', ''),
      (2, 'Destination existing', 0, 'Low', '9999-12-31');
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
  const taskPath = (project, task = '') => `/api/projects/${project}/tasks${task ? `/${task}` : ''}`;
  const move = (source, task, destination) => write(taskPath(source, task), { destination_project_id: destination });
  try {
    await start();
    assert.deepEqual(await get('/health'), { status: 'ok' });
    const originals = await get(taskPath(1));
    const destinationTasks = await get(taskPath(2));
    assert.deepEqual(originals.map((task) => task.id), [1, 2]);
    for (const invalid of [1, 0, -1, null, '2', 1.5]) {
      assert.equal((await move(1, 1, invalid)).status, 400);
    }
    assert.equal((await move(1, 1, 999)).status, 404);
    assert.equal((await move(2, 1, 3)).status, 404);
    await write('/api/projects/2', { archived: true });
    assert.equal((await move(1, 1, 2)).status, 409);
    await write('/api/projects/1', { archived: true });
    assert.equal((await move(1, 1, 3)).status, 409);
    assert.deepEqual(await get(taskPath(1)), originals);
    await write('/api/projects/1', { archived: false });
    await write('/api/projects/2', { archived: false });
    await write('/api/projects/2', { name: 'Renamed destination' });
    assert.equal((await move(1, 1, 2)).status, 200);
    assert.deepEqual(await get(taskPath(1)), [originals[1]]);
    assert.deepEqual(await get(taskPath(2)), [...destinationTasks, originals[0]]);
    assert.equal((await get('/api/projects/1')).total, 1);
    assert.equal((await get('/api/projects/1')).completed, 0);
    assert.equal((await get('/api/projects/2')).total, 2);
    assert.equal((await get('/api/projects/2')).completed, 1);
    assert.equal((await write(taskPath(1, 1), { title: 'Wrong owner' })).status, 404);
    const created = await (await write(taskPath(2), { title: 'Created after move' }, 'POST')).json();
    assert.equal(created.priority, 'Low');
    assert.equal((await move(1, 2, 2)).status, 200);
    const ordered = [...destinationTasks, originals[0], created, originals[1]];
    assert.deepEqual(await get(taskPath(2)), ordered);
    await stop();
    await start();
    assert.deepEqual(await get(taskPath(2)), ordered);
    assert.deepEqual(await get(taskPath(1)), []);
    assert.equal((await move(2, 1, 3)).status, 200);
    assert.deepEqual(await get(taskPath(3)), [originals[0]]);
    assert.equal((await move(3, 1, 2)).status, 200);
    assert.deepEqual(await get(taskPath(2)), [destinationTasks[0], created, originals[1], originals[0]]);
    assert.equal((await move(2, 2, 1)).status, 200);
    assert.deepEqual(await get(taskPath(1)), [originals[1]]);
    await stop();
    await start();
    assert.deepEqual(await get(taskPath(1)), [originals[1]]);
    assert.deepEqual(await get(taskPath(2)), [destinationTasks[0], created, originals[0]]);
    assert.equal((await get('/api/projects/2')).completed, 1);
    assert.equal((await get('/api/projects/2')).total, 3);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
