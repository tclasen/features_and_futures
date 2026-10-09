import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const base = await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Server start timed out')); }, 5000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) { clearTimeout(timeout); resolve(`http://127.0.0.1:${match[1]}`); }
    });
  });
  return {
    base,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('tasks validate, filter, stay project-scoped, and persist completion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const dbPath = join(directory, 'tasks.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const post = (path, fields) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.base}${path}`)).text();
    await post('/projects', { name: 'One' });
    await post('/projects', { name: 'Two' });
    const initial = await get('/projects/1');
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option>/);
    for (const title of ['', '   ']) {
      const invalid = await post('/projects/1/tasks', { title });
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.doesNotMatch(html, /data-testid="task-row"/);
    }
    for (const title of ['  First task  ', '<Second & task>']) {
      assert.equal((await post('/projects/1/tasks', { title })).status, 303);
    }
    const all = await get('/projects/1');
    assert.equal((all.match(/data-testid="task-row"/g) || []).length, 2);
    assert.ok(all.indexOf('First task') < all.indexOf('&lt;Second &amp; task&gt;'));
    assert.match(all, /aria-label="Complete First task"/);
    assert.doesNotMatch(all, / checked/);
    assert.doesNotMatch(all, /  First task  /);
    assert.doesNotMatch(await get('/projects/2'), /data-testid="task-row"/);
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1', { completed: '1' })).status, 303);
    const completed = await get('/projects/1?filter=Completed');
    assert.match(completed, /Complete First task" checked/);
    assert.doesNotMatch(completed, /Second &amp; task/);
    const open = await get('/projects/1?filter=Open');
    assert.doesNotMatch(open, /First task/);
    assert.match(open, /&lt;Second &amp; task&gt;/);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1?filter=Completed'), completed);
    assert.equal(await get('/projects/1?filter=Open'), open);
    await post('/projects/1/tasks/1', {});
    assert.doesNotMatch(await get('/projects/1'), / checked/);
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /data-testid="task-row"/);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), all);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('projects validate, render safely, navigate, and survive a restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const dbPath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const health = await fetch(`${server.base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const initial = await (await fetch(server.base)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, /Create project/);
    const create = name => fetch(`${server.base}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    for (const name of ['', '   ']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    for (const name of ['  First project  ', '<Second & project>']) {
      const created = await create(name);
      assert.equal(created.status, 303);
      assert.equal(created.headers.get('location'), '/');
    }
    const list = await (await fetch(server.base)).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.ok(list.indexOf('First project') < list.indexOf('&lt;Second &amp; project&gt;'));
    assert.doesNotMatch(list, /  First project  /);
    const ids = [...list.matchAll(/action="\/projects\/(\d+)"/g)].map(match => match[1]);
    assert.equal(ids.length, 2);
    const detail = await (await fetch(`${server.base}/projects/${ids[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*>Projects<\/button>/);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await (await fetch(server.base)).text(), list);
    assert.equal(await (await fetch(`${server.base}/projects/${ids[0]}`)).text(), detail);
    assert.equal((await fetch(`${server.base}/projects/99999`)).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
