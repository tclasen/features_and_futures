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
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(match[1]);
    });
    child.on('error', reject);
    child.on('exit', code => reject(new Error(`Server exited: ${code}`)));
  });
  return { child, url: `http://127.0.0.1:${port}` };
}

async function stop(server) {
  const exited = once(server.child, 'exit');
  server.child.kill('SIGTERM');
  await exited;
}

test('projects validate, navigate, escape names and persist across restarts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let server;
  try {
    const dbPath = join(dir, 'nested', 'projects.sqlite');
    server = await start(dbPath);
    const get = path => fetch(server.url + path);
    const create = name => fetch(server.url + '/projects', {
      method: 'POST',
      body: new URLSearchParams({ name }),
      redirect: 'manual',
    });
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const initial = await (await get('/')).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);
    for (const name of ['', '   \t\n']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      const body = await invalid.text();
      assert.match(body, /role="alert">Project name is required/);
      assert.doesNotMatch(body, /data-testid="project-row"/);
    }
    for (const name of ['  Alpha  ', '<Second & project>']) {
      const result = await create(name);
      assert.equal(result.status, 303);
      assert.equal(result.headers.get('location'), '/');
    }
    const listing = await (await get('/')).text();
    assert.equal((listing.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(listing, /<span>Alpha<\/span>/);
    assert.ok(listing.indexOf('Alpha') < listing.indexOf('&lt;Second &amp; project&gt;'));
    assert.match(listing, /action="\/projects\/1"/);
    const detail = await (await get('/projects/1')).text();
    assert.match(detail, /<h1>Alpha<\/h1>/);
    assert.match(detail, /action="\/" method="get"><button type="submit">Projects/);
    assert.equal((await get('/projects/999')).status, 404);
    await stop(server);
    server = await start(dbPath);
    assert.equal(await (await get('/')).text(), listing);
    assert.equal(await (await get('/projects/1')).text(), detail);
  } finally {
    if (server && server.child.exitCode === null) await stop(server);
    await rm(dir, { recursive: true, force: true });
  }
});

test('tasks validate, filter, stay project-scoped, and persist completion', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  let server;
  try {
    const dbPath = join(dir, 'workboard.sqlite');
    server = await start(dbPath);
    const get = async path => (await fetch(server.url + path)).text();
    const post = (path, fields) => fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const count = body => (body.match(/data-testid="task-row"/g) || []).length;
    await post('/projects', { name: 'Alpha' });
    await post('/projects', { name: 'Beta' });
    const initial = await get('/projects/1');
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, />Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    assert.equal(count(initial), 0);
    for (const title of ['', '  \t\n']) {
      const result = await post('/projects/1/tasks', { title });
      assert.equal(result.status, 400);
      const body = await result.text();
      assert.match(body, /role="alert">Task title is required/);
      assert.equal(count(body), 0);
    }
    for (const title of ['  First  ', '<Second & task>']) {
      const result = await post('/projects/1/tasks', { title });
      assert.equal(result.status, 303);
      assert.equal(result.headers.get('location'), '/projects/1');
    }
    const created = await get('/projects/1');
    assert.equal(count(created), 2);
    assert.match(created, /aria-label="Complete First"/);
    assert.match(created, /aria-label="Complete &lt;Second &amp; task&gt;"/);
    assert.ok(created.indexOf('<span>First') < created.indexOf('<span>&lt;Second'));
    assert.doesNotMatch(created, /checked/);
    assert.equal(count(await get('/projects/2')), 0);
    assert.equal(count(await get('/projects/1?filter=Open')), 2);
    assert.equal(count(await get('/projects/1?filter=Completed')), 0);
    assert.equal((await post('/projects/2/tasks/1/completion', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Wrong' })).status, 404);
    const completed = await post('/projects/1/tasks/1/completion', { completed: '1', filter: 'Open' });
    assert.equal(completed.headers.get('location'), '/projects/1?filter=Open');
    const all = await get('/projects/1');
    assert.match(all, /aria-label="Complete First" checked/);
    assert.equal(count(all), 2);
    const open = await get('/projects/1?filter=Open');
    assert.equal(count(open), 1);
    assert.doesNotMatch(open, /<span>First/);
    const done = await get('/projects/1?filter=Completed');
    assert.equal(count(done), 1);
    assert.match(done, /<span>First/);
    await stop(server);
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), all);
    assert.equal(await get('/projects/1?filter=Completed'), done);
    assert.equal(count(await get('/projects/2')), 0);
    await post('/projects/1/tasks/1/completion', {});
    assert.equal(count(await get('/projects/1?filter=Completed')), 0);
    assert.equal(count(await get('/projects/1?filter=Open')), 2);
    await stop(server);
    server = await start(dbPath);
    assert.doesNotMatch(await get('/projects/1'), /checked/);
  } finally {
    if (server && server.child.exitCode === null) await stop(server);
    await rm(dir, { recursive: true, force: true });
  }
});


