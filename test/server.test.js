import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'inherit']
  });
  const port = await new Promise((resolvePort, reject) => {
    let output = '';
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolvePort(match[1]);
    });
    child.on('error', reject);
    child.on('exit', code => reject(new Error(`Server exited: ${code}`)));
  });
  return { url: `http://127.0.0.1:${port}`, stop: async () => {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  } };
}

test('task renaming preserves completion, ownership, order and persisted state', async () => {
  mkdirSync('data', { recursive: true });
  const dir = mkdtempSync('data/test-');
  const dbPath = resolve(dir, 'test.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const post = (path, values = {}) => fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
    });
    const get = async path => (await fetch(server.url + path)).text();
    await post('/projects', { name: 'First project' });
    await post('/projects', { name: 'Other project' });
    await post('/projects/1/tasks', { title: 'Original' });
    await post('/projects/1/tasks', { title: 'Second' });
    await post('/projects/1/tasks/1', { completed: '1' });
    for (const title of ['', '  \t ']) {
      const response = await post('/projects/1/tasks/1/rename', { title, filter: 'Completed' });
      assert.equal(response.status, 422);
      const body = await response.text();
      assert.match(body, /role="alert">Task title is required/);
      assert.match(body, /aria-label="Complete Original" checked/);
    }
    const response = await post('/projects/1/tasks/1/rename', { title: '  Renamed <task>  ', filter: 'Completed' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1?filter=Completed');
    let body = await get('/projects/1');
    assert.match(body, /aria-label="Complete Renamed &lt;task&gt;" checked/);
    assert.match(body, /<label for="new-task-title-1">New task title<\/label>/);
    assert.ok(body.indexOf('<span>Renamed &lt;task&gt;</span>') < body.indexOf('<span>Second</span>'));
    assert.doesNotMatch(await get('/projects/1?filter=Open'), /Complete Renamed/);
    assert.match(await get('/projects/1?filter=Completed'), /Complete Renamed/);
    assert.match(await get('/'), /1\/2 completed/);
    assert.doesNotMatch(await get('/projects/2'), /data-testid="task-row"/);
    assert.equal((await post('/projects/2/tasks/1/rename', { title: 'Wrong owner' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/rename', { title: 'Missing' })).status, 404);
    await post('/projects/1/archive');
    body = await get('/projects/1');
    assert.match(body, /id="new-task-title-1"[^>]* disabled/);
    assert.match(body, /id="new-task-title-2"[^>]* disabled/);
    assert.equal((body.match(/<button type="submit" disabled>Rename task/g) || []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Blocked' })).status, 403);
    await server.stop();
    server = await start(dbPath);
    assert.match(await get('/projects/1'), /aria-label="Complete Renamed &lt;task&gt;" checked disabled/);
    assert.match(await get('/?filter=Archived'), /1\/2 completed/);
    await post('/projects/1/restore');
    assert.doesNotMatch(await get('/projects/1'), / disabled/);
    await post('/projects/1/tasks/2/rename', { title: '  Restored task  ', filter: 'Open' });
    await server.stop();
    server = await start(dbPath);
    body = await get('/projects/1');
    assert.match(body, /aria-label="Complete Renamed &lt;task&gt;" checked/);
    assert.match(body, /aria-label="Complete Restored task" onchange/);
    assert.match(await get('/'), /1\/2 completed/);
    const db = new DatabaseSync(dbPath);
    assert.deepEqual(db.prepare('SELECT id, project_id, title, completed FROM tasks ORDER BY id').all().map(row => ({ ...row })), [
      { id: 1, project_id: 1, title: 'Renamed <task>', completed: 1 },
      { id: 2, project_id: 1, title: 'Restored task', completed: 0 }
    ]);
    db.close();
  } finally {
    if (server) await server.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('renaming preserves identity, order and tasks and respects archived state', async () => {
  mkdirSync('data', { recursive: true });
  const dir = mkdtempSync('data/test-');
  const dbPath = resolve(dir, 'test.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const post = (path, values = {}) => fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
    });
    const get = async path => (await fetch(server.url + path)).text();
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Saved task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    assert.match(await get('/projects/1'), /<label for="new-project-name">New project name<\/label>/);
    for (const name of ['', '  \t ']) {
      const response = await post('/projects/1/rename', { name });
      assert.equal(response.status, 422);
      const body = await response.text();
      assert.match(body, /role="alert">Project name is required/);
      assert.match(body, /<h1>Original<\/h1>/);
    }
    const response = await post('/projects/1/rename', { name: '  Renamed <project>  ' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1?filter=All');
    let body = await get('/');
    assert.ok(body.indexOf('<span>Renamed &lt;project&gt;</span>') < body.indexOf('<span>Second</span>'));
    assert.match(body, /1\/1 completed/);
    assert.match(await get('/projects/1'), /<h1>Renamed &lt;project&gt;<\/h1>/);
    await post('/projects/1/archive');
    body = await get('/projects/1');
    assert.match(body, /id="new-project-name"[^>]* disabled/);
    assert.match(body, /<button type="submit" disabled>Rename project/);
    assert.equal((await post('/projects/1/rename', { name: 'Blocked' })).status, 403);
    await server.stop();
    server = await start(dbPath);
    assert.match(await get('/projects/1'), /<h1>Renamed &lt;project&gt;<\/h1>/);
    assert.match(await get('/?filter=Archived'), /1\/1 completed/);
    await post('/projects/1/restore');
    assert.doesNotMatch(await get('/projects/1'), / disabled/);
    await post('/projects/1/rename', { name: 'Restored name' });
    await server.stop();
    server = await start(dbPath);
    body = await get('/projects/1');
    assert.match(body, /<h1>Restored name<\/h1>/);
    assert.match(body, /aria-label="Complete Saved task" checked/);
    assert.match(await get('/'), /1\/1 completed/);
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
  } finally {
    if (server) await server.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('archive, restore, summaries and migration persist across restarts', async () => {
  mkdirSync('data', { recursive: true });
  const dir = mkdtempSync('data/test-');
  const dbPath = resolve(dir, 'test.sqlite');
  const oldDb = new DatabaseSync(dbPath);
  oldDb.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    INSERT INTO projects (name) VALUES ('Existing');`);
  oldDb.close();
  let server;
  try {
    server = await start(dbPath);
    const post = (path, values = {}) => fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
    });
    const get = async path => (await fetch(server.url + path)).text();
    assert.match(await get('/'), /data-testid="project-summary">0\/0 completed/);
    await post('/projects/1/tasks', { title: 'One' });
    await post('/projects/1/tasks', { title: 'Two' });
    await post('/projects/1/tasks/1', { completed: '1' });
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    assert.equal((await post('/projects/1/archive')).status, 303);
    assert.doesNotMatch(await get('/'), /data-testid="project-row"/);
    let body = await get('/?filter=Archived');
    assert.match(body, /Restore project/);
    assert.match(body, /1\/2 completed/);
    body = await get('/projects/1');
    assert.match(body, /Archived project/);
    assert.match(body, /<button type="submit" disabled>Create task/);
    assert.equal((body.match(/ disabled onchange/g) || []).length, 2);
    body = await get('/projects/1?filter=Open');
    assert.match(body, /<span>Two<\/span>/);
    assert.doesNotMatch(body, /<span>One<\/span>/);
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1')).status, 403);
    await server.stop();
    server = await start(dbPath);
    assert.doesNotMatch(await get('/'), /data-testid="project-row"/);
    assert.match(await get('/?filter=Archived'), /1\/2 completed/);
    assert.match(await get('/projects/1'), /aria-label="Complete One" checked disabled/);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.match(await get('/'), /1\/2 completed/);
    assert.doesNotMatch(await get('/?filter=Archived'), /data-testid="project-row"/);
    assert.doesNotMatch(await get('/projects/1'), / disabled/);
    await post('/projects/1/tasks/1');
    assert.match(await get('/'), /0\/2 completed/);
    await server.stop();
    server = await start(dbPath);
    assert.match(await get('/'), /0\/2 completed/);
    assert.doesNotMatch(await get('/projects/1'), /Archived project/);
  } finally {
    if (server) await server.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('projects validate, trim, escape, retain order and persist after restart', async () => {
  mkdirSync('data', { recursive: true });
  const dir = mkdtempSync('data/test-');
  const dbPath = resolve(dir, 'test.sqlite');
  let server;
  try {
    server = await start(dbPath);
    let response = await fetch(`${server.url}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
    const create = name => fetch(`${server.url}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual'
    });
    let body = await (await fetch(server.url)).text();
    assert.match(body, /<h1>Workboard<\/h1>/);
    assert.match(body, /<label for="project-name">Project name<\/label>/);
    for (const name of ['', '   \t ']) {
      response = await create(name);
      assert.equal(response.status, 422);
      body = await response.text();
      assert.match(body, /role="alert">Project name is required/);
      assert.doesNotMatch(body, /data-testid="project-row"/);
    }
    assert.equal((await create('  Alpha  ')).status, 303);
    assert.equal((await create('Beta <script>')).status, 303);
    body = await (await fetch(server.url)).text();
    assert.equal((body.match(/data-testid="project-row"/g) || []).length, 2);
    assert.ok(body.indexOf('<span>Alpha</span>') < body.indexOf('<span>Beta &lt;script&gt;</span>'));
    const paths = [...body.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    body = await (await fetch(server.url + paths[0])).text();
    assert.match(body, /<h1>Alpha<\/h1>/);
    assert.match(body, /<button type="submit">Projects<\/button>/);
    const taskUrl = server.url + paths[0];
    const postTask = (path, values) => fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
    });
    for (const title of ['', '  \t ']) {
      response = await postTask(paths[0] + '/tasks', { title });
      assert.equal(response.status, 422);
      body = await response.text();
      assert.match(body, /role="alert">Task title is required/);
      assert.doesNotMatch(body, /data-testid="task-row"/);
    }
    assert.equal((await postTask(paths[0] + '/tasks', { title: '  First task  ' })).status, 303);
    assert.equal((await postTask(paths[0] + '/tasks', { title: 'Second <task>' })).status, 303);
    body = await (await fetch(taskUrl)).text();
    assert.match(body, /<label for="task-title">Task title<\/label>/);
    assert.match(body, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    assert.equal((body.match(/data-testid="task-row"/g) || []).length, 2);
    assert.ok(body.indexOf('<span>First task</span>') < body.indexOf('<span>Second &lt;task&gt;</span>'));
    assert.match(body, /aria-label="Complete First task"/);
    assert.doesNotMatch(body, / checked/);
    const taskPaths = [...body.matchAll(/action="(\/projects\/\d+\/tasks\/\d+)"/g)].map(match => match[1]);
    assert.equal((await postTask(taskPaths[0], { completed: '1' })).status, 303);
    body = await (await fetch(taskUrl + '?filter=Completed')).text();
    assert.match(body, /<span>First task<\/span>/);
    assert.match(body, / checked/);
    assert.doesNotMatch(body, /<span>Second/);
    body = await (await fetch(taskUrl + '?filter=Open')).text();
    assert.doesNotMatch(body, /<span>First task/);
    assert.match(body, /<span>Second &lt;task&gt;<\/span>/);
    assert.doesNotMatch(await (await fetch(server.url + paths[1])).text(), /data-testid="task-row"/);
    const wrongProjectTask = taskPaths[0].replace(paths[0], paths[1]);
    assert.equal((await postTask(wrongProjectTask, {})).status, 404);
    await server.stop();
    server = await start(dbPath);
    body = await (await fetch(server.url + paths[0])).text();
    assert.equal((body.match(/data-testid="task-row"/g) || []).length, 2);
    assert.match(body, /aria-label="Complete First task" checked/);
    assert.equal((await postTask(taskPaths[0], {})).status, 303);
    body = await (await fetch(server.url + paths[0] + '?filter=Completed')).text();
    assert.doesNotMatch(body, /data-testid="task-row"/);
    body = await (await fetch(server.url)).text();
    for (const path of paths) assert.ok(body.includes(`action="${path}"`));
    assert.match(await (await fetch(server.url + paths[1])).text(), /<h1>Beta &lt;script&gt;<\/h1>/);
    assert.equal((await fetch(`${server.url}/projects/9999`)).status, 404);
  } finally {
    if (server) await server.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});
