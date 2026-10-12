import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('due dates migrate, validate calendar days, remain isolated and persist', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-dates-'));
  const path = join(dir, 'db.sqlite');
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('First'), ('Second');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Old task', 1), (1, 'Other task', 0), (2, 'Separate task', 0);`);
  db.close();
  const base = 'http://127.0.0.1:18082';
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '18082', DB_PATH: path }, stdio: 'ignore' });
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error('Server exited');
      try { if ((await fetch(`${base}/health`)).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error('Server not ready');
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  const post = (url, values = {}) => fetch(base + url, { method: 'POST', body: new URLSearchParams(values), redirect: 'manual' });
  const page = async (id = 1, query = '') => (await fetch(`${base}/projects/${id}${query}`)).text();
  const dateInput = (id, value, disabled = false) => `id="task-due-date-${id}" name="dueDate" type="text" value="${value}"${disabled ? ' disabled' : ''}>`;
  const save = value => post('/projects/1/tasks/1/due-date', { dueDate: value, filter: 'Completed', priorityFilter: 'Normal' });
  try {
    await start();
    assert.ok((await page()).includes(dateInput(1, '')));
    await post('/projects/1/tasks', { title: 'New task' });
    assert.ok((await page()).includes(dateInput(4, '')));
    for (const value of ['0001-01-01', '0096-02-29', '2000-02-29', '2024-02-29', '9999-12-31']) {
      const response = await save(`  ${value}  `);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/projects/1?filter=Completed&priorityFilter=Normal');
      assert.ok((await page()).includes(dateInput(1, value)));
    }
    for (const value of ['0000-01-01', '10000-01-01', '1900-02-29', '2023-02-29', '2024-04-31', '2024-00-10', '2024-13-10', '2024-01-00', '2024-01-32', '2024-1-01', '24-01-01', '2024-01-01T00:00:00Z', 'garbage']) {
      const response = await save(value);
      assert.equal(response.status, 422, value);
      const html = await response.text();
      assert.match(html, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      assert.ok(html.includes(dateInput(1, '9999-12-31')));
      assert.match(html, /<option selected>Completed/);
      assert.match(html, /<option selected>Normal/);
    }
    assert.equal((await post('/projects/2/tasks/1/due-date', { dueDate: '2020-01-01' })).status, 404);
    assert.ok((await page()).includes(dateInput(2, '')));
    assert.ok((await page(2)).includes(dateInput(3, '')));
    await post('/projects/1/tasks/1/rename', { title: 'Renamed' });
    assert.ok((await page()).includes(dateInput(1, '9999-12-31')));
    assert.match(await page(), /aria-label="Complete Renamed" checked/);
    const summary = await (await fetch(base)).text();
    assert.match(summary, /1\/3 completed/);
    await stop();
    await start();
    assert.ok((await page()).includes(dateInput(1, '9999-12-31')));
    await post('/projects/1/archive');
    const archived = await page();
    assert.ok(archived.includes(dateInput(1, '9999-12-31', true)));
    assert.match(archived, /<button type="submit" disabled>Save due date/);
    assert.equal((await save('2020-01-01')).status, 403);
    await post('/projects/1/restore');
    assert.ok((await page()).includes(dateInput(1, '9999-12-31')));
    assert.equal((await save('   ')).status, 303);
    await stop();
    await start();
    assert.ok((await page()).includes(dateInput(1, '')));
    assert.match(await (await fetch(base)).text(), /1\/3 completed/);
  } finally {
    await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
