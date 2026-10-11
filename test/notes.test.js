import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('notes migrate, preserve literal text, travel with tasks and respect archival and filters', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-notes-'));
  const dbPath = join(dir, 'db.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Source'), ('Destination');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Original', 1);`);
  legacy.close();
  let child, base;
  const start = async () => {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'inherit']
    });
    base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Startup timeout')), 5000);
      child.stdout.on('data', chunk => {
        const match = /listening on port (\d+)/.exec(String(chunk));
        if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
      });
    });
  };
  const stop = async () => { const exit = once(child, 'exit'); child.kill(); await exit; };
  const post = (path, data = {}) => fetch(base + path, { method: 'POST', body: new URLSearchParams(data), redirect: 'manual' });
  const html = async path => (await fetch(base + path)).text();
  const saved = () => {
    const db = new DatabaseSync(dbPath);
    try { return db.prepare('SELECT * FROM tasks WHERE id = 1').get(); } finally { db.close(); }
  };
  const notes = '\n  Literal <script>alert("x")</script> & </textarea>\nUnicode: 雪 🌻\n trailing  ';
  const encoded = '&#10;  Literal &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &lt;/textarea&gt;&#10;Unicode: 雪 🌻&#10; trailing  ';
  try {
    await start();
    assert.equal(saved().notes, '');
    await post('/projects/1/tasks', { title: 'Second' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { due_date: '2028-02-29' });
    const before = saved();
    const filters = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2028-01-01', dueThrough: '2028-12-31', search: 'original' };
    const response = await post('/projects/1/tasks/1/notes', { ...filters, notes });
    assert.equal(response.status, 303);
    const location = response.headers.get('location');
    for (const [key, value] of Object.entries(filters)) assert.equal(new URL(location, base).searchParams.get(key), value);
    assert.deepEqual({ ...saved() }, { ...before, notes });
    assert.ok((await html(location)).includes(encoded));
    assert.equal((await html('/projects/1?search=Unicode')).includes('data-testid="task-row"'), false);
    assert.equal((await post('/projects/2/tasks/1/notes', { notes: 'wrong owner' })).status, 404);
    await post('/projects/1/tasks/1/move', { destination: '2' });
    assert.equal(saved().notes, notes);
    await post('/projects/2/tasks/1/rename', { title: 'Renamed' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.equal(saved().position, before.position);
    assert.equal(saved().notes, notes);
    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    assert.ok(archived.includes(`name="notes" rows="4" disabled>\n${encoded}</textarea>`));
    assert.ok(archived.includes('disabled>Save notes</button>'));
    assert.equal((await post('/projects/1/tasks/1/notes', { notes: 'forbidden' })).status, 403);
    await stop();
    await start();
    assert.equal(saved().notes, notes);
    assert.ok((await html('/projects/1')).includes(encoded));
    await post('/projects/1/restore');
    assert.ok((await html('/projects/1')).includes(`name="notes" rows="4">\n${encoded}</textarea>`));
    await post('/projects/1/tasks/1/notes', { notes: '  \n\t  ' });
    assert.equal(saved().notes, '  \n\t  ');
    await post('/projects/1/tasks/1/notes', { notes: '' });
    assert.equal(saved().notes, '');
    assert.equal(saved().title, 'Renamed');
    assert.equal(saved().completed, 1);
    assert.equal(saved().priority, 'High');
    assert.equal(saved().due_date, '2028-02-29');
  } finally {
    if (child && child.exitCode === null) await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
