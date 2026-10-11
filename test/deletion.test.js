import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('deletion preserves fields, reserved order, filters, summaries and restart state', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-deletion-'));
  const dbPath = join(dir, 'db.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Source'), ('Destination');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'First', 1), (1, 'Second', 0);`);
  legacy.close();
  let child, base;
  const start = async () => {
    child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'inherit'] });
    base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Startup timeout')), 5000);
      child.stdout.on('data', chunk => {
        const match = /listening on port (\d+)/.exec(String(chunk));
        if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
      });
    });
  };
  const stop = async () => { const exit = once(child, 'exit'); child.kill(); await exit; };
  const post = (path, data = {}) => fetch(base + path, { method: 'POST', body: new URLSearchParams(data), redirect: 'manual' });
  const html = async path => (await fetch(base + path)).text();
  const saved = () => {
    const db = new DatabaseSync(dbPath);
    try { return { ...db.prepare('SELECT * FROM tasks WHERE id = 1').get() }; } finally { db.close(); }
  };
  const rows = page => [...page.matchAll(/aria-label="Complete ([^"]+)"/g)].map(match => match[1]);
  try {
    await start();
    assert.equal(saved().deleted, 0);
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { due_date: '2028-02-29' });
    await post('/projects/1/tasks/1/notes', { notes: '  雪\n<literal>  ' });
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    const before = saved();
    const filters = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2028-01-01', dueThrough: '2028-12-31', search: 'first' };
    let response = await post('/projects/1/tasks/1/delete', filters);
    assert.equal(response.status, 303);
    const location = response.headers.get('location');
    for (const [key, value] of Object.entries(filters)) assert.equal(new URL(location, base).searchParams.get(key), value);
    assert.deepEqual(saved(), { ...before, deleted: 1 });
    assert.deepEqual(rows(await html(location)), []);
    for (const filter of ['All', 'Open', 'Completed']) assert.ok(!rows(await html('/projects/1?filter=' + filter)).includes('First'));
    assert.ok((await html('/')).includes('0/1 completed'));
    await post('/projects/1/tasks/2/delete');
    assert.ok((await html('/')).includes('0/0 completed'));
    const deletedPath = '/projects/1?' + new URLSearchParams({ ...filters, filter: 'Deleted' });
    let deleted = await html(deletedPath);
    assert.deepEqual(rows(deleted), ['First']);
    assert.ok(deleted.includes('disabled>Rename task</button>'));
    for (const name of ['completed', 'title', 'priority', 'due_date', 'notes', 'destination']) {
      assert.match(deleted, new RegExp(`(?:input|select|textarea)[^>]*name="${name}"[^>]* disabled`));
    }
    for (const action of ['', '/rename', '/priority', '/due-date', '/notes', '/move']) {
      assert.equal((await post('/projects/1/tasks/1' + action, { title: 'changed', priority: 'Low', due_date: '', notes: '', destination: '2' })).status, 403);
    }
    assert.deepEqual(saved(), { ...before, deleted: 1 });
    assert.deepEqual(rows(await html('/projects/1?filter=Deleted&search=literal')), []);
    assert.deepEqual(rows(await html('/projects/1?filter=Deleted&priorityFilter=Low')), []);
    assert.deepEqual(rows(await html('/projects/1?filter=Deleted&dueFrom=2029-01-01')), []);
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Third' });
    await post('/projects/1/archive');
    deleted = await html(deletedPath);
    assert.ok(deleted.includes('disabled>Restore task</button>'));
    assert.ok((await html('/projects/1')).includes('disabled>Delete task</button>'));
    assert.equal((await post('/projects/1/tasks/1/restore')).status, 403);
    await stop();
    await start();
    assert.deepEqual(saved(), { ...before, deleted: 1 });
    await post('/projects/1/restore');
    response = await post('/projects/1/tasks/1/restore', { ...filters, filter: 'Deleted' });
    assert.equal(new URL(response.headers.get('location'), base).searchParams.get('filter'), 'Deleted');
    assert.deepEqual(rows(await html(response.headers.get('location'))), []);
    assert.deepEqual(saved(), before);
    await post('/projects/1/tasks/2/restore');
    assert.deepEqual(rows(await html('/projects/1')), ['First', 'Second', 'Third']);
    assert.ok((await html('/')).includes('1/3 completed'));
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    await stop();
    await start();
    assert.deepEqual(saved(), before);
    assert.deepEqual(rows(await html('/projects/1')), ['First', 'Second', 'Third']);
  } finally {
    if (child && child.exitCode === null) await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
