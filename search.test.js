import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('search intersects filters, retains state through edits and moves, and works after restart and archival', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-search-'));
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'db.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Startup timeout')), 5000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
      let output = '';
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
      });
    });
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  const get = async path => (await fetch(base + path)).text();
  const post = (path, fields = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
  });
  const names = html => [...html.matchAll(/<span>([^<]*)<\/span>/g)].map(match => match[1]);
  const path = (prefix, fields) => `${prefix}?${new URLSearchParams(fields)}`;
  const forms = html => [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)].map(match => match[0]);
  try {
    await start();
    for (const name of ['Alpha  Board', 'ALPHA Board', 'Other', 'ÉCHO']) await post('/projects', { name });
    assert.deepEqual(names(await get('/?search=%20aLpHa%20')), ['Alpha  Board', 'ALPHA Board']);
    assert.deepEqual(names(await get('/?search=alpha%20%20board')), ['Alpha  Board']);
    assert.deepEqual(names(await get('/?search=%C3%A9cho')), []);
    assert.deepEqual(names(await get('/?search=%20%20')), ['Alpha  Board', 'ALPHA Board', 'Other', 'ÉCHO']);
    await post('/projects/2/archive', { search: 'alpha' });
    assert.deepEqual(names(await get('/?search=alpha')), ['Alpha  Board']);
    const archivedList = await get('/?filter=Archived&search=alpha');
    assert.deepEqual(names(archivedList), ['ALPHA Board']);
    assert.match(forms(archivedList).find(form => form.includes('id="project-filter"')), /name="search" value="alpha"/);
    assert.match(archivedList, /action="\/projects\/2" method="get"><button type="submit">Open project/);

    for (const title of ['Alpha  task', 'ALPHA task', 'Other task', 'alpha later']) await post('/projects/1/tasks', { title });
    for (const id of [1, 2, 3]) {
      await post(`/projects/1/tasks/${id}/priority`, { priority: 'High' });
      await post(`/projects/1/tasks/${id}/due-date`, { dueDate: '2026-10-10' });
    }
    await post('/projects/1/tasks/2', { completed: '1' });
    assert.deepEqual(names(await get('/projects/1?search=ALpha')), ['Alpha  task', 'ALPHA task', 'alpha later']);
    assert.deepEqual(names(await get('/projects/1?search=alpha%20%20task')), ['Alpha  task']);
    const state = { filter: 'Open', priorityFilter: 'High', dueFrom: '2026-10-10', dueThrough: '2026-10-10', search: 'alpha' };
    const filteredPath = path('/projects/1', state);
    let filtered = await get(filteredPath);
    assert.deepEqual(names(filtered), ['Alpha  task']);
    // Every mutation/filter form carries the applied query. Search itself has
    // one editable query and retains each of the other filter values.
    for (const form of forms(filtered).filter(form => !form.includes('>Projects<'))) {
      assert.match(form, /name="search"/);
      for (const [key, value] of Object.entries(state).filter(([key]) => key !== 'search')) {
        if (form.includes(`name="${key}" value=`)) assert.ok(form.includes(`name="${key}" value="${value}"`));
      }
    }
    async function edit(suffix, fields, expected) {
      const result = await post('/projects/1' + suffix, { ...state, ...fields });
      assert.equal(result.status, 303);
      const location = result.headers.get('location');
      assert.deepEqual(Object.fromEntries(new URL(location, base).searchParams), state);
      assert.deepEqual(names(await get(location)), expected);
    }
    await edit('/rename', { name: 'Renamed source' }, ['Alpha  task']);
    await edit('/default-priority', { priority: 'Low' }, ['Alpha  task']);
    await edit('/tasks', { title: 'Alpha new' }, ['Alpha  task']);
    await edit('/tasks/1/rename', { title: 'No match' }, []);
    await edit('/tasks/1/rename', { title: 'Alpha renamed' }, ['Alpha renamed']);
    await edit('/tasks/1/priority', { priority: 'Normal' }, []);
    await edit('/tasks/1/priority', { priority: 'High' }, ['Alpha renamed']);
    await edit('/tasks/1/due-date', { dueDate: '' }, []);
    await edit('/tasks/1/due-date', { dueDate: '2026-10-10' }, ['Alpha renamed']);
    await edit('/tasks/1', { completed: '1' }, []);
    await edit('/tasks/1', {}, ['Alpha renamed']);
    const invalid = await post('/projects/1/due-range', { ...state, rangeFrom: '2026-02-30' });
    assert.match(await invalid.text(), /Due range must use valid/);
    const rangeResult = await post('/projects/1/due-range', { ...state, rangeFrom: '', rangeThrough: '' });
    assert.equal(new URL(rangeResult.headers.get('location'), base).searchParams.get('search'), 'alpha');
    assert.deepEqual(names(await get(path('/projects/1', { ...state, search: '' }))), ['Alpha renamed', 'Other task']);
    await edit('/tasks/1/move', { destination: '3' }, []);
    await post('/projects/3/tasks/1/move', { destination: '1' });
    assert.deepEqual(names(await get(filteredPath)), ['Alpha renamed']);
    assert.match(await get('/'), /project-summary">1\/5 completed/);
    await post('/projects/1/archive');
    filtered = await get(filteredPath);
    assert.deepEqual(names(filtered), ['Alpha renamed']);
    assert.match(filtered, /name="priority" disabled/);
    assert.match(filtered, /name="destination" disabled/);
    assert.doesNotMatch(forms(filtered).find(form => form.includes('id="task-search"')), /disabled/);
    assert.deepEqual(names(await get('/projects/1?search=other')), ['Other task']);
    await stop();
    await start();
    assert.equal(await get(filteredPath), filtered);
    await post('/projects/1/restore');
    assert.deepEqual(names(await get(filteredPath)), ['Alpha renamed']);
    assert.match(await get('/projects/1'), /id="task-search" name="search" type="text" value=""/);
    assert.match(await get('/'), /id="project-search" name="search" type="text" value=""/);
    const special = await get('/projects/1?search=%22%3C%26');
    assert.match(special, /value="&quot;&lt;&amp;"/);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
