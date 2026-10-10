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
    assert.deepEqual({ ...store.find(7) }, { id: 7, name: 'Existing project', archived: 0, default_task_priority: 'normal' });
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
    assert.deepEqual({ ...store.tasks.list(7)[0] }, { id: 12, title: 'Existing task', completed: 1, priority: 'normal', due_date: '' });
    assert.equal(store.list()[0].completed_count, 1);
    assert.equal(store.list()[0].total_count, 1);
    assert.equal(store.tasks.setPriority(7, 12, 'high'), true);
    store.setArchived(7, true);
    store.close();
    store = undefined;
    store = openWorkboard(databasePath);
    assert.equal(store.find(7).archived, 1);
    assert.equal(store.tasks.list(7)[0].priority, 'high');
    assert.equal(store.list('archived')[0].completed_count, 1);
    store.setArchived(7, false);
    assert.equal(store.tasks.create(7, 'Next task').id, 13);
    assert.equal(store.tasks.list(7)[1].priority, 'normal');
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
      id: task.id, title: 'Renamed', completed: 1, priority: 'normal', due_date: '',
    });
  } finally {
    store.close();
  }
});

test('priority storage validates values, ownership and archive state', () => {
  const store = openWorkboard(':memory:');
  try {
    const first = store.create('First');
    const second = store.create('Second');
    const task = store.tasks.create(first.id, 'Task');
    assert.equal(task.priority, 'normal');
    for (const priority of ['', 'urgent', 'High', null, undefined, 42]) {
      assert.equal(store.tasks.setPriority(first.id, task.id, priority), false);
    }
    assert.equal(store.tasks.setPriority(second.id, task.id, 'high'), false);
    assert.equal(store.tasks.setPriority(first.id, 999, 'high'), false);
    store.setArchived(first.id, true);
    assert.equal(store.tasks.setPriority(first.id, task.id, 'high'), false);
    assert.equal(store.tasks.list(first.id)[0].priority, 'normal');
    store.setArchived(first.id, false);
    assert.equal(store.tasks.setPriority(first.id, task.id, 'high'), true);
    store.tasks.rename(first.id, task.id, 'Renamed');
    assert.equal(store.tasks.list(first.id)[0].priority, 'high');
  } finally {
    store.close();
  }
});

