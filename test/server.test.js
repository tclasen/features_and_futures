import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  const port = await new Promise((resolve, reject) => {
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = /listening on port (\d+)/.exec(output);
      if (match) resolve(match[1]);
    });
    child.on('error', reject);
    child.on('exit', code => reject(new Error(`Server exited: ${code}`)));
  });
  return {
    base: `http://127.0.0.1:${port}`,
    stop: async () => { const exit = once(child, 'exit'); child.kill('SIGTERM'); await exit; }
  };
}

test('tasks validate, filter, stay project-owned and persist completion', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const dbPath = join(dir, 'workboard.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const post = (path, values) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const count = page => (page.match(/data-testid="task-row"/g) || []).length;
    await post('/projects', { name: 'One' });
    await post('/projects', { name: 'Two' });
    const initial = await html('/projects/1');
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, /Create task/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    const blank = await post('/projects/1/tasks', { title: '   ' });
    assert.equal(blank.status, 400);
    const invalid = await blank.text();
    assert.match(invalid, /role="alert">Task title is required/);
    assert.equal(count(invalid), 0);
    assert.equal((await post('/projects/1/tasks', { title: '  First & <task>  ' })).status, 303);
    await post('/projects/1/tasks', { title: 'Second' });
    await post('/projects/2/tasks', { title: 'Other project' });
    const all = await html('/projects/1');
    assert.equal(count(all), 2);
    assert.match(all, /<span>First &amp; &lt;task&gt;<\/span>/);
    assert.match(all, /aria-label="Complete First &amp; &lt;task&gt;"/);
    assert.doesNotMatch(all, /checked/);
    assert.ok(all.indexOf('First &amp;') < all.indexOf('<span>Second'));
    assert.doesNotMatch(all, /Other project/);
    assert.equal(count(await html('/projects/2')), 1);
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'No project' })).status, 404);
    await post('/projects/1/tasks/1', { completed: '1' });
    const completed = await html('/projects/1?filter=Completed');
    assert.equal(count(completed), 1);
    assert.match(completed, /First &amp;/);
    assert.match(completed, /checked/);
    const open = await html('/projects/1?filter=Open');
    assert.equal(count(open), 1);
    assert.match(open, /<span>Second<\/span>/);
    assert.doesNotMatch(open, /First &amp;/);
    const saved = await html('/projects/1');
    await server.stop();
    server = await start(dbPath);
    assert.equal(await html('/projects/1'), saved);
    assert.equal(await html('/projects/1?filter=Completed'), completed);
    const unchecked = await post('/projects/1/tasks/1', { filter: 'Completed' });
    assert.equal(unchecked.headers.get('location'), '/projects/1?filter=Completed');
    assert.equal(count(await html('/projects/1?filter=Completed')), 0);
    assert.equal(count(await html('/projects/1?filter=Open')), 2);
    await server.stop();
    server = await start(dbPath);
    assert.equal(count(await html('/projects/1?filter=Open')), 2);
    assert.doesNotMatch(await html('/projects/1'), /checked/);
    assert.match(await html('/tasks.js'), /requestSubmit/);
  } finally {
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('projects validate, render safely in creation order, navigate and persist', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let server;
  try {
    server = await start(join(dir, 'nested', 'projects.sqlite'));
    const health = await fetch(`${server.base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const initial = await (await fetch(server.base)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, /Create project/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);
    const create = name => fetch(`${server.base}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual'
    });
    const blank = await create('   ');
    assert.equal(blank.status, 400);
    const invalidPage = await blank.text();
    assert.match(invalidPage, /role="alert">Project name is required/);
    assert.doesNotMatch(invalidPage, /data-testid="project-row"/);
    assert.equal((await create('  First & <project>  ')).status, 303);
    assert.equal((await create('Second')).status, 303);
    const list = await (await fetch(server.base)).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(list, /<span>First &amp; &lt;project&gt;<\/span>/);
    assert.ok(list.indexOf('First &amp;') < list.indexOf('<span>Second'));
    const id = /action="\/projects\/(\d+)"/.exec(list)[1];
    const detail = await (await fetch(`${server.base}/projects/${id}`)).text();
    assert.match(detail, /<h1>First &amp; &lt;project&gt;<\/h1>/);
    assert.match(detail, /action="\/" method="get"><button type="submit">Projects/);
    assert.equal((await fetch(`${server.base}/projects/99999`)).status, 404);
    await server.stop();
    server = await start(join(dir, 'nested', 'projects.sqlite'));
    assert.equal(await (await fetch(server.base)).text(), list);
    assert.equal(await (await fetch(`${server.base}/projects/${id}`)).text(), detail);
  } finally {
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
