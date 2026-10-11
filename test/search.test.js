import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe']
  });
  const port = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(match[1]);
    });
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Server exited: ${code}`)));
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() { const exited = once(child, 'exit'); child.kill(); await exited; }
  };
}

test('ASCII substring searches intersect filters and survive edits without changing saved data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-search-'));
  let server;
  try {
    const dbPath = join(directory, 'db.sqlite');
    server = await start(dbPath);
    const get = async path => (await fetch(server.url + path)).text();
    const post = async (path, values = {}) => (await fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(values)
    })).text();
    const tasks = html => [...html.matchAll(/aria-label="Complete ([^"]*)"/g)].map(match => match[1]);
    const projects = html => [...html.matchAll(/data-testid="project-row">\s*<span>([^<]*)/g)].map(match => match[1]);
    for (const name of ['Alpha  Board', 'alpha Board', 'Other', 'Ärea']) await post('/projects', { name });
    assert.deepEqual(projects(await get('/?search=%20ALPHA%20')), ['Alpha  Board', 'alpha Board']);
    assert.deepEqual(projects(await get('/?search=alpha%20%20')), ['Alpha  Board', 'alpha Board']); // trailing spaces trimmed
    assert.deepEqual(projects(await get('/?search=alpha%20%20board')), ['Alpha  Board']);
    assert.deepEqual(projects(await get('/?search=ärea')), []); // ASCII-only folding
    await post('/projects/2/archive', { search: 'alpha' });
    assert.deepEqual(projects(await get('/?search=alpha')), ['Alpha  Board']);
    assert.deepEqual(projects(await get('/?filter=Archived&search=ALPHA')), ['alpha Board']);
    assert.match(await get('/?search=alpha'), /name="search" value="alpha"/);
    assert.deepEqual(projects(await get('/')), ['Alpha  Board', 'Other', 'Ärea']);

    for (const title of ['Alpha first', 'Other', 'ALPHA  last', 'Älpha']) await post('/projects/1/tasks', { title });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
    await post('/projects/1/tasks/1', { completed: '1' });
    assert.deepEqual(tasks(await post('/projects/1/search', { query: '  aLpHa  ' })), ['Alpha first', 'ALPHA  last']);
    assert.deepEqual(tasks(await post('/projects/1/search', { query: 'alpha  last' })), ['ALPHA  last']);
    assert.deepEqual(tasks(await post('/projects/1/search', { query: 'älpha' })), []);
    const state = { search: 'alpha', filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-01', dueThrough: '2024-03-01' };
    let html = await post('/projects/1/search', { ...state, query: '  ALPHA ' });
    assert.deepEqual(tasks(html), ['Alpha first']);
    for (const form of html.matchAll(/<form\b[\s\S]*?<\/form>/g)) {
      if (form[0].includes('action="/"')) assert.doesNotMatch(form[0], /name="search"/);
      else assert.match(form[0], /name="search" value="ALPHA"/);
    }
    html = await post('/projects/1/due-range', { ...state, from: '2024-02-29', through: '2024-02-29' });
    assert.deepEqual(tasks(html), ['Alpha first']);
    assert.match(html, /id="task-search"[^>]*value="alpha"/);
    html = await post('/projects/1/due-range', { ...state, from: 'invalid' });
    assert.deepEqual(tasks(html), ['Alpha first']);
    assert.match(html, /Due range must use valid/);
    html = await post('/projects/1/tasks/1/rename', { ...state, title: 'Alpha renamed' });
    assert.deepEqual(tasks(html), ['Alpha renamed']);
    html = await post('/projects/1/rename', { ...state, name: 'New project' });
    assert.deepEqual(tasks(html), ['Alpha renamed']);
    assert.match(html, /id="task-search"[^>]*value="alpha"/);
    html = await post('/projects/1/default-priority', { ...state, priority: 'High' });
    assert.deepEqual(tasks(html), ['Alpha renamed']);
    html = await post('/projects/1/tasks', { ...state, title: 'Alpha new' });
    assert.deepEqual(tasks(html), ['Alpha renamed']);
    html = await post('/projects/1/tasks/1/due-date', { ...state, dueDate: '' });
    assert.deepEqual(tasks(html), []);
    await post('/projects/1/tasks/1/due-date', { ...state, dueDate: '2024-02-29' });
    html = await post('/projects/1/tasks/1/priority', { ...state, priority: 'Low' });
    assert.deepEqual(tasks(html), []);
    await post('/projects/1/tasks/1/priority', { ...state, priority: 'High' });
    html = await post('/projects/1/tasks/1', state);
    assert.deepEqual(tasks(html), []);
    await post('/projects/1/tasks/1', { ...state, completed: '1' });
    html = await post('/projects/1/tasks/1/rename', { ...state, title: 'No match' });
    assert.deepEqual(tasks(html), []);
    await post('/projects/1/tasks/1/rename', { title: 'Alpha returned' });
    html = await post('/projects/1/tasks/1/move', { ...state, destination: '3' });
    assert.deepEqual(tasks(html), []);
    assert.match(html, /id="task-search"[^>]*value="alpha"/);
    await post('/projects/3/tasks/1/move', { destination: '1' });
    assert.deepEqual(tasks(await get('/projects/1')), ['Alpha returned', 'Other', 'ALPHA  last', 'Älpha', 'Alpha new']);
    await post('/projects/1/archive');
    html = await post('/projects/1/search', { ...state, query: 'alpha' });
    assert.deepEqual(tasks(html), ['Alpha returned']);
    assert.match(html, /Archived project/);
    assert.match(html, /id="task-search" name="query" type="text" value="alpha">/);
    html = await post('/projects/1/search', { search: 'alpha', query: '   ' });
    assert.equal(tasks(html).length, 5);
    await server.stop();
    server = await start(dbPath);
    assert.equal(tasks(await get('/projects/1')).length, 5);
    assert.match(await get('/projects/1'), /id="task-search"[^>]*value=""/);
    await post('/projects/1/restore');
    assert.match(await get('/'), /1\/5 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
