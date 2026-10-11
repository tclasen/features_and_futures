import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('search intersects filters, retains state through edits, and resets on navigation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-search-'));
  let child, base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'db.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    base = await new Promise((resolve, reject) => {
      let output = '';
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = /listening on port (\d+)/.exec(output);
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
      child.on('error', reject);
      child.on('exit', code => reject(new Error(`Server exited ${code}`)));
    });
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = null;
  }
  const get = async path => (await fetch(base + path)).text();
  const post = (path, data = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
  });
  const titles = html => [...html.matchAll(/<span>(.*?)<\/span>/g)].map(match => match[1]);
  try {
    await start();
    for (const name of ['Alpha', 'ALPHA  beta', 'Other', 'Älpha']) await post('/projects', { name });
    assert.deepEqual(titles(await get('/?search=%20aLpHa%20')), ['Alpha', 'ALPHA  beta']);
    assert.deepEqual(titles(await get('/?search=alpha+beta')), ['ALPHA  beta']);
    assert.deepEqual(titles(await get('/?search=%20ALPHA%09%09+beta%20')), ['ALPHA  beta']);
    assert.deepEqual(titles(await get('/?search=alpha++beta')), ['ALPHA  beta']);
    assert.deepEqual(titles(await get('/?search=%C3%A4lpha')), []);
    await post('/projects/2/archive', { search: 'Alpha' });
    assert.deepEqual(titles(await get('/?search=alpha')), ['Alpha']);
    assert.deepEqual(titles(await get('/?filter=Archived&search=alpha')), ['ALPHA  beta']);
    const list = await get('/?search=alpha');
    assert.match(list, /name="search" value="alpha"/);
    assert.match(list, /action="\/projects\/1" method="get"/);
    await post('/projects/2/restore');
    for (const title of ['Alpha one', 'ALPHA  two', 'Other', 'Alpha done']) await post('/projects/1/tasks', { title });
    for (const id of [1, 2, 3, 4]) {
      await post(`/projects/1/tasks/${id}/priority`, { priority: 'High' });
      await post(`/projects/1/tasks/${id}/due-date`, { dueDate: '2025-06-15' });
    }
    await post('/projects/1/tasks/4/completion', { completed: '1' });
    const state = { filter: 'Open', priorityFilter: 'High', dueFrom: '2025-06-01', dueThrough: '2025-06-30', search: 'alpha' };
    const location = '/projects/1?' + new URLSearchParams(state);
    assert.deepEqual(titles(await get(location)), ['Alpha one', 'ALPHA  two']);
    assert.deepEqual(titles(await get('/projects/1?search=alpha+two')), ['ALPHA  two']);
    assert.deepEqual(titles(await get('/projects/1?search=ALPHA%09+%09two')), ['ALPHA  two']);
    for (const [path, data] of [
      ['/projects/1/rename', { name: 'Renamed project' }],
      ['/projects/1/default-priority', { priority: 'Low' }],
      ['/projects/1/tasks/1/rename', { title: 'Alpha revised' }],
      ['/projects/1/tasks/1/due-date', { dueDate: '2025-06-16' }],
    ]) {
      const response = await post(path, { ...state, ...data });
      assert.equal(response.headers.get('location'), location);
    }
    assert.deepEqual(titles(await get(location)), ['Alpha revised', 'ALPHA  two']);
    const invalid = await post('/projects/1/due-range', { ...state, rangeFrom: 'invalid' });
    assert.equal(invalid.status, 400);
    assert.deepEqual(titles(await invalid.text()), ['Alpha revised', 'ALPHA  two']);
    const ranged = await post('/projects/1/due-range', { ...state, rangeFrom: '2025-06-01', rangeThrough: '2025-06-30' });
    assert.equal(ranged.headers.get('location'), location);
    await post('/projects/1/tasks/1/priority', { ...state, priority: 'Low' });
    assert.deepEqual(titles(await get(location)), ['ALPHA  two']);
    await post('/projects/1/tasks/2/completion', { ...state, completed: '1' });
    assert.deepEqual(titles(await get(location)), []);
    await post('/projects/1/tasks/2/completion', state);
    await post('/projects/1/tasks/2/due-date', { ...state, dueDate: '' });
    assert.deepEqual(titles(await get(location)), []);
    await post('/projects/1/tasks/2/due-date', { ...state, dueDate: '2025-06-15' });
    const moved = await post('/projects/1/tasks/2/move', { ...state, destination: '2' });
    assert.equal(moved.headers.get('location'), location);
    assert.deepEqual(titles(await get(location)), []);
    await post('/projects/2/tasks/2/move', { destination: '1' });
    assert.deepEqual(titles(await get(location)), ['ALPHA  two']);
    await post('/projects/1/tasks', { ...state, title: 'Alpha new' });
    assert.deepEqual(titles(await get(location)), ['ALPHA  two']);
    assert.match(await get('/'), /1\/5 completed/);
    const before = await get(location);
    await stop();
    await start();
    assert.equal(await get(location), before);
    await post('/projects/1/archive');
    const archived = await get(location);
    assert.deepEqual(titles(archived), ['ALPHA  two']);
    assert.match(archived, /id="task-search"[^>]*value="alpha"/);
    assert.doesNotMatch(archived.match(/<input id="task-search"[^>]*>/)[0], /disabled/);
    assert.match(archived, /id="task-priority-2"[^>]*disabled/);
    await post('/projects/1/restore');
    assert.equal(await get(location), before);
    assert.deepEqual(titles(await get('/projects/1')), ['Alpha revised', 'ALPHA  two', 'Other', 'Alpha done', 'Alpha new']);
    assert.match(await get('/projects/1'), /id="task-search"[^>]*value=""/);
    assert.match(await get('/'), /id="project-search"[^>]*value=""/);

    // Normalize only ASCII spaces/tabs for matching, never the persisted text.
    const original = 'MiXeD \t\t  Space';
    await post('/projects', { name: original });
    await post('/projects/5/tasks', { title: original });
    for (const query of ['mixed space', '  MIXED\t \tSPACE  ', 'xed   sp']) {
      assert.deepEqual(titles(await get('/?' + new URLSearchParams({ search: query }))), [original]);
      assert.deepEqual(titles(await get('/projects/5?' + new URLSearchParams({ search: query }))), [original]);
    }
    for (const title of ['MiXeD\nSpace', 'MiXeD\u00a0Space']) {
      await post('/projects', { name: title });
      await post('/projects/5/tasks', { title });
    }
    assert.deepEqual(titles(await get('/?search=mixed+space')), [original]);
    assert.deepEqual(titles(await get('/projects/5?search=mixed+space')), [original]);
    await post('/projects/5/archive');
    assert.deepEqual(titles(await get('/?filter=Archived&search=mixed+space')), [original]);
    assert.deepEqual(titles(await get('/projects/5?search=mixed+space')), [original]);
    await stop();
    await start();
    assert.deepEqual(titles(await get('/?filter=Archived&search=mixed+space')), [original]);
    assert.deepEqual(titles(await get('/projects/5?search=mixed+space')), [original]);
    await post('/projects/5/restore');
    assert.deepEqual(titles(await get('/?search=mixed+space')), [original]);
    assert.ok((await get('/')).includes(original));
    assert.ok((await get('/projects/5')).includes(original));
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
