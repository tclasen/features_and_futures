import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('task moves append, preserve data and filters, reject archived projects, and persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-moves-'));
  const databasePath = join(directory, 'workboard.sqlite');
  // Start with the original schema to verify migration preserves legacy order.
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Source');
    INSERT INTO tasks (project_id, title) VALUES (1, 'First'), (1, 'Remaining');`);
  legacy.close();
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: databasePath }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Startup timeout')), 5000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    base = `http://127.0.0.1:${port}`;
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  const get = async path => (await fetch(base + path)).text();
  const post = (path, fields = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
  });
  const titles = body => [...body.matchAll(/<span>([^<]*)<\/span>/g)].map(match => match[1]);
  const options = body => [...body.matchAll(/name="destination"[^>]*>([\s\S]*?)<\/select>/g)].map(match => match[1].trim());
  try {
    await start();
    const initial = await get('/projects/1');
    assert.deepEqual(titles(initial), ['First', 'Remaining']);
    assert.match(initial, /name="destination" disabled/);
    assert.match(initial, /disabled>Move task/);
    assert.deepEqual(options(initial), ['', '']);
    await post('/projects', { name: 'Destination' });
    await post('/projects', { name: 'Third' });
    await post('/projects/3/archive');
    await post('/projects/2/tasks', { title: 'Existing destination task' });
    await post('/projects/2/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '0001-01-01' });
    await post('/projects/1/tasks/1', { completed: '1' });
    await post('/projects/2/rename', { name: 'Renamed destination' });
    assert.deepEqual(options(await get('/projects/1')), [
      '<option value="2">Renamed destination</option>', '<option value="2">Renamed destination</option>',
    ]);
    const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '0001-01-01', dueThrough: '9999-12-31' };
    for (const destination of ['1', '3', '999', '', '2.5']) {
      assert.equal((await post('/projects/1/tasks/1/move', { ...state, destination })).status, 400);
    }
    assert.equal((await post('/projects/2/tasks/1/move', { destination: '1' })).status, 404);
    const moved = await post('/projects/1/tasks/1/move', { ...state, destination: '2' });
    assert.equal(moved.status, 303);
    assert.equal(moved.headers.get('location'), '/projects/1?filter=Completed&priorityFilter=High&dueFrom=0001-01-01&dueThrough=9999-12-31');
    assert.deepEqual(titles(await get(moved.headers.get('location'))), []);
    assert.deepEqual(titles(await get('/projects/1')), ['Remaining']);
    let destination = await get('/projects/2');
    assert.deepEqual(titles(destination), ['Existing destination task', 'First']);
    assert.match(destination, /aria-label="Complete First" checked/);
    assert.match(destination, /<option selected>High<\/option>/);
    assert.match(destination, /name="dueDate" type="text" value="0001-01-01"/);
    assert.match(await get('/'), /project-summary">0\/1 completed/);
    assert.match(await get('/'), /project-summary">1\/2 completed/);
    await stop();
    await start();
    assert.equal(await get('/projects/2'), destination);
    await post('/projects/2/archive');
    const archived = await get('/projects/2');
    assert.equal((archived.match(/name="destination" disabled/g) || []).length, 2);
    assert.equal((archived.match(/disabled>Move task/g) || []).length, 2);
    assert.equal((await post('/projects/2/tasks/1/move', { destination: '1' })).status, 403);
    assert.equal((await post('/projects/1/tasks/2/move', { destination: '2' })).status, 400);
    await post('/projects/2/restore');
    assert.equal(await get('/projects/2'), destination);
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(titles(await get('/projects/1')), ['Remaining', 'First']);
    await post('/projects/1/tasks', { title: 'Created after move' });
    assert.deepEqual(titles(await get('/projects/1')), ['Remaining', 'First', 'Created after move']);
    await post('/projects/1/tasks/2/move', { destination: '2' });
    destination = await get('/projects/2');
    assert.deepEqual(titles(destination), ['Existing destination task', 'Remaining']);
    assert.equal((destination.match(/name="dueDate" type="text" value=""/g) || []).length, 2);
    await post('/projects/3/restore');
    const destinationOptions = options(await get('/projects/1'));
    assert.ok(destinationOptions.every(value => value === '<option value="2">Renamed destination</option><option value="3">Third</option>'));
    const final = await get('/projects/1');
    await stop();
    await start();
    assert.equal(await get('/projects/1'), final);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
