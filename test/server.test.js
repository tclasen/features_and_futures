import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { openProjects } from '../projects.js';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const baseUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = /listening on port (\d+)/.exec(output);
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

test('rename storage rejects invalid and archived edits without changing project identity', () => {
  const projects = openProjects(':memory:');
  try {
    const project = projects.create('Original');
    const taskId = projects.createTask(project.id, 'Task');
    projects.setTaskCompleted(project.id, taskId, true);
    for (const name of [null, undefined, '', ' \t\n ', 42]) {
      assert.equal(projects.rename(project.id, name), false);
      assert.equal(projects.find(project.id).name, 'Original');
    }
    assert.equal(projects.rename(project.id, '  Renamed  '), true);
    assert.deepEqual({ ...projects.find(project.id) }, { id: project.id, name: 'Renamed', archived: 0 });
    assert.deepEqual(projects.listTasks(project.id).map((task) => ({ ...task })), [{ id: taskId, title: 'Task', completed: 1 }]);
    projects.setArchived(project.id, true);
    assert.equal(projects.rename(project.id, 'Blocked'), false);
    assert.equal(projects.find(project.id).name, 'Renamed');
    projects.setArchived(project.id, false);
    assert.equal(projects.rename(project.id, 'Restored'), true);
    assert.equal(projects.rename(99999, 'Missing'), false);
  } finally {
    projects.close();
  }
});

