import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('project defaults migrate, stay independent, and persist without changing existing tasks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-default-'));
  const path = join(directory, 'db.sqlite');
  const legacy = new DatabaseSync(path);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
    INSERT INTO projects (name) VALUES ('Legacy');
    INSERT INTO tasks (project_id, title, completed, priority) VALUES (1, 'Original', 1, 'Low');
  `);
  legacy.close();
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: path }, stdio: 'ignore'
    });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + '/health')).ok) return; } catch {}
      if (child.exitCode !== null) throw new Error('Server exited');
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Server did not start');
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
  }
  const get = async url => (await fetch(base + url)).text();
  const post = (url, values = {}) => fetch(base + url, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
  });
  function defaultSelect(html, value, disabled = false) {
    const select = html.match(/<select id="default-task-priority"[^>]*>[\s\S]*?<\/select>/)?.[0];
    assert.ok(select);
    assert.equal(select.includes(' disabled'), disabled);
    assert.match(select, new RegExp(`<option${value === 'Low' ? ' selected' : ''}>Low</option><option${value === 'Normal' ? ' selected' : ''}>Normal</option><option${value === 'High' ? ' selected' : ''}>High</option>`));
  }
  function snapshot() {
    const db = new DatabaseSync(path);
    try { return db.prepare('SELECT * FROM tasks ORDER BY id').all().map(row => ({ ...row })); }
    finally { db.close(); }
  }
  try {
    await start();
    defaultSelect(await get('/projects/1'), 'Normal');
    await post('/projects', { name: 'Other' });
    defaultSelect(await get('/projects/2'), 'Normal');
    await post('/projects/1/tasks', { title: 'Normal inherited' });
    const before = snapshot();
    const filtered = '/projects/1?filter=Completed&priorityFilter=Low';
    const selection = { filter: 'Completed', priorityFilter: 'Low' };
    const response = await post('/projects/1/default-priority', { ...selection, priority: 'High' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), filtered);
    const html = await get(filtered);
    defaultSelect(html, 'High');
    assert.match(html, /<option selected>Completed<\/option>/);
    assert.match(html, /id="priority-filter"[^>]*>\s*<option>All<\/option><option selected>Low<\/option>/);
    assert.equal((html.match(/data-testid="task-row"/g) || []).length, 1);
    assert.deepEqual(snapshot(), before);
    assert.match(await get('/'), /project-summary">1\/2 completed/);
    defaultSelect(await get('/projects/2'), 'Normal');
    assert.equal((await post('/projects/1/default-priority', { priority: 'Invalid' })).status, 400);
    await post('/projects/1/tasks', { title: 'High inherited' });
    await post('/projects/2/tasks', { title: 'Independent' });
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Low inherited' });
    assert.deepEqual(snapshot().map(task => task.priority), ['Low', 'Normal', 'High', 'Normal', 'Low']);
    const saved = snapshot();
    await post('/projects/1/rename', { name: 'Renamed' });
    await post('/projects/1/archive');
    defaultSelect(await get(filtered), 'Low', true);
    assert.equal((await post('/projects/1/default-priority', { ...selection, priority: 'High' })).status, 403);
    assert.deepEqual(snapshot(), saved);
    await stop();
    await start();
    defaultSelect(await get(filtered), 'Low', true);
    assert.deepEqual(snapshot(), saved);
    await post('/projects/1/restore');
    defaultSelect(await get('/projects/1'), 'Low');
    await post('/projects/1/tasks', { title: 'After restore' });
    assert.equal(snapshot().at(-1).priority, 'Low');
    assert.match(await get('/'), /project-summary">1\/5 completed/);
    await stop();
    await start();
    defaultSelect(await get('/projects/1'), 'Low');
    assert.equal(snapshot().at(-1).priority, 'Low');
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
