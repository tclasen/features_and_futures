import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('rename preserves project identity, order, tasks, and persists through archive and restore', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const dbPath = join(directory, 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.base}${path}`)).text();
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second project' });
    await post('/projects/1/tasks', { title: 'Done task' });
    await post('/projects/1/tasks', { title: 'Open task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await get('/projects/1');
    assert.match(original, /<label for="new-project-name">New project name<\/label>/);
    assert.match(original, /<button type="submit">Rename project<\/button>/);
    for (const name of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/rename', { name });
      assert.equal(invalid.status, 400);
      assert.match(await invalid.text(), /role="alert">Project name is required/);
      assert.equal(await get('/projects/1'), original);
    }
    const renamed = await post('/projects/1/rename', { name: '  Renamed <project> & "team"  ', filter: 'Open' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Open');
    let detail = await get('/projects/1');
    assert.match(detail, /<h1>Renamed &lt;project&gt; &amp; &quot;team&quot;<\/h1>/);
    assert.match(detail, /value="Renamed &lt;project&gt; &amp; &quot;team&quot;"/);
    assert.match(detail, /aria-label="Complete Done task" checked/);
    assert.match(detail, /aria-label="Complete Open task" onchange/);
    assert.equal((detail.match(/data-testid="task-row"/g) || []).length, 2);
    const list = await get('/');
    assert.ok(list.indexOf('Renamed &lt;project&gt;') < list.indexOf('Second project'));
    assert.match(list, /data-testid="project-summary">1\/2 completed/);
    assert.match(list, /action="\/projects\/1"><button type="submit">Open project/);
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/'), list);
    assert.equal(await get('/projects/1'), detail);
    await post('/projects/1/archive');
    detail = await get('/projects/1');
    assert.match(detail, /id="new-project-name"[^>]* disabled/);
    assert.match(detail, /<button type="submit" disabled>Rename project<\/button>/);
    assert.equal((await post('/projects/1/rename', { name: 'Blocked' })).status, 403);
    assert.equal(await get('/projects/1'), detail);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), detail);
    await post('/projects/1/restore');
    assert.equal((await get('/projects/1')).includes(' disabled'), false);
    assert.equal((await post('/projects/1/rename', { name: '  Restored name  ' })).status, 303);
    const restored = await get('/projects/1');
    assert.match(restored, /<h1>Restored name<\/h1>/);
    assert.match(restored, /aria-label="Complete Done task" checked/);
    const restoredList = await get('/');
    assert.ok(restoredList.indexOf('Restored name') < restoredList.indexOf('Second project'));
    assert.match(restoredList, /data-testid="project-summary">1\/2 completed/);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), restored);
    assert.equal(await get('/'), restoredList);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server did not start: ${errors}`));
    }, 5000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => {
      clearTimeout(timer);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = /listening on port (\d+)/.exec(output);
      if (match) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  return {
    base,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects validate, navigate, and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const dbPath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const health = await fetch(`${server.base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    let document = await (await fetch(server.base)).text();
    assert.match(document, /<h1>Workboard<\/h1>/);
    assert.match(document, /<label for="project-name">Project name<\/label>/);
    assert.match(document, /<button type="submit">Create project<\/button>/);
    assert.equal(document.includes('data-testid="project-row"'), false);

    const create = name => fetch(`${server.base}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    for (const name of ['', '  \t\n ']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      document = await response.text();
      assert.match(document, /role="alert">Project name is required/);
      assert.equal(document.includes('data-testid="project-row"'), false);
    }
    for (const name of ['  First project  ', 'Second <project> & "friends"']) {
      const response = await create(name);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    document = await (await fetch(server.base)).text();
    assert.equal((document.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(document, />First project<\/span>/);
    assert.match(document, /Second &lt;project&gt; &amp; &quot;friends&quot;/);
    assert.ok(document.indexOf('First project') < document.indexOf('Second &lt;project&gt;'));
    const paths = [...document.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    const detail = await (await fetch(`${server.base}${paths[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*<button type="submit">Projects<\/button>/);
    assert.equal((await fetch(`${server.base}/projects/99999`)).status, 404);

    await server.stop();
    server = await start(dbPath);
    const persisted = await (await fetch(server.base)).text();
    assert.equal(persisted, document);
    const persistedDetail = await (await fetch(`${server.base}${paths[0]}`)).text();
    assert.equal(persistedDetail, detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, stay in their project, and persist completion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const dbPath = join(directory, 'tasks.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const post = (path, values) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.base}${path}`)).text();
    for (const name of ['First', 'Second']) await post('/projects', { name });
    let document = await get('/projects/1');
    assert.match(document, /<label for="task-title">Task title<\/label>/);
    assert.match(document, /<button type="submit">Create task<\/button>/);
    assert.match(document, /<label for="task-filter">Task filter<\/label>/);
    assert.match(document, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      document = await response.text();
      assert.match(document, /role="alert">Task title is required/);
      assert.equal(document.includes('data-testid="task-row"'), false);
    }
    for (const title of ['  First task  ', 'Second <task> & "friends"']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/projects/1');
    }
    await post('/projects/2/tasks', { title: 'Other project task' });
    document = await get('/projects/1');
    assert.equal((document.match(/data-testid="task-row"/g) || []).length, 2);
    assert.match(document, /aria-label="Complete First task"/);
    assert.match(document, /aria-label="Complete Second &lt;task&gt; &amp; &quot;friends&quot;"/);
    assert.ok(document.indexOf('Complete First task') < document.indexOf('Complete Second'));
    assert.equal(document.includes(' checked'), false);
    assert.equal(document.includes('Other project task'), false);
    assert.equal((await get('/projects/2')).includes('First task'), false);

    const completed = await post('/projects/1/tasks/1', { completed: '1', filter: 'Open' });
    assert.equal(completed.status, 303);
    assert.equal(completed.headers.get('location'), '/projects/1?filter=Open');
    document = await get('/projects/1');
    assert.match(document, /aria-label="Complete First task" checked/);
    const open = await get('/projects/1?filter=Open');
    assert.equal(open.includes('First task'), false);
    assert.equal((open.match(/data-testid="task-row"/g) || []).length, 1);
    const done = await get('/projects/1?filter=Completed');
    assert.match(done, /Complete First task/);
    assert.equal(done.includes('Complete Second'), false);
    assert.equal((await post('/projects/2/tasks/1', { completed: '0' })).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Missing project' })).status, 404);

    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), document);
    assert.equal(await get('/projects/1?filter=Open'), open);
    assert.equal(await get('/projects/1?filter=Completed'), done);
    assert.match(await get('/projects/2'), /Other project task/);
    assert.equal((await post('/projects/1/tasks/1', {})).status, 303);
    assert.equal((await get('/projects/1')).includes(' checked'), false);
    assert.equal((await get('/projects/1?filter=Completed')).includes('data-testid="task-row"'), false);
    await server.stop();
    server = await start(dbPath);
    assert.equal((await get('/projects/1')).includes(' checked'), false);
    assert.equal(((await get('/projects/1?filter=Open')).match(/data-testid="task-row"/g) || []).length, 2);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive migration, summaries, read-only tasks, and restoration persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const dbPath = join(directory, 'projects.sqlite');
  let server;
  try {
    // Start with the previous schema and saved data to verify an upgrade preserves IDs and tasks.
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)));
      INSERT INTO projects (name) VALUES ('Existing project');
      INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Done task', 1), (1, 'Open task', 0);`);
    legacy.close();
    server = await start(dbPath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.base}${path}`)).text();
    await post('/projects', { name: 'New project' });
    let active = await get('/');
    assert.match(active, /<label for="project-filter">Project filter<\/label>/);
    assert.match(active, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(active, /data-testid="project-summary">1\/2 completed/);
    assert.match(active, /data-testid="project-summary">0\/0 completed/);
    assert.ok(active.indexOf('Existing project') < active.indexOf('New project'));
    assert.equal((active.match(/>Archive project<\/button>/g) || []).length, 2);

    assert.equal((await post('/projects/1/archive')).status, 303);
    active = await get('/');
    assert.equal(active.includes('Existing project'), false);
    const archived = await get('/?filter=Archived');
    assert.match(archived, /<option selected>Archived<\/option>/);
    assert.match(archived, /Existing project/);
    assert.match(archived, /data-testid="project-summary">1\/2 completed/);
    assert.match(archived, />Open project<\/button>/);
    assert.match(archived, />Restore project<\/button>/);
    assert.equal(archived.includes('New project'), false);
    assert.equal(archived.includes('>Archive project</button>'), false);
    const detail = await get('/projects/1');
    assert.match(detail, /<p>Archived project<\/p>/);
    assert.match(detail, /<button type="submit" disabled>Create task<\/button>/);
    assert.match(detail, /aria-label="Complete Done task" checked disabled/);
    assert.match(detail, /aria-label="Complete Open task" disabled/);
    assert.equal((detail.match(/data-testid="task-row"/g) || []).length, 2);
    const open = await get('/projects/1?filter=Open');
    assert.match(open, /Complete Open task/);
    assert.equal(open.includes('Complete Done task'), false);
    const completed = await get('/projects/1?filter=Completed');
    assert.match(completed, /Complete Done task/);
    assert.equal(completed.includes('Complete Open task'), false);
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked task' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1', {})).status, 403);
    assert.equal(await get('/projects/1'), detail);
    assert.equal((await post('/projects/999/archive')).status, 404);

    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/'), active);
    assert.equal(await get('/?filter=Archived'), archived);
    assert.equal(await get('/projects/1'), detail);
    assert.equal(await get('/projects/1?filter=Open'), open);
    assert.equal(await get('/projects/1?filter=Completed'), completed);
    assert.equal((await post('/projects/1/restore')).status, 303);
    active = await get('/');
    assert.ok(active.indexOf('Existing project') < active.indexOf('New project'));
    assert.match(active, /data-testid="project-summary">1\/2 completed/);
    assert.equal((await get('/?filter=Archived')).includes('data-testid="project-row"'), false);
    const restored = await get('/projects/1');
    assert.equal(restored.includes(' disabled'), false);
    assert.match(restored, /aria-label="Complete Done task" checked/);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/'), active);
    assert.equal(await get('/projects/1'), restored);
    await post('/projects/1/tasks/2', { completed: '1' });
    assert.match(await get('/'), /data-testid="project-summary">2\/2 completed/);
    await post('/projects/1/tasks', { title: 'Another task' });
    assert.match(await get('/'), /data-testid="project-summary">2\/3 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
