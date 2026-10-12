import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('soft deletion preserves fields, filters, summaries and reserved positions across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-delete-'));
  const database = join(directory, 'data.sqlite');
  const legacy = new DatabaseSync(database);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects VALUES (1, 'Source'), (2, 'Destination');
    INSERT INTO tasks VALUES (1, 1, 'First', 1), (2, 1, 'Second', 0);
  `);
  legacy.close();
  let child, base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: database }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    base = await new Promise((resolve, reject) => {
      let output = '';
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
      child.on('error', reject);
      child.on('exit', code => reject(new Error(`Server exited: ${code}`)));
    });
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = null;
  }
  const get = async path => (await fetch(base + path)).text();
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const snapshot = () => {
    const db = new DatabaseSync(database);
    try { return db.prepare('SELECT * FROM tasks ORDER BY id').all().map(task => ({ ...task })); }
    finally { db.close(); }
  };
  const titles = body => [...body.matchAll(/aria-label="Complete ([^"]+)"/g)].map(match => match[1]);
  const state = { filter: 'Deleted', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-02-29', search: 'first' };
  const location = '/projects/1?filter=Deleted&priorityFilter=High&dueFrom=2024-02-29&dueThrough=2024-02-29&search=first';
  try {
    await start();
    assert.deepEqual(snapshot().map(task => task.deleted), [0, 0]);
    assert.deepEqual(titles(await get('/projects/1?filter=Deleted')), []);
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
    await post('/projects/1/tasks/1/notes', { notes: '  雪\n<plain text>  ' });
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    const before = snapshot();
    const deleted = await post('/projects/1/tasks/1/delete', state);
    assert.equal(deleted.status, 303);
    assert.equal(deleted.headers.get('location'), location);
    assert.deepEqual(snapshot().map(task => ({ ...task, deleted: 0 })), before);
    for (const filter of ['All', 'Open', 'Completed']) {
      assert.equal(titles(await get(`/projects/1?filter=${filter}`)).includes('First'), false);
    }
    let body = await get(location);
    assert.deepEqual(titles(body), ['First']);
    assert.match(body, /<option selected>Deleted<\/option>/);
    assert.match(body, /<button type="submit">Restore task<\/button>/);
    // Every existing row editing control is disabled; only restoration is enabled.
    const row = body.split('data-testid="task-row"')[1].split('</div>')[0];
    for (const tag of row.matchAll(/<(?:input|textarea|select|button)\b[^>]*>/g)) {
      if (tag[0].includes('type="hidden"') || tag[0] === '<button type="submit">') continue;
      assert.match(tag[0], / disabled/);
    }
    for (const [action, values] of [
      ['', { completed: '0' }], ['/rename', { title: 'Blocked' }],
      ['/priority', { priority: 'Low' }], ['/due-date', { dueDate: '' }],
      ['/notes', { notes: '' }], ['/move', { destination: '2' }],
    ]) assert.equal((await post(`/projects/1/tasks/1${action}`, values)).status, 403);
    assert.deepEqual(titles(await get('/projects/1?filter=Deleted&priorityFilter=Low')), []);
    assert.deepEqual(titles(await get('/projects/1?filter=Deleted&dueFrom=2025-01-01')), []);
    assert.deepEqual(titles(await get('/projects/1?filter=Deleted&search=plain')), []);
    assert.match(await get('/'), /data-testid="project-summary">0\/1 completed/);
    await post('/projects/1/tasks/2/delete');
    assert.match(await get('/'), /data-testid="project-summary">0\/0 completed/);
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Third' });
    assert.equal(snapshot()[2].deleted, 0);
    await post('/projects/1/archive');
    body = await get(location);
    assert.deepEqual(titles(body), ['First']);
    assert.match(body, /disabled>Restore task<\/button>/);
    for (const action of ['delete', 'restore']) {
      assert.equal((await post(`/projects/1/tasks/1/${action}`, state)).status, 403);
    }
    await stop();
    await start();
    assert.deepEqual(snapshot().slice(0, 2).map(task => ({ ...task, deleted: 0 })), before);
    await post('/projects/1/restore');
    await post('/projects/1/tasks/2/restore', { filter: 'Deleted' });
    const restored = await post('/projects/1/tasks/1/restore', state);
    assert.equal(restored.headers.get('location'), location);
    assert.deepEqual(titles(await get(location)), []);
    assert.deepEqual(titles(await get('/projects/1')), ['First', 'Second', 'Third']);
    assert.deepEqual(snapshot().slice(0, 2), before);
    assert.match(await get('/'), /data-testid="project-summary">1\/3 completed/);
    await post('/projects/1/tasks/1/move', { destination: '2' });
    assert.deepEqual(titles(await get('/projects/2')), ['First']);
    await post('/projects/2/tasks/1/move', { destination: '1' });
    await stop();
    await start();
    assert.deepEqual(titles(await get('/projects/1')), ['First', 'Second', 'Third']);
    assert.deepEqual(snapshot().slice(0, 2), before);
    assert.equal((await post('/projects/2/tasks/1/delete')).status, 404);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
