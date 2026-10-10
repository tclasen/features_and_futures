import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('defaults migrate, stay independent, affect only future tasks, and survive restoration and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-defaults-'));
  const dbPath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
    INSERT INTO projects (name) VALUES ('Existing project');
    INSERT INTO tasks (project_id, title, completed, priority) VALUES
      (1, 'Existing high', 1, 'High'), (1, 'Existing low', 0, 'Low');
  `);
  legacy.close();
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const port = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Startup timed out')), 5000);
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    base = `http://127.0.0.1:${port}`;
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const done = once(child, 'exit');
    child.kill('SIGTERM');
    await done;
    child = undefined;
  }
  async function api(path, method = 'GET', body, status = 200) {
    const response = await fetch(`${base}/api/projects${path}`, {
      method, ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }),
    });
    assert.equal(response.status, status);
    return response.json();
  }
  try {
    await start();
    assert.equal((await api('/1')).default_priority, 'Normal');
    const original = await api('/1/tasks');
    const second = await api('', 'POST', { name: 'Second project' }, 201);
    assert.equal(second.default_priority, 'Normal');
    const normal = await api('/1/tasks', 'POST', { title: 'Normal inherited' }, 201);
    assert.equal(normal.priority, 'Normal');
    for (const value of ['', 'Urgent', 'high', null, 1]) {
      await api('/1', 'PATCH', { default_priority: value }, 400);
      assert.equal((await api('/1')).default_priority, 'Normal');
    }
    await api('/99999', 'PATCH', { default_priority: 'High' }, 404);
    await api('/1', 'PATCH', { default_priority: 'High' });
    assert.deepEqual(await api('/1/tasks'), [...original, normal]);
    const high = await api('/1/tasks', 'POST', { title: '  High inherited  ' }, 201);
    assert.equal(high.priority, 'High');
    assert.equal(high.title, 'High inherited');
    assert.equal(high.completed, false);
    await api(`/${second.id}`, 'PATCH', { default_priority: 'Low' });
    const low = await api(`/${second.id}/tasks`, 'POST', { title: 'Other low' }, 201);
    assert.equal(low.priority, 'Low');
    assert.equal((await api('/1')).default_priority, 'High');
    await api('/1', 'PATCH', { default_priority: 'Normal' });
    await api('/1', 'PATCH', { default_priority: 'High' });
    const renamed = await api(`/1/tasks/${high.id}`, 'PATCH', { title: 'Renamed high' });
    assert.deepEqual(renamed, { ...high, title: 'Renamed high' });
    await api('/1', 'PATCH', { name: 'Renamed project' });
    assert.equal((await api('/1')).default_priority, 'High');
    const expectedTasks = [...original, normal, renamed];
    assert.deepEqual(await api('/1/tasks'), expectedTasks);
    const summaries = await api('');
    assert.deepEqual(summaries.map(({ id, total, completed }) => ({ id, total, completed })), [
      { id: 1, total: 4, completed: 1 }, { id: second.id, total: 1, completed: 0 },
    ]);
    await api('/1', 'PATCH', { archived: true });
    await api('/1', 'PATCH', { default_priority: 'Low' }, 409);
    assert.equal((await api('/1')).default_priority, 'High');
    await stop();
    await start();
    assert.deepEqual(await api(''), summaries.map((project) => project.id === 1 ? { ...project, archived: 1 } : project));
    assert.deepEqual(await api('/1/tasks'), expectedTasks);
    assert.deepEqual(await api(`/${second.id}/tasks`), [low]);
    await api('/1', 'PATCH', { archived: false });
    const restored = await api('/1/tasks', 'POST', { title: 'After restoration' }, 201);
    assert.equal(restored.priority, 'High');
    await api('/1', 'PATCH', { default_priority: 'Low' });
    await stop();
    await start();
    assert.equal((await api('/1')).default_priority, 'Low');
    assert.deepEqual(await api('/1/tasks'), [...expectedTasks, restored]);
    const latest = await api('/1/tasks', 'POST', { title: 'After second restart' }, 201);
    assert.equal(latest.priority, 'Low');
    assert.deepEqual(await api(`/${second.id}/tasks`), [low]);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
