import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('task priorities migrate, remain independent, and survive renames, archive, and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  let server;
  try {
    const dbPath = join(directory, 'workboard.sqlite');
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (name) VALUES ('First'), ('Second');
      INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing', 1);
    `);
    legacy.close();
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const rows = html => [...html.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    const options = row => /<select id="task-priority-\d+"[^>]*>\s*([\s\S]*?)\s*<\/select>/.exec(row)[1];
    const normal = '<option>Low</option><option selected>Normal</option><option>High</option>';
    await post('/projects/1/tasks', { title: 'New task' });
    await post('/projects/2/tasks', { title: 'Other project' });
    const initial = await get('/projects/1');
    const other = await get('/projects/2');
    const summary = await get('/');
    assert.ok(rows(initial).every(row => options(row) === normal));
    assert.match(rows(initial)[0], /<label for="task-priority-1">Task priority<\/label>/);
    assert.equal(options(rows(other)[0]), normal);
    for (const priority of ['Low', 'High', 'Normal', 'High']) {
      const result = await post('/projects/1/tasks/1/priority', { priority, filter: 'Completed' });
      assert.equal(result.status, 303);
      assert.equal(result.headers.get('location'), '/projects/1?filter=Completed');
      const updated = rows(await get('/projects/1'));
      assert.match(options(updated[0]), new RegExp(`<option selected>${priority}</option>`));
      assert.match(updated[0], /aria-label="Complete Existing" checked/);
      assert.equal(updated[1], rows(initial)[1]);
      assert.equal(rows(await get('/projects/1?filter=Completed')).length, 1);
      assert.equal(rows(await get('/projects/1?filter=Open')).length, 1);
      assert.equal(await get('/projects/2'), other);
      assert.equal(await get('/'), summary);
    }
    const saved = await get('/projects/1');
    for (const [path, fields, status] of [
      ['/projects/2/tasks/1/priority', { priority: 'Low' }, 404],
      ['/projects/1/tasks/999/priority', { priority: 'Low' }, 404],
      ['/projects/999/tasks/1/priority', { priority: 'Low' }, 404],
      ['/projects/1/tasks/1/priority', { priority: 'Urgent' }, 422],
      ['/projects/1/tasks/1/priority', {}, 422],
    ]) {
      assert.equal((await post(path, fields)).status, status);
      assert.equal(await get('/projects/1'), saved);
    }
    await post('/projects/1/tasks/2/priority', { priority: 'Low' });
    await post('/projects/1/tasks/1/rename', { title: '  Renamed  ' });
    const renamed = await get('/projects/1');
    assert.match(rows(renamed)[0], /aria-label="Complete Renamed" checked/);
    assert.match(options(rows(renamed)[0]), /<option selected>High<\/option>/);
    assert.match(options(rows(renamed)[1]), /<option selected>Low<\/option>/);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), renamed);
    assert.equal(await get('/'), summary);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.ok(rows(archived).every(row => /<select id="task-priority-\d+"[^>]* disabled/.test(row)));
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Normal' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), renamed);
    assert.equal(await get('/'), summary);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Normal' })).status, 303);
    const restored = await get('/projects/1');
    assert.equal(options(rows(restored)[0]), normal);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), restored);
    assert.equal(await get('/projects/2'), other);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task renames preserve ownership, order, completion, filters, and summaries across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  let server;
  try {
    const dbPath = join(directory, 'workboard.sqlite');
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const rows = html => [...html.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Original' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await get('/projects/1');
    const otherProject = await get('/projects/2');
    const summary = await get('/');
    assert.match(rows(original)[0], /<label for="new-task-title-1">New task title<\/label>/);
    assert.match(rows(original)[0], /<button type="submit">Rename task<\/button>/);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks/1/rename', { title, filter: 'Completed' });
      assert.equal(response.status, 422);
      const html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(rows(html).length, 1);
      assert.match(rows(html)[0], /aria-label="Complete Original" checked/);
      assert.equal(await get('/projects/1'), original);
    }
    assert.equal((await post('/projects/2/tasks/1/rename', { title: 'Wrong owner' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/rename', { title: 'Missing' })).status, 404);
    assert.equal((await post('/projects/999/tasks/1/rename', { title: 'Missing project' })).status, 404);
    const renamed = await post('/projects/1/tasks/1/rename', {
      title: '  Renamed <task> "one" & two  ', filter: 'Completed',
    });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const saved = await get('/projects/1');
    const savedRows = rows(saved);
    assert.equal(savedRows.length, 2);
    assert.match(savedRows[0], /aria-label="Complete Renamed &lt;task&gt; &quot;one&quot; &amp; two" checked/);
    assert.match(savedRows[0], /<label for="task-1">Renamed &lt;task&gt; &quot;one&quot; &amp; two<\/label>/);
    assert.equal(savedRows[1], rows(original)[1]);
    assert.deepEqual(rows(await get('/projects/1?filter=Completed')), [savedRows[0].replaceAll('name="filter" value="All"', 'name="filter" value="Completed"')]);
    assert.deepEqual(rows(await get('/projects/1?filter=Open')), [savedRows[1].replaceAll('name="filter" value="All"', 'name="filter" value="Open"')]);
    assert.equal(await get('/projects/2'), otherProject);
    assert.equal(await get('/'), summary);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), saved);
    assert.equal(await get('/'), summary);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    for (const row of rows(archived)) {
      assert.match(row, /id="new-task-title-\d+"[^>]* disabled/);
      assert.match(row, /<button type="submit" disabled>Rename task<\/button>/);
    }
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Blocked' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), archived);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Still blocked' })).status, 403);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), saved);
    assert.equal((await post('/projects/1/tasks/2/rename', { title: '  Renamed open task  ', filter: 'Open' })).status, 303);
    const restored = await get('/projects/1');
    assert.match(rows(restored)[1], /aria-label="Complete Renamed open task" onchange/);
    assert.doesNotMatch(rows(restored)[1], / checked| disabled/);
    assert.equal(await get('/'), summary);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), restored);
    assert.equal(await get('/projects/2'), otherProject);
    assert.equal((await post('/projects/1/tasks/1')).status, 303);
    assert.equal(rows(await get('/projects/1?filter=Completed')).length, 0);
    assert.equal(rows(await get('/projects/1?filter=Open')).length, 2);
    assert.match(await get('/'), /data-testid="project-summary">0\/2 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('renaming preserves identity, order, tasks, summaries, and archive restrictions across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  let server;
  try {
    const dbPath = join(directory, 'workboard.sqlite');
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const taskRows = html => [...html.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    const projectRows = html => [...html.matchAll(/<li class="project" data-testid="project-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const originalPage = await get('/projects/1');
    const originalTasks = taskRows(originalPage);
    assert.match(originalPage, /<label for="new-project-name">New project name<\/label>/);
    assert.match(originalPage, /<button type="submit">Rename project<\/button>/);
    for (const name of ['', ' \t\n ']) {
      const result = await post('/projects/1/rename', { name });
      assert.equal(result.status, 422);
      const html = await result.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.match(html, /<h1>Original<\/h1>/);
      assert.deepEqual(taskRows(html), originalTasks);
      assert.equal(await get('/projects/1'), originalPage);
    }
    const renamed = await post('/projects/1/rename', { name: '  Renamed <project> "one"  ', filter: 'Completed' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const savedPage = await get('/projects/1');
    assert.match(savedPage, /<h1>Renamed &lt;project&gt; &quot;one&quot;<\/h1>/);
    assert.deepEqual(taskRows(savedPage), originalTasks);
    assert.equal(taskRows(await get('/projects/1?filter=Completed')).length, 1);
    const savedList = await get('/');
    const rows = projectRows(savedList);
    assert.equal(rows.length, 2);
    assert.match(rows[0], /Renamed &lt;project&gt; &quot;one&quot;/);
    assert.match(rows[0], /action="\/projects\/1"/);
    assert.match(rows[0], /data-testid="project-summary">1\/2 completed/);
    assert.match(rows[1], /Second/);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), savedPage);
    assert.equal(await get('/'), savedList);

    await post('/projects/1/archive');
    const archivedPage = await get('/projects/1');
    assert.match(archivedPage, /id="new-project-name"[^>]* disabled/);
    assert.match(archivedPage, /<button type="submit" disabled>Rename project/);
    assert.equal((await post('/projects/1/rename', { name: 'Blocked' })).status, 403);
    assert.equal(await get('/projects/1'), archivedPage);
    await server.stop();
    server = await start(dbPath);
    assert.equal((await post('/projects/1/rename', { name: 'Still blocked' })).status, 403);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), savedPage);
    assert.equal((await post('/projects/1/rename', { name: '  Restored name  ' })).status, 303);
    const restoredPage = await get('/projects/1');
    assert.match(restoredPage, /<h1>Restored name<\/h1>/);
    assert.deepEqual(taskRows(restoredPage), originalTasks);
    assert.match(projectRows(await get('/'))[0], /1\/2 completed/);
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), restoredPage);
    assert.match(projectRows(await get('/'))[0], /Restored name/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
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
        resolve(`http://127.0.0.1:${match[1]}`);
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

test('projects validate, render safely in creation order, and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let server;
  try {
    const dbPath = join(directory, 'nested', 'projects.sqlite');
    server = await start(dbPath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const initial = await (await fetch(server.url)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.equal((initial.match(/data-testid="project-row"/g) || []).length, 0);

    async function create(name) {
      return fetch(`${server.url}/projects`, {
        method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
      });
    }
    for (const name of ['', ' \t\n ']) {
      const result = await create(name);
      assert.equal(result.status, 422);
      const html = await result.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    for (const name of ['  First project  ', 'Café <script>alert("x")</script>']) {
      const result = await create(name);
      assert.equal(result.status, 303);
      assert.equal(result.headers.get('location'), '/');
    }
    const list = await (await fetch(server.url)).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(list, /<span class="project-name">First project<\/span>/);
    assert.ok(list.indexOf('First project') < list.indexOf('Café'));
    assert.match(list, /Café &lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
    const paths = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    const detail = await (await fetch(`${server.url}${paths[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/">\s*<button type="submit">Projects<\/button>/);
    assert.equal((await fetch(`${server.url}/projects/999999`)).status, 404);

    await server.stop();
    server = await start(dbPath);
    assert.equal(await (await fetch(server.url)).text(), list);
    assert.match(await (await fetch(`${server.url}${paths[0]}`)).text(), /<h1>First project<\/h1>/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, remain project scoped, and persist completion across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  let server;
  try {
    const dbPath = join(directory, 'workboard.sqlite');
    server = await start(dbPath);
    const post = (path, fields) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const rows = html => [...html.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const initial = await get('/projects/1');
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, />Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const result = await post('/projects/1/tasks', { title });
      assert.equal(result.status, 422);
      const html = await result.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(rows(html).length, 0);
    }
    for (const title of ['  First task  ', 'Second <task> "quoted"']) {
      assert.equal((await post('/projects/1/tasks', { title })).status, 303);
    }
    const all = rows(await get('/projects/1'));
    assert.equal(all.length, 2);
    assert.match(all[0], /aria-label="Complete First task"/);
    assert.match(all[0], /<label for="task-1">First task<\/label>/);
    assert.match(all[1], /Second &lt;task&gt; &quot;quoted&quot;/);
    assert.ok(all.every(row => !row.includes(' checked')));
    assert.equal(rows(await get('/projects/2')).length, 0);
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Missing' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1', { completed: '1' })).status, 303);
    const open = rows(await get('/projects/1?filter=Open'));
    const completed = rows(await get('/projects/1?filter=Completed'));
    assert.equal(open.length, 1);
    assert.match(open[0], /Second &lt;task&gt;/);
    assert.equal(completed.length, 1);
    assert.match(completed[0], /aria-label="Complete First task" checked/);
    const saved = await get('/projects/1');
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), saved);
    assert.equal(rows(await get('/projects/2')).length, 0);
    const unchecked = await post('/projects/1/tasks/1', { filter: 'Completed' });
    assert.equal(unchecked.status, 303);
    assert.equal(unchecked.headers.get('location'), '/projects/1?filter=Completed');
    assert.equal(rows(await get('/projects/1?filter=Completed')).length, 0);
    assert.equal(rows(await get('/projects/1?filter=Open')).length, 2);
    await server.stop();
    server = await start(dbPath);
    assert.equal(rows(await get('/projects/1?filter=Open')).length, 2);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive migration, summaries, read-only tasks, and restoration persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  let server;
  try {
    const dbPath = join(directory, 'workboard.sqlite');
    // Seed the original schema to verify upgrades preserve existing IDs and names.
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      INSERT INTO projects (name) VALUES ('Existing project');`);
    legacy.close();
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const projectRows = html => [...html.matchAll(/<li class="project" data-testid="project-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    const taskRows = html => [...html.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    const initial = await get('/');
    assert.match(initial, /<label for="project-filter">Project filter<\/label>/);
    assert.match(initial, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(initial, /data-testid="project-summary">0\/0 completed/);
    await post('/projects', { name: 'Second project' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1', { completed: '1' });
    assert.match(projectRows(await get('/'))[0], /data-testid="project-summary">1\/2 completed/);
    await get('/projects/1?filter=Completed');
    assert.match(projectRows(await get('/'))[0], /1\/2 completed/);
    const archived = await post('/projects/1/archive');
    assert.equal(archived.status, 303);
    const activeRows = projectRows(await get('/'));
    assert.equal(activeRows.length, 1);
    assert.match(activeRows[0], /Second project/);
    const archivedList = await get('/?filter=Archived');
    const archivedRows = projectRows(archivedList);
    assert.equal(archivedRows.length, 1);
    assert.match(archivedRows[0], /Existing project/);
    assert.match(archivedRows[0], /1\/2 completed/);
    assert.match(archivedRows[0], />Open project<\/button>/);
    assert.match(archivedRows[0], />Restore project<\/button>/);
    assert.doesNotMatch(archivedRows[0], />Archive project<\/button>/);
    const archivedPage = await get('/projects/1');
    assert.match(archivedPage, /<p>Archived project<\/p>/);
    assert.match(archivedPage, /<button type="submit" disabled>Create task/);
    assert.equal(taskRows(archivedPage).length, 2);
    assert.ok(taskRows(archivedPage).every(row => /type="checkbox"[^>]* disabled/.test(row)));
    assert.match(taskRows(archivedPage)[0], /checked disabled/);
    assert.equal(taskRows(await get('/projects/1?filter=Open')).length, 1);
    assert.match(taskRows(await get('/projects/1?filter=Completed'))[0], /Complete Done/);
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1')).status, 403);
    assert.equal(await get('/projects/1'), archivedPage);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/?filter=Archived'), archivedList);
    assert.equal(await get('/projects/1'), archivedPage);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.equal(projectRows(await get('/?filter=Archived')).length, 0);
    const restoredList = await get('/');
    const restoredRows = projectRows(restoredList);
    assert.equal(restoredRows.length, 2);
    assert.match(restoredRows[0], /Existing project/);
    assert.match(restoredRows[1], /Second project/);
    assert.match(restoredRows[0], /1\/2 completed/);
    const restoredPage = await get('/projects/1');
    assert.doesNotMatch(restoredPage, /<(?:button|input)\b[^>]* disabled|<p>Archived project<\/p>/);
    assert.match(taskRows(restoredPage)[0], /checked/);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/'), restoredList);
    assert.equal(await get('/projects/1'), restoredPage);
    assert.equal((await post('/projects/1/tasks/1')).status, 303);
    assert.match(projectRows(await get('/'))[0], /0\/2 completed/);
    assert.equal((await post('/projects/1/tasks', { title: 'After restore' })).status, 303);
    assert.match(projectRows(await get('/'))[0], /0\/3 completed/);
    assert.equal((await post('/projects/999/archive')).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('combined filters intersect, retain selections through edits, and work across archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-combined-filters-'));
  let server;
  try {
    const dbPath = join(directory, 'workboard.sqlite');
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const ids = html => [...html.matchAll(/id="task-(\d+)" type="checkbox"/g)].map(match => Number(match[1]));
    const selected = (html, id) => {
      const select = new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`).exec(html)[1];
      return /<option selected>([^<]+)<\/option>/.exec(select)[1];
    };
    const assertFilters = (html, completion, priority) => {
      assert.equal(selected(html, 'task-filter'), completion);
      assert.equal(selected(html, 'priority-filter'), priority);
    };
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
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
    const initial = await get('/projects/1');
    const summary = await get('/');
    const other = await get('/projects/2');
    assertFilters(initial, 'All', 'All');
    assert.match(initial, /<label for="priority-filter">Priority filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Low<\/option><option>Normal<\/option><option>High<\/option>/);
    // Both selects submit together, retaining the unchanged selection.
    assert.match(initial, /<form method="get" action="\/projects\/1">\s*<label for="task-filter">[\s\S]*?id="priority-filter"[\s\S]*?<\/form>/);
    for (const completion of ['All', 'Open', 'Completed']) {
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        const html = await get(`/projects/1?filter=${completion}&priorityFilter=${priority}`);
        assertFilters(html, completion, priority);
        assert.deepEqual(ids(html), tasks.filter(task =>
          (completion === 'All' || task.completed === (completion === 'Completed')) &&
          (priority === 'All' || task.priority === priority)).map(task => task.id));
      }
    }
    assert.equal(await get('/'), summary);
    const filters = { filter: 'Open', priorityFilter: 'High' };
    const path = '/projects/1?filter=Open&priorityFilter=High';
    const before = await get(path);
    assert.deepEqual(ids(before), [5]);
    // Every edit form carries both selections, including create and project rename.
    for (const form of before.matchAll(/<form[^>]*method="post"[^>]*>([\s\S]*?)<\/form>/g)) {
      assert.match(form[1], /name="filter" value="Open"/);
      assert.match(form[1], /name="priorityFilter" value="High"/);
    }
    const rename = await post('/projects/1/tasks/5/rename', { ...filters, title: '  Renamed high  ' });
    assert.equal(rename.headers.get('location'), path);
    const renamed = await get(path);
    assertFilters(renamed, 'Open', 'High');
    assert.deepEqual(ids(renamed), [5]);
    assert.match(renamed, /aria-label="Complete Renamed high"/);
    assert.equal(await get('/'), summary);
    const invalid = await post('/projects/1/tasks/5/rename', { ...filters, title: ' ' });
    assert.equal(invalid.status, 422);
    const errorPage = await invalid.text();
    assertFilters(errorPage, 'Open', 'High');
    assert.deepEqual(ids(errorPage), [5]);
    assert.match(errorPage, /role="alert">Task title is required/);
    const reprioritized = await post('/projects/1/tasks/5/priority', { ...filters, priority: 'Low' });
    assert.equal(reprioritized.headers.get('location'), path);
    assertFilters(await get(path), 'Open', 'High');
    assert.deepEqual(ids(await get(path)), []);
    assert.equal(await get('/'), summary);
    assert.deepEqual(ids(await get('/projects/1?filter=Open&priorityFilter=Low')), [1, 5]);
    const lowFilters = { filter: 'Open', priorityFilter: 'Low' };
    const completed = await post('/projects/1/tasks/5', { ...lowFilters, completed: '1' });
    assert.equal(completed.headers.get('location'), '/projects/1?filter=Open&priorityFilter=Low');
    const openLow = await get(completed.headers.get('location'));
    assertFilters(openLow, 'Open', 'Low');
    assert.deepEqual(ids(openLow), [1]);
    assert.deepEqual(ids(await get('/projects/1?filter=Completed&priorityFilter=Low')), [2, 5]);
    assert.match(await get('/'), /data-testid="project-summary">4\/6 completed/);
    assert.equal(await get('/projects/2'), other);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1?filter=Open&priorityFilter=Low'), openLow);
    assertFilters(await get('/projects/1'), 'All', 'All');
    await post('/projects/1/archive');
    for (const completion of ['All', 'Open', 'Completed']) {
      const html = await get(`/projects/1?filter=${completion}&priorityFilter=Low`);
      assertFilters(html, completion, 'Low');
      assert.doesNotMatch(html, /<select id="(?:task-filter|priority-filter)"[^>]*disabled/);
      assert.match(html, /Archived project/);
      for (const row of html.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)) {
        assert.match(row[1], /type="checkbox"[^>]* disabled/);
        assert.match(row[1], /id="new-task-title-\d+"[^>]* disabled/);
        assert.match(row[1], /<button type="submit" disabled>Rename task/);
        assert.match(row[1], /<select id="task-priority-\d+"[^>]* disabled/);
      }
    }
    await server.stop();
    server = await start(dbPath);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1?filter=Open&priorityFilter=Low'), openLow);
    assert.deepEqual(ids(await get('/projects/1?filter=Completed&priorityFilter=Low')), [2, 5]);
    assert.equal(await get('/projects/2'), other);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project priority defaults migrate, affect only future tasks, and persist independently', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-default-priority-'));
  let server;
  try {
    const dbPath = join(directory, 'workboard.sqlite');
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
      INSERT INTO projects (name) VALUES ('Existing');
      INSERT INTO tasks (project_id, title, completed, priority) VALUES (1, 'Existing task', 1, 'Low');
    `);
    legacy.close();
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const rows = html => [...html.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    const select = (html, id) => new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`).exec(html);
    const selected = (html, id) => /<option selected>([^<]+)<\/option>/.exec(select(html, id)[1])[1];
    const defaultPriority = html => selected(html, 'default-task-priority');
    await post('/projects', { name: 'New project' });
    const initial = await get('/projects/1');
    const otherInitial = await get('/projects/2');
    assert.match(initial, /<label for="default-task-priority">Default task priority<\/label>/);
    assert.equal(select(initial, 'default-task-priority')[1].trim(), '<option>Low</option><option selected>Normal</option><option>High</option>');
    assert.equal(defaultPriority(otherInitial), 'Normal');
    await post('/projects/1/tasks', { title: 'Normal inherited' });
    const initialRows = rows(await get('/projects/1'));
    assert.equal(selected(initialRows[0], 'task-priority-1'), 'Low');
    assert.equal(selected(initialRows[1], 'task-priority-2'), 'Normal');
    const summary = await get('/');
    const filters = { filter: 'Completed', priorityFilter: 'Low' };
    const path = '/projects/1?filter=Completed&priorityFilter=Low';
    const filteredRows = rows(await get(path));
    const changed = await post('/projects/1/default-task-priority', { ...filters, priority: 'High' });
    assert.equal(changed.status, 303);
    assert.equal(changed.headers.get('location'), path);
    const filtered = await get(path);
    assert.equal(defaultPriority(filtered), 'High');
    assert.equal(selected(filtered, 'task-filter'), 'Completed');
    assert.equal(selected(filtered, 'priority-filter'), 'Low');
    assert.deepEqual(rows(filtered), filteredRows);
    assert.deepEqual(rows(await get('/projects/1')), initialRows);
    assert.equal(await get('/'), summary);
    assert.equal(await get('/projects/2'), otherInitial);
    const defaultForm = /<form[^>]*action="\/projects\/1\/default-task-priority">([\s\S]*?)<\/form>/.exec(filtered)[1];
    assert.match(defaultForm, /name="filter" value="Completed"/);
    assert.match(defaultForm, /name="priorityFilter" value="Low"/);
    assert.match(defaultForm, /onchange="this.form.submit\(\)"/);
    for (const priority of ['', 'Urgent']) {
      assert.equal((await post('/projects/1/default-task-priority', { priority })).status, 422);
      assert.equal(await get(path), filtered);
    }
    assert.equal((await post('/projects/999/default-task-priority', { priority: 'High' })).status, 404);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get(path), filtered);
    await post('/projects/1/tasks', { title: '  High inherited  ' });
    let allRows = rows(await get('/projects/1'));
    assert.deepEqual(allRows.slice(0, 2), initialRows);
    assert.equal(selected(allRows[2], 'task-priority-3'), 'High');
    assert.match(allRows[2], /aria-label="Complete High inherited"/);
    assert.doesNotMatch(allRows[2], /type="checkbox"[^>]* checked/);
    await post('/projects/2/default-task-priority', { priority: 'Low' });
    await post('/projects/2/tasks', { title: 'Other inherited' });
    assert.equal(selected(rows(await get('/projects/2'))[0], 'task-priority-4'), 'Low');
    const other = await get('/projects/2');
    const beforeDefaultChange = rows(await get('/projects/1'));
    await post('/projects/1/default-task-priority', { priority: 'Normal' });
    assert.deepEqual(rows(await get('/projects/1')), beforeDefaultChange);
    await post('/projects/1/tasks', { title: 'Normal again' });
    allRows = rows(await get('/projects/1'));
    assert.equal(selected(allRows[3], 'task-priority-5'), 'Normal');
    await post('/projects/1/rename', { name: 'Renamed project' });
    assert.equal(defaultPriority(await get('/projects/1')), 'Normal');
    assert.deepEqual(rows(await get('/projects/1')), allRows);
    assert.match(await get('/'), /data-testid="project-summary">1\/4 completed/);
    await post('/projects/1/default-task-priority', { priority: 'High' });
    await post('/projects/1/archive');
    const archived = await get(path);
    assert.equal(defaultPriority(archived), 'High');
    assert.match(archived, /<select id="default-task-priority"[^>]* disabled/);
    assert.doesNotMatch(archived, /<select id="(?:task-filter|priority-filter)"[^>]* disabled/);
    assert.equal((await post('/projects/1/default-task-priority', { priority: 'Low' })).status, 403);
    assert.equal(await get(path), archived);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get(path), archived);
    assert.equal(await get('/projects/2'), other);
    await post('/projects/1/restore');
    const restored = await get('/projects/1');
    assert.equal(defaultPriority(restored), 'High');
    assert.doesNotMatch(restored, /<select id="default-task-priority"[^>]* disabled/);
    assert.deepEqual(rows(restored), allRows);
    await post('/projects/1/tasks', { title: 'After restore' });
    assert.equal(selected(rows(await get('/projects/1'))[4], 'task-priority-6'), 'High');
    const saved = await get('/projects/1');
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), saved);
    assert.equal(await get('/projects/2'), other);
    assert.match(await get('/'), /data-testid="project-summary">1\/5 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('due dates validate Gregorian days and persist without changing task identity or filters', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-due-date-'));
  let server;
  try {
    const dbPath = join(directory, 'workboard.sqlite');
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (name) VALUES ('Existing'), ('Other');
      INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing task', 1);
    `);
    legacy.close();
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const rows = html => [...html.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    const date = (html, id) => new RegExp(`<input id="task-due-date-${id}"[^>]*value="([^"]*)"`).exec(html)[1];
    await post('/projects/1/tasks', { title: 'New task' });
    await post('/projects/2/tasks', { title: 'Other task' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    const summary = await get('/');
    const other = await get('/projects/2');
    const newRow = rows(await get('/projects/1'))[1];
    const filters = { filter: 'Completed', priorityFilter: 'High' };
    const path = '/projects/1?filter=Completed&priorityFilter=High';
    const initial = await get(path);
    assert.equal(date(initial, 1), '');
    assert.equal(date(newRow, 2), '');
    assert.match(initial, /<label for="task-due-date-1">Task due date<\/label>/);
    const form = /<form[^>]*action="\/projects\/1\/tasks\/1\/due-date">([\s\S]*?)<\/form>/.exec(initial)[1];
    assert.match(form, /name="filter" value="Completed"/);
    assert.match(form, /name="priorityFilter" value="High"/);
    for (const dueDate of ['0001-01-01', '0099-12-31', '2000-02-29', '2024-02-29', '9999-12-31', '  2026-04-30  ']) {
      const response = await post('/projects/1/tasks/1/due-date', { ...filters, dueDate });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), path);
      const html = await get(path);
      assert.equal(date(html, 1), dueDate.trim());
      assert.match(html, /aria-label="Complete Existing task" checked/);
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.match(html, /<option selected>High<\/option>/);
      assert.equal(rows(html).length, 1);
      assert.equal(rows(await get('/projects/1'))[1], newRow);
      assert.equal(await get('/'), summary);
      assert.equal(await get('/projects/2'), other);
    }
    const saved = await get(path);
    for (const dueDate of ['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2025-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '2026-01-32', '2026-1-01', '26-01-01', '2026-01-01T00:00:00Z', '2026-01-01\nextra', '<script>']) {
      const response = await post('/projects/1/tasks/1/due-date', { ...filters, dueDate });
      assert.equal(response.status, 422, dueDate);
      const html = await response.text();
      assert.match(html, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      assert.equal(date(html, 1), '2026-04-30');
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.match(html, /<option selected>High<\/option>/);
      assert.equal(await get(path), saved);
    }
    assert.equal((await post('/projects/2/tasks/1/due-date', { dueDate: '2026-01-01' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/due-date', { dueDate: '' })).status, 404);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get(path), saved);
    await post('/projects/1/tasks/1/rename', { ...filters, title: 'Renamed' });
    assert.equal(date(await get(path), 1), '2026-04-30');
    await post('/projects/1/tasks/2/due-date', { dueDate: '2027-05-01' });
    await post('/projects/1/archive');
    const archived = await get(path);
    assert.match(archived, /id="task-due-date-1"[^>]* disabled/);
    assert.match(archived, /<button type="submit" disabled>Save due date/);
    assert.doesNotMatch(archived, /<select id="(?:task-filter|priority-filter)"[^>]* disabled/);
    assert.equal((await post('/projects/1/tasks/1/due-date', { dueDate: '' })).status, 403);
    assert.equal(await get(path), archived);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get(path), archived);
    await post('/projects/1/restore');
    const restored = await get(path);
    assert.equal(date(restored, 1), '2026-04-30');
    assert.match(restored, /aria-label="Complete Renamed" checked/);
    assert.doesNotMatch(restored, /id="task-due-date-1"[^>]* disabled/);
    for (const dueDate of ['', ' \t\n ']) {
      await post('/projects/1/tasks/1/due-date', { ...filters, dueDate });
      assert.equal(date(await get(path), 1), '');
      assert.equal(date(await get('/projects/1'), 2), '2027-05-01');
    }
    const cleared = await get(path);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get(path), cleared);
    assert.equal(date(await get('/projects/1'), 2), '2027-05-01');
    assert.equal(await get('/'), summary);
    assert.equal(await get('/projects/2'), other);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('inclusive due ranges intersect filters, survive edits, reject invalid ranges, and work when archived', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-due-range-'));
  let server;
  try {
    const dbPath = join(directory, 'workboard.sqlite');
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const ids = html => [...html.matchAll(/id="task-(\d+)" type="checkbox"/g)].map(match => Number(match[1]));
    const selected = (html, id) => /<option selected>([^<]+)<\/option>/.exec(
      new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`).exec(html)[1])[1];
    const apply = fields => fetch(`${server.url}/projects/1/due-range?${new URLSearchParams(fields)}`, { redirect: 'manual' });
    await post('/projects', { name: 'Range project' });
    await post('/projects', { name: 'Other project' });
    const dates = ['', '0001-01-01', '2024-02-28', '2024-02-29', '2024-03-01', '9999-12-31'];
    for (const [index, dueDate] of dates.entries()) {
      await post('/projects/1/tasks', { title: `Task ${index + 1}` });
      await post(`/projects/1/tasks/${index + 1}/due-date`, { dueDate });
      await post(`/projects/1/tasks/${index + 1}/priority`, { priority: index % 2 ? 'High' : 'Low' });
      if (index % 2) await post(`/projects/1/tasks/${index + 1}`, { completed: '1' });
    }
    await post('/projects/2/tasks', { title: 'Other task' });
    const other = await get('/projects/2');
    const summary = await get('/');
    const initial = await get('/projects/1');
    assert.match(initial, /<label for="due-from">Due from<\/label>/);
    assert.match(initial, /<label for="due-through">Due through<\/label>/);
    assert.match(initial, /id="due-from"[^>]*value=""/);
    assert.match(initial, /id="due-through"[^>]*value=""/);
    assert.deepEqual(ids(initial), [1, 2, 3, 4, 5, 6]);
    for (const [from, through, expected] of [
      ['', '', [1, 2, 3, 4, 5, 6]],
      ['', '2024-02-29', [2, 3, 4]],
      ['2024-02-29', '', [4, 5, 6]],
      ['2024-02-28', '2024-03-01', [3, 4, 5]],
      ['2024-02-29', '2024-02-29', [4]],
      ['0001-01-01', '9999-12-31', [2, 3, 4, 5, 6]],
    ]) {
      for (const filter of ['All', 'Open', 'Completed']) {
        for (const priorityFilter of ['All', 'Low', 'Normal', 'High']) {
          const result = await apply({ from: ` ${from} `, through: ` ${through} `, filter, priorityFilter });
          assert.equal(result.status, 303);
          const html = await get(result.headers.get('location'));
          assert.deepEqual(ids(html), expected.filter(id =>
            (filter === 'All' || (id % 2 === 0) === (filter === 'Completed')) &&
            (priorityFilter === 'All' || priorityFilter === (id % 2 ? 'Low' : 'High'))));
          assert.equal(selected(html, 'task-filter'), filter);
          assert.equal(selected(html, 'priority-filter'), priorityFilter);
        }
      }
    }
    assert.equal(await get('/'), summary);
    const fields = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-28', dueThrough: '2024-03-01' };
    const path = '/projects/1?filter=Completed&priorityFilter=High&dueFrom=2024-02-28&dueThrough=2024-03-01';
    const before = await get(path);
    assert.deepEqual(ids(before), [4]);
    // The browser submits the applied boundaries with each edit and combobox change.
    for (const form of before.matchAll(/<form[^>]*>([\s\S]*?)<\/form>/g)) {
      if (!/name="filter"/.test(form[1])) continue;
      assert.match(form[1], /name="dueFrom" value="2024-02-28"/);
      assert.match(form[1], /name="dueThrough" value="2024-03-01"/);
    }
    for (const [from, through, message] of [
      ['2023-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['', '1900-02-29', 'Due range must use valid YYYY-MM-DD dates'],
      ['0000-01-01', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-2-28', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-03-01', '2024-02-29', 'Due from must not be after Due through'],
    ]) {
      const result = await apply({ ...fields, from, through });
      assert.equal(result.status, 422);
      const html = await result.text();
      assert.match(html, new RegExp(`role="alert">${message}`));
      assert.deepEqual(ids(html), [4]);
      assert.equal(selected(html, 'task-filter'), 'Completed');
      assert.equal(selected(html, 'priority-filter'), 'High');
      assert.match(html, /id="due-from"[^>]*value="2024-02-28"/);
    }
    assert.equal(await get(path), before);
    for (const [route, data] of [
      ['/projects/1/rename', { name: 'Renamed project' }],
      ['/projects/1/tasks/4/rename', { title: 'Renamed task' }],
      ['/projects/1/default-task-priority', { priority: 'Low' }],
      ['/projects/1/tasks', { title: 'New undated task' }],
    ]) {
      const result = await post(route, { ...fields, ...data });
      assert.equal(result.headers.get('location'), path);
      assert.deepEqual(ids(await get(path)), [4]);
    }
    const saved = await get(path);
    assert.match(saved, /aria-label="Complete Renamed task" checked/);
    assert.match(saved, /id="task-due-date-4"[^>]*value="2024-02-29"/);
    const newSummary = await get('/');
    assert.match(newSummary, /data-testid="project-summary">3\/7 completed/);
    for (const [suffix, change, restore] of [
      ['/due-date', { dueDate: '2024-03-02' }, { dueDate: '2024-02-29' }],
      ['/priority', { priority: 'Low' }, { priority: 'High' }],
      ['', {}, { completed: '1' }],
    ]) {
      const result = await post(`/projects/1/tasks/4${suffix}`, { ...fields, ...change });
      assert.equal(result.headers.get('location'), path);
      const html = await get(path);
      assert.deepEqual(ids(html), []);
      assert.equal(selected(html, 'task-filter'), 'Completed');
      assert.equal(selected(html, 'priority-filter'), 'High');
      await post(`/projects/1/tasks/4${suffix}`, { ...fields, ...restore });
      assert.equal(await get(path), saved);
    }
    assert.equal(await get('/'), newSummary);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get(path), saved);
    assert.match(await get('/projects/1'), /id="due-from"[^>]*value=""/);
    assert.deepEqual(ids(await get('/projects/1')), [1, 2, 3, 4, 5, 6, 8]);
    await post('/projects/1/archive');
    const archived = await get(path);
    assert.deepEqual(ids(archived), [4]);
    assert.doesNotMatch(archived, /id="due-(?:from|through)"[^>]*disabled/);
    assert.doesNotMatch(archived, /<button[^>]*disabled>Apply due range/);
    assert.match(archived, /id="task-due-date-4"[^>]*disabled/);
    assert.match(archived, /id="task-priority-4"[^>]*disabled/);
    const result = await apply({ filter: 'Open', priorityFilter: 'Low', from: '2024-02-28', through: '2024-03-01' });
    assert.deepEqual(ids(await get(result.headers.get('location'))), [3, 5]);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get(path), archived);
    await post('/projects/1/restore');
    assert.equal(await get(path), saved);
    assert.equal(await get('/projects/2'), other);
    assert.equal(await get('/'), newSummary);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
