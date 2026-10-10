import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { openWorkboard } from '../database.js';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const baseUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  return {
    baseUrl,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects validate, render safely, keep creation order and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const health = await fetch(`${server.baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    let page = await (await fetch(server.baseUrl)).text();
    assert.match(page, /<h1>Workboard<\/h1>/);
    assert.match(page, /<label for="project-name">Project name<\/label>/);
    assert.match(page, /<button type="submit">Create project<\/button>/);
    assert.doesNotMatch(page, /data-testid="project-row"/);

    async function create(name) {
      return fetch(`${server.baseUrl}/projects`, {
        method: 'POST',
        body: new URLSearchParams({ name }),
        redirect: 'manual',
      });
    }
    for (const name of ['', ' \t\n ']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    const created = await create('  First project  ');
    assert.equal(created.status, 303);
    assert.equal(created.headers.get('location'), '/');
    assert.equal((await create('Second <script> & café')).status, 303);

    page = await (await fetch(server.baseUrl)).text();
    assert.equal((page.match(/data-testid="project-row"/g) ?? []).length, 2);
    assert.match(page, /<span>First project<\/span>/);
    assert.match(page, /Second &lt;script&gt; &amp; café/);
    assert.ok(page.indexOf('First project') < page.indexOf('Second &lt;script&gt;'));
    const paths = [...page.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
    assert.equal(paths.length, 2);
    const detail = await (await fetch(`${server.baseUrl}${paths[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*<button type="submit">Projects<\/button>/);
    assert.equal((await fetch(`${server.baseUrl}/projects/999999`)).status, 404);

    const invalid = await create('   ');
    assert.equal(((await invalid.text()).match(/data-testid="project-row"/g) ?? []).length, 2);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await (await fetch(server.baseUrl)).text(), page);
    assert.match(await (await fetch(`${server.baseUrl}${paths[0]}`)).text(), /<h1>First project<\/h1>/);
    await create('Third project');
    const restartedPage = await (await fetch(server.baseUrl)).text();
    assert.equal((restartedPage.match(/data-testid="project-row"/g) ?? []).length, 3);
    assert.ok(restartedPage.indexOf('Third project') > restartedPage.indexOf('Second &lt;script&gt;'));
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, belong to their project, filter and retain completion across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values) => fetch(`${server.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const getPage = async (path) => (await fetch(`${server.baseUrl}${path}`)).text();
    const taskCount = (html) => (html.match(/data-testid="task-row"/g) ?? []).length;
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });

    let page = await getPage('/projects/1');
    assert.match(page, /<label for="task-title">Task title<\/label>/);
    assert.match(page, /<button type="submit">Create task<\/button>/);
    assert.match(page, /<label for="task-filter">Task filter<\/label>/);
    assert.match(page, /<option value="all" selected>All<\/option>/);
    assert.match(page, /<option value="open">Open<\/option>/);
    assert.match(page, /<option value="completed">Completed<\/option>/);
    assert.equal(taskCount(page), 0);
    for (const title of ['', ' \t\n ', undefined]) {
      const response = await post('/projects/1/tasks', title === undefined ? {} : { title });
      assert.equal(response.status, 400);
      const invalidPage = await response.text();
      assert.match(invalidPage, /role="alert">Task title is required/);
      assert.equal(taskCount(invalidPage), 0);
    }
    assert.equal((await post('/projects/1/tasks', { title: '  Plan release  ' })).status, 303);
    assert.equal((await post('/projects/1/tasks', { title: 'Review <script> & "notes"' })).status, 303);
    await post('/projects/2/tasks', { title: 'Other project task' });
    page = await getPage('/projects/1');
    assert.equal(taskCount(page), 2);
    assert.match(page, /<span>Plan release<\/span>/);
    assert.match(page, /aria-label="Complete Plan release">/);
    assert.match(page, /aria-label="Complete Review &lt;script&gt; &amp; &quot;notes&quot;">/);
    assert.ok(page.indexOf('Plan release') < page.indexOf('Review &lt;script&gt;'));
    assert.doesNotMatch(page, /Other project task| checked/);
    assert.equal(taskCount(await getPage('/projects/1?filter=open')), 2);
    assert.equal(taskCount(await getPage('/projects/1?filter=completed')), 0);
    assert.equal(taskCount(await getPage('/projects/1?filter=invalid')), 2);
    const invalid = await post('/projects/1/tasks', { title: '   ' });
    assert.equal(taskCount(await invalid.text()), 2);

    const complete = await post('/projects/1/tasks/1/completion', { completed: 'true', filter: 'open' });
    assert.equal(complete.status, 303);
    assert.equal(complete.headers.get('location'), '/projects/1?filter=open');
    page = await getPage('/projects/1');
    assert.match(page, /aria-label="Complete Plan release" checked/);
    assert.equal(taskCount(page), 2);
    const openPage = await getPage('/projects/1?filter=open');
    assert.equal(taskCount(openPage), 1);
    assert.doesNotMatch(openPage, /Plan release/);
    assert.match(openPage, /<option value="open" selected>Open/);
    const completedPage = await getPage('/projects/1?filter=completed');
    assert.equal(taskCount(completedPage), 1);
    assert.match(completedPage, /Plan release/);
    assert.doesNotMatch(completedPage, /Review &lt;script&gt;/);
    assert.equal((await post('/projects/2/tasks/1/completion', {})).status, 404);
    assert.equal((await post('/projects/1/tasks/999/completion', {})).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Missing project' })).status, 404);
    const otherPage = await getPage('/projects/2');
    assert.equal(taskCount(otherPage), 1);
    assert.match(otherPage, /Other project task/);
    assert.doesNotMatch(otherPage, /Plan release|Review &lt;script&gt;/);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await getPage('/projects/1'), page);
    assert.equal(await getPage('/projects/1?filter=completed'), completedPage);
    assert.equal(await getPage('/projects/2'), otherPage);
    assert.equal((await post('/projects/1/tasks/1/completion', {})).status, 303);
    assert.equal(taskCount(await getPage('/projects/1?filter=open')), 2);
    assert.equal(taskCount(await getPage('/projects/1?filter=completed')), 0);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.doesNotMatch(await getPage('/projects/1'), / checked/);
    const script = await fetch(`${server.baseUrl}/app.js`);
    assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type'), /javascript/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('adding tasks preserves an existing projects database and enforces task ownership', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-upgrade-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let store;
  try {
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      INSERT INTO projects (id, name) VALUES (7, 'Existing project');
    `);
    database.close();
    store = openWorkboard(databasePath);
    assert.deepEqual({ ...store.find(7) }, { id: 7, name: 'Existing project' });
    assert.deepEqual(store.tasks.list(7), []);
    assert.equal(store.tasks.create(7, '  Existing project task  ').title, 'Existing project task');
    assert.throws(() => store.tasks.create(99, 'Orphan'), /FOREIGN KEY/);
    assert.equal(store.tasks.list(99).length, 0);
    assert.equal(store.create('Next project').id, 8);
  } finally {
    if (store) store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