test('task priorities persist independently through filters, rename, archive and server restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const getPage = async (path) => (await fetch(`${server.baseUrl}${path}`)).text();
    const priorityOptions = (html, id) => {
      const match = html.match(new RegExp(`<select id="task-priority-${id}"[^>]*>([\\s\\S]*?)</select>`));
      assert.ok(match, `Priority selector for task ${id}`);
      return [...match[1].matchAll(/<option value="([^"]+)"( selected)?>([^<]+)<\/option>/g)]
        .map((option) => ({ value: option[1], selected: Boolean(option[2]), label: option[3] }));
    };
    const selectedPriority = (html, id) => {
      const options = priorityOptions(html, id);
      assert.deepEqual(options.map(({ label }) => label), ['Low', 'Normal', 'High']);
      assert.equal(options.filter(({ selected }) => selected).length, 1);
      return options.find(({ selected }) => selected).value;
    };
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/2/tasks', { title: 'Other' });
    await post('/projects/1/tasks/1/completion', { completed: 'true' });
    const original = await getPage('/projects/1');
    assert.equal(selectedPriority(original, 1), 'normal');
    assert.equal(selectedPriority(original, 2), 'normal');
    assert.match(original, /<label for="task-priority-1">Task priority<\/label>/);
    assert.match(original, /action="\/projects\/1\/tasks\/1\/priority" data-submit-on-change/);
    const summary = await getPage('/');
    const other = await getPage('/projects/2');
    const changed = await post('/projects/1/tasks/1/priority', { priority: 'high', filter: 'completed' });
    assert.equal(changed.status, 303);
    assert.equal(changed.headers.get('location'), '/projects/1?filter=completed');
    assert.equal((await post('/projects/1/tasks/2/priority', { priority: 'low' })).status, 303);
    const detail = await getPage('/projects/1');
    assert.equal(selectedPriority(detail, 1), 'high');
    assert.equal(selectedPriority(detail, 2), 'low');
    assert.match(detail, /aria-label="Complete Done" checked/);
    assert.match(detail, /aria-label="Complete Pending">/);
    assert.ok(detail.indexOf('<span>Done') < detail.indexOf('<span>Pending'));
    assert.equal(await getPage('/'), summary);
    assert.equal(await getPage('/projects/2'), other);
    const completed = await getPage('/projects/1?filter=completed');
    const open = await getPage('/projects/1?filter=open');
    assert.equal(selectedPriority(completed, 1), 'high');
    assert.doesNotMatch(completed, /task-priority-2/);
    assert.equal(selectedPriority(open, 2), 'low');
    assert.doesNotMatch(open, /task-priority-1/);
    for (const values of [{}, { priority: '' }, { priority: 'urgent' }]) {
      assert.equal((await post('/projects/1/tasks/1/priority', values)).status, 400);
    }
    for (const path of [
      '/projects/2/tasks/1/priority', '/projects/1/tasks/3/priority',
      '/projects/1/tasks/999/priority', '/projects/999/tasks/1/priority',
      '/projects/1/tasks/9007199254740993/priority',
    ]) {
      assert.equal((await post(path, { priority: 'low' })).status, 404);
    }
    assert.equal(await getPage('/projects/1'), detail);
    await post('/projects/1/tasks/1/rename', { title: '  Reviewed  ' });
    const renamed = await getPage('/projects/1');
    assert.equal(selectedPriority(renamed, 1), 'high');
    assert.match(renamed, /aria-label="Complete Reviewed" checked/);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await getPage('/projects/1'), renamed);
    assert.equal(await getPage('/'), summary);
    assert.equal(await getPage('/projects/2'), other);
    await post('/projects/1/archive');
    const archived = await getPage('/projects/1');
    assert.match(archived, /id="task-priority-1" name="priority" disabled/);
    assert.match(archived, /id="task-priority-2" name="priority" disabled/);
    assert.equal(selectedPriority(archived, 1), 'high');
    assert.equal(selectedPriority(archived, 2), 'low');
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'normal' })).status, 409);
    assert.equal(await getPage('/projects/1'), archived);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await getPage('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await getPage('/projects/1'), renamed);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'normal' })).status, 303);
    const restored = await getPage('/projects/1');
    assert.equal(selectedPriority(restored, 1), 'normal');
    assert.equal(selectedPriority(restored, 2), 'low');
    assert.equal(await getPage('/'), summary);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await getPage('/projects/1'), restored);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('combined filters preserve selections and re-evaluate edits across archive and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-combined-filters-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const getPage = async (path) => (await fetch(`${server.baseUrl}${path}`)).text();
    const titles = (html) => [...html.matchAll(/data-testid="task-row"[^>]*>\s*<span>([^<]*)<\/span>/g)]
      .map((match) => match[1]);
    const selected = (html, id) => {
      const select = html.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`));
      assert.ok(select);
      return select[1].match(/<option value="([^"]+)" selected>/)?.[1];
    };
    const assertSelections = (html, filter, priority) => {
      assert.equal(selected(html, 'task-filter'), filter);
      assert.equal(selected(html, 'priority-filter'), priority);
    };
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const tasks = [
      ['Low open', 'low', false], ['High done', 'high', true],
      ['Normal open', 'normal', false], ['Low done', 'low', true],
      ['High open', 'high', false], ['Normal done', 'normal', true],
      ['Another high open', 'high', false],
    ];
    for (const [index, [title, priority, completed]] of tasks.entries()) {
      await post('/projects/1/tasks', { title });
      await post(`/projects/1/tasks/${index + 1}/priority`, { priority });
      if (completed) await post(`/projects/1/tasks/${index + 1}/completion`, { completed: 'true' });
    }
    await post('/projects/2/tasks', { title: 'Other project' });
    const summary = await getPage('/');
    assert.match(summary, /data-testid="project-summary">3\/7 completed/);
    const original = await getPage('/projects/1');
    assertSelections(original, 'all', 'all');
    assert.match(original, /<label for="priority-filter">Priority filter<\/label>/);
    const filterForm = original.match(/<form[^>]*class="task-filter"[^>]*>([\s\S]*?)<\/form>/)[1];
    assert.match(filterForm, /id="task-filter" name="filter"/);
    assert.match(filterForm, /id="priority-filter" name="priorityFilter"/);
    const priorityOptions = filterForm.match(/id="priority-filter"[^>]*>([\s\S]*?)<\/select>/)[1];
    assert.deepEqual([...priorityOptions.matchAll(/>([^<]+)<\/option>/g)].map((match) => match[1]),
      ['All', 'Low', 'Normal', 'High']);
    for (const form of original.matchAll(/<form method="post"[^>]*>([\s\S]*?)<\/form>/g)) {
      assert.match(form[1], /name="filter" value="all"/);
      assert.match(form[1], /name="priorityFilter" value="all"/);
    }
    for (const filter of ['all', 'open', 'completed']) {
      for (const priority of ['all', 'low', 'normal', 'high']) {
        const html = await getPage(`/projects/1?filter=${filter}&priorityFilter=${priority}`);
        assertSelections(html, filter, priority);
        assert.deepEqual(titles(html), tasks.filter(([, taskPriority, completed]) => (
          (filter === 'all' || completed === (filter === 'completed'))
          && (priority === 'all' || taskPriority === priority)
        )).map(([title]) => title));
      }
    }
    assert.equal(await getPage('/'), summary);
    assertSelections(await getPage('/projects/1?filter=invalid&priorityFilter=invalid'), 'all', 'all');

    const state = { filter: 'open', priorityFilter: 'high' };
    const edit = async (action, values, expectedTitles) => {
      const response = await post(action, { ...state, ...values });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/projects/1?filter=open&priorityFilter=high');
      const html = await getPage(response.headers.get('location'));
      assertSelections(html, 'open', 'high');
      assert.deepEqual(titles(html), expectedTitles);
      return html;
    };
    let html = await edit('/projects/1/tasks/5/rename', { title: '  Renamed high  ' },
      ['Renamed high', 'Another high open']);
    assert.match(html, /aria-label="Complete Renamed high">/);
    assert.equal(selected(html, 'task-priority-5'), 'high');
    assert.equal(await getPage('/'), summary);
    await edit('/projects/1/tasks/5/priority', { priority: 'low' }, ['Another high open']);
    assert.equal(await getPage('/'), summary);
    await edit('/projects/1/tasks/7/completion', { completed: 'true' }, []);
    html = await getPage('/projects/1?filter=completed&priorityFilter=high');
    assert.deepEqual(titles(html), ['High done', 'Another high open']);
    assertSelections(html, 'completed', 'high');
    assert.match(await getPage('/'), /data-testid="project-summary">4\/7 completed/);
    // Unchecking also removes a row from the completed/high intersection.
    const unchecked = await post('/projects/1/tasks/7/completion', {
      filter: 'completed', priorityFilter: 'high',
    });
    assert.equal(unchecked.headers.get('location'), '/projects/1?filter=completed&priorityFilter=high');
    html = await getPage(unchecked.headers.get('location'));
    assertSelections(html, 'completed', 'high');
    assert.deepEqual(titles(html), ['High done']);
    assert.equal(await getPage('/'), summary);
    for (const [path, values, alert] of [
      ['/projects/1/tasks/7/rename', { title: '   ' }, 'Task title is required'],
      ['/projects/1/tasks', { title: '   ' }, 'Task title is required'],
      ['/projects/1/tasks/7/priority', { priority: 'urgent' }, 'Invalid task priority'],
      ['/projects/1/rename', { name: '   ' }, 'Project name is required'],
    ]) {
      const response = await post(path, { ...state, ...values });
      assert.equal(response.status, 400);
      const invalid = await response.text();
      assertSelections(invalid, 'open', 'high');
      assert.deepEqual(titles(invalid), ['Another high open']);
      assert.ok(invalid.includes(`role="alert">${alert}`));
    }
    await edit('/projects/1/rename', { name: 'Renamed project' }, ['Another high open']);
    const saved = await getPage('/projects/1');
    const filtered = await getPage('/projects/1?filter=open&priorityFilter=high');
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await getPage('/projects/1'), saved);
    assert.equal(await getPage('/projects/1?filter=open&priorityFilter=high'), filtered);
    assert.deepEqual(titles(await getPage('/projects/2')), ['Other project']);
    await post('/projects/1/archive');
    html = await getPage('/projects/1?filter=open&priorityFilter=high');
    assertSelections(html, 'open', 'high');
    assert.deepEqual(titles(html), ['Another high open']);
    assert.match(html, /Archived project/);
    assert.match(html, /aria-label="Complete Another high open" disabled/);
    assert.match(html, /id="task-priority-7" name="priority" disabled/);
    assert.match(html, /id="new-task-title-7" name="title" type="text" disabled/);
    assert.doesNotMatch(html, /id="(?:task-filter|priority-filter)"[^>]*disabled/);
    const blocked = await post('/projects/1/tasks/7/priority', { ...state, priority: 'low' });
    assert.equal(blocked.status, 409);
    assertSelections(await blocked.text(), 'open', 'high');
    html = await getPage('/projects/1?filter=completed&priorityFilter=normal');
    assertSelections(html, 'completed', 'normal');
    assert.deepEqual(titles(html), ['Normal done']);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await getPage('/projects/1?filter=completed&priorityFilter=normal'), html);
    await post('/projects/1/restore');
    assert.equal(await getPage('/projects/1'), saved);
    assert.equal(await getPage('/projects/1?filter=open&priorityFilter=high'), filtered);
    assert.doesNotMatch(filtered, / disabled/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project default storage validates edits and leaves existing tasks unchanged', () => {
  const store = openWorkboard(':memory:');
  try {
    const first = store.create('First');
    const second = store.create('Second');
    assert.equal(store.find(first.id).default_task_priority, 'normal');
    const original = store.tasks.create(first.id, 'Original');
    store.tasks.setCompleted(first.id, original.id, true);
    const tasks = store.tasks.list(first.id);
    const summary = store.list();
    for (const priority of ['', 'urgent', 'High', null, undefined, 42]) {
      assert.equal(store.setDefaultPriority(first.id, priority), false);
    }
    assert.equal(store.setDefaultPriority(999, 'high'), false);
    assert.equal(store.setDefaultPriority(first.id, 'high'), true);
    assert.deepEqual(store.tasks.list(first.id), tasks);
    assert.deepEqual(store.list(), summary);
    assert.equal(store.tasks.create(first.id, 'High task').priority, 'high');
    assert.equal(store.tasks.create(second.id, 'Independent task').priority, 'normal');
    store.setArchived(first.id, true);
    assert.equal(store.setDefaultPriority(first.id, 'low'), false);
    assert.equal(store.find(first.id).default_task_priority, 'high');
    store.setArchived(first.id, false);
    assert.equal(store.setDefaultPriority(first.id, 'low'), true);
    assert.equal(store.tasks.create(first.id, 'Low task').priority, 'low');
    assert.deepEqual(store.tasks.list(first.id).map((task) => task.priority), ['normal', 'high', 'low']);
  } finally {
    store.close();
  }
});

test('project defaults migrate without altering existing priorities or project data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-default-migration-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let store;
  try {
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER REFERENCES projects(id),
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'normal');
      INSERT INTO projects VALUES (7, 'Existing', 1);
      INSERT INTO tasks VALUES (12, 7, 'Existing task', 1, 'high');
    `);
    database.close();
    store = openWorkboard(databasePath);
    assert.deepEqual({ ...store.find(7) }, { id: 7, name: 'Existing', archived: 1, default_task_priority: 'normal' });
    assert.deepEqual({ ...store.tasks.list(7)[0] }, { id: 12, title: 'Existing task', completed: 1, priority: 'high', due_date: '' });
    store.setArchived(7, false);
    assert.equal(store.tasks.create(7, 'Next').priority, 'normal');
    store.setDefaultPriority(7, 'low');
    store.close();
    store = openWorkboard(databasePath);
    assert.equal(store.find(7).default_task_priority, 'low');
    assert.deepEqual(store.tasks.list(7).map((task) => task.priority), ['high', 'normal']);
  } finally {
    if (store) store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project defaults persist independently and preserve filters through rename, archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-default-http-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const getPage = async (path) => (await fetch(`${server.baseUrl}${path}`)).text();
    const selected = (html, id) => {
      const select = html.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`));
      assert.ok(select);
      return select[1].match(/<option value="([^"]+)" selected>/)?.[1];
    };
    const titles = (html) => [...html.matchAll(/data-testid="task-row"[^>]*>\s*<span>([^<]*)<\/span>/g)]
      .map((match) => match[1]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const initial = await getPage('/projects/1');
    assert.match(initial, /<label for="default-task-priority">Default task priority<\/label>/);
    const options = initial.match(/id="default-task-priority"[^>]*>([\s\S]*?)<\/select>/)[1];
    assert.deepEqual([...options.matchAll(/>([^<]+)<\/option>/g)].map((match) => match[1]), ['Low', 'Normal', 'High']);
    assert.equal(selected(initial, 'default-task-priority'), 'normal');
    assert.match(initial, /action="\/projects\/1\/default-priority"[^>]*data-submit-on-change/);
    await post('/projects/1/tasks', { title: 'Original' });
    await post('/projects/1/tasks/1/completion', { completed: 'true' });
    const summary = await getPage('/');
    const state = { filter: 'completed', priorityFilter: 'normal' };
    const response = await post('/projects/1/default-priority', { ...state, priority: 'high' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1?filter=completed&priorityFilter=normal');
    let page = await getPage(response.headers.get('location'));
    assert.equal(selected(page, 'task-filter'), 'completed');
    assert.equal(selected(page, 'priority-filter'), 'normal');
    assert.equal(selected(page, 'default-task-priority'), 'high');
    assert.equal(selected(page, 'task-priority-1'), 'normal');
    assert.deepEqual(titles(page), ['Original']);
    assert.equal(await getPage('/'), summary);
    assert.equal(selected(await getPage('/projects/2'), 'default-task-priority'), 'normal');
    for (const values of [{}, { priority: 'urgent' }, { priority: 'High' }]) {
      const invalid = await post('/projects/1/default-priority', { ...state, ...values });
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.equal(selected(html, 'task-filter'), 'completed');
      assert.equal(selected(html, 'priority-filter'), 'normal');
      assert.equal(selected(html, 'default-task-priority'), 'high');
    }
    assert.equal((await post('/projects/999/default-priority', { priority: 'low' })).status, 404);
    await post('/projects/1/tasks', { title: 'Inherited high' });
    await post('/projects/1/default-priority', { priority: 'low' });
    await post('/projects/1/tasks', { title: 'Inherited low' });
    await post('/projects/2/default-priority', { priority: 'high' });
    await post('/projects/2/tasks', { title: 'Independent high' });
    await post('/projects/1/tasks/2/rename', { title: 'Renamed high' });
    await post('/projects/1/rename', { name: 'Renamed project' });
    page = await getPage('/projects/1');
    assert.deepEqual(titles(page), ['Original', 'Renamed high', 'Inherited low']);
    assert.equal(selected(page, 'task-priority-1'), 'normal');
    assert.equal(selected(page, 'task-priority-2'), 'high');
    assert.equal(selected(page, 'task-priority-3'), 'low');
    assert.match(page, /aria-label="Complete Original" checked/);
    const saved = page;
    await post('/projects/1/archive');
    const archived = await getPage('/projects/1?filter=completed&priorityFilter=normal');
    assert.match(archived, /id="default-task-priority" name="priority" disabled/);
    assert.equal(selected(archived, 'default-task-priority'), 'low');
    assert.deepEqual(titles(archived), ['Original']);
    assert.equal((await post('/projects/1/default-priority', { ...state, priority: 'high' })).status, 409);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await getPage('/projects/1?filter=completed&priorityFilter=normal'), archived);
    assert.equal(selected(await getPage('/projects/2'), 'default-task-priority'), 'high');
    await post('/projects/1/restore');
    assert.equal(await getPage('/projects/1'), saved);
    await post('/projects/1/tasks', { title: 'Low after restore' });
    page = await getPage('/projects/1');
    assert.equal(selected(page, 'task-priority-5'), 'low');
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await getPage('/projects/1'), page);
    assert.match(await getPage('/'), /data-testid="project-summary">1\/4 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('due dates migrate existing tasks without changing their identities or state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-due-migration-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let store;
  try {
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0, default_task_priority TEXT NOT NULL DEFAULT 'normal');
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER REFERENCES projects(id),
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'normal');
      INSERT INTO projects VALUES (7, 'Existing', 1, 'low');
      INSERT INTO tasks VALUES (12, 7, 'Existing task', 1, 'high');
    `);
    database.close();
    store = openWorkboard(databasePath);
    assert.deepEqual({ ...store.tasks.list(7)[0] }, {
      id: 12, title: 'Existing task', completed: 1, priority: 'high', due_date: '',
    });
    assert.equal(store.find(7).default_task_priority, 'low');
    store.setArchived(7, false);
    assert.equal(store.tasks.setDueDate(7, 12, '0001-01-01'), true);
    store.close();
    store = openWorkboard(databasePath);
    assert.equal(store.tasks.list(7)[0].due_date, '0001-01-01');
    assert.equal(store.tasks.create(7, 'New task').due_date, '');
  } finally {
    if (store) store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('due-date forms validate, preserve filters and persist through renames, archive and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-due-http-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const getPage = async (path) => (await fetch(`${server.baseUrl}${path}`)).text();
    const dueDate = (html, id) => html.match(new RegExp(`id="task-due-date-${id}"[^>]*value="([^"]*)"`))?.[1];
    const state = { filter: 'completed', priorityFilter: 'high' };
    const path = '/projects/1?filter=completed&priorityFilter=high';
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Original' });
    await post('/projects/1/tasks', { title: 'Independent' });
    await post('/projects/2/tasks', { title: 'Other project' });
    await post('/projects/1/tasks/1/completion', { completed: 'true' });
    await post('/projects/1/tasks/1/priority', { priority: 'high' });
    const initial = await getPage(path);
    assert.equal(dueDate(initial, 1), '');
    assert.match(initial, /<label for="task-due-date-1">Task due date<\/label>/);
    assert.match(initial, /<button type="submit">Save due date<\/button>/);
    assert.doesNotMatch(initial, /task-due-date-2/);
    const summary = await getPage('/');
    const independent = await getPage('/projects/2');
    const saved = await post('/projects/1/tasks/1/due-date', { ...state, dueDate: '  2000-02-29  ' });
    assert.equal(saved.status, 303);
    assert.equal(saved.headers.get('location'), path);
    const dated = await getPage(path);
    assert.equal(dueDate(dated, 1), '2000-02-29');
    assert.equal(dated.replace('value="2000-02-29"', 'value=""'), initial);
    assert.equal(await getPage('/'), summary);
    assert.equal(await getPage('/projects/2'), independent);
    assert.equal(dueDate(await getPage('/projects/1'), 2), '');
    for (const dueDate of ['1900-02-29', '2024-04-31', '0000-01-01', '2024-1-01', '<script>']) {
      const invalid = await post('/projects/1/tasks/1/due-date', { ...state, dueDate });
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      assert.match(html, /<option value="completed" selected>/);
      assert.match(html, /id="priority-filter"[\s\S]*?<option value="high" selected>/);
      assert.equal(html.match(/id="task-due-date-1"[^>]*value="([^"]*)"/)[1], '2000-02-29');
      assert.equal(await getPage(path), dated);
    }
    for (const action of ['/projects/2/tasks/1/due-date', '/projects/1/tasks/3/due-date',
      '/projects/1/tasks/999/due-date', '/projects/999/tasks/1/due-date']) {
      assert.equal((await post(action, { dueDate: '2024-12-31' })).status, 404);
    }
    await post('/projects/1/tasks/1/rename', { ...state, title: 'Renamed' });
    await post('/projects/1/rename', { ...state, name: 'Renamed project' });
    const renamed = await getPage(path);
    assert.equal(dueDate(renamed, 1), '2000-02-29');
    assert.match(renamed, /aria-label="Complete Renamed" checked/);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await getPage(path), renamed);
    await post('/projects/1/archive');
    const archived = await getPage(path);
    assert.match(archived, /id="task-due-date-1"[^>]*value="2000-02-29" disabled/);
    assert.match(archived, /<button type="submit" disabled>Save due date<\/button>/);
    assert.equal((await post('/projects/1/tasks/1/due-date', { ...state, dueDate: '' })).status, 409);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await getPage(path), archived);
    await post('/projects/1/restore');
    assert.equal(await getPage(path), renamed);
    for (const value of ['', ' \t\n ']) {
      await post('/projects/1/tasks/1/due-date', { ...state, dueDate: '9999-12-31' });
      const cleared = await post('/projects/1/tasks/1/due-date', { ...state, dueDate: value });
      assert.equal(cleared.status, 303);
      assert.equal(cleared.headers.get('location'), path);
      assert.equal(dueDate(await getPage(path), 1), '');
    }
    const cleared = await getPage(path);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await getPage(path), cleared);
    assert.match(await getPage('/'), /data-testid="project-summary">1\/2 completed/);
    // Project renaming also updates its name in other projects' move destinations.
    assert.equal(await getPage('/projects/2'), independent.replace('<option value="1">First</option>', '<option value="1">Renamed project</option>'));
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('due ranges intersect filters, retain applied state on errors and edits, and work across archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-range-http-'));
  let server;
  try {
    server = await startServer(join(directory, 'workboard.sqlite'));
    const post = (path, values = {}) => fetch(`${server.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const getPage = async (path) => (await fetch(`${server.baseUrl}${path}`)).text();
    const titles = (html) => [...html.matchAll(/data-testid="task-row"[^>]*>\s*<span>([^<]*)<\/span>/g)]
      .map((match) => match[1]);
    const state = { filter: 'all', priorityFilter: 'high', dueFrom: '2024-02-29', dueThrough: '2024-03-01' };
    const path = (values) => `/projects/1?${new URLSearchParams(values)}`;
    const assertState = (html, values) => {
      assert.match(html, new RegExp(`id="task-filter"[\\s\\S]*?<option value="${values.filter}" selected>`));
      assert.match(html, new RegExp(`id="priority-filter"[\\s\\S]*?<option value="${values.priorityFilter}" selected>`));
      assert.ok(html.includes(`id="due-from" name="dueFrom" type="text" value="${values.dueFrom}"`));
      assert.ok(html.includes(`id="due-through" name="dueThrough" type="text" value="${values.dueThrough}"`));
      // Every edit form and the combobox form must carry the applied range.
      for (const form of html.matchAll(/<form[^>]*>([\s\S]*?)<\/form>/g)) {
        if (!/method="post"|class="task-filter"/.test(form[0])) continue;
        assert.ok(form[1].includes(`name="dueFrom" value="${values.dueFrom}"`));
        assert.ok(form[1].includes(`name="dueThrough" value="${values.dueThrough}"`));
      }
    };
    // Submit the rendered range form, including its previous applied boundaries.
    const apply = async (html, overrides) => {
      const form = html.match(/<form[^>]*class="due-range"[^>]*>([\s\S]*?)<\/form>/)[1];
      const values = Object.fromEntries([...form.matchAll(/name="([^"]+)"[^>]*value="([^"]*)"/g)]
        .map((match) => [match[1], match[2]]));
      return fetch(`${server.baseUrl}${path({ ...values, ...overrides })}`);
    };
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const fixture = [
      ['Undated', '', 'high'], ['Before', '2024-02-28', 'high'],
      ['Start', '2024-02-29', 'high'], ['End', '2024-03-01', 'high'],
      ['After', '2024-03-02', 'high'], ['Normal', '2024-02-29', 'normal'],
    ];
    for (const [index, [title, dueDate, priority]] of fixture.entries()) {
      await post('/projects/1/tasks', { title });
      await post(`/projects/1/tasks/${index + 1}/due-date`, { dueDate });
      await post(`/projects/1/tasks/${index + 1}/priority`, { priority });
    }
    await post('/projects/1/tasks/4/completion', { completed: 'true' });
    await post('/projects/2/tasks', { title: 'Other project' });
    const originalSummary = await getPage('/');
    let page = await getPage(path({ filter: 'all', priorityFilter: 'high' }));
    const applied = await apply(page, { dueFrom: ' 2024-02-29 ', dueThrough: ' 2024-03-01 ' });
    assert.equal(applied.status, 200);
    page = await applied.text();
    assertState(page, state);
    assert.deepEqual(titles(page), ['Start', 'End']);
    assert.deepEqual(titles(await getPage(path({ ...state, filter: 'open' }))), ['Start']);
    assert.deepEqual(titles(await getPage(path({ ...state, filter: 'completed' }))), ['End']);
    assert.deepEqual(titles(await getPage(path({ ...state, priorityFilter: 'normal' }))), ['Normal']);
    assert.deepEqual(titles(await getPage(path({ ...state, priorityFilter: 'all' }))), ['Start', 'End', 'Normal']);
    assert.deepEqual(titles(await getPage(path({ ...state, dueThrough: '' }))), ['Start', 'End', 'After']);
    assert.deepEqual(titles(await getPage(path({ ...state, dueFrom: '' }))), ['Before', 'Start', 'End']);
    assert.deepEqual(titles(await getPage(path({ ...state, dueFrom: '', dueThrough: '' }))), fixture.slice(0, 5).map(([title]) => title));
    for (const [boundaries, message] of [
      [{ dueFrom: '2024-02-30' }, 'Due range must use valid YYYY-MM-DD dates'],
      [{ dueThrough: '0000-01-01' }, 'Due range must use valid YYYY-MM-DD dates'],
      [{ dueFrom: '2024-03-02' }, 'Due from must not be after Due through'],
    ]) {
      const invalid = await apply(page, boundaries);
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.ok(html.includes(`role="alert">${message}`));
      assert.deepEqual(titles(html), ['Start', 'End']);
      assertState(html, state);
      page = html;
    }
    assert.equal(await getPage('/'), originalSummary);
    const edit = async (action, values, expected, selected = state) => {
      const response = await post(action, { ...selected, ...values });
      assert.equal(response.status, 303);
      const html = await getPage(response.headers.get('location'));
      assertState(html, selected);
      assert.deepEqual(titles(html), expected);
      return html;
    };
    await edit('/projects/1/tasks/3/rename', { title: 'Renamed start' }, ['Renamed start', 'End']);
    await edit('/projects/1/rename', { name: 'Renamed project' }, ['Renamed start', 'End']);
    await edit('/projects/1/default-priority', { priority: 'high' }, ['Renamed start', 'End']);
    await edit('/projects/1/tasks', { title: 'New undated' }, ['Renamed start', 'End']);
    await edit('/projects/1/tasks/3/due-date', { dueDate: '2024-03-02' }, ['End']);
    await edit('/projects/1/tasks/3/due-date', { dueDate: '2024-02-29' }, ['Renamed start', 'End']);
    const invalidDate = await post('/projects/1/tasks/3/due-date', { ...state, dueDate: '2024-02-30' });
    assert.equal(invalidDate.status, 400);
    const invalidDatePage = await invalidDate.text();
    assertState(invalidDatePage, state);
    assert.deepEqual(titles(invalidDatePage), ['Renamed start', 'End']);
    await edit('/projects/1/tasks/3/due-date', { dueDate: '  ' }, ['End']);
    await edit('/projects/1/tasks/3/due-date', { dueDate: '2024-02-29' }, ['Renamed start', 'End']);
    await edit('/projects/1/tasks/3/priority', { priority: 'low' }, ['End']);
    await edit('/projects/1/tasks/3/priority', { priority: 'high' }, ['Renamed start', 'End']);
    await edit('/projects/1/tasks/3/completion', { completed: 'true' }, [], { ...state, filter: 'open' });
    await edit('/projects/1/tasks/3/completion', {}, ['Renamed start'], { ...state, filter: 'open' });
    const saved = await getPage(path(state));
    const summary = await getPage('/');
    await post('/projects/1/archive');
    const archived = await getPage(path(state));
    assertState(archived, state);
    assert.deepEqual(titles(archived), ['Renamed start', 'End']);
    assert.match(archived, /id="task-due-date-3"[^>]* disabled/);
    assert.doesNotMatch(archived, /id="(?:due-from|due-through|task-filter|priority-filter)"[^>]* disabled/);
    const archivedRange = await apply(archived, { dueFrom: '', dueThrough: '2024-02-29' });
    assert.deepEqual(titles(await archivedRange.text()), ['Before', 'Renamed start']);
    const blocked = await post('/projects/1/tasks/3/due-date', { ...state, dueDate: '' });
    assert.equal(blocked.status, 409);
    assertState(await blocked.text(), state);
    await server.stop();
    server = await startServer(join(directory, 'workboard.sqlite'));
    assert.equal(await getPage(path(state)), archived);
    await post('/projects/1/restore');
    assert.equal(await getPage(path(state)), saved);
    assert.equal(await getPage('/'), summary);
    const reopened = await getPage('/projects/1');
    assertState(reopened, { filter: 'all', priorityFilter: 'all', dueFrom: '', dueThrough: '' });
    assert.deepEqual(titles(reopened), ['Undated', 'Before', 'Renamed start', 'End', 'After', 'Normal', 'New undated']);
    assert.deepEqual(titles(await getPage('/projects/2')), ['Other project']);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task moves migrate order, preserve data, restore positions and reject invalid ownership or archive state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-move-migration-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let store;
  try {
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0, default_task_priority TEXT NOT NULL DEFAULT 'normal');
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER REFERENCES projects(id),
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'normal',
        due_date TEXT NOT NULL DEFAULT '');
      INSERT INTO projects VALUES (1, 'Source', 0, 'normal'), (2, 'Destination', 0, 'low'), (3, 'Archived', 1, 'normal');
      INSERT INTO tasks VALUES (1, 1, 'Moving', 1, 'high', '0001-01-01'),
        (2, 1, 'Undated', 0, 'normal', ''), (3, 2, 'Destination first', 0, 'low', ''),
        (4, 2, 'Destination second', 1, 'normal', '9999-12-31');
    `);
    database.close();
    store = openWorkboard(databasePath);
    const ids = (projectId) => store.tasks.list(projectId).map((task) => task.id);
    assert.deepEqual(ids(1), [1, 2]);
    assert.deepEqual(ids(2), [3, 4]);
    const moving = { ...store.tasks.list(1)[0] };
    for (const [source, task, destination] of [
      [1, 1, 1], [1, 1, 3], [1, 1, 999], [1, 1, 0], [1, 1, 1.5],
      [1, 1, '2'], [2, 1, 1], [1, 3, 2], [1, 999, 2], [999, 1, 2],
    ]) assert.equal(store.tasks.move(source, task, destination), false);
    assert.deepEqual(ids(1), [1, 2]);
    assert.deepEqual(ids(2), [3, 4]);
    store.setArchived(1, true);
    assert.equal(store.tasks.move(1, 1, 2), false);
    store.setArchived(1, false);
    assert.equal(store.tasks.move(1, 1, 2), true);
    assert.deepEqual(ids(1), [2]);
    assert.deepEqual(ids(2), [3, 4, 1]);
    assert.deepEqual({ ...store.tasks.list(2)[2] }, moving);
    assert.equal(store.tasks.rename(1, 1, 'Wrong owner'), false);
    assert.equal(store.tasks.setCompleted(1, 1, false), false);
    assert.equal(store.tasks.setPriority(1, 1, 'low'), false);
    assert.equal(store.tasks.setDueDate(1, 1, ''), false);
    assert.deepEqual(store.list().map((project) => [project.completed_count, project.total_count]), [[0, 1], [2, 3]]);
    const created = store.tasks.create(2, 'Created after move');
    assert.equal(created.priority, 'low');
    assert.deepEqual(ids(2), [3, 4, 1, created.id]);
    assert.equal(store.tasks.move(1, 2, 2), true);
    assert.deepEqual(ids(2), [3, 4, 1, created.id, 2]);
    assert.equal(store.tasks.list(2).at(-1).due_date, '');
    assert.equal(store.tasks.move(2, 1, 1), true);
    assert.equal(store.tasks.move(1, 1, 2), true);
    assert.deepEqual(ids(2), [3, 4, 1, created.id, 2]);
    store.close();
    store = openWorkboard(databasePath);
    assert.deepEqual(ids(2), [3, 4, 1, created.id, 2]);
    assert.deepEqual({ ...store.tasks.list(2)[2] }, moving);
    assert.deepEqual(ids(1), []);
  } finally {
    if (store) store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('move forms list eligible destinations, preserve source filters and summaries, and persist through archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-move-http-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const getPage = async (path) => (await fetch(`${server.baseUrl}${path}`)).text();
    const titles = (html) => [...html.matchAll(/data-testid="task-row"[^>]*>\s*<span>([^<]*)<\/span>/g)].map((match) => match[1]);
    const destinations = (html, id) => [...html.match(new RegExp(`id="destination-project-${id}"[^>]*>([\\s\\S]*?)</select>`))[1]
      .matchAll(/<option value="(\d+)">([^<]*)<\/option>/g)].map((match) => [match[1], match[2]]);
    await post('/projects', { name: 'Source' });
    await post('/projects/1/tasks', { title: 'Moving' });
    let page = await getPage('/projects/1');
    assert.deepEqual(destinations(page, 1), []);
    assert.match(page, /id="destination-project-1"[^>]* disabled/);
    assert.match(page, /<button type="submit" disabled>Move task<\/button>/);
    await post('/projects', { name: 'Destination' });
    await post('/projects', { name: 'Excluded' });
    await post('/projects', { name: 'Last' });
    await post('/projects/3/archive');
    await post('/projects/2/rename', { name: 'Current & name' });
    await post('/projects/2/default-priority', { priority: 'low' });
    await post('/projects/1/tasks', { title: 'Remaining match' });
    await post('/projects/1/tasks', { title: 'Hidden' });
    await post('/projects/2/tasks', { title: 'Destination existing' });
    for (const id of [1, 2]) {
      await post(`/projects/1/tasks/${id}/completion`, { completed: 'true' });
      await post(`/projects/1/tasks/${id}/priority`, { priority: 'high' });
      await post(`/projects/1/tasks/${id}/due-date`, { dueDate: '2024-02-29' });
    }
    const state = { filter: 'completed', priorityFilter: 'high', dueFrom: '2024-02-29', dueThrough: '2024-03-01' };
    const path = `/projects/1?${new URLSearchParams(state)}`;
    page = await getPage(path);
    assert.deepEqual(titles(page), ['Moving', 'Remaining match']);
    assert.deepEqual(destinations(page, 1), [['2', 'Current &amp; name'], ['4', 'Last']]);
    const form = page.match(/<form[^>]*action="\/projects\/1\/tasks\/1\/move"[^>]*>([\s\S]*?)<\/form>/)[1];
    const hidden = Object.fromEntries([...form.matchAll(/name="([^"]+)" value="([^"]*)"/g)].map((match) => [match[1], match[2]]));
    assert.deepEqual(hidden, state);
    for (const destinationId of ['1', '3', '999', '', 'invalid']) {
      const rejected = await post('/projects/1/tasks/1/move', { ...hidden, destinationId });
      assert.equal(rejected.status, 400);
      assert.deepEqual(titles(await rejected.text()), ['Moving', 'Remaining match']);
    }
    const moved = await post('/projects/1/tasks/1/move', { ...hidden, destinationId: '2' });
    assert.equal(moved.status, 303);
    assert.equal(moved.headers.get('location'), path);
    const source = await getPage(path);
    assert.deepEqual(titles(source), ['Remaining match']);
    assert.match(source, /id="task-filter"[\s\S]*?<option value="completed" selected>/);
    assert.match(source, /id="priority-filter"[\s\S]*?<option value="high" selected>/);
    assert.match(source, /id="due-from"[^>]*value="2024-02-29"/);
    assert.match(source, /id="due-through"[^>]*value="2024-03-01"/);
    const destination = await getPage('/projects/2');
    assert.deepEqual(titles(destination), ['Destination existing', 'Moving']);
    assert.match(destination, /aria-label="Complete Moving" checked/);
    assert.match(destination, /id="task-priority-1"[\s\S]*?<option value="high" selected>/);
    assert.match(destination, /id="task-due-date-1"[^>]*value="2024-02-29"/);
    assert.deepEqual(destinations(destination, 1), [['1', 'Source'], ['4', 'Last']]);
    assert.deepEqual([...(await getPage('/')).matchAll(/data-testid="project-summary">([^<]*)/g)].map((match) => match[1]),
      ['1/2 completed', '1/2 completed', '0/0 completed']);
    await post('/projects/2/archive');
    const archived = await getPage('/projects/2');
    assert.match(archived, /id="destination-project-1"[^>]* disabled/);
    assert.match(archived, /<button type="submit" disabled>Move task<\/button>/);
    assert.equal((await post('/projects/2/tasks/1/move', { destinationId: '1' })).status, 409);
    await post('/projects/1/archive');
    await post('/projects/4/archive');
    await post('/projects/2/restore');
    const noDestinations = await getPage('/projects/2');
    assert.deepEqual(destinations(noDestinations, 1), []);
    assert.match(noDestinations, /id="destination-project-1"[^>]* disabled/);
    await post('/projects/1/restore');
    assert.doesNotMatch(await getPage('/projects/2'), /id="destination-project-1"[^>]* disabled/);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await getPage(path), source.replace('<option value="4">Last</option>', ''));
    assert.deepEqual(titles(await getPage('/projects/2')), ['Destination existing', 'Moving']);
    assert.equal((await post('/projects/2/tasks/1/move', { destinationId: '1' })).status, 303);
    assert.deepEqual(titles(await getPage('/projects/1')), ['Moving', 'Remaining match', 'Hidden']);
    assert.deepEqual(titles(await getPage(path)), ['Moving', 'Remaining match']);
    assert.equal((await post('/projects/1/tasks/3/move', { destinationId: '2' })).status, 303);
    assert.deepEqual(titles(await getPage('/projects/2')), ['Destination existing', 'Hidden']);
    assert.match(await getPage('/projects/2'), /id="task-due-date-3"[^>]*value=""/);
    const final = await getPage('/projects/1');
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await getPage('/projects/1'), final);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
