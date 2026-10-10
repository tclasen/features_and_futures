import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

test('remembered project positions survive reverse returns, new arrivals, migration and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-return-'));
  const path = join(directory, 'db.sqlite');
  const db = new DatabaseSync(path);
  // Task 0011 order is position-based, not necessarily ID-based.
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL);
    INSERT INTO projects (name) VALUES ('Source'), ('Destination'), ('Third');
    INSERT INTO tasks (project_id, title, position) VALUES
      (1, 'B', 20), (1, 'A', 10), (1, 'C', 30), (2, 'D', 1);`);
  db.close();
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: path }, stdio: 'ignore'
    });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + '/health')).ok) return; } catch {}
      if (child.exitCode !== null) throw new Error('Server exited');
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Server did not start');
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
  }
  async function post(url, values = {}, status = 303) {
    const response = await fetch(base + url, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
    });
    assert.equal(response.status, status);
    return response;
  }
  const move = (task, source, destination, extra = {}) => post(`/projects/${source}/tasks/${task}/move`, { destination, ...extra });
  async function order(project) {
    const html = await (await fetch(`${base}/projects/${project}`)).text();
    return [...html.matchAll(/aria-label="Complete ([^"]+)"/g)].map(match => match[1]);
  }
  try {
    await start();
    assert.deepEqual(await order(1), ['A', 'B', 'C']);
    await move(2, 1, 2);
    await move(1, 1, 2);
    await move(3, 1, 2);
    assert.deepEqual(await order(2), ['D', 'A', 'B', 'C']);
    // Creating and first-time arrival must follow even the absent positions.
    await post('/projects/1/tasks', { title: 'E' });
    await move(4, 2, 1);
    assert.deepEqual(await order(1), ['E', 'D']);
    await post('/projects/2/tasks/2/rename', { title: 'A renamed' });
    await post('/projects/2/tasks/2', { completed: '1' });
    await post('/projects/2/tasks/2/priority', { priority: 'High' });
    await post('/projects/2/tasks/2/due-date', { dueDate: '2024-02-29' });
    await post('/projects/1/rename', { name: 'Renamed source' });
    await post('/projects/1/archive');
    await post('/projects/2/tasks/2/move', { destination: '1' }, 400);
    await stop();
    await start();
    await post('/projects/1/restore');
    await move(3, 2, 1);
    await move(1, 2, 1);
    const filters = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-01-01', dueThrough: '2024-12-31' };
    const response = await move(2, 2, 1, filters);
    const location = new URL(response.headers.get('location'), base);
    assert.equal(location.pathname, '/projects/2');
    for (const [key, value] of Object.entries(filters)) assert.equal(location.searchParams.get(key), value);
    assert.deepEqual(await order(1), ['A renamed', 'B', 'C', 'E', 'D']);
    assert.deepEqual(await order(2), []);
    const saved = new DatabaseSync(path);
    const task = saved.prepare('SELECT * FROM tasks WHERE id = 2').get();
    assert.equal(task.completed, 1);
    assert.equal(task.priority, 'High');
    assert.equal(task.due_date, '2024-02-29');
    saved.close();
    assert.match(await (await fetch(base + '/')).text(), /project-summary">1\/5 completed/);
    // Return to the second project in a different order, after a new task there.
    await post('/projects/2/tasks', { title: 'F' });
    await move(3, 1, 2);
    await move(1, 1, 2);
    await move(4, 1, 2);
    await move(2, 1, 2);
    assert.deepEqual(await order(2), ['D', 'A renamed', 'B', 'C', 'F']);
    await move(2, 2, 3);
    await move(2, 3, 2);
    await stop();
    await start();
    assert.deepEqual(await order(2), ['D', 'A renamed', 'B', 'C', 'F']);
    assert.deepEqual(await order(1), ['E']);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
