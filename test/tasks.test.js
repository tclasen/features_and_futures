import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('tasks validate, filter, stay project-scoped, and persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const port = 40000 + Math.floor(Math.random() * 10000);
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'db.sqlite') },
      stdio: 'ignore',
    });
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error('Server exited');
      try {
        if ((await fetch(base + '/health')).ok) return;
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Server did not start');
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  const post = (path, values) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const get = async path => (await fetch(base + path)).text();
  const count = html => (html.match(/data-testid="task-row"/g) || []).length;
  try {
    await start();
    await post('/projects', { name: 'Alpha' });
    await post('/projects', { name: 'Beta' });
    let html = await get('/projects/1');
    assert.match(html, /<label for="task-title">Task title<\/label>/);
    assert.match(html, />Create task<\/button>/);
    assert.match(html, /<label for="task-filter">Task filter<\/label>/);
    assert.match(html, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', '  \t\n']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(count(html), 0);
    }
    assert.equal((await post('/projects/1/tasks', { title: '  First  ' })).status, 303);
    await post('/projects/1/tasks', { title: '<Second & "last">' });
    await post('/projects/2/tasks', { title: 'Other project' });
    html = await get('/projects/1');
    assert.equal(count(html), 2);
    assert.match(html, /aria-label="Complete First"/);
    assert.match(html, /aria-label="Complete &lt;Second &amp; &quot;last&quot;&gt;"/);
    assert.ok(html.indexOf('>First</label>') < html.indexOf('>&lt;Second'));
    assert.doesNotMatch(html, / checked/);
    assert.doesNotMatch(html, /Other project/);
    assert.equal(count(await get('/projects/1?filter=Open')), 2);
    assert.equal(count(await get('/projects/1?filter=Completed')), 0);
    // A task from a different project cannot be changed through this URL.
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    const completion = await post('/projects/1/tasks/1', { completed: '1', filter: 'Open' });
    assert.equal(completion.status, 303);
    assert.equal(completion.headers.get('location'), '/projects/1?filter=Open');
    html = await get('/projects/1');
    assert.match(html, /aria-label="Complete First" checked/);
    const open = await get('/projects/1?filter=Open');
    const completed = await get('/projects/1?filter=Completed');
    assert.equal(count(open), 1);
    assert.doesNotMatch(open, /Complete First/);
    assert.equal(count(completed), 1);
    assert.match(completed, /Complete First/);
    assert.doesNotMatch(completed, /Second/);
    const other = await get('/projects/2');
    assert.equal(count(other), 1);
    assert.doesNotMatch(other, /Complete First|Second/);
    await stop();
    await start();
    assert.equal(await get('/projects/1'), html);
    assert.equal(await get('/projects/1?filter=Open'), open);
    assert.equal(await get('/projects/1?filter=Completed'), completed);
    assert.equal(await get('/projects/2'), other);
    await post('/projects/1/tasks/1', {});
    assert.equal(count(await get('/projects/1?filter=Open')), 2);
    assert.equal(count(await get('/projects/1?filter=Completed')), 0);
    assert.doesNotMatch(await get('/projects/1'), / checked/);
    assert.equal((await post('/projects/999/tasks', { title: 'Missing' })).status, 404);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
