import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { matchesSearch } from '../public/search.js';

test('notes migrate, preserve exact text and task data, travel and survive restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-notes-'));
  const dbPath = join(directory, 'db.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal',
      due_date TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (id, name) VALUES (1, 'Source'), (2, 'Destination');
    INSERT INTO tasks (id, project_id, title, completed, priority, due_date, position) VALUES
      (1, 1, 'Original', 1, 'High', '2024-02-29', 3),
      (2, 1, 'Other', 0, 'Low', '', 8);`);
  db.close();
  let child;
  const base = 'http://127.0.0.1:18083';
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
      env: { ...process.env, PORT: '18083', DB_PATH: dbPath }, stdio: 'ignore',
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
  const tasksURL = '/api/projects/1/tasks';
  const taskURL = `${tasksURL}/1`;
  try {
    await start();
    const initial = await request(tasksURL);
    assert.deepEqual(initial, [
      { id: 1, project_id: 1, title: 'Original', completed: true, priority: 'High', due_date: '2024-02-29', notes: '', deleted: false },
      { id: 2, project_id: 1, title: 'Other', completed: false, priority: 'Low', due_date: '', notes: '', deleted: false },
    ]);
    const created = await request(tasksURL, 'POST', { title: 'New' });
    assert.equal(created.notes, '');
    const notes = '  Leading spaces\n\nUnicode: café 雪 🙂\n<script>alert("literal")</script>\nTrailing spaces  \n';
    let saved = await request(taskURL, 'PATCH', { notes });
    assert.deepEqual(saved, { ...initial[0], notes });
    assert.equal(matchesSearch(saved.title, 'literal'), false);
    assert.equal((await request(tasksURL))[1].notes, '');
    for (const invalid of [null, 42, {}, false]) {
      assert.equal((await response(taskURL, 'PATCH', { notes: invalid })).status, 400);
    }
    assert.equal((await response('/api/projects/2/tasks/1', 'PATCH', { notes })).status, 404);
    await stop();
    await start();
    assert.deepEqual((await request(tasksURL))[0], saved);
    saved = await request(taskURL, 'PATCH', { title: 'Renamed' });
    assert.equal(saved.notes, notes);
    await request(taskURL, 'PATCH', { destination_project_id: 2 });
    assert.deepEqual(await request('/api/projects/2/tasks'), [{ ...saved, project_id: 2 }]);
    await request('/api/projects/2', 'PATCH', { archived: true });
    assert.equal((await response('/api/projects/2/tasks/1', 'PATCH', { notes: 'Forbidden' })).status, 409);
    assert.equal((await request('/api/projects/2/tasks'))[0].notes, notes);
    await stop();
    await start();
    await request('/api/projects/2', 'PATCH', { archived: false });
    await request('/api/projects/2/tasks/1', 'PATCH', { destination_project_id: 1 });
    assert.deepEqual(await request(tasksURL), [saved, initial[1], created]);
    const summary = await request('/api/projects/1');
    assert.equal(summary.total, 3);
    assert.equal(summary.completed, 1);
    assert.deepEqual(await request(taskURL, 'PATCH', { notes: '  \n\t  ' }), { ...saved, notes: '  \n\t  ' });
    assert.deepEqual(await request(taskURL, 'PATCH', { notes: '' }), { ...saved, notes: '' });
    await stop();
    await start();
    assert.deepEqual((await request(tasksURL))[0], { ...saved, notes: '' });
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
