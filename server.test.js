import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('priorities migrate, persist independently, and preserve task data and archive restrictions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  const dbPath = join(dir, 'workboard.sqlite');
  const oldDb = new DatabaseSync(dbPath);
  oldDb.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('First project'), ('Other project');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing task', 1), (2, 'Other task', 0);`);
  oldDb.close();
  let app;
  try {
    app = await launch(dbPath);
    const get = async (path) => (await fetch(app.url + path)).text();
    const post = (path, fields = {}) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const rows = (body) => [...body.matchAll(/<div class="task" data-testid="task-row">([\s\S]*?)\n      <\/div>/g)].map((match) => match[1]);
    const selectedPriority = (row) => row.match(/<select id="task-priority-\d+"[\s\S]*?<\/select>/)[0];
    await post('/projects/1/tasks', { title: 'New task' });
    const initial = await get('/projects/1');
    const other = await get('/projects/2');
    const summary = await get('/');
    for (const row of [...rows(initial), ...rows(other)]) {
      assert.match(row, /<label for="task-priority-\d+">Task priority<\/label>/);
      assert.match(selectedPriority(row), /<option>Low<\/option><option selected>Normal<\/option><option>High<\/option>/);
      assert.equal((selectedPriority(row).match(/<option/g) || []).length, 3);
    }
    for (const path of ['/projects/2/tasks/1/priority', '/projects/1/tasks/2/priority', '/projects/1/tasks/999/priority', '/projects/999/tasks/1/priority']) {
      assert.equal((await post(path, { priority: 'High' })).status, 404);
    }
    for (const priority of ['', 'Urgent', 'high']) {
      assert.equal((await post('/projects/1/tasks/1/priority', { priority })).status, 422);
      assert.equal(await get('/projects/1'), initial);
    }
    const high = await post('/projects/1/tasks/1/priority', { priority: 'High', filter: 'Completed' });
    assert.equal(high.status, 303);
    assert.equal(high.headers.get('location'), '/projects/1?filter=Completed');
    assert.equal((await post('/projects/1/tasks/3/priority', { priority: 'Low', filter: 'Open' })).headers.get('location'), '/projects/1?filter=Open');
    const changed = await get('/projects/1');
    const changedRows = rows(changed);
    assert.equal(changedRows.length, 2);
    assert.match(changedRows[0], /aria-label="Complete Existing task" checked/);
    assert.match(selectedPriority(changedRows[0]), /<option selected>High<\/option>/);
    assert.match(changedRows[1], /aria-label="Complete New task" onchange/);
    assert.match(selectedPriority(changedRows[1]), /<option selected>Low<\/option>/);
    assert.equal(rows(await get('/projects/1?filter=Completed'))[0], changedRows[0].replaceAll('name="filter" value="All"', 'name="filter" value="Completed"'));
    assert.equal(rows(await get('/projects/1?filter=Open'))[0], changedRows[1].replaceAll('name="filter" value="All"', 'name="filter" value="Open"'));
    assert.equal(await get('/projects/2'), other);
    assert.equal(await get('/'), summary);
    await post('/projects/1/tasks/1/rename', { title: 'Renamed task' });
    await post('/projects/1/rename', { name: 'Renamed project' });
    const renamed = await get('/projects/1');
    assert.match(rows(renamed)[0], /aria-label="Complete Renamed task" checked/);
    assert.match(selectedPriority(rows(renamed)[0]), /<option selected>High<\/option>/);
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), renamed);
    assert.equal(await get('/projects/2'), other);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    for (const row of rows(archived)) assert.match(selectedPriority(row), / disabled/);
    assert.equal(rows(await get('/projects/1?filter=Completed')).length, 1);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Normal' })).status, 409);
    assert.equal(await get('/projects/1'), archived);
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), renamed);
    const restoredSummary = await get('/');
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Normal' })).status, 303);
    const restored = await get('/projects/1');
    assert.match(selectedPriority(rows(restored)[0]), /<option selected>Normal<\/option>/);
    assert.match(selectedPriority(rows(restored)[1]), /<option selected>Low<\/option>/);
    assert.equal(await get('/'), restoredSummary);
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), restored);
    assert.equal(await get('/projects/2'), other);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('task renaming preserves ownership, order, completion, filters, and persisted archive restrictions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  const dbPath = join(dir, 'workboard.sqlite');
  let app;
  try {
    app = await launch(dbPath);
    const get = async (path) => (await fetch(app.url + path)).text();
    const post = (path, fields = {}) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const rows = (body) => [...body.matchAll(/<div class="task" data-testid="task-row">([\s\S]*?)\n      <\/div>/g)].map((match) => match[1]);
    await post('/projects', { name: 'First project' });
    await post('/projects', { name: 'Other project' });
    await post('/projects/1/tasks', { title: 'First task' });
    await post('/projects/1/tasks', { title: 'Second task' });
    await post('/projects/2/tasks', { title: 'Other task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const initial = await get('/projects/1');
    const other = await get('/projects/2');
    const summary = await get('/');
    const initialRows = rows(initial);
    assert.equal(initialRows.length, 2);
    for (const [index, row] of initialRows.entries()) {
      assert.match(row, new RegExp(`<label for="new-task-title-${index + 1}">New task title</label>`));
      assert.match(row, /<button type="submit">Rename task<\/button>/);
      assert.doesNotMatch(row, / disabled/);
    }
    for (const title of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/tasks/1/rename', { title, filter: 'Completed' });
      assert.equal(invalid.status, 422);
      const body = await invalid.text();
      assert.match(body, /role="alert">Task title is required/);
      assert.match(body, /<option selected>Completed<\/option>/);
      assert.match(rows(body)[0], /aria-label="Complete First task" checked/);
      assert.equal(await get('/projects/1'), initial);
      assert.equal(await get('/'), summary);
    }
    for (const path of ['/projects/2/tasks/1/rename', '/projects/1/tasks/3/rename', '/projects/1/tasks/999/rename', '/projects/999/tasks/1/rename']) {
      assert.equal((await post(path, { title: 'Forbidden change' })).status, 404);
    }
    const renamed = await post('/projects/1/tasks/1/rename', { title: '  Finished renamed  ', filter: 'Completed' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const openRename = await post('/projects/1/tasks/2/rename', { title: '  Pending <task> & "title"  ', filter: 'Open' });
    assert.equal(openRename.status, 303);
    assert.equal(openRename.headers.get('location'), '/projects/1?filter=Open');
    const detail = await get('/projects/1');
    const renamedRows = rows(detail);
    assert.equal(renamedRows.length, 2);
    assert.match(renamedRows[0], /action="\/projects\/1\/tasks\/1\/rename"/);
    assert.match(renamedRows[0], /<span>Finished renamed<\/span>/);
    assert.match(renamedRows[0], /aria-label="Complete Finished renamed" checked/);
    assert.match(renamedRows[1], /action="\/projects\/1\/tasks\/2\/rename"/);
    assert.match(renamedRows[1], /<span>Pending &lt;task&gt; &amp; &quot;title&quot;<\/span>/);
    assert.match(renamedRows[1], /aria-label="Complete Pending &lt;task&gt; &amp; &quot;title&quot;" onchange/);
    assert.match(renamedRows[1], /value="Pending &lt;task&gt; &amp; &quot;title&quot;"/);
    assert.doesNotMatch(detail, /Complete First task|Complete Second task/);
    const completed = await get('/projects/1?filter=Completed');
    const open = await get('/projects/1?filter=Open');
    assert.equal(rows(completed).length, 1);
    assert.match(completed, /Complete Finished renamed/);
    assert.equal(rows(open).length, 1);
    assert.match(open, /Complete Pending &lt;task&gt;/);
    assert.equal(await get('/projects/2'), other);
    assert.equal(await get('/'), summary);
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), detail);
    assert.equal(await get('/projects/1?filter=Completed'), completed);
    assert.equal(await get('/projects/1?filter=Open'), open);
    assert.equal(await get('/projects/2'), other);
    assert.equal(await get('/'), summary);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    for (const row of rows(archived)) {
      assert.match(row, /id="new-task-title-\d+"[^>]* disabled/);
      assert.match(row, /<button type="submit" disabled>Rename task<\/button>/);
    }
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Blocked rename' })).status, 409);
    assert.equal(await get('/projects/1'), archived);
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), detail);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: '  Restored title  ' })).status, 303);
    const restored = await get('/projects/1');
    assert.match(restored, /aria-label="Complete Restored title" checked/);
    assert.doesNotMatch(restored, / disabled/);
    assert.equal(await get('/'), summary);
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), restored);
    assert.equal(await get('/projects/2'), other);
    assert.equal(await get('/'), summary);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

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

