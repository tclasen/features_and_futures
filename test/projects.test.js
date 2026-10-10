import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('project priority defaults migrate, affect only new tasks, and survive archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-defaults-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const oldDatabase = new DatabaseSync(databasePath);
  oldDatabase.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'Normal'
    );
    INSERT INTO projects (name) VALUES ('Existing');
    INSERT INTO tasks (project_id, title, completed, priority) VALUES
      (1, 'Existing high', 1, 'High'), (1, 'Existing normal', 0, 'Normal');
  `);
  oldDatabase.close();
  let server;
  try {
    server = await startServer(databasePath);
    const get = async path => (await fetch(server.baseUrl + path)).text();
    const post = (path, values = {}) => fetch(server.baseUrl + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const rows = body => [...body.matchAll(/<div class="task-row" data-testid="task-row">([\s\S]*?)<\/div>/g)].map(match => match[1]);
    const selected = (body, id) => body.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)<\\/select>`))[1]
      .match(/<option selected>(.*?)<\/option>/)[1];
    const defaultPriority = body => selected(body, 'default-task-priority');
    await post('/projects', { name: 'New project' });
    for (const id of [1, 2]) {
      const body = await get(`/projects/${id}`);
      assert.equal(defaultPriority(body), 'Normal');
      assert.match(body, /<label for="default-task-priority">Default task priority<\/label>/);
      assert.match(body, /<select id="default-task-priority" name="priority" onchange="this.form.requestSubmit\(\)"/);
      assert.match(body, /<option>Low<\/option><option selected>Normal<\/option><option>High<\/option>/);
    }
    const originalRows = rows(await get('/projects/1'));
    const originalListing = await get('/');
    const otherPage = await get('/projects/2');
    const filters = { filter: 'Completed', priorityFilter: 'High' };
    const filteredPath = '/projects/1?filter=Completed&priorityFilter=High';
    const matchingRows = rows(await get(filteredPath));
    for (const priority of ['Low', 'High', 'Normal', 'High']) {
      const response = await post('/projects/1/default-task-priority', { ...filters, priority });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), filteredPath);
      const body = await get(response.headers.get('location'));
      assert.equal(defaultPriority(body), priority);
      assert.equal(selected(body, 'task-filter'), 'Completed');
      assert.equal(selected(body, 'priority-filter'), 'High');
      assert.deepEqual(rows(body), matchingRows);
      assert.deepEqual(rows(await get('/projects/1')), originalRows);
      assert.equal(await get('/'), originalListing);
      assert.equal(await get('/projects/2'), otherPage);
    }
    for (const priority of ['', 'Urgent', 'high']) {
      assert.equal((await post('/projects/1/default-task-priority', { priority })).status, 400);
      assert.equal(defaultPriority(await get('/projects/1')), 'High');
    }
    assert.equal((await post('/projects/999/default-task-priority', { priority: 'Low' })).status, 404);
    await post('/projects/1/tasks', { title: '  Inherited high  ', ...filters });
    let body = await get('/projects/1');
    assert.equal(selected(body, 'task-priority-3'), 'High');
    assert.match(rows(body)[2], /<span>Inherited high<\/span>/);
    assert.doesNotMatch(rows(body)[2], / checked/);
    await post('/projects/2/default-task-priority', { priority: 'Low' });
    await post('/projects/2/tasks', { title: 'Other low' });
    assert.equal(selected(await get('/projects/2'), 'task-priority-4'), 'Low');
    assert.equal(defaultPriority(await get('/projects/1')), 'High');
    await post('/projects/1/default-task-priority', { priority: 'Low', ...filters });
    assert.deepEqual(rows(await get('/projects/1')), rows(body));
    await post('/projects/1/tasks', { title: 'Inherited low' });
    await post('/projects/1/rename', { name: 'Renamed project', ...filters });
    await post('/projects/1/tasks/3/rename', { title: 'Renamed high', ...filters });
    body = await get('/projects/1');
    assert.equal(defaultPriority(body), 'Low');
    assert.equal(selected(body, 'task-priority-3'), 'High');
    assert.equal(selected(body, 'task-priority-5'), 'Low');
    assert.deepEqual(rows(body).map(row => row.match(/<span>(.*?)<\/span>/)[1]),
      ['Existing high', 'Existing normal', 'Renamed high', 'Inherited low']);
    assert.match(await get('/'), /data-testid="project-summary">1\/4 completed/);
    const otherSavedPage = await get('/projects/2');
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), body);
    assert.equal(await get('/projects/2'), otherSavedPage);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.equal(defaultPriority(archived), 'Low');
    assert.match(archived, /<select id="default-task-priority" name="priority" disabled/);
    assert.equal((await post('/projects/1/default-task-priority', { priority: 'High', ...filters })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    assert.equal(rows(await get(filteredPath)).length, 1);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), body);
    await post('/projects/1/tasks', { title: 'After restoration' });
    assert.equal(selected(await get('/projects/1'), 'task-priority-6'), 'Low');
    assert.equal(await get('/projects/2'), otherSavedPage);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task priorities migrate, remain independent, and survive rename, archive, and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const oldDatabase = new DatabaseSync(databasePath);
  oldDatabase.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO projects (name) VALUES ('First'), ('Second');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing task', 1);
  `);
  oldDatabase.close();
  let server;
  try {
    server = await startServer(databasePath);
    const get = async path => (await fetch(server.baseUrl + path)).text();
    const post = (path, values = {}) => fetch(server.baseUrl + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const rows = body => [...body.matchAll(/<div class="task-row" data-testid="task-row">([\s\S]*?)<\/div>/g)].map(match => match[1]);
    const priorities = body => [...body.matchAll(/<select id="task-priority-\d+"[^>]*>([\s\S]*?)<\/select>/g)].map(match => match[1].trim());
    const options = selected => ['Low', 'Normal', 'High'].map(value => `<option${value === selected ? ' selected' : ''}>${value}</option>`).join('');
    await post('/projects/1/tasks', { title: 'New task' });
    await post('/projects/2/tasks', { title: 'Other task' });
    const original = await get('/projects/1');
    const listing = await get('/');
    const otherProject = await get('/projects/2');
    assert.deepEqual(priorities(original), [options('Normal'), options('Normal')]);
    for (const [index, row] of rows(original).entries()) {
      assert.match(row, new RegExp(`<label for="task-priority-${index + 1}">Task priority</label>`));
      assert.match(row, /name="priority" onchange="this.form.requestSubmit\(\)"/);
    }
    const changed = await post('/projects/1/tasks/1/priority', { priority: 'High', filter: 'Completed' });
    assert.equal(changed.status, 303);
    assert.equal(changed.headers.get('location'), '/projects/1?filter=Completed');
    const saved = await get('/projects/1');
    assert.equal(saved, original.replace(rows(original)[0], rows(original)[0].replace(options('Normal'), options('High'))));
    assert.deepEqual(priorities(await get('/projects/1?filter=Completed')), [options('High')]);
    assert.deepEqual(priorities(await get('/projects/1?filter=Open')), [options('Normal')]);
    assert.equal(await get('/'), listing);
    assert.equal(await get('/projects/2'), otherProject);
    for (const priority of ['', 'Urgent', 'high']) {
      assert.equal((await post('/projects/1/tasks/1/priority', { priority })).status, 400);
      assert.equal(await get('/projects/1'), saved);
    }
    for (const path of ['/projects/2/tasks/1/priority', '/projects/1/tasks/999/priority', '/projects/999/tasks/1/priority']) {
      assert.equal((await post(path, { priority: 'Low' })).status, 404);
    }
    await post('/projects/1/tasks/2/priority', { priority: 'Low', filter: 'Open' });
    await post('/projects/1/tasks/1/rename', { title: 'Renamed task' });
    const renamed = await get('/projects/1');
    assert.deepEqual(priorities(renamed), [options('High'), options('Low')]);
    assert.match(rows(renamed)[0], /aria-label="Complete Renamed task" checked/);
    assert.match(rows(renamed)[1], /<span>New task<\/span>/);
    assert.equal(await get('/'), listing);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), renamed);
    assert.equal(await get('/projects/2'), otherProject);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.deepEqual(priorities(archived), [options('High'), options('Low')]);
    for (const row of rows(archived)) {
      assert.match(row, /<select id="task-priority-\d+" name="priority" disabled/);
    }
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Low' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    assert.deepEqual(priorities(await get('/projects/1?filter=Completed')), [options('High')]);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), renamed);
    await post('/projects/1/tasks/1/priority', { priority: 'Normal' });
    await post('/projects/1/tasks/2', { completed: '1' });
    const final = await get('/projects/1');
    assert.deepEqual(priorities(final), [options('Normal'), options('Low')]);
    assert.match(await get('/'), /data-testid="project-summary">2\/2 completed/);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), final);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task rename preserves ownership, order, completion, filters, summaries, and persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const get = async path => (await fetch(server.baseUrl + path)).text();
    const post = (path, values = {}) => fetch(server.baseUrl + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const rows = body => [...body.matchAll(/<div class="task-row" data-testid="task-row">([\s\S]*?)<\/div>/g)].map(match => match[1]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Finished task' });
    await post('/projects/1/tasks', { title: 'Open task' });
    await post('/projects/2/tasks', { title: 'Other task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await get('/projects/1');
    const listing = await get('/');
    const otherProject = await get('/projects/2');
    assert.equal(rows(original).length, 2);
    for (const [index, row] of rows(original).entries()) {
      const taskId = index + 1;
      assert.match(row, new RegExp(`<label for="new-task-title-${taskId}">New task title</label>`));
      assert.match(row, new RegExp(`<input id="new-task-title-${taskId}" name="title" type="text" autocomplete="off">`));
      assert.match(row, /<button type="submit">Rename task<\/button>/);
    }
    for (const title of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/tasks/1/rename', { title, filter: 'Completed' });
      assert.equal(invalid.status, 400);
      const body = await invalid.text();
      assert.match(body, /role="alert">Task title is required/);
      assert.match(body, /<option selected>Completed<\/option>/);
      assert.equal(rows(body).length, 1);
      assert.match(rows(body)[0], /aria-label="Complete Finished task" checked/);
      assert.equal(await get('/projects/1'), original);
    }
    const renamed = await post('/projects/1/tasks/1/rename', {
      title: '  Renamed <task> & "notes"  ', filter: 'Completed',
    });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const savedPage = await get('/projects/1');
    const tasks = rows(savedPage);
    assert.match(tasks[0], /<span>Renamed &lt;task&gt; &amp; &quot;notes&quot;<\/span>/);
    assert.match(tasks[0], /aria-label="Complete Renamed &lt;task&gt; &amp; &quot;notes&quot;" checked/);
    assert.match(tasks[0], /action="\/projects\/1\/tasks\/1\/rename"/);
    assert.match(tasks[1], /<span>Open task<\/span>/);
    assert.equal(rows(await get('/projects/1?filter=Completed')).length, 1);
    assert.match(rows(await get('/projects/1?filter=Open'))[0], /<span>Open task<\/span>/);
    assert.equal(await get('/'), listing);
    assert.equal(await get('/projects/2'), otherProject);
    for (const path of ['/projects/2/tasks/1/rename', '/projects/1/tasks/3/rename', '/projects/1/tasks/999/rename', '/projects/999/tasks/1/rename']) {
      assert.equal((await post(path, { title: 'Forbidden' })).status, 404);
    }
    assert.equal(await get('/projects/1'), savedPage);
    assert.equal(await get('/projects/2'), otherProject);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), savedPage);
    assert.equal(await get('/'), listing);

    await post('/projects/1/archive');
    const archivedPage = await get('/projects/1');
    for (const row of rows(archivedPage)) {
      assert.match(row, /<input id="new-task-title-\d+"[^>]* disabled>/);
      assert.match(row, /<button type="submit" disabled>Rename task<\/button>/);
    }
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Forbidden' })).status, 403);
    assert.equal(await get('/projects/1'), archivedPage);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), archivedPage);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), savedPage);
    const openRename = await post('/projects/1/tasks/2/rename', { title: '  Restored title  ', filter: 'Open' });
    assert.equal(openRename.status, 303);
    assert.equal(openRename.headers.get('location'), '/projects/1?filter=Open');
    const restoredPage = await get('/projects/1');
    assert.match(rows(restoredPage)[1], /aria-label="Complete Restored title" onchange/);
    assert.match(rows(await get('/projects/1?filter=Open'))[0], /<span>Restored title<\/span>/);
    assert.equal(await get('/'), listing);
    await post('/projects/1/tasks/1');
    assert.match(rows(await get('/projects/1'))[0], /aria-label="Complete Renamed &lt;task&gt; &amp; &quot;notes&quot;" onchange/);
    assert.match(await get('/'), /data-testid="project-summary">0\/2 completed/);
    const finalPage = await get('/projects/1');
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), finalPage);
    assert.equal(await get('/projects/2'), otherProject);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('rename preserves project identity, order, tasks, archive rules, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const get = async path => (await fetch(server.baseUrl + path)).text();
    const post = (path, values = {}) => fetch(server.baseUrl + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second project' });
    await post('/projects/1/tasks', { title: 'Finished task' });
    await post('/projects/1/tasks', { title: 'Open task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await get('/projects/1');
    assert.match(original, /<label for="new-project-name">New project name<\/label>/);
    assert.match(original, /<input id="new-project-name" name="name" type="text" autocomplete="off">/);
    assert.match(original, /<button type="submit">Rename project<\/button>/);
    for (const name of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/rename', { name });
      assert.equal(invalid.status, 400);
      const body = await invalid.text();
      assert.match(body, /role="alert">Project name is required/);
      assert.match(body, /<h1>Original<\/h1>/);
      assert.equal(await get('/projects/1'), original);
    }
    const renamed = await post('/projects/1/rename', { name: '  Renamed <project> & "notes"  ', filter: 'Open' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Open');
    const savedPage = await get('/projects/1');
    assert.match(savedPage, /<h1>Renamed &lt;project&gt; &amp; &quot;notes&quot;<\/h1>/);
    // Only the title and heading change; task markup, IDs, state, and forms stay identical.
    assert.equal(savedPage, original.replaceAll('Original', 'Renamed &lt;project&gt; &amp; &quot;notes&quot;'));
    const listing = await get('/');
    assert.ok(listing.indexOf('Renamed &lt;project&gt;') < listing.indexOf('Second project'));
    assert.match(listing, /data-testid="project-summary">1\/2 completed/);
    assert.deepEqual([...listing.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]), ['/projects/1', '/projects/2']);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), savedPage);
    assert.equal(await get('/'), listing);

    await post('/projects/1/archive');
    const archivedPage = await get('/projects/1');
    assert.match(archivedPage, /<input id="new-project-name"[^>]* disabled>/);
    assert.match(archivedPage, /<button type="submit" disabled>Rename project<\/button>/);
    assert.equal((await post('/projects/1/rename', { name: 'Forbidden' })).status, 403);
    assert.equal(await get('/projects/1'), archivedPage);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), archivedPage);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), savedPage);
    assert.equal((await post('/projects/1/rename', { name: 'Restored name' })).status, 303);
    const restoredPage = await get('/projects/1');
    assert.match(restoredPage, /<h1>Restored name<\/h1>/);
    assert.match(restoredPage, /aria-label="Complete Finished task" checked/);
    assert.match(restoredPage, /aria-label="Complete Open task" onchange/);
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), restoredPage);
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

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

test('combined filters preserve selections, re-evaluate edits, and work after archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-filters-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const get = async path => (await fetch(server.baseUrl + path)).text();
    const post = (path, values = {}) => fetch(server.baseUrl + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const titles = body => [...body.matchAll(/<span>(.*?)<\/span>/g)].map(match => match[1]);
    const selected = (body, id) => body.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)<\\/select>`))[1]
      .match(/<option selected>(.*?)<\/option>/)[1];
    await post('/projects', { name: 'Filters' });
    await post('/projects', { name: 'Other' });
    const tasks = [];
    for (const priority of ['Low', 'Normal', 'High']) {
      for (const completed of [false, true]) {
        const id = tasks.length + 1;
        const title = `${priority} ${completed ? 'done' : 'open'}`;
        await post('/projects/1/tasks', { title });
        await post(`/projects/1/tasks/${id}/priority`, { priority });
        if (completed) await post(`/projects/1/tasks/${id}`, { completed: '1' });
        tasks.push({ id, title, priority, completed });
      }
    }
    const summary = await get('/');
    const initialPage = await get('/projects/1');
    assert.equal(selected(initialPage, 'priority-filter'), 'All');
    assert.match(initialPage, /<label for="priority-filter">Priority filter<\/label>/);
    assert.match(initialPage, /<option selected>All<\/option><option>Low<\/option><option>Normal<\/option><option>High<\/option>/);
    const filterForm = initialPage.match(/<form class="task-filter"[\s\S]*?<\/form>/)[0];
    assert.match(filterForm, /name="filter" onchange="this.form.requestSubmit\(\)"/);
    assert.match(filterForm, /name="priorityFilter" onchange="this.form.requestSubmit\(\)"/);
    for (const filter of ['All', 'Open', 'Completed']) {
      for (const priorityFilter of ['All', 'Low', 'Normal', 'High']) {
        const body = await get(`/projects/1?filter=${filter}&priorityFilter=${priorityFilter}`);
        assert.equal(selected(body, 'task-filter'), filter);
        assert.equal(selected(body, 'priority-filter'), priorityFilter);
        assert.deepEqual(titles(body), tasks.filter(task =>
          (filter === 'All' || task.completed === (filter === 'Completed')) &&
          (priorityFilter === 'All' || task.priority === priorityFilter)).map(task => task.title));
      }
    }
    assert.equal(await get('/'), summary);
    const selection = { filter: 'Open', priorityFilter: 'High' };
    const filteredPath = '/projects/1?filter=Open&priorityFilter=High';
    const filteredPage = await get(filteredPath);
    // Every editing form carries both selections through its submission.
    for (const match of filteredPage.matchAll(/<form[^>]*method="post"[\s\S]*?<\/form>/g)) {
      assert.match(match[0], /name="filter" value="Open"/);
      assert.match(match[0], /name="priorityFilter" value="High"/);
    }
    for (const [path, values, alert] of [
      ['/projects/1/tasks/5/rename', { title: '  ' }, 'Task title is required'],
      ['/projects/1/tasks/5/priority', { priority: 'invalid' }, 'Invalid task priority'],
      ['/projects/1/tasks', { title: '  ' }, 'Task title is required'],
      ['/projects/1/rename', { name: '  ' }, 'Project name is required'],
    ]) {
      const response = await post(path, { ...selection, ...values });
      assert.equal(response.status, 400);
      const body = await response.text();
      assert.ok(body.includes(`role="alert">${alert}`));
      assert.equal(selected(body, 'task-filter'), 'Open');
      assert.equal(selected(body, 'priority-filter'), 'High');
      assert.deepEqual(titles(body), ['High open']);
    }
    const renamed = await post('/projects/1/tasks/5/rename', { ...selection, title: '  Renamed high  ' });
    assert.equal(renamed.headers.get('location'), filteredPath);
    let body = await get(filteredPath);
    assert.deepEqual(titles(body), ['Renamed high']);
    assert.equal(selected(body, 'task-priority-5'), 'High');
    assert.match(body, /aria-label="Complete Renamed high"/);
    assert.equal(await get('/'), summary);
    const changedPriority = await post('/projects/1/tasks/5/priority', { ...selection, priority: 'Low' });
    assert.equal(changedPriority.headers.get('location'), filteredPath);
    body = await get(filteredPath);
    assert.deepEqual(titles(body), []);
    assert.equal(selected(body, 'task-filter'), 'Open');
    assert.equal(selected(body, 'priority-filter'), 'High');
    assert.equal(await get('/'), summary);
    assert.deepEqual(titles(await get('/projects/1?filter=Open&priorityFilter=Low')), ['Low open', 'Renamed high']);
    const completed = await post('/projects/1/tasks/1', { filter: 'Open', priorityFilter: 'Low', completed: '1' });
    assert.equal(completed.headers.get('location'), '/projects/1?filter=Open&priorityFilter=Low');
    assert.deepEqual(titles(await get(completed.headers.get('location'))), ['Renamed high']);
    const reopened = await post('/projects/1/tasks/2', { filter: 'Completed', priorityFilter: 'Low' });
    assert.equal(reopened.headers.get('location'), '/projects/1?filter=Completed&priorityFilter=Low');
    assert.deepEqual(titles(await get(reopened.headers.get('location'))), ['Low open']);
    assert.equal(await get('/'), summary);
    assert.deepEqual(titles(await get('/projects/2')), []);
    const savedPage = await get('/projects/1?filter=Open&priorityFilter=Low');
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1?filter=Open&priorityFilter=Low'), savedPage);
    assert.equal(selected(await get('/projects/1'), 'priority-filter'), 'All');
    await post('/projects/1/archive');
    const archived = await get('/projects/1?filter=Open&priorityFilter=Low');
    assert.deepEqual(titles(archived), ['Low done', 'Renamed high']);
    assert.match(archived, /<select id="task-filter" name="filter" onchange/);
    assert.match(archived, /<select id="priority-filter" name="priorityFilter" onchange/);
    assert.equal((archived.match(/<select id="task-priority-\d+" name="priority" disabled/g) || []).length, 2);
    assert.equal((await post('/projects/1/tasks/5/priority', { ...selection, priority: 'High' })).status, 403);
    assert.deepEqual(titles(await get('/projects/1?filter=Completed&priorityFilter=High')), ['High done']);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1?filter=Open&priorityFilter=Low'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1?filter=Open&priorityFilter=Low'), savedPage);
    assert.equal(await get('/'), summary);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
