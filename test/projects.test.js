import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';

async function startServer(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const base = await new Promise((resolveBase, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server did not start: ${errors}`));
    }, 5000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', chunk => {
      const match = /listening on port (\d+)/.exec(String(chunk));
      if (match) {
        clearTimeout(timeout);
        resolveBase(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  return {
    base,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('task renaming preserves ownership, order, completion and filters across restarts and restoration', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'task-rename-test-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(dbPath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const rows = page => [...page.matchAll(/<div data-testid="task-row"[\s\S]*?<\/div>/g)].map(match => match[0]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Original completed task' });
    await post('/projects/1/tasks', { title: 'Original open task' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await html('/projects/1');
    for (const row of rows(original)) {
      assert.match(row, /<label for="new-task-title-\d+">New task title<\/label>/);
      assert.match(row, /<input id="new-task-title-\d+"[^>]*type="text"/);
      assert.match(row, /<button type="submit">Rename task<\/button>/);
    }
    for (const title of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/tasks/1/rename', { title, filter: 'Completed' });
      assert.equal(invalid.status, 400);
      const page = await invalid.text();
      assert.match(page, /role="alert"[^>]*>Task title is required/);
      assert.equal(rows(page).length, 1);
      assert.match(rows(page)[0], /Original completed task/);
      assert.equal(await html('/projects/1'), original);
    }
    assert.equal((await post('/projects/2/tasks/1/rename', { title: 'Wrong owner' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/rename', { title: 'Missing task' })).status, 404);
    assert.equal((await post('/projects/999/tasks/1/rename', { title: 'Missing project' })).status, 404);
    const summary = await html('/');
    const renamed = await post('/projects/1/tasks/1/rename', {
      title: '  Renamed <task> & "review"  ', filter: 'Completed',
    });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const renamedOpen = await post('/projects/1/tasks/2/rename', { title: '  Renamed open task  ', filter: 'Open' });
    assert.equal(renamedOpen.headers.get('location'), '/projects/1?filter=Open');
    const savedPage = await html('/projects/1');
    const tasks = rows(savedPage);
    assert.equal(tasks.length, 2);
    assert.match(tasks[0], /<span>Renamed &lt;task&gt; &amp; &quot;review&quot;<\/span>/);
    assert.match(tasks[0], /aria-label="Complete Renamed &lt;task&gt; &amp; &quot;review&quot;" checked/);
    assert.match(tasks[0], /action="\/projects\/1\/tasks\/1\/rename"/);
    assert.match(tasks[1], /<span>Renamed open task<\/span>/);
    assert.doesNotMatch(tasks[1], / checked/);
    assert.doesNotMatch(savedPage, /Original completed task|Original open task/);
    assert.deepEqual(rows(await html('/projects/1?filter=Completed')), [tasks[0].replaceAll('value="All"', 'value="Completed"')]);
    assert.deepEqual(rows(await html('/projects/1?filter=Open')), [tasks[1].replaceAll('value="All"', 'value="Open"')]);
    const otherPage = await html('/projects/2');
    assert.match(otherPage, /Other project task/);
    assert.doesNotMatch(otherPage, /Renamed/);
    assert.equal(await html('/'), summary);
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/1'), savedPage);
    assert.equal(await html('/projects/2'), otherPage);
    assert.equal(await html('/'), summary);
    await post('/projects/1/archive');
    const archivedPage = await html('/projects/1');
    for (const row of rows(archivedPage)) {
      assert.match(row, /<input id="new-task-title-\d+"[^>]* disabled>/);
      assert.match(row, /<button type="submit" disabled>Rename task<\/button>/);
    }
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Forbidden' })).status, 403);
    assert.equal(await html('/projects/1'), archivedPage);
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/1'), archivedPage);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), savedPage);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'After restore' })).status, 303);
    const restoredPage = await html('/projects/1');
    assert.match(rows(restoredPage)[0], /aria-label="Complete After restore" checked/);
    assert.equal(await html('/'), summary);
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/1'), restoredPage);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('projects validate, navigate, and persist in creation order across restarts', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'project-test-'));
  const dbPath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(dbPath);
    const health = await fetch(`${server.base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const initial = await (await fetch(server.base)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);

    async function create(name) {
      return fetch(`${server.base}/projects`, {
        method: 'POST',
        body: new URLSearchParams({ name }),
        redirect: 'manual',
      });
    }
    for (const name of ['', ' \t\n ']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert"[^>]*>Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    const first = await create('  First project  ');
    assert.equal(first.status, 303);
    assert.equal(first.headers.get('location'), '/');
    assert.equal((await create('Second <project> & "friends"')).status, 303);
    const list = await (await fetch(server.base)).text();
    assert.equal((list.match(/data-testid="project-row"/g) ?? []).length, 2);
    assert.match(list, /<span>First project<\/span>/);
    assert.match(list, /Second &lt;project&gt; &amp; &quot;friends&quot;/);
    assert.ok(list.indexOf('First project') < list.indexOf('Second &lt;project&gt;'));
    const paths = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    assert.notEqual(paths[0], paths[1]);

    const detail = await (await fetch(`${server.base}${paths[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /<form method="get" action="\/">.*>Projects<\/button>/);
    const invalidAfterCreate = await create('   ');
    assert.equal(((await invalidAfterCreate.text()).match(/data-testid="project-row"/g) ?? []).length, 2);
    assert.equal((await fetch(`${server.base}/projects/9999`)).status, 404);

    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await (await fetch(server.base)).text(), list);
    assert.equal(await (await fetch(`${server.base}${paths[0]}`)).text(), detail);
    assert.equal((await create('Third project')).status, 303);
    const restartedList = await (await fetch(server.base)).text();
    assert.equal((restartedList.match(/data-testid="project-row"/g) ?? []).length, 3);
    assert.ok(restartedList.indexOf('Second &lt;project&gt;') < restartedList.indexOf('Third project'));
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, isolate projects, and persist completion across restarts', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'task-test-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(dbPath);
    const post = (path, values) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const rows = page => [...page.matchAll(/<div data-testid="task-row"[\s\S]*?<\/div>/g)].map(match => match[0]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const initial = await html('/projects/1');
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, />Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    assert.equal(rows(initial).length, 0);
    for (const title of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/tasks', { title });
      assert.equal(invalid.status, 400);
      const page = await invalid.text();
      assert.match(page, /role="alert"[^>]*>Task title is required/);
      assert.equal(rows(page).length, 0);
    }
    const created = await post('/projects/1/tasks', { title: '  First task  ' });
    assert.equal(created.status, 303);
    assert.equal(created.headers.get('location'), '/projects/1');
    await post('/projects/1/tasks', { title: 'Second <task> & "review"' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    let tasks = rows(await html('/projects/1'));
    assert.equal(tasks.length, 2);
    assert.match(tasks[0], /<span>First task<\/span>/);
    assert.match(tasks[0], /aria-label="Complete First task"/);
    assert.match(tasks[1], /aria-label="Complete Second &lt;task&gt; &amp; &quot;review&quot;"/);
    assert.ok(tasks.every(row => !row.includes(' checked')));
    assert.doesNotMatch(await html('/projects/1'), /Other project task/);
    const otherTasks = rows(await html('/projects/2'));
    assert.equal(otherTasks.length, 1);
    assert.match(otherTasks[0], /Other project task/);
    const firstAction = /action="([^"]+)"/.exec(tasks[0])[1];
    const wrongProjectAction = firstAction.replace('/projects/1/', '/projects/2/');
    assert.equal((await post(wrongProjectAction, { completed: '1' })).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Missing project' })).status, 404);
    assert.equal((await post(firstAction, { completed: '1' })).status, 303);
    tasks = rows(await html('/projects/1'));
    assert.match(tasks[0], / checked/);
    assert.doesNotMatch(tasks[1], / checked/);
    const open = rows(await html('/projects/1?filter=Open'));
    const completed = rows(await html('/projects/1?filter=Completed'));
    assert.equal(open.length, 1);
    assert.match(open[0], /Second &lt;task&gt;/);
    assert.equal(completed.length, 1);
    assert.match(completed[0], /First task/);
    assert.equal(rows(await html('/projects/1?filter=invalid')).length, 2);
    const invalid = await post('/projects/1/tasks', { title: '   ' });
    assert.equal(rows(await invalid.text()).length, 2);
    const savedPage = await html('/projects/1');
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/1'), savedPage);
    assert.equal(rows(await html('/projects/1?filter=Completed')).length, 1);
    const unchecked = await post(firstAction, { filter: 'Completed' });
    assert.equal(unchecked.status, 303);
    assert.equal(unchecked.headers.get('location'), '/projects/1?filter=Completed');
    assert.equal(rows(await html('/projects/1?filter=Completed')).length, 0);
    assert.equal(rows(await html('/projects/1?filter=Open')).length, 2);
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.ok(rows(await html('/projects/1')).every(row => !row.includes(' checked')));
    assert.equal(rows(await html('/projects/2')).length, 1);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});


test('existing projects migrate, archive and restore with persistent summaries and protected tasks', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'archive-test-'));
  const dbPath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
    );
    INSERT INTO projects (name) VALUES ('Existing project');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Finished task', 1), (1, 'Open task', 0);
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(dbPath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const tasks = page => [...page.matchAll(/<div data-testid="task-row"[\s\S]*?<\/div>/g)].map(match => match[0]);
    await post('/projects', { name: 'New project' });
    const initial = await html('/');
    assert.match(initial, /<label for="project-filter">Project filter<\/label>/);
    assert.match(initial, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(initial, /data-testid="project-summary">1\/2 completed/);
    assert.match(initial, /data-testid="project-summary">0\/0 completed/);
    assert.ok(initial.indexOf('Existing project') < initial.indexOf('New project'));
    assert.match(initial, />Archive project<\/button>/);
    assert.doesNotMatch(initial, />Restore project<\/button>/);
    assert.equal((await post('/projects/999/archive')).status, 404);
    assert.equal((await post('/projects/1/archive')).status, 303);
    assert.doesNotMatch(await html('/'), /Existing project/);
    const archivedList = await html('/?filter=Archived');
    assert.match(archivedList, /Existing project/);
    assert.doesNotMatch(archivedList, /New project/);
    assert.match(archivedList, />Open project<\/button>/);
    assert.match(archivedList, />Restore project<\/button>/);
    assert.doesNotMatch(archivedList, />Archive project<\/button>/);
    assert.match(archivedList, /data-testid="project-summary">1\/2 completed/);
    const archivedPage = await html('/projects/1');
    assert.match(archivedPage, /Archived project/);
    assert.match(archivedPage, /<button type="submit" disabled>Create task/);
    assert.equal(tasks(archivedPage).length, 2);
    assert.ok(tasks(archivedPage).every(row => /type="checkbox"[\s\S]*? disabled/.test(row)));
    assert.match(tasks(archivedPage)[0], / checked/);
    assert.equal(tasks(await html('/projects/1?filter=Open')).length, 1);
    assert.match(tasks(await html('/projects/1?filter=Open'))[0], /Open task/);
    assert.equal(tasks(await html('/projects/1?filter=Completed')).length, 1);
    assert.equal((await post('/projects/1/tasks', { title: 'Forbidden' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1', {})).status, 403);
    assert.equal((await post('/projects/1/tasks/2', { completed: '1' })).status, 403);
    assert.equal(await html('/projects/1'), archivedPage);
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/?filter=Archived'), archivedList);
    assert.equal(await html('/projects/1'), archivedPage);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.doesNotMatch(await html('/?filter=Archived'), /data-testid="project-row"/);
    const restored = await html('/projects/1');
    assert.doesNotMatch(restored, /Archived project| disabled/);
    assert.equal(tasks(restored).length, 2);
    assert.match(tasks(restored)[0], / checked/);
    assert.doesNotMatch(tasks(restored)[1], / checked/);
    const restoredList = await html('/');
    assert.ok(restoredList.indexOf('Existing project') < restoredList.indexOf('New project'));
    assert.match(restoredList, /data-testid="project-summary">1\/2 completed/);
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/'), restoredList);
    assert.equal(await html('/projects/1'), restored);
    await post('/projects/1/tasks/2', { completed: '1', filter: 'Open' });
    assert.match(await html('/'), /data-testid="project-summary">2\/2 completed/);
    await post('/projects/1/tasks', { title: 'After restore' });
    assert.match(await html('/'), /data-testid="project-summary">2\/3 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('renaming preserves identity, order, tasks and summaries, and requires an active project', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'rename-test-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(dbPath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const rows = page => [...page.matchAll(/<div data-testid="project-row"[\s\S]*?<\/div>/g)].map(match => match[0]);
    const tasks = page => [...page.matchAll(/<div data-testid="task-row"[\s\S]*?<\/div>/g)].map(match => match[0]);
    await post('/projects', { name: 'Original name' });
    await post('/projects', { name: 'Second project' });
    await post('/projects/1/tasks', { title: 'Completed task' });
    await post('/projects/1/tasks', { title: 'Open task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await html('/projects/1');
    const originalTasks = tasks(original);
    assert.match(original, /<label for="new-project-name">New project name<\/label>/);
    assert.match(original, /<input id="new-project-name"[^>]*type="text"[^>]*>/);
    assert.match(original, /<button type="submit">Rename project<\/button>/);
    for (const name of ['', ' \t\n ']) {
      const response = await post('/projects/1/rename', { name });
      assert.equal(response.status, 400);
      const invalid = await response.text();
      assert.match(invalid, /role="alert"[^>]*>Project name is required/);
      assert.match(invalid, /<h1>Original name<\/h1>/);
      assert.equal(await html('/projects/1'), original);
    }
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
    const renamed = await post('/projects/1/rename', { name: '  Renamed <project> & "team"  ', filter: 'Open' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Open');
    const renamedPage = await html('/projects/1');
    assert.match(renamedPage, /<h1>Renamed &lt;project&gt; &amp; &quot;team&quot;<\/h1>/);
    assert.deepEqual(tasks(renamedPage), originalTasks);
    assert.equal(tasks(await html('/projects/1?filter=Open')).length, 1);
    assert.equal(tasks(await html('/projects/1?filter=Completed')).length, 1);
    const renamedList = await html('/');
    const projectRows = rows(renamedList);
    assert.equal(projectRows.length, 2);
    assert.match(projectRows[0], /Renamed &lt;project&gt; &amp; &quot;team&quot;/);
    assert.match(projectRows[0], /action="\/projects\/1"/);
    assert.match(projectRows[0], /data-testid="project-summary">1\/2 completed/);
    assert.match(projectRows[1], /Second project/);
    assert.doesNotMatch(renamedList, /Original name/);
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/1'), renamedPage);
    assert.equal(await html('/'), renamedList);
    await post('/projects/1/archive');
    const archivedPage = await html('/projects/1');
    assert.match(archivedPage, /<input id="new-project-name"[^>]* disabled>/);
    assert.match(archivedPage, /<button type="submit" disabled>Rename project<\/button>/);
    assert.equal((await post('/projects/1/rename', { name: 'Forbidden' })).status, 403);
    assert.equal(await html('/projects/1'), archivedPage);
    assert.match(await html('/?filter=Archived'), /Renamed &lt;project&gt; &amp; &quot;team&quot;/);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), renamedPage);
    assert.equal((await post('/projects/1/rename', { name: 'After restore' })).status, 303);
    const restoredPage = await html('/projects/1');
    assert.match(restoredPage, /<h1>After restore<\/h1>/);
    assert.deepEqual(tasks(restoredPage), originalTasks);
    const restoredList = await html('/');
    assert.match(rows(restoredList)[0], /After restore/);
    assert.match(rows(restoredList)[0], /data-testid="project-summary">1\/2 completed/);
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/1'), restoredPage);
    assert.equal(await html('/'), restoredList);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
