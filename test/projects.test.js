import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

async function unusedPort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

test('projects and tasks: validation, order, isolation, completion, filtering and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const port = await unusedPort();
  const base = `http://127.0.0.1:${port}`;
  let child;
  let output = '';
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'nested', 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await fetch(`${base}/health`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'ok' });
        return;
      } catch {
        if (child.exitCode !== null) throw new Error(output);
        await new Promise(resolve => setTimeout(resolve, 30));
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
    let html = await (await fetch(base)).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, />Create project<\/button>/);
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 0);
    for (const name of ['', '   \t\n']) {
      const response = await create(name);
      assert.equal(response.status, 422);
      html = await response.text();
      assert.match(html, /role="alert"[^>]*>Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    for (const name of ['  First project  ', 'Second <project>']) {
      const response = await create(name);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    html = await (await fetch(base)).text();
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(html, /<span>First project<\/span>/);
    assert.ok(html.indexOf('First project') < html.indexOf('Second &lt;project&gt;'));
    const paths = [...html.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    assert.notEqual(paths[0], paths[1]);
    const detail = await (await fetch(base + paths[0])).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/" method="get"><button type="submit">Projects<\/button>/);
    const invalid = await create('   ');
    assert.equal(((await invalid.text()).match(/data-testid="project-row"/g) || []).length, 2);
    async function post(path, values) {
      return fetch(base + path, {
        method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
      });
    }
    async function detailHtml(path = paths[0]) {
      return (await fetch(base + path)).text();
    }
    const taskCount = html => (html.match(/data-testid="task-row"/g) || []).length;
    assert.match(detail, /<label for="task-title">Task title<\/label>/);
    assert.match(detail, />Create task<\/button>/);
    assert.match(detail, /<label for="task-filter">Task filter<\/label>/);
    assert.match(detail, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const response = await post(`${paths[0]}/tasks`, { title });
      assert.equal(response.status, 422);
      const invalidHtml = await response.text();
      assert.match(invalidHtml, /role="alert"[^>]*>Task title is required/);
      assert.equal(taskCount(invalidHtml), 0);
    }
    for (const title of ['  First task  ', 'Second <task>']) {
      assert.equal((await post(`${paths[0]}/tasks`, { title })).status, 303);
    }
    html = await detailHtml();
    assert.equal(taskCount(html), 2);
    assert.match(html, /aria-label="Complete First task"/);
    assert.match(html, /aria-label="Complete Second &lt;task&gt;"/);
    assert.match(html, /<span>First task<\/span>/);
    assert.ok(html.indexOf('First task') < html.indexOf('Second &lt;task&gt;'));
    assert.doesNotMatch(html, /\schecked\s/);
    assert.equal(taskCount(await detailHtml(paths[1])), 0);
    const completionPaths = [...html.matchAll(/action="([^" ]+\/completion)"/g)].map(match => match[1]);
    assert.equal(completionPaths.length, 2);
    assert.equal((await post(completionPaths[0], { completed: '1' })).status, 303);
    assert.match(await detailHtml(), /aria-label="Complete First task" checked/);
    const open = await detailHtml(`${paths[0]}?filter=Open`);
    assert.equal(taskCount(open), 1);
    assert.doesNotMatch(open, /Complete First task/);
    const completed = await detailHtml(`${paths[0]}?filter=Completed`);
    assert.equal(taskCount(completed), 1);
    assert.doesNotMatch(completed, /Complete Second/);
    assert.match(completed, /<option selected>Completed/);
    const taskId = completionPaths[0].match(/\/tasks\/(\d+)/)[1];
    assert.equal((await post(`${paths[1]}/tasks/${taskId}/completion`, {})).status, 404);
    assert.match(await detailHtml(), /aria-label="Complete First task" checked/);
    assert.equal((await post(completionPaths[0], {})).status, 303);
    assert.doesNotMatch(await detailHtml(), /\schecked\s/);
    assert.equal(taskCount(await detailHtml(`${paths[0]}?filter=Completed`)), 0);
    await post(completionPaths[1], { completed: '1' });
    const invalidTask = await post(`${paths[0]}/tasks`, { title: '  ' });
    assert.equal(taskCount(await invalidTask.text()), 2);
    const tasksBeforeRestart = await detailHtml();
    const beforeRestart = await (await fetch(base)).text();
    await stop();
    await start();
    assert.equal(await (await fetch(base)).text(), beforeRestart);
    assert.equal(await detailHtml(), tasksBeforeRestart);
    assert.equal(taskCount(await detailHtml(paths[1])), 0);
    assert.equal(taskCount(await detailHtml(`${paths[0]}?filter=Completed`)), 1);
    assert.equal((await fetch(`${base}/projects/99999`)).status, 404);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
