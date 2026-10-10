import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';

test('task renaming preserves completion, order, ownership and persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'db.sqlite') }, stdio: 'ignore',
    });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + '/health')).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Server did not start');
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = undefined;
  }
  const post = (path, data = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
  });
  const get = async path => (await fetch(base + path)).text();
  try {
    await start();
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Original' });
    await post('/projects/1/tasks', { title: 'Later' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await get('/projects/1');
    assert.match(original, /<label for="new-task-title-1">New task title<\/label>/);
    assert.match(original, /<button type="submit">Rename task<\/button>/);
    for (const title of ['', '  \t ']) {
      const result = await post('/projects/1/tasks/1/rename', { title });
      assert.equal(result.status, 400);
      assert.match(await result.text(), /role="alert">Task title is required/);
      assert.equal(await get('/projects/1'), original);
    }
    assert.equal((await post('/projects/2/tasks/1/rename', { title: 'Wrong owner' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/rename', { title: 'Missing' })).status, 404);
    const result = await post('/projects/1/tasks/1/rename', { title: '  Renamed & <safe>  ', filter: 'Completed' });
    assert.equal(result.status, 303);
    assert.equal(result.headers.get('location'), '/projects/1?filter=Completed');
    const renamed = await get('/projects/1');
    assert.equal(renamed, original.replaceAll('Original', 'Renamed &amp; &lt;safe&gt;'));
    assert.match(renamed, /aria-label="Complete Renamed &amp; &lt;safe&gt;" checked/);
    assert.ok(renamed.indexOf('Complete Renamed') < renamed.indexOf('Complete Later'));
    assert.match(await get('/projects/1?filter=Completed'), /Complete Renamed/);
    assert.doesNotMatch(await get('/projects/1?filter=Open'), /Complete Renamed/);
    assert.doesNotMatch(await get('/projects/2'), /Complete Renamed/);
    assert.match(await get('/'), /1\/2 completed/);
    await stop();
    await start();
    assert.equal(await get('/projects/1'), renamed);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.match(archived, /id="new-task-title-1"[^>]* disabled/);
    assert.match(archived, /id="new-task-title-2"[^>]* disabled/);
    assert.equal((archived.match(/<button type="submit" disabled>Rename task/g) || []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Forbidden' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await stop();
    await start();
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), renamed);
    await post('/projects/1/tasks/1/rename', { title: 'Restored' });
    assert.match(await get('/projects/1'), /aria-label="Complete Restored" checked/);
    assert.match(await get('/'), /1\/2 completed/);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
