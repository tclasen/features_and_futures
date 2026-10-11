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
    env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  const port = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Server exited: ${code}`)));
    child.stdout.on('data', data => {
      const match = /listening on port (\d+)/.exec(data.toString());
      if (match) resolve(match[1]);
    });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() { const exit = once(child, 'exit'); child.kill(); await exit; },
  };
}
const titles = html => [...html.matchAll(/data-testid="task-row">\s*<span>(.*?)<\/span>/g)].map(match => match[1]);

test('soft deletion preserves data, reserved positions, intersecting filters and archive restrictions across restarts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-deletion-'));
  const dbPath = join(dir, 'db.sqlite');
  let server;
  try {
    // Upgrade the previous schema, preserving notes and current task order.
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal');
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal',
        due_date TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL);
      INSERT INTO projects (name) VALUES ('Source'), ('Destination');
      INSERT INTO tasks (project_id, title, completed, priority, due_date, notes, position)
        VALUES (1, 'First', 1, 'High', '2028-02-29', '  saved notes', 1),
        (1, 'Second', 0, 'Low', '', '', 2);
    `);
    const original = legacy.prepare('SELECT * FROM tasks WHERE id = 1').get();
    legacy.close();
    server = await start(dbPath);
    const get = path => fetch(server.url + path).then(response => response.text());
    const post = (path, data = {}) => fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
    });
    assert.deepEqual(titles(await get('/projects/1')), ['First', 'Second']);
    assert.deepEqual(titles(await get('/projects/1?filter=Deleted')), []);
    const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2028-02-29', dueThrough: '2028-03-01', search: 'FIRST' };
    const deleted = await post('/projects/1/tasks/1/delete', state);
    assert.equal(deleted.status, 303);
    for (const [key, value] of Object.entries(state)) {
      assert.equal(new URL(deleted.headers.get('location'), server.url).searchParams.get(key), value);
    }
    assert.deepEqual(titles(await get(deleted.headers.get('location'))), []);
    assert.match(await get('/'), /0\/1 completed/);
    const deletedLocation = '/projects/1?' + new URLSearchParams({ ...state, filter: 'Deleted' });
    let html = await get(deletedLocation);
    assert.deepEqual(titles(html), ['First']);
    assert.match(html, /<fieldset disabled>/);
    assert.match(html, /Restore task/);
    assert.ok(html.includes('  saved notes'));
    assert.deepEqual(titles(await get('/projects/1?filter=Deleted&priorityFilter=Low')), []);
    assert.deepEqual(titles(await get('/projects/1?filter=Deleted&dueFrom=2029-01-01')), []);
    assert.deepEqual(titles(await get('/projects/1?filter=Deleted&search=notes')), []);
    for (const [suffix, data] of [
      ['', { completed: '0' }], ['/rename', { title: 'Changed' }], ['/priority', { priority: 'Low' }],
      ['/due-date', { dueDate: '' }], ['/notes', { notes: 'Changed' }], ['/move', { destination: '2' }],
    ]) assert.equal((await post('/projects/1/tasks/1' + suffix, data)).status, 404);
    assert.equal((await post('/projects/2/tasks/1/restore')).status, 404);
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Third' });
    await post('/projects/1/tasks/2/delete');
    await post('/projects/1/tasks/3/delete');
    assert.match(await get('/'), /0\/0 completed/);
    await post('/projects/1/archive');
    html = await get('/projects/1?filter=Deleted');
    assert.deepEqual(titles(html), ['First', 'Second', 'Third']);
    assert.match(html, /<button type="submit" disabled>Restore task<\/button>/);
    assert.equal((await post('/projects/1/tasks/1/restore')).status, 403);
    assert.equal((await post('/projects/1/tasks/1/delete')).status, 403);
    await server.stop();
    server = undefined;
    const stored = new DatabaseSync(dbPath);
    assert.deepEqual({ ...stored.prepare('SELECT * FROM tasks WHERE id = 1').get() }, { ...original, deleted: 1 });
    stored.close();
    server = await start(dbPath);
    await post('/projects/1/restore');
    await post('/projects/1/tasks/3/restore', { filter: 'Deleted' });
    const restored = await post('/projects/1/tasks/1/restore', { ...state, filter: 'Deleted' });
    assert.deepEqual(titles(await get(restored.headers.get('location'))), []);
    await post('/projects/1/tasks/2/restore', { filter: 'Deleted' });
    assert.deepEqual(titles(await get('/projects/1')), ['First', 'Second', 'Third']);
    assert.match(await get('/'), /1\/3 completed/);
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/2/tasks/1/delete');
    await post('/projects/2/tasks/1/restore', { filter: 'Deleted' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(titles(await get('/projects/1')), ['First', 'Second', 'Third']);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.deepEqual(titles(await get('/projects/1')), ['First', 'Second', 'Third']);
    const final = new DatabaseSync(dbPath);
    assert.deepEqual({ ...final.prepare('SELECT * FROM tasks WHERE id = 1').get() }, { ...original, deleted: 0 });
    final.close();
  } finally {
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
