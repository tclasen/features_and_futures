import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('inclusive ranges intersect filters and survive edits without changing data', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-range-'));
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: join(dir, 'db.sqlite') },
    stdio: ['ignore', 'pipe', 'inherit']
  });
  try {
    const port = await new Promise(resolve => child.stdout.on('data', chunk => {
      const match = /port (\d+)/.exec(String(chunk));
      if (match) resolve(match[1]);
    }));
    const base = `http://127.0.0.1:${port}`;
    const get = async path => (await fetch(base + path)).text();
    const post = (path, values = {}) => fetch(base + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
    });
    const rows = html => [...html.matchAll(/data-testid="task-row">\s*<span>(.*?)<\/span>/g)].map(m => m[1]);
    await post('/projects', { name: 'Range' });
    for (const title of ['Before', 'Start', 'End', 'After', 'Undated']) await post('/projects/1/tasks', { title });
    for (const [id, dueDate] of [[1, '2024-02-28'], [2, '2024-02-29'], [3, '2024-03-01'], [4, '2024-03-02']]) {
      await post(`/projects/1/tasks/${id}/due-date`, { dueDate });
    }
    const state = { filter: 'All', priorityFilter: 'All', dueFrom: '2024-02-29', dueThrough: '2024-03-01' };
    const applied = await post('/projects/1/due-range', { from: ' 2024-02-29 ', through: '2024-03-01' });
    const location = applied.headers.get('location');
    assert.deepEqual(rows(await get(location)), ['Start', 'End']);
    for (const [from, through, message] of [
      ['1900-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['0000-01-01', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-03-02', '2024-02-29', 'Due from must not be after Due through']
    ]) {
      const response = await post('/projects/1/due-range', { ...state, from, through });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.ok(html.includes(message));
      assert.deepEqual(rows(html), ['Start', 'End']);
    }
    await post('/projects/1/tasks/2/priority', { ...state, priority: 'High' });
    assert.deepEqual(rows(await get(location + '&priorityFilter=High')), ['Start']);
    const completed = await post('/projects/1/tasks/2', { ...state, filter: 'Open', priorityFilter: 'High', completed: '1' });
    assert.deepEqual(rows(await get(completed.headers.get('location'))), []);
    const renamed = await post('/projects/1/tasks/2/rename', { ...state, title: 'Renamed' });
    assert.deepEqual(rows(await get(renamed.headers.get('location'))), ['Renamed', 'End']);
    const moved = await post('/projects/1/tasks/3/due-date', { ...state, dueDate: '' });
    assert.deepEqual(rows(await get(moved.headers.get('location'))), ['Renamed']);
    for (const [path, values] of [['rename', { name: 'New name' }], ['default-priority', { priority: 'Low' }], ['tasks', { title: 'New task' }]]) {
      const response = await post(`/projects/1/${path}`, { ...state, ...values });
      assert.deepEqual(rows(await get(response.headers.get('location'))), ['Renamed']);
    }
    assert.match(await get('/'), /1\/6 completed/);
    await post('/projects/1/archive');
    const archived = await post('/projects/1/due-range', { from: '', through: '2024-02-29' });
    assert.equal(archived.status, 303);
    assert.deepEqual(rows(await get(archived.headers.get('location'))), ['Before', 'Renamed']);
    const cleared = await post('/projects/1/due-range', { ...state, from: ' ', through: '' });
    assert.equal(rows(await get(cleared.headers.get('location'))).length, 6);
    assert.equal(rows(await get('/projects/1')).length, 6);
    const lowerOnly = await post('/projects/1/due-range', { from: '2024-03-02', through: '' });
    assert.deepEqual(rows(await get(lowerOnly.headers.get('location'))), ['After']);
  } finally {
    await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
    await rm(dir, { recursive: true, force: true });
  }
});
