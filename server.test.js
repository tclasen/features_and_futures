import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('task renaming preserves ownership, order, completion and counts through filters, archive/restore and restarts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
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
    await post('/projects/1/tasks', { title: 'First' });
    await post('/projects/1/tasks', { title: 'Second' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    await post('/projects/1/tasks/1/completion', { completed: '1' });
    const original = await get('/projects/1');
    const summary = await get('/');
    for (const row of rows(original)) {
      assert.match(row, /<label for="new-task-title-\d+">New task title<\/label>/);
      assert.match(row, /<input id="new-task-title-\d+"[^>]*type="text"/);
      assert.match(row, /<button type="submit">Rename task<\/button>/);
      assert.doesNotMatch(row, / disabled/);
    }
    for (const title of ['', ' \t\n ']) {
      const invalid = await (await post('/projects/1/tasks/1/rename?filter=Completed', { title })).text();
      assert.match(invalid, /role="alert">Task title is required/);
      assert.match(invalid, /<option selected>Completed<\/option>/);
      assert.match(rows(invalid)[0], /aria-label="Complete First"[^>]* checked/);
      assert.equal(await get('/projects/1'), original);
      assert.equal(await get('/'), summary);
    }
    assert.equal((await post('/projects/2/tasks/1/rename', { title: 'Wrong owner' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/rename', { title: 'Missing' })).status, 404);
    assert.equal(await get('/projects/1'), original);
    const renamed = await post('/projects/1/tasks/1/rename?filter=Completed', { title: '  <Renamed & "task">  ' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const after = await get('/projects/1');
    assert.equal(rows(after).length, 2);
    assert.match(rows(after)[0], /aria-label="Complete &lt;Renamed &amp; &quot;task&quot;&gt;"[^>]* checked/);
    assert.match(rows(after)[0], /<span>&lt;Renamed &amp; &quot;task&quot;&gt;<\/span>/);
    assert.match(rows(after)[0], /action="\/projects\/1\/tasks\/1\/rename/);
    assert.equal(rows(after)[1], rows(original)[1]);
    assert.deepEqual(rows(await get('/projects/1?filter=Completed')), [rows(after)[0].replaceAll('?filter=All', '?filter=Completed')]);
    assert.match(rows(await get('/projects/1?filter=Open'))[0], /Complete Second/);
    assert.equal(await get('/'), summary);
    assert.doesNotMatch(await get('/projects/2'), /Renamed|First|Second/);
    await app.stop();
    app = await start(dbPath);
    assert.equal(await get('/projects/1'), after);
    assert.equal(await get('/'), summary);

    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    for (const row of rows(archived)) {
      assert.match(row, /<input id="new-task-title-\d+"[^>]* disabled>/);
      assert.match(row, /<button type="submit" disabled>Rename task<\/button>/);
    }
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Blocked' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await app.stop();
    app = await start(dbPath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), after);
    const openRename = await post('/projects/1/tasks/2/rename?filter=Open', { title: '  Open renamed  ' });
    assert.equal(openRename.status, 303);
    assert.equal(openRename.headers.get('location'), '/projects/1?filter=Open');
    const restored = await get('/projects/1');
    assert.match(rows(restored)[1], /aria-label="Complete Open renamed"/);
    assert.doesNotMatch(rows(restored)[1], / checked| disabled/);
    assert.equal(await get('/'), summary);
    await app.stop();
    app = await start(dbPath);
    assert.equal(await get('/projects/1'), restored);
    assert.equal(await get('/'), summary);
    await post('/projects/1/tasks/1/completion');
    assert.doesNotMatch(rows(await get('/projects/1'))[0], / checked/);
    assert.match(await get('/'), /data-testid="project-summary">0\/2 completed/);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('renaming preserves identity, order, tasks and summaries, and is blocked until an archived project is restored', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  let app;
  try {
    const dbPath = join(dir, 'workboard.sqlite');
    app = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${app.base}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${app.base}${path}`)).text();
    const taskRows = html => [...html.matchAll(/<div class="task-row" data-testid="task-row">([\s\S]*?)<\/div>/g)].map(match => match[1]);
    const projectRows = html => [...html.matchAll(/<div class="project-row" data-testid="project-row">([\s\S]*?)<div class="project-actions">/g)].map(match => match[1]);
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second project' });
    await post('/projects/1/tasks', { title: 'Finished task' });
    await post('/projects/1/tasks', { title: 'Open task' });
    await post('/projects/1/tasks/1/completion', { completed: '1' });
    const original = await get('/projects/1');
    assert.match(original, /<label for="new-project-name">New project name<\/label>/);
    assert.match(original, /<input id="new-project-name"[^>]*>/);
    assert.match(original, /<button type="submit">Rename project<\/button>/);
    for (const name of ['', ' \t\n ']) {
      const invalid = await (await post('/projects/1/rename', { name })).text();
      assert.match(invalid, /role="alert">Project name is required/);
      assert.match(invalid, /<h1>Original<\/h1>/);
      assert.equal(await get('/projects/1'), original);
    }
    const rename = await post('/projects/1/rename?filter=Completed', { name: '  <Renamed & "project">  ' });
    assert.equal(rename.status, 303);
    assert.equal(rename.headers.get('location'), '/projects/1?filter=Completed');
    const renamed = await get('/projects/1');
    assert.match(renamed, /<h1>&lt;Renamed &amp; &quot;project&quot;&gt;<\/h1>/);
    assert.deepEqual(taskRows(renamed), taskRows(original));
    assert.equal(taskRows(await get('/projects/1?filter=Completed')).length, 1);
    const listing = await get('/');
    const rows = projectRows(listing);
    assert.equal(rows.length, 2);
    assert.match(rows[0], /&lt;Renamed &amp; &quot;project&quot;&gt;/);
    assert.match(rows[0], /data-testid="project-summary">1\/2 completed/);
    assert.match(rows[1], /Second project/);
    assert.match(listing, /action="\/projects\/1"/);
    assert.doesNotMatch(await get('/projects/2'), /Finished task|Open task/);
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
    await app.stop();
    app = await start(dbPath);
    assert.equal(await get('/projects/1'), renamed);
    assert.equal(await get('/'), listing);

    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.match(archived, /<input id="new-project-name"[^>]* disabled>/);
    assert.match(archived, /<button type="submit" disabled>Rename project<\/button>/);
    assert.equal((await post('/projects/1/rename', { name: 'Blocked rename' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await app.stop();
    app = await start(dbPath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), renamed);
    assert.equal((await post('/projects/1/rename', { name: '  After restore  ' })).status, 303);
    const restored = await get('/projects/1');
    assert.match(restored, /<h1>After restore<\/h1>/);
    assert.deepEqual(taskRows(restored), taskRows(original));
    assert.match(projectRows(await get('/'))[0], /After restore[\s\S]*1\/2 completed/);
    await app.stop();
    app = await start(dbPath);
    assert.equal(await get('/projects/1'), restored);
    assert.match(projectRows(await get('/'))[0], /After restore[\s\S]*1\/2 completed/);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

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

test('existing projects migrate, summaries count all tasks, and archive/restore persists without task changes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  let app;
  try {
    const dbPath = join(dir, 'workboard.sqlite');
    // Exercise an actual database from the previous schema.
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)));
      INSERT INTO projects (name) VALUES ('Existing project');
      INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Done task', 1), (1, 'Open task', 0);`);
    legacy.close();
    app = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${app.base}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${app.base}${path}`)).text();
    const rows = html => [...html.matchAll(/<div class="task-row" data-testid="task-row">([\s\S]*?)<\/div>/g)].map(match => match[1]);
    const initial = await get('/');
    assert.match(initial, /<label for="project-filter">Project filter<\/label>/);
    assert.match(initial, /<option selected>Active<\/option>/);
    assert.match(initial, /<option>Archived<\/option>/);
    assert.match(initial, /data-testid="project-summary">1\/2 completed/);
    assert.match(initial, />Archive project<\/button>/);
    assert.doesNotMatch(initial, />Restore project<\/button>/);
    await post('/projects', { name: 'New project' });
    assert.match(await get('/'), /data-testid="project-summary">0\/0 completed/);
    assert.equal(rows(await get('/projects/1?filter=Completed')).length, 1);
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);

    assert.equal((await post('/projects/1/archive')).status, 303);
    assert.doesNotMatch(await get('/'), /Existing project/);
    const archived = await get('/?filter=Archived');
    assert.match(archived, /Existing project/);
    assert.doesNotMatch(archived, /New project/);
    assert.match(archived, /<option selected>Archived<\/option>/);
    assert.match(archived, />Open project<\/button>/);
    assert.match(archived, />Restore project<\/button>/);
    assert.doesNotMatch(archived, />Archive project<\/button>/);
    assert.match(archived, /data-testid="project-summary">1\/2 completed/);
    const detail = await get('/projects/1');
    assert.match(detail, /<p>Archived project<\/p>/);
    assert.match(detail, /<button type="submit" disabled>Create task<\/button>/);
    const taskRows = rows(detail);
    assert.equal(taskRows.length, 2);
    assert.ok(taskRows.every(row => /type="checkbox"[^>]* disabled/.test(row)));
    assert.match(taskRows[0], / checked/);
    assert.doesNotMatch(taskRows[1], / checked/);
    assert.equal(rows(await get('/projects/1?filter=Open')).length, 1);
    assert.equal(rows(await get('/projects/1?filter=Completed')).length, 1);
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked task' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1/completion')).status, 403);
    assert.equal((await post('/projects/1/tasks/2/completion', { completed: '1' })).status, 403);
    assert.equal(await get('/projects/1'), detail);
    assert.equal(await get('/?filter=Archived'), archived);
    assert.equal((await post('/projects/999/archive')).status, 404);

    await app.stop();
    app = await start(dbPath);
    assert.equal(await get('/?filter=Archived'), archived);
    assert.equal(await get('/projects/1'), detail);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.doesNotMatch(await get('/?filter=Archived'), /data-testid="project-row"/);
    const restored = await get('/');
    assert.ok(restored.indexOf('Existing project') < restored.indexOf('New project'));
    assert.match(restored, /data-testid="project-summary">1\/2 completed/);
    const restoredDetail = await get('/projects/1');
    assert.doesNotMatch(restoredDetail, / disabled|Archived project/);
    assert.equal(rows(restoredDetail).length, 2);
    assert.match(rows(restoredDetail)[0], / checked/);
    await app.stop();
    app = await start(dbPath);
    assert.equal(await get('/'), restored);
    assert.equal(await get('/projects/1'), restoredDetail);
    await post('/projects/1/tasks/2/completion', { completed: '1' });
    assert.match(await get('/'), /data-testid="project-summary">2\/2 completed/);
    await post('/projects/1/tasks/1/completion');
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    await post('/projects/1/tasks', { title: 'After restore' });
    assert.match(await get('/'), /data-testid="project-summary">1\/3 completed/);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
