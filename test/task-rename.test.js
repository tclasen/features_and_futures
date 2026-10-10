import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('task rename preserves ownership, order, completion, filters and persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  const port = 50000 + Math.floor(Math.random() * 10000);
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'db.sqlite') },
      stdio: 'ignore',
    });
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error('Server exited');
      try { if ((await fetch(base + '/health')).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Server did not start');
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  const get = async path => (await fetch(base + path)).text();
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  try {
    await start();
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Original' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await get('/projects/1');
    assert.match(original, /<label for="new-task-title-1">New task title<\/label>/);
    assert.equal((original.match(/>Rename task<\/button>/g) || []).length, 2);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks/1/rename', { title, filter: 'Completed' });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.match(html, /aria-label="Complete Original" checked/);
      assert.equal(await get('/projects/1'), original);
    }
    assert.equal((await post('/projects/2/tasks/1/rename', { title: 'Wrong owner' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/rename', { title: 'Missing' })).status, 404);
    const response = await post('/projects/1/tasks/1/rename', { title: '  Renamed <&"title>  ', filter: 'Completed' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1?filter=Completed');
    const renamed = await get('/projects/1');
    assert.match(renamed, /aria-label="Complete Renamed &lt;&amp;&quot;title&gt;" checked/);
    assert.ok(renamed.indexOf('for="task-1"') < renamed.indexOf('for="task-2"'));
    assert.equal((renamed.match(/data-testid="task-row"/g) || []).length, 2);
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    assert.doesNotMatch(await get('/projects/2'), /data-testid="task-row"/);
    assert.doesNotMatch(await get('/projects/1?filter=Open'), /Complete Renamed/);
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /Complete Pending/);
    await stop();
    await start();
    assert.equal(await get('/projects/1'), renamed);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.equal((archived.match(/<input id="new-task-title-\d+"[^>]* disabled>/g) || []).length, 2);
    assert.equal((archived.match(/<button type="submit" disabled>Rename task<\/button>/g) || []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Blocked' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await stop();
    await start();
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), renamed);
    await post('/projects/1/tasks/2/rename', { title: '  Open renamed  ', filter: 'Open' });
    assert.match(await get('/projects/1?filter=Open'), /aria-label="Complete Open renamed"\s+onchange/);
    await stop();
    await start();
    assert.match(await get('/projects/1'), /Complete Open renamed/);
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
