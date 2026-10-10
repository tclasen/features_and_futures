import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import net from 'node:net';

test('projects validate, navigate, and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  let errors = '';
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'projects.sqlite') },
      stdio: ['ignore', 'ignore', 'pipe']
    });
    child.stderr.on('data', chunk => { errors += chunk; });
    for (let attempt = 0; attempt < 100; attempt++) {
      try { if ((await fetch(`${base}/health`)).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error(`Server did not start: ${errors}`);
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
    assert.deepEqual(await (await fetch(`${base}/health`)).json(), { status: 'ok' });
    const initial = await (await fetch(base)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    for (const name of ['', '   ']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      const body = await response.text();
      assert.match(body, /role="alert">Project name is required/);
      assert.doesNotMatch(body, /data-testid="project-row"/);
    }
    assert.equal((await create('  First project  ')).status, 303);
    assert.equal((await create('Second <project>')).status, 303);
    const list = await (await fetch(base)).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.ok(list.indexOf('First project') < list.indexOf('Second &lt;project&gt;'));
    assert.match(list, /<span>First project<\/span>/);
    const path = list.match(/action="(\/projects\/\d+)" method="get"/)[1];
    const detail = await (await fetch(base + path)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/" method="get"><button type="submit">Projects/);
    await stop();
    await start();
    assert.equal(await (await fetch(base)).text(), list);
    assert.equal(await (await fetch(base + path)).text(), detail);
    assert.equal((await fetch(`${base}/projects/999999`)).status, 404);

    async function post(route, values) {
      return fetch(base + route, { method: 'POST', body: new URLSearchParams(values), redirect: 'manual' });
    }
    async function detailPage(filter = 'All') {
      return (await fetch(`${base}${path}?filter=${filter}`)).text();
    }
    for (const title of ['', '   ']) {
      const response = await post(`${path}/tasks`, { title });
      assert.equal(response.status, 400);
      const body = await response.text();
      assert.match(body, /role="alert">Task title is required/);
      assert.doesNotMatch(body, /data-testid="task-row"/);
    }
    assert.equal((await post(`${path}/tasks`, { title: '  First task  ' })).status, 303);
    assert.equal((await post(`${path}/tasks`, { title: 'Second <task>' })).status, 303);
    let tasks = await detailPage();
    assert.match(tasks, /<label for="task-title">Task title/);
    assert.match(tasks, /<label for="task-filter">Task filter/);
    assert.match(tasks, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    assert.equal((tasks.match(/data-testid="task-row"/g) || []).length, 2);
    assert.ok(tasks.indexOf('<span>First task') < tasks.indexOf('<span>Second &lt;task&gt;'));
    assert.match(tasks, /aria-label="Complete First task" onchange/);
    const completion = tasks.match(/action="([^\"]+\/completion)"/)[1];
    assert.equal((await post(completion, { completed: '1' })).status, 303);
    tasks = await detailPage();
    assert.match(tasks, /aria-label="Complete First task" checked/);
    assert.doesNotMatch(await detailPage('Open'), /<span>First task/);
    assert.match(await detailPage('Open'), /<span>Second &lt;task&gt;/);
    assert.match(await detailPage('Completed'), /<span>First task/);
    assert.doesNotMatch(await detailPage('Completed'), /<span>Second &lt;task&gt;/);
    assert.doesNotMatch(await (await fetch(`${base}/projects/2`)).text(), /data-testid="task-row"/);
    assert.equal((await post(completion.replace('/projects/1/', '/projects/2/'), { completed: '0' })).status, 404);
    await stop();
    await start();
    assert.equal(await detailPage(), tasks);
    assert.equal((await post(completion, {})).status, 303);
    assert.doesNotMatch(await detailPage(), /aria-label="Complete First task" checked/);
    assert.doesNotMatch(await detailPage('Completed'), /data-testid="task-row"/);
    await stop();
    await start();
    assert.doesNotMatch(await detailPage(), /aria-label="Complete First task" checked/);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
