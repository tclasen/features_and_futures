import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('migration preserves preexisting move order rather than task ID order', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-return-'));
  const databasePath = join(directory, 'data.sqlite');
  const db = new DatabaseSync(databasePath);
  db.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL);
    INSERT INTO projects (name) VALUES ('One'), ('Two');
    INSERT INTO tasks (project_id, title, sort_order) VALUES
      (1, 'Moved earlier', 30), (1, 'Original', 10), (2, 'Destination', 20);
  `);
  db.close();
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: databasePath },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    base = await new Promise((resolve, reject) => {
      let output = '';
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
      child.on('error', reject);
      child.on('exit', code => reject(new Error(`Server exited: ${code}`)));
    });
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = null;
  }
  const post = (path, values) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  async function titles(projectId) {
    const body = await (await fetch(`${base}/projects/${projectId}`)).text();
    return [...body.matchAll(/aria-label="Complete ([^"]+)"/g)].map(match => match[1]);
  }
  try {
    await start();
    assert.deepEqual(await titles(1), ['Original', 'Moved earlier']);
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/1/tasks/2/move', { destination: '2' });
    await post('/projects/1/tasks', { title: 'Created while absent' });
    await stop();
    await start();
    await post('/projects/2/tasks/1/move', { destination: '1' });
    await post('/projects/2/tasks/2/move', { destination: '1' });
    assert.deepEqual(await titles(1), ['Original', 'Moved earlier', 'Created while absent']);
    // A first arrival goes after all established positions, even absent ones.
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/2/tasks/3/move', { destination: '1' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(await titles(1), ['Original', 'Moved earlier', 'Created while absent', 'Destination']);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
