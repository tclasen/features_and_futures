import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('existing projects migrate; archive, summaries, read-only tasks, and restore persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const dbPath = join(directory, 'db.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    INSERT INTO projects (name) VALUES ('Existing');`);
  db.close();
  const port = 50000 + Math.floor(Math.random() * 10000);
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: dbPath }, stdio: 'ignore',
    });
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error('Server exited');
      try { if ((await fetch(base + '/health')).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Server did not start');
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  const get = async path => (await fetch(base + path)).text();
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const count = html => (html.match(/data-testid="task-row"/g) || []).length;
  try {
    await start();
    let html = await get('/');
    assert.match(html, /<label for="project-filter">Project filter<\/label>/);
    assert.match(html, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(html, /data-testid="project-summary">0\/0 completed/);
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'First task' });
    await post('/projects/1/tasks', { title: 'Second task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    await get('/projects/1?filter=Open');
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    assert.equal((await post('/projects/1/archive')).status, 303);
    html = await get('/');
    assert.doesNotMatch(html, />Existing</);
    assert.match(html, />Second</);
    const archivedList = await get('/?filter=Archived');
    assert.match(archivedList, />Existing</);
    assert.match(archivedList, />Open project<\/button>/);
    assert.match(archivedList, />Restore project<\/button>/);
    assert.doesNotMatch(archivedList, />Archive project<\/button>|>Second</);
    assert.match(archivedList, /data-testid="project-summary">1\/2 completed/);
    const archivedPage = await get('/projects/1');
    assert.match(archivedPage, /<p>Archived project<\/p>/);
    assert.match(archivedPage, /<button type="submit" disabled>Create task<\/button>/);
    const checkboxes = archivedPage.match(/<input[^>]+type="checkbox"[^>]*>/g);
    assert.equal(checkboxes.length, 2);
    for (const checkbox of checkboxes) assert.match(checkbox, /disabled/);
    assert.equal(count(await get('/projects/1?filter=Open')), 1);
    assert.equal(count(await get('/projects/1?filter=Completed')), 1);
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1')).status, 403);
    assert.equal(await get('/projects/1'), archivedPage);
    await stop();
    await start();
    assert.equal(await get('/?filter=Archived'), archivedList);
    assert.equal(await get('/projects/1'), archivedPage);
    await post('/projects/1/restore');
    html = await get('/');
    assert.ok(html.indexOf('>Existing</') < html.indexOf('>Second</'));
    assert.match(html, /data-testid="project-summary">1\/2 completed/);
    assert.doesNotMatch(await get('/?filter=Archived'), /data-testid="project-row"/);
    html = await get('/projects/1');
    assert.doesNotMatch(html, /<(?:input|button)[^>]*\bdisabled\b|Archived project/);
    assert.match(html, /aria-label="Complete First task" checked/);
    await post('/projects/1/tasks/1');
    assert.match(await get('/'), /data-testid="project-summary">0\/2 completed/);
    await stop();
    await start();
    assert.match(await get('/'), />Existing</);
    assert.doesNotMatch(await get('/projects/1'), /<(?:input|button)[^>]*\bdisabled\b| checked/);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
