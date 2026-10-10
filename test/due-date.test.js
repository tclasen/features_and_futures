import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeDueDate } from '../src/due-date.js';
import { openWorkboardStore } from '../src/store.js';
import { launch } from './server-helper.js';

function rows(html) {
  return [...html.matchAll(/<article class="task-row" data-testid="task-row">([\s\S]*?)<\/article>/g)]
    .map((match) => match[1]);
}

test('due dates validate Gregorian boundaries without date rollover', () => {
  for (const date of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '2400-02-29', '1900-02-28']) {
    assert.equal(normalizeDueDate(` \t${date}\n `), date);
  }
  for (const date of [
    '0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2023-02-29',
    '2024-02-30', '2024-04-31', '2024-06-31', '2024-09-31', '2024-11-31',
    '2024-00-01', '2024-13-01', '2024-01-00', '2024-01-32', '2024-1-01',
    '2024-01-1', '24-01-01', '2024/01/01', '2024-01-01T00:00:00Z', 'tomorrow',
  ]) assert.equal(normalizeDueDate(date), undefined, date);
  for (const date of ['', ' \t\n ']) assert.equal(normalizeDueDate(date), null);
});

test('migration adds empty dates without changing existing task data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-date-migration-'));
  let store;
  try {
    const path = join(directory, 'workboard.sqlite');
    const database = new DatabaseSync(path);
    try {
      database.exec(`
        CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
          archived INTEGER NOT NULL DEFAULT 0, default_task_priority TEXT NOT NULL DEFAULT 'Normal');
        CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
          title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
        INSERT INTO projects VALUES (7, 'Existing', 0, 'Low'), (9, 'Archived', 1, 'High');
        INSERT INTO tasks VALUES (12, 7, 'Done', 1, 'High'), (15, 9, 'Pending', 0, 'Low');
      `);
    } finally {
      database.close();
    }
    store = openWorkboardStore(path);
    assert.deepEqual({ ...store.tasks.list(7)[0] }, { id: 12, title: 'Done', completed: 1, priority: 'High', due_date: null });
    assert.deepEqual({ ...store.tasks.list(9)[0] }, { id: 15, title: 'Pending', completed: 0, priority: 'Low', due_date: null });
    assert.equal(store.find(7).default_task_priority, 'Low');
    assert.equal(store.tasks.create(7, 'New').due_date, null);
    assert.equal(store.tasks.setDueDate(7, 15, '2024-01-01').status, 404);
    assert.equal(store.tasks.setDueDate(9, 15, '2024-01-01').status, 409);
    store.tasks.setDueDate(7, 12, '0001-01-01');
    store.close();
    store = openWorkboardStore(path);
    assert.equal(store.tasks.list(7)[0].due_date, '0001-01-01');
    assert.equal(store.tasks.list(9)[0].due_date, null);
  } finally {
    store?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('date forms preserve filters, ownership and task data through validation, rename, archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-dates-'));
  let running;
  try {
    const path = join(directory, 'workboard.sqlite');
    running = await launch(path);
    const get = async (url) => (await fetch(`${running.baseUrl}${url}`)).text();
    const post = (url, values = {}) => fetch(`${running.baseUrl}${url}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/2/tasks', { title: 'Other' });
    await post('/projects/1/tasks/1/completion', { completed: 'on' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    const original = await get('/projects/1');
    const other = await get('/projects/2');
    const summary = await get('/');
    for (const row of rows(original)) {
      assert.match(row, /<label for="task-due-date-\d+">Task due date<\/label>/);
      assert.match(row, /name="dueDate" type="text" value=""/);
      assert.match(row, />Save due date<\/button>/);
    }
    const selection = { filter: 'Completed', priorityFilter: 'High' };
    const filteredPath = '/projects/1?filter=Completed&priorityFilter=High';
    const save = (dueDate) => post('/projects/1/tasks/1/due-date', { dueDate, ...selection });
    for (const date of ['0001-01-01', '2000-02-29', '9999-12-31']) {
      const response = await save(` ${date} `);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), filteredPath);
      const html = await get(filteredPath);
      assert.equal(rows(html).length, 1);
      assert.match(html, /<select id="task-filter"[^>]*>[\s\S]*?<option selected>Completed<\/option>/);
      assert.match(html, /<select id="priority-filter"[^>]*>[\s\S]*?<option selected>High<\/option>/);
      assert.match(rows(html)[0], new RegExp(`name="dueDate" type="text" value="${date}"`));
      assert.match(rows(html)[0], /aria-label="Complete Done" checked/);
      assert.equal(rows(await get('/projects/1'))[1], rows(original)[1]);
      assert.equal(await get('/projects/2'), other);
      assert.equal(await get('/'), summary);
    }
    const saved = await get(filteredPath);
    for (const value of ['1900-02-29', '2024-04-31', '0000-01-01', '<invalid>']) {
      const response = await save(value);
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      assert.match(html, /name="dueDate" type="text" value="9999-12-31"/);
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.match(html, /<option selected>High<\/option>/);
      assert.equal(await get(filteredPath), saved);
    }
    for (const url of ['/projects/2/tasks/1/due-date', '/projects/1/tasks/3/due-date',
      '/projects/1/tasks/999/due-date', '/projects/999/tasks/1/due-date',
      '/projects/1/tasks/9007199254740993/due-date']) {
      assert.equal((await post(url, { dueDate: '2024-01-01' })).status, 404);
    }
    await post('/projects/1/tasks/2/due-date', { dueDate: '2024-02-29' });
    await post('/projects/1/tasks/1/rename', { title: 'Renamed', ...selection });
    const renamed = await get(filteredPath);
    assert.match(renamed, /aria-label="Complete Renamed" checked/);
    assert.match(renamed, /name="dueDate" type="text" value="9999-12-31"/);
    const expected = await get('/projects/1');
    await running.stop();
    running = await launch(path);
    assert.equal(await get('/projects/1'), expected);
    assert.equal(await get(filteredPath), renamed);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    for (const row of rows(archived)) {
      assert.match(row, /name="dueDate" type="text" value="[^"]*" disabled/);
      assert.match(row, /<button type="submit" disabled>Save due date<\/button>/);
    }
    assert.equal(rows(await get(filteredPath)).length, 1);
    assert.equal((await save('2024-01-01')).status, 409);
    assert.equal(await get('/projects/1'), archived);
    await running.stop();
    running = await launch(path);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), expected);
    assert.equal(await get('/'), summary);
    for (const value of ['', ' \t\n ']) {
      assert.equal((await save(value)).status, 303);
      assert.match(await get(filteredPath), /name="dueDate" type="text" value=""/);
      assert.match(rows(await get('/projects/1'))[1], /name="dueDate" type="text" value="2024-02-29"/);
      if (!value) await save('2000-02-29');
    }
    const cleared = await get('/projects/1');
    await running.stop();
    running = await launch(path);
    assert.equal(await get('/projects/1'), cleared);
    assert.equal(await get('/'), summary);
  } finally {
    await running?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
