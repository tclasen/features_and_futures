import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const port = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => reject(new Error(`Server exited: ${code}, ${output}`)));
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(match[1]);
    });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects validate, trim, render safely, navigate, and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const initial = await (await fetch(server.url)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);

    async function create(name) {
      return fetch(`${server.url}/projects`, {
        method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
      });
    }
    for (const name of ['', '   \t\n']) {
      const invalid = await create(name);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    assert.equal((await create('  First project  ')).status, 303);
    assert.equal((await create('Second <script>alert(1)</script>')).status, 303);
    const list = await (await fetch(server.url)).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(list, /<span>First project<\/span>/);
    assert.match(list, /Second &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.ok(list.indexOf('First project') < list.indexOf('Second &lt;'));
    const path = list.match(/action="(\/projects\/\d+)"/)[1];
    const detail = await (await fetch(`${server.url}${path}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/" method="get"><button type="submit">Projects/);
    assert.equal((await fetch(`${server.url}/projects/99999`)).status, 404);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await (await fetch(server.url)).text(), list);
    assert.equal(await (await fetch(`${server.url}${path}`)).text(), detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive, restore, summaries, and migration preserve tasks across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const databasePath = join(directory, 'projects.sqlite');
  // Simulate a database from the previous checkpoint.
  const oldDb = new DatabaseSync(databasePath);
  oldDb.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    INSERT INTO projects (name) VALUES ('Existing project')`);
  oldDb.close();
  let server;
  try {
    server = await start(databasePath);
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const html = async (path = '/') => (await fetch(`${server.url}${path}`)).text();
    const initial = await html();
    assert.match(initial, /<label for="project-filter">Project filter<\/label>/);
    assert.match(initial, /<option selected>Active<\/option>/);
    assert.match(initial, /data-testid="project-summary">0\/0 completed/);
    await post('/projects/1/tasks', { title: 'First task' });
    await post('/projects/1/tasks', { title: 'Second task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    await html('/projects/1?filter=Open');
    assert.match(await html(), /data-testid="project-summary">1\/2 completed/);
    assert.equal((await post('/projects/1/archive')).status, 303);
    assert.doesNotMatch(await html(), /data-testid="project-row"/);
    const archivedList = await html('/?filter=Archived');
    assert.match(archivedList, />Restore project<\/button>/);
    assert.match(archivedList, />Open project<\/button>/);
    assert.match(archivedList, /1\/2 completed/);
    const archivedPage = await html('/projects/1');
    assert.match(archivedPage, /<p>Archived project<\/p>/);
    assert.match(archivedPage, /disabled>Create task<\/button>/);
    assert.equal((archivedPage.match(/type="checkbox"[^>]* disabled/g) || []).length, 2);
    assert.equal((await post('/projects/1/tasks', { title: 'Forbidden' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1', {})).status, 403);
    assert.doesNotMatch(await html('/projects/1?filter=Completed'), /Second task/);
    assert.doesNotMatch(await html('/projects/1?filter=Open'), /First task/);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await html('/?filter=Archived'), archivedList);
    assert.equal(await html('/projects/1'), archivedPage);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.doesNotMatch(await html('/?filter=Archived'), /data-testid="project-row"/);
    assert.match(await html(), /1\/2 completed/);
    assert.doesNotMatch(await html('/projects/1'), / disabled|Archived project/);
    await post('/projects/1/tasks/2', { completed: '1' });
    assert.match(await html(), /2\/2 completed/);
    await server.stop();
    server = await start(databasePath);
    assert.match(await html(), /2\/2 completed/);
    assert.doesNotMatch(await html('/projects/1'), / disabled|Archived project/);
    assert.equal((await post('/projects/999/archive')).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('rename validates and preserves identity, order, tasks, and archive protection', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const databasePath = join(directory, 'projects.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const html = async (path = '/') => (await fetch(`${server.url}${path}`)).text();
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Saved task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const initial = await html('/projects/1');
    assert.match(initial, /<label for="new-project-name">New project name<\/label>/);
    assert.match(initial, />Rename project<\/button>/);
    for (const name of ['', ' \t\n']) {
      const response = await post('/projects/1/rename', { name });
      assert.equal(response.status, 400);
      const body = await response.text();
      assert.match(body, /role="alert">Project name is required/);
      assert.match(body, /<h1>Original<\/h1>/);
    }
    const renamed = await post('/projects/1/rename', { name: '  Renamed <project>  ', filter: 'Completed' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const list = await html();
    assert.match(list, /<span>Renamed &lt;project&gt;<\/span>/);
    assert.ok(list.indexOf('Renamed &lt;project&gt;') < list.indexOf('<span>Second'));
    assert.match(list, /data-testid="project-summary">1\/1 completed/);
    const detail = await html('/projects/1');
    assert.match(detail, /<h1>Renamed &lt;project&gt;<\/h1>/);
    assert.match(detail, /Complete Saved task" checked/);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await html(), list);
    assert.equal(await html('/projects/1'), detail);
    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    assert.match(archived, /id="new-project-name"[^>]* disabled/);
    assert.match(archived, /disabled>Rename project<\/button>/);
    assert.equal((await post('/projects/1/rename', { name: 'Forbidden' })).status, 403);
    assert.equal(await html('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.doesNotMatch(await html('/projects/1'), / disabled/);
    assert.equal((await post('/projects/1/rename', { name: 'Restored name' })).status, 303);
    await server.stop();
    server = await start(databasePath);
    assert.match(await html('/projects/1'), /<h1>Restored name<\/h1>/);
    assert.match(await html('/projects/1'), /Complete Saved task" checked/);
    assert.match(await html(), /1\/1 completed/);
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, stay project-scoped, and persist completion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const databasePath = join(directory, 'tasks.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const post = (path, fields) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const html = async (path) => (await fetch(`${server.url}${path}`)).text();
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const initial = await html('/projects/1');
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option>/);
    for (const title of ['', ' \t\n']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      const body = await response.text();
      assert.match(body, /role="alert">Task title is required/);
      assert.doesNotMatch(body, /data-testid="task-row"/);
    }
    await post('/projects/1/tasks', { title: '  First task  ' });
    await post('/projects/1/tasks', { title: 'Second <task>' });
    const all = await html('/projects/1');
    assert.equal((all.match(/data-testid="task-row"/g) || []).length, 2);
    assert.match(all, /<span>First task<\/span>/);
    assert.match(all, /aria-label="Complete First task"/);
    assert.ok(all.indexOf('First task') < all.indexOf('Second &lt;task&gt;'));
    assert.doesNotMatch(all, / checked/);
    assert.doesNotMatch(await html('/projects/2'), /data-testid="task-row"/);
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    await post('/projects/1/tasks/1', { completed: '1' });
    const completed = await html('/projects/1?filter=Completed');
    assert.match(completed, /Complete First task" checked/);
    assert.doesNotMatch(completed, /Second &lt;task&gt;/);
    const open = await html('/projects/1?filter=Open');
    assert.doesNotMatch(open, /First task/);
    assert.match(open, /Second &lt;task&gt;/);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await html('/projects/1?filter=Completed'), completed);
    assert.equal(await html('/projects/1?filter=Open'), open);
    await post('/projects/1/tasks/1', {});
    assert.doesNotMatch(await html('/projects/1?filter=Completed'), /data-testid="task-row"/);
    assert.equal((await html('/projects/1?filter=Open')).match(/data-testid="task-row"/g).length, 2);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
