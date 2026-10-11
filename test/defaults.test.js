import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('project defaults migrate, inherit independently and persist without changing existing tasks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-defaults-'));
  const dbPath = join(directory, 'db.sqlite');
  const old = new DatabaseSync(dbPath);
  old.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
    INSERT INTO projects (name) VALUES ('Existing');
    INSERT INTO tasks (project_id, title, completed, priority) VALUES (1, 'Existing high', 1, 'High');`);
  old.close();
  let child, base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    base = await new Promise((resolve, reject) => {
      let output = '';
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = /listening on port (\d+)/.exec(output);
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
  const get = async path => (await fetch(base + path)).text();
  const post = (path, data = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
  });
  const selected = (html, id) => html.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`))[1].match(/<option selected>(.*?)<\/option>/)[1];
  const tasks = () => {
    const db = new DatabaseSync(dbPath);
    const rows = db.prepare('SELECT * FROM tasks ORDER BY id').all();
    db.close();
    return rows;
  };
  try {
    await start();
    assert.equal(selected(await get('/projects/1'), 'default-task-priority'), 'Normal');
    await post('/projects', { name: 'Second' });
    assert.equal(selected(await get('/projects/2'), 'default-task-priority'), 'Normal');
    await post('/projects/1/tasks', { title: 'Normal before change' });
    const before = tasks();
    const summary = await get('/');
    const filters = { filter: 'Completed', priorityFilter: 'High' };
    const location = '/projects/1?filter=Completed&priorityFilter=High';
    const initial = await get(location);
    assert.match(initial, /<select id="default-task-priority"[^>]*>\s*<option>Low<\/option><option selected>Normal<\/option><option>High<\/option>/);
    let response = await post('/projects/1/default-priority', { ...filters, priority: 'Low' });
    assert.equal(response.headers.get('location'), location);
    const changed = await get(location);
    assert.equal(selected(changed, 'default-task-priority'), 'Low');
    assert.equal(selected(changed, 'task-filter'), 'Completed');
    assert.equal(selected(changed, 'priority-filter'), 'High');
    assert.equal(changed.split('<section class="tasks"')[1], initial.split('<section class="tasks"')[1]);
    assert.deepEqual(tasks(), before);
    assert.equal(await get('/'), summary);
    assert.equal(selected(await get('/projects/2'), 'default-task-priority'), 'Normal');
    response = await post('/projects/1/default-priority', { ...filters, priority: 'Invalid' });
    assert.equal(response.status, 400);
    await post('/projects/1/tasks', { title: 'Inherited low' });
    await post('/projects/2/tasks', { title: 'Independent normal' });
    assert.deepEqual(tasks().map(task => task.priority), ['High', 'Normal', 'Low', 'Normal']);
    await post('/projects/1/default-priority', { priority: 'High' });
    await post('/projects/1/tasks', { title: 'Inherited high' });
    await post('/projects/1/tasks/3/rename', { title: 'Renamed low' });
    await post('/projects/1/rename', { name: 'Renamed project' });
    const saved = tasks();
    assert.deepEqual(saved.map(task => task.priority), ['High', 'Normal', 'Low', 'Normal', 'High']);
    await post('/projects/1/archive');
    const archived = await get(location);
    assert.match(archived, /id="default-task-priority"[^>]* disabled/);
    assert.equal(selected(archived, 'default-task-priority'), 'High');
    assert.equal((await post('/projects/1/default-priority', { priority: 'Low' })).status, 403);
    await stop();
    await start();
    assert.equal(await get(location), archived);
    assert.deepEqual(tasks(), saved);
    await post('/projects/1/restore');
    const restored = await get(location);
    assert.doesNotMatch(restored.match(/<select id="default-task-priority"[^>]*>/)[0], /disabled/);
    assert.equal(selected(restored, 'default-task-priority'), 'High');
    await post('/projects/1/tasks', { title: 'High after restart' });
    assert.equal(tasks().at(-1).priority, 'High');
    await post('/projects/1/default-priority', { priority: 'Normal' });
    await post('/projects/1/tasks', { title: 'Normal again' });
    assert.equal(tasks().at(-1).priority, 'Normal');
    assert.deepEqual(tasks().slice(0, saved.length), saved);
    assert.match(await get('/'), /1\/6 completed/);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
