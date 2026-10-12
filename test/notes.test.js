import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('notes migrate, preserve plain text and filters, travel with tasks, and respect archival', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-notes-'));
  const path = join(directory, 'db.sqlite');
  const legacy = new DatabaseSync(path);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Source'), ('Destination');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Original', 1);
  `);
  legacy.close();
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: path }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    return new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', () => reject(new Error('Server exited')));
      child.stdout.on('data', (data) => {
        const port = String(data).match(/port (\d+)/);
        if (port) resolve(`http://127.0.0.1:${port[1]}`);
      });
    });
  }
  async function stop() {
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGTERM');
    await exited;
    child = undefined;
  }
  try {
    let base = await start();
    const post = (route, data = {}) => fetch(base + route, {
      method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
    });
    const get = async (route) => (await fetch(base + route)).text();
    const notesValue = (html) => html.match(/<textarea[^>]*>\n([\s\S]*?)<\/textarea>/)?.[1];
    assert.equal(notesValue(await get('/projects/1')), '');
    await post('/projects/1/tasks', { title: 'Second' });
    // Native browser form submissions serialize textarea line breaks as CRLF.
    const notes = '\r\n  Unicode: café 😀\r\n<script>alert("x")</script> & </textarea>\r\n  ';
    const filters = { filter: 'Completed', priorityFilter: 'Normal', dueFrom: '2024-01-01', dueThrough: '2024-12-31', search: 'original' };
    await post('/projects/1/tasks/1/due-date', { dueDate: '2024-06-01' });
    const saved = await post('/projects/1/tasks/1/notes', { notes, ...filters });
    assert.equal(saved.status, 303);
    const location = saved.headers.get('location');
    const params = new URL(location, base).searchParams;
    for (const [key, value] of Object.entries(filters)) assert.equal(params.get(key), value);
    let html = await get(location);
    assert.equal((html.match(/data-testid="task-row"/g) || []).length, 1);
    assert.equal(notesValue(html), '&#10;  Unicode: café 😀&#10;&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &lt;/textarea&gt;&#10;  ');
    assert.ok(!html.includes('<script>'));
    assert.equal(notesValue(await get('/projects/1?search=Unicode')), undefined);
    await post('/projects/1/tasks/1/rename', { title: 'Renamed' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/move', { destination: '2' });
    assert.equal(notesValue(await get('/projects/1')), '');
    assert.ok(notesValue(await get('/projects/2')).includes('café'));
    await post('/projects/2/tasks/1/move', { destination: '1' });
    await post('/projects/1/archive');
    html = await get('/projects/1');
    assert.match(html, /<textarea[^>]* disabled>/);
    assert.match(html, /<button[^>]* disabled>Save notes<\/button>/);
    assert.equal((await post('/projects/1/tasks/1/notes', { notes: 'blocked' })).status, 403);
    await stop();
    base = await start();
    assert.ok(notesValue(await get('/projects/1')).includes('café'));
    await post('/projects/1/restore');
    assert.doesNotMatch(await get('/projects/1'), /<textarea[^>]* disabled>/);
    assert.equal((await post('/projects/2/tasks/1/notes', { notes: 'wrong owner' })).status, 404);
    await stop();
    const db = new DatabaseSync(path);
    const tasks = db.prepare('SELECT id, project_id, title, completed, priority, due_date, notes FROM tasks ORDER BY position').all();
    assert.deepEqual({ ...tasks[0] }, { id: 1, project_id: 1, title: 'Renamed', completed: 1, priority: 'High', due_date: '2024-06-01', notes });
    assert.equal(tasks[1].notes, '');
    db.close();
    base = await start();
    await post('/projects/1/tasks/1/notes', { notes: '  \n\t ' });
    assert.equal(notesValue(await get('/projects/1')), '  &#10;\t ');
    await post('/projects/1/tasks/1/notes', { notes: '' });
    assert.equal(notesValue(await get('/projects/1')), '');
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
