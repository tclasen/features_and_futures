import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

async function startServer(databasePath) {
  const process = spawn('node', ['server.js'], {
    env: { ...globalThis.process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  process.stderr.on('data', chunk => { errors += chunk; });
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      process.kill('SIGKILL');
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    process.once('error', error => { clearTimeout(timeout); reject(error); });
    process.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    process.stdout.on('data', chunk => {
      output += chunk;
      const match = /listening on port (\d+)/.exec(output);
      if (match) {
        clearTimeout(timeout);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  const url = await ready;
  return {
    url,
    async stop() {
      const exited = once(process, 'exit');
      process.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects validate, render safely, navigate, and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    let html = await (await fetch(server.url)).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, /id="project-name" name="name" type="text"/);
    assert.match(html, />Create project<\/button>/);
    assert.doesNotMatch(html, /data-testid="project-row"/);

    const create = name => fetch(`${server.url}/projects`, {
      method: 'POST',
      body: new URLSearchParams({ name }),
      redirect: 'manual',
    });
    for (const blank of ['', ' \t\n ']) {
      const response = await create(blank);
      html = await response.text();
      assert.match(html, /role="alert"[^>]*>Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }

    const first = await create('  Alpha project  ');
    assert.equal(first.status, 303);
    assert.equal(first.headers.get('location'), '/');
    assert.equal((await create('<script>alert("test")</script>')).status, 303);

    html = await (await fetch(server.url)).text();
    const rows = [...html.matchAll(/<div class="project-row" data-testid="project-row">([\s\S]*?)<\/div>/g)];
    assert.equal(rows.length, 2);
    assert.match(rows[0][1], /<span class="project-name">Alpha project<\/span>/);
    assert.match(rows[0][1], />Open project<\/button>/);
    assert.match(rows[1][1], /&lt;script&gt;alert\(&quot;test&quot;\)&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script>/);
    const projectPath = /action="(\/projects\/\d+)"/.exec(rows[0][1])[1];
    const detail = await fetch(`${server.url}${projectPath}`);
    assert.equal(detail.status, 200);
    const detailHtml = await detail.text();
    assert.match(detailHtml, /<h1>Alpha project<\/h1>/);
    assert.match(detailHtml, /action="\/"[^>]*><button[^>]*>Projects<\/button>/);
    assert.equal((await fetch(`${server.url}/projects/999999`)).status, 404);
    assert.equal((await fetch(`${server.url}/styles.css`)).status, 200);

    const invalid = await create('   ');
    assert.match(await invalid.text(), /Project name is required/);
    assert.equal(await (await fetch(server.url)).text(), html);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await (await fetch(server.url)).text(), html);
    assert.equal(await (await fetch(`${server.url}${projectPath}`)).text(), detailHtml);
    assert.equal((await fetch(`${server.url}/health`)).status, 200);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project tasks validate, filter, toggle, stay isolated, and persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, fields) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const rows = html => [...html.matchAll(/<div class="task-row" data-testid="task-row">([\s\S]*?)<\/div>/g)].map(match => match[1]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const projectPaths = [...(await get('/')).matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    const [first, second] = projectPaths;
    let html = await get(first);
    assert.match(html, /<label for="task-title">Task title<\/label>/);
    assert.match(html, />Create task<\/button>/);
    assert.match(html, /<label for="task-filter">Task filter<\/label>/);
    assert.match(html, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    assert.equal(rows(html).length, 0);
    for (const title of ['', ' \t\n ']) {
      const response = await post(`${first}/tasks`, { title });
      html = await response.text();
      assert.match(html, /role="alert"[^>]*>Task title is required/);
      assert.equal(rows(html).length, 0);
    }
    const created = await post(`${first}/tasks`, { title: '  First task  ' });
    assert.equal(created.status, 303);
    assert.equal(created.headers.get('location'), first);
    await post(`${first}/tasks`, { title: 'Second <task> "quoted"' });
    await post(`${second}/tasks`, { title: 'Other project task' });
    html = await get(first);
    let taskRows = rows(html);
    assert.equal(taskRows.length, 2);
    assert.match(taskRows[0], /aria-label="Complete First task"/);
    assert.match(taskRows[0], />First task<\/span>/);
    assert.doesNotMatch(taskRows[0], / checked/);
    assert.match(taskRows[1], /Complete Second &lt;task&gt; &quot;quoted&quot;/);
    assert.doesNotMatch(html, /Other project task/);
    assert.equal(rows(await get(second)).length, 1);
    assert.doesNotMatch(await get(second), /Complete First task/);
    const completionPath = /action="([^"]+\/completion)"/.exec(taskRows[0])[1];
    assert.equal((await post(completionPath, { completed: '1' })).status, 303);
    taskRows = rows(await get(first));
    assert.match(taskRows[0], / checked/);
    assert.doesNotMatch(taskRows[1], / checked/);
    const open = await get(`${first}?filter=Open`);
    assert.equal(rows(open).length, 1);
    assert.match(rows(open)[0], /Second &lt;task&gt;/);
    assert.match(open, /<option selected>Open<\/option>/);
    const completed = await get(`${first}?filter=Completed`);
    assert.equal(rows(completed).length, 1);
    assert.match(rows(completed)[0], />First task<\/span>/);
    assert.match(completed, /<option selected>Completed<\/option>/);
    const invalid = await post(`${first}/tasks`, { title: '   ', filter: 'Open' });
    assert.match(await invalid.text(), /Task title is required/);
    assert.equal(await get(`${first}?filter=Open`), open);
    const foreignPath = completionPath.replace(first, second);
    assert.equal((await post(foreignPath, {})).status, 404);
    assert.match(rows(await get(first))[0], / checked/);
    assert.equal((await post('/projects/999999/tasks', { title: 'Orphan' })).status, 404);

    const saved = await get(first);
    const otherSaved = await get(second);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get(first), saved);
    assert.equal(await get(second), otherSaved);
    assert.equal(await get(`${first}?filter=Open`), open);
    assert.equal(await get(`${first}?filter=Completed`), completed);
    const unchecked = await post(completionPath, { filter: 'Completed' });
    assert.equal(unchecked.headers.get('location'), `${first}?filter=Completed`);
    assert.equal(rows(await get(`${first}?filter=Completed`)).length, 0);
    taskRows = rows(await get(first));
    assert.equal(taskRows.length, 2);
    assert.doesNotMatch(taskRows[0], / checked/);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.doesNotMatch(rows(await get(first))[0], / checked/);
    assert.equal(rows(await get(`${first}?filter=Open`)).length, 2);
    assert.equal((await fetch(`${server.url}/app.js`)).status, 200);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
