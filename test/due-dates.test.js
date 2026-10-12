import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('due dates validate calendar days, migrate, persist and preserve task data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-dates-'));
  const dbPath = join(directory, 'db.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Existing');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Legacy', 1);
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
  const dateInput = (html, id, value, disabled = false) => {
    const input = html.match(new RegExp(`<input id="task-due-date-${id}"[^>]*>`))?.[0];
    assert.ok(input);
    assert.match(input, new RegExp(`value="${value}"`));
    assert.equal(/ disabled/.test(input), disabled);
  };
  try {
    await start();
    dateInput(await get('/projects/1'), 1, '');
    await post('/projects/1/tasks', { title: 'Second' });
    await post('/projects', { name: 'Other' });
    await post('/projects/2/tasks', { title: 'Independent' });
    dateInput(await get('/projects/1'), 2, '');
    const filters = { filter: 'Completed', priorityFilter: 'Normal' };
    const location = '/projects/1?filter=Completed&priorityFilter=Normal';
    const endpoint = '/projects/1/tasks/1/due-date';
    for (const date of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '1900-02-28', '2025-04-30']) {
      const response = await post(endpoint, { ...filters, dueDate: `  ${date}  ` });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), location);
      dateInput(await get(location), 1, date);
    }
    const saved = await get(location);
    for (const date of ['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2025-02-29', '2025-04-31', '2025-00-10', '2025-13-01', '2025-01-00', '2025-01-32', '2025-1-01', '25-01-01', '2025-01-01T00:00:00Z', 'not a date', '2025-01-01\nextra']) {
      const response = await post(endpoint, { ...filters, dueDate: date });
      assert.equal(response.status, 400, date);
      const html = await response.text();
      assert.match(html, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      dateInput(html, 1, '2025-04-30');
      assert.equal(await get(location), saved);
    }
    await post('/projects/1/tasks/2/due-date', { dueDate: '2030-12-31' });
    dateInput(await get('/projects/2'), 3, '');
    assert.equal((await post('/projects/2/tasks/1/due-date', { dueDate: '2020-01-01' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/due-date', { dueDate: '2020-01-01' })).status, 404);
    await post('/projects/1/tasks/1/rename', { ...filters, title: 'Renamed' });
    let html = await get(location);
    dateInput(html, 1, '2025-04-30');
    assert.match(html, /aria-label="Complete Renamed" checked/);
    assert.match(html, /<option selected>Completed<\/option>/);
    assert.match(html, /<option selected>Normal<\/option>/);
    assert.equal((html.match(/data-testid="task-row"/g) || []).length, 1);
    assert.match(await get('/'), /project-summary">1\/2 completed/);
    await post('/projects/1/archive');
    html = await get('/projects/1');
    dateInput(html, 1, '2025-04-30', true);
    dateInput(html, 2, '2030-12-31', true);
    assert.equal((html.match(/<button type="submit" disabled>Save due date<\/button>/g) || []).length, 2);
    assert.equal((await post(endpoint, { dueDate: '' })).status, 403);
    await stop();
    await start();
    assert.equal(await get('/projects/1'), html);
    await post('/projects/1/restore');
    dateInput(await get('/projects/1'), 1, '2025-04-30');
    for (const empty of ['   ', '']) {
      assert.equal((await post(endpoint, { ...filters, dueDate: empty })).status, 303);
      dateInput(await get(location), 1, '');
    }
    await stop();
    await start();
    html = await get('/projects/1');
    dateInput(html, 1, '');
    dateInput(html, 2, '2030-12-31');
    assert.deepEqual([...html.matchAll(/aria-label="Complete ([^"]+)"/g)].map((m) => m[1]), ['Renamed', 'Second']);
    assert.match(html, /aria-label="Complete Renamed" checked/);
    assert.match(await get('/'), /project-summary">1\/2 completed/);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
