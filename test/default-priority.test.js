import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApplication } from '../server.js';

test('project defaults migrate, persist independently, and affect only future tasks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-default-'));
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
  const control = text => text.match(/<select id="default-task-priority"[\s\S]*?<\/select>/)[0];
  const selected = (text, id) => text.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`))[1].match(/<option selected>(.*?)<\/option>/)[1];
  try {
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
      INSERT INTO projects (name) VALUES ('Existing');
      INSERT INTO tasks (project_id, title, completed, priority) VALUES (1, 'Old task', 1, 'High');`);
    legacy.close();
    await start();
    await post('/projects', { name: 'New project' });
    for (const id of [1, 2]) {
      const text = await html(`/projects/${id}`);
      assert.match(text, /<label for="default-task-priority">Default task priority<\/label>/);
      assert.match(control(text), /name="priority" data-auto-submit/);
      assert.match(control(text), /<option>Low<\/option><option selected>Normal<\/option><option>High<\/option>/);
      assert.equal((control(text).match(/<option/g) || []).length, 3);
    }
    const filters = { filter: 'Completed', priorityFilter: 'High' };
    const path = '/projects/1?filter=Completed&priorityFilter=High';
    const before = await html(path);
    const summary = await html('/');
    const response = await post('/projects/1/default-priority', { ...filters, priority: 'Low' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), path);
    const changed = await html(path);
    assert.deepEqual(rows(changed), rows(before));
    assert.equal(selected(changed, 'task-filter'), 'Completed');
    assert.equal(selected(changed, 'priority-filter'), 'High');
    assert.equal(selected(changed, 'default-task-priority'), 'Low');
    assert.equal(await html('/'), summary);
    assert.equal(selected(await html('/projects/2'), 'default-task-priority'), 'Normal');
    for (const priority of ['', 'Urgent', 'low', ' Low ']) {
      const rejected = await post('/projects/1/default-priority', { ...filters, priority });
      assert.equal(rejected.status, 400);
      assert.equal(selected(await rejected.text(), 'priority-filter'), 'High');
      assert.equal(await html(path), changed);
    }
    assert.equal((await post('/projects/999/default-priority', { priority: 'High' })).status, 404);
    await post('/projects/1/tasks', { title: ' Inherits low ' });
    await post('/projects/1/default-priority', { priority: 'High' });
    await post('/projects/1/tasks', { title: 'Inherits high' });
    await post('/projects/2/tasks', { title: 'Independent' });
    let taskRows = rows(await html('/projects/1'));
    assert.match(taskRows[0], /aria-label="Complete Old task" checked/);
    assert.match(taskRows[0], /<option selected>High<\/option>/);
    assert.match(taskRows[1], /Complete Inherits low/);
    assert.match(taskRows[1], /<option selected>Low<\/option>/);
    assert.match(taskRows[2], /Complete Inherits high/);
    assert.match(taskRows[2], /<option selected>High<\/option>/);
    assert.match(rows(await html('/projects/2'))[0], /<option selected>Normal<\/option>/);
    await post('/projects/1/rename', { name: 'Renamed project' });
    await post('/projects/1/tasks/2/rename', { title: 'Renamed task' });
    await post('/projects/1/tasks/2/completion', { completed: '1' });
    assert.equal(selected(await html('/projects/1'), 'default-task-priority'), 'High');
    const saved = await html('/projects/1');
    const savedSummary = await html('/');
    await stop();
    await start();
    assert.equal(await html('/projects/1'), saved);
    assert.equal(await html('/'), savedSummary);
    await post('/projects/1/archive');
    const archived = await html(path);
    assert.match(control(archived), / disabled data-auto-submit/);
    assert.equal(selected(archived, 'default-task-priority'), 'High');
    assert.equal(selected(archived, 'task-filter'), 'Completed');
    assert.equal(selected(archived, 'priority-filter'), 'High');
    assert.equal((await post('/projects/1/default-priority', { priority: 'Normal' })).status, 403);
    await stop();
    await start();
    assert.equal(await html(path), archived);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), saved);
    await post('/projects/1/tasks', { title: 'After restoration' });
    taskRows = rows(await html('/projects/1'));
    assert.match(taskRows[3], /<option selected>High<\/option>/);
    assert.match(taskRows[1], /aria-label="Complete Renamed task" checked/);
    assert.match(taskRows[1], /<option selected>Low<\/option>/);
  } finally {
    if (server?.listening) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
