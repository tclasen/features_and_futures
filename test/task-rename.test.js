import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApplication } from '../app.js';

test('task renaming preserves order, ownership, completion, filters and persisted data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  let server;
  let url;
  async function start() {
    server = createApplication(join(directory, 'workboard.sqlite'));
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    url = `http://127.0.0.1:${server.address().port}`;
  }
  async function stop() {
    const closed = once(server, 'close');
    server.close();
    await closed;
    server = undefined;
  }
  const get = async path => (await fetch(url + path)).text();
  const post = (path, values = {}) => fetch(url + path, {
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
    assert.equal((original.match(/>Rename task<\/button>/g) ?? []).length, 2);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks/1/rename', { title });
      assert.equal(response.status, 422);
      assert.match(await response.text(), /role="alert">Task title is required/);
      assert.equal(await get('/projects/1'), original);
    }
    const summary = await get('/');
    const response = await post('/projects/1/tasks/1/rename', {
      title: '  Renamed <&>  ', filter: 'Completed',
    });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1?filter=Completed');
    const detail = await get('/projects/1');
    assert.match(detail, /aria-label="Complete Renamed &lt;&amp;&gt;" checked/);
    assert.match(detail, />Renamed &lt;&amp;&gt;<\/label>/);
    assert.ok(detail.indexOf('Complete Renamed') < detail.indexOf('Complete Pending'));
    assert.equal(await get('/'), summary);
    const completed = await get('/projects/1?filter=Completed');
    assert.match(completed, /Complete Renamed/);
    assert.doesNotMatch(completed, /Complete Pending/);
    const open = await get('/projects/1?filter=Open');
    assert.doesNotMatch(open, /Complete Renamed/);
    assert.match(open, /Complete Pending/);
    assert.doesNotMatch(await get('/projects/2'), /data-testid="task-row"/);
    assert.equal((await post('/projects/2/tasks/1/rename', { title: 'Wrong owner' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/rename', { title: 'Missing' })).status, 404);
    assert.equal(await get('/projects/1'), detail);
    await stop();
    await start();
    assert.equal(await get('/projects/1'), detail);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.equal((archived.match(/id="new-task-title-\d+"[^>]* disabled/g) ?? []).length, 2);
    assert.equal((archived.match(/disabled>Rename task/g) ?? []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Blocked' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), detail);
    assert.equal((await post('/projects/1/tasks/2/rename', { title: '  Still open  ', filter: 'Open' })).status, 303);
    await stop();
    await start();
    const restored = await get('/projects/1');
    assert.match(restored, /aria-label="Complete Still open"\s+onchange/);
    assert.match(restored, /aria-label="Complete Renamed &lt;&amp;&gt;" checked/);
    assert.equal(await get('/'), summary);
  } finally {
    if (server) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
