import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('prior movement positions migrate without reordering by task ID', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-return-migration-'));
  const path = join(directory, 'db.sqlite');
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects VALUES (1, 'Source'), (2, 'Destination');
    INSERT INTO tasks VALUES (1, 1, 'Previously moved', 1, 30),
      (2, 1, 'First', 0, 10), (3, 1, 'Second', 0, 20);`);
  db.close();
  const port = 40000 + Math.floor(Math.random() * 10000);
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(port), DB_PATH: path },
    stdio: ['ignore', 'ignore', 'inherit']
  });
  async function api(path, method = 'GET', body) {
    const response = await fetch(`http://127.0.0.1:${port}/api${path}`, {
      method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
    });
    assert.ok(response.ok);
    return response.json();
  }
  const move = (source, task, destination) => api(`/projects/${source}/tasks/${task}`, 'PATCH', { destination_project_id: destination });
  const order = async () => (await api('/projects/1/tasks')).map(task => task.id);
  try {
    let healthy = false;
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) { healthy = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(healthy, 'Server starts');
    assert.deepEqual(await order(), [2, 3, 1]);
    await move(1, 1, 2);
    await move(1, 3, 2);
    await move(1, 2, 2);
    const created = await api('/projects/1/tasks', 'POST', { title: 'After remembered positions' });
    await move(2, 1, 1);
    await move(2, 3, 1);
    await move(2, 2, 1);
    assert.deepEqual(await order(), [2, 3, 1, created.id]);
  } finally {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    await rm(directory, { recursive: true, force: true });
  }
});
