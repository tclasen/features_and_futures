import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('notes migrate, remain plain text, preserve filters and travel with tasks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-notes-'));
  const dbPath = join(dir, 'db.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('First'), ('Second');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Original', 1);`);
  db.close();
  const base = 'http://127.0.0.1:18088';
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '18088', DB_PATH: dbPath }, stdio: 'ignore'
    });
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error('Server exited');
      try { if ((await fetch(base + '/health')).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error('Server not ready');
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
  });
  const get = async path => (await fetch(base + path)).text();
  const notesIn = html => html.match(/<textarea[^>]*name="notes"[^>]*>\n([\s\S]*?)<\/textarea>/)?.[1];
  const notes = '\n  Unicode café 🐱\n<script>alert("x")</script> & </textarea>\n tail  ';
  const escaped = notes.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  try {
    await start();
    assert.equal(notesIn(await get('/projects/1')), '');
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2028-02-29' });
    const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2028-02-29', dueThrough: '2028-02-29', search: 'original' };
    const saved = await post('/projects/1/tasks/1/notes', { ...state, notes });
    assert.equal(saved.status, 303);
    const location = saved.headers.get('location');
    const params = new URL(location, base).searchParams;
    for (const [key, value] of Object.entries(state)) assert.equal(params.get(key), value);
    assert.equal(notesIn(await get(location)), escaped);
    assert.doesNotMatch(await get('/projects/1?search=Unicode'), /data-testid="task-row"/);
    await post('/projects/1/tasks', { title: 'Later' });
    await post('/projects/1/tasks/1/move', { destination: '2' });
    assert.equal(notesIn(await get('/projects/2')), escaped);
    await post('/projects/2/tasks/1/rename', { title: 'Renamed' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    let html = await get('/projects/1');
    assert.ok(html.indexOf('for="task-1"') < html.indexOf('for="task-2"'));
    assert.equal(notesIn(html), escaped);
    await post('/projects/1/archive');
    html = await get('/projects/1');
    assert.match(html, /<textarea[^>]*name="notes"[^>]* disabled>/);
    assert.match(html, /<button type="submit" disabled>Save notes<\/button>/);
    assert.equal((await post('/projects/1/tasks/1/notes', { notes: 'Overwrite' })).status, 403);
    assert.equal((await post('/projects/2/tasks/1/notes', { notes: 'Wrong owner' })).status, 404);
    await stop();
    await start();
    assert.equal(notesIn(await get('/projects/1')), escaped);
    await post('/projects/1/restore');
    const check = new DatabaseSync(dbPath);
    const task = check.prepare('SELECT * FROM tasks WHERE id = 1').get();
    assert.equal(task.notes, notes);
    assert.equal(task.title, 'Renamed');
    assert.equal(task.completed, 1);
    assert.equal(task.priority, 'High');
    assert.equal(task.due_date, '2028-02-29');
    assert.equal(task.project_id, 1);
    check.close();
    await post('/projects/1/tasks/1/notes', { notes: '' });
    assert.equal(notesIn(await get('/projects/1')), '');
    await post('/projects/1/tasks/1/notes', { notes: '  \n  ' });
    assert.equal(notesIn(await get('/projects/1')), '  \n  ');
  } finally {
    await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
