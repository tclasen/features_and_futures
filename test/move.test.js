import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('moves append on first arrival, restore return order, preserve data and enforce active ownership', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-move-'));
  const dbPath = join(directory, 'db.sqlite');
  // Exercise migration of the existing creation-order representation.
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Source');
    INSERT INTO tasks (project_id, title) VALUES (1, 'Oldest');`);
  db.close();
  const port = 40000 + Math.floor(Math.random() * 10000);
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: dbPath }, stdio: 'ignore',
    });
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error('Server exited');
      try { if ((await fetch(base + '/health')).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Server did not start');
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  const get = async path => (await fetch(base + path)).text();
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const rows = html => [...html.matchAll(/<label for="task-\d+">([^<]+)<\/label>/g)].map(match => match[1]);
  const choices = html => [...html.matchAll(/<select id="destination-project-\d+"[^>]*>([\s\S]*?)<\/select>/g)]
    .map(match => [...match[1].matchAll(/<option value="(\d+)">([^<]+)<\/option>/g)].map(option => [option[1], option[2]]));
  const move = (source, task, destination, state = {}) => post(`/projects/${source}/tasks/${task}/move`, { ...state, destination });
  try {
    await start();
    let html = await get('/projects/1');
    assert.match(html, /id="destination-project-1" name="destination" disabled/);
    assert.match(html, /<button type="submit" disabled>Move task/);
    await post('/projects', { name: 'Destination' });
    await post('/projects', { name: 'Third' });
    await post('/projects/2/rename', { name: 'Renamed destination' });
    await post('/projects/2/default-priority', { priority: 'Low' });
    await post('/projects/2/tasks', { title: 'Destination existing' });
    await post('/projects/1/tasks', { title: 'Remaining' });
    await post('/projects/1/tasks/1', { completed: '1' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
    assert.deepEqual(choices(await get('/projects/1')), [
      [['2', 'Renamed destination'], ['3', 'Third']],
      [['2', 'Renamed destination'], ['3', 'Third']],
    ]);
    const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-03-01' };
    const response = await move(1, 1, 2, state);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1?filter=Completed&priorityFilter=High&dueFrom=2024-02-29&dueThrough=2024-03-01');
    html = await get(response.headers.get('location'));
    assert.deepEqual(rows(html), []);
    assert.match(html, /<option selected>Completed/);
    assert.match(html, /<option selected>High/);
    assert.match(html, /id="due-from" name="from" type="text" value="2024-02-29"/);
    assert.deepEqual(rows(await get('/projects/1')), ['Remaining']);
    html = await get('/projects/2');
    assert.deepEqual(rows(html), ['Destination existing', 'Oldest']);
    assert.match(html, /aria-label="Complete Oldest" checked/);
    assert.match(html, /<option selected>High/);
    assert.match(html, /id="task-due-date-1" type="text" name="dueDate" value="2024-02-29"/);
    const summaries = [...(await get('/')).matchAll(/data-testid="project-summary">([^<]+)/g)].map(match => match[1]);
    assert.deepEqual(summaries, ['0/1 completed', '1/2 completed', '0/0 completed']);
    await post('/projects/2/tasks', { title: 'Created after move' });
    assert.deepEqual(rows(await get('/projects/2')), ['Destination existing', 'Oldest', 'Created after move']);
    assert.equal((await move(1, 1, 3)).status, 404); // Wrong source cannot move it.
    assert.equal((await move(2, 1, 2)).status, 400);
    assert.equal((await move(2, 1, '999')).status, 400);
    await post('/projects/3/archive');
    assert.equal((await move(2, 1, 3)).status, 400);
    assert.deepEqual(choices(await get('/projects/2'))[0], [['1', 'Source']]);
    await post('/projects/2/archive');
    html = await get('/projects/2');
    assert.match(html, /id="destination-project-1" name="destination" disabled/);
    assert.equal((await move(2, 1, 1)).status, 403);
    await post('/projects/2/restore');
    assert.equal((await move(2, 1, 1)).status, 303);
    assert.deepEqual(rows(await get('/projects/1')), ['Oldest', 'Remaining']);
    // Moving undated tasks preserves their blank dates and can be repeated.
    assert.equal((await move(2, 2, 1)).status, 303);
    assert.equal((await move(1, 2, 2)).status, 303);
    assert.deepEqual(rows(await get('/projects/2')), ['Destination existing', 'Created after move']);
    await stop();
    await start();
    assert.deepEqual(rows(await get('/projects/1')), ['Oldest', 'Remaining']);
    html = await get('/projects/1');
    assert.match(html, /aria-label="Complete Oldest" checked/);
    assert.match(html, /value="2024-02-29"/);
    assert.deepEqual(rows(await get('/projects/2')), ['Destination existing', 'Created after move']);
    html = await get('/projects/2');
    assert.match(html, /id="task-due-date-2" type="text" name="dueDate" value=""/);

    // Vacated positions remain reserved, including across a process restart.
    assert.equal((await move(1, 1, 2)).status, 303);
    assert.equal((await move(1, 3, 2)).status, 303);
    await post('/projects/1/tasks', { title: 'New while away' });
    await post('/projects/2/tasks/1/rename', { title: 'Current title' });
    await post('/projects/2/tasks/1/priority', { priority: 'Low' });
    await post('/projects/2/tasks/1/due-date', { dueDate: '2025-01-01' });
    await post('/projects/1/rename', { name: 'Renamed source' });
    await post('/projects/1/archive');
    assert.equal((await move(2, 3, 1)).status, 400);
    await stop();
    await start();
    await post('/projects/1/restore');
    // Return in reverse order; current field values, not historical ones, survive.
    assert.equal((await move(2, 3, 1)).status, 303);
    assert.deepEqual(rows(await get('/projects/1')), ['Remaining', 'New while away']);
    assert.equal((await move(2, 1, 1)).status, 303);
    html = await get('/projects/1');
    assert.deepEqual(rows(html), ['Current title', 'Remaining', 'New while away']);
    assert.match(html, /aria-label="Complete Current title" checked/);
    assert.match(html, /id="task-due-date-1" type="text" name="dueDate" value="2025-01-01"/);
    assert.match(html, /<option selected>Low/);
    assert.deepEqual(rows(await get('/projects/2')), ['Destination existing', 'Created after move']);
    await stop();
    await start();
    assert.deepEqual(rows(await get('/projects/1')), ['Current title', 'Remaining', 'New while away']);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
