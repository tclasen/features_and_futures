import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const baseUrl = await new Promise((resolve, reject) => {
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
    child.on('error', reject);
    child.on('exit', (code) => reject(new Error(`Server exited: ${code}`)));
  });
  return {
    baseUrl,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('tasks validate, filter, stay within projects, and persist completion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const databasePath = join(directory, 'tasks.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const get = async (path) => (await fetch(server.baseUrl + path)).text();
    const post = (path, values) => fetch(server.baseUrl + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    await post('/projects', { name: 'One' });
    await post('/projects', { name: 'Two' });
    let body = await get('/projects/1');
    assert.match(body, /<label for="task-title">Task title<\/label>/);
    assert.match(body, />Create task<\/button>/);
    assert.match(body, /<label for="task-filter">Task filter<\/label>/);
    assert.match(body, /<option selected>All<\/option>/);
    for (const title of ['', ' \t\n']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      body = await response.text();
      assert.match(body, /role="alert">Task title is required/);
      assert.doesNotMatch(body, /data-testid="task-row"/);
    }
    assert.equal((await post('/projects/1/tasks', { title: '  First task  ' })).status, 303);
    await post('/projects/1/tasks', { title: '<Second> & "task"' });
    body = await get('/projects/1');
    assert.equal((body.match(/data-testid="task-row"/g) || []).length, 2);
    assert.match(body, /aria-label="Complete First task"/);
    assert.match(body, /<span>First task<\/span>/);
    assert.match(body, /&lt;Second&gt; &amp; &quot;task&quot;/);
    assert.ok(body.indexOf('First task') < body.indexOf('&lt;Second&gt;'));
    assert.doesNotMatch(body, / checked/);
    assert.doesNotMatch(await get('/projects/2'), /data-testid="task-row"/);
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Invalid' })).status, 404);
    await post('/projects/1/tasks/1', { completed: '1' });
    body = await get('/projects/1?filter=Completed');
    assert.match(body, /aria-label="Complete First task" checked/);
    assert.doesNotMatch(body, /&lt;Second&gt;/);
    body = await get('/projects/1?filter=Open');
    assert.doesNotMatch(body, /First task/);
    assert.match(body, /&lt;Second&gt;/);
    const saved = await get('/projects/1');
    await post('/projects/1/tasks', { title: '  ' });
    assert.equal(await get('/projects/1'), saved);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/projects/1'), saved);
    assert.doesNotMatch(await get('/projects/2'), /data-testid="task-row"/);
    await post('/projects/1/tasks/1', {});
    assert.doesNotMatch(await get('/projects/1'), / checked/);
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /data-testid="task-row"/);
    await server.stop();
    server = await start(databasePath);
    assert.doesNotMatch(await get('/projects/1'), / checked/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('projects validate, render safely, navigate, and persist after restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const get = (path) => fetch(server.baseUrl + path);
    const create = (name) => fetch(server.baseUrl + '/projects', {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    let body = await (await get('/')).text();
    assert.match(body, /<h1>Workboard<\/h1>/);
    assert.match(body, /<label for="project-name">Project name<\/label>/);
    assert.match(body, />Create project<\/button>/);
    assert.doesNotMatch(body, /data-testid="project-row"/);

    for (const name of ['', '   \t\n']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      body = await response.text();
      assert.match(body, /role="alert">Project name is required/);
      assert.doesNotMatch(body, /data-testid="project-row"/);
    }
    assert.equal((await create('  First project  ')).status, 303);
    assert.equal((await create('<script> & Second')).status, 303);
    body = await (await get('/')).text();
    assert.equal((body.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(body, /<span>First project<\/span>/);
    assert.match(body, /&lt;script&gt; &amp; Second/);
    assert.ok(body.indexOf('First project') < body.indexOf('&lt;script&gt;'));
    const projectPaths = [...body.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
    assert.equal(projectPaths.length, 2);
    body = await (await get(projectPaths[0])).text();
    assert.match(body, /<h1>First project<\/h1>/);
    assert.match(body, /action="\/".*>Projects<\/button>/);
    const beforeRestart = await (await get('/')).text();
    await create('  ');
    assert.equal(await (await get('/')).text(), beforeRestart);
    assert.equal((await get('/projects/999')).status, 404);

    await server.stop();
    server = await start(databasePath);
    assert.equal(await (await get('/')).text(), beforeRestart);
    assert.match(await (await get(projectPaths[0])).text(), /<h1>First project<\/h1>/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
