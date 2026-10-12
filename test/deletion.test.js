import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('deletion migrates live tasks, preserves fields and positions, filters, summaries and restart state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-deletion-'));
  const path = join(directory, 'db.sqlite');
  const legacy = new DatabaseSync(path);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Source'), ('Destination');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Original', 1);
  `);
  legacy.close();
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: path }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    base = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', () => reject(new Error('Server exited')));
      child.stdout.on('data', (data) => {
        const port = String(data).match(/port (\d+)/);
        if (port) resolve(`http://127.0.0.1:${port[1]}`);
      });
    });
  }
  async function stop() {
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGTERM');
    await exited;
    child = undefined;
  }
  const post = (route, data = {}) => fetch(base + route, {
    method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
  });
  const get = async (route) => (await fetch(base + route)).text();
  const titles = (html) => [...html.matchAll(/aria-label="Complete ([^"]+)"/g)].map((match) => match[1]);
  try {
    await start();
    assert.deepEqual(titles(await get('/projects/1')), ['Original']);
    assert.deepEqual(titles(await get('/projects/1?filter=Deleted')), []);
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
    const notes = '  café\n<literal>\n ';
    await post('/projects/1/tasks/1/notes', { notes });
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    const filters = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-01', dueThrough: '2024-03-01', search: 'original' };
    const deleted = await post('/projects/1/tasks/1/delete', filters);
    assert.equal(deleted.status, 303);
    const location = deleted.headers.get('location');
    const params = new URL(location, base).searchParams;
    for (const [key, value] of Object.entries(filters)) assert.equal(params.get(key), value);
    assert.deepEqual(titles(await get(location)), []);
    for (const filter of ['All', 'Open', 'Completed']) {
      assert.deepEqual(titles(await get(`/projects/1?filter=${filter}`)), []);
    }
    assert.match(await get('/'), /data-testid="project-summary">0\/0 completed/);
    const deletedRoute = '/projects/1?filter=Deleted&priorityFilter=High&dueFrom=2024-02-01&dueThrough=2024-03-01&search=original';
    let html = await get(deletedRoute);
    assert.deepEqual(titles(html), ['Original']);
    assert.match(html, /<fieldset disabled>/);
    assert.match(html, />Restore task<\/button>/);
    assert.doesNotMatch(html, />Delete task<\/button>/);
    assert.deepEqual(titles(await get('/projects/1?filter=Deleted&priorityFilter=Low')), []);
    assert.deepEqual(titles(await get('/projects/1?filter=Deleted&search=café')), []);
    assert.deepEqual(titles(await get('/projects/1?filter=Deleted&dueFrom=2025-01-01')), []);
    for (const [action, data] of [
      ['', { completed: '0' }], ['/rename', { title: 'Changed' }],
      ['/priority', { priority: 'Low' }], ['/due-date', { dueDate: '' }],
      ['/notes', { notes: '' }], ['/move', { destination: '2' }],
    ]) {
      assert.equal((await post('/projects/1/tasks/1' + action, data)).status, 403);
    }
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Newer' });
    await post('/projects/1/tasks/2/delete');
    await post('/projects/1/tasks', { title: 'Newest' });
    await post('/projects/1/archive');
    html = await get(deletedRoute);
    assert.deepEqual(titles(html), ['Original']);
    assert.match(html, /<button[^>]* disabled>Restore task<\/button>/);
    assert.match(await get('/projects/1'), /<button[^>]* disabled>Delete task<\/button>/);
    assert.equal((await post('/projects/1/tasks/1/restore')).status, 403);
    await stop();
    await start();
    assert.deepEqual(titles(await get('/projects/1?filter=Deleted')), ['Original', 'Newer']);
    await post('/projects/1/restore');
    await post('/projects/1/tasks/2/restore', { filter: 'Deleted' });
    const restored = await post('/projects/1/tasks/1/restore', { ...filters, filter: 'Deleted' });
    assert.equal(restored.status, 303);
    assert.deepEqual(titles(await get(restored.headers.get('location'))), []);
    assert.deepEqual(titles(await get('/projects/1')), ['Original', 'Newer', 'Newest']);
    assert.match(await get('/'), /data-testid="project-summary">1\/3 completed/);
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    await stop();
    const db = new DatabaseSync(path);
    const task = db.prepare('SELECT * FROM tasks WHERE id = 1').get();
    assert.equal(task.title, 'Original');
    assert.equal(task.project_id, 1);
    assert.equal(task.completed, 1);
    assert.equal(task.priority, 'High');
    assert.equal(task.due_date, '2024-02-29');
    assert.equal(task.notes, notes);
    assert.equal(task.deleted, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM task_positions WHERE task_id = 1').get().count, 2);
    db.close();
    await start();
    assert.deepEqual(titles(await get('/projects/1')), ['Original', 'Newer', 'Newest']);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
