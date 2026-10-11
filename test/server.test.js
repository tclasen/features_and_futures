import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { openProjects } from '../projects.js';

test('due dates migrate and preserve filters and task data through validation, restart and restoration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-dates-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, default_task_priority TEXT NOT NULL DEFAULT 'Normal');
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
      INSERT INTO projects (name) VALUES ('First'), ('Second');
      INSERT INTO tasks (project_id, title, completed, priority) VALUES (1, 'Saved task', 1, 'High'), (1, 'Other task', 0, 'Normal'), (2, 'Private', 0, 'Normal');
    `);
    database.close();
    server = await start(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const page = async (path) => (await fetch(`${server.url}${path}`)).text();
    const rows = (html) => [...html.matchAll(/<div data-testid="task-row"[\s\S]*?<\/div>/g)].map((match) => match[0]);
    const filters = { filter: 'Completed', priorityFilter: 'High' };
    const filteredPath = '/projects/1?filter=Completed&priorityFilter=High';
    const summary = await page('/');
    const initial = await page('/projects/1');
    for (const row of rows(initial)) {
      assert.match(row, /<label for="task-due-date-\d+">Task due date<\/label>/);
      assert.match(row, /name="dueDate" type="text" value=""/);
      assert.match(row, /<button type="submit">Save due date<\/button>/);
    }
    const edit = async (value) => {
      const response = await post('/projects/1/tasks/1/due-date', { ...filters, dueDate: value });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), filteredPath);
      return page(filteredPath);
    };
    const filteredInitial = await page(filteredPath);
    let saved = await edit(' \t2000-02-29\n ');
    assert.equal(saved, filteredInitial.replace('name="dueDate" type="text" value=""', 'name="dueDate" type="text" value="2000-02-29"'));
    assert.equal(rows(saved).length, 1);
    assert.match(rows(await page('/projects/1'))[1], /name="dueDate" type="text" value=""/);
    assert.match(rows(await page('/projects/2'))[0], /name="dueDate" type="text" value=""/);
    for (const dueDate of ['1900-02-29', '2026-04-31', '0000-01-01', '2026-2-01', '<script>']) {
      const response = await post('/projects/1/tasks/1/due-date', { ...filters, dueDate });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      assert.deepEqual(rows(html), rows(saved));
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.match(html, /<option selected>High<\/option>/);
      assert.equal(await page(filteredPath), saved);
    }
    for (const path of ['/projects/2/tasks/1/due-date', '/projects/1/tasks/999/due-date', '/projects/999/tasks/1/due-date']) {
      assert.equal((await post(path, { dueDate: '2026-01-01' })).status, 404);
    }
    assert.equal(await page('/'), summary);
    await post('/projects/1/tasks/1/rename', { ...filters, title: 'Renamed' });
    saved = saved.replaceAll('Saved task', 'Renamed');
    assert.equal(await page(filteredPath), saved);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page(filteredPath), saved);
    await post('/projects/1/archive');
    const archived = await page(filteredPath);
    assert.match(archived, /name="dueDate" type="text" value="2000-02-29"[^>]* disabled>/);
    assert.match(archived, /disabled>Save due date/);
    assert.equal((await post('/projects/1/tasks/1/due-date', { dueDate: '' })).status, 409);
    assert.equal(await page(filteredPath), archived);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page(filteredPath), archived);
    await post('/projects/1/restore');
    assert.equal(await page(filteredPath), saved);
    assert.equal(await page('/'), summary);
    assert.equal(await edit(' \n '), saved.replace('value="2000-02-29"', 'value=""'));
    saved = await page(filteredPath);
    await post('/projects/1/tasks', { title: 'New task' });
    assert.match(rows(await page('/projects/1'))[2], /name="dueDate" type="text" value=""/);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page(filteredPath), saved);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('priority storage validates values, isolates tasks, and protects archived projects', () => {
  const projects = openProjects(':memory:');
  try {
    projects.create('First');
    projects.create('Second');
    projects.createTask(1, 'First task');
    projects.createTask(1, 'Second task');
    projects.createTask(2, 'Private');
    projects.setTaskCompleted(1, 1, true);
    const original = projects.listTasks(1).map((task) => ({ ...task }));
    assert.equal(original[0].priority, 'Normal');
    for (const priority of ['', 'Urgent', 'high', null]) {
      assert.equal(projects.setTaskPriority(1, 1, priority), false);
    }
    assert.equal(projects.setTaskPriority(2, 1, 'High'), false);
    assert.equal(projects.setTaskPriority(1, 999, 'Low'), false);
    assert.deepEqual(projects.listTasks(1).map((task) => ({ ...task })), original);
    assert.equal(projects.setTaskPriority(1, 1, 'High'), true);
    assert.deepEqual(projects.listTasks(1).map((task) => ({ ...task })), [
      { ...original[0], priority: 'High' }, original[1],
    ]);
    assert.equal(projects.listTasks(2)[0].priority, 'Normal');
    projects.setArchived(1, true);
    assert.equal(projects.setTaskPriority(1, 1, 'Low'), false);
    assert.equal(projects.listTasks(1)[0].priority, 'High');
    projects.setArchived(1, false);
    assert.equal(projects.setTaskPriority(1, 1, 'Low'), true);
    projects.renameTask(1, 1, 'Renamed');
    assert.equal(projects.listTasks(1)[0].priority, 'Low');
    assert.equal(projects.list()[0].completed_count, 1);
    assert.equal(projects.list()[0].total_count, 2);
  } finally {
    projects.close();
  }
});

test('priorities migrate, render saved options, preserve task data, and survive restart and restoration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (name) VALUES ('Existing'), ('Other');
      INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Done', 1), (1, 'Pending', 0), (2, 'Private', 0);
    `);
    database.close();
    server = await start(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const page = async (path) => (await fetch(`${server.url}${path}`)).text();
    const rows = (html) => [...html.matchAll(/<div data-testid="task-row"[\s\S]*?<\/div>/g)]
      .map((match) => match[0]);
    const selected = (row, priority) => {
      const select = row.match(/<select[^>]*name="priority"[^>]*>([\s\S]*?)<\/select>/);
      assert.ok(select);
      assert.deepEqual([...select[1].matchAll(/<option(?: selected)?>(.*?)<\/option>/g)].map((match) => match[1]), ['Low', 'Normal', 'High']);
      assert.match(select[1], new RegExp(`<option selected>${priority}</option>`));
    };
    const list = await page('/');
    const initial = await page('/projects/1');
    for (const row of rows(initial)) {
      assert.match(row, /<label for="task-priority-\d+">Task priority<\/label>/);
      selected(row, 'Normal');
    }
    for (const priority of ['', 'Urgent', 'high']) {
      assert.equal((await post('/projects/1/tasks/1/priority', { priority })).status, 400);
    }
    for (const path of ['/projects/2/tasks/1/priority', '/projects/1/tasks/999/priority', '/projects/999/tasks/1/priority']) {
      assert.equal((await post(path, { priority: 'High' })).status, 404);
    }
    assert.equal(await page('/projects/1'), initial);
    const changed = await post('/projects/1/tasks/1/priority', { priority: 'High', filter: 'Completed' });
    assert.equal(changed.status, 303);
    assert.equal(changed.headers.get('location'), '/projects/1?filter=Completed');
    const detail = await page('/projects/1');
    assert.equal(detail, initial.replace(rows(initial)[0], rows(initial)[0].replace(
      '<option selected>Normal</option><option>High</option>', '<option>Normal</option><option selected>High</option>')));
    selected(rows(detail)[0], 'High');
    selected(rows(detail)[1], 'Normal');
    selected(rows(await page('/projects/2'))[0], 'Normal');
    assert.equal(rows(await page('/projects/1?filter=Completed')).length, 1);
    assert.match(rows(await page('/projects/1?filter=Open'))[0], /Complete Pending/);
    assert.equal(await page('/'), list);
    await post('/projects/1/tasks/1/rename', { title: 'Renamed' });
    const renamed = await page('/projects/1');
    assert.equal(renamed, detail.replaceAll('Done', 'Renamed'));
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page('/projects/1'), renamed);
    assert.equal(await page('/'), list);
    await post('/projects/1/archive');
    const archived = await page('/projects/1');
    for (const row of rows(archived)) {
      assert.match(row, /<select[^>]*name="priority" disabled>/);
    }
    selected(rows(archived)[0], 'High');
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Low' })).status, 409);
    assert.equal(await page('/projects/1'), archived);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await page('/projects/1'), renamed);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Low' })).status, 303);
    await post('/projects/1/tasks', { title: 'New task' });
    const restored = await page('/projects/1');
    selected(rows(restored)[0], 'Low');
    selected(rows(restored)[2], 'Normal');
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page('/projects/1'), restored);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
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

