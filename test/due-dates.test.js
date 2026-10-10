import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('due dates migrate, validate calendar days, stay isolated, and persist across restoration and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-dates-'));
  const path = join(directory, 'db.sqlite');
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
    INSERT INTO projects VALUES (1, 'Legacy', 0, 'High');
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
  const tasks = () => api('/projects/1/tasks');
  const patch = body => api('/projects/1/tasks/1', 'PATCH', body);
  try {
    await start();
    const original = (await tasks()).data[0];
    assert.equal(original.due_date, '');
    const second = (await api('/projects/1/tasks', 'POST', { title: 'New' })).data;
    assert.equal(second.due_date, '');
    const other = (await api('/projects', 'POST', { name: 'Other' })).data;
    const otherTask = (await api(`/projects/${other.id}/tasks`, 'POST', { title: 'Other task' })).data;
    for (const date of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '1900-02-28', '2025-04-30']) {
      const result = await patch({ due_date: `  ${date}  ` });
      assert.equal(result.status, 200);
      assert.deepEqual(result.data, { ...original, due_date: date });
    }
    for (const date of ['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2025-02-29', '2024-04-31', '2024-13-01', '2024-00-01', '2024-01-00', '2024-01-32', '2024-1-01', '2024-01-1', '2024-01-01T00:00:00Z', 'not a date', null, 20240101]) {
      const result = await patch({ due_date: date });
      assert.equal(result.status, 400, String(date));
      assert.match(result.data.error, /Due date must be a valid YYYY-MM-DD date/);
      assert.equal((await tasks()).data[0].due_date, '2025-04-30');
    }
    for (const date of ['', ' \t\n ']) {
      assert.equal((await patch({ due_date: date })).data.due_date, '');
      await patch({ due_date: '2024-02-29' });
    }
    assert.equal((await api(`/projects/${other.id}/tasks/1`, 'PATCH', { due_date: '2024-01-01' })).status, 404);
    await patch({ title: 'Renamed' });
    await patch({ priority: 'High' });
    await patch({ completed: false });
    const savedTasks = (await tasks()).data;
    assert.deepEqual(savedTasks, [{ ...original, title: 'Renamed', priority: 'High', completed: false, due_date: '2024-02-29' }, second]);
    assert.deepEqual((await api(`/projects/${other.id}/tasks`)).data, [otherTask]);
    const summary = (await api('/projects/1')).data;
    await patch({ due_date: '0004-02-29' });
    assert.deepEqual((await api('/projects/1')).data, summary);
    await patch({ due_date: '2024-02-29' });
    await api('/projects/1', 'PATCH', { archived: true });
    assert.equal((await patch({ due_date: '' })).status, 409);
    await stop();
    await start();
    assert.deepEqual((await tasks()).data, savedTasks);
    await api('/projects/1', 'PATCH', { archived: false });
    assert.equal((await patch({ due_date: '9999-12-31' })).data.due_date, '9999-12-31');
    await stop();
    await start();
    assert.equal((await tasks()).data[0].due_date, '9999-12-31');
    assert.equal((await patch({ due_date: '' })).data.due_date, '');
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
