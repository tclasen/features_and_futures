import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('existing tasks migrate to Normal without changing identity or completion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  const path = join(directory, 'legacy.sqlite');
  const legacy = new DatabaseSync(path);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (id, name) VALUES (7, 'Legacy');
    INSERT INTO tasks (id, project_id, title, completed) VALUES (9, 7, 'Existing task', 1);
  `);
  legacy.close();
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(port), DB_PATH: path }, stdio: 'ignore'
  });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        ready = (await fetch(`http://127.0.0.1:${port}/health`)).ok;
        if (ready) break;
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    assert.ok(ready, 'server started');
    const html = await (await fetch(`http://127.0.0.1:${port}/projects/7`)).text();
    assert.match(html, /aria-label="Complete Existing task" checked/);
    assert.match(html, /action="\/projects\/7\/tasks\/9\/priority"/);
    assert.match(html, /<option>Low<\/option><option selected>Normal<\/option><option>High<\/option>/);
    const db = new DatabaseSync(path);
    try {
      assert.deepEqual({ ...db.prepare('SELECT * FROM tasks').get() }, {
        id: 9, project_id: 7, title: 'Existing task', completed: 1, priority: 'Normal'
      });
    } finally {
      db.close();
    }
  } finally {
    if (child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
