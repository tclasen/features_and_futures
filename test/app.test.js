import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

async function launch(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const base = await new Promise((resolvePort, reject) => {
    let output = '';
    child.on('error', reject);
    child.on('exit', (code) => reject(new Error(`Server exited: ${code}`)));
    child.stdout.on('data', (data) => {
      output += data;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolvePort(`http://127.0.0.1:${match[1]}`);
    });
  });
  return {
    base,
    async stop() {
      const exited = new Promise((done) => child.once('exit', done));
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('tasks validate, filter, remain project-scoped, and persist completion', async () => {
  const directory = await mkdtemp(resolve('data-test-'));
  let server;
  try {
    const dbPath = resolve(directory, 'test.sqlite');
    server = await launch(dbPath);
    const get = async (path) => (await fetch(server.base + path)).text();
    const post = (path, values) => fetch(server.base + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    let html = await get('/projects/1');
    assert.match(html, /<label for="task-title">Task title<\/label>/);
    assert.match(html, />Create task<\/button>/);
    assert.match(html, /<label for="task-filter">Task filter<\/label>/);
    assert.match(html, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', '   ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.doesNotMatch(html, /data-testid="task-row"/);
    }
    assert.equal((await post('/projects/1/tasks', { title: '  One & <task>  ' })).status, 303);
    await post('/projects/1/tasks', { title: 'Two' });
    html = await get('/projects/1');
    assert.equal((html.match(/data-testid="task-row"/g) || []).length, 2);
    assert.ok(html.indexOf('One &amp; &lt;task&gt;') < html.indexOf('Complete Two'));
    assert.match(html, /aria-label="Complete One &amp; &lt;task&gt;"/);
    assert.doesNotMatch(html, / checked/);
    assert.doesNotMatch(await get('/projects/2'), /data-testid="task-row"/);
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1', { completed: '1' })).status, 303);
    html = await get('/projects/1?filter=Completed');
    assert.match(html, /aria-label="Complete One &amp; &lt;task&gt;" checked/);
    assert.doesNotMatch(html, /Complete Two/);
    const open = await get('/projects/1?filter=Open');
    assert.match(open, /Complete Two/);
    assert.doesNotMatch(open, /Complete One/);
    const saved = await get('/projects/1');
    await server.stop();
    server = await launch(dbPath);
    assert.equal(await get('/projects/1'), saved);
    assert.equal(await get('/projects/1?filter=Completed'), html);
    await post('/projects/1/tasks/1', {});
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /data-testid="task-row"/);
    assert.equal(((await get('/projects/1?filter=Open')).match(/data-testid="task-row"/g) || []).length, 2);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('projects validate, render safely, navigate, and survive a restart', async () => {
  const directory = await mkdtemp(resolve('data-test-'));
  let server;
  try {
    const dbPath = resolve(directory, 'test.sqlite');
    server = await launch(dbPath);
    const get = (path) => fetch(server.base + path);
    const create = (name) => fetch(server.base + '/projects', {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    let html = await (await get('/')).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, />Create project<\/button>/);
    for (const name of ['', '   ']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    assert.equal((await create('  First & <project>  ')).status, 303);
    assert.equal((await create('Second')).status, 303);
    html = await (await get('/')).text();
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.ok(html.indexOf('First &amp; &lt;project&gt;') < html.indexOf('Second'));
    const paths = [...html.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
    const detail = await (await get(paths[0])).text();
    assert.match(detail, /<h1>First &amp; &lt;project&gt;<\/h1>/);
    assert.match(detail, /action="\/" method="get"><button type="submit">Projects/);
    assert.equal((await get('/projects/99999')).status, 404);
    await server.stop();
    server = await launch(dbPath);
    const persisted = await (await get('/')).text();
    assert.equal(persisted, html);
    assert.match(await (await get(paths[1])).text(), /<h1>Second<\/h1>/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
