import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApplication } from '../app.js';

test('tasks validate, filter, remain project-owned, and persist completion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
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
  const post = (path, values) => fetch(url + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const titles = html => [...html.matchAll(/<label for="task-\d+">(.*?)<\/label>/g)].map(match => match[1]);
  try {
    await start();
    await post('/projects', { name: 'Alpha' });
    await post('/projects', { name: 'Beta' });
    let html = await get('/projects/1');
    assert.match(html, /<label for="task-title">Task title<\/label>/);
    assert.match(html, />Create task<\/button>/);
    assert.match(html, /<label for="task-filter">Task filter<\/label>/);
    assert.match(html, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 422);
      html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.deepEqual(titles(html), []);
    }
    for (const title of ['  First  ', 'Second <&"', 'Third']) {
      assert.equal((await post('/projects/1/tasks', { title })).status, 303);
    }
    await post('/projects/2/tasks', { title: 'Other project' });
    html = await get('/projects/1');
    assert.deepEqual(titles(html), ['First', 'Second &lt;&amp;&quot;', 'Third']);
    assert.equal((html.match(/data-testid="task-row"/g) ?? []).length, 3);
    assert.match(html, /aria-label="Complete First"/);
    assert.match(html, /aria-label="Complete Second &lt;&amp;&quot;"/);
    assert.doesNotMatch(html, / checked/);
    assert.deepEqual(titles(await get('/projects/2')), ['Other project']);
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Missing' })).status, 404);
    const response = await post('/projects/1/tasks/2', { completed: '1', filter: 'Open' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1?filter=Open');
    assert.deepEqual(titles(await get('/projects/1?filter=Open')), ['First', 'Third']);
    html = await get('/projects/1?filter=Completed');
    assert.deepEqual(titles(html), ['Second &lt;&amp;&quot;']);
    assert.match(html, / checked/);
    assert.match(html, /<option selected>Completed/);
    assert.equal(titles(await get('/projects/1?filter=invalid')).length, 3);
    const saved = await get('/projects/1');
    await stop();
    await start();
    assert.equal(await get('/projects/1'), saved);
    await post('/projects/1/tasks/2', {});
    assert.deepEqual(titles(await get('/projects/1?filter=Completed')), []);
    assert.equal(titles(await get('/projects/1?filter=Open')).length, 3);
    assert.equal((await post('/projects/1/tasks', { title: ' ' })).status, 422);
    assert.equal(titles(await get('/projects/1')).length, 3);
    await stop();
    await start();
    assert.deepEqual(titles(await get('/projects/1?filter=Completed')), []);
  } finally {
    if (server) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
