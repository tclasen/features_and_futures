import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('per-project positions migrate and restore reverse returns after edits, new arrivals, archive, and restarts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-return-order-'));
  const dbPath = join(dir, 'workboard.sqlite');
  const oldDb = new DatabaseSync(dbPath);
  oldDb.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal', due_date TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL);
    INSERT INTO projects (name, default_priority) VALUES ('First', 'Low'), ('Second', 'High'), ('Third', 'Normal');
    INSERT INTO tasks (project_id, title, position) VALUES
      (1, 'Later ID first', 30), (1, 'Earlier position', 10), (1, 'Middle', 20),
      (2, 'Second resident', 1), (3, 'Third resident', 1);`);
  oldDb.close();
  let app;
  try {
    app = await launch(dbPath);
    const get = async (path) => (await fetch(app.url + path)).text();
    const post = (path, fields = {}) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const titles = async (id) => [...(await get('/projects/' + id)).matchAll(/<span>([^<]*)<\/span>/g)].map((match) => match[1]);
    const move = async (source, task, destination, fields = {}) => {
      const response = await post(`/projects/${source}/tasks/${task}/move`, { ...fields, destination: String(destination) });
      assert.equal(response.status, 303);
      return response;
    };
    assert.deepEqual(await titles(1), ['Earlier position', 'Middle', 'Later ID first']);
    await move(1, 2, 2);
    await move(1, 3, 2);
    await move(1, 1, 2);
    assert.deepEqual(await titles(2), ['Second resident', 'Earlier position', 'Middle', 'Later ID first']);
    // New tasks and first-time visitors must follow positions reserved by absent tasks.
    await post('/projects/1/tasks', { title: 'Created while away' });
    await move(3, 5, 1);
    await post('/projects/2/tasks/2/rename', { title: 'Edited away' });
    await post('/projects/2/tasks/2', { completed: '1' });
    await post('/projects/2/tasks/2/priority', { priority: 'High' });
    await post('/projects/2/tasks/2/due-date', { dueDate: '2024-02-29' });
    await post('/projects/1/rename', { name: 'Renamed first' });
    await post('/projects/1/archive');
    assert.equal((await post('/projects/2/tasks/2/move', { destination: '1' })).status, 409);
    await app.stop();
    app = await launch(dbPath);
    await post('/projects/1/restore');
    // Return in the opposite order, including across a restart.
    await move(2, 1, 1);
    await move(2, 3, 1);
    await app.stop();
    app = await launch(dbPath);
    const filters = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-02-29' };
    const moved = await move(2, 2, 1, filters);
    assert.equal(moved.headers.get('location'), '/projects/2?' + new URLSearchParams(filters));
    assert.deepEqual(await titles(1), ['Edited away', 'Middle', 'Later ID first', 'Created while away', 'Third resident']);
    const returned = await get('/projects/1');
    assert.match(returned, /aria-label="Complete Edited away" checked/);
    assert.match(returned, /id="task-priority-2"[^>]*>[\s\S]*?<option selected>High/);
    assert.match(returned, /id="task-due-date-2"[^>]*value="2024-02-29"/);
    assert.match(returned, /id="task-due-date-1"[^>]*value=""/);
    assert.match(await get('/'), /data-testid="project-summary">1\/5 completed/);
    // Second project's positions were established in a different order from First's.
    await move(1, 1, 2);
    await move(1, 3, 2);
    await move(1, 2, 2);
    assert.deepEqual(await titles(2), ['Second resident', 'Edited away', 'Middle', 'Later ID first']);
    await move(2, 2, 3);
    await move(2, 1, 3);
    await move(2, 3, 3);
    await move(1, 5, 3);
    assert.deepEqual(await titles(3), ['Third resident', 'Edited away', 'Later ID first', 'Middle']);
    await post('/projects/2/tasks', { title: 'Second new' });
    await move(3, 3, 2);
    await move(3, 1, 2);
    await move(3, 2, 2);
    assert.deepEqual(await titles(2), ['Second resident', 'Edited away', 'Middle', 'Later ID first', 'Second new']);
    const finalPages = await Promise.all([get('/projects/1'), get('/projects/2'), get('/projects/3'), get('/')]);
    await app.stop();
    app = await launch(dbPath);
    assert.deepEqual(await Promise.all([get('/projects/1'), get('/projects/2'), get('/projects/3'), get('/')]), finalPages);
    // Migration must never overwrite remembered positions on subsequent starts.
    await move(2, 1, 1);
    await move(2, 3, 1);
    await move(2, 2, 1);
    assert.deepEqual(await titles(1), ['Edited away', 'Middle', 'Later ID first', 'Created while away']);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

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
    assert.equal(await get('/projects/2'), other.replace('<option value="1">First project</option>', '<option value="1">Renamed project</option>'));
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
    assert.equal(await get('/projects/2'), other.replace('<option value="1">First project</option>', '<option value="1">Renamed project</option>'));
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

test('due dates migrate, validate Gregorian days, and persist without changing other task data', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-dates-'));
  const dbPath = join(dir, 'workboard.sqlite');
  const oldDb = new DatabaseSync(dbPath);
  oldDb.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
    INSERT INTO projects (name) VALUES ('Existing project'), ('Other project');
    INSERT INTO tasks (project_id, title, completed, priority) VALUES (1, 'Existing task', 1, 'High'), (2, 'Other task', 0, 'Low');`);
  oldDb.close();
  let app;
  try {
    app = await launch(dbPath);
    const get = async (path) => (await fetch(app.url + path)).text();
    const post = (path, fields = {}) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const dateInput = (body, id) => body.match(new RegExp('<input id="task-due-date-' + id + '"[^>]*>'))[0];
    const date = (body, id) => dateInput(body, id).match(/value="([^"]*)"/)[1];
    await post('/projects/1/tasks', { title: 'New task' });
    const original = await get('/projects/1');
    const other = await get('/projects/2');
    const summary = await get('/');
    for (const [body, id] of [[original, 1], [original, 3], [other, 2]]) {
      assert.equal(date(body, id), '');
      assert.match(dateInput(body, id), /type="text"/);
      assert.match(body, new RegExp('<label for="task-due-date-' + id + '">Task due date</label>'));
      assert.match(body, /<button type="submit">Save due date<\/button>/);
    }
    const fields = { filter: 'Completed', priorityFilter: 'High' };
    const filteredPath = '/projects/1?filter=Completed&priorityFilter=High';
    const filteredOriginal = await get(filteredPath);
    for (const value of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '1900-02-28', '2026-04-30']) {
      const saved = await post('/projects/1/tasks/1/due-date', { ...fields, dueDate: ' \t' + value + '\n ' });
      assert.equal(saved.status, 303);
      assert.equal(saved.headers.get('location'), filteredPath);
      const body = await get(filteredPath);
      assert.equal(date(body, 1), value);
      assert.equal(body.replace('value="' + value + '"', 'value=""'), filteredOriginal);
      assert.equal(date(await get('/projects/1'), 3), '');
      assert.equal(await get('/projects/2'), other);
      assert.equal(await get('/'), summary);
    }
    const validBody = await get('/projects/1');
    for (const dueDate of ['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2025-02-29', '2026-04-31', '2026-01-00', '2026-00-01', '2026-13-01', '2026-1-01', '26-01-01', '2026-01-1', '2026-01-01T00:00:00Z', 'not a date', '<script>']) {
      const invalid = await post('/projects/1/tasks/1/due-date', { ...fields, dueDate });
      assert.equal(invalid.status, 422, dueDate);
      const body = await invalid.text();
      assert.match(body, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      assert.equal(date(body, 1), '2026-04-30');
      assert.match(body, /<option selected>Completed<\/option>/);
      assert.match(body, /<option selected>High<\/option>/);
      assert.equal(await get('/projects/1'), validBody);
    }
    for (const path of ['/projects/2/tasks/1/due-date', '/projects/1/tasks/2/due-date', '/projects/1/tasks/999/due-date', '/projects/999/tasks/1/due-date']) {
      assert.equal((await post(path, { dueDate: '2026-01-01' })).status, 404);
    }
    await post('/projects/1/tasks/3/due-date', { dueDate: '2030-12-25' });
    await post('/projects/2/tasks/2/due-date', { dueDate: '0004-02-29' });
    await post('/projects/1/tasks/1/rename', { ...fields, title: 'Renamed task' });
    const saved = await get('/projects/1');
    assert.equal(date(saved, 1), '2026-04-30');
    assert.equal(date(saved, 3), '2030-12-25');
    assert.match(saved, /aria-label="Complete Renamed task" checked/);
    assert.equal(await get('/'), summary);
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), saved);
    assert.equal(date(await get('/projects/2'), 2), '0004-02-29');
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    for (const id of [1, 3]) assert.match(dateInput(archived, id), /disabled/);
    assert.equal((archived.match(/<button type="submit" disabled>Save due date<\/button>/g) || []).length, 2);
    assert.doesNotMatch(archived, /id="(?:task-filter|priority-filter)"[^>]*disabled/);
    assert.equal((await post('/projects/1/tasks/1/due-date', { ...fields, dueDate: '' })).status, 409);
    assert.equal(await get('/projects/1'), archived);
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), saved);
    for (const dueDate of ['', ' \t\n ']) {
      await post('/projects/1/tasks/1/due-date', { ...fields, dueDate: '2024-02-29' });
      const cleared = await post('/projects/1/tasks/1/due-date', { ...fields, dueDate });
      assert.equal(cleared.headers.get('location'), filteredPath);
      assert.equal(date(await get(filteredPath), 1), '');
      assert.equal(date(await get('/projects/1'), 3), '2030-12-25');
      assert.equal(await get('/'), summary);
    }
    const clearedBody = await get('/projects/1');
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), clearedBody);
    assert.equal(date(await get('/projects/2'), 2), '0004-02-29');
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('inclusive due ranges intersect filters and retain applied state through validation, edits, and archive', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-ranges-'));
  const dbPath = join(dir, 'workboard.sqlite');
  let app;
  try {
    app = await launch(dbPath);
    const get = async (path) => (await fetch(app.url + path)).text();
    const post = (path, fields = {}) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const titles = (body) => [...body.matchAll(/<span>([^<]*)<\/span>/g)].map((match) => match[1]);
    const location = (fields) => '/projects/1?' + new URLSearchParams(fields);
    const range = { dueFrom: '2024-02-29', dueThrough: '2024-03-01' };
    const selected = { filter: 'Open', priorityFilter: 'High', ...range };
    const selectedPath = location(selected);
    const apply = (fields) => post('/projects/1/due-range', fields);
    await post('/projects', { name: 'Dates' });
    for (const title of ['Undated', 'Before', 'Start', 'End', 'After', 'Completed', 'Low']) {
      await post('/projects/1/tasks', { title });
    }
    for (const [id, dueDate] of [[2, '2024-02-28'], [3, '2024-02-29'], [4, '2024-03-01'], [5, '2024-03-02'], [6, '2024-03-01'], [7, '2024-03-01']]) {
      await post(`/projects/1/tasks/${id}/due-date`, { dueDate });
    }
    for (let id = 1; id <= 6; id++) await post(`/projects/1/tasks/${id}/priority`, { priority: 'High' });
    await post('/projects/1/tasks/6', { completed: '1' });
    const saved = await get('/projects/1');
    const summary = await get('/');
    const all = ['Undated', 'Before', 'Start', 'End', 'After', 'Completed', 'Low'];
    assert.deepEqual(titles(saved), all);
    for (const [boundaries, expected] of [
      [{}, all],
      [{ dueFrom: range.dueFrom }, ['Start', 'End', 'After', 'Completed', 'Low']],
      [{ dueThrough: range.dueThrough }, ['Before', 'Start', 'End', 'Completed', 'Low']],
      [range, ['Start', 'End', 'Completed', 'Low']],
      [{ dueFrom: '2024-03-01', dueThrough: '2024-03-01' }, ['End', 'Completed', 'Low']],
      [{ dueFrom: '0001-01-01', dueThrough: '9999-12-31' }, all.slice(1)],
    ]) {
      const response = await apply({ rangeFrom: boundaries.dueFrom || '', rangeThrough: boundaries.dueThrough || '' });
      assert.equal(response.status, 303);
      assert.deepEqual(titles(await get(response.headers.get('location'))), expected);
    }
    const applied = await apply({ filter: 'Open', priorityFilter: 'High', rangeFrom: ' \t2024-02-29 ', rangeThrough: '2024-03-01\n' });
    assert.equal(applied.headers.get('location'), selectedPath);
    const filtered = await get(selectedPath);
    assert.deepEqual(titles(filtered), ['Start', 'End']);
    assert.match(filtered, /id="due-from"[^>]*value="2024-02-29"/);
    assert.match(filtered, /id="due-through"[^>]*value="2024-03-01"/);
    assert.match(filtered, /<option selected>Open<\/option>/);
    assert.match(filtered, /<option selected>High<\/option>/);
    // All edit and combobox forms carry the applied range.
    for (const form of filtered.matchAll(/<form[^>]*action="\/projects\/1[^\"]*"[^>]*>([\s\S]*?)<\/form>/g)) {
      assert.match(form[1], /name="dueFrom" value="2024-02-29"/);
      assert.match(form[1], /name="dueThrough" value="2024-03-01"/);
    }
    assert.deepEqual(titles(await get(location({ ...selected, filter: 'Completed' }))), ['Completed']);
    assert.deepEqual(titles(await get(location({ ...selected, priorityFilter: 'Normal' }))), ['Low']);
    for (const [from, through, message] of [
      ['1900-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['', '2024-04-31', 'Due range must use valid YYYY-MM-DD dates'],
      ['0000-01-01', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-2-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-03-02', '2024-03-01', 'Due from must not be after Due through'],
    ]) {
      const invalid = await apply({ ...selected, rangeFrom: from, rangeThrough: through });
      assert.equal(invalid.status, 422);
      const body = await invalid.text();
      assert.ok(body.includes('role="alert">' + message));
      assert.deepEqual(titles(body), ['Start', 'End']);
      assert.match(body, /name="dueFrom" value="2024-02-29"/);
      assert.equal(await get(selectedPath), filtered);
    }
    assert.equal(await get('/projects/1'), saved);
    assert.equal(await get('/'), summary);
    for (const [path, fields] of [
      ['/projects/1/tasks/3/rename', { title: 'Renamed start' }],
      ['/projects/1/rename', { name: 'Renamed dates' }],
      ['/projects/1/default-priority', { priority: 'High' }],
      ['/projects/1/tasks', { title: 'New undated' }],
    ]) {
      const response = await post(path, { ...selected, ...fields });
      assert.equal(response.headers.get('location'), selectedPath);
    }
    assert.deepEqual(titles(await get(selectedPath)), ['Renamed start', 'End']);
    for (const [path, fields, expected] of [
      ['/projects/1/tasks/3/due-date', { dueDate: '2024-03-02' }, ['End']],
      ['/projects/1/tasks/4/priority', { priority: 'Low' }, []],
      ['/projects/1/tasks/3/due-date', { dueDate: '2024-02-29' }, ['Renamed start']],
      ['/projects/1/tasks/3', { completed: '1' }, []],
      ['/projects/1/tasks/3', {}, ['Renamed start']],
      ['/projects/1/tasks/3/due-date', { dueDate: '' }, []],
    ]) {
      const response = await post(path, { ...selected, ...fields });
      assert.equal(response.headers.get('location'), selectedPath);
      assert.deepEqual(titles(await get(selectedPath)), expected);
    }
    const finalSaved = await get('/projects/1');
    const finalSummary = await get('/');
    await app.stop();
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), finalSaved);
    assert.equal(await get('/'), finalSummary);
    await post('/projects/1/archive');
    const archivedRange = await apply({ ...selected, rangeFrom: '2024-03-01', rangeThrough: '2024-03-01', priorityFilter: 'Low' });
    const archivedPath = archivedRange.headers.get('location');
    assert.equal(archivedRange.status, 303);
    const archived = await get(archivedPath);
    assert.deepEqual(titles(archived), ['End']);
    assert.doesNotMatch(archived, /id="(?:due-from|due-through|task-filter|priority-filter)"[^>]*disabled/);
    assert.match(archived, /disabled>Save due date/);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), finalSaved);
    assert.equal(await get('/'), finalSummary);
    assert.match(await get('/projects/1'), /id="due-from"[^>]*value=""/);
    assert.match(await get('/projects/1'), /id="due-through"[^>]*value=""/);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('moves preserve saved data and source filters, and enforce active ownership across restarts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-moves-'));
  const dbPath = join(dir, 'workboard.sqlite');
  const oldDb = new DatabaseSync(dbPath);
  oldDb.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal', due_date TEXT NOT NULL DEFAULT '');
    INSERT INTO projects (name, default_priority) VALUES ('Source', 'Normal'), ('Destination', 'Low'), ('Third', 'Normal');
    INSERT INTO tasks (project_id, title, completed, priority, due_date) VALUES
      (1, 'Move dated', 1, 'High', '0004-02-29'), (1, 'Remain', 1, 'High', '0004-02-29'),
      (1, 'Move blank', 0, 'Normal', ''), (2, 'Existing destination', 0, 'Low', '9999-12-31');`);
  oldDb.close();
  let app;
  try {
    app = await launch(dbPath);
    const get = async (path) => (await fetch(app.url + path)).text();
    const post = (path, fields = {}) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const titles = (body) => [...body.matchAll(/<span>([^<]*)<\/span>/g)].map((match) => match[1]);
    const selector = (body, id) => body.match(new RegExp('<select id="' + id + '"[^>]*>[\\s\\S]*?</select>'))[0];
    const options = (control) => [...control.matchAll(/<option value="(\d+)">([^<]*)<\/option>/g)].map((match) => [match[1], match[2]]);
    const summaries = async () => [...(await get('/')).matchAll(/data-testid="project-summary">([^<]*)</g)].map((match) => match[1]);
    assert.deepEqual(titles(await get('/projects/1')), ['Move dated', 'Remain', 'Move blank']);
    assert.deepEqual(options(selector(await get('/projects/1'), 'destination-project-1')), [['2', 'Destination'], ['3', 'Third']]);
    await post('/projects/3/rename', { name: 'Renamed third' });
    assert.deepEqual(options(selector(await get('/projects/1'), 'destination-project-1')), [['2', 'Destination'], ['3', 'Renamed third']]);
    await post('/projects/3/archive');
    const initial = await get('/projects/1');
    assert.deepEqual(options(selector(initial, 'destination-project-1')), [['2', 'Destination']]);
    for (const destination of ['', '1', '999', '2.5', 'not a project']) {
      assert.equal((await post('/projects/1/tasks/1/move', { destination })).status, 422);
      assert.equal(await get('/projects/1'), initial);
    }
    assert.equal((await post('/projects/1/tasks/1/move', { destination: '3' })).status, 409);
    for (const path of ['/projects/2/tasks/1/move', '/projects/1/tasks/999/move', '/projects/999/tasks/1/move']) {
      assert.equal((await post(path, { destination: '2' })).status, 404);
    }
    const selected = { filter: 'Completed', priorityFilter: 'High', dueFrom: '0004-02-29', dueThrough: '0004-02-29' };
    const selectedPath = '/projects/1?' + new URLSearchParams(selected);
    const before = await get(selectedPath);
    const remainingRow = before.match(/<div class="task" data-testid="task-row">[\s\S]*?<\/div>/g)[1];
    const moved = await post('/projects/1/tasks/1/move', { ...selected, destination: '2' });
    assert.equal(moved.status, 303);
    assert.equal(moved.headers.get('location'), selectedPath);
    const after = await get(selectedPath);
    assert.deepEqual(titles(after), ['Remain']);
    assert.ok(after.includes(remainingRow));
    assert.match(selector(after, 'task-filter'), /<option selected>Completed/);
    assert.match(selector(after, 'priority-filter'), /<option selected>High/);
    assert.match(after, /id="due-from"[^>]*value="0004-02-29"/);
    assert.match(after, /id="due-through"[^>]*value="0004-02-29"/);
    let destinationPage = await get('/projects/2');
    assert.deepEqual(titles(destinationPage), ['Existing destination', 'Move dated']);
    assert.match(destinationPage, /aria-label="Complete Move dated" checked/);
    assert.match(selector(destinationPage, 'task-priority-1'), /<option selected>High/);
    assert.match(destinationPage, /id="task-due-date-1"[^>]*value="0004-02-29"/);
    assert.deepEqual(await summaries(), ['1/2 completed', '1/2 completed']);
    assert.equal((await post('/projects/1/tasks/1/move', { destination: '2' })).status, 404);
    await post('/projects/1/tasks/3/move', { destination: '2' });
    await post('/projects/2/tasks', { title: 'Created after move' });
    destinationPage = await get('/projects/2');
    assert.deepEqual(titles(destinationPage), ['Existing destination', 'Move dated', 'Move blank', 'Created after move']);
    assert.match(destinationPage, /id="task-due-date-3"[^>]*value=""/);
    assert.match(selector(destinationPage, 'task-priority-3'), /<option selected>Normal/);
    assert.match(selector(destinationPage, 'task-priority-5'), /<option selected>Low/);
    await app.stop();
    app = await launch(dbPath);
    assert.equal(await get('/projects/2'), destinationPage);
    assert.deepEqual(titles(await get('/projects/1')), ['Remain']);
    // Returning restores the task's original position before the remaining task.
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(titles(await get('/projects/1')), ['Move dated', 'Remain']);
    await post('/projects/2/archive');
    const noDestinations = await get('/projects/1');
    assert.match(selector(noDestinations, 'destination-project-1'), / disabled/);
    assert.deepEqual(options(selector(noDestinations, 'destination-project-1')), []);
    assert.match(noDestinations, /disabled>Move task/);
    assert.equal((await post('/projects/1/tasks/1/move', { destination: '2' })).status, 409);
    const archived = await get('/projects/2');
    assert.match(selector(archived, 'destination-project-3'), / disabled/);
    assert.match(archived, /disabled>Move task/);
    assert.equal((await post('/projects/2/tasks/3/move', { destination: '1' })).status, 409);
    assert.equal(await get('/projects/2'), archived);
    await app.stop();
    app = await launch(dbPath);
    assert.equal(await get('/projects/2'), archived);
    await post('/projects/2/restore');
    assert.doesNotMatch(selector(await get('/projects/2'), 'destination-project-3'), / disabled/);
    await post('/projects/2/tasks/3/move', { destination: '1' });
    const saved = await get('/projects/1');
    assert.deepEqual(titles(saved), ['Move dated', 'Remain', 'Move blank']);
    assert.match(saved, /id="task-due-date-3"[^>]*value=""/);
    assert.deepEqual(await summaries(), ['2/3 completed', '0/2 completed']);
    await app.stop();
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), saved);
    assert.deepEqual(titles(await get('/projects/2')), ['Existing destination', 'Created after move']);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('space and tab search normalization preserves saved text across archive and restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-search-whitespace-'));
  const dbPath = join(dir, 'workboard.sqlite');
  let app;
  try {
    app = await launch(dbPath);
    const get = async (path) => (await fetch(app.url + path)).text();
    const post = (path, fields = {}) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const names = (body) => [...body.matchAll(/class="project-name">([^<]*)<\/span>/g)].map((match) => match[1]);
    const titles = (body) => [...body.matchAll(/<span>([^<]*)<\/span>/g)].map((match) => match[1]);
    const originals = ['MiXeD \t\t  Name', 'mixed name', 'mixed\nname', 'mixed\u00a0name'];
    for (const name of originals) await post('/projects', { name });
    for (const title of originals) await post('/projects/1/tasks', { title });
    const query = ' \nMIXED\t \t NAME\t ';
    const listPath = '/?' + new URLSearchParams({ searchQuery: query });
    const taskPath = '/projects/1?' + new URLSearchParams({ searchQuery: query });
    const listBefore = await get('/');
    const tasksBefore = await get('/projects/1');
    for (let pass = 0; pass < 2; pass++) {
      assert.deepEqual(names(await get(listPath)), originals.slice(0, 2));
      assert.deepEqual(titles(await get(taskPath)), originals.slice(0, 2));
      // Internal newlines and non-ASCII spaces must not collapse like spaces/tabs.
      for (const index of [2, 3]) {
        const searchQuery = originals[index];
        assert.deepEqual(names(await get('/?' + new URLSearchParams({ searchQuery }))), [originals[index]]);
        assert.deepEqual(titles(await get('/projects/1?' + new URLSearchParams({ searchQuery }))), [originals[index]]);
      }
      assert.equal(await get('/'), listBefore);
      assert.equal(await get('/projects/1'), tasksBefore);
      if (pass === 0) {
        await app.stop();
        app = await launch(dbPath);
      }
    }
    await post('/projects/1/archive');
    assert.deepEqual(names(await get(listPath + '&filter=Archived')), [originals[0]]);
    const archivedTasks = await get(taskPath);
    assert.deepEqual(titles(archivedTasks), originals.slice(0, 2));
    assert.match(archivedTasks, /disabled>Rename task/);
    assert.doesNotMatch(archivedTasks, /id="task-search"[^>]*disabled/);
    await post('/projects/1/restore');
    assert.equal(await get('/'), listBefore);
    assert.equal(await get('/projects/1'), tasksBefore);
    const savedDb = new DatabaseSync(dbPath);
    try {
      assert.deepEqual(savedDb.prepare('SELECT name FROM projects ORDER BY id').all().map((row) => row.name), originals);
      assert.deepEqual(savedDb.prepare('SELECT title FROM tasks ORDER BY id').all().map((row) => row.title), originals);
    } finally {
      savedDb.close();
    }
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('search matches normalized substrings and intersects filters while edits retain applied state', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-search-'));
  const dbPath = join(dir, 'workboard.sqlite');
  let app;
  try {
    app = await launch(dbPath);
    const get = async (path) => (await fetch(app.url + path)).text();
    const post = (path, fields = {}) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const titles = (body) => [...body.matchAll(/<span>([^<]*)<\/span>/g)].map((match) => match[1]);
    const names = (body) => [...body.matchAll(/class="project-name">([^<]*)<\/span>/g)].map((match) => match[1]);
    for (const name of ['Alpha  PLAN', 'Other', 'alpha plan', 'ÄLPHA']) await post('/projects', { name });
    await post('/projects/3/archive');
    for (const [query, expected] of [['  pLaN  ', ['Alpha  PLAN']], ['alpha plan', ['Alpha  PLAN']], ['alpha  plan', ['Alpha  PLAN']], ['alpha\t \tplan', ['Alpha  PLAN']], ['ä', []], ['Ä', ['ÄLPHA']], [' \t ', ['Alpha  PLAN', 'Other', 'ÄLPHA']], ['%', []]]) {
      assert.deepEqual(names(await get('/?' + new URLSearchParams({ searchQuery: query }))), expected);
    }
    assert.deepEqual(names(await get('/?filter=Archived&searchQuery=PLAN')), ['alpha plan']);
    const list = await get('/?searchQuery=PLAN');
    assert.match(list, /<label for="project-search">Project search<\/label>/);
    assert.match(list, /<button type="submit">Search projects<\/button>/);
    assert.match(list, /action="\/projects\/1"><button type="submit">Open project/);
    assert.match(list, /action="\/"[^>]*>[\s\S]*?name="searchQuery" value="PLAN"/);
    const invalidProject = await post('/projects', { name: ' ', searchQuery: 'PLAN' });
    assert.deepEqual(names(await invalidProject.text()), ['Alpha  PLAN']);
    for (const title of ['Needle  ONE', 'needle one', 'Other', 'NEEDLE last', 'ÄNEEDLE']) await post('/projects/1/tasks', { title });
    for (const id of [1, 2, 3, 4]) {
      await post(`/projects/1/tasks/${id}/priority`, { priority: 'High' });
      await post(`/projects/1/tasks/${id}/due-date`, { dueDate: '2024-02-29' });
    }
    await post('/projects/1/tasks/4', { completed: '1' });
    for (const [query, expected] of [[' nEeDlE ', ['Needle  ONE', 'needle one', 'NEEDLE last', 'ÄNEEDLE']], ['needle one', ['Needle  ONE', 'needle one']], ['needle  one', ['Needle  ONE', 'needle one']], ['needle\t \tONE', ['Needle  ONE', 'needle one']], ['äne', []], ['', ['Needle  ONE', 'needle one', 'Other', 'NEEDLE last', 'ÄNEEDLE']]]) {
      const response = await post('/projects/1/search', { query });
      assert.equal(response.status, 303);
      assert.deepEqual(titles(await get(response.headers.get('location'))), expected);
    }
    const selected = { filter: 'Open', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-02-29', searchQuery: 'needle' };
    const path = '/projects/1?' + new URLSearchParams(selected);
    const apply = await post('/projects/1/search', { ...selected, query: ' needle ' });
    assert.equal(apply.headers.get('location'), path);
    const filtered = await get(path);
    assert.deepEqual(titles(filtered), ['Needle  ONE', 'needle one']);
    // Every form that changes project state or filters retains the applied query.
    for (const form of filtered.matchAll(/<form[^>]*action="\/projects\/1[^\"]*"[^>]*>([\s\S]*?)<\/form>/g)) {
      assert.match(form[1], /name="searchQuery" value="needle"/);
    }
    assert.match(filtered, /<form action="\/" method="get"><button type="submit">Projects/);
    const summary = await get('/');
    const invalidDate = await post('/projects/1/tasks/1/due-date', { ...selected, dueDate: '2024-02-30' });
    assert.deepEqual(titles(await invalidDate.text()), ['Needle  ONE', 'needle one']);
    const invalidRange = await post('/projects/1/due-range', { ...selected, rangeFrom: 'bad', rangeThrough: '' });
    assert.deepEqual(titles(await invalidRange.text()), ['Needle  ONE', 'needle one']);
    const invalidRename = await post('/projects/1/tasks/1/rename', { ...selected, title: ' ' });
    assert.deepEqual(titles(await invalidRename.text()), ['Needle  ONE', 'needle one']);
    assert.equal(await get('/'), summary);
    for (const [route, fields, expected] of [
      ['/projects/1/tasks/1/rename', { title: 'Renamed away' }, ['needle one']],
      ['/projects/1/tasks/2/priority', { priority: 'Low' }, []],
      ['/projects/1/tasks/2/priority', { priority: 'High' }, ['needle one']],
      ['/projects/1/tasks/2', { completed: '1' }, []],
      ['/projects/1/tasks/2', {}, ['needle one']],
      ['/projects/1/tasks/2/due-date', { dueDate: '' }, []],
      ['/projects/1/tasks/2/due-date', { dueDate: '2024-02-29' }, ['needle one']],
      ['/projects/1/default-priority', { priority: 'Low' }, ['needle one']],
      ['/projects/1/rename', { name: 'New project name' }, ['needle one']],
      ['/projects/1/tasks', { title: 'Needle new' }, ['needle one']],
      ['/projects/1/tasks/2/move', { destination: '2' }, []],
    ]) {
      const response = await post(route, { ...selected, ...fields });
      assert.equal(response.headers.get('location'), path);
      assert.deepEqual(titles(await get(path)), expected);
    }
    await post('/projects/2/tasks/2/move', { destination: '1' });
    assert.deepEqual(titles(await get(path)), ['needle one']);
    const cleared = await post('/projects/1/search', { ...selected, query: ' \t ' });
    assert.deepEqual(titles(await get(cleared.headers.get('location'))), ['Renamed away', 'needle one', 'Other']);
    const completed = { ...selected, filter: 'Completed' };
    assert.deepEqual(titles(await get('/projects/1?' + new URLSearchParams(completed))), ['NEEDLE last']);
    const ranged = await post('/projects/1/due-range', { ...selected, rangeFrom: '2024-03-01', rangeThrough: '' });
    assert.match(ranged.headers.get('location'), /searchQuery=needle/);
    assert.deepEqual(titles(await get(ranged.headers.get('location'))), []);
    const saved = await get('/projects/1');
    await app.stop();
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), saved);
    assert.match(saved, /id="task-search"[^>]*value=""/);
    await post('/projects/1/archive');
    const archivedSearch = await post('/projects/1/search', { ...selected, query: 'needle' });
    const archived = await get(archivedSearch.headers.get('location'));
    assert.deepEqual(titles(archived), ['needle one']);
    assert.doesNotMatch(archived, /id="task-search"[^>]*disabled/);
    assert.match(archived, /disabled>Rename task/);
    assert.match(archived, /disabled>Move task/);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), saved);
    assert.equal((await post('/projects/999/search', { query: 'needle' })).status, 404);
    const escaped = await post('/projects/1/search', { query: '<script>"&' });
    assert.match(await get(escaped.headers.get('location')), /value="&lt;script&gt;&quot;&amp;"/);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
