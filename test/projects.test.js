import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runInNewContext } from 'node:vm';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = /listening on port (\d+)/.exec(output);
      if (match) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}`);
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

test('project validation, ordering, navigation and durable IDs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const health = await fetch(`${server.base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const initial = await (await fetch(server.base)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);

    for (const name of ['', ' \t\n ']) {
      const invalid = await fetch(`${server.base}/projects`, {
        method: 'POST', body: new URLSearchParams({ name }),
      });
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }

    for (const name of ['  First project  ', '<script>alert("x")</script>']) {
      const created = await fetch(`${server.base}/projects`, {
        method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
      });
      assert.equal(created.status, 303);
      assert.equal(created.headers.get('location'), '/');
    }
    const list = await (await fetch(server.base)).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(list, /<span>First project<\/span>/);
    assert.match(list, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
    assert.ok(list.indexOf('First project') < list.indexOf('&lt;script&gt;'));
    const routes = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
    assert.equal(routes.length, 2);
    const detail = await (await fetch(`${server.base}${routes[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*>Projects<\/button>/);
    assert.equal((await fetch(`${server.base}/projects/999999`)).status, 404);

    await server.stop();
    server = await startServer(databasePath);
    const restored = await (await fetch(server.base)).text();
    assert.equal(restored, list);
    const restoredDetail = await fetch(`${server.base}${routes[0]}`);
    assert.equal(restoredDetail.status, 200);
    assert.match(await restoredDetail.text(), /<h1>First project<\/h1>/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, stay in their project and persist completion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async (path) => (await fetch(`${server.base}${path}`)).text();
    const rows = (content) => [...content.matchAll(/<div class="task" data-testid="task-row">([\s\S]*?)<\/div>/g)]
      .map((match) => match[1]);
    await post('/projects', { name: 'One' });
    await post('/projects', { name: 'Two' });
    const initial = await html('/projects/1');
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, />Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      const invalid = await response.text();
      assert.match(invalid, /role="alert"[^>]*>Task title is required/);
      assert.equal(rows(invalid).length, 0);
    }
    for (const title of ['  First task  ', '<script>Second</script>']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/projects/1');
    }
    await post('/projects/2/tasks', { title: 'Other project task' });
    const created = rows(await html('/projects/1'));
    assert.equal(created.length, 2);
    assert.match(created[0], /aria-label="Complete First task"/);
    assert.match(created[0], /<label[^>]*>First task<\/label>/);
    assert.match(created[1], /&lt;script&gt;Second&lt;\/script&gt;/);
    assert.doesNotMatch(created.join(''), / checked/);
    assert.equal(rows(await html('/projects/1?filter=Open')).length, 2);
    assert.equal(rows(await html('/projects/1?filter=Completed')).length, 0);
    assert.equal((await post('/projects/1/tasks/1', { completed: '1' })).status, 204);
    assert.match(rows(await html('/projects/1'))[0], / checked/);
    const open = rows(await html('/projects/1?filter=Open'));
    assert.equal(open.length, 1);
    assert.match(open[0], /Second/);
    const completed = rows(await html('/projects/1?filter=Completed'));
    assert.equal(completed.length, 1);
    assert.match(completed[0], /First task/);
    assert.equal((await post('/projects/2/tasks/1', { completed: '0' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1', { completed: 'invalid' })).status, 400);
    assert.equal((await post('/projects/999/tasks', { title: 'Orphan' })).status, 404);
    const other = rows(await html('/projects/2'));
    assert.equal(other.length, 1);
    assert.match(other[0], /Other project task/);
    assert.doesNotMatch(other[0], /First task|Second/);
    const beforeRestart = await html('/projects/1');
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), beforeRestart);
    assert.equal((await post('/projects/1/tasks/1', { completed: '0' })).status, 204);
    assert.equal(rows(await html('/projects/1?filter=Completed')).length, 0);
    assert.equal(rows(await html('/projects/1?filter=Open')).length, 2);
    await server.stop();
    server = await startServer(databasePath);
    assert.doesNotMatch(rows(await html('/projects/1')).join(''), / checked/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive and restore preserve tasks, summaries and state across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async (path) => (await fetch(`${server.base}${path}`)).text();
    const projectRows = (content) => content.split('data-testid="project-row"').slice(1);
    const taskRows = (content) => [...content.matchAll(/<div class="task" data-testid="task-row">([\s\S]*?)<\/div>/g)]
      .map((match) => match[1]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const initial = await html('/');
    assert.match(initial, /<label for="project-filter">Project filter<\/label>/);
    assert.match(initial, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.equal(projectRows(initial).length, 2);
    for (const row of projectRows(initial)) {
      assert.match(row, /data-testid="project-summary">0\/0 completed/);
      assert.match(row, />Archive project<\/button>/);
      assert.doesNotMatch(row, />Restore project<\/button>/);
    }
    await post('/projects/1/tasks', { title: 'Open task' });
    await post('/projects/1/tasks', { title: 'Done task' });
    await post('/projects/1/tasks/2', { completed: '1' });
    await post('/projects/2/tasks', { title: 'Separate task' });
    assert.match(projectRows(await html('/'))[0], /data-testid="project-summary">1\/2 completed/);
    assert.match(projectRows(await html('/'))[1], /data-testid="project-summary">0\/1 completed/);
    await html('/projects/1?filter=Completed');
    assert.match(projectRows(await html('/'))[0], /data-testid="project-summary">1\/2 completed/);

    assert.equal((await post('/projects/1/archive')).status, 303);
    const active = projectRows(await html('/'));
    assert.equal(active.length, 1);
    assert.match(active[0], /<span>Second<\/span>/);
    const archivedList = await html('/?filter=Archived');
    assert.match(archivedList, /<option>Active<\/option><option selected>Archived<\/option>/);
    const archived = projectRows(archivedList);
    assert.equal(archived.length, 1);
    assert.match(archived[0], /<span>First<\/span>/);
    assert.match(archived[0], /data-testid="project-summary">1\/2 completed/);
    assert.match(archived[0], /action="\/projects\/1".*>Open project<\/button>/);
    assert.match(archived[0], />Restore project<\/button>/);
    assert.doesNotMatch(archived[0], />Archive project<\/button>/);
    const detail = await html('/projects/1');
    assert.match(detail, /<p>Archived project<\/p>/);
    assert.match(detail, /<button type="submit" disabled>Create task<\/button>/);
    const archivedTasks = taskRows(detail);
    assert.equal(archivedTasks.length, 2);
    for (const row of archivedTasks) assert.match(row, /<input[^>]* disabled>/);
    assert.doesNotMatch(archivedTasks[0], / checked/);
    assert.match(archivedTasks[1], / checked/);
    assert.match(taskRows(await html('/projects/1?filter=Open'))[0], /Open task/);
    assert.equal(taskRows(await html('/projects/1?filter=Open')).length, 1);
    assert.match(taskRows(await html('/projects/1?filter=Completed'))[0], /Done task/);
    assert.equal(taskRows(await html('/projects/1?filter=Completed')).length, 1);
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1', { completed: '1' })).status, 403);
    assert.equal((await post('/projects/1/tasks/2', { completed: '0' })).status, 403);
    assert.equal(await html('/projects/1'), detail);
    assert.equal((await post('/projects/999/archive')).status, 404);
    assert.equal((await post('/projects/999/restore')).status, 404);

    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/?filter=Archived'), archivedList);
    assert.equal(await html('/projects/1'), detail);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.equal(projectRows(await html('/?filter=Archived')).length, 0);
    const restored = projectRows(await html('/'));
    assert.equal(restored.length, 2);
    assert.match(restored[0], /<span>First<\/span>/);
    assert.match(restored[1], /<span>Second<\/span>/);
    assert.match(restored[0], /data-testid="project-summary">1\/2 completed/);
    const restoredDetail = await html('/projects/1');
    assert.doesNotMatch(restoredDetail, /<p>Archived project<\/p>/);
    assert.match(restoredDetail, /<button type="submit">Create task<\/button>/);
    for (const row of taskRows(restoredDetail)) assert.doesNotMatch(row, / disabled/);
    assert.equal((await post('/projects/1/tasks/1', { completed: '1' })).status, 204);
    assert.equal((await post('/projects/1/tasks', { title: 'After restore' })).status, 303);
    const restoredList = await html('/');
    assert.match(projectRows(restoredList)[0], /data-testid="project-summary">2\/3 completed/);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/'), restoredList);
    assert.equal(taskRows(await html('/projects/1')).length, 3);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});


test('renaming preserves identity, ordering and tasks, and requires an active project', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async (path) => (await fetch(`${server.base}${path}`)).text();
    const taskRows = (content) => [...content.matchAll(/<div class="task" data-testid="task-row">([\s\S]*?)<\/div>/g)]
      .map((match) => match[1]);
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second project' });
    await post('/projects/1/tasks', { title: 'Open task' });
    await post('/projects/1/tasks', { title: 'Completed task' });
    await post('/projects/1/tasks/2', { completed: '1' });
    const initial = await html('/projects/1');
    assert.match(initial, /<label for="new-project-name">New project name<\/label>/);
    assert.match(initial, /<input id="new-project-name"[^>]*value="Original">/);
    assert.match(initial, /<button type="submit">Rename project<\/button>/);
    const originalTasks = taskRows(initial);

    for (const name of ['', ' \t\n ']) {
      const response = await post('/projects/1/rename', { name });
      assert.equal(response.status, 400);
      const invalid = await response.text();
      assert.match(invalid, /role="alert"[^>]*>Project name is required/);
      assert.match(invalid, /<h1>Original<\/h1>/);
      assert.deepEqual(taskRows(invalid), originalTasks);
      assert.equal(await html('/projects/1'), initial);
    }
    const renamed = await post('/projects/1/rename', { name: '  Renamed <project> "One"  ' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1');
    const detail = await html('/projects/1');
    assert.match(detail, /<h1>Renamed &lt;project&gt; &quot;One&quot;<\/h1>/);
    assert.match(detail, /value="Renamed &lt;project&gt; &quot;One&quot;"/);
    assert.deepEqual(taskRows(detail), originalTasks);
    const list = await html('/');
    assert.match(list, /<span>Renamed &lt;project&gt; &quot;One&quot;<\/span>/);
    assert.ok(list.indexOf('<span>Renamed') < list.indexOf('<span>Second project'));
    assert.match(list, /data-testid="project-summary">1\/2 completed/);
    assert.match(list, /action="\/projects\/1"/);
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), detail);
    assert.equal(await html('/'), list);

    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    assert.match(archived, /<input id="new-project-name"[^>]* disabled>/);
    assert.match(archived, /<button type="submit" disabled>Rename project<\/button>/);
    assert.equal((await post('/projects/1/rename', { name: 'Forbidden' })).status, 403);
    assert.equal(await html('/projects/1'), archived);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), detail);
    assert.equal((await post('/projects/1/rename', { name: '  Restored name  ' })).status, 303);
    const restored = await html('/projects/1');
    assert.match(restored, /<h1>Restored name<\/h1>/);
    assert.deepEqual(taskRows(restored), originalTasks);
    const restoredList = await html('/');
    assert.match(restoredList, /<span>Restored name<\/span>/);
    assert.ok(restoredList.indexOf('<span>Restored name') < restoredList.indexOf('<span>Second project'));
    assert.match(restoredList, /data-testid="project-summary">1\/2 completed/);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), restored);
    assert.equal(await html('/'), restoredList);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('existing task databases migrate without losing IDs or completion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-migration-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    const database = new DatabaseSync(databasePath);
    try {
      database.exec(`
        CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
        CREATE TABLE tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL REFERENCES projects(id),
          title TEXT NOT NULL,
          completed INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO projects (id, name) VALUES (42, 'Existing project');
        INSERT INTO tasks (id, project_id, title, completed) VALUES (73, 42, 'Existing task', 1);
      `);
    } finally {
      database.close();
    }
    server = await startServer(databasePath);
    const list = await (await fetch(server.base)).text();
    assert.match(list, /Existing project/);
    assert.match(list, /data-testid="project-summary">1\/1 completed/);
    assert.match(list, /action="\/projects\/42"/);
    const detail = await (await fetch(`${server.base}/projects/42`)).text();
    assert.match(detail, /data-task-id="73"/);
    assert.match(detail, /aria-label="Complete Existing task" checked>/);
    assert.match(detail, /<option>Low<\/option><option selected>Normal<\/option><option>High<\/option>/);
    assert.doesNotMatch(detail, /<p>Archived project<\/p>/);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await (await fetch(server.base)).text(), list);
    assert.equal(await (await fetch(`${server.base}/projects/42`)).text(), detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('priorities save independently and preserve task data through rename, archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async (path) => (await fetch(`${server.base}${path}`)).text();
    const rows = (content) => [...content.matchAll(/<div class="task" data-testid="task-row">([\s\S]*?)<\/div>/g)]
      .map((match) => match[1]);
    const prioritySelect = (row) => /<select[^>]*data-task-priority[^>]*>([\s\S]*?)<\/select>/.exec(row);
    const assertPriority = (row, saved) => {
      const select = prioritySelect(row);
      assert.ok(select);
      assert.deepEqual([...select[1].matchAll(/<option(?: selected)?>([^<]+)<\/option>/g)].map((match) => match[1]),
        ['Low', 'Normal', 'High']);
      assert.match(select[1], new RegExp(`<option selected>${saved}</option>`));
    };
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Open task' });
    await post('/projects/1/tasks', { title: 'Done task' });
    await post('/projects/2/tasks', { title: 'Other task' });
    await post('/projects/1/tasks/2', { completed: '1' });
    const original = await html('/projects/1');
    const other = await html('/projects/2');
    const summary = await html('/');
    for (const row of rows(original)) {
      assert.match(row, /<label for="task-priority-\d+">Task priority<\/label>/);
      assertPriority(row, 'Normal');
    }
    for (const priority of ['', 'Urgent', 'high', ' High ']) {
      assert.equal((await post('/projects/1/tasks/1/priority', { priority })).status, 400);
      assert.equal(await html('/projects/1'), original);
    }
    for (const path of ['/projects/2/tasks/1/priority', '/projects/1/tasks/999/priority',
      '/projects/999/tasks/1/priority', '/projects/1/tasks/9007199254740992/priority']) {
      assert.equal((await post(path, { priority: 'High' })).status, 404);
    }
    const saved = await post('/projects/1/tasks/2/priority', { priority: 'High', filter: 'Completed' });
    assert.equal(saved.status, 303);
    assert.equal(saved.headers.get('location'), '/projects/1?filter=Completed');
    assertPriority(rows(await html('/projects/1'))[0], 'Normal');
    assertPriority(rows(await html('/projects/1?filter=Completed'))[0], 'High');
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Low', filter: 'Open' })).status, 303);
    await post('/projects/1/tasks/2/rename', { title: '  Renamed completed  ', filter: 'Completed' });
    const detail = await html('/projects/1');
    const taskRows = rows(detail);
    assert.equal(taskRows.length, 2);
    assert.match(taskRows[0], /data-task-id="1"/);
    assert.match(taskRows[0], /aria-label="Complete Open task"/);
    assert.doesNotMatch(taskRows[0], / checked/);
    assertPriority(taskRows[0], 'Low');
    assert.match(taskRows[1], /data-task-id="2"/);
    assert.match(taskRows[1], /aria-label="Complete Renamed completed" checked/);
    assertPriority(taskRows[1], 'High');
    assert.deepEqual(rows(await html('/projects/1?filter=Open')), [taskRows[0].replaceAll('name="filter" value="All"', 'name="filter" value="Open"')]);
    assert.deepEqual(rows(await html('/projects/1?filter=Completed')), [taskRows[1].replaceAll('name="filter" value="All"', 'name="filter" value="Completed"')]);
    assert.equal(await html('/projects/2'), other);
    assert.equal(await html('/'), summary);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), detail);
    assert.equal(await html('/projects/2'), other);
    assert.equal(await html('/'), summary);

    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    for (const row of rows(archived)) assert.match(prioritySelect(row)[0], /data-task-priority disabled>/);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'High' })).status, 403);
    assert.equal((await post('/projects/1/tasks/2/priority', { priority: 'Low' })).status, 403);
    assert.equal(await html('/projects/1'), archived);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), detail);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Normal' })).status, 303);
    assertPriority(rows(await html('/projects/1'))[0], 'Normal');
    assertPriority(rows(await html('/projects/1'))[1], 'High');
    assert.equal(await html('/'), summary);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task renaming preserves ownership, order, completion and filters across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async (path) => (await fetch(`${server.base}${path}`)).text();
    const rows = (content) => [...content.matchAll(/<div class="task" data-testid="task-row">([\s\S]*?)<\/div>/g)]
      .map((match) => match[1]);
    await post('/projects', { name: 'One' });
    await post('/projects', { name: 'Two' });
    await post('/projects/1/tasks', { title: 'Original open' });
    await post('/projects/1/tasks', { title: 'Original completed' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    await post('/projects/1/tasks/2', { completed: '1' });
    const initial = await html('/projects/1');
    const other = await html('/projects/2');
    const originalList = await html('/');
    const initialRows = rows(initial);
    assert.equal(initialRows.length, 2);
    for (const [index, row] of initialRows.entries()) {
      assert.match(row, new RegExp(`<label for="new-task-title-${index + 1}">New task title</label>`));
      assert.match(row, /<button type="submit">Rename task<\/button>/);
      assert.doesNotMatch(row, / disabled/);
    }
    for (const title of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/tasks/2/rename', { title, filter: 'Completed' });
      assert.equal(invalid.status, 400);
      const content = await invalid.text();
      assert.match(content, /role="alert"[^>]*>Task title is required/);
      assert.match(content, /<option selected>Completed<\/option>/);
      assert.deepEqual(rows(content), rows(await html('/projects/1?filter=Completed')));
      assert.equal(await html('/projects/1'), initial);
    }
    assert.equal((await post('/projects/2/tasks/1/rename', { title: 'Wrong owner' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/rename', { title: 'Missing' })).status, 404);
    assert.equal((await post('/projects/999/tasks/1/rename', { title: 'Missing project' })).status, 404);
    assert.equal((await post('/projects/1/tasks/9007199254740992/rename', { title: 'Invalid ID' })).status, 404);
    assert.equal(await html('/projects/1'), initial);

    const renamed = await post('/projects/1/tasks/2/rename', {
      title: '  Finished <task> "two"  ', filter: 'Completed',
    });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const renamedOpen = await post('/projects/1/tasks/1/rename', { title: '  Renamed open  ', filter: 'Open' });
    assert.equal(renamedOpen.status, 303);
    assert.equal(renamedOpen.headers.get('location'), '/projects/1?filter=Open');
    const detail = await html('/projects/1');
    const renamedRows = rows(detail);
    assert.equal(renamedRows.length, 2);
    assert.match(renamedRows[0], /data-task-id="1"/);
    assert.match(renamedRows[0], /aria-label="Complete Renamed open"/);
    assert.doesNotMatch(renamedRows[0], / checked/);
    assert.match(renamedRows[1], /data-task-id="2"/);
    assert.match(renamedRows[1], /aria-label="Complete Finished &lt;task&gt; &quot;two&quot;" checked/);
    assert.match(renamedRows[1], /<label for="task-2">Finished &lt;task&gt; &quot;two&quot;<\/label>/);
    assert.match(renamedRows[1], /value="Finished &lt;task&gt; &quot;two&quot;"/);
    assert.equal(rows(await html('/projects/1?filter=Open')).length, 1);
    assert.match(rows(await html('/projects/1?filter=Open'))[0], /Complete Renamed open/);
    assert.equal(rows(await html('/projects/1?filter=Completed')).length, 1);
    assert.match(rows(await html('/projects/1?filter=Completed'))[0], /Complete Finished/);
    assert.equal(await html('/projects/2'), other);
    assert.equal(await html('/'), originalList);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), detail);
    assert.equal(await html('/projects/2'), other);
    assert.equal(await html('/'), originalList);

    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    for (const row of rows(archived)) {
      assert.match(row, /<input id="new-task-title-\d+"[^>]* disabled>/);
      assert.match(row, /<button type="submit" disabled>Rename task<\/button>/);
    }
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Blocked' })).status, 403);
    assert.equal((await post('/projects/1/tasks/2/rename', { title: 'Blocked' })).status, 403);
    assert.equal(await html('/projects/1'), archived);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), detail);
    assert.equal((await post('/projects/1/tasks/2/rename', { title: '  After restoration  ' })).status, 303);
    assert.match(rows(await html('/projects/1?filter=Completed'))[0], /aria-label="Complete After restoration" checked/);
    assert.equal(await html('/'), originalList);
    assert.equal((await post('/projects/1/tasks/2', { completed: '0' })).status, 204);
    assert.equal(rows(await html('/projects/1?filter=Completed')).length, 0);
    const finalDetail = await html('/projects/1');
    const finalList = await html('/');
    assert.match(finalList, /data-testid="project-summary">0\/2 completed/);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), finalDetail);
    assert.equal(await html('/'), finalList);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('priority and completion filters intersect and survive edits, archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-filters-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async (path) => (await fetch(`${server.base}${path}`)).text();
    const ids = (content) => [...content.matchAll(/data-task-id="(\d+)"/g)].map((match) => Number(match[1]));
    const assertFilters = (content, filter, priorityFilter) => {
      for (const [id, selected, options] of [
        ['task-filter', filter, ['All', 'Open', 'Completed']],
        ['priority-filter', priorityFilter, ['All', 'Low', 'Normal', 'High']],
      ]) {
        const select = new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`).exec(content);
        assert.ok(select);
        assert.doesNotMatch(select[0], /disabled/);
        assert.deepEqual([...select[1].matchAll(/<option(?: selected)?>([^<]+)<\/option>/g)].map((match) => match[1]), options);
        assert.match(select[1], new RegExp(`<option selected>${selected}</option>`));
      }
    };
    await post('/projects', { name: 'One' });
    await post('/projects', { name: 'Two' });
    const tasks = [];
    for (const priority of ['Low', 'Normal', 'High']) {
      for (const completed of [false, true]) {
        const id = tasks.length + 1;
        await post('/projects/1/tasks', { title: `${priority} ${completed ? 'done' : 'open'}` });
        await post(`/projects/1/tasks/${id}/priority`, { priority });
        if (completed) await post(`/projects/1/tasks/${id}`, { completed: '1' });
        tasks.push({ id, priority, completed });
      }
    }
    await post('/projects/2/tasks', { title: 'Other project' });
    const original = await html('/projects/1');
    const summary = await html('/');
    assert.match(summary, /data-testid="project-summary">3\/6 completed/);
    assertFilters(original, 'All', 'All');
    // Execute the served script with a small DOM adapter to verify change handlers.
    const control = (value) => ({
      value, listeners: {},
      addEventListener(event, listener) { this.listeners[event] = listener; },
    });
    const completionFilter = control('All');
    const priorityFilter = control('High');
    const submissions = [];
    const filterForm = { requestSubmit() { submissions.push([completionFilter.value, priorityFilter.value]); } };
    completionFilter.form = priorityFilter.form = filterForm;
    const prioritySelect = control('Low');
    let prioritySubmitted = false;
    prioritySelect.form = { requestSubmit() { prioritySubmitted = true; } };
    const checkbox = Object.assign(control(), { dataset: { taskId: '5' }, checked: true });
    const alert = { hidden: true };
    let reloads = 0;
    let saveSucceeds = true;
    runInNewContext(/<script>([\s\S]*?)<\/script>/.exec(original)[1], {
      document: {
        getElementById: (id) => ({ 'task-filter': completionFilter, 'priority-filter': priorityFilter, 'task-error': alert })[id],
        querySelectorAll: (selector) => selector === '[data-task-priority]' ? [prioritySelect] : [checkbox],
      },
      window: { location: { reload() { reloads++; } } },
      URLSearchParams,
      fetch: async (path, options) => saveSucceeds ? fetch(`${server.base}${path}`, options) : { ok: false },
    });
    priorityFilter.listeners.change({ target: priorityFilter });
    completionFilter.value = 'Open';
    completionFilter.listeners.change({ target: completionFilter });
    assert.deepEqual(submissions, [['All', 'High'], ['Open', 'High']]);
    prioritySelect.listeners.change();
    assert.equal(prioritySubmitted, true);
    completionFilter.value = 'All';
    await checkbox.listeners.change();
    assert.equal(reloads, 1); // Priority-only filtering also re-evaluates completion edits.
    assert.equal(priorityFilter.value, 'High');
    assert.equal(completionFilter.value, 'All');
    assert.equal(checkbox.disabled, false);
    checkbox.checked = false;
    await checkbox.listeners.change();
    assert.equal(reloads, 2);
    saveSucceeds = false;
    checkbox.checked = true;
    await checkbox.listeners.change();
    assert.equal(checkbox.checked, false);
    assert.equal(alert.hidden, false);
    assert.equal(reloads, 2);
    assert.equal(await html('/'), summary);
    for (const filter of ['All', 'Open', 'Completed']) {
      for (const priorityFilter of ['All', 'Low', 'Normal', 'High']) {
        const content = await html(`/projects/1?${new URLSearchParams({ filter, priorityFilter })}`);
        assertFilters(content, filter, priorityFilter);
        assert.deepEqual(ids(content), tasks.filter((task) =>
          (filter === 'All' || task.completed === (filter === 'Completed')) &&
          (priorityFilter === 'All' || task.priority === priorityFilter)).map((task) => task.id));
      }
    }
    assert.equal(await html('/projects/1'), original);
    assert.equal(await html('/'), summary);
    assertFilters(await html('/projects/1?filter=Unknown&priorityFilter=Urgent'), 'All', 'All');

    const filters = { filter: 'Completed', priorityFilter: 'High' };
    const path = '/projects/1?filter=Completed&priorityFilter=High';
    const invalid = await post('/projects/1/tasks/6/rename', { ...filters, title: '   ' });
    assert.equal(invalid.status, 400);
    const errorPage = await invalid.text();
    assertFilters(errorPage, 'Completed', 'High');
    assert.deepEqual(ids(errorPage), [6]);
    assert.match(errorPage, /Task title is required/);
    const renamed = await post('/projects/1/tasks/6/rename', { ...filters, title: '  Renamed high  ' });
    assert.equal(renamed.headers.get('location'), path);
    const renamedPage = await html(path);
    assertFilters(renamedPage, 'Completed', 'High');
    assert.match(renamedPage, /aria-label="Complete Renamed high" checked/);
    assert.deepEqual(ids(renamedPage), [6]);
    assert.match(renamedPage, /name="priorityFilter" value="High"/);
    assert.equal(await html('/'), summary);

    const changed = await post('/projects/1/tasks/6/priority', { ...filters, priority: 'Low' });
    assert.equal(changed.headers.get('location'), path);
    assertFilters(await html(path), 'Completed', 'High');
    assert.deepEqual(ids(await html(path)), []);
    assert.deepEqual(ids(await html('/projects/1?filter=Completed&priorityFilter=Low')), [2, 6]);
    assert.equal(await html('/'), summary);
    await post('/projects/1/tasks/5', { completed: '1' });
    assert.deepEqual(ids(await html(path)), [5]);
    await post('/projects/1/tasks/5', { completed: '0' });
    assert.deepEqual(ids(await html(path)), []);
    const saved = await html('/projects/1');
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), saved);
    assert.equal(await html('/'), summary);
    assert.deepEqual(ids(await html('/projects/1?filter=Completed&priorityFilter=Low')), [2, 6]);

    await post('/projects/1/archive');
    const archivedPath = '/projects/1?filter=Completed&priorityFilter=Low';
    const archived = await html(archivedPath);
    assertFilters(archived, 'Completed', 'Low');
    assert.deepEqual(ids(archived), [2, 6]);
    assert.match(archived, /Archived project/);
    assert.equal((archived.match(/data-task-priority disabled/g) || []).length, 2);
    const blocked = await post('/projects/1/tasks/6/priority', {
      filter: 'Completed', priorityFilter: 'Low', priority: 'High',
    });
    assert.equal(blocked.status, 403);
    assertFilters(await blocked.text(), 'Completed', 'Low');
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html(archivedPath), archived);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), saved);
    assert.equal(await html('/'), summary);
    assertFilters(await html('/projects/1'), 'All', 'All');
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
