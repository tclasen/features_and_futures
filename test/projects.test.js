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

test('task priorities migrate, remain independent, and persist through renaming, restarts and restoration', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'priority-test-'));
  const dbPath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO projects (name) VALUES ('First'), ('Second');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing task', 1);
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(dbPath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const rows = page => [...page.matchAll(/<div data-testid="task-row"[\s\S]*?<\/div>/g)].map(match => match[0]);
    const prioritySelect = row => /<select id="task-priority-\d+"[\s\S]*?<\/select>/.exec(row)[0];
    const assertPriority = (row, priority, disabled = false) => {
      assert.match(row, /<label for="task-priority-\d+">Task priority<\/label>/);
      const select = prioritySelect(row);
      assert.deepEqual([...select.matchAll(/<option( selected)?>([^<]+)<\/option>/g)].map(match => match[2]), ['Low', 'Normal', 'High']);
      assert.deepEqual([...select.matchAll(/<option selected>([^<]+)<\/option>/g)].map(match => match[1]), [priority]);
      assert.equal(select.includes(' disabled'), disabled);
      assert.match(select, /onchange="this.form.requestSubmit\(\)"/);
    };
    await post('/projects/1/tasks', { title: 'New task' });
    await post('/projects/2/tasks', { title: 'Other task' });
    const original = await html('/projects/1');
    rows(original).forEach(row => assertPriority(row, 'Normal'));
    const otherProject = await html('/projects/2');
    assertPriority(rows(otherProject)[0], 'Normal');
    const summary = await html('/');
    const updated = await post('/projects/1/tasks/1/priority', { priority: 'High', filter: 'Completed' });
    assert.equal(updated.status, 303);
    assert.equal(updated.headers.get('location'), '/projects/1?filter=Completed');
    await post('/projects/1/tasks/2/priority', { priority: 'Low' });
    let tasks = rows(await html('/projects/1'));
    assertPriority(tasks[0], 'High');
    assertPriority(tasks[1], 'Low');
    assert.match(tasks[0], /<span>Existing task<\/span>/);
    assert.match(tasks[0], /aria-label="Complete Existing task" checked/);
    assert.doesNotMatch(tasks[1], / checked/);
    assert.equal(await html('/projects/2'), otherProject);
    assert.equal(await html('/'), summary);
    assert.deepEqual(rows(await html('/projects/1?filter=Completed')), [tasks[0].replaceAll('name="filter" value="All"', 'name="filter" value="Completed"')]);
    assert.deepEqual(rows(await html('/projects/1?filter=Open')), [tasks[1].replaceAll('name="filter" value="All"', 'name="filter" value="Open"')]);
    const beforeInvalid = await html('/projects/1');
    for (const priority of ['', 'Urgent', 'high']) {
      assert.equal((await post('/projects/1/tasks/1/priority', { priority })).status, 400);
    }
    assert.equal((await post('/projects/2/tasks/1/priority', { priority: 'Low' })).status, 404);
    assert.equal(await html('/projects/1'), beforeInvalid);
    assert.equal(await html('/projects/2'), otherProject);
    await post('/projects/1/tasks/1/rename', { title: '  Renamed task  ' });
    tasks = rows(await html('/projects/1'));
    assertPriority(tasks[0], 'High');
    assert.match(tasks[0], /aria-label="Complete Renamed task" checked/);
    const saved = await html('/projects/1');
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/1'), saved);
    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    tasks = rows(archived);
    assertPriority(tasks[0], 'High', true);
    assertPriority(tasks[1], 'Low', true);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Normal' })).status, 403);
    assert.equal(await html('/projects/1'), archived);
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), saved);
    assert.equal(await html('/'), summary);
    await post('/projects/1/tasks/1/priority', { priority: 'Normal' });
    const restored = await html('/projects/1');
    assertPriority(rows(restored)[0], 'Normal');
    assertPriority(rows(restored)[1], 'Low');
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/1'), restored);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

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
    assert.deepEqual(rows(await html('/projects/1?filter=Completed')), [tasks[0].replaceAll('name="filter" value="All"', 'name="filter" value="Completed"')]);
    assert.deepEqual(rows(await html('/projects/1?filter=Open')), [tasks[1].replaceAll('name="filter" value="All"', 'name="filter" value="Open"')]);
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

