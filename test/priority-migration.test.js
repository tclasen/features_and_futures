import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('existing tasks migrate to Normal without losing identity or completion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-migration-'));
  const path = join(directory, 'legacy.sqlite');
  const legacy = new DatabaseSync(path);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects VALUES (7, 'Existing project', 0);
    INSERT INTO tasks VALUES (12, 7, 'Existing task', 1);`);
  legacy.close();
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: path },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  try {
    // The migration runs before listening; inspect its durable result.
    let migrated = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const db = new DatabaseSync(path);
      db.exec('PRAGMA busy_timeout = 5000');
      try {
        migrated = db.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'position');
        if (migrated) {
          assert.deepEqual({ ...db.prepare('SELECT * FROM tasks').get() }, {
            id: 12, project_id: 7, title: 'Existing task', completed: 1, priority: 'Normal', due_date: '', notes: '', position: 12,
          });
        }
      } finally { db.close(); }
      if (migrated) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(migrated, 'priority migration completed');
  } finally {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    await rm(directory, { recursive: true, force: true });
  }
});
