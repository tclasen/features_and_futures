import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('soft deletion migrates as live, preserves fields and positions, and persists across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-deletion-'));
  const dbPath = join(directory, 'db.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal',
      due_date TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL);
    INSERT INTO projects (id, name) VALUES (1, 'Source'), (2, 'Destination');
    INSERT INTO tasks (id, project_id, title, completed, priority, due_date, notes, position) VALUES
      (1, 1, 'First', 1, 'High', '2024-02-29', '  Notes 雪
<literal>  ', 10),
      (2, 1, 'Second', 0, 'Low', '', '', 20),
      (3, 2, 'Destination task', 0, 'Normal', '', '', 1);`);
  db.close();
  let child;
  const base = 'http://127.0.0.1:18085';
  async function response(path, method = 'GET', body) {
    return fetch(`${base}${path}`, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  async function request(path, method = 'GET', body) {
    const result = await response(path, method, body);
    assert.ok(result.ok, await result.clone().text());
    return result.json();
  }
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '18085', DB_PATH: dbPath }, stdio: 'ignore',
    });
    for (let i = 0; i < 100; i++) {
      try { await request('/health'); return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Server did not start');
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = null;
  }
  const source = '/api/projects/1';
  const destination = '/api/projects/2';
  const tasks = `${source}/tasks`;
  const firstURL = `${tasks}/1`;
  const secondURL = `${tasks}/2`;
  async function summary(path, completed, total) {
    const project = await request(path);
    assert.deepEqual([project.completed, project.total], [completed, total]);
  }
  try {
    await start();
    const [first, second] = await request(tasks);
    assert.equal(first.deleted, false);
    assert.equal(second.deleted, false);
    assert.equal(first.notes, '  Notes 雪\n<literal>  ');
    assert.equal(first.priority, 'High');
    assert.equal(first.due_date, '2024-02-29');
    await summary(source, 1, 2);
    // Establish a second remembered project position before deleting.
    await request(firstURL, 'PATCH', { destination_project_id: 2 });
    await request(`${destination}/tasks/1`, 'PATCH', { destination_project_id: 1 });
    assert.deepEqual(await request(tasks), [first, second]);
    assert.deepEqual(await request(firstURL, 'PATCH', { deleted: true }), { ...first, deleted: true });
    await summary(source, 0, 1);
    assert.equal((await response(`${destination}/tasks/1`, 'PATCH', { deleted: false })).status, 404);
    assert.equal((await response(secondURL, 'PATCH', { deleted: 'yes' })).status, 400);
    for (const edit of [
      { title: 'No' }, { completed: false }, { priority: 'Low' },
      { due_date: '' }, { notes: 'No' }, { destination_project_id: 2 },
    ]) {
      assert.equal((await response(firstURL, 'PATCH', edit)).status, 409);
    }
    assert.deepEqual(await request(tasks), [{ ...first, deleted: true }, second]);
    await request(secondURL, 'PATCH', { deleted: true });
    await summary(source, 0, 0);
    await request(source, 'PATCH', { default_priority: 'Low' });
    await request(source, 'PATCH', { name: 'Renamed source' });
    const later = await request(tasks, 'POST', { title: 'Later' });
    assert.equal(later.deleted, false);
    assert.equal(later.priority, 'Low');
    await summary(source, 0, 1);
    await request(source, 'PATCH', { archived: true });
    for (const [url, deleted] of [[firstURL, false], [secondURL, false], [`${tasks}/${later.id}`, true]]) {
      assert.equal((await response(url, 'PATCH', { deleted })).status, 409);
    }
    await stop();
    await start();
    assert.deepEqual(await request(tasks), [{ ...first, deleted: true }, { ...second, deleted: true }, later]);
    await summary(source, 0, 1);
    await request(source, 'PATCH', { archived: false });
    // Restore in reverse order; original reserved positions must still win.
    assert.deepEqual(await request(secondURL, 'PATCH', { deleted: false }), second);
    await summary(source, 0, 2);
    assert.deepEqual(await request(firstURL, 'PATCH', { deleted: false }), first);
    await summary(source, 1, 3);
    assert.deepEqual(await request(tasks), [first, second, later]);
    // Deleted/restore cycles must not lose remembered destination positions.
    const destinationLater = await request(`${destination}/tasks`, 'POST', { title: 'Destination later' });
    const moved = await request(firstURL, 'PATCH', { destination_project_id: 2 });
    assert.deepEqual(moved, { ...first, project_id: 2 });
    assert.deepEqual((await request(`${destination}/tasks`)).map(task => task.id), [3, 1, destinationLater.id]);
    await request(`${destination}/tasks/1`, 'PATCH', { deleted: true });
    await summary(destination, 0, 2);
    await request(`${destination}/tasks/1`, 'PATCH', { deleted: false });
    await summary(destination, 1, 3);
    await request(`${destination}/tasks/1`, 'PATCH', { destination_project_id: 1 });
    await stop();
    await start();
    assert.deepEqual(await request(tasks), [first, second, later]);
    await summary(source, 1, 3);
    await summary(destination, 0, 2);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
