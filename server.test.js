import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function launch(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: import.meta.dirname,
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(new Error(`Startup timed out: ${errors}`)); }, 5000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Server exited (${code}): ${errors}`)); });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('project validation, creation order, navigation, and restart persistence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const dbPath = join(dir, 'nested', 'projects.sqlite');
  let app;
  try {
    app = await launch(dbPath);
    const get = async (path) => (await fetch(app.url + path)).text();
    const create = (name) => fetch(app.url + '/projects', {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    const health = await fetch(app.url + '/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const initial = await get('/');
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    for (const name of ['', ' \t\n ']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 422);
      const body = await invalid.text();
      assert.match(body, /role="alert">Project name is required/);
      assert.doesNotMatch(body, /data-testid="project-row"/);
    }
    assert.equal((await create('  First project  ')).status, 303);
    assert.equal((await create('Second <project> & "name"')).status, 303);
    const listing = await get('/');
    assert.equal((listing.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(listing, /class="project-name">First project<\/span>/);
    assert.ok(listing.indexOf('First project') < listing.indexOf('Second &lt;project&gt;'));
    const paths = [...listing.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
    assert.equal(paths.length, 2);
    assert.notEqual(paths[0], paths[1]);
    const detail = await get(paths[0]);
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/" method="get"><button type="submit">Projects<\/button>/);
    assert.match(await get(paths[1]), /<h1>Second &lt;project&gt; &amp; &quot;name&quot;<\/h1>/);
    assert.equal(await get('/'), listing);
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get('/'), listing);
    assert.equal(await get(paths[0]), detail);
    assert.equal((await fetch(app.url + '/projects/999999')).status, 404);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('tasks validate, stay in their project, filter, toggle, and survive restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const dbPath = join(dir, 'workboard.sqlite');
  let app;
  try {
    app = await launch(dbPath);
    const get = async (path) => (await fetch(app.url + path)).text();
    const post = (path, fields) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const initial = await get('/projects/1');
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, />Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option>\s*<option>Open<\/option>\s*<option>Completed<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 422);
      const body = await response.text();
      assert.match(body, /role="alert">Task title is required/);
      assert.doesNotMatch(body, /data-testid="task-row"/);
    }
    assert.equal((await post('/projects/1/tasks', { title: '  First task  ' })).status, 303);
    await post('/projects/1/tasks', { title: 'Second <task> & "title"' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    const listing = await get('/projects/1');
    assert.equal((listing.match(/data-testid="task-row"/g) || []).length, 2);
    assert.match(listing, /aria-label="Complete First task"/);
    assert.match(listing, /aria-label="Complete Second &lt;task&gt; &amp; &quot;title&quot;"/);
    assert.match(listing, /<span>First task<\/span>/);
    assert.ok(listing.indexOf('<span>First task') < listing.indexOf('<span>Second &lt;task&gt;'));
    assert.doesNotMatch(listing, / checked/);
    assert.doesNotMatch(listing, /Other project task/);
    assert.doesNotMatch(await get('/projects/2'), /Complete First task|Complete Second/);
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /data-testid="task-row"/);
    const complete = await post('/projects/1/tasks/1', { completed: '1', filter: 'Open' });
    assert.equal(complete.status, 303);
    assert.equal(complete.headers.get('location'), '/projects/1?filter=Open');
    assert.match(await get('/projects/1'), /aria-label="Complete First task" checked/);
    const open = await get('/projects/1?filter=Open');
    assert.match(open, /<option selected>Open<\/option>/);
    assert.doesNotMatch(open, /Complete First task/);
    assert.match(open, /Complete Second/);
    const completed = await get('/projects/1?filter=Completed');
    assert.match(completed, /<option selected>Completed<\/option>/);
    assert.match(completed, /Complete First task/);
    assert.doesNotMatch(completed, /Complete Second/);
    assert.equal((await post('/projects/2/tasks/1', { completed: '0' })).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Missing' })).status, 404);
    const saved = await get('/projects/1');
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), saved);
    assert.equal(await get('/projects/1?filter=Open'), open);
    assert.equal(await get('/projects/1?filter=Completed'), completed);
    assert.match(await get('/projects/2'), /Complete Other project task/);
    assert.equal((await post('/projects/1/tasks/1', {})).status, 303);
    assert.doesNotMatch(await get('/projects/1'), / checked/);
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /data-testid="task-row"/);
    const reopened = await get('/projects/1');
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), reopened);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
