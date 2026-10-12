import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('moves remember project positions, preserve data and filters, enforce active ownership and persist order', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-move-'));
  const databasePath = join(directory, 'data.sqlite');
  // Exercise migration from the original schema and original task ordering.
  const db = new DatabaseSync(databasePath);
  db.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Source');
    INSERT INTO tasks (project_id, title) VALUES (1, 'First'), (1, 'Second');
  `);
  db.close();
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: databasePath },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    base = await new Promise((resolve, reject) => {
      let output = '';
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
      child.on('error', reject);
      child.on('exit', code => reject(new Error(`Server exited: ${code}`)));
    });
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = null;
  }
  const get = async path => (await fetch(base + path)).text();
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const rows = body => [...body.matchAll(/aria-label="Complete ([^"]+)"/g)].map(match => match[1]);
  const destinations = body => [...body.matchAll(/name="destination"[^>]*>([\s\S]*?)<\/select>/g)].map(match => match[1]);
  const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-03-01' };
  const location = '/projects/1?filter=Completed&priorityFilter=High&dueFrom=2024-02-29&dueThrough=2024-03-01';
  try {
    await start();
    let body = await get('/projects/1');
    assert.deepEqual(rows(body), ['First', 'Second']);
    assert.match(body, /name="destination" disabled>\s*<\/select>/);
    assert.match(body, /disabled>Move task/);
    await post('/projects', { name: 'Destination' });
    await post('/projects', { name: 'Other' });
    await post('/projects', { name: 'Archived' });
    await post('/projects/4/archive');
    await post('/projects/2/rename', { name: 'Renamed destination' });
    body = await get('/projects/1');
    for (const options of destinations(body)) {
      assert.equal(options.trim(), '<option value="2">Renamed destination</option><option value="3">Other</option>');
    }
    await post('/projects/2/default-priority', { priority: 'Low' });
    await post('/projects/2/tasks', { title: 'Destination existing' });
    await post('/projects/1/tasks/1', { completed: '1' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
    for (const destination of ['1', '4', '999', 'invalid']) {
      assert.equal((await post('/projects/1/tasks/1/move', { destination })).status, 400);
      assert.deepEqual(rows(await get('/projects/1')), ['First', 'Second']);
    }
    assert.equal((await post('/projects/3/tasks/1/move', { destination: '2' })).status, 404);
    const moved = await post('/projects/1/tasks/1/move', { ...state, destination: '2' });
    assert.equal(moved.status, 303);
    assert.equal(moved.headers.get('location'), location);
    assert.deepEqual(rows(await get(location)), []);
    assert.deepEqual(rows(await get('/projects/1')), ['Second']);
    body = await get('/projects/2');
    assert.deepEqual(rows(body), ['Destination existing', 'First']);
    assert.match(body, /aria-label="Complete First" checked/);
    assert.match(body, /<option selected>High<\/option>/);
    assert.match(body, /id="task-due-date-1" name="dueDate" type="text" value="2024-02-29"/);
    assert.match(await get('/'), /1\/2 completed/);
    await post('/projects/1/tasks', { title: 'New source' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(rows(await get('/projects/1')), ['First', 'Second', 'New source']);
    // Blank due dates and Normal priority also survive movement.
    await post('/projects/1/tasks/2/move', { destination: '2' });
    body = await get('/projects/2');
    assert.deepEqual(rows(body), ['Destination existing', 'Second']);
    assert.match(body, /id="task-due-date-2" name="dueDate" type="text" value=""/);
    await post('/projects/1/archive');
    body = await get('/projects/1');
    assert.match(body, /name="destination" disabled>/);
    assert.match(body, /disabled>Move task/);
    assert.equal((await post('/projects/1/tasks/1/move', { destination: '2' })).status, 403);
    assert.equal((await post('/projects/2/tasks/2/move', { destination: '1' })).status, 400);
    await stop();
    await start();
    assert.deepEqual(rows(await get('/projects/1')), ['First', 'New source']);
    assert.deepEqual(rows(await get('/projects/2')), ['Destination existing', 'Second']);
    await post('/projects/1/restore');
    body = await get('/projects/1');
    assert.match(body, /name="destination">/);
    assert.equal((await post('/projects/1/tasks/1/move', { destination: '2' })).status, 303);
    assert.deepEqual(rows(await get('/projects/2')), ['Destination existing', 'First', 'Second']);
    assert.match(await get('/'), /1\/3 completed/);
    // Establish new positions after departed tasks, then return in reverse order.
    await post('/projects/1/rename', { name: 'Renamed source' });
    await post('/projects/1/tasks', { title: 'Later source' });
    await post('/projects/2/tasks/1/rename', { title: 'Updated first' });
    await post('/projects/2/tasks/1/due-date', { dueDate: '0001-01-01' });
    await post('/projects/2/tasks/1/priority', { priority: 'Low' });
    await stop();
    await start();
    await post('/projects/2/tasks/2/move', { destination: '1' });
    assert.deepEqual(rows(await get('/projects/1')), ['Second', 'New source', 'Later source']);
    await post('/projects/2/tasks/1/move', { destination: '1' });
    body = await get('/projects/1');
    assert.deepEqual(rows(body), ['Updated first', 'Second', 'New source', 'Later source']);
    assert.match(body, /aria-label="Complete Updated first" checked/);
    assert.match(body, /id="task-due-date-1" name="dueDate" type="text" value="0001-01-01"/);
    assert.match(body, /<option selected>Low<\/option>/);
    await post('/projects/2/tasks', { title: 'Later destination' });
    // Returning in reverse order also restores the destination's remembered order.
    await post('/projects/1/tasks/2/move', { destination: '2' });
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await stop();
    await start();
    assert.deepEqual(rows(await get('/projects/2')), ['Destination existing', 'Updated first', 'Second', 'Later destination']);
    assert.deepEqual(rows(await get('/projects/1')), ['New source', 'Later source']);
    assert.match(await get('/'), /1\/4 completed/);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
