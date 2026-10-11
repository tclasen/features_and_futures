import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('project defaults migrate, affect only subsequent tasks, and persist independently through restore', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-defaults-'));
  const dbPath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
    INSERT INTO projects (name) VALUES ('Existing');
    INSERT INTO tasks (project_id, title, completed, priority) VALUES (1, 'Existing task', 1, 'Low');`);
  legacy.close();
  let server;
  try {
    server = await start(dbPath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.url}${path}`)).text();
    const select = (page, id) => page.match(new RegExp(`<select id="${id}"[^>]*>[\\s\\S]*?</select>`))[0];
    const rows = page => [...page.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    const priorities = page => rows(page).map(row => row.match(/<option selected>([^<]+)<\/option>/)[1]);
    const assertDefault = (page, value, disabled = false) => {
      const control = select(page, 'default-task-priority');
      assert.match(page, /<label for="default-task-priority">Default task priority<\/label>/);
      assert.deepEqual([...control.matchAll(/<option(?: selected)?>([^<]+)<\/option>/g)]
        .map(match => match[1]), ['Low', 'Normal', 'High']);
      assert.match(control, new RegExp(`<option selected>${value}</option>`));
      assert.equal(control.includes(' disabled'), disabled);
    };
    await post('/projects', { name: 'Second' });
    assertDefault(await html('/projects/1'), 'Normal');
    assertDefault(await html('/projects/2'), 'Normal');
    await post('/projects/1/tasks', { title: 'Normal inherited' });
    const selected = { filter: 'Completed', priorityFilter: 'Low' };
    const path = '/projects/1?filter=Completed&priorityFilter=Low';
    const beforeRows = rows(await html(path));
    const beforeSummary = await html('/');
    const response = await post('/projects/1/default-priority', { ...selected, priority: 'High' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), path);
    const changed = await html(path);
    assertDefault(changed, 'High');
    assert.match(select(changed, 'task-filter'), /<option selected>Completed<\/option>/);
    assert.match(select(changed, 'priority-filter'), /<option selected>Low<\/option>/);
    assert.deepEqual(rows(changed), beforeRows);
    assert.equal(await html('/'), beforeSummary);
    assertDefault(await html('/projects/2'), 'Normal');
    const form = changed.match(/<form method="post" action="\/projects\/1\/default-priority">[\s\S]*?<\/form>/)[0];
    assert.match(form, /name="filter" value="Completed"/);
    assert.match(form, /name="priorityFilter" value="Low"/);
    assert.match(form, /onchange="this.form.requestSubmit\(\)"/);
    assert.equal((await post('/projects/1/default-priority', { priority: 'Invalid' })).status, 400);
    assertDefault(await html('/projects/1'), 'High');
    await post('/projects/1/tasks', { title: 'High inherited' });
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Low inherited' });
    await post('/projects/2/tasks', { title: 'Other task' });
    assert.deepEqual(priorities(await html('/projects/1')), ['Low', 'Normal', 'High', 'Low']);
    assert.deepEqual(priorities(await html('/projects/2')), ['Normal']);
    await post('/projects/1/rename', { name: 'Renamed project' });
    await post('/projects/1/tasks/3/rename', { title: 'Renamed high task' });
    assertDefault(await html('/projects/1'), 'Low');
    const beforeArchive = await html('/projects/1');
    await post('/projects/1/archive');
    const archived = await html(path);
    assertDefault(archived, 'Low', true);
    assert.deepEqual(rows(archived).map(row => row.match(/<span>([^<]+)<\/span>/)[1]), ['Existing task']);
    assert.doesNotMatch(select(archived, 'task-filter'), /disabled/);
    assert.doesNotMatch(select(archived, 'priority-filter'), /disabled/);
    assert.equal((await post('/projects/1/default-priority', { priority: 'Normal' })).status, 403);
    assert.equal(await html(path), archived);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.equal(await html(path), archived);
    assertDefault(await html('/projects/2'), 'Normal');
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), beforeArchive);
    await post('/projects/1/tasks', { title: 'After restore' });
    assert.deepEqual(priorities(await html('/projects/1')), ['Low', 'Normal', 'High', 'Low', 'Low']);
    const finalPage = await html('/projects/1');
    assert.match(await html('/'), /data-testid="project-summary">1\/5 completed/);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.equal(await html('/projects/1'), finalPage);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task priorities migrate, remain independent, preserve task data, and survive archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  const dbPath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('First');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing task', 1);`);
  legacy.close();
  let server;
  try {
    server = await start(dbPath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.url}${path}`)).text();
    const rows = page => [...page.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    const prioritySelect = row => row.match(/<select id="task-priority-\d+"[^>]*>[\s\S]*?<\/select>/)[0];
    const options = row => [...prioritySelect(row).matchAll(/<option( selected)?>([^<]+)<\/option>/g)]
      .map(match => ({ title: match[2], selected: Boolean(match[1]) }));
    const savedPriorities = page => rows(page).map(row => options(row).find(option => option.selected).title);
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'New task' });
    await post('/projects/2/tasks', { title: 'Other task' });
    const original = await html('/projects/1');
    const other = await html('/projects/2');
    const summary = await html('/');
    assert.deepEqual(savedPriorities(original), ['Normal', 'Normal']);
    assert.deepEqual(savedPriorities(other), ['Normal']);
    for (const [index, row] of rows(original).entries()) {
      assert.match(row, new RegExp(`<label for="task-priority-${index + 1}">Task priority</label>`));
      assert.match(prioritySelect(row), /onchange="this.form.requestSubmit\(\)"/);
      assert.deepEqual(options(row).map(option => option.title), ['Low', 'Normal', 'High']);
    }
    const changed = await post('/projects/1/tasks/1/priority', { priority: 'High', filter: 'Completed' });
    assert.equal(changed.status, 303);
    assert.equal(changed.headers.get('location'), '/projects/1?filter=Completed');
    assert.deepEqual(savedPriorities(await html('/projects/1')), ['High', 'Normal']);
    assert.equal((await post('/projects/1/tasks/2/priority', { priority: 'Low', filter: 'Open' })).status, 303);
    assert.deepEqual(savedPriorities(await html('/projects/1')), ['High', 'Low']);
    // Only the priority controls may differ: titles, completion, ownership, order,
    // rename controls, and project summaries must be preserved.
    const withoutPriority = page => rows(page).map(row => row.replace(/<option selected>/g, '<option>'));
    assert.deepEqual(withoutPriority(await html('/projects/1')), withoutPriority(original));
    assert.equal(await html('/projects/2'), other);
    assert.equal(await html('/'), summary);
    assert.deepEqual(savedPriorities(await html('/projects/1?filter=Completed')), ['High']);
    assert.deepEqual(savedPriorities(await html('/projects/1?filter=Open')), ['Low']);
    const prioritized = await html('/projects/1');
    for (const priority of ['', 'Urgent', 'high']) {
      assert.equal((await post('/projects/1/tasks/1/priority', { priority })).status, 400);
    }
    assert.equal((await post('/projects/2/tasks/1/priority', { priority: 'Low' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999999/priority', { priority: 'High' })).status, 404);
    assert.equal(await html('/projects/1'), prioritized);
    await post('/projects/1/tasks/1/rename', { title: 'Renamed task' });
    assert.deepEqual(savedPriorities(await html('/projects/1')), ['High', 'Low']);
    assert.match(rows(await html('/projects/1'))[0], /aria-label="Complete Renamed task" checked/);
    const renamed = await html('/projects/1');
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.equal(await html('/projects/1'), renamed);
    assert.equal(await html('/projects/2'), other);
    assert.equal(await html('/'), summary);
    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    for (const row of rows(archived)) assert.match(prioritySelect(row), / disabled/);
    assert.deepEqual(savedPriorities(archived), ['High', 'Low']);
    assert.deepEqual(savedPriorities(await html('/projects/1?filter=Completed')), ['High']);
    assert.deepEqual(savedPriorities(await html('/projects/1?filter=Open')), ['Low']);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Normal' })).status, 403);
    assert.equal(await html('/projects/1'), archived);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.equal(await html('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), renamed);
    assert.equal(await html('/'), summary);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Normal' })).status, 303);
    assert.deepEqual(savedPriorities(await html('/projects/1')), ['Normal', 'Low']);
    await post('/projects/1/tasks/2', { completed: '1' });
    assert.deepEqual(savedPriorities(await html('/projects/1?filter=Completed')), ['Normal', 'Low']);
    const finalPage = await html('/projects/1');
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.equal(await html('/projects/1'), finalPage);
    assert.equal(await html('/projects/2'), other);
    assert.match(await html('/'), /data-testid="project-summary">2\/2 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task renaming preserves ownership, order, completion, filters, and summaries across restore and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.url}${path}`)).text();
    const rows = page => [...page.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Open task' });
    await post('/projects/1/tasks', { title: 'Done task' });
    await post('/projects/2/tasks', { title: 'Other task' });
    await post('/projects/1/tasks/2', { completed: '1' });
    const original = await html('/projects/1');
    const other = await html('/projects/2');
    const summary = await html('/');
    for (const [index, row] of rows(original).entries()) {
      assert.match(row, new RegExp(`<label for="new-task-title-${index + 1}">New task title</label>`));
      assert.match(row, /<button type="submit">Rename task<\/button>/);
    }
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks/2/rename', { title, filter: 'Completed' });
      assert.equal(response.status, 400);
      const page = await response.text();
      assert.match(page, /role="alert">Task title is required/);
      assert.match(page, /<option selected>Completed<\/option>/);
      assert.equal(rows(page).length, 1);
      assert.match(rows(page)[0], /aria-label="Complete Done task" checked/);
      assert.equal(await html('/projects/1'), original);
    }
    assert.equal((await post('/projects/2/tasks/1/rename', { title: 'Wrong owner' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999999/rename', { title: 'Missing' })).status, 404);
    assert.equal((await post('/projects/999999/tasks/1/rename', { title: 'Missing' })).status, 404);
    assert.equal(await html('/projects/1'), original);
    assert.equal(await html('/projects/2'), other);

    const renamed = await post('/projects/1/tasks/2/rename', {
      title: '  Done <renamed> & "notes"  ', filter: 'Completed',
    });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const completed = rows(await html('/projects/1?filter=Completed'));
    assert.equal(completed.length, 1);
    assert.match(completed[0], /<span>Done &lt;renamed&gt; &amp; &quot;notes&quot;<\/span>/);
    assert.match(completed[0], /aria-label="Complete Done &lt;renamed&gt; &amp; &quot;notes&quot;" checked/);
    assert.match(completed[0], /value="Done &lt;renamed&gt; &amp; &quot;notes&quot;"/);
    assert.equal(rows(await html('/projects/1?filter=Open')).length, 1);
    const openRename = await post('/projects/1/tasks/1/rename', { title: '  Open renamed  ', filter: 'Open' });
    assert.equal(openRename.status, 303);
    assert.equal(openRename.headers.get('location'), '/projects/1?filter=Open');
    const openRows = rows(await html('/projects/1?filter=Open'));
    assert.equal(openRows.length, 1);
    assert.match(openRows[0], /aria-label="Complete Open renamed"/);
    assert.doesNotMatch(openRows[0], / checked/);
    const renamedPage = await html('/projects/1');
    const renamedRows = rows(renamedPage);
    assert.equal(renamedRows.length, 2);
    assert.match(renamedRows[0], /action="\/projects\/1\/tasks\/1"/);
    assert.match(renamedRows[0], /<span>Open renamed<\/span>/);
    assert.match(renamedRows[1], /action="\/projects\/1\/tasks\/2"/);
    assert.equal(await html('/'), summary);
    assert.equal(await html('/projects/2'), other);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.equal(await html('/projects/1'), renamedPage);
    assert.equal(await html('/'), summary);
    assert.equal(await html('/projects/2'), other);

    await post('/projects/1/archive');
    const archivedPage = await html('/projects/1');
    for (const row of rows(archivedPage)) {
      assert.match(row, /id="new-task-title-\d+"[^>]* disabled/);
      assert.match(row, /<button type="submit" disabled>Rename task<\/button>/);
    }
    assert.equal(rows(await html('/projects/1?filter=Open')).length, 1);
    assert.equal(rows(await html('/projects/1?filter=Completed')).length, 1);
    for (const id of [1, 2]) {
      assert.equal((await post(`/projects/1/tasks/${id}/rename`, { title: 'Blocked' })).status, 403);
    }
    assert.equal(await html('/projects/1'), archivedPage);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.equal(await html('/projects/1'), archivedPage);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), renamedPage);
    assert.equal(await html('/'), summary);
    assert.equal((await post('/projects/1/tasks/2/rename', { title: '  Restored task  ' })).status, 303);
    assert.match(rows(await html('/projects/1'))[1], /aria-label="Complete Restored task" checked/);
    await post('/projects/1/tasks/2');
    assert.equal(rows(await html('/projects/1?filter=Completed')).length, 0);
    assert.equal(rows(await html('/projects/1?filter=Open')).length, 2);
    assert.match(await html('/'), /data-testid="project-summary">0\/2 completed/);
    const finalPage = await html('/projects/1');
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.equal(await html('/projects/1'), finalPage);
    assert.equal(await html('/projects/2'), other);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('rename preserves project identity, order, tasks, summaries, and archive protection across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.url}${path}`)).text();
    const rows = page => [...page.matchAll(/<li data-testid="project-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    const tasks = page => [...page.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Open task' });
    await post('/projects/1/tasks', { title: 'Done task' });
    await post('/projects/1/tasks/2', { completed: '1' });
    const originalPage = await html('/projects/1');
    assert.match(originalPage, /<label for="new-project-name">New project name<\/label>/);
    assert.match(originalPage, /<button type="submit">Rename project<\/button>/);
    for (const name of ['', ' \t\n ']) {
      const response = await post('/projects/1/rename', { name, filter: 'Completed' });
      assert.equal(response.status, 400);
      const page = await response.text();
      assert.match(page, /role="alert">Project name is required/);
      assert.match(page, /<h1>Original<\/h1>/);
      assert.match(page, /<option selected>Completed<\/option>/);
      assert.equal(tasks(page).length, 1);
      assert.equal(await html('/projects/1'), originalPage);
    }
    const response = await post('/projects/1/rename', { name: '  Renamed <project> & "notes"  ', filter: 'Open' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1?filter=Open');
    const renamedPage = await html('/projects/1');
    assert.match(renamedPage, /<h1>Renamed &lt;project&gt; &amp; &quot;notes&quot;<\/h1>/);
    assert.match(renamedPage, /value="Renamed &lt;project&gt; &amp; &quot;notes&quot;"/);
    assert.deepEqual(tasks(renamedPage), tasks(originalPage));
    const renamedList = await html('/');
    const renamedRows = rows(renamedList);
    assert.equal(renamedRows.length, 2);
    assert.match(renamedRows[0], /<span>Renamed &lt;project&gt; &amp; &quot;notes&quot;<\/span>/);
    assert.match(renamedRows[0], /action="\/projects\/1"/);
    assert.match(renamedRows[0], /data-testid="project-summary">1\/2 completed/);
    assert.match(renamedRows[1], /<span>Second<\/span>/);
    assert.match(await html('/projects/2'), /<h1>Second<\/h1>/);
    assert.equal((await post('/projects/999999/rename', { name: 'Missing' })).status, 404);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.equal(await html('/projects/1'), renamedPage);
    assert.equal(await html('/'), renamedList);

    await post('/projects/1/archive');
    const archivedPage = await html('/projects/1');
    assert.match(archivedPage, /id="new-project-name"[^>]* disabled/);
    assert.match(archivedPage, /<button type="submit" disabled>Rename project<\/button>/);
    assert.equal((await post('/projects/1/rename', { name: 'Blocked' })).status, 403);
    assert.equal(await html('/projects/1'), archivedPage);
    assert.match(rows(await html('/?filter=Archived'))[0], /Renamed &lt;project&gt;/);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.equal(await html('/projects/1'), archivedPage);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), renamedPage);
    assert.equal((await post('/projects/1/rename', { name: '  Restored name  ' })).headers.get('location'), '/projects/1');
    const restoredPage = await html('/projects/1');
    assert.match(restoredPage, /<h1>Restored name<\/h1>/);
    assert.deepEqual(tasks(restoredPage), tasks(originalPage));
    assert.match(rows(await html('/'))[0], /data-testid="project-summary">1\/2 completed/);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.equal(await html('/projects/1'), restoredPage);
    assert.match(rows(await html('/'))[0], /<span>Restored name<\/span>/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const port = await new Promise((resolve, reject) => {
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(match[1]);
    });
    child.on('error', reject);
    child.on('exit', code => reject(new Error(`Server exited: ${code}`)));
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

test('project creation, validation, navigation, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const dbPath = join(directory, 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const initial = await (await fetch(server.url)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);

    const create = name => fetch(`${server.url}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    for (const name of ['', '  \t  ']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    for (const name of ['  First project  ', 'Second <project>']) {
      const response = await create(name);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    const list = await (await fetch(server.url)).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(list, /<span>First project<\/span>/);
    assert.ok(list.indexOf('First project') < list.indexOf('Second &lt;project&gt;'));
    const paths = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    const detail = await (await fetch(`${server.url}${paths[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*>Projects<\/button>/);
    assert.equal((await fetch(`${server.url}/projects/999999`)).status, 404);

    await server.stop();
    server = await start(dbPath);
    assert.equal(await (await fetch(server.url)).text(), list);
    assert.match(await (await fetch(`${server.url}${paths[0]}`)).text(), /<h1>First project<\/h1>/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('legacy projects migrate, archive read-only, restore, and retain summaries across restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const dbPath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)));
    INSERT INTO projects (name) VALUES ('Existing project');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing task', 1);`);
  legacy.close();
  let server;
  try {
    server = await start(dbPath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.url}${path}`)).text();
    const projectRows = page => [...page.matchAll(/<li data-testid="project-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    const taskRows = page => [...page.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    const initial = await html('/');
    assert.match(initial, /<label for="project-filter">Project filter<\/label>/);
    assert.match(initial, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(projectRows(initial)[0], /data-testid="project-summary">1\/1 completed/);
    assert.match(projectRows(initial)[0], />Open project<\/button>/);
    assert.match(projectRows(initial)[0], />Archive project<\/button>/);
    await post('/projects', { name: 'New project' });
    assert.match(projectRows(await html('/'))[1], /data-testid="project-summary">0\/0 completed/);
    await post('/projects/1/tasks', { title: 'Open task' });
    assert.match(projectRows(await html('/'))[0], /data-testid="project-summary">1\/2 completed/);
    await html('/projects/1?filter=Completed');
    assert.match(projectRows(await html('/'))[0], /data-testid="project-summary">1\/2 completed/);

    const archive = await post('/projects/1/archive');
    assert.equal(archive.status, 303);
    assert.equal(archive.headers.get('location'), '/');
    assert.equal(projectRows(await html('/')).length, 1);
    assert.doesNotMatch(await html('/'), /Existing project/);
    const archivedList = await html('/?filter=Archived');
    assert.equal(projectRows(archivedList).length, 1);
    assert.match(archivedList, /<option selected>Archived<\/option>/);
    assert.match(archivedList, />Restore project<\/button>/);
    assert.match(archivedList, />Open project<\/button>/);
    assert.doesNotMatch(archivedList, />Archive project<\/button>/);
    assert.match(archivedList, /data-testid="project-summary">1\/2 completed/);
    const archivedPage = await html('/projects/1');
    assert.match(archivedPage, /<p>Archived project<\/p>/);
    assert.match(archivedPage, /<button type="submit" disabled>Create task<\/button>/);
    assert.equal(taskRows(archivedPage).length, 2);
    for (const row of taskRows(archivedPage)) {
      assert.match(row, /type="checkbox"[\s\S]*?disabled/);
    }
    assert.equal(taskRows(await html('/projects/1?filter=Open')).length, 1);
    assert.equal(taskRows(await html('/projects/1?filter=Completed')).length, 1);
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked task' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1', {})).status, 403);
    assert.equal((await post('/projects/1/tasks/2', { completed: '1' })).status, 403);
    assert.equal(await html('/projects/1'), archivedPage);

    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.equal(await html('/?filter=Archived'), archivedList);
    assert.equal(await html('/projects/1'), archivedPage);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.equal(projectRows(await html('/?filter=Archived')).length, 0);
    const restoredRows = projectRows(await html('/'));
    assert.equal(restoredRows.length, 2);
    assert.match(restoredRows[0], /Existing project/);
    assert.match(restoredRows[0], /data-testid="project-summary">1\/2 completed/);
    const restoredPage = await html('/projects/1');
    assert.doesNotMatch(restoredPage, /Archived project| disabled/);
    assert.match(taskRows(restoredPage)[0], / checked/);
    assert.doesNotMatch(taskRows(restoredPage)[1], / checked/);
    assert.equal((await post('/projects/1/tasks/2', { completed: '1' })).status, 303);
    assert.match(projectRows(await html('/'))[0], /data-testid="project-summary">2\/2 completed/);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.equal(projectRows(await html('/?filter=Archived')).length, 0);
    assert.match(projectRows(await html('/'))[0], /data-testid="project-summary">2\/2 completed/);
    assert.equal((await post('/projects/999999/archive')).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project tasks validate, filter, toggle, stay isolated, and persist after restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  let server;
  try {
    const dbPath = join(directory, 'workboard.sqlite');
    server = await start(dbPath);
    const post = (path, values) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.url}${path}`)).text();
    const rows = page => [...page.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const paths = [...(await html('/')).matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    const [first, second] = paths;
    const initial = await html(first);
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, />Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    assert.equal(rows(initial).length, 0);
    for (const title of ['', ' \t\n ']) {
      const response = await post(`${first}/tasks`, { title });
      assert.equal(response.status, 400);
      const page = await response.text();
      assert.match(page, /role="alert">Task title is required/);
      assert.equal(rows(page).length, 0);
    }
    for (const title of ['  Plan launch  ', 'Review <draft> & "notes"']) {
      const response = await post(`${first}/tasks`, { title });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), first);
    }
    await post(`${second}/tasks`, { title: 'Other project task' });
    const created = await html(first);
    const createdRows = rows(created);
    assert.equal(createdRows.length, 2);
    assert.match(createdRows[0], /<span>Plan launch<\/span>/);
    assert.match(createdRows[0], /aria-label="Complete Plan launch"/);
    assert.match(createdRows[1], /aria-label="Complete Review &lt;draft&gt; &amp; &quot;notes&quot;"/);
    assert.doesNotMatch(created, / checked|Other project task/);
    const taskPath = createdRows[0].match(/action="([^"]+)"/)[1];
    const secondTaskPath = createdRows[1].match(/action="([^"]+)"/)[1];
    assert.equal(rows(await html(`${first}?filter=Open`)).length, 2);
    assert.equal(rows(await html(`${first}?filter=Completed`)).length, 0);

    assert.equal((await post(taskPath, { completed: '1' })).status, 303);
    assert.match(rows(await html(first))[0], /aria-label="Complete Plan launch" checked/);
    const openRows = rows(await html(`${first}?filter=Open`));
    assert.equal(openRows.length, 1);
    assert.match(openRows[0], /Review &lt;draft&gt;/);
    const completedPage = await html(`${first}?filter=Completed`);
    assert.match(completedPage, /<option selected>Completed<\/option>/);
    assert.equal(rows(completedPage).length, 1);
    assert.match(rows(completedPage)[0], /Plan launch/);

    const invalid = await post(`${first}/tasks`, { title: ' ', filter: 'Completed' });
    assert.equal(invalid.status, 400);
    assert.equal(rows(await invalid.text()).length, 1);
    const reopened = await post(taskPath, { filter: 'Completed' });
    assert.equal(reopened.headers.get('location'), `${first}?filter=Completed`);
    assert.equal(rows(await html(`${first}?filter=Completed`)).length, 0);
    assert.doesNotMatch(rows(await html(first))[0], / checked/);

    const wrongProjectPath = taskPath.replace(first, second);
    assert.equal((await post(wrongProjectPath, { completed: '1' })).status, 404);
    assert.doesNotMatch(rows(await html(first))[0], / checked/);
    assert.equal(rows(await html(second)).length, 1);
    assert.doesNotMatch(await html(second), /Plan launch|Review &lt;draft&gt;/);
    assert.equal((await post('/projects/999999/tasks', { title: 'Missing' })).status, 404);
    assert.equal((await post(`${first}/tasks/999999`, { completed: '1' })).status, 404);

    await post(secondTaskPath, { completed: '1' });
    const beforeRestart = await html(first);
    const otherBeforeRestart = await html(second);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.equal(await html(first), beforeRestart);
    assert.equal(await html(second), otherBeforeRestart);
    assert.equal(rows(await html(`${first}?filter=Open`)).length, 1);
    assert.equal(rows(await html(`${first}?filter=Completed`)).length, 1);
    assert.match(await html('/'), /<span>First<\/span>/);
    assert.deepEqual(await (await fetch(`${server.url}/health`)).json(), { status: 'ok' });
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('combined filters retain selections, re-evaluate edits, and work through archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-filters-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.url}${path}`)).text();
    const rows = page => [...page.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    const titles = page => rows(page).map(row => row.match(/<span>([^<]+)<\/span>/)[1]);
    const select = (page, id) => page.match(new RegExp(`<select id="${id}"[^>]*>[\\s\\S]*?<\\/select>`))[0];
    const assertFilters = (page, completion, priority) => {
      assert.match(select(page, 'task-filter'), new RegExp(`<option selected>${completion}</option>`));
      assert.match(select(page, 'priority-filter'), new RegExp(`<option selected>${priority}</option>`));
      assert.doesNotMatch(select(page, 'task-filter'), /disabled/);
      assert.doesNotMatch(select(page, 'priority-filter'), /disabled/);
    };
    await post('/projects', { name: 'Filters' });
    const tasks = [];
    for (const priority of ['Low', 'Normal', 'High']) {
      for (const completed of [false, true]) {
        const id = tasks.length + 1;
        const title = `${priority} ${completed ? 'done' : 'open'}`;
        await post('/projects/1/tasks', { title });
        await post(`/projects/1/tasks/${id}/priority`, { priority });
        if (completed) await post(`/projects/1/tasks/${id}`, { completed: '1' });
        tasks.push({ title, priority, completed });
      }
    }
    const initial = await html('/projects/1');
    assertFilters(initial, 'All', 'All');
    assert.match(initial, /<label for="priority-filter">Priority filter<\/label>/);
    assert.deepEqual([...select(initial, 'priority-filter').matchAll(/<option(?: selected)?>([^<]+)<\/option>/g)]
      .map(match => match[1]), ['All', 'Low', 'Normal', 'High']);
    // Both selectors share a GET form, so changing either submits the other value too.
    const filterForm = [...initial.matchAll(/<form class="filter"[\s\S]*?<\/form>/g)]
      .map(match => match[0]).find(form => form.includes('id="task-filter"'));
    assert.match(filterForm, /method="get"/);
    assert.match(filterForm, /name="filter" onchange="this.form.requestSubmit\(\)"/);
    assert.match(filterForm, /name="priorityFilter" onchange="this.form.requestSubmit\(\)"/);
    const originalList = await html('/');
    for (const completion of ['All', 'Open', 'Completed']) {
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        const page = await html(`/projects/1?filter=${completion}&priorityFilter=${priority}`);
        assertFilters(page, completion, priority);
        assert.deepEqual(titles(page), tasks.filter(task =>
          (completion === 'All' || task.completed === (completion === 'Completed')) &&
          (priority === 'All' || task.priority === priority)).map(task => task.title));
      }
    }
    assert.equal(await html('/'), originalList);
    assert.equal(await html('/projects/1'), initial);

    const selected = { filter: 'Open', priorityFilter: 'High' };
    const path = '/projects/1?filter=Open&priorityFilter=High';
    const page = await html(path);
    for (const form of page.matchAll(/<form[^>]*method="post"[\s\S]*?<\/form>/g)) {
      assert.match(form[0], /name="filter" value="Open"/);
      assert.match(form[0], /name="priorityFilter" value="High"/);
    }
    for (const [endpoint, values] of [
      ['/projects/1/tasks/5/rename', { title: ' ' }],
      ['/projects/1/tasks', { title: ' ' }],
      ['/projects/1/rename', { name: ' ' }],
      ['/projects/1/tasks/5/priority', { priority: 'Invalid' }],
    ]) {
      const response = await post(endpoint, { ...selected, ...values });
      assert.equal(response.status, 400);
      const errorPage = await response.text();
      assertFilters(errorPage, 'Open', 'High');
      assert.deepEqual(titles(errorPage), ['High open']);
    }
    const renamed = await post('/projects/1/tasks/5/rename', { ...selected, title: '  Renamed high  ' });
    assert.equal(renamed.headers.get('location'), path);
    const renamedPage = await html(path);
    assertFilters(renamedPage, 'Open', 'High');
    assert.deepEqual(titles(renamedPage), ['Renamed high']);
    assert.match(renamedPage, /aria-label="Complete Renamed high"/);
    assert.equal(await html('/'), originalList);

    const priorityChanged = await post('/projects/1/tasks/5/priority', { ...selected, priority: 'Low' });
    assert.equal(priorityChanged.headers.get('location'), path);
    assertFilters(await html(path), 'Open', 'High');
    assert.deepEqual(titles(await html(path)), []);
    assert.deepEqual(titles(await html('/projects/1?filter=Open&priorityFilter=Low')), ['Low open', 'Renamed high']);
    assert.equal(await html('/'), originalList);
    const completedChanged = await post('/projects/1/tasks/1', { filter: 'Open', priorityFilter: 'Low', completed: '1' });
    assert.equal(completedChanged.headers.get('location'), '/projects/1?filter=Open&priorityFilter=Low');
    assert.deepEqual(titles(await html(completedChanged.headers.get('location'))), ['Renamed high']);
    const reopened = await post('/projects/1/tasks/2', { filter: 'Completed', priorityFilter: 'Low' });
    assert.equal(reopened.headers.get('location'), '/projects/1?filter=Completed&priorityFilter=Low');
    assert.deepEqual(titles(await html(reopened.headers.get('location'))), ['Low open']);
    assert.equal(await html('/'), originalList);

    const beforeRestart = await html('/projects/1');
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.equal(await html('/projects/1'), beforeRestart);
    assert.equal(await html('/'), originalList);
    await post('/projects/1/archive');
    const archivedPath = '/projects/1?filter=Open&priorityFilter=Low';
    const archivedPage = await html(archivedPath);
    assertFilters(archivedPage, 'Open', 'Low');
    assert.deepEqual(titles(archivedPage), ['Low done', 'Renamed high']);
    for (const row of rows(archivedPage)) {
      assert.match(row, /type="checkbox"[^>]*disabled/);
      assert.match(row, /name="title"[^>]*disabled/);
      assert.match(row, /disabled>Rename task/);
      assert.match(row, /name="priority"[^>]*disabled/);
    }
    assert.deepEqual(titles(await html('/projects/1?filter=Completed&priorityFilter=High')), ['High done']);
    const blocked = await post('/projects/1/tasks/5/priority', { filter: 'Open', priorityFilter: 'Low', priority: 'High' });
    assert.equal(blocked.status, 403);
    assertFilters(await blocked.text(), 'Open', 'Low');
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.equal(await html(archivedPath), archivedPage);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), beforeRestart);
    assert.equal(await html('/'), originalList);
    const projectList = await html('/');
    const openPath = projectList.match(/action="(\/projects\/1)"/)[1];
    assertFilters(await html(openPath), 'All', 'All');
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('due dates migrate, validate calendar days, preserve task data, and survive archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-due-dates-'));
  const dbPath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0, default_task_priority TEXT NOT NULL DEFAULT 'Normal');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
    INSERT INTO projects (name) VALUES ('Existing'), ('Other');
    INSERT INTO tasks (project_id, title, completed, priority) VALUES (1, 'Existing task', 1, 'High');`);
  legacy.close();
  let server;
  try {
    server = await start(dbPath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.url}${path}`)).text();
    const rows = page => [...page.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    const dateInput = (page, id) => page.match(new RegExp(`<input id="task-due-date-${id}"[^>]*>`))[0];
    const selected = { filter: 'Completed', priorityFilter: 'High' };
    const path = '/projects/1?filter=Completed&priorityFilter=High';
    const endpoint = '/projects/1/tasks/1/due-date';
    const assertFilters = page => {
      assert.match(page, /<option selected>Completed<\/option>/);
      assert.match(page, /<option selected>High<\/option>/);
      assert.equal(rows(page).length, 1);
    };
    await post('/projects/1/tasks', { title: 'New task' });
    await post('/projects/2/tasks', { title: 'Other task' });
    const initial = await html('/projects/1');
    for (const id of [1, 2]) {
      assert.match(initial, new RegExp(`<label for="task-due-date-${id}">Task due date</label>`));
      assert.match(dateInput(initial, id), /type="text" value=""/);
    }
    assert.equal((initial.match(/>Save due date<\/button>/g) || []).length, 2);
    const summary = await html('/');
    const other = await html('/projects/2');
    const unchangedRow = rows(initial)[1];
    const form = rows(await html(path))[0].match(/<form[^>]*action="[^"]*\/due-date">[\s\S]*?<\/form>/)[0];
    assert.match(form, /name="filter" value="Completed"/);
    assert.match(form, /name="priorityFilter" value="High"/);

    for (const date of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '1900-02-28', '2026-04-30']) {
      const response = await post(endpoint, { ...selected, dueDate: ` \t${date}\n ` });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), path);
      const page = await html(path);
      assertFilters(page);
      assert.match(dateInput(page, 1), new RegExp(`value="${date}"`));
      assert.match(rows(page)[0], /aria-label="Complete Existing task" checked/);
    }
    const saved = await html(path);
    for (const date of ['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2025-02-29',
      '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '2026-01-32',
      '2026-1-01', '26-01-01', '2026-01-01T00:00:00Z', '2026-01-01 extra', '<invalid>']) {
      const response = await post(endpoint, { ...selected, dueDate: date });
      assert.equal(response.status, 400, date);
      const page = await response.text();
      assert.match(page, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      assertFilters(page);
      assert.match(dateInput(page, 1), /value="2026-04-30"/);
      assert.equal(await html(path), saved);
    }
    assert.equal(rows(await html('/projects/1'))[1], unchangedRow);
    assert.equal(await html('/projects/2'), other);
    assert.equal(await html('/'), summary);
    assert.equal((await post('/projects/2/tasks/1/due-date', { dueDate: '2026-01-01' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999999/due-date', { dueDate: '2026-01-01' })).status, 404);
    assert.equal(await html(path), saved);

    for (const value of ['', ' \t\n ']) {
      await post(endpoint, { ...selected, dueDate: '2024-02-29' });
      const cleared = await post(endpoint, { ...selected, dueDate: value });
      assert.equal(cleared.status, 303);
      assert.equal(cleared.headers.get('location'), path);
      assert.match(dateInput(await html(path), 1), /value=""/);
      assertFilters(await html(path));
    }
    await post(endpoint, { ...selected, dueDate: '0004-02-29' });
    await post('/projects/1/tasks/1/rename', { ...selected, title: 'Renamed task' });
    assert.match(dateInput(await html(path), 1), /value="0004-02-29"/);
    assert.match(await html(path), /aria-label="Complete Renamed task" checked/);
    const beforeRestart = await html('/projects/1');
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.equal(await html('/projects/1'), beforeRestart);
    assert.equal(await html('/'), summary);
    await post('/projects/1/archive');
    const archived = await html(path);
    assertFilters(archived);
    for (const row of rows(await html('/projects/1'))) {
      assert.match(row, /name="dueDate"[^>]* disabled/);
      assert.match(row, /<button type="submit" disabled>Save due date<\/button>/);
    }
    assert.equal((await post(endpoint, { ...selected, dueDate: '2026-01-01' })).status, 403);
    assert.equal(await html(path), archived);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.equal(await html(path), archived);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), beforeRestart);
    await post(endpoint, { ...selected, dueDate: '2028-02-29' });
    assert.match(dateInput(await html(path), 1), /value="2028-02-29"/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('inclusive due ranges intersect both filters, preserve membership on errors, and survive edits and archive', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-due-range-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.url}${path}`)).text();
    const rows = page => [...page.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    const titles = page => rows(page).map(row => row.match(/<span>([^<]+)<\/span>/)[1]);
    const rangeInput = (page, id) => page.match(new RegExp(`<input id="${id}"[^>]*>`))[0];
    const assertState = (page, state) => {
      for (const [id, value] of [['task-filter', state.filter], ['priority-filter', state.priorityFilter]]) {
        const select = page.match(new RegExp(`<select id="${id}"[^>]*>[\\s\\S]*?</select>`))[0];
        assert.match(select, new RegExp(`<option selected>${value}</option>`));
        assert.doesNotMatch(select, /disabled/);
      }
      assert.match(rangeInput(page, 'due-from'), new RegExp(`value="${state.dueFrom}"`));
      assert.match(rangeInput(page, 'due-through'), new RegExp(`value="${state.dueThrough}"`));
      assert.doesNotMatch(rangeInput(page, 'due-from') + rangeInput(page, 'due-through'), /disabled/);
    };
    const apply = async (state, previous = { dueFrom: '', dueThrough: '' }) => {
      const response = await post('/projects/1/due-range', {
        ...state, appliedDueFrom: previous.dueFrom, appliedDueThrough: previous.dueThrough,
      });
      assert.equal(response.status, 303);
      return response.headers.get('location');
    };
    await post('/projects', { name: 'Ranges' });
    await post('/projects', { name: 'Other' });
    const tasks = [];
    for (const date of ['', '0001-01-01', '2024-02-28', '2024-02-29', '2024-03-01', '9999-12-31']) {
      for (const priority of ['Low', 'Normal', 'High']) {
        for (const completed of [false, true]) {
          const id = tasks.length + 1;
          const title = `${date || 'Undated'} ${priority} ${completed ? 'done' : 'open'}`;
          await post('/projects/1/tasks', { title });
          await post(`/projects/1/tasks/${id}/priority`, { priority });
          await post(`/projects/1/tasks/${id}/due-date`, { dueDate: date });
          if (completed) await post(`/projects/1/tasks/${id}`, { completed: '1' });
          tasks.push({ id, title, priority, completed, date });
        }
      }
    }
    await post('/projects/2/tasks', { title: 'Other task' });
    const otherPage = await html('/projects/2');
    const originalSummary = await html('/');
    const initial = await html('/projects/1');
    assert.match(initial, /<label for="due-from">Due from<\/label>/);
    assert.match(initial, /<label for="due-through">Due through<\/label>/);
    assert.match(initial, />Apply due range<\/button>/);
    assertState(initial, { filter: 'All', priorityFilter: 'All', dueFrom: '', dueThrough: '' });

    // All intersections, inclusive edges, each unbounded side, and no bounds.
    for (const [dueFrom, dueThrough] of [
      ['', ''], ['2024-02-29', ''], ['', '2024-02-29'],
      ['2024-02-28', '2024-03-01'], ['2024-02-29', '2024-02-29'],
      ['0001-01-01', '9999-12-31'],
    ]) {
      for (const filter of ['All', 'Open', 'Completed']) {
        for (const priorityFilter of ['All', 'Low', 'Normal', 'High']) {
          const state = { filter, priorityFilter, dueFrom, dueThrough };
          const path = await apply(state);
          const page = await html(path);
          assertState(page, state);
          assert.deepEqual(titles(page), tasks.filter(task =>
            (filter === 'All' || task.completed === (filter === 'Completed')) &&
            (priorityFilter === 'All' || task.priority === priorityFilter) &&
            ((!dueFrom && !dueThrough) || (task.date &&
              (!dueFrom || task.date >= dueFrom) && (!dueThrough || task.date <= dueThrough))))
            .map(task => task.title));
        }
      }
    }
    assert.equal(await html('/'), originalSummary);
    assert.equal(await html('/projects/2'), otherPage);
    assert.equal(await html('/projects/1'), initial);

    const selected = { filter: 'Open', priorityFilter: 'High', dueFrom: '2024-02-28', dueThrough: '2024-03-01' };
    const path = await apply({ ...selected, dueFrom: ' \t2024-02-28 ', dueThrough: ' 2024-03-01\n' });
    const baseline = await html(path);
    assertState(baseline, selected);
    assert.deepEqual(titles(baseline), ['2024-02-28 High open', '2024-02-29 High open', '2024-03-01 High open']);
    // Verify the rendered forms carry the applied range through selectors and all edits.
    for (const form of baseline.matchAll(/<form[^>]*action="\/projects\/1[^\"]*"[\s\S]*?<\/form>/g)) {
      const prefix = form[0].includes('/due-range') ? 'appliedDue' : 'due';
      assert.match(form[0], new RegExp(`name="${prefix}From" value="2024-02-28"`));
      assert.match(form[0], new RegExp(`name="${prefix}Through" value="2024-03-01"`));
    }
    for (const [dueFrom, dueThrough, message] of [
      ['2024-02-30', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['', '1900-02-29', 'Due range must use valid YYYY-MM-DD dates'],
      ['0000-01-01', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['', '10000-01-01', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-2-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['<invalid>', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-03-01', '2024-02-29', 'Due from must not be after Due through'],
    ]) {
      const response = await post('/projects/1/due-range', {
        ...selected, dueFrom, dueThrough,
        appliedDueFrom: selected.dueFrom, appliedDueThrough: selected.dueThrough,
      });
      assert.equal(response.status, 400);
      const page = await response.text();
      assert.match(page, new RegExp(`role="alert">${message}`));
      assertState(page, selected);
      assert.deepEqual(titles(page), titles(baseline));
      assert.equal(await html(path), baseline);
    }

    const edit = async (endpoint, values) => {
      const response = await post(endpoint, { ...selected, ...values });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), path);
      const page = await html(path);
      assertState(page, selected);
      return page;
    };
    // Date edits, clearing, priority and completion immediately remove nonmatches.
    assert.deepEqual(titles(await edit('/projects/1/tasks/17/due-date', { dueDate: '2024-03-02' })),
      ['2024-02-29 High open', '2024-03-01 High open']);
    assert.deepEqual(titles(await edit('/projects/1/tasks/23/due-date', { dueDate: ' ' })),
      ['2024-03-01 High open']);
    assert.deepEqual(titles(await edit('/projects/1/tasks/29/priority', { priority: 'Low' })), []);
    await edit('/projects/1/tasks/17/due-date', { dueDate: '2024-02-28' });
    assert.deepEqual(titles(await edit('/projects/1/tasks/17', { completed: '1' })), []);
    await edit('/projects/1/tasks/17', {});
    const renamed = await edit('/projects/1/tasks/17/rename', { title: '  Renamed task  ' });
    assert.deepEqual(titles(renamed), ['Renamed task']);
    assert.match(renamed, /aria-label="Complete Renamed task"/);
    assert.match(renamed, /name="dueDate" type="text" value="2024-02-28"/);
    await edit('/projects/1/rename', { name: 'Renamed project' });
    const summaryBeforeDefault = await html('/');
    await edit('/projects/1/default-priority', { priority: 'High' });
    assert.equal(await html('/'), summaryBeforeDefault);
    assert.deepEqual(titles(await edit('/projects/1/tasks', { title: 'New undated' })), ['Renamed task']);
    assert.deepEqual(titles(await edit('/projects/1/tasks/38/due-date', { dueDate: '2024-03-01' })),
      ['Renamed task', 'New undated']);
    const invalidDate = await post('/projects/1/tasks/17/due-date', { ...selected, dueDate: '2024-02-30' });
    assert.equal(invalidDate.status, 400);
    assertState(await invalidDate.text(), selected);
    assert.equal(await html('/projects/2'), otherPage.replace('<option value="1">Ranges</option>', '<option value="1">Renamed project</option>'));
    const beforeRestart = await html(path);
    const summaryBeforeRestart = await html('/');
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.equal(await html(path), beforeRestart);
    assert.equal(await html('/'), summaryBeforeRestart);
    assertState(await html('/projects/1'), { filter: 'All', priorityFilter: 'All', dueFrom: '', dueThrough: '' });

    await post('/projects/1/archive');
    const archived = await html(path);
    assertState(archived, selected);
    assert.match(archived, /Archived project/);
    for (const row of rows(archived)) {
      for (const name of ['completed', 'title', 'priority', 'dueDate']) {
        assert.match(row, new RegExp(`name="${name}"[^>]*disabled`));
      }
      assert.match(row, /disabled>Save due date/);
    }
    assert.doesNotMatch(archived, /disabled>Apply due range/);
    const cleared = await apply({ ...selected, dueFrom: ' \t', dueThrough: ' \n' }, selected);
    const clearedPage = await html(cleared);
    assertState(clearedPage, { ...selected, dueFrom: '', dueThrough: '' });
    assert.ok(titles(clearedPage).includes('2024-02-29 High open'));
    assert.equal((await post('/projects/1/tasks/17/due-date', { ...selected, dueDate: '' })).status, 403);
    assert.equal(await html(path), archived);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.equal(await html(path), archived);
    await post('/projects/1/restore');
    assert.equal(await html(path), beforeRestart);
    assert.equal(await html('/'), summaryBeforeRestart);
    assert.doesNotMatch(await html(path), / disabled/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('moving tasks appends to active destinations, retains data and filters, and persists after migration and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-moves-'));
  const dbPath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0, default_task_priority TEXT NOT NULL DEFAULT 'Normal');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal',
      due_date TEXT NOT NULL DEFAULT '');
    INSERT INTO projects (name) VALUES ('Source');
    INSERT INTO tasks (project_id, title, completed, priority, due_date) VALUES
      (1, 'First', 1, 'High', '2024-02-29'),
      (1, 'Undated', 0, 'Low', ''),
      (1, 'Last', 1, 'High', '2024-03-01');`);
  legacy.close();
  let server;
  try {
    server = await start(dbPath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.url}${path}`)).text();
    const rows = page => [...page.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    const titles = page => rows(page).map(row => row.match(/<span>([^<]+)<\/span>/)[1]);
    const destinations = row => row.match(/<select id="destination-project-\d+"[^>]*>[\s\S]*?<\/select>/)[0];
    const options = row => [...destinations(row).matchAll(/<option value="(\d+)">([^<]*)<\/option>/g)]
      .map(match => [match[1], match[2]]);
    const assertMoveDisabled = (page, disabled) => {
      for (const row of rows(page)) {
        assert.equal(destinations(row).includes(' disabled'), disabled);
        assert.equal(row.includes('<button type="submit" disabled>Move task</button>'), disabled);
      }
    };
    const assertTaskData = (page, id, title, completed, priority, dueDate) => {
      const row = rows(page).find(row => row.includes(`action="/projects/2/tasks/${id}"`));
      assert.ok(row);
      assert.match(row, new RegExp(`aria-label="Complete ${title}"${completed ? ' checked' : '\\s*\\n'}`));
      assert.match(row, new RegExp(`<option selected>${priority}</option>`));
      assert.match(row, new RegExp(`name="dueDate" type="text" value="${dueDate}"`));
    };
    assert.deepEqual(titles(await html('/projects/1')), ['First', 'Undated', 'Last']);
    assertMoveDisabled(await html('/projects/1'), true);
    assert.deepEqual(options(rows(await html('/projects/1'))[0]), []);
    await post('/projects', { name: 'Destination' });
    await post('/projects', { name: 'Third' });
    await post('/projects', { name: 'Archived' });
    await post('/projects/4/archive');
    await post('/projects/2/rename', { name: 'Destination & renamed' });
    await post('/projects/2/default-priority', { priority: 'Low' });
    await post('/projects/2/tasks', { title: 'Destination first' });
    await post('/projects/2/tasks', { title: 'Destination last' });
    const source = await html('/projects/1');
    assertMoveDisabled(source, false);
    for (const row of rows(source)) {
      assert.deepEqual(options(row), [['2', 'Destination &amp; renamed'], ['3', 'Third']]);
      assert.match(row, />Destination project<\/label>/);
      assert.match(row, />Move task<\/button>/);
    }
    // Rejected moves cannot alter ownership or ordering.
    for (const destination of ['1', '4', '999', '', 'bad']) {
      assert.equal((await post('/projects/1/tasks/1/move', { destination })).status, 400);
    }
    assert.equal((await post('/projects/1/tasks/999/move', { destination: '2' })).status, 404);
    assert.equal((await post('/projects/3/tasks/1/move', { destination: '2' })).status, 404);
    assert.equal(await html('/projects/1'), source);

    const selected = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-03-01' };
    const path = '/projects/1?filter=Completed&priorityFilter=High&dueFrom=2024-02-29&dueThrough=2024-03-01';
    const selectedPage = await html(path);
    const moveForm = rows(selectedPage)[0].match(/<form[^>]*action="[^\"]*\/move">[\s\S]*?<\/form>/)[0];
    for (const [name, value] of Object.entries(selected)) {
      assert.ok(moveForm.includes(`name="${name}" value="${value}"`));
    }
    const moved = await post('/projects/1/tasks/1/move', { ...selected, destination: '2' });
    assert.equal(moved.status, 303);
    assert.equal(moved.headers.get('location'), path);
    const remaining = await html(path);
    assert.deepEqual(titles(remaining), ['Last']);
    assert.match(remaining, /<option selected>Completed<\/option>/);
    assert.match(remaining, /<option selected>High<\/option>/);
    assert.match(remaining, /id="due-from"[^>]*value="2024-02-29"/);
    assert.match(remaining, /id="due-through"[^>]*value="2024-03-01"/);
    assert.deepEqual(titles(await html('/projects/1')), ['Undated', 'Last']);
    assert.deepEqual(titles(await html('/projects/2')), ['Destination first', 'Destination last', 'First']);
    assertTaskData(await html('/projects/2'), 1, 'First', true, 'High', '2024-02-29');
    const projectRows = [...(await html('/')).matchAll(/<li data-testid="project-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    assert.match(projectRows[0], /project-summary">1\/2 completed/);
    assert.match(projectRows[1], /project-summary">1\/3 completed/);
    // New tasks append after a moved task even when its original ID is older.
    await post('/projects/2/tasks', { title: 'Created after move' });
    await post('/projects/1/tasks/2/move', { destination: '2' });
    assert.deepEqual(titles(await html('/projects/2')), ['Destination first', 'Destination last', 'First', 'Created after move', 'Undated']);
    assertTaskData(await html('/projects/2'), 2, 'Undated', false, 'Low', '');
    const beforeRestart = await html('/projects/2');
    const beforeList = await html('/');
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.equal(await html('/projects/2'), beforeRestart);
    assert.equal(await html('/'), beforeList);
    assert.equal(await html(path), remaining);
    // Returning restores the remembered slot and preserves identity and data.
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(titles(await html('/projects/1')), ['First', 'Last']);
    assert.equal((await post('/projects/2/tasks/1/move', { destination: '3' })).status, 404);
    await post('/projects/1/tasks/1/move', { destination: '2' });
    assert.deepEqual(titles(await html('/projects/2')), ['Destination first', 'Destination last', 'First', 'Created after move', 'Undated']);
    assertTaskData(await html('/projects/2'), 1, 'First', true, 'High', '2024-02-29');
    await post('/projects/2/archive');
    const archived = await html('/projects/2');
    assertMoveDisabled(archived, true);
    assert.equal((await post('/projects/2/tasks/1/move', { destination: '1' })).status, 403);
    assert.equal((await post('/projects/1/tasks/3/move', { destination: '2' })).status, 400);
    assert.equal(await html('/projects/2'), archived);
    assert.deepEqual(options(rows(await html('/projects/1'))[0]), [['3', 'Third']]);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.equal(await html('/projects/2'), archived);
    await post('/projects/2/restore');
    assertMoveDisabled(await html('/projects/2'), false);
    assertTaskData(await html('/projects/2'), 1, 'First', true, 'High', '2024-02-29');
    await post('/projects/1/archive');
    await post('/projects/3/archive');
    assertMoveDisabled(await html('/projects/2'), true);
    assert.deepEqual(options(rows(await html('/projects/2'))[0]), []);
    await post('/projects/3/restore');
    assertMoveDisabled(await html('/projects/2'), false);
    await post('/projects/2/tasks/2/move', { destination: '3' });
    assert.deepEqual(titles(await html('/projects/3')), ['Undated']);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('remembered project positions survive migration, reverse returns, empty projects, edits and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-return-order-'));
  const dbPath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(dbPath);
  // Task 011 order can differ from ID order after a move.
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0, default_task_priority TEXT NOT NULL DEFAULT 'Normal');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal',
      due_date TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Original'), ('Second'), ('Third');
    INSERT INTO tasks (project_id, title, position) VALUES
      (1, 'Middle', 20), (1, 'First', 10), (1, 'Last', 30), (2, 'Resident', 1);`);
  legacy.close();
  let server;
  try {
    server = await start(dbPath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.url}${path}`)).text();
    const titles = page => [...page.matchAll(/<li data-testid="task-row">[\s\S]*?<span>([^<]+)<\/span>/g)]
      .map(match => match[1]);
    const assertOrder = async (project, expected) => assert.deepEqual(titles(await html(`/projects/${project}`)), expected);
    const move = async (source, task, destination) => {
      assert.equal((await post(`/projects/${source}/tasks/${task}/move`, { destination })).status, 303);
    };
    await assertOrder(1, ['First', 'Middle', 'Last']);
    for (const task of [2, 1, 3]) await move(1, task, 2);
    await assertOrder(1, []);
    await assertOrder(2, ['Resident', 'First', 'Middle', 'Last']);
    // All old slots remain reserved while their tasks are absent.
    await post('/projects/1/tasks', { title: 'New at home' });
    await move(2, 4, 1);
    await assertOrder(1, ['New at home', 'Resident']);
    await post('/projects/2/tasks/2/rename', { title: 'First edited away' });
    await post('/projects/2/tasks/2', { completed: '1' });
    await post('/projects/2/tasks/2/priority', { priority: 'High' });
    await post('/projects/2/tasks/2/due-date', { dueDate: '2024-02-29' });
    await post('/projects/1/rename', { name: 'Renamed home' });
    await post('/projects/1/archive');
    assert.equal((await post('/projects/2/tasks/2/move', { destination: '1' })).status, 400);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    await post('/projects/1/restore');
    // Returning in reverse order recovers the original relative order.
    for (const task of [3, 1, 2]) await move(2, task, 1);
    await assertOrder(1, ['First edited away', 'Middle', 'Last', 'New at home', 'Resident']);
    const home = await html('/projects/1');
    assert.match(home, /<h1>Renamed home<\/h1>/);
    assert.match(home, /aria-label="Complete First edited away" checked/);
    assert.match(home, /id="task-priority-2"[\s\S]*?<option selected>High<\/option>/);
    assert.match(home, /id="task-due-date-2"[^>]*value="2024-02-29"/);
    // The same task can remember independent positions in three projects.
    await move(1, 2, 3);
    await post('/projects/3/tasks', { title: 'Third new' });
    await move(3, 2, 2);
    await move(1, 1, 2);
    await move(1, 3, 2);
    await move(1, 4, 2);
    await assertOrder(2, ['Resident', 'First edited away', 'Middle', 'Last']);
    await move(2, 2, 3);
    await assertOrder(3, ['First edited away', 'Third new']);
    await move(3, 2, 1);
    await assertOrder(1, ['First edited away', 'New at home']);
    const before = await html('/');
    const beforeHome = await html('/projects/1');
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.equal(await html('/'), before);
    assert.equal(await html('/projects/1'), beforeHome);
    for (const task of [3, 1, 4]) await move(2, task, 1);
    await assertOrder(1, ['First edited away', 'Middle', 'Last', 'New at home', 'Resident']);
    assert.match(await html('/'), /project-summary">1\/5 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project search trims boundaries, folds only ASCII, intersects archive state and resets on navigation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-project-search-'));
  let server;
  try {
    server = await start(join(directory, 'workboard.sqlite'));
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.url}${path}`)).text();
    const names = page => [...page.matchAll(/<li data-testid="project-row">[\s\S]*?<span>([^<]+)<\/span>/g)]
      .map(match => match[1]);
    for (const name of ['Alpha Board', 'alpha  board', 'ALPHA archive', 'Beta', 'ÄBC', '<Alpha & "quoted">']) {
      await post('/projects', { name });
    }
    await post('/projects/3/archive');
    await post('/projects/1/tasks', { title: 'First' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const baseline = await html('/');
    const search = async (query, filter = 'Active') => html(`/?${new URLSearchParams({ search: query, filter })}`);
    assert.deepEqual(names(await search(' \tALpHA\n')), ['Alpha Board', 'alpha  board', '&lt;Alpha &amp; &quot;quoted&quot;&gt;']);
    assert.deepEqual(names(await search('alpha board')), ['Alpha Board']);
    assert.deepEqual(names(await search('alpha  board')), ['alpha  board']);
    assert.deepEqual(names(await search('äbc')), []);
    assert.deepEqual(names(await search('Äbc')), ['ÄBC']);
    assert.deepEqual(names(await search(' \n')), names(baseline));
    assert.deepEqual(names(await search('aLpHa', 'Archived')), ['ALPHA archive']);
    const page = await search('alpha');
    assert.match(page, /project-summary">1\/1 completed/);
    assert.match(page, /<label for="project-search">Project search<\/label>/);
    assert.match(page, />Search projects<\/button>/);
    const filterForm = [...page.matchAll(/<form[\s\S]*?<\/form>/g)]
      .map(match => match[0]).find(form => form.includes('id="project-filter"'));
    assert.match(filterForm, /name="search" value="alpha"/);
    const openForm = page.match(/<form method="get" action="\/projects\/1">[\s\S]*?<\/form>/)[0];
    assert.doesNotMatch(openForm, /name="search"/);
    const project = await html('/projects/1');
    assert.match(project, /id="task-search"[^>]*value=""/);
    assert.match(project, /<form method="get" action="\/">/);
    assert.equal(await html('/'), baseline);
    const escaped = await search('<Alpha & "quoted">');
    assert.match(escaped, /id="project-search"[^>]*value="&lt;Alpha &amp; &quot;quoted&quot;&gt;"/);
    assert.equal((await post('/projects/1/archive', { search: 'alpha' })).headers.get('location'), '/?search=alpha');
    assert.deepEqual(names(await search('alpha')), ['alpha  board', '&lt;Alpha &amp; &quot;quoted&quot;&gt;']);
    assert.equal((await post('/projects/1/restore', { search: 'alpha' })).headers.get('location'), '/?filter=Archived&search=alpha');
    assert.equal(await html('/'), baseline);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task search intersects all filters, survives edits and errors, and preserves moves, archive rules and restart data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-search-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.url}${path}`)).text();
    const titles = page => [...page.matchAll(/<li data-testid="task-row">[\s\S]*?<span>([^<]+)<\/span>/g)]
      .map(match => match[1]);
    const pathFor = state => `/projects/1?${new URLSearchParams(state)}`;
    await post('/projects', { name: 'Source' });
    await post('/projects', { name: 'Destination' });
    const tasks = [
      { title: 'Alpha one', completed: false, priority: 'High', date: '2024-02-29' },
      { title: 'ALPHA  two', completed: true, priority: 'High', date: '2024-03-01' },
      { title: 'Alpha outside', completed: false, priority: 'Low', date: '2024-03-02' },
      { title: 'Beta', completed: false, priority: 'Normal', date: '' },
      { title: 'Alpha undated', completed: false, priority: 'High', date: '' },
      { title: 'ÄBC', completed: false, priority: 'Normal', date: '' },
    ];
    for (const [index, task] of tasks.entries()) {
      await post('/projects/1/tasks', { title: task.title });
      await post(`/projects/1/tasks/${index + 1}/priority`, { priority: task.priority });
      await post(`/projects/1/tasks/${index + 1}/due-date`, { dueDate: task.date });
      if (task.completed) await post(`/projects/1/tasks/${index + 1}`, { completed: '1' });
    }
    const originalList = await html('/');
    for (const search of ['', ' \tALPHA\n', 'alpha  ', 'alpha  two', 'äbc', 'Äbc', 'absent']) {
      for (const filter of ['All', 'Open', 'Completed']) {
        for (const priorityFilter of ['All', 'Low', 'Normal', 'High']) {
          for (const [dueFrom, dueThrough] of [['', ''], ['2024-02-29', '2024-03-01']]) {
            const page = await html(pathFor({ filter, priorityFilter, dueFrom, dueThrough, search }));
            const fold = text => text.replace(/[A-Z]/g, letter => letter.toLowerCase());
            assert.deepEqual(titles(page), tasks.filter(task =>
              fold(task.title).includes(fold(search.trim())) &&
              (filter === 'All' || task.completed === (filter === 'Completed')) &&
              (priorityFilter === 'All' || task.priority === priorityFilter) &&
              ((!dueFrom && !dueThrough) || (task.date && task.date >= dueFrom && task.date <= dueThrough)))
              .map(task => task.title));
          }
        }
      }
    }
    assert.equal(await html('/'), originalList);
    const state = { filter: 'Open', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-03-01', search: 'alpha' };
    const path = pathFor(state);
    const assertState = page => {
      assert.match(page, /id="task-search"[^>]*value="alpha"/);
      assert.match(page, /id="task-filter"[\s\S]*?<option selected>Open<\/option>/);
      assert.match(page, /id="priority-filter"[\s\S]*?<option selected>High<\/option>/);
      assert.match(page, /id="due-from"[^>]*value="2024-02-29"/);
      assert.match(page, /id="due-through"[^>]*value="2024-03-01"/);
    };
    const page = await html(path);
    assertState(page);
    assert.deepEqual(titles(page), ['Alpha one']);
    // All editing and filter forms carry the applied query, including the due-range form.
    for (const match of page.matchAll(/<form[^>]*action="\/projects\/1[^\"]*"[\s\S]*?<\/form>/g)) {
      assert.match(match[0], /name="search"[^>]*value="alpha"/);
    }
    const edit = async (endpoint, values) => {
      const response = await post(endpoint, { ...state, ...values });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), path);
      const page = await html(path);
      assertState(page);
      return titles(page);
    };
    assert.deepEqual(await edit('/projects/1/tasks/1/rename', { title: 'No match' }), []);
    assert.deepEqual(await edit('/projects/1/tasks/1/rename', { title: 'Alpha renamed' }), ['Alpha renamed']);
    assert.deepEqual(await edit('/projects/1/tasks/1', { completed: '1' }), []);
    assert.deepEqual(await edit('/projects/1/tasks/1', {}), ['Alpha renamed']);
    assert.deepEqual(await edit('/projects/1/tasks/1/priority', { priority: 'Low' }), []);
    assert.deepEqual(await edit('/projects/1/tasks/1/priority', { priority: 'High' }), ['Alpha renamed']);
    assert.deepEqual(await edit('/projects/1/tasks/1/due-date', { dueDate: '' }), []);
    assert.deepEqual(await edit('/projects/1/tasks/1/due-date', { dueDate: '2024-03-01' }), ['Alpha renamed']);
    await edit('/projects/1/rename', { name: 'Renamed source' });
    const beforeDefault = await html('/');
    await edit('/projects/1/default-priority', { priority: 'High' });
    assert.equal(await html('/'), beforeDefault);
    assert.deepEqual(await edit('/projects/1/tasks', { title: 'Alpha new' }), ['Alpha renamed']);
    assert.deepEqual(await edit('/projects/1/tasks/7/due-date', { dueDate: '2024-02-29' }), ['Alpha renamed', 'Alpha new']);
    for (const [endpoint, values] of [
      ['/projects/1/tasks/1/rename', { title: ' ' }],
      ['/projects/1/tasks/1/due-date', { dueDate: '2024-02-30' }],
      ['/projects/1/due-range', { dueFrom: 'bad', appliedDueFrom: state.dueFrom, appliedDueThrough: state.dueThrough }],
    ]) {
      const response = await post(endpoint, { ...state, ...values });
      assert.equal(response.status, 400);
      const failed = await response.text();
      assertState(failed);
      assert.deepEqual(titles(failed), ['Alpha renamed', 'Alpha new']);
    }
    const apply = await post('/projects/1/due-range', state);
    assert.equal(apply.headers.get('location'), path);
    assert.deepEqual(await edit('/projects/1/tasks/1/move', { destination: '2' }), ['Alpha new']);
    assert.deepEqual(titles(await html('/projects/2?search=ALPHA')), ['Alpha renamed']);
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(titles(await html(path)), ['Alpha renamed', 'Alpha new']);
    // Clearing search still intersects the other three filters.
    assert.deepEqual(titles(await html(pathFor({ ...state, search: ' \n' }))), ['Alpha renamed', 'Alpha new']);
    const saved = await html(path);
    const summaries = await html('/');
    await post('/projects/1/archive');
    const archived = await html(path);
    assertState(archived);
    assert.deepEqual(titles(archived), ['Alpha renamed', 'Alpha new']);
    assert.doesNotMatch(archived, /disabled>Search tasks/);
    assert.doesNotMatch(archived, /id="task-search"[^>]*disabled/);
    assert.deepEqual(titles(await html(pathFor({ ...state, search: 'new' }))), ['Alpha new']);
    assert.equal((await post('/projects/1/tasks/1/rename', { ...state, title: 'Changed' })).status, 403);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.equal(await html(path), archived);
    await post('/projects/1/restore');
    assert.equal(await html(path), saved);
    assert.equal(await html('/'), summaries);
    const reopened = await html('/projects/1');
    assert.match(reopened, /id="task-search"[^>]*value=""/);
    assert.match(reopened, /id="due-from"[^>]*value=""/);
    assert.deepEqual(titles(reopened), ['Alpha renamed', 'ALPHA  two', 'Alpha outside', 'Beta', 'Alpha undated', 'ÄBC', 'Alpha new']);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
