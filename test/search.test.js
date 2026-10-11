import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('search intersects filters, folds ASCII only, preserves edits and resets on navigation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-search-'));
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'db.sqlite') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    const base = await new Promise((resolve, reject) => {
      child.stdout.on('data', data => {
        const match = String(data).match(/port (\d+)/);
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
      child.once('error', reject);
      child.once('exit', code => reject(new Error(`Exited ${code}`)));
    });
    const post = (path, values = {}) => fetch(base + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = path => fetch(base + path).then(response => response.text());
    const taskIds = text => [...text.matchAll(/class="completion-form"[^>]*tasks\/(\d+)\/completion/g)].map(m => Number(m[1]));
    const projectIds = text => [...text.matchAll(/method="get" action="\/projects\/(\d+)"/g)].map(m => Number(m[1]));
    for (const name of ['Alpha Board', 'ALPHA  Board', 'Other', 'Ärea']) await post('/projects', { name });
    assert.deepEqual(projectIds(await html('/?search=%20alpha%20')), [1, 2]);
    assert.deepEqual(projectIds(await html('/?search=alpha%20board')), [1]);
    assert.deepEqual(projectIds(await html('/?search=%C3%A4rea')), []);
    assert.deepEqual(projectIds(await html('/?search=%20')), [1, 2, 3, 4]);
    await post('/projects/2/archive', { search: 'alpha' });
    assert.deepEqual(projectIds(await html('/?search=alpha')), [1]);
    assert.deepEqual(projectIds(await html('/?filter=Archived&search=alpha')), [2]);
    assert.match(await html('/?search=alpha'), /name="search" value="alpha"/);
    for (const title of ['Alpha one', 'ALPHA  two', 'Other', 'Alpha three']) await post('/projects/1/tasks', { title });
    for (const id of [1, 2, 4]) {
      await post(`/projects/1/tasks/${id}/priority`, { priority: 'High' });
      await post(`/projects/1/tasks/${id}/due-date`, { dueDate: '2024-02-29' });
    }
    await post('/projects/1/tasks/2/completion', { completed: '1' });
    const selection = { search: '  ALPHA ', filter: 'Open', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-02-29' };
    const path = '/projects/1?' + new URLSearchParams(selection);
    assert.deepEqual(taskIds(await html(path)), [1, 4]);
    assert.deepEqual(taskIds(await html('/projects/1?search=alpha%20two')), []);
    const follow = async (endpoint, values) => {
      const response = await post('/projects/1' + endpoint, { ...selection, ...values });
      assert.equal(response.status, 303);
      const location = response.headers.get('location');
      const params = new URL(location, base).searchParams;
      assert.equal(params.get('search'), 'ALPHA');
      for (const field of ['filter', 'priorityFilter', 'dueFrom', 'dueThrough']) assert.equal(params.get(field), selection[field]);
      return taskIds(await html(location));
    };
    assert.deepEqual(await follow('/rename', { name: 'Renamed' }), [1, 4]);
    assert.deepEqual(await follow('/default-priority', { priority: 'Low' }), [1, 4]);
    assert.deepEqual(await follow('/tasks', { title: 'Alpha new' }), [1, 4]);
    const invalid = await post('/projects/1/due-range', { ...selection, from: 'bad' });
    assert.equal(invalid.status, 400);
    assert.deepEqual(taskIds(await invalid.text()), [1, 4]);
    assert.deepEqual(await follow('/tasks/1/rename', { title: 'No match' }), [4]);
    assert.deepEqual(await follow('/tasks/4/completion', { completed: '1' }), []);
    await post('/projects/1/tasks/4/completion');
    assert.deepEqual(await follow('/tasks/4/priority', { priority: 'Normal' }), []);
    await post('/projects/1/tasks/4/priority', { priority: 'High' });
    assert.deepEqual(await follow('/tasks/4/due-date', { dueDate: '' }), []);
    await post('/projects/1/tasks/4/due-date', { dueDate: '2024-02-29' });
    assert.deepEqual(await follow('/tasks/4/move', { destination: '3' }), []);
    await post('/projects/3/tasks/4/move', { destination: '1' });
    assert.deepEqual(taskIds(await html(path)), [4]);
    await post('/projects/1/archive');
    const archived = await html(path);
    assert.match(archived, /<button type="submit">Search tasks<\/button>/);
    assert.match(archived, /id="task-search"[^>]*value="ALPHA">/);
    assert.deepEqual(taskIds(await html('/projects/1')), [1, 2, 3, 4, 5]);
    assert.match(await html('/projects/1'), /id="task-search"[^>]*value="">/);
    assert.match(await html('/'), /id="project-search"[^>]*value="">/);
    assert.match(await html('/?filter=Archived'), /1\/5 completed/);
  } finally {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    await rm(directory, { recursive: true, force: true });
  }
});
