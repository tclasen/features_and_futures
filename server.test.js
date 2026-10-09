import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(new Error(`Server startup timed out: ${errors}`)); }, 5000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited ${code}: ${errors}`)); });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = /listening on port (\d+)/.exec(output);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
  });
  return {
    base: `http://127.0.0.1:${port}`,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('project validation, ordering, navigation, escaping and restart persistence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let app;
  try {
    const dbPath = join(dir, 'nested', 'projects.sqlite');
    app = await start(dbPath);
    const health = await fetch(`${app.base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const initial = await (await fetch(app.base)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);

    const create = name => fetch(`${app.base}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    for (const blank of ['', ' \t\n ']) {
      const invalid = await (await create(blank)).text();
      assert.match(invalid, /role="alert">Project name is required/);
      assert.doesNotMatch(invalid, /data-testid="project-row"/);
    }
    const created = await create('  First project  ');
    assert.equal(created.status, 303);
    assert.equal(created.headers.get('location'), '/');
    assert.equal((await create('<Second & "project">')).status, 303);
    const listing = await (await fetch(app.base)).text();
    assert.equal((listing.match(/data-testid="project-row"/g) || []).length, 2);
    assert.ok(listing.indexOf('First project') < listing.indexOf('&lt;Second'));
    assert.doesNotMatch(listing, />  First project  </);
    assert.match(listing, /&lt;Second &amp; &quot;project&quot;&gt;/);
    const ids = [...listing.matchAll(/action="\/projects\/(\d+)"/g)].map(match => match[1]);
    assert.equal(ids.length, 2);
    const detail = await (await fetch(`${app.base}/projects/${ids[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*>Projects<\/button>/);
    await create('  ');
    assert.equal(await (await fetch(app.base)).text(), listing);
    assert.equal((await fetch(`${app.base}/projects/999999`)).status, 404);

    await app.stop();
    app = await start(dbPath);
    assert.equal(await (await fetch(app.base)).text(), listing);
    assert.equal(await (await fetch(`${app.base}/projects/${ids[0]}`)).text(), detail);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('tasks validate, filter, stay within their project, and persist completion across restarts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  let app;
  try {
    const dbPath = join(dir, 'workboard.sqlite');
    app = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${app.base}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${app.base}${path}`)).text();
    const rows = html => [...html.matchAll(/<div class="task-row" data-testid="task-row">([\s\S]*?)<\/div>/g)].map(match => match[1]);
    await post('/projects', { name: 'Alpha' });
    await post('/projects', { name: 'Beta' });
    const initial = await get('/projects/1');
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, />Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option>/);
    assert.match(initial, /<option>Open<\/option>/);
    assert.match(initial, /<option>Completed<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const invalid = await (await post('/projects/1/tasks', { title })).text();
      assert.match(invalid, /role="alert">Task title is required/);
      assert.equal(rows(invalid).length, 0);
    }
    assert.equal((await post('/projects/1/tasks', { title: '  First task  ' })).status, 303);
    await post('/projects/1/tasks', { title: '<Second & "task">' });
    await post('/projects/2/tasks', { title: 'Private Beta task' });
    const all = await get('/projects/1');
    const taskRows = rows(all);
    assert.equal(taskRows.length, 2);
    assert.match(taskRows[0], /aria-label="Complete First task"/);
    assert.match(taskRows[1], /aria-label="Complete &lt;Second &amp; &quot;task&quot;&gt;"/);
    assert.doesNotMatch(all, /Private Beta task/);
    assert.doesNotMatch(taskRows.join(''), / checked/);
    assert.equal(rows(await get('/projects/1?filter=Open')).length, 2);
    assert.equal(rows(await get('/projects/1?filter=Completed')).length, 0);
    assert.equal((await post('/projects/2/tasks/1/completion', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Orphan' })).status, 404);
    const completed = await post('/projects/1/tasks/1/completion?filter=Open', { completed: '1' });
    assert.equal(completed.status, 303);
    assert.equal(completed.headers.get('location'), '/projects/1?filter=Open');
    assert.match(rows(await get('/projects/1'))[0], / checked/);
    const open = rows(await get('/projects/1?filter=Open'));
    assert.equal(open.length, 1);
    assert.match(open[0], /Second/);
    const done = rows(await get('/projects/1?filter=Completed'));
    assert.equal(done.length, 1);
    assert.match(done[0], /First task/);
    const beforeInvalid = await get('/projects/1');
    await post('/projects/1/tasks', { title: '   ' });
    assert.equal(await get('/projects/1'), beforeInvalid);
    const beta = await get('/projects/2');
    assert.equal(rows(beta).length, 1);
    assert.doesNotMatch(beta, /First task|Second/);
    await app.stop();
    app = await start(dbPath);
    assert.equal(await get('/projects/1'), beforeInvalid);
    assert.equal(await get('/projects/2'), beta);
    assert.equal(rows(await get('/projects/1?filter=Completed')).length, 1);
    assert.equal((await post('/projects/1/tasks/1/completion')).status, 303);
    assert.doesNotMatch(rows(await get('/projects/1')).join(''), / checked/);
    await app.stop();
    app = await start(dbPath);
    assert.equal(rows(await get('/projects/1?filter=Open')).length, 2);
    assert.equal(rows(await get('/projects/1?filter=Completed')).length, 0);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
