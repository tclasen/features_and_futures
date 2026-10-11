import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

async function launch(file) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: file }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const port = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(match[1]);
    });
    child.once('error', reject);
    child.once('exit', () => reject(new Error('Server exited')));
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; },
  };
}

const rows = (html) => [...html.matchAll(/aria-label="Complete ([^"]+)"/g)].map((m) => m[1]);

test('deleted tasks retain all fields, filters and remembered order through restoration and restart', async () => {
  const directory = await mkdtemp(path.resolve('data/deletion-test-'));
  const file = path.join(directory, 'db.sqlite');
  let server;
  try {
    // Simulate a pre-deletion database with already established return positions.
    const old = new DatabaseSync(file);
    old.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      INSERT INTO projects VALUES (1, 'Source'), (2, 'Destination');
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, title TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal', due_date TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL);
      INSERT INTO tasks VALUES (1, 1, 'First', 1, 'High', '2026-02-28', ' notes with 雪 ', 1),
        (2, 1, 'Second', 0, 'Normal', '', '', 2);
      CREATE TABLE task_positions (task_id INTEGER NOT NULL, project_id INTEGER NOT NULL, position INTEGER NOT NULL,
        PRIMARY KEY (task_id, project_id));
      INSERT INTO task_positions VALUES (1, 1, 1), (1, 2, 1), (2, 1, 2);`);
    const original = old.prepare('SELECT * FROM tasks WHERE id = 1').get();
    old.close();
    server = await launch(file);
    const post = (route, values = {}) => fetch(server.url + route, { method: 'POST', body: new URLSearchParams(values), redirect: 'manual' });
    const html = async (route) => (await fetch(server.url + route)).text();
    const snapshot = () => {
      const db = new DatabaseSync(file);
      const result = db.prepare('SELECT * FROM tasks WHERE id = 1').get();
      db.close();
      return { ...result };
    };
    assert.deepEqual(rows(await html('/projects/1')), ['First', 'Second']);
    assert.equal(snapshot().deleted, 0);
    const state = { filter: 'Completed', priorityFilter: 'High', rangeFrom: '2026-02-01', rangeThrough: '2026-02-28', taskSearch: 'first' };
    let response = await post('/projects/1/tasks/1/delete', state);
    assert.equal(response.status, 303);
    let location = response.headers.get('location');
    for (const [key, value] of Object.entries(state)) assert.equal(new URL(location, server.url).searchParams.get(key), value);
    assert.deepEqual(rows(await html(location)), []);
    for (const filter of ['All', 'Open', 'Completed']) assert.ok(!rows(await html('/projects/1?filter=' + filter)).includes('First'));
    assert.match(await html('/'), /0\/1 completed/);
    const deletedUrl = '/projects/1?' + new URLSearchParams({ ...state, filter: 'Deleted' });
    let markup = await html(deletedUrl);
    assert.deepEqual(rows(markup), ['First']);
    assert.match(markup, /<option selected>Deleted<\/option>/);
    assert.match(markup, />Restore task<\/button>/);
    assert.doesNotMatch(markup, />Delete task<\/button>/);
    assert.match(markup, /name="completed"[^>]* disabled/);
    for (const name of ['title', 'priority', 'dueDate', 'notes', 'destination']) {
      assert.match(markup, new RegExp('(?:input|select|textarea)[^>]*name="' + name + '"[^>]* disabled'));
    }
    for (const label of ['Rename task', 'Save due date', 'Save notes', 'Move task']) assert.ok(markup.includes('disabled>' + label));
    assert.deepEqual(rows(await html(deletedUrl.replace('High', 'Low'))), []);
    assert.deepEqual(rows(await html(deletedUrl.replace('first', 'missing'))), []);
    assert.deepEqual(rows(await html(deletedUrl.replace('2026-02-28', '2026-02-27'))), []);
    for (const [suffix, values] of [
      ['', { completed: '0' }], ['/rename', { title: 'Forbidden' }], ['/priority', { priority: 'Low' }],
      ['/due-date', { dueDate: '' }], ['/notes', { notes: 'Forbidden' }], ['/move', { destination: '2' }],
    ]) assert.equal((await post('/projects/1/tasks/1' + suffix, values)).status, 404);
    assert.deepEqual(snapshot(), { ...original, deleted: 1 });
    await post('/projects/1/tasks/2/delete');
    assert.match(await html('/'), /0\/0 completed/);
    await post('/projects/1/tasks', { title: 'Third' });
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/archive');
    markup = await html(deletedUrl);
    assert.deepEqual(rows(markup), ['First']);
    assert.match(markup, /disabled>Restore task/);
    assert.equal((await post('/projects/1/tasks/1/restore')).status, 403);
    assert.equal((await post('/projects/1/tasks/3/delete')).status, 403);
    await post('/projects/1/restore');
    await server.stop();
    server = await launch(file);
    assert.deepEqual(rows(await html('/projects/1?filter=Deleted')), ['First', 'Second']);
    // Restore out of order, preserving the reserved positions ahead of new tasks.
    await post('/projects/1/tasks/2/restore', { filter: 'Deleted' });
    response = await post('/projects/1/tasks/1/restore', { ...state, filter: 'Deleted' });
    location = response.headers.get('location');
    assert.equal(new URL(location, server.url).searchParams.get('filter'), 'Deleted');
    assert.deepEqual(rows(await html(location)), []);
    assert.deepEqual(rows(await html('/projects/1')), ['First', 'Second', 'Third']);
    assert.deepEqual(snapshot(), { ...original, deleted: 0 });
    assert.match(await html('/'), /1\/3 completed/);
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/2/tasks/1/delete');
    assert.deepEqual(rows(await html('/projects/2?filter=Deleted')), ['First']);
    await post('/projects/2/tasks/1/restore');
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(rows(await html('/projects/1')), ['First', 'Second', 'Third']);
    await server.stop();
    server = await launch(file);
    assert.deepEqual(snapshot(), { ...original, deleted: 0 });
    assert.deepEqual(rows(await html('/projects/1')), ['First', 'Second', 'Third']);
    assert.equal((await post('/projects/2/tasks/1/delete')).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
