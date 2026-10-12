import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApplication } from '../server.js';

test('priorities migrate, persist independently, preserve task data, and respect archives', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
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
  const rows = text => [...text.matchAll(/<li[^>]*data-testid="task-row"[^>]*>[\s\S]*?<\/li>/g)].map(match => match[0]);
  const priorityControl = row => row.match(/<select id="task-priority-\d+"[\s\S]*?<\/select>/)[0];
  try {
    // Simulate the previous schema, including a completed task and stable IDs.
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (name) VALUES ('First'), ('Second');
      INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing', 1);`);
    legacy.close();
    await start();
    await post('/projects/1/tasks', { title: 'New task' });
    await post('/projects/2/tasks', { title: 'Other project' });
    const original = await html('/projects/1');
    const other = await html('/projects/2');
    const summary = await html('/');
    for (const row of rows(original)) {
      assert.match(row, /<label for="task-priority-\d+">Task priority<\/label>/);
      assert.match(priorityControl(row), /name="priority" data-auto-submit/);
      assert.match(priorityControl(row), /<option>Low<\/option><option selected>Normal<\/option><option>High<\/option>/);
      assert.equal((priorityControl(row).match(/<option/g) || []).length, 3);
    }
    for (const priority of ['', 'Urgent', 'high', ' High ']) {
      assert.equal((await post('/projects/1/tasks/1/priority', { priority })).status, 400);
      assert.equal(await html('/projects/1'), original);
    }
    for (const path of ['/projects/2/tasks/1/priority', '/projects/1/tasks/999/priority', '/projects/1/tasks/99999999999999999999/priority']) {
      assert.equal((await post(path, { priority: 'High' })).status, 404);
    }
    const response = await post('/projects/1/tasks/1/priority', { priority: 'High', filter: 'Completed' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1?filter=Completed');
    const changed = await html('/projects/1');
    assert.equal(changed, original.replace('<option selected>Normal</option><option>High</option>', '<option>Normal</option><option selected>High</option>'));
    assert.equal(await html('/projects/2'), other);
    assert.equal(await html('/'), summary);
    assert.equal(rows(await html('/projects/1?filter=Completed')).length, 1);
    assert.match(rows(await html('/projects/1?filter=Completed'))[0], /<option selected>High<\/option>/);
    assert.match(rows(await html('/projects/1?filter=Open'))[0], /<option selected>Normal<\/option>/);
    await post('/projects/1/tasks/2/priority', { priority: 'Low' });
    await post('/projects/1/tasks/1/rename', { title: ' Renamed ' });
    const renamed = await html('/projects/1');
    assert.match(rows(renamed)[0], /aria-label="Complete Renamed" checked/);
    assert.match(priorityControl(rows(renamed)[0]), /<option selected>High<\/option>/);
    assert.match(priorityControl(rows(renamed)[1]), /<option selected>Low<\/option>/);
    await stop();
    await start();
    assert.equal(await html('/projects/1'), renamed);
    assert.equal(await html('/'), summary);
    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    for (const row of rows(archived)) assert.match(priorityControl(row), / disabled data-auto-submit/);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Low' })).status, 403);
    assert.equal(await html('/projects/1'), archived);
    await stop();
    await start();
    assert.equal(await html('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), renamed);
    await post('/projects/1/tasks/1/priority', { priority: 'Normal' });
    assert.match(priorityControl(rows(await html('/projects/1'))[0]), /<option selected>Normal<\/option>/);
    assert.equal(await html('/'), summary);
  } finally {
    if (server?.listening) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
