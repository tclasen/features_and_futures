import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('due dates validate calendar days, preserve task data and persist through restart and restoration', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-dates-'));
  const dbPath = join(dir, 'db.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Existing');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Legacy task', 1);`);
  legacy.close();
  let child, base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'inherit']
    });
    base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Startup timeout')), 5000);
      child.stdout.on('data', chunk => {
        const match = /listening on port (\d+)/.exec(String(chunk));
        if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
      });
    });
  }
  async function stop() { const exited = once(child, 'exit'); child.kill(); await exited; child = null; }
  const html = async path => (await fetch(base + path)).text();
  const post = (path, values = {}) => fetch(base + path, { method: 'POST', body: new URLSearchParams(values), redirect: 'manual' });
  const dateInput = (text, id) => text.match(new RegExp(`<input id="task-due-date-${id}"[^>]*>`))[0];
  try {
    await start();
    assert.match(dateInput(await html('/projects/1'), 1), /type="text" value=""/);
    await post('/projects/1/tasks', { title: 'Second task' });
    await post('/projects', { name: 'Other project' });
    await post('/projects/2/tasks', { title: 'Other task' });
    assert.match(dateInput(await html('/projects/1'), 2), /value=""/);
    const filters = { filter: 'Completed', priorityFilter: 'High' };
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    for (const date of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '2025-04-30']) {
      const response = await post('/projects/1/tasks/1/due-date', { ...filters, due_date: ` ${date} ` });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/projects/1?filter=Completed&priorityFilter=High');
      assert.match(dateInput(await html(response.headers.get('location')), 1), new RegExp(`value="${date}"`));
    }
    for (const date of ['0000-01-01', '10000-01-01', '1900-02-29', '2023-02-29', '2024-04-31', '2024-00-01', '2024-13-01', '2024-01-00', '2024-01-32', '2024-1-01', '2024-01-1', '2024-01-01T00:00:00Z', 'nonsense']) {
      const response = await post('/projects/1/tasks/1/due-date', { ...filters, due_date: date });
      const text = await response.text();
      assert.match(text, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      assert.match(dateInput(text, 1), /value="2025-04-30"/);
      assert.match(text, /<option selected>Completed/);
      assert.match(text, /<option selected>High/);
      assert.doesNotMatch(text, /Complete Second task/);
    }
    assert.equal((await post('/projects/2/tasks/1/due-date', { due_date: '2024-01-01' })).status, 404);
    await post('/projects/1/tasks/2/due-date', { due_date: '2026-12-25' });
    await post('/projects/1/tasks/1/rename', { ...filters, title: 'Renamed task' });
    let text = await html('/projects/1');
    assert.match(text, /Complete Renamed task" checked/);
    assert.match(dateInput(text, 1), /value="2025-04-30"/);
    assert.match(dateInput(text, 2), /value="2026-12-25"/);
    assert.match(dateInput(await html('/projects/2'), 3), /value=""/);
    assert.match(await html('/'), /1\/2 completed/);
    for (const blank of ['', '   ']) {
      await post('/projects/1/tasks/1/due-date', { ...filters, due_date: blank });
      assert.match(dateInput(await html('/projects/1'), 1), /value=""/);
      await post('/projects/1/tasks/1/due-date', { ...filters, due_date: '2025-04-30' });
    }
    await post('/projects/1/archive');
    text = await html('/projects/1?filter=Completed&priorityFilter=High');
    assert.match(dateInput(text, 1), / disabled/);
    assert.match(text, /<button type="submit" disabled>Save due date/);
    assert.equal((await post('/projects/1/tasks/1/due-date', { due_date: '' })).status, 403);
    await stop();
    await start();
    assert.match(dateInput(await html('/projects/1'), 1), /value="2025-04-30" disabled/);
    await post('/projects/1/restore');
    text = await html('/projects/1');
    assert.doesNotMatch(text, / disabled/);
    assert.match(dateInput(text, 1), /value="2025-04-30"/);
    assert.match(dateInput(text, 2), /value="2026-12-25"/);
    assert.match(text, /Complete Renamed task" checked/);
    assert.match(text, /id="task-priority-1"[\s\S]*?<option selected>High/);
    assert.match(await html('/'), /1\/2 completed/);
  } finally {
    if (child) await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
