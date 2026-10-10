import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

test('projects validate, navigate, escape HTML, and persist across restarts', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/test-');
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  let logs = '';
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: resolve(directory, 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.on('data', chunk => { logs += chunk; });
    child.stderr.on('data', chunk => { logs += chunk; });
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await fetch(`${base}/health`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'ok' });
        return;
      } catch {
        if (child.exitCode !== null) throw new Error(logs);
        await new Promise(resolve => setTimeout(resolve, 30));
      }
    }
    throw new Error(`Server did not become ready: ${logs}`);
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  async function create(name) {
    return fetch(`${base}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual'
    });
  }
  try {
    await start();
    let html = await (await fetch(base)).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, /Create project/);
    assert.doesNotMatch(html, /data-testid="project-row"/);
    for (const name of ['', '  \t\n ']) {
      const response = await create(name);
      html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    const response = await create('  First project  ');
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/');
    await create('<Second & project>');
    html = await (await fetch(base)).text();
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(html, /<span>First project<\/span>/);
    assert.ok(html.indexOf('First project') < html.indexOf('&lt;Second &amp; project&gt;'));
    const paths = [...html.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    const detail = await (await fetch(base + paths[0])).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*button type="submit">Projects/);
    assert.equal((await fetch(`${base}/projects/999999`)).status, 404);
    async function postTask(path, values) {
      return fetch(base + path, {
        method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
      });
    }
    const taskPath = `${paths[0]}/tasks`;
    for (const title of ['', '  \t\n ']) {
      const invalid = await postTask(taskPath, { title });
      const invalidHtml = await invalid.text();
      assert.match(invalidHtml, /role="alert">Task title is required/);
      assert.doesNotMatch(invalidHtml, /data-testid="task-row"/);
    }
    assert.equal((await postTask(taskPath, { title: '  First task  ' })).status, 303);
    await postTask(taskPath, { title: '<Second & task>' });
    let tasksHtml = await (await fetch(base + paths[0])).text();
    assert.match(tasksHtml, /<label for="task-title">Task title<\/label>/);
    assert.match(tasksHtml, /<label for="task-filter">Task filter<\/label>/);
    assert.match(tasksHtml, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    assert.match(tasksHtml, /aria-label="Complete First task"/);
    assert.match(tasksHtml, /<span>First task<\/span>/);
    assert.doesNotMatch(tasksHtml, / checked/);
    assert.equal((tasksHtml.match(/data-testid="task-row"/g) || []).length, 2);
    assert.ok(tasksHtml.indexOf('First task') < tasksHtml.indexOf('&lt;Second &amp; task&gt;'));
    const completionPath = [...tasksHtml.matchAll(/action="(\/projects\/\d+\/tasks\/\d+)"/g)][0][1];
    assert.equal((await postTask(completionPath, { completed: '1' })).status, 303);
    tasksHtml = await (await fetch(base + paths[0])).text();
    assert.match(tasksHtml, /aria-label="Complete First task" checked/);
    const openHtml = await (await fetch(base + paths[0] + '?filter=Open')).text();
    assert.doesNotMatch(openHtml, /Complete First task/);
    assert.match(openHtml, /Complete &lt;Second &amp; task&gt;/);
    const completedHtml = await (await fetch(base + paths[0] + '?filter=Completed')).text();
    assert.match(completedHtml, /Complete First task/);
    assert.doesNotMatch(completedHtml, /Complete &lt;Second &amp; task&gt;/);
    assert.doesNotMatch(await (await fetch(base + paths[1])).text(), /data-testid="task-row"/);
    const foreignTaskPath = completionPath.replace(paths[0], paths[1]);
    assert.equal((await postTask(foreignTaskPath, {})).status, 404);
    await stop();
    await start();
    assert.equal(await (await fetch(base + paths[0])).text(), tasksHtml);
    await postTask(completionPath, {});
    assert.doesNotMatch(await (await fetch(base + paths[0])).text(), / checked/);
    await stop();
    await start();
    assert.doesNotMatch(await (await fetch(base + paths[0])).text(), / checked/);
    const reloaded = await (await fetch(base)).text();
    assert.equal(reloaded, html);
    assert.match(await (await fetch(base + paths[0])).text(), /<h1>First project<\/h1>/);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
