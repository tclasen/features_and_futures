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
    child.stdout.on('data', chunk => {
      const match = chunk.toString().match(/listening on port (\d+)/);
      if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
    });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
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

test('tasks validate, stay project-scoped, filter, toggle, and persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  let server;
  try {
    const dbPath = join(directory, 'workboard.sqlite');
    server = await start(dbPath);
    const post = (path, fields) => fetch(server.base + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const htmlAt = async path => (await fetch(server.base + path)).text();
    const rows = html => (html.match(/data-testid="task-row"/g) || []).length;
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    let html = await htmlAt('/projects/1');
    assert.match(html, /<label for="task-title">Task title<\/label>/);
    assert.match(html, /<label for="task-filter">Task filter<\/label>/);
    assert.match(html, /<option selected>All<\/option>/);
    for (const title of ['', '  \t ']) {
      html = await (await post('/projects/1/tasks', { title })).text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(rows(html), 0);
    }
    assert.equal((await post('/projects/1/tasks', { title: '  First task  ' })).status, 303);
    await post('/projects/1/tasks', { title: '<Second & task>' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    html = await htmlAt('/projects/1');
    assert.equal(rows(html), 2);
    assert.match(html, /aria-label="Complete First task"/);
    assert.match(html, /aria-label="Complete &lt;Second &amp; task&gt;"/);
    assert.ok(html.indexOf('Complete First task') < html.indexOf('Complete &lt;Second'));
    assert.doesNotMatch(html, / checked/);
    assert.doesNotMatch(html, /Other project task/);
    assert.equal(rows(await htmlAt('/projects/1?filter=Open')), 2);
    assert.equal(rows(await htmlAt('/projects/1?filter=Completed')), 0);
    assert.equal((await post('/projects/2/tasks/1/completion', { completed: '1' })).status, 404);
    const response = await post('/projects/1/tasks/1/completion', { completed: '1', filter: 'Open' });
    assert.equal(response.headers.get('location'), '/projects/1?filter=Open');
    html = await htmlAt('/projects/1?filter=Completed');
    assert.equal(rows(html), 1);
    assert.match(html, /aria-label="Complete First task" checked/);
    assert.equal(rows(await htmlAt('/projects/1?filter=Open')), 1);
    assert.equal(rows(await htmlAt('/projects/2')), 1);
    const allBeforeRestart = await htmlAt('/projects/1');
    await server.stop();
    server = await start(dbPath);
    assert.equal(await htmlAt('/projects/1'), allBeforeRestart);
    assert.equal(await htmlAt('/projects/1?filter=Completed'), html);
    await post('/projects/1/tasks/1/completion', {});
    assert.equal(rows(await htmlAt('/projects/1?filter=Completed')), 0);
    assert.equal(rows(await htmlAt('/projects/1?filter=Open')), 2);
    await server.stop();
    server = await start(dbPath);
    assert.doesNotMatch(await htmlAt('/projects/1'), / checked/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('projects validate, render safely, navigate, and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let server;
  try {
    const dbPath = join(directory, 'nested', 'projects.sqlite');
    server = await start(dbPath);
    const get = path => fetch(server.base + path);
    const create = name => fetch(server.base + '/projects', {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    let html = await (await get('/')).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, /Create project/);
    for (const name of ['', '   \t ']) {
      html = await (await create(name)).text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    assert.equal((await create('  First project  ')).status, 303);
    await create('<Second & project>');
    html = await (await get('/')).text();
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(html, /<span>First project<\/span>/);
    assert.match(html, /&lt;Second &amp; project&gt;/);
    assert.ok(html.indexOf('First project') < html.indexOf('&lt;Second'));
    const paths = [...html.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    const detail = await (await get(paths[0])).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*<button type="submit">Projects<\/button>/);
    assert.equal((await get('/projects/99999')).status, 404);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await (await get('/')).text(), html);
    assert.equal(await (await get(paths[0])).text(), detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
