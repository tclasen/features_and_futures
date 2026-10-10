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
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Startup timed out')); }, 5000);
    child.on('error', reject);
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
    child.stdout.on('data', chunk => {
      const match = chunk.toString().match(/listening on port (\d+)/);
      if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
    });
  });
  return { url, stop: async () => { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; } };
}

test('tasks validate, filter, remain project-scoped, and persist completion', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  let server;
  try {
    const dbPath = join(dir, 'tasks.sqlite');
    server = await start(dbPath);
    const post = (path, values) => fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
    });
    const page = path => fetch(server.url + path).then(response => response.text());
    const rows = html => (html.match(/data-testid="task-row"/g) || []).length;
    await post('/projects', { name: 'One' });
    await post('/projects', { name: 'Two' });
    let body = await page('/projects/1');
    assert.match(body, /<label for="task-title">Task title<\/label>/);
    assert.match(body, /<label for="task-filter">Task filter<\/label>/);
    assert.match(body, /<option selected>All<\/option>/);
    for (const title of ['', '   ']) {
      body = await (await post('/projects/1/tasks', { title })).text();
      assert.match(body, /role="alert">Task title is required/);
      assert.equal(rows(body), 0);
    }
    assert.equal((await post('/projects/1/tasks', { title: '  First task  ' })).status, 303);
    await post('/projects/1/tasks', { title: 'Second <task>' });
    body = await page('/projects/1');
    assert.equal(rows(body), 2);
    assert.match(body, /aria-label="Complete First task"/);
    assert.ok(body.indexOf('First task') < body.indexOf('Second &lt;task&gt;'));
    assert.doesNotMatch(body, / checked/);
    assert.equal(rows(await page('/projects/2')), 0);
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    await post('/projects/1/tasks/1', { completed: '1' });
    body = await page('/projects/1');
    assert.match(body, /aria-label="Complete First task" checked/);
    const open = await page('/projects/1?filter=Open');
    assert.equal(rows(open), 1);
    assert.doesNotMatch(open, /Complete First task/);
    const completed = await page('/projects/1?filter=Completed');
    assert.equal(rows(completed), 1);
    assert.doesNotMatch(completed, /Complete Second/);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await page('/projects/1'), body);
    assert.equal(await page('/projects/1?filter=Open'), open);
    assert.equal(await page('/projects/1?filter=Completed'), completed);
    await post('/projects/1/tasks/1', {});
    assert.equal(rows(await page('/projects/1?filter=Open')), 2);
    assert.equal(rows(await page('/projects/1?filter=Completed')), 0);
    await server.stop();
    server = await start(dbPath);
    assert.doesNotMatch(await page('/projects/1'), / checked/);
  } finally {
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('projects validate, navigate, and persist across server restarts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const dbPath = join(dir, 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    let body = await (await fetch(server.url)).text();
    assert.match(body, /<h1>Workboard<\/h1>/);
    assert.match(body, /<label for="project-name">Project name<\/label>/);
    assert.equal((body.match(/data-testid="project-row"/g) || []).length, 0);
    const create = name => fetch(`${server.url}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual'
    });
    for (const name of ['', '   ']) {
      body = await (await create(name)).text();
      assert.match(body, /role="alert">Project name is required/);
      assert.doesNotMatch(body, /data-testid="project-row"/);
    }
    assert.equal((await create('  First project  ')).status, 303);
    await create('Second <project>');
    body = await (await fetch(server.url)).text();
    assert.equal((body.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(body, />First project<\/span>/);
    assert.ok(body.indexOf('First project') < body.indexOf('Second &lt;project&gt;'));
    const projectPath = body.match(/action="(\/projects\/\d+)"/)[1];
    const detail = await (await fetch(server.url + projectPath)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /<button type="submit">Projects<\/button>/);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await (await fetch(server.url)).text(), body);
    assert.equal(await (await fetch(server.url + projectPath)).text(), detail);
    assert.equal((await fetch(server.url + '/projects/99999')).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
