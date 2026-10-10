import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('moves append tasks, preserve data and filters, and enforce active ownership', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-move-'));
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'db.sqlite') },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const port = await new Promise((resolve, reject) => {
      let output = '';
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) resolve(match[1]);
      });
      child.once('error', reject);
      child.once('exit', code => reject(new Error(`Server exited: ${code}`)));
    });
    base = `http://127.0.0.1:${port}`;
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }
  const get = async path => (await fetch(base + path)).text();
  const post = (path, data = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
  });
  const rows = html => [...html.matchAll(/aria-label="Complete ([^"]*)"/g)].map(match => match[1]);
  const destinations = html => html.match(/id="destination-project-\d+"[^>]*>([\s\S]*?)<\/select>/)?.[1].trim();
  try {
    await start();
    await post('/projects', { name: 'Source' });
    await post('/projects/1/tasks', { title: 'Moved' });
    let html = await get('/projects/1');
    assert.match(html, /id="destination-project-1"[^>]* disabled/);
    assert.match(html, /<button type="submit" disabled>Move task/);
    assert.equal(destinations(html), '');
    await post('/projects', { name: 'Destination' });
    await post('/projects', { name: 'Other' });
    await post('/projects', { name: 'Archived' });
    await post('/projects/4/archive');
    await post('/projects/2/rename', { name: 'Renamed & destination' });
    html = await get('/projects/1');
    assert.equal(destinations(html), '<option value="2">Renamed &amp; destination</option><option value="3">Other</option>');
    await post('/projects/1/tasks/1', { completed: '1' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
    await post('/projects/1/tasks', { title: 'Remaining' });
    await post('/projects/2/default-priority', { priority: 'Low' });
    await post('/projects/2/tasks', { title: 'Existing' });
    const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-01-01', dueThrough: '2024-12-31' };
    for (const destination of ['1', '4', '999', 'bad', '']) {
      assert.equal((await post('/projects/1/tasks/1/move', { ...state, destination })).status, 400);
    }
    const result = await post('/projects/1/tasks/1/move', { ...state, destination: '2' });
    assert.equal(result.status, 303);
    const location = result.headers.get('location');
    assert.equal(location, '/projects/1?filter=Completed&priorityFilter=High&dueFrom=2024-01-01&dueThrough=2024-12-31');
    assert.deepEqual(rows(await get(location)), []);
    assert.deepEqual(rows(await get('/projects/1')), ['Remaining']);
    html = await get('/projects/2');
    assert.deepEqual(rows(html), ['Existing', 'Moved']);
    assert.match(html, /aria-label="Complete Moved" checked/);
    assert.match(html, /id="task-priority-1"[\s\S]*?<option selected>High/);
    assert.match(html, /id="task-due-date-1"[^>]*value="2024-02-29"/);
    assert.match(await get('/'), /0\/1 completed[\s\S]*1\/2 completed/);
    assert.equal((await post('/projects/1/tasks/1/move', { destination: '3' })).status, 404);
    await post('/projects/2/tasks', { title: 'Created after move' });
    assert.deepEqual(rows(await get('/projects/2')), ['Existing', 'Moved', 'Created after move']);
    await post('/projects/2/archive');
    html = await get('/projects/2');
    assert.match(html, /id="destination-project-1"[^>]* disabled/);
    assert.equal((await post('/projects/2/tasks/1/move', { destination: '3' })).status, 403);
    await post('/projects/2/restore');
    assert.doesNotMatch(await get('/projects/2'), /id="destination-project-1"[^>]* disabled/);
    await stop();
    await start();
    assert.deepEqual(rows(await get('/projects/2')), ['Existing', 'Moved', 'Created after move']);
    assert.match(await get('/projects/2'), /id="task-due-date-1"[^>]*value="2024-02-29"/);
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(rows(await get('/projects/1')), ['Remaining', 'Moved']);
    await post('/projects/1/tasks/2/move', { destination: '2' });
    html = await get('/projects/2');
    assert.deepEqual(rows(html), ['Existing', 'Created after move', 'Remaining']);
    assert.match(html, /id="task-due-date-2"[^>]*value=""/);
    assert.match(await get('/'), /1\/1 completed[\s\S]*0\/3 completed/);
    await stop();
    await start();
    assert.deepEqual(rows(await get('/projects/1')), ['Moved']);
    assert.deepEqual(rows(await get('/projects/2')), ['Existing', 'Created after move', 'Remaining']);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
