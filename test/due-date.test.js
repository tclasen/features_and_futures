import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApplication, isValidDueDate } from '../server.js';

test('due dates require real Gregorian days and exact four-digit formatting', () => {
  for (const value of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '1900-02-28', '2025-04-30']) {
    assert.equal(isValidDueDate(value), true, value);
  }
  for (const value of ['', '0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2025-02-29',
    '2024-02-30', '2025-04-31', '2025-00-01', '2025-13-01', '2025-01-00', '2025-01-32',
    '2025-1-01', '25-01-01', '2025-01-1', '2025-01-01T00:00:00Z', ' 2025-01-01', '2025-01-01\n']) {
    assert.equal(isValidDueDate(value), false, value);
  }
});

test('due dates migrate, persist independently, preserve filters and task data, and respect archival', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-dates-'));
  const dbPath = join(directory, 'database.sqlite');
  let server;
  let url;
  const start = async () => {
    server = createApplication(dbPath);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    url = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  const post = (path, values = {}) => fetch(`${url}${path}`, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const html = async path => (await fetch(`${url}${path}`)).text();
  const dateInput = (text, id) => text.match(new RegExp(`<input id="task-due-date-${id}"[^>]*>`))[0];
  const filters = { filter: 'Completed', priorityFilter: 'High' };
  const filteredPath = '/projects/1?filter=Completed&priorityFilter=High';
  const saveDate = (id, dueDate, project = 1) => post(`/projects/${project}/tasks/${id}/due-date`, { ...filters, dueDate });
  try {
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (name) VALUES ('Existing');
      INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Old task', 1);`);
    legacy.close();
    await start();
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks', { title: 'Second' });
    await post('/projects', { name: 'Other' });
    await post('/projects/2/tasks', { title: 'Other task' });
    const before = await html(filteredPath);
    assert.match(before, /<label for="task-due-date-1">Task due date<\/label>/);
    assert.match(before, />Save due date<\/button>/);
    assert.match(dateInput(before, 1), /value=""/);
    assert.match(dateInput(await html('/projects/1'), 2), /value=""/);
    const summary = await html('/');
    const savedResponse = await saveDate(1, '  2000-02-29  ');
    assert.equal(savedResponse.status, 303);
    assert.equal(savedResponse.headers.get('location'), filteredPath);
    const saved = await html(filteredPath);
    assert.equal(saved, before.replace('name="dueDate" value=""', 'name="dueDate" value="2000-02-29"'));
    assert.equal(await html('/'), summary);
    assert.match(dateInput(await html('/projects/1'), 2), /value=""/);
    assert.match(dateInput(await html('/projects/2'), 3), /value=""/);
    for (const date of ['0000-01-01', '1900-02-29', '2025-04-31', '2025-1-1', 'tomorrow', '<script>']) {
      const rejected = await saveDate(1, date);
      assert.equal(rejected.status, 400);
      const text = await rejected.text();
      assert.match(text, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      assert.match(dateInput(text, 1), /value="2000-02-29"/);
      assert.match(text, /<option selected>Completed<\/option>/);
      assert.match(text, /<option selected>High<\/option>/);
      assert.equal(await html(filteredPath), saved);
    }
    assert.equal((await saveDate(1, '2025-01-01', 2)).status, 404);
    assert.equal((await saveDate(999, '2025-01-01')).status, 404);
    await saveDate(2, '0001-01-01');
    await saveDate(3, '9999-12-31', 2);
    await post('/projects/1/tasks/1/rename', { ...filters, title: 'Renamed' });
    const renamed = await html(filteredPath);
    assert.match(renamed, /aria-label="Complete Renamed" checked/);
    assert.match(dateInput(renamed, 1), /value="2000-02-29"/);
    await stop();
    await start();
    assert.equal(await html(filteredPath), renamed);
    assert.match(dateInput(await html('/projects/1'), 2), /value="0001-01-01"/);
    assert.match(dateInput(await html('/projects/2'), 3), /value="9999-12-31"/);
    await post('/projects/1/archive');
    const archived = await html(filteredPath);
    assert.match(dateInput(archived, 1), /value="2000-02-29" disabled/);
    assert.match(archived, /<button type="submit" disabled>Save due date<\/button>/);
    assert.equal((await saveDate(1, '')).status, 403);
    await stop();
    await start();
    assert.equal(await html(filteredPath), archived);
    await post('/projects/1/restore');
    assert.equal(await html(filteredPath), renamed);
    for (const empty of ['', ' \t\n ']) {
      await saveDate(1, '2024-02-29');
      assert.equal((await saveDate(1, empty)).status, 303);
      assert.match(dateInput(await html(filteredPath), 1), /value=""/);
    }
    const cleared = await html(filteredPath);
    await stop();
    await start();
    assert.equal(await html(filteredPath), cleared);
    assert.match(dateInput(await html('/projects/1'), 2), /value="0001-01-01"/);
  } finally {
    if (server?.listening) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
