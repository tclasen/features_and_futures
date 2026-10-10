import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('due dates validate calendar days, migrate, and preserve independent task data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-dates-'));
  const dbPath = join(directory, 'db.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Legacy');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing', 1);`);
  db.close();
  let child, base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    base = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', code => reject(new Error(`Unexpected exit ${code}`)));
      child.stdout.on('data', chunk => {
        const match = /listening on port (\d+)/.exec(String(chunk));
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
    });
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = null;
  }
  const post = (path, data = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
  });
  const page = async path => (await fetch(base + path)).text();
  const input = (html, id) => html.match(new RegExp(`<input id="task-due-date-${id}"[^>]*>`))[0];
  const value = (html, id, date) => assert.match(input(html, id), new RegExp(`value="${date}"`));
  const query = '?filter=Completed&priorityFilter=High';
  const path = '/projects/1/tasks/1/due-date' + query;
  try {
    await start();
    value(await page('/projects/1'), 1, '');
    await post('/projects/1/tasks', { title: 'New task' });
    await post('/projects', { name: 'Other project' });
    await post('/projects/2/tasks', { title: 'Other task' });
    value(await page('/projects/1'), 2, '');
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    for (const date of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '1900-02-28']) {
      const response = await post(path, { due_date: `  ${date}  ` });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/projects/1' + query);
      const html = await page(response.headers.get('location'));
      value(html, 1, date);
      assert.match(html, /<option selected>Completed</);
      assert.match(html, /<option selected>High</);
      assert.match(html, /aria-label="Complete Existing" checked/);
      assert.doesNotMatch(html, /aria-label="Complete New task"/);
    }
    for (const date of ['0000-01-01', '10000-01-01', '1900-02-29', '2023-02-29', '2024-04-31', '2024-00-01', '2024-13-01', '2024-01-00', '2024-1-01', '24-01-01', '2024-01-01T00:00:00Z', '<bad>']) {
      const response = await post(path, { due_date: date });
      assert.equal(response.status, 400, date);
      const html = await response.text();
      assert.match(html, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      value(html, 1, '1900-02-28');
    }
    assert.equal((await post('/projects/2/tasks/1/due-date', { due_date: '2025-01-01' })).status, 404);
    value(await page('/projects/1'), 2, '');
    value(await page('/projects/2'), 3, '');
    await post('/projects/1/tasks/1/rename' + query, { title: 'Renamed' });
    value(await page('/projects/1' + query), 1, '1900-02-28');
    await post('/projects/1/archive');
    let html = await page('/projects/1' + query);
    assert.match(input(html, 1), /disabled/);
    assert.match(html, /<button type="submit" disabled>Save due date/);
    assert.equal((await post(path, { due_date: '' })).status, 403);
    await stop();
    await start();
    html = await page('/projects/1' + query);
    value(html, 1, '1900-02-28');
    assert.match(html, /aria-label="Complete Renamed" checked/);
    await post('/projects/1/restore');
    assert.doesNotMatch(input(await page('/projects/1'), 1), /disabled/);
    assert.match(await page('/'), /1\/2 completed/);
    await post(path, { due_date: '   ' });
    value(await page('/projects/1' + query), 1, '');
    await stop();
    await start();
    value(await page('/projects/1'), 1, '');
    const saved = new DatabaseSync(dbPath);
    assert.deepEqual(saved.prepare('SELECT id, project_id, title, completed, priority, due_date FROM tasks ORDER BY id').all().map(row => ({ ...row })), [
      { id: 1, project_id: 1, title: 'Renamed', completed: 1, priority: 'High', due_date: '' },
      { id: 2, project_id: 1, title: 'New task', completed: 0, priority: 'Normal', due_date: '' },
      { id: 3, project_id: 2, title: 'Other task', completed: 0, priority: 'Normal', due_date: '' },
    ]);
    saved.close();
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
