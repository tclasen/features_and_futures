import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('moves remember project order, preserve data and filters, validate ownership, and persist after restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-move-'));
  const dbPath = join(directory, 'db.sqlite');
  // Exercise migration of old task order as well as new-task insertion after moves.
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Source');
    INSERT INTO tasks (project_id, title) VALUES (1, 'Old first'), (1, 'Old second');`);
  db.close();
  let child;
  let base;
  const start = async () => {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    base = await new Promise((resolve, reject) => {
      child.stdout.on('data', data => {
        const match = String(data).match(/port (\d+)/);
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
      child.once('error', reject);
      child.once('exit', code => reject(new Error(`Exited ${code}`)));
    });
  };
  const stop = async () => {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = null;
  };
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const html = path => fetch(base + path).then(r => r.text());
  const ids = text => [...text.matchAll(/class="completion-form"[^>]*tasks\/(\d+)\/completion/g)].map(m => Number(m[1]));
  try {
    await start();
    assert.deepEqual(ids(await html('/projects/1')), [1, 2]);
    let text = await html('/projects/1');
    assert.match(text, /name="destination" disabled>\s*<\/select>/);
    assert.match(text, /disabled>Move task/);
    for (const name of ['Destination', 'Third', 'Archived']) await post('/projects', { name });
    await post('/projects/4/archive');
    await post('/projects/3/rename', { name: 'Third renamed' });
    text = await html('/projects/1');
    const options = text.match(/name="destination">([\s\S]*?)<\/select>/)[1];
    assert.deepEqual([...options.matchAll(/<option value="(\d+)">([^<]*)<\/option>/g)].map(m => [m[1], m[2]]),
      [['2', 'Destination'], ['3', 'Third renamed']]);
    await post('/projects/2/tasks', { title: 'Destination first' });
    await post('/projects/2/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks/1/completion', { completed: '1' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
    const filters = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-01', dueThrough: '2024-03-01' };
    for (const destination of ['1', '4', '999', '', 'nope']) {
      assert.equal((await post('/projects/1/tasks/1/move', { ...filters, destination })).status, 400);
      assert.deepEqual(ids(await html('/projects/1')), [1, 2]);
    }
    assert.equal((await post('/projects/3/tasks/1/move', { destination: '2' })).status, 404);
    const response = await post('/projects/1/tasks/1/move', { ...filters, destination: '2' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1?filter=Completed&priorityFilter=High&dueFrom=2024-02-01&dueThrough=2024-03-01');
    assert.deepEqual(ids(await html(response.headers.get('location'))), []);
    assert.deepEqual(ids(await html('/projects/1')), [2]);
    assert.deepEqual(ids(await html('/projects/2')), [3, 1]);
    await post('/projects/2/tasks', { title: 'New after move' });
    assert.deepEqual(ids(await html('/projects/2')), [3, 1, 4]);
    text = await html('/');
    assert.match(text, /0\/1 completed/);
    assert.match(text, /1\/3 completed/);
    await post('/projects/2/archive');
    text = await html('/projects/2');
    assert.match(text, /name="destination" disabled>/);
    assert.match(text, /disabled>Move task/);
    assert.equal((await post('/projects/2/tasks/1/move', { destination: '1' })).status, 403);
    await stop();
    await start();
    assert.deepEqual(ids(await html('/projects/2')), [3, 1, 4]);
    await post('/projects/2/restore');
    text = await html('/projects/2');
    const movedRow = text.split('<li data-testid="task-row">')[2];
    assert.match(movedRow, /aria-label="Complete Old first" checked/);
    assert.match(movedRow, /<option selected>High<\/option>/);
    assert.match(movedRow, /name="dueDate" type="text" value="2024-02-29"/);
    assert.match(movedRow, /name="destination">/);
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(ids(await html('/projects/1')), [1, 2]);
    await post('/projects/1/tasks/2/move', { destination: '3' });
    assert.match(await html('/projects/3'), /name="dueDate" type="text" value=""/);
    await stop();
    await start();
    assert.deepEqual(ids(await html('/projects/1')), [1]);
    assert.deepEqual(ids(await html('/projects/2')), [3, 4]);
    assert.deepEqual(ids(await html('/projects/3')), [2]);

    // Both original source positions remain reserved while their tasks are away.
    await post('/projects/1/tasks/1/move', { destination: '2' });
    assert.deepEqual(ids(await html('/projects/2')), [3, 1, 4]);
    await post('/projects/1/tasks', { title: 'Created while originals away' });
    await post('/projects/3/tasks/2/rename', { title: 'Updated second' });
    await post('/projects/3/tasks/2/priority', { priority: 'Low' });
    await post('/projects/3/tasks/2/due-date', { dueDate: '0001-01-01' });
    await post('/projects/1/rename', { name: 'Renamed source' });
    await post('/projects/1/archive');
    assert.equal((await post('/projects/3/tasks/2/move', { destination: '1' })).status, 400);
    await stop();
    await start();
    await post('/projects/1/restore');
    // Return in reverse order, across restarts, without restoring stale field data.
    await post('/projects/3/tasks/2/move', { destination: '1' });
    assert.deepEqual(ids(await html('/projects/1')), [2, 5]);
    await stop();
    await start();
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(ids(await html('/projects/1')), [1, 2, 5]);
    text = await html('/projects/1');
    assert.match(text, /<h1>Renamed source<\/h1>/);
    assert.match(text, /aria-label="Complete Updated second"/);
    assert.match(text, /<option selected>Low<\/option>/);
    assert.match(text, /name="dueDate" type="text" value="0001-01-01"/);
    assert.match(text, /aria-label="Complete Old first" checked/);
    assert.match(await html('/'), /1\/3 completed/);
    await stop();
    await start();
    assert.deepEqual(ids(await html('/projects/1')), [1, 2, 5]);
    assert.deepEqual(ids(await html('/projects/2')), [3, 4]);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
