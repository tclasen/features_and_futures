import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { createApplication } from '../app.js';

test('moves append, preserve data and filters, enforce active ownership, and persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-move-'));
  const databasePath = join(directory, 'db.sqlite');
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
  const ids = html => [...html.matchAll(/<input id="task-(\d+)" type="checkbox"/g)].map(match => Number(match[1]));
  const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-01-01', dueThrough: '2024-12-31' };
  try {
    await start();
    await post('/projects', { name: 'Source' });
    await post('/projects/1/tasks', { title: 'First' });
    let html = await get('/projects/1');
    assert.match(html, /id="destination-project-1" name="destination" disabled>\s*<\/select>/);
    assert.match(html, /<button type="submit" disabled>Move task/);
    await post('/projects', { name: 'Destination' });
    await post('/projects', { name: 'Third' });
    await post('/projects/3/rename', { name: 'Third & renamed' });
    html = await get('/projects/1');
    assert.match(html, /name="destination">\s*<option value="2">Destination<\/option>\s*<option value="3">Third &amp; renamed<\/option>\s*<\/select>/);
    await post('/projects/1/tasks', { title: 'Second' });
    await post('/projects/2/tasks', { title: 'Destination existing' });
    await post('/projects/2/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks/1', { completed: '1' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
    for (const destination of ['1', '999', 'garbage']) {
      assert.equal((await post('/projects/1/tasks/1/move', { destination })).status, 422);
    }
    await post('/projects/3/archive');
    assert.equal((await post('/projects/1/tasks/1/move', { destination: '3' })).status, 422);
    assert.doesNotMatch(await get('/projects/1'), /<option value="3">/);
    let response = await post('/projects/1/tasks/1/move', { ...state, destination: '2' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1?' + new URLSearchParams(state));
    assert.deepEqual(ids(await get(response.headers.get('location'))), []);
    assert.deepEqual(ids(await get('/projects/1')), [2]);
    html = await get('/projects/2');
    assert.deepEqual(ids(html), [3, 1]);
    assert.match(html, /aria-label="Complete First" checked/);
    assert.match(html, /<option selected>High<\/option>/);
    assert.match(html, /name="dueDate" type="text" value="2024-02-29"/);
    const summary = await get('/');
    assert.match(summary, /0\/1 completed/);
    assert.match(summary, /1\/2 completed/);
    assert.equal((await post('/projects/1/tasks/1/move', { destination: '2' })).status, 404);
    await post('/projects/2/archive');
    html = await get('/projects/2');
    assert.match(html, /name="destination" disabled/);
    assert.match(html, /<button type="submit" disabled>Move task/);
    assert.equal((await post('/projects/2/tasks/1/move', { destination: '1' })).status, 403);
    await post('/projects/2/restore');
    await stop();
    await start();
    assert.deepEqual(ids(await get('/projects/2')), [3, 1]);
    assert.match(await get('/projects/2'), /value="2024-02-29"/);
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(ids(await get('/projects/1')), [2, 1]);
    await post('/projects/1/tasks', { title: 'New after moved' });
    assert.deepEqual(ids(await get('/projects/1')), [2, 1, 4]);
    await post('/projects/1/tasks/2/move', { destination: '2' });
    html = await get('/projects/2');
    assert.deepEqual(ids(html), [3, 2]);
    assert.match(html, /id="task-due-date-2" name="dueDate" type="text" value=""/);
    await stop();
    await start();
    assert.deepEqual(ids(await get('/projects/1')), [1, 4]);
    assert.deepEqual(ids(await get('/projects/2')), [3, 2]);
  } finally {
    if (server) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('ordering migration retains legacy task identities and creation order', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-move-upgrade-'));
  const path = join(directory, 'db.sqlite');
  let server;
  try {
    const database = new DatabaseSync(path);
    database.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (name) VALUES ('Legacy');
      INSERT INTO tasks (project_id, title) VALUES (1, 'Older'), (1, 'Newer');`);
    database.close();
    server = createApplication(path);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const html = await (await fetch(`http://127.0.0.1:${server.address().port}/projects/1`)).text();
    assert.ok(html.indexOf('Complete Older') < html.indexOf('Complete Newer'));
    assert.match(html, /id="task-1"/);
    assert.match(html, /id="task-2"/);
  } finally {
    if (server) {
      const closed = once(server, 'close');
      server.close();
      await closed;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
