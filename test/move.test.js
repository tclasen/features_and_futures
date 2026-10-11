import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('moves append on first arrival, restore return order, preserve data and filters, enforce active ownership, and persist', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-move-'));
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(dir, 'db.sqlite') }, stdio: ['ignore', 'pipe', 'inherit']
    });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Startup timeout')), 5000);
      child.stdout.on('data', chunk => {
        const match = /listening on port (\d+)/.exec(String(chunk));
        if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
      });
    });
  }
  async function stop() { const exited = once(child, 'exit'); child.kill(); await exited; child = null; }
  try {
    let base = await start();
    const html = async path => (await fetch(base + path)).text();
    const post = (path, values = {}) => fetch(base + path, { method: 'POST', body: new URLSearchParams(values), redirect: 'manual' });
    const rows = text => [...text.matchAll(/aria-label="Complete ([^"]+)"/g)].map(match => match[1]);
    await post('/projects', { name: 'Source' });
    await post('/projects/1/tasks', { title: 'Oldest' });
    let text = await html('/projects/1');
    assert.match(text, /name="destination" disabled>\s*<\/select>/);
    assert.match(text, /disabled>Move task/);
    await post('/projects', { name: 'Destination' });
    await post('/projects', { name: 'Third' });
    await post('/projects/2/tasks', { title: 'Destination first' });
    await post('/projects/1/tasks', { title: 'Source second' });
    await post('/projects/1/tasks/1', { completed: '1' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { due_date: '2024-02-29' });
    await post('/projects/2/default-priority', { priority: 'Low' });
    await post('/projects/2/rename', { name: 'Renamed destination' });
    text = await html('/projects/1');
    assert.match(text, /<option value="2">Renamed destination<\/option>\s*<option value="3">Third<\/option>/);
    const filters = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-02-29' };
    const response = await post('/projects/1/tasks/1/move', { ...filters, destination: '2' });
    assert.equal(response.status, 303);
    const location = response.headers.get('location');
    assert.match(location, /^\/projects\/1\?/);
    for (const [key, value] of Object.entries(filters)) assert.equal(new URL(location, base).searchParams.get(key), value);
    assert.deepEqual(rows(await html(location)), []);
    assert.deepEqual(rows(await html('/projects/1')), ['Source second']);
    text = await html('/projects/2');
    assert.deepEqual(rows(text), ['Destination first', 'Oldest']);
    assert.match(text, /aria-label="Complete Oldest" checked/);
    assert.match(text, /<option selected>High/);
    assert.match(text, /name="due_date" type="text" value="2024-02-29"/);
    assert.match(await html('/'), /1\/2 completed/);
    assert.equal((await post('/projects/1/tasks/1/move', { destination: '3' })).status, 404);
    await post('/projects/3/archive');
    assert.equal((await post('/projects/2/tasks/1/move', { destination: '3' })).status, 200);
    assert.deepEqual(rows(await html('/projects/2')), ['Destination first', 'Oldest']);
    await post('/projects/2/archive');
    text = await html('/projects/2');
    assert.match(text, /name="destination" disabled/);
    assert.match(text, /disabled>Move task/);
    assert.equal((await post('/projects/2/tasks/1/move', { destination: '1' })).status, 403);
    await post('/projects/2/restore');
    await post('/projects/2/tasks/1/move', { destination: '1' });
    await post('/projects/1/tasks', { title: 'Newest' });
    assert.deepEqual(rows(await html('/projects/1')), ['Oldest', 'Source second', 'Newest']);
    await post('/projects/2/tasks/2/move', { destination: '1' });
    await stop(); base = await start();
    text = await html('/projects/1');
    assert.deepEqual(rows(text), ['Oldest', 'Source second', 'Newest', 'Destination first']);
    assert.match(text, /aria-label="Complete Oldest" checked/);
    assert.match(text, /name="due_date" type="text" value="2024-02-29"/);
    assert.deepEqual(rows(await html('/projects/2')), []);
    assert.match(await html('/'), /1\/4 completed/);
  } finally {
    if (child) await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
