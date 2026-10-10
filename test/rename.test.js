import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('rename preserves identity, ordering, tasks and summaries; archive blocks renaming', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
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
      try { if ((await fetch(base + '/health')).ok) return; } catch {}
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
  const get = async path => (await fetch(base + path)).text();
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  try {
    await start();
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1', { completed: '1' });
    let html = await get('/projects/1');
    assert.match(html, /<label for="new-project-name">New project name<\/label>/);
    assert.match(html, /<button type="submit">Rename project<\/button>/);
    for (const name of ['', '   ']) {
      const response = await post('/projects/1/rename', { name });
      assert.equal(response.status, 400);
      html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.match(html, /<h1>Original<\/h1>/);
    }
    const response = await post('/projects/1/rename', { name: '  Renamed <one>  ', filter: 'Completed' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1?filter=Completed');
    html = await get('/');
    assert.ok(html.indexOf('>Renamed &lt;one&gt;</') < html.indexOf('>Second</'));
    assert.match(html, /data-testid="project-summary">1\/2 completed/);
    assert.match(html, /action="\/projects\/1"/);
    const renamedPage = await get('/projects/1');
    assert.match(renamedPage, /<h1>Renamed &lt;one&gt;<\/h1>/);
    assert.match(renamedPage, /aria-label="Complete Done" checked/);
    assert.match(renamedPage, /aria-label="Complete Pending"\s+\s*onchange/);
    assert.equal((renamedPage.match(/data-testid="task-row"/g) || []).length, 2);
    await stop();
    await start();
    assert.equal(await get('/projects/1'), renamedPage);
    await post('/projects/1/archive');
    html = await get('/projects/1');
    assert.match(html, /<input id="new-project-name"[^>]* disabled>/);
    assert.match(html, /<button type="submit" disabled>Rename project<\/button>/);
    assert.equal((await post('/projects/1/rename', { name: 'Blocked' })).status, 403);
    assert.equal(await get('/projects/1'), html);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), renamedPage);
    await post('/projects/1/rename', { name: 'Restored name' });
    await stop();
    await start();
    html = await get('/');
    assert.match(html, />Restored name</);
    assert.match(html, /data-testid="project-summary">1\/2 completed/);
    assert.match(await get('/projects/1'), /<h1>Restored name<\/h1>/);
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
