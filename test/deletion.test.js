import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('deletion preserves fields, filters, reserved order, migrations and restart state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-deletion-'));
  const dbPath = join(directory, 'db.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Source'), ('Destination');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Original', 1);`);
  legacy.close();
  let child, base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    base = await new Promise((resolve, reject) => {
      let output = '';
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = /listening on port (\d+)/.exec(output);
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
      child.on('error', reject);
      child.on('exit', code => reject(new Error(`Server exited ${code}`)));
    });
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = null;
  }
  const get = async path => (await fetch(base + path)).text();
  const post = (path, data = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
  });
  const saved = () => {
    const db = new DatabaseSync(dbPath);
    const rows = db.prepare('SELECT * FROM tasks ORDER BY id').all();
    db.close();
    return rows;
  };
  const titles = html => [...html.matchAll(/aria-label="Complete ([^"]+)"/g)].map(match => match[1]);
  try {
    await start();
    assert.equal(saved()[0].deleted, 0);
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2026-05-10' });
    await post('/projects/1/tasks/1/notes', { notes: '  Unicode 雪\n<literal>  ' });
    const before = saved()[0];
    const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2026-05-01', dueThrough: '2026-05-31', search: 'original' };
    const response = await post('/projects/1/tasks/1/delete', state);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1?' + new URLSearchParams(state));
    assert.deepEqual({ ...saved()[0] }, { ...before, deleted: 1 });
    for (const filter of ['All', 'Open', 'Completed']) {
      assert.deepEqual(titles(await get('/projects/1?filter=' + filter)), []);
    }
    assert.match(await get('/'), /data-testid="project-summary">0\/0 completed/);
    const deletedState = { ...state, filter: 'Deleted' };
    const deletedLocation = '/projects/1?' + new URLSearchParams(deletedState);
    let html = await get(deletedLocation);
    assert.deepEqual(titles(html), ['Original']);
    assert.match(html, /<option selected>Deleted<\/option>/);
    assert.match(html, />Restore task<\/button>/);
    assert.doesNotMatch(html, />Delete task<\/button>/);
    for (const id of ['new-task-title-1', 'task-priority-1', 'task-due-date-1', 'task-notes-1', 'destination-project-1']) {
      assert.match(html, new RegExp(`id="${id}"[^>]*disabled`));
    }
    for (const label of ['Rename task', 'Save due date', 'Save notes', 'Move task']) {
      assert.match(html, new RegExp(`<button type="submit" disabled>${label}`));
    }
    assert.match(html, /aria-label="Complete Original"[^>]*\sdisabled/);
    for (const query of ['priorityFilter=Low', 'search=missing', 'dueFrom=2026-05-11']) {
      assert.deepEqual(titles(await get('/projects/1?filter=Deleted&' + query)), []);
    }
    assert.deepEqual(titles(await get('/projects/2?filter=Deleted')), []);
    for (const [action, data] of Object.entries({
      completion: {}, rename: { title: 'Changed' }, priority: { priority: 'Low' },
      'due-date': { dueDate: '' }, notes: { notes: '' }, move: { destination: '2' }, delete: {},
    })) {
      assert.equal((await post('/projects/1/tasks/1/' + action, data)).status, 403);
    }
    assert.deepEqual({ ...saved()[0] }, { ...before, deleted: 1 });
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Later' });
    assert.equal(saved()[1].deleted, 0);
    await stop();
    await start();
    assert.deepEqual(titles(await get(deletedLocation)), ['Original']);
    await post('/projects/1/archive');
    html = await get(deletedLocation);
    assert.match(html, /<button type="submit" disabled>Restore task/);
    assert.match(await get('/projects/1'), /<button type="submit" disabled>Delete task/);
    assert.equal((await post('/projects/1/tasks/1/restore', deletedState)).status, 403);
    assert.equal((await post('/projects/1/tasks/2/delete')).status, 403);
    await post('/projects/1/restore');
    const restored = await post('/projects/1/tasks/1/restore', deletedState);
    assert.equal(restored.headers.get('location'), deletedLocation);
    assert.deepEqual(titles(await get(deletedLocation)), []);
    assert.deepEqual({ ...saved()[0] }, { ...before });
    assert.deepEqual(titles(await get('/projects/1')), ['Original', 'Later']);
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    // Reserved positions survive deletion and a subsequent round trip.
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/2/tasks/1/delete');
    await post('/projects/2/tasks/1/restore', { filter: 'Deleted' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual({ ...saved()[0] }, { ...before });
    await stop();
    await start();
    assert.deepEqual(titles(await get('/projects/1')), ['Original', 'Later']);
    assert.deepEqual({ ...saved()[0] }, { ...before });
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
