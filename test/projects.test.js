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
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const base = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Server exited: ${code}`)));
  });
  return { child, base };
}

async function stop(child) {
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await exited;
}

test('tasks validate, filter, stay project-scoped and persist completion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let running;
  try {
    running = await start(dbPath);
    let base = running.base;
    const post = (path, values) => fetch(`${base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const detail = (id, filter = 'All') => fetch(`${base}/projects/${id}?filter=${filter}`).then(r => r.text());
    const rows = html => [...html.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)].map(m => m[1]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const initial = await detail(1);
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, />Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', '   \t ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      assert.match(await response.text(), /role="alert">Task title is required/);
      assert.equal(rows(await detail(1)).length, 0);
    }
    assert.equal((await post('/projects/1/tasks', { title: '  One & <two>  ' })).status, 303);
    await post('/projects/1/tasks', { title: 'Next' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    let tasks = rows(await detail(1));
    assert.equal(tasks.length, 2);
    assert.match(tasks[0], /aria-label="Complete One &amp; &lt;two&gt;"/);
    assert.match(tasks[0], />One &amp; &lt;two&gt;<\/span>/);
    assert.match(tasks[1], />Next<\/span>/);
    assert.doesNotMatch(tasks.join(''), / checked|Other project task/);
    assert.equal(rows(await detail(1, 'Open')).length, 2);
    assert.equal(rows(await detail(1, 'Completed')).length, 0);
    assert.equal((await post('/projects/2/tasks/1/completion', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1/completion', { completed: '1' })).status, 303);
    assert.match(rows(await detail(1))[0], / checked/);
    assert.match(rows(await detail(1, 'Open'))[0], />Next<\/span>/);
    assert.equal(rows(await detail(1, 'Open')).length, 1);
    assert.equal(rows(await detail(1, 'Completed')).length, 1);
    assert.match(rows(await detail(2))[0], /Other project task/);
    const beforeRestart = await detail(1);
    await stop(running.child);
    running = undefined;
    running = await start(dbPath);
    base = running.base;
    assert.equal(await detail(1), beforeRestart);
    assert.equal((await post('/projects/1/tasks/1/completion', {})).status, 303);
    assert.doesNotMatch(rows(await detail(1))[0], / checked/);
    assert.equal(rows(await detail(1, 'Completed')).length, 0);
    assert.equal(rows(await detail(1, 'Open')).length, 2);
    assert.equal((await post('/projects/999/tasks', { title: 'Missing' })).status, 404);
  } finally {
    if (running) await stop(running.child);
    await rm(directory, { recursive: true, force: true });
  }
});

test('projects validate, escape, preserve order and survive server restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let running;
  try {
    running = await start(join(directory, 'projects.sqlite'));
    let { base } = running;
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const initial = await (await fetch(base)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.equal((initial.match(/data-testid="project-row"/g) || []).length, 0);
    const create = name => fetch(`${base}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    for (const name of ['', '   \t  ']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    assert.equal((await create('  First project  ')).status, 303);
    assert.equal((await create('Second <script> & café')).status, 303);
    const listing = await (await fetch(base)).text();
    assert.equal((listing.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(listing, />First project<\/span>/);
    assert.match(listing, /Second &lt;script&gt; &amp; café/);
    assert.ok(listing.indexOf('First project') < listing.indexOf('Second &lt;'));
    const paths = [...listing.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    const detail = await (await fetch(`${base}${paths[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/">.*>Projects<\/button>/);
    assert.equal((await fetch(`${base}/projects/9999`)).status, 404);
    await stop(running.child);
    running = undefined;
    running = await start(join(directory, 'projects.sqlite'));
    base = running.base;
    assert.equal(await (await fetch(base)).text(), listing);
    assert.match(await (await fetch(`${base}${paths[0]}`)).text(), /<h1>First project<\/h1>/);
  } finally {
    if (running) await stop(running.child);
    await rm(directory, { recursive: true, force: true });
  }
});
