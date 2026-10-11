import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const baseUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('exit', code => {
      clearTimeout(timer);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', chunk => {
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

async function post(baseUrl, path, values) {
  return fetch(baseUrl + path, {
    method: 'POST',
    body: new URLSearchParams(values),
    redirect: 'manual',
  });
}

async function create(baseUrl, name) {
  return fetch(`${baseUrl}/projects`, {
    method: 'POST',
    body: new URLSearchParams({ name }),
    redirect: 'manual',
  });
}

test('project validation, creation order, navigation, escaping, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let server;
  try {
    const databasePath = join(directory, 'nested', 'workboard.sqlite');
    server = await startServer(databasePath);
    const { baseUrl } = server;
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const initial = await (await fetch(baseUrl)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);

    for (const name of ['', ' \t\n ']) {
      const response = await create(baseUrl, name);
      const html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    for (const name of ['  First project  ', '<Second & "project">']) {
      const response = await create(baseUrl, name);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    const listing = await (await fetch(baseUrl)).text();
    assert.equal((listing.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(listing, /<span>First project<\/span>/);
    assert.match(listing, /&lt;Second &amp; &quot;project&quot;&gt;/);
    assert.ok(listing.indexOf('First project') < listing.indexOf('&lt;Second'));
    const paths = [...listing.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    assert.notEqual(paths[0], paths[1]);
    const detail = await (await fetch(baseUrl + paths[0])).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*>Projects<\/button>/);
    assert.equal((await fetch(`${baseUrl}/projects/99999`)).status, 404);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await (await fetch(server.baseUrl)).text(), listing);
    assert.equal(await (await fetch(server.baseUrl + paths[0])).text(), detail);
    await create(server.baseUrl, 'Third');
    const finalListing = await (await fetch(server.baseUrl)).text();
    assert.equal((finalListing.match(/data-testid="project-row"/g) || []).length, 3);
    assert.ok(finalListing.indexOf('Third') > finalListing.indexOf('&lt;Second'));
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, remain project-owned, and persist completion across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    await create(server.baseUrl, 'One');
    await create(server.baseUrl, 'Two');
    const detail = async (path = '/projects/1') => (await fetch(server.baseUrl + path)).text();
    const rows = html => (html.match(/data-testid="task-row"/g) || []).length;
    let html = await detail();
    assert.match(html, /<label for="task-title">Task title<\/label>/);
    assert.match(html, />Create task<\/button>/);
    assert.match(html, /<label for="task-filter">Task filter<\/label>/);
    assert.match(html, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const response = await post(server.baseUrl, '/projects/1/tasks', { title });
      html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(rows(html), 0);
    }
    for (const title of ['  First task  ', '<Second & "task">']) {
      assert.equal((await post(server.baseUrl, '/projects/1/tasks', { title })).status, 303);
    }
    html = await detail();
    assert.equal(rows(html), 2);
    assert.match(html, /<span>First task<\/span>/);
    assert.match(html, /aria-label="Complete First task"/);
    assert.match(html, /aria-label="Complete &lt;Second &amp; &quot;task&quot;&gt;"/);
    assert.doesNotMatch(html, / checked/);
    assert.ok(html.indexOf('<span>First task') < html.indexOf('<span>&lt;Second'));
    assert.equal(rows(await detail('/projects/2')), 0);
    assert.equal(rows(await detail('/projects/1?filter=Completed')), 0);
    assert.equal(rows(await detail('/projects/1?filter=Open')), 2);

    assert.equal((await post(server.baseUrl, '/projects/2/tasks/1', { completed: '1' })).status, 404);
    assert.equal((await post(server.baseUrl, '/projects/999/tasks', { title: 'Missing' })).status, 404);
    assert.equal((await post(server.baseUrl, '/projects/1/tasks/999', { completed: '1' })).status, 404);
    const completed = await post(server.baseUrl, '/projects/1/tasks/1', { completed: '1', filter: 'Open' });
    assert.equal(completed.status, 303);
    assert.equal(completed.headers.get('location'), '/projects/1?filter=Open');
    html = await detail('/projects/1?filter=Completed');
    assert.equal(rows(html), 1);
    assert.match(html, /aria-label="Complete First task" checked/);
    assert.equal(rows(await detail('/projects/1?filter=Open')), 1);
    const saved = await detail();
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await detail(), saved);
    assert.equal(rows(await detail('/projects/2')), 0);
    await post(server.baseUrl, '/projects/1/tasks/1', {});
    assert.equal(rows(await detail('/projects/1?filter=Completed')), 0);
    assert.equal(rows(await detail('/projects/1?filter=Open')), 2);
    assert.doesNotMatch(await detail(), / checked/);
    assert.match(await detail('/projects/1?filter=invalid'), /<option selected>All/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive migration, summaries, read-only tasks, restore, and persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const databasePath = join(directory, 'workboard.sqlite');
  // Exercise migration from the previous schema, with existing IDs and tasks.
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL
      REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Existing');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Done', 1), (1, 'Pending', 0);
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(databasePath);
    const get = async path => (await fetch(server.baseUrl + path)).text();
    let html = await get('/');
    assert.match(html, /<label for="project-filter">Project filter<\/label>/);
    assert.match(html, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(html, /data-testid="project-summary">1\/2 completed/);
    assert.match(html, />Archive project<\/button>/);
    assert.doesNotMatch(html, />Restore project<\/button>/);
    await create(server.baseUrl, 'New');
    assert.match(await get('/'), /data-testid="project-summary">0\/0 completed/);
    assert.equal((await post(server.baseUrl, '/projects/999/archive', {})).status, 404);
    assert.equal((await post(server.baseUrl, '/projects/1/archive', {})).status, 303);
    assert.doesNotMatch(await get('/'), /<span>Existing<\/span>/);
    html = await get('/?filter=Archived');
    assert.match(html, /<span>Existing<\/span>/);
    assert.doesNotMatch(html, /<span>New<\/span>/);
    assert.match(html, />Open project<\/button>/);
    assert.match(html, />Restore project<\/button>/);
    assert.match(html, /data-testid="project-summary">1\/2 completed/);
    const archivedListing = html;
    html = await get('/projects/1');
    assert.match(html, /Archived project/);
    assert.match(html, /<button type="submit" disabled>Create task/);
    assert.equal((html.match(/type="checkbox"[^>]* disabled/g) || []).length, 2);
    assert.match(html, /aria-label="Complete Done" checked disabled/);
    for (const filter of ['Open', 'Completed']) {
      assert.equal(((await get(`/projects/1?filter=${filter}`)).match(/data-testid="task-row"/g) || []).length, 1);
    }
    assert.equal((await post(server.baseUrl, '/projects/1/tasks', { title: 'Blocked' })).status, 403);
    assert.equal((await post(server.baseUrl, '/projects/1/tasks/1', {})).status, 403);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/?filter=Archived'), archivedListing);
    assert.equal(await get('/projects/1'), html);
    assert.equal((await post(server.baseUrl, '/projects/1/restore', {})).status, 303);
    assert.doesNotMatch(await get('/?filter=Archived'), /data-testid="project-row"/);
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    assert.doesNotMatch(await get('/projects/1'), / disabled|Archived project/);
    await post(server.baseUrl, '/projects/1/tasks/2', { completed: '1' });
    assert.match(await get('/'), /data-testid="project-summary">2\/2 completed/);
    await post(server.baseUrl, '/projects/1/tasks', { title: 'Another' });
    assert.match(await get('/'), /data-testid="project-summary">2\/3 completed/);
    const restoredListing = await get('/');
    const restoredPage = await get('/projects/1');
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/'), restoredListing);
    assert.equal(await get('/projects/1'), restoredPage);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
