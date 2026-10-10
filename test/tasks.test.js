import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';

test('tasks validate, filter, stay project-owned, and persist completion across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'db.sqlite') },
      stdio: 'ignore',
    });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`${base}/health`)).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Server did not start');
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = undefined;
  }
  const post = (path, data) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
  });
  const get = async path => (await fetch(base + path)).text();
  const count = html => (html.match(/data-testid="task-row"/g) || []).length;
  try {
    await start();
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    let html = await get('/projects/1');
    assert.match(html, /<label for="task-title">Task title<\/label>/);
    assert.match(html, /<label for="task-filter">Task filter<\/label>/);
    assert.match(html, /<option selected>All<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(count(html), 0);
    }
    assert.equal((await post('/projects/1/tasks', { title: '  Alpha & <task>  ' })).status, 303);
    await post('/projects/1/tasks', { title: 'Beta' });
    html = await get('/projects/1');
    assert.equal(count(html), 2);
    assert.ok(html.indexOf('Alpha &amp; &lt;task&gt;') < html.indexOf('Beta'));
    assert.match(html, /aria-label="Complete Alpha &amp; &lt;task&gt;"/);
    assert.doesNotMatch(html, / checked/);
    assert.equal(count(await get('/projects/2')), 0);
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1', { completed: '1' })).status, 303);
    const completed = await get('/projects/1?filter=Completed');
    assert.equal(count(completed), 1);
    assert.match(completed, / checked/);
    assert.doesNotMatch(completed, />Beta</);
    const open = await get('/projects/1?filter=Open');
    assert.equal(count(open), 1);
    assert.match(open, />Beta</);
    assert.doesNotMatch(open, /Alpha/);
    const all = await get('/projects/1');
    await stop();
    await start();
    assert.equal(await get('/projects/1'), all);
    assert.equal(await get('/projects/1?filter=Completed'), completed);
    await post('/projects/1/tasks/1', {});
    assert.equal(count(await get('/projects/1?filter=Completed')), 0);
    assert.equal(count(await get('/projects/1?filter=Open')), 2);
    await stop();
    await start();
    assert.doesNotMatch(await get('/projects/1'), / checked/);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
