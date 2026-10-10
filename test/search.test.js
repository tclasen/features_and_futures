import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('ASCII substring search intersects filters and stays applied through edits and moves', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-search-'));
  const port = 40000 + Math.floor(Math.random() * 10000);
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
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  const get = async path => (await fetch(base + path)).text();
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const rows = html => [...html.matchAll(/<label for="task-\d+">([^<]+)<\/label>/g)].map(match => match[1]);
  const projectNames = html => [...html.matchAll(/data-testid="project-row">\s*<span>([^<]+)<\/span>/g)].map(match => match[1]);
  async function follow(response) {
    assert.equal(response.status, 303);
    return get(response.headers.get('location'));
  }
  try {
    await start();
    for (const name of ['Alpha One', 'ALPHA  Two', 'Other', 'Älpha']) await post('/projects', { name });
    assert.deepEqual(projectNames(await get('/?search=%20aLpHa%20')), ['Alpha One', 'ALPHA  Two']);
    assert.deepEqual(projectNames(await get('/?search=alpha%20%20')), ['Alpha One', 'ALPHA  Two']);
    assert.deepEqual(projectNames(await get('/?search=alpha%20%20t')), ['ALPHA  Two']);
    assert.deepEqual(projectNames(await get('/?search=älpha')), []); // No Unicode case folding.
    let html = await follow(await post('/projects/2/archive', { search: 'alpha' }));
    assert.deepEqual(projectNames(html), ['Alpha One']);
    html = await get('/?filter=Archived&search=alpha');
    assert.deepEqual(projectNames(html), ['ALPHA  Two']);
    assert.match(html, /name="search" value="alpha"/);
    html = await follow(await post('/projects/2/restore', { search: 'alpha' }));
    assert.deepEqual(projectNames(html), []);
    assert.deepEqual(projectNames(await get('/')), ['Alpha One', 'ALPHA  Two', 'Other', 'Älpha']);

    for (const title of ['Alpha first', 'aLPHa  second', 'Beta', 'Alpha last']) await post('/projects/1/tasks', { title });
    for (const id of [1, 2, 4]) {
      await post(`/projects/1/tasks/${id}/priority`, { priority: 'High' });
      await post(`/projects/1/tasks/${id}/due-date`, { dueDate: '2024-02-29' });
    }
    await post('/projects/1/tasks/4', { completed: '1' });
    const state = { filter: 'Open', priorityFilter: 'High', dueFrom: '2024-02-01', dueThrough: '2024-03-01', search: 'alpha' };
    const location = '/projects/1?' + new URLSearchParams(state);
    html = await get(location);
    assert.deepEqual(rows(html), ['Alpha first', 'aLPHa  second']);
    // Every mutation and filter form carries the applied query and range.
    for (const form of html.matchAll(/<form[^>]+action="\/projects\/1(?:\/[^\"]*)?"[^>]*>([\s\S]*?)<\/form>/g)) {
      assert.match(form[1], /name="search" value="alpha"/);
      assert.match(form[1], /name="dueFrom" value="2024-02-01"/);
    }
    assert.deepEqual(rows(await get(location.replace('search=alpha', 'search=ALPHA++s'))), ['aLPHa  second']);
    html = await follow(await post('/projects/1/tasks/1/rename', { ...state, title: 'No match' }));
    assert.deepEqual(rows(html), ['aLPHa  second']);
    html = await follow(await post('/projects/1/default-priority', { ...state, priority: 'Low' }));
    assert.deepEqual(rows(html), ['aLPHa  second']);
    html = await follow(await post('/projects/1/tasks/2/due-date', { ...state, dueDate: '2024-04-01' }));
    assert.deepEqual(rows(html), []);
    html = await follow(await post('/projects/1/tasks/2/due-date', { ...state, dueDate: '2024-02-29' }));
    assert.deepEqual(rows(html), ['aLPHa  second']);
    const invalid = await post('/projects/1/due-range', { ...state, from: 'bad', through: '' });
    assert.equal(invalid.status, 400);
    assert.deepEqual(rows(await invalid.text()), ['aLPHa  second']);
    html = await follow(await post('/projects/1/tasks/2/move', { ...state, destination: '3' }));
    assert.deepEqual(rows(html), []);
    await post('/projects/3/tasks/2/move', { destination: '1' });
    assert.deepEqual(rows(await get(location)), ['aLPHa  second']);
    await post('/projects/1/archive');
    html = await get(location);
    assert.deepEqual(rows(html), ['aLPHa  second']);
    assert.match(html, /id="task-search" name="search" value="alpha">/);
    assert.match(html, /id="new-task-title-2"[^>]+disabled/);
    await post('/projects/1/restore');
    await stop();
    await start();
    assert.deepEqual(rows(await get(location)), ['aLPHa  second']);
    assert.deepEqual(rows(await get('/projects/1')), ['No match', 'aLPHa  second', 'Beta', 'Alpha last']);
    assert.match(await get('/'), /1\/4 completed/);
    assert.deepEqual(rows(await get(location.replace('search=alpha', 'search='))), ['No match', 'aLPHa  second']);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
