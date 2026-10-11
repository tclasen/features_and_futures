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

test('task moves remember positions, preserve data and filters, and reject archived projects', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-moves-'));
  let server;
  try {
    const dbPath = join(directory, 'db.sqlite');
    server = await start(dbPath);
    const get = async path => (await fetch(server.url + path)).text();
    const post = async (path, values = {}) => (await fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(values)
    })).text();
    const rows = html => [...html.matchAll(/aria-label="Complete ([^"]*)"/g)].map(match => match[1]);
    await post('/projects', { name: 'Source' });
    await post('/projects/1/tasks', { title: 'Moved' });
    let html = await get('/projects/1');
    assert.match(html, /name="destination" disabled>\s*<\/select>/);
    assert.match(html, /disabled>Move task/);
    await post('/projects', { name: 'Destination' });
    await post('/projects', { name: 'Archived' });
    await post('/projects/3/archive');
    await post('/projects/2/rename', { name: 'New destination' });
    await post('/projects/2/default-priority', { priority: 'Low' });
    await post('/projects/2/tasks', { title: 'Existing' });
    await post('/projects/1/tasks', { title: 'Remaining' });
    await post('/projects/1/tasks/1', { completed: '1' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
    html = await get('/projects/1');
    const options = html.match(/name="destination"[^>]*>([\s\S]*?)<\/select>/)[1];
    assert.equal(options.trim(), '<option value="2">New destination</option>');
    const selected = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-01', dueThrough: '2024-03-01' };
    html = await post('/projects/1/tasks/1/move', { ...selected, destination: '2' });
    assert.deepEqual(rows(html), []);
    assert.match(html, /<h1>Source<\/h1>/);
    assert.match(html, /id="task-filter"[\s\S]*?<option selected>Completed/);
    assert.match(html, /id="priority-filter"[\s\S]*?<option selected>High/);
    assert.match(html, /id="due-from"[^>]*value="2024-02-01"/);
    assert.match(html, /id="due-through"[^>]*value="2024-03-01"/);
    assert.deepEqual(rows(await get('/projects/1')), ['Remaining']);
    html = await get('/projects/2');
    assert.deepEqual(rows(html), ['Existing', 'Moved']);
    assert.match(html, /aria-label="Complete Moved" checked/);
    assert.match(html, /<option selected>High/);
    assert.match(html, /id="task-due-date-1"[^>]*value="2024-02-29"/);
    html = await get('/');
    assert.match(html, /0\/1 completed/);
    assert.match(html, /1\/2 completed/);
    await post('/projects/2/tasks/1/move', { destination: '3' });
    await post('/projects/2/tasks/1/move', { destination: '2' });
    assert.deepEqual(rows(await get('/projects/2')), ['Existing', 'Moved']);
    await post('/projects/2/archive');
    html = await get('/projects/2');
    assert.match(html, /name="destination" disabled/);
    assert.match(html, /disabled>Move task/);
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(rows(await get('/projects/2')), ['Existing', 'Moved']);
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual(rows(await get('/projects/2')), ['Existing', 'Moved']);
    await post('/projects/2/restore');
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(rows(await get('/projects/1')), ['Moved', 'Remaining']);
    await post('/projects/2/tasks', { title: 'Later' });
    await post('/projects/1/tasks/1/move', { destination: '2' });
    assert.deepEqual(rows(await get('/projects/2')), ['Existing', 'Moved', 'Later']);
    await post('/projects/2/tasks/2/move', { destination: '1' });
    assert.deepEqual(rows(await get('/projects/1')), ['Remaining', 'Existing']);
    assert.match(await get('/projects/1'), /id="task-due-date-2"[^>]*value=""/);
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual(rows(await get('/projects/2')), ['Moved', 'Later']);
    assert.deepEqual(rows(await get('/projects/1')), ['Remaining', 'Existing']);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('legacy order migrates and multiple returns restore remembered positions across projects and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-positions-'));
  let server;
  try {
    const dbPath = join(directory, 'db.sqlite');
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL);
      INSERT INTO projects (name) VALUES ('Original'), ('Second'), ('Third');
      INSERT INTO tasks (project_id, title, position) VALUES (1, 'B', 20), (1, 'A', 10), (1, 'C', 30);`);
    legacy.close();
    server = await start(dbPath);
    const get = async path => (await fetch(server.url + path)).text();
    const post = async (path, values = {}) => (await fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(values)
    })).text();
    const rows = html => [...html.matchAll(/aria-label="Complete ([^"]*)"/g)].map(match => match[1]);
    const move = (source, task, destination) => post(`/projects/${source}/tasks/${task}/move`, { destination });
    assert.deepEqual(rows(await get('/projects/1')), ['A', 'B', 'C']);
    await move(1, 2, 2);
    await move(1, 1, 2);
    await move(1, 3, 2);
    // All source tasks are away; new tasks still append after their reserved slots.
    await post('/projects/1/tasks', { title: 'D' });
    await post('/projects/2/tasks/2/rename', { title: 'Updated A' });
    await post('/projects/2/tasks/2', { completed: '1' });
    await post('/projects/2/tasks/2/priority', { priority: 'High' });
    await post('/projects/2/tasks/2/due-date', { dueDate: '0001-01-01' });
    await post('/projects/1/rename', { name: 'Renamed original' });
    await post('/projects/1/archive');
    await move(2, 2, 1);
    assert.deepEqual(rows(await get('/projects/2')), ['Updated A', 'B', 'C']);
    await server.stop();
    server = await start(dbPath);
    await post('/projects/1/restore');
    await move(2, 3, 1);
    await move(2, 1, 1);
    await move(2, 2, 1);
    let html = await get('/projects/1');
    assert.deepEqual(rows(html), ['Updated A', 'B', 'C', 'D']);
    assert.match(html, /aria-label="Complete Updated A" checked/);
    assert.match(html, /<option selected>High/);
    assert.match(html, /id="task-due-date-2"[^>]*value="0001-01-01"/);
    // The second project also remembers its order even after a third-project visit.
    await move(1, 1, 3);
    await move(3, 1, 2);
    await post('/projects/2/tasks', { title: 'E' });
    await move(1, 3, 2);
    await move(1, 2, 2);
    assert.deepEqual(rows(await get('/projects/2')), ['Updated A', 'B', 'C', 'E']);
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual(rows(await get('/projects/2')), ['Updated A', 'B', 'C', 'E']);
    await move(2, 3, 1);
    await move(2, 2, 1);
    await move(2, 1, 1);
    assert.deepEqual(rows(await get('/projects/1')), ['Updated A', 'B', 'C', 'D']);
    assert.match(await get('/'), /1\/4 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('due ranges intersect filters, validate inclusively and survive edits without saving filter state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-ranges-'));
  let server;
  try {
    const dbPath = join(directory, 'db.sqlite');
    server = await start(dbPath);
    const get = async path => (await fetch(server.url + path)).text();
    const post = async (path, values = {}) => (await fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(values)
    })).text();
    const rows = html => [...html.matchAll(/aria-label="Complete ([^"]*)"/g)].map(match => match[1]);
    await post('/projects', { name: 'Ranges' });
    for (const title of ['Before', 'Start', 'End', 'After', 'Undated']) {
      await post('/projects/1/tasks', { title });
    }
    for (const [id, dueDate] of [[1, '2024-02-28'], [2, '2024-02-29'], [3, '2024-03-01'], [4, '2024-03-02']]) {
      await post(`/projects/1/tasks/${id}/due-date`, { dueDate });
    }
    const range = { dueFrom: '2024-02-29', dueThrough: '2024-03-01' };
    const selected = { ...range, filter: 'All', priorityFilter: 'All' };
    let html = await post('/projects/1/due-range', { from: ' 2024-02-29 ', through: ' 2024-03-01 ' });
    assert.deepEqual(rows(html), ['Start', 'End']);
    assert.match(html, /id="due-from"[^>]*value="2024-02-29"/);
    assert.match(html, /id="due-through"[^>]*value="2024-03-01"/);
    // Every edit and completion/priority filter form carries the applied boundaries.
    for (const form of html.matchAll(/<form[^>]*>[\s\S]*?<\/form>/g)) {
      assert.match(form[0], /name="dueFrom" value="2024-02-29"/);
      assert.match(form[0], /name="dueThrough" value="2024-03-01"/);
    }
    for (const from of ['2023-02-29', '1900-02-29', '0000-01-01', '2024-2-29', '9999-12-32']) {
      html = await post('/projects/1/due-range', { ...selected, from, through: '' });
      assert.match(html, /role="alert">Due range must use valid YYYY-MM-DD dates/);
      assert.deepEqual(rows(html), ['Start', 'End']);
    }
    html = await post('/projects/1/due-range', { ...selected, from: '2024-03-02', through: '2024-02-29' });
    assert.match(html, /role="alert">Due from must not be after Due through/);
    assert.deepEqual(rows(html), ['Start', 'End']);
    assert.deepEqual(rows(await post('/projects/1/due-range', { from: '', through: '2024-02-29' })), ['Before', 'Start']);
    assert.deepEqual(rows(await post('/projects/1/due-range', { from: '2024-03-01', through: '' })), ['End', 'After']);
    assert.deepEqual(rows(await post('/projects/1/due-range', { from: ' ', through: ' ' })), ['Before', 'Start', 'End', 'After', 'Undated']);
    assert.deepEqual(rows(await post('/projects/1/due-range', { from: '0001-01-01', through: '9999-12-31' })), ['Before', 'Start', 'End', 'After']);
    await post('/projects/1/tasks/2/priority', { priority: 'High' });
    await post('/projects/1/tasks/2', { completed: '1' });
    const combined = { ...range, filter: 'Completed', priorityFilter: 'High' };
    html = await get('/projects/1?' + new URLSearchParams(combined));
    assert.deepEqual(rows(html), ['Start']);
    html = await post('/projects/1/tasks/2/rename', { ...combined, title: 'Renamed' });
    assert.deepEqual(rows(html), ['Renamed']);
    assert.match(html, /id="task-filter"[\s\S]*?<option selected>Completed/);
    assert.match(html, /id="priority-filter"[\s\S]*?<option selected>High/);
    html = await post('/projects/1/rename', { ...combined, name: 'New name' });
    assert.deepEqual(rows(html), ['Renamed']);
    html = await post('/projects/1/default-priority', { ...combined, priority: 'High' });
    assert.deepEqual(rows(html), ['Renamed']);
    html = await post('/projects/1/tasks', { ...combined, title: 'New undated' });
    assert.deepEqual(rows(html), ['Renamed']);
    html = await post('/projects/1/tasks/2/due-date', { ...combined, dueDate: '2024-03-02' });
    assert.deepEqual(rows(html), []);
    html = await post('/projects/1/tasks/2/due-date', { ...combined, dueDate: '2024-02-29' });
    assert.deepEqual(rows(html), ['Renamed']);
    html = await post('/projects/1/tasks/2/priority', { ...combined, priority: 'Low' });
    assert.deepEqual(rows(html), []);
    await post('/projects/1/tasks/2/priority', { priority: 'High' });
    html = await post('/projects/1/tasks/2', combined);
    assert.deepEqual(rows(html), []);
    assert.match(await get('/'), /0\/6 completed/);
    await post('/projects/1/archive');
    html = await post('/projects/1/due-range', { from: range.dueFrom, through: range.dueThrough });
    assert.deepEqual(rows(html), ['Renamed', 'End']);
    assert.doesNotMatch(html.match(/<input id="due-from"[^>]*>/)[0], /disabled/);
    assert.match(html, /Save due date/);
    assert.match(html, /name="completed"[^>]*disabled/);
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual(rows(await get('/projects/1')), ['Before', 'Renamed', 'End', 'After', 'Undated', 'New undated']);
    assert.match(await get('/projects/1'), /id="due-from"[^>]*value=""/);
    await post('/projects/1/restore');
    assert.deepEqual(rows(await get('/projects/1?' + new URLSearchParams(selected))), ['Renamed', 'End']);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

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
