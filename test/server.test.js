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
    const timer = setTimeout(() => { child.kill(); reject(new Error('Startup timed out')); }, 5000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
    child.stdout.on('data', chunk => {
      const match = /listening on port (\d+)/.exec(chunk.toString());
      if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
    });
  });
  return {
    base,
    async stop() {
      const exit = once(child, 'exit');
      child.kill('SIGTERM');
      await exit;
    },
  };
}

test('tasks validate, filter, stay project-scoped, and persist after restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const dbPath = join(directory, 'tasks.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const post = (path, data) => fetch(server.base + path, {
      method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
    });
    const page = async path => (await fetch(server.base + path)).text();
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    let html = await page('/projects/1');
    assert.match(html, /<label for="task-title">Task title<\/label>/);
    assert.match(html, /Create task/);
    assert.match(html, /<label for="task-filter">Task filter<\/label>/);
    assert.match(html, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', '   ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      assert.match(await response.text(), /role="alert">Task title is required/);
    }
    assert.doesNotMatch(await page('/projects/1'), /data-testid="task-row"/);
    assert.equal((await post('/projects/1/tasks', { title: '  First task  ' })).status, 303);
    await post('/projects/1/tasks', { title: '<Second & task>' });
    await post('/projects/2/tasks', { title: 'Other task' });
    html = await page('/projects/1');
    assert.equal((html.match(/data-testid="task-row"/g) || []).length, 2);
    assert.match(html, /aria-label="Complete First task"/);
    assert.match(html, /aria-label="Complete &lt;Second &amp; task&gt;"/);
    assert.doesNotMatch(html, / checked/);
    assert.ok(html.indexOf('<span>First task') < html.indexOf('<span>&lt;Second'));
    assert.doesNotMatch(html, /Other task/);
    assert.doesNotMatch(await page('/projects/2'), /First task/);
    assert.equal((await post('/projects/2/tasks/1', { completed: 'on' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1', { completed: 'on' })).status, 303);
    html = await page('/projects/1?filter=Completed');
    assert.match(html, /aria-label="Complete First task" checked/);
    assert.doesNotMatch(html, /Second &amp;/);
    html = await page('/projects/1?filter=Open');
    assert.doesNotMatch(html, /First task/);
    assert.match(html, /&lt;Second &amp; task&gt;/);
    await server.stop();
    server = await start(dbPath);
    html = await page('/projects/1');
    assert.match(html, /aria-label="Complete First task" checked/);
    assert.equal((html.match(/data-testid="task-row"/g) || []).length, 2);
    await post('/projects/1/tasks/1', {});
    assert.doesNotMatch(await page('/projects/1'), / checked/);
    assert.doesNotMatch(await page('/projects/1?filter=Completed'), /data-testid="task-row"/);
    await server.stop();
    server = await start(dbPath);
    assert.doesNotMatch(await page('/projects/1'), / checked/);
    assert.match(await page('/projects/2'), /Other task/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('projects validate, trim, remain ordered, navigate, and persist after restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const dbPath = join(directory, 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    let response = await fetch(`${server.base}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
    let html = await (await fetch(server.base)).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.doesNotMatch(html, /data-testid="project-row"/);
    async function create(name) {
      return fetch(`${server.base}/projects`, {
        method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
      });
    }
    for (const name of ['', '   ']) {
      response = await create(name);
      assert.equal(response.status, 400);
      html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    assert.equal((await create('  First project  ')).status, 303);
    assert.equal((await create('<Second & project>')).status, 303);
    html = await (await fetch(server.base)).text();
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(html, /<span>First project<\/span>/);
    assert.match(html, /&lt;Second &amp; project&gt;/);
    assert.ok(html.indexOf('First project') < html.indexOf('&lt;Second'));
    const paths = [...html.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    html = await (await fetch(server.base + paths[0])).text();
    assert.match(html, /<h1>First project<\/h1>/);
    assert.match(html, /<button type="submit">Projects<\/button>/);
    await server.stop();
    server = await start(dbPath);
    html = await (await fetch(server.base)).text();
    assert.deepEqual([...html.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]), paths);
    assert.match(html, /<span>First project<\/span>/);
    html = await (await fetch(server.base + paths[1])).text();
    assert.match(html, /<h1>&lt;Second &amp; project&gt;<\/h1>/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
