import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';

test('notes upgrade, preserve literal multiline text and task data, travel with moves, and respect archives', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-notes-'));
  const dbPath = join(directory, 'db.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0,
      default_priority TEXT NOT NULL DEFAULT 'Normal');
    INSERT INTO projects VALUES (1, 'Source', 0, 'Low'), (2, 'Destination', 0, 'Normal');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal',
      due_date TEXT, position INTEGER NOT NULL DEFAULT 0);
    INSERT INTO tasks VALUES (1, 1, 'Original', 1, 'High', '2025-03-02', 4),
      (2, 1, 'Other', 0, 'Normal', NULL, 5);
    CREATE TABLE task_positions (task_id INTEGER, project_id INTEGER, position INTEGER,
      PRIMARY KEY (task_id, project_id));
    INSERT INTO task_positions VALUES (1, 1, 4), (1, 2, 7), (2, 1, 5);
  `);
  const before = { ...legacy.prepare('SELECT * FROM tasks WHERE id = 1').get(), deleted: 0 };
  legacy.close();
  const listener = net.createServer().listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  let output = '';
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: dbPath },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (data) => { output += data; });
    child.stderr.on('data', (data) => { output += data; });
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        if ((await fetch(`${base}/health`)).status === 200) return;
      } catch { /* Wait for startup. */ }
      if (child.exitCode !== null) throw new Error(output);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`Server did not start: ${output}`);
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  function savedTask(id = 1) {
    const db = new DatabaseSync(dbPath);
    try { return { ...db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) }; }
    finally { db.close(); }
  }
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const page = async (path = '/projects/1') => (await fetch(base + path)).text();
  const escaped = (text) => text.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
  function textareaValue(html, id = 1) {
    // HTML drops the first LF immediately following a textarea start tag.
    const content = html.match(new RegExp(`<textarea id="task-notes-${id}"[^>]*>([\\s\\S]*?)</textarea>`))[1];
    return content.startsWith('\n') ? content.slice(1) : content;
  }
  try {
    await start();
    assert.deepEqual(savedTask(), { ...before, notes: '' });
    assert.equal(textareaValue(await page()), '');
    assert.equal(savedTask(2).notes, '');
    const filters = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2025-03-01',
      dueThrough: '2025-03-03', search: 'original' };
    const notes = '\n  Unicode: 雪 📝\n<script>alert("x")</script> & </textarea>\n\t  ';
    const response = await post('/projects/1/tasks/1/notes', { notes, ...filters });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1?filter=Completed&priorityFilter=High&dueFrom=2025-03-01&dueThrough=2025-03-03&search=original');
    assert.deepEqual(savedTask(), { ...before, notes });
    assert.equal(savedTask(2).notes, '');
    const filtered = await page(response.headers.get('location'));
    assert.equal(textareaValue(filtered), escaped(notes));
    assert.equal((filtered.match(/data-testid="task-row"/g) || []).length, 1);
    assert.doesNotMatch(filtered, /<script>/);
    assert.doesNotMatch(await page('/projects/1?search=Unicode'), /data-testid="task-row"/);
    assert.match(await page('/'), /project-summary">1\/2 completed/);
    await post('/projects/1/tasks', { title: 'New task' });
    assert.equal(savedTask(3).notes, '');
    await post('/projects/1/tasks/1/rename', { title: 'Renamed' });
    await post('/projects/1/rename', { name: 'Renamed source' });
    assert.equal(savedTask().notes, notes);
    await post('/projects/1/tasks/1/move', { destination: '2' });
    assert.equal(textareaValue(await page('/projects/2')), escaped(notes));
    await post('/projects/2/tasks/1/notes', { notes: 'Updated while away\n ' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(savedTask(), { ...before, title: 'Renamed', notes: 'Updated while away\n ' });
    const returned = await page();
    assert.ok(returned.indexOf('<span>Renamed</span>') < returned.indexOf('<span>Other</span>'));
    await stop();
    await start();
    assert.equal(textareaValue(await page()), 'Updated while away\n ');
    await post('/projects/1/archive');
    const archived = await page();
    assert.match(archived, /<textarea id="task-notes-1" name="notes" rows="4" disabled>/);
    assert.match(archived, /<button type="submit" disabled>Save notes/);
    assert.equal(textareaValue(archived), 'Updated while away\n ');
    assert.equal((await post('/projects/1/tasks/1/notes', { notes: 'Rejected' })).status, 403);
    assert.equal(savedTask().notes, 'Updated while away\n ');
    await post('/projects/1/restore');
    assert.match(await page(), /<textarea id="task-notes-1" name="notes" rows="4">/);
    assert.equal((await post('/projects/2/tasks/1/notes', { notes: 'Wrong owner' })).status, 404);
    for (const text of ['   \n\t', '']) {
      assert.equal((await post('/projects/1/tasks/1/notes', { notes: text })).status, 303);
      assert.equal(savedTask().notes, text);
      assert.equal(textareaValue(await page()), text);
    }
    await stop();
    await start();
    assert.deepEqual(savedTask(), { ...before, title: 'Renamed', notes: '' });
    assert.equal(textareaValue(await page()), '');
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
