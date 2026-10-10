import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('moves append, preserve data and filters, reject archived projects, and persist', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-move-'));
  let child;
  let base;
  const start = async () => {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(dir, 'db.sqlite') },
      stdio: ['ignore', 'pipe', 'inherit']
    });
    const port = await new Promise(resolve => child.stdout.on('data', chunk => {
      const match = /port (\d+)/.exec(String(chunk));
      if (match) resolve(match[1]);
    }));
    base = `http://127.0.0.1:${port}`;
  };
  const stop = () => new Promise(resolve => { child.once('exit', resolve); child.kill(); });
  const get = async path => (await fetch(base + path)).text();
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
  });
  const rows = html => [...html.matchAll(/data-testid="task-row">\s*<span>(.*?)<\/span>/g)].map(m => m[1]);
  try {
    await start();
    for (const name of ['Source', 'Destination', 'Archived']) await post('/projects', { name });
    await post('/projects/3/archive');
    await post('/projects/1/tasks', { title: 'Moving' });
    await post('/projects/1/tasks', { title: 'Remaining' });
    await post('/projects/2/tasks', { title: 'Existing' });
    await post('/projects/1/tasks/1', { completed: '1' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
    await post('/projects/2/default-priority', { priority: 'Low' });
    const html = await get('/projects/1');
    const destinations = [...html.matchAll(/<select id="destination-project-\d+"[^>]*>([\s\S]*?)<\/select>/g)];
    assert.equal(destinations.length, 2);
    for (const [, options] of destinations) assert.equal(options.trim(), '<option value="2">Destination</option>');
    const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-01', dueThrough: '2024-03-01' };
    const moved = await post('/projects/1/tasks/1/move', { ...state, destination: '2' });
    assert.equal(moved.status, 303);
    const location = moved.headers.get('location');
    const params = new URL(location, base).searchParams;
    for (const [key, value] of Object.entries(state)) assert.equal(params.get(key), value);
    assert.deepEqual(rows(await get(location)), []);
    assert.deepEqual(rows(await get('/projects/1')), ['Remaining']);
    assert.deepEqual(rows(await get('/projects/2')), ['Existing', 'Moving']);
    assert.match(await get('/'), /1\/2 completed/);
    await post('/projects/2/tasks', { title: 'Later' });
    await stop();
    await start();
    const restored = await get('/projects/2');
    assert.deepEqual(rows(restored), ['Existing', 'Moving', 'Later']);
    assert.match(restored, /aria-label="Complete Moving" checked/);
    assert.match(restored, /<option selected>High<\/option>/);
    assert.match(restored, /value="2024-02-29"/);
    assert.equal((await post('/projects/2/tasks/1/move', { destination: '3' })).status, 403);
    assert.equal((await post('/projects/2/tasks/1/move', { destination: '2' })).status, 400);
    await post('/projects/2/archive');
    assert.equal((await post('/projects/2/tasks/1/move', { destination: '1' })).status, 403);
    assert.match(await get('/projects/2'), /name="destination" disabled/);
    await post('/projects/2/restore');
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(rows(await get('/projects/1')), ['Remaining', 'Moving']);
    await post('/projects/1/tasks/1/due-date', { dueDate: '' });
    await post('/projects/1/tasks/1/move', { destination: '2' });
    assert.deepEqual(rows(await get('/projects/2')), ['Existing', 'Later', 'Moving']);
    await post('/projects/1/archive');
    const noDestination = await get('/projects/2');
    assert.match(noDestination, /name="destination" disabled>\s*<\/select>/);
    assert.match(noDestination, /<button type="submit" disabled>Move task<\/button>/);
  } finally {
    if (child && child.exitCode === null) await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