test('renaming preserves order, tasks, summaries, filters, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  let server;
  try {
    const databasePath = join(directory, 'workboard.sqlite');
    server = await startServer(databasePath);
    const html = async (path) => (await fetch(`${server.baseUrl}${path}`)).text();
    const post = (path, values = {}) => fetch(`${server.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second project' });
    await post('/projects/1/tasks', { title: 'Finished task' });
    await post('/projects/1/tasks', { title: 'Open task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const initial = await html('/projects/1');
    assert.match(initial, /<label for="new-project-name">New project name<\/label>/);
    assert.match(initial, /id="new-project-name"[^>]*type="text"/);
    assert.match(initial, /<button type="submit">Rename project<\/button>/);

    for (const values of [{}, { name: '' }, { name: ' \t\n ', filter: 'Completed' }]) {
      const response = await post('/projects/1/rename', values);
      assert.equal(response.status, 422);
      const content = await response.text();
      assert.match(content, /role="alert">Project name is required/);
      assert.match(content, /<h1>Original<\/h1>/);
      if (values.filter) assert.match(content, /<option selected>Completed<\/option>/);
      assert.equal(await html('/projects/1'), initial);
    }
    const renamed = await post('/projects/1/rename', { name: '  Renamed <&" café  ', filter: 'Open' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Open');
    const savedPage = await html('/projects/1');
    assert.match(savedPage, /<h1>Renamed &lt;&amp;&quot; café<\/h1>/);
    assert.match(savedPage, /aria-label="Complete Finished task" checked/);
    assert.match(savedPage, /aria-label="Complete Open task"  /);
    assert.equal((savedPage.match(/data-testid="task-row"/g) || []).length, 2);
    const savedList = await html('/');
    assert.match(savedList, /<span>Renamed &lt;&amp;&quot; café<\/span>/);
    assert.match(savedList, /data-testid="project-summary">1\/2 completed/);
    assert.ok(savedList.indexOf('Renamed &lt;') < savedList.indexOf('Second project'));
    assert.match(savedList, /action="\/projects\/1"/);
    assert.equal((await post('/projects/99999/rename', { name: 'Missing' })).status, 404);
    assert.equal((await post('/projects/999999999999999999999/rename', { name: 'Missing' })).status, 404);
    const oversized = await post('/projects/1/rename', { name: 'a'.repeat(17000) });
    assert.equal(oversized.status, 413);
    assert.equal(await html('/projects/1'), savedPage);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), savedPage);
    assert.equal(await html('/'), savedList);
    await post('/projects/1/archive');
    const archivedPage = await html('/projects/1');
    assert.match(archivedPage, /id="new-project-name"[^>]* disabled/);
    assert.match(archivedPage, /<button type="submit" disabled>Rename project<\/button>/);
    const blocked = await post('/projects/1/rename', { name: 'Blocked', filter: 'Open' });
    assert.equal(blocked.status, 403);
    assert.match(await blocked.text(), /<option selected>Open<\/option>/);
    assert.equal(await html('/projects/1'), archivedPage);
    assert.match(await html('/?filter=Archived'), /<span>Renamed &lt;&amp;&quot; café<\/span>/);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), archivedPage);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), savedPage);
    assert.equal((await post('/projects/1/rename', { name: '  Restored name  ' })).status, 303);
    const finalPage = await html('/projects/1');
    const finalList = await html('/');
    assert.match(finalPage, /<h1>Restored name<\/h1>/);
    assert.match(finalPage, /aria-label="Complete Finished task" checked/);
    assert.match(finalList, /data-testid="project-summary">1\/2 completed/);
    assert.ok(finalList.indexOf('Restored name') < finalList.indexOf('Second project'));
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), finalPage);
    assert.equal(await html('/'), finalList);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project validation, ordering, navigation, escaping, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let server;
  try {
    const databasePath = join(directory, 'nested', 'projects.sqlite');
    server = await startServer(databasePath);
    const get = (path) => fetch(`${server.baseUrl}${path}`);
    const create = (name) => fetch(`${server.baseUrl}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ name }),
      redirect: 'manual',
    });
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const initial = await (await get('/')).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);

    for (const name of ['', ' \t\n ']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 422);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    const created = await create('  First project  ');
    assert.equal(created.status, 303);
    assert.equal(created.headers.get('location'), '/');
    assert.equal((await create('<script> & café')).status, 303);
    const listing = await (await get('/')).text();
    assert.equal((listing.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(listing, /<span>First project<\/span>/);
    assert.match(listing, /&lt;script&gt; &amp; café/);
    assert.ok(listing.indexOf('First project') < listing.indexOf('&lt;script&gt;'));
    const paths = [...listing.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
    assert.equal(paths.length, 2);
    assert.notEqual(paths[0], paths[1]);
    const detail = await (await get(paths[0])).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/" method="get"><button type="submit">Projects/);
    assert.equal((await get('/projects/99999')).status, 404);
    assert.equal((await get('/projects/999999999999999999999')).status, 404);

    const invalidAfterCreation = await (await create('   ')).text();
    assert.equal((invalidAfterCreation.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(invalidAfterCreation, /role="alert">Project name is required/);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await (await get('/')).text(), listing);
    assert.equal(await (await get(paths[0])).text(), detail);
    assert.equal((await create('Third project')).status, 303);
    const finalListing = await (await get('/')).text();
    assert.equal((finalListing.match(/data-testid="project-row"/g) || []).length, 3);
    assert.ok(finalListing.indexOf('Third project') > finalListing.indexOf('&lt;script&gt;'));
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, remain project-owned, and persist across restarts on an existing database', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  let server;
  try {
    const databasePath = join(directory, 'workboard.sqlite');
    // Model a database from Task 001 so schema upgrades preserve existing projects.
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      INSERT INTO projects (name) VALUES ('Existing project'), ('Other project');
    `);
    database.close();
    server = await startServer(databasePath);
    const get = (path) => fetch(`${server.baseUrl}${path}`);
    const post = (path, values) => fetch(`${server.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(values),
      redirect: 'manual',
    });
    const html = async (path) => (await get(path)).text();
    const taskRows = (content) => [...content.matchAll(/<form class="task"[^>]*data-testid="task-row"[\s\S]*?<\/form>/g)]
      .map((match) => match[0]);
    const initial = await html('/projects/1');
    assert.match(initial, /<h1>Existing project<\/h1>/);
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, />Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    assert.equal(taskRows(initial).length, 0);

    for (const title of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/tasks', { title });
      assert.equal(invalid.status, 422);
      const content = await invalid.text();
      assert.match(content, /role="alert">Task title is required/);
      assert.equal(taskRows(content).length, 0);
    }
    const missingTitle = await post('/projects/1/tasks', {});
    assert.equal(missingTitle.status, 422);
    const created = await post('/projects/1/tasks', { title: '  First task  ' });
    assert.equal(created.status, 303);
    assert.equal(created.headers.get('location'), '/projects/1?filter=All');
    assert.equal((await post('/projects/1/tasks', { title: '<script> " & café' })).status, 303);
    assert.equal((await post('/projects/2/tasks', { title: 'Other task' })).status, 303);

    const all = await html('/projects/1');
    const rows = taskRows(all);
    assert.equal(rows.length, 2);
    assert.match(rows[0], />First task<\/label>/);
    assert.match(rows[0], /type="checkbox"[^>]*aria-label="Complete First task"/);
    assert.match(rows[1], /aria-label="Complete &lt;script&gt; &quot; &amp; café"/);
    assert.doesNotMatch(all, /Other task/);
    assert.ok(rows.every((row) => !/\bchecked\b/.test(row)));
    assert.equal(taskRows(await html('/projects/1?filter=Open')).length, 2);
    assert.equal(taskRows(await html('/projects/1?filter=Completed')).length, 0);
    assert.equal(await html('/projects/1?filter=Invalid'), all);
    const taskPath = /action="([^"]+)"/.exec(rows[0])[1];

    const foreignUpdate = await post(taskPath.replace('/projects/1/', '/projects/2/'), { completed: '1' });
    assert.equal(foreignUpdate.status, 404);
    assert.equal(await html('/projects/1'), all);
    assert.equal((await post('/projects/99999/tasks', { title: 'Orphan task' })).status, 404);
    assert.equal((await post('/projects/1/tasks/99999', { completed: '1' })).status, 404);

    const completed = await post(taskPath, { completed: '1', filter: 'Open' });
    assert.equal(completed.status, 303);
    assert.equal(completed.headers.get('location'), '/projects/1?filter=Open');
    const saved = await html('/projects/1');
    const savedRows = taskRows(saved);
    assert.match(savedRows[0], /\bchecked\b/);
    assert.doesNotMatch(savedRows[1], /\bchecked\b/);
    const openRows = taskRows(await html('/projects/1?filter=Open'));
    assert.equal(openRows.length, 1);
    assert.match(openRows[0], /&lt;script&gt;/);
    const completedPage = await html('/projects/1?filter=Completed');
    assert.match(completedPage, /<option selected>Completed<\/option>/);
    assert.equal(taskRows(completedPage).length, 1);
    assert.match(taskRows(completedPage)[0], />First task<\/label>/);
    const invalidAfterCreation = await post('/projects/1/tasks', { title: ' ', filter: 'Completed' });
    assert.equal(invalidAfterCreation.status, 422);
    assert.equal(taskRows(await invalidAfterCreation.text()).length, 1);
    assert.equal(await html('/projects/1'), saved);
    const otherPage = await html('/projects/2');
    assert.equal(taskRows(otherPage).length, 1);
    assert.match(otherPage, />Other task<\/label>/);
    assert.doesNotMatch(otherPage, /First task|&lt;script&gt;/);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), saved);
    assert.equal(await html('/projects/1?filter=Completed'), completedPage);
    assert.equal(await html('/projects/2'), otherPage);
    assert.equal((await post(taskPath, { filter: 'Completed' })).status, 303);
    assert.equal(taskRows(await html('/projects/1?filter=Completed')).length, 0);
    assert.equal(await html('/projects/1'), all);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), all);
    assert.equal((await post('/projects/1/tasks', { title: 'Third task' })).status, 303);
    const finalRows = taskRows(await html('/projects/1'));
    assert.equal(finalRows.length, 3);
    assert.match(finalRows[2], />Third task<\/label>/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive and restore preserve task state, summaries, ordering, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  let server;
  try {
    const databasePath = join(directory, 'workboard.sqlite');
    // Upgrade a Task 002 database, retaining IDs and completed tasks.
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (name) VALUES ('First project'), ('Second project');
      INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Finished task', 1), (1, 'Open task', 0);
    `);
    database.close();
    server = await startServer(databasePath);
    const html = async (path) => (await fetch(`${server.baseUrl}${path}`)).text();
    const post = (path, values = {}) => fetch(`${server.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const projectRows = (content) => [...content.matchAll(/<div class="project" data-testid="project-row">[\s\S]*?<\/form>\s*<\/div>/g)]
      .map((match) => match[0]);
    const taskRows = (content) => [...content.matchAll(/<form class="task"[^>]*data-testid="task-row"[\s\S]*?<\/form>/g)]
      .map((match) => match[0]);
    const initial = await html('/');
    assert.match(initial, /<label for="project-filter">Project filter<\/label>/);
    assert.match(initial, /<option selected>Active<\/option><option>Archived<\/option>/);
    const initialRows = projectRows(initial);
    assert.equal(initialRows.length, 2);
    assert.match(initialRows[0], /First project/);
    assert.match(initialRows[0], /data-testid="project-summary">1\/2 completed/);
    assert.match(initialRows[1], /data-testid="project-summary">0\/0 completed/);
    assert.match(initialRows[0], />Archive project<\/button>/);
    assert.doesNotMatch(initial, /Restore project/);
    assert.equal(await html('/?filter=Invalid'), initial);
    assert.equal(projectRows(await html('/?filter=Archived')).length, 0);
    assert.equal((await post('/projects', { name: 'Third project' })).status, 303);
    assert.match(projectRows(await html('/'))[2], /data-testid="project-summary">0\/0 completed/);

    const archived = await post('/projects/1/archive');
    assert.equal(archived.status, 303);
    const activeList = await html('/');
    assert.equal(projectRows(activeList).length, 2);
    assert.doesNotMatch(activeList, /First project/);
    const archivedList = await html('/?filter=Archived');
    assert.match(archivedList, /<option selected>Archived<\/option>/);
    assert.equal(projectRows(archivedList).length, 1);
    assert.match(archivedList, /First project/);
    assert.match(archivedList, /data-testid="project-summary">1\/2 completed/);
    assert.match(archivedList, />Open project<\/button>/);
    assert.match(archivedList, />Restore project<\/button>/);
    assert.doesNotMatch(archivedList, />Archive project<\/button>/);
    const archivedPage = await html('/projects/1');
    assert.match(archivedPage, /<h1>First project<\/h1>/);
    assert.match(archivedPage, /<p>Archived project<\/p>/);
    assert.match(archivedPage, /<button type="submit" disabled>Create task<\/button>/);
    const rows = taskRows(archivedPage);
    assert.equal(rows.length, 2);
    assert.ok(rows.every((row) => /type="checkbox"[^>]*\bdisabled\b/.test(row)));
    assert.match(rows[0], /checked/);
    assert.doesNotMatch(rows[1], /checked/);
    assert.equal(taskRows(await html('/projects/1?filter=Open')).length, 1);
    assert.match(taskRows(await html('/projects/1?filter=Open'))[0], /Open task/);
    assert.equal(taskRows(await html('/projects/1?filter=Completed')).length, 1);
    assert.match(taskRows(await html('/projects/1?filter=Completed'))[0], /Finished task/);
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked task' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1', {})).status, 403);
    assert.equal((await post('/projects/1/tasks/2', { completed: '1' })).status, 403);
    assert.equal(await html('/projects/1'), archivedPage);
    assert.equal((await post('/projects/99999/archive')).status, 404);
    assert.equal((await post('/projects/999999999999999999999/restore')).status, 404);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await html('/'), activeList);
    assert.equal(await html('/?filter=Archived'), archivedList);
    assert.equal(await html('/projects/1'), archivedPage);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.equal(projectRows(await html('/?filter=Archived')).length, 0);
    const restoredList = await html('/');
    const restoredRows = projectRows(restoredList);
    assert.equal(restoredRows.length, 3);
    assert.match(restoredRows[0], /First project/);
    assert.match(restoredRows[1], /Second project/);
    assert.match(restoredRows[2], /Third project/);
    assert.match(restoredRows[0], /1\/2 completed/);
    const restoredPage = await html('/projects/1');
    assert.doesNotMatch(restoredPage, /Archived project|\bdisabled\b>Create task/);
    assert.ok(taskRows(restoredPage).every((row) => !/\bdisabled\b/.test(row)));
    assert.match(taskRows(restoredPage)[0], /checked/);
    assert.equal((await post('/projects/1/tasks/2', { completed: '1', filter: 'Open' })).status, 303);
    assert.equal(taskRows(await html('/projects/1?filter=Open')).length, 0);
    assert.match(projectRows(await html('/'))[0], /2\/2 completed/);
    assert.equal((await post('/projects/1/tasks', { title: 'After restore', filter: 'Completed' })).status, 303);
    assert.match(projectRows(await html('/'))[0], /2\/3 completed/);
    const finalPage = await html('/projects/1');
    const finalList = await html('/');
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await html('/'), finalList);
    assert.equal(await html('/projects/1'), finalPage);
    assert.equal(projectRows(await html('/?filter=Archived')).length, 0);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
