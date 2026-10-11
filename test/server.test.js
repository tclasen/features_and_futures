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
  const port = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Startup timeout')); }, 5000);
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = /listening on port (\d+)/.exec(output);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
  });
  return {
    base: `http://127.0.0.1:${port}`,
    async stop() { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
  };
}

test('tasks validate, filter, remain project-owned, and persist completion across restarts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const dbPath = join(dir, 'tasks.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const post = (path, values) => fetch(server.base + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
    });
    const html = async path => (await fetch(server.base + path)).text();
    const rows = text => (text.match(/data-testid="task-row"/g) || []).length;
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    let text = await html('/projects/1');
    assert.match(text, /<label for="task-title">Task title<\/label>/);
    assert.match(text, /<button type="submit">Create task<\/button>/);
    assert.match(text, /<label for="task-filter">Task filter<\/label>/);
    assert.match(text, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', '   ']) {
      text = await (await post('/projects/1/tasks', { title })).text();
      assert.match(text, /role="alert">Task title is required/);
      assert.equal(rows(text), 0);
    }
    assert.equal((await post('/projects/1/tasks', { title: '  First task  ' })).status, 303);
    await post('/projects/1/tasks', { title: 'Second <task>' });
    text = await html('/projects/1');
    assert.equal(rows(text), 2);
    assert.ok(text.indexOf('First task') < text.indexOf('Second &lt;task&gt;'));
    assert.match(text, /aria-label="Complete First task"/);
    assert.doesNotMatch(text, / checked/);
    assert.equal(rows(await html('/projects/2')), 0);
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1', { completed: '1' })).status, 303);
    text = await html('/projects/1?filter=Completed');
    assert.equal(rows(text), 1);
    assert.match(text, /aria-label="Complete First task" checked/);
    assert.doesNotMatch(text, /Second &lt;task&gt;/);
    text = await html('/projects/1?filter=Open');
    assert.equal(rows(text), 1);
    assert.match(text, /Second &lt;task&gt;/);
    assert.doesNotMatch(text, /First task/);
    await server.stop();
    server = await start(dbPath);
    text = await html('/projects/1');
    assert.equal(rows(text), 2);
    assert.match(text, /aria-label="Complete First task" checked/);
    await post('/projects/1/tasks/1', {});
    assert.equal(rows(await html('/projects/1?filter=Completed')), 0);
    assert.equal(rows(await html('/projects/1?filter=Open')), 2);
    assert.equal(rows(await html('/projects/2')), 0);
  } finally {
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('projects validate, preserve creation order, navigate, and survive restarts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const dbPath = join(dir, 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const health = await fetch(`${server.base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const create = name => fetch(`${server.base}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual'
    });
    let html = await (await fetch(server.base)).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    for (const name of ['', '   ']) {
      html = await (await create(name)).text();
      assert.match(html, /role="alert">Project name is required/);
      assert.equal((html.match(/data-testid="project-row"/g) || []).length, 0);
    }
    assert.equal((await create('  First project  ')).status, 303);
    assert.equal((await create('Second <project>')).status, 303);
    html = await (await fetch(server.base)).text();
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.ok(html.indexOf('First project') < html.indexOf('Second &lt;project&gt;'));
    const path = /action="(\/projects\/\d+)"/.exec(html)[1];
    html = await (await fetch(server.base + path)).text();
    assert.match(html, /<h1>First project<\/h1>/);
    assert.match(html, /<button type="submit">Projects<\/button>/);
    await server.stop();
    server = await start(dbPath);
    html = await (await fetch(server.base + path)).text();
    assert.match(html, /<h1>First project<\/h1>/);
    html = await (await fetch(server.base)).text();
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(html, /Second &lt;project&gt;/);
    assert.equal((await fetch(server.base + '/projects/999999')).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
