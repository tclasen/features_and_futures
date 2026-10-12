import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  const base = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', code => reject(new Error(`Server exited: ${code}`)));
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
  });
  return { base, async stop() { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; } };
}
const dateInput = (html, id) => html.match(new RegExp(`<input id="task-due-date-${id}"[^>]*>`))?.[0];
const dateIs = (html, id, value) => assert.match(dateInput(html, id), new RegExp(`value="${value}"`));

test('due dates migrate, validate Gregorian days, and persist independently without changing task data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-dates-'));
  const dbPath = join(directory, 'db.sqlite');
  let server;
  try {
    const db = new DatabaseSync(dbPath);
    db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (name) VALUES ('Existing');
      INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Old task', 1);`);
    db.close();
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(server.base + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual'
    });
    const get = async path => (await fetch(server.base + path)).text();
    dateIs(await get('/projects/1'), 1, '');
    await post('/projects/1/tasks', { title: 'Second' });
    await post('/projects', { name: 'Other' });
    await post('/projects/2/tasks', { title: 'Independent' });
    dateIs(await get('/projects/1'), 2, '');
    const summary = await get('/');
    const fields = { filter: 'Completed', priorityFilter: 'Normal' };
    const path = '/projects/1?filter=Completed&priorityFilter=Normal';
    const save = dueDate => post('/projects/1/tasks/1/due-date', { ...fields, dueDate });
    for (const value of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '1900-02-28', '2025-04-30']) {
      const response = await save(`  ${value}  `);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), path);
      dateIs(await get(path), 1, value);
    }
    const before = await get(path);
    for (const value of ['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2023-02-29', '2024-04-31', '2024-00-01', '2024-13-01', '2024-01-00', '2024-01-32', '2024-1-01', '24-01-01', '2024-01-1', '2024-01-01T00:00:00Z', 'invalid', '<script>']) {
      const response = await save(value);
      assert.equal(response.status, 422, value);
      const html = await response.text();
      assert.match(html, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      dateIs(html, 1, '2025-04-30');
      assert.equal(await get(path), before);
    }
    assert.equal(await get('/'), summary);
    dateIs(await get('/projects/1'), 2, '');
    dateIs(await get('/projects/2'), 3, '');
    assert.equal((await post('/projects/2/tasks/1/due-date', { dueDate: '2025-01-01' })).status, 404);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get(path), before);
    await post('/projects/1/tasks/1/rename', { ...fields, title: 'Renamed' });
    let detail = await get(path);
    dateIs(detail, 1, '2025-04-30');
    assert.match(detail, /aria-label="Complete Renamed" checked/);
    assert.match(detail, /<option selected>Completed<\/option>/);
    assert.match(detail, /<option selected>Normal<\/option>/);
    await post('/projects/1/archive');
    const archived = await get(path);
    assert.match(dateInput(archived, 1), /disabled/);
    assert.match(archived, /<button type="submit" disabled>Save due date<\/button>/);
    assert.equal((await save('2026-01-01')).status, 403);
    assert.equal(await get(path), archived);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get(path), archived);
    await post('/projects/1/restore');
    assert.equal(await get(path), detail);
    for (const value of ['', '   ']) {
      assert.equal((await save(value)).status, 303);
      dateIs(await get(path), 1, '');
      await save('2025-04-30');
    }
    await save(' ');
    detail = await get(path);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get(path), detail);
    assert.equal(await get('/'), summary);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
