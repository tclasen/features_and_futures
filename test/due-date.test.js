import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('due dates migrate, validate calendar days, and persist independently without changing other data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-dates-'));
  const path = join(directory, 'db.sqlite');
  const legacy = new DatabaseSync(path);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Legacy');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Original', 1);
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
  const selection = { filter: 'Completed', priorityFilter: 'High' };
  const filtered = '/projects/1?filter=Completed&priorityFilter=High';
  const save = value => post('/projects/1/tasks/1/due-date', { ...selection, dueDate: value });
  function snapshot() {
    const db = new DatabaseSync(path);
    try { return db.prepare('SELECT * FROM tasks ORDER BY id').all().map(row => ({ ...row })); }
    finally { db.close(); }
  }
  function dateInput(html, id, value, disabled = false) {
    const input = html.match(new RegExp(`<input id="task-due-date-${id}"[^>]*>`))?.[0];
    assert.ok(input);
    assert.ok(input.includes(`value="${value}"`));
    assert.equal(input.includes(' disabled'), disabled);
    assert.match(html, new RegExp(`<label for="task-due-date-${id}">Task due date</label>`));
    assert.match(html, new RegExp(`<button type="submit"${disabled ? ' disabled' : ''}>Save due date</button>`));
  }
  try {
    await start();
    dateInput(await get('/projects/1'), 1, '');
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks', { title: 'Second' });
    await post('/projects', { name: 'Other' });
    await post('/projects/2/tasks', { title: 'Independent' });
    dateInput(await get('/projects/1'), 2, '');
    const before = snapshot();
    for (const value of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '1900-02-28', '  2025-04-30  ']) {
      const response = await save(value);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), filtered);
      const html = await get(filtered);
      dateInput(html, 1, value.trim());
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.match(html, /id="priority-filter"[^>]*>[\s\S]*?<option selected>High<\/option>/);
      assert.equal((html.match(/data-testid="task-row"/g) || []).length, 1);
      assert.deepEqual(snapshot(), before.map((row, i) => i === 0 ? { ...row, due_date: value.trim() } : row));
      assert.match(await get('/'), /project-summary">1\/2 completed/);
    }
    const saved = snapshot();
    for (const value of ['0000-01-01', '10000-01-01', '1900-02-29', '2025-02-29', '2024-02-30', '2025-04-31', '2025-00-01', '2025-13-01', '2025-01-00', '2025-1-01', '25-01-01', '2025-01-01T00:00:00Z', 'not a date', '<script>']) {
      const response = await save(value);
      const html = await response.text();
      assert.match(html, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      dateInput(html, 1, '2025-04-30');
      assert.deepEqual(snapshot(), saved);
    }
    // Task ownership is checked even for direct HTTP submissions.
    assert.equal((await post('/projects/2/tasks/1/due-date', { dueDate: '2026-01-01' })).status, 404);
    assert.deepEqual(snapshot(), saved);
    await post('/projects/1/tasks/1/rename', { ...selection, title: 'Renamed' });
    dateInput(await get(filtered), 1, '2025-04-30');
    await stop();
    await start();
    dateInput(await get(filtered), 1, '2025-04-30');
    await post('/projects/1/archive');
    dateInput(await get(filtered), 1, '2025-04-30', true);
    assert.equal((await save('2026-01-01')).status, 403);
    assert.equal(snapshot()[0].due_date, '2025-04-30');
    await stop();
    await start();
    dateInput(await get(filtered), 1, '2025-04-30', true);
    await post('/projects/1/restore');
    dateInput(await get(filtered), 1, '2025-04-30');
    for (const value of ['', ' \t\n ']) {
      await save('2024-02-29');
      const response = await save(value);
      assert.equal(response.headers.get('location'), filtered);
      dateInput(await get(filtered), 1, '');
      assert.equal(snapshot()[0].due_date, '');
    }
    await stop();
    await start();
    dateInput(await get(filtered), 1, '');
    assert.deepEqual(snapshot().slice(1), before.slice(1));
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
