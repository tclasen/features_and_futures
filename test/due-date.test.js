import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('due dates validate Gregorian days, remain independent and persist through restart and restoration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-dates-'));
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
      try { if ((await fetch(`${base}/health`)).ok) return; } catch {}
      if (child.exitCode !== null) throw new Error('Server exited');
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Server did not start');
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = null;
  }
  async function request(path, method = 'GET', body) {
    return fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  }
  async function data(path, method, body) {
    const response = await request(path, method, body);
    assert.ok(response.ok);
    return response.json();
  }
  try {
    await start();
    const project = await data('/api/projects', 'POST', { name: 'Dates' });
    const otherProject = await data('/api/projects', 'POST', { name: 'Other' });
    const path = `/api/projects/${project.id}`;
    const initial = await data(`${path}/tasks`, 'POST', { title: 'First' });
    const other = await data(`${path}/tasks`, 'POST', { title: 'Second' });
    assert.equal(initial.due_date, '');
    const taskPath = `${path}/tasks/${initial.id}`;
    const saved = await data(taskPath, 'PATCH', { completed: true });
    await data(taskPath, 'PATCH', { priority: 'High' });
    const baseline = { ...saved, priority: 'High' };
    for (const date of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '1900-02-28']) {
      assert.deepEqual(await data(taskPath, 'PATCH', { due_date: `  ${date}  ` }), { ...baseline, due_date: date });
    }
    for (const date of ['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2023-02-29', '2024-04-31', '2024-00-01', '2024-13-01', '2024-01-00', '2024-1-01', '2024-01-1', '2024-01-01T00:00:00Z', 'nonsense', null]) {
      const response = await request(taskPath, 'PATCH', { due_date: date });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, 'Due date must be a valid YYYY-MM-DD date');
      assert.deepEqual((await data(`${path}/tasks`))[0], { ...baseline, due_date: '1900-02-28' });
    }
    assert.equal((await request(`/api/projects/${otherProject.id}/tasks/${initial.id}`, 'PATCH', { due_date: '2024-01-01' })).status, 404);
    await data(taskPath, 'PATCH', { due_date: '2025-12-31' });
    await data(taskPath, 'PATCH', { title: 'Renamed' });
    assert.deepEqual(await data(`${path}/tasks`), [{ ...baseline, title: 'Renamed', due_date: '2025-12-31' }, other]);
    const summary = await data(path);
    assert.equal(summary.completed, 1);
    assert.equal(summary.total, 2);
    await data(path, 'PATCH', { archived: true });
    assert.equal((await request(taskPath, 'PATCH', { due_date: '' })).status, 403);
    await stop();
    await start();
    assert.deepEqual(await data(`${path}/tasks`), [{ ...baseline, title: 'Renamed', due_date: '2025-12-31' }, other]);
    await data(path, 'PATCH', { archived: false });
    assert.deepEqual(await data(path), summary);
    for (const blank of ['   ', '']) {
      const cleared = await data(taskPath, 'PATCH', { due_date: blank });
      assert.deepEqual(cleared, { ...baseline, title: 'Renamed', due_date: '' });
    }
    await stop();
    await start();
    assert.equal((await data(`${path}/tasks`))[0].due_date, '');
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
