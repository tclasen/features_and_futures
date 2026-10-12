import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApplication } from '../server.js';

test('task rename preserves ownership, order, completion and persistence, and respects archives', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
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
  const rows = text => [...text.matchAll(/<li[^>]*data-testid="task-row"[^>]*>[\s\S]*?<\/li>/g)].map(match => match[0]);
  try {
    await start();
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Original' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/2/tasks', { title: 'Other project' });
    await post('/projects/1/tasks/1/completion', { completed: '1' });
    const original = await html('/projects/1');
    const other = await html('/projects/2');
    const summary = await html('/');
    assert.equal(rows(original).length, 2);
    assert.match(rows(original)[0], /<label for="new-task-title-1">New task title<\/label>/);
    assert.match(rows(original)[0], /<button type="submit">Rename task<\/button>/);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks/1/rename', { title });
      assert.equal(response.status, 400);
      assert.match(await response.text(), /role="alert">Task title is required/);
      assert.equal(await html('/projects/1'), original);
    }
    for (const path of ['/projects/2/tasks/1/rename', '/projects/1/tasks/999/rename', '/projects/1/tasks/99999999999999999999/rename']) {
      assert.equal((await post(path, { title: 'Forbidden' })).status, 404);
    }
    const response = await post('/projects/1/tasks/1/rename', { title: '  New <title> & "name"  ', filter: 'Completed' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1?filter=Completed');
    const renamed = await html('/projects/1');
    const renamedRows = rows(renamed);
    assert.match(renamedRows[0], /aria-label="Complete New &lt;title&gt; &amp; &quot;name&quot;" checked/);
    assert.match(renamedRows[0], /<label for="task-1">New &lt;title&gt; &amp; &quot;name&quot;<\/label>/);
    assert.equal(renamedRows[1], rows(original)[1]);
    assert.deepEqual(rows(await html('/projects/1?filter=Completed')), [renamedRows[0].replaceAll('name="filter" value="All"', 'name="filter" value="Completed"')]);
    assert.deepEqual(rows(await html('/projects/1?filter=Open')), [renamedRows[1].replaceAll('name="filter" value="All"', 'name="filter" value="Open"')]);
    assert.equal(await html('/projects/2'), other);
    assert.equal(await html('/'), summary);
    await stop();
    await start();
    assert.equal(await html('/projects/1'), renamed);
    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    for (const row of rows(archived)) {
      assert.match(row, /id="new-task-title-\d+"[^>]* disabled/);
      assert.match(row, /<button type="submit" disabled>Rename task<\/button>/);
    }
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Blocked' })).status, 403);
    assert.equal(await html('/projects/1'), archived);
    await stop();
    await start();
    assert.equal(await html('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), renamed);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: ' Restored title ' })).status, 303);
    assert.equal((await post('/projects/1/tasks/2/rename', { title: ' Open renamed ' })).status, 303);
    assert.match(rows(await html('/projects/1?filter=Open'))[0], /aria-label="Complete Open renamed"/);
    await stop();
    await start();
    assert.match(rows(await html('/projects/1?filter=Completed'))[0], /aria-label="Complete Restored title" checked/);
    assert.equal(await html('/'), summary);
  } finally {
    if (server?.listening) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
