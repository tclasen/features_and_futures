import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

async function freePort() {
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

test('projects and scoped tasks validate, filter, and persist across server restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let child;
  let output = '';
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'db.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (data) => { output += data; });
    child.stderr.on('data', (data) => { output += data; });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(output);
      try {
        const response = await fetch(`${base}/health`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'ok' });
        return;
      } catch {
        await delay(20);
      }
    }
    throw new Error(`Server did not start: ${output}`);
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
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
  }
  try {
    await start();
    const initial = await (await fetch(base)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);
    for (const blank of ['', '   \t\n']) {
      const response = await create(blank);
      const html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    for (const name of ['  First project  ', '<Second & "project">']) {
      const response = await create(name);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    const listing = await (await fetch(base)).text();
    assert.equal((listing.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(listing, /<span>First project<\/span>/);
    assert.ok(listing.indexOf('First project') < listing.indexOf('&lt;Second'));
    assert.match(listing, /&lt;Second &amp; &quot;project&quot;&gt;/);
    const paths = [...listing.matchAll(/action="(\/projects\/[^" ]+)"/g)].map((match) => match[1]);
    assert.equal(paths.length, 2);
    const detail = await (await fetch(base + paths[0])).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/"/);
    assert.match(detail, />Projects<\/button>/);
    async function post(path, fields) {
      return fetch(base + path, {
        method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
      });
    }
    async function projectHtml(query = '') {
      return (await fetch(base + paths[0] + query)).text();
    }
    assert.match(detail, /<label for="task-title">Task title<\/label>/);
    assert.match(detail, />Create task<\/button>/);
    assert.match(detail, /<label for="task-filter">Task filter<\/label>/);
    assert.match(detail, /value="all" selected>All/);
    for (const title of ['', '  \t\n']) {
      const response = await post(paths[0] + '/tasks', { title });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.doesNotMatch(html, /data-testid="task-row"/);
    }
    for (const title of ['  First task  ', '<Second & "task">']) {
      assert.equal((await post(paths[0] + '/tasks', { title })).status, 303);
    }
    const tasks = await projectHtml();
    assert.equal((tasks.match(/data-testid="task-row"/g) || []).length, 2);
    assert.match(tasks, /<span>First task<\/span>/);
    assert.match(tasks, /aria-label="Complete First task"/);
    assert.match(tasks, /aria-label="Complete &lt;Second &amp; &quot;task&quot;&gt;"/);
    assert.ok(tasks.indexOf('First task') < tasks.indexOf('&lt;Second'));
    assert.doesNotMatch(tasks, / checked/);
    assert.doesNotMatch(await (await fetch(base + paths[1])).text(), /data-testid="task-row"/);
    const taskPaths = [...tasks.matchAll(/action="([^" ]+\/tasks\/[^" ]+)"/g)].map((match) => match[1]);
    assert.equal(taskPaths.length, 2);
    assert.equal((await post(taskPaths[0], { completed: 'on' })).status, 303);
    const open = await projectHtml('?filter=open');
    assert.doesNotMatch(open, /<span>First task<\/span>/);
    assert.match(open, /<span>&lt;Second/);
    const completed = await projectHtml('?filter=completed');
    assert.match(completed, /<span>First task<\/span>/);
    assert.doesNotMatch(completed, /<span>&lt;Second/);
    assert.match(completed, /value="completed" selected>Completed/);
    assert.match(completed, / checked/);
    // A task cannot be updated through another project's URL.
    const foreignPath = taskPaths[0].replace(paths[0], paths[1]);
    assert.equal((await post(foreignPath, {})).status, 404);
    const savedDetail = await projectHtml();
    await stop();
    await start();
    assert.equal(await (await fetch(base)).text(), listing);
    assert.equal(await projectHtml(), savedDetail);
    assert.equal(await projectHtml('?filter=completed'), completed);
    const uncheck = await fetch(base + taskPaths[0], {
      method: 'POST', body: new URLSearchParams({ filter: 'completed' }),
      headers: { Accept: 'application/json' }, redirect: 'manual',
    });
    assert.equal(uncheck.status, 200);
    assert.deepEqual(await uncheck.json(), { completed: false });
    const controls = await fetch(base + '/project-controls.js');
    assert.equal(controls.status, 200);
    assert.match(controls.headers.get('content-type'), /text\/javascript/);
    assert.doesNotMatch(await projectHtml('?filter=completed'), /data-testid="task-row"/);
    assert.equal((await projectHtml('?filter=open')).match(/data-testid="task-row"/g).length, 2);
    await stop();
    await start();
    assert.doesNotMatch(await projectHtml(), / checked/);
    assert.equal((await fetch(`${base}/projects/missing`)).status, 404);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