test('combined filters retain selections, re-evaluate edits, and work through archive and restart', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'combined-filter-test-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(dbPath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const rows = page => [...page.matchAll(/<div data-testid="task-row"[\s\S]*?<\/div>/g)].map(match => match[0]);
    const titles = page => rows(page).map(row => /<span>(.*?)<\/span>/.exec(row)[1]);
    const assertFilters = (page, completion, priority) => {
      for (const [id, options, selected] of [
        ['task-filter', ['All', 'Open', 'Completed'], completion],
        ['priority-filter', ['All', 'Low', 'Normal', 'High'], priority],
      ]) {
        const select = new RegExp(`<select id="${id}"[\\s\\S]*?<\\/select>`).exec(page)[0];
        assert.deepEqual([...select.matchAll(/<option(?: selected)?>([^<]+)<\/option>/g)].map(match => match[1]), options);
        assert.match(select, new RegExp(`<option selected>${selected}<\\/option>`));
        assert.doesNotMatch(select, /disabled/);
        assert.match(select, /onchange="this.form.requestSubmit\(\)"/);
      }
      // Both selects belong to the same GET form so either submits both values.
      assert.match(page, /<form method="get" action="\/projects\/1">\s*<label for="task-filter">[\s\S]*?<label for="priority-filter">[\s\S]*?<\/form>/);
    };
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const tasks = [];
    for (const priority of ['Low', 'Normal', 'High']) {
      for (const completed of [false, true]) {
        const id = tasks.length + 1;
        const title = `${priority} ${completed ? 'completed' : 'open'}`;
        await post('/projects/1/tasks', { title });
        await post(`/projects/1/tasks/${id}/priority`, { priority });
        if (completed) await post(`/projects/1/tasks/${id}`, { completed: '1' });
        tasks.push({ id, title, priority, completed });
      }
    }
    await post('/projects/2/tasks', { title: 'Other project task' });
    const otherProject = await html('/projects/2');
    const summary = await html('/');
    assert.match(summary, /3\/6 completed/);
    assert.match(await html('/projects/1'), /<label for="priority-filter">Priority filter<\/label>/);
    assertFilters(await html('/projects/1'), 'All', 'All');
    for (const filter of ['All', 'Open', 'Completed']) {
      for (const priorityFilter of ['All', 'Low', 'Normal', 'High']) {
        const path = `/projects/1?${new URLSearchParams({ filter, priorityFilter })}`;
        const page = await html(path);
        assertFilters(page, filter, priorityFilter);
        assert.deepEqual(titles(page), tasks.filter(task =>
          (filter === 'All' || task.completed === (filter === 'Completed')) &&
          (priorityFilter === 'All' || task.priority === priorityFilter)).map(task => task.title));
      }
    }
    assert.equal(await html('/'), summary);
    const selection = { filter: 'Open', priorityFilter: 'High' };
    const selectedPath = '/projects/1?filter=Open&priorityFilter=High';
    const edited = await post('/projects/1/tasks/5/rename', { ...selection, title: '  Renamed high  ' });
    assert.equal(edited.headers.get('location'), selectedPath);
    let page = await html(selectedPath);
    assertFilters(page, 'Open', 'High');
    assert.deepEqual(titles(page), ['Renamed high']);
    assert.match(page, /aria-label="Complete Renamed high"/);
    const invalid = await post('/projects/1/tasks/5/rename', { ...selection, title: '   ' });
    const invalidPage = await invalid.text();
    assert.equal(invalid.status, 400);
    assertFilters(invalidPage, 'Open', 'High');
    assert.match(invalidPage, /Task title is required/);
    assert.deepEqual(titles(invalidPage), ['Renamed high']);
    assert.equal(await html('/'), summary);
    const priorityEdit = await post('/projects/1/tasks/5/priority', { ...selection, priority: 'Low' });
    assert.equal(priorityEdit.headers.get('location'), selectedPath);
    page = await html(selectedPath);
    assertFilters(page, 'Open', 'High');
    assert.deepEqual(titles(page), []);
    assert.deepEqual(titles(await html('/projects/1?filter=Open&priorityFilter=Low')), ['Low open', 'Renamed high']);
    assert.equal(await html('/'), summary);
    const completionSelection = { filter: 'Completed', priorityFilter: 'High' };
    const completionEdit = await post('/projects/1/tasks/6', completionSelection);
    assert.equal(completionEdit.headers.get('location'), '/projects/1?filter=Completed&priorityFilter=High');
    page = await html(completionEdit.headers.get('location'));
    assertFilters(page, 'Completed', 'High');
    assert.deepEqual(titles(page), []);
    assert.deepEqual(titles(await html(selectedPath)), ['High completed']);
    assert.match(await html('/'), /2\/6 completed/);
    assert.equal(await html('/projects/2'), otherProject);
    const savedPage = await html('/projects/1');
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/1'), savedPage);
    assertFilters(await html('/projects/1'), 'All', 'All');
    assert.deepEqual(titles(await html(selectedPath)), ['High completed']);
    await post('/projects/1/archive');
    const archived = await html(selectedPath);
    assertFilters(archived, 'Open', 'High');
    assert.deepEqual(titles(archived), ['High completed']);
    for (const row of rows(archived)) {
      assert.match(row, /type="checkbox"[\s\S]*?disabled/);
      assert.match(row, /<select id="task-priority-\d+"[^>]*disabled/);
      assert.match(row, /<input id="new-task-title-\d+"[^>]*disabled/);
      assert.match(row, /<button type="submit" disabled>Rename task/);
    }
    const blocked = await post('/projects/1/tasks/6/priority', { ...selection, priority: 'Low' });
    assert.equal(blocked.status, 403);
    assertFilters(await blocked.text(), 'Open', 'High');
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html(selectedPath), archived);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), savedPage);
    assertFilters(await html(selectedPath), 'Open', 'High');
    assert.doesNotMatch(await html(selectedPath), /disabled/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project priority defaults migrate and affect only future tasks, surviving archive and restart', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'default-priority-test-'));
  const dbPath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'Normal'
    );
    INSERT INTO projects (name) VALUES ('Existing');
    INSERT INTO tasks (project_id, title, completed, priority) VALUES (1, 'Original', 1, 'Low');
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(dbPath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const rows = page => [...page.matchAll(/<div data-testid="task-row"[\s\S]*?<\/div>/g)].map(match => match[0]);
    const assertDefault = (page, value, disabled = false) => {
      assert.match(page, /<label for="default-task-priority">Default task priority<\/label>/);
      const select = /<select id="default-task-priority"[\s\S]*?<\/select>/.exec(page)[0];
      assert.deepEqual([...select.matchAll(/<option(?: selected)?>([^<]+)<\/option>/g)].map(match => match[1]), ['Low', 'Normal', 'High']);
      assert.match(select, new RegExp(`<option selected>${value}<\\/option>`));
      assert.equal(select.includes(' disabled'), disabled);
      assert.match(select, /onchange="this.form.requestSubmit\(\)"/);
    };
    assertDefault(await html('/projects/1'), 'Normal');
    await post('/projects', { name: 'Independent' });
    assertDefault(await html('/projects/2'), 'Normal');
    await post('/projects/1/tasks', { title: 'Normal before change' });
    const originalRows = rows(await html('/projects/1'));
    const originalList = await html('/');
    const selectedPath = '/projects/1?filter=Completed&priorityFilter=Low';
    const selectedRows = rows(await html(selectedPath));
    const selection = { filter: 'Completed', priorityFilter: 'Low' };
    for (const priority of ['High', 'Low', 'Normal', 'High']) {
      const response = await post('/projects/1/default-priority', { ...selection, priority });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), selectedPath);
      const page = await html(selectedPath);
      assertDefault(page, priority);
      assert.match(page, /<option selected>Completed<\/option>/);
      assert.match(/<select id="priority-filter"[\s\S]*?<\/select>/.exec(page)[0], /<option selected>Low<\/option>/);
      assert.deepEqual(rows(page), selectedRows);
      assert.deepEqual(rows(await html('/projects/1')), originalRows);
      assert.equal(await html('/'), originalList);
    }
    assertDefault(await html('/projects/2'), 'Normal');
    for (const priority of ['', 'Urgent']) {
      assert.equal((await post('/projects/1/default-priority', { priority })).status, 400);
      assertDefault(await html('/projects/1'), 'High');
    }
    assert.equal((await post('/projects/999/default-priority', { priority: 'High' })).status, 404);
    await post('/projects/1/tasks', { title: 'Inherited High' });
    await post('/projects/2/tasks', { title: 'Independent Normal' });
    let taskRows = rows(await html('/projects/1'));
    assert.match(taskRows[2], /<option selected>High<\/option>/);
    assert.doesNotMatch(taskRows[2], / checked/);
    assert.match(rows(await html('/projects/2'))[0], /<option selected>Normal<\/option>/);
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Inherited Low' });
    taskRows = rows(await html('/projects/1'));
    assert.deepEqual(taskRows.slice(0, 2), originalRows);
    assert.match(taskRows[2], /<option selected>High<\/option>/);
    assert.match(taskRows[3], /<option selected>Low<\/option>/);
    assert.match(await html('/'), /1\/4 completed/);
    await post('/projects/1/rename', { name: 'Renamed' });
    assertDefault(await html('/projects/1'), 'Low');
    const saved = await html('/projects/1');
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/1'), saved);
    assertDefault(await html('/projects/2'), 'Normal');
    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    assertDefault(archived, 'Low', true);
    assert.equal((await post('/projects/1/default-priority', { ...selection, priority: 'High' })).status, 403);
    assert.equal(await html('/projects/1'), archived);
    assert.deepEqual(rows(await html(selectedPath)).map(row => /<span>(.*?)<\/span>/.exec(row)[1]), ['Original']);
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), saved);
    await post('/projects/1/tasks', { title: 'Low after restoration' });
    assert.match(rows(await html('/projects/1'))[4], /<option selected>Low<\/option>/);
    assert.match(await html('/'), /1\/5 completed/);
    const finalPage = await html('/projects/1');
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/1'), finalPage);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('due dates validate Gregorian days and preserve task data through migration, edits, archive and restart', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'due-date-test-'));
  const dbPath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal'
    );
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'Normal'
    );
    INSERT INTO projects (name) VALUES ('Existing'), ('Independent');
    INSERT INTO tasks (project_id, title, completed, priority) VALUES (1, 'Original', 1, 'High');
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(dbPath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const rows = page => [...page.matchAll(/<div data-testid="task-row"[\s\S]*?<\/div>/g)].map(match => match[0]);
    const dueDateInput = row => /<input id="task-due-date-\d+"[^>]*>/.exec(row)[0];
    const assertDate = (row, value, disabled = false) => {
      assert.match(row, /<label for="task-due-date-\d+">Task due date<\/label>/);
      const input = dueDateInput(row);
      assert.match(input, /type="text"/);
      assert.match(input, new RegExp(`value="${value}"`));
      assert.equal(input.includes(' disabled'), disabled);
      assert.match(row, disabled ? /<button type="submit" disabled>Save due date/ : /<button type="submit">Save due date/);
    };
    await post('/projects/1/tasks', { title: 'New task' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    const original = await html('/projects/1');
    rows(original).forEach(row => assertDate(row, ''));
    const otherProject = await html('/projects/2');
    const summary = await html('/');
    const selection = { filter: 'Completed', priorityFilter: 'High' };
    const selectedPath = '/projects/1?filter=Completed&priorityFilter=High';
    const save = dueDate => post('/projects/1/tasks/1/due-date', { ...selection, dueDate });
    const assertFilters = page => {
      assert.match(/<select id="task-filter"[\s\S]*?<\/select>/.exec(page)[0], /<option selected>Completed/);
      assert.match(/<select id="priority-filter"[\s\S]*?<\/select>/.exec(page)[0], /<option selected>High/);
    };
    // Century leap rules, early four-digit years, and boundary dates must be timezone-free.
    for (const date of ['0001-01-01', '0004-02-29', '0099-12-31', '0400-02-29', '1900-02-28', '2000-02-29', '2024-02-29', '2025-04-30', '9999-12-31']) {
      const response = await save(` \t${date}\n `);
      assert.equal(response.status, 303, date);
      assert.equal(response.headers.get('location'), selectedPath);
      const page = await html(selectedPath);
      assertFilters(page);
      assert.equal(rows(page).length, 1);
      assertDate(rows(page)[0], date);
      const allRows = rows(await html('/projects/1'));
      assertDate(allRows[1], '');
      assert.match(allRows[0], /aria-label="Complete Original" checked/);
      assert.match(allRows[0], /<option selected>High/);
      assert.deepEqual(allRows.map(row => /<span>(.*?)<\/span>/.exec(row)[1]), ['Original', 'New task']);
      assert.equal(await html('/'), summary);
      assert.equal(await html('/projects/2'), otherProject);
    }
    const saved = await html('/projects/1');
    for (const date of ['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2025-02-29', '2024-02-30', '2025-04-31', '2025-06-31', '2025-00-01', '2025-13-01', '2025-01-00', '2025-01-32', '2025-1-01', '25-01-01', '2025-01-1', '2025/01/01', '2025-01-01T00:00:00Z', '<script>bad</script>']) {
      const response = await save(date);
      assert.equal(response.status, 400, date);
      const page = await response.text();
      assert.match(page, /role="alert"[^>]*>Due date must be a valid YYYY-MM-DD date/);
      assertFilters(page);
      assertDate(rows(page)[0], '9999-12-31');
      assert.equal(await html('/projects/1'), saved);
    }
    assert.equal((await post('/projects/1/tasks/3/due-date', { dueDate: '2025-01-01' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/due-date', { dueDate: '2025-01-01' })).status, 404);
    assert.equal(await html('/projects/2'), otherProject);
    await post('/projects/1/tasks/2/due-date', { dueDate: '2025-03-10' });
    await post('/projects/1/tasks/1/rename', { ...selection, title: 'Renamed' });
    assertDate(rows(await html(selectedPath))[0], '9999-12-31');
    assert.match(await html(selectedPath), /aria-label="Complete Renamed" checked/);
    assert.equal(await html('/'), summary);
    const beforeRestart = await html('/projects/1');
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/1'), beforeRestart);
    assertFilters(await html(selectedPath));
    for (const empty of ['', ' \t\n ']) {
      assert.equal((await save(empty)).status, 303);
      assertDate(rows(await html(selectedPath))[0], '');
      assertDate(rows(await html('/projects/1'))[1], '2025-03-10');
      await save('2024-02-29');
    }
    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    assertDate(rows(archived)[0], '2024-02-29', true);
    assertDate(rows(archived)[1], '2025-03-10', true);
    assertFilters(await html(selectedPath));
    assert.equal((await save('2025-01-01')).status, 403);
    assert.equal((await save('')).status, 403);
    assert.equal(await html('/projects/1'), archived);
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/1'), archived);
    await post('/projects/1/restore');
    assertDate(rows(await html('/projects/1'))[0], '2024-02-29');
    assertDate(rows(await html('/projects/1'))[1], '2025-03-10');
    await save('');
    const cleared = await html('/projects/1');
    assertDate(rows(cleared)[0], '');
    assert.equal(await html('/'), summary);
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/1'), cleared);
    assert.equal(await html('/projects/2'), otherProject);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('inclusive due ranges intersect filters, retain applied state through edits, and work when archived', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'due-range-test-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(dbPath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const titles = page => [...page.matchAll(/data-testid="task-row"[^>]*>\s*<span>(.*?)<\/span>/g)].map(match => match[1]);
    const formAt = (page, action) => [...page.matchAll(/<form\b[\s\S]*?<\/form>/g)]
      .map(match => match[0]).find(form => form.includes(`action="${action}"`));
    // Submit the rendered hidden state, so omissions in UI forms cannot be masked by test fixtures.
    const hidden = form => Object.fromEntries([...form.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)]
      .map(match => [match[1], match[2]]));
    const submit = async (page, action, values) => {
      const form = formAt(page, action);
      assert.ok(form, action);
      return post(action, { ...hidden(form), ...values });
    };
    const follow = async response => {
      assert.equal(response.status, 303);
      return html(response.headers.get('location'));
    };
    const assertState = (page, filter, priority, from, through) => {
      assert.match(/<select id="task-filter"[\s\S]*?<\/select>/.exec(page)[0], new RegExp(`<option selected>${filter}<`));
      assert.match(/<select id="priority-filter"[\s\S]*?<\/select>/.exec(page)[0], new RegExp(`<option selected>${priority}<`));
      assert.match(page, new RegExp(`<input id="due-from"[^>]*value="${from}"`));
      assert.match(page, new RegExp(`<input id="due-through"[^>]*value="${through}"`));
    };
    await post('/projects', { name: 'Range project' });
    await post('/projects', { name: 'Independent' });
    const tasks = [
      { title: 'Undated', date: '', priority: 'Normal', completed: false },
      { title: 'Before', date: '2024-02-28', priority: 'High', completed: false },
      { title: 'From boundary', date: '2024-02-29', priority: 'High', completed: false },
      { title: 'Through boundary', date: '2024-03-01', priority: 'High', completed: true },
      { title: 'After', date: '2024-03-02', priority: 'Low', completed: true },
      { title: 'Early year', date: '0001-01-01', priority: 'Normal', completed: false },
      { title: 'Last year', date: '9999-12-31', priority: 'Normal', completed: true },
    ];
    for (const [index, task] of tasks.entries()) {
      await post('/projects/1/tasks', { title: task.title });
      const path = `/projects/1/tasks/${index + 1}`;
      await post(`${path}/due-date`, { dueDate: task.date });
      await post(`${path}/priority`, { priority: task.priority });
      if (task.completed) await post(path, { completed: '1' });
    }
    const summary = await html('/');
    assert.match(summary, /3\/7 completed/);
    const unfiltered = await html('/projects/1');
    const otherProject = await html('/projects/2');
    assertState(unfiltered, 'All', 'All', '', '');
    for (const [from, through] of [['', ''], ['2024-02-29', '2024-03-01'], ['2024-02-29', ''], ['', '2024-03-01'], ['2024-02-29', '2024-02-29'], ['0001-01-01', '9999-12-31']]) {
      for (const filter of ['All', 'Open', 'Completed']) {
        for (const priority of ['All', 'Low', 'Normal', 'High']) {
          const response = await submit(unfiltered, '/projects/1/due-range', {
            filter, priorityFilter: priority, dueFrom: ` ${from} `, dueThrough: ` ${through} `,
          });
          const page = await follow(response);
          assertState(page, filter, priority, from, through);
          assert.deepEqual(titles(page), tasks.filter(task =>
            (filter === 'All' || task.completed === (filter === 'Completed')) &&
            (priority === 'All' || task.priority === priority) &&
            ((!from && !through) || (task.date && (!from || task.date >= from) && (!through || task.date <= through))))
            .map(task => task.title));
        }
      }
    }
    assert.equal(await html('/'), summary);
    assert.equal(await html('/projects/1'), unfiltered);
    let page = await follow(await submit(unfiltered, '/projects/1/due-range', {
      filter: 'Open', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-03-01',
    }));
    assert.deepEqual(titles(page), ['From boundary']);
    for (const [from, through, message] of [
      ['2023-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['', '1900-02-29', 'Due range must use valid YYYY-MM-DD dates'],
      ['0000-01-01', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['', '10000-01-01', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-2-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-03-02', '2024-03-01', 'Due from must not be after Due through'],
    ]) {
      const response = await submit(page, '/projects/1/due-range', { dueFrom: from, dueThrough: through });
      assert.equal(response.status, 400);
      const invalid = await response.text();
      assert.ok(invalid.includes(`role="alert" class="alert">${message}`));
      assert.deepEqual(titles(invalid), ['From boundary']);
      const retained = hidden(formAt(invalid, '/projects/1/default-priority'));
      assert.equal(retained.dueFrom, '2024-02-29');
      assert.equal(retained.dueThrough, '2024-03-01');
      page = await follow(await submit(invalid, '/projects/1/default-priority', { priority: 'High' }));
      assertState(page, 'Open', 'High', '2024-02-29', '2024-03-01');
    }
    // Changing either combobox carries the applied range and the other selected value.
    const filterForm = formAt(page, '/projects/1');
    assert.match(filterForm, /onchange="this.form.requestSubmit\(\)"/);
    page = await html(`/projects/1?${new URLSearchParams({ ...hidden(filterForm), filter: 'All', priorityFilter: 'High' })}`);
    assertState(page, 'All', 'High', '2024-02-29', '2024-03-01');
    assert.deepEqual(titles(page), ['From boundary', 'Through boundary']);
    page = await html(`/projects/1?${new URLSearchParams({ ...hidden(formAt(page, '/projects/1')), filter: 'All', priorityFilter: 'All' })}`);
    assertState(page, 'All', 'All', '2024-02-29', '2024-03-01');
    page = await follow(await submit(page, '/projects/1/tasks/3/rename', { title: 'Renamed boundary' }));
    assert.deepEqual(titles(page), ['Renamed boundary', 'Through boundary']);
    page = await follow(await submit(page, '/projects/1/rename', { name: 'Renamed project' }));
    page = await follow(await submit(page, '/projects/1/tasks', { title: 'New undated' }));
    assert.deepEqual(titles(page), ['Renamed boundary', 'Through boundary']);
    page = await follow(await submit(page, '/projects/1/tasks/3/due-date', { dueDate: '2024-03-02' }));
    assert.deepEqual(titles(page), ['Through boundary']);
    page = await follow(await submit(page, '/projects/1/tasks/4/due-date', { dueDate: ' ' }));
    assert.deepEqual(titles(page), []);
    page = await follow(await submit(page, '/projects/1/due-range', { dueFrom: '', dueThrough: '' }));
    assert.equal(titles(page).length, 8);
    page = await follow(await submit(page, '/projects/1/due-range', {
      filter: 'Open', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-03-02',
    }));
    page = await follow(await submit(page, '/projects/1/tasks/3/priority', { priority: 'Low' }));
    assert.deepEqual(titles(page), []);
    await post('/projects/1/tasks/3/priority', { priority: 'High' });
    page = await html('/projects/1?filter=Open&priorityFilter=High&dueFrom=2024-02-29&dueThrough=2024-03-02');
    page = await follow(await submit(page, '/projects/1/tasks/3', { completed: '1' }));
    assert.deepEqual(titles(page), []);
    assertState(page, 'Open', 'High', '2024-02-29', '2024-03-02');
    assert.match(await html('/'), /4\/8 completed/);
    assert.equal(await html('/projects/2'), otherProject);
    const saved = await html('/projects/1');
    await server.stop();
    server = await startServer(dbPath);
    assert.equal(await html('/projects/1'), saved);
    assertState(await html('/projects/1'), 'All', 'All', '', '');
    await post('/projects/1/archive');
    page = await follow(await submit(await html('/projects/1'), '/projects/1/due-range', {
      filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-03-02', dueThrough: '2024-03-02',
    }));
    assertState(page, 'Completed', 'High', '2024-03-02', '2024-03-02');
    assert.deepEqual(titles(page), ['Renamed boundary']);
    assert.doesNotMatch(formAt(page, '/projects/1/due-range'), /disabled/);
    assert.doesNotMatch(formAt(page, '/projects/1'), /disabled/);
    assert.match(page, /id="task-due-date-3"[^>]*disabled/);
    assert.equal((await submit(page, '/projects/1/tasks/3/due-date', { dueDate: '' })).status, 403);
    await server.stop();
    server = await startServer(dbPath);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), saved);
    const database = new DatabaseSync(dbPath);
    assert.deepEqual(database.prepare('SELECT title, completed, priority, due_date FROM tasks WHERE id = 3').get(),
      { __proto__: null, title: 'Renamed boundary', completed: 1, priority: 'High', due_date: '2024-03-02' });
    database.close();
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('moving tasks migrates order, preserves data and filters, and protects archived projects', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'move-test-'));
  const dbPath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal',
      due_date TEXT NOT NULL DEFAULT '');
    INSERT INTO projects (name) VALUES ('Source');
    INSERT INTO tasks (project_id, title, completed, priority, due_date)
      VALUES (1, 'Dated mover', 1, 'High', '2026-10-11'),
             (1, 'Blank mover', 0, 'Low', ''),
             (1, 'Remaining', 1, 'High', '2026-10-12');
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(dbPath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const rows = page => [...page.matchAll(/<div data-testid="task-row"[\s\S]*?<\/div>/g)].map(match => match[0]);
    const titles = page => rows(page).map(row => /<span>([^<]*)<\/span>/.exec(row)[1]);
    const destinations = row => /<select id="destination-project-\d+"[\s\S]*?<\/select>/.exec(row)[0];
    const summary = async () => [...(await html('/')).matchAll(/data-testid="project-summary">([^<]*)/g)].map(match => match[1]);
    const assertSavedMover = (row, { blank = false, archived = false } = {}) => {
      assert.match(row, blank ? /aria-label="Complete Blank mover"/ : /aria-label="Complete Dated mover" checked/);
      assert.match(row, blank ? /<option selected>Low<\/option>/ : /<option selected>High<\/option>/);
      assert.match(row, blank ? /name="dueDate" type="text" value=""/ : /name="dueDate" type="text" value="2026-10-11"/);
      assert.equal(destinations(row).includes(' disabled'), archived);
      assert.match(row, archived ? /<button type="submit" disabled>Move task/ : /<button type="submit">Move task/);
    };
    let source = await html('/projects/1');
    assert.deepEqual(titles(source), ['Dated mover', 'Blank mover', 'Remaining']);
    for (const row of rows(source)) {
      assert.match(row, /<label for="destination-project-\d+">Destination project<\/label>/);
      assert.match(destinations(row), / disabled/);
      assert.doesNotMatch(destinations(row), /<option/);
      assert.match(row, /<button type="submit" disabled>Move task/);
    }
    await post('/projects', { name: 'Destination' });
    await post('/projects', { name: 'Third' });
    await post('/projects', { name: 'Archived destination' });
    await post('/projects/4/archive');
    await post('/projects/2/default-priority', { priority: 'Low' });
    await post('/projects/2/tasks', { title: 'Destination first' });
    await post('/projects/2/tasks', { title: 'Destination second' });
    await post('/projects/2/rename', { name: 'Renamed & destination' });
    source = await html('/projects/1');
    for (const row of rows(source)) {
      assert.deepEqual([...destinations(row).matchAll(/<option value="(\d+)">([^<]*)<\/option>/g)].map(match => [match[1], match[2]]),
        [['2', 'Renamed &amp; destination'], ['3', 'Third']]);
    }
    for (const destinationProject of ['', '1', '4', '999', 'not-an-id']) {
      assert.equal((await post('/projects/1/tasks/1/move', { destinationProject })).status, 400);
    }
    assert.equal((await post('/projects/2/tasks/1/move', { destinationProject: '3' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/move', { destinationProject: '2' })).status, 404);
    assert.equal(await html('/projects/1'), source);
    const filters = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2026-10-11', dueThrough: '2026-10-12' };
    const filteredPath = `/projects/1?${new URLSearchParams(filters)}`;
    assert.deepEqual(titles(await html(filteredPath)), ['Dated mover', 'Remaining']);
    const moved = await post('/projects/1/tasks/1/move', { destinationProject: '2', ...filters });
    assert.equal(moved.status, 303);
    assert.equal(moved.headers.get('location'), filteredPath);
    const remaining = await html(filteredPath);
    assert.deepEqual(titles(remaining), ['Remaining']);
    assert.match(remaining, /<option selected>Completed/);
    assert.match(remaining, /<option selected>High/);
    assert.match(remaining, /id="due-from"[^>]*value="2026-10-11"/);
    assert.match(remaining, /id="due-through"[^>]*value="2026-10-12"/);
    assert.deepEqual(titles(await html('/projects/1')), ['Blank mover', 'Remaining']);
    let destination = await html('/projects/2');
    assert.deepEqual(titles(destination), ['Destination first', 'Destination second', 'Dated mover']);
    assertSavedMover(rows(destination)[2]);
    assert.deepEqual(await summary(), ['1/2 completed', '1/3 completed', '0/0 completed']);
    assert.equal((await post('/projects/1/tasks/1', { completed: '0' })).status, 404);
    await post('/projects/2/tasks', { title: 'Created after move' });
    await post('/projects/1/tasks/2/move', { destinationProject: '2' });
    destination = await html('/projects/2');
    assert.deepEqual(titles(destination), ['Destination first', 'Destination second', 'Dated mover', 'Created after move', 'Blank mover']);
    assertSavedMover(rows(destination)[4], { blank: true });
    assert.deepEqual(await summary(), ['1/1 completed', '1/5 completed', '0/0 completed']);
    const savedSource = await html('/projects/1');
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/2'), destination);
    assert.equal(await html('/projects/1'), savedSource);
    await post('/projects/2/archive');
    const archived = await html('/projects/2');
    assertSavedMover(rows(archived)[2], { archived: true });
    assertSavedMover(rows(archived)[4], { blank: true, archived: true });
    for (const row of rows(await html('/projects/1'))) assert.doesNotMatch(destinations(row), /value="2"/);
    assert.equal((await post('/projects/2/tasks/1/move', { destinationProject: '1' })).status, 403);
    assert.equal((await post('/projects/1/tasks/3/move', { destinationProject: '2' })).status, 400);
    assert.equal(await html('/projects/2'), archived);
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/2'), archived);
    await post('/projects/2/restore');
    assert.equal(await html('/projects/2'), destination);
    await post('/projects/2/tasks/1/move', { destinationProject: '1' });
    await post('/projects/2/tasks/2/move', { destinationProject: '1' });
    const returned = await html('/projects/1');
    assert.deepEqual(titles(returned), ['Dated mover', 'Blank mover', 'Remaining']);
    assertSavedMover(rows(returned)[0]);
    assertSavedMover(rows(returned)[1], { blank: true });
    assert.deepEqual(await summary(), ['2/3 completed', '0/3 completed', '0/0 completed']);
    await post('/projects/1/tasks/1/move', { destinationProject: '2' });
    assert.deepEqual(titles(await html('/projects/2')), ['Destination first', 'Destination second', 'Dated mover', 'Created after move']);
    const finalSource = await html('/projects/1');
    const finalDestination = await html('/projects/2');
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/1'), finalSource);
    assert.equal(await html('/projects/2'), finalDestination);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('returning tasks restores per-project order after migration, reverse returns, edits and restarts', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'return-order-test-'));
  const dbPath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal',
      due_date TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Original'), ('Second'), ('Third');
    INSERT INTO tasks (project_id, title, position) VALUES
      (1, 'Middle', 20), (1, 'First', 10), (1, 'Last', 30), (2, 'Resident', 5);
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(dbPath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const titles = page => [...page.matchAll(/data-testid="task-row"[^>]*>\s*<span>([^<]*)/g)].map(match => match[1]);
    const order = async (projectId, expected) => assert.deepEqual(titles(await html(`/projects/${projectId}`)), expected);
    const move = async (source, task, destination, filters = {}) => {
      const response = await post(`/projects/${source}/tasks/${task}/move`, { destinationProject: destination, ...filters });
      assert.equal(response.status, 303);
      return response;
    };
    const restart = async () => {
      await server.stop();
      server = undefined;
      server = await startServer(dbPath);
    };
    await order(1, ['First', 'Middle', 'Last']);
    await move(1, 2, 2);
    await move(1, 1, 2);
    await move(1, 3, 2);
    await order(2, ['Resident', 'First', 'Middle', 'Last']);
    // Even with every original task away, new positions follow all remembered positions.
    await post('/projects/1/tasks', { title: 'New original' });
    await move(2, 4, 1);
    await post('/projects/1/rename', { name: 'Renamed original' });
    await post('/projects/2/tasks/1/rename', { title: 'Edited middle' });
    await post('/projects/2/tasks/1', { completed: '1' });
    await post('/projects/2/tasks/1/priority', { priority: 'High' });
    await post('/projects/2/tasks/1/due-date', { dueDate: '2026-10-11' });
    await post('/projects/1/default-priority', { priority: 'Low' });
    await restart();
    await move(2, 3, 1);
    await move(2, 1, 1);
    await move(2, 2, 1);
    await order(1, ['First', 'Edited middle', 'Last', 'New original', 'Resident']);
    const edited = await html('/projects/1?filter=Completed&priorityFilter=High&dueFrom=2026-10-11&dueThrough=2026-10-11');
    assert.deepEqual(titles(edited), ['Edited middle']);
    assert.match(edited, /aria-label="Complete Edited middle" checked/);
    assert.match(edited, /name="dueDate" type="text" value="2026-10-11"/);
    assert.match(await html('/'), /1\/5 completed/);
    // Returning through a third project still uses each project's independent history.
    await move(1, 3, 3);
    await move(1, 2, 3);
    await move(1, 1, 3, { filter: 'Completed', priorityFilter: 'High', dueFrom: '2026-10-11' });
    await order(3, ['Last', 'First', 'Edited middle']);
    await post('/projects/2/tasks', { title: 'New second' });
    await post('/projects/2/archive');
    assert.equal((await post('/projects/3/tasks/1/move', { destinationProject: '2' })).status, 400);
    assert.doesNotMatch(await html('/projects/3'), /<option value="2">/);
    await restart();
    await post('/projects/2/restore');
    const response = await move(3, 1, 2, { filter: 'Completed', priorityFilter: 'High', dueFrom: '2026-10-11' });
    assert.equal(response.headers.get('location'), '/projects/3?filter=Completed&priorityFilter=High&dueFrom=2026-10-11');
    await move(3, 3, 2);
    await move(3, 2, 2);
    await move(1, 4, 2);
    await order(2, ['Resident', 'First', 'Edited middle', 'Last', 'New second']);
    await order(1, ['New original']);
    await order(3, []);
    await move(2, 1, 3);
    await move(2, 2, 3);
    await move(2, 3, 3);
    await order(3, ['Last', 'First', 'Edited middle']);
    const saved = await html('/projects/3');
    await restart();
    assert.equal(await html('/projects/3'), saved);
    await move(3, 3, 1);
    await move(3, 1, 1);
    await move(3, 2, 1);
    await order(1, ['First', 'Edited middle', 'Last', 'New original']);
    assert.match(await html('/'), /1\/4 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('search collapses only ASCII spaces and tabs without changing saved names or titles', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'search-whitespace-test-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(dbPath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const titles = (page, kind) => [...page.matchAll(new RegExp(`data-testid="${kind}-row"[^>]*>\\s*<span>([^<]*)`, 'g'))].map(match => match[1]);
    const names = ['MiXeD  \t Team', 'MIXED Team', 'Mixed\nTeam', 'Mixed\u00a0Team', 'Älpha Team'];
    for (const name of names) await post('/projects', { name });
    for (const title of names) await post('/projects/1/tasks', { title });
    await post('/projects/1/tasks/1', { completed: '1' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2026-10-11' });
    const snapshot = () => {
      const database = new DatabaseSync(dbPath);
      try {
        return ['projects', 'tasks', 'task_positions'].map(table => database.prepare(`SELECT * FROM ${table}`).all());
      } finally {
        database.close();
      }
    };
    const beforeSearch = snapshot();
    for (const query of ['mixed team', ' \tMiXeD\t  \tTEAM\n ', 'XED\t T']) {
      assert.deepEqual(titles(await html(`/?${new URLSearchParams({ projectSearch: query })}`), 'project'), names.slice(0, 2));
      assert.deepEqual(titles(await html(`/projects/1?${new URLSearchParams({ taskSearch: query })}`), 'task'), names.slice(0, 2));
    }
    for (const query of ['mixed\nteam', 'mixed\u00a0team', 'älpha team']) {
      const expected = query === 'älpha team' ? [] : [names[query.includes('\n') ? 2 : 3]];
      assert.deepEqual(titles(await html(`/?${new URLSearchParams({ projectSearch: query })}`), 'project'), expected);
      assert.deepEqual(titles(await html(`/projects/1?${new URLSearchParams({ taskSearch: query })}`), 'task'), expected);
    }
    const view = new URLSearchParams({ taskSearch: 'mixed\t team', filter: 'Completed', priorityFilter: 'High', dueFrom: '2026-10-11', dueThrough: '2026-10-11' });
    const viewPath = `/projects/1?${view}`;
    assert.deepEqual(titles(await html(viewPath), 'task'), [names[0]]);
    assert.deepEqual(titles(await html('/?projectSearch=%20%09'), 'project'), names);
    assert.deepEqual(titles(await html('/projects/1?taskSearch=%20%09'), 'task'), names);
    assert.deepEqual(snapshot(), beforeSearch);
    const saved = await html(viewPath);
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html(viewPath), saved);
    assert.deepEqual(snapshot(), beforeSearch);
    assert.deepEqual(titles(await html('/'), 'project'), names);
    assert.deepEqual(titles(await html('/projects/1'), 'task'), names);
    await post('/projects/1/archive');
    assert.deepEqual(titles(await html('/?filter=Archived&projectSearch=mixed+team'), 'project'), [names[0]]);
    assert.deepEqual(titles(await html(viewPath), 'task'), [names[0]]);
    assert.match(await html(viewPath), /aria-label="Complete MiXeD  \t Team" checked disabled/);
    await post('/projects/1/restore');
    assert.equal(await html(viewPath), saved);
    assert.deepEqual(snapshot(), beforeSearch);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('search intersects filters, retains view state through edits, and preserves data and return order', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'search-test-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(dbPath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const titles = (page, kind = 'task') => [...page.matchAll(new RegExp(`data-testid="${kind}-row"[^>]*>\\s*<span>([^<]*)`, 'g'))].map(match => match[1]);
    const forms = page => [...page.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)].map(match => match[0]);
    const formValues = form => Object.fromEntries([...form.matchAll(/<input type="hidden" name="([^"]*)" value="([^"]*)"/g)].map(match => [match[1], match[2]]));
    const submit = async (page, path, changes) => {
      const form = forms(page).find(form => form.includes(`action="${path}"`));
      assert.ok(form, `Missing form ${path}`);
      return post(path, { ...formValues(form), ...changes });
    };
    const follow = async response => {
      assert.equal(response.status, 303);
      return html(response.headers.get('location'));
    };
    for (const name of ['Alpha  Team', 'ALPHA Team', 'Other', 'Älpha']) await post('/projects', { name });
    await post('/projects/2/archive');
    await post('/projects/1/tasks', { title: 'Alpha first' });
    await post('/projects/1/tasks', { title: 'ALPHA  second' });
    await post('/projects/1/tasks', { title: 'Other' });
    await post('/projects/1/tasks', { title: 'Älpha' });
    await post('/projects/1/tasks/1', { completed: '1' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2026-10-11' });
    await post('/projects/1/tasks/2/priority', { priority: 'High' });
    await post('/projects/1/tasks/2/due-date', { dueDate: '2026-10-12' });
    let page = await html('/?projectSearch=%20aLpHa%20');
    assert.deepEqual(titles(page, 'project'), ['Alpha  Team']);
    assert.match(page, /id="project-search"[^>]*value="aLpHa"/);
    assert.match(page, /1\/4 completed/);
    const projectFilterForm = forms(page).find(form => form.includes('id="project-filter"'));
    page = await html(`/?${new URLSearchParams({ ...formValues(projectFilterForm), filter: 'Archived' })}`);
    assert.deepEqual(titles(page, 'project'), ['ALPHA Team']);
    assert.match(page, /id="project-search"[^>]*value="aLpHa"/);
    assert.deepEqual(titles(await html('/?projectSearch=alpha++team'), 'project'), ['Alpha  Team']);
    assert.deepEqual(titles(await html('/?projectSearch=%C3%A4lpha'), 'project'), []);
    assert.deepEqual(titles(await html('/?projectSearch=%20%20'), 'project'), ['Alpha  Team', 'Other', 'Älpha']);
    assert.match(await html('/'), /id="project-search"[^>]*value=""/);

    const database = new DatabaseSync(dbPath);
    const beforeSearch = database.prepare('SELECT * FROM tasks ORDER BY id').all();
    page = await html('/projects/1?taskSearch=%20aLpHa%20');
    assert.deepEqual(titles(page), ['Alpha first', 'ALPHA  second']);
    assert.match(page, /id="task-search"[^>]*value="aLpHa"/);
    assert.deepEqual(titles(await html('/projects/1?taskSearch=alpha++')), ['Alpha first', 'ALPHA  second']);
    assert.deepEqual(titles(await html('/projects/1?taskSearch=alpha++s')), ['ALPHA  second']);
    assert.deepEqual(titles(await html('/projects/1?taskSearch=%C3%A4lpha')), []);
    assert.deepEqual(database.prepare('SELECT * FROM tasks ORDER BY id').all(), beforeSearch);
    database.close();
    const searchForm = forms(page).find(form => form.includes('id="task-search"'));
    assert.match(searchForm, /Search tasks/);
    const filterForm = forms(page).find(form => form.includes('id="task-filter"'));
    page = await html(`/projects/1?${new URLSearchParams({ ...formValues(filterForm), filter: 'Completed', priorityFilter: 'High' })}`);
    assert.deepEqual(titles(page), ['Alpha first']);
    page = await follow(await submit(page, '/projects/1/due-range', { dueFrom: '2026-10-11', dueThrough: '2026-10-11' }));
    assert.deepEqual(titles(page), ['Alpha first']);
    const assertView = page => {
      assert.match(page, /id="task-search"[^>]*value="aLpHa"/);
      assert.match(page, /<option selected>Completed/);
      assert.match(page, /id="priority-filter"[\s\S]*?<option selected>High/);
      assert.match(page, /id="due-from"[^>]*value="2026-10-11"/);
      assert.match(page, /id="due-through"[^>]*value="2026-10-11"/);
      for (const form of forms(page).filter(form => form.includes('method="post"'))) {
        assert.equal(formValues(form).taskSearch, 'aLpHa');
      }
    };
    assertView(page);
    const invalid = await submit(page, '/projects/1/tasks/1/rename', { title: ' ' });
    assert.equal(invalid.status, 400);
    page = await invalid.text();
    assertView(page);
    assert.deepEqual(titles(page), ['Alpha first']);
    page = await follow(await submit(page, '/projects/1/default-priority', { priority: 'Low' }));
    page = await follow(await submit(page, '/projects/1/rename', { name: 'Alpha renamed' }));
    page = await follow(await submit(page, '/projects/1/tasks', { title: 'Alpha new' }));
    assertView(page);
    assert.deepEqual(titles(page), ['Alpha first']);
    page = await follow(await submit(page, '/projects/1/tasks/1/rename', { title: 'No match now' }));
    assertView(page);
    assert.deepEqual(titles(page), []);
    const clearForm = forms(page).find(form => form.includes('id="task-search"'));
    const clearPath = `/projects/1?${new URLSearchParams({ ...formValues(clearForm), taskSearch: ' ' })}`;
    assert.deepEqual(titles(await html(clearPath)), ['No match now']);
    const view = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2026-10-11', dueThrough: '2026-10-11', taskSearch: 'aLpHa' };
    const viewPath = `/projects/1?${new URLSearchParams(view)}`;
    await post('/projects/1/tasks/1/rename', { title: 'Alpha returned', ...view });
    page = await html(viewPath);
    page = await follow(await submit(page, '/projects/1/tasks/1/due-date', { dueDate: '' }));
    assertView(page);
    assert.deepEqual(titles(page), []);
    await post('/projects/1/tasks/1/due-date', { dueDate: '2026-10-11', ...view });
    page = await follow(await submit(await html(viewPath), '/projects/1/tasks/1/priority', { priority: 'Low' }));
    assertView(page);
    assert.deepEqual(titles(page), []);
    await post('/projects/1/tasks/1/priority', { priority: 'High', ...view });
    page = await follow(await submit(await html(viewPath), '/projects/1/tasks/1', {}));
    assertView(page);
    assert.deepEqual(titles(page), []);
    await post('/projects/1/tasks/1', { completed: '1', ...view });
    page = await follow(await submit(await html(viewPath), '/projects/1/tasks/1/move', { destinationProject: '3' }));
    assertView(page);
    assert.deepEqual(titles(page), []);
    assert.match(await html('/'), /1\/1 completed/);
    await post('/projects/3/tasks/1/move', { destinationProject: '1' });
    assert.deepEqual(titles(await html('/projects/1')), ['Alpha returned', 'ALPHA  second', 'Other', 'Älpha', 'Alpha new']);
    const saved = await html(viewPath);
    await server.stop();
    server = await startServer(dbPath);
    assert.equal(await html(viewPath), saved);
    assert.match(await html('/projects/1'), /id="task-search"[^>]*value=""/);
    assert.match(await html('/projects/1'), /action="\/"/);
    await post('/projects/1/archive');
    page = await html(viewPath);
    assertView(page);
    assert.deepEqual(titles(page), ['Alpha returned']);
    for (const form of forms(page).filter(form => form.includes('id="task-search"') || form.includes('id="task-filter"') || form.includes('/due-range'))) {
      assert.doesNotMatch(form, /disabled/);
    }
    assert.match(page, /aria-label="Complete Alpha returned" checked disabled/);
    assert.match(page, /id="new-task-title-1"[^>]*disabled/);
    assert.match(page, /id="task-priority-1"[^>]*disabled/);
    assert.match(page, /id="task-due-date-1"[^>]*disabled/);
    assert.match(page, /id="destination-project-1"[^>]*disabled/);
    await post('/projects/1/restore');
    assert.equal(await html(viewPath), saved);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
