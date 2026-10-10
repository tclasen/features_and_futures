import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const url = await new Promise((resolveUrl, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server did not start: ${errors}`));
    }, 5000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => {
      clearTimeout(timer);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = /listening on port (\d+)/.exec(output);
      if (match) {
        clearTimeout(timer);
        resolveUrl(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  return {
    url,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects validate names, preserve order, open, and survive restarts', async () => {
  const directory = await mkdtemp(resolve('.workboard-test-'));
  const databasePath = resolve(directory, 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const initial = await (await fetch(server.url)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, /id="project-name" name="name" type="text"/);
    assert.match(initial, />Create project<\/button>/);
    assert.equal((initial.match(/data-testid="project-row"/g) || []).length, 0);

    const create = name => fetch(`${server.url}/projects`, {
      method: 'POST',
      body: new URLSearchParams({ name }),
      redirect: 'manual',
    });
    for (const name of ['', '  \t\n ']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert"[^>]*>Project name is required/);
      assert.equal((html.match(/data-testid="project-row"/g) || []).length, 0);
    }

    for (const name of ['  First project  ', '<Second & "project">']) {
      const created = await create(name);
      assert.equal(created.status, 303);
      assert.equal(created.headers.get('location'), '/');
    }
    const list = await (await fetch(server.url)).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(list, /<span class="project-name">First project<\/span>/);
    assert.match(list, /&lt;Second &amp; &quot;project&quot;&gt;/);
    assert.ok(list.indexOf('First project') < list.indexOf('&lt;Second'));
    const paths = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    assert.notEqual(paths[0], paths[1]);
    const detail = await (await fetch(`${server.url}${paths[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /<form action="\/" method="get"><button[^>]*>Projects<\/button>/);
    assert.equal((await fetch(`${server.url}/projects/999999`)).status, 404);

    const invalidAfterCreation = await create('   ');
    assert.equal((await invalidAfterCreation.text()).match(/data-testid="project-row"/g).length, 2);
    assert.equal(await (await fetch(server.url)).text(), list);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await (await fetch(server.url)).text(), list);
    assert.equal(await (await fetch(`${server.url}${paths[0]}`)).text(), detail);
    const secondDetail = await (await fetch(`${server.url}${paths[1]}`)).text();
    assert.match(secondDetail, /<h1>&lt;Second &amp; &quot;project&quot;&gt;<\/h1>/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate titles, filter by completion, stay in their project, and survive restarts', async () => {
  const directory = await mkdtemp(resolve('.workboard-test-'));
  const databasePath = resolve(directory, 'tasks.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values) => fetch(`${server.url}${path}`, {
      method: 'POST',
      body: new URLSearchParams(values),
      redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const rowCount = html => (html.match(/data-testid="task-row"/g) || []).length;
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const initial = await get('/projects/1');
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, /id="task-title" name="title" type="text"/);
    assert.match(initial, />Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    assert.equal(rowCount(initial), 0);

    for (const title of ['', '  \t\n ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert"[^>]*>Task title is required/);
      assert.equal(rowCount(html), 0);
    }
    for (const title of ['  First task  ', '<Second & "task">']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/projects/1');
    }
    await post('/projects/2/tasks', { title: 'Other project task' });
    const allOpen = await get('/projects/1');
    assert.equal(rowCount(allOpen), 2);
    assert.match(allOpen, /<span class="task-title">First task<\/span>/);
    assert.match(allOpen, /aria-label="Complete First task" data-submit-on-change/);
    assert.match(allOpen, /aria-label="Complete &lt;Second &amp; &quot;task&quot;&gt;"/);
    assert.ok(allOpen.indexOf('First task') < allOpen.indexOf('&lt;Second'));
    assert.doesNotMatch(allOpen, / checked|Other project task/);
    assert.equal(rowCount(await get('/projects/1?filter=Open')), 2);
    assert.equal(rowCount(await get('/projects/1?filter=Completed')), 0);
    const other = await get('/projects/2');
    assert.equal(rowCount(other), 1);
    assert.doesNotMatch(other, /First task|&lt;Second/);

    const invalid = await post('/projects/1/tasks', { title: '  ' });
    assert.equal(rowCount(await invalid.text()), 2);
    assert.equal(await get('/projects/1'), allOpen);
    assert.equal((await post('/projects/999/tasks', { title: 'Missing' })).status, 404);
    assert.equal((await post('/projects/2/tasks/1/completion', { completed: '1' })).status, 404);
    assert.equal(await get('/projects/1'), allOpen);

    const completed = await post('/projects/1/tasks/1/completion', { completed: '1', filter: 'Open' });
    assert.equal(completed.status, 303);
    assert.equal(completed.headers.get('location'), '/projects/1?filter=Open');
    const all = await get('/projects/1');
    assert.equal(rowCount(all), 2);
    assert.match(all, /aria-label="Complete First task" checked/);
    const open = await get('/projects/1?filter=Open');
    assert.equal(rowCount(open), 1);
    assert.doesNotMatch(open, /First task/);
    assert.match(open, /<option selected>Open<\/option>/);
    const done = await get('/projects/1?filter=Completed');
    assert.equal(rowCount(done), 1);
    assert.match(done, /Complete First task/);
    assert.doesNotMatch(done, /&lt;Second/);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), all);
    assert.equal(await get('/projects/1?filter=Open'), open);
    assert.equal(await get('/projects/1?filter=Completed'), done);
    assert.equal(await get('/projects/2'), other);
    assert.equal((await post('/projects/1/tasks/1/completion', {})).status, 303);
    assert.equal(await get('/projects/1'), allOpen);
    assert.equal(rowCount(await get('/projects/1?filter=Completed')), 0);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), allOpen);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archives preserve tasks and summaries, block edits, filter, and restore across restarts', async () => {
  const directory = await mkdtemp(resolve('.workboard-test-'));
  const databasePath = resolve(directory, 'archives.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const rows = html => [...html.matchAll(/data-testid="project-row">([\s\S]*?)<\/div>/g)].map(match => match[1]);
    const tasks = html => (html.match(/data-testid="task-row"/g) || []).length;
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const empty = await get('/');
    assert.match(empty, /<label for="project-filter">Project filter<\/label>/);
    assert.match(empty, /<option selected>Active<\/option><option>Archived<\/option>/);
    for (const row of rows(empty)) {
      assert.match(row, /data-testid="project-summary">0\/0 completed/);
      assert.match(row, />Archive project<\/button>/);
      assert.doesNotMatch(row, /Restore project/);
    }
    await post('/projects/1/tasks', { title: 'Finished' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1/completion', { completed: '1' });
    assert.match(rows(await get('/'))[0], /data-testid="project-summary">1\/2 completed/);
    await get('/projects/1?filter=Open');
    assert.match(rows(await get('/'))[0], /data-testid="project-summary">1\/2 completed/);
    const archive = await post('/projects/1/archive');
    assert.equal(archive.status, 303);
    const active = await get('/');
    assert.equal(rows(active).length, 1);
    assert.match(rows(active)[0], /Second/);
    const archived = await get('/?filter=Archived');
    assert.match(archived, /<option selected>Archived<\/option>/);
    assert.equal(rows(archived).length, 1);
    assert.match(rows(archived)[0], /First/);
    assert.match(rows(archived)[0], /data-testid="project-summary">1\/2 completed/);
    assert.match(rows(archived)[0], />Open project<\/button>/);
    assert.match(rows(archived)[0], />Restore project<\/button>/);
    assert.doesNotMatch(rows(archived)[0], /Archive project/);
    const detail = await get('/projects/1');
    assert.match(detail, /<p>Archived project<\/p>/);
    assert.match(detail, /<button type="submit" disabled>Create task<\/button>/);
    assert.equal(tasks(detail), 2);
    const checkboxes = [...detail.matchAll(/<input type="checkbox"[^>]*>/g)].map(match => match[0]);
    assert.equal(checkboxes.length, 2);
    assert.ok(checkboxes.every(checkbox => checkbox.includes(' disabled')));
    assert.match(checkboxes[0], /checked/);
    assert.doesNotMatch(checkboxes[1], /checked/);
    const open = await get('/projects/1?filter=Open');
    const completed = await get('/projects/1?filter=Completed');
    assert.equal(tasks(open), 1);
    assert.match(open, /Complete Pending/);
    assert.equal(tasks(completed), 1);
    assert.match(completed, /Complete Finished/);
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1/completion')).status, 403);
    assert.equal(await get('/projects/1'), detail);
    assert.equal(await get('/?filter=Archived'), archived);
    assert.equal((await post('/projects/999/archive')).status, 404);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/'), active);
    assert.equal(await get('/?filter=Archived'), archived);
    assert.equal(await get('/projects/1'), detail);
    assert.equal(await get('/projects/1?filter=Open'), open);
    assert.equal(await get('/projects/1?filter=Completed'), completed);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.equal(rows(await get('/?filter=Archived')).length, 0);
    const restored = await get('/');
    assert.equal(rows(restored).length, 2);
    assert.match(rows(restored)[0], /First/);
    assert.match(rows(restored)[0], /1\/2 completed/);
    assert.match(rows(restored)[1], /Second/);
    const restoredDetail = await get('/projects/1');
    assert.doesNotMatch(restoredDetail, /disabled|Archived project/);
    assert.match(restoredDetail, /Complete Finished" checked/);
    assert.equal(tasks(restoredDetail), 2);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/'), restored);
    assert.equal(await get('/projects/1'), restoredDetail);
    assert.equal((await post('/projects/1/tasks/1/completion')).status, 303);
    assert.match(rows(await get('/'))[0], /0\/2 completed/);
    assert.equal((await post('/projects/1/tasks', { title: 'After restoration' })).status, 303);
    assert.match(rows(await get('/'))[0], /0\/3 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('renames preserve identity, order, tasks and summaries, validate names, and respect archives', async () => {
  const directory = await mkdtemp(resolve('.workboard-test-'));
  const databasePath = resolve(directory, 'renames.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const taskRows = html => [...html.matchAll(/data-testid="task-row">([\s\S]*?)<\/div>/g)].map(match => match[1]);
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1/completion', { completed: '1' });
    const initial = await get('/projects/1');
    const initialList = await get('/');
    assert.match(initial, /<label for="new-project-name">New project name<\/label>/);
    assert.match(initial, /<input id="new-project-name" name="name" type="text" autocomplete="off">/);
    assert.match(initial, /<button type="submit">Rename project<\/button>/);
    for (const name of ['', '  \t\n ']) {
      const invalid = await post('/projects/1/rename', { name, filter: 'Completed' });
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert"[^>]*>Project name is required/);
      assert.match(html, /<h1>Original<\/h1>/);
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.equal(await get('/projects/1'), initial);
      assert.equal(await get('/'), initialList);
    }
    const renamed = await post('/projects/1/rename', { name: '  <Renamed & "project">  ', filter: 'Open' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Open');
    const detail = await get('/projects/1');
    const list = await get('/');
    assert.match(detail, /<h1>&lt;Renamed &amp; &quot;project&quot;&gt;<\/h1>/);
    assert.deepEqual(taskRows(detail), taskRows(initial));
    assert.equal(list, initialList.replace('Original', '&lt;Renamed &amp; &quot;project&quot;&gt;'));
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), detail);
    assert.equal(await get('/'), list);

    await post('/projects/1/archive');
    const archivedDetail = await get('/projects/1');
    assert.match(archivedDetail, /<input id="new-project-name"[^>]* disabled>/);
    assert.match(archivedDetail, /<button type="submit" disabled>Rename project<\/button>/);
    const archivedList = await get('/?filter=Archived');
    assert.equal((await post('/projects/1/rename', { name: 'Blocked' })).status, 403);
    assert.equal(await get('/projects/1'), archivedDetail);
    assert.equal(await get('/?filter=Archived'), archivedList);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), archivedDetail);
    assert.equal(await get('/?filter=Archived'), archivedList);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), detail);
    assert.equal(await get('/'), list);
    const restoredRename = await post('/projects/1/rename', { name: '  Restored name  ' });
    assert.equal(restoredRename.status, 303);
    assert.equal(restoredRename.headers.get('location'), '/projects/1');
    const restored = await get('/projects/1');
    assert.match(restored, /<h1>Restored name<\/h1>/);
    assert.deepEqual(taskRows(restored), taskRows(initial));
    assert.equal(await get('/'), initialList.replace('Original', 'Restored name'));
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), restored);
    assert.equal(await get('/'), initialList.replace('Original', 'Restored name'));
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task renames preserve completion, ownership and order, validate titles, and respect archives across restarts', async () => {
  const directory = await mkdtemp(resolve('.workboard-test-'));
  const databasePath = resolve(directory, 'task-renames.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const rows = html => [...html.matchAll(/data-testid="task-row">([\s\S]*?)<\/div>/g)].map(match => match[1]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/2/tasks', { title: 'Other task' });
    await post('/projects/1/tasks/1/completion', { completed: '1' });
    const initial = await get('/projects/1');
    const initialList = await get('/');
    const other = await get('/projects/2');
    const initialRows = rows(initial);
    assert.equal(initialRows.length, 2);
    for (const [index, row] of initialRows.entries()) {
      const id = index + 1;
      assert.match(row, new RegExp(`<label for="new-task-title-${id}">New task title</label>`));
      assert.match(row, new RegExp(`<input id="new-task-title-${id}" name="title" type="text" autocomplete="off">`));
      assert.match(row, /<button type="submit">Rename task<\/button>/);
    }
    for (const title of ['', '  \t\n ']) {
      const invalid = await post('/projects/1/tasks/1/rename', { title, filter: 'Completed' });
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert"[^>]*>Task title is required/);
      assert.match(html, /Complete Done" checked/);
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.equal(await get('/projects/1'), initial);
      assert.equal(await get('/'), initialList);
    }
    for (const path of ['/projects/2/tasks/1/rename', '/projects/1/tasks/3/rename', '/projects/1/tasks/999/rename', '/projects/999/tasks/1/rename']) {
      assert.equal((await post(path, { title: 'Wrong project or missing task' })).status, 404);
    }
    assert.equal(await get('/projects/1'), initial);
    assert.equal(await get('/projects/2'), other);

    const renamed = await post('/projects/1/tasks/1/rename', { title: '  <Finished & "task">  ', filter: 'Completed' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const renamedOpen = await post('/projects/1/tasks/2/rename', { title: '  Still open  ', filter: 'Open' });
    assert.equal(renamedOpen.status, 303);
    assert.equal(renamedOpen.headers.get('location'), '/projects/1?filter=Open');
    const detail = await get('/projects/1');
    const renamedRows = rows(detail);
    assert.equal(renamedRows.length, 2);
    assert.match(renamedRows[0], /<span class="task-title">&lt;Finished &amp; &quot;task&quot;&gt;<\/span>/);
    assert.match(renamedRows[0], /aria-label="Complete &lt;Finished &amp; &quot;task&quot;&gt;" checked/);
    assert.match(renamedRows[0], /action="\/projects\/1\/tasks\/1\/rename"/);
    assert.match(renamedRows[1], /<span class="task-title">Still open<\/span>/);
    assert.match(renamedRows[1], /aria-label="Complete Still open" data-submit-on-change/);
    assert.match(renamedRows[1], /action="\/projects\/1\/tasks\/2\/rename"/);
    assert.doesNotMatch(detail, /Complete Done|Complete Pending/);
    const open = await get('/projects/1?filter=Open');
    const completed = await get('/projects/1?filter=Completed');
    assert.equal(rows(open).length, 1);
    assert.match(open, /Complete Still open/);
    assert.equal(rows(completed).length, 1);
    assert.match(completed, /Complete &lt;Finished/);
    assert.equal(await get('/'), initialList);
    assert.equal(await get('/projects/2'), other);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), detail);
    assert.equal(await get('/projects/1?filter=Open'), open);
    assert.equal(await get('/projects/1?filter=Completed'), completed);
    assert.equal(await get('/'), initialList);
    assert.equal(await get('/projects/2'), other);

    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    const archivedList = await get('/?filter=Archived');
    for (const row of rows(archived)) {
      assert.match(row, /<input id="new-task-title-\d+"[^>]* disabled>/);
      assert.match(row, /<button type="submit" disabled>Rename task<\/button>/);
    }
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Blocked' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    assert.equal(await get('/?filter=Archived'), archivedList);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), archived);
    assert.equal(await get('/?filter=Archived'), archivedList);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), detail);
    assert.equal(await get('/'), initialList);
    const restoredRename = await post('/projects/1/tasks/1/rename', { title: '  Restored task  ' });
    assert.equal(restoredRename.status, 303);
    assert.equal(restoredRename.headers.get('location'), '/projects/1');
    const restored = await get('/projects/1');
    assert.match(rows(restored)[0], /Complete Restored task" checked/);
    assert.doesNotMatch(restored, /disabled/);
    assert.equal(await get('/'), initialList);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), restored);
    assert.equal(await get('/'), initialList);
    assert.equal(await get('/projects/2'), other);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('existing databases gain archive state without changing project IDs or tasks', async () => {
  const directory = await mkdtemp(resolve('.workboard-test-'));
  const databasePath = resolve(directory, 'legacy.sqlite');
  let server;
  try {
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)));
      INSERT INTO projects (id, name) VALUES (7, 'Existing project');
      INSERT INTO tasks (id, project_id, title, completed) VALUES (9, 7, 'Existing task', 1);
    `);
    database.close();
    server = await startServer(databasePath);
    const list = await (await fetch(server.url)).text();
    assert.match(list, /Existing project/);
    assert.match(list, /action="\/projects\/7"/);
    assert.match(list, /data-testid="project-summary">1\/1 completed/);
    assert.match(list, />Archive project<\/button>/);
    const detail = await (await fetch(`${server.url}/projects/7`)).text();
    assert.match(detail, /Complete Existing task" checked/);
    assert.match(detail, /\/tasks\/9\/completion/);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await (await fetch(server.url)).text(), list);
    assert.equal(await (await fetch(`${server.url}/projects/7`)).text(), detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
