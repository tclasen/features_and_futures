import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const port = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Server exited: ${code}`)));
    child.stdout.on('data', data => {
      const match = /listening on port (\d+)/.exec(data.toString());
      if (match) resolve(match[1]);
    });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() { const exit = once(child, 'exit'); child.kill(); await exit; },
  };
}

const names = (html, kind) => [...html.matchAll(new RegExp(`data-testid="${kind}-row">\\s*<span>(.*?)</span>`, 'g'))].map(match => match[1]);

test('search intersects filters, uses ASCII case folding, and stays applied through mutations', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-search-'));
  let server;
  try {
    const dbPath = join(dir, 'db.sqlite');
    server = await start(dbPath);
    const get = path => fetch(server.url + path).then(response => response.text());
    const post = (path, data) => fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
    });
    const follow = async response => get(response.headers.get('location'));
    for (const name of ['Alpha  Board', 'alpha Board', 'Älpha Board']) await post('/projects', { name });
    assert.deepEqual(names(await get('/?search=%20ALPHA%20'), 'project'), ['Alpha  Board', 'alpha Board']);
    assert.deepEqual(names(await get('/?search=alpha%20%20b'), 'project'), ['Alpha  Board', 'alpha Board']);
    assert.deepEqual(names(await get('/?search=älpha'), 'project'), []);
    await post('/projects/2/archive', {});
    assert.deepEqual(names(await get('/?search=ALPHA'), 'project'), ['Alpha  Board']);
    assert.deepEqual(names(await get('/?filter=Archived&search=ALPHA'), 'project'), ['alpha Board']);
    assert.match(await get('/?search=ALPHA'), /name="search" value="ALPHA"/);
    assert.deepEqual(names(await get('/'), 'project'), ['Alpha  Board', 'Älpha Board']);
    for (const title of ['Ship  NOW', 'ship now', 'Other']) await post('/projects/1/tasks', { title });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/2/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2028-02-29' });
    await post('/projects/1/tasks/2/due-date', { dueDate: '2028-03-01' });
    const state = { filter: 'Open', priorityFilter: 'High', dueFrom: '2028-02-29', dueThrough: '2028-03-01', search: 'SHIP' };
    const location = '/projects/1?' + new URLSearchParams(state);
    assert.deepEqual(names(await get(location), 'task'), ['Ship  NOW', 'ship now']);
    assert.deepEqual(names(await get('/projects/1?search=ship%20%20n'), 'task'), ['Ship  NOW', 'ship now']);
    let content = await follow(await post('/projects/1/tasks/1/rename', { ...state, title: 'Other now' }));
    assert.deepEqual(names(content, 'task'), ['ship now']);
    assert.match(content, /name="search" value="SHIP"/);
    content = await follow(await post('/projects/1/rename', { ...state, name: 'Renamed board' }));
    assert.deepEqual(names(content, 'task'), ['ship now']);
    assert.match(content, /<h1>Renamed board<\/h1>/);
    const invalid = await (await post('/projects/1/tasks/2/rename', { ...state, title: '  ' })).text();
    assert.deepEqual(names(invalid, 'task'), ['ship now']);
    content = await follow(await post('/projects/1/default-priority', { ...state, priority: 'High' }));
    assert.deepEqual(names(content, 'task'), ['ship now']);
    content = await follow(await post('/projects/1/tasks/2/due-date', { ...state, dueDate: '2028-03-02' }));
    assert.deepEqual(names(content, 'task'), []);
    content = await follow(await post('/projects/1/tasks/2/due-date', { ...state, dueDate: '2028-02-29' }));
    assert.deepEqual(names(content, 'task'), ['ship now']);
    content = await follow(await post('/projects/1/tasks/2', { ...state, completed: '1' }));
    assert.deepEqual(names(content, 'task'), []);
    const all = { ...state, filter: 'All' };
    content = await (await post('/projects/1/due-range', { ...all, rangeFrom: 'bad', rangeThrough: '' })).text();
    assert.deepEqual(names(content, 'task'), ['ship now']);
    assert.match(content, /Due range must use valid/);
    content = await follow(await post('/projects/1/tasks/2/priority', { ...all, priority: 'Low' }));
    assert.deepEqual(names(content, 'task'), []);
    const moving = { ...all, priorityFilter: 'All' };
    content = await follow(await post('/projects/1/tasks/2/move', { ...moving, destination: '3' }));
    assert.deepEqual(names(content, 'task'), []);
    assert.match(content, /name="search" value="SHIP"/);
    await post('/projects/3/tasks/2/move', { destination: '1' });
    assert.deepEqual(names(await get('/projects/1'), 'task'), ['Other now', 'ship now', 'Other']);
    content = await follow(await post('/projects/1/tasks', { ...state, title: 'Unrelated' }));
    assert.deepEqual(names(content, 'task'), []);
    await post('/projects/1/archive', {});
    content = await get('/projects/1?search=SHIP');
    assert.deepEqual(names(content, 'task'), ['ship now']);
    assert.match(content, /id="task-search" name="search" value="SHIP" autocomplete="off">/);
    assert.match(content, /aria-label="Complete ship now" checked disabled/);
    assert.match(await get('/?filter=Archived&search=Renamed'), /1\/4 completed/);
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual(names(await get('/projects/1?search=SHIP'), 'task'), ['ship now']);
    assert.deepEqual(names(await get('/projects/1'), 'task'), ['Other now', 'ship now', 'Other', 'Unrelated']);
  } finally {
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('search collapses only spaces and tabs without rewriting persistent names or titles', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-search-spaces-'));
  let server;
  try {
    const dbPath = join(dir, 'db.sqlite');
    server = await start(dbPath);
    const get = path => fetch(server.url + path).then(response => response.text());
    const post = (path, data) => fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
    });
    const originals = ['MiXeD \t  Board', 'mixed Board', 'Mixed\u00a0Board', 'Mixed\nBoard'];
    for (const name of originals) await post('/projects', { name });
    for (const title of originals) await post('/projects/1/tasks', { title });
    const query = ' \t MIXED\t \t bOaRd \n';
    const projectPath = '/?' + new URLSearchParams({ search: query });
    const taskPath = '/projects/1?' + new URLSearchParams({ search: query });
    // Line breaks and non-ASCII spaces must not collapse into ASCII spaces.
    assert.deepEqual(names(await get(projectPath), 'project'), originals.slice(0, 2));
    assert.deepEqual(names(await get(taskPath), 'task'), originals.slice(0, 2));
    assert.match(await get(taskPath), /<h1>MiXeD \t  Board<\/h1>/);
    await post('/projects/2/archive', {});
    assert.deepEqual(names(await get(projectPath), 'project'), [originals[0]]);
    assert.deepEqual(names(await get('/?' + new URLSearchParams({ filter: 'Archived', search: query })), 'project'), [originals[1]]);
    await post('/projects/1/archive', {});
    assert.deepEqual(names(await get(taskPath), 'task'), originals.slice(0, 2));
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual(names(await get(taskPath), 'task'), originals.slice(0, 2));
    // Inspect the full HTML because the row helper deliberately excludes newlines.
    const tasks = await get('/projects/1');
    const projects = await get('/?filter=Archived');
    for (const title of originals) assert.ok(tasks.includes(`<span>${title}</span>`));
    assert.ok(projects.includes(`<span>${originals[0]}</span>`));
    assert.ok(projects.includes(`<span>${originals[1]}</span>`));
    await post('/projects/1/restore', {});
    assert.deepEqual(names(await get(projectPath), 'project'), [originals[0]]);
  } finally {
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
