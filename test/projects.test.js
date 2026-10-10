import test from 'node:test';
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
      reject(new Error(`Server exited (${code}): ${errors}`));
    });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
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

test('projects validate, render safely, navigate, and persist across restarts', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const dbPath = join(directory, 'nested', 'projects.sqlite');
  let app;
  t.after(async () => {
    if (app) await app.stop();
    await rm(directory, { recursive: true, force: true });
  });
  app = await start(dbPath);
  const get = (path) => fetch(app.base + path);
  const create = (name) => fetch(app.base + '/projects', {
    method: 'POST',
    body: new URLSearchParams({ name }),
    redirect: 'manual',
  });
  let response = await get('/health');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
  let body = await (await get('/')).text();
  assert.match(body, /<h1>Workboard<\/h1>/);
  assert.match(body, /<label for="project-name">Project name<\/label>/);
  assert.match(body, />Create project<\/button>/);
  assert.doesNotMatch(body, /data-testid="project-row"/);
  for (const name of ['', ' \t\n ']) {
    response = await create(name);
    assert.equal(response.status, 422);
    body = await response.text();
    assert.match(body, /role="alert">Project name is required/);
    assert.doesNotMatch(body, /data-testid="project-row"/);
  }
  for (const name of ['  First project  ', '<script>alert("x")</script>']) {
    response = await create(name);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/');
  }
  body = await (await get('/')).text();
  assert.equal((body.match(/data-testid="project-row"/g) || []).length, 2);
  assert.match(body, /<span>First project<\/span>/);
  assert.match(body, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.ok(body.indexOf('First project') < body.indexOf('&lt;script&gt;'));
  const paths = [...body.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
  assert.equal(paths.length, 2);
  assert.notEqual(paths[0], paths[1]);
  const detail = await (await get(paths[0])).text();
  assert.match(detail, /<h1>First project<\/h1>/);
  assert.match(detail, /action="\/"/);
  assert.match(detail, />Projects<\/button>/);
  assert.equal((await get('/projects/99999')).status, 404);
  assert.equal((await get('/missing')).status, 404);
  await app.stop();
  app = undefined;
  app = await start(dbPath);
  assert.equal(await (await get('/')).text(), body);
  assert.equal(await (await get(paths[0])).text(), detail);
  await create('Third');
  const updated = await (await get('/')).text();
  assert.equal((updated.match(/data-testid="project-row"/g) || []).length, 3);
  assert.ok(updated.indexOf('Third') > updated.indexOf('&lt;script&gt;'));
});

test('tasks validate, filter, remain project-owned, and persist completion', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let app;
  t.after(async () => {
    if (app) await app.stop();
    await rm(directory, { recursive: true, force: true });
  });
  app = await start(dbPath);
  const get = async (path) => (await fetch(app.base + path)).text();
  const post = (path, values) => fetch(app.base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const countRows = (body) => (body.match(/data-testid="task-row"/g) || []).length;
  await post('/projects', { name: 'First' });
  await post('/projects', { name: 'Second' });
  const project = '/projects/1';
  let body = await get(project);
  assert.match(body, /<label for="task-title">Task title<\/label>/);
  assert.match(body, />Create task<\/button>/);
  assert.match(body, /<label for="task-filter">Task filter<\/label>/);
  assert.match(body, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
  for (const title of ['', ' \t\n ']) {
    const response = await post(project + '/tasks', { title });
    assert.equal(response.status, 422);
    body = await response.text();
    assert.match(body, /role="alert">Task title is required/);
    assert.equal(countRows(body), 0);
  }
  for (const title of ['  First task  ', '<draft> & "review"']) {
    const response = await post(project + '/tasks', { title });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), project);
  }
  body = await get(project);
  assert.equal(countRows(body), 2);
  assert.match(body, /aria-label="Complete First task"/);
  assert.match(body, /<span>First task<\/span>/);
  assert.match(body, /Complete &lt;draft&gt; &amp; &quot;review&quot;/);
  assert.doesNotMatch(body, / checked/);
  assert.ok(body.indexOf('First task') < body.indexOf('&lt;draft&gt;'));
  assert.equal(countRows(await get('/projects/2')), 0);
  assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
  assert.equal((await post('/projects/999/tasks', { title: 'Missing' })).status, 404);
  assert.equal((await post(project + '/tasks/999', { completed: '1' })).status, 404);
  let response = await post(project + '/tasks/1', { completed: '1', filter: 'Open' });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), project + '?filter=Open');
  body = await get(project);
  assert.match(body, /aria-label="Complete First task" checked/);
  const open = await get(project + '?filter=Open');
  const completed = await get(project + '?filter=Completed');
  assert.equal(countRows(open), 1);
  assert.doesNotMatch(open, /<span>First task<\/span>/);
  assert.equal(countRows(completed), 1);
  assert.match(completed, /<span>First task<\/span>/);
  assert.match(completed, /<option selected>Completed<\/option>/);
  assert.equal(countRows(await get(project + '?filter=invalid')), 2);
  await app.stop();
  app = undefined;
  app = await start(dbPath);
  assert.equal(await get(project), body);
  assert.equal(await get(project + '?filter=Open'), open);
  assert.equal(await get(project + '?filter=Completed'), completed);
  response = await post(project + '/tasks/1', {});
  assert.equal(response.status, 303);
  assert.doesNotMatch(await get(project), / checked/);
  assert.equal(countRows(await get(project + '?filter=Open')), 2);
  assert.equal(countRows(await get(project + '?filter=Completed')), 0);
  await post('/projects/2/tasks', { title: 'Other project task' });
  assert.equal(countRows(await get('/projects/2')), 1);
  assert.doesNotMatch(await get(project), /Other project task/);
  await app.stop();
  app = undefined;
  app = await start(dbPath);
  assert.doesNotMatch(await get(project), / checked/);
  assert.equal(countRows(await get('/projects/2')), 1);
});

