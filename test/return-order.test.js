import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('legacy order migrates and multiple returns recover durable per-project positions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-return-'));
  const path = join(dir, 'db.sqlite');
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('A'), ('B'), ('C');
    INSERT INTO tasks (project_id, title, position) VALUES (1, 'First', 10), (1, 'Second', 20), (1, 'Third', 30), (2, 'B first', 5);`);
  db.close();
  let child, base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '0', DB_PATH: path }, stdio: ['ignore', 'pipe', 'inherit'] });
    base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Startup timeout')), 5000);
      child.stdout.on('data', chunk => {
        const match = /listening on port (\d+)/.exec(String(chunk));
        if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
      });
    });
  }
  async function stop() { const exit = once(child, 'exit'); child.kill(); await exit; child = null; }
  async function post(url, values = {}) {
    const response = await fetch(base + url, { method: 'POST', body: new URLSearchParams(values), redirect: 'manual' });
    assert.equal(response.status, 303);
  }
  async function rows(project) {
    const html = await (await fetch(`${base}/projects/${project}`)).text();
    return [...html.matchAll(/aria-label="Complete ([^"]+)"/g)].map(match => match[1]);
  }
  const move = (project, task, destination) => post(`/projects/${project}/tasks/${task}/move`, { destination });
  try {
    await start();
    assert.deepEqual(await rows(1), ['First', 'Second', 'Third']);
    await move(1, 1, 2);
    await move(1, 2, 2);
    await move(1, 3, 2);
    // New positions must come after even the absent tasks' reserved positions.
    await post('/projects/1/tasks', { title: 'New' });
    await move(2, 4, 1);
    await post('/projects/2/tasks/1/rename', { title: 'First updated' });
    await post('/projects/2/tasks/1/priority', { priority: 'High' });
    await post('/projects/2/tasks/1', { completed: '1' });
    await post('/projects/2/tasks/1/due-date', { due_date: '0001-01-01' });
    await post('/projects/1/rename', { name: 'A renamed' });
    await post('/projects/1/archive');
    await stop(); await start();
    await post('/projects/1/restore');
    await move(2, 3, 1);
    await move(2, 2, 1);
    await move(2, 1, 1);
    assert.deepEqual(await rows(1), ['First updated', 'Second', 'Third', 'New', 'B first']);
    // B also remembers its original task ahead of its subsequent arrivals.
    await move(1, 3, 2);
    await move(1, 1, 2);
    await move(1, 4, 2);
    await move(1, 2, 2);
    await stop(); await start();
    assert.deepEqual(await rows(2), ['B first', 'First updated', 'Second', 'Third']);
    const html = await (await fetch(base + '/projects/2')).text();
    assert.match(html, /aria-label="Complete First updated" checked/);
    assert.match(html, /<option selected>High/);
    assert.match(html, /value="0001-01-01"/);
    assert.deepEqual(await rows(1), ['New']);
  } finally {
    if (child) await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
