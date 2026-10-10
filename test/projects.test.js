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
    stdio: ['ignore', 'pipe', 'inherit']
  });
  const base = await new Promise((resolve, reject) => {
    let output = '';
    child.on('error', reject);
    child.on('exit', code => reject(new Error(`Server exited: ${code}`)));
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
  });
  return { base, async stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  } };
}

test('tasks validate, filter, remain project-owned, and persist completion across restarts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  let server;
  try {
    const dbPath = join(dir, 'workboard.sqlite');
    server = await start(dbPath);
    const post = (path, values) => fetch(server.base + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
    });
    const detail = (id, filter = 'All') => fetch(`${server.base}/projects/${id}?filter=${filter}`).then(res => res.text());
    for (const name of ['One', 'Two']) assert.equal((await post('/projects', { name })).status, 303);
    let html = await detail(1);
    assert.match(html, /Task title/);
    assert.match(html, /<option selected>All<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.doesNotMatch(html, /data-testid="task-row"/);
    }
    for (const title of ['  First task  ', '<Second & task>']) {
      assert.equal((await post('/projects/1/tasks', { title })).status, 303);
    }
    html = await detail(1);
    assert.equal((html.match(/data-testid="task-row"/g) || []).length, 2);
    assert.match(html, /aria-label="Complete First task"/);
    assert.doesNotMatch(html, / checked/);
    assert.ok(html.indexOf('First task') < html.indexOf('&lt;Second &amp; task&gt;'));
    assert.doesNotMatch(await detail(2), /data-testid="task-row"/);
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1', { completed: '1' })).status, 303);
    assert.match(await detail(1, 'Completed'), /aria-label="Complete First task" checked/);
    assert.doesNotMatch(await detail(1, 'Completed'), /Second &amp;/);
    assert.doesNotMatch(await detail(1, 'Open'), /First task/);
    assert.match(await detail(1, 'Open'), /Second &amp;/);
    const saved = await detail(1);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await detail(1), saved);
    assert.equal((await post('/projects/1/tasks/1', {})).status, 303);
    assert.doesNotMatch(await detail(1, 'Completed'), /data-testid="task-row"/);
    assert.equal(((await detail(1, 'Open')).match(/data-testid="task-row"/g) || []).length, 2);
  } finally {
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('project creation, validation, navigation, and restart persistence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let server;
  try {
    const dbPath = join(dir, 'nested', 'projects.sqlite');
    server = await start(dbPath);
    const health = await fetch(`${server.base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    let html = await (await fetch(server.base)).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, />Create project<\/button>/);
    const create = name => fetch(`${server.base}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual'
    });
    for (const name of ['', '  \t\n ']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    for (const name of ['  First project  ', '<Second & project>']) {
      const response = await create(name);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    html = await (await fetch(server.base)).text();
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(html, /<span>First project<\/span>/);
    assert.ok(html.indexOf('First project') < html.indexOf('&lt;Second &amp; project&gt;'));
    const paths = [...html.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    const detail = await (await fetch(server.base + paths[0])).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/"><button type="submit">Projects<\/button>/);
    await server.stop();
    server = await start(dbPath);
    const persisted = await (await fetch(server.base)).text();
    assert.equal(persisted, html);
    assert.match(await (await fetch(server.base + paths[1])).text(), /<h1>&lt;Second &amp; project&gt;<\/h1>/);
  } finally {
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
