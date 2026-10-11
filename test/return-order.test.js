import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('per-project positions survive reverse returns, absent-task appends, edits, archives and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-return-'));
  const dbPath = join(directory, 'db.sqlite');
  // Existing order is not necessarily task ID order after earlier moves.
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL);
    INSERT INTO projects (name) VALUES ('A'), ('B'), ('C');
    INSERT INTO tasks (project_id, title, position) VALUES (1, 'Second', 20), (1, 'First', 10), (1, 'Third', 30), (2, 'B first', 4);`);
  legacy.close();
  let child, base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe'] });
    base = await new Promise((resolve, reject) => {
      child.stdout.on('data', chunk => {
        const match = /listening on port (\d+)/.exec(String(chunk));
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
      child.on('error', reject);
      child.on('exit', code => reject(new Error(`Server exited ${code}`)));
    });
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = null;
  }
  const post = (path, data = {}) => fetch(base + path, { method: 'POST', body: new URLSearchParams(data), redirect: 'manual' });
  const page = async id => (await fetch(`${base}/projects/${id}`)).text();
  const titles = async id => [...(await page(id)).matchAll(/aria-label="Complete ([^"]+)"/g)].map(match => match[1]);
  const move = (source, task, destination, state = {}) => post(`/projects/${source}/tasks/${task}/move`, { destination, ...state });
  try {
    await start();
    assert.deepEqual(await titles(1), ['First', 'Second', 'Third']);
    await move(1, 2, 2);
    await move(1, 1, 2);
    await move(1, 3, 2);
    assert.deepEqual(await titles(2), ['B first', 'First', 'Second', 'Third']);
    // All original positions remain reserved while every task is away.
    await post('/projects/1/tasks', { title: 'New A' });
    await move(2, 4, 1);
    await post('/projects/2/tasks/1/rename', { title: 'Changed second' });
    await post('/projects/2/tasks/1/completion', { completed: '1' });
    await post('/projects/2/tasks/1/priority', { priority: 'High' });
    await post('/projects/2/tasks/1/due-date', { dueDate: '2028-02-29' });
    await post('/projects/1/rename', { name: 'Renamed A' });
    await post('/projects/1/archive');
    assert.equal((await move(2, 1, 1)).status, 400);
    await stop();
    await start();
    await post('/projects/1/restore');
    await move(2, 3, 1);
    await move(2, 1, 1);
    await move(2, 2, 1);
    assert.deepEqual(await titles(1), ['First', 'Changed second', 'Third', 'New A', 'B first']);
    assert.match(await page(1), /aria-label="Complete Changed second" checked/);
    assert.match(await page(1), /id="task-due-date-1"[^>]*value="2028-02-29"/);
    assert.match(await page(1), /<option selected>High<\/option>/);
    // The same task remembers distinct positions in three projects.
    await move(1, 1, 3);
    await post('/projects/3/tasks', { title: 'C later' });
    await move(3, 1, 2);
    await post('/projects/2/tasks', { title: 'B later' });
    await move(1, 4, 2);
    await move(1, 3, 2);
    await move(1, 2, 2);
    assert.deepEqual(await titles(2), ['B first', 'First', 'Changed second', 'Third', 'B later']);
    await move(2, 1, 3);
    assert.deepEqual(await titles(3), ['Changed second', 'C later']);
    await stop();
    await start();
    const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2028-01-01', dueThrough: '2028-12-31' };
    const response = await move(3, 1, 1, state);
    assert.equal(response.headers.get('location'), '/projects/3?' + new URLSearchParams(state));
    assert.deepEqual(await titles(1), ['Changed second', 'New A']);
    await move(2, 3, 1);
    await move(2, 2, 1);
    await move(2, 4, 1);
    assert.deepEqual(await titles(1), ['First', 'Changed second', 'Third', 'New A', 'B first']);
    const list = await (await fetch(base + '/')).text();
    assert.match(list, /1\/5 completed/);
    await stop();
    await start();
    assert.deepEqual(await titles(1), ['First', 'Changed second', 'Third', 'New A', 'B first']);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
