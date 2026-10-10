import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { once } from 'node:events';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const base = await new Promise((resolveBase, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`Server exited ${code}: ${output}`)));
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolveBase(`http://127.0.0.1:${match[1]}`);
    });
  });
  return { base, async stop() { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; } };
}

test('project validation, creation order, navigation, and restart persistence', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data/test-'));
  let server;
  try {
    const dbPath = resolve(directory, 'projects.sqlite');
    server = await start(dbPath);
    const health = await fetch(`${server.base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const initial = await (await fetch(server.base)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    for (const name of ['', '   ']) {
      const response = await fetch(`${server.base}/projects`, {
        method: 'POST', body: new URLSearchParams({ name }),
      });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    for (const name of ['  Alpha & <team>  ', 'Beta']) {
      const response = await fetch(`${server.base}/projects`, {
        method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
      });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    const list = await (await fetch(server.base)).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.ok(list.indexOf('Alpha &amp; &lt;team&gt;') < list.indexOf('Beta'));
    assert.match(list, /action="\/projects\/1"/);
    assert.match(list, /action="\/projects\/2"/);
    const detail = await (await fetch(`${server.base}/projects/1`)).text();
    assert.match(detail, /<h1>Alpha &amp; &lt;team&gt;<\/h1>/);
    assert.match(detail, /action="\/".*>Projects<\/button>/);
    assert.equal((await fetch(`${server.base}/projects/999`)).status, 404);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await (await fetch(server.base)).text(), list);
    assert.equal(await (await fetch(`${server.base}/projects/1`)).text(), detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task validation, ordering, filters, ownership, completion, and restart persistence', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data/test-'));
  let server;
  try {
    const dbPath = resolve(directory, 'tasks.sqlite');
    server = await start(dbPath);
    const post = (path, fields) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const detail = async (id, filter = 'All') => (await fetch(`${server.base}/projects/${id}?filter=${filter}`)).text();
    const rows = html => [...html.matchAll(/data-testid="task-row"/g)].length;
    for (const name of ['Alpha', 'Beta']) assert.equal((await post('/projects', { name })).status, 303);
    const empty = await detail(1);
    assert.match(empty, /<label for="task-title">Task title<\/label>/);
    assert.match(empty, />Create task<\/button>/);
    assert.match(empty, /<label for="task-filter">Task filter<\/label>/);
    assert.match(empty, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', ' \t ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(rows(html), 0);
    }
    for (const title of ['  First & <task> "quoted"  ', 'Second']) {
      assert.equal((await post('/projects/1/tasks', { title })).status, 303);
    }
    const all = await detail(1);
    assert.equal(rows(all), 2);
    assert.ok(all.indexOf('Complete First') < all.indexOf('Complete Second'));
    assert.match(all, /aria-label="Complete First &amp; &lt;task&gt; &quot;quoted&quot;"/);
    assert.doesNotMatch(all, / checked/);
    assert.equal(rows(await detail(1, 'Open')), 2);
    assert.equal(rows(await detail(1, 'Completed')), 0);
    assert.equal(rows(await detail(2)), 0);
    assert.equal((await post('/projects/2/tasks/1/completion', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Orphan' })).status, 404);
    const completed = await post('/projects/1/tasks/1/completion', { completed: '1', filter: 'Open' });
    assert.equal(completed.status, 303);
    assert.equal(completed.headers.get('location'), '/projects/1?filter=Open');
    const saved = await detail(1);
    assert.match(saved, /aria-label="Complete First[^\n]* checked/);
    assert.equal(rows(await detail(1, 'Open')), 1);
    const completedList = await detail(1, 'Completed');
    assert.equal(rows(completedList), 1);
    assert.match(completedList, /Complete First/);
    assert.doesNotMatch(completedList, /Complete Second/);
    assert.equal(rows(await detail(1, 'invalid')), 2);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await detail(1), saved);
    assert.equal(await detail(1, 'Completed'), completedList);
    assert.equal(rows(await detail(2)), 0);
    assert.equal((await post('/projects/1/tasks/1/completion', {})).status, 303);
    assert.equal(rows(await detail(1, 'Completed')), 0);
    assert.equal(rows(await detail(1, 'Open')), 2);
    await server.stop();
    server = await start(dbPath);
    assert.doesNotMatch(await detail(1), / checked/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('legacy database migration, archive/restore, summaries, and restart persistence', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data/test-'));
  let server;
  try {
    const dbPath = resolve(directory, 'archive.sqlite');
    // Start from the schema used before archive support, with existing data.
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)));
      INSERT INTO projects (name) VALUES ('Alpha'), ('Beta');
      INSERT INTO tasks (project_id, title, completed) VALUES
        (1, 'Finished', 1), (1, 'Pending', 0);`);
    legacy.close();
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const rowCount = (body, kind) => (body.match(new RegExp(`data-testid="${kind}-row"`, 'g')) || []).length;
    const initial = await html('/');
    assert.match(initial, /<label for="project-filter">Project filter<\/label>/);
    assert.match(initial, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.equal(rowCount(initial, 'project'), 2);
    assert.match(initial, /data-testid="project-summary">1\/2 completed/);
    assert.match(initial, /data-testid="project-summary">0\/0 completed/);
    assert.ok(initial.indexOf('Alpha') < initial.indexOf('Beta'));
    assert.equal(rowCount(await html('/?filter=Archived'), 'project'), 0);
    assert.equal((await post('/projects/999/archive')).status, 404);
    assert.equal((await post('/projects/1/archive')).status, 303);
    const active = await html('/');
    assert.equal(rowCount(active, 'project'), 1);
    assert.doesNotMatch(active, /Alpha/);
    const archived = await html('/?filter=Archived');
    assert.equal(rowCount(archived, 'project'), 1);
    assert.match(archived, /Alpha/);
    assert.match(archived, />Open project<\/button>/);
    assert.match(archived, />Restore project<\/button>/);
    assert.doesNotMatch(archived, />Archive project<\/button>/);
    assert.match(archived, /data-testid="project-summary">1\/2 completed/);
    const detail = await html('/projects/1');
    assert.match(detail, /<p>Archived project<\/p>/);
    assert.match(detail, /<button type="submit" disabled>Create task<\/button>/);
    assert.equal(rowCount(detail, 'task'), 2);
    const checkboxes = [...detail.matchAll(/<input type="checkbox"[^>]*>/g)].map(match => match[0]);
    assert.equal(checkboxes.length, 2);
    assert.ok(checkboxes.every(input => input.includes(' disabled')));
    assert.match(checkboxes[0], / checked/);
    const open = await html('/projects/1?filter=Open');
    assert.equal(rowCount(open, 'task'), 1);
    assert.match(open, /Complete Pending/);
    const completed = await html('/projects/1?filter=Completed');
    assert.equal(rowCount(completed, 'task'), 1);
    assert.match(completed, /Complete Finished/);
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1/completion')).status, 403);
    assert.equal(await html('/projects/1'), detail);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await html('/'), active);
    assert.equal(await html('/?filter=Archived'), archived);
    assert.equal(await html('/projects/1'), detail);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.equal(await html('/'), initial);
    assert.equal(rowCount(await html('/?filter=Archived'), 'project'), 0);
    const restored = await html('/projects/1');
    assert.doesNotMatch(restored, / disabled|Archived project/);
    assert.match(restored, /aria-label="Complete Finished" checked/);
    assert.equal((await post('/projects/1/tasks/2/completion', { completed: '1' })).status, 303);
    assert.match(await html('/'), /data-testid="project-summary">2\/2 completed/);
    assert.equal((await post('/projects/1/tasks', { title: 'Third' })).status, 303);
    assert.match(await html('/'), /data-testid="project-summary">2\/3 completed/);
    await server.stop();
    server = await start(dbPath);
    assert.match(await html('/'), /data-testid="project-summary">2\/3 completed/);
    assert.equal(rowCount(await html('/projects/1'), 'task'), 3);
    assert.doesNotMatch(await html('/projects/1'), / disabled|Archived project/);
    assert.equal(rowCount(await html('/projects/2'), 'task'), 0);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('renaming preserves project identity, order, tasks, archive protection, and persistence', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data/test-'));
  let server;
  try {
    const dbPath = resolve(directory, 'rename.sqlite');
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    for (const name of ['Alpha', 'Beta']) assert.equal((await post('/projects', { name })).status, 303);
    await post('/projects/1/tasks', { title: 'Finished' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1/completion', { completed: '1' });
    const original = await html('/projects/1');
    assert.match(original, /<label for="new-project-name">New project name<\/label>/);
    assert.match(original, /<input id="new-project-name" name="name" type="text">/);
    assert.match(original, /<button type="submit">Rename project<\/button>/);
    const originalList = await html('/');
    for (const name of ['', ' \t ']) {
      const response = await post('/projects/1/rename', { name });
      assert.equal(response.status, 400);
      assert.match(await response.text(), /role="alert">Project name is required/);
      assert.equal(await html('/projects/1'), original);
      assert.equal(await html('/'), originalList);
    }
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
    const renamed = await post('/projects/1/rename', { name: '  New & <name> "quoted"  ', filter: 'Open' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Open');
    const saved = await html('/projects/1');
    assert.match(saved, /<h1>New &amp; &lt;name&gt; &quot;quoted&quot;<\/h1>/);
    // Only the page title and heading change: forms, task IDs and state stay identical.
    assert.equal(saved, original.replaceAll('Alpha', 'New &amp; &lt;name&gt; &quot;quoted&quot;'));
    const savedList = await html('/');
    assert.equal(savedList, originalList.replaceAll('Alpha', 'New &amp; &lt;name&gt; &quot;quoted&quot;'));
    assert.match(savedList, /data-testid="project-summary">1\/2 completed/);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await html('/projects/1'), saved);
    assert.equal(await html('/'), savedList);
    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    assert.match(archived, /<input id="new-project-name" name="name" type="text" disabled>/);
    assert.match(archived, /<button type="submit" disabled>Rename project<\/button>/);
    assert.equal((await post('/projects/1/rename', { name: 'Blocked' })).status, 403);
    assert.equal(await html('/projects/1'), archived);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await html('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), saved);
    assert.equal((await post('/projects/1/rename', { name: ' Restored name ' })).status, 303);
    const restored = await html('/projects/1');
    assert.match(restored, /<h1>Restored name<\/h1>/);
    assert.match(restored, /aria-label="Complete Finished" checked/);
    assert.match(restored, /aria-label="Complete Pending" data-autosubmit/);
    assert.equal(await html('/'), originalList.replaceAll('Alpha', 'Restored name'));
    await server.stop();
    server = await start(dbPath);
    assert.equal(await html('/projects/1'), restored);
    assert.equal(await html('/'), originalList.replaceAll('Alpha', 'Restored name'));
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
