import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('inclusive due ranges intersect filters and survive edits without changing saved data', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-range-'));
  const child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '0', DB_PATH: join(dir, 'db.sqlite') }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Startup timeout')), 5000);
      child.stdout.on('data', chunk => {
        const match = chunk.toString().match(/listening on port (\d+)/);
        if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
      });
    });
    const post = (path, values) => fetch(url + path, { method: 'POST', body: new URLSearchParams(values), redirect: 'manual' });
    const page = path => fetch(url + path).then(r => r.text());
    const ids = html => [...html.matchAll(/id="task-due-date-(\d+)"/g)].map(m => Number(m[1]));
    await post('/projects', { name: 'Dates' });
    for (const title of ['First', 'Second', 'Third', 'Undated']) await post('/projects/1/tasks', { title });
    for (const [id, dueDate] of [[1, '2024-02-28'], [2, '2024-02-29'], [3, '2024-03-01']]) await post(`/projects/1/tasks/${id}/due-date`, { dueDate });
    let response = await post('/projects/1/due-range', { from: ' 2024-02-28 ', through: '2024-02-29' });
    let location = response.headers.get('location');
    assert.deepEqual(ids(await page(location)), [1, 2]);
    const state = { filter: 'Open', priorityFilter: 'Normal', dueFrom: '2024-02-28', dueThrough: '2024-02-29' };
    for (const [from, through, error] of [
      ['2023-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['0000-01-01', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-03-01', '2024-02-29', 'Due from must not be after Due through']
    ]) {
      response = await post('/projects/1/due-range', { ...state, from, through });
      const html = await response.text();
      assert.match(html, new RegExp(error));
      assert.deepEqual(ids(html), [1, 2]);
      assert.match(html, /<option selected>Open/);
      assert.match(html, /<option selected>Normal/);
    }
    response = await post('/projects/1/tasks/1', { ...state, completed: '1' });
    location = response.headers.get('location');
    assert.deepEqual(ids(await page(location)), [2]);
    response = await post('/projects/1/tasks/2/priority', { ...state, priority: 'High' });
    assert.deepEqual(ids(await page(response.headers.get('location'))), []);
    const high = { ...state, priorityFilter: 'High' };
    response = await post('/projects/1/tasks/2/rename', { ...high, title: 'Renamed' });
    assert.deepEqual(ids(await page(response.headers.get('location'))), [2]);
    response = await post('/projects/1/tasks/2/due-date', { ...high, dueDate: '2024-03-01' });
    assert.deepEqual(ids(await page(response.headers.get('location'))), []);
    response = await post('/projects/1/default-priority', { ...state, priority: 'Low' });
    assert.match(response.headers.get('location'), /dueFrom=2024-02-28&dueThrough=2024-02-29/);
    response = await post('/projects/1/rename', { ...state, name: 'New name' });
    assert.match(response.headers.get('location'), /dueThrough=2024-02-29/);
    response = await post('/projects/1/tasks', { ...state, title: 'New undated' });
    assert.deepEqual(ids(await page(response.headers.get('location'))), []);
    assert.match(await page('/'), /1\/5 completed/);
    for (const [from, through, expected] of [['', '2024-02-29', [1]], ['2024-03-01', '', [2, 3]], ['', '', [1, 2, 3, 4, 5]]]) {
      response = await post('/projects/1/due-range', { from, through });
      assert.deepEqual(ids(await page(response.headers.get('location'))), expected);
    }
    await post('/projects/1/archive', {});
    response = await post('/projects/1/due-range', { from: '2024-03-01', through: '2024-03-01' });
    const archived = await page(response.headers.get('location'));
    assert.deepEqual(ids(archived), [2, 3]);
    assert.match(archived, /id="task-due-date-2"[^>]* disabled/);
    assert.doesNotMatch(archived, /id="due-from"[^>]* disabled/);
    await post('/projects/1/restore', {});
    assert.deepEqual(ids(await page('/projects/1')), [1, 2, 3, 4, 5]);
    assert.match(await page('/projects/1'), /id="due-from"[^>]*value=""/);
  } finally {
    const exited = once(child, 'exit'); child.kill(); await exited;
    await rm(dir, { recursive: true, force: true });
  }
});
