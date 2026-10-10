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
    assert.match(detail, /<input id="task-due-date-73" name="dueDate" type="text" value="">/);
    assert.match(detail, /aria-label="Complete Existing task" checked>/);
    assert.match(detail, /<option>Low<\/option><option selected>Normal<\/option><option>High<\/option>/);
    assert.match(detail, /<select id="default-task-priority" name="priority"><option>Low<\/option><option selected>Normal<\/option><option>High<\/option><\/select>/);
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

test('due dates preserve task data and filters and survive migration, rename, archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-due-dates-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async (path) => (await fetch(`${server.base}${path}`)).text();
    const assertDate = (content, id, date, disabled = false) => {
      assert.match(content, new RegExp(`<label for="task-due-date-${id}">Task due date</label>`));
      assert.match(content, new RegExp(`<input id="task-due-date-${id}" name="dueDate" type="text" value="${date}"${disabled ? ' disabled' : ''}>`));
      assert.match(content, new RegExp(`<button type="submit"${disabled ? ' disabled' : ''}>Save due date</button>`));
    };
    const withoutDates = (content) => content.replace(/(id="task-due-date-\d+"[^>]*value=")[^"]*/g, '$1');
    await post('/projects', { name: 'One' });
    await post('/projects', { name: 'Two' });
    await post('/projects/1/tasks', { title: 'First' });
    await post('/projects/1/tasks', { title: 'Second' });
    await post('/projects/2/tasks', { title: 'Other' });
    await post('/projects/1/tasks/1', { completed: '1' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    const initial = await html('/projects/1');
    assertDate(initial, 1, '');
    assertDate(initial, 2, '');
    const other = await html('/projects/2');
    const summary = await html('/');
    const filters = { filter: 'Completed', priorityFilter: 'High' };
    const filteredPath = '/projects/1?filter=Completed&priorityFilter=High';
    const filteredInitial = await html(filteredPath);
    const saved = await post('/projects/1/tasks/1/due-date', { ...filters, dueDate: ' \t2000-02-29\n ' });
    assert.equal(saved.status, 303);
    assert.equal(saved.headers.get('location'), filteredPath);
    const filteredSaved = await html(filteredPath);
    assertDate(filteredSaved, 1, '2000-02-29');
    assert.equal(withoutDates(filteredSaved), withoutDates(filteredInitial));
    assert.equal(withoutDates(await html('/projects/1')), withoutDates(initial));
    assert.equal(await html('/projects/2'), other);
    assert.equal(await html('/'), summary);
    for (const dueDate of ['1900-02-29', '2026-04-31', '0000-01-01', '2026-1-01', '<script>bad</script>']) {
      const invalid = await post('/projects/1/tasks/1/due-date', { ...filters, dueDate });
      assert.equal(invalid.status, 400);
      const errorPage = await invalid.text();
      assert.match(errorPage, /role="alert"[^>]*>Due date must be a valid YYYY-MM-DD date/);
      assertDate(errorPage, 1, '2000-02-29');
      assert.match(errorPage, /<option selected>Completed<\/option>/);
      assert.match(errorPage, /<select id="priority-filter"[^>]*>[\s\S]*?<option selected>High<\/option>/);
      assert.equal(await html(filteredPath), filteredSaved);
    }
    for (const path of ['/projects/2/tasks/1/due-date', '/projects/1/tasks/999/due-date',
      '/projects/999/tasks/1/due-date', '/projects/1/tasks/9007199254740992/due-date']) {
      assert.equal((await post(path, { dueDate: '2026-01-01' })).status, 404);
    }
    await post('/projects/1/tasks/2/due-date', { dueDate: '9999-12-31' });
    await post('/projects/2/tasks/3/due-date', { dueDate: '0001-01-01' });
    await post('/projects/1/tasks/1/rename', { ...filters, title: 'Renamed' });
    const detail = await html('/projects/1');
    assertDate(detail, 1, '2000-02-29');
    assertDate(detail, 2, '9999-12-31');
    assert.match(detail, /aria-label="Complete Renamed" checked/);
    const savedOther = await html('/projects/2');
    assertDate(savedOther, 3, '0001-01-01');
    assert.equal(await html('/'), summary);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), detail);
    assert.equal(await html('/projects/2'), savedOther);
    assert.equal(await html('/'), summary);

    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    assertDate(archived, 1, '2000-02-29', true);
    assertDate(archived, 2, '9999-12-31', true);
    const blocked = await post('/projects/1/tasks/1/due-date', { ...filters, dueDate: '' });
    assert.equal(blocked.status, 403);
    assertDate(await blocked.text(), 1, '2000-02-29', true);
    assert.equal(await html('/projects/1'), archived);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), detail);
    for (const dueDate of ['', ' \t\n ']) {
      await post('/projects/1/tasks/1/due-date', { ...filters, dueDate: '2024-02-29' });
      const cleared = await post('/projects/1/tasks/1/due-date', { ...filters, dueDate });
      assert.equal(cleared.status, 303);
      assert.equal(cleared.headers.get('location'), filteredPath);
      assertDate(await html(filteredPath), 1, '');
      assertDate(await html('/projects/1'), 2, '9999-12-31');
      assert.equal(withoutDates(await html('/projects/1')), withoutDates(detail));
    }
    const final = await html('/projects/1');
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), final);
    assert.equal(await html('/projects/2'), savedOther);
    assert.equal(await html('/'), summary);
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
    const defaultPrioritySelect = control('Normal');
    let defaultSubmitted = false;
    defaultPrioritySelect.form = { requestSubmit() { defaultSubmitted = true; } };
    let prioritySubmitted = false;
    prioritySelect.form = { requestSubmit() { prioritySubmitted = true; } };
    const checkbox = Object.assign(control(), { dataset: { taskId: '5' }, checked: true });
    const alert = { hidden: true };
    let reloads = 0;
    let saveSucceeds = true;
    runInNewContext(/<script>([\s\S]*?)<\/script>/.exec(original)[1], {
      document: {
        getElementById: (id) => ({ 'task-filter': completionFilter, 'priority-filter': priorityFilter, 'default-task-priority': defaultPrioritySelect, 'task-error': alert })[id],
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
    defaultPrioritySelect.listeners.change({ target: defaultPrioritySelect });
    assert.equal(defaultSubmitted, true);
    assert.equal(priorityFilter.value, 'High');
    assert.equal(completionFilter.value, 'Open');
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

test('project defaults affect only future tasks and persist independently through archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-defaults-'));
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
    const assertDefault = (content, priority, disabled = false) => {
      assert.match(content, /<label for="default-task-priority">Default task priority<\/label>/);
      const select = /<select id="default-task-priority"[^>]*>([\s\S]*?)<\/select>/.exec(content);
      assert.ok(select);
      assert.equal(select[0].includes(' disabled'), disabled);
      assert.deepEqual([...select[1].matchAll(/<option(?: selected)?>([^<]+)<\/option>/g)].map((match) => match[1]),
        ['Low', 'Normal', 'High']);
      assert.match(select[1], new RegExp(`<option selected>${priority}</option>`));
    };
    const assertTask = (row, id, title, priority, completed = false) => {
      assert.match(row, new RegExp(`data-task-id="${id}"`));
      assert.match(row, new RegExp(`aria-label="Complete ${title}"${completed ? ' checked' : ''}>`));
      assert.match(/<select[^>]*data-task-priority[^>]*>([\s\S]*?)<\/select>/.exec(row)[1],
        new RegExp(`<option selected>${priority}</option>`));
    };
    await post('/projects', { name: 'One' });
    await post('/projects', { name: 'Two' });
    assertDefault(await html('/projects/1'), 'Normal');
    assertDefault(await html('/projects/2'), 'Normal');
    await post('/projects/1/tasks', { title: 'Original' });
    await post('/projects/1/tasks/1', { completed: '1' });
    await post('/projects/2/tasks', { title: 'Other' });
    const initial = await html('/projects/1');
    const other = await html('/projects/2');
    const summary = await html('/');
    const filters = { filter: 'Completed', priorityFilter: 'Normal' };
    const filteredPath = '/projects/1?filter=Completed&priorityFilter=Normal';
    const filteredRows = rows(await html(filteredPath));
    for (const priority of ['', 'Urgent', 'normal']) {
      assert.equal((await post('/projects/1/default-priority', { ...filters, priority })).status, 400);
      assert.equal(await html('/projects/1'), initial);
    }
    assert.equal((await post('/projects/999/default-priority', { priority: 'High' })).status, 404);
    for (const priority of ['Low', 'Normal', 'High']) {
      const changed = await post('/projects/1/default-priority', { ...filters, priority });
      assert.equal(changed.status, 303);
      assert.equal(changed.headers.get('location'), filteredPath);
      const filtered = await html(changed.headers.get('location'));
      assertDefault(filtered, priority);
      assert.match(filtered, /<option selected>Completed<\/option>/);
      assert.match(filtered, /<select id="priority-filter"[^>]*><option>All<\/option><option>Low<\/option><option selected>Normal<\/option>/);
      assert.deepEqual(rows(filtered), filteredRows);
      assert.equal(await html('/projects/2'), other);
      assert.equal(await html('/'), summary);
    }
    await post('/projects/1/tasks', { title: 'Inherited high' });
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Inherited low' });
    await post('/projects/2/tasks', { title: 'Still normal' });
    let taskRows = rows(await html('/projects/1'));
    assert.equal(taskRows.length, 3);
    assertTask(taskRows[0], 1, 'Original', 'Normal', true);
    assertTask(taskRows[1], 3, 'Inherited high', 'High');
    assertTask(taskRows[2], 4, 'Inherited low', 'Low');
    const otherRows = rows(await html('/projects/2'));
    assertTask(otherRows[0], 2, 'Other', 'Normal');
    assertTask(otherRows[1], 5, 'Still normal', 'Normal');
    await post('/projects/1/rename', { name: 'Renamed project' });
    await post('/projects/1/tasks/3/rename', { title: 'Renamed task' });
    await post('/projects/1/tasks/3/priority', { priority: 'Normal' });
    assertDefault(await html('/projects/1'), 'Low');
    const saved = await html('/projects/1');
    const savedOther = await html('/projects/2');
    const savedSummary = await html('/');
    assert.match(savedSummary, /data-testid="project-summary">1\/3 completed/);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), saved);
    assert.equal(await html('/projects/2'), savedOther);
    assert.equal(await html('/'), savedSummary);

    await post('/projects/1/archive');
    const archived = await html(filteredPath);
    assertDefault(archived, 'Low', true);
    const blocked = await post('/projects/1/default-priority', { ...filters, priority: 'High' });
    assert.equal(blocked.status, 403);
    assertDefault(await blocked.text(), 'Low', true);
    assert.equal(await html(filteredPath), archived);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html(filteredPath), archived);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), saved);
    assert.equal(await html('/'), savedSummary);
    await post('/projects/1/tasks', { title: 'After restoration' });
    taskRows = rows(await html('/projects/1'));
    assertTask(taskRows[3], 6, 'After restoration', 'Low');
    await post('/projects/1/default-priority', { priority: 'High' });
    assertDefault(await html('/projects/1'), 'High');
    assert.deepEqual(rows(await html('/projects/1')), taskRows);
    assert.equal(await html('/projects/2'), savedOther);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('due ranges intersect filters, preserve applied state during edits and errors, and work while archived', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-ranges-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async (path) => (await fetch(`${server.base}${path}`)).text();
    const ids = (content) => [...content.matchAll(/data-task-id="(\d+)"/g)].map((match) => Number(match[1]));
    await post('/projects', { name: 'Dates' });
    await post('/projects', { name: 'Other' });
    const tasks = [];
    for (const date of ['', '2024-02-28', '2024-02-29', '2024-03-01']) {
      for (const priority of ['Low', 'Normal', 'High']) {
        for (const completed of [false, true]) {
          const id = tasks.length + 1;
          await post('/projects/1/tasks', { title: `Task ${id}` });
          await post(`/projects/1/tasks/${id}/due-date`, { dueDate: date });
          await post(`/projects/1/tasks/${id}/priority`, { priority });
          await post(`/projects/1/tasks/${id}`, { completed: completed ? '1' : '0' });
          tasks.push({ id, date, priority, completed });
        }
      }
    }
    await post('/projects/2/tasks', { title: 'Separate task' });
    const summary = await html('/');
    const other = await html('/projects/2');
    const original = await html('/projects/1');
    assert.match(original, /<label for="due-from">Due from<\/label>/);
    assert.match(original, /<label for="due-through">Due through<\/label>/);
    assert.match(original, /id="due-from"[^>]*value=""/);
    assert.match(original, /id="due-through"[^>]*value=""/);
    for (const [from, through] of [
      ['', ''], ['2024-02-29', ''], ['', '2024-02-29'], ['2024-02-29', '2024-02-29'],
    ]) {
      for (const filter of ['All', 'Open', 'Completed']) {
        for (const priorityFilter of ['All', 'Low', 'Normal', 'High']) {
          const applied = await post('/projects/1/due-range', {
            filter, priorityFilter, dueFrom: ` ${from} `, dueThrough: ` ${through} `,
          });
          assert.equal(applied.status, 303);
          const content = await html(applied.headers.get('location'));
          assert.deepEqual(ids(content), tasks.filter((task) =>
            (filter === 'All' || task.completed === (filter === 'Completed')) &&
            (priorityFilter === 'All' || task.priority === priorityFilter) &&
            ((!from && !through) || (task.date && (!from || task.date >= from) && (!through || task.date <= through)))
          ).map((task) => task.id));
        }
      }
    }
    assert.equal(await html('/projects/1'), original);
    assert.equal(await html('/'), summary);
    const state = { filter: 'Open', priorityFilter: 'High', rangeFrom: '2024-02-29', rangeThrough: '2024-03-01' };
    const path = `/projects/1?${new URLSearchParams(state)}`;
    assert.deepEqual(ids(await html(path)), [17, 23]);
    for (const [dueFrom, dueThrough, error] of [
      ['2024-02-30', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['', '0000-01-01', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-03-02', '2024-03-01', 'Due from must not be after Due through'],
    ]) {
      const result = await post('/projects/1/due-range', { ...state, dueFrom, dueThrough });
      assert.equal(result.status, 400);
      const content = await result.text();
      assert.match(content, new RegExp(`role="alert"[^>]*>${error}`));
      assert.deepEqual(ids(content), [17, 23]);
      assert.match(content, /<option selected>Open<\/option>/);
      assert.match(content, /<option selected>High<\/option>/);
    }
    for (const [route, values] of [
      ['/rename', { name: ' Renamed dates ' }],
      ['/tasks/17/rename', { title: ' Renamed task ' }],
      ['/default-priority', { priority: 'High' }],
      ['/tasks', { title: 'New undated task' }],
    ]) {
      const result = await post(`/projects/1${route}`, { ...state, ...values });
      assert.equal(result.status, 303);
      assert.equal(result.headers.get('location'), path);
      assert.deepEqual(ids(await html(path)), [17, 23]);
    }
    const moveDate = await post('/projects/1/tasks/17/due-date', { ...state, dueDate: '2024-02-28' });
    assert.equal(moveDate.headers.get('location'), path);
    assert.deepEqual(ids(await html(path)), [23]);
    const movePriority = await post('/projects/1/tasks/23/priority', { ...state, priority: 'Low' });
    assert.equal(movePriority.headers.get('location'), path);
    assert.deepEqual(ids(await html(path)), []);
    await post('/projects/1/tasks/23/priority', { ...state, priority: 'High' });
    await post('/projects/1/tasks/23', { completed: '1' });
    assert.deepEqual(ids(await html(path)), []);
    await post('/projects/1/tasks/23', { completed: '0' });
    await post('/projects/1/tasks/23/due-date', { ...state, dueDate: '  ' });
    assert.deepEqual(ids(await html(path)), []);
    await post('/projects/1/tasks/23/due-date', { ...state, dueDate: '2024-03-01' });
    assert.deepEqual(ids(await html(path)), [23]);
    assert.equal(await html('/projects/2'), other.replace('<option value="1">Dates</option>', '<option value="1">Renamed dates</option>'));

    // Due-only filtering also triggers membership refresh on a completion change.
    const rangePage = await html('/projects/1?rangeFrom=2024-02-29');
    const checkbox = { dataset: { taskId: '23' }, checked: true, addEventListener(event, listener) { this.change = listener; } };
    let reloads = 0;
    runInNewContext(/<script>([\s\S]*?)<\/script>/.exec(rangePage)[1], {
      document: {
        getElementById: (id) => id === 'task-error' ? {} : { value: 'All', addEventListener() {} },
        querySelectorAll: (selector) => selector === '[data-task-id]' ? [checkbox] : [],
      },
      window: { location: { reload() { reloads++; } } }, URLSearchParams,
      fetch: (route, options) => fetch(`${server.base}${route}`, options),
    });
    await checkbox.change();
    assert.equal(reloads, 1);
    assert.deepEqual(ids(await html(path)), []);
    await post('/projects/1/tasks/23', { completed: '0' });
    const saved = await html('/projects/1');
    const savedSummary = await html('/');
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), saved);
    assert.equal(await html('/'), savedSummary);
    assert.deepEqual(ids(await html(path)), [23]);
    await post('/projects/1/archive');
    const archived = await html(path);
    for (const id of ['due-from', 'due-through', 'task-filter', 'priority-filter']) {
      assert.doesNotMatch(new RegExp(`<(?:input|select) id="${id}"[^>]*>`).exec(archived)[0], /disabled/);
    }
    assert.match(archived, /id="task-due-date-23"[^>]* disabled/);
    assert.match(archived, /disabled>Save due date/);
    const appliedArchived = await post('/projects/1/due-range', { ...state, dueFrom: '2024-03-01', dueThrough: '2024-03-01' });
    assert.equal(appliedArchived.status, 303);
    assert.deepEqual(ids(await html(appliedArchived.headers.get('location'))), [23]);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html(path), archived);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), saved);
    assert.equal(await html('/'), savedSummary);
    assert.equal(await html('/projects/2'), other.replace('<option value="1">Dates</option>', '<option value="1">Renamed dates</option>'));
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('moving tasks appends in project order, preserves saved fields and filters, and rejects ineligible projects', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-moves-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    // Seed a pre-move database to verify that migration retains existing task order.
    const legacy = new DatabaseSync(databasePath);
    legacy.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id),
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO projects (name) VALUES ('Source');
      INSERT INTO tasks (project_id, title) VALUES (1, 'First'), (1, 'Remaining');
    `);
    legacy.close();
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async (path) => (await fetch(`${server.base}${path}`)).text();
    const ids = (content) => [...content.matchAll(/data-task-id="(\d+)"/g)].map((match) => Number(match[1]));
    const rows = (content) => [...content.matchAll(/<div class="task" data-testid="task-row">([\s\S]*?)<\/div>/g)].map((match) => match[1]);
    const destinations = (row) => /<select id="destination-project-\d+"[^>]*>([\s\S]*?)<\/select>/.exec(row);
    assert.deepEqual(ids(await html('/projects/1')), [1, 2]);
    for (const row of rows(await html('/projects/1'))) {
      assert.match(destinations(row)[0], /disabled><\/select>/);
      assert.match(row, /disabled>Move task/);
    }
    await post('/projects', { name: 'Destination' });
    await post('/projects', { name: 'Third' });
    await post('/projects', { name: 'Archived destination' });
    await post('/projects/4/archive');
    await post('/projects/2/tasks', { title: 'Existing destination task' }); // ID 3
    await post('/projects/1/tasks/1', { completed: '1' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
    await post('/projects/1/tasks/2/priority', { priority: 'High' });
    await post('/projects/1/tasks/2/due-date', { dueDate: '2024-02-29' });
    await post('/projects/2/default-priority', { priority: 'Low' });
    await post('/projects/2/rename', { name: 'Renamed <destination>' });
    const source = await html('/projects/1');
    assert.equal(destinations(rows(source)[0])[1],
      '<option value="2">Renamed &lt;destination&gt;</option><option value="3">Third</option>');
    const state = { filter: 'Completed', priorityFilter: 'High', rangeFrom: '2024-02-29', rangeThrough: '2024-02-29' };
    const path = `/projects/1?${new URLSearchParams(state)}`;
    const filtered = await html(path);
    assert.deepEqual(ids(filtered), [1]);
    assert.match(rows(filtered)[0], /name="filter" value="Completed"/);
    assert.match(rows(filtered)[0], /name="priorityFilter" value="High"/);
    assert.match(rows(filtered)[0], /name="rangeFrom" value="2024-02-29"/);
    assert.match(rows(filtered)[0], /name="rangeThrough" value="2024-02-29"/);
    for (const destinationProject of ['', '1', '4', '999', '2x', '9007199254740992']) {
      const result = await post('/projects/1/tasks/1/move', { ...state, destinationProject });
      assert.equal(result.status, 400);
      assert.match(await result.text(), /Choose an active destination project/);
      assert.equal(await html('/projects/1'), source);
      assert.deepEqual(ids(await html('/projects/2')), [3]);
    }
    assert.equal((await post('/projects/2/tasks/1/move', { destinationProject: '3' })).status, 404);
    const moved = await post('/projects/1/tasks/1/move', { ...state, destinationProject: '2' });
    assert.equal(moved.status, 303);
    assert.equal(moved.headers.get('location'), path);
    const after = await html(path);
    assert.deepEqual(ids(after), []);
    assert.match(after, /<option selected>Completed<\/option>/);
    assert.match(after, /<select id="priority-filter"[^>]*>.*<option selected>High<\/option>/);
    assert.match(after, /id="due-from"[^>]*value="2024-02-29"/);
    assert.match(after, /id="due-through"[^>]*value="2024-02-29"/);
    assert.deepEqual(ids(await html('/projects/1')), [2]);
    const destination = await html('/projects/2');
    assert.deepEqual(ids(destination), [3, 1]); // Older ID is appended after destination's task.
    const movedRow = rows(destination)[1];
    assert.match(movedRow, /aria-label="Complete First" checked/);
    assert.match(movedRow, /data-task-priority>.*<option selected>High<\/option>/);
    assert.match(movedRow, /id="task-due-date-1"[^>]*value="2024-02-29"/);
    assert.equal(destinations(movedRow)[1], '<option value="1">Source</option><option value="3">Third</option>');
    const summaries = await html('/');
    assert.match(summaries, /data-testid="project-summary">0\/1 completed/);
    assert.match(summaries, /data-testid="project-summary">1\/2 completed/);
    assert.equal((await post('/projects/1/tasks/1/move', { destinationProject: '3' })).status, 404);
    await post('/projects/2/tasks', { title: 'Created after move' }); // ID 4, inherits Low.
    assert.deepEqual(ids(await html('/projects/2')), [3, 1, 4]);
    assert.match(rows(await html('/projects/2'))[2], /data-task-priority>.*<option selected>Low<\/option>/);
    const savedSource = await html('/projects/1');
    const savedDestination = await html('/projects/2');
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), savedSource);
    assert.equal(await html('/projects/2'), savedDestination);

    await post('/projects/2/archive');
    const archived = await html('/projects/2');
    for (const row of rows(archived)) {
      assert.match(destinations(row)[0], / disabled/);
      assert.match(row, /disabled>Move task/);
    }
    assert.equal((await post('/projects/2/tasks/1/move', { ...state, destinationProject: '3' })).status, 403);
    assert.equal((await post('/projects/1/tasks/2/move', { destinationProject: '2' })).status, 400);
    assert.equal(destinations(rows(await html('/projects/1'))[0])[1], '<option value="3">Third</option>');
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/projects/2'), archived);
    await post('/projects/2/restore');
    assert.equal(await html('/projects/2'), savedDestination);
    await post('/projects/2/tasks/1/move', { destinationProject: '1' });
    assert.deepEqual(ids(await html('/projects/1')), [1, 2]);
    assert.deepEqual(ids(await html('/projects/2')), [3, 4]);
    // Moving a task with a blank due date also preserves its saved fields.
    await post('/projects/2/tasks/3/move', { destinationProject: '1' });
    assert.deepEqual(ids(await html('/projects/1')), [1, 2, 3]);
    assert.match(rows(await html('/projects/1'))[2], /id="task-due-date-3"[^>]*value=""/);
    await post('/projects/1/tasks', { title: 'After returned tasks' });
    assert.deepEqual(ids(await html('/projects/1')), [1, 2, 3, 5]);
    await post('/projects/1/tasks/1/rename', { title: 'Returned task' });
    const returned = rows(await html('/projects/1'))[0];
    assert.match(returned, /aria-label="Complete Returned task" checked/);
    assert.match(returned, /data-task-priority>.*<option selected>High<\/option>/);
    assert.match(returned, /id="task-due-date-1"[^>]*value="2024-02-29"/);
    const finalSource = await html('/projects/1');
    const finalDestination = await html('/projects/2');
    const finalSummaries = await html('/');
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), finalSource);
    assert.equal(await html('/projects/2'), finalDestination);
    assert.equal(await html('/'), finalSummaries);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('returning tasks restore independent remembered positions across restarts and edits', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-return-order-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    // Task 011 positions may differ from task ID order after earlier moves.
    const legacy = new DatabaseSync(databasePath);
    legacy.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id),
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
        position INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO projects (name) VALUES ('Original'), ('Second'), ('Third');
      INSERT INTO tasks (id, project_id, title, position) VALUES
        (1, 1, 'Middle', 5), (2, 1, 'Last', 8), (3, 1, 'First', 2),
        (4, 2, 'Second native', 1);
    `);
    legacy.close();
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async (path) => (await fetch(`${server.base}${path}`)).text();
    const ids = async (projectId) => [...(await html(`/projects/${projectId}`)).matchAll(/data-task-id="(\d+)"/g)]
      .map((match) => Number(match[1]));
    const move = async (taskId, sourceId, destinationId, state = {}) => {
      const result = await post(`/projects/${sourceId}/tasks/${taskId}/move`, {
        ...state, destinationProject: String(destinationId),
      });
      assert.equal(result.status, 303);
      return result;
    };
    assert.deepEqual(await ids(1), [3, 1, 2]);
    await move(3, 1, 2);
    await move(2, 1, 2);
    assert.deepEqual(await ids(2), [4, 3, 2]);
    await move(4, 2, 3);
    await post('/projects/1/tasks', { title: 'New after reserved positions' }); // ID 5
    await move(4, 3, 1); // First visit follows every previously established slot.
    assert.deepEqual(await ids(1), [1, 5, 4]);

    await post('/projects/2/tasks/3/rename', { title: ' Latest title ' });
    await post('/projects/2/tasks/3', { completed: '1' });
    await post('/projects/2/tasks/3/priority', { priority: 'High' });
    await post('/projects/2/tasks/3/due-date', { dueDate: '2024-02-29' });
    await post('/projects/1/rename', { name: 'Renamed original' });
    await post('/projects/1/archive');
    assert.equal((await post('/projects/2/tasks/3/move', { destinationProject: '1' })).status, 400);
    await server.stop();
    server = await startServer(databasePath);
    await post('/projects/1/restore');

    // Return in reverse order: both remembered slots still precede new arrivals.
    await move(2, 2, 1);
    assert.deepEqual(await ids(1), [1, 2, 5, 4]);
    const state = { filter: 'Completed', priorityFilter: 'High', rangeFrom: '2024-02-29', rangeThrough: '2024-02-29' };
    const moved = await move(3, 2, 1, state);
    assert.equal(moved.headers.get('location'), `/projects/2?${new URLSearchParams(state)}`);
    assert.deepEqual(await ids(1), [3, 1, 2, 5, 4]);
    const current = await html('/projects/1');
    assert.match(current, /aria-label="Complete Latest title" checked/);
    assert.match(current, /id="task-priority-3"[^>]*>.*<option selected>High<\/option>/);
    assert.match(current, /id="task-due-date-3"[^>]*value="2024-02-29"/);
    assert.match(await html('/'), /data-testid="project-summary">1\/5 completed/);

    // All tasks leave the destination. A new task must follow even absent slots.
    await post('/projects/2/tasks', { title: 'After all absent slots' }); // ID 6
    await move(2, 1, 3);
    await move(3, 1, 3);
    await server.stop();
    server = await startServer(databasePath);
    await move(2, 3, 2); // Returns to its second-project slot before task 6.
    await move(3, 3, 2);
    await move(4, 1, 2);
    assert.deepEqual(await ids(2), [4, 3, 2, 6]);
    assert.deepEqual(await ids(1), [1, 5]);
    assert.deepEqual(await ids(3), []);
    await move(4, 2, 3);
    await move(3, 2, 3);
    await move(2, 2, 3);
    assert.deepEqual(await ids(3), [4, 2, 3]); // Independent third-project history.
    const saved = await html('/projects/3');
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/projects/3'), saved);
    await move(2, 3, 1);
    await move(3, 3, 1);
    await move(4, 3, 1);
    assert.deepEqual(await ids(1), [3, 1, 2, 5, 4]);
    assert.match(await html('/'), /data-testid="project-summary">1\/5 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project search intersects archive filter, retains creation order and summaries, and resets on navigation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-project-search-'));
  let server;
  try {
    server = await startServer(join(directory, 'workboard.sqlite'));
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async (path) => (await fetch(`${server.base}${path}`)).text();
    const names = (content) => [...content.matchAll(/data-testid="project-row">\s*<span>(.*?)<\/span>/g)]
      .map((match) => match[1]);
    for (const name of ['Alpha  Team', 'Other', 'aLPHA team', 'Alpha archived', 'Équipe']) {
      await post('/projects', { name });
    }
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks/1', { completed: '1' });
    await post('/projects/4/archive');
    const path = '/?projectSearch=%20AlPhA%20';
    const filtered = await html(path);
    assert.deepEqual(names(filtered), ['Alpha  Team', 'aLPHA team']);
    assert.match(filtered, /data-testid="project-summary">1\/1 completed/);
    assert.match(filtered, /<label for="project-search">Project search<\/label>/);
    assert.match(filtered, />Search projects<\/button>/);
    assert.match(filtered, /id="project-search"[^>]*value="AlPhA"/);
    assert.match(filtered, /method="get" action="\/">\s*<input type="hidden" name="projectSearch" value="AlPhA">/);
    assert.deepEqual(names(await html('/?projectSearch=alpha%20team')), ['aLPHA team']);
    assert.deepEqual(names(await html('/?projectSearch=alpha%20%20team')), ['Alpha  Team']);
    assert.deepEqual(names(await html('/?projectSearch=%C3%A9quipe')), []);
    assert.deepEqual(names(await html('/?projectSearch=%20%20')), ['Alpha  Team', 'Other', 'aLPHA team', 'Équipe']);
    const archived = await html('/?filter=Archived&projectSearch=ALPHA');
    assert.deepEqual(names(archived), ['Alpha archived']);
    assert.match(archived, /id="project-search"[^>]*value="ALPHA"/);
    assert.match(archived, /method="get" action="\/projects\/4"><button type="submit">Open project/);
    const restored = await post('/projects/4/restore', { projectSearch: 'ALPHA' });
    assert.equal(restored.headers.get('location'), '/?filter=Archived&projectSearch=ALPHA');
    assert.deepEqual(names(await html(restored.headers.get('location'))), []);
    assert.deepEqual(names(await html('/?projectSearch=alpha')), ['Alpha  Team', 'aLPHA team', 'Alpha archived']);
    const project = await html('/projects/1');
    assert.match(project, /class="back" method="get" action="\/"/);
    assert.match(project, /id="task-search"[^>]*value=""/);
    assert.deepEqual(names(await html('/')), ['Alpha  Team', 'Other', 'aLPHA team', 'Alpha archived', 'Équipe']);
    const escaped = await html('/?projectSearch=%22%3E%3Cscript%3E');
    assert.match(escaped, /value="&quot;&gt;&lt;script&gt;"/);
    assert.doesNotMatch(escaped, /value=""><script>/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task search intersects every filter and survives edits, movement, errors, archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-search-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async (path) => (await fetch(`${server.base}${path}`)).text();
    const ids = (content) => [...content.matchAll(/data-task-id="(\d+)"/g)].map((match) => Number(match[1]));
    await post('/projects', { name: 'Source' });
    await post('/projects', { name: 'Destination' });
    for (const title of ['Alpha  one', 'ALPHA two', 'Other', 'alpha later']) {
      await post('/projects/1/tasks', { title });
    }
    for (const taskId of [1, 2, 3]) {
      await post(`/projects/1/tasks/${taskId}/priority`, { priority: 'High' });
      await post(`/projects/1/tasks/${taskId}/due-date`, { dueDate: '2024-02-29' });
    }
    await post('/projects/1/tasks/2', { completed: '1' });
    assert.deepEqual(ids(await html('/projects/1?taskSearch=%20aLpHa%20')), [1, 2, 4]);
    assert.deepEqual(ids(await html('/projects/1?taskSearch=alpha%20one')), []);
    assert.deepEqual(ids(await html('/projects/1?taskSearch=alpha%20%20one')), [1]);
    const state = { filter: 'Open', priorityFilter: 'High', rangeFrom: '2024-02-29', rangeThrough: '2024-02-29', taskSearch: 'alpha' };
    // URL parameter order follows the app's canonical redirects.
    const path = '/projects/1?' + new URLSearchParams({ filter: state.filter, priorityFilter: state.priorityFilter,
      taskSearch: state.taskSearch, rangeFrom: state.rangeFrom, rangeThrough: state.rangeThrough });
    const filtered = await html(path);
    assert.deepEqual(ids(filtered), [1]);
    assert.match(filtered, /<label for="task-search">Task search<\/label>/);
    assert.match(filtered, />Search tasks<\/button>/);
    // Every editing and filtering form carries the applied query. Search itself
    // carries only its visible input, so an old hidden value cannot override it.
    for (const match of filtered.matchAll(/<form[^>]*action="\/projects\/1[^\"]*"[^>]*>([\s\S]*?)<\/form>/g)) {
      assert.match(match[1], /name="taskSearch"[^>]*value="alpha"/);
      assert.equal([...match[1].matchAll(/name="taskSearch"/g)].length, 1);
      assert.match(match[1], /name="filter"[^>]*value="Open"|<option selected>Open/);
      assert.match(match[1], /name="priorityFilter"[^>]*value="High"|<option selected>High/);
      assert.match(match[1], /name="rangeFrom"[^>]*value="2024-02-29"/);
    }
    const change = async (route, values) => {
      const result = await post(route, { ...state, ...values });
      assert.equal(result.status, 303);
      assert.equal(result.headers.get('location'), path);
    };
    await change('/projects/1/tasks/1/rename', { title: 'No longer matches' });
    assert.deepEqual(ids(await html(path)), []);
    await change('/projects/1/tasks/1/rename', { title: 'Latest ALPHA' });
    assert.deepEqual(ids(await html(path)), [1]);
    await change('/projects/1/tasks/1/priority', { priority: 'Low' });
    assert.deepEqual(ids(await html(path)), []);
    await change('/projects/1/tasks/1/priority', { priority: 'High' });
    await change('/projects/1/tasks/1/due-date', { dueDate: '' });
    assert.deepEqual(ids(await html(path)), []);
    await change('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
    await post('/projects/1/tasks/1', { ...state, completed: '1' });
    assert.deepEqual(ids(await html(path)), []);
    await post('/projects/1/tasks/1', { ...state, completed: '0' });
    await change('/projects/1/default-priority', { priority: 'Low' });
    await change('/projects/1/rename', { name: 'Renamed source' });
    await change('/projects/1/tasks', { title: 'Alpha new' });
    assert.deepEqual(ids(await html(path)), [1]);
    for (const [route, values, message] of [
      ['/projects/1/tasks/1/rename', { title: ' ' }, 'Task title is required'],
      ['/projects/1/tasks/1/due-date', { dueDate: '2023-02-29' }, 'Due date must be a valid'],
      ['/projects/1/due-range', { dueFrom: 'bad', dueThrough: '' }, 'Due range must use valid'],
    ]) {
      const result = await post(route, { ...state, ...values });
      assert.equal(result.status, 400);
      const content = await result.text();
      assert.match(content, new RegExp(message));
      assert.deepEqual(ids(content), [1]);
      assert.match(content, /id="task-search"[^>]*value="alpha"/);
    }
    const range = await post('/projects/1/due-range', { ...state, dueFrom: '', dueThrough: '' });
    assert.equal(range.headers.get('location'), '/projects/1?filter=Open&priorityFilter=High&taskSearch=alpha');
    assert.deepEqual(ids(await html('/projects/1?filter=All&priorityFilter=High&taskSearch=alpha')), [1, 2]);
    assert.deepEqual(ids(await html('/projects/1?filter=Open&priorityFilter=High&rangeFrom=2024-02-29')), [1, 3]);
    assert.match(await html('/'), /data-testid="project-summary">1\/5 completed/);
    await change('/projects/1/tasks/1/move', { destinationProject: '2' });
    assert.deepEqual(ids(await html(path)), []);
    assert.deepEqual(ids(await html('/projects/2?taskSearch=alpha')), [1]);
    await post('/projects/2/tasks/1/move', { destinationProject: '1' });
    assert.deepEqual(ids(await html(path)), [1]);
    assert.deepEqual(ids(await html('/projects/1')), [1, 2, 3, 4, 5]);
    await post('/projects/1/archive');
    const archived = await html(path);
    assert.deepEqual(ids(archived), [1]);
    assert.doesNotMatch(/<input id="task-search"[^>]*>/.exec(archived)[0], /disabled/);
    assert.match(archived, /disabled>Rename task/);
    assert.match(archived, /disabled>Move task/);
    const savedSummary = await html('/?filter=Archived');
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html(path), archived);
    assert.equal(await html('/?filter=Archived'), savedSummary);
    await post('/projects/1/restore');
    assert.deepEqual(ids(await html(path)), [1]);
    assert.match(await html('/projects/1'), /id="task-search"[^>]*value=""/);
    assert.deepEqual(ids(await html('/projects/1')), [1, 2, 3, 4, 5]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
