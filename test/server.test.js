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
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Startup timed out')); }, 5000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
    child.stdout.on('data', chunk => {
      const match = /listening on port (\d+)/.exec(chunk.toString());
      if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
    });
  });
  return {
    base,
    async stop() {
      const exit = once(child, 'exit');
      child.kill('SIGTERM');
      await exit;
    },
  };
}

test('priorities migrate, remain independent, preserve task state, and survive archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  const dbPath = join(directory, 'priority.sqlite');
  const oldDb = new DatabaseSync(dbPath);
  oldDb.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Existing');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing task', 1);`);
  oldDb.close();
  let server;
  try {
    server = await start(dbPath);
    const post = (path, data = {}) => fetch(server.base + path, {
      method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
    });
    const page = async path => (await fetch(server.base + path)).text();
    const prioritySelect = (html, id) => html.match(new RegExp(`<select id="task-priority-${id}"[^>]*>[\\s\\S]*?<\\/select>`))[0];
    const normalOptions = /<option>Low<\/option><option selected>Normal<\/option><option>High<\/option>/;
    assert.match(prioritySelect(await page('/projects/1'), 1), normalOptions);
    await post('/projects/1/tasks', { title: 'New task' });
    await post('/projects', { name: 'Other project' });
    await post('/projects/2/tasks', { title: 'Other task' });
    assert.match(prioritySelect(await page('/projects/1'), 2), normalOptions);
    assert.equal((await post('/projects/2/tasks/1/priority', { priority: 'Low' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/priority', { priority: 'Low' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Urgent' })).status, 400);
    const response = await post('/projects/1/tasks/1/priority?filter=Completed', { priority: 'High' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1?filter=Completed');
    await post('/projects/1/tasks/2/priority', { priority: 'Low' });
    await post('/projects/1/tasks/1/rename', { title: 'Renamed' });
    let html = await page('/projects/1');
    assert.match(prioritySelect(html, 1), /<option selected>High<\/option>/);
    assert.match(prioritySelect(html, 2), /<option selected>Low<\/option>/);
    assert.match(prioritySelect(await page('/projects/2'), 3), normalOptions);
    assert.match(html, /aria-label="Complete Renamed" checked/);
    assert.ok(html.indexOf('<span>Renamed') < html.indexOf('<span>New task'));
    assert.doesNotMatch(await page('/projects/1?filter=Open'), /Complete Renamed/);
    assert.doesNotMatch(await page('/projects/1?filter=Completed'), /Complete New task/);
    assert.match(await page('/'), /1\/2 completed/);
    await server.stop();
    server = await start(dbPath);
    assert.match(prioritySelect(await page('/projects/1'), 1), /<option selected>High<\/option>/);
    await post('/projects/1/archive');
    await server.stop();
    server = await start(dbPath);
    html = await page('/projects/1');
    for (const id of [1, 2]) assert.match(prioritySelect(html, id), / disabled/);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Normal' })).status, 403);
    await post('/projects/1/restore');
    html = await page('/projects/1');
    assert.doesNotMatch(html, / disabled/);
    assert.match(prioritySelect(html, 1), /<option selected>High<\/option>/);
    assert.match(prioritySelect(html, 2), /<option selected>Low<\/option>/);
    await post('/projects/1/tasks/1/priority', { priority: 'Normal' });
    await post('/projects/1/tasks/2', { completed: 'on' });
    await server.stop();
    server = await start(dbPath);
    html = await page('/projects/1');
    assert.match(prioritySelect(html, 1), normalOptions);
    assert.match(prioritySelect(html, 2), /<option selected>Low<\/option>/);
    assert.match(html, /aria-label="Complete Renamed" checked/);
    assert.match(await page('/'), /2\/2 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task rename validates, preserves ownership, order and completion, and survives archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  const dbPath = join(directory, 'tasks.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const post = (path, data = {}) => fetch(server.base + path, {
      method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
    });
    const page = async path => (await fetch(server.base + path)).text();
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Original' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1', { completed: 'on' });
    assert.match(await page('/projects/1'), /<label for="new-task-title-1">New task title<\/label>/);
    for (const title of ['', '   ']) {
      const response = await post('/projects/1/tasks/1/rename?filter=Completed', { title });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.match(html, /aria-label="Complete Original" checked/);
    }
    assert.equal((await post('/projects/2/tasks/1/rename', { title: 'Wrong owner' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/rename', { title: 'Missing' })).status, 404);
    const response = await post('/projects/1/tasks/1/rename?filter=Completed', { title: '  <Renamed & task>  ' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1?filter=Completed');
    let html = await page('/projects/1');
    assert.match(html, /aria-label="Complete &lt;Renamed &amp; task&gt;" checked/);
    assert.ok(html.indexOf('<span>&lt;Renamed') < html.indexOf('<span>Pending'));
    assert.doesNotMatch(await page('/projects/1?filter=Open'), /Renamed/);
    assert.doesNotMatch(await page('/projects/1?filter=Completed'), /Pending/);
    assert.doesNotMatch(await page('/projects/2'), /Renamed/);
    assert.match(await page('/'), /1\/2 completed/);
    await server.stop();
    server = await start(dbPath);
    assert.match(await page('/projects/1'), /aria-label="Complete &lt;Renamed &amp; task&gt;" checked/);
    await post('/projects/1/archive');
    html = await page('/projects/1');
    assert.equal((html.match(/id="new-task-title-\d+"[^>]* disabled/g) || []).length, 2);
    assert.equal((html.match(/<button type="submit" disabled>Rename task/g) || []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Blocked' })).status, 403);
    await post('/projects/1/restore');
    assert.doesNotMatch(await page('/projects/1'), / disabled/);
    await post('/projects/1/tasks/2/rename', { title: '  Open renamed  ' });
    await server.stop();
    server = await start(dbPath);
    html = await page('/projects/1');
    assert.match(html, /aria-label="Complete &lt;Renamed &amp; task&gt;" checked/);
    assert.match(html, /aria-label="Complete Open renamed" onchange/);
    assert.match(await page('/'), /1\/2 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('rename validates and preserves identity, order, tasks, summaries, and persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const dbPath = join(directory, 'rename.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const post = (path, data = {}) => fetch(server.base + path, {
      method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
    });
    const page = async path => (await fetch(server.base + path)).text();
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1', { completed: 'on' });
    assert.match(await page('/projects/1'), /<label for="new-project-name">New project name<\/label>/);
    for (const name of ['', '   ']) {
      const response = await post('/projects/1/rename', { name });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.match(html, /<h1>Original<\/h1>/);
    }
    const response = await post('/projects/1/rename?filter=Completed', { name: '  <Renamed & project>  ' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1?filter=Completed');
    let html = await page('/');
    assert.ok(html.indexOf('<span>&lt;Renamed') < html.indexOf('<span>Second'));
    assert.match(html, /1\/2 completed/);
    assert.match(await page('/projects/1'), /<h1>&lt;Renamed &amp; project&gt;<\/h1>/);
    await server.stop();
    server = await start(dbPath);
    html = await page('/projects/1');
    assert.match(html, /<h1>&lt;Renamed &amp; project&gt;<\/h1>/);
    assert.match(html, /aria-label="Complete Done" checked/);
    assert.match(html, /aria-label="Complete Pending"/);
    await post('/projects/1/archive');
    html = await page('/projects/1');
    assert.match(html, /id="new-project-name"[^>]* disabled/);
    assert.match(html, /<button type="submit" disabled>Rename project/);
    assert.equal((await post('/projects/1/rename', { name: 'Blocked' })).status, 403);
    assert.match(await page('/?filter=Archived'), /<span>&lt;Renamed &amp; project&gt;<\/span>/);
    await post('/projects/1/restore');
    assert.doesNotMatch(await page('/projects/1'), / disabled/);
    await post('/projects/1/rename', { name: 'Restored' });
    await server.stop();
    server = await start(dbPath);
    html = await page('/');
    assert.ok(html.indexOf('<span>Restored') < html.indexOf('<span>Second'));
    assert.match(html, /1\/2 completed/);
    assert.match(await page('/projects/1'), /aria-label="Complete Done" checked/);
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive migration, summaries, read-only tasks, restoration, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const dbPath = join(directory, 'archive.sqlite');
  const oldDb = new DatabaseSync(dbPath);
  oldDb.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    INSERT INTO projects (name) VALUES ('Existing');`);
  oldDb.close();
  let server;
  try {
    server = await start(dbPath);
    const post = (path, data = {}) => fetch(server.base + path, {
      method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
    });
    const page = async path => (await fetch(server.base + path)).text();
    let html = await page('/');
    assert.match(html, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(html, /data-testid="project-summary">0\/0 completed/);
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1', { completed: 'on' });
    assert.match(await page('/'), /data-testid="project-summary">1\/2 completed/);
    assert.equal((await post('/projects/1/archive')).status, 303);
    assert.doesNotMatch(await page('/'), /<span>Existing<\/span>/);
    html = await page('/?filter=Archived');
    assert.match(html, /<span>Existing<\/span>/);
    assert.doesNotMatch(html, /<span>Second<\/span>/);
    assert.match(html, /Restore project/);
    assert.match(html, /Open project/);
    assert.match(html, /1\/2 completed/);
    html = await page('/projects/1');
    assert.match(html, /<p>Archived project<\/p>/);
    assert.match(html, /<button type="submit" disabled>Create task/);
    assert.match(html, /aria-label="Complete Done" checked disabled/);
    assert.match(html, /aria-label="Complete Pending" disabled/);
    assert.doesNotMatch(await page('/projects/1?filter=Open'), /Complete Done/);
    assert.doesNotMatch(await page('/projects/1?filter=Completed'), /Complete Pending/);
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1', {})).status, 403);
    await server.stop();
    server = await start(dbPath);
    assert.match(await page('/?filter=Archived'), /1\/2 completed/);
    assert.match(await page('/projects/1'), /checked disabled/);
    assert.equal((await post('/projects/1/restore')).status, 303);
    html = await page('/');
    assert.ok(html.indexOf('<span>Existing') < html.indexOf('<span>Second'));
    assert.match(html, /1\/2 completed/);
    assert.doesNotMatch(await page('/projects/1'), / disabled/);
    await post('/projects/1/tasks/2', { completed: 'on' });
    await server.stop();
    server = await start(dbPath);
    assert.match(await page('/'), /2\/2 completed/);
    assert.doesNotMatch(await page('/?filter=Archived'), /data-testid="project-row"/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, stay project-scoped, and persist after restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const dbPath = join(directory, 'tasks.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const post = (path, data) => fetch(server.base + path, {
      method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
    });
    const page = async path => (await fetch(server.base + path)).text();
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    let html = await page('/projects/1');
    assert.match(html, /<label for="task-title">Task title<\/label>/);
    assert.match(html, /Create task/);
    assert.match(html, /<label for="task-filter">Task filter<\/label>/);
    assert.match(html, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', '   ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      assert.match(await response.text(), /role="alert">Task title is required/);
    }
    assert.doesNotMatch(await page('/projects/1'), /data-testid="task-row"/);
    assert.equal((await post('/projects/1/tasks', { title: '  First task  ' })).status, 303);
    await post('/projects/1/tasks', { title: '<Second & task>' });
    await post('/projects/2/tasks', { title: 'Other task' });
    html = await page('/projects/1');
    assert.equal((html.match(/data-testid="task-row"/g) || []).length, 2);
    assert.match(html, /aria-label="Complete First task"/);
    assert.match(html, /aria-label="Complete &lt;Second &amp; task&gt;"/);
    assert.doesNotMatch(html, / checked/);
    assert.ok(html.indexOf('<span>First task') < html.indexOf('<span>&lt;Second'));
    assert.doesNotMatch(html, /Other task/);
    assert.doesNotMatch(await page('/projects/2'), /First task/);
    assert.equal((await post('/projects/2/tasks/1', { completed: 'on' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1', { completed: 'on' })).status, 303);
    html = await page('/projects/1?filter=Completed');
    assert.match(html, /aria-label="Complete First task" checked/);
    assert.doesNotMatch(html, /Second &amp;/);
    html = await page('/projects/1?filter=Open');
    assert.doesNotMatch(html, /First task/);
    assert.match(html, /&lt;Second &amp; task&gt;/);
    await server.stop();
    server = await start(dbPath);
    html = await page('/projects/1');
    assert.match(html, /aria-label="Complete First task" checked/);
    assert.equal((html.match(/data-testid="task-row"/g) || []).length, 2);
    await post('/projects/1/tasks/1', {});
    assert.doesNotMatch(await page('/projects/1'), / checked/);
    assert.doesNotMatch(await page('/projects/1?filter=Completed'), /data-testid="task-row"/);
    await server.stop();
    server = await start(dbPath);
    assert.doesNotMatch(await page('/projects/1'), / checked/);
    assert.match(await page('/projects/2'), /Other task/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('projects validate, trim, remain ordered, navigate, and persist after restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const dbPath = join(directory, 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    let response = await fetch(`${server.base}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
    let html = await (await fetch(server.base)).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.doesNotMatch(html, /data-testid="project-row"/);
    async function create(name) {
      return fetch(`${server.base}/projects`, {
        method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
      });
    }
    for (const name of ['', '   ']) {
      response = await create(name);
      assert.equal(response.status, 400);
      html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    assert.equal((await create('  First project  ')).status, 303);
    assert.equal((await create('<Second & project>')).status, 303);
    html = await (await fetch(server.base)).text();
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(html, /<span>First project<\/span>/);
    assert.match(html, /&lt;Second &amp; project&gt;/);
    assert.ok(html.indexOf('First project') < html.indexOf('&lt;Second'));
    const paths = [...html.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    html = await (await fetch(server.base + paths[0])).text();
    assert.match(html, /<h1>First project<\/h1>/);
    assert.match(html, /<button type="submit">Projects<\/button>/);
    await server.stop();
    server = await start(dbPath);
    html = await (await fetch(server.base)).text();
    assert.deepEqual([...html.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]), paths);
    assert.match(html, /<span>First project<\/span>/);
    html = await (await fetch(server.base + paths[1])).text();
    assert.match(html, /<h1>&lt;Second &amp; project&gt;<\/h1>/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
