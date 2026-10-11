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
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const port = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Server exited: ${code}`)));
    child.stdout.on('data', data => {
      const match = /listening on port (\d+)/.exec(data.toString());
      if (match) resolve(match[1]);
    });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() { const exit = once(child, 'exit'); child.kill(); await exit; },
  };
}

const escapedNotes = value => value.replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]).replace(/\n/g, '&#10;').replace(/\r/g, '&#13;');
const titles = html => [...html.matchAll(/data-testid="task-row">\s*<span>(.*?)<\/span>/g)].map(match => match[1]);

test('notes upgrade safely, preserve exact plain text and filters, and travel through moves and restarts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-notes-'));
  let server;
  try {
    const dbPath = join(dir, 'db.sqlite');
    // A pre-notes database with saved non-default fields and remembered positions.
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal');
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
        priority TEXT NOT NULL DEFAULT 'Normal', due_date TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL);
      INSERT INTO projects (name) VALUES ('Source'), ('Destination');
      INSERT INTO tasks (project_id, title, completed, priority, due_date, position)
        VALUES (1, 'First', 1, 'High', '2028-02-29', 1), (1, 'Second', 0, 'Low', '', 2);
    `);
    const original = legacy.prepare('SELECT * FROM tasks ORDER BY id').all();
    legacy.close();
    server = await start(dbPath);
    const get = path => fetch(server.url + path).then(response => response.text());
    const post = (path, data) => fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
    });
    let html = await get('/projects/1');
    assert.match(html, /<label for="task-notes-1">Task notes<\/label>/);
    assert.match(html, /<textarea id="task-notes-1" name="notes" rows="4"><\/textarea>/);
    await post('/projects/1/tasks', { title: 'Third' });
    assert.match(await get('/projects/1'), /<textarea id="task-notes-3" name="notes" rows="4"><\/textarea>/);
    const notes = '\n  Hello 世界 🙂\n\n</textarea><script>alert("literal")</script>&\t\n  ';
    const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2028-02-29', dueThrough: '2028-03-01', search: 'FIRST' };
    const saved = await post('/projects/1/tasks/1/notes', { ...state, notes });
    assert.equal(saved.status, 303);
    const location = saved.headers.get('location');
    const params = new URL(location, server.url).searchParams;
    for (const [key, value] of Object.entries(state)) assert.equal(params.get(key), value);
    html = await get(location);
    assert.deepEqual(titles(html), ['First']);
    assert.ok(html.includes(`>${escapedNotes(notes)}</textarea>`));
    assert.ok(!html.includes('<script>alert'));
    assert.match(await get('/'), /1\/3 completed/);
    assert.deepEqual(titles(await get('/projects/1?search=literal')), []); // Notes are not searched.
    assert.equal((await post('/projects/2/tasks/1/notes', { notes: 'Wrong owner' })).status, 404);
    await post('/projects/1/tasks/1/rename', { title: 'Renamed' });
    await post('/projects/1/tasks/1/move', { destination: '2' });
    assert.deepEqual(titles(await get('/projects/1')), ['Second', 'Third']);
    assert.ok((await get('/projects/2')).includes(escapedNotes(notes)));
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(titles(await get('/projects/1')), ['Renamed', 'Second', 'Third']);
    await post('/projects/1/archive', {});
    html = await get('/projects/1');
    assert.ok(html.includes(`<textarea id="task-notes-1" name="notes" rows="4" disabled>${escapedNotes(notes)}</textarea>`));
    assert.match(html, /<button type="submit" disabled>Save notes<\/button>/);
    assert.equal((await post('/projects/1/tasks/1/notes', { ...state, notes: 'Blocked' })).status, 403);
    await server.stop();
    server = undefined;
    const stored = new DatabaseSync(dbPath);
    const tasks = stored.prepare('SELECT * FROM tasks ORDER BY id').all();
    assert.equal(tasks[0].notes, notes);
    assert.equal(tasks[1].notes, '');
    assert.equal(tasks[2].notes, '');
    for (const key of ['id', 'project_id', 'completed', 'priority', 'due_date', 'position']) {
      assert.equal(tasks[0][key], original[0][key]);
    }
    const { notes: empty, ...second } = tasks[1];
    assert.equal(empty, '');
    assert.deepEqual(second, { ...original[1] });
    stored.close();
    server = await start(dbPath);
    assert.ok((await get('/projects/1')).includes(escapedNotes(notes)));
    await post('/projects/1/restore', {});
    html = await get('/projects/1');
    assert.match(html, /<textarea id="task-notes-1" name="notes" rows="4">/);
    await post('/projects/1/tasks/1/notes', { notes: '' });
    assert.match(await get('/projects/1'), /<textarea id="task-notes-1" name="notes" rows="4"><\/textarea>/);
    await post('/projects/1/tasks/2/notes', { notes: '  \n\t ' });
    await server.stop();
    server = undefined;
    const cleared = new DatabaseSync(dbPath);
    assert.equal(cleared.prepare('SELECT notes FROM tasks WHERE id = 1').get().notes, '');
    assert.equal(cleared.prepare('SELECT notes FROM tasks WHERE id = 2').get().notes, '  \n\t ');
    cleared.close();
  } finally {
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
