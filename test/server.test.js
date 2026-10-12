import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

// Other projects' names and archive state now affect destination controls only.
function withoutMoveControls(html) {
  return html.replace(/<form[^>]*action="\/projects\/\d+\/tasks\/\d+\/move">[\s\S]*?<\/form>/g, '');
}

test('moves migrate ordering, preserve task data and filters, and enforce active destinations', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-moves-'));
  let server;
  try {
    const dbPath = join(directory, 'workboard.sqlite');
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (name) VALUES ('Source');
      INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Move me', 1), (1, 'Stay', 0);
    `);
    legacy.close();
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const ids = html => [...html.matchAll(/id="task-(\d+)" type="checkbox"/g)].map(match => Number(match[1]));
    const options = (html, id) => new RegExp(`<select id="destination-project-${id}"[^>]*>([\\s\\S]*?)</select>`).exec(html)[1].trim();
    const summary = (html, projectName, expected) => {
      const row = [...html.matchAll(/data-testid="project-row">([\s\S]*?)<\/li>/g)].find(match => match[1].includes(`>${projectName}</span>`));
      assert.ok(row);
      assert.ok(row[1].includes(`data-testid="project-summary">${expected} completed`));
    };
    let source = await get('/projects/1');
    assert.deepEqual(ids(source), [1, 2]);
    assert.equal(options(source, 1), '');
    assert.match(source, /id="destination-project-1"[^>]* disabled/);
    assert.match(source, /<button type="submit" disabled>Move task/);
    await post('/projects', { name: 'Destination' });
    await post('/projects', { name: 'Third' });
    await post('/projects', { name: 'Archived' });
    await post('/projects/4/archive');
    await post('/projects/2/tasks', { title: 'Destination first' });
    await post('/projects/2/tasks', { title: 'Destination second' });
    await post('/projects/2/default-task-priority', { priority: 'Low' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
    await post('/projects/2/rename', { name: 'Destination renamed' });
    source = await get('/projects/1');
    assert.equal(options(source, 1), '<option value="2">Destination renamed</option><option value="3">Third</option>');
    const filters = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-03-01' };
    const sourcePath = '/projects/1?filter=Completed&priorityFilter=High&dueFrom=2024-02-29&dueThrough=2024-03-01';
    const filtered = await get(sourcePath);
    assert.deepEqual(ids(filtered), [1]);
    const moveForm = /<form[^>]*action="\/projects\/1\/tasks\/1\/move">([\s\S]*?)<\/form>/.exec(filtered)[1];
    for (const [key, value] of Object.entries(filters)) assert.ok(moveForm.includes(`name="${key}" value="${value}"`));
    for (const destination of ['', '1', '4', '999', 'invalid', '2.5']) {
      assert.equal((await post('/projects/1/tasks/1/move', { ...filters, destination })).status, 422);
      assert.equal(await get('/projects/1'), source);
    }
    assert.equal((await post('/projects/2/tasks/1/move', { destination: '3' })).status, 404);
    const moved = await post('/projects/1/tasks/1/move', { ...filters, destination: '2' });
    assert.equal(moved.status, 303);
    assert.equal(moved.headers.get('location'), sourcePath);
    const remaining = await get(sourcePath);
    assert.deepEqual(ids(remaining), []);
    assert.match(remaining, /<option selected>Completed<\/option>/);
    assert.match(remaining, /<option selected>High<\/option>/);
    assert.match(remaining, /id="due-from"[^>]*value="2024-02-29"/);
    assert.match(remaining, /id="due-through"[^>]*value="2024-03-01"/);
    assert.deepEqual(ids(await get('/projects/1')), [2]);
    let destination = await get('/projects/2');
    assert.deepEqual(ids(destination), [3, 4, 1]);
    assert.match(destination, /aria-label="Complete Move me" checked/);
    assert.match(destination, /id="task-priority-1"[^>]*>\s*<option>Low<\/option><option>Normal<\/option><option selected>High<\/option>/);
    assert.match(destination, /id="task-due-date-1"[^>]*value="2024-02-29"/);
    assert.equal(options(destination, 1), '<option value="1">Source</option><option value="3">Third</option>');
    summary(await get('/'), 'Source', '0/1');
    summary(await get('/'), 'Destination renamed', '1/3');
    await post('/projects/2/tasks', { title: 'Created after move' });
    assert.deepEqual(ids(await get('/projects/2')), [3, 4, 1, 5]);
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual(ids(await get('/projects/2')), [3, 4, 1, 5]);
    assert.equal(await get(sourcePath), remaining);
    await post('/projects/2/archive');
    destination = await get('/projects/2');
    assert.match(destination, /id="destination-project-1"[^>]* disabled/);
    assert.match(destination, /<button type="submit" disabled>Move task/);
    assert.equal((await post('/projects/2/tasks/1/move', { destination: '3' })).status, 403);
    assert.equal((await post('/projects/1/tasks/2/move', { destination: '2' })).status, 422);
    assert.equal(await get('/projects/2'), destination);
    await post('/projects/2/restore');
    assert.doesNotMatch(await get('/projects/2'), /id="destination-project-1"[^>]* disabled/);
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(ids(await get('/projects/1')), [1, 2]);
    assert.deepEqual(ids(await get('/projects/2')), [3, 4, 5]);
    assert.deepEqual(ids(await get(sourcePath)), [1]);
    // A task with no due date also retains its independent state on moving.
    await post('/projects/1/tasks/2/move', { destination: '2' });
    assert.deepEqual(ids(await get('/projects/2')), [3, 4, 5, 2]);
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual(ids(await get('/projects/1')), [1]);
    assert.deepEqual(ids(await get('/projects/2')), [3, 4, 5, 2]);
    const saved = new DatabaseSync(dbPath);
    assert.deepEqual({ ...saved.prepare('SELECT project_id, title, completed, priority, due_date FROM tasks WHERE id = 1').get() },
      { project_id: 1, title: 'Move me', completed: 1, priority: 'High', due_date: '2024-02-29' });
    assert.deepEqual({ ...saved.prepare('SELECT project_id, title, completed, priority, due_date FROM tasks WHERE id = 2').get() },
      { project_id: 2, title: 'Stay', completed: 0, priority: 'Normal', due_date: '' });
    saved.close();
    summary(await get('/'), 'Source', '1/1');
    summary(await get('/'), 'Destination renamed', '0/4');
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('remembered project positions survive reverse returns, empty projects, migration, and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-return-order-'));
  let server;
  try {
    const dbPath = join(directory, 'workboard.sqlite');
    // Task 011 databases can have current order different from task ID order.
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (name) VALUES ('Home'), ('Away'), ('Third');
      INSERT INTO tasks (project_id, title, position) VALUES (1, 'Last', 30), (1, 'First', 10), (1, 'Middle', 20), (3, 'Visitor', 1);
    `);
    legacy.close();
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const ids = html => [...html.matchAll(/id="task-(\d+)" type="checkbox"/g)].map(match => Number(match[1]));
    const move = async (task, from, to, fields = {}) => {
      const response = await post(`/projects/${from}/tasks/${task}/move`, { ...fields, destination: String(to) });
      assert.equal(response.status, 303);
      return response;
    };
    assert.deepEqual(ids(await get('/projects/1')), [2, 3, 1]);
    for (const task of [2, 3, 1]) await move(task, 1, 2);
    assert.deepEqual(ids(await get('/projects/1')), []);
    assert.deepEqual(ids(await get('/projects/2')), [2, 3, 1]);
    await post('/projects/1/tasks', { title: 'New while empty' });
    await move(4, 3, 1);
    assert.deepEqual(ids(await get('/projects/1')), [5, 4]);
    await post('/projects/1/rename', { name: 'Home renamed' });
    await post('/projects/2/tasks/3/rename', { title: 'Current middle' });
    await post('/projects/2/tasks/3/priority', { priority: 'High' });
    await post('/projects/2/tasks/3/due-date', { dueDate: '2028-02-29' });
    await post('/projects/2/tasks/3', { completed: '1' });
    await post('/projects/1/archive');
    assert.equal((await post('/projects/2/tasks/3/move', { destination: '1' })).status, 422);
    await server.stop();
    server = await start(dbPath);
    await post('/projects/1/restore');
    const filters = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2028-02-29', dueThrough: '2028-02-29' };
    // Return in reverse order, preserving the source's selected filters.
    await move(1, 2, 1);
    const response = await move(3, 2, 1, filters);
    assert.equal(response.headers.get('location'), '/projects/2?filter=Completed&priorityFilter=High&dueFrom=2028-02-29&dueThrough=2028-02-29');
    assert.deepEqual(ids(await get(response.headers.get('location'))), []);
    await move(2, 2, 1);
    assert.deepEqual(ids(await get('/projects/1')), [2, 3, 1, 5, 4]);
    const home = await get('/projects/1');
    assert.match(home, /aria-label="Complete Current middle" checked/);
    assert.match(home, /id="task-priority-3"[^>]*>\s*<option>Low<\/option><option>Normal<\/option><option selected>High<\/option>/);
    assert.match(home, /id="task-due-date-3"[^>]*value="2028-02-29"/);
    assert.match(await get('/'), /data-testid="project-summary">1\/5 completed/);
    // Away also remembers its own order, even after all its tasks leave.
    await post('/projects/2/tasks', { title: 'Away newcomer' });
    await move(1, 1, 2);
    await move(3, 1, 2);
    await move(2, 1, 2);
    assert.deepEqual(ids(await get('/projects/2')), [2, 3, 1, 6]);
    await move(4, 1, 3);
    await post('/projects/3/tasks', { title: 'Third newcomer' });
    await move(4, 3, 1);
    assert.deepEqual(ids(await get('/projects/1')), [5, 4]);
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual(ids(await get('/projects/2')), [2, 3, 1, 6]);
    await move(4, 1, 3);
    assert.deepEqual(ids(await get('/projects/3')), [4, 7]);
    for (const task of [1, 3, 2]) await move(task, 2, 1);
    assert.deepEqual(ids(await get('/projects/1')), [2, 3, 1, 5]);
    const saved = await get('/projects/1');
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), saved);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task priorities migrate, remain independent, and survive renames, archive, and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  let server;
  try {
    const dbPath = join(directory, 'workboard.sqlite');
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (name) VALUES ('First'), ('Second');
      INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing', 1);
    `);
    legacy.close();
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const rows = html => [...html.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    const options = row => /<select id="task-priority-\d+"[^>]*>\s*([\s\S]*?)\s*<\/select>/.exec(row)[1];
    const normal = '<option>Low</option><option selected>Normal</option><option>High</option>';
    await post('/projects/1/tasks', { title: 'New task' });
    await post('/projects/2/tasks', { title: 'Other project' });
    const initial = await get('/projects/1');
    const other = await get('/projects/2');
    const summary = await get('/');
    assert.ok(rows(initial).every(row => options(row) === normal));
    assert.match(rows(initial)[0], /<label for="task-priority-1">Task priority<\/label>/);
    assert.equal(options(rows(other)[0]), normal);
    for (const priority of ['Low', 'High', 'Normal', 'High']) {
      const result = await post('/projects/1/tasks/1/priority', { priority, filter: 'Completed' });
      assert.equal(result.status, 303);
      assert.equal(result.headers.get('location'), '/projects/1?filter=Completed');
      const updated = rows(await get('/projects/1'));
      assert.match(options(updated[0]), new RegExp(`<option selected>${priority}</option>`));
      assert.match(updated[0], /aria-label="Complete Existing" checked/);
      assert.equal(updated[1], rows(initial)[1]);
      assert.equal(rows(await get('/projects/1?filter=Completed')).length, 1);
      assert.equal(rows(await get('/projects/1?filter=Open')).length, 1);
      assert.equal(await get('/projects/2'), other);
      assert.equal(await get('/'), summary);
    }
    const saved = await get('/projects/1');
    for (const [path, fields, status] of [
      ['/projects/2/tasks/1/priority', { priority: 'Low' }, 404],
      ['/projects/1/tasks/999/priority', { priority: 'Low' }, 404],
      ['/projects/999/tasks/1/priority', { priority: 'Low' }, 404],
      ['/projects/1/tasks/1/priority', { priority: 'Urgent' }, 422],
      ['/projects/1/tasks/1/priority', {}, 422],
    ]) {
      assert.equal((await post(path, fields)).status, status);
      assert.equal(await get('/projects/1'), saved);
    }
    await post('/projects/1/tasks/2/priority', { priority: 'Low' });
    await post('/projects/1/tasks/1/rename', { title: '  Renamed  ' });
    const renamed = await get('/projects/1');
    assert.match(rows(renamed)[0], /aria-label="Complete Renamed" checked/);
    assert.match(options(rows(renamed)[0]), /<option selected>High<\/option>/);
    assert.match(options(rows(renamed)[1]), /<option selected>Low<\/option>/);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), renamed);
    assert.equal(await get('/'), summary);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.ok(rows(archived).every(row => /<select id="task-priority-\d+"[^>]* disabled/.test(row)));
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Normal' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), renamed);
    assert.equal(await get('/'), summary);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Normal' })).status, 303);
    const restored = await get('/projects/1');
    assert.equal(options(rows(restored)[0]), normal);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), restored);
    assert.equal(await get('/projects/2'), other);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task renames preserve ownership, order, completion, filters, and summaries across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  let server;
  try {
    const dbPath = join(directory, 'workboard.sqlite');
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const rows = html => [...html.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Original' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await get('/projects/1');
    const otherProject = await get('/projects/2');
    const summary = await get('/');
    assert.match(rows(original)[0], /<label for="new-task-title-1">New task title<\/label>/);
    assert.match(rows(original)[0], /<button type="submit">Rename task<\/button>/);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks/1/rename', { title, filter: 'Completed' });
      assert.equal(response.status, 422);
      const html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(rows(html).length, 1);
      assert.match(rows(html)[0], /aria-label="Complete Original" checked/);
      assert.equal(await get('/projects/1'), original);
    }
    assert.equal((await post('/projects/2/tasks/1/rename', { title: 'Wrong owner' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/rename', { title: 'Missing' })).status, 404);
    assert.equal((await post('/projects/999/tasks/1/rename', { title: 'Missing project' })).status, 404);
    const renamed = await post('/projects/1/tasks/1/rename', {
      title: '  Renamed <task> "one" & two  ', filter: 'Completed',
    });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const saved = await get('/projects/1');
    const savedRows = rows(saved);
    assert.equal(savedRows.length, 2);
    assert.match(savedRows[0], /aria-label="Complete Renamed &lt;task&gt; &quot;one&quot; &amp; two" checked/);
    assert.match(savedRows[0], /<label for="task-1">Renamed &lt;task&gt; &quot;one&quot; &amp; two<\/label>/);
    assert.equal(savedRows[1], rows(original)[1]);
    assert.deepEqual(rows(await get('/projects/1?filter=Completed')), [savedRows[0].replaceAll('name="filter" value="All"', 'name="filter" value="Completed"')]);
    assert.deepEqual(rows(await get('/projects/1?filter=Open')), [savedRows[1].replaceAll('name="filter" value="All"', 'name="filter" value="Open"')]);
    assert.equal(await get('/projects/2'), otherProject);
    assert.equal(await get('/'), summary);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), saved);
    assert.equal(await get('/'), summary);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    for (const row of rows(archived)) {
      assert.match(row, /id="new-task-title-\d+"[^>]* disabled/);
      assert.match(row, /<button type="submit" disabled>Rename task<\/button>/);
    }
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Blocked' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), archived);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Still blocked' })).status, 403);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), saved);
    assert.equal((await post('/projects/1/tasks/2/rename', { title: '  Renamed open task  ', filter: 'Open' })).status, 303);
    const restored = await get('/projects/1');
    assert.match(rows(restored)[1], /aria-label="Complete Renamed open task" onchange/);
    assert.doesNotMatch(rows(restored)[1], / checked| disabled/);
    assert.equal(await get('/'), summary);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), restored);
    assert.equal(await get('/projects/2'), otherProject);
    assert.equal((await post('/projects/1/tasks/1')).status, 303);
    assert.equal(rows(await get('/projects/1?filter=Completed')).length, 0);
    assert.equal(rows(await get('/projects/1?filter=Open')).length, 2);
    assert.match(await get('/'), /data-testid="project-summary">0\/2 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('renaming preserves identity, order, tasks, summaries, and archive restrictions across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  let server;
  try {
    const dbPath = join(directory, 'workboard.sqlite');
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const taskRows = html => [...html.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    const projectRows = html => [...html.matchAll(/<li class="project" data-testid="project-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const originalPage = await get('/projects/1');
    const originalTasks = taskRows(originalPage);
    assert.match(originalPage, /<label for="new-project-name">New project name<\/label>/);
    assert.match(originalPage, /<button type="submit">Rename project<\/button>/);
    for (const name of ['', ' \t\n ']) {
      const result = await post('/projects/1/rename', { name });
      assert.equal(result.status, 422);
      const html = await result.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.match(html, /<h1>Original<\/h1>/);
      assert.deepEqual(taskRows(html), originalTasks);
      assert.equal(await get('/projects/1'), originalPage);
    }
    const renamed = await post('/projects/1/rename', { name: '  Renamed <project> "one"  ', filter: 'Completed' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const savedPage = await get('/projects/1');
    assert.match(savedPage, /<h1>Renamed &lt;project&gt; &quot;one&quot;<\/h1>/);
    assert.deepEqual(taskRows(savedPage), originalTasks);
    assert.equal(taskRows(await get('/projects/1?filter=Completed')).length, 1);
    const savedList = await get('/');
    const rows = projectRows(savedList);
    assert.equal(rows.length, 2);
    assert.match(rows[0], /Renamed &lt;project&gt; &quot;one&quot;/);
    assert.match(rows[0], /action="\/projects\/1"/);
    assert.match(rows[0], /data-testid="project-summary">1\/2 completed/);
    assert.match(rows[1], /Second/);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), savedPage);
    assert.equal(await get('/'), savedList);

    await post('/projects/1/archive');
    const archivedPage = await get('/projects/1');
    assert.match(archivedPage, /id="new-project-name"[^>]* disabled/);
    assert.match(archivedPage, /<button type="submit" disabled>Rename project/);
    assert.equal((await post('/projects/1/rename', { name: 'Blocked' })).status, 403);
    assert.equal(await get('/projects/1'), archivedPage);
    await server.stop();
    server = await start(dbPath);
    assert.equal((await post('/projects/1/rename', { name: 'Still blocked' })).status, 403);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), savedPage);
    assert.equal((await post('/projects/1/rename', { name: '  Restored name  ' })).status, 303);
    const restoredPage = await get('/projects/1');
    assert.match(restoredPage, /<h1>Restored name<\/h1>/);
    assert.deepEqual(taskRows(restoredPage), originalTasks);
    assert.match(projectRows(await get('/'))[0], /1\/2 completed/);
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), restoredPage);
    assert.match(projectRows(await get('/'))[0], /Restored name/);
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
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => {
      clearTimeout(timer);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = /listening on port (\d+)/.exec(output);
      if (match) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  return {
    url,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects validate, render safely in creation order, and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let server;
  try {
    const dbPath = join(directory, 'nested', 'projects.sqlite');
    server = await start(dbPath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const initial = await (await fetch(server.url)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.equal((initial.match(/data-testid="project-row"/g) || []).length, 0);

    async function create(name) {
      return fetch(`${server.url}/projects`, {
        method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
      });
    }
    for (const name of ['', ' \t\n ']) {
      const result = await create(name);
      assert.equal(result.status, 422);
      const html = await result.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    for (const name of ['  First project  ', 'Café <script>alert("x")</script>']) {
      const result = await create(name);
      assert.equal(result.status, 303);
      assert.equal(result.headers.get('location'), '/');
    }
    const list = await (await fetch(server.url)).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(list, /<span class="project-name">First project<\/span>/);
    assert.ok(list.indexOf('First project') < list.indexOf('Café'));
    assert.match(list, /Café &lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
    const paths = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    const detail = await (await fetch(`${server.url}${paths[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/">\s*<button type="submit">Projects<\/button>/);
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

test('tasks validate, filter, remain project scoped, and persist completion across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  let server;
  try {
    const dbPath = join(directory, 'workboard.sqlite');
    server = await start(dbPath);
    const post = (path, fields) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const rows = html => [...html.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const initial = await get('/projects/1');
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, />Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const result = await post('/projects/1/tasks', { title });
      assert.equal(result.status, 422);
      const html = await result.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(rows(html).length, 0);
    }
    for (const title of ['  First task  ', 'Second <task> "quoted"']) {
      assert.equal((await post('/projects/1/tasks', { title })).status, 303);
    }
    const all = rows(await get('/projects/1'));
    assert.equal(all.length, 2);
    assert.match(all[0], /aria-label="Complete First task"/);
    assert.match(all[0], /<label for="task-1">First task<\/label>/);
    assert.match(all[1], /Second &lt;task&gt; &quot;quoted&quot;/);
    assert.ok(all.every(row => !row.includes(' checked')));
    assert.equal(rows(await get('/projects/2')).length, 0);
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Missing' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1', { completed: '1' })).status, 303);
    const open = rows(await get('/projects/1?filter=Open'));
    const completed = rows(await get('/projects/1?filter=Completed'));
    assert.equal(open.length, 1);
    assert.match(open[0], /Second &lt;task&gt;/);
    assert.equal(completed.length, 1);
    assert.match(completed[0], /aria-label="Complete First task" checked/);
    const saved = await get('/projects/1');
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), saved);
    assert.equal(rows(await get('/projects/2')).length, 0);
    const unchecked = await post('/projects/1/tasks/1', { filter: 'Completed' });
    assert.equal(unchecked.status, 303);
    assert.equal(unchecked.headers.get('location'), '/projects/1?filter=Completed');
    assert.equal(rows(await get('/projects/1?filter=Completed')).length, 0);
    assert.equal(rows(await get('/projects/1?filter=Open')).length, 2);
    await server.stop();
    server = await start(dbPath);
    assert.equal(rows(await get('/projects/1?filter=Open')).length, 2);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive migration, summaries, read-only tasks, and restoration persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  let server;
  try {
    const dbPath = join(directory, 'workboard.sqlite');
    // Seed the original schema to verify upgrades preserve existing IDs and names.
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      INSERT INTO projects (name) VALUES ('Existing project');`);
    legacy.close();
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const projectRows = html => [...html.matchAll(/<li class="project" data-testid="project-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    const taskRows = html => [...html.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    const initial = await get('/');
    assert.match(initial, /<label for="project-filter">Project filter<\/label>/);
    assert.match(initial, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(initial, /data-testid="project-summary">0\/0 completed/);
    await post('/projects', { name: 'Second project' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1', { completed: '1' });
    assert.match(projectRows(await get('/'))[0], /data-testid="project-summary">1\/2 completed/);
    await get('/projects/1?filter=Completed');
    assert.match(projectRows(await get('/'))[0], /1\/2 completed/);
    const archived = await post('/projects/1/archive');
    assert.equal(archived.status, 303);
    const activeRows = projectRows(await get('/'));
    assert.equal(activeRows.length, 1);
    assert.match(activeRows[0], /Second project/);
    const archivedList = await get('/?filter=Archived');
    const archivedRows = projectRows(archivedList);
    assert.equal(archivedRows.length, 1);
    assert.match(archivedRows[0], /Existing project/);
    assert.match(archivedRows[0], /1\/2 completed/);
    assert.match(archivedRows[0], />Open project<\/button>/);
    assert.match(archivedRows[0], />Restore project<\/button>/);
    assert.doesNotMatch(archivedRows[0], />Archive project<\/button>/);
    const archivedPage = await get('/projects/1');
    assert.match(archivedPage, /<p>Archived project<\/p>/);
    assert.match(archivedPage, /<button type="submit" disabled>Create task/);
    assert.equal(taskRows(archivedPage).length, 2);
    assert.ok(taskRows(archivedPage).every(row => /type="checkbox"[^>]* disabled/.test(row)));
    assert.match(taskRows(archivedPage)[0], /checked disabled/);
    assert.equal(taskRows(await get('/projects/1?filter=Open')).length, 1);
    assert.match(taskRows(await get('/projects/1?filter=Completed'))[0], /Complete Done/);
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1')).status, 403);
    assert.equal(await get('/projects/1'), archivedPage);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/?filter=Archived'), archivedList);
    assert.equal(await get('/projects/1'), archivedPage);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.equal(projectRows(await get('/?filter=Archived')).length, 0);
    const restoredList = await get('/');
    const restoredRows = projectRows(restoredList);
    assert.equal(restoredRows.length, 2);
    assert.match(restoredRows[0], /Existing project/);
    assert.match(restoredRows[1], /Second project/);
    assert.match(restoredRows[0], /1\/2 completed/);
    const restoredPage = await get('/projects/1');
    assert.doesNotMatch(restoredPage, /<(?:button|input)\b[^>]* disabled|<p>Archived project<\/p>/);
    assert.match(taskRows(restoredPage)[0], /checked/);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/'), restoredList);
    assert.equal(await get('/projects/1'), restoredPage);
    assert.equal((await post('/projects/1/tasks/1')).status, 303);
    assert.match(projectRows(await get('/'))[0], /0\/2 completed/);
    assert.equal((await post('/projects/1/tasks', { title: 'After restore' })).status, 303);
    assert.match(projectRows(await get('/'))[0], /0\/3 completed/);
    assert.equal((await post('/projects/999/archive')).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('combined filters intersect, retain selections through edits, and work across archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-combined-filters-'));
  let server;
  try {
    const dbPath = join(directory, 'workboard.sqlite');
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const ids = html => [...html.matchAll(/id="task-(\d+)" type="checkbox"/g)].map(match => Number(match[1]));
    const selected = (html, id) => {
      const select = new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`).exec(html)[1];
      return /<option selected>([^<]+)<\/option>/.exec(select)[1];
    };
    const assertFilters = (html, completion, priority) => {
      assert.equal(selected(html, 'task-filter'), completion);
      assert.equal(selected(html, 'priority-filter'), priority);
    };
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const tasks = [];
    for (const priority of ['Low', 'Normal', 'High']) {
      for (const completed of [false, true]) {
        const id = tasks.length + 1;
        await post('/projects/1/tasks', { title: `${priority} ${completed ? 'done' : 'open'}` });
        await post(`/projects/1/tasks/${id}/priority`, { priority });
        if (completed) await post(`/projects/1/tasks/${id}`, { completed: '1' });
        tasks.push({ id, priority, completed });
      }
    }
    await post('/projects/2/tasks', { title: 'Other project' });
    const initial = await get('/projects/1');
    const summary = await get('/');
    const other = await get('/projects/2');
    assertFilters(initial, 'All', 'All');
    assert.match(initial, /<label for="priority-filter">Priority filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Low<\/option><option>Normal<\/option><option>High<\/option>/);
    // Both selects submit together, retaining the unchanged selection.
    assert.match(initial, /<form method="get" action="\/projects\/1">\s*<label for="task-filter">[\s\S]*?id="priority-filter"[\s\S]*?<\/form>/);
    for (const completion of ['All', 'Open', 'Completed']) {
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        const html = await get(`/projects/1?filter=${completion}&priorityFilter=${priority}`);
        assertFilters(html, completion, priority);
        assert.deepEqual(ids(html), tasks.filter(task =>
          (completion === 'All' || task.completed === (completion === 'Completed')) &&
          (priority === 'All' || task.priority === priority)).map(task => task.id));
      }
    }
    assert.equal(await get('/'), summary);
    const filters = { filter: 'Open', priorityFilter: 'High' };
    const path = '/projects/1?filter=Open&priorityFilter=High';
    const before = await get(path);
    assert.deepEqual(ids(before), [5]);
    // Every edit form carries both selections, including create and project rename.
    for (const form of before.matchAll(/<form[^>]*method="post"[^>]*>([\s\S]*?)<\/form>/g)) {
      assert.match(form[1], /name="filter" value="Open"/);
      assert.match(form[1], /name="priorityFilter" value="High"/);
    }
    const rename = await post('/projects/1/tasks/5/rename', { ...filters, title: '  Renamed high  ' });
    assert.equal(rename.headers.get('location'), path);
    const renamed = await get(path);
    assertFilters(renamed, 'Open', 'High');
    assert.deepEqual(ids(renamed), [5]);
    assert.match(renamed, /aria-label="Complete Renamed high"/);
    assert.equal(await get('/'), summary);
    const invalid = await post('/projects/1/tasks/5/rename', { ...filters, title: ' ' });
    assert.equal(invalid.status, 422);
    const errorPage = await invalid.text();
    assertFilters(errorPage, 'Open', 'High');
    assert.deepEqual(ids(errorPage), [5]);
    assert.match(errorPage, /role="alert">Task title is required/);
    const reprioritized = await post('/projects/1/tasks/5/priority', { ...filters, priority: 'Low' });
    assert.equal(reprioritized.headers.get('location'), path);
    assertFilters(await get(path), 'Open', 'High');
    assert.deepEqual(ids(await get(path)), []);
    assert.equal(await get('/'), summary);
    assert.deepEqual(ids(await get('/projects/1?filter=Open&priorityFilter=Low')), [1, 5]);
    const lowFilters = { filter: 'Open', priorityFilter: 'Low' };
    const completed = await post('/projects/1/tasks/5', { ...lowFilters, completed: '1' });
    assert.equal(completed.headers.get('location'), '/projects/1?filter=Open&priorityFilter=Low');
    const openLow = await get(completed.headers.get('location'));
    assertFilters(openLow, 'Open', 'Low');
    assert.deepEqual(ids(openLow), [1]);
    assert.deepEqual(ids(await get('/projects/1?filter=Completed&priorityFilter=Low')), [2, 5]);
    assert.match(await get('/'), /data-testid="project-summary">4\/6 completed/);
    assert.equal(await get('/projects/2'), other);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1?filter=Open&priorityFilter=Low'), openLow);
    assertFilters(await get('/projects/1'), 'All', 'All');
    await post('/projects/1/archive');
    for (const completion of ['All', 'Open', 'Completed']) {
      const html = await get(`/projects/1?filter=${completion}&priorityFilter=Low`);
      assertFilters(html, completion, 'Low');
      assert.doesNotMatch(html, /<select id="(?:task-filter|priority-filter)"[^>]*disabled/);
      assert.match(html, /Archived project/);
      for (const row of html.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)) {
        assert.match(row[1], /type="checkbox"[^>]* disabled/);
        assert.match(row[1], /id="new-task-title-\d+"[^>]* disabled/);
        assert.match(row[1], /<button type="submit" disabled>Rename task/);
        assert.match(row[1], /<select id="task-priority-\d+"[^>]* disabled/);
      }
    }
    await server.stop();
    server = await start(dbPath);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1?filter=Open&priorityFilter=Low'), openLow);
    assert.deepEqual(ids(await get('/projects/1?filter=Completed&priorityFilter=Low')), [2, 5]);
    assert.equal(await get('/projects/2'), other);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project priority defaults migrate, affect only future tasks, and persist independently', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-default-priority-'));
  let server;
  try {
    const dbPath = join(directory, 'workboard.sqlite');
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
      INSERT INTO projects (name) VALUES ('Existing');
      INSERT INTO tasks (project_id, title, completed, priority) VALUES (1, 'Existing task', 1, 'Low');
    `);
    legacy.close();
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const rows = html => [...html.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    const select = (html, id) => new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`).exec(html);
    const selected = (html, id) => /<option selected>([^<]+)<\/option>/.exec(select(html, id)[1])[1];
    const defaultPriority = html => selected(html, 'default-task-priority');
    await post('/projects', { name: 'New project' });
    const initial = await get('/projects/1');
    const otherInitial = await get('/projects/2');
    assert.match(initial, /<label for="default-task-priority">Default task priority<\/label>/);
    assert.equal(select(initial, 'default-task-priority')[1].trim(), '<option>Low</option><option selected>Normal</option><option>High</option>');
    assert.equal(defaultPriority(otherInitial), 'Normal');
    await post('/projects/1/tasks', { title: 'Normal inherited' });
    const initialRows = rows(await get('/projects/1'));
    assert.equal(selected(initialRows[0], 'task-priority-1'), 'Low');
    assert.equal(selected(initialRows[1], 'task-priority-2'), 'Normal');
    const summary = await get('/');
    const filters = { filter: 'Completed', priorityFilter: 'Low' };
    const path = '/projects/1?filter=Completed&priorityFilter=Low';
    const filteredRows = rows(await get(path));
    const changed = await post('/projects/1/default-task-priority', { ...filters, priority: 'High' });
    assert.equal(changed.status, 303);
    assert.equal(changed.headers.get('location'), path);
    const filtered = await get(path);
    assert.equal(defaultPriority(filtered), 'High');
    assert.equal(selected(filtered, 'task-filter'), 'Completed');
    assert.equal(selected(filtered, 'priority-filter'), 'Low');
    assert.deepEqual(rows(filtered), filteredRows);
    assert.deepEqual(rows(await get('/projects/1')), initialRows);
    assert.equal(await get('/'), summary);
    assert.equal(await get('/projects/2'), otherInitial);
    const defaultForm = /<form[^>]*action="\/projects\/1\/default-task-priority">([\s\S]*?)<\/form>/.exec(filtered)[1];
    assert.match(defaultForm, /name="filter" value="Completed"/);
    assert.match(defaultForm, /name="priorityFilter" value="Low"/);
    assert.match(defaultForm, /onchange="this.form.submit\(\)"/);
    for (const priority of ['', 'Urgent']) {
      assert.equal((await post('/projects/1/default-task-priority', { priority })).status, 422);
      assert.equal(await get(path), filtered);
    }
    assert.equal((await post('/projects/999/default-task-priority', { priority: 'High' })).status, 404);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get(path), filtered);
    await post('/projects/1/tasks', { title: '  High inherited  ' });
    let allRows = rows(await get('/projects/1'));
    assert.deepEqual(allRows.slice(0, 2), initialRows);
    assert.equal(selected(allRows[2], 'task-priority-3'), 'High');
    assert.match(allRows[2], /aria-label="Complete High inherited"/);
    assert.doesNotMatch(allRows[2], /type="checkbox"[^>]* checked/);
    await post('/projects/2/default-task-priority', { priority: 'Low' });
    await post('/projects/2/tasks', { title: 'Other inherited' });
    assert.equal(selected(rows(await get('/projects/2'))[0], 'task-priority-4'), 'Low');
    const other = await get('/projects/2');
    const beforeDefaultChange = rows(await get('/projects/1'));
    await post('/projects/1/default-task-priority', { priority: 'Normal' });
    assert.deepEqual(rows(await get('/projects/1')), beforeDefaultChange);
    await post('/projects/1/tasks', { title: 'Normal again' });
    allRows = rows(await get('/projects/1'));
    assert.equal(selected(allRows[3], 'task-priority-5'), 'Normal');
    await post('/projects/1/rename', { name: 'Renamed project' });
    assert.equal(defaultPriority(await get('/projects/1')), 'Normal');
    assert.deepEqual(rows(await get('/projects/1')), allRows);
    assert.match(await get('/'), /data-testid="project-summary">1\/4 completed/);
    await post('/projects/1/default-task-priority', { priority: 'High' });
    await post('/projects/1/archive');
    const archived = await get(path);
    assert.equal(defaultPriority(archived), 'High');
    assert.match(archived, /<select id="default-task-priority"[^>]* disabled/);
    assert.doesNotMatch(archived, /<select id="(?:task-filter|priority-filter)"[^>]* disabled/);
    assert.equal((await post('/projects/1/default-task-priority', { priority: 'Low' })).status, 403);
    assert.equal(await get(path), archived);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get(path), archived);
    assert.equal(withoutMoveControls(await get('/projects/2')), withoutMoveControls(other));
    await post('/projects/1/restore');
    const restored = await get('/projects/1');
    assert.equal(defaultPriority(restored), 'High');
    assert.doesNotMatch(restored, /<select id="default-task-priority"[^>]* disabled/);
    assert.deepEqual(rows(restored), allRows);
    await post('/projects/1/tasks', { title: 'After restore' });
    assert.equal(selected(rows(await get('/projects/1'))[4], 'task-priority-6'), 'High');
    const saved = await get('/projects/1');
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), saved);
    assert.equal(withoutMoveControls(await get('/projects/2')), withoutMoveControls(other));
    assert.match(await get('/'), /data-testid="project-summary">1\/5 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('due dates validate Gregorian days and persist without changing task identity or filters', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-due-date-'));
  let server;
  try {
    const dbPath = join(directory, 'workboard.sqlite');
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (name) VALUES ('Existing'), ('Other');
      INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing task', 1);
    `);
    legacy.close();
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const rows = html => [...html.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    const date = (html, id) => new RegExp(`<input id="task-due-date-${id}"[^>]*value="([^"]*)"`).exec(html)[1];
    await post('/projects/1/tasks', { title: 'New task' });
    await post('/projects/2/tasks', { title: 'Other task' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    const summary = await get('/');
    const other = await get('/projects/2');
    const newRow = rows(await get('/projects/1'))[1];
    const filters = { filter: 'Completed', priorityFilter: 'High' };
    const path = '/projects/1?filter=Completed&priorityFilter=High';
    const initial = await get(path);
    assert.equal(date(initial, 1), '');
    assert.equal(date(newRow, 2), '');
    assert.match(initial, /<label for="task-due-date-1">Task due date<\/label>/);
    const form = /<form[^>]*action="\/projects\/1\/tasks\/1\/due-date">([\s\S]*?)<\/form>/.exec(initial)[1];
    assert.match(form, /name="filter" value="Completed"/);
    assert.match(form, /name="priorityFilter" value="High"/);
    for (const dueDate of ['0001-01-01', '0099-12-31', '2000-02-29', '2024-02-29', '9999-12-31', '  2026-04-30  ']) {
      const response = await post('/projects/1/tasks/1/due-date', { ...filters, dueDate });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), path);
      const html = await get(path);
      assert.equal(date(html, 1), dueDate.trim());
      assert.match(html, /aria-label="Complete Existing task" checked/);
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.match(html, /<option selected>High<\/option>/);
      assert.equal(rows(html).length, 1);
      assert.equal(rows(await get('/projects/1'))[1], newRow);
      assert.equal(await get('/'), summary);
      assert.equal(await get('/projects/2'), other);
    }
    const saved = await get(path);
    for (const dueDate of ['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2025-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '2026-01-32', '2026-1-01', '26-01-01', '2026-01-01T00:00:00Z', '2026-01-01\nextra', '<script>']) {
      const response = await post('/projects/1/tasks/1/due-date', { ...filters, dueDate });
      assert.equal(response.status, 422, dueDate);
      const html = await response.text();
      assert.match(html, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      assert.equal(date(html, 1), '2026-04-30');
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.match(html, /<option selected>High<\/option>/);
      assert.equal(await get(path), saved);
    }
    assert.equal((await post('/projects/2/tasks/1/due-date', { dueDate: '2026-01-01' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/due-date', { dueDate: '' })).status, 404);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get(path), saved);
    await post('/projects/1/tasks/1/rename', { ...filters, title: 'Renamed' });
    assert.equal(date(await get(path), 1), '2026-04-30');
    await post('/projects/1/tasks/2/due-date', { dueDate: '2027-05-01' });
    await post('/projects/1/archive');
    const archived = await get(path);
    assert.match(archived, /id="task-due-date-1"[^>]* disabled/);
    assert.match(archived, /<button type="submit" disabled>Save due date/);
    assert.doesNotMatch(archived, /<select id="(?:task-filter|priority-filter)"[^>]* disabled/);
    assert.equal((await post('/projects/1/tasks/1/due-date', { dueDate: '' })).status, 403);
    assert.equal(await get(path), archived);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get(path), archived);
    await post('/projects/1/restore');
    const restored = await get(path);
    assert.equal(date(restored, 1), '2026-04-30');
    assert.match(restored, /aria-label="Complete Renamed" checked/);
    assert.doesNotMatch(restored, /id="task-due-date-1"[^>]* disabled/);
    for (const dueDate of ['', ' \t\n ']) {
      await post('/projects/1/tasks/1/due-date', { ...filters, dueDate });
      assert.equal(date(await get(path), 1), '');
      assert.equal(date(await get('/projects/1'), 2), '2027-05-01');
    }
    const cleared = await get(path);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get(path), cleared);
    assert.equal(date(await get('/projects/1'), 2), '2027-05-01');
    assert.equal(await get('/'), summary);
    assert.equal(await get('/projects/2'), other);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('inclusive due ranges intersect filters, survive edits, reject invalid ranges, and work when archived', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-due-range-'));
  let server;
  try {
    const dbPath = join(directory, 'workboard.sqlite');
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const ids = html => [...html.matchAll(/id="task-(\d+)" type="checkbox"/g)].map(match => Number(match[1]));
    const selected = (html, id) => /<option selected>([^<]+)<\/option>/.exec(
      new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`).exec(html)[1])[1];
    const apply = fields => fetch(`${server.url}/projects/1/due-range?${new URLSearchParams(fields)}`, { redirect: 'manual' });
    await post('/projects', { name: 'Range project' });
    await post('/projects', { name: 'Other project' });
    const dates = ['', '0001-01-01', '2024-02-28', '2024-02-29', '2024-03-01', '9999-12-31'];
    for (const [index, dueDate] of dates.entries()) {
      await post('/projects/1/tasks', { title: `Task ${index + 1}` });
      await post(`/projects/1/tasks/${index + 1}/due-date`, { dueDate });
      await post(`/projects/1/tasks/${index + 1}/priority`, { priority: index % 2 ? 'High' : 'Low' });
      if (index % 2) await post(`/projects/1/tasks/${index + 1}`, { completed: '1' });
    }
    await post('/projects/2/tasks', { title: 'Other task' });
    const other = await get('/projects/2');
    const summary = await get('/');
    const initial = await get('/projects/1');
    assert.match(initial, /<label for="due-from">Due from<\/label>/);
    assert.match(initial, /<label for="due-through">Due through<\/label>/);
    assert.match(initial, /id="due-from"[^>]*value=""/);
    assert.match(initial, /id="due-through"[^>]*value=""/);
    assert.deepEqual(ids(initial), [1, 2, 3, 4, 5, 6]);
    for (const [from, through, expected] of [
      ['', '', [1, 2, 3, 4, 5, 6]],
      ['', '2024-02-29', [2, 3, 4]],
      ['2024-02-29', '', [4, 5, 6]],
      ['2024-02-28', '2024-03-01', [3, 4, 5]],
      ['2024-02-29', '2024-02-29', [4]],
      ['0001-01-01', '9999-12-31', [2, 3, 4, 5, 6]],
    ]) {
      for (const filter of ['All', 'Open', 'Completed']) {
        for (const priorityFilter of ['All', 'Low', 'Normal', 'High']) {
          const result = await apply({ from: ` ${from} `, through: ` ${through} `, filter, priorityFilter });
          assert.equal(result.status, 303);
          const html = await get(result.headers.get('location'));
          assert.deepEqual(ids(html), expected.filter(id =>
            (filter === 'All' || (id % 2 === 0) === (filter === 'Completed')) &&
            (priorityFilter === 'All' || priorityFilter === (id % 2 ? 'Low' : 'High'))));
          assert.equal(selected(html, 'task-filter'), filter);
          assert.equal(selected(html, 'priority-filter'), priorityFilter);
        }
      }
    }
    assert.equal(await get('/'), summary);
    const fields = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-28', dueThrough: '2024-03-01' };
    const path = '/projects/1?filter=Completed&priorityFilter=High&dueFrom=2024-02-28&dueThrough=2024-03-01';
    const before = await get(path);
    assert.deepEqual(ids(before), [4]);
    // The browser submits the applied boundaries with each edit and combobox change.
    for (const form of before.matchAll(/<form[^>]*>([\s\S]*?)<\/form>/g)) {
      if (!/name="filter"/.test(form[1])) continue;
      assert.match(form[1], /name="dueFrom" value="2024-02-28"/);
      assert.match(form[1], /name="dueThrough" value="2024-03-01"/);
    }
    for (const [from, through, message] of [
      ['2023-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['', '1900-02-29', 'Due range must use valid YYYY-MM-DD dates'],
      ['0000-01-01', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-2-28', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-03-01', '2024-02-29', 'Due from must not be after Due through'],
    ]) {
      const result = await apply({ ...fields, from, through });
      assert.equal(result.status, 422);
      const html = await result.text();
      assert.match(html, new RegExp(`role="alert">${message}`));
      assert.deepEqual(ids(html), [4]);
      assert.equal(selected(html, 'task-filter'), 'Completed');
      assert.equal(selected(html, 'priority-filter'), 'High');
      assert.match(html, /id="due-from"[^>]*value="2024-02-28"/);
    }
    assert.equal(await get(path), before);
    for (const [route, data] of [
      ['/projects/1/rename', { name: 'Renamed project' }],
      ['/projects/1/tasks/4/rename', { title: 'Renamed task' }],
      ['/projects/1/default-task-priority', { priority: 'Low' }],
      ['/projects/1/tasks', { title: 'New undated task' }],
    ]) {
      const result = await post(route, { ...fields, ...data });
      assert.equal(result.headers.get('location'), path);
      assert.deepEqual(ids(await get(path)), [4]);
    }
    const saved = await get(path);
    assert.match(saved, /aria-label="Complete Renamed task" checked/);
    assert.match(saved, /id="task-due-date-4"[^>]*value="2024-02-29"/);
    const newSummary = await get('/');
    assert.match(newSummary, /data-testid="project-summary">3\/7 completed/);
    for (const [suffix, change, restore] of [
      ['/due-date', { dueDate: '2024-03-02' }, { dueDate: '2024-02-29' }],
      ['/priority', { priority: 'Low' }, { priority: 'High' }],
      ['', {}, { completed: '1' }],
    ]) {
      const result = await post(`/projects/1/tasks/4${suffix}`, { ...fields, ...change });
      assert.equal(result.headers.get('location'), path);
      const html = await get(path);
      assert.deepEqual(ids(html), []);
      assert.equal(selected(html, 'task-filter'), 'Completed');
      assert.equal(selected(html, 'priority-filter'), 'High');
      await post(`/projects/1/tasks/4${suffix}`, { ...fields, ...restore });
      assert.equal(await get(path), saved);
    }
    assert.equal(await get('/'), newSummary);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get(path), saved);
    assert.match(await get('/projects/1'), /id="due-from"[^>]*value=""/);
    assert.deepEqual(ids(await get('/projects/1')), [1, 2, 3, 4, 5, 6, 8]);
    await post('/projects/1/archive');
    const archived = await get(path);
    assert.deepEqual(ids(archived), [4]);
    assert.doesNotMatch(archived, /id="due-(?:from|through)"[^>]*disabled/);
    assert.doesNotMatch(archived, /<button[^>]*disabled>Apply due range/);
    assert.match(archived, /id="task-due-date-4"[^>]*disabled/);
    assert.match(archived, /id="task-priority-4"[^>]*disabled/);
    const result = await apply({ filter: 'Open', priorityFilter: 'Low', from: '2024-02-28', through: '2024-03-01' });
    assert.deepEqual(ids(await get(result.headers.get('location'))), [3, 5]);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get(path), archived);
    await post('/projects/1/restore');
    assert.equal(await get(path), saved);
    assert.equal(withoutMoveControls(await get('/projects/2')), withoutMoveControls(other));
    assert.equal(await get('/'), newSummary);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project search normalizes spaces, folds ASCII case, and intersects archive state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-project-search-'));
  let server;
  try {
    server = await start(join(directory, 'workboard.sqlite'));
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const names = html => [...html.matchAll(/class="project-name">([^<]*)<\/span>/g)].map(match => match[1]);
    for (const name of ['Alpha  Board', 'beta ALPHA', 'Alpha archived', 'Älpha', '<Alpha & "Board">']) {
      await post('/projects', { name });
    }
    await post('/projects/3/archive');
    await post('/projects/1/tasks', { title: 'One' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const initial = await get('/');
    assert.match(initial, /<label for="project-search">Project search<\/label>/);
    assert.match(initial, /<button type="submit">Search projects<\/button>/);
    assert.match(initial, /id="project-search"[^>]*value=""/);
    assert.deepEqual(names(await get('/?search=%20aLpHa%20')), ['Alpha  Board', 'beta ALPHA', '&lt;Alpha &amp; &quot;Board&quot;&gt;']);
    assert.deepEqual(names(await get('/?search=alpha%20%20b')), ['Alpha  Board']);
    assert.deepEqual(names(await get('/?search=alpha%20b')), ['Alpha  Board']);
    assert.deepEqual(names(await get('/?search=älpha')), []);
    assert.deepEqual(names(await get('/?search=ÄLPHA')), ['Älpha']);
    assert.deepEqual(names(await get('/?search=%20%09%20')), names(initial));
    const searched = await get('/?search=alpha');
    assert.match(searched, /data-testid="project-summary">1\/1 completed/);
    const filterForm = /<form[^>]*>([\s\S]*?id="project-filter"[\s\S]*?)<\/form>/.exec(searched)[1];
    assert.match(filterForm, /name="search" value="alpha"/);
    const archived = await get('/?filter=Archived&search=alpha');
    assert.deepEqual(names(archived), ['Alpha archived']);
    assert.match(archived, /id="project-search"[^>]*value="alpha"/);
    assert.match(archived, /<option selected>Archived<\/option>/);
    // Open project and Projects navigation deliberately carry no search state.
    assert.match(searched, /<form method="get" action="\/projects\/1"><button type="submit">Open project/);
    assert.match(await get('/projects/1?search=One'), /<form class="back" method="get" action="\/"><button type="submit">Projects/);
    assert.match(await get('/'), /id="project-search"[^>]*value=""/);
    await server.stop();
    server = await start(join(directory, 'workboard.sqlite'));
    assert.equal(await get('/?filter=Archived&search=alpha'), archived);
    assert.equal(await get('/?search=alpha'), searched);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task search intersects all filters and survives edits, movement, validation, archive, and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-search-'));
  let server;
  try {
    server = await start(join(directory, 'workboard.sqlite'));
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const ids = html => [...html.matchAll(/id="task-(\d+)" type="checkbox"/g)].map(match => Number(match[1]));
    await post('/projects', { name: 'Source' });
    await post('/projects', { name: 'Destination' });
    for (const title of ['Alpha  one', 'ALPHA two', 'beta', 'Älpha', 'alpha undated']) {
      await post('/projects/1/tasks', { title });
    }
    for (const id of [1, 2, 3, 4]) {
      await post(`/projects/1/tasks/${id}/due-date`, { dueDate: '2024-02-29' });
      await post(`/projects/1/tasks/${id}/priority`, { priority: 'High' });
    }
    for (const id of [1, 3]) await post(`/projects/1/tasks/${id}`, { completed: '1' });
    const summary = await get('/');
    const initial = await get('/projects/1');
    assert.match(initial, /<label for="task-search">Task search<\/label>/);
    assert.match(initial, /<button type="submit">Search tasks<\/button>/);
    assert.match(initial, /id="task-search"[^>]*value=""/);
    assert.deepEqual(ids(await get('/projects/1?search=%20aLpHa%20')), [1, 2, 5]);
    assert.deepEqual(ids(await get('/projects/1?search=alpha%20%20o')), [1]);
    assert.deepEqual(ids(await get('/projects/1?search=alpha%20o')), [1]);
    assert.deepEqual(ids(await get('/projects/1?search=älpha')), []);
    assert.deepEqual(ids(await get('/projects/1?search=ÄLPHA')), [4]);
    assert.deepEqual(ids(await get('/projects/1?search=%20%09')), [1, 2, 3, 4, 5]);
    const fields = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-28', dueThrough: '2024-03-01', search: 'alpha' };
    const path = '/projects/1?filter=Completed&priorityFilter=High&dueFrom=2024-02-28&dueThrough=2024-03-01&search=alpha';
    let filtered = await get(path);
    assert.deepEqual(ids(filtered), [1]);
    for (const form of filtered.matchAll(/<form[^>]*>([\s\S]*?)<\/form>/g)) {
      if (!/name="filter"/.test(form[1])) continue;
      for (const [key, value] of Object.entries(fields)) assert.ok(form[1].includes(`name="${key}"`), key);
      assert.match(form[1], /name="search"[^>]*value="alpha"/);
      assert.match(form[1], /name="dueFrom" value="2024-02-28"/);
      assert.match(form[1], /name="dueThrough" value="2024-03-01"/);
    }
    assert.deepEqual(ids(await get(path.replace('filter=Completed', 'filter=Open'))), [2]);
    assert.deepEqual(ids(await get(path.replace('priorityFilter=High', 'priorityFilter=Normal'))), []);
    assert.deepEqual(ids(await get(path.replace('search=alpha', 'search='))), [1, 3]);
    const applied = await fetch(`${server.url}/projects/1/due-range?${new URLSearchParams({ ...fields, from: '2024-02-29', through: '2024-02-29' })}`, { redirect: 'manual' });
    assert.equal(applied.headers.get('location'), path.replace('2024-02-28', '2024-02-29').replace('2024-03-01', '2024-02-29'));
    const invalidRange = await fetch(`${server.url}/projects/1/due-range?${new URLSearchParams({ ...fields, from: '2023-02-29' })}`);
    assert.equal(invalidRange.status, 422);
    assert.deepEqual(ids(await invalidRange.text()), [1]);
    assert.equal(await get('/'), summary);
    for (const [route, data] of [
      ['/projects/1/rename', { name: 'Renamed source' }],
      ['/projects/1/default-task-priority', { priority: 'Low' }],
      ['/projects/1/tasks', { title: 'alpha new' }],
      ['/projects/1/tasks/1/rename', { title: '  renamed ALPHA  ' }],
    ]) {
      const result = await post(route, { ...fields, ...data });
      assert.equal(result.headers.get('location'), path);
      assert.deepEqual(ids(await get(path)), [1]);
    }
    for (const [route, data, message] of [
      ['/projects/1/tasks/1/rename', { title: ' ' }, 'Task title is required'],
      ['/projects/1/tasks/1/due-date', { dueDate: '2023-02-29' }, 'Due date must be a valid YYYY-MM-DD date'],
      ['/projects/1/rename', { name: ' ' }, 'Project name is required'],
    ]) {
      const result = await post(route, { ...fields, ...data });
      assert.equal(result.status, 422);
      const html = await result.text();
      assert.ok(html.includes(message));
      assert.deepEqual(ids(html), [1]);
      assert.match(html, /id="task-search"[^>]*value="alpha"/);
    }
    for (const [suffix, change, restore] of [
      ['/rename', { title: 'No match' }, { title: 'Renamed ALPHA' }],
      ['/due-date', { dueDate: '' }, { dueDate: '2024-02-29' }],
      ['/priority', { priority: 'Low' }, { priority: 'High' }],
      ['', {}, { completed: '1' }],
    ]) {
      const result = await post(`/projects/1/tasks/1${suffix}`, { ...fields, ...change });
      assert.equal(result.headers.get('location'), path);
      assert.deepEqual(ids(await get(path)), []);
      await post(`/projects/1/tasks/1${suffix}`, { ...fields, ...restore });
      assert.deepEqual(ids(await get(path)), [1]);
    }
    const moved = await post('/projects/1/tasks/1/move', { ...fields, destination: '2' });
    assert.equal(moved.headers.get('location'), path);
    assert.deepEqual(ids(await get(path)), []);
    assert.deepEqual(ids(await get('/projects/2?search=alpha')), [1]);
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(ids(await get('/projects/1')), [1, 2, 3, 4, 5, 6]);
    filtered = await get(path);
    await server.stop();
    server = await start(join(directory, 'workboard.sqlite'));
    assert.equal(await get(path), filtered);
    assert.match(await get('/projects/1'), /id="task-search"[^>]*value=""/);
    await post('/projects/1/archive');
    const archived = await get(path);
    assert.deepEqual(ids(archived), [1]);
    assert.doesNotMatch(archived, /id="task-search"[^>]*disabled/);
    assert.doesNotMatch(archived, /<button[^>]*disabled>Search tasks/);
    assert.match(archived, /id="task-1"[^>]*disabled/);
    assert.deepEqual(ids(await get(path.replace('search=alpha', 'search=beta'))), [3]);
    assert.deepEqual(ids(await get(path.replace('search=alpha', 'search='))), [1, 3]);
    await post('/projects/1/restore');
    assert.equal(await get(path), filtered);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('space and tab search normalization preserves original saved names and titles', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-search-whitespace-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const names = html => [...html.matchAll(/class="project-name">([^<]*)<\/span>/g)].map(match => match[1]);
    const ids = html => [...html.matchAll(/id="task-(\d+)" type="checkbox"/g)].map(match => Number(match[1]));
    const originals = ['MiXeD  \t \t Board', 'mixed\tboard', 'mixed board', 'mixed\nboard', 'mixed\u00a0board'];
    for (const name of originals) {
      await post('/projects', { name });
      await post('/projects/1/tasks', { title: name });
    }
    await post('/projects/1/tasks/1', { completed: '1' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
    const initial = await get('/projects/1');
    const summary = await get('/');
    for (const query of ['mixed board', 'MIXED\tBOARD', ' \t Mixed \t  \t board \n', 'xed\t \t b']) {
      const search = new URLSearchParams({ search: query });
      assert.deepEqual(names(await get(`/?${search}`)), originals.slice(0, 3));
      const tasks = await get(`/projects/1?${search}`);
      assert.deepEqual(ids(tasks), [1, 2, 3]);
      assert.ok(tasks.includes('aria-label="Complete MiXeD  \t \t Board" checked'));
    }
    // Newlines and non-ASCII whitespace inside a name are not collapsed.
    for (const index of [3, 4]) {
      const search = new URLSearchParams({ search: originals[index] });
      assert.deepEqual(names(await get(`/?${search}`)), [originals[index]]);
      assert.deepEqual(ids(await get(`/projects/1?${search}`)), [index + 1]);
    }
    const filteredPath = `/projects/1?${new URLSearchParams({ search: 'mixed\t  board', filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-02-29' })}`;
    const filtered = await get(filteredPath);
    assert.deepEqual(ids(filtered), [1]);
    assert.equal(await get('/projects/1'), initial);
    assert.equal(await get('/'), summary);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), initial);
    assert.equal(await get('/'), summary);
    assert.equal(await get(filteredPath), filtered);
    await post('/projects/1/archive');
    assert.deepEqual(names(await get('/?filter=Archived&search=mixed%20board')), [originals[0]]);
    assert.deepEqual(ids(await get(filteredPath)), [1]);
    assert.match(await get(filteredPath), /id="task-1"[^>]*disabled/);
    await post('/projects/1/restore');
    assert.equal(await get(filteredPath), filtered);
    const saved = new DatabaseSync(dbPath);
    try {
      assert.deepEqual(saved.prepare('SELECT name FROM projects ORDER BY id').all().map(row => row.name), originals);
      assert.deepEqual(saved.prepare('SELECT title FROM tasks ORDER BY id').all().map(row => row.title), originals);
    } finally {
      saved.close();
    }
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('notes preserve exact text and task data through filters, movement, archive, and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-notes-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const ids = html => [...html.matchAll(/id="task-(\d+)" type="checkbox"/g)].map(match => Number(match[1]));
    const saved = () => {
      const connection = new DatabaseSync(dbPath);
      try {
        return { tasks: connection.prepare('SELECT * FROM tasks ORDER BY id').all().map(task => ({ ...task })), positions: connection.prepare('SELECT * FROM task_project_positions ORDER BY task_id, project_id').all() };
      } finally { connection.close(); }
    };
    await post('/projects', { name: 'Source' });
    await post('/projects', { name: 'Destination' });
    await post('/projects/1/tasks', { title: 'Alpha task' });
    await post('/projects/1/tasks', { title: 'Other task' });
    await post('/projects/2/tasks', { title: 'Destination first' });
    await post('/projects/1/tasks/1', { completed: '1' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
    assert.ok(saved().tasks.every(task => task.notes === ''));
    const fields = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-28', dueThrough: '2024-03-01', search: 'alpha' };
    const path = '/projects/1?filter=Completed&priorityFilter=High&dueFrom=2024-02-28&dueThrough=2024-03-01&search=alpha';
    const before = saved();
    const summary = await get('/');
    const notes = '\n  Unicode 日本語 📝\n<script>alert("literal")</script> & </textarea>\n\t trailing  \n';
    const result = await post('/projects/1/tasks/1/notes', { ...fields, notes });
    assert.equal(result.status, 303);
    assert.equal(result.headers.get('location'), path);
    assert.deepEqual(saved(), { ...before, tasks: before.tasks.map(task => task.id === 1 ? { ...task, notes } : task) });
    const html = await get(path);
    assert.deepEqual(ids(html), [1]);
    assert.match(html, /<label for="task-notes-1">Task notes<\/label>/);
    assert.ok(html.includes('<textarea id="task-notes-1" name="notes">\n\n  Unicode 日本語 📝\n&lt;script&gt;alert(&quot;literal&quot;)&lt;/script&gt; &amp; &lt;/textarea&gt;\n\t trailing  \n</textarea>'));
    const form = /<form[^>]*action="\/projects\/1\/tasks\/1\/notes">([\s\S]*?)<\/form>/.exec(html)[1];
    for (const [key, value] of Object.entries(fields)) assert.ok(form.includes(`name="${key}" value="${value}"`));
    assert.equal(await get('/'), summary);
    assert.deepEqual(ids(await get('/projects/1?search=literal')), []);
    assert.match(await get('/projects/1?search=alpha'), /id="task-search"[^>]*value="alpha"/);
    assert.equal((await post('/projects/2/tasks/1/notes', { notes: 'wrong owner' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/notes', { notes: 'missing' })).status, 404);
    await post('/projects/1/tasks/1/rename', { ...fields, title: 'Renamed alpha' });
    await post('/projects/1/rename', { ...fields, name: 'Renamed source' });
    const afterRename = saved();
    await post('/projects/1/tasks/1/move', { ...fields, destination: '2' });
    assert.deepEqual(ids(await get(path)), []);
    assert.deepEqual(ids(await get('/projects/2')), [3, 1]);
    assert.equal(saved().tasks[0].notes, notes);
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(ids(await get('/projects/1')), [1, 2]);
    assert.deepEqual(saved().tasks, afterRename.tasks);
    await server.stop();
    server = await start(dbPath);
    assert.equal(saved().tasks[0].notes, notes);
    assert.deepEqual(ids(await get(path)), [1]);
    await post('/projects/1/archive');
    const archived = await get(path);
    assert.match(archived, /<textarea id="task-notes-1" name="notes" disabled>/);
    assert.match(archived, /<button type="submit" disabled>Save notes/);
    assert.equal((await post('/projects/1/tasks/1/notes', { ...fields, notes: 'blocked' })).status, 403);
    assert.equal(saved().tasks[0].notes, notes);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get(path), archived);
    await post('/projects/1/restore');
    assert.match(await get(path), /<textarea id="task-notes-1" name="notes">/);
    for (const value of ['   \t\n  ', '']) {
      const state = saved();
      const response = await post('/projects/1/tasks/1/notes', { ...fields, notes: value });
      assert.equal(response.headers.get('location'), path);
      assert.deepEqual(saved(), { ...state, tasks: state.tasks.map(task => task.id === 1 ? { ...task, notes: value } : task) });
      assert.deepEqual(ids(await get(path)), [1]);
    }
    await server.stop();
    server = await start(dbPath);
    assert.equal(saved().tasks[0].notes, '');
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('notes migration preserves all pre-existing task fields and remembered positions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-notes-upgrade-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, default_task_priority TEXT NOT NULL DEFAULT 'Normal');
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal', due_date TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE task_project_positions (task_id INTEGER NOT NULL REFERENCES tasks(id), project_id INTEGER NOT NULL REFERENCES projects(id), position INTEGER NOT NULL, PRIMARY KEY (task_id, project_id), UNIQUE (project_id, position));
      INSERT INTO projects (name, archived, default_task_priority) VALUES ('Source', 0, 'Low'), ('Previous', 1, 'High');
      INSERT INTO tasks (project_id, title, completed, priority, due_date, position) VALUES (1, 'Moved title', 1, 'High', '0001-01-01', 7), (1, 'First title', 0, 'Low', '', 3);
      INSERT INTO task_project_positions VALUES (1, 1, 7), (1, 2, 1), (2, 1, 3);
    `);
    const tasks = legacy.prepare('SELECT * FROM tasks ORDER BY id').all();
    const projects = legacy.prepare('SELECT * FROM projects ORDER BY id').all();
    const positions = legacy.prepare('SELECT * FROM task_project_positions ORDER BY task_id, project_id').all();
    legacy.close();
    server = await start(dbPath);
    const upgraded = new DatabaseSync(dbPath);
    try {
      assert.deepEqual(upgraded.prepare('SELECT * FROM tasks ORDER BY id').all().map(task => ({ ...task })), tasks.map(task => ({ ...task, notes: '', deleted: 0 })));
      assert.deepEqual(upgraded.prepare('SELECT * FROM projects ORDER BY id').all(), projects);
      assert.deepEqual(upgraded.prepare('SELECT * FROM task_project_positions ORDER BY task_id, project_id').all(), positions);
    } finally { upgraded.close(); }
    const html = await (await fetch(`${server.url}/projects/1`)).text();
    assert.deepEqual([...html.matchAll(/id="task-(\d+)" type="checkbox"/g)].map(match => Number(match[1])), [2, 1]);
    assert.match(html, /<textarea id="task-notes-1" name="notes">\n<\/textarea>/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('reversible deletion retains fields, filters, reserved positions, summaries and restart state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-deletion-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const ids = html => [...html.matchAll(/id="task-(\d+)" type="checkbox"/g)].map(match => Number(match[1]));
    const saved = () => {
      const connection = new DatabaseSync(dbPath);
      try {
        return {
          tasks: connection.prepare('SELECT * FROM tasks ORDER BY id').all().map(task => ({ ...task })),
          positions: connection.prepare('SELECT * FROM task_project_positions ORDER BY task_id, project_id').all(),
        };
      } finally { connection.close(); }
    };
    const summary = async (name, expected, archived = false) => {
      const html = await get(archived ? '/?filter=Archived' : '/');
      const row = [...html.matchAll(/data-testid="project-row">([\s\S]*?)<\/li>/g)].find(match => match[1].includes(`>${name}</span>`));
      assert.ok(row?.[1].includes(`data-testid="project-summary">${expected} completed`));
    };
    await post('/projects', { name: 'Source' });
    await post('/projects', { name: 'Destination' });
    for (const title of ['Alpha  first', 'Alpha second', 'Other third', 'Alpha fourth']) {
      await post('/projects/1/tasks', { title });
    }
    await post('/projects/2/tasks', { title: 'Destination first' });
    await post('/projects/1/tasks/1', { completed: '1' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
    const notes = '\n  Saved 日本語 <script>literal</script>\n  ';
    await post('/projects/1/tasks/1/notes', { notes });
    // Establish positions in both projects before deleting.
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    const before = saved();
    assert.ok(before.tasks.every(task => task.deleted === 0));
    const fields = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-28', dueThrough: '2024-03-01', search: 'ALPHA\t first' };
    const path = '/projects/1?filter=Completed&priorityFilter=High&dueFrom=2024-02-28&dueThrough=2024-03-01&search=ALPHA%09%20first';
    const deletedPath = path.replace('filter=Completed', 'filter=Deleted');
    const deletedFields = { ...fields, filter: 'Deleted' };
    const deletion = await post('/projects/1/tasks/1/delete', fields);
    assert.equal(deletion.status, 303);
    assert.equal(deletion.headers.get('location'), path);
    assert.deepEqual(saved(), { ...before, tasks: before.tasks.map(task => task.id === 1 ? { ...task, deleted: 1 } : task) });
    assert.deepEqual(ids(await get(path)), []);
    assert.deepEqual(ids(await get('/projects/1')), [2, 3, 4]);
    assert.deepEqual(ids(await get('/projects/1?filter=Open')), [2, 3, 4]);
    assert.deepEqual(ids(await get('/projects/1?filter=Completed')), []);
    assert.deepEqual(ids(await get(deletedPath)), [1]);
    await summary('Source', '0/3');
    await summary('Destination', '0/1');
    const deletedHtml = await get(deletedPath);
    assert.match(deletedHtml, /<option>All<\/option><option>Open<\/option><option>Completed<\/option><option selected>Deleted<\/option>/);
    assert.match(deletedHtml, /id="task-1"[^>]*checked disabled/);
    for (const id of ['new-task-title-1', 'task-priority-1', 'task-due-date-1', 'task-notes-1', 'destination-project-1']) {
      assert.ok(new RegExp(`id="${id}"[^>]* disabled`).test(deletedHtml), id);
    }
    for (const label of ['Rename task', 'Save due date', 'Save notes', 'Move task']) {
      assert.ok(deletedHtml.includes(`<button type="submit" disabled>${label}</button>`), label);
    }
    assert.match(deletedHtml, /<button type="submit">Restore task<\/button>/);
    assert.doesNotMatch(deletedHtml, />Delete task<\/button>/);
    for (const id of ['task-filter', 'priority-filter', 'due-from', 'due-through', 'task-search']) {
      assert.ok(!new RegExp(`id="${id}"[^>]*disabled`).test(deletedHtml), id);
    }
    const restoreForm = /<form[^>]*action="\/projects\/1\/tasks\/1\/restore">([\s\S]*?)<\/form>/.exec(deletedHtml)[1];
    for (const [key, value] of Object.entries(deletedFields)) assert.ok(restoreForm.includes(`name="${key}" value="${value}"`));
    for (const [suffix, data] of [
      ['', {}], ['/rename', { title: 'blocked' }], ['/priority', { priority: 'Low' }],
      ['/due-date', { dueDate: '' }], ['/notes', { notes: 'blocked' }], ['/move', { destination: '2' }],
    ]) {
      const snapshot = saved();
      assert.equal((await post(`/projects/1/tasks/1${suffix}`, { ...deletedFields, ...data })).status, 403);
      assert.deepEqual(saved(), snapshot);
    }
    for (const variation of [
      deletedPath.replace('priorityFilter=High', 'priorityFilter=Low'),
      deletedPath.replace('dueFrom=2024-02-28', 'dueFrom=2024-03-01'),
      deletedPath.replace('search=ALPHA%09%20first', 'search=literal'),
    ]) assert.deepEqual(ids(await get(variation)), []);
    assert.deepEqual(ids(await get('/projects/1?filter=Deleted')), [1]);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get(deletedPath), deletedHtml);
    assert.equal(saved().tasks[0].notes, notes);
    await post('/projects/1/archive');
    await summary('Source', '0/3', true);
    const archived = await get('/projects/1?filter=Deleted');
    assert.match(archived, /<button type="submit" disabled>Restore task/);
    assert.match(await get('/projects/1'), /<button type="submit" disabled>Delete task/);
    for (const [id, action] of [[1, 'restore'], [2, 'delete']]) {
      const snapshot = saved();
      assert.equal((await post(`/projects/1/tasks/${id}/${action}`, deletedFields)).status, 403);
      assert.deepEqual(saved(), snapshot);
    }
    assert.deepEqual(ids(await get(deletedPath)), [1]);
    await post('/projects/1/restore');
    assert.equal(await get(deletedPath), deletedHtml);
    // Restore under Deleted, retaining its filter and disappearing from it.
    await post('/projects/1/default-task-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Created after deletion' });
    const restoration = await post('/projects/1/tasks/1/restore', deletedFields);
    assert.equal(restoration.headers.get('location'), deletedPath);
    assert.deepEqual(ids(await get(deletedPath)), []);
    assert.deepEqual(ids(await get(path)), [1]);
    assert.deepEqual(ids(await get('/projects/1')), [1, 2, 3, 4, 6]);
    assert.deepEqual(saved().tasks[0], before.tasks[0]);
    await summary('Source', '1/5');
    // Delete multiple tasks and restore in reverse order; slots remain reserved.
    for (const id of [1, 2, 3, 4, 6]) await post(`/projects/1/tasks/${id}/delete`);
    await summary('Source', '0/0');
    assert.deepEqual(ids(await get('/projects/1')), []);
    assert.deepEqual(ids(await get('/projects/1?filter=Deleted')), [1, 2, 3, 4, 6]);
    // Undated deleted tasks follow the same range rules.
    assert.deepEqual(ids(await get('/projects/1?filter=Deleted&dueFrom=0001-01-01')), [1]);
    for (const id of [6, 4, 3, 2, 1]) await post(`/projects/1/tasks/${id}/restore`, { filter: 'Deleted' });
    assert.deepEqual(ids(await get('/projects/1')), [1, 2, 3, 4, 6]);
    await post('/projects/1/tasks/1/move', { destination: '2' });
    assert.deepEqual(ids(await get('/projects/2')), [5, 1]);
    assert.deepEqual(saved().positions.filter(row => row.task_id === 1), before.positions.filter(row => row.task_id === 1));
    assert.equal(saved().tasks[0].notes, notes);
    await summary('Source', '0/4');
    await summary('Destination', '1/2');
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(saved().tasks[0], before.tasks[0]);
    assert.equal((await post('/projects/2/tasks/1/delete')).status, 404);
    assert.equal((await post('/projects/1/tasks/999/restore')).status, 404);
    const final = await get('/projects/1');
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), final);
    assert.deepEqual(saved().tasks[0], before.tasks[0]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('deletion upgrade initializes only live state and retains existing notes and positions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-deletion-upgrade-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, default_task_priority TEXT NOT NULL DEFAULT 'Normal');
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal', due_date TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE task_project_positions (task_id INTEGER NOT NULL REFERENCES tasks(id), project_id INTEGER NOT NULL REFERENCES projects(id), position INTEGER NOT NULL, PRIMARY KEY (task_id, project_id), UNIQUE (project_id, position));
      INSERT INTO projects (name, archived, default_task_priority) VALUES ('Source', 0, 'Low'), ('Previous', 1, 'High');
      INSERT INTO tasks (project_id, title, completed, priority, due_date, notes, position) VALUES (1, 'Moved title', 1, 'High', '0001-01-01', '  Original notes 日本語  ', 7), (1, 'First title', 0, 'Low', '', '', 3);
      INSERT INTO task_project_positions VALUES (1, 1, 7), (1, 2, 1), (2, 1, 3);
    `);
    const tasks = legacy.prepare('SELECT * FROM tasks ORDER BY id').all();
    const projects = legacy.prepare('SELECT * FROM projects ORDER BY id').all();
    const positions = legacy.prepare('SELECT * FROM task_project_positions ORDER BY task_id, project_id').all();
    legacy.close();
    server = await start(dbPath);
    const upgraded = new DatabaseSync(dbPath);
    try {
      assert.deepEqual(upgraded.prepare('SELECT * FROM tasks ORDER BY id').all().map(task => ({ ...task })), tasks.map(task => ({ ...task, deleted: 0 })));
      assert.deepEqual(upgraded.prepare('SELECT * FROM projects ORDER BY id').all(), projects);
      assert.deepEqual(upgraded.prepare('SELECT * FROM task_project_positions ORDER BY task_id, project_id').all(), positions);
    } finally { upgraded.close(); }
    const html = await (await fetch(`${server.url}/projects/1`)).text();
    assert.deepEqual([...html.matchAll(/id="task-(\d+)" type="checkbox"/g)].map(match => Number(match[1])), [2, 1]);
    assert.match(await (await fetch(`${server.url}/`)).text(), /data-testid="project-summary">1\/2 completed/);
    assert.doesNotMatch(await (await fetch(`${server.url}/projects/1?filter=Deleted`)).text(), /data-testid="task-row"/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
