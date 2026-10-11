import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function launch(db) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: db }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const port = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(match[1]);
    });
    child.once('error', reject);
    child.once('exit', () => reject(new Error('Server exited')));
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; },
  };
}

test('moves append, preserve task data and filters, enforce active ownership, and persist', async () => {
  const directory = await mkdtemp(path.resolve('data/moves-test-'));
  const dbPath = path.join(directory, 'db.sqlite');
  // Start with the pre-move schema to exercise ordered migration.
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Source');
    INSERT INTO tasks (project_id, title) VALUES (1, 'Old'), (1, 'Remaining');`);
  db.close();
  let server;
  try {
    server = await launch(dbPath);
    const post = (route, values = {}) => fetch(server.url + route, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async (route) => (await fetch(server.url + route)).text();
    const rows = (markup) => [...markup.matchAll(/aria-label="Complete ([^"]+)"/g)].map((m) => m[1]);
    const move = (source, task, destination, state = {}) => post(`/projects/${source}/tasks/${task}/move`, { destination, ...state });
    assert.match(await html('/projects/1'), /name="destination" disabled>\s*<\/select>/);
    assert.match(await html('/projects/1'), /disabled>Move task/);
    await post('/projects', { name: 'Destination' });
    await post('/projects', { name: 'Third' });
    await post('/projects/2/default-priority', { priority: 'Low' });
    await post('/projects/2/tasks', { title: 'Existing' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1', { completed: '1' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
    await post('/projects/2/rename', { name: 'Renamed destination' });
    let markup = await html('/projects/1');
    assert.match(markup, /<option value="2">Renamed destination<\/option><option value="3">Third<\/option>/);
    const state = { filter: 'Completed', priorityFilter: 'High', rangeFrom: '2024-02-29', rangeThrough: '2024-02-29' };
    const response = await move(1, 1, 2, state);
    assert.equal(response.status, 303);
    const location = response.headers.get('location');
    assert.match(location, /^\/projects\/1\?/);
    const params = new URL(location, server.url).searchParams;
    for (const [key, value] of Object.entries(state)) assert.equal(params.get(key), value);
    assert.deepEqual(rows(await html(location)), []);
    assert.deepEqual(rows(await html('/projects/1')), ['Remaining']);
    markup = await html('/projects/2');
    assert.deepEqual(rows(markup), ['Existing', 'Old']);
    assert.match(markup, /aria-label="Complete Old" checked/);
    assert.match(markup, /<option selected>High<\/option>/);
    assert.match(markup, /name="dueDate" type="text" value="2024-02-29"/);
    assert.match(await html('/'), /0\/1 completed/);
    assert.match(await html('/'), /1\/2 completed/);
    await post('/projects/2/tasks', { title: 'Later' });
    assert.deepEqual(rows(await html('/projects/2')), ['Existing', 'Old', 'Later']);
    assert.equal((await move(1, 1, 3)).status, 404);
    assert.equal((await move(2, 1, 2)).status, 400);
    assert.equal((await move(2, 1, 999)).status, 400);
    await post('/projects/3/archive');
    assert.equal((await move(2, 1, 3)).status, 403);
    assert.doesNotMatch(await html('/projects/2'), /<option value="3">/);
    await post('/projects/2/archive');
    markup = await html('/projects/2');
    assert.match(markup, /name="destination" disabled>/);
    assert.match(markup, /disabled>Move task/);
    assert.equal((await move(2, 1, 1)).status, 403);
    await server.stop();
    server = await launch(dbPath);
    assert.deepEqual(rows(await html('/projects/2')), ['Existing', 'Old', 'Later']);
    await post('/projects/2/restore');
    await move(2, 1, 1);
    assert.deepEqual(rows(await html('/projects/1')), ['Remaining', 'Old']);
    // Move a blank-dated task too; default priority must not replace its Low priority.
    await move(2, 3, 1);
    markup = await html('/projects/1');
    assert.deepEqual(rows(markup), ['Remaining', 'Old', 'Existing']);
    assert.match(markup, /<option selected>Low<\/option>/);
    assert.match(markup, /id="task-due-date-3" name="dueDate" type="text" value=""/);
    await server.stop();
    server = await launch(dbPath);
    assert.deepEqual(rows(await html('/projects/1')), ['Remaining', 'Old', 'Existing']);
    assert.deepEqual(rows(await html('/projects/2')), ['Later']);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
