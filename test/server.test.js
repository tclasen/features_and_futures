import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

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
    const filterForm = initial.match(/<form class="filter"[\s\S]*?<\/form>/)[0];
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
