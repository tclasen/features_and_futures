import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const port = await new Promise((resolvePort, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Server startup timed out')); }, 5000);
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${errors}`)); });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) { clearTimeout(timer); resolvePort(match[1]); }
    });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    stop: () => new Promise(resolveStop => {
      child.once('exit', resolveStop);
      child.kill('SIGTERM');
    }),
  };
}

test('priorities migrate, remain independent, preserve task state and persist through archive and restart', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/test-');
  const databasePath = resolve(directory, 'priority.sqlite');
  const oldDatabase = new DatabaseSync(databasePath);
  oldDatabase.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('One'), ('Two');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'First', 1), (1, 'Second', 0), (2, 'Other', 0);
  `);
  oldDatabase.close();
  let server;
  try {
    server = await start(databasePath);
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const normalOptions = '<option>Low</option><option selected>Normal</option><option>High</option>';
    const highOptions = '<option>Low</option><option>Normal</option><option selected>High</option>';
    const original = await get('/projects/1');
    const summary = await get('/');
    assert.equal(original.split(normalOptions).length - 1, 2);
    assert.match(original, /<label for="task-priority-1">Task priority<\/label>/);
    const changed = await post('/projects/1/tasks/1/priority', { priority: 'High', filter: 'Completed' });
    assert.equal(changed.status, 303);
    assert.equal(changed.headers.get('location'), '/projects/1?filter=Completed');
    const highPage = await get('/projects/1');
    assert.equal(highPage, original.replace(normalOptions, highOptions));
    assert.equal(await get('/'), summary);
    assert.doesNotMatch(await get('/projects/1?filter=Open'), /First/);
    assert.match(await get('/projects/1?filter=Completed'), /First/);
    assert.match(await get('/projects/2'), new RegExp(normalOptions));
    assert.equal((await post('/projects/2/tasks/1/priority', { priority: 'Low' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/priority', { priority: 'Low' })).status, 404);
    for (const priority of ['', 'Urgent', 'low']) {
      assert.equal((await post('/projects/1/tasks/1/priority', { priority })).status, 422);
    }
    assert.equal(await get('/projects/1'), highPage);
    await post('/projects/1/tasks/1/rename', { title: 'Renamed' });
    const renamed = highPage.replaceAll('First', 'Renamed');
    assert.equal(await get('/projects/1'), renamed);
    await post('/projects/1/tasks/2/priority', { priority: 'Low' });
    const saved = await get('/projects/1');
    assert.match(saved, /<option selected>Low<\/option><option>Normal<\/option><option>High<\/option>/);
    assert.match(saved, /aria-label="Complete Renamed" checked/);
    assert.equal(await get('/'), summary);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/projects/1'), saved);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.equal((archived.match(/<select id="task-priority-\d+"[^>]* disabled/g) || []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Normal' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), saved);
    await post('/projects/1/tasks/1/priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'New task' });
    assert.equal((await get('/projects/1')).split(normalOptions).length - 1, 1);
    assert.match(await get('/'), /data-testid="project-summary">1\/3 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task renaming preserves ownership, order, completion, filters and restart persistence', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/test-');
  const databasePath = resolve(directory, 'task-rename.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    await post('/projects', { name: 'One' });
    await post('/projects', { name: 'Two' });
    await post('/projects/1/tasks', { title: 'First' });
    await post('/projects/1/tasks', { title: 'Second' });
    await post('/projects/2/tasks', { title: 'Other' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await get('/projects/1');
    const summary = await get('/');
    assert.match(original, /<label for="new-task-title-1">New task title<\/label>/);
    assert.equal((original.match(/>Rename task<\/button>/g) || []).length, 2);
    for (const title of ['', '  \t ']) {
      const invalid = await post('/projects/1/tasks/1/rename', { title, filter: 'Completed' });
      assert.equal(invalid.status, 422);
      const html = await invalid.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.equal(await get('/projects/1'), original);
    }
    assert.equal((await post('/projects/2/tasks/1/rename', { title: 'Wrong owner' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/rename', { title: 'Missing' })).status, 404);
    assert.equal((await post('/projects/999/tasks/1/rename', { title: 'Missing' })).status, 404);
    const response = await post('/projects/1/tasks/1/rename', { title: '  Renamed <task> "quoted"  ', filter: 'Completed' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1?filter=Completed');
    const renamed = await get('/projects/1');
    assert.equal(renamed, original.replaceAll('First', 'Renamed &lt;task&gt; &quot;quoted&quot;'));
    assert.match(renamed, /aria-label="Complete Renamed &lt;task&gt; &quot;quoted&quot;" checked/);
    assert.equal(await get('/'), summary);
    assert.doesNotMatch(await get('/projects/1?filter=Open'), /Renamed/);
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /<span>Second<\/span>/);
    assert.doesNotMatch(await get('/projects/2'), /Renamed|Wrong owner/);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/projects/1'), renamed);
    assert.equal(await get('/'), summary);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.equal((archived.match(/id="new-task-title-\d+"[^>]* disabled/g) || []).length, 2);
    assert.equal((archived.match(/<button type="submit" disabled>Rename task/g) || []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Forbidden' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), renamed);
    await post('/projects/1/tasks/2/rename', { title: '  Renamed open  ', filter: 'Open' });
    assert.match(await get('/projects/1?filter=Open'), /aria-label="Complete Renamed open"\s+onchange/);
    await server.stop();
    server = await start(databasePath);
    assert.match(await get('/projects/1?filter=Open'), /<span>Renamed open<\/span>/);
    assert.equal(await get('/'), summary);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('renaming preserves identity, order, tasks and summary, validates and respects archives', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/test-');
  const databasePath = resolve(directory, 'rename.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Finished' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const originalPage = await get('/projects/1');
    assert.match(originalPage, /<label for="new-project-name">New project name<\/label>/);
    assert.match(originalPage, /Rename project/);
    for (const name of ['', '  \t ']) {
      const response = await post('/projects/1/rename', { name });
      assert.equal(response.status, 422);
      assert.match(await response.text(), /role="alert">Project name is required/);
      assert.equal(await get('/projects/1'), originalPage);
    }
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
    const renamed = await post('/projects/1/rename', { name: '  Renamed <project>  ', filter: 'Completed' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    let html = await get('/');
    assert.match(html, /<span>Renamed &lt;project&gt;<\/span>/);
    assert.doesNotMatch(html, /Original/);
    assert.ok(html.indexOf('Renamed &lt;project&gt;') < html.indexOf('<span>Second</span>'));
    assert.match(html, /action="\/projects\/1"/);
    assert.match(html, /data-testid="project-summary">1\/2 completed/);
    const renamedPage = await get('/projects/1');
    assert.equal(renamedPage, originalPage.replaceAll('Original', 'Renamed &lt;project&gt;'));
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/projects/1'), renamedPage);
    assert.equal(await get('/'), html);
    await post('/projects/1/archive');
    html = await get('/projects/1');
    assert.match(html, /id="new-project-name"[^>]* disabled/);
    assert.match(html, /<button type="submit" disabled>Rename project/);
    assert.equal((await post('/projects/1/rename', { name: 'Forbidden' })).status, 403);
    assert.equal(await get('/projects/1'), html);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), renamedPage);
    await post('/projects/1/rename', { name: 'Restored name' });
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/projects/1'), originalPage.replaceAll('Original', 'Restored name'));
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive migration, summaries, read-only tasks, restoration and persistence', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/test-');
  const databasePath = resolve(directory, 'archive.sqlite');
  // Simulate an existing Task 002 database, including saved task state.
  const oldDatabase = new DatabaseSync(databasePath);
  oldDatabase.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)));
    INSERT INTO projects (name) VALUES ('Existing'), ('Other');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Done', 1), (1, 'Pending', 0);
  `);
  oldDatabase.close();
  let server;
  try {
    server = await start(databasePath);
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    let html = await get('/');
    assert.match(html, /<label for="project-filter">Project filter<\/label>/);
    assert.match(html, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(html, /data-testid="project-summary">1\/2 completed/);
    assert.match(html, /data-testid="project-summary">0\/0 completed/);
    assert.equal((html.match(/Archive project/g) || []).length, 2);
    assert.doesNotMatch(html, /Restore project/);
    assert.equal((await post('/projects/999/archive')).status, 404);
    assert.equal((await post('/projects/1/archive')).status, 303);
    assert.doesNotMatch(await get('/'), /Existing/);
    html = await get('/?filter=Archived');
    assert.match(html, /Existing/);
    assert.doesNotMatch(html, /<span>Other<\/span>/);
    assert.match(html, /Open project/);
    assert.match(html, /Restore project/);
    assert.match(html, /data-testid="project-summary">1\/2 completed/);
    assert.match(html, /<option selected>Archived<\/option>/);
    html = await get('/projects/1');
    assert.match(html, /Archived project/);
    assert.match(html, /<button type="submit" disabled>Create task/);
    assert.equal((html.match(/data-testid="task-row"/g) || []).length, 2);
    assert.equal((html.match(/aria-label="Complete [^"]+"[^>]*disabled/g) || []).length, 2);
    assert.match(await get('/projects/1?filter=Completed'), /<span>Done<\/span>/);
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /<span>Pending<\/span>/);
    assert.match(await get('/projects/1?filter=Open'), /<span>Pending<\/span>/);
    assert.doesNotMatch(await get('/projects/1?filter=Open'), /<span>Done<\/span>/);
    assert.equal((await post('/projects/1/tasks', { title: 'Forbidden' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1', {})).status, 403);
    const archivedList = await get('/?filter=Archived');
    const archivedPage = await get('/projects/1');
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/?filter=Archived'), archivedList);
    assert.equal(await get('/projects/1'), archivedPage);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.doesNotMatch(await get('/?filter=Archived'), /data-testid="project-row"/);
    html = await get('/');
    assert.ok(html.indexOf('Existing') < html.indexOf('<span>Other</span>'));
    assert.match(html, /data-testid="project-summary">1\/2 completed/);
    html = await get('/projects/1');
    assert.doesNotMatch(html, /disabled|Archived project/);
    assert.match(html, /aria-label="Complete Done" checked/);
    await post('/projects/1/tasks/2', { completed: '1' });
    assert.match(await get('/'), /data-testid="project-summary">2\/2 completed/);
    await post('/projects/1/tasks', { title: 'New' });
    assert.match(await get('/'), /data-testid="project-summary">2\/3 completed/);
    await server.stop();
    server = await start(databasePath);
    assert.match(await get('/'), /data-testid="project-summary">2\/3 completed/);
    assert.doesNotMatch(await get('/projects/1'), /disabled|Archived project/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, remain project-scoped, and persist completion across restarts', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/test-');
  const databasePath = resolve(directory, 'tasks.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const post = (path, values) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    await post('/projects', { name: 'One' });
    await post('/projects', { name: 'Two' });
    let html = await get('/projects/1');
    assert.match(html, /<label for="task-title">Task title<\/label>/);
    assert.match(html, /Create task/);
    assert.match(html, /<label for="task-filter">Task filter<\/label>/);
    assert.match(html, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', '  \t ']) {
      const invalid = await post('/projects/1/tasks', { title });
      assert.equal(invalid.status, 422);
      html = await invalid.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.doesNotMatch(html, /data-testid="task-row"/);
    }
    assert.equal((await post('/projects/1/tasks', { title: '  First task  ' })).status, 303);
    await post('/projects/1/tasks', { title: 'Second <task> "quoted"' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    html = await get('/projects/1');
    assert.equal((html.match(/data-testid="task-row"/g) || []).length, 2);
    assert.match(html, /<span>First task<\/span>/);
    assert.match(html, /aria-label="Complete Second &lt;task&gt; &quot;quoted&quot;"/);
    assert.doesNotMatch(html, /\bchecked\b|Other project task/);
    assert.ok(html.indexOf('First task') < html.indexOf('Second &lt;task&gt;'));
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Missing' })).status, 404);
    await post('/projects/1/tasks/1', { completed: '1' });
    html = await get('/projects/1?filter=Completed');
    assert.match(html, /First task/);
    assert.match(html, /\bchecked\b/);
    assert.doesNotMatch(html, /Second &lt;task&gt;/);
    assert.match(html, /<option selected>Completed<\/option>/);
    html = await get('/projects/1?filter=Open');
    assert.doesNotMatch(html, /First task/);
    assert.match(html, /Second &lt;task&gt;/);
    const allBefore = await get('/projects/1');
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/projects/1'), allBefore);
    assert.match(await get('/projects/2'), /Other project task/);
    assert.doesNotMatch(await get('/projects/2'), /First task|Second &lt;task&gt;/);
    const unchecked = await post('/projects/1/tasks/1', { filter: 'Completed' });
    assert.equal(unchecked.headers.get('location'), '/projects/1?filter=Completed');
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /data-testid="task-row"/);
    assert.equal((await get('/projects/1?filter=Open')).match(/data-testid="task-row"/g).length, 2);
    await server.stop();
    server = await start(databasePath);
    assert.doesNotMatch(await get('/projects/1'), /\bchecked\b/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('projects validate, trim, retain creation order, navigate, and persist across restart', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/test-');
  const databasePath = resolve(directory, 'projects.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const create = name => fetch(`${server.url}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    let html = await (await fetch(server.url)).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, /Create project/);
    assert.doesNotMatch(html, /data-testid="project-row"/);
    for (const name of ['', '   \t ']) {
      const invalid = await create(name);
      html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    assert.equal((await create('  First project  ')).status, 303);
    assert.equal((await create('Second <project>')).status, 303);
    html = await (await fetch(server.url)).text();
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(html, /<span>First project<\/span>/);
    assert.ok(html.indexOf('First project') < html.indexOf('Second &lt;project&gt;'));
    const paths = [...html.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    const detail = await (await fetch(`${server.url}${paths[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*<button type="submit">Projects<\/button>/);
    const second = await (await fetch(`${server.url}${paths[1]}`)).text();
    assert.match(second, /<h1>Second &lt;project&gt;<\/h1>/);
    await server.stop();
    server = await start(databasePath);
    const persisted = await (await fetch(server.url)).text();
    assert.equal(persisted, html);
    assert.match(await (await fetch(`${server.url}${paths[0]}`)).text(), /<h1>First project<\/h1>/);
    assert.equal((await fetch(`${server.url}/projects/99999`)).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
