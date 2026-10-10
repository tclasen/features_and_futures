import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('notes upgrade safely and preserve text, filters, ownership, return order and archive restrictions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-notes-'));
  const dbPath = join(directory, 'db.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'Normal', due_date TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL);
    INSERT INTO projects (name, default_priority) VALUES ('First', 'Low'), ('Second', 'High');
    INSERT INTO tasks (project_id, title, completed, priority, due_date, position) VALUES
      (1, 'Alpha', 1, 'High', '2026-10-10', 1), (1, 'Beta', 0, 'Low', '', 2);
  `);
  const before = legacy.prepare('SELECT * FROM tasks ORDER BY id').all();
  legacy.close();
  let child, base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const port = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Startup timed out')), 5000);
      child.once('error', reject);
      child.once('exit', (code) => reject(new Error(`Exited ${code}`)));
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    base = `http://127.0.0.1:${port}`;
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  function savedTasks() {
    const connection = new DatabaseSync(dbPath);
    try { return connection.prepare('SELECT * FROM tasks ORDER BY id').all().map((task) => ({ ...task })); }
    finally { connection.close(); }
  }
  const get = (path) => fetch(base + path).then((response) => response.text());
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', redirect: 'manual', body: new URLSearchParams(values),
  });
  const titles = (html) => [...html.matchAll(/<span>(.*?)<\/span>/g)].map((match) => match[1]);
  const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2026-10-01', dueThrough: '2026-10-31', search: 'alpha' };
  async function save(notes, expectedStatus = 303) {
    const response = await post('/projects/1/tasks/1/notes', { ...state, notes });
    assert.equal(response.status, expectedStatus);
    if (expectedStatus !== 303) return response.text();
    const location = response.headers.get('location');
    for (const [key, value] of Object.entries(state)) {
      assert.equal(new URL(location, base).searchParams.get(key), value);
    }
    const html = await get(location);
    assert.deepEqual(titles(html), ['Alpha']);
    const form = html.match(/<form action="\/projects\/1\/tasks\/1\/notes"[\s\S]*?<\/form>/)[0];
    for (const [key, value] of Object.entries(state)) {
      assert.ok(form.includes(`name="${key}" value="${value}"`));
    }
    return html;
  }
  try {
    await start();
    assert.deepEqual(savedTasks(), before.map((task) => ({ ...task, notes: '' })));
    assert.match(await get('/projects/1'), /<textarea id="task-notes-1" name="notes" rows="4">\n<\/textarea>/);
    await post('/projects/1/tasks', { title: 'Gamma' });
    assert.equal(savedTasks()[2].notes, '');
    const original = savedTasks();
    const notes = '\n  Unicode: 雪 😀 café\r\n<script>alert("literal")</script> & </textarea>\n trailing  ';
    const html = await save(notes);
    assert.deepEqual(savedTasks(), original.map((task) => task.id === 1 ? { ...task, notes } : task));
    assert.ok(html.includes('&lt;script&gt;alert(&quot;literal&quot;)&lt;/script&gt; &amp; &lt;/textarea&gt;'));
    // The extra initial newline is consumed by HTML parsing, preserving a note's own leading newline.
    assert.ok(html.includes('rows="4">\n\n  Unicode: 雪 😀 café'));
    assert.deepEqual(titles(await get('/projects/1?search=literal')), []);
    assert.match(await get('/'), /1\/3 completed/);
    await post('/projects/1/tasks/1/rename', { title: 'Alpha renamed' });
    assert.equal(savedTasks()[0].notes, notes);
    await post('/projects/1/tasks/1/move', { destinationProject: '2' });
    assert.deepEqual(titles(await get('/projects/1')), ['Beta', 'Gamma']);
    assert.deepEqual(titles(await get('/projects/2')), ['Alpha renamed']);
    assert.equal(savedTasks()[0].notes, notes);
    assert.equal((await post('/projects/1/tasks/1/notes', { notes: 'wrong owner' })).status, 404);
    await post('/projects/2/tasks/1/notes', { notes: 'updated while away\n  ' });
    await post('/projects/2/tasks/1/move', { destinationProject: '1' });
    assert.deepEqual(titles(await get('/projects/1')), ['Alpha renamed', 'Beta', 'Gamma']);
    assert.equal(savedTasks()[0].notes, 'updated while away\n  ');
    const persisted = savedTasks();
    await stop();
    await start();
    assert.deepEqual(savedTasks(), persisted);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.match(archived, /<textarea id="task-notes-1"[^>]* disabled>\nupdated while away\n  <\/textarea>/);
    for (const form of archived.matchAll(/<form[^>]+\/notes"[\s\S]*?<\/form>/g)) {
      assert.match(form[0], /<textarea[^>]* disabled>/);
      assert.match(form[0], /<button type="submit" disabled>Save notes<\/button>/);
    }
    assert.equal((await post('/projects/1/tasks/1/notes', { notes: 'blocked' })).status, 403);
    assert.deepEqual(savedTasks(), persisted);
    await post('/projects/1/restore');
    assert.match(await get('/projects/1'), /<textarea id="task-notes-1" name="notes" rows="4">/);
    await post('/projects/1/tasks/1/notes', { notes: ' \t\n ' });
    assert.equal(savedTasks()[0].notes, ' \t\n ');
    await post('/projects/1/tasks/1/notes', { notes: '' });
    assert.equal(savedTasks()[0].notes, '');
    await stop();
    await start();
    assert.equal(savedTasks()[0].notes, '');
    assert.deepEqual(await fetch(base + '/health').then((response) => response.json()), { status: 'ok' });
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
