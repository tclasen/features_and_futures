import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('project defaults migrate, remain independent, and persist without modifying existing tasks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-defaults-'));
  const path = join(directory, 'db.sqlite');
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
    INSERT INTO projects VALUES (1, 'Legacy', 0);
    INSERT INTO tasks VALUES (1, 1, 'Legacy task', 1, 'Low');`);
  db.close();
  const port = 20000 + Math.floor(Math.random() * 20000);
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port), DB_PATH: path }, stdio: ['ignore', 'ignore', 'inherit'] });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Server not healthy');
  }
  async function stop() { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; child = undefined; }
  async function api(path, method = 'GET', body) {
    const response = await fetch(`http://127.0.0.1:${port}/api${path}`, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  }
  const project = () => api('/projects/1');
  const patch = body => api('/projects/1', 'PATCH', body);
  const tasks = () => api('/projects/1/tasks');
  const add = title => api('/projects/1/tasks', 'POST', { title });
  try {
    await start();
    assert.equal((await project()).data.default_priority, 'Normal');
    const original = (await tasks()).data[0];
    const second = (await api('/projects', 'POST', { name: 'Other' })).data;
    assert.equal(second.default_priority, 'Normal');
    for (const value of ['Urgent', '', null, 1]) assert.equal((await patch({ default_priority: value })).status, 400);
    assert.equal((await patch({ default_priority: 'High' })).status, 200);
    const high = (await add('High task')).data;
    assert.equal(high.priority, 'High');
    await patch({ default_priority: 'Low' });
    const low = (await add('Low task')).data;
    assert.equal(low.priority, 'Low');
    assert.deepEqual((await tasks()).data, [original, high, low]);
    const otherTask = (await api(`/projects/${second.id}/tasks`, 'POST', { title: 'Other task' })).data;
    assert.equal(otherTask.priority, 'Normal');
    await patch({ name: 'Renamed' });
    await patch({ archived: true });
    assert.equal((await patch({ default_priority: 'Normal' })).status, 409);
    await stop();
    await start();
    const saved = (await project()).data;
    assert.equal(saved.default_priority, 'Low');
    assert.equal(saved.name, 'Renamed');
    assert.equal(saved.archived, 1);
    assert.equal(saved.total, 3);
    assert.equal(saved.completed, 1);
    assert.deepEqual((await tasks()).data, [original, high, low]);
    await patch({ archived: false });
    assert.equal((await add('Restored task')).data.priority, 'Low');
    await patch({ default_priority: 'Normal' });
    assert.equal((await add('Normal task')).data.priority, 'Normal');
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
