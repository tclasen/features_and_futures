import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

async function launch(db) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: db }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const port = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(match[1]);
    });
    child.once('error', reject);
    child.once('exit', () => reject(new Error('Server exited')));
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; },
  };
}

const escape = (text) => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

test('notes migrate, remain plain text, persist and travel without changing task fields or filters', async () => {
  const directory = await mkdtemp(path.resolve('data/notes-test-'));
  const file = path.join(directory, 'db.sqlite');
  let server;
  try {
    const old = new DatabaseSync(file);
    old.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      INSERT INTO projects VALUES (1, 'Source'), (2, 'Destination');
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, title TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal', due_date TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL);
      INSERT INTO tasks VALUES (1, 1, 'First', 1, 'High', '2026-02-28', 1), (2, 1, 'Second', 0, 'Normal', '', 2);`);
    const original = old.prepare('SELECT * FROM tasks ORDER BY id').all();
    old.close();
    server = await launch(file);
    const post = (route, values = {}) => fetch(server.url + route, { method: 'POST', body: new URLSearchParams(values), redirect: 'manual' });
    const html = async (route) => (await fetch(server.url + route)).text();
    const rows = (markup) => [...markup.matchAll(/aria-label="Complete ([^"]+)"/g)].map((m) => m[1]);
    assert.match(await html('/projects/1'), /name="notes">\n<\/textarea>/);
    await post('/projects/1/tasks', { title: 'Third' });
    const notes = '\n  Unicode: 雪 📝\n<script>alert("x")</script> & </textarea>\n  ';
    const state = { filter: 'Completed', priorityFilter: 'High', rangeFrom: '2026-02-01', rangeThrough: '2026-02-28', taskSearch: 'first' };
    const response = await post('/projects/1/tasks/1/notes', { ...state, notes });
    assert.equal(response.status, 303);
    const location = response.headers.get('location');
    for (const [key, value] of Object.entries(state)) assert.equal(new URL(location, server.url).searchParams.get(key), value);
    let markup = await html(location);
    assert.deepEqual(rows(markup), ['First']);
    assert.ok(markup.includes('name="notes">\n' + escape(notes) + '</textarea>'));
    assert.deepEqual(rows(await html('/projects/1?taskSearch=Unicode')), []);
    assert.match(await html('/'), /1\/3 completed/);
    await post('/projects/1/tasks/1/move', { destination: '2' });
    assert.ok((await html('/projects/2')).includes(escape(notes)));
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(rows(await html('/projects/1')), ['First', 'Second', 'Third']);
    await post('/projects/1/tasks/1/rename', { title: 'Renamed' });
    assert.ok((await html('/projects/1')).includes(escape(notes)));
    await post('/projects/1/archive');
    markup = await html('/projects/1');
    assert.ok(markup.includes('name="notes" disabled>\n' + escape(notes)));
    assert.match(markup, /disabled>Save notes/);
    assert.equal((await post('/projects/1/tasks/1/notes', { notes: 'forbidden' })).status, 403);
    await post('/projects/1/restore');
    await server.stop();
    server = await launch(file);
    assert.ok((await html('/projects/1')).includes('name="notes">\n' + escape(notes)));
    const saved = new DatabaseSync(file);
    const task = saved.prepare('SELECT * FROM tasks WHERE id = 1').get();
    assert.equal(task.notes, notes);
    for (const key of ['project_id', 'completed', 'priority', 'due_date', 'position']) assert.equal(task[key], original[0][key]);
    assert.equal(saved.prepare('SELECT notes FROM tasks WHERE id = 2').get().notes, '');
    assert.equal(saved.prepare('SELECT notes FROM tasks WHERE id = 3').get().notes, '');
    saved.close();
    await post('/projects/1/tasks/1/notes', { notes: '   \n ' });
    assert.ok((await html('/projects/1')).includes('name="notes">\n   \n </textarea>'));
    await post('/projects/1/tasks/1/notes', { notes: '' });
    assert.match(await html('/projects/1'), /name="notes">\n<\/textarea>/);
    assert.equal((await post('/projects/2/tasks/1/notes', { notes: 'wrong owner' })).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
