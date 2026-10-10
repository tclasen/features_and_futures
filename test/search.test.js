import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('search intersects filters and survives edits without changing stored data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-search-'));
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'db.sqlite') }, stdio: 'ignore'
    });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + '/health')).ok) return; } catch {}
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
  const projectRows = html => [...html.matchAll(/data-testid="project-row">\s*<span>([^<]+)<\/span>/g)].map(match => match[1]);
  const selected = { search: 'needle', filter: 'Open', priorityFilter: 'High', dueFrom: '2024-01-01', dueThrough: '2024-12-31' };
  const urlFor = state => '/projects/1?' + new URLSearchParams(state);
  async function edit(path, values = {}) {
    const response = await post(path, { ...selected, ...values });
    assert.equal(response.status, 303);
    const location = response.headers.get('location');
    const params = new URL(location, base).searchParams;
    for (const [key, value] of Object.entries(selected)) assert.equal(params.get(key), value);
    return get(location);
  }
  try {
    await start();
    for (const name of ['Alpha  Board', 'alpha board', 'Other', 'Ärea']) await post('/projects', { name });
    assert.deepEqual(projectRows(await get('/?search=%20ALPHA%20')), ['Alpha  Board', 'alpha board']);
    assert.deepEqual(projectRows(await get('/?search=alpha%20%20board')), ['Alpha  Board']);
    assert.deepEqual(projectRows(await get('/?search=ä')), []);
    assert.deepEqual(projectRows(await get('/?search=%20%20')), ['Alpha  Board', 'alpha board', 'Other', 'Ärea']);
    const archived = await post('/projects/1/archive', { search: 'alpha' });
    assert.equal(new URL(archived.headers.get('location'), base).searchParams.get('search'), 'alpha');
    assert.deepEqual(projectRows(await get('/?filter=Archived&search=ALPHA')), ['Alpha  Board']);
    assert.deepEqual(projectRows(await get('/?filter=Active&search=ALPHA')), ['alpha board']);
    await post('/projects/1/restore');
    for (const title of ['Needle first', 'needle  second', 'Other', 'NEEDLE last']) await post('/projects/1/tasks', { title });
    for (let id = 1; id <= 4; id++) {
      await post(`/projects/1/tasks/${id}/priority`, { priority: 'High' });
      await post(`/projects/1/tasks/${id}/due-date`, { dueDate: '2024-06-01' });
    }
    assert.deepEqual(rows(await get(urlFor(selected))), ['Needle first', 'needle  second', 'NEEDLE last']);
    assert.deepEqual(rows(await get(urlFor({ ...selected, search: 'needle second' }))), []);
    assert.deepEqual(rows(await get(urlFor({ ...selected, search: '  NEEDLE  ' }))), ['Needle first', 'needle  second', 'NEEDLE last']);
    assert.deepEqual(rows(await edit('/projects/1/tasks/1/rename', { title: 'No match' })), ['needle  second', 'NEEDLE last']);
    assert.deepEqual(rows(await edit('/projects/1/tasks/2', { completed: '1' })), ['NEEDLE last']);
    assert.deepEqual(rows(await edit('/projects/1/tasks/4/priority', { priority: 'Low' })), []);
    assert.deepEqual(rows(await edit('/projects/1/tasks/4/priority', { priority: 'High' })), ['NEEDLE last']);
    assert.deepEqual(rows(await edit('/projects/1/tasks/4/due-date', { dueDate: '' })), []);
    assert.deepEqual(rows(await edit('/projects/1/tasks/4/due-date', { dueDate: '2024-06-01' })), ['NEEDLE last']);
    const invalid = await post('/projects/1/due-range', { ...selected, from: 'invalid', through: '' });
    assert.deepEqual(rows(await invalid.text()), ['NEEDLE last']);
    assert.deepEqual(rows(await edit('/projects/1/due-range', { from: selected.dueFrom, through: selected.dueThrough })), ['NEEDLE last']);
    assert.deepEqual(rows(await edit('/projects/1/rename', { name: 'Renamed' })), ['NEEDLE last']);
    assert.deepEqual(rows(await edit('/projects/1/default-priority', { priority: 'Low' })), ['NEEDLE last']);
    assert.deepEqual(rows(await edit('/projects/1/tasks', { title: 'needle new' })), ['NEEDLE last']);
    assert.deepEqual(rows(await edit('/projects/1/tasks/4/move', { destination: '2' })), []);
    await post('/projects/2/tasks/4/move', { destination: '1' });
    assert.deepEqual(rows(await get(urlFor(selected))), ['NEEDLE last']);
    assert.match(await get('/'), /project-summary">1\/5 completed/);
    await post('/projects/1/archive');
    const html = await get(urlFor(selected));
    assert.deepEqual(rows(html), ['NEEDLE last']);
    assert.match(html, /id="task-search"[^>]*value="needle"/);
    assert.doesNotMatch(html, /id="task-search"[^>]*disabled/);
    assert.deepEqual(rows(await get('/projects/1')), ['No match', 'needle  second', 'Other', 'NEEDLE last', 'needle new']);
    await stop();
    await start();
    assert.deepEqual(rows(await get(urlFor(selected))), ['NEEDLE last']);
    assert.match(await get('/'), /id="project-search"[^>]*value=""/);
    assert.match(await get('/projects/1'), /id="task-search"[^>]*value=""/);
    // Queries are escaped in every rendered control, including hidden state.
    assert.doesNotMatch(await get('/projects/1?search=%22%3E%3Cscript%3E'), /<script>/);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
