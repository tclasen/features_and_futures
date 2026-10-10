import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { DatabaseSync } from 'node:sqlite';

test('migrates existing projects, archives read-only tasks, restores summaries, and persists', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const databasePath = join(directory, 'db.sqlite');
  const db = new DatabaseSync(databasePath);
  db.exec("CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL); INSERT INTO projects (name) VALUES ('Existing')");
  db.close();
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: databasePath }, stdio: 'ignore',
    });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + '/health')).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Server did not start');
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = undefined;
  }
  const post = (path, data = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
  });
  const get = async path => (await fetch(base + path)).text();
  const rows = html => (html.match(/data-testid="project-row"/g) || []).length;
  try {
    await start();
    assert.match(await get('/'), /<option selected>Active<\/option>/);
    assert.match(await get('/'), /data-testid="project-summary">0\/0 completed/);
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'First task' });
    await post('/projects/1/tasks', { title: 'Second task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    assert.equal((await post('/projects/1/archive')).status, 303);
    assert.equal(rows(await get('/')), 1);
    let archived = await get('/?filter=Archived');
    assert.equal(rows(archived), 1);
    assert.match(archived, />Existing</);
    assert.match(archived, />Restore project</);
    assert.match(archived, />Open project</);
    assert.match(archived, /1\/2 completed/);
    assert.doesNotMatch(archived, />Archive project</);
    let detail = await get('/projects/1');
    assert.match(detail, /Archived project/);
    assert.match(detail, /<button type="submit" disabled>Create task/);
    assert.equal((detail.match(/type="checkbox"[^>]* disabled/g) || []).length, 2);
    assert.match(await get('/projects/1?filter=Completed'), />First task</);
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), />Second task</);
    assert.match(await get('/projects/1?filter=Open'), />Second task</);
    assert.equal((await post('/projects/1/tasks', { title: 'Forbidden' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1')).status, 403);
    await stop();
    await start();
    assert.equal(await get('/?filter=Archived'), archived);
    assert.equal(await get('/projects/1'), detail);
    await post('/projects/1/restore');
    assert.equal(rows(await get('/?filter=Archived')), 0);
    const active = await get('/');
    assert.equal(rows(active), 2);
    assert.ok(active.indexOf('>Existing<') < active.indexOf('>Second<'));
    assert.match(active, /1\/2 completed/);
    detail = await get('/projects/1');
    assert.doesNotMatch(detail, / disabled|Archived project/);
    assert.match(detail, / checked/);
    await stop();
    await start();
    assert.equal(await get('/'), active);
    assert.equal(await get('/projects/1'), detail);
    await post('/projects/1/tasks/2', { completed: '1' });
    assert.match(await get('/'), /2\/2 completed/);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
