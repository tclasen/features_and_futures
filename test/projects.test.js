import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
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

test('projects validate, navigate, retain creation order and persist across restarts', async () => {
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
    assert.match(initial, />Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);

    const create = (name) => fetch(`${server.url}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
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
    await create('<script>alert("test")</script>');
    const list = await (await fetch(server.url)).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(list, /class="project-name">First project<\/span>/);
    assert.match(list, /&lt;script&gt;alert\(&quot;test&quot;\)&lt;\/script&gt;/);
    assert.ok(list.indexOf('First project') < list.indexOf('&lt;script&gt;'));
    const paths = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
    assert.equal(new Set(paths).size, 2);
    const detail = await (await fetch(`${server.url}${paths[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*>Projects<\/button>/);
    assert.equal((await fetch(`${server.url}/projects/99999`)).status, 404);

    const invalidAfterCreation = await (await create(' ')).text();
    assert.equal((invalidAfterCreation.match(/data-testid="project-row"/g) || []).length, 2);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await (await fetch(server.url)).text(), list);
    assert.equal(await (await fetch(`${server.url}${paths[0]}`)).text(), detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project tasks validate, filter, toggle, remain isolated and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const rows = (html) => [...html.matchAll(/data-testid="task-row">([\s\S]*?)<\/div>/g)].map((match) => match[1]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const initial = await get('/projects/1');
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, />Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    assert.equal(rows(initial).length, 0);

    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(rows(html).length, 0);
    }
    const created = await post('/projects/1/tasks', { title: '  First task  ' });
    assert.equal(created.status, 303);
    assert.equal(created.headers.get('location'), '/projects/1?filter=All');
    await post('/projects/1/tasks', { title: '<script>"Second" & task</script>' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    const all = await get('/projects/1');
    const taskRows = rows(all);
    assert.equal(taskRows.length, 2);
    assert.match(taskRows[0], /aria-label="Complete First task"/);
    assert.match(taskRows[0], /<span>First task<\/span>/);
    assert.doesNotMatch(all, / checked/);
    assert.match(taskRows[1], /&lt;script&gt;&quot;Second&quot; &amp; task&lt;\/script&gt;/);
    assert.doesNotMatch(all, /<script>/);
    assert.equal(rows(await get('/projects/1?filter=Open')).length, 2);
    assert.equal(rows(await get('/projects/1?filter=Completed')).length, 0);
    const secondProject = await get('/projects/2');
    assert.equal(rows(secondProject).length, 1);
    assert.match(secondProject, /Other project task/);
    assert.doesNotMatch(secondProject, /First task/);

    const invalid = await post('/projects/1/tasks', { title: ' ' });
    assert.equal(rows(await invalid.text()).length, 2);
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/1/tasks/99999', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/99999/tasks', { title: 'Missing project' })).status, 404);
    const completed = await post('/projects/1/tasks/1', { completed: '1', filter: 'Open' });
    assert.equal(completed.status, 303);
    assert.equal(completed.headers.get('location'), '/projects/1?filter=Open');
    const openRows = rows(await get('/projects/1?filter=Open'));
    assert.equal(openRows.length, 1);
    assert.match(openRows[0], /Second/);
    const completedRows = rows(await get('/projects/1?filter=Completed'));
    assert.equal(completedRows.length, 1);
    assert.match(completedRows[0], /aria-label="Complete First task" checked/);
    const saved = await get('/projects/1');
    assert.equal(rows(saved).length, 2);
    assert.match(rows(saved)[0], /First task/);
    assert.match(rows(saved)[1], /Second/);
    assert.equal(await get('/projects/1?filter=invalid'), saved);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), saved);
    assert.equal(await get('/projects/2'), secondProject);
    assert.equal(rows(await get('/projects/1?filter=Completed')).length, 1);
    await post('/projects/1/tasks/1', { filter: 'Completed' });
    assert.equal(rows(await get('/projects/1?filter=Completed')).length, 0);
    assert.equal(rows(await get('/projects/1?filter=Open')).length, 2);
    assert.doesNotMatch(await get('/projects/1'), / checked/);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), all);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('legacy projects migrate; archive, restore and summaries preserve tasks across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    // Seed the schema from Task 002 to verify migration without losing existing IDs or data.
    const legacy = new DatabaseSync(databasePath);
    try {
      legacy.exec(`
        CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
        CREATE TABLE tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL REFERENCES projects(id),
          title TEXT NOT NULL,
          completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
        );
        INSERT INTO projects (name) VALUES ('Existing project');
        INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Finished task', 1), (1, 'Open task', 0);
      `);
    } finally {
      legacy.close();
    }
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const taskCount = (html) => (html.match(/data-testid="task-row"/g) || []).length;
    const initial = await get('/');
    assert.match(initial, /<label for="project-filter">Project filter<\/label>/);
    assert.match(initial, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(initial, /data-testid="project-summary">1\/2 completed/);
    assert.match(initial, />Archive project<\/button>/);
    assert.doesNotMatch(initial, /Restore project/);
    assert.equal(await get('/?filter=invalid'), initial);
    await post('/projects', { name: 'New project' });
    assert.match(await get('/'), /data-testid="project-summary">0\/0 completed/);
    assert.equal(taskCount(await get('/projects/1?filter=Completed')), 1);
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    assert.equal((await post('/projects/999/archive')).status, 404);
    assert.equal((await post('/projects/999/restore')).status, 404);

    assert.equal((await post('/projects/1/archive')).status, 303);
    assert.doesNotMatch(await get('/'), /Existing project/);
    const archivedList = await get('/?filter=Archived');
    assert.match(archivedList, /<option>Active<\/option><option selected>Archived<\/option>/);
    assert.match(archivedList, /Existing project/);
    assert.match(archivedList, /data-testid="project-summary">1\/2 completed/);
    assert.match(archivedList, />Open project<\/button>/);
    assert.match(archivedList, />Restore project<\/button>/);
    assert.doesNotMatch(archivedList, /Archive project/);
    const invalid = await post('/projects', { name: ' ', filter: 'Archived' });
    assert.equal(invalid.status, 400);
    assert.match(await invalid.text(), /Existing project/);

    const archivedPage = await get('/projects/1');
    assert.match(archivedPage, /<p>Archived project<\/p>/);
    assert.match(archivedPage, /<button type="submit" disabled>Create task<\/button>/);
    assert.equal((archivedPage.match(/type="checkbox"[^>]* disabled/g) || []).length, 2);
    assert.match(archivedPage, /aria-label="Complete Finished task" checked disabled/);
    assert.equal(taskCount(archivedPage), 2);
    assert.equal(taskCount(await get('/projects/1?filter=Open')), 1);
    assert.equal(taskCount(await get('/projects/1?filter=Completed')), 1);
    assert.equal((await post('/projects/1/tasks', { title: 'Forbidden task' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1', { completed: '0' })).status, 403);
    assert.equal(await get('/projects/1'), archivedPage);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/?filter=Archived'), archivedList);
    assert.equal(await get('/projects/1'), archivedPage);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.doesNotMatch(await get('/?filter=Archived'), /data-testid="project-row"/);
    const restoredList = await get('/');
    assert.ok(restoredList.indexOf('Existing project') < restoredList.indexOf('New project'));
    assert.match(restoredList, /data-testid="project-summary">1\/2 completed/);
    const restoredPage = await get('/projects/1');
    assert.doesNotMatch(restoredPage, /Archived project| disabled/);
    assert.match(restoredPage, /aria-label="Complete Finished task" checked/);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/'), restoredList);
    assert.equal(await get('/projects/1'), restoredPage);
    await post('/projects/1/tasks/2', { completed: '1' });
    assert.match(await get('/'), /data-testid="project-summary">2\/2 completed/);
    await post('/projects/1/tasks', { title: 'Third task' });
    assert.match(await get('/'), /data-testid="project-summary">2\/3 completed/);
    await post('/projects/1/tasks/1', {});
    assert.match(await get('/'), /data-testid="project-summary">1\/3 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
