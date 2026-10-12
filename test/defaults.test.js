import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  const base = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', code => reject(new Error(`Server exited: ${code}`)));
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
  });
  return { base, async stop() { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; } };
}
const select = (html, id) => html.match(new RegExp(`<select id="${id}"[^>]*>[\\s\\S]*?<\\/select>`))?.[0];
const titles = html => [...html.matchAll(/data-testid="task-row">\s*<span>(.*?)<\/span>/g)].map(match => match[1]);
const priorityIs = (html, id, value) => assert.match(select(html, id), new RegExp(`<option selected>${value}</option>`));

test('project defaults migrate, independently persist, and only affect future tasks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-defaults-'));
  const dbPath = join(directory, 'db.sqlite');
  let server;
  try {
    // A pre-default database must keep every existing project and task intact.
    const db = new DatabaseSync(dbPath);
    db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
      INSERT INTO projects (name) VALUES ('Existing');
      INSERT INTO tasks (project_id, title, completed, priority) VALUES (1, 'Old task', 1, 'Low');`);
    db.close();
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(server.base + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual'
    });
    const get = async path => (await fetch(server.base + path)).text();
    let detail = await get('/projects/1');
    priorityIs(detail, 'default-task-priority', 'Normal');
    assert.match(select(detail, 'default-task-priority'), /<option>Low<\/option><option selected>Normal<\/option><option>High<\/option>/);
    priorityIs(detail, 'task-priority-1', 'Low');
    await post('/projects', { name: 'Independent' });
    priorityIs(await get('/projects/2'), 'default-task-priority', 'Normal');
    await post('/projects/2/tasks', { title: 'Other task' });
    const summary = await get('/');
    const fields = { filter: 'Completed', priorityFilter: 'Low' };
    const path = '/projects/1?filter=Completed&priorityFilter=Low';
    const before = await get(path);
    let response = await post('/projects/1/default-priority', { ...fields, priority: 'High' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), path);
    detail = await get(path);
    priorityIs(detail, 'default-task-priority', 'High');
    priorityIs(detail, 'task-filter', 'Completed');
    priorityIs(detail, 'priority-filter', 'Low');
    assert.deepEqual(titles(detail), titles(before));
    priorityIs(detail, 'task-priority-1', 'Low');
    assert.match(detail, /aria-label="Complete Old task" checked/);
    assert.equal(await get('/'), summary);
    priorityIs(await get('/projects/2'), 'default-task-priority', 'Normal');
    priorityIs(await get('/projects/2'), 'task-priority-2', 'Normal');
    await post('/projects/1/tasks', { title: 'High inherited' });
    priorityIs(await get('/projects/1'), 'task-priority-3', 'High');
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Low inherited' });
    detail = await get('/projects/1');
    assert.deepEqual(titles(detail), ['Old task', 'High inherited', 'Low inherited']);
    priorityIs(detail, 'task-priority-3', 'High');
    priorityIs(detail, 'task-priority-4', 'Low');
    await post('/projects/1/default-priority', { priority: 'Normal' });
    await post('/projects/1/tasks', { title: 'Normal inherited' });
    priorityIs(await get('/projects/1'), 'task-priority-5', 'Normal');
    await post('/projects/1/default-priority', { priority: 'High' });
    await post('/projects/1/rename', { name: 'Renamed project' });
    await post('/projects/1/tasks/3/rename', { title: 'Renamed task' });
    detail = await get('/projects/1');
    priorityIs(detail, 'default-task-priority', 'High');
    priorityIs(detail, 'task-priority-3', 'High');
    response = await post('/projects/1/default-priority', { ...fields, priority: 'Urgent' });
    assert.equal(response.status, 422);
    priorityIs(await response.text(), 'default-task-priority', 'High');
    assert.equal(await get('/projects/1'), detail);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), detail);
    await post('/projects/1/archive');
    const archived = await get(path);
    assert.match(select(archived, 'default-task-priority'), /disabled/);
    priorityIs(archived, 'default-task-priority', 'High');
    assert.doesNotMatch(select(archived, 'task-filter'), /disabled/);
    assert.doesNotMatch(select(archived, 'priority-filter'), /disabled/);
    response = await post('/projects/1/default-priority', { ...fields, priority: 'Low' });
    assert.equal(response.status, 403);
    priorityIs(await response.text(), 'default-task-priority', 'High');
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get(path), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), detail);
    await post('/projects/1/tasks', { title: 'After restore' });
    priorityIs(await get('/projects/1'), 'task-priority-6', 'High');
    assert.match(await get('/'), /1\/5 completed/);
    priorityIs(await get('/projects/2'), 'default-task-priority', 'Normal');
    assert.equal((await post('/projects/999/default-priority', { priority: 'High' })).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
