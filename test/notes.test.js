import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('notes upgrade, exact text persistence, filters, movement and archive restrictions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-notes-'));
  const path = join(directory, 'db.sqlite');
  const legacy = new DatabaseSync(path);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal',
    due_date TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Source'), ('Destination');
    INSERT INTO tasks (project_id, title, completed, priority, due_date, position)
      VALUES (1, 'Original', 1, 'High', '2024-02-29', 1), (1, 'Second', 0, 'Normal', '', 2);`);
  legacy.close();
  let child;
  let base;
  const start = async () => {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: path }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    base = await new Promise((resolve, reject) => {
      let output = '';
      child.on('error', reject);
      child.on('exit', () => reject(new Error(output)));
      child.stderr.on('data', (chunk) => { output += chunk; });
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
    });
  };
  const stop = async () => { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; child = null; };
  const post = (url, fields = {}) => fetch(base + url, { method: 'POST', body: new URLSearchParams(fields), redirect: 'manual' });
  const get = async (url) => (await fetch(base + url)).text();
  const saved = () => {
    const db = new DatabaseSync(path, { readOnly: true });
    try { return db.prepare('SELECT * FROM tasks ORDER BY position, id').all().map((row) => ({ ...row })); }
    finally { db.close(); }
  };
  try {
    await start();
    assert.deepEqual(saved().map((task) => task.notes), ['', '']);
    const before = saved()[0];
    const notes = '\n  Leading spaces\nUnicode: 雪 📝\r\n</textarea><script>alert("x")</script>&\n  trailing  ';
    const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-01', dueThrough: '2024-03-01', query: 'original' };
    const response = await post('/projects/1/tasks/1/notes', { ...state, notes });
    assert.equal(response.status, 303);
    const location = response.headers.get('location');
    const url = new URL(location, base);
    for (const [key, value] of Object.entries(state)) assert.equal(url.searchParams.get(key), value);
    assert.deepEqual(saved()[0], { ...before, notes });
    const html = await get(location);
    assert.equal((html.match(/data-testid="task-row"/g) || []).length, 1);
    assert.match(html, /<label for="task-notes-1">Task notes<\/label>/);
    assert.match(html, /<textarea[^>]*>\n\n  Leading spaces/);
    assert.match(html, /&lt;\/textarea&gt;&lt;script&gt;/);
    assert.match(html, /&#13;\n/);
    assert.doesNotMatch(html, /<script>/);
    assert.doesNotMatch(await get('/projects/1?query=Unicode'), /data-testid="task-row"/);
    await post('/projects/1/tasks', { title: 'New' });
    assert.equal(saved().find((task) => task.title === 'New').notes, '');
    await post('/projects/1/tasks/1/rename', { title: 'Renamed' });
    await post('/projects/1/tasks/1/move', { destination: '2' });
    assert.equal(saved().find((task) => task.id === 1).notes, notes);
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(saved().map((task) => task.title), ['Renamed', 'Second', 'New']);
    assert.equal((await post('/projects/2/tasks/1/notes', { notes: 'wrong owner' })).status, 404);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.match(archived, /<textarea id="task-notes-1"[^>]* disabled>/);
    assert.match(archived, /<button[^>]*disabled>Save notes<\/button>/);
    assert.equal((await post('/projects/1/tasks/1/notes', { notes: 'blocked' })).status, 403);
    await stop();
    await start();
    assert.equal(saved().find((task) => task.id === 1).notes, notes);
    await post('/projects/1/restore');
    assert.doesNotMatch(await get('/projects/1'), /<textarea[^>]*disabled/);
    await post('/projects/1/tasks/1/notes', { notes: '  \n\t ' });
    assert.equal(saved().find((task) => task.id === 1).notes, '  \n\t ');
    await post('/projects/1/tasks/1/notes', { notes: '' });
    assert.equal(saved().find((task) => task.id === 1).notes, '');
    await stop();
    await start();
    assert.equal(saved().find((task) => task.id === 1).notes, '');
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