test('archive migration, summaries, read-only tasks, restoration, and restart persistence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const dbPath = join(dir, 'workboard.sqlite');
  // Simulate the database produced before archive support was added.
  const oldDb = new DatabaseSync(dbPath);
  oldDb.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    INSERT INTO projects (name) VALUES ('Existing project');`);
  oldDb.close();
  let app;
  try {
    app = await launch(dbPath);
    const get = async (path) => (await fetch(app.url + path)).text();
    const post = (path, fields = {}) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const rows = (body) => [...body.matchAll(/data-testid="project-summary">([^<]+)/g)].map((match) => match[1]);
    const initial = await get('/');
    assert.match(initial, /Existing project/);
    assert.match(initial, /<label for="project-filter">Project filter<\/label>/);
    assert.match(initial, /<option selected>Active<\/option>\s*<option>Archived<\/option>/);
    assert.deepEqual(rows(initial), ['0/0 completed']);
    await post('/projects', { name: 'Second project' });
    await post('/projects/1/tasks', { title: 'Done task' });
    await post('/projects/1/tasks', { title: 'Open task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    assert.deepEqual(rows(await get('/')), ['1/2 completed', '0/0 completed']);
    await get('/projects/1?filter=Completed');
    assert.deepEqual(rows(await get('/')), ['1/2 completed', '0/0 completed']);
    assert.equal((await post('/projects/999/archive')).status, 404);
    const archive = await post('/projects/1/archive');
    assert.equal(archive.status, 303);
    assert.equal(archive.headers.get('location'), '/');
    assert.doesNotMatch(await get('/'), /Existing project/);
    const archived = await get('/?filter=Archived');
    assert.match(archived, /Existing project/);
    assert.match(archived, /<option selected>Archived<\/option>/);
    assert.match(archived, />Open project<\/button>/);
    assert.match(archived, />Restore project<\/button>/);
    assert.doesNotMatch(archived, />Archive project<\/button>/);
    assert.deepEqual(rows(archived), ['1/2 completed']);
    const detail = await get('/projects/1');
    assert.match(detail, /Archived project/);
    assert.match(detail, /<button type="submit" disabled>Create task<\/button>/);
    assert.match(detail, /aria-label="Complete Done task" checked disabled/);
    assert.match(detail, /aria-label="Complete Open task" disabled/);
    assert.equal((detail.match(/data-testid="task-row"/g) || []).length, 2);
    assert.doesNotMatch(await get('/projects/1?filter=Open'), /Complete Done task/);
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /Complete Open task/);
    assert.equal((await post('/projects/1/tasks', { title: 'Forbidden task' })).status, 409);
    assert.equal((await post('/projects/1/tasks/1', { completed: '0' })).status, 409);
    assert.equal(await get('/projects/1'), detail);
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get('/?filter=Archived'), archived);
    assert.equal(await get('/projects/1'), detail);
    assert.doesNotMatch(await get('/'), /Existing project/);
    const restore = await post('/projects/1/restore');
    assert.equal(restore.status, 303);
    assert.equal(restore.headers.get('location'), '/?filter=Archived');
    assert.doesNotMatch(await get('/?filter=Archived'), /data-testid="project-row"/);
    const active = await get('/');
    assert.ok(active.indexOf('Existing project') < active.indexOf('Second project'));
    assert.deepEqual(rows(active), ['1/2 completed', '0/0 completed']);
    const restored = await get('/projects/1');
    assert.doesNotMatch(restored, /Archived project| disabled/);
    assert.match(restored, /aria-label="Complete Done task" checked/);
    await post('/projects/1/tasks/2', { completed: '1' });
    await post('/projects/1/tasks', { title: 'After restore' });
    assert.deepEqual(rows(await get('/')), ['2/3 completed', '0/0 completed']);
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.deepEqual(rows(await get('/')), ['2/3 completed', '0/0 completed']);
    assert.match(await get('/projects/1'), /Complete After restore/);
    assert.doesNotMatch(await get('/projects/1'), /Archived project| disabled/);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('renaming validates and preserves identity, order, tasks, summaries, and archive restrictions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const dbPath = join(dir, 'workboard.sqlite');
  let app;
  try {
    app = await launch(dbPath);
    const get = async (path) => (await fetch(app.url + path)).text();
    const post = (path, fields = {}) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second project' });
    await post('/projects/1/tasks', { title: 'Finished task' });
    await post('/projects/1/tasks', { title: 'Pending task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const initial = await get('/projects/1');
    assert.match(initial, /<label for="new-project-name">New project name<\/label>/);
    assert.match(initial, /<button type="submit">Rename project<\/button>/);
    for (const name of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/rename', { name });
      assert.equal(invalid.status, 422);
      assert.match(await invalid.text(), /role="alert">Project name is required/);
      assert.equal(await get('/projects/1'), initial);
    }
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
    const renamed = await post('/projects/1/rename', { name: '  Renamed <project> & "name"  ', filter: 'Open' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Open');
    const detail = await get('/projects/1');
    assert.match(detail, /<h1>Renamed &lt;project&gt; &amp; &quot;name&quot;<\/h1>/);
    assert.match(detail, /aria-label="Complete Finished task" checked/);
    assert.match(detail, /aria-label="Complete Pending task" onchange/);
    assert.equal((detail.match(/data-testid="task-row"/g) || []).length, 2);
    const listing = await get('/');
    assert.ok(listing.indexOf('Renamed &lt;project&gt;') < listing.indexOf('Second project'));
    assert.match(listing, /action="\/projects\/1"/);
    assert.match(listing, /data-testid="project-summary">1\/2 completed/);
    assert.match(await get('/projects/2'), /<h1>Second project<\/h1>/);
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), detail);
    assert.equal(await get('/'), listing);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.match(archived, /id="new-project-name"[^>]* disabled/);
    assert.match(archived, /<button type="submit" disabled>Rename project<\/button>/);
    assert.equal((await post('/projects/1/rename', { name: 'Forbidden rename' })).status, 409);
    assert.equal(await get('/projects/1'), archived);
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), detail);
    assert.equal((await post('/projects/1/rename', { name: '  Restored name  ' })).status, 303);
    const restored = await get('/projects/1');
    assert.match(restored, /<h1>Restored name<\/h1>/);
    assert.match(restored, /aria-label="Complete Finished task" checked/);
    assert.match(restored, /aria-label="Complete Pending task" onchange/);
    assert.doesNotMatch(restored, / disabled/);
    const restoredListing = await get('/');
    assert.ok(restoredListing.indexOf('Restored name') < restoredListing.indexOf('Second project'));
    assert.match(restoredListing, /data-testid="project-summary">1\/2 completed/);
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), restored);
    assert.equal(await get('/'), restoredListing);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('combined filters retain selections through edits, archive, and persistence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-combined-filters-'));
  const dbPath = join(dir, 'workboard.sqlite');
  let app;
  try {
    app = await launch(dbPath);
    const get = async (path) => (await fetch(app.url + path)).text();
    const post = (path, fields = {}) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const titles = (body) => [...body.matchAll(/<span>([^<]+)<\/span>/g)].map((match) => match[1]);
    const select = (body, id) => body.match(new RegExp('<select id="' + id + '"[^>]*>([\\s\\S]*?)</select>'))[1];
    const assertSelections = (body, filter, priorityFilter) => {
      assert.match(select(body, 'task-filter'), new RegExp('<option selected>' + filter + '</option>'));
      assert.match(select(body, 'priority-filter'), new RegExp('<option selected>' + priorityFilter + '</option>'));
    };
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const tasks = [];
    for (const priority of ['Low', 'Normal', 'High']) {
      for (const completed of [false, true]) {
        const id = tasks.length + 1;
        const title = priority + (completed ? ' done' : ' open');
        tasks.push({ id, title, priority, completed });
        await post('/projects/1/tasks', { title });
        await post('/projects/1/tasks/' + id + '/priority', { priority });
        if (completed) await post('/projects/1/tasks/' + id, { completed: '1' });
      }
    }
    await post('/projects/2/tasks', { title: 'Other task' });
    const summary = await get('/');
    const other = await get('/projects/2');
    const original = await get('/projects/1');
    assertSelections(original, 'All', 'All');
    assert.equal(select(original, 'priority-filter'),
      '\n        <option selected>All</option><option>Low</option><option>Normal</option><option>High</option>\n      ');
    // Every intersection must preserve creation order and leave saved data untouched.
    for (const filter of ['All', 'Open', 'Completed']) {
      for (const priorityFilter of ['All', 'Low', 'Normal', 'High']) {
        const body = await get('/projects/1?' + new URLSearchParams({ filter, priorityFilter }));
        assertSelections(body, filter, priorityFilter);
        assert.deepEqual(titles(body), tasks.filter((task) =>
          (filter === 'All' || task.completed === (filter === 'Completed')) &&
          (priorityFilter === 'All' || task.priority === priorityFilter)).map((task) => task.title));
        // Both selectors submit together; every mutation form carries both selections.
        const forms = [...body.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)];
        const filterForm = forms.find((form) => form[1].includes('id="task-filter"'));
        assert.match(filterForm[1], /id="priority-filter"/);
        for (const form of forms.filter((form) => /method="post"/.test(form[0]))) {
          assert.match(form[1], new RegExp('name="filter" value="' + filter + '"'));
          assert.match(form[1], new RegExp('name="priorityFilter" value="' + priorityFilter + '"'));
        }
      }
    }
    assert.equal(await get('/projects/1'), original);
    assert.equal(await get('/'), summary);
    const fields = { filter: 'Open', priorityFilter: 'High' };
    const filteredPath = '/projects/1?filter=Open&priorityFilter=High';
    for (const [path, extra] of [
      ['/projects/1/tasks', { title: '   ' }],
      ['/projects/1/tasks/5/rename', { title: '   ' }],
      ['/projects/1/rename', { name: '   ' }],
    ]) {
      const response = await post(path, { ...fields, ...extra });
      assert.equal(response.status, 422);
      const body = await response.text();
      assertSelections(body, 'Open', 'High');
      assert.deepEqual(titles(body), ['High open']);
    }
    const renamed = await post('/projects/1/tasks/5/rename', { ...fields, title: '  Renamed high  ' });
    assert.equal(renamed.headers.get('location'), filteredPath);
    const renamedBody = await get(filteredPath);
    assertSelections(renamedBody, 'Open', 'High');
    assert.deepEqual(titles(renamedBody), ['Renamed high']);
    assert.match(renamedBody, /aria-label="Complete Renamed high" onchange/);
    assert.match(select(renamedBody, 'task-priority-5'), /<option selected>High<\/option>/);
    assert.equal(await get('/'), summary);

    // Changing priority removes a row under the retained intersection.
    const changed = await post('/projects/1/tasks/5/priority', { ...fields, priority: 'Low' });
    assert.equal(changed.headers.get('location'), filteredPath);
    const empty = await get(filteredPath);
    assertSelections(empty, 'Open', 'High');
    assert.deepEqual(titles(empty), []);
    assert.equal(await get('/'), summary);
    const lowPath = '/projects/1?filter=Open&priorityFilter=Low';
    assert.deepEqual(titles(await get(lowPath)), ['Low open', 'Renamed high']);
    const done = await post('/projects/1/tasks/5', { filter: 'Open', priorityFilter: 'Low', completed: '1' });
    assert.equal(done.headers.get('location'), lowPath);
    assertSelections(await get(lowPath), 'Open', 'Low');
    assert.deepEqual(titles(await get(lowPath)), ['Low open']);
    const completedPath = '/projects/1?filter=Completed&priorityFilter=Low';
    assert.deepEqual(titles(await get(completedPath)), ['Low done', 'Renamed high']);
    const updatedSummary = await get('/');
    assert.match(updatedSummary, /data-testid="project-summary">4\/6 completed/);
    assert.equal(await get('/projects/2'), other);
    const saved = await get('/projects/1');
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), saved);
    assert.equal(await get('/'), updatedSummary);
    assert.deepEqual(titles(await get(completedPath)), ['Low done', 'Renamed high']);

    await post('/projects/1/archive');
    const archived = await get(completedPath);
    assertSelections(archived, 'Completed', 'Low');
    assert.deepEqual(titles(archived), ['Low done', 'Renamed high']);
    assert.doesNotMatch(archived, /id="(?:task-filter|priority-filter)"[^>]*disabled/);
    for (const control of archived.matchAll(/<(?:input|select)\b[^>]*(?:type="checkbox"|id="new-task-title-\d+"|id="task-priority-\d+")[^>]*>/g)) {
      assert.match(control[0], /disabled/);
    }
    const blocked = await post('/projects/1/tasks/5/priority', {
      filter: 'Completed', priorityFilter: 'Low', priority: 'High',
    });
    assert.equal(blocked.status, 409);
    assertSelections(await blocked.text(), 'Completed', 'Low');
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get(completedPath), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), saved);
    assert.equal(await get('/'), updatedSummary);
    assert.equal(await get('/projects/2'), other);
    const reopened = await get('/projects/1');
    assertSelections(reopened, 'All', 'All');
    assert.doesNotMatch(reopened, / disabled/);
    const uncheck = await post('/projects/1/tasks/5', { filter: 'Completed', priorityFilter: 'Low' });
    assert.equal(uncheck.headers.get('location'), completedPath);
    assertSelections(await get(completedPath), 'Completed', 'Low');
    assert.deepEqual(titles(await get(completedPath)), ['Low done']);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('project defaults migrate, apply only to subsequent tasks, and survive archive and restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-defaults-'));
  const dbPath = join(dir, 'workboard.sqlite');
  const oldDb = new DatabaseSync(dbPath);
  oldDb.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
    INSERT INTO projects (name) VALUES ('Existing project');
    INSERT INTO tasks (project_id, title, completed, priority) VALUES (1, 'Existing high', 1, 'High'), (1, 'Existing normal', 0, 'Normal');`);
  oldDb.close();
  let app;
  try {
    app = await launch(dbPath);
    const get = async (path) => (await fetch(app.url + path)).text();
    const post = (path, fields = {}) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const selector = (body, id) => body.match(new RegExp('<select id="' + id + '"[^>]*>[\\s\\S]*?</select>'))[0];
    const rows = (body) => [...body.matchAll(/<div class="task" data-testid="task-row">([\s\S]*?)\n      <\/div>/g)].map((match) => match[1]);
    const assertDefault = (body, priority) => {
      const control = selector(body, 'default-task-priority');
      assert.deepEqual([...control.matchAll(/<option(?: selected)?>([^<]+)<\/option>/g)].map((match) => match[1]), ['Low', 'Normal', 'High']);
      assert.match(control, new RegExp('<option selected>' + priority + '</option>'));
      assert.match(body, /<label for="default-task-priority">Default task priority<\/label>/);
    };
    await post('/projects', { name: 'Second project' });
    const other = await get('/projects/2');
    assertDefault(other, 'Normal');
    assertDefault(await get('/projects/1'), 'Normal');
    await post('/projects/1/tasks', { title: 'Initially normal' });
    assert.match(selector(await get('/projects/1'), 'task-priority-3'), /<option selected>Normal<\/option>/);
    const selected = { filter: 'Completed', priorityFilter: 'High' };
    const filteredPath = '/projects/1?filter=Completed&priorityFilter=High';
    const before = await get(filteredPath);
    const summary = await get('/');
    const changed = await post('/projects/1/default-priority', { ...selected, priority: 'Low' });
    assert.equal(changed.status, 303);
    assert.equal(changed.headers.get('location'), filteredPath);
    const after = await get(filteredPath);
    assertDefault(after, 'Low');
    assert.deepEqual(rows(after), rows(before));
    assert.equal(selector(after, 'task-filter'), selector(before, 'task-filter'));
    assert.equal(selector(after, 'priority-filter'), selector(before, 'priority-filter'));
    assert.equal(await get('/'), summary);
    assert.equal(await get('/projects/2'), other);
    for (const priority of ['', 'Urgent', 'low']) {
      assert.equal((await post('/projects/1/default-priority', { ...selected, priority })).status, 422);
      assert.equal(await get(filteredPath), after);
    }
    assert.equal((await post('/projects/999/default-priority', { priority: 'High' })).status, 404);
    await post('/projects/1/tasks', { title: 'Inherited low' });
    await post('/projects/1/default-priority', { priority: 'High' });
    await post('/projects/1/tasks', { title: 'Inherited high' });
    await post('/projects/2/tasks', { title: 'Other normal' });
    await post('/projects/2/default-priority', { priority: 'Low' });
    const detail = await get('/projects/1');
    for (const [id, priority] of [[1, 'High'], [2, 'Normal'], [3, 'Normal'], [4, 'Low'], [5, 'High']]) {
      assert.match(selector(detail, 'task-priority-' + id), new RegExp('<option selected>' + priority + '</option>'));
    }
    assert.match(detail, /aria-label="Complete Existing high" checked/);
    assert.deepEqual(rows(detail).map((row) => row.match(/<span>([^<]+)<\/span>/)[1]),
      ['Existing high', 'Existing normal', 'Initially normal', 'Inherited low', 'Inherited high']);
    assert.match(selector(await get('/projects/2'), 'task-priority-6'), /<option selected>Normal<\/option>/);
    await post('/projects/1/rename', { name: 'Renamed project' });
    await post('/projects/1/tasks/4/rename', { title: 'Renamed low' });
    const saved = await get('/projects/1');
    assertDefault(saved, 'High');
    assert.match(selector(saved, 'task-priority-4'), /<option selected>Low<\/option>/);
    assert.match(await get('/'), /data-testid="project-summary">1\/5 completed/);
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), saved);
    assertDefault(await get('/projects/2'), 'Low');
    await post('/projects/1/archive');
    const archived = await get(filteredPath);
    assertDefault(archived, 'High');
    assert.match(selector(archived, 'default-task-priority'), /disabled/);
    assert.doesNotMatch(selector(archived, 'task-filter'), /disabled/);
    assert.doesNotMatch(selector(archived, 'priority-filter'), /disabled/);
    const blocked = await post('/projects/1/default-priority', { ...selected, priority: 'Normal' });
    assert.equal(blocked.status, 409);
    assert.equal(selector(await blocked.text(), 'priority-filter'), selector(archived, 'priority-filter'));
    assert.equal(await get(filteredPath), archived);
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get(filteredPath), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), saved);
    assert.equal((await post('/projects/1/default-priority', { priority: 'Normal' })).status, 303);
    await post('/projects/1/tasks', { title: 'Restored normal' });
    assert.match(selector(await get('/projects/1'), 'task-priority-7'), /<option selected>Normal<\/option>/);
    assert.match(selector(await get('/projects/1'), 'task-priority-5'), /<option selected>High<\/option>/);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
