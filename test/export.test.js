import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('portable export includes all ordered tasks, preserves data, and supports legacy and archived projects', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-export-'));
  const dbPath = join(dir, 'db.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Source  Name'), ('Destination'), ('Empty');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'First  TITLE', 1), (1, 'Second', 0), (2, 'Other', 0);`);
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
  const snapshot = () => {
    const db = new DatabaseSync(dbPath);
    try { return ['projects', 'tasks', 'task_positions'].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()); }
    finally { db.close(); }
  };
  const download = async (id, query = '') => {
    const response = await fetch(`${base}/projects/${id}/export${query}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(response.headers.get('content-disposition'), 'attachment; filename="workboard-project.json"');
    return response.json();
  };
  try {
    await start();
    const initial = await download(1);
    assert.deepEqual(initial, {
      format: 'workboard-project', version: 1,
      project: { name: 'Source  Name', archived: false, defaultPriority: 'Normal', tasks: [
        { title: 'First  TITLE', completed: true, priority: 'Normal', dueDate: '', notes: '', deleted: false },
        { title: 'Second', completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false }
      ] }
    });
    assert.deepEqual((await download(3)).project.tasks, []);
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { due_date: '0001-01-01' });
    const notes = '  雪 🌻 <script>&</textarea>\r\nnext\rfinal\n  ';
    await post('/projects/1/tasks/1/notes', { notes });
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    await post('/projects/1/tasks/1/delete');
    await post('/projects/1/tasks', { title: 'Third' });
    await post('/projects/1/archive');
    const query = '?filter=Deleted&priorityFilter=Low&dueFrom=9999-01-01&search=no-match';
    const pageBefore = await (await fetch(base + '/projects/1' + query)).text();
    assert.ok(pageBefore.includes('<button type="submit">Download project</button>'));
    const before = snapshot();
    const exported = await download(1, query);
    assert.deepEqual(exported.project, {
      name: 'Source  Name', archived: true, defaultPriority: 'Low', tasks: [
        { title: 'First  TITLE', completed: true, priority: 'High', dueDate: '0001-01-01', notes: notes.replace(/\r\n?/g, '\n'), deleted: true },
        initial.project.tasks[1],
        { title: 'Third', completed: false, priority: 'Low', dueDate: '', notes: '', deleted: false }
      ]
    });
    assert.deepEqual(snapshot(), before);
    assert.equal(await (await fetch(base + '/projects/1' + query)).text(), pageBefore);
    assert.deepEqual((await download(2)).project.tasks.map(task => task.title), ['Other']);
    await post('/projects/1/restore');
    await post('/projects/1/tasks/2/delete');
    await post('/projects/1/tasks/4/delete');
    assert.ok((await download(1)).project.tasks.every(task => task.deleted));
    const deletedExport = await download(1);
    await stop();
    await start();
    assert.deepEqual(await download(1), deletedExport);
    assert.equal(snapshot()[1][0].notes, notes);
    assert.equal((await fetch(base + '/projects/999/export')).status, 404);
    assert.deepEqual(await (await fetch(base + '/health')).json(), { status: 'ok' });
  } finally {
    if (child && child.exitCode === null) await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
