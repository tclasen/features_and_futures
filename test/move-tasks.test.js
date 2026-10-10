import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('moves preserve task data, remembered order, filters, summaries, eligibility and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-move-'));
  const dbPath = join(directory, 'db.sqlite');
  // A pre-move database must retain its task order and data after migration.
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal',
      due_date TEXT NOT NULL DEFAULT '');
    INSERT INTO projects (name, default_priority) VALUES ('Source', 'High'), ('Destination', 'Low'), ('Third', 'Normal');
    INSERT INTO tasks (project_id, title, completed, priority, due_date) VALUES
      (1, 'Old dated', 1, 'High', '0001-01-01'),
      (1, 'Undated', 0, 'Normal', ''),
      (1, 'Remaining', 1, 'High', '0001-01-02'),
      (2, 'Destination existing', 0, 'Low', '9999-12-31');
  `);
  legacy.close();
  let child, base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: dbPath },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Startup timed out')), 5000);
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Exited ${code}`)); });
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    base = `http://127.0.0.1:${port}`;
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  const get = (path) => fetch(base + path).then((res) => res.text());
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', redirect: 'manual', body: new URLSearchParams(values),
  });
  const rows = (html) => [...html.matchAll(/<article class="task-row"[\s\S]*?<\/article>/g)].map((match) => match[0]);
  const titles = (html) => rows(html).map((row) => row.match(/<span>(.*?)<\/span>/)[1]);
  const destinationSelect = (row) => row.match(/<select id="destination-project-\d+"[\s\S]*?<\/select>/)[0];
  const options = (row) => [...destinationSelect(row).matchAll(/<option value="(\d+)">(.*?)<\/option>/g)].map((match) => [match[1], match[2]]);
  const summary = (html) => [...html.matchAll(/data-testid="project-summary">(\d+\/\d+ completed)/g)].map((match) => match[1]);
  const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '0001-01-01', dueThrough: '0001-01-02' };
  const filteredPath = `/projects/1?${new URLSearchParams(state)}`;
  const move = (source, task, destination, filters = {}) => post(`/projects/${source}/tasks/${task}/move`, { destinationProject: destination, ...filters });
  const savedTask = (projectId, taskId) => {
    const db = new DatabaseSync(dbPath);
    try {
      const value = db.prepare('SELECT id, project_id, title, completed, priority, due_date FROM tasks WHERE id = ? AND project_id = ?').get(taskId, projectId);
      return value ? { ...value } : undefined;
    } finally { db.close(); }
  };
  try {
    await start();
    assert.deepEqual(titles(await get('/projects/1')), ['Old dated', 'Undated', 'Remaining']);
    for (const row of rows(await get('/projects/1'))) {
      assert.match(row, /<label for="destination-project-\d+">Destination project<\/label>/);
      assert.deepEqual(options(row), [['2', 'Destination'], ['3', 'Third']]);
      assert.doesNotMatch(destinationSelect(row), /disabled/);
      assert.match(row, /<button type="submit">Move task<\/button>/);
    }
    await post('/projects/2/rename', { name: '  Renamed & destination ' });
    assert.deepEqual(options(rows(await get('/projects/1'))[0]), [['2', 'Renamed &amp; destination'], ['3', 'Third']]);
    const sourceBefore = await get('/projects/1');
    for (const invalid of ['', '1', '999999', 'invalid']) {
      assert.equal((await move(1, 1, invalid)).status, 422);
      assert.equal(await get('/projects/1'), sourceBefore);
    }
    assert.equal((await move(2, 1, 3)).status, 404);
    assert.equal((await move(1, 999999, 2)).status, 404);
    assert.equal((await move(999999, 1, 2)).status, 404);
    const taskBefore = savedTask(1, 1);
    const remainingBefore = rows(await get(filteredPath))[1];
    const moved = await move(1, 1, 2, state);
    assert.equal(moved.status, 303);
    assert.equal(moved.headers.get('location'), filteredPath);
    const sourceAfter = await get(moved.headers.get('location'));
    assert.deepEqual(titles(sourceAfter), ['Remaining']);
    assert.equal(rows(sourceAfter)[0], remainingBefore);
    assert.match(sourceAfter, /id="task-filter"[\s\S]*?<option selected>Completed/);
    assert.match(sourceAfter, /id="priority-filter"[\s\S]*?<option selected>High/);
    assert.match(sourceAfter, /id="due-from"[^>]*value="0001-01-01"/);
    assert.match(sourceAfter, /id="due-through"[^>]*value="0001-01-02"/);
    assert.deepEqual(savedTask(2, 1), { ...taskBefore, project_id: 2 });
    assert.equal(savedTask(1, 1), undefined);
    assert.deepEqual(titles(await get('/projects/2')), ['Destination existing', 'Old dated']);
    assert.deepEqual(summary(await get('/')), ['1/2 completed', '1/2 completed', '0/0 completed']);
    const undatedBefore = savedTask(1, 2);
    await move(1, 2, 2);
    assert.deepEqual(savedTask(2, 2), { ...undatedBefore, project_id: 2 });
    await post('/projects/2/tasks', { title: 'New after moves' });
    assert.deepEqual(titles(await get('/projects/2')), ['Destination existing', 'Old dated', 'Undated', 'New after moves']);
    assert.equal(savedTask(2, 5).priority, 'Low');
    await move(2, 1, 3);
    await move(3, 1, 2);
    assert.deepEqual(titles(await get('/projects/2')), ['Destination existing', 'Old dated', 'Undated', 'New after moves']);
    assert.deepEqual(savedTask(2, 1), { ...taskBefore, project_id: 2 });
    const savedPages = await Promise.all(['/projects/1', '/projects/2', '/projects/3', '/'].map(get));
    await stop();
    await start();
    assert.deepEqual(await Promise.all(['/projects/1', '/projects/2', '/projects/3', '/'].map(get)), savedPages);
    // Destinations update with archive state; reject stale/forged submissions.
    await post('/projects/2/archive');
    assert.deepEqual(options(rows(await get('/projects/1'))[0]), [['3', 'Third']]);
    assert.equal((await move(1, 3, 2)).status, 422);
    const archivedPage = await get('/projects/2');
    for (const row of rows(archivedPage)) {
      assert.match(destinationSelect(row), / disabled/);
      assert.match(row, /<button type="submit" disabled>Move task/);
    }
    assert.equal((await move(2, 1, 1)).status, 403);
    assert.equal(await get('/projects/2'), archivedPage);
    await post('/projects/3/archive');
    const noDestination = rows(await get('/projects/1'))[0];
    assert.deepEqual(options(noDestination), []);
    assert.match(destinationSelect(noDestination), / disabled/);
    assert.match(noDestination, /<button type="submit" disabled>Move task/);
    await stop();
    await start();
    assert.deepEqual(options(rows(await get('/projects/1'))[0]), []);
    await post('/projects/2/restore');
    assert.deepEqual(options(rows(await get('/projects/1'))[0]), [['2', 'Renamed &amp; destination']]);
    assert.deepEqual(savedTask(2, 1), { ...taskBefore, project_id: 2 });
    for (const row of rows(await get('/projects/2'))) {
      assert.deepEqual(options(row), [['1', 'Source']]);
      assert.doesNotMatch(destinationSelect(row), /disabled/);
    }
    await move(2, 1, 1);
    assert.deepEqual(titles(await get('/projects/1')), ['Old dated', 'Remaining']);
    assert.deepEqual(summary(await get('/')), ['2/2 completed', '0/3 completed']);
    const finalPage = await get('/projects/1');
    await stop();
    await start();
    assert.equal(await get('/projects/1'), finalPage);

    // Vacant remembered slots stay reserved for both creations and first arrivals.
    await move(1, 1, 2);
    await move(1, 3, 2);
    assert.deepEqual(titles(await get('/projects/1')), []);
    await post('/projects/1/tasks', { title: 'New source task' });
    await move(1, 6, 2);
    await move(2, 5, 1);
    await post('/projects/1/tasks', { title: 'Newest source task' });
    assert.deepEqual(titles(await get('/projects/1')), ['New after moves', 'Newest source task']);

    // Return in a different order; each task must recover its own original slot.
    await move(2, 3, 1);
    await move(2, 2, 1);
    assert.deepEqual(titles(await get('/projects/1')), ['Undated', 'Remaining', 'New after moves', 'Newest source task']);
    await post('/projects/2/tasks/1/rename', { title: 'Current title' });
    await post('/projects/2/tasks/1/completion');
    await post('/projects/2/tasks/1/priority', { priority: 'Low' });
    await post('/projects/2/tasks/1/due-date', { dueDate: '' });
    const currentTask = savedTask(2, 1);
    await post('/projects/1/rename', { name: 'Renamed source' });
    await post('/projects/1/archive');
    assert.equal((await move(2, 1, 1)).status, 422);
    await stop();
    await start();
    await post('/projects/1/restore');
    await move(2, 6, 1);
    await move(2, 1, 1);
    const restoredOrder = ['Current title', 'Undated', 'Remaining', 'New source task', 'New after moves', 'Newest source task'];
    assert.deepEqual(titles(await get('/projects/1')), restoredOrder);
    assert.deepEqual(savedTask(1, 1), { ...currentTask, project_id: 1 });
    assert.deepEqual(summary(await get('/')), ['1/6 completed', '0/1 completed']);
    await stop();
    await start();
    assert.deepEqual(titles(await get('/projects/1')), restoredOrder);
    // Destination positions also remain remembered independently of source slots.
    await move(1, 2, 2);
    await move(1, 1, 2);
    assert.deepEqual(titles(await get('/projects/2')), ['Destination existing', 'Current title', 'Undated']);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('Task 011 databases retain current non-ID order and seed remembered positions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-order-migration-'));
  const dbPath = join(directory, 'db.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal',
      due_date TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Source'), ('Destination');
    INSERT INTO tasks (project_id, title, position) VALUES
      (1, 'Later position', 7), (1, 'Earlier position', 2), (2, 'Destination task', 3);
  `);
  legacy.close();
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    const port = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Startup timed out')), 5000);
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Exited ${code}`)); });
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    const base = `http://127.0.0.1:${port}`;
    const titles = async () => {
      const html = await (await fetch(`${base}/projects/1`)).text();
      return [...html.matchAll(/<span>(.*?)<\/span>/g)].map((match) => match[1]);
    };
    const post = (path, values) => fetch(base + path, {
      method: 'POST', redirect: 'manual', body: new URLSearchParams(values),
    });
    assert.deepEqual(await titles(), ['Earlier position', 'Later position']);
    assert.equal((await post('/projects/1/tasks/1/move', { destinationProject: 2 })).status, 303);
    assert.equal((await post('/projects/1/tasks', { title: 'New after reserved position' })).status, 303);
    assert.equal((await post('/projects/2/tasks/1/move', { destinationProject: 1 })).status, 303);
    assert.deepEqual(await titles(), ['Earlier position', 'Later position', 'New after reserved position']);
  } finally {
    if (child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
