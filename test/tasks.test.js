import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApplication } from '../server.js';

test('tasks validate, filter, isolate ownership, toggle and persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
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
  const post = (path, values) => fetch(`${url}${path}`, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const html = async path => (await fetch(`${url}${path}`)).text();
  const rows = text => [...text.matchAll(/<li class="task"[^>]*>[\s\S]*?<\/li>/g)].map(match => match[0]);
  try {
    await start();
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    let detail = await html('/projects/1');
    assert.match(detail, /<label for="task-title">Task title<\/label>/);
    assert.match(detail, />Create task<\/button>/);
    assert.match(detail, /<label for="task-filter">Task filter<\/label>/);
    assert.match(detail, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      assert.match(await response.text(), /role="alert">Task title is required/);
      assert.equal(rows(await html('/projects/1')).length, 0);
    }
    for (const title of ['  First task  ', 'Second <task> & "quoted"']) {
      assert.equal((await post('/projects/1/tasks', { title })).status, 303);
    }
    detail = await html('/projects/1');
    assert.equal(rows(detail).length, 2);
    assert.match(rows(detail)[0], /aria-label="Complete First task"/);
    assert.doesNotMatch(detail, / checked/);
    assert.match(rows(detail)[1], /Second &lt;task&gt; &amp; &quot;quoted&quot;/);
    assert.equal(rows(await html('/projects/2')).length, 0);
    assert.equal(rows(await html('/projects/1?filter=Open')).length, 2);
    assert.equal(rows(await html('/projects/1?filter=Completed')).length, 0);
    // Model the browser's hidden unchecked value followed by its checked value.
    const response = await post('/projects/1/tasks/1/completion', [['completed', '0'], ['completed', '1'], ['filter', 'Open']]);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1?filter=Open');
    assert.match(rows(await html('/projects/1'))[0], / checked/);
    assert.match(rows(await html('/projects/1?filter=Open'))[0], /Second &lt;task&gt;/);
    assert.match(rows(await html('/projects/1?filter=Completed'))[0], /First task/);
    assert.equal((await post('/projects/2/tasks/1/completion', { completed: '0' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1/completion', { completed: 'invalid' })).status, 400);
    assert.equal((await post('/projects/999/tasks', { title: 'Missing' })).status, 404);
    const saved = await html('/projects/1');
    await stop();
    await start();
    assert.equal(await html('/projects/1'), saved);
    assert.equal(rows(await html('/projects/2')).length, 0);
    await post('/projects/1/tasks/1/completion', { completed: '0' });
    assert.equal(rows(await html('/projects/1?filter=Completed')).length, 0);
    assert.equal(rows(await html('/projects/1?filter=Open')).length, 2);
    const beforeInvalid = await html('/projects/1');
    await post('/projects/1/tasks', { title: ' ' });
    assert.equal(await html('/projects/1'), beforeInvalid);
  } finally {
    if (server?.listening) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
