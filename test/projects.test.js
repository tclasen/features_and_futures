import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited (${code}): ${errors}`));
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
    url,
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects validate, preserve names and IDs, and survive a server restart', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  t.after(async () => {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  });
  server = await startServer(databasePath);
  const get = (path) => fetch(`${server.url}${path}`);
  const create = (name) => fetch(`${server.url}/projects`, {
    method: 'POST',
    body: new URLSearchParams({ name }),
    redirect: 'manual',
  });

  const health = await get('/health');
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });
  const initial = await (await get('/')).text();
  assert.match(initial, /<h1>Workboard<\/h1>/);
  assert.match(initial, /<label for="project-name">Project name<\/label>/);
  assert.match(initial, />Create project<\/button>/);
  assert.doesNotMatch(initial, /data-testid="project-row"/);

  for (const name of ['', '  \t\n ']) {
    const invalid = await create(name);
    assert.equal(invalid.status, 422);
    const body = await invalid.text();
    assert.match(body, /role="alert">Project name is required/);
    assert.doesNotMatch(body, /data-testid="project-row"/);
  }

  const created = await create('  First project  ');
  assert.equal(created.status, 303);
  assert.equal(created.headers.get('location'), '/');
  await created.text();
  const second = await create('<script>alert("x")</script> & next');
  assert.equal(second.status, 303);
  await second.text();

  const list = await (await get('/')).text();
  assert.equal([...list.matchAll(/data-testid="project-row"/g)].length, 2);
  assert.match(list, /<span>First project<\/span>/);
  assert.match(list, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; next/);
  assert.doesNotMatch(list, /<script>/);
  const paths = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
  assert.equal(paths.length, 2);
  assert.notEqual(paths[0], paths[1]);
  assert.ok(list.indexOf('First project') < list.indexOf('&lt;script&gt;'));
  const detail = await (await get(paths[0])).text();
  assert.match(detail, /<h1>First project<\/h1>/);
  assert.match(detail, /action="\/".*>Projects<\/button>/);
  assert.equal((await get('/projects/999999')).status, 404);
  assert.equal((await get('/projects/9007199254740993')).status, 404);

  const invalidAfterCreation = await create('   ');
  assert.equal(invalidAfterCreation.status, 422);
  assert.match(await invalidAfterCreation.text(), /role="alert">Project name is required/);
  assert.equal(await (await get('/')).text(), list);
  await server.stop();
  server = await startServer(databasePath);
  assert.equal(await (await get('/')).text(), list);
  assert.equal(await (await get(paths[0])).text(), detail);
});

test('tasks validate, filter, stay in their project, and persist completion across restarts', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  t.after(async () => {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  });
  server = await startServer(databasePath);
  const get = (path) => fetch(`${server.url}${path}`);
  const post = (path, values, headers = {}) => fetch(`${server.url}${path}`, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual', headers,
  });
  const rows = (html) => [...html.matchAll(/<li class="task" data-testid="task-row">[\s\S]*?<\/li>/g)].map((match) => match[0]);
  const taskId = (row) => row.match(/\/tasks\/(\d+)\/completion/)[1];
  for (const name of ['First project', 'Second project']) {
    const response = await post('/projects', { name });
    assert.equal(response.status, 303);
    await response.text();
  }

  const initial = await (await get('/projects/1')).text();
  assert.match(initial, /<label for="task-title">Task title<\/label>/);
  assert.match(initial, />Create task<\/button>/);
  assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
  assert.match(initial, /<option selected>All<\/option>\s*<option>Open<\/option>\s*<option>Completed<\/option>/);
  assert.equal(rows(initial).length, 0);
  for (const title of ['', ' \t\n ']) {
    const invalid = await post('/projects/1/tasks', { title });
    assert.equal(invalid.status, 422);
    const body = await invalid.text();
    assert.match(body, /role="alert">Task title is required/);
    assert.equal(rows(body).length, 0);
  }

  for (const title of ['  First task  ', '<review> & "ship"', 'Third task']) {
    const created = await post('/projects/1/tasks', { title });
    assert.equal(created.status, 303);
    assert.equal(created.headers.get('location'), '/projects/1?filter=All');
    await created.text();
  }
  const all = await (await get('/projects/1')).text();
  const taskRows = rows(all);
  assert.equal(taskRows.length, 3);
  assert.match(taskRows[0], /<span>First task<\/span>/);
  assert.match(taskRows[0], /aria-label="Complete First task"/);
  assert.match(taskRows[1], /aria-label="Complete &lt;review&gt; &amp; &quot;ship&quot;"/);
  assert.match(taskRows[2], /<span>Third task<\/span>/);
  assert.ok(taskRows.every((row) => !row.includes(' checked')));
  const [firstId, secondId] = taskRows.map(taskId);
  const complete = await post(`/projects/1/tasks/${secondId}/completion`, { completed: '1', filter: 'Open' });
  assert.equal(complete.status, 303);
  assert.equal(complete.headers.get('location'), '/projects/1?filter=Open');
  await complete.text();
  const saved = await post(`/projects/1/tasks/${secondId}/completion`, { completed: '1' }, { Accept: 'application/json' });
  assert.equal(saved.status, 200);
  assert.deepEqual(await saved.json(), { completed: true });
  const script = await get('/project.js');
  assert.equal(script.status, 200);
  assert.match(script.headers.get('content-type'), /text\/javascript/);
  assert.match(await script.text(), /installTaskCompletion/);

  const completedAll = await (await get('/projects/1')).text();
  assert.match(rows(completedAll)[1], / checked/);
  const openRows = rows(await (await get('/projects/1?filter=Open')).text());
  assert.equal(openRows.length, 2);
  assert.equal(taskId(openRows[0]), firstId);
  assert.match(openRows[1], /Third task/);
  const completedPage = await (await get('/projects/1?filter=Completed')).text();
  assert.match(completedPage, /<option selected>Completed<\/option>/);
  assert.equal(rows(completedPage).length, 1);
  assert.equal(taskId(rows(completedPage)[0]), secondId);
  assert.equal(await (await get('/projects/1?filter=invalid')).text(), completedAll);

  assert.equal(rows(await (await get('/projects/2')).text()).length, 0);
  const secondProjectTask = await post('/projects/2/tasks', { title: 'Other project task' });
  assert.equal(secondProjectTask.status, 303);
  await secondProjectTask.text();
  const otherProjectPage = await (await get('/projects/2')).text();
  assert.equal(rows(otherProjectPage).length, 1);
  const foreignUpdate = await post(`/projects/2/tasks/${secondId}/completion`, {});
  assert.equal(foreignUpdate.status, 404);
  await foreignUpdate.text();
  for (const path of ['/projects/999/tasks', '/projects/1/tasks/999/completion', '/projects/1/tasks/9007199254740993/completion']) {
    const missing = await post(path, { title: 'Missing', completed: '1' });
    assert.equal(missing.status, 404);
    await missing.text();
  }
  const invalidWithTasks = await post('/projects/1/tasks', { title: ' ', filter: 'Completed' });
  assert.equal(invalidWithTasks.status, 422);
  const invalidBody = await invalidWithTasks.text();
  assert.match(invalidBody, /role="alert">Task title is required/);
  assert.equal(rows(invalidBody).length, 1);
  assert.equal(await (await get('/projects/1')).text(), completedAll);

  await server.stop();
  server = await startServer(databasePath);
  assert.equal(await (await get('/projects/1')).text(), completedAll);
  assert.equal(await (await get('/projects/1?filter=Completed')).text(), completedPage);
  assert.equal(await (await get('/projects/2')).text(), otherProjectPage);

  const reopen = await post(`/projects/1/tasks/${secondId}/completion`, { filter: 'Completed' }, { Accept: 'application/json' });
  assert.equal(reopen.status, 200);
  assert.deepEqual(await reopen.json(), { completed: false });
  assert.equal(rows(await (await get('/projects/1?filter=Completed')).text()).length, 0);
  assert.equal(await (await get('/projects/1')).text(), all);
  await server.stop();
  server = await startServer(databasePath);
  assert.equal(await (await get('/projects/1')).text(), all);
});

test('legacy projects migrate safely, archive read-only tasks, and restore persistent summaries', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  t.after(async () => {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  });

  // Start with the previous schema and data to exercise the deployed migration.
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL CHECK (length(trim(name)) > 0)
    );
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL CHECK (length(trim(title)) > 0),
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
    );
    INSERT INTO projects (name) VALUES ('Existing project');
    INSERT INTO tasks (project_id, title, completed) VALUES
      (1, 'Done task', 1), (1, 'Open task', 0);
  `);
  legacy.close();
  server = await startServer(databasePath);
  const get = async (path) => (await fetch(`${server.url}${path}`)).text();
  const post = (path, values = {}, headers = {}) => fetch(`${server.url}${path}`, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual', headers,
  });
  const rows = (html, kind) => [...html.matchAll(new RegExp(`<li class="${kind}" data-testid="${kind}-row">[\\s\\S]*?</li>`, 'g'))].map((match) => match[0]);
  const active = await get('/');
  assert.match(active, /<label for="project-filter">Project filter<\/label>/);
  assert.match(active, /<option selected>Active<\/option>\s*<option>Archived<\/option>/);
  assert.match(active, /data-testid="project-summary">1\/2 completed/);
  assert.match(active, />Archive project<\/button>/);
  assert.doesNotMatch(active, />Restore project<\/button>/);
  assert.equal(rows(await get('/?filter=Archived'), 'project').length, 0);
  assert.equal(await get('/?filter=invalid'), active);
  const created = await post('/projects', { name: 'New project' });
  assert.equal(created.status, 303);
  await created.text();
  const twoProjects = rows(await get('/'), 'project');
  assert.equal(twoProjects.length, 2);
  assert.match(twoProjects[0], /Existing project/);
  assert.match(twoProjects[1], /data-testid="project-summary">0\/0 completed/);

  const archive = await post('/projects/1/archive');
  assert.equal(archive.status, 303);
  assert.equal(archive.headers.get('location'), '/');
  await archive.text();
  assert.equal(rows(await get('/'), 'project').length, 1);
  assert.doesNotMatch(await get('/'), /Existing project/);
  const archivedList = await get('/?filter=Archived');
  assert.match(archivedList, /<option selected>Archived<\/option>/);
  assert.equal(rows(archivedList, 'project').length, 1);
  assert.match(archivedList, /data-testid="project-summary">1\/2 completed/);
  assert.match(archivedList, /action="\/projects\/1".*>Open project<\/button>/);
  assert.match(archivedList, />Restore project<\/button>/);
  assert.doesNotMatch(archivedList, />Archive project<\/button>/);
  const invalid = await post('/projects', { name: ' ', filter: 'Archived' });
  assert.equal(invalid.status, 422);
  const invalidPage = await invalid.text();
  assert.match(invalidPage, /Project name is required/);
  assert.match(invalidPage, /<option selected>Archived<\/option>/);
  assert.equal(rows(invalidPage, 'project').length, 1);

  const archivedPage = await get('/projects/1');
  assert.match(archivedPage, /<h1>Existing project<\/h1>/);
  assert.match(archivedPage, /<p>Archived project<\/p>/);
  assert.match(archivedPage, /<button type="submit" disabled>Create task<\/button>/);
  const tasks = rows(archivedPage, 'task');
  assert.equal(tasks.length, 2);
  assert.ok(tasks.every((row) => /type="checkbox"[^>]* disabled/.test(row)));
  assert.match(tasks[0], /aria-label="Complete Done task" checked disabled/);
  assert.match(tasks[1], /aria-label="Complete Open task" disabled/);
  assert.equal(rows(await get('/projects/1?filter=Open'), 'task').length, 1);
  assert.match(rows(await get('/projects/1?filter=Completed'), 'task')[0], /Done task/);

  // Stale browser pages and direct requests cannot modify archived data.
  for (const [path, values] of [
    ['/projects/1/tasks', { title: 'Forbidden task' }],
    ['/projects/1/tasks/1/completion', {}],
    ['/projects/1/tasks/2/completion', { completed: '1' }],
  ]) {
    const blocked = await post(path, values, { Accept: 'application/json' });
    assert.equal(blocked.status, 409);
    await blocked.text();
  }
  assert.equal(await get('/projects/1'), archivedPage);
  assert.equal(await get('/?filter=Archived'), archivedList);
  await server.stop();
  server = await startServer(databasePath);
  assert.equal(await get('/projects/1'), archivedPage);
  assert.equal(await get('/?filter=Archived'), archivedList);

  const restore = await post('/projects/1/restore');
  assert.equal(restore.status, 303);
  assert.equal(restore.headers.get('location'), '/?filter=Archived');
  await restore.text();
  assert.equal(rows(await get('/?filter=Archived'), 'project').length, 0);
  const restoredRows = rows(await get('/'), 'project');
  assert.equal(restoredRows.length, 2);
  assert.match(restoredRows[0], /Existing project/);
  assert.match(restoredRows[0], /data-testid="project-summary">1\/2 completed/);
  const restoredPage = await get('/projects/1');
  assert.doesNotMatch(restoredPage, /Archived project| disabled/);
  assert.equal(rows(restoredPage, 'task').length, 2);
  assert.match(rows(restoredPage, 'task')[0], / checked/);
  const completed = await post('/projects/1/tasks/2/completion', { completed: '1' });
  assert.equal(completed.status, 303);
  await completed.text();
  assert.match(await get('/'), /data-testid="project-summary">2\/2 completed/);
  const task = await post('/projects/1/tasks', { title: 'Restored task' });
  assert.equal(task.status, 303);
  await task.text();
  assert.match(await get('/'), /data-testid="project-summary">2\/3 completed/);
  // The list summary always counts all tasks, even after a task-filter visit.
  assert.equal(rows(await get('/projects/1?filter=Open'), 'task').length, 1);
  const finalList = await get('/');
  assert.match(finalList, /data-testid="project-summary">2\/3 completed/);
  const finalPage = await get('/projects/1');
  await server.stop();
  server = await startServer(databasePath);
  assert.equal(await get('/'), finalList);
  assert.equal(await get('/projects/1'), finalPage);
  for (const path of ['/projects/999/archive', '/projects/9007199254740993/restore']) {
    const missing = await post(path);
    assert.equal(missing.status, 404);
    await missing.text();
  }
});
