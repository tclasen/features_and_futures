import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('inclusive due ranges intersect filters and survive edits without changing saved data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-range-'));
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
  const apply = data => post('/projects/1/due-range', data);
  try {
    await start();
    await post('/projects', { name: 'Dates' });
    for (const title of ['Undated', 'Early', 'Middle', 'Late']) {
      await post('/projects/1/tasks', { title });
    }
    for (const [id, date] of [[2, '0001-01-01'], [3, '2024-02-29'], [4, '9999-12-31']]) {
      await post(`/projects/1/tasks/${id}/due-date`, { dueDate: date });
    }
    await post('/projects/1/tasks/3/priority', { priority: 'High' });
    await post('/projects/1/tasks/3', { completed: '1' });
    const summary = await get('/');
    const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-02-29' };
    const response = await apply({ ...state, rangeFrom: ' 2024-02-29 ', rangeThrough: ' 2024-02-29 ' });
    const path = response.headers.get('location');
    assert.equal(response.status, 303);
    assert.deepEqual(rows(await get(path)), ['Middle']);
    assert.match(await get(path), /id="due-from"[^>]*value="2024-02-29"/);
    assert.deepEqual(rows(await get('/projects/1?dueFrom=2024-02-29')), ['Middle', 'Late']);
    assert.deepEqual(rows(await get('/projects/1?dueThrough=2024-02-29')), ['Early', 'Middle']);
    assert.deepEqual(rows(await get('/projects/1?dueFrom=0001-01-01&dueThrough=9999-12-31')), ['Early', 'Middle', 'Late']);
    assert.deepEqual(rows(await get('/projects/1')), ['Undated', 'Early', 'Middle', 'Late']);
    for (const bad of ['0000-01-01', '1900-02-29', '2024-02-30', '2024-2-29', '10000-01-01', 'garbage']) {
      const html = await (await apply({ ...state, rangeFrom: bad, rangeThrough: '' })).text();
      assert.match(html, /role="alert">Due range must use valid YYYY-MM-DD dates/);
      assert.deepEqual(rows(html), ['Middle']);
      assert.match(html, /name="dueFrom" value="2024-02-29"/);
    }
    const invalidOrder = await (await apply({ ...state, rangeFrom: '2025-01-01', rangeThrough: '2024-01-01' })).text();
    assert.match(invalidOrder, /Due from must not be after Due through/);
    assert.deepEqual(rows(invalidOrder), ['Middle']);
    for (const [action, data] of [
      ['/rename', { name: 'Renamed project' }],
      ['/default-priority', { priority: 'Low' }],
      ['/tasks', { title: 'New undated' }],
      ['/tasks/3/rename', { title: 'Renamed task' }],
    ]) {
      const result = await post('/projects/1' + action, { ...state, ...data });
      assert.equal(result.headers.get('location'), path);
    }
    assert.deepEqual(rows(await get(path)), ['Renamed task']);
    let result = await post('/projects/1/tasks/3/due-date', { ...state, dueDate: '2024-03-01' });
    assert.equal(result.headers.get('location'), path);
    assert.deepEqual(rows(await get(path)), []);
    await post('/projects/1/tasks/3/due-date', { ...state, dueDate: '2024-02-29' });
    await post('/projects/1/tasks/3/priority', { ...state, priority: 'Low' });
    assert.deepEqual(rows(await get(path)), []);
    await post('/projects/1/tasks/3/priority', { ...state, priority: 'High' });
    await post('/projects/1/tasks/3', state);
    assert.deepEqual(rows(await get(path)), []);
    await post('/projects/1/tasks/3', { ...state, completed: '1' });
    assert.deepEqual(rows(await get(path)), ['Renamed task']);
    await post('/projects/1/archive');
    const archived = await get(path);
    assert.match(archived, /Archived project/);
    assert.doesNotMatch(archived, /id="due-(from|through)"[^>]*disabled/);
    assert.match(archived, /id="task-due-date-3"[^>]*disabled/);
    result = await apply({ ...state, rangeFrom: '', rangeThrough: '' });
    assert.equal(result.status, 303);
    assert.deepEqual(rows(await get(result.headers.get('location'))), ['Renamed task']);
    await post('/projects/1/restore');
    const beforeRestart = await get(path);
    await stop();
    await start();
    assert.equal(await get(path), beforeRestart);
    assert.deepEqual(rows(await get('/projects/1')), ['Undated', 'Early', 'Renamed task', 'Late', 'New undated']);
    assert.match(await get('/'), /1\/5 completed/);
    assert.match(summary, /1\/4 completed/);
    const cleared = await apply({ ...state, rangeFrom: '  ', rangeThrough: ' ' });
    assert.equal(cleared.headers.get('location'), '/projects/1?filter=Completed&priorityFilter=High');
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
