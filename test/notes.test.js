import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('notes migrate, persist verbatim, travel with tasks and respect archive and filters', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-notes-'));
  const dbPath = join(directory, 'db.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Source'), ('Destination');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Original', 1);`);
  legacy.close();
  let child, base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    base = await new Promise((resolve, reject) => {
      let output = '';
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = /listening on port (\d+)/.exec(output);
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
      child.on('error', reject);
      child.on('exit', code => reject(new Error(`Server exited ${code}`)));
    });
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = null;
  }
  const get = async path => (await fetch(base + path)).text();
  const post = (path, data = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
  });
  const saved = () => {
    const db = new DatabaseSync(dbPath);
    const rows = db.prepare('SELECT * FROM tasks ORDER BY id').all();
    db.close();
    return rows;
  };
  try {
    await start();
    assert.equal(saved()[0].notes, '');
    assert.equal(saved()[0].title, 'Original');
    assert.equal(saved()[0].completed, 1);
    await post('/projects/1/tasks', { title: 'Second' });
    assert.equal(saved()[1].notes, '');
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2026-05-10' });
    const before = saved()[0];
    const notes = '\n  leading spaces\nUnicode: 雪 😀 café\n<textarea><script>alert(1)</script>& literal\n trailing  \n';
    const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2026-05-01', dueThrough: '2026-05-31', search: 'original' };
    const location = '/projects/1?' + new URLSearchParams(state);
    const response = await post('/projects/1/tasks/1/notes', { ...state, notes });
    assert.equal(response.headers.get('location'), location);
    assert.deepEqual({ ...saved()[0] }, { ...before, notes });
    let html = await get(location);
    assert.match(html, /aria-label="Complete Original"/);
    assert.match(html, /<label for="task-notes-1">Task notes<\/label>/);
    assert.match(html, /<textarea id="task-notes-1" name="notes" rows="4">\n&#10;  leading spaces/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(await get('/projects/1?search=Unicode'), /data-testid="task-row"/);
    await post('/projects/1/tasks/1/move', { ...state, destination: '2' });
    assert.equal(saved()[0].notes, notes);
    assert.match(await get('/projects/2'), /task-notes-1/);
    await post('/projects/2/tasks/1/rename', { title: 'Revised' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.equal(saved()[0].notes, notes);
    assert.equal(saved()[0].position, before.position);
    html = await get('/projects/1');
    assert.ok(html.indexOf('task-notes-1') < html.indexOf('task-notes-2'));
    await stop();
    await start();
    assert.equal(saved()[0].notes, notes);
    assert.equal(await get('/projects/1'), html);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.match(archived, /<textarea id="task-notes-1"[^>]*disabled/);
    assert.match(archived, /<button type="submit" disabled>Save notes/);
    assert.equal((await post('/projects/1/tasks/1/notes', { notes: 'blocked' })).status, 403);
    assert.equal(saved()[0].notes, notes);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), html);
    await post('/projects/1/tasks/1/notes', { notes: '  \n  ' });
    assert.equal(saved()[0].notes, '  \n  ');
    await post('/projects/1/tasks/1/notes', { notes: '' });
    assert.equal(saved()[0].notes, '');
    assert.equal(saved()[1].notes, '');
    await stop();
    await start();
    assert.equal(saved()[0].notes, '');
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
