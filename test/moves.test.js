import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

const base = 'http://127.0.0.1:18081';
async function request(path, method = 'GET', body) {
  const response = await fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}

test('moves append, preserve task data and summaries, reject archived projects, and persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-moves-'));
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '18081', DB_PATH: join(directory, 'db.sqlite') }, stdio: 'ignore',
    });
    for (let i = 0; i < 100; i++) {
      try { if ((await request('/health')).status === 200) return; } catch {}
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
  try {
    await start();
    const a = (await request('/api/projects', 'POST', { name: 'A' })).data;
    const b = (await request('/api/projects', 'POST', { name: 'B' })).data;
    const ap = `/api/projects/${a.id}`;
    const bp = `/api/projects/${b.id}`;
    const moved = (await request(`${ap}/tasks`, 'POST', { title: 'Move me' })).data;
    const remaining = (await request(`${ap}/tasks`, 'POST', { title: 'Remain' })).data;
    const existing = (await request(`${bp}/tasks`, 'POST', { title: 'Existing' })).data;
    const taskPath = `${ap}/tasks/${moved.id}`;
    for (const body of [{ priority: 'High' }, { completed: true }, { due_date: '0001-01-01' }]) {
      assert.equal((await request(taskPath, 'PATCH', body)).status, 200);
    }
    const saved = (await request(`${ap}/tasks`)).data[0];
    await request(bp, 'PATCH', { default_priority: 'Low' });
    const move = destination_project_id => request(taskPath, 'PATCH', { destination_project_id });
    assert.equal((await move(a.id)).status, 400);
    assert.equal((await move(999999)).status, 404);
    await request(bp, 'PATCH', { archived: true });
    assert.equal((await move(b.id)).status, 409);
    await request(bp, 'PATCH', { archived: false });
    await request(ap, 'PATCH', { archived: true });
    assert.equal((await move(b.id)).status, 409);
    await request(ap, 'PATCH', { archived: false });
    const result = await move(b.id);
    assert.equal(result.status, 200);
    assert.deepEqual(result.data, { ...saved, project_id: b.id });
    assert.deepEqual((await request(`${ap}/tasks`)).data, [remaining]);
    assert.deepEqual((await request(`${bp}/tasks`)).data, [existing, result.data]);
    assert.equal((await request(taskPath, 'PATCH', { completed: false })).status, 404);
    const summaryA = (await request(ap)).data;
    const summaryB = (await request(bp)).data;
    assert.deepEqual([summaryA.completed, summaryA.total, summaryB.completed, summaryB.total], [0, 1, 1, 2]);
    const newTask = (await request(`${bp}/tasks`, 'POST', { title: 'After move' })).data;
    assert.equal(newTask.priority, 'Low');
    await stop();
    await start();
    assert.deepEqual((await request(`${bp}/tasks`)).data, [existing, result.data, newTask]);
    const returned = await request(`${bp}/tasks/${moved.id}`, 'PATCH', { destination_project_id: a.id });
    assert.deepEqual(returned.data, saved);
    assert.deepEqual((await request(`${ap}/tasks`)).data, [saved, remaining]);
    assert.deepEqual((await request(`${bp}/tasks`)).data, [existing, newTask]);
    // Blank dates and priorities are preserved on a separate move.
    const blankMove = await request(`${bp}/tasks/${existing.id}`, 'PATCH', { destination_project_id: a.id });
    assert.deepEqual(blankMove.data, { ...existing, project_id: a.id });
    await stop();
    await start();
    assert.deepEqual((await request(`${ap}/tasks`)).data, [saved, remaining, blankMove.data]);

    // Remember both projects independently; return in reverse departure order.
    const transfer = async (from, task, to) => {
      const response = await request(`${from}/tasks/${task.id}`, 'PATCH', { destination_project_id: to.id });
      assert.equal(response.status, 200);
      return response.data;
    };
    await transfer(ap, moved, b);
    await transfer(ap, remaining, b);
    const later = (await request(`${ap}/tasks`, 'POST', { title: 'Created while away' })).data;
    await request(ap, 'PATCH', { name: 'Renamed A' });
    await request(ap, 'PATCH', { archived: true });
    assert.equal((await request(`${bp}/tasks/${remaining.id}`, 'PATCH', { destination_project_id: a.id })).status, 409);
    await stop();
    await start();
    await request(ap, 'PATCH', { archived: false });
    await request(`${bp}/tasks/${moved.id}`, 'PATCH', { title: 'Current title' });
    await request(`${bp}/tasks/${moved.id}`, 'PATCH', { priority: 'Low' });
    await request(`${bp}/tasks/${moved.id}`, 'PATCH', { completed: false });
    await request(`${bp}/tasks/${moved.id}`, 'PATCH', { due_date: '2028-02-29' });
    await transfer(bp, remaining, a);
    const current = await transfer(bp, moved, a);
    assert.deepEqual(current, { ...saved, title: 'Current title', priority: 'Low', completed: false, due_date: '2028-02-29' });
    assert.deepEqual((await request(`${ap}/tasks`)).data, [current, remaining, blankMove.data, later]);
    // B's remembered order is also retained, including positions of absent tasks.
    await transfer(ap, remaining, b);
    await transfer(ap, moved, b);
    await transfer(ap, existing, b);
    await stop();
    await start();
    assert.deepEqual((await request(`${bp}/tasks`)).data.map(task => task.id), [existing.id, moved.id, newTask.id, remaining.id]);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
