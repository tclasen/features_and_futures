import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('due dates validate Gregorian days, migrate, preserve task data and filters, and survive archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-due-date-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
    INSERT INTO projects (name) VALUES ('Existing'), ('Independent');
    INSERT INTO tasks (project_id, title, completed, priority) VALUES (1, 'Existing done', 1, 'High'), (2, 'Other task', 0, 'Low');`);
  legacy.close();
  let server;
  let database;
  try {
    server = await start(databasePath);
    database = new DatabaseSync(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const read = async (path) => (await fetch(`${server.url}${path}`)).text();
    const snapshot = () => database.prepare('SELECT * FROM tasks ORDER BY id').all().map((task) => ({ ...task }));
    const input = (html, id) => html.match(new RegExp(`<input id="task-due-date-${id}"[^>]*>`))[0];
    const assertFilters = (html) => {
      assert.match(html, /id="task-filter"[^>]*>\s*<option>All<\/option>\s*<option>Open<\/option>\s*<option selected>Completed<\/option>/);
      assert.match(html, /id="priority-filter"[^>]*>[\s\S]*?<option selected>High<\/option>/);
    };
    await post('/projects/1/tasks', { title: 'New task' });
    const before = snapshot();
    assert.deepEqual(before.map((task) => task.due_date), ['', '', '']);
    let html = await read('/projects/1');
    for (const id of [1, 3]) {
      assert.match(html, new RegExp(`<label for="task-due-date-${id}">Task due date</label>`));
      assert.match(input(html, id), /type="text" value=""/);
      assert.doesNotMatch(input(html, id), / disabled/);
    }
    assert.equal([...html.matchAll(/>Save due date<\/button>/g)].length, 2);
    const summary = await read('/');
    const filters = { filter: 'Completed', priorityFilter: 'High' };
    const filteredPath = '/projects/1?filter=Completed&priorityFilter=High';
    const save = (dueDate) => post('/projects/1/tasks/1/due-date', { ...filters, dueDate });
    for (const date of ['0001-01-01', '0096-02-29', '0400-02-29', '1900-02-28', '2000-02-29', '2024-02-29', '2026-04-30', '9999-12-31']) {
      const response = await save(` \t${date}\n `);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), filteredPath);
      html = await read(filteredPath);
      assertFilters(html);
      assert.match(input(html, 1), new RegExp(`value="${date}"`));
      assert.deepEqual(snapshot(), before.map((task) => task.id === 1 ? { ...task, due_date: date } : task));
      assert.equal(await read('/'), summary);
    }
    const saved = snapshot();
    for (const date of ['0000-01-01', '10000-01-01', '0100-02-29', '1900-02-29', '2025-02-29', '2026-04-31',
      '2026-00-01', '2026-13-01', '2026-01-00', '2026-01-32', '2026-1-01', '26-01-01', '2026/01/01',
      '2026-01-01T00:00:00Z', '2026-01-01 trailing', '<script>alert(1)</script>', 'not a date']) {
      const response = await save(date);
      assert.equal(response.status, 400, date);
      html = await response.text();
      assert.match(html, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      assertFilters(html);
      assert.match(input(html, 1), /value="9999-12-31"/);
      assert.deepEqual(snapshot(), saved);
      assert.equal(await read('/'), summary);
    }
    for (const path of ['/projects/2/tasks/1/due-date', '/projects/1/tasks/9999/due-date', '/projects/9999/tasks/1/due-date']) {
      assert.equal((await post(path, { dueDate: '2026-01-01' })).status, 404);
    }
    assert.deepEqual(snapshot(), saved);
    await post('/projects/1/tasks/3/due-date', { dueDate: '2026-10-10' });
    await post('/projects/2/tasks/2/due-date', { dueDate: '2027-03-15' });
    await post('/projects/1/tasks/1/rename', { ...filters, title: 'Renamed dated task' });
    assert.equal(snapshot()[0].due_date, '9999-12-31');
    await post('/projects/1/tasks/1/priority', { priority: 'Low' });
    await post('/projects/1/tasks/1', {});
    assert.equal(snapshot()[0].due_date, '9999-12-31');
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const persisted = snapshot();
    const savedPage = await read(filteredPath);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await read(filteredPath), savedPage);
    assert.deepEqual(snapshot(), persisted);
    assert.match(input(await read('/projects/2'), 2), /value="2027-03-15"/);
    await post('/projects/1/archive');
    const archived = await read(filteredPath);
    assertFilters(archived);
    assert.match(input(archived, 1), /value="9999-12-31" disabled/);
    html = await read('/projects/1');
    for (const id of [1, 3]) assert.match(input(html, id), / disabled/);
    assert.equal([...html.matchAll(/<button type="submit" disabled>Save due date<\/button>/g)].length, 2);
    for (const date of ['', '2026-01-01']) {
      const response = await save(date);
      assert.equal(response.status, 403);
      assertFilters(await response.text());
    }
    assert.deepEqual(snapshot(), persisted);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await read(filteredPath), archived);
    await post('/projects/1/restore');
    assert.equal(await read(filteredPath), savedPage);
    for (const blank of ['', ' \t\n ']) {
      await save('2026-12-25');
      const response = await save(blank);
      assert.equal(response.status, 303);
      html = await read(response.headers.get('location'));
      assertFilters(html);
      assert.match(input(html, 1), /value=""/);
      assert.deepEqual(snapshot(), persisted.map((task) => task.id === 1 ? { ...task, due_date: '' } : task));
      assert.equal(await read('/'), summary);
    }
    await server.stop();
    server = await start(databasePath);
    assert.match(input(await read(filteredPath), 1), /value=""/);
    assert.match(input(await read('/projects/1'), 3), /value="2026-10-10"/);
  } finally {
    if (database) database.close();
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('priorities migrate, persist independently, preserve task data, and respect archive state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)));
    INSERT INTO projects (name) VALUES ('First'), ('Second');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing done', 1), (1, 'Existing open', 0), (2, 'Other project', 0);`);
  legacy.close();
  let server;
  let database;
  try {
    server = await start(databasePath);
    database = new DatabaseSync(databasePath);
    const snapshot = () => database.prepare('SELECT * FROM tasks ORDER BY id').all().map((task) => ({ ...task }));
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const read = async (path) => (await fetch(`${server.url}${path}`)).text();
    const selects = (html) => [...html.matchAll(/<select id="task-priority-(\d+)"([^>]*)>\s*([\s\S]*?)<\/select>/g)];
    const selected = (html) => selects(html).map((match) => [Number(match[1]), match[3].match(/<option selected>(\w+)<\/option>/)[1]]);
    const assertOptions = (html, disabled = false) => {
      for (const match of selects(html)) {
        assert.match(html, new RegExp(`<label for="task-priority-${match[1]}">Task priority</label>`));
        assert.deepEqual([...match[3].matchAll(/<option(?: selected)?>(\w+)<\/option>/g)].map((option) => option[1]), ['Low', 'Normal', 'High']);
        assert.equal(match[2].includes(' disabled'), disabled);
        assert.match(match[2], /onchange="this.form.requestSubmit\(\)"/);
      }
    };
    let html = await read('/projects/1');
    assertOptions(html);
    assert.deepEqual(selected(html), [[1, 'Normal'], [2, 'Normal']]);
    assert.deepEqual(selected(await read('/projects/2')), [[3, 'Normal']]);
    await post('/projects/1/tasks', { title: 'New task' });
    assert.deepEqual(selected(await read('/projects/1')), [[1, 'Normal'], [2, 'Normal'], [4, 'Normal']]);
    const before = snapshot();
    const summary = await read('/');
    const result = await post('/projects/1/tasks/1/priority', { priority: 'High', filter: 'Completed' });
    assert.equal(result.status, 303);
    assert.equal(result.headers.get('location'), '/projects/1?filter=Completed');
    assert.equal((await post('/projects/1/tasks/2/priority', { priority: 'Low', filter: 'Open' })).status, 303);
    assert.deepEqual(snapshot(), before.map((task) => ({ ...task, priority: task.id === 1 ? 'High' : task.id === 2 ? 'Low' : 'Normal' })));
    assert.equal(await read('/'), summary);
    assert.deepEqual(selected(await read('/projects/1?filter=Completed')), [[1, 'High']]);
    assert.deepEqual(selected(await read('/projects/1?filter=Open')), [[2, 'Low'], [4, 'Normal']]);
    assert.deepEqual(selected(await read('/projects/2')), [[3, 'Normal']]);
    const changed = snapshot();
    for (const priority of ['', 'Urgent', 'high']) {
      assert.equal((await post('/projects/1/tasks/1/priority', { priority })).status, 400);
    }
    for (const path of ['/projects/2/tasks/1/priority', '/projects/1/tasks/9999/priority', '/projects/9999/tasks/1/priority']) {
      assert.equal((await post(path, { priority: 'Low' })).status, 404);
    }
    assert.deepEqual(snapshot(), changed);
    await post('/projects/1/tasks/1/rename', { title: '  Renamed done  ' });
    html = await read('/projects/1');
    assert.deepEqual(selected(html), [[1, 'High'], [2, 'Low'], [4, 'Normal']]);
    assert.match(html, /aria-label="Complete Renamed done"[^>]* checked/);
    assert.equal(await read('/'), summary);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await read('/projects/1'), html);
    assert.deepEqual(selected(await read('/projects/2')), [[3, 'Normal']]);
    await post('/projects/1/archive');
    const archived = await read('/projects/1');
    assertOptions(archived, true);
    assert.equal(selects(archived).length, 3);
    const archivedData = snapshot();
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Low' })).status, 403);
    assert.deepEqual(snapshot(), archivedData);
    assert.equal(await read('/projects/1'), archived);
    assert.deepEqual(selected(await read('/projects/1?filter=Completed')), [[1, 'High']]);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await read('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await read('/projects/1'), html);
    assertOptions(await read('/projects/1'));
    assert.equal((await post('/projects/1/tasks/2/priority', { priority: 'Normal' })).status, 303);
    const restored = await read('/projects/1');
    assert.deepEqual(selected(restored), [[1, 'High'], [2, 'Normal'], [4, 'Normal']]);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await read('/projects/1'), restored);
    assert.equal(await read('/'), summary);
  } finally {
    if (database) database.close();
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let diagnostics = '';
  child.stderr.on('data', (chunk) => { diagnostics += chunk; });
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server did not start: ${diagnostics}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited (${code}): ${diagnostics}`));
    });
    child.stdout.on('data', (chunk) => {
      const match = String(chunk).match(/listening on port (\d+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() {
      if (child.exitCode !== null) return;
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects validate, render in order, navigate, and persist across restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    let html = await (await fetch(server.url)).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, />Create project<\/button>/);
    assert.doesNotMatch(html, /data-testid="project-row"/);

    const create = (name) => fetch(`${server.url}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    for (const name of ['', '  \t\n ']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    for (const name of ['  Alpha project  ', '<script>alert("x")</script> & café']) {
      const response = await create(name);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    html = await (await fetch(server.url)).text();
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(html, />Alpha project<\/span>/);
    assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; café/);
    assert.ok(html.indexOf('Alpha project') < html.indexOf('&lt;script&gt;'));
    const paths = [...html.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
    assert.equal(paths.length, 2);
    assert.notEqual(paths[0], paths[1]);
    const projectHtml = await (await fetch(`${server.url}${paths[0]}`)).text();
    assert.match(projectHtml, /<h1>Alpha project<\/h1>/);
    assert.match(projectHtml, /action="\/".*>Projects<\/button>/s);

    const invalid = await create('   ');
    assert.equal((await invalid.text()).match(/data-testid="project-row"/g).length, 2);
    await server.stop();
    server = await start(databasePath);
    const persisted = await (await fetch(server.url)).text();
    assert.equal(persisted, html);
    assert.match(await (await fetch(`${server.url}${paths[0]}`)).text(), /<h1>Alpha project<\/h1>/);
    assert.equal((await fetch(`${server.url}/projects/999999`)).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('legacy projects migrate, archive read-only tasks, restore, and retain summaries across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)));
    INSERT INTO projects (name) VALUES ('Existing project');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Done task', 1), (1, 'Open task', 0);`);
  legacy.close();
  let server;
  try {
    server = await start(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const read = async (path) => (await fetch(`${server.url}${path}`)).text();
    const projectRows = (html) => [...html.matchAll(/data-testid="project-row">([\s\S]*?)<\/div>\s*<\/div>/g)].map((match) => match[1]);
    const taskRows = (html) => [...html.matchAll(/data-testid="task-row">([\s\S]*?)<\/div>/g)].map((match) => match[1]);
    let html = await read('/');
    assert.match(html, /<label for="project-filter">Project filter<\/label>/);
    assert.match(html, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(html, /data-testid="project-summary">1\/2 completed/);
    assert.match(html, />Archive project<\/button>/);
    assert.doesNotMatch(html, />Restore project<\/button>/);
    await post('/projects', { name: 'New project' });
    html = await read('/');
    assert.equal(projectRows(html).length, 2);
    assert.match(projectRows(html)[1], /data-testid="project-summary">0\/0 completed/);
    assert.equal((await post('/projects/1/archive')).status, 303);
    html = await read('/');
    assert.equal(projectRows(html).length, 1);
    assert.doesNotMatch(html, /Existing project/);
    html = await read('/?filter=Archived');
    assert.equal(projectRows(html).length, 1);
    assert.match(html, /Existing project/);
    assert.match(html, /data-testid="project-summary">1\/2 completed/);
    assert.match(html, />Open project<\/button>/);
    assert.match(html, />Restore project<\/button>/);
    assert.doesNotMatch(html, />Archive project<\/button>/);
    assert.match(html, /<option selected>Archived<\/option>/);
    const archivedPage = await read('/projects/1');
    assert.match(archivedPage, /<h1>Existing project<\/h1>/);
    assert.match(archivedPage, /<p>Archived project<\/p>/);
    assert.match(archivedPage, /<button type="submit" disabled>Create task<\/button>/);
    assert.equal(taskRows(archivedPage).length, 2);
    for (const row of taskRows(archivedPage)) assert.match(row, /type="checkbox"[^>]* disabled/);
    assert.match(taskRows(await read('/projects/1?filter=Completed'))[0], /Done task/);
    assert.equal(taskRows(await read('/projects/1?filter=Completed')).length, 1);
    assert.match(taskRows(await read('/projects/1?filter=Open'))[0], /Open task/);
    assert.equal(taskRows(await read('/projects/1?filter=Open')).length, 1);
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1', {})).status, 403);
    assert.equal(await read('/projects/1'), archivedPage);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await read('/projects/1'), archivedPage);
    assert.equal(await read('/?filter=Archived'), html);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.equal(projectRows(await read('/?filter=Archived')).length, 0);
    html = await read('/');
    assert.equal(projectRows(html).length, 2);
    assert.ok(html.indexOf('Existing project') < html.indexOf('New project'));
    assert.match(html, /data-testid="project-summary">1\/2 completed/);
    const restored = await read('/projects/1');
    assert.doesNotMatch(restored, / disabled|<p>Archived project<\/p>/);
    assert.match(taskRows(restored)[0], / checked/);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await read('/projects/1'), restored);
    assert.equal(await read('/'), html);
    await post('/projects/1/tasks/2', { completed: '1', filter: 'Open' });
    assert.equal(taskRows(await read('/projects/1?filter=Open')).length, 0);
    assert.match(await read('/'), /data-testid="project-summary">2\/2 completed/);
    await post('/projects/1/tasks/1', {});
    assert.match(await read('/'), /data-testid="project-summary">1\/2 completed/);
    assert.equal((await post('/projects/99999/archive')).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('renaming preserves identity, order and tasks, validates names, and respects archive state across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const read = async (path) => (await fetch(`${server.url}${path}`)).text();
    const tasks = (html) => [...html.matchAll(/data-testid="task-row">([\s\S]*?)<\/div>/g)].map((match) => match[1]);
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Finished task' });
    await post('/projects/1/tasks', { title: 'Open task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await read('/projects/1');
    assert.match(original, /<label for="new-project-name">New project name<\/label>/);
    assert.match(original, />Rename project<\/button>/);
    for (const name of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/rename', { name, filter: 'Open' });
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.match(html, /<h1>Original<\/h1>/);
      assert.match(html, /<option selected>Open<\/option>/);
      assert.equal(tasks(html).length, 1);
      assert.equal(await read('/projects/1'), original);
    }
    const renamed = await post('/projects/1/rename', { name: '  Renamed <team> & "friends"  ', filter: 'Completed' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const page = await read('/projects/1');
    assert.match(page, /<h1>Renamed &lt;team&gt; &amp; &quot;friends&quot;<\/h1>/);
    assert.deepEqual(tasks(page), tasks(original));
    const list = await read('/');
    assert.match(list, />Renamed &lt;team&gt; &amp; &quot;friends&quot;<\/span>/);
    assert.ok(list.indexOf('Renamed') < list.indexOf('Second'));
    assert.match(list, /data-testid="project-summary">1\/2 completed/);
    assert.match(list, /action="\/projects\/1"/);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await read('/projects/1'), page);
    assert.equal(await read('/'), list);
    await post('/projects/1/archive');
    const archived = await read('/projects/1');
    assert.match(archived, /id="new-project-name"[^>]* disabled/);
    assert.match(archived, /<button type="submit" disabled>Rename project<\/button>/);
    assert.equal((await post('/projects/1/rename', { name: 'Blocked' })).status, 403);
    assert.equal(await read('/projects/1'), archived);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await read('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await read('/projects/1'), page);
    assert.equal((await post('/projects/1/rename', { name: '  Restored name  ' })).status, 303);
    const restored = await read('/projects/1');
    assert.match(restored, /<h1>Restored name<\/h1>/);
    assert.deepEqual(tasks(restored), tasks(original));
    const restoredList = await read('/');
    assert.ok(restoredList.indexOf('Restored name') < restoredList.indexOf('Second'));
    assert.match(restoredList, /data-testid="project-summary">1\/2 completed/);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await read('/projects/1'), restored);
    assert.equal(await read('/'), restoredList);
    assert.equal((await post('/projects/99999/rename', { name: 'Missing' })).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, stay within their project, filter, and save completion across restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const post = (path, values) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const read = async (path) => (await fetch(`${server.url}${path}`)).text();
    const rows = (html) => [...html.matchAll(/<div class="panel task-row[^\"]*" data-testid="task-row">([\s\S]*?)<\/div>/g)].map((match) => match[1]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    let html = await read('/projects/1');
    assert.match(html, /<label for="task-title">Task title<\/label>/);
    assert.match(html, />Create task<\/button>/);
    assert.match(html, /<label for="task-filter">Task filter<\/label>/);
    assert.match(html, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(rows(html).length, 0);
    }
    for (const title of ['  Plan work  ', '<Review> & "ship"']) {
      assert.equal((await post('/projects/1/tasks', { title })).status, 303);
    }
    await post('/projects/2/tasks', { title: 'Private to second' });
    html = await read('/projects/1');
    const originalRows = rows(html);
    assert.equal(originalRows.length, 2);
    assert.match(originalRows[0], /aria-label="Complete Plan work"/);
    assert.match(originalRows[0], /<span>Plan work<\/span>/);
    assert.match(originalRows[1], /aria-label="Complete &lt;Review&gt; &amp; &quot;ship&quot;"/);
    assert.doesNotMatch(html, / checked/);
    assert.doesNotMatch(html, /Private to second/);
    assert.equal(rows(await read('/projects/1?filter=Open')).length, 2);
    assert.equal(rows(await read('/projects/1?filter=Completed')).length, 0);

    const completionPath = originalRows[0].match(/action="([^"]+)"/)[1];
    assert.equal((await post(completionPath, { completed: '1' })).status, 303);
    html = await read('/projects/1?filter=Completed');
    assert.equal(rows(html).length, 1);
    assert.match(rows(html)[0], / checked/);
    assert.match(rows(html)[0], /<span>Plan work<\/span>/);
    assert.match(html, /<option selected>Completed<\/option>/);
    assert.equal(rows(await read('/projects/1?filter=Open')).length, 1);
    assert.equal((await post('/projects/2/tasks/1', { completed: '0' })).status, 404);
    const invalid = await post('/projects/1/tasks', { title: '   ' });
    assert.equal(rows(await invalid.text()).length, 2);

    const persisted = await read('/projects/1');
    await server.stop();
    server = await start(databasePath);
    assert.equal(await read('/projects/1'), persisted);
    assert.equal(rows(await read('/projects/1?filter=Completed')).length, 1);
    assert.equal(rows(await read('/projects/2')).length, 1);
    assert.doesNotMatch(await read('/projects/2'), /Plan work|&lt;Review&gt;/);
    assert.equal((await post(completionPath, {})).status, 303);
    assert.equal(rows(await read('/projects/1?filter=Completed')).length, 0);
    assert.equal(rows(await read('/projects/1?filter=Open')).length, 2);
    await server.stop();
    server = await start(databasePath);
    assert.doesNotMatch(await read('/projects/1'), / checked/);
    assert.equal((await post('/projects/99999/tasks', { title: 'Orphan' })).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task renames preserve completion, ownership and order, validate titles, and respect archive state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const read = async (path) => (await fetch(`${server.url}${path}`)).text();
    const rows = (html) => [...html.matchAll(/data-testid="task-row">([\s\S]*?)<\/div>/g)].map((match) => match[1]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Original' });
    await post('/projects/1/tasks', { title: 'Later task' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await read('/projects/1');
    assert.match(rows(original)[0], /<label for="new-task-title-1">New task title<\/label>/);
    assert.match(rows(original)[0], />Rename task<\/button>/);
    for (const title of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/tasks/1/rename', { title, filter: 'Completed' });
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.match(html, /aria-label="Complete Original"[^>]* checked/);
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.equal(rows(html).length, 1);
      assert.equal(await read('/projects/1'), original);
    }
    assert.equal((await post('/projects/2/tasks/1/rename', { title: 'Wrong owner' })).status, 404);
    assert.equal((await post('/projects/1/tasks/99999/rename', { title: 'Missing' })).status, 404);
    assert.equal((await post('/projects/99999/tasks/1/rename', { title: 'Missing' })).status, 404);
    const result = await post('/projects/1/tasks/1/rename', { title: '  Renamed <task> & "done"  ', filter: 'Completed' });
    assert.equal(result.status, 303);
    assert.equal(result.headers.get('location'), '/projects/1?filter=Completed');
    const renamed = await read('/projects/1');
    assert.equal(rows(renamed).length, 2);
    assert.match(rows(renamed)[0], /aria-label="Complete Renamed &lt;task&gt; &amp; &quot;done&quot;"[^>]* checked/);
    assert.match(rows(renamed)[0], /<span>Renamed &lt;task&gt; &amp; &quot;done&quot;<\/span>/);
    assert.match(rows(renamed)[1], /<span>Later task<\/span>/);
    assert.equal(rows(await read('/projects/1?filter=Completed')).length, 1);
    assert.match(rows(await read('/projects/1?filter=Open'))[0], /Later task/);
    const list = await read('/');
    assert.match(list, /data-testid="project-summary">1\/2 completed/);
    const other = await read('/projects/2');
    assert.match(other, /Other project task/);
    assert.doesNotMatch(other, /Renamed|Later task/);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await read('/projects/1'), renamed);
    assert.equal(await read('/projects/2'), other);
    assert.equal(await read('/'), list);
    await post('/projects/1/archive');
    const archived = await read('/projects/1');
    for (const row of rows(archived)) {
      assert.match(row, /id="new-task-title-\d+"[^>]* disabled/);
      assert.match(row, /<button type="submit" disabled>Rename task<\/button>/);
    }
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Blocked' })).status, 403);
    assert.equal(await read('/projects/1'), archived);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await read('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await read('/projects/1'), renamed);
    assert.equal((await post('/projects/1/tasks/2/rename', { title: '  Renamed open task  ', filter: 'Open' })).status, 303);
    assert.match(rows(await read('/projects/1?filter=Open'))[0], /aria-label="Complete Renamed open task"/);
    assert.doesNotMatch(rows(await read('/projects/1?filter=Open'))[0], / checked/);
    assert.equal(await read('/'), list);
    const restored = await read('/projects/1');
    await server.stop();
    server = await start(databasePath);
    assert.equal(await read('/projects/1'), restored);
    // The renamed checkbox still updates the same task and summary.
    await post('/projects/1/tasks/1', {});
    assert.equal(rows(await read('/projects/1?filter=Completed')).length, 0);
    assert.match(await read('/'), /data-testid="project-summary">0\/2 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('combined filters retain selections, re-evaluate edits, and remain usable when archived', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-combined-filter-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  let database;
  try {
    server = await start(databasePath);
    database = new DatabaseSync(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const read = async (path) => (await fetch(`${server.url}${path}`)).text();
    const snapshot = () => database.prepare('SELECT * FROM tasks ORDER BY id').all().map((task) => ({ ...task }));
    const titles = (html) => [...html.matchAll(/<span>([^<]*)<\/span>/g)].map((match) => match[1]);
    const selected = (html, id) => html.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`))[1].match(/<option selected>(\w+)<\/option>/)[1];
    const assertFilters = (html, filter, priorityFilter) => {
      assert.equal(selected(html, 'task-filter'), filter);
      assert.equal(selected(html, 'priority-filter'), priorityFilter);
      const filterForm = [...html.matchAll(/<form[^>]*>([\s\S]*?)<\/form>/g)].find((match) => match[1].includes('id="task-filter"'))[1];
      // Both selectors submit together, preserving the other selector when one changes.
      assert.match(filterForm, /id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit\(\)"/);
      assert.doesNotMatch(filterForm, / disabled/);
      for (const form of html.matchAll(/<form[^>]*method="post"[^>]*>([\s\S]*?)<\/form>/g)) {
        assert.match(form[1], new RegExp(`name="filter" value="${filter}"`));
        assert.match(form[1], new RegExp(`name="priorityFilter" value="${priorityFilter}"`));
      }
    };
    await post('/projects', { name: 'Combined filters' });
    await post('/projects', { name: 'Other project' });
    for (const priority of ['Low', 'Normal', 'High']) {
      for (const completed of [false, true]) {
        await post('/projects/1/tasks', { title: `${priority} ${completed ? 'done' : 'open'}` });
        const id = snapshot().at(-1).id;
        await post(`/projects/1/tasks/${id}/priority`, { priority });
        if (completed) await post(`/projects/1/tasks/${id}`, { completed: '1' });
      }
    }
    await post('/projects/2/tasks', { title: 'Other task' });
    const initial = snapshot();
    const summary = await read('/');
    assert.match(summary, /data-testid="project-summary">3\/6 completed/);
    const initialPage = await read('/projects/1');
    assertFilters(initialPage, 'All', 'All');
    assert.match(initialPage, /<label class="filter" for="priority-filter">Priority filter<\/label>/);
    const options = initialPage.match(/<select id="priority-filter"[^>]*>([\s\S]*?)<\/select>/)[1];
    assert.deepEqual([...options.matchAll(/<option(?: selected)?>(\w+)<\/option>/g)].map((match) => match[1]), ['All', 'Low', 'Normal', 'High']);
    for (const filter of ['All', 'Open', 'Completed']) {
      for (const priorityFilter of ['All', 'Low', 'Normal', 'High']) {
        const html = await read(`/projects/1?${new URLSearchParams({ filter, priorityFilter })}`);
        assertFilters(html, filter, priorityFilter);
        const expected = initial.filter((task) => task.project_id === 1 &&
          (filter === 'All' || Boolean(task.completed) === (filter === 'Completed')) &&
          (priorityFilter === 'All' || task.priority === priorityFilter)).map((task) => task.title);
        assert.deepEqual(titles(html), expected);
      }
    }
    assert.deepEqual(snapshot(), initial);
    assert.equal(await read('/'), summary);
    assertFilters(await read('/projects/1?filter=invalid&priorityFilter=invalid'), 'All', 'All');

    const filters = { filter: 'Open', priorityFilter: 'Low' };
    const filteredPath = '/projects/1?filter=Open&priorityFilter=Low';
    const edit = async (path, values) => {
      const response = await post(path, { ...filters, ...values });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), filteredPath);
      const html = await read(response.headers.get('location'));
      assertFilters(html, 'Open', 'Low');
      return html;
    };
    let html = await edit('/projects/1/tasks/1/rename', { title: '  Renamed low  ' });
    assert.deepEqual(titles(html), ['Renamed low']);
    assert.match(html, /aria-label="Complete Renamed low"/);
    assert.deepEqual(snapshot(), initial.map((task) => task.id === 1 ? { ...task, title: 'Renamed low' } : task));
    assert.equal(await read('/'), summary);
    for (const [path, values, alert] of [
      ['/projects/1/tasks/1/rename', { title: '   ' }, 'Task title is required'],
      ['/projects/1/tasks', { title: '   ' }, 'Task title is required'],
      ['/projects/1/rename', { name: '   ' }, 'Project name is required'],
      ['/projects/1/tasks/1/priority', { priority: 'Invalid' }, 'Choose Low, Normal, or High priority'],
    ]) {
      const response = await post(path, { ...filters, ...values });
      assert.equal(response.status, 400);
      const invalid = await response.text();
      assertFilters(invalid, 'Open', 'Low');
      assert.ok(invalid.includes(alert));
      assert.deepEqual(titles(invalid), ['Renamed low']);
    }
    html = await edit('/projects/1/tasks/1/priority', { priority: 'High' });
    assert.deepEqual(titles(html), []);
    assert.equal(await read('/'), summary);
    assert.deepEqual(titles(await read('/projects/1?filter=Open&priorityFilter=High')), ['Renamed low', 'High open']);
    await edit('/projects/1/tasks/1/priority', { priority: 'Low' });
    html = await edit('/projects/1/tasks/1', { completed: '1' });
    assert.deepEqual(titles(html), []);
    assert.match(await read('/'), /data-testid="project-summary">4\/6 completed/);
    const uncheck = await post('/projects/1/tasks/1', { filter: 'Completed', priorityFilter: 'Low' });
    assert.equal(uncheck.headers.get('location'), '/projects/1?filter=Completed&priorityFilter=Low');
    html = await read(uncheck.headers.get('location'));
    assertFilters(html, 'Completed', 'Low');
    assert.deepEqual(titles(html), ['Low done']);
    assert.equal(await read('/'), summary);
    const saved = snapshot();
    const savedPage = await read(filteredPath);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await read(filteredPath), savedPage);
    assertFilters(await read('/projects/1'), 'All', 'All');
    assert.deepEqual(snapshot(), saved);
    await post('/projects/1/archive');
    const archived = await read(filteredPath);
    assertFilters(archived, 'Open', 'Low');
    assert.deepEqual(titles(archived), ['Renamed low']);
    assert.match(archived, /type="checkbox"[^>]* disabled/);
    assert.match(archived, /id="task-priority-1"[^>]* disabled/);
    assert.match(archived, /id="new-task-title-1"[^>]* disabled/);
    for (const [path, values] of [
      ['/projects/1/tasks/1', { completed: '1' }],
      ['/projects/1/tasks/1/priority', { priority: 'High' }],
      ['/projects/1/tasks/1/rename', { title: 'Blocked' }],
    ]) {
      const response = await post(path, { ...filters, ...values });
      assert.equal(response.status, 403);
      assertFilters(await response.text(), 'Open', 'Low');
    }
    assert.deepEqual(titles(await read('/projects/1?filter=Completed&priorityFilter=High')), ['High done']);
    assert.deepEqual(snapshot(), saved);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await read(filteredPath), archived);
    await post('/projects/1/restore');
    assert.equal(await read(filteredPath), savedPage);
    assert.equal(await read('/'), summary);
    assert.deepEqual(titles(await read('/projects/2')), ['Other task']);
  } finally {
    if (database) database.close();
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project defaults migrate, affect only future tasks, retain filters, and survive archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-default-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
    INSERT INTO projects (name) VALUES ('Existing');
    INSERT INTO tasks (project_id, title, completed, priority) VALUES (1, 'Existing done', 1, 'High'), (1, 'Existing open', 0, 'Normal');`);
  legacy.close();
  let server;
  let database;
  try {
    server = await start(databasePath);
    database = new DatabaseSync(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const read = async (path) => (await fetch(`${server.url}${path}`)).text();
    const snapshot = () => database.prepare('SELECT * FROM tasks ORDER BY id').all().map((task) => ({ ...task }));
    const select = (html, id) => html.match(new RegExp(`<select id="${id}"([^>]*)>([\\s\\S]*?)</select>`));
    const selected = (html, id) => select(html, id)[2].match(/<option selected>(\w+)<\/option>/)[1];
    const titles = (html) => [...html.matchAll(/<span>([^<]*)<\/span>/g)].map((match) => match[1]);
    await post('/projects', { name: 'New project' });
    for (const id of [1, 2]) {
      const html = await read(`/projects/${id}`);
      assert.match(html, /<label for="default-task-priority">Default task priority<\/label>/);
      assert.equal(selected(html, 'default-task-priority'), 'Normal');
      assert.deepEqual([...select(html, 'default-task-priority')[2].matchAll(/<option(?: selected)?>(\w+)<\/option>/g)].map((match) => match[1]), ['Low', 'Normal', 'High']);
      assert.match(select(html, 'default-task-priority')[1], /onchange="this.form.requestSubmit\(\)"/);
    }
    const originalTasks = snapshot();
    const summary = await read('/');
    const filters = { filter: 'Completed', priorityFilter: 'High' };
    const filteredPath = '/projects/1?filter=Completed&priorityFilter=High';
    for (const priority of ['Low', 'High', 'Normal', 'Low']) {
      const response = await post('/projects/1/default-priority', { ...filters, priority });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), filteredPath);
      const html = await read(filteredPath);
      assert.equal(selected(html, 'task-filter'), 'Completed');
      assert.equal(selected(html, 'priority-filter'), 'High');
      assert.equal(selected(html, 'default-task-priority'), priority);
      assert.deepEqual(titles(html), ['Existing done']);
      assert.deepEqual(snapshot(), originalTasks);
      assert.equal(await read('/'), summary);
      assert.equal(selected(await read('/projects/2'), 'default-task-priority'), 'Normal');
    }
    for (const priority of ['', 'Urgent', 'low']) {
      assert.equal((await post('/projects/1/default-priority', { priority })).status, 400);
    }
    assert.equal((await post('/projects/999/default-priority', { priority: 'High' })).status, 404);
    await post('/projects/1/tasks', { title: '  Inherited low  ', priority: 'High' });
    await post('/projects/2/tasks', { title: 'Independent normal' });
    assert.deepEqual(snapshot().map((task) => task.priority), ['High', 'Normal', 'Low', 'Normal']);
    await post('/projects/1/default-priority', { priority: 'High' });
    await post('/projects/1/tasks', { title: 'Inherited high' });
    await post('/projects/1/tasks/3', { completed: '1' });
    await post('/projects/1/tasks/3/rename', { title: '  Renamed inherited  ' });
    await post('/projects/1/rename', { name: 'Renamed project' });
    const savedTasks = snapshot();
    assert.deepEqual(savedTasks.map((task) => task.priority), ['High', 'Normal', 'Low', 'Normal', 'High']);
    assert.equal(savedTasks[2].title, 'Renamed inherited');
    assert.equal(savedTasks[2].completed, 1);
    const savedPage = await read(filteredPath);
    const savedSummary = await read('/');
    assert.match(savedSummary, /data-testid="project-summary">2\/4 completed/);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await read(filteredPath), savedPage);
    assert.deepEqual(snapshot(), savedTasks);
    await post('/projects/1/archive');
    const archived = await read(filteredPath);
    assert.equal(selected(archived, 'default-task-priority'), 'High');
    assert.match(select(archived, 'default-task-priority')[1], / disabled/);
    assert.doesNotMatch(select(archived, 'task-filter')[1], / disabled/);
    assert.doesNotMatch(select(archived, 'priority-filter')[1], / disabled/);
    assert.equal((await post('/projects/1/default-priority', { ...filters, priority: 'Low' })).status, 403);
    assert.equal(await read(filteredPath), archived);
    assert.deepEqual(snapshot(), savedTasks);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await read(filteredPath), archived);
    await post('/projects/1/restore');
    assert.equal(await read(filteredPath), savedPage);
    assert.equal(await read('/'), savedSummary);
    await post('/projects/1/tasks', { title: 'After restoration' });
    assert.equal(snapshot().at(-1).priority, 'High');
    assert.deepEqual(snapshot().slice(0, -1), savedTasks);
    await post('/projects/1/default-priority', { priority: 'Normal' });
    assert.equal(selected(await read('/projects/1'), 'default-task-priority'), 'Normal');
    assert.equal(snapshot().at(-1).priority, 'High');
  } finally {
    if (database) database.close();
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('inclusive due ranges intersect both filters, retain applied state through edits, and work when archived', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-due-range-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  let database;
  try {
    server = await start(databasePath);
    database = new DatabaseSync(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const read = async (path) => (await fetch(`${server.url}${path}`)).text();
    const snapshot = () => database.prepare('SELECT * FROM tasks ORDER BY id').all().map((row) => ({ ...row }));
    const titles = (html) => [...html.matchAll(/<span>([^<]*)<\/span>/g)].map((match) => match[1]);
    const input = (html, id) => html.match(new RegExp(`<input id="${id}"[^>]*>`))[0];
    const assertState = (html, filter, priority, from, through) => {
      for (const [id, value] of [['task-filter', filter], ['priority-filter', priority]]) {
        const options = html.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`))[1];
        assert.ok(options.includes(`<option selected>${value}</option>`));
      }
      assert.ok(input(html, 'due-from').includes(`value="${from}"`));
      assert.ok(input(html, 'due-through').includes(`value="${through}"`));
      assert.doesNotMatch(input(html, 'due-from'), / disabled/);
      assert.doesNotMatch(input(html, 'due-through'), / disabled/);
      for (const form of html.matchAll(/<form[^>]*method="post"[^>]*>([\s\S]*?)<\/form>/g)) {
        assert.ok(form[1].includes(`name="appliedDueFrom" value="${from}"`));
        assert.ok(form[1].includes(`name="appliedDueThrough" value="${through}"`));
      }
      const comboForm = [...html.matchAll(/<form[^>]*method="get"[^>]*>([\s\S]*?)<\/form>/g)]
        .find((match) => match[1].includes('id="task-filter"'))[1];
      assert.ok(comboForm.includes(`name="dueFrom" value="${from}"`));
      assert.ok(comboForm.includes(`name="dueThrough" value="${through}"`));
    };
    await post('/projects', { name: 'Ranges' });
    await post('/projects', { name: 'Independent' });
    const dates = ['', '0001-01-01', '2024-02-28', '2024-02-29', '2024-03-01', '9999-12-31'];
    for (const [i, date] of dates.entries()) {
      await post('/projects/1/tasks', { title: `Task ${i + 1}` });
      await post(`/projects/1/tasks/${i + 1}/due-date`, { dueDate: date });
      await post(`/projects/1/tasks/${i + 1}/priority`, { priority: ['Low', 'Normal', 'High'][i % 3] });
      if (i % 2) await post(`/projects/1/tasks/${i + 1}`, { completed: '1' });
    }
    await post('/projects/2/tasks', { title: 'Other task' });
    const before = snapshot();
    const summary = await read('/');
    assert.match(summary, /data-testid="project-summary">3\/6 completed/);
    let html = await read('/projects/1');
    assertState(html, 'All', 'All', '', '');
    assert.match(html, /<label for="due-from">Due from<\/label>/);
    assert.match(html, /<label for="due-through">Due through<\/label>/);
    assert.match(html, />Apply due range<\/button>/);

    const ranges = [
      ['', '', [1, 2, 3, 4, 5, 6]],
      ['2024-02-29', '', [4, 5, 6]],
      ['', '2024-02-29', [2, 3, 4]],
      ['2024-02-28', '2024-03-01', [3, 4, 5]],
      ['2024-02-29', '2024-02-29', [4]],
      ['0001-01-01', '9999-12-31', [2, 3, 4, 5, 6]],
      ['2025-01-01', '2025-12-31', []],
    ];
    for (const [from, through, ids] of ranges) {
      for (const filter of ['All', 'Open', 'Completed']) {
        for (const priority of ['All', 'Low', 'Normal', 'High']) {
          const result = await post('/projects/1/due-range', {
            filter, priorityFilter: priority, dueFrom: ` ${from} `, dueThrough: `\t${through}\n`,
          });
          assert.equal(result.status, 303);
          html = await read(result.headers.get('location'));
          assertState(html, filter, priority, from, through);
          const expected = before.filter((task) => ids.includes(task.id) &&
            (filter === 'All' || Boolean(task.completed) === (filter === 'Completed')) &&
            (priority === 'All' || task.priority === priority)).map((task) => task.title);
          assert.deepEqual(titles(html), expected);
        }
      }
    }
    assert.deepEqual(snapshot(), before);
    assert.equal(await read('/'), summary);

    const state = { filter: 'Open', priorityFilter: 'High', appliedDueFrom: '2024-02-28', appliedDueThrough: '2024-03-01' };
    const path = '/projects/1?filter=Open&priorityFilter=High&dueFrom=2024-02-28&dueThrough=2024-03-01';
    for (const [from, through, alert] of [
      ['2024-02-30', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['', '1900-02-29', 'Due range must use valid YYYY-MM-DD dates'],
      ['0000-01-01', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['', '10000-01-01', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-2-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['garbage', '2024-03-01', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-03-01', '2024-02-29', 'Due from must not be after Due through'],
    ]) {
      const result = await post('/projects/1/due-range', { ...state, dueFrom: from, dueThrough: through });
      assert.equal(result.status, 400);
      html = await result.text();
      assert.ok(html.includes(`role="alert">${alert}`));
      assertState(html, 'Open', 'High', state.appliedDueFrom, state.appliedDueThrough);
      assert.deepEqual(titles(html), ['Task 3']);
      assert.deepEqual(snapshot(), before);
    }
    const edit = async (suffix, values, expected) => {
      const result = await post(`/projects/1${suffix}`, { ...state, ...values });
      assert.equal(result.status, 303);
      assert.equal(result.headers.get('location'), path);
      const page = await read(path);
      assertState(page, 'Open', 'High', state.appliedDueFrom, state.appliedDueThrough);
      assert.deepEqual(titles(page), expected);
      return page;
    };
    await edit('/rename', { name: 'Renamed project' }, ['Task 3']);
    await edit('/tasks/3/rename', { title: 'Renamed task' }, ['Renamed task']);
    await edit('/default-priority', { priority: 'High' }, ['Renamed task']);
    await edit('/tasks', { title: 'New undated task' }, ['Renamed task']);
    await edit('/tasks/3/due-date', { dueDate: '2024-03-02' }, []);
    await edit('/tasks/3/due-date', { dueDate: '2024-02-29' }, ['Renamed task']);
    await edit('/tasks/3/priority', { priority: 'Low' }, []);
    await edit('/tasks/3/priority', { priority: 'High' }, ['Renamed task']);
    await edit('/tasks/3', { completed: '1' }, []);
    await edit('/tasks/3', {}, ['Renamed task']);
    await edit('/tasks/3/due-date', { dueDate: '  ' }, []);
    await edit('/tasks/3/due-date', { dueDate: '2024-02-29' }, ['Renamed task']);
    for (const [suffix, values] of [
      ['/rename', { name: ' ' }], ['/tasks', { title: '' }],
      ['/tasks/3/rename', { title: '' }], ['/tasks/3/due-date', { dueDate: 'bad' }],
    ]) {
      const result = await post(`/projects/1${suffix}`, { ...state, ...values });
      assert.equal(result.status, 400);
      html = await result.text();
      assertState(html, 'Open', 'High', state.appliedDueFrom, state.appliedDueThrough);
      assert.deepEqual(titles(html), ['Renamed task']);
    }
    const savedTasks = snapshot();
    const savedPage = await read(path);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await read(path), savedPage);
    assert.deepEqual(snapshot(), savedTasks);
    html = await read('/projects/1');
    assertState(html, 'All', 'All', '', '');
    assert.equal(titles(html).length, 7);
    await post('/projects/1/archive');
    const archived = await read(path);
    assertState(archived, 'Open', 'High', state.appliedDueFrom, state.appliedDueThrough);
    assert.match(input(archived, 'task-due-date-3'), / disabled/);
    assert.deepEqual(titles(archived), ['Renamed task']);
    const archivedRange = await post('/projects/1/due-range', { ...state, dueFrom: '', dueThrough: '' });
    assert.equal(archivedRange.status, 303);
    html = await read(archivedRange.headers.get('location'));
    assertState(html, 'Open', 'High', '', '');
    assert.deepEqual(titles(html), ['Renamed task', 'New undated task']);
    assert.equal((await post('/projects/1/tasks/3/due-date', { ...state, dueDate: '' })).status, 403);
    assert.deepEqual(snapshot(), savedTasks);
    await post('/projects/1/restore');
    assert.equal(await read(path), savedPage);
    assert.deepEqual(titles(await read('/projects/2')), ['Other task']);
    const clear = await post('/projects/1/due-range', { ...state, dueFrom: ' ', dueThrough: '\t' });
    assertState(await read(clear.headers.get('location')), 'Open', 'High', '', '');
  } finally {
    if (database) database.close();
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('moving tasks appends persistently, preserves task data and source filters, and protects archived projects', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-move-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Source'), ('Destination'), ('Third');
    INSERT INTO tasks (project_id, title, completed) VALUES
      (1, 'Oldest done', 1), (1, 'Remaining', 0), (2, 'Destination first', 0), (2, 'Destination second', 1);`);
  legacy.close();
  let server;
  let database;
  try {
    server = await start(databasePath);
    database = new DatabaseSync(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const read = async (path) => (await fetch(`${server.url}${path}`)).text();
    const titles = (html) => [...html.matchAll(/<span>([^<]*)<\/span>/g)].map((match) => match[1]);
    const task = (id) => ({ ...database.prepare('SELECT * FROM tasks WHERE id = ?').get(id) });
    const snapshot = () => database.prepare('SELECT * FROM tasks ORDER BY id').all().map((row) => ({ ...row }));
    const destinations = (html, id) => html.match(new RegExp(`<select id="destination-project-${id}"([^>]*)>([\\s\\S]*?)</select>`));
    const options = (html, id) => [...destinations(html, id)[2].matchAll(/<option value="(\d+)">([^<]*)<\/option>/g)]
      .map((match) => [match[1], match[2]]);
    assert.deepEqual(titles(await read('/projects/1')), ['Oldest done', 'Remaining']);
    assert.deepEqual(titles(await read('/projects/2')), ['Destination first', 'Destination second']);
    await post('/projects/2/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
    await post('/projects/1/tasks/2/priority', { priority: 'High' });
    await post('/projects/1/tasks/2', { completed: '1' });
    await post('/projects/1/tasks/2/due-date', { dueDate: '2024-02-29' });
    await post('/projects/2/rename', { name: 'Renamed destination' });
    let html = await read('/projects/1');
    assert.match(html, /<label for="destination-project-1">Destination project<\/label>/);
    assert.deepEqual(options(html, 1), [['2', 'Renamed destination'], ['3', 'Third']]);
    assert.doesNotMatch(destinations(html, 1)[1], / disabled/);
    const saved = task(1);
    const filters = { filter: 'Completed', priorityFilter: 'High', appliedDueFrom: '2024-02-29', appliedDueThrough: '2024-02-29' };
    const sourcePath = '/projects/1?filter=Completed&priorityFilter=High&dueFrom=2024-02-29&dueThrough=2024-02-29';
    const result = await post('/projects/1/tasks/1/move', { ...filters, destinationProject: '2' });
    assert.equal(result.status, 303);
    assert.equal(result.headers.get('location'), sourcePath);
    html = await read(sourcePath);
    assert.deepEqual(titles(html), ['Remaining']);
    assert.match(html, /id="task-filter"[^>]*>[\s\S]*?<option selected>Completed<\/option>/);
    assert.match(html, /id="priority-filter"[^>]*>[\s\S]*?<option selected>High<\/option>/);
    assert.match(html, /id="due-from"[^>]*value="2024-02-29"/);
    assert.match(html, /id="due-through"[^>]*value="2024-02-29"/);
    assert.deepEqual(titles(await read('/projects/2')), ['Destination first', 'Destination second', 'Oldest done']);
    assert.deepEqual(task(1), { ...saved, project_id: 2, sort_order: 5 });
    assert.match(await read('/'), /data-testid="project-summary">1\/1 completed/);
    assert.match(await read('/'), /data-testid="project-summary">2\/3 completed/);
    assert.deepEqual(options(await read('/projects/2'), 1), [['1', 'Source'], ['3', 'Third']]);
    assert.equal((await post('/projects/1/tasks/1/move', { destinationProject: '3' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1', {})).status, 404);
    await post('/projects/2/tasks', { title: 'Created after move' });
    assert.deepEqual(titles(await read('/projects/2')), ['Destination first', 'Destination second', 'Oldest done', 'Created after move']);
    assert.equal(task(5).priority, 'Low');
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(titles(await read('/projects/2')), ['Destination first', 'Destination second', 'Oldest done', 'Created after move']);
    assert.deepEqual(task(1), { ...saved, project_id: 2, sort_order: 5 });
    await post('/projects/2/tasks/1/move', { destinationProject: '3' });
    assert.deepEqual(titles(await read('/projects/3')), ['Oldest done']);
    assert.deepEqual(task(1), { ...saved, project_id: 3, sort_order: 1 });
    await post('/projects/3/tasks/1/move', { destinationProject: '1' });
    assert.deepEqual(titles(await read('/projects/1')), ['Remaining', 'Oldest done']);
    assert.deepEqual(task(1), { ...saved, project_id: 1, sort_order: 3 });
    await post('/projects/2/archive');
    assert.deepEqual(options(await read('/projects/1'), 1), [['3', 'Third']]);
    let unchanged = snapshot();
    assert.equal((await post('/projects/1/tasks/1/move', { destinationProject: '2' })).status, 403);
    for (const destinationProject of ['1', '999', '', 'bad', '2.5']) {
      assert.equal((await post('/projects/1/tasks/1/move', { destinationProject })).status, 400);
    }
    assert.deepEqual(snapshot(), unchanged);
    await post('/projects/1/archive');
    html = await read('/projects/1');
    assert.match(destinations(html, 1)[1], / disabled/);
    assert.match(html, /<button type="submit" disabled>Move task<\/button>/);
    assert.equal((await post('/projects/1/tasks/1/move', { destinationProject: '3' })).status, 403);
    assert.deepEqual(snapshot(), unchanged);
    await post('/projects/1/restore');
    assert.doesNotMatch(destinations(await read('/projects/1'), 1)[1], / disabled/);
    await post('/projects/3/archive');
    html = await read('/projects/1');
    assert.deepEqual(options(html, 1), []);
    assert.match(destinations(html, 1)[1], / disabled/);
    assert.match(html, /<button type="submit" disabled>Move task<\/button>/);
    await post('/projects/2/restore');
    html = await read('/projects/1');
    assert.deepEqual(options(html, 1), [['2', 'Renamed destination']]);
    assert.doesNotMatch(destinations(html, 1)[1], / disabled/);
    // Blank dates and open completion also survive moving independently.
    const blank = task(5);
    await post('/projects/2/tasks/5/move', { destinationProject: '1' });
    assert.deepEqual(task(5), { ...blank, project_id: 1, sort_order: 4 });
    assert.deepEqual(titles(await read('/projects/1')), ['Remaining', 'Oldest done', 'Created after move']);
    unchanged = snapshot();
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(snapshot(), unchanged);
    assert.deepEqual(titles(await read('/projects/1')), ['Remaining', 'Oldest done', 'Created after move']);
  } finally {
    if (database) database.close();
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
