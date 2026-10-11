import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('deletion migrates live data, preserves fields and positions, and survives restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-deletion-'));
  const dbPath = join(directory, 'db.sqlite');
  const old = new DatabaseSync(dbPath);
  old.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects VALUES (1, 'Source'), (2, 'Destination');
    INSERT INTO tasks VALUES (1, 1, 'First', 1), (2, 1, 'Second', 0);
  `);
  old.close();
  let child, base;
  const start = async () => {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    base = await new Promise((resolve, reject) => {
      child.stdout.on('data', data => {
        const match = String(data).match(/port (\d+)/);
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
      child.once('error', reject);
      child.once('exit', code => reject(new Error(`Exited ${code}`)));
    });
  };
  const stop = async () => {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = undefined;
  };
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const html = path => fetch(base + path).then(r => r.text());
  const count = page => (page.match(/data-testid="task-row"/g) || []).length;
  const filters = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2026-01-01', dueThrough: '2026-01-03', search: 'first' };
  try {
    await start();
    assert.equal(count(await html('/projects/1')), 2);
    assert.equal(count(await html('/projects/1?filter=Deleted')), 0);
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2026-01-02' });
    await post('/projects/1/tasks/1/notes', { notes: '  café\n<literal>  ' });
    const response = await post('/projects/1/tasks/1/delete', filters);
    assert.equal(response.status, 303);
    const params = new URL(response.headers.get('location'), base).searchParams;
    for (const [key, value] of Object.entries(filters)) assert.equal(params.get(key), value);
    assert.equal(count(await html(response.headers.get('location'))), 0);
    assert.match(await html('/'), /0\/1 completed/);
    const deleted = await html('/projects/1?filter=Deleted&priorityFilter=High&dueFrom=2026-01-01&dueThrough=2026-01-03&search=first');
    assert.equal(count(deleted), 1);
    assert.match(deleted, /<fieldset class="task-controls" disabled>/);
    assert.match(deleted, /Restore task/);
    assert.ok(deleted.includes('  café\n&lt;literal&gt;  '));
    assert.equal(count(await html('/projects/1?filter=Deleted&priorityFilter=Low')), 0);
    assert.equal(count(await html('/projects/1?filter=Deleted&search=café')), 0);
    for (const [action, values] of Object.entries({
      completion: {}, rename: { title: 'Wrong' }, priority: { priority: 'Low' },
      'due-date': { dueDate: '' }, notes: { notes: 'Wrong' }, move: { destination: '2' },
    })) assert.equal((await post(`/projects/1/tasks/1/${action}`, values)).status, 403);
    await post('/projects/1/tasks/2/delete');
    assert.match(await html('/'), /0\/0 completed/);
    await post('/projects/1/tasks', { title: 'Third' });
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/archive');
    assert.match(await html('/projects/1?filter=Deleted'), /disabled>Restore task/);
    assert.equal((await post('/projects/1/tasks/1/restore')).status, 403);
    assert.equal((await post('/projects/1/tasks/3/delete')).status, 403);
    await stop();
    await start();
    assert.equal(count(await html('/projects/1?filter=Deleted')), 2);
    await post('/projects/1/restore');
    const restored = await post('/projects/1/tasks/2/restore', { filter: 'Deleted' });
    assert.equal(new URL(restored.headers.get('location'), base).searchParams.get('filter'), 'Deleted');
    assert.equal(count(await html(restored.headers.get('location'))), 1);
    await post('/projects/1/tasks/1/restore', { filter: 'Deleted' });
    const live = await html('/projects/1');
    assert.ok(live.indexOf('Complete First') < live.indexOf('Complete Second'));
    assert.ok(live.indexOf('Complete Second') < live.indexOf('Complete Third'));
    assert.match(await html('/'), /1\/3 completed/);
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/2/tasks/1/delete');
    await post('/projects/2/tasks/1/restore');
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.ok((await html('/projects/1')).indexOf('Complete First') < (await html('/projects/1')).indexOf('Complete Second'));
    await stop();
    const saved = new DatabaseSync(dbPath);
    assert.deepEqual({ ...saved.prepare('SELECT title, completed, priority, due_date, notes, project_id, position, deleted FROM tasks WHERE id = 1').get() }, {
      title: 'First', completed: 1, priority: 'High', due_date: '2026-01-02', notes: '  café\n<literal>  ', project_id: 1, position: 1, deleted: 0,
    });
    saved.close();
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
