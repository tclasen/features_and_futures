import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('project defaults migrate, persist independently, and affect only new tasks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-defaults-'));
  const dbPath = join(directory, 'db.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Legacy');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing', 1);`);
  db.close();
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    base = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', code => reject(new Error(`Unexpected exit ${code}`)));
      child.stdout.on('data', chunk => {
        const match = /listening on port (\d+)/.exec(String(chunk));
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
    });
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = null;
  }
  const post = (path, data = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
  });
  const page = async path => (await fetch(base + path)).text();
  const select = (html, id) => html.match(new RegExp(`<select id="${id}"[^>]*>[\\s\\S]*?<\\/select>`))[0];
  const selected = (html, id, value) => assert.match(select(html, id), new RegExp(`<option selected>${value}<`));
  const titles = html => [...html.matchAll(/aria-label="Complete ([^"]+)"/g)].map(match => match[1]);
  try {
    await start();
    let html = await page('/projects/1');
    selected(html, 'default-task-priority', 'Normal');
    selected(html, 'task-priority-1', 'Normal');
    assert.match(select(html, 'default-task-priority'), /<option>Low<\/option><option selected>Normal<\/option><option>High<\/option>/);
    await post('/projects', { name: 'Independent' });
    selected(await page('/projects/2'), 'default-task-priority', 'Normal');
    const query = '?filter=Completed&priorityFilter=Normal';
    const response = await post('/projects/1/default-priority' + query, { priority: 'High' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1' + query);
    html = await page(response.headers.get('location'));
    selected(html, 'task-filter', 'Completed');
    selected(html, 'priority-filter', 'Normal');
    selected(html, 'default-task-priority', 'High');
    assert.deepEqual(titles(html), ['Existing']);
    assert.match(html, /default-priority\?filter=Completed&amp;priorityFilter=Normal/);
    await post('/projects/1/tasks', { title: 'Inherited high' });
    await post('/projects/2/tasks', { title: 'Other normal' });
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Inherited low' });
    html = await page('/projects/1');
    assert.deepEqual(titles(html), ['Existing', 'Inherited high', 'Inherited low']);
    selected(html, 'task-priority-1', 'Normal');
    selected(html, 'task-priority-2', 'High');
    selected(html, 'task-priority-4', 'Low');
    selected(await page('/projects/2'), 'task-priority-3', 'Normal');
    await post('/projects/1/tasks/2/rename', { title: 'Renamed high' });
    await post('/projects/1/rename', { name: 'Renamed project' });
    assert.equal((await post('/projects/1/default-priority', { priority: 'Invalid' })).status, 400);
    selected(await page('/projects/1'), 'default-task-priority', 'Low');
    assert.match(await page('/'), /1\/3 completed/);
    await post('/projects/1/archive');
    html = await page('/projects/1' + query);
    assert.match(select(html, 'default-task-priority'), / disabled/);
    selected(html, 'default-task-priority', 'Low');
    assert.doesNotMatch(select(html, 'task-filter'), /disabled/);
    assert.doesNotMatch(select(html, 'priority-filter'), /disabled/);
    assert.equal((await post('/projects/1/default-priority', { priority: 'High' })).status, 403);
    await stop();
    await start();
    html = await page('/projects/1');
    selected(html, 'default-task-priority', 'Low');
    selected(html, 'task-priority-2', 'High');
    assert.match(html, /<h1>Renamed project<\/h1>/);
    assert.match(html, /aria-label="Complete Existing" checked/);
    await post('/projects/1/restore');
    html = await page('/projects/1');
    assert.doesNotMatch(select(html, 'default-task-priority'), /disabled/);
    await post('/projects/1/tasks', { title: 'After restoration' });
    selected(await page('/projects/1'), 'task-priority-5', 'Low');
    selected(await page('/projects/2'), 'default-task-priority', 'Normal');
    assert.match(await page('/'), /1\/4 completed/);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
