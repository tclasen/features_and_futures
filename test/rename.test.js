import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const base = await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Server start timed out')); }, 5000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) { clearTimeout(timeout); resolve(`http://127.0.0.1:${match[1]}`); }
    });
  });
  return {
    base,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('task rename preserves order, completion, ownership, filters, and persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  let server;
  try {
    const dbPath = join(directory, 'projects.sqlite');
    server = await start(dbPath);
    const get = async path => (await fetch(`${server.base}${path}`)).text();
    const post = (path, fields = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Other' });
    await post('/projects/1/tasks', { title: 'Original' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1', { completed: '1' });
    assert.match(await get('/projects/1'), /New task title<\/label>/);
    for (const title of ['', '   ']) {
      const response = await post('/projects/1/tasks/1/rename', { title });
      assert.equal(response.status, 400);
      assert.match(await response.text(), /role="alert">Task title is required/);
      assert.match(await get('/projects/1'), /Complete Original" checked/);
    }
    const response = await post('/projects/1/tasks/1/rename', {
      title: '  <Renamed & task>  ', filter: 'Completed',
    });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1?filter=Completed');
    const detail = await get('/projects/1');
    assert.match(detail, /Complete &lt;Renamed &amp; task&gt;" checked/);
    assert.ok(detail.indexOf('&lt;Renamed &amp; task&gt;') < detail.indexOf('Pending'));
    assert.doesNotMatch(detail, /Original/);
    assert.doesNotMatch(await get('/projects/1?filter=Open'), /Renamed/);
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /Pending/);
    assert.doesNotMatch(await get('/projects/2'), /Renamed/);
    assert.equal((await post('/projects/2/tasks/1/rename', { title: 'Stolen' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/rename', { title: 'Missing' })).status, 404);
    assert.equal((await post('/projects/999/tasks/1/rename', { title: 'Missing' })).status, 404);
    assert.match(await get('/'), /1\/2 completed/);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), detail);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.match(archived, /id="new-task-title-1"[^>]* disabled/);
    assert.match(archived, /id="new-task-title-2"[^>]* disabled/);
    assert.equal((archived.match(/disabled>Rename task/g) || []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Blocked' })).status, 403);
    await post('/projects/1/restore');
    assert.doesNotMatch(await get('/projects/1'), / disabled/);
    await post('/projects/1/tasks/1/rename', { title: 'Restored title' });
    await post('/projects/1/tasks/2/rename', { title: 'Open renamed', filter: 'Open' });
    await server.stop();
    server = await start(dbPath);
    assert.match(await get('/projects/1'), /Complete Restored title" checked/);
    assert.match(await get('/projects/1?filter=Open'), /Complete Open renamed" onchange/);
    assert.match(await get('/'), /1\/2 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('rename preserves identity, order, tasks, archive protections, and persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  let server;
  try {
    const dbPath = join(directory, 'projects.sqlite');
    server = await start(dbPath);
    const get = async path => (await fetch(`${server.base}${path}`)).text();
    const post = (path, fields = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1', { completed: '1' });
    assert.match(await get('/projects/1'), /<label for="new-project-name">New project name<\/label>/);
    for (const name of ['', '   ']) {
      const result = await post('/projects/1/rename', { name });
      assert.equal(result.status, 400);
      assert.match(await result.text(), /role="alert">Project name is required/);
      assert.match(await get('/projects/1'), /<h1>Original<\/h1>/);
    }
    const result = await post('/projects/1/rename', { name: '  <Renamed & project>  ', filter: 'Completed' });
    assert.equal(result.status, 303);
    assert.equal(result.headers.get('location'), '/projects/1?filter=Completed');
    const detail = await get('/projects/1');
    assert.match(detail, /<h1>&lt;Renamed &amp; project&gt;<\/h1>/);
    assert.match(detail, /Complete Done" checked/);
    assert.match(detail, /Complete Pending" onchange/);
    const list = await get('/');
    assert.ok(list.indexOf('&lt;Renamed &amp; project&gt;') < list.indexOf('Second'));
    assert.match(list, /1\/2 completed/);
    assert.match(list, /action="\/projects\/1"/);
    assert.doesNotMatch(list, /Original/);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), detail);
    assert.equal(await get('/'), list);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.match(archived, /id="new-project-name"[^>]* disabled/);
    assert.match(archived, /<button type="submit" disabled>Rename project/);
    assert.equal((await post('/projects/1/rename', { name: 'Blocked' })).status, 403);
    assert.match(await get('/?filter=Archived'), /&lt;Renamed &amp; project&gt;/);
    await post('/projects/1/restore');
    assert.doesNotMatch(await get('/projects/1'), / disabled/);
    assert.equal((await post('/projects/1/rename', { name: 'Restored name' })).status, 303);
    await server.stop();
    server = await start(dbPath);
    assert.match(await get('/projects/1'), /<h1>Restored name<\/h1>/);
    assert.match(await get('/projects/1'), /Complete Done" checked/);
    assert.match(await get('/'), /1\/2 completed/);
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
