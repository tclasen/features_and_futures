import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('deletion preserves fields, filters, reserved order and persistence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-deletion-'));
  const dbPath = join(dir, 'db.sqlite');
  const base = 'http://127.0.0.1:18089';
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '18089', DB_PATH: dbPath }, stdio: 'ignore' });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + '/health')).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error('Server not ready');
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited;
    }
  }
  const post = (path, values = {}) => fetch(base + path, { method: 'POST', body: new URLSearchParams(values), redirect: 'manual' });
  const get = async path => (await fetch(base + path)).text();
  const snapshot = () => {
    const db = new DatabaseSync(dbPath);
    const task = { ...db.prepare('SELECT * FROM tasks WHERE id = 1').get() };
    const positions = db.prepare('SELECT * FROM task_positions WHERE task_id = 1 ORDER BY project_id').all();
    db.close(); return { task, positions };
  };
  try {
    await start();
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Keep Me' });
    await post('/projects/1/tasks/1', { completed: '1' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2028-02-29' });
    await post('/projects/1/tasks/1/notes', { notes: '  <b>Unicode 🐱</b>\n ' });
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    const before = snapshot();
    const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2028-01-01', dueThrough: '2028-12-31', search: 'keep' };
    const deleted = await post('/projects/1/tasks/1/delete', state);
    const location = deleted.headers.get('location');
    for (const [key, value] of Object.entries(state)) assert.equal(new URL(location, base).searchParams.get(key), value);
    assert.doesNotMatch(await get(location), /data-testid="task-row"/);
    for (const filter of ['All', 'Open', 'Completed']) assert.doesNotMatch(await get('/projects/1?filter=' + filter), /data-testid="task-row"/);
    assert.match(await get('/'), /0\/0 completed/);
    assert.deepEqual(snapshot(), { task: { ...before.task, deleted: 1 }, positions: before.positions });
    let html = await get('/projects/1?filter=Deleted');
    assert.match(html, /Restore task/);
    assert.doesNotMatch(html, />Delete task</);
    for (const label of ['Save due date', 'Save notes', 'Move task', 'Rename task']) assert.ok(html.includes('disabled>' + label));
    assert.match(html, /aria-label="Complete Keep Me" checked disabled/);
    assert.match(html, /name="priority" disabled/);
    assert.match(html, /name="destination" disabled/);
    assert.match(html, /name="notes" rows="4" disabled/);
    assert.doesNotMatch(await get('/projects/1?filter=Deleted&priorityFilter=Low'), /data-testid="task-row"/);
    assert.doesNotMatch(await get('/projects/1?filter=Deleted&search=Unicode'), /data-testid="task-row"/);
    assert.doesNotMatch(await get('/projects/1?filter=Deleted&dueThrough=2027-01-01'), /data-testid="task-row"/);
    for (const [suffix, body] of [['', { completed: '0' }], ['/rename', { title: 'Bad' }], ['/notes', { notes: 'Bad' }], ['/priority', { priority: 'Low' }], ['/due-date', { dueDate: '' }], ['/move', { destination: '2' }]]) {
      assert.equal((await post('/projects/1/tasks/1' + suffix, body)).status, 403);
    }
    await post('/projects/1/tasks', { title: 'Later' });
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/archive');
    html = await get('/projects/1?filter=Deleted');
    assert.match(html, /disabled>Restore task/);
    assert.equal((await post('/projects/1/tasks/1/restore')).status, 403);
    await stop(); await start();
    assert.deepEqual(snapshot(), { task: { ...before.task, deleted: 1 }, positions: before.positions });
    await post('/projects/1/restore');
    const restored = await post('/projects/1/tasks/1/restore', { ...state, filter: 'Deleted' });
    assert.doesNotMatch(await get(restored.headers.get('location')), /data-testid="task-row"/);
    assert.deepEqual(snapshot(), before);
    html = await get('/projects/1');
    assert.ok(html.indexOf('for="task-1"') < html.indexOf('for="task-2"'));
    assert.match(await get('/'), /1\/2 completed/);
    await post('/projects/1/tasks/1/move', { destination: '2' });
    assert.match(await get('/projects/2'), /Complete Keep Me/);
  } finally { await stop(); await rm(dir, { recursive: true, force: true }); }
});
