import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('ASCII substring searches intersect filters, survive edits and reset on navigation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-search-'));
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'data.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    base = await new Promise((resolve, reject) => {
      let output = '';
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
      child.on('error', reject);
      child.on('exit', code => reject(new Error(`Server exited: ${code}`)));
    });
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = null;
  }
  const get = async path => (await fetch(base + path)).text();
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const rows = body => [...body.matchAll(/aria-label="Complete ([^"]+)"/g)].map(match => match[1]);
  const projectNames = body => [...body.matchAll(/data-testid="project-row">\s*<span>(.*?)<\/span>/g)].map(match => match[1]);
  try {
    await start();
    for (const name of ['Alpha  Team', 'alpha Team', 'ALPHA archive', 'Älpha', 'Other']) {
      await post('/projects', { name });
    }
    await post('/projects/3/archive');
    assert.deepEqual(projectNames(await get('/?search=%20aLPHa%20')), ['Alpha  Team', 'alpha Team']);
    assert.deepEqual(projectNames(await get('/?search=alpha%20%20team')), ['Alpha  Team']);
    assert.deepEqual(projectNames(await get('/?search=%C3%A4lpha')), []);
    assert.deepEqual(projectNames(await get('/?search=%C3%84lpha')), ['Älpha']);
    assert.deepEqual(projectNames(await get('/?filter=Archived&search=ALPHA')), ['ALPHA archive']);
    let body = await get('/?search=alpha');
    assert.match(body, /id="project-search" name="search" type="text" value="alpha"/);
    assert.match(body, /action="\/">\s*<input type="hidden" name="search" value="alpha">\s*<label for="project-filter">/);
    assert.match(body, /action="\/projects\/1"><button type="submit">Open project/);
    const archived = await post('/projects/1/archive', { filter: 'Active', search: ' alpha ' });
    assert.equal(archived.headers.get('location'), '/?filter=Active&search=alpha');
    const restored = await post('/projects/1/restore', { filter: 'Archived', search: 'alpha' });
    assert.equal(restored.headers.get('location'), '/?filter=Archived&search=alpha');
    const invalidProject = await post('/projects', { filter: 'Active', search: 'alpha', name: ' ' });
    assert.deepEqual(projectNames(await invalidProject.text()), ['Alpha  Team', 'alpha Team']);

    for (const title of ['Match First', 'mATCH Second', 'Match  Space', 'Other', 'ÄMatch']) {
      await post('/projects/1/tasks', { title });
    }
    for (const id of [1, 2, 3]) {
      await post(`/projects/1/tasks/${id}/priority`, { priority: 'High' });
      await post(`/projects/1/tasks/${id}/due-date`, { dueDate: '2024-02-29' });
    }
    await post('/projects/1/tasks/2', { completed: '1' });
    const state = { filter: 'Open', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-02-29', search: 'match' };
    const location = '/projects/1?filter=Open&priorityFilter=High&dueFrom=2024-02-29&dueThrough=2024-02-29&search=match';
    const summary = await get('/');
    assert.deepEqual(rows(await get(location)), ['Match First', 'Match  Space']);
    assert.deepEqual(rows(await get(location.replace('Open', 'Completed'))), ['mATCH Second']);
    assert.deepEqual(rows(await get(location.replace('High', 'Normal'))), []);
    assert.deepEqual(rows(await get('/projects/1?search=match%20%20space')), ['Match  Space']);
    assert.equal(rows(await get('/projects/1?search=%20%20')).length, 5);
    assert.deepEqual(rows(await get('/projects/1?search=%C3%A4match')), []);
    body = await get(location);
    // Both comboboxes retain the query and applied range; search retains the other filters.
    assert.match(body, /name="search" value="match">\s*<label for="task-filter">/);
    assert.match(body, /id="task-search" name="search" type="text" value="match"/);
    assert.match(body, /action="\/projects\/1">\s*<input type="hidden" name="filter" value="Open">\s*<input type="hidden" name="priorityFilter" value="High">/);
    assert.match(body, /action="\/"><button type="submit">Projects/);
    assert.equal(await get('/'), summary);
    for (const [path, values] of [
      ['/projects/1/rename', { name: 'Renamed project' }],
      ['/projects/1/default-priority', { priority: 'Low' }],
      ['/projects/1/tasks', { title: 'Match undated' }],
      ['/projects/1/tasks/1/rename', { title: ' MATCH Renamed ' }],
    ]) {
      const result = await post(path, { ...state, ...values });
      assert.equal(result.headers.get('location'), location);
    }
    assert.deepEqual(rows(await get(location)), ['MATCH Renamed', 'Match  Space']);
    for (const [path, values, alert] of [
      ['/projects/1/rename', { name: ' ' }, 'Project name is required'],
      ['/projects/1/tasks', { title: ' ' }, 'Task title is required'],
      ['/projects/1/tasks/1/rename', { title: ' ' }, 'Task title is required'],
      ['/projects/1/tasks/1/due-date', { dueDate: 'bad' }, 'Due date must be'],
      ['/projects/1/due-range', { from: 'bad' }, 'Due range must use'],
    ]) {
      const invalid = await post(path, { ...state, ...values });
      body = await invalid.text();
      assert.match(body, new RegExp(`role="alert">${alert}`));
      assert.deepEqual(rows(body), ['MATCH Renamed', 'Match  Space']);
      assert.match(body, /id="task-search" name="search" type="text" value="match"/);
    }
    await post('/projects/1/tasks/1/rename', { ...state, title: 'No longer fits' });
    assert.deepEqual(rows(await get(location)), ['Match  Space']);
    await post('/projects/1/tasks/1/rename', { ...state, title: 'Match returned' });
    for (const [path, values] of [
      ['/projects/1/tasks/1/priority', { priority: 'Low' }],
      ['/projects/1/tasks/1', { completed: '1' }],
      ['/projects/1/tasks/1/due-date', { dueDate: '' }],
    ]) {
      const result = await post(path, { ...state, ...values });
      assert.equal(result.headers.get('location'), location);
      assert.deepEqual(rows(await get(location)), ['Match  Space']);
    }
    await post('/projects/1/tasks/1/priority', { ...state, priority: 'High' });
    await post('/projects/1/tasks/1', state);
    await post('/projects/1/tasks/1/due-date', { ...state, dueDate: '2024-02-29' });
    const moved = await post('/projects/1/tasks/1/move', { ...state, destination: '2' });
    assert.equal(moved.headers.get('location'), location);
    assert.deepEqual(rows(await get(location)), ['Match  Space']);
    assert.deepEqual(rows(await get('/projects/2?search=match')), ['Match returned']);
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(rows(await get(location)), ['Match returned', 'Match  Space']);
    await post('/projects/1/archive');
    body = await get(location);
    assert.deepEqual(rows(body), ['Match returned', 'Match  Space']);
    assert.match(body, /id="task-search" name="search" type="text" value="match">/);
    assert.match(body, /<button type="submit">Search tasks<\/button>/);
    assert.match(body, /disabled>Rename task/);
    assert.deepEqual(rows(await get(location.replace('&search=match', '&search=space'))), ['Match  Space']);
    await stop();
    await start();
    assert.deepEqual(rows(await get(location)), ['Match returned', 'Match  Space']);
    await post('/projects/1/restore');
    body = await get('/projects/1');
    assert.equal(rows(body).length, 6);
    assert.match(body, /id="task-search" name="search" type="text" value="">/);
    assert.match(await get('/'), /id="project-search" name="search" type="text" value="">/);
    // Query metacharacters round-trip safely through hidden fields and redirect URLs.
    const special = await post('/projects/1/rename', { ...state, search: ' &"<+ ', name: 'Final' });
    assert.ok(special.headers.get('location').endsWith('&search=%26%22%3C%2B'));
    body = await get(special.headers.get('location'));
    assert.match(body, /name="search" value="&amp;&quot;&lt;\+"/);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
