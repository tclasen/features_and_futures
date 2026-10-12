import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('portable export includes all ordered tasks, public defaults and exact text without changing storage', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-export-'));
  const dbPath = join(directory, 'db.sqlite');
  const seed = new DatabaseSync(dbPath);
  seed.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Source  NAME'), ('Destination'), ('Empty');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'First  TASK', 1), (1, 'Second', 0), (2, 'Other', 0);`);
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
  const post = (path, body = {}) => fetch(base + path, { method: 'POST', body: new URLSearchParams(body), redirect: 'manual' });
  const download = async (id, query = '') => {
    const response = await fetch(`${base}/projects/${id}/download${query}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(response.headers.get('content-disposition'), 'attachment; filename="workboard-project.json"');
    return response.json();
  };
  const snapshot = () => {
    const db = new DatabaseSync(dbPath);
    try {
      return ['projects', 'tasks', 'task_positions'].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
    } finally { db.close(); }
  };
  try {
    await start();
    const oldTask = { title: 'First  TASK', completed: true, priority: 'Normal', dueDate: '', notes: '', deleted: false };
    assert.deepEqual(await download(1), {
      format: 'workboard-project', version: 1,
      project: { name: 'Source  NAME', archived: false, defaultPriority: 'Normal', tasks: [oldTask, { ...oldTask, title: 'Second', completed: false }] }
    });
    assert.deepEqual((await download(3)).project.tasks, []);
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '0001-01-01' });
    const notes = '  \r\nUnicode 日本語 🌻\r\n<b>literal</b> & "quotes"\rline\n  ';
    await post('/projects/1/tasks/1/notes', { notes });
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    await post('/projects/1/tasks/1/delete');
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/archive');
    const query = '?filter=Open&priorityFilter=Low&dueFrom=9999-12-31&search=no-match';
    const pageBefore = await (await fetch(`${base}/projects/1${query}`)).text();
    assert.ok(pageBefore.includes('<button type="submit">Download project</button>'));
    const before = snapshot();
    const exported = await download(1, query);
    assert.deepEqual(exported.project, {
      name: 'Source  NAME', archived: true, defaultPriority: 'Low',
      tasks: [
        { ...oldTask, priority: 'High', dueDate: '0001-01-01', notes: notes.replace(/\r\n?/g, '\n'), deleted: true },
        { ...oldTask, title: 'Second', completed: false }
      ]
    });
    assert.deepEqual(snapshot(), before);
    assert.equal(await (await fetch(`${base}/projects/1${query}`)).text(), pageBefore);
    assert.equal((await download(2)).project.tasks[0].title, 'Other');
    await post('/projects/1/restore');
    await post('/projects/1/tasks/2/delete');
    await post('/projects/1/archive');
    assert.ok((await download(1)).project.tasks.every(task => task.deleted));
    const beforeRestart = await download(1);
    await stop(); await start();
    assert.deepEqual(await download(1), beforeRestart);
    assert.equal((await fetch(`${base}/projects/999/download`)).status, 404);
    assert.deepEqual(await (await fetch(`${base}/health`)).json(), { status: 'ok' });
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
