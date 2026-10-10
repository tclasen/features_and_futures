import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('project priority defaults migrate, affect only new tasks, and persist independently', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-default-'));
  const dbPath = join(directory, 'db.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Existing');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Original', 1);`);
  db.close();
  const port = 30000 + Math.floor(Math.random() * 10000);
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
  function selected(html, id, value, disabled = false) {
    const select = html.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`));
    assert.ok(select, id);
    assert.equal(select[0].includes(' disabled'), disabled);
    assert.equal(select[1].trim(), ['Low', 'Normal', 'High'].map(option => `<option${option === value ? ' selected' : ''}>${option}</option>`).join(''));
  }
  try {
    await start();
    selected(await get('/projects/1'), 'default-task-priority', 'Normal');
    await post('/projects', { name: 'Second' });
    selected(await get('/projects/2'), 'default-task-priority', 'Normal');
    await post('/projects/1/tasks', { title: 'Before' });
    const filteredPath = '/projects/1?filter=Completed&priorityFilter=Normal';
    const before = await get(filteredPath);
    const result = await post('/projects/1/default-priority', {
      priority: 'High', filter: 'Completed', priorityFilter: 'Normal',
    });
    assert.equal(result.status, 303);
    assert.equal(result.headers.get('location'), filteredPath);
    const after = await get(filteredPath);
    selected(after, 'default-task-priority', 'High');
    assert.equal(after.replace('<option selected>High</option>', '<option>High</option>').replace('<option>Normal</option>', '<option selected>Normal</option>'), before);
    await post('/projects/1/tasks', { title: 'Inherited High' });
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Inherited Low' });
    await post('/projects/2/tasks', { title: 'Independent' });
    await post('/projects/1/rename', { name: 'Renamed project' });
    await post('/projects/1/tasks/3/rename', { title: 'Renamed task' });
    let html = await get('/projects/1');
    selected(html, 'task-priority-1', 'Normal');
    selected(html, 'task-priority-2', 'Normal');
    selected(html, 'task-priority-3', 'High');
    selected(html, 'task-priority-4', 'Low');
    selected(await get('/projects/2'), 'task-priority-5', 'Normal');
    assert.match(html, /aria-label="Complete Original" checked/);
    assert.match(await get('/'), /data-testid="project-summary">1\/4 completed/);
    assert.equal((await post('/projects/1/default-priority', { priority: 'Urgent' })).status, 400);
    assert.equal((await post('/projects/999/default-priority', { priority: 'Low' })).status, 404);
    assert.equal(await get('/projects/1'), html);
    await stop();
    await start();
    assert.equal(await get('/projects/1'), html);
    await post('/projects/1/archive');
    selected(await get('/projects/1'), 'default-task-priority', 'Low', true);
    assert.equal((await post('/projects/1/default-priority', { priority: 'High' })).status, 403);
    await stop();
    await start();
    selected(await get('/projects/1'), 'default-task-priority', 'Low', true);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), html);
    await post('/projects/1/tasks', { title: 'After restoration' });
    selected(await get('/projects/1'), 'task-priority-6', 'Low');
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
