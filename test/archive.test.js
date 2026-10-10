import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('migrates existing projects; archive, summaries and restoration persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const dbPath = join(directory, 'db.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL); INSERT INTO projects(name) VALUES ('Existing');");
  db.close();
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'inherit'],
    });
    base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Startup timeout')), 5000);
      child.stdout.on('data', chunk => {
        const match = chunk.toString().match(/listening on port (\d+)/);
        if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
      });
    });
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill();
    await exited;
    child = null;
  }
  const html = async path => (await fetch(base + path)).text();
  const post = (path, fields = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
  });
  try {
    await start();
    assert.match(await html('/'), /<option selected>Active<\/option>/);
    assert.match(await html('/'), /data-testid="project-summary">0\/0 completed/);
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'One' });
    await post('/projects/1/tasks', { title: 'Two' });
    await post('/projects/1/tasks/1/completion', { completed: '1' });
    assert.match(await html('/'), /data-testid="project-summary">1\/2 completed/);
    assert.equal((await post('/projects/1/archive')).status, 303);
    assert.doesNotMatch(await html('/'), /<span>Existing<\/span>/);
    const archived = await html('/?filter=Archived');
    assert.match(archived, /<span>Existing<\/span>/);
    assert.match(archived, /Restore project/);
    assert.doesNotMatch(archived, /Archive project<\/button>/);
    const detail = await html('/projects/1');
    assert.match(detail, /Archived project/);
    assert.match(detail, /<button type="submit" disabled>Create task/);
    assert.equal((detail.match(/type="checkbox"[^>]* disabled/g) || []).length, 2);
    assert.equal(((await html('/projects/1?filter=Completed')).match(/data-testid="task-row"/g) || []).length, 1);
    assert.equal(((await html('/projects/1?filter=Open')).match(/data-testid="task-row"/g) || []).length, 1);
    assert.equal((await post('/projects/1/tasks', { title: 'Forbidden' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1/completion')).status, 403);
    await stop();
    await start();
    assert.equal(await html('/?filter=Archived'), archived);
    assert.equal(await html('/projects/1'), detail);
    await post('/projects/1/restore');
    assert.doesNotMatch(await html('/projects/1'), / disabled/);
    assert.match(await html('/'), /data-testid="project-summary">1\/2 completed/);
    assert.doesNotMatch(await html('/?filter=Archived'), /data-testid="project-row"/);
    await post('/projects/1/tasks/2/completion', { completed: '1' });
    await stop();
    await start();
    assert.match(await html('/'), /data-testid="project-summary">2\/2 completed/);
    assert.equal(((await html('/projects/1')).match(/ checked/g) || []).length, 2);
    assert.equal((await post('/projects/999/archive')).status, 404);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
