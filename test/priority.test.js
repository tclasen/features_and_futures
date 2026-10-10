import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { createApplication } from '../app.js';

test('task priorities migrate, persist independently, and respect ownership and archive state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  const databasePath = join(directory, 'workboard.sqlite');
  // Represent a database created before priorities were introduced.
  const database = new DatabaseSync(databasePath);
  database.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)));
    INSERT INTO projects (name) VALUES ('First'), ('Second');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing', 1);`);
  database.close();
  let server;
  let url;
  async function start() {
    server = createApplication(databasePath);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    url = `http://127.0.0.1:${server.address().port}`;
  }
  async function stop() {
    const closed = once(server, 'close');
    server.close();
    await closed;
    server = undefined;
  }
  const get = async path => (await fetch(url + path)).text();
  const post = (path, values = {}) => fetch(url + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const priorityControls = html => [...html.matchAll(/<select id="task-priority-(\d+)"[^>]*>([\s\S]*?)<\/select>/g)];
  const selected = html => priorityControls(html).map(control => {
    assert.deepEqual([...control[2].matchAll(/<option(?: selected)?>(.*?)<\/option>/g)].map(match => match[1]), ['Low', 'Normal', 'High']);
    return control[2].match(/<option selected>(.*?)<\/option>/)[1];
  });
  try {
    await start();
    await post('/projects/1/tasks', { title: 'New' });
    await post('/projects/2/tasks', { title: 'Other' });
    assert.deepEqual(selected(await get('/projects/1')), ['Normal', 'Normal']);
    assert.match(await get('/projects/1'), /<label for="task-priority-1">Task priority<\/label>/);
    const summary = await get('/');
    for (const priority of ['Low', 'Normal', 'High']) {
      const response = await post('/projects/1/tasks/1/priority', { priority, filter: 'Completed' });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/projects/1?filter=Completed');
      assert.deepEqual(selected(await get('/projects/1')), [priority, 'Normal']);
      assert.deepEqual(selected(await get('/projects/1?filter=Completed')), [priority]);
      assert.deepEqual(selected(await get('/projects/1?filter=Open')), ['Normal']);
      assert.equal(await get('/'), summary);
    }
    await post('/projects/1/tasks/2/priority', { priority: 'Low' });
    await post('/projects/1/tasks/1/rename', { title: '  Renamed  ' });
    const saved = await get('/projects/1');
    assert.deepEqual(selected(saved), ['High', 'Low']);
    assert.match(saved, /aria-label="Complete Renamed" checked/);
    assert.ok(saved.indexOf('Complete Renamed') < saved.indexOf('Complete New'));
    assert.deepEqual(selected(await get('/projects/2')), ['Normal']);
    for (const priority of ['', 'Urgent', 'high']) {
      assert.equal((await post('/projects/1/tasks/1/priority', { priority })).status, 422);
    }
    assert.equal((await post('/projects/2/tasks/1/priority', { priority: 'Low' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/priority', { priority: 'Low' })).status, 404);
    assert.equal(await get('/projects/1'), saved);
    await stop();
    await start();
    assert.equal(await get('/projects/1'), saved);
    await post('/projects/1/archive');
    await stop();
    await start();
    const archived = await get('/projects/1');
    assert.deepEqual(selected(archived), ['High', 'Low']);
    assert.ok(priorityControls(archived).every(control => / disabled/.test(control[0])));
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Normal' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), saved);
    assert.equal(await get('/'), summary);
    await post('/projects/1/tasks/2/priority', { priority: 'High' });
    await stop();
    await start();
    assert.deepEqual(selected(await get('/projects/1')), ['High', 'High']);
  } finally {
    if (server) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
