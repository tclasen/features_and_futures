import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { openWorkboard } from '../database.js';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const baseUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  return {
    baseUrl,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects validate, render safely, keep creation order and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const health = await fetch(`${server.baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    let page = await (await fetch(server.baseUrl)).text();
    assert.match(page, /<h1>Workboard<\/h1>/);
    assert.match(page, /<label for="project-name">Project name<\/label>/);
    assert.match(page, /<button type="submit">Create project<\/button>/);
    assert.doesNotMatch(page, /data-testid="project-row"/);

    async function create(name) {
      return fetch(`${server.baseUrl}/projects`, {
        method: 'POST',
        body: new URLSearchParams({ name }),
        redirect: 'manual',
      });
    }
    for (const name of ['', ' \t\n ']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    const created = await create('  First project  ');
    assert.equal(created.status, 303);
    assert.equal(created.headers.get('location'), '/');
    assert.equal((await create('Second <script> & café')).status, 303);

    page = await (await fetch(server.baseUrl)).text();
    assert.equal((page.match(/data-testid="project-row"/g) ?? []).length, 2);
    assert.match(page, /<span>First project<\/span>/);
    assert.match(page, /Second &lt;script&gt; &amp; café/);
    assert.ok(page.indexOf('First project') < page.indexOf('Second &lt;script&gt;'));
    const paths = [...page.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
    assert.equal(paths.length, 2);
    const detail = await (await fetch(`${server.baseUrl}${paths[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*<button type="submit">Projects<\/button>/);
    assert.equal((await fetch(`${server.baseUrl}/projects/999999`)).status, 404);

    const invalid = await create('   ');
    assert.equal(((await invalid.text()).match(/data-testid="project-row"/g) ?? []).length, 2);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await (await fetch(server.baseUrl)).text(), page);
    assert.match(await (await fetch(`${server.baseUrl}${paths[0]}`)).text(), /<h1>First project<\/h1>/);
    await create('Third project');
    const restartedPage = await (await fetch(server.baseUrl)).text();
    assert.equal((restartedPage.match(/data-testid="project-row"/g) ?? []).length, 3);
    assert.ok(restartedPage.indexOf('Third project') > restartedPage.indexOf('Second &lt;script&gt;'));
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, belong to their project, filter and retain completion across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values) => fetch(`${server.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const getPage = async (path) => (await fetch(`${server.baseUrl}${path}`)).text();
    const taskCount = (html) => (html.match(/data-testid="task-row"/g) ?? []).length;
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });

    let page = await getPage('/projects/1');
    assert.match(page, /<label for="task-title">Task title<\/label>/);
    assert.match(page, /<button type="submit">Create task<\/button>/);
    assert.match(page, /<label for="task-filter">Task filter<\/label>/);
    assert.match(page, /<option value="all" selected>All<\/option>/);
    assert.match(page, /<option value="open">Open<\/option>/);
    assert.match(page, /<option value="completed">Completed<\/option>/);
    assert.equal(taskCount(page), 0);
    for (const title of ['', ' \t\n ', undefined]) {
      const response = await post('/projects/1/tasks', title === undefined ? {} : { title });
      assert.equal(response.status, 400);
      const invalidPage = await response.text();
      assert.match(invalidPage, /role="alert">Task title is required/);
      assert.equal(taskCount(invalidPage), 0);
    }
    assert.equal((await post('/projects/1/tasks', { title: '  Plan release  ' })).status, 303);
    assert.equal((await post('/projects/1/tasks', { title: 'Review <script> & "notes"' })).status, 303);
    await post('/projects/2/tasks', { title: 'Other project task' });
    page = await getPage('/projects/1');
    assert.equal(taskCount(page), 2);
    assert.match(page, /<span>Plan release<\/span>/);
    assert.match(page, /aria-label="Complete Plan release">/);
    assert.match(page, /aria-label="Complete Review &lt;script&gt; &amp; &quot;notes&quot;">/);
    assert.ok(page.indexOf('Plan release') < page.indexOf('Review &lt;script&gt;'));
    assert.doesNotMatch(page, /Other project task| checked/);
    assert.equal(taskCount(await getPage('/projects/1?filter=open')), 2);
    assert.equal(taskCount(await getPage('/projects/1?filter=completed')), 0);
    assert.equal(taskCount(await getPage('/projects/1?filter=invalid')), 2);
    const invalid = await post('/projects/1/tasks', { title: '   ' });
    assert.equal(taskCount(await invalid.text()), 2);

    const complete = await post('/projects/1/tasks/1/completion', { completed: 'true', filter: 'open' });
    assert.equal(complete.status, 303);
    assert.equal(complete.headers.get('location'), '/projects/1?filter=open');
    page = await getPage('/projects/1');
    assert.match(page, /aria-label="Complete Plan release" checked/);
    assert.equal(taskCount(page), 2);
    const openPage = await getPage('/projects/1?filter=open');
    assert.equal(taskCount(openPage), 1);
    assert.doesNotMatch(openPage, /Plan release/);
    assert.match(openPage, /<option value="open" selected>Open/);
    const completedPage = await getPage('/projects/1?filter=completed');
    assert.equal(taskCount(completedPage), 1);
    assert.match(completedPage, /Plan release/);
    assert.doesNotMatch(completedPage, /Review &lt;script&gt;/);
    assert.equal((await post('/projects/2/tasks/1/completion', {})).status, 404);
    assert.equal((await post('/projects/1/tasks/999/completion', {})).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Missing project' })).status, 404);
    const otherPage = await getPage('/projects/2');
    assert.equal(taskCount(otherPage), 1);
    assert.match(otherPage, /Other project task/);
    assert.doesNotMatch(otherPage, /Plan release|Review &lt;script&gt;/);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await getPage('/projects/1'), page);
    assert.equal(await getPage('/projects/1?filter=completed'), completedPage);
    assert.equal(await getPage('/projects/2'), otherPage);
    assert.equal((await post('/projects/1/tasks/1/completion', {})).status, 303);
    assert.equal(taskCount(await getPage('/projects/1?filter=open')), 2);
    assert.equal(taskCount(await getPage('/projects/1?filter=completed')), 0);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.doesNotMatch(await getPage('/projects/1'), / checked/);
    const script = await fetch(`${server.baseUrl}/app.js`);
    assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type'), /javascript/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('adding tasks preserves an existing projects database and enforces task ownership', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-upgrade-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let store;
  try {
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      INSERT INTO projects (id, name) VALUES (7, 'Existing project');
    `);
    database.close();
    store = openWorkboard(databasePath);
    assert.deepEqual({ ...store.find(7) }, { id: 7, name: 'Existing project', archived: 0 });
    assert.deepEqual(store.tasks.list(7), []);
    assert.equal(store.tasks.create(7, '  Existing project task  ').title, 'Existing project task');
    assert.equal(store.list()[0].total_count, 1);
    assert.equal(store.setArchived(7, true), true);
    assert.equal(store.tasks.create(7, 'Blocked task'), null);
    assert.equal(store.tasks.setCompleted(7, 1, true), false);
    assert.equal(store.list().length, 0);
    assert.equal(store.list('archived')[0].total_count, 1);
    assert.equal(store.setArchived(7, false), true);
    assert.equal(store.tasks.setCompleted(7, 1, true), true);
    assert.equal(store.list()[0].completed_count, 1);
    assert.throws(() => store.tasks.create(99, 'Orphan'), /FOREIGN KEY/);
    assert.equal(store.tasks.list(99).length, 0);
    assert.equal(store.create('Next project').id, 8);
  } finally {
    if (store) store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive and restore preserve summaries and tasks while archived projects reject changes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const getPage = async (path) => (await fetch(`${server.baseUrl}${path}`)).text();
    const rowCount = (html, type) => (html.match(new RegExp(`data-testid="${type}-row"`, 'g')) ?? []).length;
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    let page = await getPage('/');
    assert.match(page, /<label for="project-filter">Project filter<\/label>/);
    assert.match(page, /<option value="active" selected>Active<\/option>/);
    assert.match(page, /<option value="archived">Archived<\/option>/);
    assert.equal((page.match(/data-testid="project-summary">0\/0 completed/g) ?? []).length, 2);
    assert.equal(rowCount(await getPage('/?filter=archived'), 'project'), 0);

    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1/completion', { completed: 'true' });
    assert.match(await getPage('/'), /data-testid="project-summary">1\/2 completed/);
    await getPage('/projects/1?filter=completed');
    assert.match(await getPage('/'), /data-testid="project-summary">1\/2 completed/);

    const archived = await post('/projects/1/archive', { filter: 'active' });
    assert.equal(archived.status, 303);
    assert.equal(archived.headers.get('location'), '/?filter=active');
    page = await getPage('/');
    assert.equal(rowCount(page, 'project'), 1);
    assert.doesNotMatch(page, /<span>First<\/span>/);
    const archivedList = await getPage('/?filter=archived');
    assert.equal(rowCount(archivedList, 'project'), 1);
    assert.match(archivedList, /<span>First<\/span>/);
    assert.match(archivedList, /data-testid="project-summary">1\/2 completed/);
    assert.match(archivedList, />Open project<\/button>/);
    assert.match(archivedList, />Restore project<\/button>/);
    assert.doesNotMatch(archivedList, />Archive project<\/button>/);
    assert.match(archivedList, /<option value="archived" selected>Archived/);

    const archivedDetail = await getPage('/projects/1');
    assert.match(archivedDetail, /<p>Archived project<\/p>/);
    assert.match(archivedDetail, /<button type="submit" disabled>Create task/);
    assert.match(archivedDetail, /aria-label="Complete Done" checked disabled/);
    assert.match(archivedDetail, /aria-label="Complete Pending" disabled/);
    assert.equal(rowCount(archivedDetail, 'task'), 2);
    assert.ok(archivedDetail.indexOf('<span>Done') < archivedDetail.indexOf('<span>Pending'));
    assert.equal(rowCount(await getPage('/projects/1?filter=open'), 'task'), 1);
    assert.equal(rowCount(await getPage('/projects/1?filter=completed'), 'task'), 1);
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked' })).status, 409);
    assert.equal((await post('/projects/1/tasks/1/completion')).status, 409);
    assert.equal(await getPage('/projects/1'), archivedDetail);
    assert.equal(await getPage('/?filter=archived'), archivedList);
    assert.equal((await post('/projects/999/archive')).status, 404);
    assert.equal((await post('/projects/999/restore')).status, 404);
    const invalid = await post('/projects', { name: '   ', filter: 'archived' });
    assert.equal(invalid.status, 400);
    const invalidPage = await invalid.text();
    assert.match(invalidPage, /role="alert">Project name is required/);
    assert.equal(rowCount(invalidPage, 'project'), 1);
    assert.match(invalidPage, /<option value="archived" selected>Archived/);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await getPage('/projects/1'), archivedDetail);
    assert.equal(await getPage('/?filter=archived'), archivedList);
    const restored = await post('/projects/1/restore', { filter: 'archived' });
    assert.equal(restored.status, 303);
    assert.equal(restored.headers.get('location'), '/?filter=archived');
    assert.equal(rowCount(await getPage('/?filter=archived'), 'project'), 0);
    page = await getPage('/');
    assert.equal(rowCount(page, 'project'), 2);
    assert.ok(page.indexOf('<span>First') < page.indexOf('<span>Second'));
    assert.match(page, /data-testid="project-summary">1\/2 completed/);
    const restoredDetail = await getPage('/projects/1');
    assert.doesNotMatch(restoredDetail, /Archived project| disabled/);
    assert.match(restoredDetail, /aria-label="Complete Done" checked/);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await getPage('/'), page);
    assert.equal(await getPage('/projects/1'), restoredDetail);
    assert.equal((await post('/projects/1/tasks/1/completion')).status, 303);
    assert.match(await getPage('/'), /data-testid="project-summary">0\/2 completed/);
    assert.equal((await post('/projects/1/tasks', { title: 'After restore' })).status, 303);
    assert.match(await getPage('/'), /data-testid="project-summary">0\/3 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive migration preserves existing task IDs and completion state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-upgrade-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let store;
  try {
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id),
        title TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO projects (id, name) VALUES (7, 'Existing project');
      INSERT INTO tasks (id, project_id, title, completed) VALUES (12, 7, 'Existing task', 1);
    `);
    database.close();
    store = openWorkboard(databasePath);
    assert.deepEqual({ ...store.tasks.list(7)[0] }, { id: 12, title: 'Existing task', completed: 1 });
    assert.equal(store.list()[0].completed_count, 1);
    assert.equal(store.list()[0].total_count, 1);
    store.setArchived(7, true);
    store.close();
    store = undefined;
    store = openWorkboard(databasePath);
    assert.equal(store.find(7).archived, 1);
    assert.equal(store.list('archived')[0].completed_count, 1);
    store.setArchived(7, false);
    assert.equal(store.tasks.create(7, 'Next task').id, 13);
    assert.equal(store.tasks.list(7)[0].completed, 1);
  } finally {
    if (store) store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('rename preserves project identity, ordering and tasks through archive and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const getPage = async (path) => (await fetch(`${server.baseUrl}${path}`)).text();
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1/completion', { completed: 'true' });
    const originalPage = await getPage('/projects/1');
    assert.match(originalPage, /<label for="new-project-name">New project name<\/label>/);
    assert.match(originalPage, /<button type="submit">Rename project<\/button>/);
    for (const values of [{}, { name: '' }, { name: ' \t\n ' }]) {
      const invalid = await post('/projects/1/rename', values);
      assert.equal(invalid.status, 400);
      assert.match(await invalid.text(), /role="alert">Project name is required/);
      assert.equal(await getPage('/projects/1'), originalPage);
    }
    const renamed = await post('/projects/1/rename', {
      name: '  Renamed <plan> & "review"  ', filter: 'completed',
    });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=completed');
    const detail = await getPage('/projects/1');
    assert.match(detail, /<h1>Renamed &lt;plan&gt; &amp; &quot;review&quot;<\/h1>/);
    assert.match(detail, /aria-label="Complete Done" checked/);
    assert.match(detail, /aria-label="Complete Pending">/);
    assert.ok(detail.indexOf('<span>Done') < detail.indexOf('<span>Pending'));
    assert.equal((detail.match(/data-testid="task-row"/g) ?? []).length, 2);
    const list = await getPage('/');
    assert.ok(list.indexOf('<span>Renamed') < list.indexOf('<span>Second'));
    assert.match(list, /data-testid="project-summary">1\/2 completed/);
    assert.match(list, /action="\/projects\/1"/);
    assert.match(await getPage('/projects/2'), /<h1>Second<\/h1>/);
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
    assert.equal((await post('/projects/9007199254740993/rename', { name: 'Missing' })).status, 404);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await getPage('/projects/1'), detail);
    assert.equal(await getPage('/'), list);
    await post('/projects/1/archive');
    const archivedDetail = await getPage('/projects/1');
    assert.match(archivedDetail, /id="new-project-name" name="name" type="text" disabled/);
    assert.match(archivedDetail, /<button type="submit" disabled>Rename project/);
    assert.equal((await post('/projects/1/rename', { name: 'Blocked' })).status, 409);
    assert.equal(await getPage('/projects/1'), archivedDetail);
    assert.match(await getPage('/?filter=archived'), /<span>Renamed &lt;plan&gt;/);
    await post('/projects/1/restore');
    assert.equal(await getPage('/projects/1'), detail);
    assert.equal((await post('/projects/1/rename', { name: '  Restored name  ' })).status, 303);
    const restoredDetail = await getPage('/projects/1');
    assert.match(restoredDetail, /<h1>Restored name<\/h1>/);
    assert.match(restoredDetail, /aria-label="Complete Done" checked/);
    assert.doesNotMatch(restoredDetail, / disabled/);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await getPage('/projects/1'), restoredDetail);
    const restoredList = await getPage('/');
    assert.ok(restoredList.indexOf('<span>Restored name') < restoredList.indexOf('<span>Second'));
    assert.match(restoredList, /data-testid="project-summary">1\/2 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task rename preserves ownership, order, completion and filters through archive and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const getPage = async (path) => (await fetch(`${server.baseUrl}${path}`)).text();
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/2/tasks', { title: 'Other' });
    await post('/projects/1/tasks/1/completion', { completed: 'true' });
    const original = await getPage('/projects/1');
    assert.match(original, /<label for="new-task-title-1">New task title<\/label>/);
    assert.equal((original.match(/>Rename task<\/button>/g) ?? []).length, 2);
    for (const values of [{}, { title: '' }, { title: ' \t\n ', filter: 'completed' }]) {
      const invalid = await post('/projects/1/tasks/1/rename', values);
      assert.equal(invalid.status, 400);
      assert.match(await invalid.text(), /role="alert">Task title is required/);
      assert.equal(await getPage('/projects/1'), original);
    }
    const summary = await getPage('/');
    const renamed = await post('/projects/1/tasks/1/rename', {
      title: '  Reviewed <plan> & "notes"  ', filter: 'completed',
    });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=completed');
    const detail = await getPage('/projects/1');
    assert.match(detail, /<span>Reviewed &lt;plan&gt; &amp; &quot;notes&quot;<\/span>/);
    assert.match(detail, /aria-label="Complete Reviewed &lt;plan&gt; &amp; &quot;notes&quot;" checked/);
    assert.doesNotMatch(detail, /Complete Done/);
    assert.ok(detail.indexOf('<span>Reviewed') < detail.indexOf('<span>Pending'));
    assert.match(detail, /action="\/projects\/1\/tasks\/1\/rename"/);
    const completed = await getPage('/projects/1?filter=completed');
    assert.match(completed, /<span>Reviewed/);
    assert.doesNotMatch(completed, /<span>Pending/);
    const open = await getPage('/projects/1?filter=open');
    assert.match(open, /<span>Pending/);
    assert.doesNotMatch(open, /<span>Reviewed/);
    assert.equal(await getPage('/'), summary);
    const other = await getPage('/projects/2');
    for (const path of [
      '/projects/2/tasks/1/rename', '/projects/1/tasks/3/rename',
      '/projects/1/tasks/999/rename', '/projects/999/tasks/1/rename',
      '/projects/1/tasks/9007199254740993/rename',
    ]) {
      assert.equal((await post(path, { title: 'Blocked' })).status, 404);
    }
    assert.equal(await getPage('/projects/1'), detail);
    assert.equal(await getPage('/projects/2'), other);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await getPage('/projects/1'), detail);
    assert.equal(await getPage('/projects/1?filter=completed'), completed);
    assert.equal(await getPage('/'), summary);

    await post('/projects/1/archive');
    const archived = await getPage('/projects/1');
    assert.match(archived, /id="new-task-title-1" name="title" type="text" disabled/);
    assert.match(archived, /id="new-task-title-2" name="title" type="text" disabled/);
    assert.equal((archived.match(/<button type="submit" disabled>Rename task/g) ?? []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Blocked' })).status, 409);
    assert.equal(await getPage('/projects/1'), archived);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await getPage('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await getPage('/projects/1'), detail);
    const restored = await post('/projects/1/tasks/2/rename', { title: '  Ready  ', filter: 'open' });
    assert.equal(restored.status, 303);
    assert.equal(restored.headers.get('location'), '/projects/1?filter=open');
    const restoredDetail = await getPage('/projects/1');
    assert.match(restoredDetail, /aria-label="Complete Ready">/);
    assert.ok(restoredDetail.indexOf('<span>Reviewed') < restoredDetail.indexOf('<span>Ready'));
    assert.equal(await getPage('/'), summary);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await getPage('/projects/1'), restoredDetail);
    assert.match(await getPage('/projects/1?filter=open'), /<span>Ready<\/span>/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task rename storage rejects invalid titles, wrong ownership and archived projects', () => {
  const store = openWorkboard(':memory:');
  try {
    const project = store.create('First');
    const other = store.create('Second');
    const task = store.tasks.create(project.id, 'Original');
    store.tasks.setCompleted(project.id, task.id, true);
    for (const title of ['', ' \t\n ', null, undefined, 42]) {
      assert.equal(store.tasks.rename(project.id, task.id, title), false);
    }
    assert.equal(store.tasks.rename(other.id, task.id, 'Blocked'), false);
    assert.equal(store.tasks.rename(project.id, 999, 'Blocked'), false);
    store.setArchived(project.id, true);
    assert.equal(store.tasks.rename(project.id, task.id, 'Blocked'), false);
    assert.equal(store.tasks.list(project.id)[0].title, 'Original');
    store.setArchived(project.id, false);
    assert.equal(store.tasks.rename(project.id, task.id, '  Renamed  '), true);
    assert.deepEqual({ ...store.tasks.list(project.id)[0] }, {
      id: task.id, title: 'Renamed', completed: 1,
    });
  } finally {
    store.close();
  }
});
