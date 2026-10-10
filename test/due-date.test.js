import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('due dates validate calendar days, migrate, preserve task data, and persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-dates-'));
  const dbPath = join(directory, 'db.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Existing');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Original', 1);`);
  db.close();
  const port = 40000 + Math.floor(Math.random() * 10000);
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: dbPath }, stdio: 'ignore',
    });
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error('Server exited');
      try { if ((await fetch(base + '/health')).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Server did not start');
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  const get = async path => (await fetch(base + path)).text();
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const path = '/projects/1?filter=Completed&priorityFilter=High';
  const save = value => post('/projects/1/tasks/1/due-date', {
    dueDate: value, filter: 'Completed', priorityFilter: 'High',
  });
  function date(html, id, value, disabled = false) {
    assert.ok(html.includes(`<input id="task-due-date-${id}" type="text" name="dueDate" value="${value}"${disabled ? ' disabled' : ''}>`));
  }
  try {
    await start();
    date(await get('/projects/1'), 1, '');
    await post('/projects/1/tasks', { title: 'Second' });
    await post('/projects', { name: 'Other' });
    await post('/projects/2/tasks', { title: 'Independent' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    const before = await get(path);
    for (const valid of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '1900-02-28', ' 2025-04-30 ']) {
      const result = await save(valid);
      assert.equal(result.status, 303);
      assert.equal(result.headers.get('location'), path);
      const html = await get(path);
      date(html, 1, valid.trim());
      assert.equal(html.replace(`value="${valid.trim()}"`, 'value=""'), before);
    }
    for (const invalid of ['0000-01-01', '10000-01-01', '1900-02-29', '2025-02-29', '2024-04-31', '2024-00-01', '2024-13-01', '2024-01-00', '2024-1-01', '2024-01-1', '2024-01-01T00:00:00Z', '<script>']) {
      const result = await save(invalid);
      assert.equal(result.status, 400, invalid);
      const html = await result.text();
      assert.match(html, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      date(html, 1, '2025-04-30');
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.match(html, /<option selected>High<\/option>/);
    }
    date(await get('/projects/1'), 2, '');
    date(await get('/projects/2'), 3, '');
    assert.equal((await post('/projects/2/tasks/1/due-date', { dueDate: '2024-01-01' })).status, 404);
    await post('/projects/1/tasks/1/rename', { title: 'Renamed' });
    await post('/projects/1/rename', { name: 'Renamed project' });
    date(await get(path), 1, '2025-04-30');
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    await stop();
    await start();
    date(await get(path), 1, '2025-04-30');
    await post('/projects/1/archive');
    date(await get(path), 1, '2025-04-30', true);
    assert.match(await get(path), /<button type="submit" disabled>Save due date<\/button>/);
    assert.equal((await save('2024-01-01')).status, 403);
    await stop();
    await start();
    date(await get(path), 1, '2025-04-30', true);
    await post('/projects/1/restore');
    date(await get(path), 1, '2025-04-30');
    for (const empty of ['   ', '']) {
      assert.equal((await save(empty)).status, 303);
      date(await get(path), 1, '');
    }
    await stop();
    await start();
    date(await get(path), 1, '');
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
