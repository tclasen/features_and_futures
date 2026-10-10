import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'inherit']
  });
  const [output] = await once(child.stdout, 'data');
  const port = String(output).match(/listening on port (\d+)/)[1];
  return {
    base: `http://127.0.0.1:${port}`,
    async stop() {
      const exit = once(child, 'exit');
      child.kill('SIGTERM');
      await exit;
    }
  };
}

test('due dates validate calendar days, migrate, persist and respect task ownership and archival', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-dates-'));
  const dbPath = join(directory, 'db.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Existing');
    INSERT INTO tasks (project_id, title) VALUES (1, 'Existing task');`);
  legacy.close();
  let server;
  try {
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(server.base + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual'
    });
    const get = path => fetch(server.base + path).then(response => response.text());
    const save = value => post('/projects/1/tasks/1/due-date', { due_date: value });
    const dateInput = value => new RegExp(`id="task-due-date-1"[^>]*value="${value}"`);
    assert.match(await get('/projects/1'), dateInput(''));
    await post('/projects', { name: 'Other' });
    await post('/projects/1/tasks', { title: 'New task' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/completion', { completed: 'true' });
    for (const value of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '1900-02-28', '  2026-04-30  ']) {
      assert.equal((await save(value)).status, 204, value);
      assert.match(await get('/projects/1'), dateInput(value.trim()));
    }
    const saved = await get('/projects/1');
    const summary = await get('/');
    for (const value of ['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2023-02-29', '2024-04-31', '2024-00-01', '2024-13-01', '2024-01-00', '2024-01-32', '2024-1-01', '24-01-01', '2024-01-01T00:00:00Z', 'nonsense']) {
      const response = await save(value);
      assert.equal(response.status, 422, value);
      assert.match(await response.text(), /role="alert"[^>]*>Due date must be a valid YYYY-MM-DD date/);
      assert.equal(await get('/projects/1'), saved);
      assert.equal(await get('/'), summary);
    }
    assert.equal((await post('/projects/2/tasks/1/due-date', { due_date: '2025-01-01' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/due-date', { due_date: '' })).status, 404);
    await post('/projects/1/tasks/1/rename', { title: 'Renamed' });
    let detail = await get('/projects/1');
    assert.match(detail, dateInput('2026-04-30'));
    assert.match(detail, /Complete Renamed/);
    assert.match(detail, /tasks\/1\/completion" checked/);
    assert.match(detail, /id="task-priority-1"[^>]*data-saved-priority="High"/);
    assert.match(detail, /id="task-due-date-2"[^>]*value=""/);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), detail);
    await post('/projects/1/archive');
    detail = await get('/projects/1');
    assert.match(detail, /id="task-due-date-1"[^>]*value="2026-04-30"[^>]* disabled/);
    assert.match(detail, /<button type="submit" disabled>Save due date/);
    assert.equal((await save('')).status, 403);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), detail);
    await post('/projects/1/restore');
    assert.doesNotMatch(await get('/projects/1'), / disabled/);
    assert.equal((await save(' \t ')).status, 204);
    assert.match(await get('/projects/1'), dateInput(''));
    await server.stop();
    server = await start(dbPath);
    assert.match(await get('/projects/1'), dateInput(''));
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
