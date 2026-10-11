import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, DB_PATH: dbPath, PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Server startup timed out'));
    }, 5000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = /listening on port (\d+)/.exec(output);
      if (match) { clearTimeout(timer); resolve(match[1]); }
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

test('tasks validate, filter, remain project-scoped, and persist completion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const post = (path, values) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const detail = (path = '/projects/1') => fetch(`${server.url}${path}`).then(response => response.text());
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    let content = await detail();
    assert.match(content, /<label for="task-title">Task title<\/label>/);
    assert.match(content, />Create task<\/button>/);
    assert.match(content, /<label for="task-filter">Task filter<\/label>/);
    assert.match(content, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks', { title });
      content = await response.text();
      assert.match(content, /role="alert">Task title is required/);
      assert.doesNotMatch(content, /data-testid="task-row"/);
    }
    for (const title of ['  One  ', 'Two < & "three"']) {
      assert.equal((await post('/projects/1/tasks', { title })).status, 303);
    }
    content = await detail();
    assert.equal((content.match(/data-testid="task-row"/g) || []).length, 2);
    assert.ok(content.indexOf('<span>One</span>') < content.indexOf('<span>Two'));
    assert.match(content, /aria-label="Complete One"/);
    assert.match(content, /Complete Two &lt; &amp; &quot;three&quot;/);
    assert.doesNotMatch(content, / checked/);
    assert.doesNotMatch(await detail('/projects/2'), /data-testid="task-row"/);
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1', { completed: '1', filter: 'Open' })).headers.get('location'), '/projects/1?filter=Open');
    content = await detail();
    assert.match(content, /aria-label="Complete One" checked/);
    const open = await detail('/projects/1?filter=Open');
    assert.doesNotMatch(open, /<span>One<\/span>/);
    assert.match(open, /<span>Two/);
    const completed = await detail('/projects/1?filter=Completed');
    assert.match(completed, /<span>One<\/span>/);
    assert.doesNotMatch(completed, /<span>Two/);
    assert.equal(await detail(), content);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await detail(), content);
    assert.equal(await detail('/projects/1?filter=Completed'), completed);
    await post('/projects/1/tasks/1', {});
    assert.doesNotMatch(await detail(), / checked/);
    assert.doesNotMatch(await detail('/projects/1?filter=Completed'), /data-testid="task-row"/);
    await server.stop();
    server = await start(dbPath);
    assert.doesNotMatch(await detail(), / checked/);
    assert.equal((await post('/projects/999/tasks', { title: 'Missing' })).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive migration, summaries, read-only tasks, restoration, and persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const dbPath = join(directory, 'workboard.sqlite');
  // Simulate the schema and data from the previous checkpoint.
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Existing');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Done', 1), (1, 'Pending', 0);
  `);
  legacy.close();
  let server;
  try {
    server = await start(dbPath);
    const get = path => fetch(`${server.url}${path}`).then(response => response.text());
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    let list = await get('/');
    assert.match(list, /<label for="project-filter">Project filter<\/label>/);
    assert.match(list, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(list, /data-testid="project-summary">1\/2 completed/);
    assert.match(list, />Archive project<\/button>/);
    await post('/projects', { name: 'Empty' });
    assert.match(await get('/'), /data-testid="project-summary">0\/0 completed/);
    assert.equal((await post('/projects/1/archive')).status, 303);
    assert.doesNotMatch(await get('/'), /<span>Existing<\/span>/);
    list = await get('/?filter=Archived');
    assert.match(list, /<span>Existing<\/span>/);
    assert.match(list, />Open project<\/button>/);
    assert.match(list, />Restore project<\/button>/);
    assert.doesNotMatch(list, />Archive project<\/button>/);
    const archived = await get('/projects/1');
    assert.match(archived, /<p>Archived project<\/p>/);
    assert.match(archived, /<button type="submit" disabled>Create task/);
    assert.match(archived, /aria-label="Complete Done" checked disabled/);
    assert.match(archived, /aria-label="Complete Pending" disabled/);
    assert.doesNotMatch(await get('/projects/1?filter=Open'), /<span>Done<\/span>/);
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /<span>Pending<\/span>/);
    assert.equal((await post('/projects/1/tasks', { title: 'Forbidden' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1')).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/?filter=Archived'), list);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.doesNotMatch(await get('/?filter=Archived'), /data-testid="project-row"/);
    list = await get('/');
    assert.ok(list.indexOf('<span>Existing</span>') < list.indexOf('<span>Empty</span>'));
    assert.match(list, /data-testid="project-summary">1\/2 completed/);
    assert.doesNotMatch(await get('/projects/1'), / disabled/);
    await post('/projects/1/tasks/2', { completed: '1' });
    assert.match(await get('/'), /data-testid="project-summary">2\/2 completed/);
    await server.stop();
    server = await start(dbPath);
    assert.match(await get('/'), /data-testid="project-summary">2\/2 completed/);
    assert.doesNotMatch(await get('/projects/1'), /Archived project| disabled/);
    assert.equal((await post('/projects/999/archive')).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('projects validate, navigate, escape names, and persist in creation order', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const dbPath = join(directory, 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    let list = await (await fetch(server.url)).text();
    assert.match(list, /<h1>Workboard<\/h1>/);
    assert.match(list, /<label for="project-name">Project name<\/label>/);
    assert.match(list, />Create project<\/button>/);
    assert.doesNotMatch(list, /data-testid="project-row"/);

    async function create(name) {
      return fetch(`${server.url}/projects`, {
        method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
      });
    }
    for (const name of ['', ' \t\n ']) {
      const invalid = await create(name);
      const content = await invalid.text();
      assert.match(content, /role="alert">Project name is required/);
      assert.doesNotMatch(content, /data-testid="project-row"/);
    }
    for (const name of ['  Alpha  ', 'Beta <script> & "quoted"']) {
      const created = await create(name);
      assert.equal(created.status, 303);
      assert.equal(created.headers.get('location'), '/');
    }
    list = await (await fetch(server.url)).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.ok(list.indexOf('<span>Alpha</span>') < list.indexOf('<span>Beta'));
    assert.match(list, /Beta &lt;script&gt; &amp; &quot;quoted&quot;/);
    const paths = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    const detail = await (await fetch(`${server.url}${paths[0]}`)).text();
    assert.match(detail, /<h1>Alpha<\/h1>/);
    assert.match(detail, /action="\/".*>Projects<\/button>/);
    assert.equal((await fetch(`${server.url}/projects/99999`)).status, 404);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await (await fetch(server.url)).text(), list);
    assert.match(await (await fetch(`${server.url}${paths[0]}`)).text(), /<h1>Alpha<\/h1>/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
