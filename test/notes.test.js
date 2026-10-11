import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const url = await new Promise((resolve, reject) => {
    let output = '';
    child.once('exit', code => reject(new Error(`Server exited ${code}`)));
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
    child.stderr.on('data', () => {});
  });
  return { url, stop: () => new Promise(resolve => {
    child.once('exit', resolve);
    child.kill('SIGTERM');
  }) };
}

const escaped = text => text.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

function checkNotes(html, id, notes, disabled = false) {
  // The extra initial newline is consumed by the HTML textarea parser.
  assert.ok(html.includes(`<textarea id="task-notes-${id}" name="notes" rows="4"${disabled ? ' disabled' : ''}>\n${escaped(notes)}</textarea>`));
  const form = html.match(new RegExp(`<form action="/projects/\\d+/tasks/${id}/notes"[\\s\\S]*?</form>`))[0];
  assert.ok(form.includes(`<button type="submit"${disabled ? ' disabled' : ''}>Save notes</button>`));
}

test('notes migration, exact text, filters, ownership, return order, archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-notes-'));
  let server;
  try {
    const databasePath = join(directory, 'workboard.sqlite');
    const db = new DatabaseSync(databasePath);
    // A pre-notes database with every existing field and remembered position.
    db.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal');
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
        priority TEXT NOT NULL DEFAULT 'Normal', due_date TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL);
      CREATE TABLE task_positions (task_id INTEGER NOT NULL, project_id INTEGER NOT NULL,
        position INTEGER NOT NULL, PRIMARY KEY (task_id, project_id), UNIQUE (project_id, position));
      INSERT INTO projects (name, default_priority) VALUES ('Source', 'Low'), ('Destination', 'Normal');
      INSERT INTO tasks (project_id, title, completed, priority, due_date, position)
        VALUES (1, 'Keep Title', 1, 'High', '2024-02-29', 7);
      INSERT INTO task_positions VALUES (1, 1, 7);
    `);
    db.close();
    server = await start(databasePath);
    const get = async path => (await fetch(server.url + path)).text();
    const post = (path, data = {}) => fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
    });
    checkNotes(await get('/projects/1'), 1, '');
    await post('/projects/1/tasks', { title: 'Second' });
    checkNotes(await get('/projects/1'), 2, '');
    const notes = '\n  Leading spaces\nUnicode: 雪 🌻\n</textarea><script>alert("x")</script> & literal\n trailing  \n';
    const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-02-29', search: 'keep title' };
    const saved = await post('/projects/1/tasks/1/notes', { ...state, notes });
    assert.equal(saved.status, 303);
    const location = saved.headers.get('location');
    const params = new URL(location, server.url).searchParams;
    for (const [key, value] of Object.entries(state)) assert.equal(params.get(key), value);
    let html = await get(location);
    checkNotes(html, 1, notes);
    assert.equal((html.match(/data-testid="task-row"/g) || []).length, 1);
    assert.ok(!html.includes('<script>'));
    assert.ok(!(await get('/projects/1?search=Unicode')).includes('data-testid="task-row"'));
    checkNotes(await get('/projects/1'), 2, '');
    await post('/projects/1/tasks/1/rename', { title: 'Keep Renamed' });
    await post('/projects/1/rename', { name: 'Renamed Source' });
    await post('/projects/1/tasks/1/move', { destination: '2' });
    checkNotes(await get('/projects/2'), 1, notes);
    assert.ok(!(await get('/projects/1')).includes('task-notes-1'));
    await post('/projects/2/tasks/1/move', { destination: '1' });
    html = await get('/projects/1');
    assert.ok(html.indexOf('task-notes-1') < html.indexOf('task-notes-2'));
    checkNotes(html, 1, notes);
    await post('/projects/1/archive');
    checkNotes(await get('/projects/1'), 1, notes, true);
    assert.equal((await post('/projects/1/tasks/1/notes', { notes: 'forbidden' })).status, 403);
    await post('/projects/1/restore');
    checkNotes(await get('/projects/1'), 1, notes);
    assert.equal((await post('/projects/2/tasks/1/notes', { notes: 'wrong owner' })).status, 404);
    await server.stop();
    server = await start(databasePath);
    checkNotes(await get('/projects/1'), 1, notes);
    const persisted = new DatabaseSync(databasePath);
    const task = persisted.prepare('SELECT * FROM tasks WHERE id = 1').get();
    assert.deepEqual({ ...task }, { id: 1, project_id: 1, title: 'Keep Renamed', completed: 1, priority: 'High', due_date: '2024-02-29', position: 7, notes, deleted: 0 });
    assert.equal(persisted.prepare('SELECT COUNT(*) AS count FROM task_positions WHERE task_id = 1').get().count, 2);
    persisted.close();
    await post('/projects/1/tasks/1/notes', { notes: ' \t  ' });
    checkNotes(await get('/projects/1'), 1, ' \t  ');
    await post('/projects/1/tasks/1/notes', { notes: '' });
    checkNotes(await get('/projects/1'), 1, '');
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    await server.stop();
    server = await start(databasePath);
    checkNotes(await get('/projects/1'), 1, '');
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
