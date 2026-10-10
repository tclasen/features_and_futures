import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('search intersects filters, retains queries through edits, and resets on navigation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-search-'));
  let child;
  let url;
  const start = async () => {
    child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '0', DB_PATH: join(dir, 'db.sqlite') }, stdio: ['ignore', 'pipe', 'pipe'] });
    url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Startup timeout')), 5000);
      child.stdout.on('data', chunk => {
        const match = chunk.toString().match(/listening on port (\d+)/);
        if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
      });
    });
  };
  const stop = async () => { const exited = once(child, 'exit'); child.kill(); await exited; };
  const post = (path, values = {}) => fetch(url + path, { method: 'POST', body: new URLSearchParams(values), redirect: 'manual' });
  const page = path => fetch(url + path).then(r => r.text());
  const taskIds = html => [...html.matchAll(/id="task-due-date-(\d+)"/g)].map(m => Number(m[1]));
  const projectNames = html => [...html.matchAll(/class="project-name">([^<]*)</g)].map(m => m[1]);
  const state = { filter: 'Open', priorityFilter: 'Normal', dueFrom: '2024-01-01', dueThrough: '2024-12-31', search: 'alpha' };
  const editedPage = async (path, values) => {
    const response = await post(path, { ...state, ...values });
    const location = response.headers.get('location');
    assert.match(location, /filter=Open&priorityFilter=Normal/);
    assert.match(location, /dueFrom=2024-01-01&dueThrough=2024-12-31/);
    assert.match(location, /search=alpha/);
    return page(location);
  };
  try {
    await start();
    for (const name of ['Alpha Board', 'ALPHA  Board', 'Other', 'Ärea']) await post('/projects', { name });
    assert.deepEqual(projectNames(await page('/?search=%20aLpHa%20')), ['Alpha Board', 'ALPHA  Board']);
    assert.deepEqual(projectNames(await page('/?search=alpha%20board')), ['Alpha Board']);
    assert.deepEqual(projectNames(await page('/?search=%C3%A4rea')), []);
    await post('/projects/2/archive');
    assert.deepEqual(projectNames(await page('/?search=alpha')), ['Alpha Board']);
    let html = await page('/?filter=Archived&search=alpha');
    assert.deepEqual(projectNames(html), ['ALPHA  Board']);
    assert.match(html, /name="search" value="alpha"/);
    assert.match(html, /id="project-search"[^>]*value="alpha"/);
    assert.deepEqual(projectNames(await page('/?search=%20%20')), ['Alpha Board', 'Other', 'Ärea']);
    for (const title of ['Alpha One', 'ALPHA  Two', 'Other', 'Ärea']) await post('/projects/1/tasks', { title });
    for (const id of [1, 2, 3]) await post(`/projects/1/tasks/${id}/due-date`, { dueDate: '2024-06-01' });
    assert.deepEqual(taskIds(await page('/projects/1?search=%20aLpHa%20')), [1, 2]);
    assert.deepEqual(taskIds(await page('/projects/1?search=alpha%20two')), []);
    assert.deepEqual(taskIds(await page('/projects/1?search=%C3%A4rea')), []);
    const filtered = '/projects/1?' + new URLSearchParams(state);
    html = await page(filtered);
    assert.deepEqual(taskIds(html), [1, 2]);
    assert.match(html, /id="task-search"[^>]*value="alpha"/);
    assert.match(html, /name="search" value="alpha"/);
    html = await editedPage('/projects/1/tasks/1/rename', { title: 'Unmatched' });
    assert.deepEqual(taskIds(html), [2]);
    html = await editedPage('/projects/1/tasks/2/rename', { title: 'Alpha revised' });
    assert.deepEqual(taskIds(html), [2]);
    const invalid = await post('/projects/1/tasks/2/rename', { ...state, title: ' ' });
    html = await invalid.text();
    assert.match(html, /Task title is required/);
    assert.deepEqual(taskIds(html), [2]);
    assert.match(html, /id="task-search"[^>]*value="alpha"/);
    assert.deepEqual(taskIds(await editedPage('/projects/1/tasks/2/priority', { priority: 'High' })), []);
    await post('/projects/1/tasks/2/priority', { priority: 'Normal' });
    assert.deepEqual(taskIds(await editedPage('/projects/1/tasks/2', { completed: '1' })), []);
    await post('/projects/1/tasks/2', {});
    assert.deepEqual(taskIds(await editedPage('/projects/1/tasks/2/due-date', { dueDate: '' })), []);
    await post('/projects/1/tasks/2/due-date', { dueDate: '2024-06-01' });
    assert.deepEqual(taskIds(await editedPage('/projects/1/rename', { name: 'Alpha renamed' })), [2]);
    assert.deepEqual(taskIds(await editedPage('/projects/1/default-priority', { priority: 'Low' })), [2]);
    assert.deepEqual(taskIds(await editedPage('/projects/1/tasks', { title: 'Alpha undated' })), [2]);
    let response = await post('/projects/1/due-range', { ...state, from: '2024-06-01', through: '2024-06-01' });
    assert.match(response.headers.get('location'), /search=alpha/);
    assert.deepEqual(taskIds(await page(response.headers.get('location'))), [2]);
    response = await post('/projects/1/due-range', { ...state, from: 'bad', through: '' });
    html = await response.text();
    assert.deepEqual(taskIds(html), [2]);
    assert.match(html, /id="task-search"[^>]*value="alpha"/);
    assert.deepEqual(taskIds(await editedPage('/projects/1/tasks/2/move', { destination: '3' })), []);
    await post('/projects/3/tasks/2/rename', { title: 'Alpha returned' });
    await post('/projects/3/tasks/2/move', { destination: '1' });
    assert.deepEqual(taskIds(await page(filtered)), [2]);
    assert.deepEqual(taskIds(await page('/projects/1')), [1, 2, 3, 4, 5]);
    assert.match(await page('/'), /0\/5 completed/);
    await post('/projects/1/archive');
    html = await page(filtered);
    assert.deepEqual(taskIds(html), [2]);
    assert.match(html, /id="task-due-date-2"[^>]* disabled/);
    assert.doesNotMatch(html, /id="task-search"[^>]* disabled/);
    assert.deepEqual(projectNames(await page('/?filter=Archived&search=renamed')), ['Alpha renamed']);
    await post('/projects/1/restore');
    await stop();
    await start();
    assert.deepEqual(taskIds(await page(filtered)), [2]);
    assert.deepEqual(taskIds(await page('/projects/1')), [1, 2, 3, 4, 5]);
    assert.match(await page('/projects/1'), /id="task-search"[^>]*value=""/);
    assert.match(await page('/'), /id="project-search"[^>]*value=""/);
  } finally {
    if (child && child.exitCode === null) await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
