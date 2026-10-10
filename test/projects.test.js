import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('due ranges intersect filters, validate without replacing the applied range, and follow edits', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-ranges-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.url}${path}`)).text();
    const titles = page => [...page.matchAll(/<span>([^<]*)<\/span>/g)].map(match => match[1]);
    const apply = values => post('/projects/1/due-range', values);
    const follow = async response => {
      assert.equal(response.status, 303);
      return html(response.headers.get('location'));
    };
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const dates = ['', '2024-02-28', '2024-02-29', '2024-03-01', '2024-03-02', '0001-01-01', '9999-12-31'];
    for (const [index, date] of dates.entries()) {
      await post('/projects/1/tasks', { title: `Task ${index + 1}` });
      await post(`/projects/1/tasks/${index + 1}/due-date`, { dueDate: date });
    }
    await post('/projects/2/tasks', { title: 'Other project task' });
    await post('/projects/1/tasks/3/priority', { priority: 'High' });
    await post('/projects/1/tasks/4/priority', { priority: 'High' });
    await post('/projects/1/tasks/3', { completed: '1' });
    const list = await html('/');
    const initial = await html('/projects/1');
    assert.match(initial, /<label for="due-from">Due from<\/label>/);
    assert.match(initial, /<input id="due-from"[^>]*type="text" value=""/);
    assert.match(initial, /<label for="due-through">Due through<\/label>/);
    assert.match(initial, /<input id="due-through"[^>]*type="text" value=""/);
    assert.match(initial, />Apply due range<\/button>/);
    for (const [from, through, expected] of [
      ['', '', ['Task 1', 'Task 2', 'Task 3', 'Task 4', 'Task 5', 'Task 6', 'Task 7']],
      ['2024-02-29', '', ['Task 3', 'Task 4', 'Task 5', 'Task 7']],
      ['', '2024-03-01', ['Task 2', 'Task 3', 'Task 4', 'Task 6']],
      ['2024-02-29', '2024-03-01', ['Task 3', 'Task 4']],
      ['2024-02-29', '2024-02-29', ['Task 3']],
      ['0001-01-01', '9999-12-31', ['Task 2', 'Task 3', 'Task 4', 'Task 5', 'Task 6', 'Task 7']],
      ['0001-01-01', '0001-01-01', ['Task 6']],
      ['9999-12-31', '9999-12-31', ['Task 7']],
    ]) {
      assert.deepEqual(titles(await follow(await apply({ from, through }))), expected);
      assert.equal(await html('/'), list);
    }
    const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-03-01' };
    const path = `/projects/1?${new URLSearchParams(state)}`;
    const trimmed = await apply({ ...state, from: ' 2024-02-29 \t', through: ' 2024-03-01 ' });
    assert.equal(trimmed.headers.get('location'), path);
    const filtered = await follow(trimmed);
    assert.deepEqual(titles(filtered), ['Task 3']);
    assert.match(filtered, /<option selected>Completed<\/option>/);
    assert.match(filtered, /<option selected>High<\/option>/);
    // Every editing form and the combobox form carry the applied boundaries.
    for (const form of filtered.match(/<form[^>]*>[\s\S]*?<\/form>/g)) {
      if (form.includes('action="/"')) continue;
      assert.match(form, /name="dueFrom" value="2024-02-29"/);
      assert.match(form, /name="dueThrough" value="2024-03-01"/);
    }
    for (const invalid of ['0000-01-01', '10000-01-01', '2024-2-29', '1900-02-29', '2025-02-29', '2024-04-31', 'text']) {
      for (const boundary of ['from', 'through']) {
        const response = await apply({ ...state, from: state.dueFrom, through: state.dueThrough, [boundary]: invalid });
        assert.equal(response.status, 400);
        const page = await response.text();
        assert.match(page, /role="alert">Due range must use valid YYYY-MM-DD dates/);
        assert.deepEqual(titles(page), ['Task 3']);
        assert.match(page, /id="due-from"[^>]*value="2024-02-29"/);
        assert.match(page, /<option selected>Completed<\/option>/);
        assert.match(page, /<option selected>High<\/option>/);
      }
    }
    const reversed = await apply({ ...state, from: '2024-03-02', through: '2024-02-29' });
    assert.equal(reversed.status, 400);
    const reversedPage = await reversed.text();
    assert.match(reversedPage, /role="alert">Due from must not be after Due through/);
    assert.deepEqual(titles(reversedPage), ['Task 3']);
    assert.equal(await html(path), filtered);
    assert.equal(await html('/'), list);
    assert.deepEqual(titles(await html(`/projects/1?${new URLSearchParams({ ...state, filter: 'Open' })}`)), ['Task 4']);
    assert.deepEqual(titles(await html(`/projects/1?${new URLSearchParams({ ...state, priorityFilter: 'Normal' })}`)), []);

    const edit = async (route, values, expected) => {
      const response = await post(`/projects/1/${route}`, { ...state, ...values });
      assert.equal(response.headers.get('location'), path);
      assert.deepEqual(titles(await follow(response)), expected);
    };
    await edit('tasks/3/rename', { title: ' Renamed task ' }, ['Renamed task']);
    await edit('rename', { name: ' Renamed project ' }, ['Renamed task']);
    await edit('default-priority', { priority: 'High' }, ['Renamed task']);
    await edit('tasks', { title: 'New undated task' }, ['Renamed task']);
    await edit('tasks/3/due-date', { dueDate: '2024-03-02' }, []);
    await edit('tasks/3/due-date', { dueDate: '2024-03-01' }, ['Renamed task']);
    await edit('tasks/3/priority', { priority: 'Low' }, []);
    await edit('tasks/3/priority', { priority: 'High' }, ['Renamed task']);
    await edit('tasks/3', {}, []);
    await edit('tasks/3', { completed: '1' }, ['Renamed task']);
    await edit('tasks/3/due-date', { dueDate: '  ' }, []);
    await edit('tasks/3/due-date', { dueDate: '2024-02-29' }, ['Renamed task']);
    const saved = await html(path);
    const savedList = await html('/');
    assert.match(savedList, /data-testid="project-summary">1\/8 completed/);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html(path), saved);
    assert.equal(await html('/'), savedList);
    await post('/projects/1/archive');
    const archived = await html(path);
    assert.deepEqual(titles(archived), ['Renamed task']);
    for (const id of ['due-from', 'due-through', 'task-filter', 'priority-filter']) {
      const control = new RegExp(`<(?:input|select) id="${id}"[^>]*>`).exec(archived)[0];
      assert.ok(!control.includes('disabled'));
    }
    assert.match(archived, /<button type="submit">Apply due range<\/button>/);
    assert.match(archived, /id="task-due-date-3"[^>]* disabled/);
    assert.match(archived, /id="task-priority-3"[^>]* disabled/);
    assert.match(archived, /aria-label="Complete Renamed task" checked disabled/);
    assert.deepEqual(titles(await follow(await apply({ from: '2024-03-01', through: '2024-03-02' }))), ['Task 4', 'Task 5']);
    await post('/projects/1/restore');
    assert.equal(await html(path), saved);
    const reopened = await html('/projects/1');
    assert.equal(titles(reopened).length, 8);
    assert.match(reopened, /id="due-from"[^>]*value=""/);
    assert.match(reopened, /id="due-through"[^>]*value=""/);
    assert.match(await html('/projects/2'), /Other project task/);
    assert.equal((await apply({ from: '2024-02-29', through: '' })).status, 303);
    assert.equal((await post('/projects/999/due-range', {})).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('due dates migrate, validate Gregorian days, preserve task data, and survive restart and archival', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-dates-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0, default_task_priority TEXT NOT NULL DEFAULT 'Normal'
    );
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal'
    );
    INSERT INTO projects (name) VALUES ('Existing project');
    INSERT INTO tasks (project_id, title, completed, priority) VALUES (1, 'Existing task', 1, 'High');
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.url}${path}`)).text();
    const dateInput = (page, id) => new RegExp(`<input id="task-due-date-${id}"[^>]*>`).exec(page)[0];
    const withoutDates = page => page.replace(/<form class="task-due-date"[^>]*due-date[\s\S]*?<\/form>/g, '');
    const selections = { filter: 'Completed', priorityFilter: 'High' };
    const filteredPath = '/projects/1?filter=Completed&priorityFilter=High';
    const save = value => post('/projects/1/tasks/1/due-date', { ...selections, dueDate: value });

    await post('/projects', { name: 'Other project' });
    await post('/projects/1/tasks', { title: 'New task' });
    await post('/projects/2/tasks', { title: 'Other task' });
    const initial = await html('/projects/1');
    assert.match(initial, /<label for="task-due-date-1">Task due date<\/label>/);
    assert.match(initial, /<button type="submit">Save due date<\/button>/);
    assert.match(dateInput(initial, 1), /type="text" value=""/);
    assert.match(dateInput(initial, 2), /type="text" value=""/);
    assert.match(dateInput(await html('/projects/2'), 3), /value=""/);
    const filtered = await html(filteredPath);
    const list = await html('/');

    for (const value of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '1900-02-28', '2026-04-30', '  2026-10-10 \t']) {
      const response = await save(value);
      assert.equal(response.status, 303, value);
      assert.equal(response.headers.get('location'), filteredPath);
      const page = await html(filteredPath);
      assert.ok(dateInput(page, 1).includes(`value="${value.trim()}"`));
      assert.equal(withoutDates(page), withoutDates(filtered));
      assert.equal(withoutDates(await html('/projects/1')), withoutDates(initial));
      assert.equal(await html('/'), list);
    }
    const saved = await html('/projects/1');
    for (const value of ['0000-01-01', '10000-01-01', '2026-2-01', '26-02-01', '2026-01-1',
      '1900-02-29', '2100-02-29', '2025-02-29', '0001-02-29', '2026-04-31',
      '2026-00-01', '2026-13-01', '2026-01-00', '2026-01-32', '2026-02-30',
      '2026-10-10T00:00:00Z', '2026/10/10', '<script>', '2026-10-10\nextra']) {
      const response = await save(value);
      assert.equal(response.status, 400, value);
      const page = await response.text();
      assert.match(page, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      assert.match(dateInput(page, 1), /value="2026-10-10"/);
      assert.match(page, /<option selected>Completed<\/option>/);
      assert.match(page, /<option selected>High<\/option>/);
      assert.equal(await html('/projects/1'), saved);
      assert.equal(await html('/'), list);
    }
    assert.equal((await post('/projects/2/tasks/1/due-date', { dueDate: '2027-01-01' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/due-date', { dueDate: '2027-01-01' })).status, 404);
    assert.match(dateInput(await html('/projects/1'), 2), /value=""/);
    assert.match(dateInput(await html('/projects/2'), 3), /value=""/);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), saved);
    assert.equal(await html('/'), list);

    const renamed = await post('/projects/1/tasks/1/rename', { ...selections, title: '  Renamed task  ' });
    assert.equal(renamed.headers.get('location'), filteredPath);
    assert.match(dateInput(await html(filteredPath), 1), /value="2026-10-10"/);
    for (const value of ['', ' \t\n ']) {
      assert.equal((await save(value)).status, 303);
      assert.match(dateInput(await html(filteredPath), 1), /value=""/);
    }
    await server.stop();
    server = await startServer(databasePath);
    assert.match(dateInput(await html('/projects/1'), 1), /value=""/);
    await save('2400-02-29');
    await post('/projects/1/archive');
    const archived = await html(filteredPath);
    assert.match(dateInput(archived, 1), /value="2400-02-29"[^>]* disabled/);
    assert.match(archived, /<button type="submit" disabled>Save due date<\/button>/);
    assert.match(archived, /<select id="task-filter" name="filter" onchange=/);
    assert.match(archived, /<select id="priority-filter" name="priorityFilter" onchange=/);
    assert.equal((await save('2027-01-01')).status, 403);
    assert.equal((await save('')).status, 403);
    assert.equal(await html(filteredPath), archived);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html(filteredPath), archived);
    await post('/projects/1/restore');
    const restored = await html(filteredPath);
    assert.match(dateInput(restored, 1), /value="2400-02-29"/);
    assert.doesNotMatch(restored, / disabled/);
    assert.equal(await html('/'), list);
    assert.equal((await save(' 0004-02-29 ')).status, 303);
    await server.stop();
    server = await startServer(databasePath);
    assert.match(dateInput(await html(filteredPath), 1), /value="0004-02-29"/);
    const database = new DatabaseSync(databasePath);
    try {
      assert.deepEqual(database.prepare('SELECT id, project_id, title, completed, priority, due_date FROM tasks ORDER BY id').all().map(row => ({ ...row })), [
        { id: 1, project_id: 1, title: 'Renamed task', completed: 1, priority: 'High', due_date: '0004-02-29' },
        { id: 2, project_id: 1, title: 'New task', completed: 0, priority: 'Normal', due_date: '' },
        { id: 3, project_id: 2, title: 'Other task', completed: 0, priority: 'Normal', due_date: '' },
      ]);
    } finally {
      database.close();
    }
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project defaults migrate, affect only future tasks, and persist through rename and archive', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-defaults-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'Normal'
    );
    INSERT INTO projects (name) VALUES ('Existing project');
    INSERT INTO tasks (project_id, title, completed, priority) VALUES (1, 'Existing task', 1, 'High');
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.url}${path}`)).text();
    const control = (page, id) => new RegExp(`<select id="${id}"[\\s\\S]*?<\\/select>`).exec(page)[0];
    const selected = (page, id) => /<option selected>([^<]+)/.exec(control(page, id))[1];
    const withoutDefault = page => page.replace(/<form class="task-priority"[^>]*default-priority[\s\S]*?<\/form>/, '');
    const selections = { filter: 'Completed', priorityFilter: 'High' };
    const path = '/projects/1?filter=Completed&priorityFilter=High';
    const initial = await html(path);
    assert.match(initial, /<label for="default-task-priority">Default task priority<\/label>/);
    assert.match(control(initial, 'default-task-priority'), /<option>Low<\/option><option selected>Normal<\/option><option>High<\/option>/);
    assert.match(control(initial, 'default-task-priority'), /onchange="this.form.requestSubmit\(\)"/);
    await post('/projects', { name: 'Other project' });
    assert.equal(selected(await html('/projects/2'), 'default-task-priority'), 'Normal');
    const originalList = await html('/');
    for (const priority of ['High', 'Normal', 'Low']) {
      const response = await post('/projects/1/default-priority', { ...selections, priority });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), path);
      const page = await html(path);
      assert.equal(selected(page, 'default-task-priority'), priority);
      assert.equal(selected(page, 'task-filter'), 'Completed');
      assert.equal(selected(page, 'priority-filter'), 'High');
      assert.equal(withoutDefault(page), withoutDefault(initial));
      assert.equal(await html('/'), originalList);
      assert.equal(selected(await html('/projects/2'), 'default-task-priority'), 'Normal');
    }
    for (const priority of ['', 'invalid']) {
      const response = await post('/projects/1/default-priority', { ...selections, priority });
      assert.equal(response.status, 400);
      const page = await response.text();
      assert.match(page, /role="alert">Task priority is invalid/);
      assert.equal(selected(page, 'default-task-priority'), 'Low');
      assert.equal(selected(page, 'task-filter'), 'Completed');
      assert.equal(selected(page, 'priority-filter'), 'High');
    }
    assert.equal((await post('/projects/999/default-priority', { priority: 'High' })).status, 404);
    await post('/projects/1/tasks', { title: 'Inherited low' });
    await post('/projects/1/default-priority', { priority: 'High' });
    await post('/projects/1/tasks', { title: 'Inherited high' });
    await post('/projects/2/tasks', { title: 'Other task' });
    await post('/projects/2/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks/2', { completed: '1' });
    await post('/projects/1/tasks/2/rename', { title: 'Renamed low' });
    await post('/projects/1/rename', { name: 'Renamed project' });
    const saved = await html('/projects/1');
    assert.equal(selected(saved, 'default-task-priority'), 'High');
    assert.equal(selected(saved, 'task-priority-1'), 'High');
    assert.equal(selected(saved, 'task-priority-2'), 'Low');
    assert.equal(selected(saved, 'task-priority-3'), 'High');
    assert.match(saved, /aria-label="Complete Renamed low" checked/);
    assert.equal(selected(await html('/projects/2'), 'task-priority-4'), 'Normal');
    assert.match(await html('/'), /data-testid="project-summary">2\/3 completed/);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), saved);
    await post('/projects/1/archive');
    const archived = await html(path);
    assert.match(control(archived, 'default-task-priority'), /disabled/);
    assert.equal(selected(archived, 'default-task-priority'), 'High');
    assert.doesNotMatch(control(archived, 'task-filter'), /disabled/);
    assert.doesNotMatch(control(archived, 'priority-filter'), /disabled/);
    assert.equal((await post('/projects/1/default-priority', { ...selections, priority: 'Normal' })).status, 403);
    assert.equal(await html(path), archived);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html(path), archived);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), saved);
    await post('/projects/1/tasks', { title: 'After restoration' });
    assert.equal(selected(await html('/projects/1'), 'task-priority-5'), 'High');
    const database = new DatabaseSync(databasePath);
    try {
      assert.deepEqual(database.prepare('SELECT id, project_id, title, completed, priority FROM tasks ORDER BY id').all().map(row => ({ ...row })), [
        { id: 1, project_id: 1, title: 'Existing task', completed: 1, priority: 'High' },
        { id: 2, project_id: 1, title: 'Renamed low', completed: 1, priority: 'Low' },
        { id: 3, project_id: 1, title: 'Inherited high', completed: 0, priority: 'High' },
        { id: 4, project_id: 2, title: 'Other task', completed: 0, priority: 'Normal' },
        { id: 5, project_id: 1, title: 'After restoration', completed: 0, priority: 'High' },
      ]);
    } finally {
      database.close();
    }
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('combined filters retain selections, re-evaluate edits, and work across archive and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-filters-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.url}${path}`)).text();
    const titles = page => [...page.matchAll(/<span>([^<]*)<\/span>/g)].map(match => match[1]);
    const control = (page, id) => new RegExp(`<select id="${id}"[\\s\\S]*?<\\/select>`).exec(page)[0];
    const selected = (page, id) => /<option selected>([^<]+)/.exec(control(page, id))[1];
    const assertSelections = (page, filter, priority) => {
      assert.equal(selected(page, 'task-filter'), filter);
      assert.equal(selected(page, 'priority-filter'), priority);
    };
    await post('/projects', { name: 'Filtered project' });
    await post('/projects', { name: 'Other project' });
    await post('/projects/2/tasks', { title: 'Other task' });
    const tasks = [];
    for (const priority of ['Low', 'Normal', 'High']) {
      for (const completed of [false, true]) {
        const title = `${priority} ${completed ? 'done' : 'open'}`;
        await post('/projects/1/tasks', { title });
        const id = tasks.length + 2;
        await post(`/projects/1/tasks/${id}/priority`, { priority });
        if (completed) await post(`/projects/1/tasks/${id}`, { completed: '1' });
        tasks.push({ title, priority, completed });
      }
    }
    const initial = await html('/projects/1');
    assertSelections(initial, 'All', 'All');
    assert.deepEqual([...control(initial, 'priority-filter').matchAll(/<option(?: selected)?>([^<]+)/g)].map(match => match[1]), ['All', 'Low', 'Normal', 'High']);
    const filterForm = /<form class="task-filter"[\s\S]*?<\/form>/.exec(initial)[0];
    assert.match(filterForm, /id="task-filter"/);
    assert.match(filterForm, /id="priority-filter"/);
    assert.equal((filterForm.match(/onchange="this.form.requestSubmit\(\)"/g) || []).length, 2);

    const originalList = await html('/');
    for (const filter of ['All', 'Open', 'Completed']) {
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        const page = await html(`/projects/1?filter=${filter}&priorityFilter=${priority}`);
        assertSelections(page, filter, priority);
        assert.deepEqual(titles(page), tasks.filter(task =>
          (filter === 'All' || task.completed === (filter === 'Completed')) &&
          (priority === 'All' || task.priority === priority)).map(task => task.title));
      }
    }
    assert.equal(await html('/'), originalList);
    const selections = { filter: 'Open', priorityFilter: 'High' };
    const path = '/projects/1?filter=Open&priorityFilter=High';
    let page = await html(path);
    for (const form of page.match(/<form[^>]*method="post"[\s\S]*?<\/form>/g)) {
      assert.match(form, /name="filter" value="Open"/);
      assert.match(form, /name="priorityFilter" value="High"/);
    }
    const renamed = await post('/projects/1/tasks/6/rename', { ...selections, title: '  Renamed high  ' });
    assert.equal(renamed.headers.get('location'), path);
    page = await html(path);
    assertSelections(page, 'Open', 'High');
    assert.deepEqual(titles(page), ['Renamed high']);
    assert.match(page, /aria-label="Complete Renamed high"/);
    assert.equal(selected(page, 'task-priority-6'), 'High');
    for (const [route, values, alert] of [
      ['/tasks/6/rename', { title: ' ' }, 'Task title is required'],
      ['/tasks', { title: ' ' }, 'Task title is required'],
      ['/rename', { name: ' ' }, 'Project name is required'],
      ['/tasks/6/priority', { priority: 'invalid' }, 'Task priority is invalid'],
    ]) {
      const invalid = await post(`/projects/1${route}`, { ...selections, ...values });
      assert.equal(invalid.status, 400);
      const errorPage = await invalid.text();
      assertSelections(errorPage, 'Open', 'High');
      assert.ok(errorPage.includes(`role="alert">${alert}`));
      assert.deepEqual(titles(errorPage), ['Renamed high']);
    }
    const changedPriority = await post('/projects/1/tasks/6/priority', { ...selections, priority: 'Low' });
    assert.equal(changedPriority.headers.get('location'), path);
    assertSelections(await html(path), 'Open', 'High');
    assert.deepEqual(titles(await html(path)), []);
    assert.equal(await html('/'), originalList);
    const lowPath = '/projects/1?filter=Open&priorityFilter=Low';
    assert.deepEqual(titles(await html(lowPath)), ['Low open', 'Renamed high']);
    const completed = await post('/projects/1/tasks/6', { filter: 'Open', priorityFilter: 'Low', completed: '1' });
    assert.equal(completed.headers.get('location'), lowPath);
    assert.deepEqual(titles(await html(lowPath)), ['Low open']);
    assertSelections(await html(lowPath), 'Open', 'Low');
    const donePath = '/projects/1?filter=Completed&priorityFilter=Low';
    assert.deepEqual(titles(await html(donePath)), ['Low done', 'Renamed high']);
    assert.match(await html('/'), /data-testid="project-summary">4\/6 completed/);
    const saved = await html(donePath);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html(donePath), saved);
    assertSelections(await html('/projects/1'), 'All', 'All');
    await post('/projects/1/archive');
    const archived = await html(donePath);
    assertSelections(archived, 'Completed', 'Low');
    assert.doesNotMatch(control(archived, 'task-filter'), /disabled/);
    assert.doesNotMatch(control(archived, 'priority-filter'), /disabled/);
    assert.deepEqual(titles(archived), ['Low done', 'Renamed high']);
    for (const editingControl of archived.match(/<(?:input type="checkbox"|input id="new-task-title-[^"]+"|select id="task-priority-[^"]+")[^>]*>/g)) {
      assert.match(editingControl, /disabled/);
    }
    assert.equal((await post('/projects/1/tasks/6/priority', { ...selections, priority: 'High' })).status, 403);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html(donePath), archived);
    await post('/projects/1/restore');
    assert.equal(await html(donePath), saved);
    assert.deepEqual(titles(await html('/projects/2')), ['Other task']);
    assert.match(await html('/'), /data-testid="project-summary">4\/6 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('priorities migrate, remain independent, and survive renaming, archive and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
    );
    INSERT INTO projects (name) VALUES ('Existing project');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing task', 1);
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.url}${path}`)).text();
    const priorityControls = page => page.match(/<select id="task-priority-\d+"[\s\S]*?<\/select>/g) || [];
    const priorities = page => priorityControls(page).map(control => /<option selected>([^<]+)<\/option>/.exec(control)[1]);
    const withoutPriorities = page => page.replace(/<form class="task-priority"[\s\S]*?<\/form>/g, '');
    await post('/projects/1/tasks', { title: 'New task' });
    await post('/projects', { name: 'Other project' });
    await post('/projects/2/tasks', { title: 'Other task' });
    const original = await html('/projects/1');
    const other = await html('/projects/2');
    const list = await html('/');
    assert.deepEqual(priorities(original), ['Normal', 'Normal']);
    assert.deepEqual(priorities(other), ['Normal']);
    for (const id of [1, 2]) {
      assert.match(original, new RegExp(`<label for="task-priority-${id}">Task priority</label>`));
    }
    for (const control of priorityControls(original)) {
      assert.match(control, /name="priority" onchange="this.form.requestSubmit\(\)"/);
      assert.match(control, /<option>Low<\/option><option selected>Normal<\/option><option>High<\/option>/);
      assert.doesNotMatch(control, / disabled/);
    }
    for (const priority of ['Low', 'Normal', 'High']) {
      const updated = await post('/projects/1/tasks/1/priority', { priority, filter: 'Completed' });
      assert.equal(updated.status, 303);
      assert.equal(updated.headers.get('location'), '/projects/1?filter=Completed');
      const saved = await html('/projects/1');
      assert.deepEqual(priorities(saved), [priority, 'Normal']);
      assert.equal(withoutPriorities(saved), withoutPriorities(original));
      assert.equal(await html('/projects/2'), other);
      assert.equal(await html('/'), list);
      assert.deepEqual(priorities(await html('/projects/1?filter=Completed')), [priority]);
      assert.deepEqual(priorities(await html('/projects/1?filter=Open')), ['Normal']);
    }
    await post('/projects/1/tasks/2/priority', { priority: 'Low' });
    const saved = await html('/projects/1');
    for (const priority of ['', 'Urgent', 'high', ' High ']) {
      assert.equal((await post('/projects/1/tasks/1/priority', { priority })).status, 400);
      assert.equal(await html('/projects/1'), saved);
    }
    for (const path of ['/projects/2/tasks/1/priority', '/projects/1/tasks/999/priority', '/projects/999/tasks/1/priority']) {
      assert.equal((await post(path, { priority: 'Low' })).status, 404);
    }
    assert.equal(await html('/projects/2'), other);
    await post('/projects/1/tasks/1/rename', { title: ' Renamed task ' });
    await post('/projects/1/rename', { name: 'Renamed project' });
    const renamed = await html('/projects/1');
    assert.deepEqual(priorities(renamed), ['High', 'Low']);
    assert.match(renamed, /aria-label="Complete Renamed task" checked/);
    assert.match(await html('/'), /data-testid="project-summary">1\/2 completed/);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), renamed);
    assert.equal(await html('/projects/2'), other);
    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    assert.deepEqual(priorities(archived), ['High', 'Low']);
    assert.ok(priorityControls(archived).every(control => control.includes(' disabled')));
    assert.deepEqual(priorities(await html('/projects/1?filter=Completed')), ['High']);
    assert.deepEqual(priorities(await html('/projects/1?filter=Open')), ['Low']);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Normal' })).status, 403);
    assert.equal(await html('/projects/1'), archived);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), renamed);
    assert.equal((await post('/projects/1/tasks/2/priority', { priority: 'High', filter: 'Open' })).status, 303);
    await post('/projects/1/tasks/2', { completed: '1' });
    const restored = await html('/projects/1');
    assert.deepEqual(priorities(restored), ['High', 'High']);
    assert.match(await html('/'), /data-testid="project-summary">2\/2 completed/);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), restored);
    const database = new DatabaseSync(databasePath);
    try {
      assert.deepEqual(database.prepare('SELECT id, project_id, title, completed, priority FROM tasks ORDER BY id').all().map(row => ({ ...row })), [
        { id: 1, project_id: 1, title: 'Renamed task', completed: 1, priority: 'High' },
        { id: 2, project_id: 1, title: 'New task', completed: 1, priority: 'High' },
        { id: 3, project_id: 2, title: 'Other task', completed: 0, priority: 'Normal' },
      ]);
    } finally {
      database.close();
    }
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task renaming preserves ownership, order, completion and filters across archive and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.url}${path}`)).text();
    const rows = page => page.match(/<div class="task-row"[\s\S]*?<\/div>/g) || [];
    await post('/projects', { name: 'First project' });
    await post('/projects', { name: 'Second project' });
    await post('/projects/1/tasks', { title: 'Original task' });
    await post('/projects/1/tasks', { title: 'Open task' });
    await post('/projects/2/tasks', { title: 'Other task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await html('/projects/1');
    for (const [index, row] of rows(original).entries()) {
      assert.match(row, new RegExp(`<label for="new-task-title-${index + 1}">New task title</label>`));
      assert.match(row, /name="title" type="text"/);
      assert.match(row, />Rename task<\/button>/);
      assert.doesNotMatch(row, / disabled/);
    }
    for (const title of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/tasks/1/rename', { title, filter: 'Completed' });
      assert.equal(invalid.status, 400);
      const page = await invalid.text();
      assert.match(page, /role="alert">Task title is required/);
      assert.match(page, /<option selected>Completed<\/option>/);
      assert.deepEqual(rows(page), [rows(original)[0].replaceAll('name="filter" value="All"', 'name="filter" value="Completed"')]);
      assert.equal(await html('/projects/1'), original);
    }
    const renamed = await post('/projects/1/tasks/1/rename', {
      title: '  Updated <task> & "review"  ', filter: 'Completed',
    });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const saved = await html('/projects/1');
    const savedRows = rows(saved);
    assert.equal(savedRows.length, 2);
    assert.match(savedRows[0], /<span>Updated &lt;task&gt; &amp; &quot;review&quot;<\/span>/);
    assert.match(savedRows[0], /aria-label="Complete Updated &lt;task&gt; &amp; &quot;review&quot;" checked/);
    assert.deepEqual(savedRows[1], rows(original)[1]);
    assert.deepEqual(rows(await html('/projects/1?filter=Completed')), [savedRows[0].replaceAll('name="filter" value="All"', 'name="filter" value="Completed"')]);
    assert.deepEqual(rows(await html('/projects/1?filter=Open')), [savedRows[1].replaceAll('name="filter" value="All"', 'name="filter" value="Open"')]);
    assert.match(await html('/'), /data-testid="project-summary">1\/2 completed/);
    const other = await html('/projects/2');
    assert.doesNotMatch(other, /Updated|Original task|Open task/);
    assert.equal((await post('/projects/2/tasks/1/rename', { title: 'Wrong project' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/rename', { title: 'Missing task' })).status, 404);
    assert.equal((await post('/projects/999/tasks/1/rename', { title: 'Missing project' })).status, 404);
    assert.equal(await html('/projects/1'), saved);
    assert.equal(await html('/projects/2'), other);

    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), saved);
    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    for (const row of rows(archived)) {
      assert.match(row, /<input id="new-task-title-\d+"[^>]* disabled>/);
      assert.match(row, /<button type="submit" disabled>Rename task<\/button>/);
    }
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Blocked' })).status, 403);
    assert.equal(await html('/projects/1'), archived);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), saved);
    const restoredRename = await post('/projects/1/tasks/2/rename', {
      title: '  Restored task  ', filter: 'Open',
    });
    assert.equal(restoredRename.status, 303);
    assert.equal(restoredRename.headers.get('location'), '/projects/1?filter=Open');
    const restored = await html('/projects/1');
    assert.match(rows(restored)[1], /aria-label="Complete Restored task"/);
    assert.doesNotMatch(rows(restored)[1], / checked| disabled/);
    assert.match(await html('/'), /data-testid="project-summary">1\/2 completed/);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), restored);
    const database = new DatabaseSync(databasePath);
    try {
      assert.deepEqual(database.prepare('SELECT id, project_id, title, completed FROM tasks ORDER BY id').all().map(row => ({ ...row })), [
        { id: 1, project_id: 1, title: 'Updated <task> & "review"', completed: 1 },
        { id: 2, project_id: 1, title: 'Restored task', completed: 0 },
        { id: 3, project_id: 2, title: 'Other task', completed: 0 },
      ]);
    } finally {
      database.close();
    }
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('renaming preserves project identity and tasks, validates names, and respects archive state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.url}${path}`)).text();
    const taskRows = page => page.match(/<div class="task-row"[\s\S]*?<\/div>/g) || [];
    const summaries = page => [...page.matchAll(/data-testid="project-summary">([^<]+)/g)].map(match => match[1]);

    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Completed task' });
    await post('/projects/1/tasks', { title: 'Open task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await html('/projects/1');
    assert.match(original, /<label for="new-project-name">New project name<\/label>/);
    assert.match(original, /<input id="new-project-name"[^>]*type="text"[^>]*>/);
    assert.match(original, /<button type="submit">Rename project<\/button>/);
    assert.doesNotMatch(original, / disabled/);

    for (const name of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/rename', { name, filter: 'Open' });
      assert.equal(invalid.status, 400);
      const page = await invalid.text();
      assert.match(page, /role="alert">Project name is required/);
      assert.match(page, /<h1>Original<\/h1>/);
      assert.match(page, /<option selected>Open<\/option>/);
      assert.equal(taskRows(page).length, 1);
      assert.equal(await html('/projects/1'), original);
    }
    const renamed = await post('/projects/1/rename', { name: '  Renamed <plan> & "review"  ', filter: 'Completed' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const saved = await html('/projects/1');
    assert.match(saved, /<h1>Renamed &lt;plan&gt; &amp; &quot;review&quot;<\/h1>/);
    assert.deepEqual(taskRows(saved), taskRows(original));
    const list = await html('/');
    assert.match(list, /class="project-name">Renamed &lt;plan&gt; &amp; &quot;review&quot;<\/span>/);
    assert.ok(list.indexOf('Renamed &lt;plan&gt;') < list.indexOf('Second'));
    assert.deepEqual([...list.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]), ['/projects/1', '/projects/2']);
    assert.deepEqual(summaries(list), ['1/2 completed', '0/0 completed']);
    assert.match(await html('/projects/2'), /<h1>Second<\/h1>/);
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);

    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), saved);
    assert.equal(await html('/'), list);
    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    assert.match(archived, /<input id="new-project-name"[^>]* disabled>/);
    assert.match(archived, /<button type="submit" disabled>Rename project<\/button>/);
    assert.equal((await post('/projects/1/rename', { name: 'Blocked rename' })).status, 403);
    assert.equal(await html('/projects/1'), archived);
    assert.deepEqual(summaries(await html('/?filter=Archived')), ['1/2 completed']);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), saved);
    const restoredRename = await post('/projects/1/rename', { name: '  After restoration  ' });
    assert.equal(restoredRename.status, 303);
    assert.equal(restoredRename.headers.get('location'), '/projects/1');
    const restored = await html('/projects/1');
    assert.match(restored, /<h1>After restoration<\/h1>/);
    assert.deepEqual(taskRows(restored), taskRows(original));
    assert.deepEqual(summaries(await html('/')), ['1/2 completed', '0/0 completed']);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), restored);
    const database = new DatabaseSync(databasePath);
    try {
      assert.deepEqual({ ...database.prepare('SELECT id, name, archived FROM projects WHERE id = 1').get() }, {
        id: 1, name: 'After restoration', archived: 0,
      });
    } finally {
      database.close();
    }
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
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${output}`));
    }, 5000);
    child.stderr.on('data', data => { output += data; });
    child.stdout.on('data', data => {
      output += data;
      const match = /listening on port (\d+)/.exec(output);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Server exited (${code}): ${output}`));
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

