import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('moves append, preserve task data and source filters, and enforce active ownership', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-move-'));
  const base = 'http://127.0.0.1:18084';
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '18084', DB_PATH: join(dir, 'db.sqlite') }, stdio: 'ignore' });
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error('Server exited');
      try { if ((await fetch(base + '/health')).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error('Server not ready');
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  const post = (path, values = {}) => fetch(base + path, { method: 'POST', body: new URLSearchParams(values), redirect: 'manual' });
  const get = async path => (await fetch(base + path)).text();
  const ids = html => [...html.matchAll(/class="task-title" for="task-(\d+)"/g)].map(match => Number(match[1]));
  const move = (source, task, destination, state = {}) => post(`/projects/${source}/tasks/${task}/move`, { ...state, destination });
  try {
    await start();
    await post('/projects', { name: 'Source' });
    await post('/projects/1/tasks', { title: 'First' });
    assert.match(await get('/projects/1'), /id="destination-project-1"[^>]* disabled>\s*<\/select>/);
    assert.match(await get('/projects/1'), /disabled>Move task/);
    await post('/projects', { name: 'Destination' });
    await post('/projects', { name: 'Archived destination' });
    await post('/projects', { name: 'Last destination' });
    await post('/projects/3/archive');
    await post('/projects/2/rename', { name: 'Renamed destination' });
    let html = await get('/projects/1');
    assert.match(html, /id="destination-project-1"[^>]*>\s*<option value="2">Renamed destination<\/option><option value="4">Last destination<\/option>\s*<\/select>/);
    await post('/projects/1/tasks', { title: 'Second' });
    await post('/projects/2/tasks', { title: 'Existing' });
    await post('/projects/2/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '0001-01-01' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '0001-01-01', dueThrough: '9999-12-31' };
    const response = await move(1, 1, 2, state);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1?' + new URLSearchParams(state));
    assert.deepEqual(ids(await get(response.headers.get('location'))), []);
    assert.deepEqual(ids(await get('/projects/1')), [2]);
    html = await get('/projects/2');
    assert.deepEqual(ids(html), [3, 1]);
    assert.match(html, /aria-label="Complete First" checked/);
    assert.match(html, /id="task-priority-1"[\s\S]*?<option selected>High/);
    assert.match(html, /id="task-due-date-1"[^>]*value="0001-01-01"/);
    assert.match(await get('/'), /0\/1 completed/);
    assert.match(await get('/'), /1\/2 completed/);
    assert.equal((await move(1, 1, 4)).status, 404);
    for (const destination of ['2', '3', '999', 'invalid']) assert.equal((await move(2, 1, destination)).status, 422);
    await post('/projects/2/archive');
    assert.equal((await move(2, 1, 1)).status, 403);
    html = await get('/projects/2');
    assert.match(html, /id="destination-project-1"[^>]* disabled/);
    assert.match(html, /disabled>Move task/);
    await post('/projects/2/restore');
    await move(2, 1, 1);
    assert.deepEqual(ids(await get('/projects/1')), [1, 2]);
    await move(1, 2, 2); // Move an undated task; preserve its blank date.
    await post('/projects/2/tasks', { title: 'New last' });
    assert.deepEqual(ids(await get('/projects/2')), [3, 2, 4]);
    assert.match(await get('/projects/2'), /id="task-due-date-2"[^>]*value=""/);
    await stop();
    await start();
    assert.deepEqual(ids(await get('/projects/1')), [1]);
    assert.deepEqual(ids(await get('/projects/2')), [3, 2, 4]);
    assert.match(await get('/projects/1'), /id="task-due-date-1"[^>]*value="0001-01-01"/);
    await move(1, 1, 2);
    assert.deepEqual(ids(await get('/projects/2')), [3, 1, 2, 4]);
  } finally {
    await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
