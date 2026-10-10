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
