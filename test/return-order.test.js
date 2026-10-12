import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('migrates current order and remembers reserved positions across moves and restarts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-order-'));
  const dbPath = join(dir, 'db.sqlite');
  const db = new DatabaseSync(dbPath);
  // A Task 011 database whose current order differs from task ID order.
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    INSERT INTO projects VALUES (1, 'Origin'), (2, 'Other');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL,
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL);
    INSERT INTO tasks VALUES (1, 1, 'A', 0, 3), (2, 1, 'B', 0, 1), (3, 1, 'C', 0, 2);`);
  db.close();
  const base = 'http://127.0.0.1:18085';
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '18085', DB_PATH: dbPath }, stdio: 'ignore' });
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error('Server exited');
      try { if ((await fetch(base + '/health')).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error('Server not ready');
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  const post = (path, values = {}) => fetch(base + path, { method: 'POST', body: new URLSearchParams(values), redirect: 'manual' });
  const move = (source, task, destination) => post(`/projects/${source}/tasks/${task}/move`, { destination });
  async function order(project) {
    const html = await (await fetch(base + `/projects/${project}`)).text();
    return [...html.matchAll(/class="task-title" for="task-(\d+)"/g)].map(match => Number(match[1]));
  }
  try {
    await start();
    assert.deepEqual(await order(1), [2, 3, 1]);
    await move(1, 2, 2);
    await move(1, 3, 2);
    await move(1, 1, 2);
    await post('/projects/1/tasks', { title: 'New while all away' });
    await post('/projects/2/tasks/3/rename', { title: 'Changed C' });
    await post('/projects/2/tasks/3/priority', { priority: 'High' });
    await post('/projects/2/tasks/3/due-date', { dueDate: '2028-02-29' });
    await post('/projects/2/tasks/3', { completed: '1' });
    await post('/projects/1/rename', { name: 'Renamed origin' });
    await post('/projects/1/archive');
    assert.equal((await move(2, 3, 1)).status, 422);
    await stop();
    await start();
    await post('/projects/1/restore');
    // Return in reverse order, with a first-time arrival between returns.
    await move(2, 1, 1);
    await post('/projects/2/tasks', { title: 'First-time visitor' });
    await move(2, 5, 1);
    await move(2, 3, 1);
    await move(2, 2, 1);
    assert.deepEqual(await order(1), [2, 3, 1, 4, 5]);
    const html = await (await fetch(base + '/projects/1')).text();
    assert.match(html, /aria-label="Complete Changed C" checked/);
    assert.match(html, /id="task-priority-3"[\s\S]*?<option selected>High/);
    assert.match(html, /id="task-due-date-3"[^>]*value="2028-02-29"/);
    await move(1, 3, 2);
    await move(1, 2, 2);
    assert.deepEqual(await order(2), [2, 3]);
    await stop();
    await start();
    await move(2, 2, 1);
    await move(2, 3, 1);
    assert.deepEqual(await order(1), [2, 3, 1, 4, 5]);
  } finally {
    await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
