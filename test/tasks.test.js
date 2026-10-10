import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('tasks validate, filter, remain project-scoped, and persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'db.sqlite') },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const port = await new Promise((resolve, reject) => {
      let output = '';
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) resolve(match[1]);
      });
      child.once('error', reject);
      child.once('exit', code => reject(new Error(`Server exited: ${code}`)));
    });
    base = `http://127.0.0.1:${port}`;
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }
  const get = async path => (await fetch(base + path)).text();
  const post = (path, data) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
  });
  const rows = html => (html.match(/data-testid="task-row"/g) ?? []).length;
  try {
    await start();
    await post('/projects', { name: 'One' });
    await post('/projects', { name: 'Two' });
    const initial = await get('/projects/1');
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, />Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option>/);
    assert.equal(rows(initial), 0);
    const invalid = await (await post('/projects/1/tasks', { title: ' \t ' })).text();
    assert.match(invalid, /role="alert">Task title is required/);
    assert.equal(rows(invalid), 0);
    await post('/projects/1/tasks', { title: '  First <task>  ' });
    await post('/projects/1/tasks', { title: 'Second task' });
    await post('/projects/2/tasks', { title: 'Other task' });
    const all = await get('/projects/1');
    assert.equal(rows(all), 2);
    assert.match(all, /aria-label="Complete First &lt;task&gt;"/);
    assert.doesNotMatch(all, / checked/);
    assert.ok(all.indexOf('First &lt;task&gt;') < all.indexOf('Second task'));
    assert.doesNotMatch(all, /Other task/);
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    await post('/projects/1/tasks/1', { completed: '1' });
    const completed = await get('/projects/1?filter=Completed');
    assert.equal(rows(completed), 1);
    assert.match(completed, /aria-label="Complete First &lt;task&gt;" checked/);
    const open = await get('/projects/1?filter=Open');
    assert.equal(rows(open), 1);
    assert.match(open, /Complete Second task/);
    assert.doesNotMatch(open, /First &lt;task&gt;/);
    const saved = await get('/projects/1');
    await stop();
    await start();
    assert.equal(await get('/projects/1'), saved);
    assert.equal(await get('/projects/1?filter=Completed'), completed);
    assert.equal(rows(await get('/projects/2')), 1);
    await post('/projects/1/tasks/1', {});
    assert.equal(rows(await get('/projects/1?filter=Completed')), 0);
    assert.equal(rows(await get('/projects/1?filter=Open')), 2);
    await stop();
    await start();
    assert.equal(rows(await get('/projects/1?filter=Completed')), 0);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
