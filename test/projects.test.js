import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('renaming preserves project identity and tasks, validates names, and respects archive state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.url}${path}`)).text();
    const taskRows = page => page.match(/<div class="task-row"[\s\S]*?<\/div>/g) || [];
    const summaries = page => [...page.matchAll(/data-testid="project-summary">([^<]+)/g)].map(match => match[1]);

    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Completed task' });
    await post('/projects/1/tasks', { title: 'Open task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await html('/projects/1');
    assert.match(original, /<label for="new-project-name">New project name<\/label>/);
    assert.match(original, /<input id="new-project-name"[^>]*type="text"[^>]*>/);
    assert.match(original, /<button type="submit">Rename project<\/button>/);
    assert.doesNotMatch(original, / disabled/);

    for (const name of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/rename', { name, filter: 'Open' });
      assert.equal(invalid.status, 400);
      const page = await invalid.text();
      assert.match(page, /role="alert">Project name is required/);
      assert.match(page, /<h1>Original<\/h1>/);
      assert.match(page, /<option selected>Open<\/option>/);
      assert.equal(taskRows(page).length, 1);
      assert.equal(await html('/projects/1'), original);
    }
    const renamed = await post('/projects/1/rename', { name: '  Renamed <plan> & "review"  ', filter: 'Completed' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const saved = await html('/projects/1');
    assert.match(saved, /<h1>Renamed &lt;plan&gt; &amp; &quot;review&quot;<\/h1>/);
    assert.deepEqual(taskRows(saved), taskRows(original));
    const list = await html('/');
    assert.match(list, /class="project-name">Renamed &lt;plan&gt; &amp; &quot;review&quot;<\/span>/);
    assert.ok(list.indexOf('Renamed &lt;plan&gt;') < list.indexOf('Second'));
    assert.deepEqual([...list.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]), ['/projects/1', '/projects/2']);
    assert.deepEqual(summaries(list), ['1/2 completed', '0/0 completed']);
    assert.match(await html('/projects/2'), /<h1>Second<\/h1>/);
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);

    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), saved);
    assert.equal(await html('/'), list);
    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    assert.match(archived, /<input id="new-project-name"[^>]* disabled>/);
    assert.match(archived, /<button type="submit" disabled>Rename project<\/button>/);
    assert.equal((await post('/projects/1/rename', { name: 'Blocked rename' })).status, 403);
    assert.equal(await html('/projects/1'), archived);
    assert.deepEqual(summaries(await html('/?filter=Archived')), ['1/2 completed']);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), saved);
    const restoredRename = await post('/projects/1/rename', { name: '  After restoration  ' });
    assert.equal(restoredRename.status, 303);
    assert.equal(restoredRename.headers.get('location'), '/projects/1');
    const restored = await html('/projects/1');
    assert.match(restored, /<h1>After restoration<\/h1>/);
    assert.deepEqual(taskRows(restored), taskRows(original));
    assert.deepEqual(summaries(await html('/')), ['1/2 completed', '0/0 completed']);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), restored);
    const database = new DatabaseSync(databasePath);
    try {
      assert.deepEqual({ ...database.prepare('SELECT id, name, archived FROM projects WHERE id = 1').get() }, {
        id: 1, name: 'After restoration', archived: 0,
      });
    } finally {
      database.close();
    }
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
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${output}`));
    }, 5000);
    child.stderr.on('data', data => { output += data; });
    child.stdout.on('data', data => {
      output += data;
      const match = /listening on port (\d+)/.exec(output);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Server exited (${code}): ${output}`));
    });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects validate, trim, preserve order, navigate, and survive a restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const initial = await (await fetch(server.url)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, /<button type="submit">Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);

    async function create(name) {
      return fetch(`${server.url}/projects`, {
        method: 'POST',
        body: new URLSearchParams({ name }),
        redirect: 'manual',
      });
    }
    for (const name of ['', ' \t\n ']) {
      const result = await create(name);
      assert.equal(result.status, 400);
      const html = await result.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }

    const first = await create('  Launch <plan> & review  ');
    assert.equal(first.status, 303);
    assert.equal(first.headers.get('location'), '/');
    assert.equal((await create('Second project')).status, 303);
    const list = await (await fetch(server.url)).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(list, /class="project-name">Launch &lt;plan&gt; &amp; review<\/span>/);
    assert.ok(list.indexOf('Launch &lt;plan&gt;') < list.indexOf('Second project'));
    const paths = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    assert.notEqual(paths[0], paths[1]);
    const project = await (await fetch(`${server.url}${paths[0]}`)).text();
    assert.match(project, /<h1>Launch &lt;plan&gt; &amp; review<\/h1>/);
    assert.match(project, /action="\/">\s*<button type="submit">Projects<\/button>/);

    const invalid = await create('   ');
    assert.equal((await invalid.text()).match(/data-testid="project-row"/g).length, 2);
    assert.equal(await (await fetch(server.url)).text(), list);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await (await fetch(server.url)).text(), list);
    assert.equal(await (await fetch(`${server.url}${paths[0]}`)).text(), project);
    assert.equal((await fetch(`${server.url}/projects/99999`)).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, toggle, stay within their project, and survive a restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.url}${path}`)).text();
    const rows = page => [...page.matchAll(/<div class="task-row" data-testid="task-row">([\s\S]*?)<\/div>/g)].map(match => match[1]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const project = '/projects/1';
    const initial = await html(project);
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, /<button type="submit">Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    assert.equal(rows(initial).length, 0);

    for (const title of ['', ' \t\n ']) {
      const response = await post(`${project}/tasks`, { title });
      assert.equal(response.status, 400);
      const page = await response.text();
      assert.match(page, /role="alert">Task title is required/);
      assert.equal(rows(page).length, 0);
    }
    const created = await post(`${project}/tasks`, { title: '  Plan <launch> & "review"  ' });
    assert.equal(created.status, 303);
    assert.equal(created.headers.get('location'), project);
    await post(`${project}/tasks`, { title: 'Follow up' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    const all = await html(project);
    const taskRows = rows(all);
    assert.equal(taskRows.length, 2);
    assert.match(taskRows[0], /<span>Plan &lt;launch&gt; &amp; &quot;review&quot;<\/span>/);
    assert.match(taskRows[0], /aria-label="Complete Plan &lt;launch&gt; &amp; &quot;review&quot;"/);
    assert.match(taskRows[1], /aria-label="Complete Follow up"/);
    assert.ok(taskRows.every(row => !row.includes(' checked')));
    assert.match(taskRows[0], /onchange="this.form.requestSubmit\(\)"/);
    assert.doesNotMatch(all, /Other project task/);
    assert.equal(rows(await html('/projects/2')).length, 1);
    assert.equal(rows(await html(`${project}?filter=Completed`)).length, 0);
    assert.equal(rows(await html(`${project}?filter=Open`)).length, 2);

    const completed = await post(`${project}/tasks/1`, { completed: '1', filter: 'Open' });
    assert.equal(completed.status, 303);
    assert.equal(completed.headers.get('location'), `${project}?filter=Open`);
    const saved = await html(project);
    assert.match(rows(saved)[0], / checked/);
    assert.doesNotMatch(rows(saved)[1], / checked/);
    const open = await html(`${project}?filter=Open`);
    assert.equal(rows(open).length, 1);
    assert.match(rows(open)[0], /Follow up/);
    assert.match(open, /<option selected>Open<\/option>/);
    const done = await html(`${project}?filter=Completed`);
    assert.equal(rows(done).length, 1);
    assert.match(rows(done)[0], /Plan &lt;launch&gt;/);

    assert.equal((await post('/projects/2/tasks/1', {})).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Missing' })).status, 404);
    assert.equal((await post(`${project}/tasks/999`, { completed: '1' })).status, 404);
    const invalid = await post(`${project}/tasks`, { title: '   ' });
    assert.equal(invalid.status, 400);
    assert.equal(rows(await invalid.text()).length, 2);
    assert.equal(await html(project), saved);

    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html(project), saved);
    assert.equal(await html(`${project}?filter=Open`), open);
    assert.equal(await html(`${project}?filter=Completed`), done);
    assert.equal(rows(await html('/projects/2')).length, 1);
    const reopened = await post(`${project}/tasks/1`, {});
    assert.equal(reopened.status, 303);
    assert.equal(rows(await html(`${project}?filter=Completed`)).length, 0);
    assert.equal(rows(await html(`${project}?filter=Open`)).length, 2);
    await server.stop();
    server = await startServer(databasePath);
    assert.ok(rows(await html(project)).every(row => !row.includes(' checked')));
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('legacy projects migrate, archive and restore with saved tasks and accurate summaries', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const databasePath = join(directory, 'workboard.sqlite');
  // Start from the previous schema to verify existing projects remain usable.
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
    );
    INSERT INTO projects (name) VALUES ('Existing project');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Saved task', 1);
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.url}${path}`)).text();
    const rowCount = (page, type) => (page.match(new RegExp(`data-testid="${type}-row"`, 'g')) || []).length;
    const summaries = page => [...page.matchAll(/data-testid="project-summary">([^<]+)/g)].map(match => match[1]);

    let active = await html('/');
    assert.match(active, /<label for="project-filter">Project filter<\/label>/);
    assert.match(active, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.equal(rowCount(active, 'project'), 1);
    assert.deepEqual(summaries(active), ['1/1 completed']);
    assert.match(active, />Archive project<\/button>/);
    assert.doesNotMatch(active, />Restore project<\/button>/);
    await post('/projects', { name: 'New project' });
    await post('/projects/1/tasks', { title: 'Open task' });
    active = await html('/');
    assert.deepEqual(summaries(active), ['1/2 completed', '0/0 completed']);
    assert.ok(active.indexOf('Existing project') < active.indexOf('New project'));
    assert.equal(rowCount(await html('/projects/1?filter=Completed'), 'task'), 1);
    assert.deepEqual(summaries(await html('/')), ['1/2 completed', '0/0 completed']);

    const archivedResponse = await post('/projects/1/archive');
    assert.equal(archivedResponse.status, 303);
    active = await html('/');
    assert.equal(rowCount(active, 'project'), 1);
    assert.doesNotMatch(active, /Existing project/);
    const archivedList = await html('/?filter=Archived');
    assert.match(archivedList, /<option selected>Archived<\/option>/);
    assert.equal(rowCount(archivedList, 'project'), 1);
    assert.match(archivedList, /Existing project/);
    assert.match(archivedList, />Open project<\/button>/);
    assert.match(archivedList, />Restore project<\/button>/);
    assert.doesNotMatch(archivedList, />Archive project<\/button>/);
    assert.deepEqual(summaries(archivedList), ['1/2 completed']);
    const archivedPage = await html('/projects/1');
    assert.match(archivedPage, /<p>Archived project<\/p>/);
    assert.match(archivedPage, /<button type="submit" disabled>Create task<\/button>/);
    assert.equal(rowCount(archivedPage, 'task'), 2);
    const checkboxes = archivedPage.match(/<input type="checkbox"[^>]+>/g);
    assert.equal(checkboxes.length, 2);
    assert.ok(checkboxes.every(checkbox => checkbox.includes(' disabled')));
    assert.match(checkboxes[0], / checked/);
    assert.doesNotMatch(checkboxes[1], / checked/);
    assert.equal(rowCount(await html('/projects/1?filter=Open'), 'task'), 1);
    assert.equal(rowCount(await html('/projects/1?filter=Completed'), 'task'), 1);
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked task' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1')).status, 403);
    assert.equal((await post('/projects/1/tasks/2', { completed: '1' })).status, 403);
    assert.equal(await html('/projects/1'), archivedPage);

    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/'), active);
    assert.equal(await html('/?filter=Archived'), archivedList);
    assert.equal(await html('/projects/1'), archivedPage);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.equal(rowCount(await html('/?filter=Archived'), 'project'), 0);
    const restored = await html('/projects/1');
    assert.doesNotMatch(restored, /Archived project| disabled/);
    assert.match(restored, /aria-label="Complete Saved task" checked/);
    assert.equal(rowCount(restored, 'task'), 2);
    assert.deepEqual(summaries(await html('/')), ['1/2 completed', '0/0 completed']);
    await post('/projects/1/tasks/2', { completed: '1' });
    await post('/projects/1/tasks', { title: 'After restoration' });
    assert.deepEqual(summaries(await html('/')), ['2/3 completed', '0/0 completed']);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(summaries(await html('/')), ['2/3 completed', '0/0 completed']);
    assert.doesNotMatch(await html('/projects/1'), /Archived project| disabled/);
    assert.equal((await post('/projects/999/archive')).status, 404);
    assert.equal((await post('/projects/999/restore')).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
