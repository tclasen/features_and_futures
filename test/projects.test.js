import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const port = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => reject(new Error(`Server exited: ${code}, ${output}`)));
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(match[1]);
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

test('due dates validate calendar days, migrate, preserve task state, and persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-dates-'));
  const databasePath = join(directory, 'dates.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Dates'), ('Other');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Legacy', 1)`);
  legacy.close();
  let server;
  try {
    server = await start(databasePath);
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const html = async (path) => (await fetch(`${server.url}${path}`)).text();
    const dateInput = (body, id = 1) => body.match(new RegExp(`<input id="task-due-date-${id}"[^>]*>`))[0];
    const fields = { filter: 'Completed', priorityFilter: 'High' };
    const filteredUrl = '/projects/1?filter=Completed&priorityFilter=High';
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks', { title: 'New' });
    await post('/projects/2/tasks', { title: 'Other task' });
    assert.match(dateInput(await html('/projects/1')), /type="text" value=""/);
    assert.match(dateInput(await html('/projects/1'), 2), /value=""/);
    const save = (dueDate) => post('/projects/1/tasks/1/due-date', { ...fields, dueDate });
    for (const dueDate of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', ' 2025-04-30 ']) {
      const response = await save(dueDate);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), filteredUrl);
      assert.match(dateInput(await html(filteredUrl)), new RegExp(`value="${dueDate.trim()}"`));
    }
    const before = await html(filteredUrl);
    for (const dueDate of ['0000-01-01', '10000-01-01', '1900-02-29', '2025-02-29', '2025-04-31',
      '2025-00-01', '2025-13-01', '2025-01-00', '2025-01-32', '2025-1-01', '2025-01-1', '2025-01-01T00:00:00Z', 'not a date']) {
      const response = await save(dueDate);
      assert.equal(response.status, 400, dueDate);
      assert.match(await response.text(), /role="alert">Due date must be a valid YYYY-MM-DD date/);
      assert.equal(await html(filteredUrl), before);
    }
    assert.equal((await post('/projects/2/tasks/1/due-date', { dueDate: '2020-01-01' })).status, 404);
    await post('/projects/1/tasks/1/rename', { ...fields, title: 'Renamed' });
    let body = await html(filteredUrl);
    assert.match(body, /aria-label="Complete Renamed" checked/);
    assert.match(body, /<option selected>Completed<\/option>/);
    assert.match(body, /<option selected>High<\/option>/);
    assert.match(dateInput(body), /value="2025-04-30"/);
    assert.match(dateInput(await html('/projects/2'), 3), /value=""/);
    assert.match(await html('/'), /1\/2 completed/);
    await post('/projects/1/archive');
    body = await html(filteredUrl);
    assert.match(dateInput(body), /disabled/);
    assert.match(body, /<button type="submit" disabled>Save due date<\/button>/);
    assert.equal((await save('2020-01-01')).status, 403);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await html(filteredUrl), body);
    await post('/projects/1/restore');
    assert.doesNotMatch(dateInput(await html(filteredUrl)), /disabled/);
    for (const dueDate of ['', '   ']) {
      await save('2024-02-29');
      assert.equal((await save(dueDate)).status, 303);
      assert.match(dateInput(await html(filteredUrl)), /value=""/);
    }
    await server.stop();
    server = await start(databasePath);
    assert.match(dateInput(await html(filteredUrl)), /value=""/);
    assert.match(await html('/'), /1\/2 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project priority defaults migrate, persist, and affect only subsequent owned tasks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-defaults-'));
  const databasePath = join(directory, 'defaults.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Legacy');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing', 1)`);
  legacy.close();
  let server;
  try {
    server = await start(databasePath);
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const html = async (path) => (await fetch(`${server.url}${path}`)).text();
    const selection = (body, id) => body.match(new RegExp(`<select id="${id}"[^>]*>[\\s\\S]*?<\\/select>`))[0];
    const defaultSelect = (body) => selection(body, 'default-task-priority');
    let body = await html('/projects/1');
    assert.match(body, /<label for="default-task-priority">Default task priority<\/label>/);
    assert.match(defaultSelect(body), /<option>Low<\/option><option selected>Normal<\/option><option>High<\/option>/);
    assert.match(selection(body, 'task-priority-1'), /<option selected>Normal<\/option>/);
    await post('/projects', { name: 'Independent' });
    const fields = { filter: 'Completed', priorityFilter: 'Normal' };
    const filteredUrl = '/projects/1?filter=Completed&priorityFilter=Normal';
    const before = await html(filteredUrl);
    const changed = await post('/projects/1/default-priority', { ...fields, priority: 'High' });
    assert.equal(changed.status, 303);
    assert.equal(changed.headers.get('location'), filteredUrl);
    body = await html(filteredUrl);
    assert.match(selection(body, 'task-filter'), /<option selected>Completed<\/option>/);
    assert.match(selection(body, 'priority-filter'), /<option selected>Normal<\/option>/);
    assert.equal(body.slice(body.indexOf('<ul>')), before.slice(before.indexOf('<ul>')));
    assert.match(await html('/'), /1\/1 completed/);
    assert.match(defaultSelect(await html('/projects/2')), /<option selected>Normal<\/option>/);
    await post('/projects/1/tasks', { title: 'Inherited high' });
    await post('/projects/2/tasks', { title: 'Other normal' });
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Inherited low' });
    await post('/projects/1/tasks/2', { completed: '1' });
    await post('/projects/1/tasks/2/rename', { title: 'Renamed high' });
    await post('/projects/1/rename', { name: 'Renamed project' });
    body = await html('/projects/1');
    assert.match(selection(body, 'task-priority-1'), /<option selected>Normal<\/option>/);
    assert.match(selection(body, 'task-priority-2'), /<option selected>High<\/option>/);
    assert.match(selection(body, 'task-priority-4'), /<option selected>Low<\/option>/);
    assert.match(body, /aria-label="Complete Renamed high" checked/);
    assert.match(selection(await html('/projects/2'), 'task-priority-3'), /<option selected>Normal<\/option>/);
    assert.match(await html('/'), /2\/3 completed/);
    assert.equal((await post('/projects/1/default-priority', { priority: 'Invalid' })).status, 400);
    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    assert.match(defaultSelect(archived), /disabled/);
    assert.match(defaultSelect(archived), /<option selected>Low<\/option>/);
    assert.equal((await post('/projects/1/default-priority', { priority: 'Normal' })).status, 403);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await html('/projects/1'), archived);
    await post('/projects/1/restore');
    body = await html('/projects/1');
    assert.doesNotMatch(defaultSelect(body), /disabled/);
    assert.match(defaultSelect(body), /<option selected>Low<\/option>/);
    await post('/projects/1/tasks', { title: 'After restart' });
    assert.match(selection(await html('/projects/1'), 'task-priority-5'), /<option selected>Low<\/option>/);
    assert.match(await html('/'), /2\/4 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('combined filters preserve selections, re-evaluate edits, and work while archived', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-filters-'));
  const databasePath = join(directory, 'tasks.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const html = async (path = '/') => (await fetch(`${server.url}${path}`)).text();
    const view = (filter, priorityFilter) => `/projects/1?${new URLSearchParams({ filter, priorityFilter })}`;
    const rows = (body) => [...body.matchAll(/data-testid="task-row">\s*<span>(.*?)<\/span>/g)].map((match) => match[1]);
    const select = (body, id) => body.match(new RegExp(`<select id="${id}"[^>]*>[\\s\\S]*?<\\/select>`))[0];
    const selections = (body, completion, priority) => {
      assert.match(select(body, 'task-filter'), new RegExp(`<option selected>${completion}<\\/option>`));
      assert.match(select(body, 'priority-filter'), new RegExp(`<option selected>${priority}<\\/option>`));
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
    const defaultPage = await html('/projects/1');
    selections(defaultPage, 'All', 'All');
    assert.match(select(defaultPage, 'priority-filter'), /<option selected>All<\/option><option>Low<\/option><option>Normal<\/option><option>High<\/option>/);
    // Both selects are in one GET form, so changing either submits the other too.
    assert.match(defaultPage, /<form[^>]*method="get">\s*<label for="task-filter">[\s\S]*?id="priority-filter"[\s\S]*?<\/form>/);
    for (const completion of ['All', 'Open', 'Completed']) {
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        const body = await html(view(completion, priority));
        selections(body, completion, priority);
        assert.deepEqual(rows(body), tasks.filter((task) =>
          (completion === 'All' || task.completed === (completion === 'Completed')) &&
          (priority === 'All' || task.priority === priority)).map((task) => task.title));
      }
    }
    assert.match(await html(), /3\/6 completed/);
    const fields = { filter: 'Open', priorityFilter: 'High' };
    const rename = await post('/projects/1/tasks/5/rename', { ...fields, title: '  Renamed high  ' });
    assert.equal(rename.status, 303);
    assert.equal(rename.headers.get('location'), view('Open', 'High'));
    let body = await html(rename.headers.get('location'));
    selections(body, 'Open', 'High');
    assert.deepEqual(rows(body), ['Renamed high']);
    assert.match(body, /aria-label="Complete Renamed high"/);
    assert.match(select(body, 'task-priority-5'), /<option selected>High<\/option>/);
    for (const form of body.matchAll(/<form[^>]*method="post">([\s\S]*?)<\/form>/g)) {
      assert.match(form[1], /name="filter" value="Open"/);
      assert.match(form[1], /name="priorityFilter" value="High"/);
    }
    const invalid = await post('/projects/1/tasks/5/rename', { ...fields, title: ' ' });
    selections(await invalid.text(), 'Open', 'High');
    const changedPriority = await post('/projects/1/tasks/5/priority', { ...fields, priority: 'Low' });
    body = await html(changedPriority.headers.get('location'));
    selections(body, 'Open', 'High');
    assert.deepEqual(rows(body), []);
    assert.match(await html(), /3\/6 completed/);
    await post('/projects/1/tasks/5/priority', { priority: 'High' });
    const changedCompletion = await post('/projects/1/tasks/5', { ...fields, completed: '1' });
    body = await html(changedCompletion.headers.get('location'));
    selections(body, 'Open', 'High');
    assert.deepEqual(rows(body), []);
    assert.deepEqual(rows(await html(view('Completed', 'High'))), ['Renamed high', 'High done']);
    assert.match(await html(), /4\/6 completed/);
    await post('/projects/1/archive');
    const archived = await html(view('Completed', 'High'));
    selections(archived, 'Completed', 'High');
    assert.doesNotMatch(select(archived, 'task-filter'), /disabled/);
    assert.doesNotMatch(select(archived, 'priority-filter'), /disabled/);
    assert.equal((archived.match(/type="checkbox"[^>]* disabled/g) || []).length, 2);
    assert.equal((archived.match(/id="task-priority-\d+"[^>]* disabled/g) || []).length, 2);
    assert.equal((archived.match(/id="new-task-title-\d+"[^>]* disabled/g) || []).length, 2);
    assert.equal((archived.match(/disabled>Rename task/g) || []).length, 2);
    const denied = await post('/projects/1/tasks/5/priority', { ...fields, priority: 'Normal' });
    assert.equal(denied.status, 403);
    selections(await denied.text(), 'Open', 'High');
    await server.stop();
    server = await start(databasePath);
    assert.equal(await html(view('Completed', 'High')), archived);
    await post('/projects/1/restore');
    body = await html(view('Completed', 'High'));
    assert.deepEqual(rows(body), ['Renamed high', 'High done']);
    assert.doesNotMatch(body, / disabled/);
    selections(await html('/projects/1'), 'All', 'All');
    assert.match(await html(), /4\/6 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('projects validate, trim, render safely, navigate, and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const initial = await (await fetch(server.url)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);

    async function create(name) {
      return fetch(`${server.url}/projects`, {
        method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
      });
    }
    for (const name of ['', '   \t\n']) {
      const invalid = await create(name);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    assert.equal((await create('  First project  ')).status, 303);
    assert.equal((await create('Second <script>alert(1)</script>')).status, 303);
    const list = await (await fetch(server.url)).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(list, /<span>First project<\/span>/);
    assert.match(list, /Second &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.ok(list.indexOf('First project') < list.indexOf('Second &lt;'));
    const path = list.match(/action="(\/projects\/\d+)"/)[1];
    const detail = await (await fetch(`${server.url}${path}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/" method="get"><button type="submit">Projects/);
    assert.equal((await fetch(`${server.url}/projects/99999`)).status, 404);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await (await fetch(server.url)).text(), list);
    assert.equal(await (await fetch(`${server.url}${path}`)).text(), detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive, restore, summaries, and migration preserve tasks across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const databasePath = join(directory, 'projects.sqlite');
  // Simulate a database from the previous checkpoint.
  const oldDb = new DatabaseSync(databasePath);
  oldDb.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    INSERT INTO projects (name) VALUES ('Existing project')`);
  oldDb.close();
  let server;
  try {
    server = await start(databasePath);
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const html = async (path = '/') => (await fetch(`${server.url}${path}`)).text();
    const initial = await html();
    assert.match(initial, /<label for="project-filter">Project filter<\/label>/);
    assert.match(initial, /<option selected>Active<\/option>/);
    assert.match(initial, /data-testid="project-summary">0\/0 completed/);
    await post('/projects/1/tasks', { title: 'First task' });
    await post('/projects/1/tasks', { title: 'Second task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    await html('/projects/1?filter=Open');
    assert.match(await html(), /data-testid="project-summary">1\/2 completed/);
    assert.equal((await post('/projects/1/archive')).status, 303);
    assert.doesNotMatch(await html(), /data-testid="project-row"/);
    const archivedList = await html('/?filter=Archived');
    assert.match(archivedList, />Restore project<\/button>/);
    assert.match(archivedList, />Open project<\/button>/);
    assert.match(archivedList, /1\/2 completed/);
    const archivedPage = await html('/projects/1');
    assert.match(archivedPage, /<p>Archived project<\/p>/);
    assert.match(archivedPage, /disabled>Create task<\/button>/);
    assert.equal((archivedPage.match(/type="checkbox"[^>]* disabled/g) || []).length, 2);
    assert.equal((await post('/projects/1/tasks', { title: 'Forbidden' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1', {})).status, 403);
    assert.doesNotMatch(await html('/projects/1?filter=Completed'), /Second task/);
    assert.doesNotMatch(await html('/projects/1?filter=Open'), /First task/);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await html('/?filter=Archived'), archivedList);
    assert.equal(await html('/projects/1'), archivedPage);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.doesNotMatch(await html('/?filter=Archived'), /data-testid="project-row"/);
    assert.match(await html(), /1\/2 completed/);
    assert.doesNotMatch(await html('/projects/1'), / disabled|Archived project/);
    await post('/projects/1/tasks/2', { completed: '1' });
    assert.match(await html(), /2\/2 completed/);
    await server.stop();
    server = await start(databasePath);
    assert.match(await html(), /2\/2 completed/);
    assert.doesNotMatch(await html('/projects/1'), / disabled|Archived project/);
    assert.equal((await post('/projects/999/archive')).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('rename validates and preserves identity, order, tasks, and archive protection', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const databasePath = join(directory, 'projects.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const html = async (path = '/') => (await fetch(`${server.url}${path}`)).text();
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Saved task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const initial = await html('/projects/1');
    assert.match(initial, /<label for="new-project-name">New project name<\/label>/);
    assert.match(initial, />Rename project<\/button>/);
    for (const name of ['', ' \t\n']) {
      const response = await post('/projects/1/rename', { name });
      assert.equal(response.status, 400);
      const body = await response.text();
      assert.match(body, /role="alert">Project name is required/);
      assert.match(body, /<h1>Original<\/h1>/);
    }
    const renamed = await post('/projects/1/rename', { name: '  Renamed <project>  ', filter: 'Completed' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const list = await html();
    assert.match(list, /<span>Renamed &lt;project&gt;<\/span>/);
    assert.ok(list.indexOf('Renamed &lt;project&gt;') < list.indexOf('<span>Second'));
    assert.match(list, /data-testid="project-summary">1\/1 completed/);
    const detail = await html('/projects/1');
    assert.match(detail, /<h1>Renamed &lt;project&gt;<\/h1>/);
    assert.match(detail, /Complete Saved task" checked/);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await html(), list);
    assert.equal(await html('/projects/1'), detail);
    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    assert.match(archived, /id="new-project-name"[^>]* disabled/);
    assert.match(archived, /disabled>Rename project<\/button>/);
    assert.equal((await post('/projects/1/rename', { name: 'Forbidden' })).status, 403);
    assert.equal(await html('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.doesNotMatch(await html('/projects/1'), / disabled/);
    assert.equal((await post('/projects/1/rename', { name: 'Restored name' })).status, 303);
    await server.stop();
    server = await start(databasePath);
    assert.match(await html('/projects/1'), /<h1>Restored name<\/h1>/);
    assert.match(await html('/projects/1'), /Complete Saved task" checked/);
    assert.match(await html(), /1\/1 completed/);
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task rename preserves order, ownership, completion, filters, and archive protection', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  const databasePath = join(directory, 'tasks.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const html = async (path = '/') => (await fetch(`${server.url}${path}`)).text();
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Original' });
    await post('/projects/1/tasks', { title: 'Later task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const initial = await html('/projects/1');
    assert.match(initial, /<label for="new-task-title-1">New task title<\/label>/);
    assert.equal((initial.match(/>Rename task<\/button>/g) || []).length, 2);
    for (const title of ['', ' \t\n']) {
      const response = await post('/projects/1/tasks/1/rename', { title, filter: 'Completed' });
      assert.equal(response.status, 400);
      const body = await response.text();
      assert.match(body, /role="alert">Task title is required/);
      assert.match(body, /Complete Original" checked/);
      assert.match(body, /<option selected>Completed<\/option>/);
      assert.equal(await html('/projects/1'), initial);
    }
    assert.equal((await post('/projects/2/tasks/1/rename', { title: 'Forbidden' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/rename', { title: 'Missing' })).status, 404);
    const renamed = await post('/projects/1/tasks/1/rename', {
      title: '  Renamed <task> "title"  ', filter: 'Completed',
    });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const detail = await html('/projects/1');
    assert.match(detail, /<span>Renamed &lt;task&gt; &quot;title&quot;<\/span>/);
    assert.match(detail, /aria-label="Complete Renamed &lt;task&gt; &quot;title&quot;" checked/);
    assert.ok(detail.indexOf('<span>Renamed') < detail.indexOf('<span>Later task'));
    assert.match(detail, /action="\/projects\/1\/tasks\/1\/rename"/);
    assert.doesNotMatch(await html('/projects/2'), /data-testid="task-row"/);
    assert.doesNotMatch(await html('/projects/1?filter=Open'), /Renamed/);
    assert.doesNotMatch(await html('/projects/1?filter=Completed'), /Later task/);
    assert.match(await html(), /data-testid="project-summary">1\/2 completed/);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await html('/projects/1'), detail);
    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    assert.equal((archived.match(/id="new-task-title-\d+"[^>]* disabled/g) || []).length, 2);
    assert.equal((archived.match(/disabled>Rename task<\/button>/g) || []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Forbidden' })).status, 403);
    assert.equal(await html('/projects/1'), archived);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await html('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.doesNotMatch(await html('/projects/1'), / disabled/);
    assert.equal((await post('/projects/1/tasks/2/rename', { title: '  Renamed open task  ', filter: 'Open' })).status, 303);
    const open = await html('/projects/1?filter=Open');
    assert.match(open, /<span>Renamed open task<\/span>/);
    assert.match(open, /aria-label="Complete Renamed open task"/);
    assert.doesNotMatch(open, / checked/);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await html('/projects/1?filter=Open'), open);
    assert.match(await html(), /1\/2 completed/);
    await post('/projects/1/tasks/1', {});
    assert.doesNotMatch(await html('/projects/1?filter=Completed'), /data-testid="task-row"/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('priorities migrate, default, stay independent, and persist through rename and archive', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  const databasePath = join(directory, 'tasks.sqlite');
  const oldDb = new DatabaseSync(databasePath);
  oldDb.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('First'), ('Second');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing', 1)`);
  oldDb.close();
  let server;
  try {
    server = await start(databasePath);
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const html = async (path = '/') => (await fetch(`${server.url}${path}`)).text();
    const prioritySelect = (body, id) => body.match(new RegExp(`<select id="task-priority-${id}"[^>]*>[\\s\\S]*?<\\/select>`))[0];
    const normalOptions = /<option>Low<\/option><option selected>Normal<\/option><option>High<\/option>/;
    assert.match(prioritySelect(await html('/projects/1'), 1), normalOptions);
    await post('/projects/1/tasks', { title: 'New task' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    assert.match(prioritySelect(await html('/projects/1'), 2), normalOptions);
    for (const priority of ['Low', 'Normal', 'High']) {
      const response = await post('/projects/1/tasks/1/priority', { priority, filter: 'Completed' });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/projects/1?filter=Completed');
      assert.match(prioritySelect(await html('/projects/1'), 1), new RegExp(`<option selected>${priority}<\\/option>`));
    }
    await post('/projects/1/tasks/2/priority', { priority: 'Low' });
    const beforeInvalid = await html('/projects/1');
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Urgent' })).status, 400);
    assert.equal((await post('/projects/2/tasks/1/priority', { priority: 'Low' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/priority', { priority: 'Low' })).status, 404);
    assert.equal(await html('/projects/1'), beforeInvalid);
    assert.match(prioritySelect(await html('/projects/2'), 3), normalOptions);
    await post('/projects/1/tasks/1/rename', { title: 'Renamed' });
    const detail = await html('/projects/1');
    assert.match(prioritySelect(detail, 1), /<option selected>High<\/option>/);
    assert.match(prioritySelect(detail, 2), /<option selected>Low<\/option>/);
    assert.match(detail, /Complete Renamed" checked/);
    assert.ok(detail.indexOf('<span>Renamed') < detail.indexOf('<span>New task'));
    assert.doesNotMatch(await html('/projects/1?filter=Open'), /Complete Renamed/);
    assert.doesNotMatch(await html('/projects/1?filter=Completed'), /Complete New task/);
    assert.match(await html(), /1\/2 completed/);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await html('/projects/1'), detail);
    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    assert.match(prioritySelect(archived, 1), / disabled/);
    assert.match(prioritySelect(archived, 2), / disabled/);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Normal' })).status, 403);
    assert.equal(await html('/projects/1'), archived);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await html('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), detail);
    await post('/projects/1/tasks/2/priority', { priority: 'High', filter: 'Open' });
    assert.match(prioritySelect(await html('/projects/1?filter=Open'), 2), /<option selected>High<\/option>/);
    assert.match(await html(), /1\/2 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, stay project-scoped, and persist completion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const databasePath = join(directory, 'tasks.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const post = (path, fields) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const html = async (path) => (await fetch(`${server.url}${path}`)).text();
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const initial = await html('/projects/1');
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option>/);
    for (const title of ['', ' \t\n']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      const body = await response.text();
      assert.match(body, /role="alert">Task title is required/);
      assert.doesNotMatch(body, /data-testid="task-row"/);
    }
    await post('/projects/1/tasks', { title: '  First task  ' });
    await post('/projects/1/tasks', { title: 'Second <task>' });
    const all = await html('/projects/1');
    assert.equal((all.match(/data-testid="task-row"/g) || []).length, 2);
    assert.match(all, /<span>First task<\/span>/);
    assert.match(all, /aria-label="Complete First task"/);
    assert.ok(all.indexOf('First task') < all.indexOf('Second &lt;task&gt;'));
    assert.doesNotMatch(all, / checked/);
    assert.doesNotMatch(await html('/projects/2'), /data-testid="task-row"/);
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    await post('/projects/1/tasks/1', { completed: '1' });
    const completed = await html('/projects/1?filter=Completed');
    assert.match(completed, /Complete First task" checked/);
    assert.doesNotMatch(completed, /Second &lt;task&gt;/);
    const open = await html('/projects/1?filter=Open');
    assert.doesNotMatch(open, /First task/);
    assert.match(open, /Second &lt;task&gt;/);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await html('/projects/1?filter=Completed'), completed);
    assert.equal(await html('/projects/1?filter=Open'), open);
    await post('/projects/1/tasks/1', {});
    assert.doesNotMatch(await html('/projects/1?filter=Completed'), /data-testid="task-row"/);
    assert.equal((await html('/projects/1?filter=Open')).match(/data-testid="task-row"/g).length, 2);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
