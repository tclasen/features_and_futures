import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('notes migrate, remain plain text, preserve filters and travel with tasks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-notes-'));
  const database = join(directory, 'data.sqlite');
  // A pre-notes database with existing task data and remembered positions.
  const legacy = new DatabaseSync(database);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal', due_date TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL);
    CREATE TABLE task_positions (task_id INTEGER NOT NULL, project_id INTEGER NOT NULL, position INTEGER NOT NULL, PRIMARY KEY(task_id, project_id), UNIQUE(project_id, position));
    INSERT INTO projects VALUES (1, 'Source', 0, 'Normal'), (2, 'Destination', 0, 'Low');
    INSERT INTO tasks VALUES (1, 1, 'First', 1, 'High', '2024-02-29', 1), (2, 1, 'Second', 0, 'Normal', '', 2);
    INSERT INTO task_positions VALUES (1, 1, 1), (2, 1, 2);
  `);
  const before = legacy.prepare('SELECT * FROM tasks ORDER BY id').all().map(task => ({ ...task }));
  legacy.close();
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: database },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    base = await new Promise((resolve, reject) => {
      let output = '';
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
      child.on('error', reject);
      child.on('exit', code => reject(new Error(`Server exited: ${code}`)));
    });
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = null;
  }
  const get = async path => (await fetch(base + path)).text();
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const stored = () => {
    const db = new DatabaseSync(database);
    try { return db.prepare('SELECT * FROM tasks ORDER BY id').all(); }
    finally { db.close(); }
  };
  const titles = body => [...body.matchAll(/aria-label="Complete ([^"]+)"/g)].map(match => match[1]);
  const notes = '\n  leading spaces\nUnicode: 雪 🦊\n</textarea><script>alert("x")</script> & literal\n  ';
  const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-02-29', search: 'first' };
  const location = '/projects/1?filter=Completed&priorityFilter=High&dueFrom=2024-02-29&dueThrough=2024-02-29&search=first';
  try {
    await start();
    assert.deepEqual(stored().map(({ notes, ...task }) => task), before);
    assert.deepEqual(stored().map(task => task.notes), ['', '']);
    assert.match(await get('/projects/1'), /name="notes" rows="4">\n<\/textarea>/);
    const saved = await post('/projects/1/tasks/1/notes', { ...state, notes });
    assert.equal(saved.status, 303);
    assert.equal(saved.headers.get('location'), location);
    assert.equal(stored()[0].notes, notes);
    assert.deepEqual(stored().map(({ notes, ...task }) => task), before);
    let body = await get(location);
    assert.deepEqual(titles(body), ['First']);
    assert.match(body, /name="notes" rows="4">\n\n  leading spaces/);
    assert.match(body, /&lt;\/textarea&gt;&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; literal/);
    assert.equal(body.includes('<script>'), false);
    assert.deepEqual(titles(await get('/projects/1?search=Unicode')), []);
    await post('/projects/1/tasks', { title: 'Third' });
    assert.equal(stored()[2].notes, '');
    await post('/projects/1/tasks/1/rename', { title: 'First renamed' });
    await post('/projects/1/rename', { name: 'Renamed source' });
    await post('/projects/1/tasks/1/move', { ...state, destination: '2' });
    assert.deepEqual(titles(await get(location)), []);
    assert.equal(stored()[0].notes, notes);
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(titles(await get('/projects/1')), ['First renamed', 'Second', 'Third']);
    assert.equal(stored()[0].priority, 'High');
    await post('/projects/1/archive');
    body = await get(location);
    assert.match(body, /name="notes" rows="4" disabled>/);
    assert.match(body, /disabled>Save notes<\/button>/);
    assert.equal((await post('/projects/1/tasks/1/notes', { notes: 'blocked' })).status, 403);
    assert.equal((await post('/projects/2/tasks/1/notes', { notes: 'wrong owner' })).status, 404);
    await stop();
    await start();
    assert.equal(stored()[0].notes, notes);
    await post('/projects/1/restore');
    body = await get(location);
    assert.match(body, /name="notes" rows="4">/);
    assert.match(body, /<button type="submit">Save notes<\/button>/);
    await post('/projects/1/tasks/2/notes', { notes: '  \n\t  ' });
    assert.equal(stored()[1].notes, '  \n\t  ');
    await post('/projects/1/tasks/1/notes', { ...state, notes: '' });
    assert.equal(stored()[0].notes, '');
    assert.deepEqual(titles(await get(location)), ['First renamed']);
    await stop();
    await start();
    assert.equal(stored()[0].notes, '');
    assert.equal(stored()[1].notes, '  \n\t  ');
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
