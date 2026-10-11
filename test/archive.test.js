import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('migrates existing projects, archives read-only tasks, restores and persists summaries', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const dbPath = join(dir, 'db.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL); INSERT INTO projects (name) VALUES ('Existing');");
  db.close();
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'inherit']
    });
    base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Startup timeout')), 5000);
      child.stdout.on('data', chunk => {
        const match = /listening on port (\d+)/.exec(String(chunk));
        if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
      });
    });
  }
  async function stop() { const exited = once(child, 'exit'); child.kill(); await exited; child = null; }
  const html = async path => (await fetch(base + path)).text();
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
  });
  try {
    await start();
    assert.match(await html('/'), /data-testid="project-summary">0\/0 completed/);
    assert.match(await html('/'), /<option selected>Active<\/option><option>Archived<\/option>/);
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'One' });
    await post('/projects/1/tasks', { title: 'Two' });
    await post('/projects/1/tasks/1', { completed: '1' });
    assert.match(await html('/'), /data-testid="project-summary">1\/2 completed/);
    assert.equal((await post('/projects/1/archive')).status, 303);
    assert.doesNotMatch(await html('/'), /Existing/);
    let text = await html('/?filter=Archived');
    assert.match(text, /Existing/);
    assert.match(text, /Restore project/);
    assert.match(text, /Open project/);
    assert.match(text, /1\/2 completed/);
    text = await html('/projects/1');
    assert.match(text, /Archived project/);
    assert.match(text, /<button type="submit" disabled>Create task/);
    assert.match(text, /aria-label="Complete One" checked disabled/);
    assert.match(text, /aria-label="Complete Two" disabled/);
    assert.doesNotMatch(await html('/projects/1?filter=Open'), /Complete One/);
    assert.doesNotMatch(await html('/projects/1?filter=Completed'), /Complete Two/);
    assert.equal((await post('/projects/1/tasks', { title: 'Forbidden' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1')).status, 403);
    await stop();
    await start();
    assert.match(await html('/?filter=Archived'), /1\/2 completed/);
    assert.match(await html('/projects/1'), /Archived project/);
    await post('/projects/1/restore');
    text = await html('/');
    assert.ok(text.indexOf('Existing') < text.indexOf('Second'));
    assert.match(text, /1\/2 completed/);
    assert.doesNotMatch(await html('/projects/1'), / disabled|Archived project/);
    await post('/projects/1/tasks/2', { completed: '1' });
    await stop();
    await start();
    assert.match(await html('/'), /2\/2 completed/);
    assert.doesNotMatch(await html('/?filter=Archived'), /Existing/);
  } finally {
    if (child) await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
