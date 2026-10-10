import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const port = await new Promise((resolve, reject) => {
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = /listening on port (\d+)/.exec(output);
      if (match) resolve(match[1]);
    });
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Server exited ${code}: ${errors}`)));
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

test('priorities migrate, persist independently, and preserve task data through archive/restore', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  const databasePath = join(directory, 'board.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('First'), ('Second');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Legacy', 1), (1, 'Later', 0), (2, 'Other project', 0);
  `);
  legacy.close();
  let server;
  try {
    server = await start(databasePath);
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const prioritySelect = (html, id) => {
      const match = new RegExp(`<select id="task-priority-${id}"[^>]*>[\\s\\S]*?<\\/select>`).exec(html);
      assert.ok(match, `Priority selector for task ${id}`);
      return match[0];
    };
    const normalOptions = /<option>Low<\/option>\s*<option selected>Normal<\/option>\s*<option>High<\/option>/;
    const initial = await get('/projects/1');
    assert.match(initial, /<label for="task-priority-1">Task priority<\/label>/);
    assert.match(prioritySelect(initial, 1), normalOptions);
    assert.match(prioritySelect(initial, 2), normalOptions);
    await post('/projects/1/tasks', { title: 'New task' });
    assert.match(prioritySelect(await get('/projects/1'), 4), normalOptions);
    const summary = await get('/');
    const response = await post('/projects/1/tasks/1/priority', { priority: 'High', filter: 'Completed' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1?filter=Completed');
    await post('/projects/1/tasks/2/priority', { priority: 'Low', filter: 'Open' });
    const edited = await get('/projects/1');
    assert.match(prioritySelect(edited, 1), /<option selected>High<\/option>/);
    assert.match(prioritySelect(edited, 2), /<option selected>Low<\/option>/);
    assert.match(prioritySelect(edited, 4), normalOptions);
    assert.match(prioritySelect(await get('/projects/2'), 3), normalOptions);
    assert.match(edited, /aria-label="Complete Legacy" checked/);
    assert.ok(edited.indexOf('Complete Legacy') < edited.indexOf('Complete Later'));
    assert.ok(edited.indexOf('Complete Later') < edited.indexOf('Complete New task'));
    assert.doesNotMatch(await get('/projects/1?filter=Open'), /Complete Legacy/);
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /Complete Later/);
    assert.equal(await get('/'), summary);
    for (const priority of ['', 'Urgent', 'high']) {
      assert.equal((await post('/projects/1/tasks/1/priority', { priority })).status, 400);
      assert.equal(await get('/projects/1'), edited);
    }
    assert.equal((await post('/projects/2/tasks/1/priority', { priority: 'Low' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/priority', { priority: 'Low' })).status, 404);
    await post('/projects/1/tasks/1/rename', { title: 'Renamed' });
    const renamed = await get('/projects/1');
    assert.match(renamed, /aria-label="Complete Renamed" checked/);
    assert.match(prioritySelect(renamed, 1), /<option selected>High<\/option>/);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/projects/1'), renamed);
    assert.equal(await get('/'), summary);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    for (const id of [1, 2, 4]) assert.match(prioritySelect(archived, id), / disabled/);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Low' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), renamed);
    assert.equal(await get('/'), summary);
    await post('/projects/1/tasks/1/priority', { priority: 'Normal' });
    assert.match(prioritySelect(await get('/projects/1'), 1), normalOptions);
    await server.stop();
    server = await start(databasePath);
    assert.match(prioritySelect(await get('/projects/1'), 1), normalOptions);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task rename preserves ownership, order, completion, filters, and persistence', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  const databasePath = join(directory, 'board.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Original' });
    await post('/projects/1/tasks', { title: 'Later' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await get('/projects/1');
    assert.match(original, /<label for="new-task-title-1">New task title<\/label>/);
    assert.equal((original.match(/>Rename task<\/button>/g) || []).length, 2);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks/1/rename', { title, filter: 'Completed' });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.match(html, /aria-label="Complete Original" checked/);
      assert.equal(await get('/projects/1'), original);
    }
    assert.equal((await post('/projects/2/tasks/1/rename', { title: 'Wrong owner' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/rename', { title: 'Missing' })).status, 404);
    assert.equal((await post('/projects/999/tasks/1/rename', { title: 'Missing project' })).status, 404);
    const response = await post('/projects/1/tasks/1/rename', {
      title: '  <Renamed & "task">  ', filter: 'Completed',
    });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1?filter=Completed');
    const renamed = await get('/projects/1');
    assert.match(renamed, /aria-label="Complete &lt;Renamed &amp; &quot;task&quot;&gt;" checked/);
    assert.match(renamed, /<label for="task-1">&lt;Renamed &amp; &quot;task&quot;&gt;<\/label>/);
    assert.ok(renamed.indexOf('Complete &lt;Renamed') < renamed.indexOf('Complete Later'));
    assert.doesNotMatch(renamed, /Original/);
    assert.doesNotMatch(await get('/projects/2'), /data-testid="task-row"/);
    assert.doesNotMatch(await get('/projects/1?filter=Open'), /Complete &lt;Renamed/);
    assert.match(await get('/projects/1?filter=Completed'), /Complete &lt;Renamed/);
    const listing = await get('/');
    assert.match(listing, /1\/2 completed/);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/projects/1'), renamed);
    assert.equal(await get('/'), listing);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.equal((archived.match(/id="new-task-title-\d+"[^>]*disabled/g) || []).length, 2);
    assert.equal((archived.match(/<button type="submit" disabled>Rename task/g) || []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Blocked' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), renamed);
    assert.equal((await post('/projects/1/tasks/2/rename', { title: '  Renamed open  ', filter: 'Open' })).status, 303);
    const open = await get('/projects/1?filter=Open');
    assert.match(open, /aria-label="Complete Renamed open"/);
    assert.doesNotMatch(open, /aria-label="Complete Renamed open" checked/);
    assert.match(await get('/'), /1\/2 completed/);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/projects/1?filter=Open'), open);
    await post('/projects/1/tasks/1');
    assert.match(await get('/projects/1?filter=Open'), /Complete &lt;Renamed/);
    assert.match(await get('/'), /0\/2 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('rename preserves identity, ordering, tasks, summaries, and archive restrictions', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const databasePath = join(directory, 'board.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Open' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await get('/projects/1');
    assert.match(original, /<label for="new-project-name">New project name<\/label>/);
    assert.match(original, /<button type="submit">Rename project<\/button>/);
    for (const name of ['', ' \t\n ']) {
      const response = await post('/projects/1/rename', { name });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.match(html, /<h1>Original<\/h1>/);
      assert.equal(await get('/projects/1'), original);
    }
    const response = await post('/projects/1/rename', { name: '  <Renamed & "project">  ', filter: 'Open' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1?filter=Open');
    const renamed = await get('/projects/1');
    assert.match(renamed, /<h1>&lt;Renamed &amp; &quot;project&quot;&gt;<\/h1>/);
    assert.match(renamed, /aria-label="Complete Done" checked/);
    assert.match(renamed, /aria-label="Complete Open"/);
    assert.equal((renamed.match(/data-testid="task-row"/g) || []).length, 2);
    const listing = await get('/');
    assert.ok(listing.indexOf('<span>&lt;Renamed') < listing.indexOf('<span>Second'));
    assert.match(listing, /data-testid="project-summary">1\/2 completed/);
    assert.match(listing, /action="\/projects\/1"/);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/projects/1'), renamed);
    assert.equal(await get('/'), listing);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.match(archived, /id="new-project-name"[^>]*disabled/);
    assert.match(archived, /<button type="submit" disabled>Rename project/);
    assert.equal((await post('/projects/1/rename', { name: 'Blocked' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), renamed);
    assert.equal((await post('/projects/1/rename', { name: 'Restored' })).status, 303);
    assert.match(await get('/projects/1'), /<h1>Restored<\/h1>/);
    assert.match(await get('/'), /1\/2 completed/);
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
    await server.stop();
    server = await start(databasePath);
    assert.match(await get('/projects/1'), /<h1>Restored<\/h1>/);
    assert.match(await get('/projects/1'), /aria-label="Complete Done" checked/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive migration, summaries, read-only tasks, restoration, and persistence', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const databasePath = join(directory, 'board.sqlite');
  // Simulate the schema from the previous checkpoint.
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    INSERT INTO projects (name) VALUES ('Legacy');`);
  legacy.close();
  let server;
  try {
    server = await start(databasePath);
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    assert.match(await get('/'), /<option selected>Active<\/option>/);
    assert.match(await get('/'), /data-testid="project-summary">0\/0 completed/);
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Open' });
    await post('/projects/1/tasks/1', { completed: '1' });
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    assert.equal((await post('/projects/1/archive')).status, 303);
    assert.doesNotMatch(await get('/'), /<span>Legacy<\/span>/);
    const archived = await get('/?filter=Archived');
    assert.match(archived, /<option selected>Archived<\/option>/);
    assert.match(archived, /<span>Legacy<\/span>/);
    assert.match(archived, /1\/2 completed/);
    assert.match(archived, />Restore project<\/button>/);
    assert.match(archived, />Open project<\/button>/);
    assert.doesNotMatch(archived, /<span>Second<\/span>/);
    const detail = await get('/projects/1');
    assert.match(detail, /Archived project/);
    assert.match(detail, /<button type="submit" disabled>Create task/);
    assert.equal((detail.match(/<input[^>]*type="checkbox"[^>]*disabled/g) || []).length, 2);
    const completed = await get('/projects/1?filter=Completed');
    assert.match(completed, /Complete Done/);
    assert.doesNotMatch(completed, /Complete Open/);
    const open = await get('/projects/1?filter=Open');
    assert.match(open, /Complete Open/);
    assert.doesNotMatch(open, /Complete Done/);
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1')).status, 403);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/?filter=Archived'), archived);
    assert.equal(await get('/projects/1'), detail);
    assert.equal((await post('/projects/1/restore')).status, 303);
    const restored = await get('/projects/1');
    assert.doesNotMatch(restored, /<(?:input|button)[^>]*disabled|<p>Archived project/);
    assert.match(restored, /aria-label="Complete Done" checked/);
    assert.doesNotMatch(await get('/?filter=Archived'), /data-testid="project-row"/);
    const active = await get('/');
    assert.ok(active.indexOf('<span>Legacy') < active.indexOf('<span>Second'));
    assert.match(active, /1\/2 completed/);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/'), active);
    assert.equal(await get('/projects/1'), restored);
    assert.equal((await post('/projects/999/archive')).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, remain project-owned, and persist completion', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const databasePath = join(directory, 'board.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const post = (path, fields) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const initial = await get('/projects/1');
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.doesNotMatch(html, /data-testid="task-row"/);
    }
    for (const title of ['  First task  ', '<Second & "task">']) {
      assert.equal((await post('/projects/1/tasks', { title })).status, 303);
    }
    let all = await get('/projects/1');
    assert.equal((all.match(/data-testid="task-row"/g) || []).length, 2);
    assert.match(all, /aria-label="Complete First task"/);
    assert.match(all, /&lt;Second &amp; &quot;task&quot;&gt;/);
    assert.ok(all.indexOf('First task') < all.indexOf('&lt;Second'));
    assert.doesNotMatch(all, /value="1"\s+[^>]*checked/);
    assert.doesNotMatch(await get('/projects/2'), /data-testid="task-row"/);
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /data-testid="task-row"/);
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    const completed = await post('/projects/1/tasks/1', { completed: '1', filter: 'Open' });
    assert.equal(completed.headers.get('location'), '/projects/1?filter=Open');
    const open = await get('/projects/1?filter=Open');
    assert.doesNotMatch(open, /Complete First task/);
    assert.match(open, /Complete &lt;Second/);
    const done = await get('/projects/1?filter=Completed');
    assert.match(done, /aria-label="Complete First task" checked/);
    assert.doesNotMatch(done, /Complete &lt;Second/);
    all = await get('/projects/1');
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/projects/1'), all);
    assert.equal(await get('/projects/1?filter=Completed'), done);
    assert.equal((await post('/projects/1/tasks/1', {})).status, 303);
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /data-testid="task-row"/);
    assert.equal((await post('/projects/999/tasks', { title: 'Missing' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999', {})).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('projects validate, render safely, navigate, and persist across restarts', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const get = path => fetch(`${server.url}${path}`);
    const create = name => fetch(`${server.url}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const initial = await (await get('/')).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);

    for (const name of ['', '  \t\n ']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    for (const name of ['  First project  ', '<Second & "project">']) {
      const response = await create(name);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    const listing = await (await get('/')).text();
    assert.equal((listing.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(listing, /<span>First project<\/span>/);
    assert.match(listing, /&lt;Second &amp; &quot;project&quot;&gt;/);
    assert.ok(listing.indexOf('First project') < listing.indexOf('&lt;Second'));
    const routes = [...listing.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(routes.length, 2);
    const detail = await (await get(routes[0])).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/" method="get"><button type="submit">Projects/);
    assert.equal((await get('/projects/99999')).status, 404);
    assert.equal(await (await get('/')).text(), listing);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await (await get('/')).text(), listing);
    assert.equal(await (await get(routes[0])).text(), detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
