import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { createApplication } from '../app.js';

test('due dates validate calendar days and preserve task data across migration, edits and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-dates-'));
  const databasePath = join(directory, 'db.sqlite');
  const database = new DatabaseSync(databasePath);
  database.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Existing');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing task', 1);`);
  database.close();
  let server;
  let base;
  async function start() {
    server = createApplication(databasePath);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = `http://127.0.0.1:${server.address().port}`;
  }
  async function stop() {
    const closed = once(server, 'close');
    server.close();
    await closed;
    server = undefined;
  }
  const get = async path => (await fetch(base + path)).text();
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const dateInput = (html, id) => html.match(new RegExp(`<input id="task-due-date-${id}"[^>]*>`))[0];
  const date = (html, id) => dateInput(html, id).match(/value="([^"]*)"/)[1];
  const filters = { filter: 'Completed', priorityFilter: 'High' };
  const filteredPath = '/projects/1?filter=Completed&priorityFilter=High';
  try {
    await start();
    await post('/projects', { name: 'Other' });
    await post('/projects/1/tasks', { title: 'New task' });
    await post('/projects/2/tasks', { title: 'Other task' });
    assert.equal(date(await get('/projects/1'), 1), '');
    assert.equal(date(await get('/projects/1'), 2), '');
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    const summary = await get('/');
    for (const value of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '1900-02-28', ' 2026-04-30 ']) {
      const response = await post('/projects/1/tasks/1/due-date', { ...filters, dueDate: value });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), filteredPath);
      const html = await get(filteredPath);
      assert.equal(date(html, 1), value.trim());
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.match(html, /<option selected>High<\/option>/);
      assert.equal(await get('/'), summary);
    }
    const saved = await get(filteredPath);
    for (const value of ['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2023-02-29', '2024-04-31', '2024-00-01', '2024-13-01', '2024-01-00', '2024-01-32', '2024-1-01', '24-01-01', '2024-01-01T00:00:00Z', 'not a date']) {
      const response = await post('/projects/1/tasks/1/due-date', { ...filters, dueDate: value });
      assert.equal(response.status, 422, value);
      const html = await response.text();
      assert.match(html, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      assert.equal(date(html, 1), '2026-04-30');
      assert.equal(await get(filteredPath), saved);
    }
    assert.equal(date(await get('/projects/1'), 2), '');
    assert.equal(date(await get('/projects/2'), 3), '');
    assert.equal((await post('/projects/2/tasks/1/due-date', { dueDate: '2025-01-01' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/due-date', { dueDate: '2025-01-01' })).status, 404);
    await post('/projects/1/tasks/1/rename', { ...filters, title: 'Renamed' });
    assert.equal(date(await get(filteredPath), 1), '2026-04-30');
    assert.match(await get(filteredPath), /aria-label="Complete Renamed" checked/);
    const renamed = await get('/projects/1');
    await stop();
    await start();
    assert.equal(await get('/projects/1'), renamed);
    await post('/projects/1/archive');
    await stop();
    await start();
    const archived = await get(filteredPath);
    assert.match(dateInput(archived, 1), /disabled/);
    assert.match(archived, /<button type="submit" disabled>Save due date<\/button>/);
    assert.equal(date(archived, 1), '2026-04-30');
    assert.equal((await post('/projects/1/tasks/1/due-date', { dueDate: '' })).status, 403);
    assert.equal(await get(filteredPath), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), renamed);
    for (const value of ['', '   ']) {
      await post('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
      const response = await post('/projects/1/tasks/1/due-date', { ...filters, dueDate: value });
      assert.equal(response.headers.get('location'), filteredPath);
      assert.equal(date(await get(filteredPath), 1), '');
    }
    await stop();
    await start();
    assert.equal(date(await get(filteredPath), 1), '');
    assert.equal(await get('/'), summary);
  } finally {
    if (server) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
