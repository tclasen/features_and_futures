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
    assert.doesNotMatch(await get('/projects/legacy'), / disabled/);
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
      assert.equal(await get(path), before.replace(normalOptions, options));
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
    assert.equal((html.match(/name="priority" disabled/g) ?? []).length, 2);
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
