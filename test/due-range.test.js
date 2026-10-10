import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

test('inclusive due ranges intersect filters, survive edits, and reject invalid applications', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-range-'));
  const path = join(directory, 'db.sqlite');
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: path }, stdio: 'ignore'
    });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + '/health')).ok) return; } catch {}
      if (child.exitCode !== null) throw new Error('Server exited');
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Server did not start');
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
  }
  const get = async url => (await fetch(base + url)).text();
  const post = (url, values = {}) => fetch(base + url, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
  });
  const rows = html => [...html.matchAll(/aria-label="Complete ([^"]+)"/g)].map(match => match[1]);
  const range = { dueFrom: '2024-02-29', dueThrough: '2024-03-01' };
  const selected = { ...range, filter: 'Open', priorityFilter: 'High' };
  const urlFor = values => '/projects/1?' + new URLSearchParams(values);
  async function apply(from, through, prior = {}) {
    const response = await post('/projects/1/due-range', { ...prior, from, through });
    assert.equal(response.status, 303);
    const url = response.headers.get('location');
    return { url, html: await get(url) };
  }
  function snapshot() {
    const db = new DatabaseSync(path);
    try { return db.prepare('SELECT * FROM tasks ORDER BY id').all().map(row => ({ ...row })); }
    finally { db.close(); }
  }
  function controls(html, values) {
    assert.match(html, new RegExp(`id="due-from"[^>]*value="${values.dueFrom || ''}"`));
    assert.match(html, new RegExp(`id="due-through"[^>]*value="${values.dueThrough || ''}"`));
    assert.match(html, new RegExp(`id="task-filter"[\\s\\S]*?<option selected>${values.filter || 'All'}</option>`));
    assert.match(html, new RegExp(`id="priority-filter"[\\s\\S]*?<option selected>${values.priorityFilter || 'All'}</option>`));
  }
  try {
    await start();
    await post('/projects', { name: 'Dates' });
    const titles = ['Undated', 'Before', 'From', 'Through', 'After', 'Completed', 'Normal'];
    const dates = ['', '2024-02-28', '2024-02-29', '2024-03-01', '2024-03-02', '2024-03-01', '2024-03-01'];
    for (let i = 0; i < titles.length; i++) {
      await post('/projects/1/tasks', { title: titles[i] });
      await post(`/projects/1/tasks/${i + 1}/due-date`, { dueDate: dates[i] });
      if (i !== 6) await post(`/projects/1/tasks/${i + 1}/priority`, { priority: 'High' });
    }
    await post('/projects/1/tasks/6', { completed: '1' });
    const initial = snapshot();
    controls(await get('/projects/1'), {});
    assert.deepEqual(rows((await apply('', '')).html), titles);
    assert.deepEqual(rows((await apply('2024-02-29', '')).html), titles.slice(2));
    assert.deepEqual(rows((await apply('', '2024-03-01')).html), ['Before', 'From', 'Through', 'Completed', 'Normal']);
    assert.deepEqual(rows((await apply('2024-03-01', '2024-03-01')).html), ['Through', 'Completed', 'Normal']);
    const applied = await apply(' 2024-02-29 ', ' 2024-03-01 ', { filter: 'Open', priorityFilter: 'High' });
    controls(applied.html, selected);
    assert.deepEqual(rows(applied.html), ['From', 'Through']);
    assert.deepEqual(snapshot(), initial);
    assert.deepEqual(rows(await get(urlFor({ ...range, filter: 'Completed', priorityFilter: 'High' }))), ['Completed']);
    assert.deepEqual(rows(await get(urlFor({ ...range, filter: 'Open', priorityFilter: 'Normal' }))), ['Normal']);
    assert.match(await get('/'), /project-summary">1\/7 completed/);
    for (const [from, through, message] of [
      ['0000-01-01', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['', '1900-02-29', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-04-31', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-2-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['<script>', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['9999-12-31', '0001-01-01', 'Due from must not be after Due through']
    ]) {
      const response = await post('/projects/1/due-range', { ...selected, from, through });
      const html = await response.text();
      assert.ok(html.includes(`role="alert">${message}`));
      controls(html, selected);
      assert.deepEqual(rows(html), ['From', 'Through']);
      assert.deepEqual(snapshot(), initial);
    }
    assert.deepEqual(rows((await apply('0001-01-01', '9999-12-31')).html), titles.slice(1));
    // Every mutation carries the applied range and both combobox selections forward.
    async function edit(suffix, values, expected) {
      const response = await post('/projects/1/' + suffix, { ...selected, ...values });
      assert.equal(response.status, 303);
      const url = response.headers.get('location');
      const params = new URL(url, base).searchParams;
      for (const [key, value] of Object.entries(selected)) assert.equal(params.get(key), value);
      const html = await get(url);
      controls(html, selected);
      assert.deepEqual(rows(html), expected);
    }
    await edit('tasks/3/rename', { title: 'Renamed' }, ['Renamed', 'Through']);
    await edit('rename', { name: 'Renamed project' }, ['Renamed', 'Through']);
    await edit('default-priority', { priority: 'Low' }, ['Renamed', 'Through']);
    await edit('tasks', { title: 'New undated' }, ['Renamed', 'Through']);
    await edit('tasks/3/due-date', { dueDate: '2024-03-02' }, ['Through']);
    await edit('tasks/3/due-date', { dueDate: '2024-02-29' }, ['Renamed', 'Through']);
    await edit('tasks/3/priority', { priority: 'Low' }, ['Through']);
    await edit('tasks/3/priority', { priority: 'High' }, ['Renamed', 'Through']);
    await edit('tasks/3', { completed: '1' }, ['Through']);
    await edit('tasks/3', {}, ['Renamed', 'Through']);
    await edit('tasks/3/due-date', { dueDate: ' ' }, ['Through']);
    await edit('tasks/3/due-date', { dueDate: '2024-02-29' }, ['Renamed', 'Through']);
    assert.match(await get('/'), /project-summary">1\/8 completed/);
    await post('/projects/1/archive');
    const archived = await apply(range.dueFrom, range.dueThrough, selected);
    assert.deepEqual(rows(archived.html), ['Renamed', 'Through']);
    assert.match(archived.html, /Archived project/);
    assert.match(archived.html, /id="task-due-date-3"[^>]* disabled/);
    assert.doesNotMatch(archived.html, /id="due-(?:from|through)"[^>]*disabled/);
    assert.doesNotMatch(archived.html, /<button[^>]*disabled[^>]*>Apply due range/);
    const saved = snapshot();
    await stop();
    await start();
    assert.deepEqual(snapshot(), saved);
    assert.deepEqual(rows(await get(archived.url)), ['Renamed', 'Through']);
    await post('/projects/1/restore');
    assert.deepEqual(rows(await get(archived.url)), ['Renamed', 'Through']);
    // List navigation has no filter parameters, so reopening resets the range.
    const list = await get('/');
    assert.match(list, /action="\/projects\/1"><button type="submit">Open project/);
    const reopened = await get('/projects/1');
    controls(reopened, {});
    assert.equal(rows(reopened).length, 8);
    assert.deepEqual(snapshot(), saved);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
