import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { openProjects } from '../projects.js';

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const port = await new Promise((resolve, reject) => {
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
      if (match) { clearTimeout(timer); resolve(match[1]); }
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

test('rename storage rejects invalid and archived changes while preserving project data', () => {
  const projects = openProjects(':memory:');
  try {
    projects.create('Original');
    projects.createTask(1, 'Saved task');
    projects.setTaskCompleted(1, 1, true);
    assert.equal(projects.rename(1, ' \t '), false);
    assert.equal(projects.find(1).name, 'Original');
    assert.equal(projects.rename(999, 'Missing'), false);
    projects.setArchived(1, true);
    assert.equal(projects.rename(1, 'Blocked'), false);
    assert.equal(projects.find(1).name, 'Original');
    projects.setArchived(1, false);
    assert.equal(projects.rename(1, '  Renamed  '), true);
    assert.deepEqual(projects.list().map((project) => ({ ...project })), [
      { id: 1, name: 'Renamed', archived: 0, total_count: 1, completed_count: 1 },
    ]);
    assert.deepEqual(projects.listTasks(1).map((task) => ({ ...task })), [
      { id: 1, title: 'Saved task', completed: 1 },
    ]);
  } finally {
    projects.close();
  }
});

test('rename validates, preserves identity and order, persists, and is enabled after restoration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const page = async (path) => (await fetch(`${server.url}${path}`)).text();
    const rows = (html) => [...html.matchAll(/<div data-testid="project-row"[\s\S]*?<\/div>/g)]
      .map((match) => match[0]);
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1/completion', { completed: 'on' });
    const initial = await page('/projects/1');
    assert.match(initial, /<label for="new-project-name">New project name<\/label>/);
    assert.match(initial, /id="new-project-name"[^>]*type="text"/);
    assert.match(initial, /<button type="submit">Rename project<\/button>/);
    for (const name of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/rename', { name, filter: 'Completed' });
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.match(html, /<h1>Original<\/h1>/);
      assert.match(html, /<option selected>Completed/);
      assert.doesNotMatch(html, /Complete Pending/);
      assert.equal(await page('/projects/1'), initial);
    }
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
    const renamed = await post('/projects/1/rename', { name: '  New & <name>  ', filter: 'Open' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Open');
    const detail = await page('/projects/1');
    assert.match(detail, /<h1>New &amp; &lt;name&gt;<\/h1>/);
    assert.match(detail, /aria-label="Complete Done" checked/);
    assert.match(detail, /aria-label="Complete Pending">/);
    assert.equal(detail, initial.replaceAll('Original', 'New &amp; &lt;name&gt;'));
    const list = await page('/');
    assert.match(rows(list)[0], /<span>New &amp; &lt;name&gt;<\/span>/);
    assert.match(rows(list)[0], /action="\/projects\/1"/);
    assert.match(rows(list)[0], /data-testid="project-summary">1\/2 completed/);
    assert.match(rows(list)[1], /<span>Second<\/span>/);

    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page('/projects/1'), detail);
    assert.equal(await page('/'), list);
    await post('/projects/1/archive');
    const archived = await page('/projects/1');
    assert.match(archived, /id="new-project-name"[^>]* disabled>/);
    assert.match(archived, /<button type="submit" disabled>Rename project<\/button>/);
    assert.equal((await post('/projects/1/rename', { name: 'Blocked' })).status, 409);
    assert.equal(await page('/projects/1'), archived);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await page('/projects/1'), detail);
    assert.equal((await post('/projects/1/rename', { name: ' Restored name ' })).status, 303);
    const restored = await page('/projects/1');
    assert.equal(restored, detail.replaceAll('New &amp; &lt;name&gt;', 'Restored name'));
    assert.match(rows(await page('/'))[0], /data-testid="project-summary">1\/2 completed/);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page('/projects/1'), restored);
    assert.match(rows(await page('/'))[0], /<span>Restored name<\/span>/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project validation, navigation, creation order, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await start(databasePath);
    let response = await fetch(`${server.url}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });

    const create = (name) => fetch(`${server.url}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    for (const name of ['', '  \t\n ']) {
      response = await create(name);
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    response = await create('  Alpha & <team>  ');
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/');
    assert.equal((await create('Beta')).status, 303);

    const html = await (await fetch(server.url)).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, />Create project<\/button>/);
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.ok(html.indexOf('Alpha &amp; &lt;team&gt;') < html.indexOf('Beta'));
    const projectPath = html.match(/action="(\/projects\/\d+)" method="get"/)[1];
    const detail = await (await fetch(`${server.url}${projectPath}`)).text();
    assert.match(detail, /<h1>Alpha &amp; &lt;team&gt;<\/h1>/);
    assert.match(detail, /action="\/" method="get"><button type="submit">Projects/);
    assert.equal((await fetch(`${server.url}/projects/99999`)).status, 404);
    assert.equal(await (await fetch(server.url)).text(), html);

    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await (await fetch(server.url)).text(), html);
    assert.equal(await (await fetch(`${server.url}${projectPath}`)).text(), detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('existing projects migrate, summaries count all tasks, and archive/restore preserve saved state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    // Seed the previous schema to verify upgrades preserve IDs and task state.
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id),
        title TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO projects (name) VALUES ('Existing');
      INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Done', 1), (1, 'Pending', 0);
    `);
    database.close();
    server = await start(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const page = async (path) => (await fetch(`${server.url}${path}`)).text();
    const rows = (html) => [...html.matchAll(/<div data-testid="project-row"[\s\S]*?<\/div>/g)]
      .map((match) => match[0]);
    let html = await page('/');
    assert.match(html, /<label for="project-filter">Project filter<\/label>/);
    assert.match(html, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(rows(html)[0], /data-testid="project-summary">1\/2 completed/);
    assert.match(rows(html)[0], />Archive project<\/button>/);
    await post('/projects', { name: 'New' });
    html = await page('/');
    assert.equal(rows(html).length, 2);
    assert.match(rows(html)[1], /data-testid="project-summary">0\/0 completed/);
    await post('/projects/2/tasks', { title: 'Another' });
    await post('/projects/2/tasks/3/completion', { completed: 'on' });
    assert.match(rows(await page('/'))[1], /data-testid="project-summary">1\/1 completed/);
    await page('/projects/1?filter=Completed');
    assert.match(rows(await page('/'))[0], /data-testid="project-summary">1\/2 completed/);

    assert.equal((await post('/projects/999/archive')).status, 404);
    assert.equal((await post('/projects/1/archive')).status, 303);
    assert.equal(rows(await page('/')).length, 1);
    assert.doesNotMatch(await page('/'), /Existing/);
    const archivedList = await page('/?filter=Archived');
    assert.equal(rows(archivedList).length, 1);
    assert.match(rows(archivedList)[0], /Existing/);
    assert.match(rows(archivedList)[0], /data-testid="project-summary">1\/2 completed/);
    assert.match(rows(archivedList)[0], />Open project<\/button>/);
    assert.match(rows(archivedList)[0], />Restore project<\/button>/);
    assert.doesNotMatch(rows(archivedList)[0], />Archive project<\/button>/);
    const archivedPage = await page('/projects/1');
    assert.match(archivedPage, /<p>Archived project<\/p>/);
    assert.match(archivedPage, /<button type="submit" disabled>Create task<\/button>/);
    assert.equal((archivedPage.match(/type="checkbox"[^>]* disabled/g) || []).length, 2);
    assert.match(archivedPage, /aria-label="Complete Done" checked disabled/);
    assert.match(await page('/projects/1?filter=Completed'), /Complete Done/);
    assert.doesNotMatch(await page('/projects/1?filter=Completed'), /Complete Pending/);
    assert.match(await page('/projects/1?filter=Open'), /Complete Pending/);
    assert.doesNotMatch(await page('/projects/1?filter=Open'), /Complete Done/);
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked' })).status, 409);
    assert.equal((await post('/projects/1/tasks/1/completion')).status, 409);
    assert.equal((await post('/projects/1/tasks/2/completion', { completed: 'on' })).status, 409);
    assert.equal(await page('/projects/1'), archivedPage);

    const invalid = await post('/projects', { name: ' ', filter: 'Archived' });
    assert.equal(invalid.status, 400);
    const invalidHtml = await invalid.text();
    assert.match(invalidHtml, /Project name is required/);
    assert.match(invalidHtml, /<option selected>Archived/);
    assert.equal(rows(invalidHtml).length, 1);

    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page('/?filter=Archived'), archivedList);
    assert.equal(await page('/projects/1'), archivedPage);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.equal(rows(await page('/?filter=Archived')).length, 0);
    html = await page('/');
    assert.equal(rows(html).length, 2);
    assert.match(rows(html)[0], /Existing/);
    assert.match(rows(html)[0], /data-testid="project-summary">1\/2 completed/);
    assert.doesNotMatch(await page('/projects/1'), /Archived project| disabled/);
    assert.equal((await post('/projects/1/tasks/2/completion', { completed: 'on' })).status, 303);
    await post('/projects/1/tasks', { title: 'After restore' });
    assert.match(rows(await page('/'))[0], /data-testid="project-summary">2\/3 completed/);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(rows(await page('/?filter=Archived')).length, 0);
    assert.match(rows(await page('/'))[0], /data-testid="project-summary">2\/3 completed/);
    assert.match(await page('/projects/1'), /After restore/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter in order, remain project-owned, and persist completion across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  let server;
  try {
    const databasePath = join(directory, 'workboard.sqlite');
    server = await start(databasePath);
    const post = (path, values) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const page = async (path) => (await fetch(`${server.url}${path}`)).text();
    const rows = (html) => [...html.matchAll(/<div data-testid="task-row"[\s\S]*?<\/div>/g)]
      .map((match) => match[0]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const initial = await page('/projects/1');
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, />Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(rows(html).length, 0);
    }
    assert.equal((await post('/projects/999/tasks', { title: 'Orphan' })).status, 404);
    const created = await post('/projects/1/tasks', { title: '  Alpha & <task>  ' });
    assert.equal(created.status, 303);
    assert.equal(created.headers.get('location'), '/projects/1?filter=All');
    await post('/projects/1/tasks', { title: 'Beta' });
    await post('/projects/2/tasks', { title: 'Private' });
    let html = await page('/projects/1');
    const taskRows = rows(html);
    assert.equal(taskRows.length, 2);
    assert.match(taskRows[0], /<span>Alpha &amp; &lt;task&gt;<\/span>/);
    assert.match(taskRows[0], /aria-label="Complete Alpha &amp; &lt;task&gt;"/);
    assert.match(taskRows[1], /<span>Beta<\/span>/);
    assert.doesNotMatch(html, / checked/);
    assert.equal(rows(await page('/projects/1?filter=Open')).length, 2);
    assert.equal(rows(await page('/projects/1?filter=Completed')).length, 0);
    assert.doesNotMatch(html, /Private/);
    assert.doesNotMatch(await page('/projects/2'), /Alpha|Beta/);

    assert.equal((await post('/projects/2/tasks/1/completion', { completed: 'on' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/completion', { completed: 'on' })).status, 404);
    const completed = await post('/projects/1/tasks/1/completion', { completed: 'on', filter: 'Open' });
    assert.equal(completed.status, 303);
    assert.equal(completed.headers.get('location'), '/projects/1?filter=Open');
    html = await page('/projects/1');
    assert.match(rows(html)[0], / checked/);
    assert.doesNotMatch(rows(html)[1], / checked/);
    assert.match(rows(await page('/projects/1?filter=Open'))[0], /Beta/);
    assert.match(rows(await page('/projects/1?filter=Completed'))[0], /Alpha/);
    assert.equal(rows(await page('/projects/1?filter=invalid')).length, 2);
    const invalid = await post('/projects/1/tasks', { title: ' ', filter: 'Completed' });
    const invalidHtml = await invalid.text();
    assert.equal(rows(invalidHtml).length, 1);
    assert.match(invalidHtml, /<option selected>Completed/);

    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page('/projects/1'), html);
    assert.equal(rows(await page('/projects/2')).length, 1);
    assert.equal((await post('/projects/1/tasks/1/completion', {})).status, 303);
    assert.equal(rows(await page('/projects/1?filter=Completed')).length, 0);
    assert.equal(rows(await page('/projects/1?filter=Open')).length, 2);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.doesNotMatch(await page('/projects/1'), / checked/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
