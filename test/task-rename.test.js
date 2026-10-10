import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('task rename preserves ownership, ordering, completion, filters and persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
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
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Other' });
    await post('/projects/1/tasks', { title: 'Original' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const before = await get('/projects/1');
    assert.match(before, /<label for="new-task-title-1">New task title<\/label>/);
    for (const title of ['', '   ']) {
      const response = await post('/projects/1/tasks/1/rename', { title });
      assert.equal(response.status, 200);
      assert.match(await response.text(), /role="alert">Task title is required/);
      assert.equal(await get('/projects/1'), before);
    }
    const result = await post('/projects/1/tasks/1/rename', {
      title: '  Renamed & <safe>  ', filter: 'Completed',
    });
    assert.equal(result.status, 303);
    assert.equal(result.headers.get('location'), '/projects/1?filter=Completed');
    const after = await get('/projects/1');
    assert.equal(after, before.replaceAll('Original', 'Renamed &amp; &lt;safe&gt;'));
    assert.match(after, /aria-label="Complete Renamed &amp; &lt;safe&gt;" checked/);
    assert.ok(after.indexOf('Complete Renamed') < after.indexOf('Complete Pending'));
    assert.match(await get('/projects/1?filter=Completed'), /Complete Renamed/);
    assert.doesNotMatch(await get('/projects/1?filter=Open'), /Complete Renamed/);
    assert.match(await get('/'), /1\/2 completed/);
    assert.doesNotMatch(await get('/projects/2'), /data-testid="task-row"/);
    assert.equal((await post('/projects/2/tasks/1/rename', { title: 'Wrong owner' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/rename', { title: 'Missing' })).status, 404);
    await stop();
    await start();
    assert.equal(await get('/projects/1'), after);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.match(archived, /id="new-task-title-1" name="title" type="text" disabled/);
    assert.match(archived, /<button type="submit" disabled>Rename task/);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Forbidden' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), after);
    await post('/projects/1/tasks/2/rename', { title: '  Still open  ', filter: 'Open' });
    await stop();
    await start();
    assert.equal(await get('/projects/1'), after.replaceAll('Pending', 'Still open'));
    assert.match(await get('/'), /1\/2 completed/);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
