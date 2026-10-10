import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('priorities migrate, persist independently, and respect ownership and archiving', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  const dbPath = join(directory, 'db.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('First'), ('Second');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing', 1);`);
  db.close();
  const port = 40000 + Math.floor(Math.random() * 10000);
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
  function priority(html, id, value, disabled = false) {
    assert.match(html, new RegExp(`<label for="task-priority-${id}">Task priority</label>`));
    assert.match(html, new RegExp(`<select id="task-priority-${id}" name="priority"${disabled ? ' disabled' : ''} onchange="this.form.requestSubmit\\(\\)">\\s*${['Low', 'Normal', 'High'].map(option => `<option${option === value ? ' selected' : ''}>${option}</option>`).join('')}\\s*</select>`));
  }
  try {
    await start();
    await post('/projects/1/tasks', { title: 'New' });
    await post('/projects/2/tasks', { title: 'Other' });
    let html = await get('/projects/1');
    priority(html, 1, 'Normal');
    priority(html, 2, 'Normal');
    for (const value of ['Low', 'High', 'Normal', 'High']) {
      const response = await post('/projects/1/tasks/1/priority', { priority: value, filter: 'Completed' });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/projects/1?filter=Completed');
      priority(await get('/projects/1?filter=Completed'), 1, value);
    }
    await post('/projects/1/tasks/2/priority', { priority: 'Low' });
    await post('/projects/1/tasks/1/rename', { title: 'Renamed' });
    html = await get('/projects/1');
    priority(html, 1, 'High');
    priority(html, 2, 'Low');
    assert.match(html, /aria-label="Complete Renamed" checked/);
    assert.ok(html.indexOf('for="task-1"') < html.indexOf('for="task-2"'));
    priority(await get('/projects/2'), 3, 'Normal');
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    assert.doesNotMatch(await get('/projects/1?filter=Open'), /Complete Renamed/);
    for (const [path, status, value] of [
      ['/projects/2/tasks/1/priority', 404, 'Low'],
      ['/projects/1/tasks/999/priority', 404, 'High'],
      ['/projects/1/tasks/1/priority', 400, 'Urgent'],
    ]) assert.equal((await post(path, { priority: value })).status, status);
    assert.equal(await get('/projects/1'), html);
    await stop();
    await start();
    assert.equal(await get('/projects/1'), html);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    priority(archived, 1, 'High', true);
    priority(archived, 2, 'Low', true);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Low' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await stop();
    await start();
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), html);
    await post('/projects/1/tasks/1/priority', { priority: 'Low' });
    priority(await get('/projects/1'), 1, 'Low');
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
