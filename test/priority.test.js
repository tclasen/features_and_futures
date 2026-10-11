import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('priorities migrate, remain independent and persist with archive protection', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  const dbPath = join(dir, 'db.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('First'), ('Second');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing', 1);`);
  db.close();
  let child, base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: dbPath },
      stdio: ['ignore', 'pipe', 'inherit']
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
  const priority = (text, id) => text.match(new RegExp(`<select id="task-priority-${id}"[^>]*>([\\s\\S]*?)</select>`))?.[1];
  try {
    await start();
    await post('/projects/1/tasks', { title: 'New' });
    await post('/projects/2/tasks', { title: 'Other' });
    let text = await html('/projects/1');
    const normal = '\n<option>Low</option><option selected>Normal</option><option>High</option>\n';
    assert.equal(priority(text, 1), normal);
    assert.equal(priority(text, 2), normal);
    const response = await post('/projects/1/tasks/1/priority', { priority: 'High', filter: 'Completed' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1?filter=Completed');
    await post('/projects/1/tasks/2/priority', { priority: 'Low' });
    assert.equal((await post('/projects/2/tasks/1/priority', { priority: 'Low' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Urgent' })).status, 400);
    await post('/projects/1/tasks/1/rename', { title: 'Renamed' });
    await stop();
    await start();
    text = await html('/projects/1');
    assert.match(priority(text, 1), /<option selected>High/);
    assert.match(priority(text, 2), /<option selected>Low/);
    assert.equal(priority(await html('/projects/2'), 3), normal);
    assert.match(text, /aria-label="Complete Renamed" checked/);
    assert.ok(text.indexOf('Complete Renamed') < text.indexOf('Complete New'));
    assert.doesNotMatch(await html('/projects/1?filter=Open'), /Complete Renamed/);
    assert.match(await html('/projects/1?filter=Completed'), /Complete Renamed/);
    assert.match(await html('/'), /1\/2 completed/);
    await post('/projects/1/archive');
    text = await html('/projects/1');
    assert.equal((text.match(/id="task-priority-\d+" name="priority" disabled/g) || []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Normal' })).status, 403);
    await stop();
    await start();
    await post('/projects/1/restore');
    text = await html('/projects/1');
    assert.doesNotMatch(text, / disabled/);
    assert.match(priority(text, 1), /<option selected>High/);
    assert.match(priority(text, 2), /<option selected>Low/);
    await post('/projects/1/tasks/1/priority', { priority: 'Normal' });
    assert.equal(priority(await html('/projects/1'), 1), normal);
  } finally {
    if (child) await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
