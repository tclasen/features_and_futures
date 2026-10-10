import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';

test('inclusive due ranges intersect other filters and survive edits without altering saved data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-ranges-'));
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'db.sqlite') }, stdio: 'ignore',
    });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + '/health')).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Server did not start');
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = undefined;
  }
  const post = (path, data = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
  });
  const get = async path => (await fetch(base + path)).text();
  const rows = html => [...html.matchAll(/aria-label="Complete ([^"]*)"/g)].map(match => match[1]);
  const apply = (from, through, state = {}) => post('/projects/1/due-range', {
    rangeFrom: from, rangeThrough: through, ...state,
  });
  const state = { filter: 'Open', priorityFilter: 'High', dueFrom: '2024-02-01', dueThrough: '2024-02-29' };
  const path = `/projects/1?${new URLSearchParams(state)}`;
  async function edit(suffix, data) {
    const response = await post('/projects/1/' + suffix, { ...state, ...data });
    assert.equal(response.status, 303);
    const url = new URL(response.headers.get('location'), base);
    for (const [key, value] of Object.entries(state)) assert.equal(url.searchParams.get(key), value);
    return get(url.pathname + url.search);
  }
  try {
    await start();
    await post('/projects', { name: 'Dates' });
    for (const title of ['Undated', 'Before', 'Start', 'End', 'After']) await post('/projects/1/tasks', { title });
    for (const [id, dueDate] of [[2, '2024-01-31'], [3, '2024-02-01'], [4, '2024-02-29'], [5, '2024-03-01']]) {
      await post(`/projects/1/tasks/${id}/due-date`, { dueDate });
    }
    assert.deepEqual(rows(await get('/projects/1')), ['Undated', 'Before', 'Start', 'End', 'After']);
    for (const [from, through, expected] of [
      ['', '', ['Undated', 'Before', 'Start', 'End', 'After']],
      [' 2024-02-01 ', ' 2024-02-29 ', ['Start', 'End']],
      ['', '2024-02-01', ['Before', 'Start']],
      ['2024-02-29', '', ['End', 'After']],
      ['2024-02-29', '2024-02-29', ['End']],
    ]) {
      const response = await apply(from, through);
      assert.equal(response.status, 303);
      assert.deepEqual(rows(await get(response.headers.get('location'))), expected);
    }
    await post('/projects/1/tasks/3/priority', { priority: 'High' });
    await post('/projects/1/tasks/4/priority', { priority: 'High' });
    await post('/projects/1/tasks/4', { completed: '1' });
    assert.deepEqual(rows(await get(path)), ['Start']);
    assert.deepEqual(rows(await get(path.replace('filter=Open', 'filter=Completed'))), ['End']);
    assert.deepEqual(rows(await get(path.replace('priorityFilter=High', 'priorityFilter=Normal'))), []);
    const unchanged = await get(path);
    for (const bad of ['0000-01-01', '1900-02-29', '2024-04-31', '2024-2-01', 'not a date']) {
      for (const [from, through] of [[bad, ''], ['', bad]]) {
        const response = await apply(from, through, state);
        assert.equal(response.status, 400);
        const html = await response.text();
        assert.match(html, /role="alert">Due range must use valid YYYY-MM-DD dates/);
        assert.deepEqual(rows(html), ['Start']);
        assert.match(html, /id="due-from"[^>]*value="2024-02-01"/);
        assert.match(html, /id="due-through"[^>]*value="2024-02-29"/);
      }
    }
    const reversed = await apply('2024-03-01', '2024-02-29', state);
    assert.equal(reversed.status, 400);
    assert.match(await reversed.text(), /Due from must not be after Due through/);
    assert.equal(await get(path), unchanged);
    assert.deepEqual(rows(await edit('tasks/3/rename', { title: 'Renamed' })), ['Renamed']);
    assert.deepEqual(rows(await edit('rename', { name: 'Renamed project' })), ['Renamed']);
    assert.deepEqual(rows(await edit('default-priority', { priority: 'High' })), ['Renamed']);
    assert.deepEqual(rows(await edit('tasks', { title: 'New undated' })), ['Renamed']);
    assert.deepEqual(rows(await edit('tasks/3/due-date', { dueDate: '2024-03-01' })), []);
    assert.deepEqual(rows(await edit('tasks/2/priority', { priority: 'High' })), []);
    assert.deepEqual(rows(await edit('tasks/2/due-date', { dueDate: '2024-02-01' })), ['Before']);
    assert.deepEqual(rows(await edit('tasks/4', {})), ['Before', 'End']);
    assert.deepEqual(rows(await edit('tasks/2/due-date', { dueDate: ' ' })), ['End']);
    assert.match(await get('/'), /0\/6 completed/);
    const active = await get(path);
    await stop();
    await start();
    assert.equal(await get(path), active);
    // Reopening without filter query resets transient range boundaries.
    const reopened = await get('/projects/1');
    assert.equal(rows(reopened).length, 6);
    assert.match(reopened, /id="due-from"[^>]*value=""/);
    await post('/projects/1/archive');
    const archived = await get(path);
    assert.deepEqual(rows(archived), ['End']);
    assert.match(archived, /id="task-due-date-4"[^>]*disabled/);
    assert.doesNotMatch(archived, /id="due-(from|through)"[^>]*disabled/);
    const ranged = await apply('0001-01-01', '9999-12-31', { filter: 'All', priorityFilter: 'All' });
    assert.equal(ranged.status, 303);
    assert.deepEqual(rows(await get(ranged.headers.get('location'))), ['Renamed', 'End', 'After']);
    await post('/projects/1/restore');
    assert.equal(await get(path), active);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
