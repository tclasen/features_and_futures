import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openWorkboardStore } from '../src/store.js';
import { launch } from './server-helper.js';

function rows(html) {
  return [...html.matchAll(/<article class="task-row" data-testid="task-row">([\s\S]*?)<\/article>/g)]
    .map((match) => match[1]);
}

function titles(html) {
  return rows(html).map((row) => row.match(/class="task-title">(.*?)<\/span>/)[1]);
}

function destinations(row) {
  const select = row.match(/<select id="destination-project-\d+"[^>]*>([\s\S]*?)<\/select>/)[1];
  return [...select.matchAll(/<option value="(\d+)">(.*?)<\/option>/g)]
    .map((match) => [Number(match[1]), match[2]]);
}

function summaries(html) {
  return [...html.matchAll(/data-testid="project-summary">(.*?)<\/span>/g)].map((match) => match[1]);
}

test('task ordering migration preserves IDs and appends moved and newly created tasks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-move-migration-'));
  const path = join(directory, 'workboard.sqlite');
  let store;
  try {
    const legacy = new DatabaseSync(path);
    try {
      legacy.exec(`
        CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
        CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
          completed INTEGER NOT NULL DEFAULT 0);
        INSERT INTO projects (id, name) VALUES (1, 'Source'), (2, 'Destination');
        INSERT INTO tasks (id, project_id, title, completed) VALUES
          (2, 1, 'Older', 1), (8, 1, 'Remaining', 0), (15, 2, 'Destination task', 0);
      `);
    } finally {
      legacy.close();
    }
    store = openWorkboardStore(path);
    assert.deepEqual(store.tasks.list(1).map((task) => task.id), [2, 8]);
    const original = { ...store.tasks.list(1)[0] };
    assert.deepEqual(store.tasks.move(1, 2, 2), { id: 2, project_id: 2 });
    assert.deepEqual(store.tasks.list(2).map((task) => task.id), [15, 2]);
    assert.deepEqual({ ...store.tasks.list(2)[1] }, original);
    const created = store.tasks.create(2, 'Created after move');
    assert.deepEqual(store.tasks.list(2).map((task) => task.id), [15, 2, created.id]);
    store.close();
    store = openWorkboardStore(path);
    assert.deepEqual(store.tasks.list(2).map((task) => task.id), [15, 2, created.id]);
    store.tasks.move(2, 2, 1);
    assert.deepEqual(store.tasks.list(1).map((task) => task.id), [8, 2]);
  } finally {
    store?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('moving preserves task data, source filters, destination order and summaries across archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-moves-'));
  const path = join(directory, 'workboard.sqlite');
  let running;
  try {
    running = await launch(path);
    const get = async (url) => (await fetch(`${running.baseUrl}${url}`)).text();
    const post = (url, values = {}) => fetch(`${running.baseUrl}${url}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    await post('/projects', { name: 'Source' });
    await post('/projects/1/tasks', { title: 'Movable' });
    const alone = rows(await get('/projects/1'))[0];
    assert.deepEqual(destinations(alone), []);
    assert.match(alone, /name="destinationId" disabled/);
    assert.match(alone, /disabled>Move task<\/button>/);
    for (const name of ['Destination', 'Third <project>', 'Archived destination']) {
      await post('/projects', { name });
    }
    await post('/projects/4/archive');
    await post('/projects/1/tasks', { title: 'Remaining' });
    await post('/projects/1/tasks', { title: 'Undated' });
    await post('/projects/2/tasks', { title: 'Destination first' });
    await post('/projects/2/tasks', { title: 'Destination second' });
    await post('/projects/2/default-task-priority', { priority: 'Low' });
    for (const id of [1, 2]) {
      await post(`/projects/1/tasks/${id}/completion`, { completed: 'on' });
      await post(`/projects/1/tasks/${id}/priority`, { priority: 'High' });
      await post(`/projects/1/tasks/${id}/due-date`, { dueDate: '2024-02-29' });
    }
    await post('/projects/2/rename', { name: 'Renamed destination' });
    const source = await get('/projects/1');
    for (const row of rows(source)) {
      assert.deepEqual(destinations(row), [[2, 'Renamed destination'], [3, 'Third &lt;project&gt;']]);
      assert.match(row, /<label for="destination-project-\d+">Destination project<\/label>/);
      assert.match(row, />Move task<\/button>/);
    }
    const target = await get('/projects/2');
    // Invalid destinations and wrong ownership must leave all saved data unchanged.
    for (const [url, destinationId, status] of [
      ['/projects/1/tasks/1/move', '', 400],
      ['/projects/1/tasks/1/move', 'abc', 400],
      ['/projects/1/tasks/1/move', '1', 400],
      ['/projects/1/tasks/1/move', '2.5', 400],
      ['/projects/1/tasks/1/move', '9007199254740993', 400],
      ['/projects/1/tasks/1/move', '999', 404],
      ['/projects/1/tasks/1/move', '4', 409],
      ['/projects/2/tasks/1/move', '3', 404],
      ['/projects/1/tasks/999/move', '2', 404],
    ]) {
      assert.equal((await post(url, { destinationId })).status, status);
      assert.equal(await get('/projects/1'), source);
      assert.equal(await get('/projects/2'), target);
    }
    const selection = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-02-29' };
    const filteredPath = `/projects/1?${new URLSearchParams(selection)}`;
    assert.deepEqual(titles(await get(filteredPath)), ['Movable', 'Remaining']);
    const moved = await post('/projects/1/tasks/1/move', { destinationId: '2', ...selection });
    assert.equal(moved.status, 303);
    assert.equal(moved.headers.get('location'), filteredPath);
    const filtered = await get(filteredPath);
    assert.deepEqual(titles(filtered), ['Remaining']);
    assert.match(filtered, /<option selected>Completed<\/option>/);
    assert.match(filtered, /<option selected>High<\/option>/);
    assert.match(filtered, /id="due-from"[^>]*value="2024-02-29"/);
    assert.match(filtered, /id="due-through"[^>]*value="2024-02-29"/);
    const destination = await get('/projects/2');
    assert.deepEqual(titles(destination), ['Destination first', 'Destination second', 'Movable']);
    const movedRow = rows(destination)[2];
    assert.match(movedRow, /aria-label="Complete Movable" checked/);
    assert.match(movedRow, /<option selected>High<\/option>/);
    assert.match(movedRow, /name="dueDate"[^>]*value="2024-02-29"/);
    assert.deepEqual(destinations(movedRow), [[1, 'Source'], [3, 'Third &lt;project&gt;']]);
    assert.deepEqual(summaries(await get('/')), ['1/2 completed', '1/3 completed', '0/0 completed']);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Wrong owner' })).status, 404);
    await running.stop();
    running = await launch(path);
    assert.equal(await get(filteredPath), filtered);
    assert.equal(await get('/projects/2'), destination);
    await post('/projects/2/tasks/1/rename', { title: 'Renamed moved task' });
    await post('/projects/2/archive');
    const archived = await get('/projects/2');
    for (const row of rows(archived)) {
      assert.match(row, /name="destinationId" disabled/);
      assert.match(row, /disabled>Move task<\/button>/);
    }
    assert.deepEqual(destinations(rows(await get('/projects/1'))[0]), [[3, 'Third &lt;project&gt;']]);
    assert.equal((await post('/projects/2/tasks/1/move', { destinationId: '1' })).status, 409);
    await running.stop();
    running = await launch(path);
    assert.equal(await get('/projects/2'), archived);
    await post('/projects/2/restore');
    assert.doesNotMatch(rows(await get('/projects/2'))[2].match(/<select id="destination-project-1"[^>]*>/)[0], /disabled/);
    assert.equal((await post('/projects/2/tasks/1/move', { destinationId: '1' })).status, 303);
    assert.deepEqual(titles(await get('/projects/1')), ['Remaining', 'Undated', 'Renamed moved task']);
    // Undated tasks move unchanged, and tasks created later append after moved tasks.
    await post('/projects/1/tasks/3/move', { destinationId: '2' });
    await post('/projects/1/tasks/1/move', { destinationId: '2' });
    await post('/projects/2/tasks', { title: 'Created after moves' });
    const finalDestination = await get('/projects/2');
    assert.deepEqual(titles(finalDestination), ['Destination first', 'Destination second', 'Undated', 'Renamed moved task', 'Created after moves']);
    assert.match(rows(finalDestination)[2], /name="dueDate"[^>]*value=""/);
    assert.match(rows(finalDestination)[2], /<option selected>Normal<\/option>/);
    assert.doesNotMatch(rows(finalDestination)[2], /aria-label="Complete Undated" checked/);
    assert.match(rows(finalDestination)[4], /<option selected>Low<\/option>/);
    assert.deepEqual(summaries(await get('/')), ['1/1 completed', '1/5 completed', '0/0 completed']);
    await running.stop();
    running = await launch(path);
    assert.equal(await get('/projects/2'), finalDestination);
  } finally {
    await running?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
