import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('moves append, preserve task data and source filters, reject archived destinations, and persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-moves-'));
  const dbPath = join(directory, 'db.sqlite');
  // Exercise migration from the original schema as well as newly created tasks.
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Source');
    INSERT INTO tasks (project_id, title) VALUES (1, 'Old task');`);
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
  const get = async path => (await fetch(base + path)).text();
  const post = (path, data = {}) => fetch(base + path, { method: 'POST', body: new URLSearchParams(data), redirect: 'manual' });
  const titles = html => [...html.matchAll(/aria-label="Complete ([^"]+)"/g)].map(match => match[1]);
  const move = (source, task, destination, state = {}) => post(`/projects/${source}/tasks/${task}/move`, { destination, ...state });
  try {
    await start();
    assert.match(await get('/projects/1'), /id="destination-project-1" name="destination" disabled>\s*<\/select>/);
    assert.match(await get('/projects/1'), /<button type="submit" disabled>Move task/);
    await post('/projects', { name: 'Destination' });
    await post('/projects', { name: 'Archived' });
    await post('/projects/3/archive');
    await post('/projects/2/rename', { name: 'Renamed destination' });
    await post('/projects/2/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Remaining' }); // id 2
    await post('/projects/2/tasks', { title: 'Destination first' }); // id 3
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/completion', { completed: '1' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '0001-01-01' });
    const html = await get('/projects/1');
    assert.match(html, /<option value="2">Renamed destination<\/option>/);
    assert.doesNotMatch(html, /<option value="[13]">/);
    for (const destination of ['1', '3', '999', 'invalid']) assert.equal((await move(1, 1, destination)).status, 400);
    const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '0001-01-01', dueThrough: '9999-12-31' };
    const response = await move(1, 1, '2', state);
    const location = '/projects/1?' + new URLSearchParams(state);
    assert.equal(response.headers.get('location'), location);
    assert.deepEqual(titles(await get(location)), []);
    assert.deepEqual(titles(await get('/projects/1')), ['Remaining']);
    assert.deepEqual(titles(await get('/projects/2')), ['Destination first', 'Old task']);
    let destination = await get('/projects/2');
    assert.match(destination, /aria-label="Complete Old task" checked/);
    assert.match(destination, /<option selected>High<\/option>/);
    assert.match(destination, /id="task-due-date-1"[^>]*value="0001-01-01"/);
    assert.match(await get('/'), /0\/1 completed/);
    assert.match(await get('/'), /1\/2 completed/);
    assert.equal((await move(1, 1, '2')).status, 404); // no longer owned by source
    await post('/projects/2/archive');
    destination = await get('/projects/2');
    assert.match(destination, /id="destination-project-1" name="destination" disabled>/);
    assert.equal((await move(2, 1, '1')).status, 403);
    await stop();
    await start();
    await post('/projects/2/restore');
    assert.deepEqual(titles(await get('/projects/2')), ['Destination first', 'Old task']);
    await move(2, 1, '1');
    assert.deepEqual(titles(await get('/projects/1')), ['Old task', 'Remaining']);
    await post('/projects/1/tasks', { title: 'After move' });
    assert.deepEqual(titles(await get('/projects/1')), ['Old task', 'Remaining', 'After move']);
    // Blank dates and inherited priorities also survive moving.
    await move(2, 3, '1');
    const source = await get('/projects/1');
    assert.deepEqual(titles(source), ['Old task', 'Remaining', 'After move', 'Destination first']);
    assert.match(source, /id="task-due-date-3"[^>]*value=""/);
    assert.match(source, /<option selected>Low<\/option>/);
    await post('/projects/3/restore');
    const options = (await get('/projects/1')).match(/id="destination-project-1"[^>]*>([\s\S]*?)<\/select>/)[1];
    assert.match(options, /value="2">Renamed destination[\s\S]*value="3">Archived/);
    await stop();
    await start();
    assert.deepEqual(titles(await get('/projects/1')), ['Old task', 'Remaining', 'After move', 'Destination first']);
    assert.deepEqual(titles(await get('/projects/2')), []);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
