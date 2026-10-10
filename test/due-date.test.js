import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { DatabaseSync } from 'node:sqlite';

test('due dates validate calendar days, migrate and persist without changing other task data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-dates-'));
  const databasePath = join(directory, 'db.sqlite');
  const db = new DatabaseSync(databasePath);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Existing');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing task', 1);`);
  db.close();
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: databasePath }, stdio: 'ignore',
    });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + '/health')).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Server did not start');
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = undefined;
  }
  const post = (path, data = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
  });
  const get = async path => (await fetch(base + path)).text();
  const input = (html, id) => html.match(new RegExp(`<input id="task-due-date-${id}"[^>]*>`))[0];
  const date = (html, id) => input(html, id).match(/value="([^"]*)"/)[1];
  const filteredPath = '/projects/1?filter=Completed&priorityFilter=Normal';
  const save = value => post('/projects/1/tasks/1/due-date', {
    dueDate: value, filter: 'Completed', priorityFilter: 'Normal',
  });
  try {
    await start();
    await post('/projects/1/tasks', { title: 'New task' });
    await post('/projects', { name: 'Other project' });
    await post('/projects/2/tasks', { title: 'Other task' });
    assert.equal(date(await get('/projects/1'), 1), '');
    assert.equal(date(await get('/projects/1'), 2), '');
    const before = await get(filteredPath);
    const saved = await save('  2000-02-29  ');
    assert.equal(saved.status, 303);
    assert.equal(saved.headers.get('location'), filteredPath);
    const after = await get(filteredPath);
    assert.equal(after, before.replace(input(before, 1), input(before, 1).replace('value=""', 'value="2000-02-29"')));
    assert.equal(date(await get('/projects/1'), 2), '');
    assert.equal(date(await get('/projects/2'), 3), '');
    for (const invalid of ['0000-01-01', '10000-01-01', '1900-02-29', '2023-02-29', '2024-04-31', '2024-00-01', '2024-13-01', '2024-01-00', '2024-01-32', '2024-2-01', '24-01-01', '2024-01-01T00:00:00Z', 'not a date']) {
      const response = await save(invalid);
      assert.equal(response.status, 400, invalid);
      const html = await response.text();
      assert.match(html, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      assert.equal(date(html, 1), '2000-02-29');
      assert.equal(await get(filteredPath), after);
    }
    for (const valid of ['0001-01-01', '9999-12-31', '2024-02-29', '2400-02-29']) {
      assert.equal((await save(valid)).status, 303);
      assert.equal(date(await get(filteredPath), 1), valid);
    }
    await post('/projects/1/tasks/1/rename', { title: 'Renamed' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    assert.equal(date(await get('/projects/1'), 1), '2400-02-29');
    assert.match(await get('/'), /1\/2 completed/);
    const active = await get('/projects/1');
    await stop();
    await start();
    assert.equal(await get('/projects/1'), active);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    for (const id of [1, 2]) assert.match(input(archived, id), /disabled/);
    assert.equal((archived.match(/<button type="submit" disabled>Save due date/g) || []).length, 2);
    assert.equal((await save('')).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await stop();
    await start();
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), active);
    assert.equal((await save(' \t ')).status, 303);
    assert.equal(date(await get('/projects/1'), 1), '');
    assert.equal((await post('/projects/2/tasks/1/due-date', { dueDate: '2024-01-01' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/due-date', { dueDate: '2024-01-01' })).status, 404);
    await stop();
    await start();
    assert.equal(date(await get('/projects/1'), 1), '');
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
