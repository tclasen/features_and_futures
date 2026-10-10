import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:net';

test('due dates migrate, validate calendar days, preserve task data, and persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-dates-'));
  const dbPath = join(directory, 'workboard.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    INSERT INTO projects (name) VALUES ('First'), ('Second');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing', 1), (1, 'Other', 0);
  `);
  db.close();
  let child;
  let base;
  // Reserve an available port before launching the application.
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: dbPath }, stdio: ['ignore', 'ignore', 'pipe'],
    });
    base = `http://127.0.0.1:${port}`;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        if ((await fetch(base + '/health')).ok) return;
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Server did not become healthy');
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = undefined;
  }
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const html = async (path = '/projects/1') => (await fetch(base + path)).text();
  const field = (id, value, disabled = false) => new RegExp(`id="task-due-date-${id}"[^>]*value="${value}"${disabled ? ' disabled' : ''}>`);
  try {
    await start();
    assert.match(await html(), field(1, ''));
    assert.equal((await post('/projects/1/tasks', { title: 'New' })).status, 303);
    assert.match(await html(), field(3, ''));
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    const beforeList = await html('/');
    const filters = { filter: 'Completed', priorityFilter: 'High' };
    for (const date of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '1900-02-28', '  2025-04-30 \t']) {
      const result = await post('/projects/1/tasks/1/due-date', { ...filters, dueDate: date });
      assert.equal(result.status, 303);
      assert.equal(result.headers.get('location'), '/projects/1?filter=Completed&priorityFilter=High');
      assert.match(await html(), field(1, date.trim()));
      assert.match(await html(), field(2, ''));
      assert.equal(await html('/'), beforeList);
    }
    for (const date of ['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2023-02-29', '2025-04-31', '2025-00-01', '2025-13-01', '2025-01-00', '2025-01-32', '2025-1-01', '25-01-01', '2025-01-01T00:00:00Z', 'not a date']) {
      const result = await post('/projects/1/tasks/1/due-date', { ...filters, dueDate: date });
      assert.equal(result.status, 400, date);
      const body = await result.text();
      assert.match(body, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      assert.match(body, field(1, '2025-04-30'));
      assert.match(body, /<option selected>Completed<\/option>/);
      assert.match(body, /id="priority-filter"[\s\S]*<option selected>High<\/option>/);
    }
    assert.equal((await post('/projects/2/tasks/1/due-date', { dueDate: '2025-01-01' })).status, 404);
    await post('/projects/1/tasks/1/rename', { ...filters, title: 'Renamed' });
    assert.match(await html(), field(1, '2025-04-30'));
    assert.match(await html(), /aria-label="Complete Renamed" checked/);
    const saved = await html();
    await stop();
    await start();
    assert.equal(await html(), saved);
    await post('/projects/1/archive');
    assert.match(await html(), field(1, '2025-04-30', true));
    assert.equal(((await html()).match(/disabled>Save due date/g) || []).length, 3);
    assert.equal((await post('/projects/1/tasks/1/due-date', { dueDate: '' })).status, 403);
    await stop();
    await start();
    assert.match(await html(), field(1, '2025-04-30', true));
    await post('/projects/1/restore');
    assert.equal(await html(), saved);
    for (const dueDate of ['', ' \t ']) {
      await post('/projects/1/tasks/1/due-date', { ...filters, dueDate });
      assert.match(await html(), field(1, ''));
    }
    await stop();
    await start();
    assert.match(await html(), field(1, ''));
    assert.match(await html(), /aria-label="Complete Renamed" checked/);
    assert.match(await html('/'), /data-testid="project-summary">1\/3 completed/);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
