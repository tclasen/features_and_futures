import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('migration retains current order and reversed returns restore independent project positions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-return-order-'));
  const dbPath = join(directory, 'db.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL);
    INSERT INTO projects (name) VALUES ('One'), ('Two'), ('Three');
    INSERT INTO tasks (project_id, title, position) VALUES (1, 'A', 20), (1, 'B', 10), (1, 'C', 30);`);
  legacy.close();
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'inherit']
    });
    const [output] = await once(child.stdout, 'data');
    base = `http://127.0.0.1:${String(output).match(/listening on port (\d+)/)[1]}`;
  }
  async function stop() {
    const exit = once(child, 'exit');
    child.kill('SIGTERM');
    await exit;
    child = null;
  }
  const post = (path, fields = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(fields), redirect: 'manual'
  });
  async function move(source, task, destination) {
    assert.equal((await post(`/projects/${source}/tasks/${task}/move`, { destination_id: destination })).status, 204);
  }
  async function order(project) {
    const html = await fetch(`${base}/projects/${project}`).then(response => response.text());
    return [...html.matchAll(/data-completion-url="\/projects\/\d+\/tasks\/(\d+)\/completion"/g)].map(match => Number(match[1]));
  }
  try {
    await start();
    assert.deepEqual(await order(1), [2, 1, 3]);
    for (const task of [3, 1, 2]) await move(1, task, 2);
    assert.deepEqual(await order(2), [3, 1, 2]);
    // Even an empty project must append new arrivals after all remembered slots.
    await post('/projects/1/tasks', { title: 'New' });
    await post('/projects/3/tasks', { title: 'Arrival' });
    await move(3, 5, 1);
    await post('/projects/1/rename', { name: 'Renamed' });
    await post('/projects/1/archive');
    await stop();
    await start();
    await post('/projects/1/restore');
    for (const task of [3, 1, 2]) await move(2, task, 1);
    assert.deepEqual(await order(1), [2, 1, 3, 4, 5]);
    // Each destination remembers its own distinct order.
    for (const task of [2, 1, 3]) await move(1, task, 2);
    assert.deepEqual(await order(2), [3, 1, 2]);
    await stop();
    await start();
    assert.deepEqual(await order(2), [3, 1, 2]);
    for (const task of [1, 3, 2]) await move(2, task, 1);
    assert.deepEqual(await order(1), [2, 1, 3, 4, 5]);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
