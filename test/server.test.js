import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

async function unusedPort() {
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

test('projects and tasks: validation, ownership, filtering, completion and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const port = await unusedPort();
  const base = `http://127.0.0.1:${port}`;
  let child;
  let errors = '';
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'projects.sqlite') },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    child.stderr.on('data', (data) => { errors += data; });
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error(errors);
      try {
        const response = await fetch(`${base}/health`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'ok' });
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
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
      method: 'POST',
      body: new URLSearchParams({ name }),
      redirect: 'manual',
    });
  }
  try {
    // Simulate the pre-archive schema so the same suite exercises migration.
    const legacy = new DatabaseSync(join(directory, 'projects.sqlite'));
    legacy.exec('CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL CHECK(length(trim(name)) > 0))');
    legacy.close();
    await start();
    const initial = await (await fetch(base)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);
    for (const name of ['', '  \t\n ']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    assert.equal((await create('  First project  ')).status, 303);
    assert.equal((await create('第二 <script> & "project"')).status, 303);
    const list = await (await fetch(base)).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.ok(list.indexOf('First project') < list.indexOf('第二'));
    assert.match(list, /第二 &lt;script&gt; &amp; &quot;project&quot;/);
    const routes = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
    assert.equal(routes.length, 2);
    const detail = await (await fetch(`${base}${routes[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/"/);
    assert.match(detail, />Projects<\/button>/);
    await create('  ');
    assert.equal(await (await fetch(base)).text(), list);
    await stop();
    await start();
    assert.equal(await (await fetch(base)).text(), list);
    assert.equal(await (await fetch(`${base}${routes[0]}`)).text(), detail);
    assert.equal((await fetch(`${base}/projects/99999`)).status, 404);

    const projectPath = routes[0];
    async function postTask(path, fields) {
      return fetch(`${base}${path}`, {
        method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
      });
    }
    async function tasksPage(filter = 'all', path = projectPath) {
      return (await fetch(`${base}${path}?filter=${filter}`)).text();
    }
    const emptyTasks = await tasksPage();
    assert.match(emptyTasks, /<label for="task-title">Task title<\/label>/);
    assert.match(emptyTasks, />Create task<\/button>/);
    assert.match(emptyTasks, /<label for="task-filter">Task filter<\/label>/);
    assert.match(emptyTasks, /value="all" selected>All/);
    assert.match(emptyTasks, />Open<\/option>/);
    assert.match(emptyTasks, />Completed<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const response = await postTask(`${projectPath}/tasks`, { title });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.doesNotMatch(html, /data-testid="task-row"/);
    }
    assert.equal((await postTask(`${projectPath}/tasks`, { title: '  First task  ' })).status, 303);
    assert.equal((await postTask(`${projectPath}/tasks`, { title: '<b>Second & "task"</b>' })).status, 303);
    const taskList = await tasksPage();
    assert.equal((taskList.match(/data-testid="task-row"/g) || []).length, 2);
    assert.ok(taskList.indexOf('First task') < taskList.indexOf('&lt;b&gt;Second'));
    assert.match(taskList, /aria-label="Complete First task"/);
    assert.match(taskList, /&lt;b&gt;Second &amp; &quot;task&quot;&lt;\/b&gt;/);
    assert.doesNotMatch(taskList, / checked/);
    const openTasks = await tasksPage('open');
    assert.equal((openTasks.match(/data-testid="task-row"/g) || []).length, 2);
    assert.match(openTasks, /value="open" selected>Open/);
    assert.doesNotMatch(await tasksPage('completed'), /data-testid="task-row"/);
    assert.doesNotMatch(await tasksPage('all', routes[1]), /data-testid="task-row"/);
    const taskPaths = [...taskList.matchAll(/action="(\/projects\/\d+\/tasks\/\d+)"/g)].map((match) => match[1]);
    const update = await postTask(taskPaths[0], { completed: 'on', filter: 'open' });
    assert.equal(update.status, 303);
    assert.equal(update.headers.get('location'), `${projectPath}?filter=open`);
    assert.doesNotMatch(await tasksPage('open'), /<span>First task<\/span>/);
    assert.match(await tasksPage('completed'), /<span>First task<\/span>/);
    assert.doesNotMatch(await tasksPage('completed'), /<span>&lt;b&gt;Second/);
    const wrongOwnerPath = taskPaths[0].replace(projectPath, routes[1]);
    assert.equal((await postTask(wrongOwnerPath, {})).status, 404);
    assert.equal((await postTask('/projects/99999/tasks', { title: 'No owner' })).status, 404);
    const savedTasks = await tasksPage();
    assert.match(savedTasks, /aria-label="Complete First task" checked/);
    await stop();
    await start();
    assert.equal(await tasksPage(), savedTasks);
    assert.equal(await tasksPage('unknown'), savedTasks);
    assert.equal((await postTask(taskPaths[0], {})).status, 303);
    assert.doesNotMatch(await tasksPage(), / checked/);
    assert.doesNotMatch(await tasksPage('completed'), /data-testid="task-row"/);

    assert.match(await (await fetch(base)).text(), /data-testid="project-summary">0\/2 completed/);
    await postTask(taskPaths[0], { completed: 'on' });
    const beforeArchive = await tasksPage();
    const active = await (await fetch(base)).text();
    assert.match(active, /value="active" selected>Active/);
    assert.match(active, /data-testid="project-summary">1\/2 completed/);
    assert.match(active, /data-testid="project-summary">0\/0 completed/);
    assert.match(active, />Archive project<\/button>/);
    assert.equal((await postTask(`${projectPath}/archive`, {})).status, 303);
    const remaining = await (await fetch(base)).text();
    assert.doesNotMatch(remaining, /First project/);
    assert.match(remaining, /第二/);
    const archivedList = await (await fetch(`${base}/?filter=archived`)).text();
    assert.match(archivedList, /value="archived" selected>Archived/);
    assert.match(archivedList, /First project/);
    assert.doesNotMatch(archivedList, /第二/);
    assert.match(archivedList, /data-testid="project-summary">1\/2 completed/);
    assert.match(archivedList, />Restore project<\/button>/);
    assert.match(archivedList, />Open project<\/button>/);
    const archivedPage = await tasksPage();
    assert.match(archivedPage, /<p>Archived project<\/p>/);
    assert.match(archivedPage, /disabled>Create task/);
    assert.equal((archivedPage.match(/type="checkbox"[^>]* disabled/g) || []).length, 2);
    assert.match(await tasksPage('completed'), /<span>First task<\/span>/);
    assert.doesNotMatch(await tasksPage('open'), /<span>First task<\/span>/);
    assert.equal((await postTask(`${projectPath}/tasks`, { title: 'Forbidden' })).status, 403);
    assert.equal((await postTask(taskPaths[0], {})).status, 403);
    assert.equal(await tasksPage(), archivedPage);
    await stop();
    await start();
    assert.equal(await tasksPage(), archivedPage);
    assert.equal(await (await fetch(`${base}/?filter=archived`)).text(), archivedList);
    assert.equal((await postTask(`${projectPath}/restore`, {})).status, 303);
    assert.equal(await tasksPage(), beforeArchive);
    assert.equal(await (await fetch(base)).text(), active);
    assert.doesNotMatch(await (await fetch(`${base}/?filter=archived`)).text(), /data-testid="project-row"/);
    await stop();
    await start();
    assert.equal(await tasksPage(), beforeArchive);
    assert.equal(await (await fetch(base)).text(), active);
    assert.equal((await postTask('/projects/99999/archive', {})).status, 404);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
