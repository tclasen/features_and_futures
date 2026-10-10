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

function assertDefault(html, selected, disabled = false) {
  assert.match(html, /<label for="default-task-priority">Default task priority<\/label>/);
  const select = html.match(/<select id="default-task-priority"[^>]*>([\s\S]*?)<\/select>/);
  assert.ok(select);
  assert.equal(select[0].includes(' disabled'), disabled);
  assert.match(select[0], /data-submit-on-change/);
  const options = [...select[1].matchAll(/<option( selected)?>(.*?)<\/option>/g)];
  assert.deepEqual(options.map((option) => option[2]), ['Low', 'Normal', 'High']);
  assert.deepEqual(options.filter((option) => option[1]).map((option) => option[2]), [selected]);
}

test('project defaults migrate without changing existing tasks or identities', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-default-migration-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let store;
  try {
    const database = new DatabaseSync(databasePath);
    try {
      database.exec(`
        CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
          title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
        INSERT INTO projects VALUES (7, 'Active', 0), (9, 'Archived', 1);
        INSERT INTO tasks VALUES (12, 7, 'Done', 1, 'High'), (15, 9, 'Pending', 0, 'Low');
      `);
    } finally {
      database.close();
    }
    store = openWorkboardStore(databasePath);
    for (const id of [7, 9]) assert.equal(store.find(id).default_task_priority, 'Normal');
    const before = [store.tasks.list(7), store.tasks.list(9)];
    store.setDefaultTaskPriority(7, 'Low');
    assert.deepEqual([store.tasks.list(7), store.tasks.list(9)], before);
    assert.equal(store.tasks.create(7, 'Inherited').priority, 'Low');
    assert.equal(store.setDefaultTaskPriority(9, 'High').status, 409);
    assert.equal(store.setDefaultTaskPriority(999, 'High').status, 404);
    store.close();
    store = openWorkboardStore(databasePath);
    assert.equal(store.find(7).default_task_priority, 'Low');
    assert.equal(store.find(9).default_task_priority, 'Normal');
    assert.deepEqual(store.tasks.list(9), before[1]);
    assert.deepEqual(store.tasks.list(7).slice(0, 1), before[0]);
  } finally {
    store?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('saved project defaults affect only future tasks and survive filters, rename, archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-default-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let running;
  try {
    running = await launch(databasePath);
    const get = async (path) => (await fetch(`${running.baseUrl}${path}`)).text();
    const post = (path, values = {}) => fetch(`${running.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    assertDefault(await get('/projects/1'), 'Normal');
    assertDefault(await get('/projects/2'), 'Normal');
    await post('/projects/1/tasks', { title: 'Existing' });
    await post('/projects/1/tasks/1/completion', { completed: 'on' });
    const selection = { filter: 'Completed', priorityFilter: 'Normal' };
    const path = '/projects/1?filter=Completed&priorityFilter=Normal';
    const originalRows = rows(await get(path));
    const originalSummary = await get('/');
    for (const priority of ['Low', 'Normal', 'High']) {
      const response = await post('/projects/1/default-task-priority', { priority, ...selection });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), path);
      const html = await get(path);
      assertDefault(html, priority);
      assert.deepEqual(rows(html), originalRows);
      assert.match(html, /<select id="task-filter"[^>]*>[\s\S]*?<option selected>Completed<\/option>/);
      assert.match(html, /<select id="priority-filter"[^>]*>[\s\S]*?<option selected>Normal<\/option>/);
      assert.equal(await get('/'), originalSummary);
      assertDefault(await get('/projects/2'), 'Normal');
    }
    const saved = await get(path);
    for (const priority of ['', 'Urgent', 'high', ' High ']) {
      assert.equal((await post('/projects/1/default-task-priority', { priority })).status, 400);
      assert.equal(await get(path), saved);
    }
    assert.equal((await post('/projects/1/default-task-priority')).status, 400);
    assert.equal((await post('/projects/999/default-task-priority', { priority: 'High' })).status, 404);
    await post('/projects/1/tasks', { title: 'Inherited High' });
    await post('/projects/1/default-task-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Inherited Low' });
    await post('/projects/2/tasks', { title: 'Other project' });
    assert.match(rows(await get('/projects/2'))[0], /<option selected>Normal<\/option>/);
    await post('/projects/1/rename', { name: 'Renamed project' });
    await post('/projects/1/tasks/2/rename', { title: 'Renamed task' });
    const expected = await get('/projects/1');
    assertDefault(expected, 'Low');
    const taskRows = rows(expected);
    assert.equal(taskRows.length, 3);
    for (const [index, priority] of ['Normal', 'High', 'Low'].entries()) {
      assert.match(taskRows[index], new RegExp(`<option selected>${priority}</option>`));
    }
    assert.match(taskRows[0], /aria-label="Complete Existing" checked/);
    assert.match(taskRows[1], /class="task-title">Renamed task<\/span>/);
    const summary = await get('/');
    assert.match(summary, /1\/3 completed/);
    await running.stop();
    running = await launch(databasePath);
    assert.equal(await get('/projects/1'), expected);
    await post('/projects/1/archive');
    const archived = await get(path);
    assertDefault(archived, 'Low', true);
    assert.deepEqual(rows(archived).map((row) => row.match(/class="task-title">(.*?)<\/span>/)[1]), ['Existing']);
    assert.equal((await post('/projects/1/default-task-priority', { priority: 'High' })).status, 409);
    assert.equal(await get(path), archived);
    await running.stop();
    running = await launch(databasePath);
    assert.equal(await get(path), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), expected);
    assert.equal(await get('/'), summary);
    await post('/projects/1/tasks', { title: 'After restoration' });
    assert.match(rows(await get('/projects/1'))[3], /<option selected>Low<\/option>/);
    await post('/projects/1/default-task-priority', { priority: 'Normal' });
    assertDefault(await get('/projects/1'), 'Normal');
  } finally {
    await running?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
