import test from 'node:test';
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
  let diagnostics = '';
  child.stderr.on('data', (chunk) => { diagnostics += chunk; });
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server did not start: ${diagnostics}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited (${code}): ${diagnostics}`));
    });
    child.stdout.on('data', (chunk) => {
      const match = String(chunk).match(/listening on port (\d+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() {
      if (child.exitCode !== null) return;
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects validate, render in order, navigate, and persist across restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    let html = await (await fetch(server.url)).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, />Create project<\/button>/);
    assert.doesNotMatch(html, /data-testid="project-row"/);

    const create = (name) => fetch(`${server.url}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    for (const name of ['', '  \t\n ']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    for (const name of ['  Alpha project  ', '<script>alert("x")</script> & café']) {
      const response = await create(name);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    html = await (await fetch(server.url)).text();
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(html, />Alpha project<\/span>/);
    assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; café/);
    assert.ok(html.indexOf('Alpha project') < html.indexOf('&lt;script&gt;'));
    const paths = [...html.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
    assert.equal(paths.length, 2);
    assert.notEqual(paths[0], paths[1]);
    const projectHtml = await (await fetch(`${server.url}${paths[0]}`)).text();
    assert.match(projectHtml, /<h1>Alpha project<\/h1>/);
    assert.match(projectHtml, /action="\/".*>Projects<\/button>/s);

    const invalid = await create('   ');
    assert.equal((await invalid.text()).match(/data-testid="project-row"/g).length, 2);
    await server.stop();
    server = await start(databasePath);
    const persisted = await (await fetch(server.url)).text();
    assert.equal(persisted, html);
    assert.match(await (await fetch(`${server.url}${paths[0]}`)).text(), /<h1>Alpha project<\/h1>/);
    assert.equal((await fetch(`${server.url}/projects/999999`)).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, stay within their project, filter, and save completion across restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const post = (path, values) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const read = async (path) => (await fetch(`${server.url}${path}`)).text();
    const rows = (html) => [...html.matchAll(/<div class="panel task-row[^\"]*" data-testid="task-row">([\s\S]*?)<\/div>/g)].map((match) => match[1]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    let html = await read('/projects/1');
    assert.match(html, /<label for="task-title">Task title<\/label>/);
    assert.match(html, />Create task<\/button>/);
    assert.match(html, /<label for="task-filter">Task filter<\/label>/);
    assert.match(html, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(rows(html).length, 0);
    }
    for (const title of ['  Plan work  ', '<Review> & "ship"']) {
      assert.equal((await post('/projects/1/tasks', { title })).status, 303);
    }
    await post('/projects/2/tasks', { title: 'Private to second' });
    html = await read('/projects/1');
    const originalRows = rows(html);
    assert.equal(originalRows.length, 2);
    assert.match(originalRows[0], /aria-label="Complete Plan work"/);
    assert.match(originalRows[0], /<span>Plan work<\/span>/);
    assert.match(originalRows[1], /aria-label="Complete &lt;Review&gt; &amp; &quot;ship&quot;"/);
    assert.doesNotMatch(html, / checked/);
    assert.doesNotMatch(html, /Private to second/);
    assert.equal(rows(await read('/projects/1?filter=Open')).length, 2);
    assert.equal(rows(await read('/projects/1?filter=Completed')).length, 0);

    const completionPath = originalRows[0].match(/action="([^"]+)"/)[1];
    assert.equal((await post(completionPath, { completed: '1' })).status, 303);
    html = await read('/projects/1?filter=Completed');
    assert.equal(rows(html).length, 1);
    assert.match(rows(html)[0], / checked/);
    assert.match(rows(html)[0], /<span>Plan work<\/span>/);
    assert.match(html, /<option selected>Completed<\/option>/);
    assert.equal(rows(await read('/projects/1?filter=Open')).length, 1);
    assert.equal((await post('/projects/2/tasks/1', { completed: '0' })).status, 404);
    const invalid = await post('/projects/1/tasks', { title: '   ' });
    assert.equal(rows(await invalid.text()).length, 2);

    const persisted = await read('/projects/1');
    await server.stop();
    server = await start(databasePath);
    assert.equal(await read('/projects/1'), persisted);
    assert.equal(rows(await read('/projects/1?filter=Completed')).length, 1);
    assert.equal(rows(await read('/projects/2')).length, 1);
    assert.doesNotMatch(await read('/projects/2'), /Plan work|&lt;Review&gt;/);
    assert.equal((await post(completionPath, {})).status, 303);
    assert.equal(rows(await read('/projects/1?filter=Completed')).length, 0);
    assert.equal(rows(await read('/projects/1?filter=Open')).length, 2);
    await server.stop();
    server = await start(databasePath);
    assert.doesNotMatch(await read('/projects/1'), / checked/);
    assert.equal((await post('/projects/99999/tasks', { title: 'Orphan' })).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
