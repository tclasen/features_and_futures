import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('inclusive due ranges intersect filters and survive edits and validation errors', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-range-'));
  const base = 'http://127.0.0.1:18083';
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '18083', DB_PATH: join(dir, 'db.sqlite') }, stdio: 'ignore' });
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
  const state = { filter: 'All', priorityFilter: 'All', dueFrom: '2024-02-29', dueThrough: '2024-03-01' };
  const query = values => '/projects/1?' + new URLSearchParams(values);
  const apply = (from, through, previous = state) => post('/projects/1/due-range', { ...previous, newDueFrom: from, newDueThrough: through });
  try {
    await start();
    await post('/projects', { name: 'Dates' });
    for (const title of ['Early', 'Leap', 'End', 'Late', 'Undated']) await post('/projects/1/tasks', { title });
    for (const [id, dueDate] of [[1, '2024-02-28'], [2, '2024-02-29'], [3, '2024-03-01'], [4, '2024-03-02']]) {
      await post(`/projects/1/tasks/${id}/due-date`, { dueDate });
    }
    assert.deepEqual(ids(await get('/projects/1')), [1, 2, 3, 4, 5]);
    const response = await apply(' 2024-02-29 ', ' 2024-03-01 ');
    assert.equal(response.status, 303);
    assert.deepEqual(ids(await get(response.headers.get('location'))), [2, 3]);
    assert.deepEqual(ids(await get(query({ ...state, dueThrough: '' }))), [2, 3, 4]);
    assert.deepEqual(ids(await get(query({ ...state, dueFrom: '' }))), [1, 2, 3]);
    for (const [from, through, error] of [
      ['1900-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['', '0000-01-01', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-3-01', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-03-02', '2024-03-01', 'Due from must not be after Due through']
    ]) {
      const invalid = await apply(from, through);
      assert.equal(invalid.status, 422);
      const html = await invalid.text();
      assert.ok(html.includes(`role="alert">${error}`));
      assert.deepEqual(ids(html), [2, 3]);
      assert.match(html, /name="dueFrom" value="2024-02-29"/);
    }
    await post('/projects/1/tasks/2/priority', { ...state, priority: 'High' });
    await post('/projects/1/tasks/2', { ...state, completed: '1' });
    const combined = { ...state, filter: 'Completed', priorityFilter: 'High' };
    assert.deepEqual(ids(await get(query(combined))), [2]);
    const renamed = await post('/projects/1/tasks/2/rename', { ...combined, title: 'Renamed leap' });
    assert.deepEqual(ids(await get(renamed.headers.get('location'))), [2]);
    assert.ok(renamed.headers.get('location').includes('dueFrom=2024-02-29'));
    const moved = await post('/projects/1/tasks/2/due-date', { ...combined, dueDate: '2024-03-02' });
    assert.deepEqual(ids(await get(moved.headers.get('location'))), []);
    for (const [path, values] of [
      ['/projects/1/rename', { name: 'Renamed project' }],
      ['/projects/1/default-priority', { priority: 'High' }],
      ['/projects/1/tasks', { title: 'New undated' }]
    ]) {
      const edit = await post(path, { ...combined, ...values });
      assert.equal(edit.headers.get('location'), query(combined));
      assert.deepEqual(ids(await get(edit.headers.get('location'))), []);
    }
    assert.match(await get('/'), /1\/6 completed/);
    await post('/projects/1/archive');
    const archivedRange = await apply('2024-03-01', '2024-03-02');
    const archived = await get(archivedRange.headers.get('location'));
    assert.deepEqual(ids(archived), [2, 3, 4]);
    assert.match(archived, /id="task-due-date-2"[^>]* disabled/);
    assert.match(archived, /id="due-from"[^>]*value="2024-03-01">/);
    assert.match(archived, /<button type="submit">Apply due range/);
    await post('/projects/1/restore');
    await stop();
    await start();
    assert.deepEqual(ids(await get('/projects/1')), [1, 2, 3, 4, 5, 6]);
    assert.match(await get('/projects/1'), /id="due-from"[^>]*value="">/);
    assert.deepEqual(ids(await get(query(state))), [3]);
    const cleared = await apply(' ', ' ');
    assert.deepEqual(ids(await get(cleared.headers.get('location'))), [1, 2, 3, 4, 5, 6]);
  } finally {
    await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
