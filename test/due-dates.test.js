import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('due dates validate calendar days, migrate and persist without changing other task data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-dates-'));
  const dbPath = join(directory, 'db.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Existing');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing task', 1);`);
  db.close();
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: dbPath },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const port = await new Promise((resolve, reject) => {
      let output = '';
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) resolve(match[1]);
      });
      child.once('error', reject);
      child.once('exit', code => reject(new Error(`Server exited: ${code}`)));
    });
    base = `http://127.0.0.1:${port}`;
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }
  const get = async path => (await fetch(base + path)).text();
  const post = (path, data = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
  });
  const date = (html, id) => html.match(new RegExp(`id="task-due-date-${id}"[^>]*value="([^"]*)"`))[1];
  const state = { filter: 'Completed', priorityFilter: 'High' };
  const path = '/projects/1?filter=Completed&priorityFilter=High';
  const save = value => post('/projects/1/tasks/1/due-date', { ...state, dueDate: value });
  try {
    await start();
    assert.equal(date(await get('/projects/1'), 1), '');
    await post('/projects/1/tasks', { title: 'Second' });
    await post('/projects', { name: 'Other project' });
    await post('/projects/2/tasks', { title: 'Independent' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    const summary = await get('/');
    for (const valid of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '1900-02-28', '2025-04-30']) {
      const response = await save(`  ${valid}  `);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), path);
      const html = await get(path);
      assert.equal(date(html, 1), valid);
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.match(html, /id="priority-filter"[\s\S]*?<option selected>High<\/option>/);
    }
    for (const invalid of ['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2025-02-29', '2024-02-30', '2025-04-31', '2025-00-01', '2025-13-01', '2025-01-00', '2025-01-32', '2025-1-01', '2025-01-1', '2025-01-01T00:00:00Z', 'not a date']) {
      const response = await save(invalid);
      const html = await response.text();
      assert.match(html, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      assert.equal(date(html, 1), '2025-04-30');
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.match(html, /id="priority-filter"[\s\S]*?<option selected>High<\/option>/);
    }
    assert.equal(await get('/'), summary);
    assert.equal(date(await get('/projects/1'), 2), '');
    assert.equal(date(await get('/projects/2'), 3), '');
    assert.equal((await post('/projects/2/tasks/1/due-date', { dueDate: '2025-01-01' })).status, 404);
    await post('/projects/1/tasks/1/rename', { ...state, title: 'Renamed' });
    let html = await get(path);
    assert.equal(date(html, 1), '2025-04-30');
    assert.match(html, /aria-label="Complete Renamed" checked/);
    assert.equal(await get('/'), summary);
    await stop();
    await start();
    assert.equal(await get(path), html);
    await post('/projects/1/archive');
    html = await get(path);
    assert.match(html, /id="task-due-date-1"[^>]* disabled/);
    assert.match(html, /<button type="submit" disabled>Save due date/);
    assert.equal((await save('')).status, 403);
    await stop();
    await start();
    assert.equal(await get(path), html);
    await post('/projects/1/restore');
    html = await get(path);
    assert.doesNotMatch(html, /id="task-due-date-1"[^>]* disabled/);
    assert.equal(date(html, 1), '2025-04-30');
    for (const blank of ['', '   ']) {
      await save('2024-02-29');
      await save(blank);
      assert.equal(date(await get(path), 1), '');
    }
    await stop();
    await start();
    assert.equal(date(await get(path), 1), '');
    assert.equal(await get('/'), summary);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
