import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

test('projects and tasks: validation, ownership, filters, completion, and restart persistence', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data/test-'));
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: resolve(directory, 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const port = await new Promise((resolvePort, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server did not start')), 5000);
      child.once('error', (error) => { clearTimeout(timeout); reject(error); });
      child.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Server exited: ${code}`)); });
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) { clearTimeout(timeout); resolvePort(match[1]); }
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
    assert.equal((initial.match(/data-testid="project-row"/g) || []).length, 0);
    const create = (name) => fetch(`${base}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    for (const name of ['', ' \t\n ']) {
      const response = await create(name);
      assert.equal(response.status, 422);
      const html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    for (const name of ['  First project  ', '<Second & project>']) {
      const response = await create(name);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    const listing = await (await fetch(base)).text();
    assert.equal((listing.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(listing, /<h3>First project<\/h3>/);
    assert.ok(listing.indexOf('First project') < listing.indexOf('&lt;Second &amp; project&gt;'));
    const ids = [...listing.matchAll(/action="\/projects\/(\d+)"/g)].map((match) => match[1]);
    assert.equal(ids.length, 2);
    assert.notEqual(ids[0], ids[1]);
    const detail = await (await fetch(`${base}/projects/${ids[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/" method="get"/);
    assert.match(detail, />Projects<\/button>/);
    assert.equal((await fetch(`${base}/projects/999999`)).status, 404);
    assert.equal(await (await fetch(base)).text(), listing);
    const taskPage = (projectId = ids[0], filter = 'All') =>
      fetch(`${base}/projects/${projectId}?filter=${filter}`).then((response) => response.text());
    const createTask = (title, projectId = ids[0]) => fetch(`${base}/projects/${projectId}/tasks`, {
      method: 'POST', body: new URLSearchParams({ title }), redirect: 'manual',
    });
    const rows = (html) => [...html.matchAll(/<article class="task-row"[\s\S]*?<\/article>/g)].map((match) => match[0]);
    assert.match(detail, /<label for="task-title">Task title<\/label>/);
    assert.match(detail, />Create task<\/button>/);
    assert.match(detail, /<label for="task-filter">Task filter<\/label>/);
    assert.match(detail, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const response = await createTask(title);
      assert.equal(response.status, 422);
      const html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(rows(html).length, 0);
    }
    for (const title of ['  First task  ', '<Second & "task">']) {
      const response = await createTask(title);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), `/projects/${ids[0]}`);
    }
    const openTasks = await taskPage();
    const taskRows = rows(openTasks);
    assert.equal(taskRows.length, 2);
    assert.match(taskRows[0], /aria-label="Complete First task"/);
    assert.match(taskRows[0], /<span>First task<\/span>/);
    assert.match(taskRows[1], /aria-label="Complete &lt;Second &amp; &quot;task&quot;&gt;"/);
    assert.doesNotMatch(openTasks, / checked/);
    assert.equal(rows(await taskPage(ids[0], 'Open')).length, 2);
    assert.equal(rows(await taskPage(ids[0], 'Completed')).length, 0);
    assert.equal(rows(await taskPage(ids[1])).length, 0);
    const taskIds = taskRows.map((row) => row.match(/\/tasks\/(\d+)\/completion/)[1]);
    const complete = (taskId, completed, projectId = ids[0], filter = 'All') => fetch(
      `${base}/projects/${projectId}/tasks/${taskId}/completion`, {
        method: 'POST', body: new URLSearchParams({ ...(completed ? { completed: '1' } : {}), filter }), redirect: 'manual',
      });
    assert.equal((await complete(taskIds[0], true, ids[1])).status, 404);
    assert.doesNotMatch(await taskPage(), / checked/);
    const completion = await complete(taskIds[0], true, ids[0], 'Open');
    assert.equal(completion.status, 303);
    assert.equal(completion.headers.get('location'), `/projects/${ids[0]}?filter=Open`);
    assert.match(rows(await taskPage())[0], / checked/);
    assert.doesNotMatch(rows(await taskPage())[1], / checked/);
    assert.match(rows(await taskPage(ids[0], 'Completed'))[0], /<span>First task<\/span>/);
    assert.equal(rows(await taskPage(ids[0], 'Completed')).length, 1);
    assert.equal(rows(await taskPage(ids[0], 'Open')).length, 1);
    assert.match(rows(await taskPage(ids[0], 'Open'))[0], /Second/);
    assert.equal((await complete(taskIds[0], false)).status, 303);
    assert.equal(await taskPage(), openTasks);
    assert.equal((await complete(taskIds[1], true)).status, 303);
    assert.equal((await createTask('Other project task', ids[1])).status, 303);
    assert.equal(rows(await taskPage(ids[1])).length, 1);
    assert.doesNotMatch(await taskPage(), /Other project task/);
    const savedTasks = await taskPage();
    const savedOtherTasks = await taskPage(ids[1]);
    const invalid = await createTask('   ');
    assert.equal(invalid.status, 422);
    assert.equal(rows(await invalid.text()).length, 2);
    assert.equal(await taskPage(), savedTasks);
    await stop();
    base = await start();
    assert.equal(await (await fetch(base)).text(), listing);
    assert.match(await (await fetch(`${base}/projects/${ids[0]}`)).text(), /<h1>First project<\/h1>/);
    assert.match(await (await fetch(`${base}/projects/${ids[1]}`)).text(), /<h1>&lt;Second &amp; project&gt;<\/h1>/);
    assert.equal(await taskPage(), savedTasks);
    assert.equal(await taskPage(ids[1]), savedOtherTasks);
    assert.equal(rows(await taskPage(ids[0], 'Completed')).length, 1);
    assert.match(rows(await taskPage(ids[0], 'Completed'))[0], /Second/);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
