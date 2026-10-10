import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('project defaults migrate, apply only to future tasks, and persist independently', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-default-'));
  const dbPath = join(dir, 'db.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Legacy');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing', 1);`);
  legacy.close();
  let child, url;
  const start = async () => {
    child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe'] });
    url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Startup timeout')), 5000);
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Exited ${code}`)); });
      child.stdout.on('data', chunk => {
        const match = chunk.toString().match(/listening on port (\d+)/);
        if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
      });
    });
  };
  const stop = async () => { const exited = once(child, 'exit'); child.kill(); await exited; child = null; };
  const post = (path, values = {}) => fetch(url + path, { method: 'POST', body: new URLSearchParams(values), redirect: 'manual' });
  const page = path => fetch(url + path).then(r => r.text());
  const defaultSelect = html => html.match(/<select id="default-task-priority"[^>]*>[\s\S]*?<\/select>/)[0];
  const taskPriorities = html => [...html.matchAll(/<select id="task-priority-\d+"[^>]*>[\s\S]*?<option selected>(.*?)<\/option>/g)].map(m => m[1]);
  try {
    await start();
    await post('/projects', { name: 'Second' });
    for (const id of [1, 2]) {
      const select = defaultSelect(await page(`/projects/${id}`));
      assert.deepEqual([...select.matchAll(/<option(?: selected)?>(.*?)<\/option>/g)].map(m => m[1]), ['Low', 'Normal', 'High']);
      assert.match(select, /<option selected>Normal/);
    }
    const filtered = '/projects/1?filter=Completed&priorityFilter=Normal';
    const before = await page(filtered);
    const changed = await post('/projects/1/default-priority', { priority: 'High', filter: 'Completed', priorityFilter: 'Normal' });
    assert.equal(changed.status, 303);
    assert.equal(changed.headers.get('location'), filtered);
    const after = await page(filtered);
    assert.equal(after.replace(defaultSelect(after), ''), before.replace(defaultSelect(before), ''));
    assert.match(defaultSelect(after), /<option selected>High/);
    await post('/projects/1/tasks', { title: 'Inherited high' });
    await post('/projects/2/tasks', { title: 'Independent' });
    assert.deepEqual(taskPriorities(await page('/projects/1')), ['Normal', 'High']);
    assert.deepEqual(taskPriorities(await page('/projects/2')), ['Normal']);
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Inherited low' });
    await post('/projects/1/tasks/2/rename', { title: 'Renamed task' });
    await post('/projects/1/rename', { name: 'Renamed project' });
    assert.equal((await post('/projects/1/default-priority', { priority: 'Invalid' })).status, 400);
    assert.deepEqual(taskPriorities(await page('/projects/1')), ['Normal', 'High', 'Low']);
    assert.match(await page('/'), /1\/3 completed/);
    let detail = await page('/projects/1');
    await stop(); await start();
    assert.equal(await page('/projects/1'), detail);
    await post('/projects/1/archive');
    detail = await page('/projects/1');
    assert.match(defaultSelect(detail), / disabled/);
    assert.match(defaultSelect(detail), /<option selected>Low/);
    assert.equal((await post('/projects/1/default-priority', { priority: 'High' })).status, 403);
    await stop(); await start();
    assert.equal(await page('/projects/1'), detail);
    assert.deepEqual(taskPriorities(await page(filtered)), ['Normal']);
    await post('/projects/1/restore');
    assert.doesNotMatch(defaultSelect(await page('/projects/1')), / disabled/);
    await post('/projects/1/tasks', { title: 'Restored low' });
    assert.deepEqual(taskPriorities(await page('/projects/1')), ['Normal', 'High', 'Low', 'Low']);
    assert.match(defaultSelect(await page('/projects/2')), /<option selected>Normal/);
    assert.match(await page('/'), /1\/4 completed/);
  } finally {
    if (child) await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