test('rename storage rejects invalid and archived changes while preserving project data', () => {
  const projects = openProjects(':memory:');
  try {
    projects.create('Original');
    projects.createTask(1, 'Saved task');
    projects.setTaskCompleted(1, 1, true);
    assert.equal(projects.rename(1, ' \t '), false);
    assert.equal(projects.find(1).name, 'Original');
    assert.equal(projects.rename(999, 'Missing'), false);
    projects.setArchived(1, true);
    assert.equal(projects.rename(1, 'Blocked'), false);
    assert.equal(projects.find(1).name, 'Original');
    projects.setArchived(1, false);
    assert.equal(projects.rename(1, '  Renamed  '), true);
    assert.deepEqual(projects.list().map((project) => ({ ...project })), [
      { id: 1, name: 'Renamed', archived: 0, total_count: 1, completed_count: 1 },
    ]);
    assert.deepEqual(projects.listTasks(1).map((task) => ({ ...task })), [
      { id: 1, title: 'Saved task', completed: 1, priority: 'Normal', due_date: '' },
    ]);
  } finally {
    projects.close();
  }
});

test('rename validates, preserves identity and order, persists, and is enabled after restoration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const page = async (path) => (await fetch(`${server.url}${path}`)).text();
    const rows = (html) => [...html.matchAll(/<div data-testid="project-row"[\s\S]*?<\/div>/g)]
      .map((match) => match[0]);
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1/completion', { completed: 'on' });
    const initial = await page('/projects/1');
    assert.match(initial, /<label for="new-project-name">New project name<\/label>/);
    assert.match(initial, /id="new-project-name"[^>]*type="text"/);
    assert.match(initial, /<button type="submit">Rename project<\/button>/);
    for (const name of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/rename', { name, filter: 'Completed' });
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.match(html, /<h1>Original<\/h1>/);
      assert.match(html, /<option selected>Completed/);
      assert.doesNotMatch(html, /Complete Pending/);
      assert.equal(await page('/projects/1'), initial);
    }
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
    const renamed = await post('/projects/1/rename', { name: '  New & <name>  ', filter: 'Open' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Open');
    const detail = await page('/projects/1');
    assert.match(detail, /<h1>New &amp; &lt;name&gt;<\/h1>/);
    assert.match(detail, /aria-label="Complete Done" checked/);
    assert.match(detail, /aria-label="Complete Pending">/);
    assert.equal(detail, initial.replaceAll('Original', 'New &amp; &lt;name&gt;'));
    const list = await page('/');
    assert.match(rows(list)[0], /<span>New &amp; &lt;name&gt;<\/span>/);
    assert.match(rows(list)[0], /action="\/projects\/1"/);
    assert.match(rows(list)[0], /data-testid="project-summary">1\/2 completed/);
    assert.match(rows(list)[1], /<span>Second<\/span>/);

    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page('/projects/1'), detail);
    assert.equal(await page('/'), list);
    await post('/projects/1/archive');
    const archived = await page('/projects/1');
    assert.match(archived, /id="new-project-name"[^>]* disabled>/);
    assert.match(archived, /<button type="submit" disabled>Rename project<\/button>/);
    assert.equal((await post('/projects/1/rename', { name: 'Blocked' })).status, 409);
    assert.equal(await page('/projects/1'), archived);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await page('/projects/1'), detail);
    assert.equal((await post('/projects/1/rename', { name: ' Restored name ' })).status, 303);
    const restored = await page('/projects/1');
    assert.equal(restored, detail.replaceAll('New &amp; &lt;name&gt;', 'Restored name'));
    assert.match(rows(await page('/'))[0], /data-testid="project-summary">1\/2 completed/);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page('/projects/1'), restored);
    assert.match(rows(await page('/'))[0], /<span>Restored name<\/span>/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project validation, navigation, creation order, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await start(databasePath);
    let response = await fetch(`${server.url}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });

    const create = (name) => fetch(`${server.url}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    for (const name of ['', '  \t\n ']) {
      response = await create(name);
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    response = await create('  Alpha & <team>  ');
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/');
    assert.equal((await create('Beta')).status, 303);

    const html = await (await fetch(server.url)).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, />Create project<\/button>/);
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.ok(html.indexOf('Alpha &amp; &lt;team&gt;') < html.indexOf('Beta'));
    const projectPath = html.match(/action="(\/projects\/\d+)" method="get"/)[1];
    const detail = await (await fetch(`${server.url}${projectPath}`)).text();
    assert.match(detail, /<h1>Alpha &amp; &lt;team&gt;<\/h1>/);
    assert.match(detail, /action="\/" method="get"><button type="submit">Projects/);
    assert.equal((await fetch(`${server.url}/projects/99999`)).status, 404);
    assert.equal(await (await fetch(server.url)).text(), html);

    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await (await fetch(server.url)).text(), html);
    assert.equal(await (await fetch(`${server.url}${projectPath}`)).text(), detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('existing projects migrate, summaries count all tasks, and archive/restore preserve saved state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    // Seed the previous schema to verify upgrades preserve IDs and task state.
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id),
        title TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO projects (name) VALUES ('Existing');
      INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Done', 1), (1, 'Pending', 0);
    `);
    database.close();
    server = await start(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const page = async (path) => (await fetch(`${server.url}${path}`)).text();
    const rows = (html) => [...html.matchAll(/<div data-testid="project-row"[\s\S]*?<\/div>/g)]
      .map((match) => match[0]);
    let html = await page('/');
    assert.match(html, /<label for="project-filter">Project filter<\/label>/);
    assert.match(html, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(rows(html)[0], /data-testid="project-summary">1\/2 completed/);
    assert.match(rows(html)[0], />Archive project<\/button>/);
    await post('/projects', { name: 'New' });
    html = await page('/');
    assert.equal(rows(html).length, 2);
    assert.match(rows(html)[1], /data-testid="project-summary">0\/0 completed/);
    await post('/projects/2/tasks', { title: 'Another' });
    await post('/projects/2/tasks/3/completion', { completed: 'on' });
    assert.match(rows(await page('/'))[1], /data-testid="project-summary">1\/1 completed/);
    await page('/projects/1?filter=Completed');
    assert.match(rows(await page('/'))[0], /data-testid="project-summary">1\/2 completed/);

    assert.equal((await post('/projects/999/archive')).status, 404);
    assert.equal((await post('/projects/1/archive')).status, 303);
    assert.equal(rows(await page('/')).length, 1);
    assert.doesNotMatch(await page('/'), /Existing/);
    const archivedList = await page('/?filter=Archived');
    assert.equal(rows(archivedList).length, 1);
    assert.match(rows(archivedList)[0], /Existing/);
    assert.match(rows(archivedList)[0], /data-testid="project-summary">1\/2 completed/);
    assert.match(rows(archivedList)[0], />Open project<\/button>/);
    assert.match(rows(archivedList)[0], />Restore project<\/button>/);
    assert.doesNotMatch(rows(archivedList)[0], />Archive project<\/button>/);
    const archivedPage = await page('/projects/1');
    assert.match(archivedPage, /<p>Archived project<\/p>/);
    assert.match(archivedPage, /<button type="submit" disabled>Create task<\/button>/);
    assert.equal((archivedPage.match(/type="checkbox"[^>]* disabled/g) || []).length, 2);
    assert.match(archivedPage, /aria-label="Complete Done" checked disabled/);
    assert.match(await page('/projects/1?filter=Completed'), /Complete Done/);
    assert.doesNotMatch(await page('/projects/1?filter=Completed'), /Complete Pending/);
    assert.match(await page('/projects/1?filter=Open'), /Complete Pending/);
    assert.doesNotMatch(await page('/projects/1?filter=Open'), /Complete Done/);
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked' })).status, 409);
    assert.equal((await post('/projects/1/tasks/1/completion')).status, 409);
    assert.equal((await post('/projects/1/tasks/2/completion', { completed: 'on' })).status, 409);
    assert.equal(await page('/projects/1'), archivedPage);

    const invalid = await post('/projects', { name: ' ', filter: 'Archived' });
    assert.equal(invalid.status, 400);
    const invalidHtml = await invalid.text();
    assert.match(invalidHtml, /Project name is required/);
    assert.match(invalidHtml, /<option selected>Archived/);
    assert.equal(rows(invalidHtml).length, 1);

    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page('/?filter=Archived'), archivedList);
    assert.equal(await page('/projects/1'), archivedPage);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.equal(rows(await page('/?filter=Archived')).length, 0);
    html = await page('/');
    assert.equal(rows(html).length, 2);
    assert.match(rows(html)[0], /Existing/);
    assert.match(rows(html)[0], /data-testid="project-summary">1\/2 completed/);
    assert.doesNotMatch(await page('/projects/1'), /Archived project| disabled/);
    assert.equal((await post('/projects/1/tasks/2/completion', { completed: 'on' })).status, 303);
    await post('/projects/1/tasks', { title: 'After restore' });
    assert.match(rows(await page('/'))[0], /data-testid="project-summary">2\/3 completed/);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(rows(await page('/?filter=Archived')).length, 0);
    assert.match(rows(await page('/'))[0], /data-testid="project-summary">2\/3 completed/);
    assert.match(await page('/projects/1'), /After restore/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter in order, remain project-owned, and persist completion across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  let server;
  try {
    const databasePath = join(directory, 'workboard.sqlite');
    server = await start(databasePath);
    const post = (path, values) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const page = async (path) => (await fetch(`${server.url}${path}`)).text();
    const rows = (html) => [...html.matchAll(/<div data-testid="task-row"[\s\S]*?<\/div>/g)]
      .map((match) => match[0]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const initial = await page('/projects/1');
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, />Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(rows(html).length, 0);
    }
    assert.equal((await post('/projects/999/tasks', { title: 'Orphan' })).status, 404);
    const created = await post('/projects/1/tasks', { title: '  Alpha & <task>  ' });
    assert.equal(created.status, 303);
    assert.equal(created.headers.get('location'), '/projects/1?filter=All');
    await post('/projects/1/tasks', { title: 'Beta' });
    await post('/projects/2/tasks', { title: 'Private' });
    let html = await page('/projects/1');
    const taskRows = rows(html);
    assert.equal(taskRows.length, 2);
    assert.match(taskRows[0], /<span>Alpha &amp; &lt;task&gt;<\/span>/);
    assert.match(taskRows[0], /aria-label="Complete Alpha &amp; &lt;task&gt;"/);
    assert.match(taskRows[1], /<span>Beta<\/span>/);
    assert.doesNotMatch(html, / checked/);
    assert.equal(rows(await page('/projects/1?filter=Open')).length, 2);
    assert.equal(rows(await page('/projects/1?filter=Completed')).length, 0);
    assert.doesNotMatch(html, /Private/);
    assert.doesNotMatch(await page('/projects/2'), /Alpha|Beta/);

    assert.equal((await post('/projects/2/tasks/1/completion', { completed: 'on' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/completion', { completed: 'on' })).status, 404);
    const completed = await post('/projects/1/tasks/1/completion', { completed: 'on', filter: 'Open' });
    assert.equal(completed.status, 303);
    assert.equal(completed.headers.get('location'), '/projects/1?filter=Open');
    html = await page('/projects/1');
    assert.match(rows(html)[0], / checked/);
    assert.doesNotMatch(rows(html)[1], / checked/);
    assert.match(rows(await page('/projects/1?filter=Open'))[0], /Beta/);
    assert.match(rows(await page('/projects/1?filter=Completed'))[0], /Alpha/);
    assert.equal(rows(await page('/projects/1?filter=invalid')).length, 2);
    const invalid = await post('/projects/1/tasks', { title: ' ', filter: 'Completed' });
    const invalidHtml = await invalid.text();
    assert.equal(rows(invalidHtml).length, 1);
    assert.match(invalidHtml, /<option selected>Completed/);

    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page('/projects/1'), html);
    assert.equal(rows(await page('/projects/2')).length, 1);
    assert.equal((await post('/projects/1/tasks/1/completion', {})).status, 303);
    assert.equal(rows(await page('/projects/1?filter=Completed')).length, 0);
    assert.equal(rows(await page('/projects/1?filter=Open')).length, 2);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.doesNotMatch(await page('/projects/1'), / checked/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task rename storage preserves ownership, order and completion and guards invalid changes', () => {
  const projects = openProjects(':memory:');
  try {
    projects.create('First');
    projects.create('Second');
    projects.createTask(1, 'Original');
    projects.createTask(1, 'Next');
    projects.setTaskCompleted(1, 1, true);
    for (const title of ['', ' \t\n ']) {
      assert.equal(projects.renameTask(1, 1, title), false);
    }
    assert.equal(projects.renameTask(2, 1, 'Wrong owner'), false);
    assert.equal(projects.renameTask(1, 999, 'Missing'), false);
    projects.setArchived(1, true);
    assert.equal(projects.renameTask(1, 1, 'Blocked'), false);
    assert.equal(projects.listTasks(1)[0].title, 'Original');
    projects.setArchived(1, false);
    assert.equal(projects.renameTask(1, 1, '  Renamed  '), true);
    assert.deepEqual(projects.listTasks(1).map((task) => ({ ...task })), [
      { id: 1, title: 'Renamed', completed: 1, priority: 'Normal', due_date: '' },
      { id: 2, title: 'Next', completed: 0, priority: 'Normal', due_date: '' },
    ]);
    assert.deepEqual(projects.listTasks(2), []);
    assert.equal(projects.list()[0].completed_count, 1);
    assert.equal(projects.list()[0].total_count, 2);
  } finally {
    projects.close();
  }
});

test('task rename updates accessible controls, preserves filters and summaries, and survives restart and restoration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const page = async (path) => (await fetch(`${server.url}${path}`)).text();
    const rows = (html) => [...html.matchAll(/<div data-testid="task-row"[\s\S]*?<\/div>/g)]
      .map((match) => match[0]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Original' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/2/tasks', { title: 'Private' });
    await post('/projects/1/tasks/1/completion', { completed: 'on' });
    const initial = await page('/projects/1');
    const list = await page('/');
    assert.match(rows(initial)[0], /<label for="new-task-title-1">New task title<\/label>/);
    assert.match(rows(initial)[0], /id="new-task-title-1"[^>]*type="text"/);
    assert.match(rows(initial)[0], /<button type="submit">Rename task<\/button>/);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks/1/rename', { title, filter: 'Completed' });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.match(html, /<option selected>Completed/);
      assert.equal(rows(html).length, 1);
      assert.match(rows(html)[0], /aria-label="Complete Original" checked/);
      assert.equal(await page('/projects/1'), initial);
    }
    for (const path of ['/projects/2/tasks/1/rename', '/projects/1/tasks/999/rename', '/projects/999/tasks/1/rename']) {
      assert.equal((await post(path, { title: 'Blocked' })).status, 404);
    }
    const renamed = await post('/projects/1/tasks/1/rename', { title: '  New & <title>  ', filter: 'Completed' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const detail = await page('/projects/1');
    assert.equal(detail, initial.replaceAll('Original', 'New &amp; &lt;title&gt;'));
    assert.match(rows(detail)[0], /<span>New &amp; &lt;title&gt;<\/span>/);
    assert.match(rows(detail)[0], /aria-label="Complete New &amp; &lt;title&gt;" checked/);
    assert.match(rows(detail)[1], /<span>Pending<\/span>/);
    assert.equal(rows(await page('/projects/1?filter=Completed')).length, 1);
    assert.match(rows(await page('/projects/1?filter=Open'))[0], /Complete Pending/);
    assert.doesNotMatch(await page('/projects/2'), /New &amp;|Original|Pending/);
    assert.equal(await page('/'), list);

    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page('/projects/1'), detail);
    assert.equal(await page('/'), list);
    await post('/projects/1/archive');
    const archived = await page('/projects/1');
    for (const row of rows(archived)) {
      assert.match(row, /id="new-task-title-\d+"[^>]* disabled>/);
      assert.match(row, /<button type="submit" disabled>Rename task<\/button>/);
    }
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Blocked' })).status, 409);
    assert.equal(await page('/projects/1'), archived);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await page('/projects/1'), detail);
    assert.equal(await page('/'), list);
    assert.equal((await post('/projects/1/tasks/2/rename', { title: ' Restored task ', filter: 'Open' })).status, 303);
    const restored = await page('/projects/1');
    assert.equal(restored, detail.replaceAll('Pending', 'Restored task'));
    assert.match(rows(restored)[1], /aria-label="Complete Restored task">/);
    assert.equal(await page('/'), list);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page('/projects/1'), restored);
    assert.equal(await page('/'), list);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('combined filters intersect completion and priority without changing order, ownership or summaries', () => {
  const projects = openProjects(':memory:');
  try {
    projects.create('First');
    projects.create('Second');
    const tasks = [];
    for (const priority of ['Low', 'Normal', 'High']) {
      for (const completed of [false, true]) {
        projects.createTask(1, `${priority} ${completed ? 'done' : 'open'}`);
        const id = tasks.length + 1;
        projects.setTaskPriority(1, id, priority);
        projects.setTaskCompleted(1, id, completed);
        tasks.push({ id, priority, completed });
      }
    }
    projects.createTask(2, 'Private');
    const original = projects.listTasks(1);
    const summary = projects.list();
    for (const completion of ['All', 'Open', 'Completed']) {
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        const expected = tasks.filter((task) =>
          (completion === 'All' || task.completed === (completion === 'Completed')) &&
          (priority === 'All' || task.priority === priority)).map((task) => task.id);
        assert.deepEqual(projects.listTasks(1, completion, priority).map((task) => task.id), expected);
      }
    }
    assert.deepEqual(projects.listTasks(1, 'invalid', 'invalid'), original);
    assert.deepEqual(projects.list(), summary);
    projects.setArchived(1, true);
    assert.deepEqual(projects.listTasks(1, 'Completed', 'High').map((task) => task.id), [6]);
  } finally {
    projects.close();
  }
});

test('combined filter controls survive edits, validation, reload, restart and archive/restore', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-filters-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const page = async (path) => (await fetch(`${server.url}${path}`)).text();
    const rows = (html) => [...html.matchAll(/<div data-testid="task-row"[\s\S]*?<\/div>/g)]
      .map((match) => match[0]);
    const titles = (html) => rows(html).map((row) => row.match(/<span>(.*?)<\/span>/)[1]);
    const assertFilters = (html, completion, priority) => {
      const form = html.match(/<form[^>]*class="task-filter"[^>]*>([\s\S]*?)<\/form>/)[1];
      for (const [id, options, selected] of [
        ['task-filter', ['All', 'Open', 'Completed'], completion],
        ['priority-filter', ['All', 'Low', 'Normal', 'High'], priority],
      ]) {
        const select = form.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`));
        assert.ok(select);
        assert.doesNotMatch(select[0], /disabled/);
        assert.deepEqual([...select[1].matchAll(/<option(?: selected)?>(.*?)<\/option>/g)].map((match) => match[1]), options);
        assert.match(select[1], new RegExp(`<option selected>${selected}</option>`));
      }
      // Every project-page mutation form must retain both selected filters.
      for (const match of html.matchAll(/<form[^>]*method="post"[^>]*>([\s\S]*?)<\/form>/g)) {
        assert.match(match[1], new RegExp(`name="filter" value="${completion}"`));
        assert.match(match[1], new RegExp(`name="priorityFilter" value="${priority}"`));
      }
    };
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    for (const title of ['First high', 'Normal', 'Low', 'Second high']) {
      await post('/projects/1/tasks', { title });
    }
    await post('/projects/2/tasks', { title: 'Private' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/3/priority', { priority: 'Low' });
    await post('/projects/1/tasks/4/priority', { priority: 'High' });
    await post('/projects/1/tasks/4/completion', { completed: 'on' });
    const summary = await page('/');
    assertFilters(await page('/projects/1'), 'All', 'All');
    const filteredPath = '/projects/1?filter=Open&priorityFilter=High';
    let html = await page(filteredPath);
    assertFilters(html, 'Open', 'High');
    assert.match(html, /<label for="priority-filter">Priority filter<\/label>/);
    assert.deepEqual(titles(html), ['First high']);
    assert.deepEqual(titles(await page('/projects/1?filter=All&priorityFilter=High')), ['First high', 'Second high']);
    assertFilters(await page('/projects/1?filter=Completed&priorityFilter=High'), 'Completed', 'High');
    assert.deepEqual(titles(await page('/projects/1?filter=Open&priorityFilter=Low')), ['Low']);
    assertFilters(await page('/projects/1?filter=Open&priorityFilter=invalid'), 'Open', 'All');
    assert.equal(await page('/'), summary);
    const filters = { filter: 'Open', priorityFilter: 'High' };
    for (const [path, values, error] of [
      ['/projects/1/tasks/1/rename', { title: ' ' }, 'Task title is required'],
      ['/projects/1/tasks', { title: ' ' }, 'Task title is required'],
      ['/projects/1/rename', { name: ' ' }, 'Project name is required'],
      ['/projects/1/tasks/1/priority', { priority: 'Urgent' }, 'Invalid task priority'],
    ]) {
      const response = await post(path, { ...filters, ...values });
      assert.equal(response.status, 400);
      const errorPage = await response.text();
      assert.match(errorPage, new RegExp(`role="alert">${error}`));
      assertFilters(errorPage, 'Open', 'High');
      assert.deepEqual(titles(errorPage), ['First high']);
    }
    const edit = async (path, values) => {
      const response = await post(path, { ...filters, ...values });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), filteredPath);
      const html = await page(response.headers.get('location'));
      assertFilters(html, 'Open', 'High');
      return html;
    };
    html = await edit('/projects/1/tasks/1/rename', { title: '  Renamed high  ' });
    assert.deepEqual(titles(html), ['Renamed high']);
    assert.match(rows(html)[0], /aria-label="Complete Renamed high"/);
    assert.equal(await page('/'), summary);
    html = await edit('/projects/1/tasks/1/priority', { priority: 'Low' });
    assert.deepEqual(titles(html), []);
    assert.equal(await page('/'), summary);
    await edit('/projects/1/tasks/1/priority', { priority: 'High' });
    html = await edit('/projects/1/tasks/1/completion', { completed: 'on' });
    assert.deepEqual(titles(html), []);
    assert.match(await page('/'), /data-testid="project-summary">2\/4 completed/);
    html = await edit('/projects/1/tasks/4/completion', {});
    assert.deepEqual(titles(html), ['Second high']);
    assert.equal(await page('/'), summary);
    assert.deepEqual(titles(await page('/projects/2')), ['Private']);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page(filteredPath), html);
    assertFilters(await page('/projects/1'), 'All', 'All');
    await post('/projects/1/archive');
    const archived = await page(filteredPath);
    assertFilters(archived, 'Open', 'High');
    assert.deepEqual(titles(archived), ['Second high']);
    assert.match(rows(archived)[0], /type="checkbox"[^>]* disabled/);
    assert.match(rows(archived)[0], /name="priority" disabled/);
    assert.match(rows(archived)[0], /id="new-task-title-4"[^>]* disabled/);
    assert.match(rows(archived)[0], /disabled>Rename task/);
    assert.deepEqual(titles(await page('/projects/1?filter=Completed&priorityFilter=High')), ['Renamed high']);
    assert.match(await page('/?filter=Archived'), /data-testid="project-summary">1\/4 completed/);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page(filteredPath), archived);
    await post('/projects/1/restore');
    assert.equal(await page(filteredPath), html);
    assert.equal(await page('/'), summary);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project default migration preserves existing tasks and applies defaults only to subsequent tasks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-default-migration-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let projects;
  try {
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
      INSERT INTO projects (name) VALUES ('Existing'), ('Other');
      INSERT INTO tasks (project_id, title, completed, priority) VALUES (1, 'Saved high', 1, 'High'), (1, 'Saved normal', 0, 'Normal');
    `);
    database.close();
    projects = openProjects(databasePath);
    assert.equal(projects.find(1).default_task_priority, 'Normal');
    projects.create('New');
    assert.equal(projects.find(3).default_task_priority, 'Normal');
    const existing = projects.listTasks(1);
    const summary = projects.list();
    for (const priority of ['', 'Urgent', 'high', null]) {
      assert.equal(projects.setDefaultTaskPriority(1, priority), false);
    }
    assert.equal(projects.setDefaultTaskPriority(999, 'High'), false);
    assert.equal(projects.setDefaultTaskPriority(1, 'Low'), true);
    assert.equal(projects.find(2).default_task_priority, 'Normal');
    assert.deepEqual(projects.listTasks(1), existing);
    assert.deepEqual(projects.list(), summary);
    projects.createTask(1, '  Inherited low  ');
    projects.createTask(2, 'Independent normal');
    assert.equal(projects.listTasks(1)[2].priority, 'Low');
    assert.equal(projects.listTasks(1)[2].title, 'Inherited low');
    assert.equal(projects.listTasks(1)[2].completed, 0);
    assert.equal(projects.listTasks(2)[0].priority, 'Normal');
    projects.setDefaultTaskPriority(1, 'High');
    projects.renameTask(1, 3, 'Renamed low');
    assert.equal(projects.listTasks(1)[2].priority, 'Low');
    projects.rename(1, 'Renamed project');
    projects.setArchived(1, true);
    assert.equal(projects.setDefaultTaskPriority(1, 'Normal'), false);
    assert.equal(projects.createTask(1, 'Blocked'), false);
    projects.close();
    projects = openProjects(databasePath);
    assert.equal(projects.find(1).default_task_priority, 'High');
    assert.deepEqual(projects.listTasks(1).slice(0, 2), existing);
    projects.setArchived(1, false);
    projects.createTask(1, 'Inherited high');
    assert.deepEqual(projects.listTasks(1).map((task) => task.priority), ['High', 'Normal', 'Low', 'High']);
    assert.equal(projects.list()[0].completed_count, 1);
    assert.equal(projects.list()[0].total_count, 4);
  } finally {
    if (projects) projects.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('default priority controls preserve filters and saved data across edits, restart, archive and restore', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-default-http-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const page = async (path) => (await fetch(`${server.url}${path}`)).text();
    const rows = (html) => [...html.matchAll(/<div data-testid="task-row"[\s\S]*?<\/div>/g)].map((match) => match[0]);
    const assertDefault = (html, priority, disabled = false) => {
      assert.match(html, /<label for="default-task-priority">Default task priority<\/label>/);
      const select = html.match(/<select id="default-task-priority"[^>]*>([\s\S]*?)<\/select>/);
      assert.ok(select);
      assert.equal(select[0].includes('disabled'), disabled);
      assert.deepEqual([...select[1].matchAll(/<option(?: selected)?>(.*?)<\/option>/g)].map((match) => match[1]), ['Low', 'Normal', 'High']);
      assert.match(select[1], new RegExp(`<option selected>${priority}</option>`));
      const form = html.match(/<form[^>]*action="[^\"]*\/default-priority"[^>]*>/)[0];
      assert.match(form, /data-auto-submit/);
    };
    const filters = { filter: 'Open', priorityFilter: 'Normal' };
    const filteredPath = '/projects/1?filter=Open&priorityFilter=Normal';
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Existing normal' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks/2/completion', { completed: 'on' });
    const initial = await page(filteredPath);
    const summary = await page('/');
    assertDefault(initial, 'Normal');
    for (const priority of ['', 'Urgent', 'normal']) {
      const response = await post('/projects/1/default-priority', { ...filters, priority });
      assert.equal(response.status, 400);
      assert.match(await response.text(), /role="alert">Invalid task priority/);
      assert.equal(await page(filteredPath), initial);
    }
    assert.equal((await post('/projects/999/default-priority', { priority: 'High' })).status, 404);
    const changed = await post('/projects/1/default-priority', { ...filters, priority: 'High' });
    assert.equal(changed.status, 303);
    assert.equal(changed.headers.get('location'), filteredPath);
    const high = await page(filteredPath);
    assertDefault(high, 'High');
    assert.deepEqual(rows(high), rows(initial));
    assert.match(high, /<select id="task-filter"[^>]*>\s*<option>All<\/option><option selected>Open/);
    assert.match(high, /<select id="priority-filter"[^>]*>\s*<option>All<\/option><option>Low<\/option><option selected>Normal/);
    assert.equal(await page('/'), summary);
    assertDefault(await page('/projects/2'), 'Normal');
    await post('/projects/1/tasks', { ...filters, title: 'Inherited high' });
    assert.deepEqual(rows(await page(filteredPath)), rows(initial));
    assert.match(rows(await page('/projects/1?priorityFilter=High'))[0], /<span>Inherited high<\/span>/);
    await post('/projects/1/default-priority', { ...filters, priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Inherited low' });
    await post('/projects/2/tasks', { title: 'Independent normal' });
    assert.match(rows(await page('/projects/2'))[0], /<option selected>Normal/);
    await post('/projects/1/rename', { ...filters, name: 'Renamed project' });
    assertDefault(await page(filteredPath), 'Low');
    const beforeArchive = await page('/projects/1');
    const savedSummary = await page('/');
    await post('/projects/1/archive');
    const archived = await page('/projects/1');
    assertDefault(archived, 'Low', true);
    assert.equal((await post('/projects/1/default-priority', { priority: 'High' })).status, 409);
    assert.equal(await page('/projects/1'), archived);
    assert.equal(rows(await page(filteredPath)).length, 1);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await page('/projects/1'), beforeArchive);
    assert.equal(await page('/'), savedSummary);
    await post('/projects/1/tasks', { title: 'Restored low' });
    const restored = await page('/projects/1');
    assertDefault(restored, 'Low');
    assert.equal(rows(restored).length, 5);
    assert.match(rows(restored)[4], /<option selected>Low/);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page('/projects/1'), restored);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
