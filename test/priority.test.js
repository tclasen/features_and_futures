import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('priorities migrate, remain independent, and survive edits, archive, and restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  const dbPath = join(dir, 'db.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('One'), ('Two');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Legacy', 1), (2, 'Other project', 0);`);
  legacy.close();
  let child;
  let url;
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
  const priorities = html => [...html.matchAll(/<select id="task-priority-\d+"[^>]*>([\s\S]*?)<\/select>/g)].map(match => {
    assert.deepEqual([...match[1].matchAll(/<option(?: selected)?>(.*?)<\/option>/g)].map(m => m[1]), ['Low', 'Normal', 'High']);
    return match[1].match(/<option selected>(.*?)<\/option>/)[1];
  });
  try {
    await start();
    assert.deepEqual(priorities(await page('/projects/1')), ['Normal']);
    await post('/projects/1/tasks', { title: 'New' });
    assert.deepEqual(priorities(await page('/projects/1')), ['Normal', 'Normal']);
    assert.equal((await post('/projects/2/tasks/1/priority', { priority: 'High' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Urgent' })).status, 400);
    const changed = await post('/projects/1/tasks/1/priority', { priority: 'High', filter: 'Completed' });
    assert.equal(changed.status, 303);
    assert.equal(changed.headers.get('location'), '/projects/1?filter=Completed');
    await post('/projects/1/tasks/3/priority', { priority: 'Low' });
    assert.deepEqual(priorities(await page('/projects/1')), ['High', 'Low']);
    assert.deepEqual(priorities(await page('/projects/2')), ['Normal']);
    await post('/projects/1/tasks/1/rename', { title: 'Renamed' });
    await post('/projects/1/rename', { name: 'Renamed project' });
    let detail = await page('/projects/1');
    assert.match(detail, /aria-label="Complete Renamed" checked/);
    assert.ok(detail.indexOf('Complete Renamed') < detail.indexOf('Complete New'));
    assert.deepEqual(priorities(detail), ['High', 'Low']);
    assert.deepEqual(priorities(await page('/projects/1?filter=Completed')), ['High']);
    assert.deepEqual(priorities(await page('/projects/1?filter=Open')), ['Low']);
    assert.match(await page('/'), /1\/2 completed/);
    await stop(); await start();
    assert.equal(await page('/projects/1'), detail);
    await post('/projects/1/archive');
    detail = await page('/projects/1');
    assert.equal((detail.match(/<select id="task-priority-\d+"[^>]* disabled/g) || []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Low' })).status, 403);
    await stop(); await start();
    assert.equal(await page('/projects/1'), detail);
    await post('/projects/1/restore');
    detail = await page('/projects/1');
    assert.doesNotMatch(detail, /<select id="task-priority-\d+"[^>]* disabled/);
    assert.deepEqual(priorities(detail), ['High', 'Low']);
    await post('/projects/1/tasks/1/priority', { priority: 'Normal' });
    await post('/projects/1/tasks/3', { completed: '1' });
    assert.deepEqual(priorities(await page('/projects/1')), ['Normal', 'Low']);
    assert.match(await page('/'), /2\/2 completed/);
  } finally {
    if (child) await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
