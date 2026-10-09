import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const base = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(new Error(`Startup timed out: ${errors}`)); }, 5000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited ${code}: ${errors}`)); });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) { clearTimeout(timeout); resolve(`http://127.0.0.1:${match[1]}`); }
    });
  });
  return { base, stop: async () => {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  } };
}

test('projects validate, retain order and identity, and survive a process restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let server;
  try {
    const dbPath = join(directory, 'nested', 'projects.sqlite');
    server = await start(dbPath);
    const health = await fetch(`${server.base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const initial = await (await fetch(server.base)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);
    const create = name => fetch(`${server.base}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    for (const name of ['', '   \t\n']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    assert.equal((await create('  Alpha  ')).status, 303);
    assert.equal((await create('Beta <script>alert("x")</script>')).status, 303);
    const listing = await (await fetch(server.base)).text();
    assert.equal((listing.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(listing, /class="project-name">Alpha<\/span>/);
    assert.ok(listing.indexOf('>Alpha</span>') < listing.indexOf('>Beta &lt;script&gt;'));
    assert.doesNotMatch(listing, /Beta <script>/);
    const paths = [...listing.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    assert.notEqual(paths[0], paths[1]);
    const detail = await (await fetch(`${server.base}${paths[0]}`)).text();
    assert.match(detail, /<h1>Alpha<\/h1>/);
    assert.match(detail, /action="\/"/);
    assert.match(detail, />Projects<\/button>/);
    assert.equal((await fetch(`${server.base}/projects/999999`)).status, 404);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await (await fetch(server.base)).text(), listing);
    assert.equal(await (await fetch(`${server.base}${paths[0]}`)).text(), detail);
    const rejected = await fetch(`${server.base}/projects`, {
      method: 'POST', body: new URLSearchParams({ name: '   ' }),
    });
    assert.equal(rejected.status, 400);
    assert.equal(await (await fetch(server.base)).text(), listing);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, stay within their project, and persist completion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  let server;
  try {
    const dbPath = join(directory, 'tasks.sqlite');
    server = await start(dbPath);
    const post = (path, values) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const rows = content => [...content.matchAll(/data-testid="task-row">([\s\S]*?)<\/div>/g)].map(match => match[1]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const initial = await html('/projects/1');
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, />Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      assert.match(await response.text(), /role="alert">Task title is required/);
    }
    assert.equal(rows(await html('/projects/1')).length, 0);
    assert.equal((await post('/projects/1/tasks', { title: '  Plan  ' })).status, 303);
    await post('/projects/1/tasks', { title: 'Build <demo> "today"' });
    await post('/projects/2/tasks', { title: 'Other project' });
    let firstRows = rows(await html('/projects/1'));
    assert.equal(firstRows.length, 2);
    assert.match(firstRows[0], /aria-label="Complete Plan"/);
    assert.match(firstRows[0], /<span>Plan<\/span>/);
    assert.doesNotMatch(firstRows[0], / checked/);
    assert.match(firstRows[1], /Complete Build &lt;demo&gt; &quot;today&quot;/);
    assert.doesNotMatch(firstRows.join(''), /Other project/);
    assert.equal(rows(await html('/projects/2')).length, 1);
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    const completed = await post('/projects/1/tasks/1', { completed: '1', filter: 'Open' });
    assert.equal(completed.status, 303);
    assert.equal(completed.headers.get('location'), '/projects/1?filter=Open');
    firstRows = rows(await html('/projects/1'));
    assert.match(firstRows[0], / checked/);
    assert.doesNotMatch(firstRows[1], / checked/);
    const open = rows(await html('/projects/1?filter=Open'));
    assert.equal(open.length, 1);
    assert.match(open[0], /Build &lt;demo&gt;/);
    const done = rows(await html('/projects/1?filter=Completed'));
    assert.equal(done.length, 1);
    assert.match(done[0], /Complete Plan/);
    const beforeRestart = await html('/projects/1');
    await server.stop();
    server = await start(dbPath);
    assert.equal(await html('/projects/1'), beforeRestart);
    assert.equal(rows(await html('/projects/2')).length, 1);
    await post('/projects/1/tasks/1', { filter: 'Completed' });
    assert.equal(rows(await html('/projects/1?filter=Completed')).length, 0);
    assert.equal(rows(await html('/projects/1?filter=Open')).length, 2);
    await server.stop();
    server = await start(dbPath);
    assert.doesNotMatch(rows(await html('/projects/1'))[0], / checked/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
