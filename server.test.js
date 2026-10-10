import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';

test('projects and tasks: validation, order, navigation, isolation, completion, filters, and persistence', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.workboard-test-'));
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Server startup timed out')), 5000);
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    return `http://127.0.0.1:${port}`;
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  try {
    let base = await start();
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const initial = await (await fetch(base)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    for (const name of ['', '   \t ']) {
      const invalid = await (await fetch(`${base}/projects`, {
        method: 'POST', body: new URLSearchParams({ name }),
      })).text();
      assert.match(invalid, /role="alert">Project name is required/);
      assert.doesNotMatch(invalid, /data-testid="project-row"/);
    }
    for (const name of ['  First project  ', 'Second <project> & "name"']) {
      const created = await fetch(`${base}/projects`, {
        method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
      });
      assert.equal(created.status, 303);
      assert.equal(created.headers.get('location'), '/');
    }
    const list = await (await fetch(base)).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(list, /<span>First project<\/span>/);
    assert.match(list, /Second &lt;project&gt; &amp; &quot;name&quot;/);
    assert.ok(list.indexOf('First project') < list.indexOf('Second &lt;project&gt;'));
    const paths = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    const detail = await (await fetch(base + paths[0])).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/" method="get"><button type="submit">Projects/);
    assert.equal((await fetch(`${base}/projects/999999`)).status, 404);
    const projectUrl = base + paths[0];
    assert.match(detail, /<label for="task-title">Task title<\/label>/);
    assert.match(detail, />Create task<\/button>/);
    assert.match(detail, /<label for="task-filter">Task filter<\/label>/);
    assert.match(detail, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', '  \t ']) {
      const invalid = await (await fetch(`${projectUrl}/tasks`, {
        method: 'POST', body: new URLSearchParams({ title }),
      })).text();
      assert.match(invalid, /role="alert">Task title is required/);
      assert.doesNotMatch(invalid, /data-testid="task-row"/);
    }
    for (const title of ['  First task  ', 'Second <task> & "title"', 'Third task']) {
      assert.equal((await fetch(`${projectUrl}/tasks`, {
        method: 'POST', body: new URLSearchParams({ title }), redirect: 'manual',
      })).status, 303);
    }
    const tasks = await (await fetch(projectUrl)).text();
    assert.equal((tasks.match(/data-testid="task-row"/g) || []).length, 3);
    assert.match(tasks, /<span>First task<\/span>/);
    assert.match(tasks, /aria-label="Complete First task"/);
    assert.match(tasks, /aria-label="Complete Second &lt;task&gt; &amp; &quot;title&quot;"/);
    assert.doesNotMatch(tasks, / checked/);
    assert.ok(tasks.indexOf('<span>First task') < tasks.indexOf('<span>Second'));
    assert.ok(tasks.indexOf('<span>Second') < tasks.indexOf('<span>Third'));
    const taskPaths = [...tasks.matchAll(/action="(\/projects\/\d+\/tasks\/\d+)"/g)].map(match => match[1]);
    assert.equal(taskPaths.length, 3);
    assert.doesNotMatch(await (await fetch(base + paths[1])).text(), /data-testid="task-row"/);
    const saveCompletion = async (path, completed) => fetch(base + path, {
      method: 'POST', body: new URLSearchParams(completed ? { completed: '1' } : {}), redirect: 'manual',
    });
    assert.equal((await saveCompletion(taskPaths[0], true)).status, 303);
    const completed = await (await fetch(`${projectUrl}?filter=Completed`)).text();
    assert.equal((completed.match(/data-testid="task-row"/g) || []).length, 1);
    assert.match(completed, /aria-label="Complete First task" checked/);
    assert.match(completed, /<option selected>Completed<\/option>/);
    const open = await (await fetch(`${projectUrl}?filter=Open`)).text();
    assert.equal((open.match(/data-testid="task-row"/g) || []).length, 2);
    assert.doesNotMatch(open, /<span>First task/);
    assert.match(open, /<option selected>Open<\/option>/);
    assert.equal((await saveCompletion(taskPaths[0], false)).status, 303);
    assert.doesNotMatch(await (await fetch(projectUrl)).text(), / checked/);
    assert.equal((await saveCompletion(taskPaths[1], true)).status, 303);
    const wrongProjectPath = taskPaths[1].replace(paths[0], paths[1]);
    assert.equal((await saveCompletion(wrongProjectPath, false)).status, 404);
    const invalidWithTasks = await (await fetch(`${projectUrl}/tasks`, {
      method: 'POST', body: new URLSearchParams({ title: '   ' }),
    })).text();
    assert.match(invalidWithTasks, /role="alert">Task title is required/);
    assert.equal((invalidWithTasks.match(/data-testid="task-row"/g) || []).length, 3);
    const savedDetail = await (await fetch(projectUrl)).text();
    const savedCompleted = await (await fetch(`${projectUrl}?filter=Completed`)).text();
    await stop();
    base = await start();
    assert.equal(await (await fetch(base)).text(), list);
    assert.equal(await (await fetch(base + paths[0])).text(), savedDetail);
    assert.equal(await (await fetch(`${base}${paths[0]}?filter=Completed`)).text(), savedCompleted);
    assert.doesNotMatch(await (await fetch(base + paths[1])).text(), /data-testid="task-row"/);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
