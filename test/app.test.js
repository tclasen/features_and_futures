import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function launch(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const base = await new Promise((resolvePort, reject) => {
    let output = '';
    child.on('error', reject);
    child.on('exit', (code) => reject(new Error(`Server exited: ${code}`)));
    child.stdout.on('data', (data) => {
      output += data;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolvePort(`http://127.0.0.1:${match[1]}`);
    });
  });
  return {
    base,
    async stop() {
      const exited = new Promise((done) => child.once('exit', done));
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('tasks validate, filter, remain project-scoped, and persist completion', async () => {
  const directory = await mkdtemp(resolve('data-test-'));
  let server;
  try {
    const dbPath = resolve(directory, 'test.sqlite');
    server = await launch(dbPath);
    const get = async (path) => (await fetch(server.base + path)).text();
    const post = (path, values) => fetch(server.base + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    let html = await get('/projects/1');
    assert.match(html, /<label for="task-title">Task title<\/label>/);
    assert.match(html, />Create task<\/button>/);
    assert.match(html, /<label for="task-filter">Task filter<\/label>/);
    assert.match(html, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', '   ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.doesNotMatch(html, /data-testid="task-row"/);
    }
    assert.equal((await post('/projects/1/tasks', { title: '  One & <task>  ' })).status, 303);
    await post('/projects/1/tasks', { title: 'Two' });
    html = await get('/projects/1');
    assert.equal((html.match(/data-testid="task-row"/g) || []).length, 2);
    assert.ok(html.indexOf('One &amp; &lt;task&gt;') < html.indexOf('Complete Two'));
    assert.match(html, /aria-label="Complete One &amp; &lt;task&gt;"/);
    assert.doesNotMatch(html, / checked/);
    assert.doesNotMatch(await get('/projects/2'), /data-testid="task-row"/);
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1', { completed: '1' })).status, 303);
    html = await get('/projects/1?filter=Completed');
    assert.match(html, /aria-label="Complete One &amp; &lt;task&gt;" checked/);
    assert.doesNotMatch(html, /Complete Two/);
    const open = await get('/projects/1?filter=Open');
    assert.match(open, /Complete Two/);
    assert.doesNotMatch(open, /Complete One/);
    const saved = await get('/projects/1');
    await server.stop();
    server = await launch(dbPath);
    assert.equal(await get('/projects/1'), saved);
    assert.equal(await get('/projects/1?filter=Completed'), html);
    await post('/projects/1/tasks/1', {});
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /data-testid="task-row"/);
    assert.equal(((await get('/projects/1?filter=Open')).match(/data-testid="task-row"/g) || []).length, 2);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('projects validate, render safely, navigate, and survive a restart', async () => {
  const directory = await mkdtemp(resolve('data-test-'));
  let server;
  try {
    const dbPath = resolve(directory, 'test.sqlite');
    server = await launch(dbPath);
    const get = (path) => fetch(server.base + path);
    const create = (name) => fetch(server.base + '/projects', {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    let html = await (await get('/')).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, />Create project<\/button>/);
    for (const name of ['', '   ']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    assert.equal((await create('  First & <project>  ')).status, 303);
    assert.equal((await create('Second')).status, 303);
    html = await (await get('/')).text();
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.ok(html.indexOf('First &amp; &lt;project&gt;') < html.indexOf('Second'));
    const paths = [...html.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
    const detail = await (await get(paths[0])).text();
    assert.match(detail, /<h1>First &amp; &lt;project&gt;<\/h1>/);
    assert.match(detail, /action="\/" method="get"><button type="submit">Projects/);
    assert.equal((await get('/projects/99999')).status, 404);
    await server.stop();
    server = await launch(dbPath);
    const persisted = await (await get('/')).text();
    assert.equal(persisted, html);
    assert.match(await (await get(paths[1])).text(), /<h1>Second<\/h1>/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive migration, summaries, read-only tasks, restoration, and persistence', async () => {
  const directory = await mkdtemp(resolve('data-test-'));
  let server;
  try {
    const dbPath = resolve(directory, 'test.sqlite');
    // Start with the schema and data used before archive support.
    const oldDb = new DatabaseSync(dbPath);
    oldDb.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (name) VALUES ('Original');
      INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Done', 1), (1, 'Pending', 0);
    `);
    oldDb.close();
    server = await launch(dbPath);
    const get = async (path) => (await fetch(server.base + path)).text();
    const post = (path, values = {}) => fetch(server.base + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    await post('/projects', { name: 'Empty' });
    let html = await get('/');
    assert.match(html, /<label for="project-filter">Project filter<\/label>/);
    assert.match(html, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(html, /data-testid="project-summary">1\/2 completed/);
    assert.match(html, /data-testid="project-summary">0\/0 completed/);
    assert.match(html, />Archive project<\/button>/);
    assert.equal((await post('/projects/1/archive')).status, 303);
    assert.doesNotMatch(await get('/'), /Original/);
    html = await get('/?filter=Archived');
    assert.match(html, /Original/);
    assert.match(html, /data-testid="project-summary">1\/2 completed/);
    assert.match(html, />Open project<\/button>/);
    assert.match(html, />Restore project<\/button>/);
    assert.doesNotMatch(html, />Archive project<\/button>/);
    let detail = await get('/projects/1');
    assert.match(detail, /Archived project/);
    assert.match(detail, /disabled>Create task<\/button>/);
    assert.match(detail, /aria-label="Complete Done" checked disabled/);
    assert.match(detail, /aria-label="Complete Pending" disabled/);
    assert.match(await get('/projects/1?filter=Completed'), /Complete Done/);
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /Complete Pending/);
    assert.doesNotMatch(await get('/projects/1?filter=Open'), /Complete Done/);
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1', {})).status, 403);
    assert.equal(await get('/projects/1'), detail);
    await server.stop();
    server = await launch(dbPath);
    assert.equal(await get('/?filter=Archived'), html);
    assert.equal(await get('/projects/1'), detail);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.doesNotMatch(await get('/?filter=Archived'), /data-testid="project-row"/);
    detail = await get('/projects/1');
    assert.doesNotMatch(detail, /<(?:button|input)\b[^>]*\bdisabled|Archived project/);
    assert.match(detail, /aria-label="Complete Done" checked/);
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    await post('/projects/1/tasks/2', { completed: '1' });
    assert.match(await get('/'), /data-testid="project-summary">2\/2 completed/);
    await server.stop();
    server = await launch(dbPath);
    assert.doesNotMatch(await get('/projects/1'), /Archived project/);
    assert.match(await get('/'), /data-testid="project-summary">2\/2 completed/);
    assert.equal((await post('/projects/999/archive')).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});


test('renaming preserves project identity, order, tasks, and archive protection', async () => {
  const directory = await mkdtemp(resolve('data-test-'));
  let server;
  try {
    const dbPath = resolve(directory, 'test.sqlite');
    server = await launch(dbPath);
    const get = async (path) => (await fetch(server.base + path)).text();
    const post = (path, values = {}) => fetch(server.base + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await get('/projects/1');
    assert.match(original, /<label for="new-project-name">New project name<\/label>/);
    assert.match(original, />Rename project<\/button>/);
    for (const name of ['', '   ']) {
      const response = await post('/projects/1/rename', { name });
      assert.equal(response.status, 400);
      assert.match(await response.text(), /role="alert">Project name is required/);
      assert.equal(await get('/projects/1'), original);
    }
    const renamed = await post('/projects/1/rename', { name: '  New & <name>  ', filter: 'Open' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Open');
    let detail = await get('/projects/1');
    assert.match(detail, /<h1>New &amp; &lt;name&gt;<\/h1>/);
    assert.match(detail, /aria-label="Complete Done" checked/);
    assert.match(detail, /aria-label="Complete Pending" onchange/);
    let list = await get('/');
    assert.ok(list.indexOf('New &amp; &lt;name&gt;') < list.indexOf('Second'));
    assert.match(list, /data-testid="project-summary">1\/2 completed/);
    assert.match(list, /action="\/projects\/1"/);
    await server.stop();
    server = await launch(dbPath);
    assert.equal(await get('/projects/1'), detail);
    assert.equal(await get('/'), list);
    await post('/projects/1/archive');
    detail = await get('/projects/1');
    assert.match(detail, /id="new-project-name" name="name" type="text" disabled/);
    assert.match(detail, /disabled>Rename project<\/button>/);
    assert.equal((await post('/projects/1/rename', { name: 'Blocked' })).status, 403);
    assert.equal(await get('/projects/1'), detail);
    await post('/projects/1/restore');
    assert.doesNotMatch(await get('/projects/1'), /id="new-project-name"[^>]*disabled|disabled>Rename project/);
    assert.equal((await post('/projects/1/rename', { name: 'Restored' })).status, 303);
    assert.match(await get('/projects/1'), /<h1>Restored<\/h1>/);
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
