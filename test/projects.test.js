import test from 'node:test';
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
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Server exited: ${code}: ${errors}`)); });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() {
      if (child.exitCode !== null) return;
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('tasks validate, filter, stay isolated, and persist completion across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const paths = [...(await get('/')).matchAll(/action="(\/projects\/[a-zA-Z0-9-]+)"/g)].map((match) => match[1]);
    let html = await get(paths[0]);
    assert.match(html, /<label for="task-title">Task title<\/label>/);
    assert.match(html, /<label for="task-filter">Task filter<\/label>/);
    assert.match(html, /<option selected>All<\/option>/);
    for (const title of ['', '  \t ']) {
      const response = await post(`${paths[0]}/tasks`, { title });
      assert.equal(response.status, 422);
      html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.doesNotMatch(html, /data-testid="task-row"/);
    }
    assert.equal((await post(`${paths[0]}/tasks`, { title: '  First task  ' })).status, 303);
    await post(`${paths[0]}/tasks`, { title: '<b>Second</b>' });
    html = await get(paths[0]);
    assert.equal((html.match(/data-testid="task-row"/g) ?? []).length, 2);
    assert.match(html, /aria-label="Complete First task"/);
    assert.match(html, /<span>First task<\/span>/);
    assert.match(html, /<span>&lt;b&gt;Second&lt;\/b&gt;<\/span>/);
    assert.ok(html.indexOf('First task</span>') < html.indexOf('&lt;b&gt;Second'));
    assert.doesNotMatch(html, / checked/);
    const taskPaths = [...html.matchAll(/action="(\/projects\/[a-zA-Z0-9-]+\/tasks\/[a-zA-Z0-9-]+)"/g)].map((match) => match[1]);
    const completionSave = await fetch(`${server.url}${taskPaths[0]}`, {
      method: 'POST', body: new URLSearchParams({ completed: '1' }),
      headers: { Accept: 'application/json' }, redirect: 'manual',
    });
    assert.equal(completionSave.status, 200);
    assert.deepEqual(await completionSave.json(), { status: 'ok' });
    assert.equal(completionSave.headers.get('location'), null);
    assert.equal((await post(taskPaths[0], { completed: '1' })).status, 303);
    const completed = await get(`${paths[0]}?filter=Completed`);
    assert.match(completed, /value="1" aria-label="Complete First task" checked/);
    assert.doesNotMatch(completed, /&lt;b&gt;Second/);
    const open = await get(`${paths[0]}?filter=Open`);
    assert.doesNotMatch(open, /First task/);
    assert.match(open, /&lt;b&gt;Second/);
    assert.doesNotMatch(await get(paths[1]), /data-testid="task-row"/);
    const wrongProject = taskPaths[0].replace(paths[0], paths[1]);
    assert.equal((await post(wrongProject, { completed: '0' })).status, 404);
    assert.equal((await post('/projects/missing/tasks', { title: 'Orphan' })).status, 404);
    const beforeRestart = await get(paths[0]);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get(paths[0]), beforeRestart);
    assert.equal(await get(`${paths[0]}?filter=Completed`), completed);
    assert.equal((await post(taskPaths[0], {})).status, 303);
    assert.doesNotMatch(await get(paths[0]), / checked/);
    assert.doesNotMatch(await get(`${paths[0]}?filter=Completed`), /data-testid="task-row"/);
    assert.equal((await get(`${paths[0]}?filter=Open`)).match(/data-testid="task-row"/g).length, 2);
    assert.match(await get(`${paths[0]}?filter=invalid`), /<option selected>All<\/option>/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive migration, summaries, read-only tasks, restoration, and persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`CREATE TABLE projects (
    position INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, name TEXT NOT NULL
  ); INSERT INTO projects (id, name) VALUES ('legacy', 'Existing project');`);
  legacy.close();
  let server;
  try {
    server = await startServer(databasePath);
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    let html = await get('/');
    assert.match(html, /<option selected>Active<\/option>/);
    assert.match(html, /data-testid="project-summary">0\/0 completed/);
    assert.match(html, />Archive project<\/button>/);
    await post('/projects/legacy/tasks', { title: 'Finished' });
    await post('/projects/legacy/tasks', { title: 'Pending' });
    const detail = await get('/projects/legacy');
    const taskPath = detail.match(/action="([^\"]+\/tasks\/[^\"]+)"/)[1];
    await post(taskPath, { completed: '1' });
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    await get('/projects/legacy?filter=Open');
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    assert.equal((await post('/projects/legacy/archive')).status, 303);
    assert.doesNotMatch(await get('/'), /data-testid="project-row"/);
    html = await get('/?filter=Archived');
    assert.match(html, /<option selected>Archived<\/option>/);
    assert.match(html, />Open project<\/button>/);
    assert.match(html, />Restore project<\/button>/);
    assert.match(html, /data-testid="project-summary">1\/2 completed/);
    const archivedDetail = await get('/projects/legacy');
    assert.match(archivedDetail, />Archived project<\/p>/);
    assert.match(archivedDetail, /<button type="submit" disabled>Create task/);
    assert.equal((archivedDetail.match(/type="checkbox"[^>]* disabled/g) ?? []).length, 2);
    assert.match(archivedDetail, /Complete Finished" checked disabled/);
    const open = await get('/projects/legacy?filter=Open');
    assert.doesNotMatch(open, /Finished/);
    assert.match(open, /Pending/);
    const completed = await get('/projects/legacy?filter=Completed');
    assert.match(completed, /Finished/);
    assert.doesNotMatch(completed, /Pending/);
    assert.equal((await post('/projects/legacy/tasks', { title: 'Forbidden' })).status, 403);
    assert.equal((await post(taskPath, {})).status, 403);
    assert.equal(await get('/projects/legacy'), archivedDetail);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/?filter=Archived'), html);
    assert.equal(await get('/projects/legacy'), archivedDetail);
    assert.equal((await post('/projects/legacy/restore')).status, 303);
    assert.doesNotMatch(await get('/?filter=Archived'), /data-testid="project-row"/);
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    assert.doesNotMatch((await get('/projects/legacy')).replace(/<form class="create task-move"[\s\S]*?<\/form>/g, ''), / disabled/);
    await post(taskPath, {});
    assert.match(await get('/'), /data-testid="project-summary">0\/2 completed/);
    await server.stop();
    server = await startServer(databasePath);
    assert.match(await get('/'), /data-testid="project-summary">0\/2 completed/);
    assert.doesNotMatch(await get('/projects/legacy'), / checked|Archived project/);
    assert.equal((await post('/projects/missing/archive')).status, 404);
    assert.equal((await post('/projects/missing/restore')).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('rename preserves identity, order, tasks, summaries, and archive protections across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    const paths = [...(await get('/')).matchAll(/action="(\/projects\/[a-zA-Z0-9-]+)"/g)].map((match) => match[1]);
    const path = paths[0];
    await post(`${path}/tasks`, { title: 'Done' });
    await post(`${path}/tasks`, { title: 'Pending' });
    let detail = await get(path);
    const taskPath = detail.match(/action="([^\"]+\/tasks\/[^\"]+)"/)[1];
    await post(taskPath, { completed: '1' });
    detail = await get(path);
    assert.match(detail, /<label for="new-project-name">New project name<\/label>/);
    assert.match(detail, /<button type="submit">Rename project<\/button>/);
    for (const name of ['', ' \t ', undefined]) {
      const response = await post(`${path}/rename`, name === undefined ? {} : { name });
      assert.equal(response.status, 422);
      const html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.match(html, /<h1>Original<\/h1>/);
      assert.equal(await get(path), detail);
    }
    const response = await post(`${path}/rename`, { name: '  Renamed <team> "A"  ', filter: 'Open' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), `${path}?filter=Open`);
    let html = await get(path);
    assert.match(html, /<h1>Renamed &lt;team&gt; &quot;A&quot;<\/h1>/);
    assert.match(html, /value="Renamed &lt;team&gt; &quot;A&quot;"/);
    // Only the project name changes; task identities, ordering and state stay identical.
    assert.equal(html, detail.replaceAll('Original', 'Renamed &lt;team&gt; &quot;A&quot;'));
    let listing = await get('/');
    assert.ok(listing.indexOf('Renamed &lt;team&gt;') < listing.indexOf('<span>Second</span>'));
    assert.match(listing, /data-testid="project-summary">1\/2 completed/);
    assert.deepEqual([...listing.matchAll(/action="(\/projects\/[a-zA-Z0-9-]+)"/g)].map((match) => match[1]), paths);
    assert.match(await get(paths[1]), /<h1>Second<\/h1>/);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get(path), html);
    assert.equal(await get('/'), listing);
    await post(`${path}/archive`);
    html = await get(path);
    assert.match(html, /id="new-project-name"[^>]* disabled/);
    assert.match(html, /<button type="submit" disabled>Rename project<\/button>/);
    assert.equal((await post(`${path}/rename`, { name: 'Forbidden' })).status, 403);
    assert.equal(await get(path), html);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get(path), html);
    await post(`${path}/restore`);
    assert.doesNotMatch(await get(path), / disabled/);
    assert.equal((await post(`${path}/rename`, { name: '  Restored name  ' })).status, 303);
    html = await get(path);
    assert.equal(html, detail.replaceAll('Original', 'Restored name'));
    listing = await get('/');
    assert.match(listing, /data-testid="project-summary">1\/2 completed/);
    assert.ok(listing.indexOf('<span>Restored name</span>') < listing.indexOf('<span>Second</span>'));
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get(path), html);
    assert.equal(await get('/'), listing);
    assert.equal((await post('/projects/missing/rename', { name: 'Missing' })).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task renaming preserves completion, ownership, ordering, filters, and archive protections', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    await post('/projects', { name: 'Owner' });
    await post('/projects', { name: 'Other' });
    const paths = [...(await get('/')).matchAll(/action="(\/projects\/[a-zA-Z0-9-]+)"/g)].map((match) => match[1]);
    const path = paths[0];
    await post(`${path}/tasks`, { title: 'Original' });
    await post(`${path}/tasks`, { title: 'Second' });
    let detail = await get(path);
    const taskPath = detail.match(/action="([^\"]+\/tasks\/[a-zA-Z0-9-]+)"/)[1];
    await post(taskPath, { completed: '1' });
    detail = await get(path);
    const listing = await get('/');
    assert.equal((detail.match(/>New task title<\/label>/g) ?? []).length, 2);
    assert.equal((detail.match(/>Rename task<\/button>/g) ?? []).length, 2);
    for (const title of ['', ' \t ', undefined]) {
      const response = await post(`${taskPath}/rename`, title === undefined ? {} : { title, filter: 'Completed' });
      assert.equal(response.status, 422);
      assert.match(await response.text(), /role="alert">Task title is required/);
      assert.equal(await get(path), detail);
    }
    const response = await post(`${taskPath}/rename`, { title: '  Renamed <task> "A"  ', filter: 'Completed' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), `${path}?filter=Completed`);
    const renamed = detail.replaceAll('Original', 'Renamed &lt;task&gt; &quot;A&quot;');
    assert.equal(await get(path), renamed);
    assert.match(renamed, /aria-label="Complete Renamed &lt;task&gt; &quot;A&quot;" checked/);
    assert.doesNotMatch(await get(`${path}?filter=Open`), /Renamed/);
    assert.doesNotMatch(await get(`${path}?filter=Completed`), /Second/);
    assert.equal(await get('/'), listing);
    assert.doesNotMatch(await get(paths[1]), /data-testid="task-row"/);
    const wrongProject = taskPath.replace(path, paths[1]);
    assert.equal((await post(`${wrongProject}/rename`, { title: 'Stolen' })).status, 404);
    assert.equal((await post(`${path}/tasks/missing/rename`, { title: 'Missing' })).status, 404);
    assert.equal((await post('/projects/missing/tasks/missing/rename', { title: 'Missing' })).status, 404);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get(path), renamed);
    assert.equal(await get('/'), listing);
    await post(`${path}/archive`);
    const archived = await get(path);
    assert.equal((archived.match(/id="new-task-title-[^"]+"[^>]* disabled/g) ?? []).length, 2);
    assert.equal((archived.match(/<button type="submit" disabled>Rename task/g) ?? []).length, 2);
    assert.equal((await post(`${taskPath}/rename`, { title: 'Forbidden' })).status, 403);
    assert.equal(await get(path), archived);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get(path), archived);
    await post(`${path}/restore`);
    assert.equal(await get(path), renamed);
    assert.equal((await post(`${taskPath}/rename`, { title: '  Restored title  ' })).status, 303);
    const restored = detail.replaceAll('Original', 'Restored title');
    assert.equal(await get(path), restored);
    assert.equal(await get('/'), listing);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get(path), restored);
    assert.equal(await get('/'), listing);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project creation, navigation, escaping, and persistence across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    let html = await (await fetch(server.url)).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.doesNotMatch(html, /data-testid="project-row"/);

    const create = (name) => fetch(`${server.url}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    for (const name of ['', '   \t ']) {
      const response = await create(name);
      assert.equal(response.status, 422);
      html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    assert.equal((await create('  First project  ')).status, 303);
    assert.equal((await create('<script>alert("x")</script>')).status, 303);
    html = await (await fetch(server.url)).text();
    assert.equal((html.match(/data-testid="project-row"/g) ?? []).length, 2);
    assert.match(html, /<span>First project<\/span>/);
    assert.ok(html.indexOf('First project</span>') < html.indexOf('&lt;script&gt;'));
    assert.doesNotMatch(html, /<script>/);
    const paths = [...html.matchAll(/action="(\/projects\/[a-zA-Z0-9-]+)"/g)].map((match) => match[1]);
    assert.equal(paths.length, 2);
    assert.notEqual(paths[0], paths[1]);
    const detail = await (await fetch(`${server.url}${paths[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /<button type="submit">Projects<\/button>/);
    assert.equal((await fetch(`${server.url}/projects/missing`)).status, 404);

    const invalid = await create('   ');
    assert.equal((await invalid.text()).match(/data-testid="project-row"/g).length, 2);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await (await fetch(server.url)).text(), html);
    assert.equal(await (await fetch(`${server.url}${paths[0]}`)).text(), detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('priorities migrate, remain independent, preserve task data, and survive archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (
      position INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, name TEXT NOT NULL
    );
    CREATE TABLE tasks (
      position INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
      project_id TEXT NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
    );
    INSERT INTO projects (id, name) VALUES ('owner', 'Owner'), ('other', 'Other');
    INSERT INTO tasks (id, project_id, title, completed) VALUES ('old', 'owner', 'Existing', 1);
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(databasePath);
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const path = '/projects/owner';
    const taskPath = `${path}/tasks/old`;
    const priorities = (html) => [...html.matchAll(/<select id="task-priority-[^"]+"[^>]*>\s*([\s\S]*?)<\/select>/g)].map((match) => match[1].trim());
    const normalOptions = '<option>Low</option><option selected>Normal</option><option>High</option>';
    assert.deepEqual(priorities(await get(path)), [normalOptions]);
    await post(`${path}/tasks`, { title: 'New task' });
    await post('/projects/other/tasks', { title: 'Other task' });
    const before = await get(path);
    const other = await get('/projects/other');
    const listing = await get('/');
    assert.deepEqual(priorities(before), [normalOptions, normalOptions]);
    assert.equal((before.match(/>Task priority<\/label>/g) ?? []).length, 2);
    for (const priority of ['Low', 'Normal', 'High']) {
      const response = await post(`${taskPath}/priority`, { priority, filter: 'Completed' });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), `${path}?filter=Completed`);
      const options = ['Low', 'Normal', 'High'].map((value) => `<option${value === priority ? ' selected' : ''}>${value}</option>`).join('');
      assert.equal(await get(path), before.replace(`id="task-priority-old" name="priority" onchange="this.form.requestSubmit()">\n            ${normalOptions}`, `id="task-priority-old" name="priority" onchange="this.form.requestSubmit()">\n            ${options}`));
      assert.equal(await get('/projects/other'), other);
      assert.equal(await get('/'), listing);
      assert.doesNotMatch(await get(`${path}?filter=Open`), /Existing/);
      assert.deepEqual(priorities(await get(`${path}?filter=Completed`)), [options]);
    }
    const high = await get(path);
    for (const values of [{}, { priority: 'Urgent' }, { priority: ' High ' }]) {
      const response = await post(`${taskPath}/priority`, values);
      assert.equal(response.status, 422);
      assert.match(await response.text(), /role="alert">Invalid task priority/);
      assert.equal(await get(path), high);
    }
    assert.equal((await post('/projects/other/tasks/old/priority', { priority: 'Low' })).status, 404);
    assert.equal((await post(`${path}/tasks/missing/priority`, { priority: 'Low' })).status, 404);
    await post(`${taskPath}/rename`, { title: 'Renamed' });
    const renamed = high.replaceAll('Existing', 'Renamed');
    assert.equal(await get(path), renamed);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get(path), renamed);
    assert.equal(await get('/'), listing);
    await post(`${path}/archive`);
    const archived = await get(path);
    assert.equal((archived.match(/<select id="task-priority-[^"]+"[^>]* disabled/g) ?? []).length, 2);
    assert.equal((await post(`${taskPath}/priority`, { priority: 'Low' })).status, 403);
    assert.equal(await get(path), archived);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get(path), archived);
    await post(`${path}/restore`);
    assert.equal(await get(path), renamed);
    assert.equal((await post(`${taskPath}/priority`, { priority: 'Low' })).status, 303);
    assert.deepEqual(priorities(await get(path)), [
      '<option selected>Low</option><option>Normal</option><option>High</option>', normalOptions,
    ]);
    await post(taskPath, {});
    assert.deepEqual(priorities(await get(path)), [
      '<option selected>Low</option><option>Normal</option><option>High</option>', normalOptions,
    ]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project defaults migrate, affect only future tasks, and persist independently', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-defaults-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (
      position INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE tasks (
      position INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
      project_id TEXT NOT NULL, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'Normal'
    );
    INSERT INTO projects (id, name) VALUES ('owner', 'Owner');
    INSERT INTO tasks (id, project_id, title, completed, priority)
      VALUES ('old', 'owner', 'Existing', 1, 'Low');
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(databasePath);
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const path = '/projects/owner';
    const selected = (html, id) => html.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)<\\/select>`))[1].match(/<option selected>([^<]+)<\/option>/)[1];
    const rows = (html) => html.match(/<ul class="tasks">[\s\S]*?<\/ul>/)?.[0] ?? '';
    let html = await get(path);
    assert.match(html, /<label for="default-task-priority">Default task priority<\/label>/);
    assert.match(html, /id="default-task-priority"[^>]*>\s*<option>Low<\/option><option selected>Normal<\/option><option>High<\/option>/);
    assert.equal(selected(html, 'task-priority-old'), 'Low');
    await post('/projects', { name: 'Other' });
    const otherPath = [...(await get('/')).matchAll(/action="(\/projects\/[a-zA-Z0-9-]+)"/g)][1][1];
    assert.equal(selected(await get(otherPath), 'default-task-priority'), 'Normal');
    const otherBefore = await get(otherPath);
    const listingBefore = await get('/');
    const filters = { filter: 'Completed', priorityFilter: 'Low' };
    const filteredPath = `${path}?filter=Completed&priorityFilter=Low`;
    const oldRows = rows(await get(filteredPath));
    for (const priority of ['Low', 'Normal', 'High']) {
      const response = await post(`${path}/default-priority`, { ...filters, priority });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), filteredPath);
      html = await get(filteredPath);
      assert.equal(selected(html, 'default-task-priority'), priority);
      assert.equal(selected(html, 'task-filter'), 'Completed');
      assert.equal(selected(html, 'priority-filter'), 'Low');
      assert.equal(rows(html), oldRows);
      assert.equal(await get('/'), listingBefore);
      assert.equal(await get(otherPath), otherBefore);
    }
    for (const values of [{}, { priority: 'Urgent' }, { priority: ' High ' }]) {
      const response = await post(`${path}/default-priority`, { ...filters, ...values });
      assert.equal(response.status, 422);
      assert.match(await response.text(), /role="alert">Invalid task priority/);
      assert.equal(await get(filteredPath), html);
    }
    assert.equal((await post('/projects/missing/default-priority', { priority: 'Low' })).status, 404);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get(filteredPath), html);
    await post(`${path}/tasks`, { title: 'Inherited High', ...filters });
    assert.equal(rows(await get(filteredPath)), oldRows);
    html = await get(path);
    const taskPaths = [...html.matchAll(/action="([^" ]+\/tasks\/[a-zA-Z0-9-]+)"/g)].map((match) => match[1]);
    const inheritedId = taskPaths[1].split('/').at(-1);
    assert.equal(selected(html, `task-priority-${inheritedId}`), 'High');
    await post(`${path}/default-priority`, { priority: 'Low', ...filters });
    assert.equal(rows(await get(path)), rows(html));
    await post(`${path}/tasks`, { title: 'Inherited Low' });
    await post(`${otherPath}/tasks`, { title: 'Other Normal' });
    html = await get(path);
    const lowId = [...html.matchAll(/action="([^" ]+\/tasks\/[a-zA-Z0-9-]+)"/g)][2][1].split('/').at(-1);
    assert.equal(selected(html, `task-priority-${lowId}`), 'Low');
    assert.ok(html.indexOf('<span>Existing</span>') < html.indexOf('<span>Inherited High</span>'));
    assert.ok(html.indexOf('<span>Inherited High</span>') < html.indexOf('<span>Inherited Low</span>'));
    assert.match(await get(otherPath), /id="task-priority-[^"]+"[^>]*>\s*<option>Low<\/option><option selected>Normal<\/option>/);
    assert.match(await get('/'), /data-testid="project-summary">1\/3 completed/);
    await post(`${path}/rename`, { name: 'Renamed' });
    assert.equal(selected(await get(path), 'default-task-priority'), 'Low');
    await post(`${path}/archive`);
    const archived = await get(filteredPath);
    assert.match(archived, /id="default-task-priority" name="priority" disabled/);
    assert.equal(selected(archived, 'default-task-priority'), 'Low');
    assert.equal(rows(archived).replaceAll(' disabled', ''), oldRows);
    assert.equal((await post(`${path}/default-priority`, { priority: 'High', ...filters })).status, 403);
    assert.equal(await get(filteredPath), archived);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get(filteredPath), archived);
    await post(`${path}/restore`);
    assert.doesNotMatch(await get(path), / disabled/);
    assert.equal(selected(await get(path), 'default-task-priority'), 'Low');
    await post(`${path}/default-priority`, { priority: 'Normal' });
    assert.equal(rows(await get(path)), rows(html));
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(selected(await get(path), 'default-task-priority'), 'Normal');
    assert.equal(rows(await get(path)), rows(html));
    assert.match(await get('/'), /data-testid="project-summary">1\/3 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('combined filters retain selections and re-evaluate edits without changing summaries', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-filters-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    await post('/projects', { name: 'Filters' });
    const path = (await get('/')).match(/action="(\/projects\/[a-zA-Z0-9-]+)"/)[1];
    const titles = ['Low open', 'Normal done', 'High open', 'High done', 'High later'];
    for (const title of titles) await post(`${path}/tasks`, { title });
    const taskPaths = [...(await get(path)).matchAll(/action="([^" ]+\/tasks\/[a-zA-Z0-9-]+)"/g)].map((match) => match[1]);
    const priorities = ['Low', 'Normal', 'High', 'High', 'High'];
    const completed = [false, true, false, true, false];
    for (let index = 0; index < taskPaths.length; index++) {
      await post(`${taskPaths[index]}/priority`, { priority: priorities[index] });
      if (completed[index]) await post(taskPaths[index], { completed: '1' });
    }
    const visibleTitles = (html) => [...html.matchAll(/<span>([^<]+)<\/span>/g)].map((match) => match[1]);
    const selected = (html, id) => html.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)<\\/select>`))[1].match(/<option selected>([^<]+)<\/option>/)[1];
    for (const filter of ['All', 'Open', 'Completed']) {
      for (const priorityFilter of ['All', 'Low', 'Normal', 'High']) {
        const html = await get(`${path}?${new URLSearchParams({ filter, priorityFilter })}`);
        assert.deepEqual(visibleTitles(html), titles.filter((title, index) =>
          (filter === 'All' || completed[index] === (filter === 'Completed')) &&
          (priorityFilter === 'All' || priorities[index] === priorityFilter)));
        assert.equal(selected(html, 'task-filter'), filter);
        assert.equal(selected(html, 'priority-filter'), priorityFilter);
      }
    }
    let html = await get(path);
    assert.equal(selected(html, 'priority-filter'), 'All');
    assert.match(html, /<select id="priority-filter"[^>]*>\s*<option selected>All<\/option><option>Low<\/option><option>Normal<\/option><option>High<\/option>/);
    const filters = { filter: 'Open', priorityFilter: 'High' };
    const filteredPath = `${path}?filter=Open&priorityFilter=High`;
    html = await get(filteredPath);
    // Both GET selectors share a form; every edit carries both selections.
    const filterForm = html.match(/<form class="task-filter"[\s\S]*?<\/form>/)[0];
    assert.match(filterForm, /name="filter"/);
    assert.match(filterForm, /name="priorityFilter"/);
    for (const form of html.matchAll(/<form[^>]*method="post"[^>]*>([\s\S]*?)<\/form>/g)) {
      assert.match(form[1], /name="filter" value="Open"/);
      assert.match(form[1], /name="priorityFilter" value="High"/);
    }
    let response = await post(`${taskPaths[2]}/rename`, { ...filters, title: '  High renamed  ' });
    assert.equal(response.headers.get('location'), filteredPath);
    assert.deepEqual(visibleTitles(await get(filteredPath)), ['High renamed', 'High later']);
    response = await post(`${taskPaths[2]}/rename`, { ...filters, title: ' ' });
    assert.equal(response.status, 422);
    html = await response.text();
    assert.equal(selected(html, 'task-filter'), 'Open');
    assert.equal(selected(html, 'priority-filter'), 'High');
    assert.match(html, /Task title is required/);
    response = await post(`${taskPaths[2]}/priority`, { ...filters, priority: 'Low' });
    assert.equal(response.headers.get('location'), filteredPath);
    assert.deepEqual(visibleTitles(await get(filteredPath)), ['High later']);
    assert.match(await get('/'), /2\/5 completed/);
    response = await post(taskPaths[4], { ...filters, completed: '1' });
    assert.equal(response.headers.get('location'), filteredPath);
    assert.deepEqual(visibleTitles(await get(filteredPath)), []);
    assert.match(await get('/'), /3\/5 completed/);
    await post(`${path}/archive`);
    html = await get(`${path}?filter=Completed&priorityFilter=High`);
    assert.deepEqual(visibleTitles(html), ['High done', 'High later']);
    assert.doesNotMatch(html, /<select id="(?:task-filter|priority-filter)"[^>]*disabled/);
    assert.equal((html.match(/id="task-priority-[^"]+" name="priority" disabled/g) ?? []).length, 2);
    response = await post(`${taskPaths[3]}/priority`, { ...filters, priority: 'Low' });
    assert.equal(response.status, 403);
    assert.equal(selected(await response.text(), 'priority-filter'), 'High');
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get(`${path}?filter=Completed&priorityFilter=High`), html);
    await post(`${path}/restore`);
    assert.deepEqual(visibleTitles(await get(`${path}?filter=Completed&priorityFilter=High`)), ['High done', 'High later']);
    assert.deepEqual(visibleTitles(await get(`${path}?filter=Open&priorityFilter=Low`)), ['Low open', 'High renamed']);
    assert.match(await get('/'), /3\/5 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('due dates migrate, validate, clear, and persist independently with archive protection', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-dates-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (position INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, name TEXT NOT NULL);
    CREATE TABLE tasks (position INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, project_id TEXT NOT NULL, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (id, name) VALUES ('first', 'First'), ('second', 'Second');
    INSERT INTO tasks (id, project_id, title, completed) VALUES ('old', 'first', 'Existing', 1);
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(databasePath);
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const taskPath = '/projects/first/tasks/old';
    const fields = { filter: 'Completed', priorityFilter: 'Normal' };
    const filteredPath = '/projects/first?filter=Completed&priorityFilter=Normal';
    const dateInput = /id="task-due-date-old" name="dueDate" type="text" value="([^"]*)"/;
    assert.equal((await get('/projects/first')).match(dateInput)[1], '');
    await post('/projects/first/tasks', { title: 'New' });
    assert.equal((await get('/projects/first')).match(/name="dueDate" type="text" value=""/g).length, 2);
    const summary = await get('/');
    let response = await post(`${taskPath}/due-date`, { ...fields, dueDate: '  2000-02-29  ' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), filteredPath);
    let html = await get(filteredPath);
    assert.equal(html.match(dateInput)[1], '2000-02-29');
    assert.match(html, /<option selected>Completed/);
    assert.match(html, /id="priority-filter"[\s\S]*?<option selected>Normal/);
    assert.equal((await get('/projects/first')).match(/name="dueDate" type="text" value=""/g).length, 1);
    assert.equal(await get('/'), summary);
    for (const dueDate of ['1900-02-29', '2025-04-31', '0000-01-01', '10000-01-01', '2025-1-01', '<script>']) {
      response = await post(`${taskPath}/due-date`, { ...fields, dueDate });
      assert.equal(response.status, 422);
      const invalid = await response.text();
      assert.match(invalid, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      assert.equal(invalid.match(dateInput)[1], '2000-02-29');
      assert.equal(await get(filteredPath), html);
    }
    assert.equal((await post('/projects/second/tasks/old/due-date', { dueDate: '2025-01-01' })).status, 404);
    await post(`${taskPath}/rename`, { ...fields, title: 'Renamed' });
    html = await get(filteredPath);
    assert.match(html, /Complete Renamed" checked/);
    assert.equal(html.match(dateInput)[1], '2000-02-29');
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get(filteredPath), html);
    await post('/projects/first/archive');
    const archived = await get(filteredPath);
    assert.match(archived, /name="dueDate" type="text" value="2000-02-29" disabled/);
    assert.match(archived, /<button type="submit" disabled>Save due date/);
    assert.equal((await post(`${taskPath}/due-date`, { dueDate: '' })).status, 403);
    assert.equal(await get(filteredPath), archived);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get(filteredPath), archived);
    await post('/projects/first/restore');
    assert.equal(await get(filteredPath), html);
    for (const dueDate of ['', '  \t ']) {
      await post(`${taskPath}/due-date`, { ...fields, dueDate: '9999-12-31' });
      response = await post(`${taskPath}/due-date`, { ...fields, dueDate });
      assert.equal(response.headers.get('location'), filteredPath);
      assert.equal((await get(filteredPath)).match(dateInput)[1], '');
    }
    html = await get(filteredPath);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get(filteredPath), html);
    assert.equal(await get('/'), summary);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('due ranges intersect filters, retain applied state through edits, and work when archived', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-ranges-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    await post('/projects', { name: 'Range project' });
    const path = (await get('/')).match(/action="(\/projects\/[a-zA-Z0-9-]+)"/)[1];
    for (const title of ['Before', 'Start', 'Middle', 'End', 'After', 'Undated']) {
      await post(`${path}/tasks`, { title });
    }
    let html = await get(path);
    const tasks = [...html.matchAll(/action="([^\"]+\/tasks\/[a-zA-Z0-9-]+)"/g)].map((match) => match[1]);
    const dates = ['2025-02-28', '2025-03-01', '2025-03-02', '2025-03-03', '2025-03-04'];
    for (let index = 0; index < dates.length; index++) {
      await post(`${tasks[index]}/due-date`, { dueDate: dates[index] });
    }
    await post(`${tasks[1]}/priority`, { priority: 'High' });
    await post(`${tasks[3]}/priority`, { priority: 'High' });
    await post(tasks[3], { completed: '1' });
    const summary = await get('/');
    const titles = (page) => [...page.matchAll(/aria-label="Complete ([^\"]+)"/g)].map((match) => match[1]);
    const fields = { filter: 'All', priorityFilter: 'All', dueFrom: '2025-03-01', dueThrough: '2025-03-03' };
    const location = (values) => `${path}?${new URLSearchParams(values)}`;
    const apply = (rangeFrom, rangeThrough, state = fields) => post(`${path}/due-range`, { ...state, rangeFrom, rangeThrough });
    let response = await apply(' 2025-03-01 ', '2025-03-03 ');
    assert.equal(response.status, 303);
    let filtered = response.headers.get('location');
    html = await get(filtered);
    assert.deepEqual(titles(html), ['Start', 'Middle', 'End']);
    assert.match(html, /name="rangeFrom" type="text" value="2025-03-01"/);
    assert.match(html, /name="rangeThrough" type="text" value="2025-03-03"/);
    // Applied range is included in every editing form and the combobox form.
    for (const form of html.matchAll(/<form[^>]*action="([^\"]+)"[^>]*>([\s\S]*?)<\/form>/g)) {
      if (form[1].startsWith(path) && form[1] !== `${path}/export`) {
        assert.match(form[2], /name="dueFrom" value="2025-03-01"/);
        assert.match(form[2], /name="dueThrough" value="2025-03-03"/);
      }
    }
    assert.deepEqual(titles(await get(location({ ...fields, filter: 'Open', priorityFilter: 'High' }))), ['Start']);
    assert.deepEqual(titles(await get(location({ ...fields, filter: 'Completed', priorityFilter: 'High' }))), ['End']);
    for (const [from, through, message] of [
      ['2025-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['', '1900-02-29', 'Due range must use valid YYYY-MM-DD dates'],
      ['2025-3-01', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2025-03-04', '2025-03-01', 'Due from must not be after Due through'],
    ]) {
      response = await apply(from, through);
      assert.equal(response.status, 422);
      const invalid = await response.text();
      assert.ok(invalid.includes(`role="alert">${message}`));
      assert.deepEqual(titles(invalid), ['Start', 'Middle', 'End']);
      assert.match(invalid, /name="rangeFrom" type="text" value="2025-03-01"/);
    }
    response = await apply('', '2025-03-01');
    assert.deepEqual(titles(await get(response.headers.get('location'))), ['Before', 'Start']);
    response = await apply('2025-03-03', '');
    assert.deepEqual(titles(await get(response.headers.get('location'))), ['End', 'After']);
    response = await apply('2025-03-01', '2025-03-01');
    assert.deepEqual(titles(await get(response.headers.get('location'))), ['Start']);
    response = await apply(' \t ', '');
    assert.equal(titles(await get(response.headers.get('location'))).length, 6);
    const state = { ...fields, filter: 'Open', priorityFilter: 'High' };
    response = await post(`${tasks[1]}/rename`, { ...state, title: 'Renamed start' });
    filtered = response.headers.get('location');
    assert.deepEqual(titles(await get(filtered)), ['Renamed start']);
    response = await post(`${tasks[1]}/due-date`, { ...state, dueDate: '2025-03-04' });
    assert.equal(response.headers.get('location'), filtered);
    assert.deepEqual(titles(await get(filtered)), []);
    await post(`${tasks[1]}/due-date`, { ...state, dueDate: '2025-03-01' });
    await post(tasks[1], { ...state, completed: '1' });
    assert.deepEqual(titles(await get(filtered)), []);
    await post(tasks[1], { ...state });
    await post(`${tasks[1]}/priority`, { ...state, priority: 'Low' });
    assert.deepEqual(titles(await get(filtered)), []);
    await post(`${tasks[1]}/priority`, { ...state, priority: 'High' });
    assert.deepEqual(titles(await get(filtered)), ['Renamed start']);
    for (const [suffix, values] of [
      ['/rename', { name: 'Renamed project' }],
      ['/default-priority', { priority: 'High' }],
      ['/tasks', { title: 'New undated' }],
    ]) {
      response = await post(`${path}${suffix}`, { ...state, ...values });
      assert.equal(response.headers.get('location'), filtered);
      assert.deepEqual(titles(await get(filtered)), ['Renamed start']);
    }
    assert.match(summary, /1\/6 completed/);
    assert.match(await get('/'), /1\/7 completed/);
    html = await get(filtered);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get(filtered), html);
    const reopened = await get(path);
    assert.equal(titles(reopened).length, 7);
    assert.match(reopened, /name="rangeFrom" type="text" value=""/);
    assert.match(reopened, /name="rangeThrough" type="text" value=""/);
    await post(`${path}/archive`);
    html = await get(filtered);
    assert.match(html, /Archived project/);
    assert.match(html, /name="dueDate" type="text" value="2025-03-01" disabled/);
    const rangeForm = html.match(/<form class="create due-range"[\s\S]*?<\/form>/)[0];
    assert.doesNotMatch(rangeForm, /disabled/);
    response = await apply('2025-03-03', '2025-03-03', { ...state, filter: 'Completed' });
    assert.deepEqual(titles(await get(response.headers.get('location'))), ['End']);
    await post(`${path}/restore`);
    assert.deepEqual(titles(await get(filtered)), ['Renamed start']);
    assert.doesNotMatch((await get(filtered)).replace(/<form class="create task-move"[\s\S]*?<\/form>/g, ''), / disabled/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('moves append tasks, preserve data and filters, validate destinations, and persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-moves-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const titles = (html) => [...html.matchAll(/<span>([^<]*)<\/span>/g)].map((match) => match[1]);
    const taskPaths = (html) => [...html.matchAll(/action="([^\"]+\/tasks\/[a-zA-Z0-9-]+)"/g)].map((match) => match[1]);
    const moveForm = (html) => html.match(/<form class="create task-move"[\s\S]*?<\/form>/)[0];
    await post('/projects', { name: 'Source' });
    const source = (await get('/')).match(/action="(\/projects\/[a-zA-Z0-9-]+)"/)[1];
    await post(`${source}/tasks`, { title: 'Dated' });
    await post(`${source}/tasks`, { title: 'Blank' });
    await post(`${source}/tasks`, { title: 'Remaining' });
    const [dated, blank, remaining] = taskPaths(await get(source));
    assert.match(moveForm(await get(source)), /name="destination" disabled>[\s\S]*<button type="submit" disabled>Move task/);
    assert.doesNotMatch(moveForm(await get(source)), /<option/);
    for (const name of ['Destination', 'Third', 'Archived']) await post('/projects', { name });
    const paths = [...(await get('/')).matchAll(/action="(\/projects\/[a-zA-Z0-9-]+)"/g)].map((match) => match[1]);
    const [, destination, third, archived] = paths;
    const destinationId = destination.split('/').at(-1);
    await post(`${archived}/archive`);
    await post(`${destination}/rename`, { name: '<Renamed>' });
    const options = moveForm(await get(source));
    assert.deepEqual([...options.matchAll(/<option value="([^\"]+)">([^<]*)<\/option>/g)].map((match) => match.slice(1)), [
      [destinationId, '&lt;Renamed&gt;'], [third.split('/').at(-1), 'Third'],
    ]);
    await post(`${destination}/default-priority`, { priority: 'Low' });
    await post(`${destination}/tasks`, { title: 'Existing one' });
    await post(`${destination}/tasks`, { title: 'Existing two' });
    await post(dated, { completed: '1' });
    await post(`${dated}/priority`, { priority: 'High' });
    await post(`${dated}/due-date`, { dueDate: '2025-03-01' });
    await post(remaining, { completed: '1' });
    await post(`${remaining}/priority`, { priority: 'High' });
    await post(`${remaining}/due-date`, { dueDate: '2025-03-02' });
    const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2025-03-01', dueThrough: '2025-03-03' };
    const filtered = `${source}?${new URLSearchParams(state)}`;
    assert.deepEqual(titles(await get(filtered)), ['Dated', 'Remaining']);
    const before = await get(source);
    for (const id of ['', 'missing', source.split('/').at(-1), archived.split('/').at(-1)]) {
      assert.equal((await post(`${dated}/move`, { destination: id, ...state })).status, 422);
      assert.equal(await get(source), before);
    }
    assert.equal((await post(`${dated.replace(source, third)}/move`, { destination: destinationId })).status, 404);
    assert.equal((await post(`${source}/tasks/missing/move`, { destination: destinationId })).status, 404);
    const response = await post(`${dated}/move`, { destination: destinationId, ...state });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), filtered);
    assert.deepEqual(titles(await get(filtered)), ['Remaining']);
    assert.deepEqual(titles(await get(source)), ['Blank', 'Remaining']);
    let html = await get(destination);
    assert.deepEqual(titles(html), ['Existing one', 'Existing two', 'Dated']);
    assert.match(html, /aria-label="Complete Dated" checked/);
    assert.match(html, /<option selected>High<\/option>/);
    assert.match(html, /name="dueDate" type="text" value="2025-03-01"/);
    const summaries = [...(await get('/')).matchAll(/data-testid="project-summary">([^<]+)/g)].map((match) => match[1]);
    assert.deepEqual(summaries, ['1/2 completed', '1/3 completed', '0/0 completed']);
    assert.equal((await post(`${blank}/move`, { destination: destinationId })).status, 303);
    const movedBlank = blank.replace(source, destination);
    assert.match((await get(destination)).match(new RegExp(`<form class="create task-due-date"[^>]*action="${movedBlank}/due-date"[\\s\\S]*?</form>`))[0], /name="dueDate" type="text" value=""/);
    await post(`${destination}/tasks`, { title: 'Created after move' });
    assert.deepEqual(titles(await get(destination)), ['Existing one', 'Existing two', 'Dated', 'Blank', 'Created after move']);
    await post(`${destination}/archive`);
    html = await get(destination);
    assert.match(moveForm(html), /name="destination" disabled/);
    assert.match(moveForm(html), /<button type="submit" disabled>Move task/);
    assert.equal((await post(`${movedBlank}/move`, { destination: source.split('/').at(-1) })).status, 403);
    assert.doesNotMatch(moveForm(await get(source)), /&lt;Renamed&gt;/);
    await post(`${destination}/restore`);
    assert.doesNotMatch(moveForm(await get(destination)), / disabled/);
    const destinationBeforeRestart = await get(destination);
    const sourceBeforeRestart = await get(filtered);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get(destination), destinationBeforeRestart);
    assert.equal(await get(filtered), sourceBeforeRestart);
    assert.equal((await post(`${movedBlank}/move`, { destination: source.split('/').at(-1) })).status, 303);
    assert.deepEqual(titles(await get(source)), ['Blank', 'Remaining']);
    assert.deepEqual(titles(await get(destination)), ['Existing one', 'Existing two', 'Dated', 'Created after move']);
    const movedDated = dated.replace(source, destination);
    await post(`${movedDated}/move`, { destination: third.split('/').at(-1) });
    assert.deepEqual(titles(await get(third)), ['Dated']);
    assert.match(await get(third), /aria-label="Complete Dated" checked/);
    assert.match(await get(third), /name="dueDate" type="text" value="2025-03-01"/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('remembered project positions migrate and survive reverse returns, new arrivals, and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-return-order-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    // A pre-feature database, including non-contiguous global positions.
    const legacy = new DatabaseSync(databasePath);
    legacy.exec(`
      CREATE TABLE projects (position INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, name TEXT NOT NULL);
      CREATE TABLE tasks (position INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, project_id TEXT NOT NULL, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (id, name) VALUES ('source', 'Source'), ('destination', 'Destination'), ('third', 'Third');
      INSERT INTO tasks (position, id, project_id, title) VALUES
        (10, 'a', 'source', 'A'), (20, 'b', 'source', 'B'), (30, 'c', 'source', 'C'), (40, 'x', 'destination', 'X');
    `);
    legacy.close();
    server = await startServer(databasePath);
    const get = async (project) => (await fetch(`${server.url}/projects/${project}`)).text();
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const titles = async (project) => [...(await get(project)).matchAll(/<span>([^<]*)<\/span>/g)].map((match) => match[1]);
    const move = async (task, source, destination) => {
      assert.equal((await post(`/projects/${source}/tasks/${task}/move`, { destination })).status, 303);
    };
    assert.deepEqual(await titles('source'), ['A', 'B', 'C']);
    await move('b', 'source', 'destination');
    await move('a', 'source', 'destination');
    await post('/projects/source/tasks', { title: 'D' });
    await move('c', 'source', 'destination');
    assert.deepEqual(await titles('destination'), ['X', 'B', 'A', 'C']);
    await post('/projects/destination/tasks/b/rename', { title: 'B updated' });
    await post('/projects/destination/tasks/b', { completed: '1' });
    await post('/projects/destination/tasks/b/priority', { priority: 'High' });
    await post('/projects/destination/tasks/b/due-date', { dueDate: '0001-01-01' });
    await post('/projects/source/rename', { name: 'Renamed source' });
    await post('/projects/source/archive');
    assert.equal((await post('/projects/destination/tasks/a/move', { destination: 'source' })).status, 422);
    await server.stop();
    server = await startServer(databasePath);
    await post('/projects/source/restore');
    // Return in a different order from both the original order and departure order.
    await move('c', 'destination', 'source');
    await move('a', 'destination', 'source');
    await move('b', 'destination', 'source');
    assert.deepEqual(await titles('source'), ['A', 'B updated', 'C', 'D']);
    let html = await get('source');
    assert.match(html, /aria-label="Complete B updated" checked/);
    assert.match(html, /<option selected>High<\/option>/);
    assert.match(html, /name="dueDate" type="text" value="0001-01-01"/);
    assert.match(html, /<h1>Renamed source<\/h1>/);
    await move('x', 'destination', 'source');
    assert.deepEqual(await titles('source'), ['A', 'B updated', 'C', 'D', 'X']);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await titles('source'), ['A', 'B updated', 'C', 'D', 'X']);
    await move('c', 'source', 'destination');
    await move('a', 'source', 'destination');
    await move('b', 'source', 'destination');
    await move('x', 'source', 'destination');
    assert.deepEqual(await titles('destination'), ['X', 'B updated', 'A', 'C']);
    await move('b', 'destination', 'third');
    await post('/projects/third/tasks', { title: 'After B' });
    await move('b', 'third', 'source');
    await move('b', 'source', 'third');
    assert.deepEqual(await titles('third'), ['B updated', 'After B']);
    const summaries = [...(await (await fetch(`${server.url}/`)).text()).matchAll(/data-testid="project-summary">([^<]+)/g)].map((match) => match[1]);
    assert.deepEqual(summaries, ['0/1 completed', '0/3 completed', '1/2 completed']);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project and task searches intersect filters and survive edits, archives, and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-search-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const db = new DatabaseSync(databasePath);
  db.exec(`CREATE TABLE projects (
    position INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, name TEXT NOT NULL
  ); INSERT INTO projects (id, name) VALUES ('a', 'Alpha  Team'), ('b', 'Alpha Other'), ('c', 'Beta');`);
  db.close();
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const projectNames = (html) => [...html.matchAll(/data-testid="project-row">\s*<span>([^<]*)/g)].map((m) => m[1]);
    const titles = (html) => [...html.matchAll(/aria-label="Complete ([^"]*)"/g)].map((m) => m[1]);
    assert.deepEqual(projectNames(await get('/?query=%20aLPHa%20')), ['Alpha  Team', 'Alpha Other']);
    assert.deepEqual(projectNames(await get('/?query=alpha%20team')), ['Alpha  Team']);
    assert.deepEqual(projectNames(await get('/?query=alpha%09%20%09team')), ['Alpha  Team']);
    assert.deepEqual(projectNames(await get('/?query=alpha%20%20team')), ['Alpha  Team']);
    await post('/projects/b/archive', { query: 'alpha' });
    assert.deepEqual(projectNames(await get('/?filter=Archived&query=alpha')), ['Alpha Other']);
    assert.deepEqual(projectNames(await get('/?query=alpha')), ['Alpha  Team']);
    assert.deepEqual(projectNames(await get('/')), ['Alpha  Team', 'Beta']);
    for (const title of ['Alpha One', 'ALPHA \t Two', 'Other', 'Alpha Undated']) {
      await post('/projects/a/tasks', { title });
    }
    const paths = [...(await get('/projects/a')).matchAll(/action="([^"]+\/tasks\/[^/"?]+)"/g)].map((m) => m[1]);
    await post(`${paths[0]}/priority`, { priority: 'High' });
    await post(`${paths[1]}/priority`, { priority: 'High' });
    await post(`${paths[0]}/due-date`, { dueDate: '2026-04-01' });
    await post(`${paths[1]}/due-date`, { dueDate: '2026-04-30' });
    await post(paths[1], { completed: '1' });
    const state = { filter: 'Open', priorityFilter: 'High', dueFrom: '2026-04-01', dueThrough: '2026-04-30', query: 'alpha' };
    let response = await post('/projects/a/search', { ...state, searchQuery: '  ALpha  ' });
    let location = response.headers.get('location');
    assert.equal(new URL(location, server.url).searchParams.get('query'), 'ALpha');
    assert.deepEqual(titles(await get(location)), ['Alpha One']);
    const filtered = `/projects/a?${new URLSearchParams(state)}`;
    assert.deepEqual(titles(await get(filtered)), ['Alpha One']);
    assert.deepEqual(titles(await get('/projects/a?query=alpha%20%20two')), ['ALPHA \t Two']);
    assert.deepEqual(titles(await get('/projects/a?query=alpha%20two')), ['ALPHA \t Two']);
    assert.deepEqual(titles(await get('/projects/a?query=alpha%09%09two')), ['ALPHA \t Two']);
    response = await post(`${paths[0]}/rename`, { ...state, title: 'Not matching' });
    assert.deepEqual(titles(await get(response.headers.get('location'))), []);
    await post(`${paths[0]}/rename`, { ...state, title: 'Alpha Renamed' });
    response = await post(paths[0], { ...state, completed: '1' });
    assert.deepEqual(titles(await get(response.headers.get('location'))), []);
    await post(paths[0], state);
    response = await post(`${paths[0]}/due-date`, { ...state, dueDate: 'bad' });
    assert.equal(response.status, 422);
    assert.deepEqual(titles(await response.text()), ['Alpha Renamed']);
    response = await post('/projects/a/due-range', { ...state, rangeFrom: 'bad', rangeThrough: '' });
    assert.equal(response.status, 422);
    assert.deepEqual(titles(await response.text()), ['Alpha Renamed']);
    for (const [path, values] of [
      ['/projects/a/rename', { name: 'Renamed \t Project' }],
      ['/projects/a/default-priority', { priority: 'High' }],
      ['/projects/a/tasks', { title: 'Does not match' }],
      [`${paths[0]}/priority`, { priority: 'High' }],
    ]) {
      response = await post(path, { ...state, ...values });
      assert.equal(new URL(response.headers.get('location'), server.url).searchParams.get('query'), 'alpha');
      assert.deepEqual(titles(await get(response.headers.get('location'))), ['Alpha Renamed']);
    }
    await post('/projects/a/archive');
    assert.deepEqual(titles(await get(filtered)), ['Alpha Renamed']);
    response = await post('/projects/a/search', { ...state, searchQuery: '' });
    assert.deepEqual(titles(await get(response.headers.get('location'))), ['Alpha Renamed']);
    await post('/projects/a/restore');
    response = await post(`${paths[0]}/move`, { ...state, destination: 'c' });
    assert.deepEqual(titles(await get(response.headers.get('location'))), []);
    const destinationTask = (await get('/projects/c')).match(/action="([^"]+\/tasks\/[^/"?]+)"/)[1];
    await post(`${destinationTask}/move`, { destination: 'a' });
    assert.deepEqual(titles(await get(filtered)), ['Alpha Renamed']);
    const before = await get(filtered);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get(filtered), before);
    assert.deepEqual(titles(await get('/projects/a')), ['Alpha Renamed', 'ALPHA \t Two', 'Other', 'Alpha Undated', 'Does not match']);
    assert.deepEqual(projectNames(await get('/?query=renamed%20project')), ['Renamed \t Project']);
    assert.deepEqual(projectNames(await get('/')), ['Renamed \t Project', 'Beta']);
    assert.deepEqual(titles(await get('/projects/a?query=alpha%20two')), ['ALPHA \t Two']);
    const saved = new DatabaseSync(databasePath);
    try {
      assert.equal(saved.prepare('SELECT name FROM projects WHERE id = ?').get('a').name, 'Renamed \t Project');
      assert.equal(saved.prepare('SELECT title FROM tasks WHERE id = ?').get(paths[1].split('/').at(-1)).title, 'ALPHA \t Two');
    } finally {
      saved.close();
    }
    assert.match(await get('/projects/a'), /id="task-search" name="searchQuery" type="text" value=""/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('deletion upgrade, read-only rows, intersecting filters, summaries, reserved order, and persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-deletion-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (position INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE, name TEXT,
      archived INTEGER DEFAULT 0, default_task_priority TEXT DEFAULT 'Normal');
    CREATE TABLE tasks (position INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE, project_id TEXT,
      title TEXT, completed INTEGER DEFAULT 0, priority TEXT DEFAULT 'Normal', due_date TEXT DEFAULT '',
      notes TEXT DEFAULT '');
    INSERT INTO projects (id, name) VALUES ('a', 'Alpha'), ('b', 'Beta');
    INSERT INTO tasks (id, project_id, title, completed, priority, due_date, notes)
      VALUES ('one', 'a', 'First', 1, 'High', '2026-02-28', '  saved notes 雪'),
        ('two', 'a', 'Second', 0, 'Low', '', ''), ('three', 'a', 'Third', 0, 'Normal', '', '');
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(databasePath);
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const snapshot = () => {
      const db = new DatabaseSync(databasePath);
      try {
        return {
          tasks: db.prepare('SELECT * FROM tasks ORDER BY position').all().map((row) => ({ ...row })),
          positions: db.prepare('SELECT * FROM task_project_positions ORDER BY project_id, position').all(),
        };
      } finally { db.close(); }
    };
    const before = snapshot();
    assert.deepEqual(before.tasks.map((task) => task.deleted), [0, 0, 0]);
    let html = await get('/projects/a');
    assert.match(html, /<option>All<\/option>|<option selected>All<\/option>/);
    assert.match(html, /<option>Open<\/option>\s*<option>Completed<\/option>\s*<option>Deleted<\/option>/);
    const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2026-02-01',
      dueThrough: '2026-02-28', query: 'first' };
    const response = await post('/projects/a/tasks/one/delete', state);
    assert.equal(response.status, 303);
    const location = response.headers.get('location');
    for (const [key, value] of Object.entries(state)) {
      assert.equal(new URL(location, server.url).searchParams.get(key), value);
    }
    assert.doesNotMatch(await get(location), /data-testid="task-row"/);
    assert.match(await get('/'), /project-summary">0\/2 completed/);
    for (const filter of ['All', 'Open', 'Completed']) {
      assert.doesNotMatch(await get(`/projects/a?filter=${filter}`), /First<\/span>/);
    }
    const deletedState = { ...state, filter: 'Deleted' };
    const deletedUrl = `/projects/a?${new URLSearchParams(deletedState)}`;
    html = await get(deletedUrl);
    assert.match(html, /First<\/span>/);
    assert.match(html, /checked disabled/);
    assert.match(html, /name="priority" disabled/);
    assert.match(html, /name="dueDate"[^>]* disabled/);
    assert.match(html, /name="notes" rows="4" disabled/);
    assert.match(html, /name="title"[^>]* disabled/);
    assert.match(html, /name="destination" disabled/);
    for (const label of ['Rename task', 'Save due date', 'Save notes', 'Move task']) {
      assert.ok(html.includes(`disabled>${label}</button>`));
    }
    assert.match(html, /<button type="submit">Restore task/);
    assert.doesNotMatch(html, />Delete task/);
    for (const suffix of ['', '/rename', '/priority', '/due-date', '/notes', '/move', '/delete']) {
      assert.equal((await post(`/projects/a/tasks/one${suffix}`, {
        completed: '0', title: 'changed', priority: 'Low', dueDate: '', notes: '', destination: 'b',
      })).status, 403);
    }
    assert.equal((await post('/projects/b/tasks/one/restore')).status, 404);
    assert.deepEqual(snapshot(), {
      ...before, tasks: before.tasks.map((task, index) => ({ ...task, deleted: index === 0 ? 1 : 0 })),
    });
    for (const overrides of [{ priorityFilter: 'Low' }, { dueFrom: '2026-03-01', dueThrough: '' }, { query: 'saved' }]) {
      const params = new URLSearchParams({ ...deletedState, ...overrides });
      assert.doesNotMatch(await get(`/projects/a?${params}`), /data-testid="task-row"/);
    }
    await post('/projects/a/tasks/two/delete');
    await post('/projects/a/tasks/three/delete');
    assert.match(await get('/'), /project-summary">0\/0 completed/);
    await post('/projects/a/archive');
    html = await get(deletedUrl);
    assert.match(html, /disabled>Restore task/);
    assert.doesNotMatch(html, /id="task-filter"[^>]* disabled/);
    assert.doesNotMatch(html, /disabled>Search tasks|disabled>Apply due range/);
    assert.equal((await post('/projects/a/tasks/one/restore', deletedState)).status, 403);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get(deletedUrl), html);
    await post('/projects/a/restore');
    await post('/projects/a/default-priority', { priority: 'Low' });
    await post('/projects/a/tasks', { title: 'Fourth' });
    await post('/projects/a/tasks/three/restore');
    await post('/projects/a/tasks/two/restore');
    const restore = await post('/projects/a/tasks/one/restore', deletedState);
    const restoredLocation = restore.headers.get('location');
    for (const [key, value] of Object.entries(deletedState)) {
      assert.equal(new URL(restoredLocation, server.url).searchParams.get(key), value);
    }
    assert.doesNotMatch(await get(restoredLocation), /data-testid="task-row"/);
    html = await get('/projects/a');
    const titles = [...html.matchAll(/<span>([^<]+)<\/span>/g)].map((match) => match[1]);
    assert.deepEqual(titles, ['First', 'Second', 'Third', 'Fourth']);
    assert.deepEqual(snapshot().tasks.slice(0, 3), before.tasks);
    assert.match(await get('/'), /project-summary">1\/4 completed/);
    await post('/projects/a/tasks/one/move', { destination: 'b' });
    await post('/projects/b/tasks/one/delete');
    assert.doesNotMatch(await get('/projects/a?filter=Deleted'), /First<\/span>/);
    assert.match(await get('/projects/b?filter=Deleted'), /First<\/span>/);
    await post('/projects/b/tasks/one/restore');
    await post('/projects/b/tasks/one/move', { destination: 'a' });
    assert.deepEqual(snapshot().tasks.slice(0, 3), before.tasks);
    html = await get('/projects/a');
    assert.ok(html.indexOf('First</span>') < html.indexOf('Second</span>'));
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/a'), html);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('notes upgrade, exact text, filters, movement, archive protection, and persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-notes-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (position INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE, name TEXT,
      archived INTEGER DEFAULT 0, default_task_priority TEXT DEFAULT 'Normal');
    CREATE TABLE tasks (position INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE, project_id TEXT,
      title TEXT, completed INTEGER DEFAULT 0, priority TEXT DEFAULT 'Normal', due_date TEXT DEFAULT '');
    INSERT INTO projects (id, name) VALUES ('a', 'Alpha'), ('b', 'Beta');
    INSERT INTO tasks (id, project_id, title, completed, priority, due_date)
      VALUES ('one', 'a', 'First', 1, 'High', '2026-02-28'), ('two', 'a', 'Second', 0, 'Low', '');
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(databasePath);
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const savedTasks = () => {
      const db = new DatabaseSync(databasePath);
      try { return db.prepare('SELECT * FROM tasks ORDER BY position').all().map((task) => ({ ...task })); }
      finally { db.close(); }
    };
    const before = savedTasks();
    assert.deepEqual(before.map((task) => task.notes), ['', '']);
    assert.match(await get('/projects/a'), /name="notes" rows="4">\n<\/textarea>/);
    const notes = '\n  Leading spaces\nUnicode: 雪 📝\n<script>alert("x")</script></textarea>&\n  ';
    const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2026-02-01',
      dueThrough: '2026-02-28', query: 'first' };
    let response = await post('/projects/a/tasks/one/notes', { ...state, notes });
    assert.equal(response.status, 303);
    const location = response.headers.get('location');
    const params = new URL(location, server.url).searchParams;
    for (const [key, value] of Object.entries(state)) assert.equal(params.get(key), value);
    let html = await get(location);
    assert.equal((html.match(/data-testid="task-row"/g) ?? []).length, 1);
    assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;&lt;\/textarea&gt;&amp;/);
    assert.doesNotMatch(html, /<script>alert/);
    assert.doesNotMatch(html.match(/<textarea[^>]*>[\s\S]*?<\/textarea>/)[0], /<script>/);
    assert.deepEqual(savedTasks(), [{ ...before[0], notes }, before[1]]);
    assert.doesNotMatch(await get('/projects/a?query=Unicode'), /data-testid="task-row"/);
    assert.match(await get('/'), /project-summary">1\/2 completed/);
    assert.equal((await post('/projects/b/tasks/one/notes', { notes: 'wrong owner' })).status, 404);
    await post('/projects/a/tasks/one/rename', { title: 'Renamed' });
    await post('/projects/a/tasks/one/move', { destination: 'b' });
    assert.equal(savedTasks()[0].notes, notes);
    assert.match(await get('/projects/b'), /&lt;script&gt;/);
    await post('/projects/b/tasks/one/move', { destination: 'a' });
    html = await get('/projects/a');
    assert.ok(html.indexOf('Renamed</span>') < html.indexOf('Second</span>'));
    await post('/projects/a/archive');
    html = await get('/projects/a');
    assert.equal((html.match(/name="notes" rows="4" disabled/g) ?? []).length, 2);
    assert.equal((html.match(/disabled>Save notes/g) ?? []).length, 2);
    assert.equal((await post('/projects/a/tasks/one/notes', { notes: 'forbidden' })).status, 403);
    assert.equal(savedTasks()[0].notes, notes);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/a'), html);
    await post('/projects/a/restore');
    assert.doesNotMatch(await get('/projects/a'), /name="notes" rows="4" disabled/);
    assert.equal(savedTasks()[0].notes, notes);
    await post('/projects/a/tasks/two/notes', { notes: '  \n\t  ' });
    assert.equal(savedTasks()[1].notes, '  \n\t  ');
    await post('/projects/a/tasks/one/notes', { notes: '' });
    assert.equal(savedTasks()[0].notes, '');
    await post('/projects/a/tasks', { title: 'New' });
    assert.equal(savedTasks()[2].notes, '');
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(savedTasks()[0].notes, '');
    assert.equal(savedTasks()[1].notes, '  \n\t  ');
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project download includes unfiltered live/deleted tasks in remembered order without mutations', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-export-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (position INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, name TEXT NOT NULL);
    CREATE TABLE tasks (position INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, project_id TEXT NOT NULL, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (id, name) VALUES ('a', 'Saved  Ω'), ('b', 'Other'), ('empty', 'Empty');
    INSERT INTO tasks (id, project_id, title, completed) VALUES ('one', 'a', 'First  Title', 1), ('two', 'a', 'Second', 0), ('other', 'b', 'Excluded', 0);
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const download = async (path = '/projects/a/export') => {
      const response = await fetch(`${server.url}${path}`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /application\/json; charset=utf-8/);
      assert.equal(response.headers.get('content-disposition'), 'attachment; filename="workboard-project.json"');
      return response.json();
    };
    let document = await download();
    assert.equal(document.project.defaultPriority, 'Normal');
    assert.deepEqual(document.project.tasks[0], { title: 'First  Title', completed: true, priority: 'Normal', dueDate: '', notes: '', deleted: false });
    await post('/projects/a/tasks/one/priority', { priority: 'Low' });
    await post('/projects/a/tasks/one/due-date', { dueDate: '2024-02-29' });
    const notes = '  Ω <script>literal</script>\r\n\rsecond\n  ';
    await post('/projects/a/tasks/one/notes', { notes });
    await post('/projects/a/tasks/one/move', { destination: 'b' });
    await post('/projects/b/tasks/one/move', { destination: 'a' });
    await post('/projects/a/tasks/one/delete');
    await post('/projects/a/default-priority', { priority: 'High' });
    const filteredPath = '/projects/a?filter=Completed&priorityFilter=High&dueFrom=9999-01-01&query=missing';
    const before = await (await fetch(`${server.url}${filteredPath}`)).text();
    assert.match(before, /<button type="submit">Download project<\/button>/);
    document = await download('/projects/a/export?filter=Open&query=missing');
    assert.deepEqual(document.project.tasks.map((task) => task.title), ['First  Title', 'Second']);
    assert.deepEqual(document.project.tasks[0], { title: 'First  Title', completed: true, priority: 'Low', dueDate: '2024-02-29', notes: notes.replace(/\r\n?/g, '\n'), deleted: true });
    assert.equal(await (await fetch(`${server.url}${filteredPath}`)).text(), before);
    await post('/projects/a/tasks/two/delete');
    await post('/projects/a/archive');
    document = await download();
    assert.equal(document.project.archived, true);
    assert.equal(document.project.defaultPriority, 'High');
    assert.ok(document.project.tasks.every((task) => task.deleted));
    assert.match(await (await fetch(`${server.url}/projects/a`)).text(), /<button type="submit">Download project<\/button>/);
    assert.deepEqual((await download('/projects/empty/export')).project.tasks, []);
    assert.equal((await fetch(`${server.url}/projects/missing/export`)).status, 404);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await download(), document);
    const db = new DatabaseSync(databasePath);
    try { assert.equal(db.prepare("SELECT notes FROM tasks WHERE id = 'one'").get().notes, notes); }
    finally { db.close(); }
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('imports validate atomically, create independent identities, and preserve fields and reserved order across restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-import-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const download = async (path) => (await fetch(`${server.url}${path}/export`)).json();
    const snapshot = () => {
      const db = new DatabaseSync(databasePath);
      try {
        return ['projects', 'tasks', 'task_project_positions'].map((table) => db.prepare(`SELECT * FROM ${table}`).all());
      } finally { db.close(); }
    };
    assert.match(await get('/'), /<label for="project-json">Project JSON<\/label>/);
    assert.match(await get('/'), /<label for="imported-project-name">Imported project name<\/label>/);
    await post('/projects', { name: 'Original' });
    const originalPath = (await get('/')).match(/method="get" action="(\/projects\/[^"/]+)"/)[1];
    await post(`${originalPath}/tasks`, { title: 'Original task' });
    const original = await download(originalPath);
    const document = {
      format: 'workboard-project', version: 1,
      project: { name: 'Portable name', archived: false, defaultPriority: 'Low', id: originalPath.split('/').at(-1), tasks: [
        { title: '  First  Ω <b>  ', completed: true, priority: 'High', dueDate: '2000-02-29', notes: '\n  literal <script>🌿</script>\r\n end  ', deleted: false, id: 'injected', position: 999 },
        { title: 'Deleted', completed: true, priority: 'Normal', dueDate: '', notes: 'saved', deleted: true },
        { title: 'Last', completed: false, priority: 'Low', dueDate: '0001-01-01', notes: '', deleted: false },
      ] },
    };
    const before = snapshot();
    for (const json of ['{bad <markup>', JSON.stringify({ ...document, version: 2 }), JSON.stringify({ ...document, project: { ...document.project, tasks: [...document.project.tasks, { ...document.project.tasks[0], dueDate: '2023-02-29' }] } })]) {
      const response = await post('/imports/projects', { json, name: '  Rejected Ω  ' });
      assert.equal(response.status, 422);
      const html = await response.text();
      assert.match(html, /role="alert">Invalid project JSON/);
      assert.match(html, /value="  Rejected Ω  "/);
      assert.ok(html.includes(json.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')));
      assert.deepEqual(snapshot(), before);
    }
    const blank = await post('/imports/projects', { json: JSON.stringify(document), name: ' \t ' });
    assert.equal(blank.status, 422);
    assert.match(await blank.text(), /role="alert">Project name is required/);
    assert.deepEqual(snapshot(), before);
    const imported = await post('/imports/projects', { json: JSON.stringify(document), name: '  Independent  ' });
    assert.equal(imported.status, 303);
    const path = imported.headers.get('location');
    assert.notEqual(path, originalPath);
    assert.match(await get(path), /<h1>Independent<\/h1>/);
    const expected = { format: document.format, version: 1, project: {
      name: 'Independent', archived: false, defaultPriority: 'Low', tasks: document.project.tasks.map(({ id, position, ...task }) => ({ ...task, notes: task.notes.replace(/\r\n?/g, '\n') })),
    } };
    assert.deepEqual(await download(path), expected);
    assert.deepEqual(await download(originalPath), original);
    const importedTasks = snapshot()[1].filter((task) => task.project_id === path.split('/').at(-1));
    assert.equal(importedTasks.length, 3);
    assert.ok(importedTasks.every((task) => task.id !== 'injected'));
    const deletedId = importedTasks[1].id;
    let html = await get(`${path}?filter=Deleted`);
    assert.match(html, /<button type="submit">Restore task/);
    assert.match(html, /name="notes" rows="4" disabled/);
    assert.match(await get('/'), /project-summary">1\/2 completed/);
    await post(`${path}/default-priority`, { priority: 'High' });
    await post(`${path}/tasks`, { title: 'New' });
    const restored = await post(`${path}/tasks/${deletedId}/restore`, { filter: 'Deleted' });
    assert.match(restored.headers.get('location'), /filter=Deleted/);
    assert.doesNotMatch(await get(restored.headers.get('location')), /data-testid="task-row"/);
    assert.deepEqual((await download(path)).project.tasks.map((task) => task.title), ['  First  Ω <b>  ', 'Deleted', 'Last', 'New']);
    assert.equal((await download(path)).project.tasks[1].priority, 'Normal');
    const firstId = importedTasks[0].id;
    await post(`${path}/tasks/${firstId}/move`, { destination: originalPath.split('/').at(-1) });
    await post(`${originalPath}/tasks/${firstId}/move`, { destination: path.split('/').at(-1) });
    assert.equal((await download(path)).project.tasks[0].title, document.project.tasks[0].title);
    assert.deepEqual(await download(originalPath), original);
    document.project.archived = true;
    const archived = await post('/imports/projects', { json: JSON.stringify(document), name: 'Archived copy' });
    const archivedPath = archived.headers.get('location');
    html = await get(`${archivedPath}?filter=Deleted`);
    assert.match(html, />Archived project/);
    assert.match(html, /disabled>Restore task/);
    assert.match(html, /name="notes" rows="4" disabled/);
    const archivedTaskId = snapshot()[1].find((task) => task.project_id === archivedPath.split('/').at(-1) && task.deleted).id;
    assert.equal((await post(`${archivedPath}/tasks/${archivedTaskId}/restore`)).status, 403);
    await post(`${archivedPath}/restore`);
    await post(`${archivedPath}/tasks/${archivedTaskId}/restore`);
    assert.equal((await download(archivedPath)).project.tasks[1].deleted, false);
    document.project.tasks = [];
    const empty = await post('/imports/projects', { json: JSON.stringify(document), name: 'Empty' });
    assert.deepEqual((await download(empty.headers.get('location'))).project.tasks, []);
    const saved = await download(path);
    const savedArchived = await download(archivedPath);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await download(path), saved);
    assert.deepEqual(await download(archivedPath), savedArchived);
    assert.deepEqual(await download(originalPath), original);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('directory intersects read-only filters, preserves order and data, and resets navigation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-directory-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const titles = (html) => [...html.matchAll(/data-testid="directory-task-title">([^<]*)<\/div>/g)].map((match) => match[1]);
    const task = (title, extra = {}) => ({ title, completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false, ...extra });
    const importCopy = async (name, archived, tasks) => {
      const response = await post('/imports/projects', { name, json: JSON.stringify({
        format: 'workboard-project', version: 1,
        project: { name, archived, defaultPriority: 'High', tasks },
      }) });
      return response.headers.get('location');
    };
    const first = await importCopy('Owner Ω <b>', false, [
      task('Alpha  \t ONE', { completed: true, priority: 'High', dueDate: '2024-02-29', notes: '  <b>Ω</b>\nline\n ' }),
      task('Removed', { deleted: true, priority: 'High', dueDate: '2024-03-01' }),
      task('Undated', { notes: 'Alpha ONE' }),
    ]);
    const second = await importCopy('Alpha ONE', false, [task('Second'), task('Deleted second', { deleted: true })]);
    await importCopy('Archive', true, [task('Archived live'), task('Archived deleted', { deleted: true })]);
    const snapshot = async () => Promise.all([first, second].map(async (path) => (await fetch(`${server.url}${path}/export`)).json()));
    const before = await snapshot();
    assert.match(await get('/'), /action="\/directory"><button type="submit">Task directory/);
    let html = await get('/directory');
    assert.deepEqual(titles(html), ['Alpha  \t ONE', 'Undated', 'Second']);
    assert.match(html, /data-testid="directory-project-name">Owner Ω &lt;b&gt;/);
    assert.match(html, /directory-task-completion">Completed/);
    assert.match(html, /directory-task-priority">High/);
    assert.match(html, /directory-task-due-date">2024-02-29/);
    assert.match(html, /directory-task-notes"[^>]*>  &lt;b&gt;Ω&lt;\/b&gt;\nline\n <\/div>/);
    assert.doesNotMatch(html, /<textarea|<input[^>]*type="checkbox"|>Move task|>Save notes|>Delete task|>Restore task/);
    assert.match(html, new RegExp(`action="${first}">\\s*<button type="submit">Open project`));
    const state = new URLSearchParams({ scope: 'Active', filter: 'Completed', priorityFilter: 'High', query: '  aLPHA\t one  ', dueFrom: '2024-02-29', dueThrough: '2024-02-29' });
    html = await get(`/directory?${state}`);
    assert.deepEqual(titles(html), ['Alpha  \t ONE']);
    assert.match(html, /<option selected>Completed/);
    assert.match(html, /<option selected>High/);
    state.set('dueFrom', '2024-03-01'); state.set('dueThrough', '');
    assert.deepEqual(titles(await get(`/directory?${state}`)), []);
    state.set('filter', 'All'); state.set('priorityFilter', 'All'); state.set('query', ''); state.set('dueFrom', '');
    assert.deepEqual(titles(await get(`/directory?${state}`)), ['Alpha  \t ONE', 'Undated', 'Second']);
    state.set('filter', 'Deleted');
    assert.deepEqual(titles(await get(`/directory?${state}`)), ['Removed', 'Deleted second']);
    state.set('scope', 'Archived');
    assert.deepEqual(titles(await get(`/directory?${state}`)), ['Archived deleted']);
    state.set('filter', 'All');
    assert.deepEqual(titles(await get(`/directory?${state}`)), ['Archived live']);
    state.set('scope', 'Active'); state.set('query', 'Owner');
    assert.deepEqual(titles(await get(`/directory?${state}`)), []);
    state.set('query', 'Alpha one');
    assert.deepEqual(titles(await get(`/directory?${state}`)), ['Alpha  \t ONE']);
    state.set('query', ''); state.set('filter', 'Completed'); state.set('priorityFilter', 'High');
    state.set('dueFrom', '2024-02-29'); state.set('dueThrough', '2024-02-29');
    for (const [from, through, message] of [
      ['2023-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-03-01', '2024-02-29', 'Due from must not be after Due through'],
    ]) {
      const response = await post('/directory/due-range', { ...Object.fromEntries(state), rangeFrom: from, rangeThrough: through });
      assert.equal(response.status, 422);
      html = await response.text();
      assert.match(html, new RegExp(`role="alert">${message}`));
      assert.deepEqual(titles(html), ['Alpha  \t ONE']);
      assert.match(html, /name="dueFrom" value="2024-02-29"/);
    }
    const applied = await post('/directory/due-range', { ...Object.fromEntries(state), rangeFrom: ' 2024-02-29 ', rangeThrough: '' });
    assert.equal(applied.status, 303);
    assert.deepEqual(titles(await get(applied.headers.get('location'))), ['Alpha  \t ONE']);
    assert.deepEqual(await snapshot(), before);
    html = await get('/directory');
    assert.match(html, /<option selected>Active/);
    assert.match(html, /id="directory-search"[^>]*value=""/);
    assert.match(html, /id="due-from"[^>]*value=""/);
    assert.match(await get(first), /<option selected>All/);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/directory'), html);
    assert.deepEqual(await snapshot(), before);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('directory bulk completion intersects all filters, protects read-only data, and persists', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-bulk-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const task = (title, extra = {}) => ({ title, completed: false, priority: 'High',
      dueDate: '2024-02-29', notes: '  Ω <b>literal</b>\nnext\n ', deleted: false, ...extra });
    const importCopy = async (name, archived, tasks) => {
      const response = await post('/imports/projects', { name, json: JSON.stringify({
        format: 'workboard-project', version: 1,
        project: { name, archived, defaultPriority: 'Low', tasks },
      }) });
      return response.headers.get('location');
    };
    const first = await importCopy('First', false, [
      task('Match  \t ONE'), task('Match one done', { completed: true }),
      task('Match one low', { priority: 'Low' }), task('Match one undated', { dueDate: '' }),
      task('Match one early', { dueDate: '2024-02-28' }),
      task('Match one late', { dueDate: '2024-03-01' }), task('Other title'),
      task('Match one deleted', { deleted: true }),
    ]);
    const second = await importCopy('Second', false, [task('Match one second'), task('Second other')]);
    const archived = await importCopy('Archive', true, [task('Match one archived'),
      task('Match one archived done', { completed: true }), task('Match one archived deleted', { deleted: true })]);
    const snapshot = () => {
      const db = new DatabaseSync(databasePath);
      try {
        return {
          projects: db.prepare('SELECT * FROM projects ORDER BY position').all(),
          tasks: db.prepare('SELECT * FROM tasks ORDER BY position').all().map((row) => ({ ...row })),
          positions: db.prepare('SELECT * FROM task_project_positions ORDER BY project_id, position').all(),
        };
      } finally { db.close(); }
    };
    const before = snapshot();
    const state = { scope: 'Active', filter: 'Open', priorityFilter: 'High',
      query: '  mATCH\t one  ', dueFrom: '2024-02-29', dueThrough: '2024-02-29' };
    const view = () => get(`/directory?${new URLSearchParams(state)}`);
    const titles = (html) => [...html.matchAll(/data-testid="directory-task-title">([^<]*)<\/div>/g)].map((match) => match[1]);
    const buttons = (html, complete, reopen) => {
      assert.match(html, new RegExp(`<button type="submit"${complete ? '' : ' disabled'}>Complete visible tasks`));
      assert.match(html, new RegExp(`<button type="submit"${reopen ? '' : ' disabled'}>Reopen visible tasks`));
    };
    let html = await view();
    assert.deepEqual(titles(html), ['Match  \t ONE', 'Match one second']);
    buttons(html, true, false);
    assert.doesNotMatch(html, /No matching tasks/);
    const completed = await post('/directory/complete', state);
    assert.equal(completed.status, 303);
    const location = completed.headers.get('location');
    const savedState = new URL(location, server.url).searchParams;
    for (const [key, value] of Object.entries(state)) {
      assert.equal(savedState.get(key), key === 'query' ? value.trim() : value);
    }
    html = await get(location);
    assert.deepEqual(titles(html), []);
    assert.match(html, /role="status">No matching tasks/);
    buttons(html, false, false);
    const afterComplete = snapshot();
    assert.deepEqual(afterComplete.projects, before.projects);
    assert.deepEqual(afterComplete.positions, before.positions);
    assert.deepEqual(afterComplete.tasks, before.tasks.map((task) => (
      ['Match  \t ONE', 'Match one second'].includes(task.title) ? { ...task, completed: 1 } : task
    )));
    assert.match(await get('/'), /project-summary">2\/7 completed/);
    assert.match(await get('/'), /project-summary">1\/2 completed/);
    // Repeating a no-match action is harmless; IDs submitted by a client do not
    // replace the server-resolved matching set.
    await post('/directory/complete', { ...state, taskId: before.tasks[6].id });
    assert.deepEqual(snapshot(), afterComplete);
    state.filter = 'All';
    buttons(await view(), false, true);
    state.filter = 'Completed';
    html = await view();
    assert.deepEqual(titles(html), ['Match  \t ONE', 'Match one done', 'Match one second']);
    buttons(html, false, true);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await view(), html);
    assert.deepEqual(snapshot(), afterComplete);
    const reopened = await post('/directory/reopen', state);
    assert.equal(reopened.status, 303);
    html = await get(reopened.headers.get('location'));
    assert.match(html, /No matching tasks/);
    assert.deepEqual(titles(html), []);
    buttons(html, false, false);
    const afterReopen = snapshot();
    assert.deepEqual(afterReopen.tasks, before.tasks.map((task) => (
      task.title === 'Match one done' ? { ...task, completed: 0 } : task
    )));
    assert.deepEqual(afterReopen.positions, before.positions);
    assert.deepEqual(afterReopen.projects, before.projects);
    assert.equal((await get('/')).match(/project-summary">0\//g).length, 2);
    // Archived and deleted views disable both controls, and direct requests
    // cannot bypass those restrictions.
    for (const restricted of [
      { ...state, scope: 'Archived', filter: 'All' },
      { ...state, scope: 'Archived', filter: 'Deleted' },
      { ...state, filter: 'Deleted' },
    ]) {
      buttons(await get(`/directory?${new URLSearchParams(restricted)}`), false, false);
      for (const action of ['complete', 'reopen']) {
        assert.equal((await post(`/directory/${action}`, restricted)).status, 403);
        assert.deepEqual(snapshot(), afterReopen);
      }
    }
    buttons(await get('/directory'), true, false);
    // Mixed completion enables both actions; All changes matching tasks only.
    await post('/directory/complete', { ...state, filter: 'Open', query: 'second', dueFrom: '', dueThrough: '' });
    buttons(await get('/directory'), true, true);
    await post('/directory/reopen', { scope: 'Active', filter: 'All', priorityFilter: 'All' });
    buttons(await get('/directory'), true, false);
    // A later move and return retain the bulk completion and remembered order.
    await post('/directory/complete', { ...state, filter: 'Open' });
    const moved = before.tasks[0];
    const taskPath = `${first}/tasks/${moved.id}`;
    await post(`${taskPath}/move`, { destination: second.split('/').at(-1) });
    assert.match(await get(second), /Complete Match  \t ONE" checked/);
    await post(`${second}/tasks/${moved.id}/move`, { destination: first.split('/').at(-1) });
    const detail = await get(first);
    assert.ok(detail.indexOf('Complete Match  \t ONE" checked') < detail.indexOf('Complete Match one done" checked'));
    assert.deepEqual(snapshot().positions.filter((position) => position.project_id === moved.project_id),
      before.positions.filter((position) => position.project_id === moved.project_id));
    const finalSnapshot = snapshot();
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(snapshot(), finalSnapshot);
    assert.equal(await get(first), detail);
    assert.match(await get(`${archived}?filter=Deleted`), /Match one archived deleted/);
    assert.equal((await fetch(`${server.url}/health`)).status, 200);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('directory summary counts resolved intersections, retained deleted completion, and bulk updates', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-directory-summary-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const task = (title, completed, priority = 'High', dueDate = '2024-02-29', deleted = false) => ({
      title, completed, priority, dueDate, deleted, notes: 'not searched',
    });
    const importCopy = async (name, archived, tasks) => {
      const response = await post('/imports/projects', { name, json: JSON.stringify({
        format: 'workboard-project', version: 1,
        project: { name, archived, defaultPriority: 'Normal', tasks },
      }) });
      assert.equal(response.status, 303);
      return response.headers.get('location');
    };
    const first = await importCopy('First', false, [
      task('Match one', false), task('Match two', true),
      task('Other', true, 'Low', ''), task('Removed', true, 'High', '', true),
    ]);
    const second = await importCopy('First', false, [
      task('MATCH three', false), task('Match low', true, 'Low'),
      task('Removed open', false, 'High', '', true),
    ]);
    const archived = await importCopy('Archived', true, [
      task('Archived live', true), task('Archived deleted', true, 'Normal', '', true),
      task('Archived deleted open', false, 'Low', '', true),
    ]);
    const snapshot = async () => Promise.all([first, second, archived].map(async (path) =>
      (await fetch(`${server.url}${path}/export`)).json()));
    const before = await snapshot();
    const check = (html, completed, total) => {
      const summaries = [...html.matchAll(/data-testid="directory-summary">([^<]*)<\/p>/g)];
      assert.deepEqual(summaries.map((match) => match[1]), [`${completed}/${total} completed`]);
      assert.equal((html.match(/data-testid="directory-task-row"/g) ?? []).length, total);
      assert.equal(html.includes('role="status">No matching tasks'), total === 0);
      const expectedOwners = new Map();
      for (const row of html.matchAll(/<li class="task" data-testid="directory-task-row">([\s\S]*?)<\/li>/g)) {
        const path = row[1].match(/action="([^"]+)"/)[1];
        const counts = expectedOwners.get(path) ?? { total: 0, completed: 0 };
        counts.total += 1;
        if (row[1].includes('directory-task-completion">Completed')) counts.completed += 1;
        expectedOwners.set(path, counts);
      }
      const ownerRows = [...html.matchAll(/<li class="project" data-testid="directory-owner-row">([\s\S]*?)<\/li>/g)];
      const paths = ownerRows.map((row) => row[1].match(/action="([^"]+)"/)[1]);
      assert.deepEqual(paths, [first, second, archived].filter((path) => expectedOwners.has(path)));
      for (const row of ownerRows) {
        const path = row[1].match(/action="([^"]+)"/)[1];
        const counts = expectedOwners.get(path);
        assert.match(row[1], new RegExp(`directory-owner-summary">${counts.completed}/${counts.total} completed`));
        const name = path === archived ? 'Archived' : 'First';
        assert.ok(row[1].includes(`directory-owner-name">${name}</span>`));
      }
    };
    check(await get('/directory'), 3, 5);
    const state = { scope: 'Active', filter: 'All', priorityFilter: 'High',
      dueFrom: '2024-02-29', dueThrough: '2024-02-29', query: 'match', order: 'Original' };
    const view = () => get(`/directory?${new URLSearchParams(state)}`);
    for (const order of ['Original', 'Priority', 'Due date', 'Title']) {
      state.order = order;
      check(await view(), 1, 3);
    }
    for (const [filter, completed, total] of [['Open', 0, 2], ['Completed', 1, 1], ['Deleted', 0, 0]]) {
      state.filter = filter;
      check(await view(), completed, total);
    }
    Object.assign(state, { filter: 'All', query: 'no match' });
    check(await view(), 0, 0);
    Object.assign(state, { query: 'match' });
    for (const [rangeFrom, rangeThrough] of [['2023-02-29', ''], ['2025-01-01', '2024-01-01']]) {
      const invalid = await post('/directory/due-range', { ...state, rangeFrom, rangeThrough });
      assert.equal(invalid.status, 422);
      check(await invalid.text(), 1, 3);
    }
    const applied = await post('/directory/due-range', { ...state, rangeFrom: '2025-01-01', rangeThrough: '' });
    check(await get(applied.headers.get('location')), 0, 0);
    for (const [scope, filter, completed, total] of [
      ['Active', 'Deleted', 1, 2], ['Archived', 'All', 1, 1], ['Archived', 'Deleted', 1, 2],
    ]) {
      check(await get(`/directory?${new URLSearchParams({ scope, filter })}`), completed, total);
    }
    assert.deepEqual(await snapshot(), before);
    state.filter = 'Open';
    const completed = await post('/directory/complete', state);
    check(await get(completed.headers.get('location')), 0, 0);
    state.filter = 'All';
    check(await view(), 3, 3);
    state.filter = 'Completed';
    check(await view(), 3, 3);
    await server.stop();
    server = await startServer(databasePath);
    check(await view(), 3, 3);
    const reopened = await post('/directory/reopen', state);
    check(await get(reopened.headers.get('location')), 0, 0);
    state.filter = 'All';
    check(await view(), 0, 3);
    const expected = structuredClone(before);
    expected[0].project.tasks[1].completed = false;
    assert.deepEqual(await snapshot(), expected);
    const home = await get('/');
    assert.deepEqual([...home.matchAll(/data-testid="project-summary">([^<]*)/g)].map((match) => match[1]),
      ['1/3 completed', '1/2 completed']);
    await server.stop();
    server = await startServer(databasePath);
    check(await view(), 0, 3);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('directory ordering spans projects, retains view state, and leaves exports and remembered order intact', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-directory-order-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const titles = (html) => [...html.matchAll(/data-testid="directory-task-title">([^<]*)<\/div>/g)].map((match) => match[1]);
    const task = (title, priority, dueDate = '', extra = {}) => ({ title, priority, dueDate, completed: false, notes: 'literal notes', deleted: false, ...extra });
    const importCopy = async (name, archived, tasks) => {
      const response = await post('/imports/projects', { name, json: JSON.stringify({
        format: 'workboard-project', version: 1,
        project: { name, archived, defaultPriority: 'Normal', tasks },
      }) });
      return response.headers.get('location');
    };
    const first = await importCopy('First', false, [
      task('zulu', 'Low', '2025-06-01'), task('alpha', 'High', '2024-02-29'),
      task('Removed z', 'Low', '', { deleted: true }),
    ]);
    const second = await importCopy('Second', false, [
      task('ALPHA', 'High', '2024-02-29'), task('Beta', 'Normal'),
      task('early', 'Low', '0001-01-01'), task('Removed a', 'High', '', { deleted: true }),
    ]);
    const archived = await importCopy('Archived', true, [
      task('z archive', 'Low'), task('a archive', 'High'),
      task('z deleted', 'Low', '', { deleted: true }), task('a deleted', 'High', '', { deleted: true }),
    ]);
    const snapshot = async () => Promise.all([first, second, archived].map(async (path) => (await fetch(`${server.url}${path}/export`)).json()));
    const before = await snapshot();
    const state = { scope: 'Active', filter: 'All', priorityFilter: 'All', dueFrom: '', dueThrough: '', query: '', order: 'Original' };
    const view = () => get(`/directory?${new URLSearchParams(state)}`);
    assert.deepEqual(titles(await view()), ['zulu', 'alpha', 'ALPHA', 'Beta', 'early']);
    for (const [order, expected] of [
      ['Priority', ['alpha', 'ALPHA', 'Beta', 'zulu', 'early']],
      ['Due date', ['early', 'alpha', 'ALPHA', 'zulu', 'Beta']],
      ['Title', ['alpha', 'ALPHA', 'Beta', 'early', 'zulu']],
    ]) {
      state.order = order;
      const html = await view();
      assert.deepEqual(titles(html), expected);
      assert.match(html, new RegExp(`<option selected>${order}</option>`));
      const orderSelect = html.match(/<select id="directory-order"[\s\S]*?<\/select>/)[0];
      assert.deepEqual([...orderSelect.matchAll(/<option[^>]*>([^<]*)/g)].map((match) => match[1]), ['Original', 'Priority', 'Due date', 'Title']);
      for (const form of html.matchAll(/<form[^>]*action="\/directory[^"\s]*"[\s\S]*?<\/form>/g)) {
        assert.match(form[0], /name="order"/);
      }
    }
    assert.deepEqual(await snapshot(), before);
    state.scope = 'Archived'; state.order = 'Priority';
    assert.deepEqual(titles(await view()), ['a archive', 'z archive']);
    state.filter = 'Deleted'; state.order = 'Title';
    assert.deepEqual(titles(await view()), ['a deleted', 'z deleted']);
    state.scope = 'Active';
    assert.deepEqual(titles(await view()), ['Removed a', 'Removed z']);
    Object.assign(state, { filter: 'Open', priorityFilter: 'High', query: ' ALpha ', dueFrom: '2024-02-29', dueThrough: '2024-02-29', order: 'Due date' });
    assert.deepEqual(titles(await view()), ['alpha', 'ALPHA']);
    const invalid = await post('/directory/due-range', { ...state, rangeFrom: '2023-02-29', rangeThrough: '' });
    assert.equal(invalid.status, 422);
    const invalidHtml = await invalid.text();
    assert.deepEqual(titles(invalidHtml), ['alpha', 'ALPHA']);
    assert.match(invalidHtml, /<option selected>Due date/);
    const applied = await post('/directory/due-range', { ...state, rangeFrom: '0001-01-01', rangeThrough: '2025-12-31' });
    assert.equal(new URL(applied.headers.get('location'), server.url).searchParams.get('order'), 'Due date');
    const completed = await post('/directory/complete', state);
    const location = completed.headers.get('location');
    assert.equal(new URL(location, server.url).searchParams.get('order'), 'Due date');
    const emptyHtml = await get(location);
    assert.deepEqual(titles(emptyHtml), []);
    assert.match(emptyHtml, /No matching tasks/);
    assert.match(emptyHtml, /<option selected>Due date/);
    state.filter = 'Completed';
    assert.deepEqual(titles(await view()), ['alpha', 'ALPHA']);
    const after = await snapshot();
    const expected = structuredClone(before);
    expected[0].project.tasks[1].completed = true;
    expected[1].project.tasks[0].completed = true;
    assert.deepEqual(after, expected);
    assert.match(await get('/directory'), /<option selected>Original/);
    const moved = (await get(first)).match(/action="([^" ]*\/tasks\/[^/" ]+)"/)[1];
    const id = moved.split('/').at(-1);
    await post(`${moved}/move`, { destination: second.split('/').at(-1) });
    await post(`${second}/tasks/${id}/move`, { destination: first.split('/').at(-1) });
    assert.deepEqual(await snapshot(), after);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await snapshot(), after);
    assert.deepEqual(titles(await view()), ['alpha', 'ALPHA']);
    const reopened = await post('/directory/reopen', state);
    assert.equal(new URL(reopened.headers.get('location'), server.url).searchParams.get('order'), 'Due date');
    assert.deepEqual(titles(await get(reopened.headers.get('location'))), []);
    assert.deepEqual(await snapshot(), before);
    assert.match(await get('/directory'), /<option selected>Original/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('directory bulk priority changes only matching live tasks and persists across restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-directory-priority-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const task = (title, extra = {}) => ({ title, completed: false, priority: 'High',
      dueDate: '2024-02-29', notes: '  Ω <literal>\nend ', deleted: false, ...extra });
    const importCopy = async (archived, tasks) => {
      const response = await post('/imports/projects', { name: 'Same owner', json: JSON.stringify({
        format: 'workboard-project', version: 1,
        project: { name: 'Source', archived, defaultPriority: 'Low', tasks },
      }) });
      return response.headers.get('location');
    };
    const first = await importCopy(false, [task('Match  \t ONE'), task('Match one done', { completed: true }),
      task('Match one deleted', { deleted: true }), task('Match one low', { priority: 'Low' }),
      task('Match one undated', { dueDate: '' }), task('Match one early', { dueDate: '2024-02-28' }), task('Other')]);
    const second = await importCopy(false, [task('Match one second')]);
    await importCopy(true, [task('Match one archived')]);
    const snapshot = () => {
      const db = new DatabaseSync(databasePath);
      try {
        return {
          projects: db.prepare('SELECT * FROM projects ORDER BY position').all(),
          tasks: db.prepare('SELECT * FROM tasks ORDER BY position').all().map((row) => ({ ...row })),
          positions: db.prepare('SELECT * FROM task_project_positions ORDER BY project_id, position').all(),
        };
      } finally { db.close(); }
    };
    const before = snapshot();
    const state = { scope: 'Active', filter: 'Open', priorityFilter: 'High', order: 'Priority',
      query: ' mATCH\t one ', dueFrom: '2024-02-29', dueThrough: '2024-02-29', visiblePriority: 'Normal' };
    for (const visiblePriority of [undefined, '', 'Urgent', 'high']) {
      const invalid = { ...state, visiblePriority };
      if (visiblePriority === undefined) delete invalid.visiblePriority;
      assert.equal((await post('/directory/priority', invalid)).status, 422);
    }
    for (const restricted of [{ ...state, scope: 'Archived' }, { ...state, filter: 'Deleted' }]) {
      assert.equal((await post('/directory/priority', restricted)).status, 403);
      assert.match(await get(`/directory?${new URLSearchParams(restricted)}`), /disabled>Set visible priority/);
    }
    assert.deepEqual(snapshot(), before);
    const fresh = await get('/directory');
    assert.match(fresh, /<label for="visible-tasks-priority">Visible tasks priority<\/label>/);
    assert.match(fresh, /<select id="visible-tasks-priority"[^>]*>\s*<option>Low<\/option><option selected>Normal<\/option><option>High<\/option>/);
    const response = await post('/directory/priority', state);
    assert.equal(response.status, 303);
    const location = response.headers.get('location');
    for (const [key, value] of Object.entries(state)) {
      assert.equal(new URL(location, server.url).searchParams.get(key), key === 'query' ? value.trim() : value);
    }
    const empty = await get(location);
    assert.match(empty, /directory-summary">0\/0 completed/);
    assert.match(empty, /No matching tasks/);
    assert.doesNotMatch(empty, /data-testid="directory-owner-row"/);
    for (const label of ['Set visible priority', 'Complete visible tasks', 'Reopen visible tasks', 'Delete visible tasks', 'Restore visible tasks']) {
      assert.ok(empty.includes(`disabled>${label}`));
    }
    const after = snapshot();
    assert.deepEqual(after.projects, before.projects);
    assert.deepEqual(after.positions, before.positions);
    assert.deepEqual(after.tasks, before.tasks.map((row) => ['Match  \t ONE', 'Match one second'].includes(row.title)
      ? { ...row, priority: 'Normal' } : row));
    await post('/directory/priority', { ...state, visiblePriority: 'Low' }); // Empty result is a no-op.
    assert.deepEqual(snapshot(), after);
    const normal = await get(`/directory?${new URLSearchParams({ ...state, priorityFilter: 'Normal' })}`);
    assert.match(normal, /directory-summary">0\/2 completed/);
    assert.equal((normal.match(/directory-owner-row/g) ?? []).length, 2);
    const moved = after.tasks[0];
    await post(`${first}/tasks/${moved.id}/move`, { destination: second.split('/').at(-1) });
    await post(`${second}/tasks/${moved.id}/move`, { destination: first.split('/').at(-1) });
    assert.deepEqual(snapshot().tasks, after.tasks);
    const final = snapshot();
    const exported = await get(`${first}/export`);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(snapshot(), final);
    assert.equal(await get(`${first}/export`), exported);
    assert.equal(await get(`/directory?${new URLSearchParams({ ...state, priorityFilter: 'Normal' })}`), normal);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('directory bulk deletion and restoration preserve identities, fields, intersections and reserved order', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-directory-delete-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const task = (title, extra = {}) => ({ title, completed: false, priority: 'High',
      dueDate: '2024-02-29', notes: '  Ω <b>literal</b>\nnext\n ', deleted: false, ...extra });
    const importCopy = async (archived, tasks) => {
      const response = await post('/imports/projects', { name: 'Same owner', json: JSON.stringify({
        format: 'workboard-project', version: 1,
        project: { name: 'Original', archived, defaultPriority: 'Low', tasks },
      }) });
      return response.headers.get('location');
    };
    const first = await importCopy(false, [task('Match  \t ONE'),
      task('Match one done', { completed: true }), task('Match one low', { priority: 'Low' }),
      task('Match one undated', { dueDate: '' }), task('Match one early', { dueDate: '2024-02-28' }),
      task('Match one late', { dueDate: '2024-03-01' }), task('Other'),
      task('Match one deleted', { deleted: true })]);
    const second = await importCopy(false, [task('Match one second', { completed: true })]);
    await importCopy(true, [task('Match one archived'), task('Match one archived deleted', { deleted: true })]);
    const snapshot = () => {
      const db = new DatabaseSync(databasePath);
      try {
        return {
          projects: db.prepare('SELECT * FROM projects ORDER BY position').all(),
          tasks: db.prepare('SELECT * FROM tasks ORDER BY position').all().map((row) => ({ ...row })),
          positions: db.prepare('SELECT * FROM task_project_positions ORDER BY project_id, position').all(),
        };
      } finally { db.close(); }
    };
    const before = snapshot();
    const state = { scope: 'Active', filter: 'All', priorityFilter: 'High', order: 'Title',
      query: ' mATCH\t one ', dueFrom: '2024-02-29', dueThrough: '2024-02-29' };
    const view = () => get(`/directory?${new URLSearchParams(state)}`);
    const titles = (html) => [...html.matchAll(/data-testid="directory-task-title">([^<]*)<\/div>/g)].map((match) => match[1]);
    const check = (html, completed, total, ownerTotals, canDelete, canRestore) => {
      assert.match(html, new RegExp(`directory-summary">${completed}/${total} completed`));
      assert.deepEqual([...html.matchAll(/directory-owner-summary">([^<]*)<\/span>/g)].map((m) => m[1]), ownerTotals);
      assert.equal((html.match(/data-testid="directory-task-row"/g) ?? []).length, total);
      assert.match(html, new RegExp(`<button type="submit"${canDelete ? '' : ' disabled'}>Delete visible tasks`));
      assert.match(html, new RegExp(`<button type="submit"${canRestore ? '' : ' disabled'}>Restore visible tasks`));
      if (!total) assert.match(html, /role="status">No matching tasks/);
    };
    check(await view(), 2, 3, ['1/2 completed', '1/1 completed'], true, false);
    const changedTitles = ['Match  \t ONE', 'Match one done', 'Match one second'];
    const deletedResponse = await post('/directory/delete', { ...state, taskId: before.tasks[6].id });
    assert.equal(deletedResponse.status, 303);
    const location = deletedResponse.headers.get('location');
    for (const [key, value] of Object.entries(state)) {
      assert.equal(new URL(location, server.url).searchParams.get(key), key === 'query' ? value.trim() : value);
    }
    check(await get(location), 0, 0, [], false, false);
    const afterDelete = snapshot();
    assert.deepEqual(afterDelete.projects, before.projects);
    assert.deepEqual(afterDelete.positions, before.positions);
    assert.deepEqual(afterDelete.tasks, before.tasks.map((row) => changedTitles.includes(row.title) ? { ...row, deleted: 1 } : row));
    assert.match(await get('/'), /project-summary">0\/5 completed/);
    assert.match(await get('/'), /project-summary">0\/0 completed/);
    await post('/directory/delete', state); // Empty matching set is a no-op.
    assert.deepEqual(snapshot(), afterDelete);
    state.filter = 'Deleted';
    check(await view(), 2, 4, ['1/3 completed', '1/1 completed'], false, true);
    for (const restricted of [
      { ...state, scope: 'Archived', filter: 'All' },
      { ...state, scope: 'Archived', filter: 'Deleted' },
    ]) {
      const html = await get(`/directory?${new URLSearchParams(restricted)}`);
      assert.match(html, /type="submit" disabled>Delete visible tasks/);
      assert.match(html, /type="submit" disabled>Restore visible tasks/);
      for (const action of ['delete', 'restore']) assert.equal((await post(`/directory/${action}`, restricted)).status, 403);
    }
    assert.equal((await post('/directory/delete', state)).status, 403);
    for (const filter of ['All', 'Open', 'Completed']) {
      assert.equal((await post('/directory/restore', { ...state, filter })).status, 403);
    }
    assert.deepEqual(snapshot(), afterDelete);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(snapshot(), afterDelete);
    check(await view(), 2, 4, ['1/3 completed', '1/1 completed'], false, true);
    // Later tasks must follow the reserved positions after restoration.
    await post(`${first}/tasks`, { title: 'Later task' });
    await post(`${first}/default-priority`, { priority: 'Normal' });
    const beforeRestore = snapshot();
    const restoredResponse = await post('/directory/restore', state);
    assert.equal(restoredResponse.status, 303);
    check(await get(restoredResponse.headers.get('location')), 0, 0, [], false, false);
    const afterRestore = snapshot();
    assert.deepEqual(afterRestore.projects, beforeRestore.projects);
    assert.deepEqual(afterRestore.positions, beforeRestore.positions);
    const restoredIds = new Set([...changedTitles, 'Match one deleted'].map((title) =>
      before.tasks.find((row) => row.title === title).id));
    assert.deepEqual(afterRestore.tasks, beforeRestore.tasks.map((row) =>
      restoredIds.has(row.id) ? { ...row, deleted: 0 } : row));
    assert.match(await get('/'), /project-summary">1\/9 completed/);
    assert.match(await get('/'), /project-summary">1\/1 completed/);
    const restored = await get(first);
    assert.ok(restored.indexOf('Complete Match  \t ONE') < restored.indexOf('Complete Match one done'));
    assert.ok(restored.indexOf('Complete Match one deleted') < restored.indexOf('Complete Later task'));
    state.filter = 'Completed';
    check(await view(), 2, 2, ['1/1 completed', '1/1 completed'], true, false);
    await post('/directory/delete', state);
    state.filter = 'Deleted';
    check(await view(), 2, 2, ['1/1 completed', '1/1 completed'], false, true);
    await post('/directory/restore', state);
    state.filter = 'Open';
    await post('/directory/delete', state);
    state.filter = 'Deleted';
    check(await view(), 0, 2, ['0/2 completed'], false, true);
    await post('/directory/restore', state);
    assert.deepEqual(snapshot(), afterRestore);
    // Restored tasks can move and return, preserving current fields and original slots.
    const moved = before.tasks[0];
    await post(`${first}/tasks/${moved.id}/move`, { destination: second.split('/').at(-1) });
    await post(`${second}/tasks/${moved.id}/move`, { destination: first.split('/').at(-1) });
    assert.deepEqual(snapshot().tasks, afterRestore.tasks);
    assert.equal(await get(first), restored);
    const finalSnapshot = snapshot();
    const exported = await get(`${first}/export`);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(snapshot(), finalSnapshot);
    assert.equal(await get(`${first}/export`), exported);
    assert.equal(await get(first), restored);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
