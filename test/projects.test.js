import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

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

test('rename preserves identity, ordering, tasks and persistence and rejects archived edits', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let running;
  try {
    running = await start(dbPath);
    let base = running.base;
    const post = (path, values = {}) => fetch(`${base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = path => fetch(`${base}${path}`).then(response => response.text());
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1/completion', { completed: '1' });
    const original = await html('/projects/1');
    assert.match(original, /<label for="new-project-name">New project name<\/label>/);
    assert.match(original, />Rename project<\/button>/);
    for (const name of ['', '   \t ']) {
      const response = await post('/projects/1/rename', { name });
      assert.equal(response.status, 400);
      assert.match(await response.text(), /role="alert">Project name is required/);
      assert.equal(await html('/projects/1'), original);
    }
    const renamed = await post('/projects/1/rename', { name: '  Renamed <one> & café  ', filter: 'Open' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Open');
    const detail = await html('/projects/1');
    assert.match(detail, /<h1>Renamed &lt;one&gt; &amp; café<\/h1>/);
    assert.match(detail, /aria-label="Complete Done" checked/);
    assert.match(detail, /aria-label="Complete Pending"\s/);
    assert.equal((detail.match(/data-testid="task-row"/g) || []).length, 2);
    const listing = await html('/');
    assert.ok(listing.indexOf('Renamed &lt;one&gt;') < listing.indexOf('Second'));
    assert.match(listing, /data-testid="project-summary">1\/2 completed/);
    assert.match(listing, /action="\/projects\/1"/);
    await stop(running.child);
    running = undefined;
    running = await start(dbPath);
    base = running.base;
    assert.equal(await html('/projects/1'), detail);
    assert.equal(await html('/'), listing);
    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    assert.match(archived, /id="new-project-name"[^>]* disabled/);
    assert.match(archived, /<button type="submit" disabled>Rename project<\/button>/);
    assert.equal((await post('/projects/1/rename', { name: 'Forbidden' })).status, 403);
    assert.equal(await html('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), detail);
    assert.equal((await post('/projects/1/rename', { name: 'Restored name' })).status, 303);
    assert.match(await html('/projects/1'), /<h1>Restored name<\/h1>/);
    assert.match(await html('/'), /1\/2 completed/);
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
  } finally {
    if (running) await stop(running.child);
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive migration, summaries, read-only tasks and restore persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const dbPath = join(directory, 'workboard.sqlite');
  // Seed the previous schema to exercise upgrading a populated database.
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Existing');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Done', 1), (1, 'Pending', 0);
  `);
  db.close();
  let running;
  try {
    running = await start(dbPath);
    let base = running.base;
    const post = (path, values = {}) => fetch(`${base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = path => fetch(`${base}${path}`).then(response => response.text());
    const rows = text => [...text.matchAll(/<li data-testid="project-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    let active = await html('/');
    assert.match(active, /<label for="project-filter">Project filter<\/label>/);
    assert.match(active, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(rows(active)[0], /data-testid="project-summary">1\/2 completed/);
    assert.match(rows(active)[0], />Archive project<\/button>/);
    await post('/projects', { name: 'New' });
    assert.match(rows(await html('/'))[1], /data-testid="project-summary">0\/0 completed/);
    assert.equal((await post('/projects/1/archive')).status, 303);
    assert.equal(rows(await html('/')).length, 1);
    const archived = await html('/?filter=Archived');
    assert.equal(rows(archived).length, 1);
    assert.match(rows(archived)[0], />Open project<\/button>/);
    assert.match(rows(archived)[0], />Restore project<\/button>/);
    assert.match(rows(archived)[0], /1\/2 completed/);
    const detail = await html('/projects/1');
    assert.match(detail, /<p>Archived project<\/p>/);
    assert.match(detail, /<button type="submit" disabled>Create task<\/button>/);
    assert.equal((detail.match(/data-testid="task-row"/g) || []).length, 2);
    assert.match(detail, /aria-label="Complete Done" checked disabled/);
    assert.match(detail, /aria-label="Complete Pending" disabled/);
    assert.equal(((await html('/projects/1?filter=Open')).match(/data-testid="task-row"/g) || []).length, 1);
    assert.match(await html('/projects/1?filter=Completed'), /Complete Done/);
    assert.equal((await post('/projects/1/tasks', { title: 'Forbidden' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1/completion')).status, 403);
    assert.equal(await html('/projects/1'), detail);
    await stop(running.child);
    running = undefined;
    running = await start(dbPath);
    base = running.base;
    assert.equal(await html('/?filter=Archived'), archived);
    assert.equal(await html('/projects/1'), detail);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.equal(rows(await html('/?filter=Archived')).length, 0);
    active = await html('/');
    assert.equal(rows(active).length, 2);
    assert.match(rows(active)[0], /Existing/);
    assert.match(rows(active)[0], /1\/2 completed/);
    assert.doesNotMatch(await html('/projects/1'), / disabled|Archived project/);
    await post('/projects/1/tasks/2/completion', { completed: '1', filter: 'Open' });
    assert.match(rows(await html('/'))[0], /2\/2 completed/);
    await stop(running.child);
    running = undefined;
    running = await start(dbPath);
    base = running.base;
    assert.match(rows(await html('/'))[0], /2\/2 completed/);
    assert.doesNotMatch(await html('/projects/1'), / disabled|Archived project/);
    assert.equal((await post('/projects/999/archive')).status, 404);
  } finally {
    if (running) await stop(running.child);
    await rm(directory, { recursive: true, force: true });
  }
});

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