test('archives migrate, summarize, stay read-only, restore and persist', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  let server;
  try {
    const dbPath = join(dir, 'workboard.sqlite');
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      INSERT INTO projects (name) VALUES ('Alpha')`);
    legacy.close();
    server = await start(dbPath);
    const get = async path => (await fetch(server.url + path)).text();
    const post = (path, fields = {}) => fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const rows = body => (body.match(/data-testid="project-row"/g) || []).length;
    assert.match(await get('/'), /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(await get('/'), /data-testid="project-summary">0\/0 completed/);
    await post('/projects', { name: 'Beta' });
    await post('/projects/1/tasks', { title: 'First' });
    await post('/projects/1/tasks', { title: 'Second' });
    await post('/projects/1/tasks/1/completion', { completed: '1' });
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    assert.equal((await post('/projects/1/archive')).status, 303);
    assert.equal(rows(await get('/')), 1);
    const archivedList = await get('/?filter=Archived');
    assert.equal(rows(archivedList), 1);
    assert.match(archivedList, />Restore project<\/button>/);
    assert.match(archivedList, /data-testid="project-summary">1\/2 completed/);
    assert.match(archivedList, /action="\/projects\/1"/);
    const archivedPage = await get('/projects/1');
    assert.match(archivedPage, /<p>Archived project<\/p>/);
    assert.match(archivedPage, /<button type="submit" disabled>Create task/);
    assert.equal((archivedPage.match(/disabled onchange/g) || []).length, 2);
    assert.match(await get('/projects/1?filter=Completed'), /<span>First/);
    assert.doesNotMatch(await get('/projects/1?filter=Open'), /<span>First/);
    assert.equal((await post('/projects/1/tasks', { title: 'Forbidden' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1/completion')).status, 403);
    assert.equal((await post('/projects/999/archive')).status, 404);
    await stop(server);
    server = await start(dbPath);
    assert.equal(await get('/?filter=Archived'), archivedList);
    assert.equal(await get('/projects/1'), archivedPage);
    await post('/projects/1/restore');
    const restored = await get('/');
    assert.equal(rows(restored), 2);
    assert.ok(restored.indexOf('<span>Alpha') < restored.indexOf('<span>Beta'));
    assert.match(restored, /data-testid="project-summary">1\/2 completed/);
    assert.equal(rows(await get('/?filter=Archived')), 0);
    const detail = await get('/projects/1');
    assert.doesNotMatch(detail, /<[^>]+\sdisabled|Archived project/);
    assert.match(detail, /aria-label="Complete First" checked/);
    await stop(server);
    server = await start(dbPath);
    assert.equal(await get('/'), restored);
    assert.equal(await get('/projects/1'), detail);
  } finally {
    if (server && server.child.exitCode === null) await stop(server);
    await rm(dir, { recursive: true, force: true });
  }
});
