import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';

test('moves append, preserve identity and data, enforce active ownership, and persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-move-'));
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'db.sqlite') },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + '/health')).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Server did not start');
  }
  async function stop() {
    const exit = once(child, 'exit');
    child.kill('SIGTERM');
    await exit;
    child = null;
  }
  async function request(path, method = 'GET', body, status = 200) {
    const response = await fetch(base + path, {
      method, ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }),
    });
    assert.equal(response.status, status);
    return response.json();
  }
  const projectPath = id => `/api/projects/${id}`;
  const taskPath = id => `${projectPath(id)}/tasks`;
  try {
    await start();
    const a = await request('/api/projects', 'POST', { name: 'Source' }, 201);
    const b = await request('/api/projects', 'POST', { name: 'Destination' }, 201);
    const c = await request('/api/projects', 'POST', { name: 'Archived' }, 201);
    const moved = await request(taskPath(a.id), 'POST', { title: 'Moved' }, 201);
    const remaining = await request(taskPath(a.id), 'POST', { title: 'Remaining' }, 201);
    const existing = await request(taskPath(b.id), 'POST', { title: 'Existing' }, 201);
    const editPath = `${taskPath(a.id)}/${moved.id}`;
    await request(editPath, 'PATCH', { completed: true });
    await request(editPath, 'PATCH', { priority: 'High' });
    const saved = await request(editPath, 'PATCH', { due_date: '0001-02-28' });
    await request(projectPath(b.id), 'PATCH', { default_priority: 'Low' });
    await request(projectPath(c.id), 'PATCH', { archived: true });
    for (const destination of [a.id, c.id, 999999, '2', null]) {
      await request(editPath, 'PATCH', { destination_project_id: destination }, 400);
    }
    await request(projectPath(a.id), 'PATCH', { archived: true });
    await request(editPath, 'PATCH', { destination_project_id: b.id }, 403);
    await request(projectPath(a.id), 'PATCH', { archived: false });
    const result = await request(editPath, 'PATCH', { destination_project_id: b.id });
    assert.deepEqual(result, { ...saved, project_id: b.id });
    assert.deepEqual(await request(taskPath(a.id)), [remaining]);
    assert.deepEqual(await request(taskPath(b.id)), [existing, result]);
    await request(editPath, 'PATCH', { title: 'Wrong owner' }, 404);
    let summary = await request(projectPath(a.id));
    assert.equal(summary.total, 1);
    assert.equal(summary.completed, 0);
    summary = await request(projectPath(b.id));
    assert.equal(summary.total, 2);
    assert.equal(summary.completed, 1);
    const newest = await request(taskPath(b.id), 'POST', { title: 'Newest' }, 201);
    assert.equal(newest.priority, 'Low');
    assert.deepEqual(await request(taskPath(b.id)), [existing, result, newest]);
    await stop();
    await start();
    assert.deepEqual(await request(taskPath(b.id)), [existing, result, newest]);
    const back = await request(`${taskPath(b.id)}/${moved.id}`, 'PATCH', { destination_project_id: a.id });
    assert.deepEqual(back, saved);
    assert.deepEqual(await request(taskPath(a.id)), [remaining, saved]);
    // Undated tasks also preserve their blank date when moved.
    const blank = await request(`${taskPath(b.id)}/${existing.id}`, 'PATCH', { destination_project_id: a.id });
    assert.equal(blank.due_date, '');
    assert.deepEqual(await request(taskPath(a.id)), [remaining, saved, blank]);
    await stop();
    await start();
    assert.deepEqual(await request(taskPath(a.id)), [remaining, saved, blank]);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
