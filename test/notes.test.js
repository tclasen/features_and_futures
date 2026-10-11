import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('notes migrate, remain literal, follow moves, and preserve filters and archived restrictions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-notes-'));
  const dbPath = join(directory, 'db.sqlite');
  const old = new DatabaseSync(dbPath);
  old.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal', due_date TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL);
    INSERT INTO projects (id, name) VALUES (1, 'Source'), (2, 'Destination');
    INSERT INTO tasks VALUES (1, 1, 'Original', 1, 'High', '2026-01-02', 1);
  `);
  old.close();
  let child;
  let base;
  const start = async () => {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    base = await new Promise((resolve, reject) => {
      child.stdout.on('data', data => {
        const match = String(data).match(/port (\d+)/);
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
      child.once('error', reject);
      child.once('exit', code => reject(new Error(`Exited ${code}`)));
    });
  };
  const stop = async () => {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = undefined;
  };
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const html = path => fetch(base + path).then(r => r.text());
  const notes = '\n  Unicode café 📝\n<script>alert("x")</script> & </textarea>\n trailing  ';
  const encoded = '\n  Unicode café 📝\n&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &lt;/textarea&gt;\n trailing  ';
  const filters = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2026-01-01', dueThrough: '2026-01-03', search: 'original' };
  try {
    await start();
    assert.match(await html('/projects/1'), /name="notes">\n<\/textarea>/);
    await post('/projects/1/tasks', { title: 'Second' });
    const response = await post('/projects/1/tasks/1/notes', { ...filters, notes });
    assert.equal(response.status, 303);
    const location = response.headers.get('location');
    const params = new URL(location, base).searchParams;
    for (const [key, value] of Object.entries(filters)) assert.equal(params.get(key), value);
    const page = await html(location);
    assert.ok(page.includes('name="notes">\n' + encoded + '</textarea>'));
    assert.equal((page.match(/data-testid="task-row"/g) || []).length, 1);
    assert.equal((await html('/projects/1?search=Unicode')).includes('data-testid="task-row"'), false);
    assert.match(await html('/'), /1\/2 completed/);
    await post('/projects/1/tasks/1/move', { destination: '2' });
    assert.ok((await html('/projects/2')).includes(encoded));
    await post('/projects/2/tasks/1/rename', { title: 'Renamed' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    const returned = await html('/projects/1');
    assert.ok(returned.indexOf('Complete Renamed') < returned.indexOf('Complete Second'));
    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    assert.match(archived, /name="notes" disabled>/);
    assert.match(archived, /<button type="submit" disabled>Save notes<\/button>/);
    assert.equal((await post('/projects/1/tasks/1/notes', { notes: 'forbidden' })).status, 403);
    await stop();
    const saved = new DatabaseSync(dbPath);
    assert.deepEqual({ ...saved.prepare('SELECT title, completed, priority, due_date, project_id, position, notes FROM tasks WHERE id = 1').get() }, {
      title: 'Renamed', completed: 1, priority: 'High', due_date: '2026-01-02', project_id: 1, position: 1, notes,
    });
    assert.equal(saved.prepare('SELECT notes FROM tasks WHERE id = 2').get().notes, '');
    saved.close();
    await start();
    assert.ok((await html('/projects/1')).includes(encoded));
    await post('/projects/1/restore');
    assert.match(await html('/projects/1'), /name="notes">/);
    await post('/projects/1/tasks/1/notes', { notes: '' });
    assert.match(await html('/projects/1'), /name="notes">\n<\/textarea>/);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
