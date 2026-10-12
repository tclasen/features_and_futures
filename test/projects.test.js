import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

async function start(dbPath) {
  const process = spawn(globalThis.process.execPath, ['server.js'], {
    env: { ...globalThis.process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  const base = await new Promise((resolve, reject) => {
    process.on('error', reject);
    process.on('exit', code => reject(new Error(`Server exited: ${code}`)));
    process.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
  });
  return { base, async stop() { const exited = once(process, 'exit'); process.kill('SIGTERM'); await exited; } };
}

test('task rename preserves ownership, order, completion, filters and persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  const database = join(directory, 'projects.sqlite');
  let server;
  try {
    server = await start(database);
    const post = (path, fields = {}) => fetch(server.base + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual'
    });
    const get = async path => (await fetch(server.base + path)).text();
    await post('/projects', { name: 'One' });
    await post('/projects', { name: 'Two' });
    await post('/projects/1/tasks', { title: 'Original' });
    await post('/projects/1/tasks', { title: 'Second' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const initial = await get('/projects/1');
    assert.match(initial, /<label for="new-task-title-1">New task title/);
    assert.equal((initial.match(/>Rename task<\/button>/g) || []).length, 2);
    for (const title of ['', '   ']) {
      const response = await post('/projects/1/tasks/1/rename', { title, filter: 'Completed' });
      assert.equal(response.status, 422);
      const html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.match(html, /aria-label="Complete Original" checked/);
      assert.match(html, /<option selected>Completed/);
      assert.equal(await get('/projects/1'), initial);
    }
    assert.equal((await post('/projects/2/tasks/1/rename', { title: 'Wrong owner' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/rename', { title: 'Missing' })).status, 404);
    assert.equal((await post('/projects/999/tasks/1/rename', { title: 'Missing' })).status, 404);
    const response = await post('/projects/1/tasks/1/rename', { title: '  <Renamed & task>  ', filter: 'Completed' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1?filter=Completed');
    const detail = await get('/projects/1');
    assert.match(detail, /aria-label="Complete &lt;Renamed &amp; task&gt;" checked/);
    assert.ok(detail.indexOf('&lt;Renamed &amp; task&gt;') < detail.indexOf('Complete Second'));
    assert.doesNotMatch(detail, /Original/);
    assert.doesNotMatch(await get('/projects/1?filter=Open'), /Renamed/);
    assert.match(await get('/projects/1?filter=Completed'), /Renamed/);
    assert.doesNotMatch(await get('/projects/2'), /Renamed/);
    assert.match(await get('/'), /1\/2 completed/);
    await server.stop();
    server = await start(database);
    assert.equal(await get('/projects/1'), detail);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.match(archived, /id="new-task-title-1"[^>]* disabled/);
    assert.match(archived, /id="new-task-title-2"[^>]* disabled/);
    assert.equal((archived.match(/disabled>Rename task/g) || []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Blocked' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), detail);
    await post('/projects/1/tasks/2/rename', { title: '  Restored title  ', filter: 'Open' });
    await server.stop();
    server = await start(database);
    const restored = await get('/projects/1');
    assert.match(restored, /aria-label="Complete Restored title" onchange/);
    assert.match(restored, /aria-label="Complete &lt;Renamed &amp; task&gt;" checked/);
    assert.match(await get('/'), /1\/2 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('rename preserves identity, order, tasks, summaries, and persists after restoration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const database = join(directory, 'projects.sqlite');
  let server;
  try {
    server = await start(database);
    const post = (path, fields = {}) => fetch(server.base + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual'
    });
    const get = async path => (await fetch(server.base + path)).text();
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1', { completed: '1' });
    assert.match(await get('/projects/1'), /<label for="new-project-name">New project name/);
    for (const name of ['', '   ']) {
      const response = await post('/projects/1/rename', { name });
      assert.equal(response.status, 422);
      const html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.match(html, /<h1>Original<\/h1>/);
    }
    const renamed = await post('/projects/1/rename', { name: '  <Renamed & project>  ', filter: 'Completed' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const listing = await get('/');
    assert.ok(listing.indexOf('&lt;Renamed &amp; project&gt;') < listing.indexOf('Second'));
    assert.match(listing, /1\/2 completed/);
    assert.match(listing, /action="\/projects\/1"/);
    const detail = await get('/projects/1');
    assert.match(detail, /<h1>&lt;Renamed &amp; project&gt;<\/h1>/);
    assert.match(detail, /aria-label="Complete Done" checked/);
    assert.match(detail, /aria-label="Complete Pending"/);
    await server.stop();
    server = await start(database);
    assert.equal(await get('/'), listing);
    assert.equal(await get('/projects/1'), detail);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.match(archived, /id="new-project-name"[^>]* disabled/);
    assert.match(archived, /disabled>Rename project/);
    assert.equal((await post('/projects/1/rename', { name: 'Blocked' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.doesNotMatch(await get('/projects/1'), / disabled/);
    await post('/projects/1/rename', { name: 'Restored name' });
    await server.stop();
    server = await start(database);
    assert.match(await get('/projects/1'), /<h1>Restored name<\/h1>/);
    assert.match(await get('/projects/1'), /aria-label="Complete Done" checked/);
    assert.match(await get('/'), /1\/2 completed/);
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, isolate projects, and persist completion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  let server;
  try {
    const database = join(directory, 'tasks.sqlite');
    server = await start(database);
    const post = (path, fields) => fetch(server.base + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual'
    });
    const get = async path => (await fetch(server.base + path)).text();
    const count = html => (html.match(/data-testid="task-row"/g) || []).length;
    await post('/projects', { name: 'One' });
    await post('/projects', { name: 'Two' });
    const initial = await get('/projects/1');
    assert.match(initial, /<label for="task-title">Task title/);
    assert.match(initial, /<label for="task-filter">Task filter/);
    assert.match(initial, /<option selected>All/);
    for (const title of ['', '   ']) {
      const invalid = await post('/projects/1/tasks', { title });
      assert.equal(invalid.status, 422);
      const html = await invalid.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(count(html), 0);
    }
    assert.equal((await post('/projects/1/tasks', { title: '  First task  ' })).status, 303);
    await post('/projects/1/tasks', { title: '<Second & task>' });
    let all = await get('/projects/1');
    assert.equal(count(all), 2);
    assert.ok(all.indexOf('First task') < all.indexOf('&lt;Second &amp; task&gt;'));
    assert.match(all, /aria-label="Complete First task"/);
    assert.doesNotMatch(all, / checked/);
    assert.equal(count(await get('/projects/1?filter=Completed')), 0);
    assert.equal(count(await get('/projects/1?filter=Open')), 2);
    assert.equal(count(await get('/projects/2')), 0);
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    await post('/projects/1/tasks/1', { completed: '1', filter: 'All' });
    all = await get('/projects/1');
    assert.match(all, /aria-label="Complete First task" checked/);
    const completed = await get('/projects/1?filter=Completed');
    assert.equal(count(completed), 1);
    assert.match(completed, /Complete First task/);
    const open = await get('/projects/1?filter=Open');
    assert.equal(count(open), 1);
    assert.doesNotMatch(open, /Complete First task/);
    await server.stop();
    server = await start(database);
    assert.equal(await get('/projects/1'), all);
    assert.equal(await get('/projects/1?filter=Completed'), completed);
    await post('/projects/1/tasks/1', {});
    assert.equal(count(await get('/projects/1?filter=Completed')), 0);
    assert.equal(count(await get('/projects/1?filter=Open')), 2);
    await server.stop();
    server = await start(database);
    assert.equal(count(await get('/projects/1?filter=Completed')), 0);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive migration, summaries, read-only tasks, and restoration persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const database = join(directory, 'projects.sqlite');
  // Simulate the schema and data from the previous checkpoint.
  const db = new DatabaseSync(database);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    INSERT INTO projects (name) VALUES ('Existing');`);
  db.close();
  let server;
  try {
    server = await start(database);
    const post = (path, fields = {}) => fetch(server.base + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual'
    });
    const get = async path => (await fetch(server.base + path)).text();
    const rows = html => (html.match(/data-testid="project-row"/g) || []).length;
    let active = await get('/');
    assert.match(active, /<option selected>Active/);
    assert.match(active, /data-testid="project-summary">0\/0 completed/);
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1', { completed: '1' });
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    assert.equal((await post('/projects/1/archive')).status, 303);
    assert.equal(rows(await get('/')), 1);
    const archived = await get('/?filter=Archived');
    assert.equal(rows(archived), 1);
    assert.match(archived, /Existing/);
    assert.match(archived, /Restore project/);
    assert.match(archived, /Open project/);
    assert.match(archived, /1\/2 completed/);
    const detail = await get('/projects/1');
    assert.match(detail, /<p>Archived project<\/p>/);
    assert.match(detail, /disabled>Create task/);
    assert.match(detail, /aria-label="Complete Done" checked disabled/);
    assert.match(detail, /aria-label="Complete Pending" disabled/);
    assert.doesNotMatch(await get('/projects/1?filter=Open'), /Complete Done/);
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /Complete Pending/);
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1')).status, 403);
    await server.stop();
    server = await start(database);
    assert.equal(await get('/?filter=Archived'), archived);
    assert.equal(await get('/projects/1'), detail);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.equal(rows(await get('/?filter=Archived')), 0);
    active = await get('/');
    assert.equal(rows(active), 2);
    assert.ok(active.indexOf('Existing') < active.indexOf('Second'));
    assert.match(active, /1\/2 completed/);
    const restored = await get('/projects/1');
    assert.doesNotMatch(restored, / disabled/);
    assert.match(restored, /aria-label="Complete Done" checked/);
    await server.stop();
    server = await start(database);
    assert.equal(await get('/'), active);
    assert.equal(await get('/projects/1'), restored);
    await post('/projects/1/tasks/1');
    assert.match(await get('/'), /0\/2 completed/);
    await post('/projects/1/tasks', { title: 'New' });
    assert.match(await get('/'), /0\/3 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('projects validate, navigate, escape names, and survive restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const database = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await start(database);
    const get = path => fetch(server.base + path);
    const create = name => fetch(server.base + '/projects', {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual'
    });
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.match(await (await get('/')).text(), /<h1>Workboard<\/h1>/);
    const invalid = await create('   ');
    assert.equal(invalid.status, 422);
    const invalidHtml = await invalid.text();
    assert.match(invalidHtml, /role="alert">Project name is required/);
    assert.doesNotMatch(invalidHtml, /data-testid="project-row"/);
    assert.equal((await create('  First project  ')).status, 303);
    assert.equal((await create('<Second & project>')).status, 303);
    const listing = await (await get('/')).text();
    assert.equal((listing.match(/data-testid="project-row"/g) || []).length, 2);
    assert.ok(listing.indexOf('First project') < listing.indexOf('&lt;Second &amp; project&gt;'));
    assert.match(listing, /action="\/projects\/1"/);
    const detail = await (await get('/projects/1')).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*>Projects<\/button>/);
    await server.stop();
    server = await start(database);
    assert.equal(await (await get('/')).text(), listing);
    assert.equal(await (await get('/projects/1')).text(), detail);
    assert.equal((await get('/projects/999')).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
