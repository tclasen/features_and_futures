import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('search collapses only ASCII spaces/tabs without rewriting saved names or titles', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-whitespace-'));
  const base = 'http://127.0.0.1:18087';
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '18087', DB_PATH: join(dir, 'db.sqlite') }, stdio: 'ignore'
    });
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error('Server exited');
      try { if ((await fetch(base + '/health')).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error('Server not ready');
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
  });
  const get = async path => (await fetch(base + path)).text();
  const projectIds = html => [...html.matchAll(/action="\/projects\/(\d+)" method="get"/g)].map(m => Number(m[1]));
  const taskIds = html => [...html.matchAll(/class="task-title" for="task-(\d+)"/g)].map(m => Number(m[1]));
  const query = values => '?' + new URLSearchParams(values);
  const name = 'MiXeD  \t Board';
  const title = 'Plan\t \t  Release';
  try {
    await start();
    for (const value of [name, 'mixed board', 'mixed\nboard', 'mixed\u00a0board']) await post('/projects', { name: value });
    for (const search of ['mixed board', '  MIXED\t \tBOARD  ', 'xEd   bO']) {
      const html = await get('/' + query({ search }));
      assert.deepEqual(projectIds(html), [1, 2]);
      assert.ok(html.includes(name));
    }
    assert.deepEqual(projectIds(await get('/' + query({ search: 'mixed\nboard' }))), [3]);
    assert.deepEqual(projectIds(await get('/' + query({ search: 'mixed\u00a0board' }))), [4]);
    for (const value of [title, 'plan release', 'plan\nrelease']) await post('/projects/1/tasks', { title: value });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2028-02-29' });
    const state = { search: '  PLAN \t RELEASE ', filter: 'Open', priorityFilter: 'High', dueFrom: '2028-02-29', dueThrough: '2028-02-29' };
    let html = await get('/projects/1' + query(state));
    assert.deepEqual(taskIds(html), [1]);
    assert.ok(html.includes(title));
    const renamed = 'PLAN  \t Release v2';
    const response = await post('/projects/1/tasks/1/rename', { ...state, title: renamed });
    html = await get(response.headers.get('location'));
    assert.deepEqual(taskIds(html), [1]);
    assert.ok(html.includes(renamed));
    await post('/projects/1/archive');
    assert.deepEqual(projectIds(await get('/' + query({ filter: 'Archived', search: 'MIXED\tBOARD' }))), [1]);
    html = await get('/projects/1' + query(state));
    assert.deepEqual(taskIds(html), [1]);
    assert.match(html, /Archived project/);
    await stop();
    await start();
    html = await get('/projects/1' + query(state));
    assert.deepEqual(taskIds(html), [1]);
    assert.ok(html.includes(renamed));
    html = await get('/projects/1');
    assert.deepEqual(taskIds(html), [1, 2, 3]);
    assert.ok(html.includes(renamed));
    html = await get('/?filter=Archived');
    assert.ok(html.includes(name));
    await post('/projects/1/restore');
    assert.deepEqual(projectIds(await get('/' + query({ search: 'mixed board' }))), [1, 2]);
  } finally {
    await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
