import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import net from 'node:net';

async function availablePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test('projects and tasks validate, stay isolated, filter completion, and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-'));
  const port = await availablePort();
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
      try {
        const response = await fetch(`${base}/health`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'ok' });
        return;
      } catch {
        if (child.exitCode !== null) throw new Error(output);
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    throw new Error(`Server failed to start: ${output}`);
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
    assert.match(initial, /Create project/);
    for (const blank of ['', ' \t\n ']) {
      const response = await create(blank);
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    const response = await create('  First <project> & "test"  ');
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/');
    await create('Second');
    const list = await (await fetch(base)).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.ok(list.indexOf('First &lt;project&gt;') < list.indexOf('Second'));
    assert.match(list, /First &lt;project&gt; &amp; &quot;test&quot;<\/span>/);
    const detailPath = list.match(/action="(\/projects\/\d+)"/)[1];
    const detail = await (await fetch(base + detailPath)).text();
    assert.match(detail, /<h1>First &lt;project&gt; &amp; &quot;test&quot;<\/h1>/);
    assert.match(detail, /action="\/" method="get"><button>Projects<\/button>/);
    assert.equal((await fetch(`${base}/projects/999999`)).status, 404);
    async function post(path, values) {
      return fetch(base + path, {
        method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
      });
    }
    async function tasksPage(query = '') {
      return (await fetch(base + detailPath + query)).text();
    }
    assert.match(detail, /<label for="task-title">Task title<\/label>/);
    assert.match(detail, /<label for="task-filter">Task filter<\/label>/);
    assert.match(detail, /<option selected>All<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const invalid = await post(`${detailPath}/tasks`, { title });
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.doesNotMatch(html, /data-testid="task-row"/);
    }
    assert.equal((await post(`${detailPath}/tasks`, { title: '  First <task> & "test"  ' })).status, 303);
    await post(`${detailPath}/tasks`, { title: 'Second task' });
    const taskList = await tasksPage();
    assert.equal((taskList.match(/data-testid="task-row"/g) || []).length, 2);
    assert.ok(taskList.indexOf('First &lt;task&gt;') < taskList.indexOf('Second task'));
    assert.match(taskList, /aria-label="Complete First &lt;task&gt; &amp; &quot;test&quot;"/);
    assert.doesNotMatch(taskList, / checked/);
    const completionPath = taskList.match(/action="([^\"]+\/completion)"/)[1];
    assert.equal((await post(completionPath.replace('/projects/1/', '/projects/2/'), { completed: '1' })).status, 404);
    assert.doesNotMatch(await (await fetch(`${base}/projects/2`)).text(), /data-testid="task-row"/);
    assert.equal((await post(completionPath, { completed: '1' })).status, 303);
    assert.match(await tasksPage(), / checked/);
    const open = await tasksPage('?filter=Open');
    assert.doesNotMatch(open, /First &lt;task&gt;/);
    assert.match(open, /Second task/);
    const completed = await tasksPage('?filter=Completed');
    assert.match(completed, /First &lt;task&gt;/);
    assert.doesNotMatch(completed, /Second task/);
    assert.match(completed, /<option selected>Completed<\/option>/);
    await post(completionPath, {});
    assert.doesNotMatch(await tasksPage(), / checked/);
    assert.doesNotMatch(await tasksPage('?filter=Completed'), /data-testid="task-row"/);
    await post(completionPath, { completed: '1' });
    const savedDetail = await tasksPage();
    await stop();
    await start();
    assert.equal(await (await fetch(base)).text(), list);
    assert.equal(await tasksPage(), savedDetail);
    assert.equal(await tasksPage('?filter=Completed'), completed);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
