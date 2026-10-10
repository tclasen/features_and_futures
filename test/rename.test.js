import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('rename preserves project identity, ordering, tasks, and persisted state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'db.sqlite') },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const port = await new Promise((resolve, reject) => {
      let output = '';
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) resolve(match[1]);
      });
      child.once('error', reject);
      child.once('exit', code => reject(new Error(`Server exited: ${code}`)));
    });
    base = `http://127.0.0.1:${port}`;
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }
  const get = async path => (await fetch(base + path)).text();
  const post = (path, data = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
  });
  try {
    await start();
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const before = await get('/projects/1');
    assert.match(before, /<label for="new-project-name">New project name<\/label>/);
    for (const name of ['', '   ']) {
      const response = await post('/projects/1/rename', { name });
      assert.equal(response.status, 200);
      assert.match(await response.text(), /role="alert">Project name is required/);
      assert.match(await get('/projects/1'), /<h1>Original<\/h1>/);
    }
    const renamed = await post('/projects/1/rename', { name: '  Renamed & <safe>  ', filter: 'Open' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Open');
    const after = await get('/projects/1');
    assert.equal(after, before.replace('<h1>Original</h1>', '<h1>Renamed &amp; &lt;safe&gt;</h1>'));
    const list = await get('/');
    assert.ok(list.indexOf('Renamed &amp; &lt;safe&gt;') < list.indexOf('Second'));
    assert.match(list, /data-testid="project-summary">1\/2 completed/);
    assert.match(list, /action="\/projects\/1"/);
    await stop();
    await start();
    assert.equal(await get('/projects/1'), after);
    assert.equal(await get('/'), list);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.match(archived, /id="new-project-name" name="name" type="text" disabled/);
    assert.match(archived, /<button type="submit" disabled>Rename project/);
    assert.equal((await post('/projects/1/rename', { name: 'Forbidden' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), after);
    await post('/projects/1/rename', { name: 'Restored name' });
    await stop();
    await start();
    assert.equal(await get('/projects/1'), before.replace('<h1>Original</h1>', '<h1>Restored name</h1>'));
    assert.match(await get('/'), /1\/2 completed/);
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
