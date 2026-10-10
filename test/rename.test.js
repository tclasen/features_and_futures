import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApplication } from '../app.js';

test('rename validates and preserves identity, order, tasks, archive protection and persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  let url;
  async function start() {
    server = createApplication(databasePath);
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
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await get('/projects/1');
    assert.match(original, /<label for="new-project-name">New project name<\/label>/);
    assert.match(original, /<button type="submit">Rename project<\/button>/);
    for (const name of ['', ' \t\n ']) {
      const response = await post('/projects/1/rename', { name });
      assert.equal(response.status, 422);
      const html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.match(html, /<h1>Original<\/h1>/);
      assert.equal(await get('/projects/1'), original);
    }
    const response = await post('/projects/1/rename', { name: '  Renamed <&>  ', filter: 'Completed' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1?filter=Completed');
    let detail = await get('/projects/1');
    assert.match(detail, /<h1>Renamed &lt;&amp;&gt;<\/h1>/);
    assert.match(detail, /aria-label="Complete Done" checked/);
    assert.match(detail, /aria-label="Complete Pending"\s+onchange/);
    assert.equal((detail.match(/data-testid="task-row"/g) ?? []).length, 2);
    const list = await get('/');
    assert.ok(list.indexOf('Renamed') < list.indexOf('Second'));
    assert.match(list, /1\/2 completed/);
    assert.match(list, /action="\/projects\/1" method="get"/);
    await stop();
    await start();
    assert.equal(await get('/projects/1'), detail);
    assert.equal(await get('/'), list);
    await post('/projects/1/archive');
    detail = await get('/projects/1');
    assert.match(detail, /<input id="new-project-name"[^>]* disabled>/);
    assert.match(detail, /<button type="submit" disabled>Rename project/);
    assert.equal((await post('/projects/1/rename', { name: 'Blocked' })).status, 403);
    assert.equal(await get('/projects/1'), detail);
    await post('/projects/1/restore');
    detail = await get('/projects/1');
    assert.doesNotMatch(detail, /<(?:input|button)\b[^>]*\bdisabled/);
    assert.equal((await post('/projects/1/rename', { name: 'Restored name' })).status, 303);
    await stop();
    await start();
    assert.match(await get('/projects/1'), /<h1>Restored name<\/h1>/);
    assert.match(await get('/'), /Restored name[\s\S]*1\/2 completed/);
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
  } finally {
    if (server) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
