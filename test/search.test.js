import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import net from 'node:net';
import { matchesSearch } from '../search.js';

test('search trims query edges, preserves internal spacing, and folds ASCII only', () => {
  assert.equal(matchesSearch('Alpha  Beta', '  ALPHA  b  '), true);
  assert.equal(matchesSearch('Alpha  Beta', 'alpha beta'), false);
  assert.equal(matchesSearch('Écho', 'é'), false);
  assert.equal(matchesSearch('Anything', ' \t '), true);
  assert.equal(matchesSearch('<&"', '<&"'), true);
});

test('search intersects filters and survives edits, validation, archival and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-search-'));
  const listener = net.createServer().listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'db.sqlite') },
      stdio: 'ignore',
    });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + '/health')).ok) return; } catch { /* startup */ }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('Server failed to start');
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exit = once(child, 'exit');
      child.kill('SIGTERM');
      await exit;
    }
  }
  const get = async (path) => (await fetch(base + path)).text();
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const names = (html, kind) => [...html.matchAll(new RegExp(`<li data-testid="${kind}-row">\\s*<span>(.*?)<\\/span>`, 'g'))].map((match) => match[1]);
  try {
    await start();
    for (const name of ['Alpha  One', 'ALPHA Two', 'Other']) await post('/projects', { name });
    assert.deepEqual(names(await get('/?search=%20aLpHa%20'), 'project'), ['Alpha  One', 'ALPHA Two']);
    assert.deepEqual(names(await get('/?search=alpha%20one'), 'project'), []);
    await post('/projects/2/archive', { search: 'alpha' });
    assert.deepEqual(names(await get('/?search=alpha'), 'project'), ['Alpha  One']);
    assert.deepEqual(names(await get('/?filter=Archived&search=alpha'), 'project'), ['ALPHA Two']);
    for (const title of ['Match first', 'Other', 'MATCH last']) await post('/projects/1/tasks', { title });
    const state = { filter: 'Open', priorityFilter: 'High', dueFrom: '2025-01-01', dueThrough: '2025-12-31', search: 'match' };
    for (const id of [1, 3]) {
      await post(`/projects/1/tasks/${id}/priority`, { priority: 'High' });
      await post(`/projects/1/tasks/${id}/due-date`, { dueDate: '2025-06-01' });
    }
    const path = '/projects/1?' + new URLSearchParams(state);
    assert.deepEqual(names(await get(path), 'task'), ['Match first', 'MATCH last']);
    let response = await post('/projects/1/tasks/1/rename', { ...state, title: 'Gone' });
    assert.equal(new URL(response.headers.get('location'), base).searchParams.get('search'), 'match');
    assert.deepEqual(names(await get(response.headers.get('location')), 'task'), ['MATCH last']);
    response = await post('/projects/1/tasks/3/due-date', { ...state, dueDate: 'invalid' });
    assert.equal(response.status, 400);
    assert.deepEqual(names(await response.text(), 'task'), ['MATCH last']);
    response = await post('/projects/1/tasks/3/completion', { ...state, completed: '1' });
    assert.deepEqual(names(await get(response.headers.get('location')), 'task'), []);
    await post('/projects/1/archive');
    const archived = await get('/projects/1?search=match');
    assert.deepEqual(names(archived, 'task'), ['MATCH last']);
    assert.match(archived, /<button>Search tasks<\/button>/);
    assert.match(archived, /name="title" type="text" disabled/);
    await stop();
    await start();
    assert.deepEqual(names(await get('/projects/1?search=match'), 'task'), ['MATCH last']);
    assert.deepEqual(names(await get('/projects/1'), 'task'), ['Gone', 'Other', 'MATCH last']);
    assert.match(await get('/?filter=Archived&search=alpha'), /1\/3 completed/);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
