import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('notes upgrade, exact text, filters, moves, archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-notes-'));
  const dbPath = join(directory, 'db.sqlite');
  // A pre-notes database must keep its data and receive empty notes only.
  const seed = new DatabaseSync(dbPath);
  seed.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Source'), ('Destination');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'First', 1), (1, 'Second', 0);`);
  seed.close();
  let child, base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe'] });
    base = await new Promise((resolve, reject) => {
      let output = '';
      child.on('error', reject);
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
    });
  }
  async function stop() { const exit = once(child, 'exit'); child.kill('SIGTERM'); await exit; child = null; }
  const get = async path => (await fetch(base + path)).text();
  const post = (path, body = {}) => fetch(base + path, { method: 'POST', body: new URLSearchParams(body), redirect: 'manual' });
  const snapshot = () => {
    const db = new DatabaseSync(dbPath);
    try { return db.prepare('SELECT * FROM tasks ORDER BY id').all().map(task => ({ ...task })); } finally { db.close(); }
  };
  try {
    await start();
    assert.equal(snapshot()[0].notes, '');
    await post('/projects/1/tasks', { title: 'Third' });
    assert.equal(snapshot()[2].notes, '');
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
    const before = snapshot();
    const notes = '\n  Unicode 日本語 🙂\n<script>alert("x")</script> & </textarea>\n\t trailing  \n';
    const filters = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-01', dueThrough: '2024-03-01', search: 'first' };
    const response = await post('/projects/1/tasks/1/notes', { ...filters, notes });
    const location = '/projects/1?filter=Completed&priorityFilter=High&dueFrom=2024-02-01&dueThrough=2024-03-01&search=first';
    assert.equal(response.headers.get('location'), location);
    const after = snapshot();
    assert.deepEqual(after, before.map(task => task.id === 1 ? { ...task, notes } : task));
    let html = await get(location);
    assert.ok(html.includes('name="notes" rows="4">\n\n  Unicode 日本語 🙂'));
    assert.ok(html.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &lt;/textarea&gt;'));
    assert.equal((html.match(/data-testid="task-row"/g) || []).length, 1);
    assert.ok(!(await get('/projects/1?search=Unicode')).includes('data-testid="task-row"'));
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/2/tasks/1/rename', { title: 'Renamed' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    html = await get('/projects/1');
    assert.ok(html.indexOf('<span>Renamed</span>') < html.indexOf('<span>Second</span>'));
    assert.equal(snapshot()[0].notes, notes);
    await post('/projects/1/archive');
    html = await get('/projects/1');
    assert.ok(html.includes('name="notes" rows="4" disabled>'));
    assert.ok(html.includes('disabled>Save notes</button>'));
    assert.equal((await post('/projects/1/tasks/1/notes', { notes: 'blocked' })).status, 403);
    assert.equal((await post('/projects/2/tasks/1/notes', { notes: 'wrong owner' })).status, 404);
    await stop(); await start();
    assert.equal(snapshot()[0].notes, notes);
    await post('/projects/1/restore');
    assert.ok((await get('/projects/1')).includes('name="notes" rows="4">'));
    await post('/projects/1/tasks/1/notes', { notes: '  \n\t ' });
    assert.equal(snapshot()[0].notes, '  \n\t ');
    await post('/projects/1/tasks/1/notes', { notes: '' });
    assert.equal(snapshot()[0].notes, '');
    assert.equal(snapshot()[1].notes, '');
    assert.ok((await get('/')).includes('1/3 completed'));
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
