import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const url = await new Promise((resolve, reject) => {
    let output = '';
    child.once('exit', code => reject(new Error(`Server exited ${code}`)));
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
    child.stderr.on('data', () => {});
  });
  return { url, stop: () => new Promise(resolve => {
    child.once('exit', resolve);
    child.kill('SIGTERM');
  }) };
}

const titles = html => [...html.matchAll(/data-testid="task-row">\s*<span>(.*?)<\/span>/g)].map(match => match[1]);

test('soft deletion migrates live tasks, preserves fields, filters, reserved order and restart state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-deletion-'));
  let server;
  try {
    const path = join(directory, 'workboard.sqlite');
    const db = new DatabaseSync(path);
    db.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal');
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
        priority TEXT NOT NULL DEFAULT 'Normal', due_date TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL);
      INSERT INTO projects (name) VALUES ('Source'), ('Destination');
      INSERT INTO tasks (project_id, title, completed, priority, due_date, notes, position)
        VALUES (1, 'First Task', 1, 'High', '2024-02-29', '  saved notes 雪', 5),
               (1, 'Second', 0, 'Low', '', '', 9);
    `);
    db.close();
    server = await start(path);
    const get = async route => (await fetch(server.url + route)).text();
    const post = (route, data = {}) => fetch(server.url + route, {
      method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
    });
    const snapshot = () => {
      const db = new DatabaseSync(path);
      try { return { ...db.prepare('SELECT * FROM tasks WHERE id = 1').get() }; }
      finally { db.close(); }
    };
    const initial = snapshot();
    assert.equal(initial.deleted, 0);
    let html = await get('/projects/1');
    assert.deepEqual(titles(html), ['First Task', 'Second']);
    assert.match(html, /<option>Deleted<\/option>/);
    assert.match(await get('/'), /1\/2 completed/);
    const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-02-29', search: 'first\t task' };
    const response = await post('/projects/1/tasks/1/delete', state);
    assert.equal(response.status, 303);
    const location = response.headers.get('location');
    for (const [key, value] of Object.entries(state)) {
      assert.equal(new URL(location, server.url).searchParams.get(key), value);
    }
    assert.deepEqual(titles(await get(location)), []);
    for (const filter of ['All', 'Open', 'Completed']) {
      assert.ok(!titles(await get(`/projects/1?filter=${filter}`)).includes('First Task'));
    }
    assert.deepEqual(snapshot(), { ...initial, deleted: 1 });
    assert.match(await get('/'), /0\/1 completed/);
    const deletedRoute = `/projects/1?${new URLSearchParams({ ...state, filter: 'Deleted' })}`;
    html = await get(deletedRoute);
    assert.deepEqual(titles(html), ['First Task']);
    const row = html.match(/<li data-testid="task-row">[\s\S]*?<\/li>/)[0];
    for (const control of row.matchAll(/<(input|textarea|select|button)\b[^>]*>/g)) {
      if (control[0].includes('type="hidden"')) continue;
      if (control[1] === 'button' && row.slice(control.index).startsWith('<button type="submit">Restore task')) continue;
      assert.ok(control[0].includes('disabled'), control[0]);
    }
    assert.ok(!row.includes('>Delete task<'));
    assert.deepEqual(titles(await get(deletedRoute.replace('priorityFilter=High', 'priorityFilter=Low'))), []);
    assert.deepEqual(titles(await get('/projects/1?filter=Deleted&dueFrom=2024-03-01')), []);
    assert.deepEqual(titles(await get('/projects/1?filter=Deleted&search=saved+notes')), []);
    for (const [action, data] of [['', { completed: '0' }], ['/rename', { title: 'Forbidden' }], ['/priority', { priority: 'Low' }], ['/due-date', { dueDate: '' }], ['/notes', { notes: 'Forbidden' }], ['/move', { destination: '2' }]]) {
      assert.equal((await post('/projects/1/tasks/1' + action, data)).status, 403);
    }
    assert.equal((await post('/projects/2/tasks/1/restore')).status, 404);
    await post('/projects/1/tasks/2/delete');
    assert.match(await get('/'), /0\/0 completed/);
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'New' });
    await post('/projects/1/archive');
    html = await get('/projects/1?filter=Deleted');
    assert.deepEqual(titles(html), ['First Task', 'Second']);
    assert.match(html, /disabled>Restore task/);
    assert.equal((await post('/projects/1/tasks/1/restore')).status, 403);
    assert.equal((await post('/projects/1/tasks/3/delete')).status, 403);
    await server.stop();
    server = await start(path);
    assert.deepEqual(snapshot(), { ...initial, deleted: 1 });
    await post('/projects/1/restore');
    await post('/projects/1/tasks/2/restore', { filter: 'Deleted' });
    const restored = await post('/projects/1/tasks/1/restore', { ...state, filter: 'Deleted' });
    assert.deepEqual(titles(await get(restored.headers.get('location'))), []);
    assert.deepEqual(snapshot(), initial);
    assert.deepEqual(titles(await get('/projects/1')), ['First Task', 'Second', 'New']);
    assert.match(await get('/'), /1\/3 completed/);
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/2/tasks/1/delete');
    assert.deepEqual(titles(await get('/projects/2?filter=Deleted')), ['First Task']);
    await post('/projects/2/tasks/1/restore');
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(snapshot(), initial);
    await server.stop();
    server = await start(path);
    assert.deepEqual(titles(await get('/projects/1')), ['First Task', 'Second', 'New']);
    assert.deepEqual(titles(await get('/projects/1?filter=Deleted')), []);
    assert.deepEqual(snapshot(), initial);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
