import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('inclusive due ranges intersect filters and survive edits without changing task data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-range-'));
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'db.sqlite') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    const base = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', () => reject(new Error('Server exited')));
      child.stdout.on('data', (data) => {
        const port = String(data).match(/port (\d+)/);
        if (port) resolve(`http://127.0.0.1:${port[1]}`);
      });
    });
    const post = (path, data = {}) => fetch(base + path, {
      method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
    });
    const get = async (path) => (await fetch(base + path)).text();
    const rows = (html) => [...html.matchAll(/aria-label="Complete ([^"]+)"/g)].map((m) => m[1]);
    await post('/projects', { name: 'Dates' });
    for (const title of ['Before', 'First', 'Last', 'After', 'Undated']) {
      await post('/projects/1/tasks', { title });
    }
    for (const [id, dueDate] of [[1, '2024-02-28'], [2, '2024-02-29'], [3, '2024-03-01'], [4, '2024-03-02']]) {
      await post(`/projects/1/tasks/${id}/due-date`, { dueDate });
    }
    const state = { filter: 'All', priorityFilter: 'All', dueFrom: '2024-02-29', dueThrough: '2024-03-01' };
    const apply = (rangeFrom, rangeThrough, previous = state) => post('/projects/1/due-range', { ...previous, rangeFrom, rangeThrough });
    let response = await apply(' 2024-02-29 ', ' 2024-03-01 ');
    const location = response.headers.get('location');
    assert.equal(response.status, 303);
    assert.deepEqual(rows(await get(location)), ['First', 'Last']);
    assert.deepEqual(rows(await get('/projects/1?dueFrom=2024-03-01')), ['Last', 'After']);
    assert.deepEqual(rows(await get('/projects/1?dueThrough=2024-02-29')), ['Before', 'First']);
    for (const invalid of ['0000-01-01', '1900-02-29', '2024-04-31', '2024-2-29', '10000-01-01', 'bad']) {
      response = await apply(invalid, '');
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /Due range must use valid YYYY-MM-DD dates/);
      assert.deepEqual(rows(html), ['First', 'Last']);
    }
    response = await apply('2024-03-02', '2024-02-29');
    assert.match(await response.text(), /Due from must not be after Due through/);
    await post('/projects/1/tasks/2', { ...state, completed: '1' });
    await post('/projects/1/tasks/2/priority', { ...state, priority: 'High' });
    const selected = { ...state, filter: 'Completed', priorityFilter: 'High' };
    const selectedLocation = '/projects/1?' + new URLSearchParams(selected);
    assert.deepEqual(rows(await get(selectedLocation)), ['First']);
    response = await post('/projects/1/tasks/2/rename', { ...selected, title: 'Renamed' });
    assert.equal(response.headers.get('location'), selectedLocation);
    assert.deepEqual(rows(await get(selectedLocation)), ['Renamed']);
    response = await post('/projects/1/tasks/2/due-date', { ...selected, dueDate: '2024-03-02' });
    assert.deepEqual(rows(await get(response.headers.get('location'))), []);
    await post('/projects/1/tasks/2/due-date', { ...selected, dueDate: '2024-02-29' });
    for (const [endpoint, data] of [['rename', { name: 'New name' }], ['default-priority', { priority: 'High' }], ['tasks', { title: 'New task' }]]) {
      response = await post(`/projects/1/${endpoint}`, { ...selected, ...data });
      assert.equal(response.headers.get('location'), selectedLocation);
      assert.deepEqual(rows(await get(selectedLocation)), ['Renamed']);
    }
    assert.match(await get('/'), /project-summary">1\/6 completed/);
    await post('/projects/1/archive');
    response = await apply('2024-02-29', '2024-02-29', selected);
    assert.equal(response.status, 303);
    const archived = await get(response.headers.get('location'));
    assert.deepEqual(rows(archived), ['Renamed']);
    assert.match(archived, /id="due-from"[^>]*value="2024-02-29">/);
    assert.match(archived, /aria-label="Complete Renamed" checked disabled/);
    await post('/projects/1/restore');
    assert.deepEqual(rows(await get(selectedLocation)), ['Renamed']);
    response = await apply(' ', ' ', selected);
    assert.deepEqual(rows(await get(response.headers.get('location'))), ['Renamed']);
    const reopened = await get('/projects/1');
    assert.match(reopened, /id="due-from"[^>]*value="">/);
    assert.match(reopened, /id="due-through"[^>]*value="">/);
    assert.equal(rows(reopened).length, 6);
  } finally {
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGTERM');
    await exited;
    await rm(directory, { recursive: true, force: true });
  }
});
