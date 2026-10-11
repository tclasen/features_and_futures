import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const port = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Startup timeout')); }, 5000);
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
  };
}

test('due dates validate calendar days, migrate, isolate and persist through edits and archive', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-dates-'));
  let server;
  try {
    const dbPath = join(directory, 'db.sqlite');
    const db = new DatabaseSync(dbPath);
    db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (name) VALUES ('Existing'), ('Other');
      INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Original', 1);`);
    db.close();
    server = await start(dbPath);
    const get = async path => (await fetch(server.url + path)).text();
    const post = (path, values = {}) => fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(values)
    });
    const input = (html, id) => html.match(new RegExp(`<input id="task-due-date-${id}"[^>]*>`))[0];
    assert.match(input(await get('/projects/1'), 1), /type="text" value=""/);
    await post('/projects/1/tasks', { title: 'New' });
    await post('/projects/2/tasks', { title: 'Other' });
    assert.match(input(await get('/projects/1'), 2), /value=""/);
    const selected = { filter: 'Completed', priorityFilter: 'Normal' };
    for (const date of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29']) {
      const html = await (await post('/projects/1/tasks/1/due-date', { ...selected, dueDate: `  ${date}  ` })).text();
      assert.match(input(html, 1), new RegExp(`value="${date}"`));
      assert.match(html, /id="task-filter"[\s\S]*?<option selected>Completed/);
      assert.match(html, /id="priority-filter"[\s\S]*?<option selected>Normal/);
      assert.equal((html.match(/data-testid="task-row"/g) || []).length, 1);
    }
    for (const date of ['0000-01-01', '10000-01-01', '1900-02-29', '2023-02-29', '2024-04-31', '2024-00-01', '2024-13-01', '2024-01-00', '2024-1-01', '2024-01-1', '2024-01-01T00:00:00Z', 'nonsense']) {
      const html = await (await post('/projects/1/tasks/1/due-date', { ...selected, dueDate: date })).text();
      assert.match(html, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      assert.match(input(html, 1), /value="2024-02-29"/);
    }
    assert.match(input(await get('/projects/1'), 2), /value=""/);
    assert.match(input(await get('/projects/2'), 3), /value=""/);
    assert.equal((await post('/projects/2/tasks/1/due-date', { dueDate: '2025-01-01' })).status, 404);
    await post('/projects/1/tasks/1/rename', { title: 'Renamed' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    let html = await get('/projects/1');
    assert.match(input(html, 1), /value="2024-02-29"/);
    assert.match(html, /aria-label="Complete Renamed" checked/);
    assert.match(await get('/'), /1\/2 completed/);
    await post('/projects/1/archive');
    html = await get('/projects/1');
    assert.match(input(html, 1), /value="2024-02-29" disabled/);
    assert.equal((html.match(/<button type="submit" disabled>Save due date/g) || []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/due-date', { dueDate: '' })).status, 403);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), html);
    await post('/projects/1/restore');
    assert.doesNotMatch(input(await get('/projects/1'), 1), /disabled/);
    for (const empty of ['', '   ']) {
      await post('/projects/1/tasks/1/due-date', { dueDate: '2025-12-31' });
      await post('/projects/1/tasks/1/due-date', { dueDate: empty });
      assert.match(input(await get('/projects/1'), 1), /value=""/);
    }
    html = await get('/projects/1');
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), html);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project defaults migrate, inherit independently and persist without altering existing tasks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-defaults-'));
  let server;
  try {
    const dbPath = join(directory, 'db.sqlite');
    const db = new DatabaseSync(dbPath);
    db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (name) VALUES ('Existing');
      INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Original', 1);`);
    db.close();
    server = await start(dbPath);
    const get = async path => (await fetch(server.url + path)).text();
    const post = (path, values = {}) => fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(values)
    });
    const defaultSelect = html => html.match(/<select id="default-task-priority"[^>]*>[\s\S]*?<\/select>/)[0];
    const taskSelect = (html, id) => html.match(new RegExp(`<select id="task-priority-${id}"[^>]*>[\\s\\S]*?<\\/select>`))[0];
    let html = await get('/projects/1');
    assert.match(defaultSelect(html), /<option>Low<\/option>\s*<option selected>Normal<\/option>\s*<option>High<\/option>/);
    assert.match(taskSelect(html, 1), /<option selected>Normal/);
    await post('/projects', { name: 'Independent' });
    assert.match(defaultSelect(await get('/projects/2')), /<option selected>Normal/);
    const selected = { filter: 'Completed', priorityFilter: 'Normal' };
    html = await (await post('/projects/1/default-priority', { ...selected, priority: 'High' })).text();
    assert.match(defaultSelect(html), /<option selected>High/);
    assert.match(html, /id="task-filter"[\s\S]*?<option selected>Completed/);
    assert.match(html, /id="priority-filter"[\s\S]*?<option selected>Normal/);
    assert.match(html, /aria-label="Complete Original" checked/);
    assert.equal((html.match(/data-testid="task-row"/g) || []).length, 1);
    await post('/projects/1/tasks', { title: 'Inherited high' });
    await post('/projects/2/tasks', { title: 'Independent normal' });
    html = await get('/projects/1');
    assert.match(taskSelect(html, 1), /<option selected>Normal/);
    assert.match(taskSelect(html, 2), /<option selected>High/);
    assert.match(taskSelect(await get('/projects/2'), 3), /<option selected>Normal/);
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Inherited low' });
    await post('/projects/1/tasks/2/rename', { title: 'Renamed high' });
    await post('/projects/1/rename', { name: 'Renamed project' });
    html = await get('/projects/1');
    assert.match(taskSelect(html, 2), /<option selected>High/);
    assert.match(taskSelect(html, 4), /<option selected>Low/);
    assert.ok(html.indexOf('Complete Original') < html.indexOf('Complete Renamed high'));
    assert.ok(html.indexOf('Complete Renamed high') < html.indexOf('Complete Inherited low'));
    assert.match(await get('/'), /1\/3 completed/);
    assert.equal((await post('/projects/1/default-priority', { priority: 'Invalid' })).status, 400);
    assert.equal((await post('/projects/999/default-priority', { priority: 'High' })).status, 404);
    await post('/projects/1/archive');
    html = await get('/projects/1');
    assert.match(defaultSelect(html), / disabled/);
    assert.match(defaultSelect(html), /<option selected>Low/);
    assert.equal((await post('/projects/1/default-priority', { priority: 'High' })).status, 403);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), html);
    await post('/projects/1/restore');
    html = await get('/projects/1');
    assert.doesNotMatch(defaultSelect(html), / disabled/);
    assert.match(defaultSelect(html), /<option selected>Low/);
    await post('/projects/1/tasks', { title: 'After restore' });
    assert.match(taskSelect(await get('/projects/1'), 5), /<option selected>Low/);
    assert.match(await get('/'), /1\/4 completed/);
    await post('/projects/1/default-priority', { priority: 'Normal' });
    html = await get('/projects/1');
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), html);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('combined filters preserve selections through edits, archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-filters-'));
  let server;
  try {
    const dbPath = join(directory, 'db.sqlite');
    server = await start(dbPath);
    const get = async path => (await fetch(server.url + path)).text();
    const post = async (path, values = {}) => (await fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(values)
    })).text();
    await post('/projects', { name: 'Filters' });
    const path = '/projects/1';
    for (const title of ['First', 'Second', 'Third']) await post(path + '/tasks', { title });
    await post(path + '/tasks/1/priority', { priority: 'High' });
    await post(path + '/tasks/2/priority', { priority: 'High' });
    await post(path + '/tasks/2', { completed: '1' });
    const selected = { filter: 'Open', priorityFilter: 'High' };
    const query = '?filter=Open&priorityFilter=High';
    const check = html => {
      assert.match(html, /<option selected>Open<\/option>/);
      assert.match(html, /id="priority-filter"[\s\S]*?<option selected>High<\/option>/);
    };
    let html = await get(path + query);
    check(html);
    assert.match(html, /Complete First/);
    assert.doesNotMatch(html, /Complete Second|Complete Third/);
    html = await post(path + '/tasks/1/rename', { ...selected, title: ' Renamed ' });
    check(html);
    assert.match(html, /Complete Renamed/);
    html = await post(path + '/tasks/1/rename', { ...selected, title: ' ' });
    check(html);
    assert.match(html, /Task title is required/);
    html = await post(path + '/tasks/1', { ...selected, completed: '1' });
    check(html);
    assert.doesNotMatch(html, /data-testid="task-row"/);
    html = await post(path + '/tasks/3/priority', { ...selected, priority: 'High' });
    check(html);
    assert.match(html, /Complete Third/);
    html = await post(path + '/tasks/3/priority', { ...selected, priority: 'Low' });
    check(html);
    assert.doesNotMatch(html, /data-testid="task-row"/);
    assert.match(await get('/'), /2\/3 completed/);
    await post(path + '/archive');
    html = await get(path + '?filter=Completed&priorityFilter=High');
    assert.match(html, /Archived project/);
    assert.equal((html.match(/data-testid="task-row"/g) || []).length, 2);
    assert.match(html, /aria-label="Complete Renamed" checked disabled/);
    assert.match(html, /id="priority-filter" name="priorityFilter" onchange=/);
    await post(path + '/restore');
    html = await get(path + '?filter=Completed&priorityFilter=High');
    assert.ok(html.indexOf('Complete Renamed') < html.indexOf('Complete Second'));
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get(path + '?filter=Completed&priorityFilter=High'), html);
    assert.match(await get(path), /id="priority-filter"[^>]*>\s*<option selected>All/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, remain project-owned, filter, toggle and persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  let server;
  try {
    const dbPath = join(directory, 'db.sqlite');
    server = await start(dbPath);
    const get = async path => (await fetch(server.url + path)).text();
    const post = (path, values) => fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(values)
    });
    await post('/projects', { name: 'One' });
    await post('/projects', { name: 'Two' });
    const path = '/projects/1';
    let html = await get(path);
    assert.match(html, /<label for="task-title">Task title<\/label>/);
    assert.match(html, /<label for="task-filter">Task filter<\/label>/);
    assert.match(html, /<option selected>All<\/option>/);
    for (const title of ['', '   ']) {
      html = await (await post(path + '/tasks', { title })).text();
      assert.match(html, /role="alert">Task title is required/);
      assert.doesNotMatch(html, /data-testid="task-row"/);
    }
    await post(path + '/tasks', { title: '  First task  ' });
    await post(path + '/tasks', { title: 'Second <task>' });
    html = await get(path);
    assert.equal((html.match(/data-testid="task-row"/g) || []).length, 2);
    assert.ok(html.indexOf('First task') < html.indexOf('Second &lt;task&gt;'));
    assert.match(html, /aria-label="Complete First task"/);
    assert.doesNotMatch(html, / checked/);
    assert.doesNotMatch(await get('/projects/2'), /data-testid="task-row"/);
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    await post(path + '/tasks/1', { completed: '1' });
    const completed = await get(path + '?filter=Completed');
    assert.match(completed, /aria-label="Complete First task" checked/);
    assert.doesNotMatch(completed, /Second &lt;task&gt;/);
    const open = await get(path + '?filter=Open');
    assert.doesNotMatch(open, /First task/);
    assert.match(open, /Second &lt;task&gt;/);
    html = await get(path);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get(path), html);
    assert.equal(await get(path + '?filter=Completed'), completed);
    await post(path + '/tasks/1', {});
    assert.doesNotMatch(await get(path), / checked/);
    assert.doesNotMatch(await get(path + '?filter=Completed'), /data-testid="task-row"/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive, summaries, restoration and migration persist without task loss', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  let server;
  try {
    const dbPath = join(directory, 'db.sqlite');
    // Simulate an existing pre-archive database, not just a fresh installation.
    const db = new DatabaseSync(dbPath);
    db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      INSERT INTO projects (name) VALUES ('Existing');`);
    db.close();
    server = await start(dbPath);
    const get = async path => (await fetch(server.url + path)).text();
    const post = (path, values = {}) => fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(values)
    });
    assert.match(await get('/'), /data-testid="project-summary">0\/0 completed/);
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1', { completed: '1' });
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    await post('/projects/1/archive');
    assert.doesNotMatch(await get('/'), /<span>Existing<\/span>/);
    assert.match(await get('/'), /<span>Second<\/span>/);
    const archivedList = await get('/?filter=Archived');
    assert.match(archivedList, /<option selected>Archived<\/option>/);
    assert.match(archivedList, />Restore project<\/button>/);
    assert.match(archivedList, />Open project<\/button>/);
    assert.match(archivedList, /data-testid="project-summary">1\/2 completed/);
    const detail = await get('/projects/1');
    assert.match(detail, /<p>Archived project<\/p>/);
    assert.match(detail, /<button type="submit" disabled>Create task/);
    assert.equal((detail.match(/type="checkbox"[^>]* disabled/g) || []).length, 2);
    assert.match(await get('/projects/1?filter=Completed'), /Complete Done/);
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /Complete Pending/);
    assert.match(await get('/projects/1?filter=Open'), /Complete Pending/);
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1', {})).status, 403);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/?filter=Archived'), archivedList);
    assert.equal(await get('/projects/1'), detail);
    await post('/projects/1/restore');
    assert.doesNotMatch(await get('/?filter=Archived'), /data-testid="project-row"/);
    const active = await get('/');
    assert.ok(active.indexOf('<span>Existing</span>') < active.indexOf('<span>Second</span>'));
    assert.match(active, /data-testid="project-summary">1\/2 completed/);
    assert.doesNotMatch(await get('/projects/1'), / disabled/);
    await post('/projects/1/tasks/1', {});
    assert.match(await get('/'), /data-testid="project-summary">0\/2 completed/);
    await server.stop();
    server = await start(dbPath);
    assert.equal((await post('/projects/999/restore')).status, 404);
    assert.doesNotMatch(await get('/projects/1'), /Archived project/);
    assert.match(await get('/'), /data-testid="project-summary">0\/2 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('rename preserves identity, order, tasks and summaries and respects archive state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  let server;
  try {
    const dbPath = join(directory, 'db.sqlite');
    server = await start(dbPath);
    const get = async path => (await fetch(server.url + path)).text();
    const post = (path, values = {}) => fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(values)
    });
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1', { completed: '1' });
    assert.match(await get('/projects/1'), /<label for="new-project-name">New project name<\/label>/);
    for (const name of ['', '   ']) {
      const html = await (await post('/projects/1/rename', { name })).text();
      assert.match(html, /role="alert">Project name is required/);
      assert.match(html, /<h1>Original<\/h1>/);
    }
    const renamed = await post('/projects/1/rename', { name: '  Renamed <project>  ', filter: 'Open' });
    assert.equal(new URL(renamed.url).pathname, '/projects/1');
    assert.equal(new URL(renamed.url).search, '?filter=Open');
    assert.match(await renamed.text(), /<h1>Renamed &lt;project&gt;<\/h1>/);
    const list = await get('/');
    assert.ok(list.indexOf('<span>Renamed &lt;project&gt;</span>') < list.indexOf('<span>Second</span>'));
    assert.match(list, /data-testid="project-summary">1\/2 completed/);
    const detail = await get('/projects/1');
    assert.match(detail, /aria-label="Complete Done" checked/);
    assert.match(detail, /aria-label="Complete Pending"/);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/'), list);
    assert.equal(await get('/projects/1'), detail);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.match(archived, /id="new-project-name"[^>]* disabled/);
    assert.match(archived, /<button type="submit" disabled>Rename project/);
    assert.equal((await post('/projects/1/rename', { name: 'Blocked' })).status, 403);
    assert.match(await get('/projects/1'), /<h1>Renamed &lt;project&gt;<\/h1>/);
    await post('/projects/1/restore');
    assert.doesNotMatch(await get('/projects/1'), / disabled/);
    await post('/projects/1/rename', { name: 'Restored name' });
    await server.stop();
    server = await start(dbPath);
    assert.match(await get('/projects/1'), /<h1>Restored name<\/h1>/);
    assert.match(await get('/projects/1'), /aria-label="Complete Done" checked/);
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task renaming preserves completion, ownership, order and persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  let server;
  try {
    const dbPath = join(directory, 'db.sqlite');
    server = await start(dbPath);
    const get = async path => (await fetch(server.url + path)).text();
    const post = (path, values = {}) => fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(values)
    });
    await post('/projects', { name: 'One' });
    await post('/projects', { name: 'Two' });
    await post('/projects/1/tasks', { title: 'First' });
    await post('/projects/1/tasks', { title: 'Second' });
    await post('/projects/1/tasks/1', { completed: '1' });
    let html = await get('/projects/1');
    assert.equal((html.match(/>New task title<\/label>/g) || []).length, 2);
    assert.equal((html.match(/>Rename task<\/button>/g) || []).length, 2);
    for (const title of ['', '   ']) {
      html = await (await post('/projects/1/tasks/1/rename', { title, filter: 'Completed' })).text();
      assert.match(html, /role="alert">Task title is required/);
      assert.match(html, /aria-label="Complete First" checked/);
      assert.match(html, /<option selected>Completed<\/option>/);
    }
    assert.equal((await post('/projects/2/tasks/1/rename', { title: 'Wrong owner' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/rename', { title: 'Missing' })).status, 404);
    const response = await post('/projects/1/tasks/1/rename', { title: '  Renamed <task> "one"  ', filter: 'Completed' });
    assert.equal(new URL(response.url).pathname, '/projects/1');
    assert.equal(new URL(response.url).search, '?filter=Completed');
    html = await response.text();
    assert.match(html, /aria-label="Complete Renamed &lt;task&gt; &quot;one&quot;" checked/);
    assert.doesNotMatch(html, /Complete Second/);
    assert.doesNotMatch(await get('/projects/1?filter=Open'), /Complete Renamed/);
    assert.doesNotMatch(await get('/projects/2'), /data-testid="task-row"/);
    const detail = await get('/projects/1');
    assert.ok(detail.indexOf('Complete Renamed') < detail.indexOf('Complete Second'));
    const list = await get('/');
    assert.match(list, /data-testid="project-summary">1\/2 completed/);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), detail);
    assert.equal(await get('/'), list);
    await post('/projects/1/archive');
    html = await get('/projects/1');
    assert.equal((html.match(/id="new-task-title-\d+"[^>]* disabled/g) || []).length, 2);
    assert.equal((html.match(/<button type="submit" disabled>Rename task/g) || []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Blocked' })).status, 403);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), html);
    await post('/projects/1/restore');
    assert.doesNotMatch(await get('/projects/1'), / disabled/);
    await post('/projects/1/tasks/2/rename', { title: '  Renamed open  ', filter: 'Open' });
    html = await get('/projects/1?filter=Open');
    assert.match(html, /aria-label="Complete Renamed open"/);
    assert.doesNotMatch(html, / checked/);
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1?filter=Open'), html);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task priorities migrate, remain independent and persist through rename and archive', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  let server;
  try {
    const dbPath = join(directory, 'db.sqlite');
    const db = new DatabaseSync(dbPath);
    db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (name) VALUES ('One'), ('Two');
      INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing', 1);`);
    db.close();
    server = await start(dbPath);
    const get = async path => (await fetch(server.url + path)).text();
    const post = (path, values = {}) => fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(values)
    });
    const priorities = html => [...html.matchAll(/<select id="task-priority-\d+"[^>]*>([\s\S]*?)<\/select>/g)].map(match => match[1].trim());
    const options = selected => ['Low', 'Normal', 'High'].map(value => `<option${value === selected ? ' selected' : ''}>${value}</option>`).join('');
    assert.deepEqual(priorities(await get('/projects/1')), [options('Normal')]);
    await post('/projects/1/tasks', { title: 'New' });
    await post('/projects/2/tasks', { title: 'Other' });
    assert.deepEqual(priorities(await get('/projects/1')), [options('Normal'), options('Normal')]);
    const list = await get('/');
    assert.equal((await post('/projects/2/tasks/1/priority', { priority: 'High' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/priority', { priority: 'High' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Urgent' })).status, 400);
    const changed = await post('/projects/1/tasks/1/priority', { priority: 'High', filter: 'Completed' });
    assert.equal(new URL(changed.url).search, '?filter=Completed');
    assert.match(await changed.text(), /aria-label="Complete Existing" checked/);
    await post('/projects/1/tasks/2/priority', { priority: 'Low', filter: 'Open' });
    assert.deepEqual(priorities(await get('/projects/1')), [options('High'), options('Low')]);
    assert.deepEqual(priorities(await get('/projects/2')), [options('Normal')]);
    assert.deepEqual(priorities(await get('/projects/1?filter=Open')), [options('Low')]);
    assert.equal(await get('/'), list);
    await post('/projects/1/tasks/1/rename', { title: ' Renamed ' });
    const detail = await get('/projects/1');
    assert.match(detail, /aria-label="Complete Renamed" checked/);
    assert.ok(detail.indexOf('Complete Renamed') < detail.indexOf('Complete New'));
    assert.deepEqual(priorities(detail), [options('High'), options('Low')]);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), detail);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.equal((archived.match(/<select id="task-priority-\d+"[^>]* disabled/g) || []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Normal' })).status, 403);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), detail);
    await post('/projects/1/tasks/1/priority', { priority: 'Normal' });
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual(priorities(await get('/projects/1')), [options('Normal'), options('Low')]);
    assert.equal(await get('/'), list);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project creation, validation, navigation and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let server;
  try {
    const dbPath = join(directory, 'db.sqlite');
    server = await start(dbPath);
    const get = path => fetch(server.url + path);
    const create = name => fetch(server.url + '/projects', {
      method: 'POST', body: new URLSearchParams({ name })
    });
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const initial = await (await get('/')).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    for (const name of ['', '   ']) {
      const html = await (await create(name)).text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    await create('  First project  ');
    const html = await (await create('Second <project>')).text();
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.ok(html.indexOf('First project') < html.indexOf('Second &lt;project&gt;'));
    assert.match(html, /<span>First project<\/span>/);
    const path = html.match(/action="(\/projects\/\d+)"/)[1];
    const detail = await (await get(path)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*>Projects<\/button>/);
    assert.equal((await get('/projects/9999')).status, 404);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await (await get('/')).text(), html);
    assert.equal(await (await get(path)).text(), detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
