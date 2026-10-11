import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('calendar due dates migrate, validate, clear and persist independently through edits and archival', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-dates-'));
  const dbPath = join(directory, 'db.sqlite');
  const old = new DatabaseSync(dbPath);
  old.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Existing');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing task', 1);`);
  old.close();
  let child, base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    base = await new Promise((resolve, reject) => {
      let output = '';
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = /listening on port (\d+)/.exec(output);
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
      child.on('error', reject);
      child.on('exit', code => reject(new Error(`Server exited: ${code}`)));
    });
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = null;
  }
  const get = async path => (await fetch(base + path)).text();
  const post = (path, data = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
  });
  const tasks = () => {
    const db = new DatabaseSync(dbPath);
    const rows = db.prepare('SELECT * FROM tasks ORDER BY id').all();
    db.close();
    return rows;
  };
  const filters = { filter: 'Completed', priorityFilter: 'Normal' };
  const location = '/projects/1?filter=Completed&priorityFilter=Normal';
  const save = value => post('/projects/1/tasks/1/due-date', { ...filters, dueDate: value });
  try {
    await start();
    assert.deepEqual(await (await fetch(base + '/health')).json(), { status: 'ok' });
    assert.equal(tasks()[0].due_date, '');
    assert.match(await get('/projects/1'), /id="task-due-date-1"[^>]*type="text" value=""/);
    await post('/projects/1/tasks', { title: 'Second task' });
    await post('/projects', { name: 'Other project' });
    await post('/projects/2/tasks', { title: 'Other task' });
    assert.deepEqual(tasks().map(task => task.due_date), ['', '', '']);
    const baseline = tasks();
    const summary = await get('/');
    for (const date of ['0001-01-01', '0096-02-29', '2000-02-29', '2024-02-29', '9999-12-31']) {
      const response = await save(`  ${date}  `);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), location);
      assert.equal(tasks()[0].due_date, date);
      assert.match(await get(location), new RegExp(`id="task-due-date-1"[^>]*value="${date}"`));
    }
    const saved = tasks();
    for (const date of ['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2023-02-29', '0001-02-29', '2024-04-31', '2024-13-01', '2024-00-01', '2024-01-00', '2024-01-32', '2024-1-01', '2024-01-1', '2024-01-01T00:00:00Z', 'not a date']) {
      const response = await save(date);
      assert.equal(response.status, 400, date);
      const html = await response.text();
      assert.match(html, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      assert.match(html, /id="task-due-date-1"[^>]*value="9999-12-31"/);
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.match(html, /<option selected>Normal<\/option>/);
      assert.deepEqual(tasks(), saved);
    }
    assert.deepEqual(tasks().map(({ due_date, ...task }) => task), baseline.map(({ due_date, ...task }) => task));
    assert.equal(await get('/'), summary);
    await post('/projects/1/tasks/2/due-date', { dueDate: '2030-06-15' });
    await post('/projects/2/tasks/3/due-date', { dueDate: '2040-07-16' });
    assert.equal((await post('/projects/2/tasks/1/due-date', { dueDate: '2020-01-01' })).status, 404);
    await post('/projects/1/tasks/1/rename', { ...filters, title: 'Renamed task' });
    await post('/projects/1/tasks/1/priority', { ...filters, priority: 'High' });
    await post('/projects/1/tasks/1/completion', filters);
    await post('/projects/1/rename', { name: 'Renamed project' });
    assert.deepEqual(tasks().map(task => task.due_date), ['9999-12-31', '2030-06-15', '2040-07-16']);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.match(archived, /id="task-due-date-1"[^>]*value="9999-12-31"[^>]*disabled/);
    assert.match(archived, /<button type="submit" disabled>Save due date<\/button>/);
    const archivedTasks = tasks();
    assert.equal((await save('2020-01-01')).status, 403);
    assert.deepEqual(tasks(), archivedTasks);
    await stop();
    await start();
    assert.equal(await get('/projects/1'), archived);
    assert.deepEqual(tasks(), archivedTasks);
    await post('/projects/1/restore');
    assert.doesNotMatch((await get('/projects/1')).match(/<input id="task-due-date-1"[^>]*>/)[0], /disabled/);
    await save('   ');
    assert.deepEqual(tasks().map(task => task.due_date), ['', '2030-06-15', '2040-07-16']);
    await save('2028-02-29');
    await save('');
    await stop();
    await start();
    assert.equal(tasks()[0].due_date, '');
    assert.equal(tasks()[0].title, 'Renamed task');
    assert.equal(tasks()[0].priority, 'High');
    assert.equal(tasks()[0].completed, 0);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
