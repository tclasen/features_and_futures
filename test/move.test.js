import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('moves remember return order, preserve task data and source filters, enforce active ownership, and persist', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-move-'));
  const dbPath = join(dir, 'db.sqlite');
  // Legacy tasks start in ID order before the ordering migration.
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects(name) VALUES ('Source');
    INSERT INTO tasks(project_id,title) VALUES (1,'First'),(1,'Second');`);
  db.close();
  let child;
  let url;
  const start = async () => {
    child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe'] });
    url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Startup timeout')), 5000);
      child.stdout.on('data', chunk => {
        const match = chunk.toString().match(/listening on port (\d+)/);
        if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
      });
    });
  };
  const stop = async () => { const exited = once(child, 'exit'); child.kill(); await exited; child = null; };
  const post = (path, values = {}) => fetch(url + path, { method: 'POST', body: new URLSearchParams(values), redirect: 'manual' });
  const page = path => fetch(url + path).then(r => r.text());
  const ids = html => [...html.matchAll(/id="task-due-date-(\d+)"/g)].map(m => Number(m[1]));
  try {
    await start();
    assert.deepEqual(ids(await page('/projects/1')), [1, 2]);
    assert.match(await page('/projects/1'), /id="destination-project-1"[^>]* disabled><\/select><button[^>]* disabled>Move task/);
    await post('/projects', { name: 'Destination' });
    await post('/projects', { name: 'Third' });
    await post('/projects', { name: 'Archived' });
    await post('/projects/4/archive');
    await post('/projects/3/rename', { name: 'Renamed & third' });
    let html = await page('/projects/1');
    assert.match(html, /id="destination-project-1"[^>]*><option value="2">Destination<\/option><option value="3">Renamed &amp; third<\/option><\/select>/);
    await post('/projects/2/default-priority', { priority: 'Low' });
    await post('/projects/2/tasks', { title: 'Destination first' });
    await post('/projects/1/tasks/1', { completed: '1' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
    const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-03-01' };
    for (const destination of ['1', '4', '999', 'bad']) {
      assert.equal((await post('/projects/1/tasks/1/move', { ...state, destination })).status, 400);
    }
    const response = await post('/projects/1/tasks/1/move', { ...state, destination: '2' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1?filter=Completed&priorityFilter=High&dueFrom=2024-02-29&dueThrough=2024-03-01');
    assert.deepEqual(ids(await page(response.headers.get('location'))), []);
    assert.deepEqual(ids(await page('/projects/1')), [2]);
    html = await page('/projects/2');
    assert.deepEqual(ids(html), [3, 1]);
    assert.match(html, /aria-label="Complete First" checked/);
    assert.match(html, /<option selected>High/);
    assert.match(html, /id="task-due-date-1"[^>]*value="2024-02-29"/);
    assert.match(await page('/'), /1\/2 completed/);
    assert.equal((await post('/projects/1/tasks/1/move', { destination: '3' })).status, 404);
    await post('/projects/2/archive');
    html = await page('/projects/2');
    assert.match(html, /id="destination-project-1"[^>]* disabled/);
    assert.match(html, /button[^>]* disabled>Move task/);
    assert.equal((await post('/projects/2/tasks/1/move', { destination: '3' })).status, 403);
    await post('/projects/2/restore');
    await post('/projects/2/tasks/1/move', { destination: '1' });
    await post('/projects/1/tasks', { title: 'After move' });
    assert.deepEqual(ids(await page('/projects/1')), [1, 2, 4]);
    await post('/projects/1/tasks/2/move', { destination: '2' });
    assert.deepEqual(ids(await page('/projects/2')), [3, 2]);
    assert.match(await page('/projects/2'), /id="task-due-date-2"[^>]*value=""/);
    await stop();
    await start();
    assert.deepEqual(ids(await page('/projects/1')), [1, 4]);
    assert.deepEqual(ids(await page('/projects/2')), [3, 2]);
    assert.match(await page('/projects/1'), /id="task-due-date-1"[^>]*value="2024-02-29"/);
    assert.match(await page('/projects/1'), /aria-label="Complete First" checked/);
    // Departures retain their slots; new tasks and first-time arrivals follow them.
    await post('/projects/1/tasks/1/move', { destination: '3' });
    await post('/projects/1/tasks/4/move', { destination: '3' });
    await post('/projects/1/tasks', { title: 'Created while away' });
    await post('/projects/2/tasks/3/move', { destination: '1' });
    assert.deepEqual(ids(await page('/projects/1')), [5, 3]);
    await post('/projects/3/tasks/1/rename', { title: 'Current title' });
    await post('/projects/3/tasks/1/priority', { priority: 'Low' });
    await post('/projects/3/tasks/1/due-date', { dueDate: '2030-01-01' });
    await post('/projects/1/rename', { name: 'Renamed source' });
    await post('/projects/1/archive');
    assert.equal((await post('/projects/3/tasks/4/move', { destination: '1' })).status, 400);
    await stop();
    await start();
    await post('/projects/1/restore');
    // Return in reverse order, including a task absent since before the restart.
    await post('/projects/3/tasks/4/move', { destination: '1' });
    assert.deepEqual(ids(await page('/projects/1')), [4, 5, 3]);
    await post('/projects/2/tasks/2/move', { destination: '1' });
    await post('/projects/3/tasks/1/move', { destination: '1' });
    assert.deepEqual(ids(await page('/projects/1')), [1, 2, 4, 5, 3]);
    html = await page('/projects/1');
    assert.match(html, /aria-label="Complete Current title" checked/);
    assert.match(html, /id="task-due-date-1"[^>]*value="2030-01-01"/);
    assert.match(html, /id="task-priority-1"[^>]*>\s*<option selected>Low/);
    // A subsequent return also restores the remembered position in a second project.
    await post('/projects/1/tasks/1/move', { destination: '3' });
    await post('/projects/1/tasks/4/move', { destination: '3' });
    assert.deepEqual(ids(await page('/projects/3')), [1, 4]);
    await stop();
    await start();
    assert.deepEqual(ids(await page('/projects/3')), [1, 4]);
    assert.deepEqual(ids(await page('/projects/1')), [2, 5, 3]);
  } finally {
    if (child) await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
