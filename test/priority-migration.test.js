import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('existing task rows migrate to Normal with identity and completion intact', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  const dbPath = join(directory, 'legacy.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (id, name) VALUES (7, 'Existing project');
    INSERT INTO tasks (id, project_id, title, completed) VALUES (11, 7, 'Existing task', 1);
  `);
  db.close();
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  try {
    const base = `http://127.0.0.1:${port}`;
    let healthy = false;
    for (let i = 0; i < 100; i++) {
      try { healthy = (await fetch(`${base}/health`)).ok; } catch {}
      if (healthy) break;
      if (child.exitCode !== null) throw new Error('Server exited during migration');
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    assert.ok(healthy);
    assert.deepEqual(await (await fetch(`${base}/api/projects/7/tasks`)).json(), [
      { id: 11, project_id: 7, title: 'Existing task', completed: true, priority: 'Normal' },
    ]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/7`)).json(),
      { id: 7, name: 'Existing project', archived: 0, default_priority: 'Normal', total: 1, completed: 1 });
  } finally {
    if (child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
