import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';

async function verifyRememberedOrder(schemaVersion) {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-moves-'));
  const databasePath = join(directory, 'workboard.sqlite');
  // Exercise both the pre-position schema and the existing move-order schema.
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
  if (schemaVersion === 11) {
    database.exec(`
      ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
      UPDATE tasks SET position = id * 10;
      INSERT INTO tasks (project_id, title, position) VALUES
        (3, 'Later position', 20), (3, 'Earlier position', 10);
    `);
  }
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
    const thirdTasks = await get(taskPath(3));
    assert.deepEqual(originals.map((task) => task.id), [1, 2]);
    assert.deepEqual(thirdTasks.map((task) => task.id), schemaVersion === 11 ? [5, 4] : []);
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
    assert.deepEqual(await get(taskPath(3)), [...thirdTasks, originals[0]]);
    // Returning restores only position; field edits made while away survive.
    const revised = { title: 'Changed while away', completed: false, priority: 'Low', due_date: '2028-02-29' };
    for (const [key, value] of Object.entries(revised)) {
      assert.equal((await write(taskPath(3, 1), { [key]: value })).status, 200);
    }
    originals[0] = { ...originals[0], ...revised };
    assert.equal((await move(3, 1, 2)).status, 200);
    assert.deepEqual(await get(taskPath(2)), [destinationTasks[0], originals[0], created, originals[1]]);
    // Return in reverse order, with a newly created task occupying a later position.
    assert.equal((await move(2, 2, 1)).status, 200);
    assert.deepEqual(await get(taskPath(1)), [originals[1]]);
    const sourceCreated = await (await write(taskPath(1), { title: 'New source task' }, 'POST')).json();
    assert.equal(sourceCreated.priority, 'High');
    await write('/api/projects/1', { name: 'Renamed source' });
    await write('/api/projects/1', { archived: true });
    assert.equal((await move(2, 1, 1)).status, 409);
    await stop();
    await start();
    assert.deepEqual(await get(taskPath(1)), [originals[1], sourceCreated]);
    assert.deepEqual(await get(taskPath(2)), [destinationTasks[0], originals[0], created]);
    assert.equal((await get('/api/projects/2')).completed, 0);
    assert.equal((await get('/api/projects/2')).total, 3);
    await write('/api/projects/1', { archived: false });
    assert.equal((await move(2, 1, 1)).status, 200);
    assert.deepEqual(await get(taskPath(1)), [originals[0], originals[1], sourceCreated]);

    // Reserve positions even while every task is away from its project.
    assert.equal((await move(1, 1, 2)).status, 200);
    assert.equal((await move(1, 2, 2)).status, 200);
    assert.equal((await move(1, sourceCreated.id, 2)).status, 200);
    assert.deepEqual(await get(taskPath(1)), []);
    const emptyCreated = await (await write(taskPath(1), { title: 'Created while all away' }, 'POST')).json();
    const arrival = await (await write(taskPath(3), { title: 'First arrival' }, 'POST')).json();
    assert.equal((await move(3, arrival.id, 1)).status, 200);
    await stop();
    await start();
    for (const task of [sourceCreated, originals[1], originals[0]]) {
      assert.equal((await move(2, task.id, 1)).status, 200);
    }
    const restored = [originals[0], originals[1], sourceCreated, emptyCreated, arrival];
    assert.deepEqual(await get(taskPath(1)), restored);
    assert.deepEqual(await get(taskPath(2)), [destinationTasks[0], created]);
    assert.deepEqual(await get(taskPath(3)), thirdTasks);
    assert.equal((await get('/api/projects/1')).total, 5);
    assert.equal((await get('/api/projects/1')).completed, 0);
    await stop();
    await start();
    assert.deepEqual(await get(taskPath(1)), restored);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
}

for (const schemaVersion of [10, 11]) {
  test(`moves remember project order, preserve data, and migrate Task ${schemaVersion} through restart`,
    () => verifyRememberedOrder(schemaVersion));
}
