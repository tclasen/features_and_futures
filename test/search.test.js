import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('search intersects filters, retains state through edits and moves, and resets on reopening', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-search-'));
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'db.sqlite') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    const base = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', () => reject(new Error('Server exited')));
      child.stdout.on('data', (data) => {
        const port = String(data).match(/port (\d+)/);
        if (port) resolve(`http://127.0.0.1:${port[1]}`);
      });
    });
    const post = (path, data = {}) => fetch(base + path, {
      method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
    });
    const get = async (path) => (await fetch(base + path)).text();
    const rows = (html) => [...html.matchAll(/aria-label="Complete ([^"]+)"/g)].map((m) => m[1]);
    const projects = (html) => [...html.matchAll(/data-testid="project-row">\s*<span>([^<]+)<\/span>/g)].map((m) => m[1]);
    for (const name of ['Alpha  Team', 'ALPHA team', 'Älpha', 'Other']) await post('/projects', { name });
    assert.deepEqual(projects(await get('/?search=%20aLpHa%20')), ['Alpha  Team', 'ALPHA team']);
    assert.deepEqual(projects(await get('/?search=alpha%20team')), ['Alpha  Team', 'ALPHA team']);
    assert.deepEqual(projects(await get('/?search=älpha')), []);
    await post('/projects/2/archive', { search: 'alpha' });
    assert.deepEqual(projects(await get('/?search=alpha')), ['Alpha  Team']);
    assert.deepEqual(projects(await get('/?filter=Archived&search=alpha')), ['ALPHA team']);
    assert.match(await get('/?search=alpha'), /name="search" value="alpha"/);
    assert.equal(projects(await get('/')).length, 3);

    for (const title of ['Plan  One', 'PLAN Two', 'Other', 'ÄPLAN']) await post('/projects/1/tasks', { title });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
    await post('/projects/1/tasks/1', { completed: '1' });
    assert.deepEqual(rows(await get('/projects/1?search=%20plan%20')), ['Plan  One', 'PLAN Two', 'ÄPLAN']);
    assert.deepEqual(rows(await get('/projects/1?search=plan%20one')), ['Plan  One']);
    const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-02-29', search: 'plan' };
    const location = '/projects/1?' + new URLSearchParams(state);
    assert.deepEqual(rows(await get(location)), ['Plan  One']);
    // Every edit form carries the query, while search carries the other applied filters.
    const html = await get(location);
    for (const form of html.matchAll(/<form[^>]*>([\s\S]*?)<\/form>/g)) {
      if (!form[0].includes('action="/"') && !form[0].includes('/export"')) {
        assert.match(form[1], /name="search"[^>]*value="plan"/);
      }
    }
    for (const [endpoint, data] of [
      ['rename', { name: 'Renamed project' }],
      ['default-priority', { priority: 'Low' }],
      ['tasks', { title: 'Plan new' }],
      ['tasks/1/rename', { title: 'Plan renamed' }],
      ['tasks/1/due-date', { dueDate: '2024-02-29' }],
      ['tasks/1/priority', { priority: 'High' }],
      ['tasks/1', { completed: '1' }],
      ['due-range', { rangeFrom: '2024-02-29', rangeThrough: '2024-02-29' }],
    ]) {
      const response = await post(`/projects/1/${endpoint}`, { ...state, ...data });
      assert.equal(response.headers.get('location'), location);
    }
    assert.deepEqual(rows(await get(location)), ['Plan renamed']);
    let response = await post('/projects/1/tasks/1/rename', { ...state, title: 'No match' });
    assert.deepEqual(rows(await get(response.headers.get('location'))), []);
    response = await post('/projects/1/tasks/1/rename', { ...state, title: 'Plan returned' });
    assert.deepEqual(rows(await get(response.headers.get('location'))), ['Plan returned']);
    response = await post('/projects/1/tasks/1/move', { ...state, destination: '4' });
    assert.equal(response.headers.get('location'), location);
    assert.deepEqual(rows(await get(location)), []);
    await post('/projects/4/tasks/1/move', { destination: '1' });
    assert.deepEqual(rows(await get('/projects/1?search=plan')), ['Plan returned', 'PLAN Two', 'ÄPLAN', 'Plan new']);
    assert.match(await get('/'), /project-summary">1\/5 completed/);
    await post('/projects/1/archive');
    const archived = await get(location);
    assert.deepEqual(rows(archived), ['Plan returned']);
    assert.match(archived, /id="task-search"[^>]*value="plan">/);
    assert.match(archived, /aria-label="Complete Plan returned" checked disabled/);
    await post('/projects/1/restore');
    const reopened = await get('/projects/1');
    assert.match(reopened, /id="task-search"[^>]*value="">/);
    assert.equal(rows(reopened).length, 5);
  } finally {
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGTERM');
    await exited;
    await rm(directory, { recursive: true, force: true });
  }
});
