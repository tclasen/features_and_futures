import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('priorities migrate, persist independently, preserve task data, and respect archive state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)));
    INSERT INTO projects (name) VALUES ('First'), ('Second');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing done', 1), (1, 'Existing open', 0), (2, 'Other project', 0);`);
  legacy.close();
  let server;
  let database;
  try {
    server = await start(databasePath);
    database = new DatabaseSync(databasePath);
    const snapshot = () => database.prepare('SELECT * FROM tasks ORDER BY id').all().map((task) => ({ ...task }));
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const read = async (path) => (await fetch(`${server.url}${path}`)).text();
    const selects = (html) => [...html.matchAll(/<select id="task-priority-(\d+)"([^>]*)>\s*([\s\S]*?)<\/select>/g)];
    const selected = (html) => selects(html).map((match) => [Number(match[1]), match[3].match(/<option selected>(\w+)<\/option>/)[1]]);
    const assertOptions = (html, disabled = false) => {
      for (const match of selects(html)) {
        assert.match(html, new RegExp(`<label for="task-priority-${match[1]}">Task priority</label>`));
        assert.deepEqual([...match[3].matchAll(/<option(?: selected)?>(\w+)<\/option>/g)].map((option) => option[1]), ['Low', 'Normal', 'High']);
        assert.equal(match[2].includes(' disabled'), disabled);
        assert.match(match[2], /onchange="this.form.requestSubmit\(\)"/);
      }
    };
    let html = await read('/projects/1');
    assertOptions(html);
    assert.deepEqual(selected(html), [[1, 'Normal'], [2, 'Normal']]);
    assert.deepEqual(selected(await read('/projects/2')), [[3, 'Normal']]);
    await post('/projects/1/tasks', { title: 'New task' });
    assert.deepEqual(selected(await read('/projects/1')), [[1, 'Normal'], [2, 'Normal'], [4, 'Normal']]);
    const before = snapshot();
    const summary = await read('/');
    const result = await post('/projects/1/tasks/1/priority', { priority: 'High', filter: 'Completed' });
    assert.equal(result.status, 303);
    assert.equal(result.headers.get('location'), '/projects/1?filter=Completed');
    assert.equal((await post('/projects/1/tasks/2/priority', { priority: 'Low', filter: 'Open' })).status, 303);
    assert.deepEqual(snapshot(), before.map((task) => ({ ...task, priority: task.id === 1 ? 'High' : task.id === 2 ? 'Low' : 'Normal' })));
    assert.equal(await read('/'), summary);
    assert.deepEqual(selected(await read('/projects/1?filter=Completed')), [[1, 'High']]);
    assert.deepEqual(selected(await read('/projects/1?filter=Open')), [[2, 'Low'], [4, 'Normal']]);
    assert.deepEqual(selected(await read('/projects/2')), [[3, 'Normal']]);
    const changed = snapshot();
    for (const priority of ['', 'Urgent', 'high']) {
      assert.equal((await post('/projects/1/tasks/1/priority', { priority })).status, 400);
    }
    for (const path of ['/projects/2/tasks/1/priority', '/projects/1/tasks/9999/priority', '/projects/9999/tasks/1/priority']) {
      assert.equal((await post(path, { priority: 'Low' })).status, 404);
    }
    assert.deepEqual(snapshot(), changed);
    await post('/projects/1/tasks/1/rename', { title: '  Renamed done  ' });
    html = await read('/projects/1');
    assert.deepEqual(selected(html), [[1, 'High'], [2, 'Low'], [4, 'Normal']]);
    assert.match(html, /aria-label="Complete Renamed done"[^>]* checked/);
    assert.equal(await read('/'), summary);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await read('/projects/1'), html);
    assert.deepEqual(selected(await read('/projects/2')), [[3, 'Normal']]);
    await post('/projects/1/archive');
    const archived = await read('/projects/1');
    assertOptions(archived, true);
    assert.equal(selects(archived).length, 3);
    const archivedData = snapshot();
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Low' })).status, 403);
    assert.deepEqual(snapshot(), archivedData);
    assert.equal(await read('/projects/1'), archived);
    assert.deepEqual(selected(await read('/projects/1?filter=Completed')), [[1, 'High']]);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await read('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await read('/projects/1'), html);
    assertOptions(await read('/projects/1'));
    assert.equal((await post('/projects/1/tasks/2/priority', { priority: 'Normal' })).status, 303);
    const restored = await read('/projects/1');
    assert.deepEqual(selected(restored), [[1, 'High'], [2, 'Normal'], [4, 'Normal']]);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await read('/projects/1'), restored);
    assert.equal(await read('/'), summary);
  } finally {
    if (database) database.close();
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let diagnostics = '';
  child.stderr.on('data', (chunk) => { diagnostics += chunk; });
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server did not start: ${diagnostics}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited (${code}): ${diagnostics}`));
    });
    child.stdout.on('data', (chunk) => {
      const match = String(chunk).match(/listening on port (\d+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() {
      if (child.exitCode !== null) return;
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects validate, render in order, navigate, and persist across restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    let html = await (await fetch(server.url)).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, />Create project<\/button>/);
    assert.doesNotMatch(html, /data-testid="project-row"/);

    const create = (name) => fetch(`${server.url}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    for (const name of ['', '  \t\n ']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    for (const name of ['  Alpha project  ', '<script>alert("x")</script> & café']) {
      const response = await create(name);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    html = await (await fetch(server.url)).text();
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(html, />Alpha project<\/span>/);
    assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; café/);
    assert.ok(html.indexOf('Alpha project') < html.indexOf('&lt;script&gt;'));
    const paths = [...html.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
    assert.equal(paths.length, 2);
    assert.notEqual(paths[0], paths[1]);
    const projectHtml = await (await fetch(`${server.url}${paths[0]}`)).text();
    assert.match(projectHtml, /<h1>Alpha project<\/h1>/);
    assert.match(projectHtml, /action="\/".*>Projects<\/button>/s);

    const invalid = await create('   ');
    assert.equal((await invalid.text()).match(/data-testid="project-row"/g).length, 2);
    await server.stop();
    server = await start(databasePath);
    const persisted = await (await fetch(server.url)).text();
    assert.equal(persisted, html);
    assert.match(await (await fetch(`${server.url}${paths[0]}`)).text(), /<h1>Alpha project<\/h1>/);
    assert.equal((await fetch(`${server.url}/projects/999999`)).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('legacy projects migrate, archive read-only tasks, restore, and retain summaries across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)));
    INSERT INTO projects (name) VALUES ('Existing project');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Done task', 1), (1, 'Open task', 0);`);
  legacy.close();
  let server;
  try {
    server = await start(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const read = async (path) => (await fetch(`${server.url}${path}`)).text();
    const projectRows = (html) => [...html.matchAll(/data-testid="project-row">([\s\S]*?)<\/div>\s*<\/div>/g)].map((match) => match[1]);
    const taskRows = (html) => [...html.matchAll(/data-testid="task-row">([\s\S]*?)<\/div>/g)].map((match) => match[1]);
    let html = await read('/');
    assert.match(html, /<label for="project-filter">Project filter<\/label>/);
    assert.match(html, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(html, /data-testid="project-summary">1\/2 completed/);
    assert.match(html, />Archive project<\/button>/);
    assert.doesNotMatch(html, />Restore project<\/button>/);
    await post('/projects', { name: 'New project' });
    html = await read('/');
    assert.equal(projectRows(html).length, 2);
    assert.match(projectRows(html)[1], /data-testid="project-summary">0\/0 completed/);
    assert.equal((await post('/projects/1/archive')).status, 303);
    html = await read('/');
    assert.equal(projectRows(html).length, 1);
    assert.doesNotMatch(html, /Existing project/);
    html = await read('/?filter=Archived');
    assert.equal(projectRows(html).length, 1);
    assert.match(html, /Existing project/);
    assert.match(html, /data-testid="project-summary">1\/2 completed/);
    assert.match(html, />Open project<\/button>/);
    assert.match(html, />Restore project<\/button>/);
    assert.doesNotMatch(html, />Archive project<\/button>/);
    assert.match(html, /<option selected>Archived<\/option>/);
    const archivedPage = await read('/projects/1');
    assert.match(archivedPage, /<h1>Existing project<\/h1>/);
    assert.match(archivedPage, /<p>Archived project<\/p>/);
    assert.match(archivedPage, /<button type="submit" disabled>Create task<\/button>/);
    assert.equal(taskRows(archivedPage).length, 2);
    for (const row of taskRows(archivedPage)) assert.match(row, /type="checkbox"[^>]* disabled/);
    assert.match(taskRows(await read('/projects/1?filter=Completed'))[0], /Done task/);
    assert.equal(taskRows(await read('/projects/1?filter=Completed')).length, 1);
    assert.match(taskRows(await read('/projects/1?filter=Open'))[0], /Open task/);
    assert.equal(taskRows(await read('/projects/1?filter=Open')).length, 1);
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1', {})).status, 403);
    assert.equal(await read('/projects/1'), archivedPage);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await read('/projects/1'), archivedPage);
    assert.equal(await read('/?filter=Archived'), html);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.equal(projectRows(await read('/?filter=Archived')).length, 0);
    html = await read('/');
    assert.equal(projectRows(html).length, 2);
    assert.ok(html.indexOf('Existing project') < html.indexOf('New project'));
    assert.match(html, /data-testid="project-summary">1\/2 completed/);
    const restored = await read('/projects/1');
    assert.doesNotMatch(restored, / disabled|<p>Archived project<\/p>/);
    assert.match(taskRows(restored)[0], / checked/);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await read('/projects/1'), restored);
    assert.equal(await read('/'), html);
    await post('/projects/1/tasks/2', { completed: '1', filter: 'Open' });
    assert.equal(taskRows(await read('/projects/1?filter=Open')).length, 0);
    assert.match(await read('/'), /data-testid="project-summary">2\/2 completed/);
    await post('/projects/1/tasks/1', {});
    assert.match(await read('/'), /data-testid="project-summary">1\/2 completed/);
    assert.equal((await post('/projects/99999/archive')).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('renaming preserves identity, order and tasks, validates names, and respects archive state across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const read = async (path) => (await fetch(`${server.url}${path}`)).text();
    const tasks = (html) => [...html.matchAll(/data-testid="task-row">([\s\S]*?)<\/div>/g)].map((match) => match[1]);
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Finished task' });
    await post('/projects/1/tasks', { title: 'Open task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await read('/projects/1');
    assert.match(original, /<label for="new-project-name">New project name<\/label>/);
    assert.match(original, />Rename project<\/button>/);
    for (const name of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/rename', { name, filter: 'Open' });
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.match(html, /<h1>Original<\/h1>/);
      assert.match(html, /<option selected>Open<\/option>/);
      assert.equal(tasks(html).length, 1);
      assert.equal(await read('/projects/1'), original);
    }
    const renamed = await post('/projects/1/rename', { name: '  Renamed <team> & "friends"  ', filter: 'Completed' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const page = await read('/projects/1');
    assert.match(page, /<h1>Renamed &lt;team&gt; &amp; &quot;friends&quot;<\/h1>/);
    assert.deepEqual(tasks(page), tasks(original));
    const list = await read('/');
    assert.match(list, />Renamed &lt;team&gt; &amp; &quot;friends&quot;<\/span>/);
    assert.ok(list.indexOf('Renamed') < list.indexOf('Second'));
    assert.match(list, /data-testid="project-summary">1\/2 completed/);
    assert.match(list, /action="\/projects\/1"/);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await read('/projects/1'), page);
    assert.equal(await read('/'), list);
    await post('/projects/1/archive');
    const archived = await read('/projects/1');
    assert.match(archived, /id="new-project-name"[^>]* disabled/);
    assert.match(archived, /<button type="submit" disabled>Rename project<\/button>/);
    assert.equal((await post('/projects/1/rename', { name: 'Blocked' })).status, 403);
    assert.equal(await read('/projects/1'), archived);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await read('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await read('/projects/1'), page);
    assert.equal((await post('/projects/1/rename', { name: '  Restored name  ' })).status, 303);
    const restored = await read('/projects/1');
    assert.match(restored, /<h1>Restored name<\/h1>/);
    assert.deepEqual(tasks(restored), tasks(original));
    const restoredList = await read('/');
    assert.ok(restoredList.indexOf('Restored name') < restoredList.indexOf('Second'));
    assert.match(restoredList, /data-testid="project-summary">1\/2 completed/);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await read('/projects/1'), restored);
    assert.equal(await read('/'), restoredList);
    assert.equal((await post('/projects/99999/rename', { name: 'Missing' })).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, stay within their project, filter, and save completion across restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const post = (path, values) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const read = async (path) => (await fetch(`${server.url}${path}`)).text();
    const rows = (html) => [...html.matchAll(/<div class="panel task-row[^\"]*" data-testid="task-row">([\s\S]*?)<\/div>/g)].map((match) => match[1]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    let html = await read('/projects/1');
    assert.match(html, /<label for="task-title">Task title<\/label>/);
    assert.match(html, />Create task<\/button>/);
    assert.match(html, /<label for="task-filter">Task filter<\/label>/);
    assert.match(html, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(rows(html).length, 0);
    }
    for (const title of ['  Plan work  ', '<Review> & "ship"']) {
      assert.equal((await post('/projects/1/tasks', { title })).status, 303);
    }
    await post('/projects/2/tasks', { title: 'Private to second' });
    html = await read('/projects/1');
    const originalRows = rows(html);
    assert.equal(originalRows.length, 2);
    assert.match(originalRows[0], /aria-label="Complete Plan work"/);
    assert.match(originalRows[0], /<span>Plan work<\/span>/);
    assert.match(originalRows[1], /aria-label="Complete &lt;Review&gt; &amp; &quot;ship&quot;"/);
    assert.doesNotMatch(html, / checked/);
    assert.doesNotMatch(html, /Private to second/);
    assert.equal(rows(await read('/projects/1?filter=Open')).length, 2);
    assert.equal(rows(await read('/projects/1?filter=Completed')).length, 0);

    const completionPath = originalRows[0].match(/action="([^"]+)"/)[1];
    assert.equal((await post(completionPath, { completed: '1' })).status, 303);
    html = await read('/projects/1?filter=Completed');
    assert.equal(rows(html).length, 1);
    assert.match(rows(html)[0], / checked/);
    assert.match(rows(html)[0], /<span>Plan work<\/span>/);
    assert.match(html, /<option selected>Completed<\/option>/);
    assert.equal(rows(await read('/projects/1?filter=Open')).length, 1);
    assert.equal((await post('/projects/2/tasks/1', { completed: '0' })).status, 404);
    const invalid = await post('/projects/1/tasks', { title: '   ' });
    assert.equal(rows(await invalid.text()).length, 2);

    const persisted = await read('/projects/1');
    await server.stop();
    server = await start(databasePath);
    assert.equal(await read('/projects/1'), persisted);
    assert.equal(rows(await read('/projects/1?filter=Completed')).length, 1);
    assert.equal(rows(await read('/projects/2')).length, 1);
    assert.doesNotMatch(await read('/projects/2'), /Plan work|&lt;Review&gt;/);
    assert.equal((await post(completionPath, {})).status, 303);
    assert.equal(rows(await read('/projects/1?filter=Completed')).length, 0);
    assert.equal(rows(await read('/projects/1?filter=Open')).length, 2);
    await server.stop();
    server = await start(databasePath);
    assert.doesNotMatch(await read('/projects/1'), / checked/);
    assert.equal((await post('/projects/99999/tasks', { title: 'Orphan' })).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task renames preserve completion, ownership and order, validate titles, and respect archive state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const read = async (path) => (await fetch(`${server.url}${path}`)).text();
    const rows = (html) => [...html.matchAll(/data-testid="task-row">([\s\S]*?)<\/div>/g)].map((match) => match[1]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Original' });
    await post('/projects/1/tasks', { title: 'Later task' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await read('/projects/1');
    assert.match(rows(original)[0], /<label for="new-task-title-1">New task title<\/label>/);
    assert.match(rows(original)[0], />Rename task<\/button>/);
    for (const title of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/tasks/1/rename', { title, filter: 'Completed' });
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.match(html, /aria-label="Complete Original"[^>]* checked/);
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.equal(rows(html).length, 1);
      assert.equal(await read('/projects/1'), original);
    }
    assert.equal((await post('/projects/2/tasks/1/rename', { title: 'Wrong owner' })).status, 404);
    assert.equal((await post('/projects/1/tasks/99999/rename', { title: 'Missing' })).status, 404);
    assert.equal((await post('/projects/99999/tasks/1/rename', { title: 'Missing' })).status, 404);
    const result = await post('/projects/1/tasks/1/rename', { title: '  Renamed <task> & "done"  ', filter: 'Completed' });
    assert.equal(result.status, 303);
    assert.equal(result.headers.get('location'), '/projects/1?filter=Completed');
    const renamed = await read('/projects/1');
    assert.equal(rows(renamed).length, 2);
    assert.match(rows(renamed)[0], /aria-label="Complete Renamed &lt;task&gt; &amp; &quot;done&quot;"[^>]* checked/);
    assert.match(rows(renamed)[0], /<span>Renamed &lt;task&gt; &amp; &quot;done&quot;<\/span>/);
    assert.match(rows(renamed)[1], /<span>Later task<\/span>/);
    assert.equal(rows(await read('/projects/1?filter=Completed')).length, 1);
    assert.match(rows(await read('/projects/1?filter=Open'))[0], /Later task/);
    const list = await read('/');
    assert.match(list, /data-testid="project-summary">1\/2 completed/);
    const other = await read('/projects/2');
    assert.match(other, /Other project task/);
    assert.doesNotMatch(other, /Renamed|Later task/);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await read('/projects/1'), renamed);
    assert.equal(await read('/projects/2'), other);
    assert.equal(await read('/'), list);
    await post('/projects/1/archive');
    const archived = await read('/projects/1');
    for (const row of rows(archived)) {
      assert.match(row, /id="new-task-title-\d+"[^>]* disabled/);
      assert.match(row, /<button type="submit" disabled>Rename task<\/button>/);
    }
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Blocked' })).status, 403);
    assert.equal(await read('/projects/1'), archived);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await read('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await read('/projects/1'), renamed);
    assert.equal((await post('/projects/1/tasks/2/rename', { title: '  Renamed open task  ', filter: 'Open' })).status, 303);
    assert.match(rows(await read('/projects/1?filter=Open'))[0], /aria-label="Complete Renamed open task"/);
    assert.doesNotMatch(rows(await read('/projects/1?filter=Open'))[0], / checked/);
    assert.equal(await read('/'), list);
    const restored = await read('/projects/1');
    await server.stop();
    server = await start(databasePath);
    assert.equal(await read('/projects/1'), restored);
    // The renamed checkbox still updates the same task and summary.
    await post('/projects/1/tasks/1', {});
    assert.equal(rows(await read('/projects/1?filter=Completed')).length, 0);
    assert.match(await read('/'), /data-testid="project-summary">0\/2 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
