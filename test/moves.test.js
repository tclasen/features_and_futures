import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('moves append, preserve task data and filters, enforce active ownership and persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-moves-'));
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'db.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    base = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', () => reject(new Error('Server exited')));
      child.stdout.on('data', (data) => {
        const port = String(data).match(/port (\d+)/);
        if (port) resolve(`http://127.0.0.1:${port[1]}`);
      });
    });
  }
  async function stop() {
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGTERM');
    await exited;
    child = null;
  }
  const post = (path, data = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
  });
  const get = async (path) => (await fetch(base + path)).text();
  const rows = (html) => [...html.matchAll(/aria-label="Complete ([^"]+)"/g)].map((m) => m[1]);
  try {
    await start();
    await post('/projects', { name: 'Source' });
    await post('/projects/1/tasks', { title: 'Moved' });
    let html = await get('/projects/1');
    assert.match(html, /name="destination" disabled/);
    assert.match(html, /disabled>Move task/);
    await post('/projects', { name: 'Destination' });
    await post('/projects', { name: 'Third' });
    await post('/projects/2/rename', { name: 'Renamed destination' });
    await post('/projects/1/tasks', { title: 'Remaining' });
    await post('/projects/2/tasks', { title: 'Older destination task' });
    await post('/projects/2/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks/1', { completed: '1' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
    html = await get('/projects/1');
    const options = html.match(/name="destination"[^>]*>([\s\S]*?)<\/select>/)[1];
    assert.deepEqual([...options.matchAll(/<option value="(\d+)">([^<]+)<\/option>/g)].map((m) => [m[1], m[2]]),
      [['2', 'Renamed destination'], ['3', 'Third']]);
    const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-03-01' };
    let response = await post('/projects/1/tasks/1/move', { ...state, destination: '2' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1?' + new URLSearchParams(state));
    assert.deepEqual(rows(await get(response.headers.get('location'))), []);
    assert.deepEqual(rows(await get('/projects/1')), ['Remaining']);
    html = await get('/projects/2');
    assert.deepEqual(rows(html), ['Older destination task', 'Moved']);
    assert.match(html, /aria-label="Complete Moved" checked/);
    assert.match(html, /<option selected>High<\/option>/);
    assert.match(html, /name="dueDate" type="text" value="2024-02-29"/);
    assert.match(await get('/'), /project-summary">1\/2 completed/);
    await post('/projects/1/tasks', { title: 'New source task' });
    await post('/projects/2/tasks', { title: 'New destination task' });
    assert.deepEqual(rows(await get('/projects/2')), ['Older destination task', 'Moved', 'New destination task']);
    await post('/projects/3/archive');
    assert.equal((await post('/projects/2/tasks/1/move', { destination: '3' })).status, 400);
    assert.equal((await post('/projects/2/tasks/1/move', { destination: '2' })).status, 400);
    assert.equal((await post('/projects/1/tasks/1/move', { destination: '2' })).status, 404);
    await post('/projects/2/archive');
    html = await get('/projects/2');
    assert.match(html, /name="destination" disabled/);
    assert.match(html, /disabled>Move task/);
    assert.equal((await post('/projects/2/tasks/1/move', { destination: '1' })).status, 403);
    await post('/projects/2/restore');
    await stop();
    await start();
    html = await get('/projects/2');
    assert.deepEqual(rows(html), ['Older destination task', 'Moved', 'New destination task']);
    assert.match(html, /aria-label="Complete Moved" checked/);
    assert.match(html, /value="2024-02-29"/);
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(rows(await get('/projects/1')), ['Moved', 'Remaining', 'New source task']);
    await post('/projects/2/tasks/3/move', { destination: '1' });
    html = await get('/projects/1');
    assert.deepEqual(rows(html), ['Moved', 'Remaining', 'New source task', 'Older destination task']);
    assert.match(html, /id="task-due-date-3" name="dueDate" type="text" value=""/);
    await stop();
    await start();
    assert.deepEqual(rows(await get('/projects/1')), ['Moved', 'Remaining', 'New source task', 'Older destination task']);
    // Return two tasks in the opposite order to their established destination slots.
    await post('/projects/1/tasks/1/rename', { title: 'Updated moved task' });
    await post('/projects/2/rename', { name: 'Destination renamed again' });
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/1/tasks/3/move', { destination: '2' });
    assert.deepEqual(rows(await get('/projects/2')), ['Older destination task', 'Updated moved task', 'New destination task']);
    // Emptying a project must not reuse the positions reserved by absent tasks.
    await post('/projects/2/tasks/3/move', { destination: '1' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    await post('/projects/2/tasks/5/move', { destination: '1' });
    await post('/projects/2/tasks', { title: 'Created while others away' });
    await post('/projects/2/archive');
    assert.equal((await post('/projects/1/tasks/1/move', { destination: '2' })).status, 400);
    await stop();
    await start();
    await post('/projects/2/restore');
    await post('/projects/1/tasks/5/move', { destination: '2' });
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/1/tasks/3/move', { destination: '2' });
    html = await get('/projects/2');
    assert.deepEqual(rows(html), ['Older destination task', 'Updated moved task', 'New destination task', 'Created while others away']);
    assert.match(html, /aria-label="Complete Updated moved task" checked/);
    assert.match(html, /value="2024-02-29"/);
    await stop();
    await start();
    assert.deepEqual(rows(await get('/projects/2')), ['Older destination task', 'Updated moved task', 'New destination task', 'Created while others away']);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
