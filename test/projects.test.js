import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('task renaming preserves identity, completion and ownership across archive and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const rows = (html) => [...html.matchAll(/data-testid="task-row">([\s\S]*?)<\/div>/g)].map((match) => match[1]);
    await post('/projects', { name: 'First project' });
    await post('/projects', { name: 'Second project' });
    await post('/projects/1/tasks', { title: 'First task' });
    await post('/projects/1/tasks', { title: 'Second task' });
    await post('/projects/2/tasks', { title: 'Other task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await get('/projects/1');
    const originalList = await get('/');
    const otherProject = await get('/projects/2');
    assert.match(rows(original)[0], /<label for="new-task-title-1">New task title<\/label>/);
    assert.match(rows(original)[0], /id="new-task-title-1"[^>]*value="First task"/);
    assert.match(rows(original)[0], /<button type="submit">Rename task<\/button>/);

    for (const values of [{}, { title: '' }, { title: ' \t\n ' }]) {
      const response = await post('/projects/1/tasks/1/rename', { ...values, filter: 'Completed' });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(rows(html)[0], /role="alert">Task title is required/);
      assert.match(rows(html)[0], /aria-label="Complete First task" checked/);
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.equal(rows(html).length, 1);
      assert.equal(await get('/projects/1'), original);
      assert.equal(await get('/'), originalList);
    }
    assert.equal((await post('/projects/2/tasks/1/rename', { title: 'Wrong owner' })).status, 404);
    assert.equal((await post('/projects/1/tasks/99999/rename', { title: 'Missing' })).status, 404);
    assert.equal((await post('/projects/1/tasks/9007199254740992/rename', { title: 'Invalid ID' })).status, 404);
    assert.equal((await post('/projects/999/tasks/1/rename', { title: 'Missing project' })).status, 404);
    const renamed = await post('/projects/1/tasks/1/rename', { title: '  Renamed task  ', filter: 'Completed' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const renamedPage = await get('/projects/1');
    const renamedRows = rows(renamedPage);
    assert.equal(renamedRows.length, 2);
    assert.match(renamedRows[0], /aria-label="Complete Renamed task" checked/);
    assert.match(renamedRows[0], /<span>Renamed task<\/span>/);
    assert.match(renamedRows[0], /action="\/projects\/1\/tasks\/1\/rename"/);
    assert.equal(renamedRows[1], rows(original)[1]);
    assert.equal(await get('/'), originalList);
    assert.equal(await get('/projects/2'), otherProject);
    const openRows = rows(await get('/projects/1?filter=Open'));
    assert.equal(openRows.length, 1);
    assert.match(openRows[0], /aria-label="Complete Second task" onchange/);
    const completedRows = rows(await get('/projects/1?filter=Completed'));
    assert.equal(completedRows.length, 1);
    assert.match(completedRows[0], /aria-label="Complete Renamed task" checked/);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), renamedPage);
    assert.equal(await get('/'), originalList);
    await post('/projects/1/archive');
    const archivedPage = await get('/projects/1');
    assert.equal((archivedPage.match(/id="new-task-title-\d+"[^>]* disabled/g) || []).length, 2);
    assert.equal((archivedPage.match(/<button type="submit" disabled>Rename task/g) || []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Forbidden' })).status, 403);
    assert.equal(await get('/projects/1'), archivedPage);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), archivedPage);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), renamedPage);
    const unsafeTitle = '<script>"Renamed" & task</script>';
    assert.equal((await post('/projects/1/tasks/2/rename', { title: `  ${unsafeTitle}  `, filter: 'Open' })).status, 303);
    const escapedPage = await get('/projects/1');
    assert.match(rows(escapedPage)[1], /aria-label="Complete &lt;script&gt;&quot;Renamed&quot; &amp; task&lt;\/script&gt;"/);
    assert.match(rows(escapedPage)[1], /value="&lt;script&gt;&quot;Renamed&quot; &amp; task&lt;\/script&gt;"/);
    assert.doesNotMatch(escapedPage, /<script>/);
    assert.doesNotMatch(rows(escapedPage)[1], / checked/);
    assert.equal(await get('/'), originalList);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), escapedPage);
    assert.equal(await get('/projects/2'), otherProject);
    await post('/projects/1/tasks/1', {});
    assert.match(await get('/projects/1'), /aria-label="Complete Renamed task" onchange/);
    assert.match(await get('/'), /data-testid="project-summary">0\/2 completed/);
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

test('renaming preserves project identity and tasks, validates names and respects archive state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const taskRows = (html) => [...html.matchAll(/data-testid="task-row">([\s\S]*?)<\/div>/g)].map((match) => match[1]);
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second project' });
    await post('/projects/1/tasks', { title: 'Completed task' });
    await post('/projects/1/tasks', { title: 'Open task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await get('/projects/1');
    const originalList = await get('/');
    assert.match(original, /<label for="new-project-name">New project name<\/label>/);
    assert.match(original, /<button type="submit">Rename project<\/button>/);
    assert.match(original, /id="new-project-name"[^>]*value="Original"/);

    for (const values of [{}, { name: '' }, { name: ' \t\n ' }]) {
      const response = await post('/projects/1/rename', { ...values, filter: 'Completed' });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.match(html, /<h1>Original<\/h1>/);
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.equal(taskRows(html).length, 1);
      assert.equal(await get('/projects/1'), original);
      assert.equal(await get('/'), originalList);
    }
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
    const renamed = await post('/projects/1/rename', { name: '  Renamed project  ', filter: 'Open' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Open');
    const renamedPage = await get('/projects/1');
    assert.match(renamedPage, /<h1>Renamed project<\/h1>/);
    assert.deepEqual(taskRows(renamedPage), taskRows(original));
    const renamedList = await get('/');
    assert.match(renamedList, /class="project-name">Renamed project<\/span>/);
    assert.ok(renamedList.indexOf('Renamed project') < renamedList.indexOf('Second project'));
    assert.match(renamedList, /data-testid="project-summary">1\/2 completed/);
    assert.match(renamedList, /action="\/projects\/1"/);
    assert.match(await get('/projects/2'), /<h1>Second project<\/h1>/);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), renamedPage);
    assert.equal(await get('/'), renamedList);
    await post('/projects/1/archive');
    const archivedPage = await get('/projects/1');
    assert.match(archivedPage, /id="new-project-name"[^>]* disabled/);
    assert.match(archivedPage, /<button type="submit" disabled>Rename project<\/button>/);
    assert.equal((await post('/projects/1/rename', { name: 'Forbidden' })).status, 403);
    assert.equal(await get('/projects/1'), archivedPage);
    assert.match(await get('/?filter=Archived'), /Renamed project/);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), archivedPage);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), renamedPage);
    const unsafeName = '<script>"Name" & project</script>';
    assert.equal((await post('/projects/1/rename', { name: `  ${unsafeName}  ` })).status, 303);
    const escapedPage = await get('/projects/1');
    assert.match(escapedPage, /<h1>&lt;script&gt;&quot;Name&quot; &amp; project&lt;\/script&gt;<\/h1>/);
    assert.match(escapedPage, /value="&lt;script&gt;&quot;Name&quot; &amp; project&lt;\/script&gt;"/);
    assert.doesNotMatch(escapedPage, /<script>/);
    assert.deepEqual(taskRows(escapedPage), taskRows(original));
    const escapedList = await get('/');
    assert.match(escapedList, /data-testid="project-summary">1\/2 completed/);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), escapedPage);
    assert.equal(await get('/'), escapedList);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
