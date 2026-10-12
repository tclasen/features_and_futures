import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('project defaults migrate, persist independently and affect only future tasks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-defaults-'));
  const dbPath = join(directory, 'db.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
    INSERT INTO projects (name) VALUES ('Existing');
    INSERT INTO tasks (project_id, title, completed, priority) VALUES (1, 'Legacy', 1, 'Low');
  `);
  legacy.close();
  let child;
  let base;
  const start = async () => {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    base = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => reject(new Error(`Server exited ${code}`)));
      child.stdout.on('data', (data) => {
        const match = String(data).match(/port (\d+)/);
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
    });
  };
  const stop = async () => {
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGTERM');
    await exited;
    child = null;
  };
  const get = async (path) => (await fetch(base + path)).text();
  const post = (path, data = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
  });
  const select = (html, id, value, disabled = false) => {
    const markup = html.match(new RegExp(`<select id="${id}"[^>]*>[\\s\\S]*?</select>`))?.[0];
    assert.ok(markup);
    assert.match(markup, new RegExp(`<option selected>${value}</option>`));
    assert.equal(/ disabled/.test(markup), disabled);
    return markup;
  };
  try {
    await start();
    const initial = await get('/projects/1');
    const control = select(initial, 'default-task-priority', 'Normal');
    assert.deepEqual([...control.matchAll(/<option(?: selected)?>(.*?)<\/option>/g)].map((m) => m[1]), ['Low', 'Normal', 'High']);
    select(initial, 'task-priority-1', 'Low');
    await post('/projects', { name: 'New' });
    select(await get('/projects/2'), 'default-task-priority', 'Normal');
    await post('/projects/1/tasks', { title: 'Normal child' });
    const filters = { filter: 'Completed', priorityFilter: 'Low' };
    const location = '/projects/1?filter=Completed&priorityFilter=Low';
    const before = await get(location);
    const response = await post('/projects/1/default-priority', { ...filters, priority: 'High' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), location);
    const after = await get(location);
    select(after, 'task-filter', 'Completed');
    select(after, 'priority-filter', 'Low');
    select(after, 'default-task-priority', 'High');
    assert.equal(after.split('<section aria-label="Tasks">')[1], before.split('<section aria-label="Tasks">')[1]);
    await post('/projects/1/tasks', { title: 'High child' });
    await post('/projects/2/tasks', { title: 'Independent' });
    let html = await get('/projects/1');
    select(html, 'task-priority-1', 'Low');
    select(html, 'task-priority-2', 'Normal');
    select(html, 'task-priority-3', 'High');
    select(await get('/projects/2'), 'task-priority-4', 'Normal');
    assert.match(await get('/'), /project-summary">1\/3 completed/);
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Low child' });
    await post('/projects/1/rename', { name: 'Renamed' });
    html = await get('/projects/1');
    select(html, 'default-task-priority', 'Low');
    select(html, 'task-priority-3', 'High');
    select(html, 'task-priority-5', 'Low');
    assert.equal((await post('/projects/1/default-priority', { priority: 'Invalid' })).status, 400);
    assert.equal((await post('/projects/999/default-priority', { priority: 'High' })).status, 404);
    await post('/projects/1/archive');
    const archived = await get(location);
    select(archived, 'default-task-priority', 'Low', true);
    select(archived, 'task-filter', 'Completed');
    select(archived, 'priority-filter', 'Low');
    assert.equal((await post('/projects/1/default-priority', { priority: 'High' })).status, 403);
    await stop();
    await start();
    assert.equal(await get(location), archived);
    await post('/projects/1/restore');
    select(await get('/projects/1'), 'default-task-priority', 'Low');
    await post('/projects/1/tasks', { title: 'After restart' });
    html = await get('/projects/1');
    select(html, 'task-priority-6', 'Low');
    select(html, 'task-priority-1', 'Low');
    select(html, 'task-priority-2', 'Normal');
    select(html, 'task-priority-3', 'High');
    assert.match(html, /<h1>Renamed<\/h1>/);
    assert.match(html, /aria-label="Complete Legacy" checked/);
    assert.deepEqual([...html.matchAll(/aria-label="Complete ([^"]+)"/g)].map((m) => m[1]),
      ['Legacy', 'Normal child', 'High child', 'Low child', 'After restart']);
    assert.match(await get('/'), /project-summary">1\/5 completed/);
    select(await get('/projects/2'), 'default-task-priority', 'Normal');
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
