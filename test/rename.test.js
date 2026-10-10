import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';

test('rename preserves identity, ordering and tasks, persists, and respects archive state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
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
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Open' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const detail = await get('/projects/1');
    assert.match(detail, /<label for="new-project-name">New project name<\/label>/);
    assert.match(detail, /<button type="submit">Rename project<\/button>/);
    for (const name of ['', '  \t ']) {
      const result = await post('/projects/1/rename', { name });
      assert.equal(result.status, 400);
      assert.match(await result.text(), /role="alert">Project name is required/);
      assert.equal(await get('/projects/1'), detail);
    }
    const result = await post('/projects/1/rename', { name: '  Renamed & <safe>  ', filter: 'Completed' });
    assert.equal(result.status, 303);
    assert.equal(result.headers.get('location'), '/projects/1?filter=Completed');
    const renamed = await get('/projects/1');
    assert.equal(renamed, detail.replace('<h1>Original</h1>', '<h1>Renamed &amp; &lt;safe&gt;</h1>'));
    const list = await get('/');
    assert.ok(list.indexOf('>Renamed &amp; &lt;safe&gt;<') < list.indexOf('>Second<'));
    assert.match(list, /1\/2 completed/);
    await stop();
    await start();
    assert.equal(await get('/projects/1'), renamed);
    assert.equal(await get('/'), list);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.match(archived, /id="new-project-name"[^>]* disabled/);
    assert.match(archived, /<button type="submit" disabled>Rename project/);
    assert.equal((await post('/projects/1/rename', { name: 'Forbidden' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await stop();
    await start();
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), renamed);
    await post('/projects/1/rename', { name: 'Restored' });
    assert.match(await get('/projects/1'), /<h1>Restored<\/h1>/);
    assert.match(await get('/'), /1\/2 completed/);
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
