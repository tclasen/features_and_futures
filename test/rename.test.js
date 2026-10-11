import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('rename preserves identity, order, tasks and summaries; archives prevent rename', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
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
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Open' });
    await post('/projects/1/tasks/1', { completed: '1' });
    assert.match(await html('/projects/1'), /<label for="new-project-name">New project name<\/label>/);
    for (const name of ['', '   ']) {
      const response = await post('/projects/1/rename', { name });
      const text = await response.text();
      assert.match(text, /role="alert">Project name is required/);
      assert.match(text, /<h1>Original<\/h1>/);
    }
    const renamed = await post('/projects/1/rename', { name: '  Renamed & better  ', filter: 'Open' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Open');
    let text = await html('/');
    assert.ok(text.indexOf('Renamed &amp; better') < text.indexOf('Second'));
    assert.match(text, /1\/2 completed/);
    text = await html('/projects/1');
    assert.match(text, /<h1>Renamed &amp; better<\/h1>/);
    assert.match(text, /aria-label="Complete Done" checked/);
    assert.match(text, /aria-label="Complete Open"/);
    await stop();
    await start();
    assert.match(await html('/projects/1'), /<h1>Renamed &amp; better<\/h1>/);
    await post('/projects/1/archive');
    text = await html('/projects/1');
    assert.match(text, /id="new-project-name" name="name" type="text" disabled/);
    assert.match(text, /<button type="submit" disabled>Rename project/);
    assert.equal((await post('/projects/1/rename', { name: 'Forbidden' })).status, 403);
    assert.match(await html('/?filter=Archived'), /Renamed &amp; better/);
    await post('/projects/1/restore');
    assert.doesNotMatch(await html('/projects/1'), / disabled/);
    await post('/projects/1/rename', { name: 'Restored' });
    await stop();
    await start();
    assert.match(await html('/projects/1'), /<h1>Restored<\/h1>/);
    assert.match(await html('/projects/1'), /aria-label="Complete Done" checked/);
    assert.match(await html('/'), /1\/2 completed/);
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
  } finally {
    if (child) await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
