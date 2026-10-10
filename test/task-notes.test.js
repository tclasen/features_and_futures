import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('notes upgrade safely, preserve exact text and task data through moves, archive and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-notes-'));
  const dbPath = join(directory, 'db.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal', due_date TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL);
    INSERT INTO projects VALUES (1, 'Source'), (2, 'Destination');
    INSERT INTO tasks VALUES (1, 1, 'Legacy', 1, 'High', '2024-02-29', 1), (2, 1, 'Second', 0, 'Low', '', 2);`);
  db.close();
  const port = 20000 + Math.floor(Math.random() * 20000);
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port), DB_PATH: dbPath }, stdio: ['ignore', 'ignore', 'inherit'] });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Server not healthy');
  }
  async function stop() { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; child = undefined; }
  async function api(path, method = 'GET', body) {
    const response = await fetch(`http://127.0.0.1:${port}/api${path}`, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  }
  const patch = (body, project = 1) => api(`/projects/${project}/tasks/1`, 'PATCH', body);
  try {
    await start();
    const original = (await api('/projects/1/tasks')).data;
    assert.deepEqual(original, [
      { id: 1, project_id: 1, title: 'Legacy', completed: true, priority: 'High', due_date: '2024-02-29', notes: '' },
      { id: 2, project_id: 1, title: 'Second', completed: false, priority: 'Low', due_date: '', notes: '' },
    ]);
    const created = (await api('/projects/1/tasks', 'POST', { title: 'New' })).data;
    assert.equal(created.notes, '');
    const summary = (await api('/projects/1')).data;
    const notes = '  leading\n\nUnicode: 日本語 🌻\n<script>alert("literal")</script> & <b>text</b>\n trailing  ';
    assert.deepEqual((await patch({ notes })).data, { ...original[0], notes });
    assert.equal((await api('/projects/1/tasks')).data[1].notes, '');
    assert.deepEqual((await api('/projects/1')).data, summary);
    assert.equal((await patch({ notes: null })).status, 400);
    assert.equal((await patch({ notes: 42 })).status, 400);
    await patch({ destination_project_id: 2 });
    assert.deepEqual((await api('/projects/2/tasks')).data, [{ ...original[0], project_id: 2, notes }]);
    await patch({ title: 'Current title' }, 2);
    await patch({ destination_project_id: 1 }, 2);
    const saved = [{ ...original[0], title: 'Current title', notes }, original[1], created];
    assert.deepEqual((await api('/projects/1/tasks')).data, saved);
    await api('/projects/1', 'PATCH', { archived: true });
    assert.equal((await patch({ notes: '' })).status, 409);
    await stop();
    await start();
    assert.deepEqual((await api('/projects/1/tasks')).data, saved);
    await api('/projects/1', 'PATCH', { archived: false });
    assert.equal((await patch({ notes: ' \t\n ' })).data.notes, ' \t\n ');
    assert.equal((await patch({ notes: '' })).data.notes, '');
    await stop();
    await start();
    assert.deepEqual((await api('/projects/1/tasks')).data, [{ ...saved[0], notes: '' }, saved[1], saved[2]]);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
