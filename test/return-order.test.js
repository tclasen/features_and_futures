import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('migration preserves existing position order rather than task ID order', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-return-'));
  const dbPath = join(dir, 'db.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects(name) VALUES ('Source'), ('Destination');
    INSERT INTO tasks(project_id, title, position) VALUES (1, 'Last', 30), (1, 'First', 10), (1, 'Middle', 20);`);
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
  const post = async (path, values) => {
    const response = await fetch(url + path, { method: 'POST', body: new URLSearchParams(values), redirect: 'manual' });
    assert.equal(response.status, 303);
  };
  const ids = async () => {
    const html = await fetch(url + '/projects/1').then(r => r.text());
    return [...html.matchAll(/id="task-due-date-(\d+)"/g)].map(m => Number(m[1]));
  };
  try {
    await start();
    assert.deepEqual(await ids(), [2, 3, 1]);
    for (const id of [2, 3, 1]) await post(`/projects/1/tasks/${id}/move`, { destination: '2' });
    await post('/projects/1/tasks', { title: 'New while all away' });
    await stop();
    await start();
    for (const id of [1, 3, 2]) await post(`/projects/2/tasks/${id}/move`, { destination: '1' });
    assert.deepEqual(await ids(), [2, 3, 1, 4]);
    await stop();
    await start();
    assert.deepEqual(await ids(), [2, 3, 1, 4]);
  } finally {
    if (child) await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
