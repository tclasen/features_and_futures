import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('due dates migrate, validate and persist independently while preserving filters and archived data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-dates-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    const legacy = new DatabaseSync(databasePath);
    try {
      legacy.exec(`
        CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
          archived INTEGER NOT NULL DEFAULT 0, default_task_priority TEXT NOT NULL DEFAULT 'Normal');
        CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
          completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
        INSERT INTO projects (name) VALUES ('Dates project'), ('Other project');
        INSERT INTO tasks (project_id, title, completed, priority) VALUES
          (1, 'First', 1, 'High'), (1, 'Second', 0, 'Normal'), (2, 'Other', 0, 'Normal');
      `);
    } finally {
      legacy.close();
    }
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const dates = (html) => [...html.matchAll(/id="task-due-date-\d+"[^>]*value="([^"]*)"/g)].map((match) => match[1]);
    const filters = { filter: 'Completed', priorityFilter: 'High' };
    const filteredPath = '/projects/1?filter=Completed&priorityFilter=High';
    const summary = await get('/');
    const other = await get('/projects/2');
    const initial = await get('/projects/1');
    assert.deepEqual(dates(initial), ['', '']);
    assert.match(initial, /<label for="task-due-date-1">Task due date<\/label>/);
    assert.match(initial, /<button type="submit">Save due date<\/button>/);
    for (const form of initial.matchAll(/<form[^>]*action="[^\"]*\/due-date"[\s\S]*?<\/form>/g)) {
      assert.match(form[0], /name="filter" value="All"/);
      assert.match(form[0], /name="priorityFilter" value="All"/);
    }
    const save = (dueDate) => post('/projects/1/tasks/1/due-date', { ...filters, dueDate });
    const response = await save('  2000-02-29  ');
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), filteredPath);
    const savedFiltered = await get(filteredPath);
    assert.deepEqual(dates(savedFiltered), ['2000-02-29']);
    assert.match(savedFiltered, /<option selected>Completed<\/option>/);
    assert.match(savedFiltered, /<option selected>High<\/option>/);
    assert.match(savedFiltered, /aria-label="Complete First" checked/);
    const saved = await get('/projects/1');
    assert.deepEqual(dates(saved), ['2000-02-29', '']);
    for (const invalid of ['1900-02-29', '2026-04-31', '0000-01-01', '2026-1-01', '<script>']) {
      const rejected = await save(invalid);
      assert.equal(rejected.status, 400);
      const html = await rejected.text();
      assert.match(html, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      assert.deepEqual(dates(html), ['2000-02-29']);
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.match(html, /<option selected>High<\/option>/);
      assert.equal(await get('/projects/1'), saved);
    }
    assert.equal((await post('/projects/2/tasks/1/due-date', { dueDate: '2026-01-01' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/due-date', { dueDate: '2026-01-01' })).status, 404);
    assert.equal(await get('/projects/2'), other);
    assert.equal(await get('/'), summary);
    await post('/projects/1/tasks/2/due-date', { dueDate: '9999-12-31' });
    await post('/projects/1/tasks/1/rename', { ...filters, title: 'Renamed first' });
    assert.deepEqual(dates(await get('/projects/1')), ['2000-02-29', '9999-12-31']);
    await post('/projects/1/tasks', { title: 'New task' });
    assert.deepEqual(dates(await get('/projects/1')), ['2000-02-29', '9999-12-31', '']);
    const beforeRestart = await get('/projects/1');
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), beforeRestart);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.equal((archived.match(/id="task-due-date-\d+"[^>]* disabled/g) || []).length, 3);
    assert.equal((archived.match(/disabled>Save due date/g) || []).length, 3);
    assert.deepEqual(dates(await get(filteredPath)), ['2000-02-29']);
    assert.equal((await save('0001-01-01')).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), beforeRestart);
    for (const blank of ['', ' \t\n ']) {
      assert.equal((await save('0001-01-01')).status, 303);
      assert.equal((await save(blank)).status, 303);
      assert.deepEqual(dates(await get(filteredPath)), ['']);
    }
    const cleared = await get('/projects/1');
    assert.deepEqual(dates(cleared), ['', '9999-12-31', '']);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), cleared);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project defaults migrate and affect only future tasks, preserving filters and archived data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-default-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    const legacy = new DatabaseSync(databasePath);
    try {
      legacy.exec(`
        CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL REFERENCES projects(id),
          title TEXT NOT NULL,
          completed INTEGER NOT NULL DEFAULT 0,
          priority TEXT NOT NULL DEFAULT 'Normal'
        );
        INSERT INTO projects (name) VALUES ('Existing project');
        INSERT INTO tasks (project_id, title, completed, priority) VALUES
          (1, 'Existing completed', 1, 'High'), (1, 'Existing open', 0, 'Normal');
      `);
    } finally {
      legacy.close();
    }
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const rows = (html) => [...html.matchAll(/data-testid="task-row">([\s\S]*?)<\/div>/g)].map((match) => match[1]);
    const selector = (html, id) => html.match(new RegExp(`<select id="${id}"[^>]*>[\\s\\S]*?</select>`))[0];
    const selected = (html, id) => selector(html, id).match(/<option selected>(.*?)<\/option>/)[1];
    const priorities = (html) => rows(html).map((row) => row.match(/<option selected>(.*?)<\/option>/)[1]);
    const filteredPath = '/projects/1?filter=Completed&priorityFilter=High';
    const filters = { filter: 'Completed', priorityFilter: 'High' };
    let initial = await get('/projects/1');
    assert.match(initial, /<label for="default-task-priority">Default task priority<\/label>/);
    assert.match(selector(initial, 'default-task-priority'), /<option>Low<\/option><option selected>Normal<\/option><option>High<\/option>/);
    assert.deepEqual(priorities(initial), ['High', 'Normal']);
    await post('/projects', { name: 'Other project' });
    initial = await get('/projects/1'); // Creating a project adds an eligible move destination.
    assert.equal(selected(await get('/projects/2'), 'default-task-priority'), 'Normal');
    const summary = await get('/');
    const filteredRows = rows(await get(filteredPath));
    for (const values of [{}, { priority: '' }, { priority: 'Urgent' }, { priority: 'high' }]) {
      assert.equal((await post('/projects/1/default-priority', values)).status, 400);
      assert.equal(await get('/projects/1'), initial);
    }
    assert.equal((await post('/projects/999/default-priority', { priority: 'High' })).status, 404);
    for (const priority of ['Low', 'Normal', 'High']) {
      const response = await post('/projects/1/default-priority', { ...filters, priority });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), filteredPath);
      const html = await get(response.headers.get('location'));
      assert.equal(selected(html, 'default-task-priority'), priority);
      assert.equal(selected(html, 'task-filter'), 'Completed');
      assert.equal(selected(html, 'priority-filter'), 'High');
      assert.deepEqual(rows(html), filteredRows);
      assert.deepEqual(rows(await get('/projects/1')), rows(initial));
      assert.equal(await get('/'), summary);
      assert.equal(selected(await get('/projects/2'), 'default-task-priority'), 'Normal');
    }
    await post('/projects/1/tasks', { title: 'Inherited high' });
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Inherited low' });
    await post('/projects/2/tasks', { title: 'Other task' });
    assert.deepEqual(priorities(await get('/projects/1')), ['High', 'Normal', 'High', 'Low']);
    assert.deepEqual(priorities(await get('/projects/2')), ['Normal']);
    await post('/projects/1/tasks/3', { completed: '1' });
    await post('/projects/1/tasks/3/rename', { title: 'Renamed high' });
    const beforeRename = rows(await get('/projects/1'));
    await post('/projects/1/rename', { name: 'Renamed project' });
    const saved = await get('/projects/1');
    assert.deepEqual(rows(saved), beforeRename);
    assert.equal(selected(saved, 'default-task-priority'), 'Low');
    assert.match(saved, /aria-label="Complete Renamed high" checked/);
    assert.match(await get('/'), /data-testid="project-summary">2\/4 completed/);
    const otherProject = await get('/projects/2');
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), saved);
    assert.equal(await get('/projects/2'), otherProject);
    await post('/projects/1/archive');
    const archived = await get(filteredPath);
    assert.match(selector(archived, 'default-task-priority'), / disabled/);
    assert.equal(selected(archived, 'default-task-priority'), 'Low');
    for (const id of ['task-filter', 'priority-filter']) {
      assert.doesNotMatch(selector(archived, id), /disabled/);
    }
    assert.equal((await post('/projects/1/default-priority', { priority: 'Normal' })).status, 403);
    assert.equal(await get(filteredPath), archived);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get(filteredPath), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), saved);
    await post('/projects/1/tasks', { title: 'After restoration' });
    assert.deepEqual(priorities(await get('/projects/1')), ['High', 'Normal', 'High', 'Low', 'Low']);
    assert.equal(await get('/projects/2'), otherProject);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('priorities migrate, stay independent and persist through renaming, archive and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    const legacy = new DatabaseSync(databasePath);
    try {
      legacy.exec(`
        CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL REFERENCES projects(id),
          title TEXT NOT NULL,
          completed INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO projects (name) VALUES ('Existing project');
        INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing task', 1);
      `);
    } finally {
      legacy.close();
    }
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const rows = (html) => [...html.matchAll(/data-testid="task-row">([\s\S]*?)<\/div>/g)].map((match) => match[1]);
    const priorities = (html) => rows(html).map((row) => {
      const select = row.match(/<select[^>]*name="priority"[^>]*>([\s\S]*?)<\/select>/);
      assert.ok(select, 'Every task row has a priority selector');
      assert.deepEqual([...select[1].matchAll(/<option(?: selected)?>(.*?)<\/option>/g)].map((match) => match[1]), ['Low', 'Normal', 'High']);
      return select[1].match(/<option selected>(.*?)<\/option>/)[1];
    });
    await post('/projects/1/tasks', { title: 'New task' });
    await post('/projects', { name: 'Other project' });
    await post('/projects/2/tasks', { title: 'Other task' });
    const original = await get('/projects/1');
    const otherProject = await get('/projects/2');
    const summary = await get('/');
    assert.deepEqual(priorities(original), ['Normal', 'Normal']);
    assert.match(original, /<label for="task-priority-1">Task priority<\/label>/);
    assert.match(original, /name="priority" onchange="this.form.requestSubmit\(\)"/);

    for (const values of [{}, { priority: '' }, { priority: 'Urgent' }, { priority: 'high' }]) {
      assert.equal((await post('/projects/1/tasks/1/priority', values)).status, 400);
      assert.equal(await get('/projects/1'), original);
    }
    for (const path of ['/projects/2/tasks/1/priority', '/projects/1/tasks/999/priority', '/projects/999/tasks/1/priority']) {
      assert.equal((await post(path, { priority: 'High' })).status, 404);
    }
    const changed = await post('/projects/1/tasks/1/priority', { priority: 'High', filter: 'Completed' });
    assert.equal(changed.status, 303);
    assert.equal(changed.headers.get('location'), '/projects/1?filter=Completed');
    assert.deepEqual(priorities(await get('/projects/1')), ['High', 'Normal']);
    assert.equal(rows(await get('/projects/1'))[1], rows(original)[1]);
    assert.deepEqual(priorities(await get('/projects/1?filter=Completed')), ['High']);
    assert.deepEqual(priorities(await get('/projects/1?filter=Open')), ['Normal']);
    assert.equal(await get('/projects/2'), otherProject);
    assert.equal(await get('/'), summary);
    await post('/projects/1/tasks/2/priority', { priority: 'Low' });
    await post('/projects/1/tasks/1/rename', { title: '  Renamed task  ' });
    const saved = await get('/projects/1');
    assert.deepEqual(priorities(saved), ['High', 'Low']);
    assert.match(rows(saved)[0], /aria-label="Complete Renamed task" checked/);
    assert.match(rows(saved)[1], /aria-label="Complete New task" onchange/);
    assert.equal(await get('/'), summary);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), saved);
    assert.equal(await get('/projects/2'), otherProject);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.equal(rows(archived).filter((row) => /name="priority" disabled/.test(row)).length, 2);
    assert.deepEqual(priorities(archived), ['High', 'Low']);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Low' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), saved);
    await post('/projects/1/tasks/1/priority', { priority: 'Normal' });
    const restored = await get('/projects/1');
    assert.deepEqual(priorities(restored), ['Normal', 'Low']);
    await post('/projects/1/tasks/1', {});
    assert.deepEqual(priorities(await get('/projects/1')), ['Normal', 'Low']);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.deepEqual(priorities(await get('/projects/1')), ['Normal', 'Low']);
    assert.doesNotMatch(rows(await get('/projects/1'))[0], / checked/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task renaming preserves identity, completion and ownership across archive and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const rows = (html) => [...html.matchAll(/data-testid="task-row">([\s\S]*?)<\/div>/g)].map((match) => match[1]);
    await post('/projects', { name: 'First project' });
    await post('/projects', { name: 'Second project' });
    await post('/projects/1/tasks', { title: 'First task' });
    await post('/projects/1/tasks', { title: 'Second task' });
    await post('/projects/2/tasks', { title: 'Other task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await get('/projects/1');
    const originalList = await get('/');
    const otherProject = await get('/projects/2');
    assert.match(rows(original)[0], /<label for="new-task-title-1">New task title<\/label>/);
    assert.match(rows(original)[0], /id="new-task-title-1"[^>]*value="First task"/);
    assert.match(rows(original)[0], /<button type="submit">Rename task<\/button>/);

    for (const values of [{}, { title: '' }, { title: ' \t\n ' }]) {
      const response = await post('/projects/1/tasks/1/rename', { ...values, filter: 'Completed' });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(rows(html)[0], /role="alert">Task title is required/);
      assert.match(rows(html)[0], /aria-label="Complete First task" checked/);
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.equal(rows(html).length, 1);
      assert.equal(await get('/projects/1'), original);
      assert.equal(await get('/'), originalList);
    }
    assert.equal((await post('/projects/2/tasks/1/rename', { title: 'Wrong owner' })).status, 404);
    assert.equal((await post('/projects/1/tasks/99999/rename', { title: 'Missing' })).status, 404);
    assert.equal((await post('/projects/1/tasks/9007199254740992/rename', { title: 'Invalid ID' })).status, 404);
    assert.equal((await post('/projects/999/tasks/1/rename', { title: 'Missing project' })).status, 404);
    const renamed = await post('/projects/1/tasks/1/rename', { title: '  Renamed task  ', filter: 'Completed' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const renamedPage = await get('/projects/1');
    const renamedRows = rows(renamedPage);
    assert.equal(renamedRows.length, 2);
    assert.match(renamedRows[0], /aria-label="Complete Renamed task" checked/);
    assert.match(renamedRows[0], /<span>Renamed task<\/span>/);
    assert.match(renamedRows[0], /action="\/projects\/1\/tasks\/1\/rename"/);
    assert.equal(renamedRows[1], rows(original)[1]);
    assert.equal(await get('/'), originalList);
    assert.equal(await get('/projects/2'), otherProject);
    const openRows = rows(await get('/projects/1?filter=Open'));
    assert.equal(openRows.length, 1);
    assert.match(openRows[0], /aria-label="Complete Second task" onchange/);
    const completedRows = rows(await get('/projects/1?filter=Completed'));
    assert.equal(completedRows.length, 1);
    assert.match(completedRows[0], /aria-label="Complete Renamed task" checked/);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), renamedPage);
    assert.equal(await get('/'), originalList);
    await post('/projects/1/archive');
    const archivedPage = await get('/projects/1');
    assert.equal((archivedPage.match(/id="new-task-title-\d+"[^>]* disabled/g) || []).length, 2);
    assert.equal((archivedPage.match(/<button type="submit" disabled>Rename task/g) || []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Forbidden' })).status, 403);
    assert.equal(await get('/projects/1'), archivedPage);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), archivedPage);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), renamedPage);
    const unsafeTitle = '<script>"Renamed" & task</script>';
    assert.equal((await post('/projects/1/tasks/2/rename', { title: `  ${unsafeTitle}  `, filter: 'Open' })).status, 303);
    const escapedPage = await get('/projects/1');
    assert.match(rows(escapedPage)[1], /aria-label="Complete &lt;script&gt;&quot;Renamed&quot; &amp; task&lt;\/script&gt;"/);
    assert.match(rows(escapedPage)[1], /value="&lt;script&gt;&quot;Renamed&quot; &amp; task&lt;\/script&gt;"/);
    assert.doesNotMatch(escapedPage, /<script>/);
    assert.doesNotMatch(rows(escapedPage)[1], / checked/);
    assert.equal(await get('/'), originalList);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), escapedPage);
    assert.equal(await get('/projects/2'), otherProject);
    await post('/projects/1/tasks/1', {});
    assert.match(await get('/projects/1'), /aria-label="Complete Renamed task" onchange/);
    assert.match(await get('/'), /data-testid="project-summary">0\/2 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
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

test('projects validate, navigate, retain creation order and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const initial = await (await fetch(server.url)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);

    const create = (name) => fetch(`${server.url}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    for (const name of ['', ' \t\n ']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    const created = await create('  First project  ');
    assert.equal(created.status, 303);
    assert.equal(created.headers.get('location'), '/');
    await create('<script>alert("test")</script>');
    const list = await (await fetch(server.url)).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(list, /class="project-name">First project<\/span>/);
    assert.match(list, /&lt;script&gt;alert\(&quot;test&quot;\)&lt;\/script&gt;/);
    assert.ok(list.indexOf('First project') < list.indexOf('&lt;script&gt;'));
    const paths = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
    assert.equal(new Set(paths).size, 2);
    const detail = await (await fetch(`${server.url}${paths[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*>Projects<\/button>/);
    assert.equal((await fetch(`${server.url}/projects/99999`)).status, 404);

    const invalidAfterCreation = await (await create(' ')).text();
    assert.equal((invalidAfterCreation.match(/data-testid="project-row"/g) || []).length, 2);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await (await fetch(server.url)).text(), list);
    assert.equal(await (await fetch(`${server.url}${paths[0]}`)).text(), detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project tasks validate, filter, toggle, remain isolated and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const rows = (html) => [...html.matchAll(/data-testid="task-row">([\s\S]*?)<\/div>/g)].map((match) => match[1]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const initial = await get('/projects/1');
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, />Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    assert.equal(rows(initial).length, 0);

    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(rows(html).length, 0);
    }
    const created = await post('/projects/1/tasks', { title: '  First task  ' });
    assert.equal(created.status, 303);
    assert.equal(created.headers.get('location'), '/projects/1?filter=All');
    await post('/projects/1/tasks', { title: '<script>"Second" & task</script>' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    const all = await get('/projects/1');
    const taskRows = rows(all);
    assert.equal(taskRows.length, 2);
    assert.match(taskRows[0], /aria-label="Complete First task"/);
    assert.match(taskRows[0], /<span>First task<\/span>/);
    assert.doesNotMatch(all, / checked/);
    assert.match(taskRows[1], /&lt;script&gt;&quot;Second&quot; &amp; task&lt;\/script&gt;/);
    assert.doesNotMatch(all, /<script>/);
    assert.equal(rows(await get('/projects/1?filter=Open')).length, 2);
    assert.equal(rows(await get('/projects/1?filter=Completed')).length, 0);
    const secondProject = await get('/projects/2');
    assert.equal(rows(secondProject).length, 1);
    assert.match(secondProject, /Other project task/);
    assert.doesNotMatch(secondProject, /First task/);

    const invalid = await post('/projects/1/tasks', { title: ' ' });
    assert.equal(rows(await invalid.text()).length, 2);
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/1/tasks/99999', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/99999/tasks', { title: 'Missing project' })).status, 404);
    const completed = await post('/projects/1/tasks/1', { completed: '1', filter: 'Open' });
    assert.equal(completed.status, 303);
    assert.equal(completed.headers.get('location'), '/projects/1?filter=Open');
    const openRows = rows(await get('/projects/1?filter=Open'));
    assert.equal(openRows.length, 1);
    assert.match(openRows[0], /Second/);
    const completedRows = rows(await get('/projects/1?filter=Completed'));
    assert.equal(completedRows.length, 1);
    assert.match(completedRows[0], /aria-label="Complete First task" checked/);
    const saved = await get('/projects/1');
    assert.equal(rows(saved).length, 2);
    assert.match(rows(saved)[0], /First task/);
    assert.match(rows(saved)[1], /Second/);
    assert.equal(await get('/projects/1?filter=invalid'), saved);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), saved);
    assert.equal(await get('/projects/2'), secondProject);
    assert.equal(rows(await get('/projects/1?filter=Completed')).length, 1);
    await post('/projects/1/tasks/1', { filter: 'Completed' });
    assert.equal(rows(await get('/projects/1?filter=Completed')).length, 0);
    assert.equal(rows(await get('/projects/1?filter=Open')).length, 2);
    assert.doesNotMatch(await get('/projects/1'), / checked/);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), all);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('legacy projects migrate; archive, restore and summaries preserve tasks across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    // Seed the schema from Task 002 to verify migration without losing existing IDs or data.
    const legacy = new DatabaseSync(databasePath);
    try {
      legacy.exec(`
        CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
        CREATE TABLE tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL REFERENCES projects(id),
          title TEXT NOT NULL,
          completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
        );
        INSERT INTO projects (name) VALUES ('Existing project');
        INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Finished task', 1), (1, 'Open task', 0);
      `);
    } finally {
      legacy.close();
    }
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const taskCount = (html) => (html.match(/data-testid="task-row"/g) || []).length;
    const initial = await get('/');
    assert.match(initial, /<label for="project-filter">Project filter<\/label>/);
    assert.match(initial, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(initial, /data-testid="project-summary">1\/2 completed/);
    assert.match(initial, />Archive project<\/button>/);
    assert.doesNotMatch(initial, /Restore project/);
    assert.equal(await get('/?filter=invalid'), initial);
    await post('/projects', { name: 'New project' });
    assert.match(await get('/'), /data-testid="project-summary">0\/0 completed/);
    assert.equal(taskCount(await get('/projects/1?filter=Completed')), 1);
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    assert.equal((await post('/projects/999/archive')).status, 404);
    assert.equal((await post('/projects/999/restore')).status, 404);

    assert.equal((await post('/projects/1/archive')).status, 303);
    assert.doesNotMatch(await get('/'), /Existing project/);
    const archivedList = await get('/?filter=Archived');
    assert.match(archivedList, /<option>Active<\/option><option selected>Archived<\/option>/);
    assert.match(archivedList, /Existing project/);
    assert.match(archivedList, /data-testid="project-summary">1\/2 completed/);
    assert.match(archivedList, />Open project<\/button>/);
    assert.match(archivedList, />Restore project<\/button>/);
    assert.doesNotMatch(archivedList, /Archive project/);
    const invalid = await post('/projects', { name: ' ', filter: 'Archived' });
    assert.equal(invalid.status, 400);
    assert.match(await invalid.text(), /Existing project/);

    const archivedPage = await get('/projects/1');
    assert.match(archivedPage, /<p>Archived project<\/p>/);
    assert.match(archivedPage, /<button type="submit" disabled>Create task<\/button>/);
    assert.equal((archivedPage.match(/type="checkbox"[^>]* disabled/g) || []).length, 2);
    assert.match(archivedPage, /aria-label="Complete Finished task" checked disabled/);
    assert.equal(taskCount(archivedPage), 2);
    assert.equal(taskCount(await get('/projects/1?filter=Open')), 1);
    assert.equal(taskCount(await get('/projects/1?filter=Completed')), 1);
    assert.equal((await post('/projects/1/tasks', { title: 'Forbidden task' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1', { completed: '0' })).status, 403);
    assert.equal(await get('/projects/1'), archivedPage);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/?filter=Archived'), archivedList);
    assert.equal(await get('/projects/1'), archivedPage);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.doesNotMatch(await get('/?filter=Archived'), /data-testid="project-row"/);
    const restoredList = await get('/');
    assert.ok(restoredList.indexOf('Existing project') < restoredList.indexOf('New project'));
    assert.match(restoredList, /data-testid="project-summary">1\/2 completed/);
    const restoredPage = await get('/projects/1');
    assert.doesNotMatch(restoredPage, /Archived project| disabled/);
    assert.match(restoredPage, /aria-label="Complete Finished task" checked/);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/'), restoredList);
    assert.equal(await get('/projects/1'), restoredPage);
    await post('/projects/1/tasks/2', { completed: '1' });
    assert.match(await get('/'), /data-testid="project-summary">2\/2 completed/);
    await post('/projects/1/tasks', { title: 'Third task' });
    assert.match(await get('/'), /data-testid="project-summary">2\/3 completed/);
    await post('/projects/1/tasks/1', {});
    assert.match(await get('/'), /data-testid="project-summary">1\/3 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('renaming preserves project identity and tasks, validates names and respects archive state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const taskRows = (html) => [...html.matchAll(/data-testid="task-row">([\s\S]*?)<\/div>/g)].map((match) => match[1]);
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second project' });
    await post('/projects/1/tasks', { title: 'Completed task' });
    await post('/projects/1/tasks', { title: 'Open task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await get('/projects/1');
    const originalList = await get('/');
    assert.match(original, /<label for="new-project-name">New project name<\/label>/);
    assert.match(original, /<button type="submit">Rename project<\/button>/);
    assert.match(original, /id="new-project-name"[^>]*value="Original"/);

    for (const values of [{}, { name: '' }, { name: ' \t\n ' }]) {
      const response = await post('/projects/1/rename', { ...values, filter: 'Completed' });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.match(html, /<h1>Original<\/h1>/);
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.equal(taskRows(html).length, 1);
      assert.equal(await get('/projects/1'), original);
      assert.equal(await get('/'), originalList);
    }
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
    const renamed = await post('/projects/1/rename', { name: '  Renamed project  ', filter: 'Open' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Open');
    const renamedPage = await get('/projects/1');
    assert.match(renamedPage, /<h1>Renamed project<\/h1>/);
    assert.deepEqual(taskRows(renamedPage), taskRows(original));
    const renamedList = await get('/');
    assert.match(renamedList, /class="project-name">Renamed project<\/span>/);
    assert.ok(renamedList.indexOf('Renamed project') < renamedList.indexOf('Second project'));
    assert.match(renamedList, /data-testid="project-summary">1\/2 completed/);
    assert.match(renamedList, /action="\/projects\/1"/);
    assert.match(await get('/projects/2'), /<h1>Second project<\/h1>/);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), renamedPage);
    assert.equal(await get('/'), renamedList);
    await post('/projects/1/archive');
    const archivedPage = await get('/projects/1');
    assert.match(archivedPage, /id="new-project-name"[^>]* disabled/);
    assert.match(archivedPage, /<button type="submit" disabled>Rename project<\/button>/);
    assert.equal((await post('/projects/1/rename', { name: 'Forbidden' })).status, 403);
    assert.equal(await get('/projects/1'), archivedPage);
    assert.match(await get('/?filter=Archived'), /Renamed project/);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), archivedPage);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), renamedPage);
    const unsafeName = '<script>"Name" & project</script>';
    assert.equal((await post('/projects/1/rename', { name: `  ${unsafeName}  ` })).status, 303);
    const escapedPage = await get('/projects/1');
    assert.match(escapedPage, /<h1>&lt;script&gt;&quot;Name&quot; &amp; project&lt;\/script&gt;<\/h1>/);
    assert.match(escapedPage, /value="&lt;script&gt;&quot;Name&quot; &amp; project&lt;\/script&gt;"/);
    assert.doesNotMatch(escapedPage, /<script>/);
    assert.deepEqual(taskRows(escapedPage), taskRows(original));
    const escapedList = await get('/');
    assert.match(escapedList, /data-testid="project-summary">1\/2 completed/);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), escapedPage);
    assert.equal(await get('/'), escapedList);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('combined filters retain selections, re-evaluate edits and work through archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-filters-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const titles = (html) => [...html.matchAll(/<span>(.*?)<\/span>/g)].map((match) => match[1]);
    const selected = (html, id) => html.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`))[1]
      .match(/<option selected>(.*?)<\/option>/)[1];
    const pagePath = (filter, priorityFilter) => `/projects/1?${new URLSearchParams({ filter, priorityFilter })}`;
    const expectSelections = (html, filter, priority) => {
      assert.equal(selected(html, 'task-filter'), filter);
      assert.equal(selected(html, 'priority-filter'), priority);
    };
    await post('/projects', { name: 'Filters project' });
    await post('/projects', { name: 'Other project' });
    await post('/projects/2/tasks', { title: 'Other task' });
    const tasks = [];
    for (const priority of ['Low', 'Normal', 'High']) {
      for (const completed of [false, true]) {
        const id = tasks.length + 2; // The other project's task was created first.
        const title = `${priority} ${completed ? 'completed' : 'open'}`;
        await post('/projects/1/tasks', { title });
        await post(`/projects/1/tasks/${id}/priority`, { priority });
        if (completed) await post(`/projects/1/tasks/${id}`, { completed: '1' });
        tasks.push({ id, title, priority, completed });
      }
    }
    const list = await get('/');
    const otherProject = await get('/projects/2');
    assert.match(list, /data-testid="project-summary">3\/6 completed/);
    const initial = await get('/projects/1');
    expectSelections(initial, 'All', 'All');
    assert.match(initial, /<label for="priority-filter">Priority filter<\/label>/);
    assert.match(initial, /id="priority-filter"[^>]*onchange="this.form.requestSubmit\(\)"/);
    const filterForm = initial.match(/<form class="task-filter" method="get"[\s\S]*?<\/form>/)[0];
    assert.match(filterForm, /id="task-filter"/);
    assert.match(filterForm, /id="priority-filter"/);
    assert.match(filterForm, /<option selected>All<\/option><option>Low<\/option><option>Normal<\/option><option>High<\/option>/);
    for (const filter of ['All', 'Open', 'Completed']) {
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        const html = await get(pagePath(filter, priority));
        expectSelections(html, filter, priority);
        assert.deepEqual(titles(html), tasks.filter((task) => (
          (filter === 'All' || task.completed === (filter === 'Completed'))
          && (priority === 'All' || task.priority === priority)
        )).map((task) => task.title));
      }
    }
    assert.equal(await get('/'), list);
    assert.equal(await get('/projects/1?filter=invalid&priorityFilter=invalid'), initial);
    assert.equal(await get('/projects/1?filter=Open&priorityFilter=invalid'), await get(pagePath('Open', 'All')));

    const values = { filter: 'Open', priorityFilter: 'High' };
    const filtered = await get(pagePath('Open', 'High'));
    for (const form of filtered.matchAll(/<form[^>]*method="post"[\s\S]*?<\/form>/g)) {
      assert.match(form[0], /name="filter" value="Open"/);
      assert.match(form[0], /name="priorityFilter" value="High"/);
    }
    for (const [path, input, message] of [
      ['/projects/1/tasks', { title: ' ' }, 'Task title is required'],
      ['/projects/1/tasks/6/rename', { title: ' ' }, 'Task title is required'],
      ['/projects/1/rename', { name: ' ' }, 'Project name is required'],
    ]) {
      const response = await post(path, { ...values, ...input });
      assert.equal(response.status, 400);
      const html = await response.text();
      expectSelections(html, 'Open', 'High');
      assert.deepEqual(titles(html), ['High open']);
      assert.ok(html.includes(`role="alert">${message}`));
    }
    const edit = async (path, input, filters) => {
      const response = await post(path, { ...filters, ...input });
      assert.equal(response.status, 303);
      const location = response.headers.get('location');
      assert.equal(location, pagePath(filters.filter, filters.priorityFilter));
      const html = await get(location);
      expectSelections(html, filters.filter, filters.priorityFilter);
      return html;
    };
    const renamed = await edit('/projects/1/tasks/6/rename', { title: '  Renamed high  ' }, values);
    assert.deepEqual(titles(renamed), ['Renamed high']);
    assert.match(renamed, /aria-label="Complete Renamed high" onchange/);
    assert.equal(await get('/'), list);
    assert.deepEqual(titles(await edit('/projects/1/tasks/6/priority', { priority: 'Low' }, values)), []);
    assert.equal(await get('/'), list);
    const lowOpen = { filter: 'Open', priorityFilter: 'Low' };
    assert.deepEqual(titles(await get(pagePath('Open', 'Low'))), ['Low open', 'Renamed high']);
    assert.deepEqual(titles(await edit('/projects/1/tasks/6', { completed: '1' }, lowOpen)), ['Low open']);
    const lowCompleted = { filter: 'Completed', priorityFilter: 'Low' };
    assert.deepEqual(titles(await get(pagePath('Completed', 'Low'))), ['Low completed', 'Renamed high']);
    assert.deepEqual(titles(await edit('/projects/1/tasks/3', {}, lowCompleted)), ['Renamed high']);
    assert.match(await get('/'), /data-testid="project-summary">3\/6 completed/);
    assert.equal(await get('/projects/2'), otherProject);
    const saved = await get('/projects/1');
    const savedFiltered = await get(pagePath('Completed', 'Low'));
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), saved);
    assert.equal(await get(pagePath('Completed', 'Low')), savedFiltered);
    await post('/projects/1/archive');
    const archived = await get(pagePath('Completed', 'Low'));
    expectSelections(archived, 'Completed', 'Low');
    assert.deepEqual(titles(archived), ['Renamed high']);
    for (const id of ['task-filter', 'priority-filter']) {
      assert.doesNotMatch(archived.match(new RegExp(`<select id="${id}"[^>]*>`))[0], /disabled/);
    }
    assert.match(archived, /type="checkbox"[^>]* checked disabled/);
    assert.match(archived, /name="priority" disabled/);
    assert.match(archived, /id="new-task-title-6"[^>]* disabled/);
    assert.match(archived, /disabled>Rename task/);
    assert.equal((await post('/projects/1/tasks/6/priority', { priority: 'High' })).status, 403);
    assert.deepEqual(titles(await get(pagePath('Open', 'High'))), []);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get(pagePath('Completed', 'Low')), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), saved);
    assert.equal(await get(pagePath('Completed', 'Low')), savedFiltered);
    // Opening from the list uses the bare project URL, so both filters start at All.
    assert.match(await get('/'), /action="\/projects\/1"/);
    expectSelections(await get('/projects/1'), 'All', 'All');
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('due range intersects filters, retains applied state through edits and errors, and works archived', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-range-'));
  let server;
  try {
    const databasePath = join(directory, 'workboard.sqlite');
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const titles = (html) => [...html.matchAll(/<span>(.*?)<\/span>/g)].map((match) => match[1]);
    await post('/projects', { name: 'Range project' });
    await post('/projects', { name: 'Other project' });
    const tasks = [
      { title: 'Undated', date: '', priority: 'Normal', completed: false },
      { title: 'Before', date: '2026-01-01', priority: 'High', completed: false },
      { title: 'Start', date: '2026-02-01', priority: 'High', completed: false },
      { title: 'Middle', date: '2026-02-10', priority: 'Normal', completed: true },
      { title: 'End', date: '2026-02-28', priority: 'High', completed: true },
      { title: 'After', date: '2026-03-01', priority: 'Low', completed: false },
    ];
    for (const [index, task] of tasks.entries()) {
      await post('/projects/1/tasks', { title: task.title });
      await post(`/projects/1/tasks/${index + 1}/due-date`, { dueDate: task.date });
      await post(`/projects/1/tasks/${index + 1}/priority`, { priority: task.priority });
      if (task.completed) await post(`/projects/1/tasks/${index + 1}`, { completed: '1' });
    }
    const summary = await get('/');
    const other = await get('/projects/2');
    for (const [dueFrom, dueThrough] of [['', ''], ['2026-02-01', ''], ['', '2026-02-28'], ['2026-02-01', '2026-02-28'], ['2026-02-01', '2026-02-01']]) {
      for (const filter of ['All', 'Open', 'Completed']) {
        for (const priorityFilter of ['All', 'Low', 'Normal', 'High']) {
          const response = await post('/projects/1/due-range', {
            filter, priorityFilter, rangeFrom: ` ${dueFrom} `, rangeThrough: ` ${dueThrough} `,
          });
          assert.equal(response.status, 303);
          const html = await get(response.headers.get('location'));
          assert.deepEqual(titles(html), tasks.filter((task) => (
            (filter === 'All' || task.completed === (filter === 'Completed'))
            && (priorityFilter === 'All' || task.priority === priorityFilter)
            && ((!dueFrom && !dueThrough) || (task.date && (!dueFrom || task.date >= dueFrom) && (!dueThrough || task.date <= dueThrough)))
          )).map((task) => task.title));
          assert.match(html, new RegExp(`id="due-from"[^>]*value="${dueFrom}"`));
          assert.match(html, new RegExp(`id="due-through"[^>]*value="${dueThrough}"`));
        }
      }
    }
    assert.equal(await get('/'), summary);
    const state = { filter: 'Open', priorityFilter: 'High', dueFrom: '2026-02-01', dueThrough: '2026-02-28' };
    const path = `/projects/1?${new URLSearchParams(state)}`;
    const filtered = await get(path);
    assert.deepEqual(titles(filtered), ['Start']);
    for (const form of filtered.matchAll(/<form[^>]*action="\/projects\/1(?:[^\"]*)"[\s\S]*?<\/form>/g)) {
      assert.match(form[0], /name="dueFrom" value="2026-02-01"/);
      assert.match(form[0], /name="dueThrough" value="2026-02-28"/);
    }
    for (const [rangeFrom, rangeThrough, message] of [
      ['1900-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['', '2026-04-31', 'Due range must use valid YYYY-MM-DD dates'],
      ['2026-03-01', '2026-02-28', 'Due from must not be after Due through'],
    ]) {
      const response = await post('/projects/1/due-range', { ...state, rangeFrom, rangeThrough });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.ok(html.includes(`role="alert">${message}`));
      assert.deepEqual(titles(html), ['Start']);
      assert.match(html, /name="dueFrom" value="2026-02-01"/);
      assert.match(html, /<option selected>Open<\/option>/);
      assert.match(html, /<option selected>High<\/option>/);
    }
    for (const [endpoint, input] of [
      ['/tasks', { title: ' ' }], ['/rename', { name: ' ' }],
      ['/tasks/3/rename', { title: ' ' }], ['/tasks/3/due-date', { dueDate: 'invalid' }],
    ]) {
      const response = await post(`/projects/1${endpoint}`, { ...state, ...input });
      assert.equal(response.status, 400);
      assert.deepEqual(titles(await response.text()), ['Start']);
    }
    const edit = async (endpoint, input) => {
      const response = await post(`/projects/1${endpoint}`, { ...state, ...input });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), path);
      return titles(await get(path));
    };
    assert.deepEqual(await edit('/tasks/3/rename', { title: 'Renamed start' }), ['Renamed start']);
    assert.deepEqual(await edit('/rename', { name: 'Renamed project' }), ['Renamed start']);
    assert.deepEqual(await edit('/default-priority', { priority: 'High' }), ['Renamed start']);
    assert.deepEqual(await edit('/tasks', { title: 'New undated' }), ['Renamed start']);
    assert.deepEqual(await edit('/tasks/3/due-date', { dueDate: '2026-03-01' }), []);
    assert.deepEqual(await edit('/tasks/2/due-date', { dueDate: '2026-02-01' }), ['Before']);
    assert.deepEqual(await edit('/tasks/2/priority', { priority: 'Low' }), []);
    assert.deepEqual(await edit('/tasks/2/priority', { priority: 'High' }), ['Before']);
    assert.deepEqual(await edit('/tasks/2', { completed: '1' }), []);
    assert.deepEqual(titles(await get(path.replace('filter=Open', 'filter=Completed'))), ['Before', 'End']);
    assert.deepEqual(await edit('/tasks/5', {}), ['End']);
    assert.deepEqual(await edit('/tasks/5/due-date', { dueDate: ' ' }), []);
    assert.match(await get('/'), /data-testid="project-summary">2\/7 completed/);
    assert.equal(await get('/projects/2'), other);
    const saved = await get('/projects/1');
    const savedFiltered = await get(path);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get(path), savedFiltered);
    assert.equal(await get('/projects/1'), saved);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    for (const id of ['due-from', 'due-through']) {
      assert.doesNotMatch(archived.match(new RegExp(`<input id="${id}"[^>]*>`))[0], /disabled/);
    }
    assert.match(archived, /disabled>Save due date/);
    const rangeResponse = await post('/projects/1/due-range', { rangeFrom: '2026-02-01', rangeThrough: '2026-02-28' });
    assert.equal(rangeResponse.status, 303);
    assert.deepEqual(titles(await get(rangeResponse.headers.get('location'))), ['Before', 'Middle']);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), saved);
    assert.match(saved, /id="due-from"[^>]*value=""/);
    assert.match(saved, /id="due-through"[^>]*value=""/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('moves preserve data and filters and enforce active ownership across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-moves-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    // A pre-move database must retain the original task order during migration.
    const legacy = new DatabaseSync(databasePath);
    legacy.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (name) VALUES ('Source');
      INSERT INTO tasks (project_id, title, completed) VALUES (1, 'First', 1), (1, 'Second', 0);
    `);
    legacy.close();
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const titles = (html) => [...html.matchAll(/<span>(.*?)<\/span>/g)].map((match) => match[1]);
    const destinations = (html, taskId) => html.match(new RegExp(`<select id="destination-project-${taskId}"[^>]*>[\\s\\S]*?</select>`))[0];
    const summary = (html, name) => [...html.matchAll(/data-testid="project-row">([\s\S]*?)<\/div>/g)]
      .find((match) => match[1].includes(`class="project-name">${name}</span>`))[1]
      .match(/data-testid="project-summary">([^<]*)/)[1];
    const initial = await get('/projects/1');
    assert.deepEqual(titles(initial), ['First', 'Second']);
    assert.match(destinations(initial, 1), /name="destination" disabled>\s*<\/select>/);
    assert.match(initial, /disabled>Move task/);
    await post('/projects', { name: 'Destination' });
    await post('/projects', { name: 'Third' });
    await post('/projects', { name: 'Archived' });
    await post('/projects/4/archive');
    await post('/projects/2/rename', { name: 'Destination & renamed' });
    await post('/projects/2/default-priority', { priority: 'Low' });
    await post('/projects/2/tasks', { title: 'Destination existing' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2000-02-29' });
    await post('/projects/1/tasks/2/priority', { priority: 'High' });
    await post('/projects/1/tasks/2', { completed: '1' });
    await post('/projects/1/tasks/2/due-date', { dueDate: '2000-02-29' });
    const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2000-02-29', dueThrough: '2000-02-29' };
    const sourcePath = `/projects/1?${new URLSearchParams(state)}`;
    const before = await get(sourcePath);
    assert.match(destinations(before, 1), /<option value="2">Destination &amp; renamed<\/option>\s*<option value="3">Third<\/option>/);
    assert.doesNotMatch(destinations(before, 1), /value="[14]"/);
    for (const destination of ['', '1', '4', '999', 'bad', '2.5']) {
      assert.equal((await post('/projects/1/tasks/1/move', { ...state, destination })).status, 400);
      assert.equal(await get(sourcePath), before);
    }
    assert.equal((await post('/projects/2/tasks/1/move', { destination: '3' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/move', { destination: '2' })).status, 404);
    const moved = await post('/projects/1/tasks/1/move', { ...state, destination: '2' });
    assert.equal(moved.status, 303);
    assert.equal(moved.headers.get('location'), sourcePath);
    const remaining = await get(sourcePath);
    assert.deepEqual(titles(remaining), ['Second']);
    assert.match(remaining, /<option selected>Completed<\/option>/);
    assert.match(remaining, /<option selected>High<\/option>/);
    assert.match(remaining, /id="due-from"[^>]*value="2000-02-29"/);
    assert.match(remaining, /id="due-through"[^>]*value="2000-02-29"/);
    const destinationPage = await get('/projects/2');
    assert.deepEqual(titles(destinationPage), ['Destination existing', 'First']);
    assert.match(destinationPage, /aria-label="Complete First" checked/);
    assert.match(destinationPage, /id="task-priority-1"[^>]*>\s*<option>Low<\/option><option>Normal<\/option><option selected>High<\/option>/);
    assert.match(destinationPage, /id="task-due-date-1"[^>]*value="2000-02-29"/);
    assert.equal(summary(await get('/'), 'Source'), '1/1 completed');
    assert.equal(summary(await get('/'), 'Destination &amp; renamed'), '1/2 completed');
    assert.equal((await post('/projects/1/tasks/1/move', { destination: '3' })).status, 404);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get(sourcePath), remaining);
    assert.equal(await get('/projects/2'), destinationPage);
    await post('/projects/2/tasks', { title: 'Created after move' });
    assert.deepEqual(titles(await get('/projects/2')), ['Destination existing', 'First', 'Created after move']);
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(titles(await get('/projects/1')), ['First', 'Second']);
    await post('/projects/2/tasks/3/move', { destination: '1' });
    assert.deepEqual(titles(await get('/projects/1')), ['First', 'Second', 'Destination existing']);
    assert.match(await get('/projects/1'), /id="task-due-date-3"[^>]*value=""/);
    await post('/projects/1/archive');
    const archived = await get(sourcePath);
    assert.match(destinations(archived, 1), /name="destination" disabled/);
    assert.match(archived, /disabled>Move task/);
    assert.equal((await post('/projects/1/tasks/1/move', { destination: '2' })).status, 403);
    assert.equal((await post('/projects/2/tasks/4/move', { destination: '1' })).status, 400);
    assert.doesNotMatch(destinations(await get('/projects/2'), 4), /value="1"/);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get(sourcePath), archived);
    await post('/projects/1/restore');
    assert.doesNotMatch(destinations(await get(sourcePath), 1), /disabled/);
    await post('/projects/1/tasks/1/move', { destination: '3' });
    assert.deepEqual(titles(await get('/projects/3')), ['First']);
    assert.equal(summary(await get('/'), 'Source'), '1/2 completed');
    assert.equal(summary(await get('/'), 'Third'), '1/1 completed');
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('remembered positions migrate current order and survive reverse returns, new arrivals and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-return-order-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    // Task 011 positions may differ from task IDs because of previous moves.
    const legacy = new DatabaseSync(databasePath);
    try {
      legacy.exec(`
        CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
          archived INTEGER NOT NULL DEFAULT 0, default_task_priority TEXT NOT NULL DEFAULT 'Normal');
        CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
          completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal',
          due_date TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL);
        INSERT INTO projects (name) VALUES ('Home'), ('Away'), ('Third project');
        INSERT INTO tasks (project_id, title, position, completed, priority) VALUES
          (1, 'Third', 30, 1, 'Low'), (1, 'First', 10, 0, 'Normal'),
          (1, 'Second', 20, 0, 'Normal'), (2, 'Away existing', 1, 0, 'Normal'),
          (3, 'Visitor', 1, 0, 'Normal');
      `);
    } finally {
      legacy.close();
    }
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const titles = (html) => [...html.matchAll(/<span>(.*?)<\/span>/g)].map((match) => match[1]);
    const expectOrder = async (projectId, expected) => {
      assert.deepEqual(titles(await get(`/projects/${projectId}`)), expected);
    };
    const move = async (source, task, destination, state = {}) => {
      const response = await post(`/projects/${source}/tasks/${task}/move`, { ...state, destination });
      assert.equal(response.status, 303);
      return response;
    };
    await expectOrder(1, ['First', 'Second', 'Third']);
    for (const id of [2, 3, 1]) await move(1, id, 2);
    await expectOrder(1, []);
    await expectOrder(2, ['Away existing', 'First', 'Second', 'Third']);
    // Even an empty project retains reservations for all departed tasks.
    assert.equal((await post('/projects/1/tasks', { title: 'New at home' })).status, 303);
    await move(3, 5, 1);
    await expectOrder(1, ['New at home', 'Visitor']);
    await post('/projects/2/tasks/2/rename', { title: 'Updated first' });
    await post('/projects/2/tasks/2/priority', { priority: 'High' });
    await post('/projects/2/tasks/2', { completed: '1' });
    await post('/projects/2/tasks/2/due-date', { dueDate: '2028-02-29' });
    await post('/projects/1/rename', { name: 'Renamed home' });
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/archive');
    assert.equal((await post('/projects/2/tasks/2/move', { destination: '1' })).status, 400);
    assert.doesNotMatch(await get('/projects/2'), /<option value="1">/);
    assert.equal((await post('/projects/1/tasks/6/move', { destination: '2' })).status, 403);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    await post('/projects/1/restore');
    assert.match(await get('/projects/2'), /<option value="1">Renamed home<\/option>/);
    for (const id of [1, 3, 2]) await move(2, id, 1);
    await expectOrder(1, ['Updated first', 'Second', 'Third', 'New at home', 'Visitor']);
    await expectOrder(2, ['Away existing']);
    const home = await get('/projects/1');
    assert.match(home, /aria-label="Complete Updated first" checked/);
    assert.match(home, /id="task-priority-2"[^>]*>\s*<option>Low<\/option><option>Normal<\/option><option selected>High<\/option>/);
    assert.match(home, /id="task-due-date-2"[^>]*value="2028-02-29"/);
    assert.match(home, /id="task-due-date-1"[^>]*value=""/);
    assert.match(await get('/'), /data-testid="project-summary">2\/5 completed/);
    // Remembered positions are independent in a third project as well.
    const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2028-02-29', dueThrough: '2028-02-29' };
    const sourcePath = `/projects/1?${new URLSearchParams(state)}`;
    const response = await move(1, 2, 3, state);
    assert.equal(response.headers.get('location'), sourcePath);
    assert.deepEqual(titles(await get(sourcePath)), []);
    await move(1, 3, 3);
    await expectOrder(3, ['Updated first', 'Second']);
    await move(3, 3, 2);
    await move(3, 2, 2);
    // This must append after positions reserved by tasks that are away.
    await post('/projects/2/tasks', { title: 'Later arrival' });
    await move(1, 1, 2);
    await expectOrder(2, ['Away existing', 'Updated first', 'Second', 'Third', 'Later arrival']);
    await move(2, 3, 3);
    await move(2, 2, 3);
    await move(1, 5, 3);
    await expectOrder(3, ['Visitor', 'Updated first', 'Second']);
    const pages = await Promise.all([1, 2, 3].map((id) => get(`/projects/${id}`)));
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    for (const [index, page] of pages.entries()) assert.equal(await get(`/projects/${index + 1}`), page);
    for (const id of [3, 2, 5]) await move(3, id, 1);
    await move(2, 1, 1);
    await expectOrder(1, ['Updated first', 'Second', 'Third', 'New at home', 'Visitor']);
    await expectOrder(2, ['Away existing', 'Later arrival']);
    await expectOrder(3, []);
    assert.deepEqual(titles(await get(sourcePath)), ['Updated first']);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('search intersects all filters, survives edits and movement, resets on navigation and stays usable when archived', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-search-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const titles = (html) => [...html.matchAll(/<span>(.*?)<\/span>/g)].map((match) => match[1]);
    const names = (html) => [...html.matchAll(/class="project-name">(.*?)<\/span>/g)].map((match) => match[1]);
    const listPath = (filter, search) => `/?${new URLSearchParams({ filter, search })}`;
    for (const name of ['Alpha  Board', 'alpha Board', 'Other', 'ALPHA Archived']) await post('/projects', { name });
    await post('/projects/4/archive');
    await post('/projects/1/tasks', { title: 'Alpha first' });
    await post('/projects/1/tasks', { title: 'ALPHA  second' });
    await post('/projects/1/tasks', { title: 'Other task' });
    await post('/projects/1/tasks', { title: 'alpha outside range' });
    await post('/projects/1/tasks', { title: 'alpha open' });
    for (const id of [1, 2, 3, 4]) {
      await post(`/projects/1/tasks/${id}`, { completed: '1' });
      await post(`/projects/1/tasks/${id}/priority`, { priority: 'High' });
      await post(`/projects/1/tasks/${id}/due-date`, { dueDate: id === 4 ? '2026-03-01' : '2026-02-01' });
    }
    const unfilteredList = await get('/');
    assert.deepEqual(names(await get(listPath('Active', '  aLPHA  '))), ['Alpha  Board', 'alpha Board']);
    assert.deepEqual(names(await get(listPath('Active', 'alpha  b'))), ['Alpha  Board']);
    const archivedList = await get(listPath('Archived', 'AlPhA'));
    assert.deepEqual(names(archivedList), ['ALPHA Archived']);
    assert.match(archivedList, /name="search" value="AlPhA"/);
    assert.deepEqual(names(await get(listPath('Active', ' \t '))), names(unfilteredList));
    assert.match(await get(listPath('Active', 'alpha')), /data-testid="project-summary">4\/5 completed/);
    assert.match(await get('/'), /id="project-search"[^>]*value=""/);

    const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2026-02-01', dueThrough: '2026-02-28', search: 'aLPHa' };
    const path = `/projects/1?${new URLSearchParams(state)}`;
    const checkState = (html) => {
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.match(html, /<option selected>High<\/option>/);
      assert.match(html, /id="due-from"[^>]*value="2026-02-01"/);
      assert.match(html, /id="due-through"[^>]*value="2026-02-28"/);
      assert.match(html, /id="task-search"[^>]*value="aLPHa"/);
      // Every editing/filter form must submit the applied search and boundaries.
      for (const form of html.matchAll(/<form[^>]*>[\s\S]*?<\/form>/g)) {
        if (form[0].includes('>Projects</button>')) continue;
        assert.match(form[0], /name="search"[^>]*value="aLPHa"/);
        assert.match(form[0], /name="dueFrom" value="2026-02-01"/);
        assert.match(form[0], /name="dueThrough" value="2026-02-28"/);
      }
    };
    const initial = await get(path);
    assert.deepEqual(titles(initial), ['Alpha first', 'ALPHA  second']);
    checkState(initial);
    assert.deepEqual(titles(await get(`/projects/1?${new URLSearchParams({ ...state, search: 'alpha  ' })}`)), ['Alpha first', 'ALPHA  second']);
    assert.deepEqual(titles(await get(`/projects/1?${new URLSearchParams({ ...state, search: 'alpha  s' })}`)), ['ALPHA  second']);
    assert.deepEqual(titles(await get(`/projects/1?${new URLSearchParams({ ...state, search: '' })}`)), ['Alpha first', 'ALPHA  second', 'Other task']);
    assert.equal(await get('/'), unfilteredList);

    const edit = async (action, values) => {
      const response = await post(`/projects/1/${action}`, { ...state, ...values });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), path);
      const html = await get(path);
      checkState(html);
      return html;
    };
    for (const [action, values, alert] of [
      ['rename', { name: ' ' }, 'Project name is required'],
      ['tasks', { title: '' }, 'Task title is required'],
      ['tasks/1/rename', { title: '' }, 'Task title is required'],
      ['tasks/1/due-date', { dueDate: '2026-02-30' }, 'Due date must be a valid YYYY-MM-DD date'],
      ['due-range', { rangeFrom: 'bad' }, 'Due range must use valid YYYY-MM-DD dates'],
      ['tasks/1/move', { destination: '4' }, 'Choose an active destination project'],
    ]) {
      const response = await post(`/projects/1/${action}`, { ...state, ...values });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.ok(html.includes(`role="alert">${alert}`));
      assert.deepEqual(titles(html), ['Alpha first', 'ALPHA  second']);
      assert.match(html, /id="task-search"[^>]*value="aLPHa"/);
    }
    await edit('due-range', { rangeFrom: ' 2026-02-01 ', rangeThrough: '2026-02-28' });
    await edit('rename', { name: 'Renamed project' });
    await edit('default-priority', { priority: 'Low' });
    assert.deepEqual(titles(await edit('tasks', { title: 'Alpha new' })), ['Alpha first', 'ALPHA  second']);
    assert.deepEqual(titles(await edit('tasks/1/rename', { title: 'Different title' })), ['ALPHA  second']);
    await edit('tasks/1/rename', { title: 'Alpha renamed' });
    assert.deepEqual(titles(await edit('tasks/1/priority', { priority: 'Low' })), ['ALPHA  second']);
    await edit('tasks/1/priority', { priority: 'High' });
    assert.deepEqual(titles(await edit('tasks/1', { completed: '0' })), ['ALPHA  second']);
    await edit('tasks/1', { completed: '1' });
    assert.deepEqual(titles(await edit('tasks/1/due-date', { dueDate: '' })), ['ALPHA  second']);
    await edit('tasks/1/due-date', { dueDate: '2026-02-01' });
    assert.deepEqual(titles(await edit('tasks/1/move', { destination: '2' })), ['ALPHA  second']);
    assert.deepEqual(titles(await get('/projects/2?search=alpha')), ['Alpha renamed']);
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(titles(await get(path)), ['Alpha renamed', 'ALPHA  second']);
    const saved = await get(path);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get(path), saved);
    const reopened = await get('/projects/1');
    assert.match(reopened, /id="task-search"[^>]*value=""/);
    assert.match(reopened, /id="due-from"[^>]*value=""/);
    assert.equal(titles(reopened).length, 6);
    assert.match(saved, /action="\/"[^>]*><button type="submit">Projects/);
    await post('/projects/1/archive');
    const archived = await get(path);
    assert.deepEqual(titles(archived), ['Alpha renamed', 'ALPHA  second']);
    checkState(archived);
    assert.doesNotMatch(archived.match(/<input id="task-search"[^>]*>/)[0], /disabled/);
    assert.match(archived, /disabled>Rename task/);
    assert.deepEqual(titles(await get(`/projects/1?${new URLSearchParams({ ...state, search: 'second' })}`)), ['ALPHA  second']);
    assert.equal((await post('/projects/1/tasks/1/rename', { ...state, title: 'Forbidden' })).status, 403);
    await post('/projects/1/restore');
    assert.equal(await get(path), saved);
    assert.match(await get('/health'), /"status":"ok"/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
