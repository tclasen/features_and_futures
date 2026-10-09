import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

async function start(dbPath) {
  const process = spawn(globalThis.process.execPath, ['server.js'], {
    cwd: new URL('../', import.meta.url),
    env: { ...globalThis.process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { process.kill(); reject(new Error('Server startup timed out')); }, 5000);
    process.on('error', error => { clearTimeout(timeout); reject(error); });
    process.on('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited: ${code}; ${output}`)); });
    process.stderr.on('data', chunk => { output += chunk; });
    process.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/Workboard listening on port (\d+)/);
      if (match) { clearTimeout(timeout); resolve(`http://127.0.0.1:${match[1]}`); }
    });
  });
  return {
    url,
    async stop() {
      const exited = once(process, 'exit');
      process.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects validate, keep creation order and identities, and persist after restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const dbPath = join(dir, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const get = async path => {
      const response = await fetch(server.url + path);
      assert.equal(response.status, 200);
      return response.json();
    };
    const create = name => fetch(server.url + '/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    assert.deepEqual(await get('/health'), { status: 'ok' });
    assert.deepEqual(await get('/api/projects'), []);
    for (const name of ['', '   \t\n']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await get('/api/projects'), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('<b>Second & project</b>')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await get('/api/projects'), [first, second]);
    assert.deepEqual(await get(`/api/projects/${first.id}`), first);
    const htmlResponse = await fetch(server.url + `/projects/${first.id}`);
    assert.equal(htmlResponse.status, 200);
    const html = await htmlResponse.text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, />Create project<\/button>/);
    assert.match(html, /role="alert"/);
    assert.match(html, />Projects<\/button>/);
    for (const path of ['/', '/app.js', '/styles.css']) {
      assert.equal((await fetch(server.url + path)).status, 200);
    }
    assert.equal((await fetch(server.url + '/api/projects/999999')).status, 404);
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual(await get('/api/projects'), [first, second]);
    assert.deepEqual(await get(`/api/projects/${first.id}`), first);
    assert.deepEqual(await get('/health'), { status: 'ok' });
  } finally {
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('tasks validate, stay within their project, and persist completion after restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-tasks-test-'));
  const dbPath = join(dir, 'workboard.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const get = async path => {
      const response = await fetch(server.url + path);
      assert.equal(response.status, 200);
      return response.json();
    };
    const write = (path, method, body) => fetch(server.url + path, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const firstProject = await (await write('/api/projects', 'POST', { name: 'First' })).json();
    const secondProject = await (await write('/api/projects', 'POST', { name: 'Second' })).json();
    const tasksPath = `/api/projects/${firstProject.id}/tasks`;
    const otherTasksPath = `/api/projects/${secondProject.id}/tasks`;
    assert.deepEqual(await get(tasksPath), []);
    for (const title of ['', ' \t\n ', null, 1]) {
      const response = await write(tasksPath, 'POST', { title });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await get(tasksPath), []);
    const firstResponse = await write(tasksPath, 'POST', { title: '  First task  ' });
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.title, 'First task');
    assert.equal(first.completed, false);
    assert.equal(first.project_id, firstProject.id);
    const second = await (await write(tasksPath, 'POST', { title: '<b>Second & task</b>' })).json();
    const other = await (await write(otherTasksPath, 'POST', { title: 'Other task' })).json();
    assert.deepEqual(await get(tasksPath), [first, second]);
    assert.deepEqual(await get(otherTasksPath), [other]);
    assert.equal((await write(`${otherTasksPath}/${first.id}`, 'PATCH', { completed: true })).status, 404);
    assert.equal((await write('/api/projects/999999/tasks', 'POST', { title: 'Orphan' })).status, 404);
    assert.equal((await write(`${tasksPath}/${first.id}`, 'PATCH', { completed: 'true' })).status, 400);
    const update = await write(`${tasksPath}/${first.id}`, 'PATCH', { completed: true });
    assert.equal(update.status, 200);
    const completed = { ...first, completed: true };
    assert.deepEqual(await update.json(), completed);
    assert.deepEqual(await get(tasksPath), [completed, second]);
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual(await get(tasksPath), [completed, second]);
    assert.deepEqual(await get(otherTasksPath), [other]);
    assert.equal((await fetch(server.url + `/projects/${firstProject.id}`)).status, 200);
    const reopen = await write(`${tasksPath}/${first.id}`, 'PATCH', { completed: false });
    assert.deepEqual(await reopen.json(), first);
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual(await get(tasksPath), [first, second]);
    assert.deepEqual(await get('/health'), { status: 'ok' });
  } finally {
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('archive and restore preserve migrated projects, tasks, and completion summaries across restarts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-archive-test-'));
  const dbPath = join(dir, 'workboard.sqlite');
  // Seed the schema used before archive support to verify the upgrade preserves data.
  const oldDb = new DatabaseSync(dbPath);
  oldDb.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)));
    INSERT INTO projects (name) VALUES ('Existing');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Done', 1), (1, 'Open', 0);`);
  oldDb.close();
  let server;
  try {
    server = await start(dbPath);
    const get = async path => {
      const response = await fetch(server.url + path);
      assert.equal(response.status, 200);
      return response.json();
    };
    const write = (path, method, body) => fetch(server.url + path, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const original = { id: 1, name: 'Existing', archived: false, total_count: 2, completed_count: 1 };
    assert.deepEqual(await get('/api/projects/1'), original);
    const tasks = await get('/api/projects/1/tasks');
    const empty = await (await write('/api/projects', 'POST', { name: 'Empty' })).json();
    assert.equal(empty.total_count, 0);
    assert.equal(empty.completed_count, 0);
    assert.equal(empty.archived, false);
    assert.equal((await write('/api/projects/999999', 'PATCH', { archived: true })).status, 404);
    assert.equal((await write('/api/projects/1', 'PATCH', { archived: 'true' })).status, 400);
    const archive = await write('/api/projects/1', 'PATCH', { archived: true });
    assert.equal(archive.status, 200);
    const archived = { ...original, archived: true };
    assert.deepEqual(await archive.json(), archived);
    assert.deepEqual(await get('/api/projects'), [archived, empty]);
    assert.equal((await write('/api/projects/1/tasks', 'POST', { title: 'Forbidden' })).status, 409);
    assert.equal((await write(`/api/projects/1/tasks/${tasks[0].id}`, 'PATCH', { completed: false })).status, 409);
    assert.deepEqual(await get('/api/projects/1/tasks'), tasks);
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual(await get('/api/projects/1'), archived);
    assert.deepEqual(await get('/api/projects/1/tasks'), tasks);
    assert.equal((await fetch(server.url + '/projects/1')).status, 200);
    const restore = await write('/api/projects/1', 'PATCH', { archived: false });
    assert.equal(restore.status, 200);
    assert.deepEqual(await restore.json(), original);
    assert.deepEqual(await get('/api/projects/1/tasks'), tasks);
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual(await get('/api/projects'), [original, empty]);
    assert.deepEqual(await get('/api/projects/1/tasks'), tasks);
    assert.equal((await write(`/api/projects/1/tasks/${tasks[1].id}`, 'PATCH', { completed: true })).status, 200);
    assert.deepEqual(await get('/api/projects/1'), { ...original, completed_count: 2 });
    assert.equal((await write('/api/projects/1/tasks', 'POST', { title: 'New' })).status, 201);
    assert.deepEqual(await get('/api/projects/1'), { ...original, completed_count: 2, total_count: 3 });
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual(await get('/api/projects/1'), { ...original, completed_count: 2, total_count: 3 });
  } finally {
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
