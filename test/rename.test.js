import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApplication } from '../server.js';

test('rename preserves identity, order, tasks and summaries; validates and respects archives', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const dbPath = join(directory, 'database.sqlite');
  let server;
  let url;
  const start = async () => {
    server = createApplication(dbPath);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    url = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  const post = (path, values = {}) => fetch(`${url}${path}`, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const html = async path => (await fetch(`${url}${path}`)).text();
  const tasks = text => [...text.matchAll(/<li[^>]*data-testid="task-row"[^>]*>[\s\S]*?<\/li>/g)].map(match => match[0]);
  try {
    await start();
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1/completion', { completed: '1' });
    const original = await html('/projects/1');
    assert.match(original, /<label for="new-project-name">New project name<\/label>/);
    assert.match(original, /<button type="submit">Rename project<\/button>/);
    for (const name of ['', ' \t\n ']) {
      const result = await post('/projects/1/rename', { name });
      assert.equal(result.status, 400);
      assert.match(await result.text(), /role="alert">Project name is required/);
      assert.equal(await html('/projects/1'), original);
    }
    const renamed = await post('/projects/1/rename', { name: '  New <name> & "title"  ', filter: 'Completed' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    let detail = await html('/projects/1');
    assert.match(detail, /<h1>New &lt;name&gt; &amp; &quot;title&quot;<\/h1>/);
    assert.deepEqual(tasks(detail), tasks(original));
    let list = await html('/');
    assert.ok(list.indexOf('New &lt;name&gt;') < list.indexOf('<span>Second</span>'));
    assert.match(list, /action="\/projects\/1"/);
    assert.match(list, /data-testid="project-summary">1\/2 completed/);
    await stop();
    await start();
    assert.equal(await html('/projects/1'), detail);
    assert.equal(await html('/'), list);
    await post('/projects/1/archive');
    detail = await html('/projects/1');
    assert.match(detail, /id="new-project-name"[^>]* disabled/);
    assert.match(detail, /<button type="submit" disabled>Rename project<\/button>/);
    assert.equal((await post('/projects/1/rename', { name: 'Forbidden' })).status, 403);
    assert.equal(await html('/projects/1'), detail);
    await stop();
    await start();
    assert.equal(await html('/projects/1'), detail);
    await post('/projects/1/restore');
    detail = await html('/projects/1');
    assert.doesNotMatch(detail, / disabled/);
    assert.deepEqual(tasks(detail), tasks(original));
    assert.equal((await post('/projects/1/rename', { name: 'Restored name' })).status, 303);
    await stop();
    await start();
    assert.match(await html('/projects/1'), /<h1>Restored name<\/h1>/);
    assert.deepEqual(tasks(await html('/projects/1')), tasks(original));
    list = await html('/');
    assert.ok(list.indexOf('<span>Restored name</span>') < list.indexOf('<span>Second</span>'));
    assert.match(list, /1\/2 completed/);
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
    assert.equal((await post('/projects/99999999999999999999/rename', { name: 'Missing' })).status, 404);
  } finally {
    if (server?.listening) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
