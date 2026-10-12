import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('ASCII substring search intersects filters and stays applied across edits', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-search-'));
  const base = 'http://127.0.0.1:18086';
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '18086', DB_PATH: join(dir, 'db.sqlite') }, stdio: 'ignore'
  });
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
  });
  const get = async path => (await fetch(base + path)).text();
  const ids = html => [...html.matchAll(/class="task-title" for="task-(\d+)"/g)].map(match => Number(match[1]));
  async function follow(response) { return get(response.headers.get('location')); }
  try {
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + '/health')).ok) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    for (const name of ['Alpha  Board', 'alpha board', 'Other', 'Ärea']) await post('/projects', { name });
    let html = await get('/?search=%20ALPHA%20%20%20');
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    html = await get('/?search=ALPHA%20%20BOARD');
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 1);
    assert.match(html, /Alpha  Board/);
    assert.equal((await get('/?search=ärea')).includes('data-testid="project-row"'), false);
    await post('/projects/1/archive', { search: 'alpha' });
    html = await get('/?filter=Archived&search=ALPHA');
    assert.match(html, /Alpha  Board/);
    assert.match(html, /name="search" value="ALPHA"/);
    await post('/projects/1/restore');
    for (const title of ['Match One', 'MATCH  Two', 'Unrelated', 'match three']) await post('/projects/1/tasks', { title });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2028-02-29' });
    await post('/projects/1/tasks/2/priority', { priority: 'High' });
    await post('/projects/1/tasks/2/due-date', { dueDate: '2028-03-01' });
    const state = { filter: 'Open', priorityFilter: 'High', dueFrom: '2028-02-01', dueThrough: '2028-02-29', search: 'match' };
    html = await follow(await post('/projects/1/search', { ...state, newSearch: '  MATCH  ' }));
    assert.deepEqual(ids(html), [1]);
    assert.match(html, /id="task-search" name="newSearch" type="text" value="MATCH"/);
    // All edit and filter forms carry the applied search; Projects does not.
    const forms = [...html.matchAll(/<form\b[\s\S]*?<\/form>/g)].map(match => match[0]);
    for (const form of forms) {
      if (form.includes('action="/"')) assert.doesNotMatch(form, /name="search"/);
      else assert.match(form, /name="search" value="MATCH"/);
    }
    html = await follow(await post('/projects/1/tasks/1/rename', { ...state, title: 'No longer matches' }));
    assert.deepEqual(ids(html), [1]); // substring still matches "matches"
    html = await follow(await post('/projects/1/tasks/1/rename', { ...state, title: 'Gone' }));
    assert.deepEqual(ids(html), []);
    html = await follow(await post('/projects/1/tasks/2/due-date', { ...state, dueDate: '2028-02-28' }));
    assert.deepEqual(ids(html), [2]);
    html = await follow(await post('/projects/1/tasks/2', { ...state, completed: '1' }));
    assert.deepEqual(ids(html), []);
    html = await follow(await post('/projects/1/search', { ...state, newSearch: ' ' }));
    assert.deepEqual(ids(html), [1]);
    html = await get('/projects/1?' + new URLSearchParams({ ...state, filter: 'All' }));
    assert.deepEqual(ids(html), [2]);
    html = await (await post('/projects/1/due-range', { ...state, newDueFrom: 'bad' })).text();
    assert.match(html, /Due range must use valid/);
    assert.deepEqual(ids(html), []);
    await post('/projects/1/archive');
    html = await follow(await post('/projects/1/search', { newSearch: 'MATCH' }));
    assert.deepEqual(ids(html), [2, 4]);
    assert.match(html, /Archived project/);
    assert.doesNotMatch(html.match(/<form[^>]*\/search"[\s\S]*?<\/form>/)[0], /disabled/);
    html = await get('/projects/1');
    assert.deepEqual(ids(html), [1, 2, 3, 4]);
    assert.match(html, /id="task-search" name="newSearch" type="text" value=""/);
    html = await get('/?filter=Archived&search=alpha');
    assert.match(html, /1\/4 completed/);
  } finally {
    if (child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
    await rm(dir, { recursive: true, force: true });
  }
});
