import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const port = await new Promise((resolve, reject) => {
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(match[1]);
    });
    child.on('error', reject);
    child.on('exit', code => reject(new Error(`Server exited: ${code}`)));
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

test('project creation, validation, navigation, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const dbPath = join(directory, 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const initial = await (await fetch(server.url)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);

    const create = name => fetch(`${server.url}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    for (const name of ['', '  \t  ']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    for (const name of ['  First project  ', 'Second <project>']) {
      const response = await create(name);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    const list = await (await fetch(server.url)).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(list, /<span>First project<\/span>/);
    assert.ok(list.indexOf('First project') < list.indexOf('Second &lt;project&gt;'));
    const paths = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    const detail = await (await fetch(`${server.url}${paths[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*>Projects<\/button>/);
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

test('legacy projects migrate, archive read-only, restore, and retain summaries across restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const dbPath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)));
    INSERT INTO projects (name) VALUES ('Existing project');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing task', 1);`);
  legacy.close();
  let server;
  try {
    server = await start(dbPath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.url}${path}`)).text();
    const projectRows = page => [...page.matchAll(/<li data-testid="project-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    const taskRows = page => [...page.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    const initial = await html('/');
    assert.match(initial, /<label for="project-filter">Project filter<\/label>/);
    assert.match(initial, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(projectRows(initial)[0], /data-testid="project-summary">1\/1 completed/);
    assert.match(projectRows(initial)[0], />Open project<\/button>/);
    assert.match(projectRows(initial)[0], />Archive project<\/button>/);
    await post('/projects', { name: 'New project' });
    assert.match(projectRows(await html('/'))[1], /data-testid="project-summary">0\/0 completed/);
    await post('/projects/1/tasks', { title: 'Open task' });
    assert.match(projectRows(await html('/'))[0], /data-testid="project-summary">1\/2 completed/);
    await html('/projects/1?filter=Completed');
    assert.match(projectRows(await html('/'))[0], /data-testid="project-summary">1\/2 completed/);

    const archive = await post('/projects/1/archive');
    assert.equal(archive.status, 303);
    assert.equal(archive.headers.get('location'), '/');
    assert.equal(projectRows(await html('/')).length, 1);
    assert.doesNotMatch(await html('/'), /Existing project/);
    const archivedList = await html('/?filter=Archived');
    assert.equal(projectRows(archivedList).length, 1);
    assert.match(archivedList, /<option selected>Archived<\/option>/);
    assert.match(archivedList, />Restore project<\/button>/);
    assert.match(archivedList, />Open project<\/button>/);
    assert.doesNotMatch(archivedList, />Archive project<\/button>/);
    assert.match(archivedList, /data-testid="project-summary">1\/2 completed/);
    const archivedPage = await html('/projects/1');
    assert.match(archivedPage, /<p>Archived project<\/p>/);
    assert.match(archivedPage, /<button type="submit" disabled>Create task<\/button>/);
    assert.equal(taskRows(archivedPage).length, 2);
    for (const row of taskRows(archivedPage)) {
      assert.match(row, /type="checkbox"[\s\S]*?disabled/);
    }
    assert.equal(taskRows(await html('/projects/1?filter=Open')).length, 1);
    assert.equal(taskRows(await html('/projects/1?filter=Completed')).length, 1);
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked task' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1', {})).status, 403);
    assert.equal((await post('/projects/1/tasks/2', { completed: '1' })).status, 403);
    assert.equal(await html('/projects/1'), archivedPage);

    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.equal(await html('/?filter=Archived'), archivedList);
    assert.equal(await html('/projects/1'), archivedPage);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.equal(projectRows(await html('/?filter=Archived')).length, 0);
    const restoredRows = projectRows(await html('/'));
    assert.equal(restoredRows.length, 2);
    assert.match(restoredRows[0], /Existing project/);
    assert.match(restoredRows[0], /data-testid="project-summary">1\/2 completed/);
    const restoredPage = await html('/projects/1');
    assert.doesNotMatch(restoredPage, /Archived project| disabled/);
    assert.match(taskRows(restoredPage)[0], / checked/);
    assert.doesNotMatch(taskRows(restoredPage)[1], / checked/);
    assert.equal((await post('/projects/1/tasks/2', { completed: '1' })).status, 303);
    assert.match(projectRows(await html('/'))[0], /data-testid="project-summary">2\/2 completed/);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.equal(projectRows(await html('/?filter=Archived')).length, 0);
    assert.match(projectRows(await html('/'))[0], /data-testid="project-summary">2\/2 completed/);
    assert.equal((await post('/projects/999999/archive')).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project tasks validate, filter, toggle, stay isolated, and persist after restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  let server;
  try {
    const dbPath = join(directory, 'workboard.sqlite');
    server = await start(dbPath);
    const post = (path, values) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.url}${path}`)).text();
    const rows = page => [...page.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const paths = [...(await html('/')).matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    const [first, second] = paths;
    const initial = await html(first);
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, />Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    assert.equal(rows(initial).length, 0);
    for (const title of ['', ' \t\n ']) {
      const response = await post(`${first}/tasks`, { title });
      assert.equal(response.status, 400);
      const page = await response.text();
      assert.match(page, /role="alert">Task title is required/);
      assert.equal(rows(page).length, 0);
    }
    for (const title of ['  Plan launch  ', 'Review <draft> & "notes"']) {
      const response = await post(`${first}/tasks`, { title });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), first);
    }
    await post(`${second}/tasks`, { title: 'Other project task' });
    const created = await html(first);
    const createdRows = rows(created);
    assert.equal(createdRows.length, 2);
    assert.match(createdRows[0], /<span>Plan launch<\/span>/);
    assert.match(createdRows[0], /aria-label="Complete Plan launch"/);
    assert.match(createdRows[1], /aria-label="Complete Review &lt;draft&gt; &amp; &quot;notes&quot;"/);
    assert.doesNotMatch(created, / checked|Other project task/);
    const taskPath = createdRows[0].match(/action="([^"]+)"/)[1];
    const secondTaskPath = createdRows[1].match(/action="([^"]+)"/)[1];
    assert.equal(rows(await html(`${first}?filter=Open`)).length, 2);
    assert.equal(rows(await html(`${first}?filter=Completed`)).length, 0);

    assert.equal((await post(taskPath, { completed: '1' })).status, 303);
    assert.match(rows(await html(first))[0], /aria-label="Complete Plan launch" checked/);
    const openRows = rows(await html(`${first}?filter=Open`));
    assert.equal(openRows.length, 1);
    assert.match(openRows[0], /Review &lt;draft&gt;/);
    const completedPage = await html(`${first}?filter=Completed`);
    assert.match(completedPage, /<option selected>Completed<\/option>/);
    assert.equal(rows(completedPage).length, 1);
    assert.match(rows(completedPage)[0], /Plan launch/);

    const invalid = await post(`${first}/tasks`, { title: ' ', filter: 'Completed' });
    assert.equal(invalid.status, 400);
    assert.equal(rows(await invalid.text()).length, 1);
    const reopened = await post(taskPath, { filter: 'Completed' });
    assert.equal(reopened.headers.get('location'), `${first}?filter=Completed`);
    assert.equal(rows(await html(`${first}?filter=Completed`)).length, 0);
    assert.doesNotMatch(rows(await html(first))[0], / checked/);

    const wrongProjectPath = taskPath.replace(first, second);
    assert.equal((await post(wrongProjectPath, { completed: '1' })).status, 404);
    assert.doesNotMatch(rows(await html(first))[0], / checked/);
    assert.equal(rows(await html(second)).length, 1);
    assert.doesNotMatch(await html(second), /Plan launch|Review &lt;draft&gt;/);
    assert.equal((await post('/projects/999999/tasks', { title: 'Missing' })).status, 404);
    assert.equal((await post(`${first}/tasks/999999`, { completed: '1' })).status, 404);

    await post(secondTaskPath, { completed: '1' });
    const beforeRestart = await html(first);
    const otherBeforeRestart = await html(second);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.equal(await html(first), beforeRestart);
    assert.equal(await html(second), otherBeforeRestart);
    assert.equal(rows(await html(`${first}?filter=Open`)).length, 1);
    assert.equal(rows(await html(`${first}?filter=Completed`)).length, 1);
    assert.match(await html('/'), /<span>First<\/span>/);
    assert.deepEqual(await (await fetch(`${server.url}/health`)).json(), { status: 'ok' });
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
