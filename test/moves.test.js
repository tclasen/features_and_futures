import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('moves remember return order, preserve task data and summaries, and reject archived projects', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-moves-'));
  const port = 20000 + Math.floor(Math.random() * 30000);
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'db.sqlite') },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`${base}/health`)).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Server not healthy');
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  const send = (path, body, method = 'PATCH') => fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const get = async path => (await fetch(base + path)).json();
  try {
    await start();
    const a = await (await send('/api/projects', { name: 'A' }, 'POST')).json();
    const b = await (await send('/api/projects', { name: 'B' }, 'POST')).json();
    const tasks = id => `/api/projects/${id}/tasks`;
    const older = await (await send(tasks(a.id), { title: 'Older' }, 'POST')).json();
    const existing = await (await send(tasks(b.id), { title: 'Existing' }, 'POST')).json();
    const taskPath = `${tasks(a.id)}/${older.id}`;
    await send(taskPath, { priority: 'High' });
    await send(taskPath, { completed: true });
    await send(taskPath, { due_date: '0001-01-01' });
    await send(`/api/projects/${b.id}`, { default_priority: 'Low' });
    assert.equal((await send(taskPath, { destination_project_id: a.id })).status, 400);
    assert.equal((await send(taskPath, { destination_project_id: 999999 })).status, 400);
    await send(`/api/projects/${b.id}`, { archived: true });
    assert.equal((await send(taskPath, { destination_project_id: b.id })).status, 409);
    await send(`/api/projects/${b.id}`, { archived: false });
    const moved = await (await send(taskPath, { destination_project_id: b.id })).json();
    assert.deepEqual(moved, { ...older, project_id: b.id, completed: true, priority: 'High', due_date: '0001-01-01' });
    assert.deepEqual(await get(tasks(a.id)), []);
    assert.deepEqual(await get(tasks(b.id)), [existing, moved]);
    const projects = await get('/api/projects');
    assert.equal(projects[0].total, 0);
    assert.equal(projects[0].completed, 0);
    assert.equal(projects[1].total, 2);
    assert.equal(projects[1].completed, 1);
    await stop();
    await start();
    assert.deepEqual(await get(tasks(b.id)), [existing, moved]);
    const newTask = await (await send(tasks(a.id), { title: 'New' }, 'POST')).json();
    const movedPath = `${tasks(b.id)}/${older.id}`;
    await send(`/api/projects/${b.id}`, { archived: true });
    assert.equal((await send(movedPath, { destination_project_id: a.id })).status, 409);
    await send(`/api/projects/${b.id}`, { archived: false });
    assert.equal((await send(movedPath, { destination_project_id: a.id })).status, 200);
    assert.deepEqual(await get(tasks(a.id)), [{ ...moved, project_id: a.id }, newTask]);
    const blank = await (await send(`${tasks(b.id)}/${existing.id}`, { destination_project_id: a.id })).json();
    assert.equal(blank.due_date, '');
    await stop();
    await start();
    assert.deepEqual((await get(tasks(a.id))).map(task => task.id), [older.id, newTask.id, existing.id]);
    assert.deepEqual(await get(tasks(b.id)), []);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
