import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe']
  });
  const port = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(match[1]);
    });
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Server exited: ${code}`)));
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() { const exited = once(child, 'exit'); child.kill(); await exited; }
  };
}

test('soft deletion preserves fields, remembered positions, filters and migration data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-deletion-'));
  const dbPath = join(directory, 'db.sqlite');
  let server;
  let db;
  try {
    db = new DatabaseSync(dbPath);
    db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (name) VALUES ('Source'), ('Destination');
      INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Alpha', 1), (1, 'Beta', 0);`);
    db.close();
    server = await start(dbPath);
    db = new DatabaseSync(dbPath);
    const get = async path => (await fetch(server.url + path)).text();
    const post = async (path, values = {}) => fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(values)
    });
    const task = () => db.prepare('SELECT * FROM tasks WHERE id = 1').get();
    const positions = () => db.prepare('SELECT * FROM task_positions WHERE task_id = 1 ORDER BY project_id').all();
    const rows = html => (html.match(/data-testid="task-row"/g) || []).length;
    assert.equal(task().deleted, 0);
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
    await post('/projects/1/tasks/1/notes', { notes: '  Unicode 雪\n<markup>  ' });
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    const before = task();
    const beforePositions = positions();
    const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-01', dueThrough: '2024-03-01', search: 'alpha' };
    let response = await post('/projects/1/tasks/1/delete', state);
    let html = await response.text();
    assert.equal(rows(html), 0);
    assert.match(html, /<option selected>Completed/);
    assert.match(html, /<option selected>High/);
    assert.match(html, /id="due-from"[^>]*value="2024-02-01"/);
    assert.match(html, /id="due-through"[^>]*value="2024-03-01"/);
    assert.match(html, /id="task-search"[^>]*value="alpha"/);
    assert.deepEqual({ ...task() }, { ...before, deleted: 1 });
    assert.deepEqual(positions(), beforePositions);
    assert.match(await get('/'), /0\/1 completed/);
    for (const filter of ['All', 'Open', 'Completed']) {
      assert.doesNotMatch(await get(`/projects/1?filter=${filter}`), /Complete Alpha/);
    }
    const deletedState = { ...state, filter: 'Deleted' };
    const query = new URLSearchParams(deletedState);
    html = await get(`/projects/1?${query}`);
    assert.equal(rows(html), 1);
    assert.match(html, /<option>All<\/option><option>Open<\/option><option>Completed<\/option><option selected>Deleted/);
    assert.match(html, /aria-label="Complete Alpha" checked disabled/);
    for (const id of ['new-task-title', 'task-priority', 'task-due-date', 'task-notes', 'destination-project']) {
      assert.match(html, new RegExp(`id="${id}-1"[^>]* disabled`));
    }
    for (const label of ['Rename task', 'Save due date', 'Save notes', 'Move task']) {
      assert.match(html, new RegExp(`<button type="submit" disabled>${label}`));
    }
    assert.match(html, /<button type="submit">Restore task/);
    assert.doesNotMatch(html, />Delete task</);
    for (const override of [{ priorityFilter: 'Low' }, { search: 'notes' }, { dueFrom: '2024-03-01' }]) {
      assert.equal(rows(await get(`/projects/1?${new URLSearchParams({ ...deletedState, ...override })}`)), 0);
    }
    for (const [suffix, values] of [
      ['', { completed: '0' }], ['/rename', { title: 'bad' }], ['/priority', { priority: 'Low' }],
      ['/due-date', { dueDate: '' }], ['/notes', { notes: 'bad' }], ['/move', { destination: '2' }]
    ]) {
      assert.equal((await post(`/projects/1/tasks/1${suffix}`, values)).status, 403);
    }
    assert.deepEqual({ ...task() }, { ...before, deleted: 1 });
    await post('/projects/1/tasks/2/delete');
    assert.match(await get('/'), /0\/0 completed/);
    await post('/projects/1/tasks', { title: 'Later' });
    assert.equal(db.prepare('SELECT deleted FROM tasks WHERE id = 3').get().deleted, 0);
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/archive');
    html = await get('/projects/1?filter=Deleted');
    assert.equal(rows(html), 2);
    assert.match(html, /<button type="submit" disabled>Restore task/);
    assert.match(await get('/projects/1'), /<button type="submit" disabled>Delete task/);
    assert.equal((await post('/projects/1/tasks/1/restore')).status, 403);
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual({ ...task() }, { ...before, deleted: 1 });
    assert.deepEqual(positions(), beforePositions);
    await post('/projects/1/restore');
    // Restore in reverse order; reserved positions still precede newly created tasks.
    await post('/projects/1/tasks/2/restore', { filter: 'Deleted' });
    response = await post('/projects/1/tasks/1/restore', deletedState);
    html = await response.text();
    assert.equal(rows(html), 0);
    assert.match(html, /<option selected>Deleted/);
    assert.match(html, /<option selected>High/);
    assert.deepEqual(task(), before);
    assert.deepEqual(positions(), beforePositions);
    html = await get('/projects/1');
    assert.ok(html.indexOf('Complete Alpha') < html.indexOf('Complete Beta'));
    assert.ok(html.indexOf('Complete Beta') < html.indexOf('Complete Later'));
    assert.match(await get('/'), /1\/3 completed/);
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(task(), before);
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual(task(), before);
    assert.equal(rows(await get('/projects/1?filter=Deleted')), 0);
  } finally {
    if (server) await server.stop();
    if (db?.isOpen) db.close();
    await rm(directory, { recursive: true, force: true });
  }
});
