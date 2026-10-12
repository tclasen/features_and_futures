import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('migration retains existing order and remembers it on subsequent returns', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-order-'));
  const path = join(directory, 'db.sqlite');
  const db = new DatabaseSync(path);
  // Task011 database: current order is not necessarily task ID order.
  db.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL);
    INSERT INTO projects (name) VALUES ('First'), ('Second');
    INSERT INTO tasks (project_id, title, position) VALUES
      (1, 'Later', 8), (1, 'Earlier', 3), (2, 'Other', 1);
  `);
  db.close();
  let child;
  try {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: path },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const base = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', () => reject(new Error('Server exited')));
      child.stdout.on('data', (data) => {
        const port = String(data).match(/port (\d+)/);
        if (port) resolve(`http://127.0.0.1:${port[1]}`);
      });
    });
    const rows = async (id) => {
      const html = await (await fetch(`${base}/projects/${id}`)).text();
      return [...html.matchAll(/aria-label="Complete ([^"]+)"/g)].map((m) => m[1]);
    };
    const post = async (path, data) => {
      const response = await fetch(base + path, {
        method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
      });
      assert.equal(response.status, 303);
    };
    assert.deepEqual(await rows(1), ['Earlier', 'Later']);
    await post('/projects/1/tasks/2/move', { destination: '2' });
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/1/tasks', { title: 'Newest' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    await post('/projects/2/tasks/2/move', { destination: '1' });
    assert.deepEqual(await rows(1), ['Earlier', 'Later', 'Newest']);
  } finally {
    if (child && child.exitCode === null) {
      const exited = new Promise((resolve) => child.once('exit', resolve));
      child.kill('SIGTERM');
      await exited;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
