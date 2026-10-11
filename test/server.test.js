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
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('project validation, navigation, creation order, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await start(databasePath);
    let response = await fetch(`${server.url}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });

    const create = (name) => fetch(`${server.url}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    for (const name of ['', '  \t\n ']) {
      response = await create(name);
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    response = await create('  Alpha & <team>  ');
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/');
    assert.equal((await create('Beta')).status, 303);

    const html = await (await fetch(server.url)).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, />Create project<\/button>/);
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.ok(html.indexOf('Alpha &amp; &lt;team&gt;') < html.indexOf('Beta'));
    const projectPath = html.match(/action="(\/projects\/\d+)" method="get"/)[1];
    const detail = await (await fetch(`${server.url}${projectPath}`)).text();
    assert.match(detail, /<h1>Alpha &amp; &lt;team&gt;<\/h1>/);
    assert.match(detail, /action="\/" method="get"><button type="submit">Projects/);
    assert.equal((await fetch(`${server.url}/projects/99999`)).status, 404);
    assert.equal(await (await fetch(server.url)).text(), html);

    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await (await fetch(server.url)).text(), html);
    assert.equal(await (await fetch(`${server.url}${projectPath}`)).text(), detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter in order, remain project-owned, and persist completion across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  let server;
  try {
    const databasePath = join(directory, 'workboard.sqlite');
    server = await start(databasePath);
    const post = (path, values) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const page = async (path) => (await fetch(`${server.url}${path}`)).text();
    const rows = (html) => [...html.matchAll(/<div data-testid="task-row"[\s\S]*?<\/div>/g)]
      .map((match) => match[0]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const initial = await page('/projects/1');
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, />Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(rows(html).length, 0);
    }
    assert.equal((await post('/projects/999/tasks', { title: 'Orphan' })).status, 404);
    const created = await post('/projects/1/tasks', { title: '  Alpha & <task>  ' });
    assert.equal(created.status, 303);
    assert.equal(created.headers.get('location'), '/projects/1?filter=All');
    await post('/projects/1/tasks', { title: 'Beta' });
    await post('/projects/2/tasks', { title: 'Private' });
    let html = await page('/projects/1');
    const taskRows = rows(html);
    assert.equal(taskRows.length, 2);
    assert.match(taskRows[0], /<span>Alpha &amp; &lt;task&gt;<\/span>/);
    assert.match(taskRows[0], /aria-label="Complete Alpha &amp; &lt;task&gt;"/);
    assert.match(taskRows[1], /<span>Beta<\/span>/);
    assert.doesNotMatch(html, / checked/);
    assert.equal(rows(await page('/projects/1?filter=Open')).length, 2);
    assert.equal(rows(await page('/projects/1?filter=Completed')).length, 0);
    assert.doesNotMatch(html, /Private/);
    assert.doesNotMatch(await page('/projects/2'), /Alpha|Beta/);

    assert.equal((await post('/projects/2/tasks/1/completion', { completed: 'on' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/completion', { completed: 'on' })).status, 404);
    const completed = await post('/projects/1/tasks/1/completion', { completed: 'on', filter: 'Open' });
    assert.equal(completed.status, 303);
    assert.equal(completed.headers.get('location'), '/projects/1?filter=Open');
    html = await page('/projects/1');
    assert.match(rows(html)[0], / checked/);
    assert.doesNotMatch(rows(html)[1], / checked/);
    assert.match(rows(await page('/projects/1?filter=Open'))[0], /Beta/);
    assert.match(rows(await page('/projects/1?filter=Completed'))[0], /Alpha/);
    assert.equal(rows(await page('/projects/1?filter=invalid')).length, 2);
    const invalid = await post('/projects/1/tasks', { title: ' ', filter: 'Completed' });
    const invalidHtml = await invalid.text();
    assert.equal(rows(invalidHtml).length, 1);
    assert.match(invalidHtml, /<option selected>Completed/);

    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page('/projects/1'), html);
    assert.equal(rows(await page('/projects/2')).length, 1);
    assert.equal((await post('/projects/1/tasks/1/completion', {})).status, 303);
    assert.equal(rows(await page('/projects/1?filter=Completed')).length, 0);
    assert.equal(rows(await page('/projects/1?filter=Open')).length, 2);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.doesNotMatch(await page('/projects/1'), / checked/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
