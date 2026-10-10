import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import net from 'node:net';

test('inclusive due ranges intersect filters and survive edits without changing stored data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-range-'));
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'db.sqlite') },
      stdio: 'ignore'
    });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + '/health')).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Server did not start');
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exit = once(child, 'exit');
      child.kill('SIGTERM');
      await exit;
    }
  }
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
  });
  const get = async path => (await fetch(base + path)).text();
  const titles = html => [...html.matchAll(/<\/form><span>([^<]*)<\/span>/g)].map(match => match[1]);
  const project = '/projects/1';
  const state = { filter: 'Open', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-03-01' };
  const location = `${project}?${new URLSearchParams(state)}`;
  try {
    await start();
    await post('/projects', { name: 'Dates' });
    for (const title of ['Undated', 'Before', 'Start', 'End', 'After']) await post(project + '/tasks', { title });
    const dates = ['', '2024-02-28', '2024-02-29', '2024-03-01', '2024-03-02'];
    for (let id = 1; id <= 5; id++) {
      await post(`${project}/tasks/${id}/due-date`, { dueDate: dates[id - 1] });
      await post(`${project}/tasks/${id}/priority`, { priority: 'High' });
    }
    const response = await post(project + '/due-range', { filter: 'Open', priorityFilter: 'High', rangeFrom: ' 2024-02-29 ', rangeThrough: ' 2024-03-01 ' });
    assert.equal(response.status, 303);
    assert.deepEqual(titles(await get(response.headers.get('location'))), ['Start', 'End']);
    assert.deepEqual(titles(await get(`${project}?dueFrom=2024-03-01`)), ['End', 'After']);
    assert.deepEqual(titles(await get(`${project}?dueThrough=2024-02-29`)), ['Before', 'Start']);
    assert.deepEqual(titles(await get(project)), ['Undated', 'Before', 'Start', 'End', 'After']);
    for (const invalid of ['2023-02-29', '0000-01-01', '10000-01-01', '2024-04-31', '2024-2-29']) {
      const failed = await post(project + '/due-range', { ...state, rangeFrom: invalid, rangeThrough: '' });
      assert.equal(failed.status, 400);
      const html = await failed.text();
      assert.match(html, /role="alert">Due range must use valid YYYY-MM-DD dates/);
      assert.deepEqual(titles(html), ['Start', 'End']);
    }
    const reversed = await post(project + '/due-range', { ...state, rangeFrom: '2024-03-02', rangeThrough: '2024-03-01' });
    assert.match(await reversed.text(), /Due from must not be after Due through/);
    const page = await get(location);
    assert.match(page, /name="dueFrom" value="2024-02-29"/);
    assert.match(page, /name="dueThrough" value="2024-03-01"/);
    for (const [route, values] of [
      ['/rename', { name: 'Renamed project' }],
      ['/tasks/3/rename', { title: 'Renamed task' }],
      ['/default-priority', { priority: 'Low' }],
      ['/tasks', { title: 'New undated task' }]
    ]) {
      const changed = await post(project + route, { ...state, ...values });
      assert.equal(changed.headers.get('location'), location);
    }
    assert.deepEqual(titles(await get(location)), ['Renamed task', 'End']);
    const completed = await post(project + '/tasks/3/completion', { ...state, completed: '1' });
    assert.deepEqual(titles(await get(completed.headers.get('location'))), ['End']);
    const reprioritized = await post(project + '/tasks/4/priority', { ...state, priority: 'Low' });
    assert.deepEqual(titles(await get(reprioritized.headers.get('location'))), []);
    await post(project + '/tasks/4/priority', { ...state, priority: 'High' });
    const moved = await post(project + '/tasks/4/due-date', { ...state, dueDate: '2024-03-02' });
    assert.deepEqual(titles(await get(moved.headers.get('location'))), []);
    assert.match(await get('/'), /project-summary">1\/6 completed/);
    const cleared = await post(project + '/due-range', { ...state, rangeFrom: '  ', rangeThrough: '' });
    assert.deepEqual(titles(await get(cleared.headers.get('location'))), ['Undated', 'Before', 'End', 'After']);
    for (const date of ['0001-01-01', '9999-12-31', '2000-02-29']) {
      assert.equal((await post(project + '/due-range', { rangeFrom: date, rangeThrough: date })).status, 303);
    }
    await post(project + '/archive');
    const archived = await get(location);
    assert.match(archived, /Archived project/);
    assert.doesNotMatch(archived, /id="due-(?:from|through)"[^>]*disabled/);
    assert.equal((await post(project + '/due-range', { ...state, rangeFrom: '', rangeThrough: '' })).status, 303);
    await post(project + '/restore');
    await stop();
    await start();
    assert.deepEqual(titles(await get(location)), []);
    const reopened = await get(project);
    assert.match(reopened, /id="due-from" name="rangeFrom" value=""/);
    assert.match(reopened, /id="due-through" name="rangeThrough" value=""/);
    assert.match(reopened, /name="dueDate" value="2024-03-02"/);
    assert.match(reopened, /aria-label="Complete Renamed task" checked/);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
