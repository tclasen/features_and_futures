import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('project defaults migrate, affect only future tasks, and persist independently', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-default-priority-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
    INSERT INTO projects (name) VALUES ('Existing');
    INSERT INTO tasks (project_id, title, completed, priority) VALUES (1, 'Saved task', 1, 'Low');
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, fields = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.base}${path}`)).text();
    const assertSelect = (html, id, value, disabled = false) => {
      const select = new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`).exec(html);
      assert.ok(select);
      assert.equal(select[0].includes(' disabled'), disabled);
      assert.equal(select[1].trim(), ['Low', 'Normal', 'High'].map(option =>
        `<option${option === value ? ' selected' : ''}>${option}</option>`).join(''));
    };
    const rows = html => html.slice(html.indexOf('<div class="tasks">'));
    await post('/projects', { name: 'New project' });
    assertSelect(await get('/projects/1'), 'default-task-priority', 'Normal');
    assertSelect(await get('/projects/2'), 'default-task-priority', 'Normal');
    await post('/projects/1/tasks', { title: 'Initially normal' });
    await post('/projects/2/tasks', { title: 'Independent' });
    const otherPage = await get('/projects/2');
    const summary = await get('/');
    const selectedPath = '/projects/1?filter=Completed&priorityFilter=Low';
    const selections = { filter: 'Completed', priorityFilter: 'Low' };
    const originalRows = rows(await get('/projects/1'));
    const filteredRows = rows(await get(selectedPath));
    const changed = await post('/projects/1/default-priority', { priority: 'High', ...selections });
    assert.equal(changed.status, 303);
    assert.equal(changed.headers.get('location'), selectedPath);
    const filtered = await get(selectedPath);
    assertSelect(filtered, 'default-task-priority', 'High');
    assert.match(filtered, /<option selected>Completed<\/option>/);
    assert.match(filtered, /id="priority-filter"[^>]*>[\s\S]*?<option selected>Low<\/option>/);
    assert.match(filtered, /action="\/projects\/1\/default-priority">\s*<input[^>]*name="filter" value="Completed">\s*<input[^>]*name="priorityFilter" value="Low">/);
    assert.equal(rows(filtered), filteredRows);
    assert.equal(rows(await get('/projects/1')), originalRows);
    assert.equal(await get('/projects/2'), otherPage);
    assert.equal(await get('/'), summary);
    assert.equal((await post('/projects/1/default-priority', { priority: 'Urgent' })).status, 422);
    assert.equal(await get(selectedPath), filtered);
    assert.equal((await post('/projects/999/default-priority', { priority: 'Low' })).status, 404);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get(selectedPath), filtered);
    const created = await post('/projects/1/tasks', { title: 'Inherited high', ...selections });
    assert.equal(created.headers.get('location'), selectedPath);
    assert.equal(rows(await get(selectedPath)), filteredRows);
    let all = await get('/projects/1');
    assertSelect(all, 'task-priority-1', 'Low');
    assertSelect(all, 'task-priority-2', 'Normal');
    assertSelect(all, 'task-priority-4', 'High');
    assert.match(all, /aria-label="Complete Saved task" checked/);
    assert.ok(all.indexOf('<span>Saved task') < all.indexOf('<span>Initially normal'));
    assert.ok(all.indexOf('<span>Initially normal') < all.indexOf('<span>Inherited high'));
    await post('/projects/1/default-priority', { priority: 'Low' });
    assert.equal(rows(await get('/projects/1')), rows(all));
    await post('/projects/1/tasks', { title: 'Inherited low' });
    await post('/projects/1/tasks/4/rename', { title: 'Renamed high' });
    await post('/projects/1/rename', { name: 'Renamed project' });
    all = await get('/projects/1');
    assertSelect(all, 'default-task-priority', 'Low');
    assertSelect(all, 'task-priority-4', 'High');
    assertSelect(all, 'task-priority-5', 'Low');
    assert.equal(await get('/projects/2'), otherPage);
    assert.match(await get('/'), /data-testid="project-summary">1\/4 completed/);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assertSelect(archived, 'default-task-priority', 'Low', true);
    assert.equal((await post('/projects/1/default-priority', { priority: 'High' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), archived);
    assert.equal(await get('/projects/2'), otherPage);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), all);
    await post('/projects/1/default-priority', { priority: 'Normal' });
    assert.equal(rows(await get('/projects/1')), rows(all));
    await post('/projects/1/tasks', { title: 'Restored normal' });
    assertSelect(await get('/projects/1'), 'task-priority-6', 'Normal');
    await server.stop();
    server = await startServer(databasePath);
    assertSelect(await get('/projects/1'), 'default-task-priority', 'Normal');
    assertSelect(await get('/projects/1'), 'task-priority-6', 'Normal');
    assert.match(await get('/'), /data-testid="project-summary">1\/5 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('priorities migrate, remain independent, and survive renaming, archive, and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('First'), ('Second');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing', 1);
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, fields = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.base}${path}`)).text();
    const assertPriority = (html, id, priority, disabled = false) => {
      assert.ok(html.includes(`<label for="task-priority-${id}">Task priority</label>`));
      const select = new RegExp(`<select id="task-priority-${id}"[^>]*>([\\s\\S]*?)</select>`).exec(html);
      assert.ok(select);
      assert.equal(select[0].includes(' disabled'), disabled);
      assert.equal(select[1].trim(), ['Low', 'Normal', 'High'].map(option =>
        `<option${option === priority ? ' selected' : ''}>${option}</option>`).join(''));
    };
    assertPriority(await get('/projects/1'), 1, 'Normal');
    await post('/projects/1/tasks', { title: 'New' });
    await post('/projects/2/tasks', { title: 'Other' });
    assertPriority(await get('/projects/1'), 2, 'Normal');
    const summary = await get('/');
    const otherPage = await get('/projects/2');
    const changed = await post('/projects/1/tasks/1/priority', { priority: 'High', filter: 'Completed' });
    assert.equal(changed.status, 303);
    assert.equal(changed.headers.get('location'), '/projects/1?filter=Completed');
    await post('/projects/1/tasks/2/priority', { priority: 'Low', filter: 'Open' });
    let page = await get('/projects/1');
    assertPriority(page, 1, 'High');
    assertPriority(page, 2, 'Low');
    assert.match(page, /aria-label="Complete Existing" checked/);
    assert.ok(page.indexOf('<span>Existing') < page.indexOf('<span>New'));
    assert.equal(await get('/'), summary);
    assert.equal(await get('/projects/2'), otherPage);
    assertPriority(await get('/projects/1?filter=Completed'), 1, 'High');
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /id="task-priority-2"/);
    assertPriority(await get('/projects/1?filter=Open'), 2, 'Low');
    assert.doesNotMatch(await get('/projects/1?filter=Open'), /id="task-priority-1"/);
    assert.equal((await post('/projects/2/tasks/1/priority', { priority: 'Low' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/priority', { priority: 'Low' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Urgent' })).status, 422);
    assert.equal(await get('/projects/1'), page);
    await post('/projects/1/tasks/1/rename', { title: '  Renamed  ' });
    page = await get('/projects/1');
    assertPriority(page, 1, 'High');
    assert.match(page, /aria-label="Complete Renamed" checked/);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), page);
    assert.equal(await get('/'), summary);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assertPriority(archived, 1, 'High', true);
    assertPriority(archived, 2, 'Low', true);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Low' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    assertPriority(await get('/projects/1?filter=Completed'), 1, 'High', true);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), page);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Normal' })).status, 303);
    page = await get('/projects/1');
    assertPriority(page, 1, 'Normal');
    assertPriority(page, 2, 'Low');
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), page);
    assert.equal(await get('/projects/2'), otherPage);
    assert.equal(await get('/'), summary);
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
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 10000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = /listening on port (\d+)/.exec(output);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
  });
  return {
    base: `http://127.0.0.1:${port}`,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects validate, render safely in order, navigate, and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const health = await fetch(`${server.base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const initialPage = await (await fetch(server.base)).text();
    assert.match(initialPage, /<h1>Workboard<\/h1>/);
    assert.match(initialPage, /<label for="project-name">Project name<\/label>/);
    assert.match(initialPage, /<button type="submit">Create project<\/button>/);
    assert.doesNotMatch(initialPage, /data-testid="project-row"/);

    const create = name => fetch(`${server.base}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    for (const name of ['', ' \t\n ']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 422);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    for (const name of ['  First project  ', 'Second <script> & project']) {
      const response = await create(name);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    const listing = await (await fetch(server.base)).text();
    assert.equal((listing.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(listing, /<span class="project-name">First project<\/span>/);
    assert.match(listing, /Second &lt;script&gt; &amp; project/);
    assert.ok(listing.indexOf('First project') < listing.indexOf('Second &lt;script&gt;'));
    const paths = [...listing.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    const detail = await (await fetch(`${server.base}${paths[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/"><button type="submit">Projects<\/button>/);
    assert.equal((await fetch(`${server.base}/projects/99999`)).status, 404);

    const invalidAfterCreation = await (await create('   ')).text();
    assert.equal((invalidAfterCreation.match(/data-testid="project-row"/g) || []).length, 2);
    assert.equal(await (await fetch(server.base)).text(), listing);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await (await fetch(server.base)).text(), listing);
    assert.equal(await (await fetch(`${server.base}${paths[0]}`)).text(), detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('existing projects migrate, archive read-only tasks, summarize, and restore across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    INSERT INTO projects (name) VALUES ('Existing project');
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, fields = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.base}${path}`)).text();
    let active = await get('/');
    assert.match(active, /<label for="project-filter">Project filter<\/label>/);
    assert.match(active, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(active, /data-testid="project-summary">0\/0 completed/);
    await post('/projects', { name: 'Second project' });
    await post('/projects/1/tasks', { title: 'Finished' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1/completion', { completed: '1' });
    active = await get('/');
    assert.match(active, /data-testid="project-summary">1\/2 completed/);
    assert.match(active, /data-testid="project-summary">0\/0 completed/);
    assert.match(active, />Archive project<\/button>/);
    const archivedResponse = await post('/projects/1/archive');
    assert.equal(archivedResponse.status, 303);
    assert.doesNotMatch(await get('/'), /Existing project/);
    const archivedList = await get('/?filter=Archived');
    assert.match(archivedList, /Existing project/);
    assert.doesNotMatch(archivedList, /Second project/);
    assert.match(archivedList, /data-testid="project-summary">1\/2 completed/);
    assert.match(archivedList, />Open project<\/button>/);
    assert.match(archivedList, />Restore project<\/button>/);
    assert.doesNotMatch(archivedList, />Archive project<\/button>/);
    const archivedPage = await get('/projects/1');
    assert.match(archivedPage, /<p>Archived project<\/p>/);
    assert.match(archivedPage, /<button type="submit" disabled>Create task<\/button>/);
    assert.equal((archivedPage.match(/type="checkbox"[^>]* disabled/g) || []).length, 2);
    assert.match(archivedPage, /aria-label="Complete Finished" checked disabled/);
    const open = await get('/projects/1?filter=Open');
    assert.match(open, /<span>Pending<\/span>/);
    assert.doesNotMatch(open, /<span>Finished<\/span>/);
    const completed = await get('/projects/1?filter=Completed');
    assert.match(completed, /<span>Finished<\/span>/);
    assert.doesNotMatch(completed, /<span>Pending<\/span>/);
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1/completion')).status, 403);
    assert.equal((await post('/projects/1/tasks/2/completion', { completed: '1' })).status, 403);
    assert.equal(await get('/projects/1'), archivedPage);
    assert.equal(await get('/?filter=Archived'), archivedList);
    const invalid = await post('/projects', { name: '   ', filter: 'Archived' });
    assert.equal(invalid.status, 422);
    assert.match(await invalid.text(), /<option selected>Archived<\/option>/);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), archivedPage);
    assert.equal(await get('/?filter=Archived'), archivedList);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.equal(await get('/'), active);
    assert.doesNotMatch(await get('/?filter=Archived'), /data-testid="project-row"/);
    const restored = await get('/projects/1');
    assert.doesNotMatch(restored, / disabled|Archived project/);
    assert.match(restored, /aria-label="Complete Finished" checked/);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/'), active);
    assert.equal(await get('/projects/1'), restored);
    await post('/projects/1/tasks/2/completion', { completed: '1' });
    assert.match(await get('/'), /data-testid="project-summary">2\/2 completed/);
    await post('/projects/1/tasks', { title: 'New task' });
    assert.match(await get('/'), /data-testid="project-summary">2\/3 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('renaming preserves identity, order, tasks, and summaries through archive and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, fields = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.base}${path}`)).text();
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1/completion', { completed: '1' });
    const originalPage = await get('/projects/1');
    const originalList = await get('/');
    assert.match(originalPage, /<label for="new-project-name">New project name<\/label>/);
    assert.match(originalPage, /<button type="submit">Rename project<\/button>/);
    for (const name of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/rename', { name, filter: 'Completed' });
      assert.equal(invalid.status, 422);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.match(html, /<h1>Original<\/h1>/);
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.equal(await get('/projects/1'), originalPage);
      assert.equal(await get('/'), originalList);
    }
    const renamed = await post('/projects/1/rename', { name: '  Renamed <project> & "team"  ', filter: 'Open' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Open');
    const renamedPage = await get('/projects/1');
    assert.match(renamedPage, /<h1>Renamed &lt;project&gt; &amp; &quot;team&quot;<\/h1>/);
    assert.equal(renamedPage.slice(renamedPage.indexOf('<div class="tasks">')),
      originalPage.slice(originalPage.indexOf('<div class="tasks">')));
    const renamedList = await get('/');
    assert.doesNotMatch(renamedList, /Original/);
    assert.ok(renamedList.indexOf('Renamed &lt;project&gt;') < renamedList.indexOf('Second'));
    assert.match(renamedList, /data-testid="project-summary">1\/2 completed/);
    assert.deepEqual([...renamedList.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]),
      ['/projects/1', '/projects/2']);
    assert.doesNotMatch(await get('/projects/1?filter=Open'), /<span>Done<\/span>/);
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /<span>Pending<\/span>/);
    assert.match(await get('/projects/2'), /<h1>Second<\/h1>/);
    assert.equal((await post('/projects/99999/rename', { name: 'Missing' })).status, 404);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), renamedPage);
    assert.equal(await get('/'), renamedList);
    await post('/projects/1/archive');
    const archivedPage = await get('/projects/1');
    assert.match(archivedPage, /id="new-project-name"[^>]* disabled/);
    assert.match(archivedPage, /<button type="submit" disabled>Rename project<\/button>/);
    assert.equal((await post('/projects/1/rename', { name: 'Blocked' })).status, 403);
    assert.equal(await get('/projects/1'), archivedPage);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), archivedPage);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), renamedPage);
    assert.equal(await get('/'), renamedList);
    assert.equal((await post('/projects/1/rename', { name: 'Restored name' })).status, 303);
    const restoredPage = await get('/projects/1');
    assert.match(restoredPage, /<h1>Restored name<\/h1>/);
    assert.match(restoredPage, /aria-label="Complete Done" checked/);
    assert.match(restoredPage, /<span>Pending<\/span>/);
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), restoredPage);
    assert.match(await get('/'), /<span class="project-name">Restored name<\/span>/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, toggle, stay within their project, and persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, fields) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.base}${path}`)).text();
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const initial = await get('/projects/1');
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, /<button type="submit">Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 422);
      assert.match(await response.text(), /role="alert">Task title is required/);
      assert.equal(await get('/projects/1'), initial);
    }
    for (const title of ['  Plan <launch> & "review"  ', 'Build']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/projects/1');
    }
    await post('/projects/2/tasks', { title: 'Other project task' });
    const listing = await get('/projects/1');
    assert.equal((listing.match(/data-testid="task-row"/g) || []).length, 2);
    assert.match(listing, /aria-label="Complete Plan &lt;launch&gt; &amp; &quot;review&quot;"/);
    assert.match(listing, /<span>Plan &lt;launch&gt; &amp; &quot;review&quot;<\/span>/);
    assert.ok(listing.indexOf('<span>Plan') < listing.indexOf('<span>Build'));
    assert.doesNotMatch(listing, / checked/);
    assert.doesNotMatch(listing, /Other project task/);
    const otherProject = await get('/projects/2');
    assert.match(otherProject, /Other project task/);
    assert.doesNotMatch(otherProject, /<span>Build/);
    assert.equal((await post('/projects/2/tasks/1/completion', { completed: '1' })).status, 404);
    assert.equal(await get('/projects/1'), listing);
    const complete = await post('/projects/1/tasks/1/completion', { completed: '1', filter: 'Open' });
    assert.equal(complete.status, 303);
    assert.equal(complete.headers.get('location'), '/projects/1?filter=Open');
    const all = await get('/projects/1');
    assert.match(all, /aria-label="Complete Plan[^\n]+ checked/);
    const open = await get('/projects/1?filter=Open');
    assert.match(open, /<option selected>Open<\/option>/);
    assert.match(open, /<span>Build<\/span>/);
    assert.doesNotMatch(open, /<span>Plan/);
    const completed = await get('/projects/1?filter=Completed');
    assert.match(completed, /<option selected>Completed<\/option>/);
    assert.match(completed, /<span>Plan/);
    assert.doesNotMatch(completed, /<span>Build/);
    assert.equal(await get('/projects/1?filter=unknown'), all);
    const invalid = await post('/projects/1/tasks', { title: '   ', filter: 'Completed' });
    assert.equal(invalid.status, 422);
    assert.match(await invalid.text(), /role="alert">Task title is required/);
    assert.equal(await get('/projects/1'), all);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), all);
    assert.equal(await get('/projects/1?filter=Open'), open);
    assert.equal(await get('/projects/1?filter=Completed'), completed);
    assert.equal(await get('/projects/2'), otherProject);
    const uncomplete = await post('/projects/1/tasks/1/completion', { filter: 'Completed' });
    assert.equal(uncomplete.status, 303);
    assert.equal(uncomplete.headers.get('location'), '/projects/1?filter=Completed');
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /data-testid="task-row"/);
    assert.equal(await get('/projects/1'), listing);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), listing);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task renaming preserves completion, ownership, order, filters, and persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, fields = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.base}${path}`)).text();
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/2/tasks', { title: 'Other' });
    await post('/projects/1/tasks/1/completion', { completed: '1' });
    const originalPage = await get('/projects/1');
    const originalList = await get('/');
    const otherPage = await get('/projects/2');
    assert.equal((originalPage.match(/>New task title<\/label>/g) || []).length, 2);
    assert.equal((originalPage.match(/>Rename task<\/button>/g) || []).length, 2);
    for (const title of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/tasks/1/rename', { title, filter: 'Completed' });
      assert.equal(invalid.status, 422);
      const html = await invalid.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.match(html, /aria-label="Complete Done" checked/);
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.match(html, /id="new-task-title-1"[^>]*aria-invalid="true"/);
      assert.equal(await get('/projects/1'), originalPage);
      assert.equal(await get('/'), originalList);
    }
    assert.equal((await post('/projects/2/tasks/1/rename', { title: 'Wrong project' })).status, 404);
    assert.equal((await post('/projects/1/tasks/99999/rename', { title: 'Missing' })).status, 404);
    const renamed = await post('/projects/1/tasks/1/rename', {
      title: '  Reviewed <launch> & "plan"  ', filter: 'Completed',
    });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const renamedPage = await get('/projects/1');
    const escapedTitle = 'Reviewed &lt;launch&gt; &amp; &quot;plan&quot;';
    assert.ok(renamedPage.includes(`<span>${escapedTitle}</span>`));
    assert.ok(renamedPage.includes(`aria-label="Complete ${escapedTitle}" checked`));
    assert.ok(renamedPage.includes(`value="${escapedTitle}"`));
    assert.ok(renamedPage.indexOf(`<span>${escapedTitle}`) < renamedPage.indexOf('<span>Pending'));
    assert.equal(await get('/'), originalList);
    assert.equal(await get('/projects/2'), otherPage);
    const openPage = await get('/projects/1?filter=Open');
    const completedPage = await get('/projects/1?filter=Completed');
    assert.doesNotMatch(openPage, /Reviewed/);
    assert.match(openPage, /<span>Pending<\/span>/);
    assert.match(completedPage, /Reviewed/);
    assert.doesNotMatch(completedPage, /Pending/);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), renamedPage);
    assert.equal(await get('/projects/1?filter=Open'), openPage);
    assert.equal(await get('/projects/1?filter=Completed'), completedPage);
    assert.equal(await get('/'), originalList);
    await post('/projects/1/archive');
    const archivedPage = await get('/projects/1');
    assert.equal((archivedPage.match(/id="new-task-title-\d+"[^>]* disabled/g) || []).length, 2);
    assert.equal((archivedPage.match(/<button type="submit" disabled>Rename task<\/button>/g) || []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Blocked' })).status, 403);
    assert.equal(await get('/projects/1'), archivedPage);
    assert.match(await get('/?filter=Archived'), /data-testid="project-summary">1\/2 completed/);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), archivedPage);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), renamedPage);
    assert.equal((await post('/projects/1/tasks/2/rename', { title: '  Next step  ', filter: 'Open' })).status, 303);
    const restoredPage = await get('/projects/1');
    assert.match(restoredPage, /aria-label="Complete Next step" onchange=/);
    assert.match(restoredPage, /<span>Next step<\/span>/);
    assert.equal(await get('/'), originalList);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), restoredPage);
    assert.equal(await get('/projects/2'), otherPage);
    await post('/projects/1/tasks/1/completion');
    assert.match(await get('/projects/1'), /aria-label="Complete Reviewed[^\n]*" onchange=/);
    assert.match(await get('/'), /data-testid="project-summary">0\/2 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('combined filters retain selections through edits, validation, archive, and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-combined-filters-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, fields = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.base}${path}`)).text();
    const titles = html => [...html.matchAll(/<span>(.*?)<\/span>/g)].map(match => match[1]);
    const assertFilters = (html, filter, priority) => {
      for (const [id, value, options] of [
        ['task-filter', filter, ['All', 'Open', 'Completed']],
        ['priority-filter', priority, ['All', 'Low', 'Normal', 'High']],
      ]) {
        const select = new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`).exec(html);
        assert.ok(select);
        assert.doesNotMatch(select[0], /disabled/);
        assert.equal(select[1].trim(), options.map(option =>
          `<option${option === value ? ' selected' : ''}>${option}</option>`).join(''));
      }
      // Both selects submit together so changing either retains the other value.
      assert.match(html, /<form class="task-filter"[^>]*>[\s\S]*?id="task-filter"[\s\S]*?id="priority-filter"[\s\S]*?<\/form>/);
      for (const form of html.matchAll(/<form[^>]*method="post"[^>]*>([\s\S]*?)<\/form>/g)) {
        assert.ok(form[1].includes(`name="filter" value="${filter}"`));
        assert.ok(form[1].includes(`name="priorityFilter" value="${priority}"`));
      }
    };
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const tasks = [];
    for (const priority of ['Low', 'Normal', 'High']) {
      for (const completed of [false, true]) {
        const id = tasks.length + 1;
        const title = `${priority} ${completed ? 'done' : 'open'}`;
        await post('/projects/1/tasks', { title });
        await post(`/projects/1/tasks/${id}/priority`, { priority });
        if (completed) await post(`/projects/1/tasks/${id}/completion`, { completed: '1' });
        tasks.push({ title, priority, completed });
      }
    }
    await post('/projects/2/tasks', { title: 'Other project' });
    const summary = await get('/');
    assert.match(summary, /data-testid="project-summary">3\/6 completed/);
    const all = await get('/projects/1');
    assertFilters(all, 'All', 'All');
    assert.equal(await get('/projects/1?priorityFilter=unknown'), all);
    for (const filter of ['All', 'Open', 'Completed']) {
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        const html = await get(`/projects/1?filter=${filter}&priorityFilter=${priority}`);
        assertFilters(html, filter, priority);
        assert.deepEqual(titles(html), tasks.filter(task =>
          (filter === 'All' || task.completed === (filter === 'Completed')) &&
          (priority === 'All' || task.priority === priority)).map(task => task.title));
        assert.equal(await get('/'), summary);
      }
    }
    const selections = { filter: 'Open', priorityFilter: 'High' };
    const filteredPath = '/projects/1?filter=Open&priorityFilter=High';
    for (const [path, fields, message] of [
      ['/projects/1/tasks/5/rename', { title: '  ' }, 'Task title is required'],
      ['/projects/1/tasks', { title: '  ' }, 'Task title is required'],
      ['/projects/1/rename', { name: '  ' }, 'Project name is required'],
    ]) {
      const response = await post(path, { ...fields, ...selections });
      assert.equal(response.status, 422);
      const html = await response.text();
      assertFilters(html, 'Open', 'High');
      assert.ok(html.includes(`role="alert">${message}`));
      assert.deepEqual(titles(html), ['High open']);
    }
    const rename = await post('/projects/1/tasks/5/rename', { title: '  Renamed  ', ...selections });
    assert.equal(rename.headers.get('location'), filteredPath);
    const renamed = await get(filteredPath);
    assertFilters(renamed, 'Open', 'High');
    assert.deepEqual(titles(renamed), ['Renamed']);
    assert.match(renamed, /aria-label="Complete Renamed" onchange=/);
    assert.match(renamed, /<option selected>High<\/option>/);
    assert.equal(await get('/'), summary);
    const changedPriority = await post('/projects/1/tasks/5/priority', { priority: 'Low', ...selections });
    assert.equal(changedPriority.headers.get('location'), filteredPath);
    assert.deepEqual(titles(await get(filteredPath)), []);
    assertFilters(await get(filteredPath), 'Open', 'High');
    assert.equal(await get('/'), summary);
    await post('/projects/1/tasks/5/priority', { priority: 'High', ...selections });
    const changedCompletion = await post('/projects/1/tasks/5/completion', { completed: '1', ...selections });
    assert.equal(changedCompletion.headers.get('location'), filteredPath);
    assert.deepEqual(titles(await get(filteredPath)), []);
    assertFilters(await get(filteredPath), 'Open', 'High');
    assert.deepEqual(titles(await get('/projects/1?filter=Completed&priorityFilter=High')), ['Renamed', 'High done']);
    assert.match(await get('/'), /data-testid="project-summary">4\/6 completed/);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(titles(await get(filteredPath)), []);
    const savedPage = await get('/projects/1');
    assert.match(savedPage, /aria-label="Complete Renamed" checked/);
    await post('/projects/1/archive');
    const archived = await get('/projects/1?filter=Completed&priorityFilter=High');
    assertFilters(archived, 'Completed', 'High');
    assert.deepEqual(titles(archived), ['Renamed', 'High done']);
    assert.equal((archived.match(/type="checkbox"[^>]* disabled/g) || []).length, 2);
    assert.equal((archived.match(/id="task-priority-\d+"[^>]* disabled/g) || []).length, 2);
    assert.equal((archived.match(/id="new-task-title-\d+"[^>]* disabled/g) || []).length, 2);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1?filter=Completed&priorityFilter=High'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), savedPage);
    const uncomplete = await post('/projects/1/tasks/5/completion', {
      filter: 'Completed', priorityFilter: 'High',
    });
    assert.equal(uncomplete.headers.get('location'), '/projects/1?filter=Completed&priorityFilter=High');
    assert.deepEqual(titles(await get('/projects/1?filter=Completed&priorityFilter=High')), ['High done']);
    assert.equal(await get('/'), summary);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