test('projects validate, trim, preserve order, navigate, and survive a restart', async () => {
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
    assert.match(initial, /<button type="submit">Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);

    async function create(name) {
      return fetch(`${server.url}/projects`, {
        method: 'POST',
        body: new URLSearchParams({ name }),
        redirect: 'manual',
      });
    }
    for (const name of ['', ' \t\n ']) {
      const result = await create(name);
      assert.equal(result.status, 400);
      const html = await result.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }

    const first = await create('  Launch <plan> & review  ');
    assert.equal(first.status, 303);
    assert.equal(first.headers.get('location'), '/');
    assert.equal((await create('Second project')).status, 303);
    const list = await (await fetch(server.url)).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(list, /class="project-name">Launch &lt;plan&gt; &amp; review<\/span>/);
    assert.ok(list.indexOf('Launch &lt;plan&gt;') < list.indexOf('Second project'));
    const paths = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    assert.notEqual(paths[0], paths[1]);
    const project = await (await fetch(`${server.url}${paths[0]}`)).text();
    assert.match(project, /<h1>Launch &lt;plan&gt; &amp; review<\/h1>/);
    assert.match(project, /action="\/">\s*<button type="submit">Projects<\/button>/);

    const invalid = await create('   ');
    assert.equal((await invalid.text()).match(/data-testid="project-row"/g).length, 2);
    assert.equal(await (await fetch(server.url)).text(), list);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await (await fetch(server.url)).text(), list);
    assert.equal(await (await fetch(`${server.url}${paths[0]}`)).text(), project);
    assert.equal((await fetch(`${server.url}/projects/99999`)).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, toggle, stay within their project, and survive a restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.url}${path}`)).text();
    const rows = page => [...page.matchAll(/<div class="task-row" data-testid="task-row">([\s\S]*?)<\/div>/g)].map(match => match[1]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const project = '/projects/1';
    const initial = await html(project);
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, /<button type="submit">Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    assert.equal(rows(initial).length, 0);

    for (const title of ['', ' \t\n ']) {
      const response = await post(`${project}/tasks`, { title });
      assert.equal(response.status, 400);
      const page = await response.text();
      assert.match(page, /role="alert">Task title is required/);
      assert.equal(rows(page).length, 0);
    }
    const created = await post(`${project}/tasks`, { title: '  Plan <launch> & "review"  ' });
    assert.equal(created.status, 303);
    assert.equal(created.headers.get('location'), project);
    await post(`${project}/tasks`, { title: 'Follow up' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    const all = await html(project);
    const taskRows = rows(all);
    assert.equal(taskRows.length, 2);
    assert.match(taskRows[0], /<span>Plan &lt;launch&gt; &amp; &quot;review&quot;<\/span>/);
    assert.match(taskRows[0], /aria-label="Complete Plan &lt;launch&gt; &amp; &quot;review&quot;"/);
    assert.match(taskRows[1], /aria-label="Complete Follow up"/);
    assert.ok(taskRows.every(row => !row.includes(' checked')));
    assert.match(taskRows[0], /onchange="this.form.requestSubmit\(\)"/);
    assert.doesNotMatch(all, /Other project task/);
    assert.equal(rows(await html('/projects/2')).length, 1);
    assert.equal(rows(await html(`${project}?filter=Completed`)).length, 0);
    assert.equal(rows(await html(`${project}?filter=Open`)).length, 2);

    const completed = await post(`${project}/tasks/1`, { completed: '1', filter: 'Open' });
    assert.equal(completed.status, 303);
    assert.equal(completed.headers.get('location'), `${project}?filter=Open`);
    const saved = await html(project);
    assert.match(rows(saved)[0], / checked/);
    assert.doesNotMatch(rows(saved)[1], / checked/);
    const open = await html(`${project}?filter=Open`);
    assert.equal(rows(open).length, 1);
    assert.match(rows(open)[0], /Follow up/);
    assert.match(open, /<option selected>Open<\/option>/);
    const done = await html(`${project}?filter=Completed`);
    assert.equal(rows(done).length, 1);
    assert.match(rows(done)[0], /Plan &lt;launch&gt;/);

    assert.equal((await post('/projects/2/tasks/1', {})).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Missing' })).status, 404);
    assert.equal((await post(`${project}/tasks/999`, { completed: '1' })).status, 404);
    const invalid = await post(`${project}/tasks`, { title: '   ' });
    assert.equal(invalid.status, 400);
    assert.equal(rows(await invalid.text()).length, 2);
    assert.equal(await html(project), saved);

    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html(project), saved);
    assert.equal(await html(`${project}?filter=Open`), open);
    assert.equal(await html(`${project}?filter=Completed`), done);
    assert.equal(rows(await html('/projects/2')).length, 1);
    const reopened = await post(`${project}/tasks/1`, {});
    assert.equal(reopened.status, 303);
    assert.equal(rows(await html(`${project}?filter=Completed`)).length, 0);
    assert.equal(rows(await html(`${project}?filter=Open`)).length, 2);
    await server.stop();
    server = await startServer(databasePath);
    assert.ok(rows(await html(project)).every(row => !row.includes(' checked')));
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('legacy projects migrate, archive and restore with saved tasks and accurate summaries', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const databasePath = join(directory, 'workboard.sqlite');
  // Start from the previous schema to verify existing projects remain usable.
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
    );
    INSERT INTO projects (name) VALUES ('Existing project');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Saved task', 1);
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.url}${path}`)).text();
    const rowCount = (page, type) => (page.match(new RegExp(`data-testid="${type}-row"`, 'g')) || []).length;
    const summaries = page => [...page.matchAll(/data-testid="project-summary">([^<]+)/g)].map(match => match[1]);

    let active = await html('/');
    assert.match(active, /<label for="project-filter">Project filter<\/label>/);
    assert.match(active, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.equal(rowCount(active, 'project'), 1);
    assert.deepEqual(summaries(active), ['1/1 completed']);
    assert.match(active, />Archive project<\/button>/);
    assert.doesNotMatch(active, />Restore project<\/button>/);
    await post('/projects', { name: 'New project' });
    await post('/projects/1/tasks', { title: 'Open task' });
    active = await html('/');
    assert.deepEqual(summaries(active), ['1/2 completed', '0/0 completed']);
    assert.ok(active.indexOf('Existing project') < active.indexOf('New project'));
    assert.equal(rowCount(await html('/projects/1?filter=Completed'), 'task'), 1);
    assert.deepEqual(summaries(await html('/')), ['1/2 completed', '0/0 completed']);

    const archivedResponse = await post('/projects/1/archive');
    assert.equal(archivedResponse.status, 303);
    active = await html('/');
    assert.equal(rowCount(active, 'project'), 1);
    assert.doesNotMatch(active, /Existing project/);
    const archivedList = await html('/?filter=Archived');
    assert.match(archivedList, /<option selected>Archived<\/option>/);
    assert.equal(rowCount(archivedList, 'project'), 1);
    assert.match(archivedList, /Existing project/);
    assert.match(archivedList, />Open project<\/button>/);
    assert.match(archivedList, />Restore project<\/button>/);
    assert.doesNotMatch(archivedList, />Archive project<\/button>/);
    assert.deepEqual(summaries(archivedList), ['1/2 completed']);
    const archivedPage = await html('/projects/1');
    assert.match(archivedPage, /<p>Archived project<\/p>/);
    assert.match(archivedPage, /<button type="submit" disabled>Create task<\/button>/);
    assert.equal(rowCount(archivedPage, 'task'), 2);
    const checkboxes = archivedPage.match(/<input type="checkbox"[^>]+>/g);
    assert.equal(checkboxes.length, 2);
    assert.ok(checkboxes.every(checkbox => checkbox.includes(' disabled')));
    assert.match(checkboxes[0], / checked/);
    assert.doesNotMatch(checkboxes[1], / checked/);
    assert.equal(rowCount(await html('/projects/1?filter=Open'), 'task'), 1);
    assert.equal(rowCount(await html('/projects/1?filter=Completed'), 'task'), 1);
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked task' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1')).status, 403);
    assert.equal((await post('/projects/1/tasks/2', { completed: '1' })).status, 403);
    assert.equal(await html('/projects/1'), archivedPage);

    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/'), active);
    assert.equal(await html('/?filter=Archived'), archivedList);
    assert.equal(await html('/projects/1'), archivedPage);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.equal(rowCount(await html('/?filter=Archived'), 'project'), 0);
    const restored = await html('/projects/1');
    assert.doesNotMatch(restored, /Archived project| disabled/);
    assert.match(restored, /aria-label="Complete Saved task" checked/);
    assert.equal(rowCount(restored, 'task'), 2);
    assert.deepEqual(summaries(await html('/')), ['1/2 completed', '0/0 completed']);
    await post('/projects/1/tasks/2', { completed: '1' });
    await post('/projects/1/tasks', { title: 'After restoration' });
    assert.deepEqual(summaries(await html('/')), ['2/3 completed', '0/0 completed']);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(summaries(await html('/')), ['2/3 completed', '0/0 completed']);
    assert.doesNotMatch(await html('/projects/1'), /Archived project| disabled/);
    assert.equal((await post('/projects/999/archive')).status, 404);
    assert.equal((await post('/projects/999/restore')).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