test('archive migration, read-only tasks, summaries, and restoration persist', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const dbPath = join(directory, 'workboard.sqlite');
  // Start from the previously supported schema to verify an in-place upgrade.
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Existing'), ('Empty');
    INSERT INTO tasks (project_id, title, completed) VALUES
      (1, 'Done', 1), (1, 'Pending', 0);
  `);
  legacy.close();
  let app;
  t.after(async () => {
    if (app) await app.stop();
    await rm(directory, { recursive: true, force: true });
  });
  app = await start(dbPath);
  const get = async (path) => (await fetch(app.base + path)).text();
  const post = (path, values = {}) => fetch(app.base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const rows = (body) => (body.match(/data-testid="project-row"/g) || []).length;
  let body = await get('/');
  assert.match(body, /<label for="project-filter">Project filter<\/label>/);
  assert.match(body, /<option selected>Active<\/option><option>Archived<\/option>/);
  assert.match(body, /data-testid="project-summary">1\/2 completed/);
  assert.match(body, /data-testid="project-summary">0\/0 completed/);
  assert.equal(rows(body), 2);
  assert.equal(rows(await get('/?filter=Archived')), 0);
  assert.equal((await post('/projects/999/archive')).status, 404);
  assert.equal((await post('/projects/1/archive')).status, 303);
  assert.equal(rows(await get('/')), 1);
  const archivedList = await get('/?filter=Archived');
  assert.equal(rows(archivedList), 1);
  assert.match(archivedList, />Open project<\/button>/);
  assert.match(archivedList, />Restore project<\/button>/);
  assert.doesNotMatch(archivedList, />Archive project<\/button>/);
  assert.match(archivedList, /data-testid="project-summary">1\/2 completed/);
  const archivedDetail = await get('/projects/1');
  assert.match(archivedDetail, /<p>Archived project<\/p>/);
  assert.match(archivedDetail, /<button type="submit" disabled>Create task/);
  assert.match(archivedDetail, /aria-label="Complete Done" checked disabled/);
  assert.match(archivedDetail, /aria-label="Complete Pending" disabled/);
  const completed = await get('/projects/1?filter=Completed');
  assert.match(completed, /<span>Done<\/span>/);
  assert.doesNotMatch(completed, /<span>Pending<\/span>/);
  const open = await get('/projects/1?filter=Open');
  assert.match(open, /<span>Pending<\/span>/);
  assert.doesNotMatch(open, /<span>Done<\/span>/);
  assert.equal((await post('/projects/1/tasks', { title: 'Blocked' })).status, 403);
  assert.equal((await post('/projects/1/tasks/1')).status, 403);
  assert.equal((await post('/projects/1/tasks/2', { completed: '1' })).status, 403);
  assert.equal(await get('/projects/1'), archivedDetail);
  await app.stop();
  app = undefined;
  app = await start(dbPath);
  assert.equal(await get('/?filter=Archived'), archivedList);
  assert.equal(await get('/projects/1'), archivedDetail);
  assert.equal((await post('/projects/1/restore')).status, 303);
  assert.equal(rows(await get('/?filter=Archived')), 0);
  body = await get('/');
  assert.equal(rows(body), 2);
  assert.ok(body.indexOf('<span>Existing</span>') < body.indexOf('<span>Empty</span>'));
  assert.match(body, /data-testid="project-summary">1\/2 completed/);
  const restored = await get('/projects/1');
  assert.doesNotMatch(restored, / disabled|Archived project/);
  assert.match(restored, /aria-label="Complete Done" checked/);
  assert.equal((await post('/projects/1/tasks/2', { completed: '1' })).status, 303);
  assert.match(await get('/'), /data-testid="project-summary">2\/2 completed/);
  assert.equal((await post('/projects/1/tasks', { title: 'New task' })).status, 303);
  assert.match(await get('/'), /data-testid="project-summary">2\/3 completed/);
  await app.stop();
  app = undefined;
  app = await start(dbPath);
  assert.equal(rows(await get('/?filter=Archived')), 0);
  assert.match(await get('/'), /data-testid="project-summary">2\/3 completed/);
  assert.match(await get('/projects/1'), /<span>New task<\/span>/);
});

test('renaming preserves identity, order, tasks, and persistence; archived projects cannot rename', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let app;
  t.after(async () => {
    if (app) await app.stop();
    await rm(directory, { recursive: true, force: true });
  });
  app = await start(dbPath);
  const get = async (path) => (await fetch(app.base + path)).text();
  const post = (path, values = {}) => fetch(app.base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  await post('/projects', { name: 'Original' });
  await post('/projects', { name: 'Second' });
  await post('/projects/1/tasks', { title: 'Done' });
  await post('/projects/1/tasks', { title: 'Pending' });
  await post('/projects/1/tasks/1', { completed: '1' });
  let detail = await get('/projects/1');
  assert.match(detail, /<label for="new-project-name">New project name<\/label>/);
  assert.match(detail, /<button type="submit">Rename project<\/button>/);
  assert.doesNotMatch(detail, / disabled/);
  for (const name of ['', ' \t\n ']) {
    const response = await post('/projects/1/rename', { name });
    assert.equal(response.status, 422);
    const body = await response.text();
    assert.match(body, /role="alert">Project name is required/);
    assert.match(body, /<h1>Original<\/h1>/);
    assert.equal(await get('/projects/1'), detail);
  }
  assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
  const response = await post('/projects/1/rename', { name: '  Renamed <board>  ', filter: 'Completed' });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/projects/1?filter=Completed');
  detail = await get('/projects/1');
  assert.match(detail, /<h1>Renamed &lt;board&gt;<\/h1>/);
  assert.match(detail, /aria-label="Complete Done" checked/);
  assert.match(detail, /<span>Pending<\/span>/);
  let list = await get('/');
  assert.ok(list.indexOf('<span>Renamed &lt;board&gt;</span>') < list.indexOf('<span>Second</span>'));
  assert.match(list, /data-testid="project-summary">1\/2 completed/);
  assert.match(list, /action="\/projects\/1"/);
  await app.stop();
  app = undefined;
  app = await start(dbPath);
  assert.equal(await get('/projects/1'), detail);
  assert.equal(await get('/'), list);
  await post('/projects/1/archive');
  const archived = await get('/projects/1');
  assert.match(archived, /id="new-project-name" name="name" type="text" disabled/);
  assert.match(archived, /<button type="submit" disabled>Rename project/);
  assert.equal((await post('/projects/1/rename', { name: 'Blocked' })).status, 403);
  assert.equal(await get('/projects/1'), archived);
  await app.stop();
  app = undefined;
  app = await start(dbPath);
  assert.equal(await get('/projects/1'), archived);
  await post('/projects/1/restore');
  assert.equal(await get('/projects/1'), detail);
  assert.equal((await post('/projects/1/rename', { name: 'Restored name' })).status, 303);
  detail = await get('/projects/1');
  assert.match(detail, /<h1>Restored name<\/h1>/);
  assert.match(detail, /aria-label="Complete Done" checked/);
  assert.match(detail, /<span>Pending<\/span>/);
  list = await get('/');
  assert.match(list, /data-testid="project-summary">1\/2 completed/);
  await app.stop();
  app = undefined;
  app = await start(dbPath);
  assert.equal(await get('/projects/1'), detail);
  assert.equal(await get('/'), list);
});
