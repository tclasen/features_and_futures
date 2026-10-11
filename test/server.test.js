import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const port = await new Promise((resolve, reject) => {
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = /listening on port (\d+)/.exec(output);
      if (match) resolve(match[1]);
    });
    child.on('error', reject);
    child.on('exit', code => reject(new Error(`Server exited: ${code}`)));
  });
  return {
    base: `http://127.0.0.1:${port}`,
    stop: async () => {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('tasks validate, filter, remain project-owned and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const get = async path => (await fetch(server.base + path)).text();
    const post = (path, data) => fetch(server.base + path, {
      method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
    });
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const initial = await get('/projects/1');
    assert.match(initial, /Task title<\/label>/);
    assert.match(initial, /Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.doesNotMatch(html, /data-testid="task-row"/);
    }
    assert.equal((await post('/projects/1/tasks', { title: '  First task  ' })).status, 303);
    await post('/projects/1/tasks', { title: '<Second & task>' });
    let all = await get('/projects/1');
    assert.equal((all.match(/data-testid="task-row"/g) || []).length, 2);
    assert.ok(all.indexOf('Complete First task') < all.indexOf('Complete &lt;Second &amp; task&gt;'));
    assert.doesNotMatch(all, /  First task  |\bchecked\b/);
    assert.doesNotMatch(await get('/projects/2'), /data-testid="task-row"/);
    assert.equal((await post('/projects/2/tasks/1/completion', { completed: '1' })).status, 404);
    await post('/projects/1/tasks/1/completion', { completed: '1' });
    const completed = await get('/projects/1?filter=Completed');
    assert.match(completed, /Complete First task" checked/);
    assert.doesNotMatch(completed, /Second &amp; task/);
    const open = await get('/projects/1?filter=Open');
    assert.doesNotMatch(open, /First task/);
    assert.match(open, /Complete &lt;Second &amp; task&gt;/);
    all = await get('/projects/1');
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), all);
    assert.equal(await get('/projects/1?filter=Completed'), completed);
    await post('/projects/1/tasks/1/completion', {});
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /data-testid="task-row"/);
    assert.equal(((await get('/projects/1?filter=Open')).match(/data-testid="task-row"/g) || []).length, 2);
    await server.stop();
    server = await start(dbPath);
    assert.doesNotMatch(await get('/projects/1'), /\bchecked\b/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('projects validate, escape, retain creation order and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const dbPath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const get = path => fetch(server.base + path);
    const create = name => fetch(server.base + '/projects', {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const initial = await (await get('/')).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    for (const name of ['', ' \t\n ']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    assert.equal((await create('  First project  ')).status, 303);
    assert.equal((await create('<Second & project>')).status, 303);
    const list = await (await get('/')).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.ok(list.indexOf('First project') < list.indexOf('&lt;Second &amp; project&gt;'));
    assert.doesNotMatch(list, /  First project  /);
    const links = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(links.length, 2);
    const detail = await (await get(links[0])).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, />Projects<\/button>/);
    assert.equal((await get('/projects/999999')).status, 404);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await (await get('/')).text(), list);
    assert.equal(await (await get(links[0])).text(), detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive migration, summaries, read-only tasks and restoration persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const dbPath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    INSERT INTO projects (name) VALUES ('Legacy');`);
  legacy.close();
  let server;
  try {
    server = await start(dbPath);
    const get = async path => (await fetch(server.base + path)).text();
    const post = (path, data = {}) => fetch(server.base + path, {
      method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
    });
    assert.match(await get('/'), /<option selected>Active<\/option>/);
    assert.match(await get('/'), /data-testid="project-summary">0\/0 completed/);
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'One' });
    await post('/projects/1/tasks', { title: 'Two' });
    await post('/projects/1/tasks/1/completion', { completed: '1' });
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    assert.equal((await post('/projects/1/archive')).status, 303);
    assert.doesNotMatch(await get('/'), /Legacy/);
    const archived = await get('/?filter=Archived');
    assert.match(archived, /Legacy/);
    assert.match(archived, />Restore project<\/button>/);
    assert.match(archived, />Open project<\/button>/);
    assert.doesNotMatch(archived, /Second/);
    const detail = await get('/projects/1');
    assert.match(detail, /Archived project/);
    assert.match(detail, /<button type="submit" disabled>Create task/);
    assert.equal((detail.match(/disabled.*onchange/g) || []).length, 2);
    assert.match(detail, /Complete One" checked/);
    assert.equal(((await get('/projects/1?filter=Open')).match(/data-testid="task-row"/g) || []).length, 1);
    assert.equal(((await get('/projects/1?filter=Completed')).match(/data-testid="task-row"/g) || []).length, 1);
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1/completion')).status, 403);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/?filter=Archived'), archived);
    assert.equal(await get('/projects/1'), detail);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.doesNotMatch(await get('/?filter=Archived'), /Legacy/);
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    assert.doesNotMatch(await get('/projects/1'), /\sdisabled[\s>]|Archived project/);
    await post('/projects/1/tasks/1/completion');
    await post('/projects/1/tasks', { title: 'Three' });
    await server.stop();
    server = await start(dbPath);
    assert.match(await get('/'), /data-testid="project-summary">0\/3 completed/);
    assert.doesNotMatch(await get('/projects/1'), /\sdisabled[\s>]|Archived project/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});


test('rename preserves identity, order and tasks, validates and respects archive state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const get = async path => (await fetch(server.base + path)).text();
    const post = (path, data = {}) => fetch(server.base + path, {
      method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
    });
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Keep me' });
    await post('/projects/1/tasks/1/completion', { completed: '1' });
    assert.match(await get('/projects/1'), /New project name<\/label>/);
    for (const name of ['', ' \t\n ']) {
      const response = await post('/projects/1/rename', { name });
      assert.equal(response.status, 400);
      assert.match(await response.text(), /role="alert">Project name is required/);
      assert.match(await get('/projects/1'), /<h1>Original<\/h1>/);
    }
    const renamed = await post('/projects/1/rename', { name: '  <Renamed & project>  ', filter: 'Completed' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const detail = await get('/projects/1');
    assert.match(detail, /<h1>&lt;Renamed &amp; project&gt;<\/h1>/);
    assert.match(detail, /Complete Keep me" checked/);
    const list = await get('/');
    assert.ok(list.indexOf('&lt;Renamed &amp; project&gt;') < list.indexOf('Second'));
    assert.match(list, /data-testid="project-summary">1\/1 completed/);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), detail);
    assert.equal(await get('/'), list);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.match(archived, /id="new-project-name"[^>]* disabled>/);
    assert.match(archived, /<button type="submit" disabled>Rename project/);
    assert.equal((await post('/projects/1/rename', { name: 'Forbidden' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.doesNotMatch(await get('/projects/1'), /\sdisabled[\s>]/);
    assert.equal((await post('/projects/1/rename', { name: 'Restored name' })).status, 303);
    await server.stop();
    server = await start(dbPath);
    assert.match(await get('/projects/1'), /<h1>Restored name<\/h1>/);
    assert.match(await get('/projects/1'), /Complete Keep me" checked/);
    assert.match(await get('/'), /data-testid="project-summary">1\/1 completed/);
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
