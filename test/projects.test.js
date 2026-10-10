import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('remembered positions migrate current order and restore reverse returns across projects and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-return-order-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const oldDatabase = new DatabaseSync(databasePath);
  oldDatabase.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL
    );
    INSERT INTO projects VALUES (1, 'Original'), (2, 'Second'), (3, 'Third');
    INSERT INTO tasks VALUES
      (1, 1, 'Middle', 0, 20), (2, 1, 'First', 0, 10),
      (3, 1, 'Last', 0, 30), (4, 2, 'Resident', 0, 5);
  `);
  oldDatabase.close();
  let server;
  try {
    server = await startServer(databasePath);
    const get = async path => (await fetch(server.baseUrl + path)).text();
    const post = (path, values = {}) => fetch(server.baseUrl + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const titles = async project => [...(await get(`/projects/${project}`)).matchAll(/<span>(.*?)<\/span>/g)].map(match => match[1]);
    const move = async (task, source, destination) => {
      assert.equal((await post(`/projects/${source}/tasks/${task}/move`, { destinationProject: String(destination) })).status, 303);
    };
    assert.deepEqual(await titles(1), ['First', 'Middle', 'Last']);
    await move(2, 1, 2);
    await move(3, 1, 2);
    await move(1, 1, 2);
    assert.deepEqual(await titles(2), ['Resident', 'First', 'Last', 'Middle']);
    // Every original position is vacant, but a new task must come after them.
    await post('/projects/1/tasks', { title: 'New original' });
    await post('/projects/2/tasks/3/rename', { title: 'Last updated' });
    await post('/projects/2/tasks/3', { completed: '1' });
    await post('/projects/2/tasks/3/priority', { priority: 'High' });
    await post('/projects/2/tasks/3/due-date', { dueDate: '2028-02-29' });
    await post('/projects/1/rename', { name: 'Original renamed' });
    await post('/projects/1/archive');
    assert.equal((await post('/projects/2/tasks/3/move', { destinationProject: '1' })).status, 400);
    await server.stop();
    server = await startServer(databasePath);
    await post('/projects/1/restore');
    // Return in a different order from both creation and departure order.
    await move(3, 2, 1);
    await move(1, 2, 1);
    await move(2, 2, 1);
    assert.deepEqual(await titles(1), ['First', 'Middle', 'Last updated', 'New original']);
    const updated = await get('/projects/1');
    assert.match(updated, /aria-label="Complete Last updated" checked/);
    assert.match(updated, /id="task-priority-3"[^>]*>\s*<option>Low<\/option><option>Normal<\/option><option selected>High<\/option>/);
    assert.match(updated, /id="task-due-date-3"[^>]*value="2028-02-29"/);
    assert.match(await get('/'), /Original renamed[\s\S]*?1\/4 completed/);
    // First-time arrivals also follow vacant remembered positions.
    await move(5, 1, 2);
    await post('/projects/2/tasks', { title: 'New second' });
    await move(1, 1, 3);
    await move(3, 1, 3);
    await move(2, 1, 3);
    assert.deepEqual(await titles(3), ['Middle', 'Last updated', 'First']);
    await server.stop();
    server = await startServer(databasePath);
    await move(1, 3, 2);
    await move(3, 3, 2);
    await move(2, 3, 2);
    assert.deepEqual(await titles(2), ['Resident', 'First', 'Last updated', 'Middle', 'New original', 'New second']);
    assert.deepEqual(await titles(1), []);
    assert.deepEqual(await titles(3), []);
    assert.match(await get('/'), /Original renamed[\s\S]*?0\/0 completed[\s\S]*?Second[\s\S]*?1\/6 completed/);
    const saved = await get('/projects/2');
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/2'), saved);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task moves preserve data and source filters, enforce active projects, and persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-moves-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const oldDatabase = new DatabaseSync(databasePath);
  oldDatabase.exec(`
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0, default_task_priority TEXT NOT NULL DEFAULT 'Normal'
    );
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'Normal', due_date TEXT NOT NULL DEFAULT ''
    );
    INSERT INTO projects (name, archived, default_task_priority) VALUES
      ('Source', 0, 'Normal'), ('Destination', 0, 'Low'), ('Archived', 1, 'Normal'), ('Last', 0, 'Normal');
    INSERT INTO tasks (project_id, title, completed, priority, due_date) VALUES
      (1, 'Move dated', 1, 'High', '2024-02-29'),
      (2, 'Destination first', 0, 'Normal', ''),
      (1, 'Keep matching', 1, 'High', '2024-03-01'),
      (1, 'Move undated', 0, 'High', ''),
      (1, 'Keep hidden', 0, 'Low', ''),
      (3, 'Archived task', 0, 'Normal', '');
  `);
  oldDatabase.close();
  let server;
  try {
    server = await startServer(databasePath);
    const get = async path => (await fetch(server.baseUrl + path)).text();
    const post = (path, values = {}) => fetch(server.baseUrl + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const titles = body => [...body.matchAll(/<span>(.*?)<\/span>/g)].map(match => match[1]);
    const destinationSelect = (body, id) => body.match(new RegExp(`<select id="destination-project-${id}"[^>]*>[\\s\\S]*?<\\/select>`))[0];
    const snapshot = () => {
      const db = new DatabaseSync(databasePath);
      try {
        return db.prepare('SELECT * FROM tasks ORDER BY id').all().map(task => ({ ...task }));
      } finally {
        db.close();
      }
    };
    const selection = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-03-01' };
    const filteredPath = '/projects/1?filter=Completed&priorityFilter=High&dueFrom=2024-02-29&dueThrough=2024-03-01';
    const initial = snapshot();
    assert.deepEqual(titles(await get('/projects/1')), ['Move dated', 'Keep matching', 'Move undated', 'Keep hidden']);
    await post('/projects/2/rename', { name: ' Renamed <destination> ' });
    const filtered = await get(filteredPath);
    assert.deepEqual(titles(filtered), ['Move dated', 'Keep matching']);
    assert.equal(destinationSelect(filtered, 1), '<select id="destination-project-1" name="destinationProject">\n              <option value="2">Renamed &lt;destination&gt;</option><option value="4">Last</option>\n            </select>');
    const moveForm = filtered.match(/<form[^>]*action="\/projects\/1\/tasks\/1\/move"[\s\S]*?<\/form>/)[0];
    for (const [name, value] of Object.entries(selection)) {
      assert.ok(moveForm.includes(`name="${name}" value="${value}"`));
    }
    for (const destinationProject of ['', '1', '3', '999', '2x']) {
      assert.equal((await post('/projects/1/tasks/1/move', { ...selection, destinationProject })).status, 400);
      assert.deepEqual(snapshot(), initial);
    }
    assert.equal((await post('/projects/1/tasks/2/move', { destinationProject: '4' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/move', { destinationProject: '2' })).status, 404);
    assert.deepEqual(snapshot(), initial);
    const moved = await post('/projects/1/tasks/1/move', { ...selection, destinationProject: '2' });
    assert.equal(moved.status, 303);
    assert.equal(moved.headers.get('location'), filteredPath);
    const remaining = await get(filteredPath);
    assert.deepEqual(titles(remaining), ['Keep matching']);
    assert.match(remaining, /<option selected>Completed<\/option>/);
    assert.match(remaining, /<option selected>High<\/option>/);
    assert.match(remaining, /id="due-from"[^>]*value="2024-02-29"/);
    assert.match(remaining, /id="due-through"[^>]*value="2024-03-01"/);
    assert.deepEqual(titles(await get('/projects/2')), ['Destination first', 'Move dated']);
    let saved = snapshot();
    assert.deepEqual(saved[0], { ...initial[0], project_id: 2, position: 3 });
    assert.deepEqual(saved.slice(1), initial.slice(1));
    assert.match(await get('/'), /Source[\s\S]*?1\/3 completed[\s\S]*?Renamed &lt;destination&gt;[\s\S]*?1\/2 completed/);
    await post('/projects/2/tasks', { title: 'New destination task' });
    assert.deepEqual(titles(await get('/projects/2')), ['Destination first', 'Move dated', 'New destination task']);
    assert.equal(snapshot().at(-1).priority, 'Low');
    await post('/projects/1/tasks/4/move', { destinationProject: '2' });
    assert.deepEqual(titles(await get('/projects/2')), ['Destination first', 'Move dated', 'New destination task', 'Move undated']);
    assert.deepEqual(snapshot()[3], { ...initial[3], project_id: 2, position: 5 });
    await post('/projects/2/tasks/1/move', { destinationProject: '1' });
    assert.deepEqual(titles(await get('/projects/1')), ['Move dated', 'Keep matching', 'Keep hidden']);
    assert.deepEqual(titles(await get(filteredPath)), ['Move dated', 'Keep matching']);
    saved = snapshot();
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(snapshot(), saved);
    assert.deepEqual(titles(await get('/projects/1')), ['Move dated', 'Keep matching', 'Keep hidden']);
    assert.deepEqual(titles(await get('/projects/2')), ['Destination first', 'New destination task', 'Move undated']);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.match(destinationSelect(archived, 1), / disabled/);
    assert.equal((archived.match(/>Move task<\/button>/g) || []).length, 3);
    assert.equal((archived.match(/disabled>Move task<\/button>/g) || []).length, 3);
    assert.equal((await post('/projects/1/tasks/1/move', { destinationProject: '2' })).status, 403);
    assert.equal((await post('/projects/2/tasks/4/move', { destinationProject: '1' })).status, 400);
    assert.deepEqual(snapshot(), saved);
    await post('/projects/1/restore');
    assert.doesNotMatch(destinationSelect(await get('/projects/1'), 1), /disabled/);
    await post('/projects/2/archive');
    await post('/projects/4/archive');
    const noDestinations = await get('/projects/1');
    assert.match(destinationSelect(noDestinations, 1), / disabled/);
    assert.doesNotMatch(destinationSelect(noDestinations, 1), /<option/);
    assert.equal((noDestinations.match(/disabled>Move task<\/button>/g) || []).length, 3);
    await post('/projects/2/restore');
    assert.doesNotMatch(destinationSelect(await get('/projects/1'), 1), /disabled/);
    await post('/projects/1/tasks/1/move', { destinationProject: '2' });
    assert.deepEqual(titles(await get('/projects/2')), ['Destination first', 'Move dated', 'New destination task', 'Move undated']);
    assert.deepEqual(snapshot()[0], { ...initial[0], project_id: 2, position: 3 });
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('due dates migrate, validate calendar days, preserve task data, and survive archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-due-dates-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const oldDatabase = new DatabaseSync(databasePath);
  oldDatabase.exec(`
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0, default_task_priority TEXT NOT NULL DEFAULT 'Normal'
    );
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal'
    );
    INSERT INTO projects (name, default_task_priority) VALUES ('Existing', 'High'), ('Other', 'Normal');
    INSERT INTO tasks (project_id, title, completed, priority) VALUES
      (1, 'Saved task', 1, 'High'), (1, 'Other task', 0, 'Normal'), (2, 'Separate project task', 0, 'Low');
  `);
  oldDatabase.close();
  let server;
  try {
    server = await startServer(databasePath);
    const get = async path => (await fetch(server.baseUrl + path)).text();
    const post = (path, values = {}) => fetch(server.baseUrl + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const snapshot = () => {
      const db = new DatabaseSync(databasePath);
      try {
        return db.prepare('SELECT * FROM tasks ORDER BY id').all().map(task => ({ ...task }));
      } finally {
        db.close();
      }
    };
    const dateInput = (body, id) => body.match(new RegExp(`<input id="task-due-date-${id}"[^>]*>`))[0];
    const filters = { filter: 'Completed', priorityFilter: 'High' };
    const filteredPath = '/projects/1?filter=Completed&priorityFilter=High';
    const assertFilters = body => {
      assert.match(body, /<option selected>Completed<\/option>/);
      assert.match(body, /<select id="priority-filter"[^>]*>[\s\S]*?<option selected>High<\/option>/);
      assert.equal((body.match(/data-testid="task-row"/g) || []).length, 1);
    };
    await post('/projects/1/tasks', { title: 'New task' });
    const initialData = snapshot();
    assert.ok(initialData.every(task => task.due_date === ''));
    const initialListing = await get('/');
    const otherProject = await get('/projects/2');
    const initialPage = await get('/projects/1');
    for (const id of [1, 2, 4]) {
      assert.match(initialPage, new RegExp(`<label for="task-due-date-${id}">Task due date<\\/label>`));
      assert.match(dateInput(initialPage, id), /type="text" value=""/);
    }
    assert.equal((initialPage.match(/>Save due date<\/button>/g) || []).length, 3);
    const form = initialPage.match(/<form[^>]*action="\/projects\/1\/tasks\/1\/due-date"[\s\S]*?<\/form>/)[0];
    assert.match(form, /name="filter" value="All"/);
    assert.match(form, /name="priorityFilter" value="All"/);

    for (const date of ['0001-01-01', '0096-02-29', '1600-02-29', '2000-02-29', '2024-02-29', '1900-02-28', '2025-04-30', '9999-12-31']) {
      const response = await post('/projects/1/tasks/1/due-date', { ...filters, dueDate: ` \t${date}\n ` });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), filteredPath);
      const body = await get(filteredPath);
      assertFilters(body);
      assert.ok(dateInput(body, 1).includes(`value="${date}"`));
      assert.deepEqual(snapshot(), initialData.map(task => ({ ...task, due_date: task.id === 1 ? date : '' })));
      assert.equal(await get('/'), initialListing);
      assert.equal(await get('/projects/2'), otherProject);
    }
    const savedPage = await get(filteredPath);
    const savedData = snapshot();
    for (const date of ['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2023-02-29', '2025-04-31', '2024-02-30', '2025-00-01', '2025-13-01', '2025-01-00', '2025-01-32', '2025-1-01', '25-01-01', '2025/01/01', '2025-01-01T00:00:00Z', '<invalid>']) {
      const response = await post('/projects/1/tasks/1/due-date', { ...filters, dueDate: date });
      assert.equal(response.status, 400, date);
      const body = await response.text();
      assert.match(body, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      assertFilters(body);
      assert.match(dateInput(body, 1), /value="9999-12-31"/);
      assert.deepEqual(snapshot(), savedData);
    }
    assert.equal(await get(filteredPath), savedPage);
    assert.equal((await post('/projects/2/tasks/1/due-date', { dueDate: '2025-01-01' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/due-date', { dueDate: '2025-01-01' })).status, 404);
    assert.deepEqual(snapshot(), savedData);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get(filteredPath), savedPage);

    await post('/projects/1/tasks/1/rename', { ...filters, title: ' Renamed task ' });
    assert.match(dateInput(await get(filteredPath), 1), /value="9999-12-31"/);
    assert.deepEqual(snapshot(), savedData.map(task => ({ ...task, title: task.id === 1 ? 'Renamed task' : task.title })));
    await post('/projects/1/tasks/2/due-date', { dueDate: '2026-10-10' });
    const beforeArchive = await get('/projects/1');
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    for (const id of [1, 2, 4]) assert.match(dateInput(archived, id), / disabled/);
    assert.equal((archived.match(/<button type="submit" disabled>Save due date<\/button>/g) || []).length, 3);
    assertFilters(await get(filteredPath));
    for (const dueDate of ['', '2027-01-01']) {
      assert.equal((await post('/projects/1/tasks/1/due-date', { ...filters, dueDate })).status, 403);
      assert.equal(await get('/projects/1'), archived);
    }
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), beforeArchive);
    for (const dueDate of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks/1/due-date', { ...filters, dueDate });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), filteredPath);
      const body = await get(filteredPath);
      assertFilters(body);
      assert.match(dateInput(body, 1), /value=""/);
      assert.match(dateInput(await get('/projects/1'), 2), /value="2026-10-10"/);
    }
    const clearedPage = await get('/projects/1');
    const finalListing = await get('/');
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), clearedPage);
    assert.equal(await get('/'), finalListing);
    assert.equal(await get('/projects/2'), otherProject);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project priority defaults migrate, affect only new tasks, and survive archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-defaults-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const oldDatabase = new DatabaseSync(databasePath);
  oldDatabase.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'Normal'
    );
    INSERT INTO projects (name) VALUES ('Existing');
    INSERT INTO tasks (project_id, title, completed, priority) VALUES
      (1, 'Existing high', 1, 'High'), (1, 'Existing normal', 0, 'Normal');
  `);
  oldDatabase.close();
  let server;
  try {
    server = await startServer(databasePath);
    const get = async path => (await fetch(server.baseUrl + path)).text();
    const post = (path, values = {}) => fetch(server.baseUrl + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const rows = body => [...body.matchAll(/<div class="task-row" data-testid="task-row">([\s\S]*?)<\/div>/g)].map(match => match[1]);
    const selected = (body, id) => body.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)<\\/select>`))[1]
      .match(/<option selected>(.*?)<\/option>/)[1];
    const defaultPriority = body => selected(body, 'default-task-priority');
    await post('/projects', { name: 'New project' });
    for (const id of [1, 2]) {
      const body = await get(`/projects/${id}`);
      assert.equal(defaultPriority(body), 'Normal');
      assert.match(body, /<label for="default-task-priority">Default task priority<\/label>/);
      assert.match(body, /<select id="default-task-priority" name="priority" onchange="this.form.requestSubmit\(\)"/);
      assert.match(body, /<option>Low<\/option><option selected>Normal<\/option><option>High<\/option>/);
    }
    const originalRows = rows(await get('/projects/1'));
    const originalListing = await get('/');
    const otherPage = await get('/projects/2');
    const filters = { filter: 'Completed', priorityFilter: 'High' };
    const filteredPath = '/projects/1?filter=Completed&priorityFilter=High';
    const matchingRows = rows(await get(filteredPath));
    for (const priority of ['Low', 'High', 'Normal', 'High']) {
      const response = await post('/projects/1/default-task-priority', { ...filters, priority });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), filteredPath);
      const body = await get(response.headers.get('location'));
      assert.equal(defaultPriority(body), priority);
      assert.equal(selected(body, 'task-filter'), 'Completed');
      assert.equal(selected(body, 'priority-filter'), 'High');
      assert.deepEqual(rows(body), matchingRows);
      assert.deepEqual(rows(await get('/projects/1')), originalRows);
      assert.equal(await get('/'), originalListing);
      assert.equal(await get('/projects/2'), otherPage);
    }
    for (const priority of ['', 'Urgent', 'high']) {
      assert.equal((await post('/projects/1/default-task-priority', { priority })).status, 400);
      assert.equal(defaultPriority(await get('/projects/1')), 'High');
    }
    assert.equal((await post('/projects/999/default-task-priority', { priority: 'Low' })).status, 404);
    await post('/projects/1/tasks', { title: '  Inherited high  ', ...filters });
    let body = await get('/projects/1');
    assert.equal(selected(body, 'task-priority-3'), 'High');
    assert.match(rows(body)[2], /<span>Inherited high<\/span>/);
    assert.doesNotMatch(rows(body)[2], / checked/);
    await post('/projects/2/default-task-priority', { priority: 'Low' });
    await post('/projects/2/tasks', { title: 'Other low' });
    assert.equal(selected(await get('/projects/2'), 'task-priority-4'), 'Low');
    assert.equal(defaultPriority(await get('/projects/1')), 'High');
    await post('/projects/1/default-task-priority', { priority: 'Low', ...filters });
    assert.deepEqual(rows(await get('/projects/1')), rows(body));
    await post('/projects/1/tasks', { title: 'Inherited low' });
    await post('/projects/1/rename', { name: 'Renamed project', ...filters });
    await post('/projects/1/tasks/3/rename', { title: 'Renamed high', ...filters });
    body = await get('/projects/1');
    assert.equal(defaultPriority(body), 'Low');
    assert.equal(selected(body, 'task-priority-3'), 'High');
    assert.equal(selected(body, 'task-priority-5'), 'Low');
    assert.deepEqual(rows(body).map(row => row.match(/<span>(.*?)<\/span>/)[1]),
      ['Existing high', 'Existing normal', 'Renamed high', 'Inherited low']);
    assert.match(await get('/'), /data-testid="project-summary">1\/4 completed/);
    const otherSavedPage = await get('/projects/2');
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), body);
    assert.equal(await get('/projects/2'), otherSavedPage);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.equal(defaultPriority(archived), 'Low');
    assert.match(archived, /<select id="default-task-priority" name="priority" disabled/);
    assert.equal((await post('/projects/1/default-task-priority', { priority: 'High', ...filters })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    assert.equal(rows(await get(filteredPath)).length, 1);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), body);
    await post('/projects/1/tasks', { title: 'After restoration' });
    assert.equal(selected(await get('/projects/1'), 'task-priority-6'), 'Low');
    assert.equal(await get('/projects/2'), otherSavedPage);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task priorities migrate, remain independent, and survive rename, archive, and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const oldDatabase = new DatabaseSync(databasePath);
  oldDatabase.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO projects (name) VALUES ('First'), ('Second');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing task', 1);
  `);
  oldDatabase.close();
  let server;
  try {
    server = await startServer(databasePath);
    const get = async path => (await fetch(server.baseUrl + path)).text();
    const post = (path, values = {}) => fetch(server.baseUrl + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const rows = body => [...body.matchAll(/<div class="task-row" data-testid="task-row">([\s\S]*?)<\/div>/g)].map(match => match[1]);
    const priorities = body => [...body.matchAll(/<select id="task-priority-\d+"[^>]*>([\s\S]*?)<\/select>/g)].map(match => match[1].trim());
    const options = selected => ['Low', 'Normal', 'High'].map(value => `<option${value === selected ? ' selected' : ''}>${value}</option>`).join('');
    await post('/projects/1/tasks', { title: 'New task' });
    await post('/projects/2/tasks', { title: 'Other task' });
    const original = await get('/projects/1');
    const listing = await get('/');
    const otherProject = await get('/projects/2');
    assert.deepEqual(priorities(original), [options('Normal'), options('Normal')]);
    for (const [index, row] of rows(original).entries()) {
      assert.match(row, new RegExp(`<label for="task-priority-${index + 1}">Task priority</label>`));
      assert.match(row, /name="priority" onchange="this.form.requestSubmit\(\)"/);
    }
    const changed = await post('/projects/1/tasks/1/priority', { priority: 'High', filter: 'Completed' });
    assert.equal(changed.status, 303);
    assert.equal(changed.headers.get('location'), '/projects/1?filter=Completed');
    const saved = await get('/projects/1');
    assert.equal(saved, original.replace(rows(original)[0], rows(original)[0].replace(options('Normal'), options('High'))));
    assert.deepEqual(priorities(await get('/projects/1?filter=Completed')), [options('High')]);
    assert.deepEqual(priorities(await get('/projects/1?filter=Open')), [options('Normal')]);
    assert.equal(await get('/'), listing);
    assert.equal(await get('/projects/2'), otherProject);
    for (const priority of ['', 'Urgent', 'high']) {
      assert.equal((await post('/projects/1/tasks/1/priority', { priority })).status, 400);
      assert.equal(await get('/projects/1'), saved);
    }
    for (const path of ['/projects/2/tasks/1/priority', '/projects/1/tasks/999/priority', '/projects/999/tasks/1/priority']) {
      assert.equal((await post(path, { priority: 'Low' })).status, 404);
    }
    await post('/projects/1/tasks/2/priority', { priority: 'Low', filter: 'Open' });
    await post('/projects/1/tasks/1/rename', { title: 'Renamed task' });
    const renamed = await get('/projects/1');
    assert.deepEqual(priorities(renamed), [options('High'), options('Low')]);
    assert.match(rows(renamed)[0], /aria-label="Complete Renamed task" checked/);
    assert.match(rows(renamed)[1], /<span>New task<\/span>/);
    assert.equal(await get('/'), listing);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), renamed);
    assert.equal(await get('/projects/2'), otherProject);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.deepEqual(priorities(archived), [options('High'), options('Low')]);
    for (const row of rows(archived)) {
      assert.match(row, /<select id="task-priority-\d+" name="priority" disabled/);
    }
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Low' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    assert.deepEqual(priorities(await get('/projects/1?filter=Completed')), [options('High')]);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), renamed);
    await post('/projects/1/tasks/1/priority', { priority: 'Normal' });
    await post('/projects/1/tasks/2', { completed: '1' });
    const final = await get('/projects/1');
    assert.deepEqual(priorities(final), [options('Normal'), options('Low')]);
    assert.match(await get('/'), /data-testid="project-summary">2\/2 completed/);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), final);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task rename preserves ownership, order, completion, filters, summaries, and persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const get = async path => (await fetch(server.baseUrl + path)).text();
    const post = (path, values = {}) => fetch(server.baseUrl + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const rows = body => [...body.matchAll(/<div class="task-row" data-testid="task-row">([\s\S]*?)<\/div>/g)].map(match => match[1]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Finished task' });
    await post('/projects/1/tasks', { title: 'Open task' });
    await post('/projects/2/tasks', { title: 'Other task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await get('/projects/1');
    const listing = await get('/');
    const otherProject = await get('/projects/2');
    assert.equal(rows(original).length, 2);
    for (const [index, row] of rows(original).entries()) {
      const taskId = index + 1;
      assert.match(row, new RegExp(`<label for="new-task-title-${taskId}">New task title</label>`));
      assert.match(row, new RegExp(`<input id="new-task-title-${taskId}" name="title" type="text" autocomplete="off">`));
      assert.match(row, /<button type="submit">Rename task<\/button>/);
    }
    for (const title of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/tasks/1/rename', { title, filter: 'Completed' });
      assert.equal(invalid.status, 400);
      const body = await invalid.text();
      assert.match(body, /role="alert">Task title is required/);
      assert.match(body, /<option selected>Completed<\/option>/);
      assert.equal(rows(body).length, 1);
      assert.match(rows(body)[0], /aria-label="Complete Finished task" checked/);
      assert.equal(await get('/projects/1'), original);
    }
    const renamed = await post('/projects/1/tasks/1/rename', {
      title: '  Renamed <task> & "notes"  ', filter: 'Completed',
    });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const savedPage = await get('/projects/1');
    const tasks = rows(savedPage);
    assert.match(tasks[0], /<span>Renamed &lt;task&gt; &amp; &quot;notes&quot;<\/span>/);
    assert.match(tasks[0], /aria-label="Complete Renamed &lt;task&gt; &amp; &quot;notes&quot;" checked/);
    assert.match(tasks[0], /action="\/projects\/1\/tasks\/1\/rename"/);
    assert.match(tasks[1], /<span>Open task<\/span>/);
    assert.equal(rows(await get('/projects/1?filter=Completed')).length, 1);
    assert.match(rows(await get('/projects/1?filter=Open'))[0], /<span>Open task<\/span>/);
    assert.equal(await get('/'), listing);
    assert.equal(await get('/projects/2'), otherProject);
    for (const path of ['/projects/2/tasks/1/rename', '/projects/1/tasks/3/rename', '/projects/1/tasks/999/rename', '/projects/999/tasks/1/rename']) {
      assert.equal((await post(path, { title: 'Forbidden' })).status, 404);
    }
    assert.equal(await get('/projects/1'), savedPage);
    assert.equal(await get('/projects/2'), otherProject);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), savedPage);
    assert.equal(await get('/'), listing);

    await post('/projects/1/archive');
    const archivedPage = await get('/projects/1');
    for (const row of rows(archivedPage)) {
      assert.match(row, /<input id="new-task-title-\d+"[^>]* disabled>/);
      assert.match(row, /<button type="submit" disabled>Rename task<\/button>/);
    }
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Forbidden' })).status, 403);
    assert.equal(await get('/projects/1'), archivedPage);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), archivedPage);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), savedPage);
    const openRename = await post('/projects/1/tasks/2/rename', { title: '  Restored title  ', filter: 'Open' });
    assert.equal(openRename.status, 303);
    assert.equal(openRename.headers.get('location'), '/projects/1?filter=Open');
    const restoredPage = await get('/projects/1');
    assert.match(rows(restoredPage)[1], /aria-label="Complete Restored title" onchange/);
    assert.match(rows(await get('/projects/1?filter=Open'))[0], /<span>Restored title<\/span>/);
    assert.equal(await get('/'), listing);
    await post('/projects/1/tasks/1');
    assert.match(rows(await get('/projects/1'))[0], /aria-label="Complete Renamed &lt;task&gt; &amp; &quot;notes&quot;" onchange/);
    assert.match(await get('/'), /data-testid="project-summary">0\/2 completed/);
    const finalPage = await get('/projects/1');
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), finalPage);
    assert.equal(await get('/projects/2'), otherProject);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('rename preserves project identity, order, tasks, archive rules, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const get = async path => (await fetch(server.baseUrl + path)).text();
    const post = (path, values = {}) => fetch(server.baseUrl + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second project' });
    await post('/projects/1/tasks', { title: 'Finished task' });
    await post('/projects/1/tasks', { title: 'Open task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await get('/projects/1');
    assert.match(original, /<label for="new-project-name">New project name<\/label>/);
    assert.match(original, /<input id="new-project-name" name="name" type="text" autocomplete="off">/);
    assert.match(original, /<button type="submit">Rename project<\/button>/);
    for (const name of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/rename', { name });
      assert.equal(invalid.status, 400);
      const body = await invalid.text();
      assert.match(body, /role="alert">Project name is required/);
      assert.match(body, /<h1>Original<\/h1>/);
      assert.equal(await get('/projects/1'), original);
    }
    const renamed = await post('/projects/1/rename', { name: '  Renamed <project> & "notes"  ', filter: 'Open' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Open');
    const savedPage = await get('/projects/1');
    assert.match(savedPage, /<h1>Renamed &lt;project&gt; &amp; &quot;notes&quot;<\/h1>/);
    // Only the title and heading change; task markup, IDs, state, and forms stay identical.
    assert.equal(savedPage, original.replaceAll('Original', 'Renamed &lt;project&gt; &amp; &quot;notes&quot;'));
    const listing = await get('/');
    assert.ok(listing.indexOf('Renamed &lt;project&gt;') < listing.indexOf('Second project'));
    assert.match(listing, /data-testid="project-summary">1\/2 completed/);
    assert.deepEqual([...listing.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]), ['/projects/1', '/projects/2']);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), savedPage);
    assert.equal(await get('/'), listing);

    await post('/projects/1/archive');
    const archivedPage = await get('/projects/1');
    assert.match(archivedPage, /<input id="new-project-name"[^>]* disabled>/);
    assert.match(archivedPage, /<button type="submit" disabled>Rename project<\/button>/);
    assert.equal((await post('/projects/1/rename', { name: 'Forbidden' })).status, 403);
    assert.equal(await get('/projects/1'), archivedPage);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), archivedPage);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), savedPage);
    assert.equal((await post('/projects/1/rename', { name: 'Restored name' })).status, 303);
    const restoredPage = await get('/projects/1');
    assert.match(restoredPage, /<h1>Restored name<\/h1>/);
    assert.match(restoredPage, /aria-label="Complete Finished task" checked/);
    assert.match(restoredPage, /aria-label="Complete Open task" onchange/);
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), restoredPage);
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
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
  child.stderr.on('data', chunk => { errors += chunk; });
  const baseUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  return {
    baseUrl,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('project creation, validation, navigation, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const get = path => fetch(server.baseUrl + path);
    const create = name => fetch(server.baseUrl + '/projects', {
      method: 'POST',
      body: new URLSearchParams({ name }),
      redirect: 'manual',
    });
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const initial = await (await get('/')).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, /<input id="project-name" name="name" type="text"/);
    assert.match(initial, />Create project<\/button>/);
    assert.equal((initial.match(/data-testid="project-row"/g) || []).length, 0);

    for (const name of ['', '  \t\n ']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      const body = await invalid.text();
      assert.match(body, /role="alert">Project name is required/);
      assert.doesNotMatch(body, /data-testid="project-row"/);
    }
    for (const name of ['  First project  ', 'Second <project> & café']) {
      const created = await create(name);
      assert.equal(created.status, 303);
      assert.equal(created.headers.get('location'), '/');
    }
    const listing = await (await get('/')).text();
    assert.equal((listing.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(listing, /<span>First project<\/span>/);
    assert.match(listing, /Second &lt;project&gt; &amp; café/);
    assert.ok(listing.indexOf('First project') < listing.indexOf('Second &lt;project&gt;'));
    const paths = [...listing.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    assert.notEqual(paths[0], paths[1]);
    const project = await (await get(paths[0])).text();
    assert.match(project, /<h1>First project<\/h1>/);
    assert.match(project, /action="\/".*<button type="submit">Projects<\/button>/);
    const invalidAfterCreation = await create('   ');
    assert.equal(((await invalidAfterCreation.text()).match(/data-testid="project-row"/g) || []).length, 2);

    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await (await get('/')).text(), listing);
    assert.match(await (await get(paths[0])).text(), /<h1>First project<\/h1>/);
    assert.equal((await get('/projects/999999')).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, toggle, remain isolated, and persist after restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  let server;
  try {
    const databasePath = join(directory, 'workboard.sqlite');
    server = await startServer(databasePath);
    const get = async path => (await fetch(server.baseUrl + path)).text();
    const post = (path, values) => fetch(server.baseUrl + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const rows = body => [...body.matchAll(/<div class="task-row" data-testid="task-row">([\s\S]*?)<\/div>/g)].map(match => match[1]);
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
      const body = await response.text();
      assert.match(body, /role="alert">Task title is required/);
      assert.equal(rows(body).length, 0);
    }
    for (const title of ['  First task  ', 'Review <draft> & "notes"']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/projects/1?filter=All');
    }
    await post('/projects/2/tasks', { title: 'Other project task' });
    let tasks = rows(await get('/projects/1'));
    assert.equal(tasks.length, 2);
    assert.match(tasks[0], /<span>First task<\/span>/);
    assert.match(tasks[0], /type="checkbox".*aria-label="Complete First task"/);
    assert.match(tasks[1], /aria-label="Complete Review &lt;draft&gt; &amp; &quot;notes&quot;"/);
    assert.ok(tasks.every(task => !task.includes(' checked')));
    assert.equal(rows(await get('/projects/1?filter=Open')).length, 2);
    assert.equal(rows(await get('/projects/1?filter=Completed')).length, 0);
    const invalid = await post('/projects/1/tasks', { title: '   ' });
    assert.equal(rows(await invalid.text()).length, 2);

    const completed = await post('/projects/1/tasks/1', { completed: '1', filter: 'Open' });
    assert.equal(completed.status, 303);
    assert.equal(completed.headers.get('location'), '/projects/1?filter=Open');
    tasks = rows(await get('/projects/1'));
    assert.match(tasks[0], / checked/);
    assert.doesNotMatch(tasks[1], / checked/);
    assert.match(rows(await get('/projects/1?filter=Completed'))[0], /First task/);
    assert.equal(rows(await get('/projects/1?filter=Completed')).length, 1);
    const open = await get('/projects/1?filter=Open');
    assert.match(open, /<option selected>Open<\/option>/);
    assert.equal(rows(open).length, 1);
    assert.match(rows(open)[0], /Review &lt;draft&gt;/);
    assert.equal(rows(await get('/projects/2')).length, 1);
    assert.doesNotMatch(await get('/projects/2'), /First task|Review &lt;draft&gt;/);
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Missing project' })).status, 404);

    const savedPage = await get('/projects/1');
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), savedPage);
    assert.equal(rows(await get('/projects/2')).length, 1);
    assert.equal((await post('/projects/1/tasks/1', {})).status, 303);
    assert.equal(rows(await get('/projects/1?filter=Completed')).length, 0);
    assert.equal(rows(await get('/projects/1?filter=Open')).length, 2);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(rows(await get('/projects/1?filter=Open')).length, 2);
    assert.ok(rows(await get('/projects/1')).every(task => !task.includes(' checked')));
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive, summaries, read-only tasks, restoration, and migration persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const databasePath = join(directory, 'workboard.sqlite');
  // Start with the schema from Task 002 to verify existing data survives migration.
  const oldDatabase = new DatabaseSync(databasePath);
  oldDatabase.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO projects (name) VALUES ('Existing project');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Saved task', 1);
  `);
  oldDatabase.close();
  let server;
  try {
    server = await startServer(databasePath);
    const get = async path => (await fetch(server.baseUrl + path)).text();
    const post = (path, values = {}) => fetch(server.baseUrl + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const rows = body => [...body.matchAll(/data-testid="project-row">([\s\S]*?)<\/div>\s*<form method="get"([\s\S]*?)<\/div>/g)].map(match => match[0]);
    let active = await get('/');
    assert.match(active, /<label for="project-filter">Project filter<\/label>/);
    assert.match(active, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(active, /data-testid="project-summary">1\/1 completed/);
    await post('/projects', { name: 'Second project' });
    await post('/projects/1/tasks', { title: 'Open task' });
    active = await get('/');
    assert.equal(rows(active).length, 2);
    assert.match(rows(active)[0], /Existing project[\s\S]*1\/2 completed/);
    assert.match(rows(active)[1], /Second project[\s\S]*0\/0 completed/);
    assert.match(rows(active)[0], />Open project<\/button>/);
    assert.match(rows(active)[0], />Archive project<\/button>/);
    assert.doesNotMatch(active, />Restore project<\/button>/);
    assert.equal((await post('/projects/1/archive')).status, 303);
    assert.doesNotMatch(await get('/'), /Existing project/);
    const archived = await get('/?filter=Archived');
    assert.equal(rows(archived).length, 1);
    assert.match(archived, /<option selected>Archived<\/option>/);
    assert.match(archived, /Existing project/);
    assert.match(archived, /data-testid="project-summary">1\/2 completed/);
    assert.match(archived, />Open project<\/button>/);
    assert.match(archived, />Restore project<\/button>/);
    assert.doesNotMatch(archived, />Archive project<\/button>/);
    const projectPage = await get('/projects/1');
    assert.match(projectPage, /<p>Archived project<\/p>/);
    assert.match(projectPage, /<button type="submit" disabled>Create task<\/button>/);
    const checkboxes = [...projectPage.matchAll(/<input type="checkbox"[^>]*>/g)].map(match => match[0]);
    assert.equal(checkboxes.length, 2);
    assert.ok(checkboxes.every(checkbox => checkbox.includes(' disabled')));
    assert.match(checkboxes[0], / checked/);
    assert.doesNotMatch(checkboxes[1], / checked/);
    const open = await get('/projects/1?filter=Open');
    assert.match(open, /Open task/);
    assert.doesNotMatch(open, /Saved task/);
    const completed = await get('/projects/1?filter=Completed');
    assert.match(completed, /Saved task/);
    assert.doesNotMatch(completed, /Open task/);
    assert.equal((await post('/projects/1/tasks', { title: 'Forbidden task' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1')).status, 403);
    assert.equal(await get('/projects/1'), projectPage);

    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/?filter=Archived'), archived);
    assert.equal(await get('/projects/1'), projectPage);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.doesNotMatch(await get('/?filter=Archived'), /data-testid="project-row"/);
    active = await get('/');
    assert.equal(rows(active).length, 2);
    assert.match(rows(active)[0], /Existing project[\s\S]*1\/2 completed/);
    const restored = await get('/projects/1');
    assert.doesNotMatch(restored, / disabled|Archived project/);
    assert.match(restored, /Saved task" checked/);
    await post('/projects/1/tasks/2', { completed: '1' });
    assert.match(rows(await get('/'))[0], /2\/2 completed/);
    await post('/projects/1/tasks/1');
    active = await get('/');
    assert.match(rows(active)[0], /1\/2 completed/);
    const savedTasks = await get('/projects/1');
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/'), active);
    assert.equal(await get('/projects/1'), savedTasks);
    assert.equal((await post('/projects/999/archive')).status, 404);
    assert.equal((await post('/projects/999/restore')).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('combined filters preserve selections, re-evaluate edits, and work after archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-filters-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const get = async path => (await fetch(server.baseUrl + path)).text();
    const post = (path, values = {}) => fetch(server.baseUrl + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const titles = body => [...body.matchAll(/<span>(.*?)<\/span>/g)].map(match => match[1]);
    const selected = (body, id) => body.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)<\\/select>`))[1]
      .match(/<option selected>(.*?)<\/option>/)[1];
    await post('/projects', { name: 'Filters' });
    await post('/projects', { name: 'Other' });
    const tasks = [];
    for (const priority of ['Low', 'Normal', 'High']) {
      for (const completed of [false, true]) {
        const id = tasks.length + 1;
        const title = `${priority} ${completed ? 'done' : 'open'}`;
        await post('/projects/1/tasks', { title });
        await post(`/projects/1/tasks/${id}/priority`, { priority });
        if (completed) await post(`/projects/1/tasks/${id}`, { completed: '1' });
        tasks.push({ id, title, priority, completed });
      }
    }
    const summary = await get('/');
    const initialPage = await get('/projects/1');
    assert.equal(selected(initialPage, 'priority-filter'), 'All');
    assert.match(initialPage, /<label for="priority-filter">Priority filter<\/label>/);
    assert.match(initialPage, /<option selected>All<\/option><option>Low<\/option><option>Normal<\/option><option>High<\/option>/);
    const filterForm = initialPage.match(/<form class="task-filter"[\s\S]*?<\/form>/)[0];
    assert.match(filterForm, /name="filter" onchange="this.form.requestSubmit\(\)"/);
    assert.match(filterForm, /name="priorityFilter" onchange="this.form.requestSubmit\(\)"/);
    for (const filter of ['All', 'Open', 'Completed']) {
      for (const priorityFilter of ['All', 'Low', 'Normal', 'High']) {
        const body = await get(`/projects/1?filter=${filter}&priorityFilter=${priorityFilter}`);
        assert.equal(selected(body, 'task-filter'), filter);
        assert.equal(selected(body, 'priority-filter'), priorityFilter);
        assert.deepEqual(titles(body), tasks.filter(task =>
          (filter === 'All' || task.completed === (filter === 'Completed')) &&
          (priorityFilter === 'All' || task.priority === priorityFilter)).map(task => task.title));
      }
    }
    assert.equal(await get('/'), summary);
    const selection = { filter: 'Open', priorityFilter: 'High' };
    const filteredPath = '/projects/1?filter=Open&priorityFilter=High';
    const filteredPage = await get(filteredPath);
    // Every editing form carries both selections through its submission.
    for (const match of filteredPage.matchAll(/<form[^>]*method="post"[\s\S]*?<\/form>/g)) {
      assert.match(match[0], /name="filter" value="Open"/);
      assert.match(match[0], /name="priorityFilter" value="High"/);
    }
    for (const [path, values, alert] of [
      ['/projects/1/tasks/5/rename', { title: '  ' }, 'Task title is required'],
      ['/projects/1/tasks/5/priority', { priority: 'invalid' }, 'Invalid task priority'],
      ['/projects/1/tasks', { title: '  ' }, 'Task title is required'],
      ['/projects/1/rename', { name: '  ' }, 'Project name is required'],
    ]) {
      const response = await post(path, { ...selection, ...values });
      assert.equal(response.status, 400);
      const body = await response.text();
      assert.ok(body.includes(`role="alert">${alert}`));
      assert.equal(selected(body, 'task-filter'), 'Open');
      assert.equal(selected(body, 'priority-filter'), 'High');
      assert.deepEqual(titles(body), ['High open']);
    }
    const renamed = await post('/projects/1/tasks/5/rename', { ...selection, title: '  Renamed high  ' });
    assert.equal(renamed.headers.get('location'), filteredPath);
    let body = await get(filteredPath);
    assert.deepEqual(titles(body), ['Renamed high']);
    assert.equal(selected(body, 'task-priority-5'), 'High');
    assert.match(body, /aria-label="Complete Renamed high"/);
    assert.equal(await get('/'), summary);
    const changedPriority = await post('/projects/1/tasks/5/priority', { ...selection, priority: 'Low' });
    assert.equal(changedPriority.headers.get('location'), filteredPath);
    body = await get(filteredPath);
    assert.deepEqual(titles(body), []);
    assert.equal(selected(body, 'task-filter'), 'Open');
    assert.equal(selected(body, 'priority-filter'), 'High');
    assert.equal(await get('/'), summary);
    assert.deepEqual(titles(await get('/projects/1?filter=Open&priorityFilter=Low')), ['Low open', 'Renamed high']);
    const completed = await post('/projects/1/tasks/1', { filter: 'Open', priorityFilter: 'Low', completed: '1' });
    assert.equal(completed.headers.get('location'), '/projects/1?filter=Open&priorityFilter=Low');
    assert.deepEqual(titles(await get(completed.headers.get('location'))), ['Renamed high']);
    const reopened = await post('/projects/1/tasks/2', { filter: 'Completed', priorityFilter: 'Low' });
    assert.equal(reopened.headers.get('location'), '/projects/1?filter=Completed&priorityFilter=Low');
    assert.deepEqual(titles(await get(reopened.headers.get('location'))), ['Low open']);
    assert.equal(await get('/'), summary);
    assert.deepEqual(titles(await get('/projects/2')), []);
    const savedPage = await get('/projects/1?filter=Open&priorityFilter=Low');
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1?filter=Open&priorityFilter=Low'), savedPage);
    assert.equal(selected(await get('/projects/1'), 'priority-filter'), 'All');
    await post('/projects/1/archive');
    const archived = await get('/projects/1?filter=Open&priorityFilter=Low');
    assert.deepEqual(titles(archived), ['Low done', 'Renamed high']);
    assert.match(archived, /<select id="task-filter" name="filter" onchange/);
    assert.match(archived, /<select id="priority-filter" name="priorityFilter" onchange/);
    assert.equal((archived.match(/<select id="task-priority-\d+" name="priority" disabled/g) || []).length, 2);
    assert.equal((await post('/projects/1/tasks/5/priority', { ...selection, priority: 'High' })).status, 403);
    assert.deepEqual(titles(await get('/projects/1?filter=Completed&priorityFilter=High')), ['High done']);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1?filter=Open&priorityFilter=Low'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1?filter=Open&priorityFilter=Low'), savedPage);
    assert.equal(await get('/'), summary);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('inclusive due ranges intersect filters, retain state through edits, and preserve archived data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-due-range-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const get = async path => (await fetch(server.baseUrl + path)).text();
    const post = (path, values = {}) => fetch(server.baseUrl + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const titles = body => [...body.matchAll(/<span>(.*?)<\/span>/g)].map(match => match[1]);
    const snapshot = () => {
      const db = new DatabaseSync(databasePath);
      try {
        return db.prepare('SELECT * FROM tasks ORDER BY id').all().map(task => ({ ...task }));
      } finally {
        db.close();
      }
    };
    const assertSelection = (body, values) => {
      for (const [id, value] of [['task-filter', values.filter], ['priority-filter', values.priorityFilter]]) {
        const select = body.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)<\\/select>`))[1];
        assert.ok(select.includes(`<option selected>${value}</option>`));
      }
      assert.ok(body.includes(`id="due-from" name="dueFrom" type="text" value="${values.dueFrom}"`));
      assert.ok(body.includes(`id="due-through" name="dueThrough" type="text" value="${values.dueThrough}"`));
    };
    await post('/projects', { name: 'Ranges' });
    await post('/projects', { name: 'Other' });
    const tasks = [
      { title: 'Undated', date: '', priority: 'High', completed: false },
      { title: 'Before', date: '2024-02-28', priority: 'High', completed: false },
      { title: 'Lower boundary', date: '2024-02-29', priority: 'High', completed: false },
      { title: 'Inside', date: '2024-03-01', priority: 'Normal', completed: true },
      { title: 'Upper boundary', date: '2024-03-02', priority: 'High', completed: false },
      { title: 'After', date: '2024-03-03', priority: 'Low', completed: true },
    ];
    for (const [index, task] of tasks.entries()) {
      const path = `/projects/1/tasks/${index + 1}`;
      await post('/projects/1/tasks', { title: task.title });
      await post(`${path}/priority`, { priority: task.priority });
      await post(`${path}/due-date`, { dueDate: task.date });
      if (task.completed) await post(path, { completed: '1' });
    }
    const originalData = snapshot();
    const listing = await get('/');
    const initial = await get('/projects/1');
    const all = { filter: 'All', priorityFilter: 'All', dueFrom: '', dueThrough: '' };
    assertSelection(initial, all);
    assert.match(initial, /<label for="due-from">Due from<\/label>/);
    assert.match(initial, /<label for="due-through">Due through<\/label>/);
    assert.match(initial, />Apply due range<\/button>/);
    // Exercise every combination, inclusive boundaries, and each unbounded side.
    for (const [dueFrom, dueThrough] of [
      ['', ''], ['2024-02-29', ''], ['', '2024-03-02'],
      ['2024-02-29', '2024-03-02'], ['2024-02-29', '2024-02-29'],
      ['0001-01-01', '9999-12-31'],
    ]) {
      for (const filter of ['All', 'Open', 'Completed']) {
        for (const priorityFilter of ['All', 'Low', 'Normal', 'High']) {
          const values = { filter, priorityFilter, dueFrom, dueThrough };
          const response = await post('/projects/1/due-range', values);
          assert.equal(response.status, 303);
          const body = await get(response.headers.get('location'));
          assertSelection(body, values);
          const expected = tasks.filter(task =>
            (filter === 'All' || task.completed === (filter === 'Completed')) &&
            (priorityFilter === 'All' || task.priority === priorityFilter) &&
            ((!dueFrom && !dueThrough) || (task.date &&
              (!dueFrom || task.date >= dueFrom) && (!dueThrough || task.date <= dueThrough))));
          assert.deepEqual(titles(body), expected.map(task => task.title));
        }
      }
    }
    assert.deepEqual(snapshot(), originalData);
    assert.equal(await get('/'), listing);
    const selection = { filter: 'Open', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-03-02' };
    const response = await post('/projects/1/due-range', { ...selection, dueFrom: ' 2024-02-29\t', dueThrough: '\n2024-03-02 ' });
    const filteredPath = response.headers.get('location');
    assert.equal(filteredPath, '/projects/1?filter=Open&priorityFilter=High&dueFrom=2024-02-29&dueThrough=2024-03-02');
    const filtered = await get(filteredPath);
    assert.deepEqual(titles(filtered), ['Lower boundary', 'Upper boundary']);
    for (const form of filtered.matchAll(/<form[^>]*>[\s\S]*?<\/form>/g)) {
      if (form[0].includes('action="/"')) continue;
      assert.match(form[0], /name="filter"[^>]*value="Open"|<option selected>Open<\/option>/);
      assert.match(form[0], /name="priorityFilter"[^>]*value="High"|<option selected>High<\/option>/);
      if (form[0].includes('/due-range')) {
        assert.match(form[0], /name="appliedDueFrom" value="2024-02-29"/);
        assert.match(form[0], /name="appliedDueThrough" value="2024-03-02"/);
      } else {
        assert.match(form[0], /type="hidden" name="dueFrom" value="2024-02-29"/);
        assert.match(form[0], /type="hidden" name="dueThrough" value="2024-03-02"/);
      }
    }
    for (const [dueFrom, dueThrough, error] of [
      ['2023-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['', '1900-02-29', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-04-31', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['0000-01-01', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['10000-01-01', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-2-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-03-02', '2024-02-29', 'Due from must not be after Due through'],
    ]) {
      const invalid = await post('/projects/1/due-range', {
        ...selection, dueFrom, dueThrough,
        appliedDueFrom: selection.dueFrom, appliedDueThrough: selection.dueThrough,
      });
      assert.equal(invalid.status, 400);
      const body = await invalid.text();
      assert.ok(body.includes(`role="alert">${error}`));
      assertSelection(body, selection);
      assert.deepEqual(titles(body), ['Lower boundary', 'Upper boundary']);
      assert.deepEqual(snapshot(), originalData);
    }
    // Changing a combobox submits the same applied range and the other selection.
    assert.deepEqual(titles(await get(filteredPath.replace('filter=Open', 'filter=Completed'))), []);
    assert.deepEqual(titles(await get(filteredPath.replace('priorityFilter=High', 'priorityFilter=Normal').replace('filter=Open', 'filter=Completed'))), ['Inside']);
    const edit = async (path, values) => {
      const result = await post(path, { ...selection, ...values });
      assert.equal(result.status, 303);
      assert.equal(result.headers.get('location'), filteredPath);
      const body = await get(filteredPath);
      assertSelection(body, selection);
      return titles(body);
    };
    assert.deepEqual(await edit('/projects/1/tasks/3/rename', { title: 'Renamed boundary' }), ['Renamed boundary', 'Upper boundary']);
    assert.deepEqual(await edit('/projects/1/rename', { name: 'Renamed project' }), ['Renamed boundary', 'Upper boundary']);
    assert.deepEqual(await edit('/projects/1/default-task-priority', { priority: 'High' }), ['Renamed boundary', 'Upper boundary']);
    assert.deepEqual(await edit('/projects/1/tasks', { title: 'New undated task' }), ['Renamed boundary', 'Upper boundary']);
    assert.deepEqual(await edit('/projects/1/tasks/7/due-date', { dueDate: '2024-03-01' }), ['Renamed boundary', 'Upper boundary', 'New undated task']);
    assert.deepEqual(await edit('/projects/1/tasks/3/due-date', { dueDate: '2024-02-28' }), ['Upper boundary', 'New undated task']);
    assert.deepEqual(await edit('/projects/1/tasks/5/priority', { priority: 'Low' }), ['New undated task']);
    assert.deepEqual(await edit('/projects/1/tasks/7', { completed: '1' }), []);
    assert.deepEqual(await edit('/projects/1/tasks/7', {}), ['New undated task']);
    assert.deepEqual(await edit('/projects/1/tasks/7/due-date', { dueDate: '  ' }), []);
    assert.match(await get('/'), /data-testid="project-summary">2\/7 completed/);
    const saved = snapshot();
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(snapshot(), saved);
    assertSelection(await get(filteredPath), selection);
    assertSelection(await get('/projects/1'), all);
    await post('/projects/1/archive');
    const archivedResponse = await post('/projects/1/due-range', { ...all, dueFrom: '2024-02-29', dueThrough: '2024-03-02' });
    assert.equal(archivedResponse.status, 303);
    const archived = await get(archivedResponse.headers.get('location'));
    assert.deepEqual(titles(archived), ['Inside', 'Upper boundary']);
    for (const id of ['due-from', 'due-through', 'task-filter', 'priority-filter']) {
      const control = archived.match(new RegExp(`<(?:input|select) id="${id}"[^>]*>`))[0];
      assert.doesNotMatch(control, /disabled/);
    }
    assert.match(archived, /<button type="submit">Apply due range<\/button>/);
    assert.match(archived, /id="task-due-date-4"[^>]* disabled/);
    assert.equal((await post('/projects/1/tasks/4/due-date', { ...selection, dueDate: '2024-03-02' })).status, 403);
    assert.deepEqual(snapshot(), saved);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get(archivedResponse.headers.get('location')), archived);
    await post('/projects/1/restore');
    assert.deepEqual(snapshot(), saved);
    assert.doesNotMatch(await get(filteredPath), / disabled|Archived project/);
    assertSelection(await get('/projects/1'), all);
    assert.deepEqual(titles(await get('/projects/2')), []);
    assert.equal((await post('/projects/999/due-range')).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
