import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

test('projects and tasks validate, filter, stay isolated, and persist across restarts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port), DB_PATH: join(dir, 'projects.sqlite') }, stdio: 'ignore' });
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await fetch(`${base}/health`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'ok' });
        return;
      } catch { await new Promise(resolve => setTimeout(resolve, 30)); }
    }
    throw new Error('Server did not become healthy');
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  const create = name => fetch(`${base}/projects`, { method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual' });
  try {
    await start();
    let html = await (await fetch(base)).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    const blank = await create('   ');
    assert.equal(blank.status, 400);
    html = await blank.text();
    assert.match(html, /role="alert">Project name is required/);
    assert.doesNotMatch(html, /data-testid="project-row"/);
    assert.equal((await create('  First project  ')).status, 303);
    assert.equal((await create('Second <project>')).status, 303);
    html = await (await fetch(base)).text();
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.ok(html.indexOf('First project') < html.indexOf('Second &lt;project&gt;'));
    assert.doesNotMatch(html, /  First project  /);
    const path = html.match(/action="(\/projects\/\d+)"/)[1];
    const post = (route, values) => fetch(base + route, { method: 'POST', body: new URLSearchParams(values), redirect: 'manual' });
    const taskPage = async (filter = 'All') => (await fetch(`${base}${path}?filter=${filter}`)).text();
    let detail = await taskPage();
    assert.match(detail, /<label for="task-title">Task title<\/label>/);
    assert.match(detail, /<label for="task-filter">Task filter<\/label>/);
    assert.match(detail, /<option selected>All<\/option>/);
    const invalidTask = await post(`${path}/tasks`, { title: '   ' });
    assert.equal(invalidTask.status, 400);
    assert.match(await invalidTask.text(), /role="alert">Task title is required/);
    assert.doesNotMatch(await taskPage(), /data-testid="task-row"/);
    assert.equal((await post(`${path}/tasks`, { title: '  First task  ' })).status, 303);
    assert.equal((await post(`${path}/tasks`, { title: 'Second <task>' })).status, 303);
    detail = await taskPage();
    assert.equal((detail.match(/data-testid="task-row"/g) || []).length, 2);
    assert.ok(detail.indexOf('First task') < detail.indexOf('Second &lt;task&gt;'));
    assert.doesNotMatch(detail, /  First task  | checked/);
    assert.match(detail, /aria-label="Complete First task"/);
    const taskPath = detail.match(/action="(\/projects\/\d+\/tasks\/\d+)"/)[1];
    assert.equal((await post(taskPath, { completed: '1' })).status, 303);
    assert.match(await taskPage('Completed'), /First task/);
    assert.doesNotMatch(await taskPage('Completed'), /Second &lt;task&gt;/);
    assert.match(await taskPage('Open'), /Second &lt;task&gt;/);
    assert.doesNotMatch(await taskPage('Open'), /First task/);
    const otherPath = [...html.matchAll(/action="(\/projects\/\d+)"/g)][1][1];
    assert.doesNotMatch(await (await fetch(base + otherPath)).text(), /data-testid="task-row"/);
    assert.equal((await post(`${otherPath}/tasks/${taskPath.split('/').at(-1)}`, { completed: '1' })).status, 404);
    assert.equal((await post(taskPath, {})).status, 303);
    assert.doesNotMatch(await taskPage('Completed'), /data-testid="task-row"/);
    await post(taskPath, { completed: '1' });
    detail = await taskPage();
    assert.match(detail, / checked/);
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /<button type="submit">Projects<\/button>/);
    await stop();
    await start();
    assert.equal(await (await fetch(base)).text(), html);
    assert.equal(await (await fetch(base + path)).text(), detail);
  } finally {
    await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
