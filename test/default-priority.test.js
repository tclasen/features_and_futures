import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { createApplication } from '../app.js';

test('project defaults migrate, affect only future tasks, and survive rename and archive', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-default-'));
  const databasePath = join(directory, 'db.sqlite');
  const database = new DatabaseSync(databasePath);
  database.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
    INSERT INTO projects (name) VALUES ('Existing');
    INSERT INTO tasks (project_id, title, completed, priority) VALUES (1, 'Existing task', 1, 'Low');`);
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
  function control(html, id) {
    const match = html.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`));
    assert.ok(match);
    return match;
  }
  const selected = (html, id) => control(html, id)[1].match(/<option selected>(.*?)<\/option>/)[1];
  const taskPriorities = html => [...html.matchAll(/<select id="task-priority-\d+"[^>]*>([\s\S]*?)<\/select>/g)]
    .map(match => match[1].match(/<option selected>(.*?)<\/option>/)[1]);
  const filteredPath = '/projects/1?filter=Completed&priorityFilter=Low';
  const filters = { filter: 'Completed', priorityFilter: 'Low' };
  try {
    await start();
    await post('/projects', { name: 'New project' });
    for (const id of [1, 2]) {
      const html = await get(`/projects/${id}`);
      assert.equal(selected(html, 'default-task-priority'), 'Normal');
      assert.deepEqual([...control(html, 'default-task-priority')[1].matchAll(/<option(?: selected)?>(.*?)<\/option>/g)]
        .map(match => match[1]), ['Low', 'Normal', 'High']);
      assert.match(html, /<label for="default-task-priority">Default task priority<\/label>/);
    }
    await post('/projects/1/tasks', { title: 'Normal task' });
    const summary = await get('/');
    const beforeRows = (await get(filteredPath)).split('<section aria-label="Tasks">')[1];
    for (const priority of ['High', 'Low', 'Normal', 'High']) {
      const response = await post('/projects/1/default-priority', { ...filters, priority });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), filteredPath);
      const html = await get(response.headers.get('location'));
      assert.equal(selected(html, 'default-task-priority'), priority);
      assert.equal(selected(html, 'task-filter'), 'Completed');
      assert.equal(selected(html, 'priority-filter'), 'Low');
      assert.equal(html.split('<section aria-label="Tasks">')[1], beforeRows);
      assert.deepEqual(taskPriorities(await get('/projects/1')), ['Low', 'Normal']);
      assert.equal(await get('/'), summary);
    }
    await post('/projects/1/tasks', { title: 'High task' });
    await post('/projects/2/tasks', { title: 'Independent' });
    assert.deepEqual(taskPriorities(await get('/projects/1')), ['Low', 'Normal', 'High']);
    assert.deepEqual(taskPriorities(await get('/projects/2')), ['Normal']);
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Low task' });
    await post('/projects/1/tasks/3/rename', { title: 'Renamed task' });
    await post('/projects/1/rename', { name: 'Renamed project' });
    const saved = await get('/projects/1');
    assert.equal(selected(saved, 'default-task-priority'), 'Low');
    assert.deepEqual(taskPriorities(saved), ['Low', 'Normal', 'High', 'Low']);
    assert.match(saved, /aria-label="Complete Existing task" checked/);
    assert.match(saved, /aria-label="Complete Renamed task"/);
    for (const priority of ['', 'Urgent', 'high']) {
      const response = await post('/projects/1/default-priority', { ...filters, priority });
      assert.equal(response.status, 422);
      const html = await response.text();
      assert.equal(selected(html, 'task-filter'), 'Completed');
      assert.equal(selected(html, 'priority-filter'), 'Low');
    }
    assert.equal((await post('/projects/999/default-priority', { priority: 'High' })).status, 404);
    assert.equal(await get('/projects/1'), saved);
    await stop();
    await start();
    assert.equal(await get('/projects/1'), saved);
    await post('/projects/1/archive');
    await stop();
    await start();
    const archived = await get('/projects/1');
    assert.match(control(archived, 'default-task-priority')[0], /disabled/);
    assert.equal(selected(archived, 'default-task-priority'), 'Low');
    assert.equal((await post('/projects/1/default-priority', { priority: 'High' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), saved);
    await post('/projects/1/tasks', { title: 'After restoration' });
    assert.deepEqual(taskPriorities(await get('/projects/1')), ['Low', 'Normal', 'High', 'Low', 'Low']);
  } finally {
    if (server) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
