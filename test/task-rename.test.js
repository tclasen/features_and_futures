import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('task rename preserves ownership, order, completion, filters and persistence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(dir, 'db.sqlite') },
      stdio: ['ignore', 'pipe', 'inherit']
    });
    base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Startup timeout')), 5000);
      child.stdout.on('data', chunk => {
        const match = /listening on port (\d+)/.exec(String(chunk));
        if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
      });
    });
  }
  async function stop() { const exited = once(child, 'exit'); child.kill(); await exited; child = null; }
  const html = async path => (await fetch(base + path)).text();
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
  });
  try {
    await start();
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Original' });
    await post('/projects/1/tasks', { title: 'Later' });
    await post('/projects/1/tasks/1', { completed: '1' });
    let text = await html('/projects/1');
    assert.match(text, /<label for="new-task-title-1">New task title<\/label>/);
    assert.equal((text.match(/>Rename task<\/button>/g) || []).length, 2);
    for (const title of ['', '   ']) {
      text = await (await post('/projects/1/tasks/1/rename', { title })).text();
      assert.match(text, /role="alert">Task title is required/);
      assert.match(text, /aria-label="Complete Original" checked/);
    }
    assert.equal((await post('/projects/2/tasks/1/rename', { title: 'Wrong owner' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/rename', { title: 'Missing' })).status, 404);
    const response = await post('/projects/1/tasks/1/rename', { title: '  Renamed & done  ', filter: 'Completed' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1?filter=Completed');
    text = await html('/projects/1');
    assert.match(text, /aria-label="Complete Renamed &amp; done" checked/);
    assert.ok(text.indexOf('Complete Renamed') < text.indexOf('Complete Later'));
    assert.doesNotMatch(await html('/projects/1?filter=Open'), /Complete Renamed/);
    assert.match(await html('/projects/1?filter=Completed'), /Complete Renamed/);
    assert.doesNotMatch(await html('/projects/2'), /Complete Renamed/);
    assert.match(await html('/'), /1\/2 completed/);
    await stop();
    await start();
    assert.match(await html('/projects/1'), /aria-label="Complete Renamed &amp; done" checked/);
    await post('/projects/1/archive');
    text = await html('/projects/1');
    assert.equal((text.match(/name="title" type="text" disabled/g) || []).length, 2);
    assert.equal((text.match(/disabled>Rename task/g) || []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Forbidden' })).status, 403);
    await post('/projects/1/restore');
    assert.doesNotMatch(await html('/projects/1'), / disabled/);
    await post('/projects/1/tasks/1/rename', { title: 'Restored title' });
    await stop();
    await start();
    assert.match(await html('/projects/1'), /aria-label="Complete Restored title" checked/);
    assert.match(await html('/'), /1\/2 completed/);
  } finally {
    if (child) await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
