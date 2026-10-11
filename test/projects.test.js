import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

async function startServer(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const base = await new Promise((resolveBase, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server did not start: ${errors}`));
    }, 5000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', chunk => {
      const match = /listening on port (\d+)/.exec(String(chunk));
      if (match) {
        clearTimeout(timeout);
        resolveBase(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  return {
    base,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects validate, navigate, and persist in creation order across restarts', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'project-test-'));
  const dbPath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(dbPath);
    const health = await fetch(`${server.base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const initial = await (await fetch(server.base)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);

    async function create(name) {
      return fetch(`${server.base}/projects`, {
        method: 'POST',
        body: new URLSearchParams({ name }),
        redirect: 'manual',
      });
    }
    for (const name of ['', ' \t\n ']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert"[^>]*>Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    const first = await create('  First project  ');
    assert.equal(first.status, 303);
    assert.equal(first.headers.get('location'), '/');
    assert.equal((await create('Second <project> & "friends"')).status, 303);
    const list = await (await fetch(server.base)).text();
    assert.equal((list.match(/data-testid="project-row"/g) ?? []).length, 2);
    assert.match(list, /<span>First project<\/span>/);
    assert.match(list, /Second &lt;project&gt; &amp; &quot;friends&quot;/);
    assert.ok(list.indexOf('First project') < list.indexOf('Second &lt;project&gt;'));
    const paths = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    assert.notEqual(paths[0], paths[1]);

    const detail = await (await fetch(`${server.base}${paths[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /<form method="get" action="\/">.*>Projects<\/button>/);
    const invalidAfterCreate = await create('   ');
    assert.equal(((await invalidAfterCreate.text()).match(/data-testid="project-row"/g) ?? []).length, 2);
    assert.equal((await fetch(`${server.base}/projects/9999`)).status, 404);

    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await (await fetch(server.base)).text(), list);
    assert.equal(await (await fetch(`${server.base}${paths[0]}`)).text(), detail);
    assert.equal((await create('Third project')).status, 303);
    const restartedList = await (await fetch(server.base)).text();
    assert.equal((restartedList.match(/data-testid="project-row"/g) ?? []).length, 3);
    assert.ok(restartedList.indexOf('Second &lt;project&gt;') < restartedList.indexOf('Third project'));
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, isolate projects, and persist completion across restarts', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'task-test-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(dbPath);
    const post = (path, values) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const rows = page => [...page.matchAll(/<div data-testid="task-row"[\s\S]*?<\/div>/g)].map(match => match[0]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const initial = await html('/projects/1');
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, />Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    assert.equal(rows(initial).length, 0);
    for (const title of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/tasks', { title });
      assert.equal(invalid.status, 400);
      const page = await invalid.text();
      assert.match(page, /role="alert"[^>]*>Task title is required/);
      assert.equal(rows(page).length, 0);
    }
    const created = await post('/projects/1/tasks', { title: '  First task  ' });
    assert.equal(created.status, 303);
    assert.equal(created.headers.get('location'), '/projects/1');
    await post('/projects/1/tasks', { title: 'Second <task> & "review"' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    let tasks = rows(await html('/projects/1'));
    assert.equal(tasks.length, 2);
    assert.match(tasks[0], /<span>First task<\/span>/);
    assert.match(tasks[0], /aria-label="Complete First task"/);
    assert.match(tasks[1], /aria-label="Complete Second &lt;task&gt; &amp; &quot;review&quot;"/);
    assert.ok(tasks.every(row => !row.includes(' checked')));
    assert.doesNotMatch(await html('/projects/1'), /Other project task/);
    const otherTasks = rows(await html('/projects/2'));
    assert.equal(otherTasks.length, 1);
    assert.match(otherTasks[0], /Other project task/);
    const firstAction = /action="([^"]+)"/.exec(tasks[0])[1];
    const wrongProjectAction = firstAction.replace('/projects/1/', '/projects/2/');
    assert.equal((await post(wrongProjectAction, { completed: '1' })).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Missing project' })).status, 404);
    assert.equal((await post(firstAction, { completed: '1' })).status, 303);
    tasks = rows(await html('/projects/1'));
    assert.match(tasks[0], / checked/);
    assert.doesNotMatch(tasks[1], / checked/);
    const open = rows(await html('/projects/1?filter=Open'));
    const completed = rows(await html('/projects/1?filter=Completed'));
    assert.equal(open.length, 1);
    assert.match(open[0], /Second &lt;task&gt;/);
    assert.equal(completed.length, 1);
    assert.match(completed[0], /First task/);
    assert.equal(rows(await html('/projects/1?filter=invalid')).length, 2);
    const invalid = await post('/projects/1/tasks', { title: '   ' });
    assert.equal(rows(await invalid.text()).length, 2);
    const savedPage = await html('/projects/1');
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/1'), savedPage);
    assert.equal(rows(await html('/projects/1?filter=Completed')).length, 1);
    const unchecked = await post(firstAction, { filter: 'Completed' });
    assert.equal(unchecked.status, 303);
    assert.equal(unchecked.headers.get('location'), '/projects/1?filter=Completed');
    assert.equal(rows(await html('/projects/1?filter=Completed')).length, 0);
    assert.equal(rows(await html('/projects/1?filter=Open')).length, 2);
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.ok(rows(await html('/projects/1')).every(row => !row.includes(' checked')));
    assert.equal(rows(await html('/projects/2')).length, 1);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
