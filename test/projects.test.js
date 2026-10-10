import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
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
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) {
        clearTimeout(timeout);
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

test('project creation, validation, navigation, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const get = path => fetch(server.baseUrl + path);
    const create = name => fetch(server.baseUrl + '/projects', {
      method: 'POST',
      body: new URLSearchParams({ name }),
      redirect: 'manual',
    });
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const initial = await (await get('/')).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, /<input id="project-name" name="name" type="text"/);
    assert.match(initial, />Create project<\/button>/);
    assert.equal((initial.match(/data-testid="project-row"/g) || []).length, 0);

    for (const name of ['', '  \t\n ']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      const body = await invalid.text();
      assert.match(body, /role="alert">Project name is required/);
      assert.doesNotMatch(body, /data-testid="project-row"/);
    }
    for (const name of ['  First project  ', 'Second <project> & café']) {
      const created = await create(name);
      assert.equal(created.status, 303);
      assert.equal(created.headers.get('location'), '/');
    }
    const listing = await (await get('/')).text();
    assert.equal((listing.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(listing, /<span>First project<\/span>/);
    assert.match(listing, /Second &lt;project&gt; &amp; café/);
    assert.ok(listing.indexOf('First project') < listing.indexOf('Second &lt;project&gt;'));
    const paths = [...listing.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    assert.notEqual(paths[0], paths[1]);
    const project = await (await get(paths[0])).text();
    assert.match(project, /<h1>First project<\/h1>/);
    assert.match(project, /action="\/".*<button type="submit">Projects<\/button>/);
    const invalidAfterCreation = await create('   ');
    assert.equal(((await invalidAfterCreation.text()).match(/data-testid="project-row"/g) || []).length, 2);

    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await (await get('/')).text(), listing);
    assert.match(await (await get(paths[0])).text(), /<h1>First project<\/h1>/);
    assert.equal((await get('/projects/999999')).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, toggle, remain isolated, and persist after restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  let server;
  try {
    const databasePath = join(directory, 'workboard.sqlite');
    server = await startServer(databasePath);
    const get = async path => (await fetch(server.baseUrl + path)).text();
    const post = (path, values) => fetch(server.baseUrl + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const rows = body => [...body.matchAll(/<div class="task-row" data-testid="task-row">([\s\S]*?)<\/div>/g)].map(match => match[1]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const initial = await get('/projects/1');
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, />Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    assert.equal(rows(initial).length, 0);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      const body = await response.text();
      assert.match(body, /role="alert">Task title is required/);
      assert.equal(rows(body).length, 0);
    }
    for (const title of ['  First task  ', 'Review <draft> & "notes"']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/projects/1?filter=All');
    }
    await post('/projects/2/tasks', { title: 'Other project task' });
    let tasks = rows(await get('/projects/1'));
    assert.equal(tasks.length, 2);
    assert.match(tasks[0], /<span>First task<\/span>/);
    assert.match(tasks[0], /type="checkbox".*aria-label="Complete First task"/);
    assert.match(tasks[1], /aria-label="Complete Review &lt;draft&gt; &amp; &quot;notes&quot;"/);
    assert.ok(tasks.every(task => !task.includes(' checked')));
    assert.equal(rows(await get('/projects/1?filter=Open')).length, 2);
    assert.equal(rows(await get('/projects/1?filter=Completed')).length, 0);
    const invalid = await post('/projects/1/tasks', { title: '   ' });
    assert.equal(rows(await invalid.text()).length, 2);

    const completed = await post('/projects/1/tasks/1', { completed: '1', filter: 'Open' });
    assert.equal(completed.status, 303);
    assert.equal(completed.headers.get('location'), '/projects/1?filter=Open');
    tasks = rows(await get('/projects/1'));
    assert.match(tasks[0], / checked/);
    assert.doesNotMatch(tasks[1], / checked/);
    assert.match(rows(await get('/projects/1?filter=Completed'))[0], /First task/);
    assert.equal(rows(await get('/projects/1?filter=Completed')).length, 1);
    const open = await get('/projects/1?filter=Open');
    assert.match(open, /<option selected>Open<\/option>/);
    assert.equal(rows(open).length, 1);
    assert.match(rows(open)[0], /Review &lt;draft&gt;/);
    assert.equal(rows(await get('/projects/2')).length, 1);
    assert.doesNotMatch(await get('/projects/2'), /First task|Review &lt;draft&gt;/);
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Missing project' })).status, 404);

    const savedPage = await get('/projects/1');
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), savedPage);
    assert.equal(rows(await get('/projects/2')).length, 1);
    assert.equal((await post('/projects/1/tasks/1', {})).status, 303);
    assert.equal(rows(await get('/projects/1?filter=Completed')).length, 0);
    assert.equal(rows(await get('/projects/1?filter=Open')).length, 2);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(rows(await get('/projects/1?filter=Open')).length, 2);
    assert.ok(rows(await get('/projects/1')).every(task => !task.includes(' checked')));
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive, summaries, read-only tasks, restoration, and migration persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const databasePath = join(directory, 'workboard.sqlite');
  // Start with the schema from Task 002 to verify existing data survives migration.
  const oldDatabase = new DatabaseSync(databasePath);
  oldDatabase.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO projects (name) VALUES ('Existing project');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Saved task', 1);
  `);
  oldDatabase.close();
  let server;
  try {
    server = await startServer(databasePath);
    const get = async path => (await fetch(server.baseUrl + path)).text();
    const post = (path, values = {}) => fetch(server.baseUrl + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const rows = body => [...body.matchAll(/data-testid="project-row">([\s\S]*?)<\/div>\s*<form method="get"([\s\S]*?)<\/div>/g)].map(match => match[0]);
    let active = await get('/');
    assert.match(active, /<label for="project-filter">Project filter<\/label>/);
    assert.match(active, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(active, /data-testid="project-summary">1\/1 completed/);
    await post('/projects', { name: 'Second project' });
    await post('/projects/1/tasks', { title: 'Open task' });
    active = await get('/');
    assert.equal(rows(active).length, 2);
    assert.match(rows(active)[0], /Existing project[\s\S]*1\/2 completed/);
    assert.match(rows(active)[1], /Second project[\s\S]*0\/0 completed/);
    assert.match(rows(active)[0], />Open project<\/button>/);
    assert.match(rows(active)[0], />Archive project<\/button>/);
    assert.doesNotMatch(active, />Restore project<\/button>/);
    assert.equal((await post('/projects/1/archive')).status, 303);
    assert.doesNotMatch(await get('/'), /Existing project/);
    const archived = await get('/?filter=Archived');
    assert.equal(rows(archived).length, 1);
    assert.match(archived, /<option selected>Archived<\/option>/);
    assert.match(archived, /Existing project/);
    assert.match(archived, /data-testid="project-summary">1\/2 completed/);
    assert.match(archived, />Open project<\/button>/);
    assert.match(archived, />Restore project<\/button>/);
    assert.doesNotMatch(archived, />Archive project<\/button>/);
    const projectPage = await get('/projects/1');
    assert.match(projectPage, /<p>Archived project<\/p>/);
    assert.match(projectPage, /<button type="submit" disabled>Create task<\/button>/);
    const checkboxes = [...projectPage.matchAll(/<input type="checkbox"[^>]*>/g)].map(match => match[0]);
    assert.equal(checkboxes.length, 2);
    assert.ok(checkboxes.every(checkbox => checkbox.includes(' disabled')));
    assert.match(checkboxes[0], / checked/);
    assert.doesNotMatch(checkboxes[1], / checked/);
    const open = await get('/projects/1?filter=Open');
    assert.match(open, /Open task/);
    assert.doesNotMatch(open, /Saved task/);
    const completed = await get('/projects/1?filter=Completed');
    assert.match(completed, /Saved task/);
    assert.doesNotMatch(completed, /Open task/);
    assert.equal((await post('/projects/1/tasks', { title: 'Forbidden task' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1')).status, 403);
    assert.equal(await get('/projects/1'), projectPage);

    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/?filter=Archived'), archived);
    assert.equal(await get('/projects/1'), projectPage);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.doesNotMatch(await get('/?filter=Archived'), /data-testid="project-row"/);
    active = await get('/');
    assert.equal(rows(active).length, 2);
    assert.match(rows(active)[0], /Existing project[\s\S]*1\/2 completed/);
    const restored = await get('/projects/1');
    assert.doesNotMatch(restored, / disabled|Archived project/);
    assert.match(restored, /Saved task" checked/);
    await post('/projects/1/tasks/2', { completed: '1' });
    assert.match(rows(await get('/'))[0], /2\/2 completed/);
    await post('/projects/1/tasks/1');
    active = await get('/');
    assert.match(rows(active)[0], /1\/2 completed/);
    const savedTasks = await get('/projects/1');
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/'), active);
    assert.equal(await get('/projects/1'), savedTasks);
    assert.equal((await post('/projects/999/archive')).status, 404);
    assert.equal((await post('/projects/999/restore')).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
