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
    env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe']
  });
  const port = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(match[1]);
    });
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Server exited: ${code}`)));
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() { const exited = once(child, 'exit'); child.kill(); await exited; }
  };
}

test('notes migrate, remain plain text, preserve filters and data, and travel with tasks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-notes-'));
  const dbPath = join(directory, 'db.sqlite');
  let server;
  let db;
  try {
    db = new DatabaseSync(dbPath);
    db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (name) VALUES ('Original'), ('Destination');
      INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Alpha', 1), (1, 'Second', 0);`);
    db.close();
    server = await start(dbPath);
    db = new DatabaseSync(dbPath);
    const get = async path => (await fetch(server.url + path)).text();
    const post = async (path, values = {}) => fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(values)
    });
    const task = () => db.prepare('SELECT * FROM tasks WHERE id = 1').get();
    assert.equal(task().notes, '');
    assert.equal(task().title, 'Alpha');
    assert.equal(task().completed, 1);
    assert.match(await get('/projects/1'), /<textarea[^>]*name="notes"[^>]*><\/textarea>/);
    await post('/projects/1/tasks', { title: 'New' });
    assert.equal(db.prepare('SELECT notes FROM tasks WHERE id = 3').get().notes, '');
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
    const before = task();
    const notes = '\n  Leading and trailing  \n雪 😀\n<textarea><script>alert("x")</script>&\n  ';
    const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-01', dueThrough: '2024-03-01', search: 'alpha' };
    let response = await post('/projects/1/tasks/1/notes', { ...state, notes });
    let html = await response.text();
    assert.deepEqual({ ...task() }, { ...before, notes });
    assert.match(html, /&#10;  Leading and trailing  &#10;雪 😀/);
    assert.match(html, /&lt;textarea&gt;&lt;script&gt;alert\(&quot;x&quot;\)/);
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /<option selected>Completed/);
    assert.match(html, /<option selected>High/);
    assert.match(html, /id="due-from"[^>]*value="2024-02-01"/);
    assert.match(html, /id="due-through"[^>]*value="2024-03-01"/);
    assert.match(html, /id="task-search"[^>]*value="alpha"/);
    assert.equal((html.match(/data-testid="task-row"/g) || []).length, 1);
    assert.doesNotMatch(await get('/projects/1?search=Leading'), /data-testid="task-row"/);
    assert.match(await get('/'), /1\/3 completed/);
    await post('/projects/1/tasks/1/rename', { title: 'Renamed' });
    await post('/projects/1/tasks/1/move', { destination: '2' });
    assert.equal(task().notes, notes);
    await post('/projects/2/tasks/1/move', { destination: '1' });
    html = await get('/projects/1');
    assert.ok(html.indexOf('Complete Renamed') < html.indexOf('Complete Second'));
    await post('/projects/1/archive');
    html = await get('/projects/1');
    assert.match(html, /<textarea id="task-notes-1"[^>]* disabled>/);
    assert.match(html, /<button type="submit" disabled>Save notes/);
    response = await post('/projects/1/tasks/1/notes', { notes: 'forbidden' });
    assert.equal(response.status, 403);
    assert.equal(task().notes, notes);
    response = await post('/projects/2/tasks/1/notes', { notes: 'wrong owner' });
    assert.equal(response.status, 404);
    assert.equal(task().notes, notes);
    await server.stop();
    server = await start(dbPath);
    assert.equal(task().notes, notes);
    await post('/projects/1/restore');
    html = await get('/projects/1');
    assert.match(html, /<textarea id="task-notes-1" name="notes" rows="4">/);
    await post('/projects/1/tasks/1/notes', { notes: '   \n\t' });
    assert.equal(task().notes, '   \n\t');
    await post('/projects/1/tasks/1/notes', { notes: '' });
    assert.equal(task().notes, '');
    assert.equal(db.prepare('SELECT notes FROM tasks WHERE id = 2').get().notes, '');
  } finally {
    if (server) await server.stop();
    if (db?.isOpen) db.close();
    await rm(directory, { recursive: true, force: true });
  }
});
