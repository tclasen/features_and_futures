import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openWorkboardStore } from '../src/store.js';
import { launch } from './server-helper.js';

function taskRows(html) {
  return [...html.matchAll(/<article class="task-row" data-testid="task-row">([\s\S]*?)<\/article>/g)]
    .map((match) => match[1]);
}

function priority(row) {
  const select = row.match(/<select id="task-priority-\d+"[^>]*>([\s\S]*?)<\/select>/);
  assert.ok(select, 'task row contains its priority selector');
  const options = [...select[1].matchAll(/<option( selected)?>(.*?)<\/option>/g)];
  assert.deepEqual(options.map((option) => option[2]), ['Low', 'Normal', 'High']);
  return options.filter((option) => option[1]).map((option) => option[2]);
}

test('existing tasks migrate to Normal without changing identity or completion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-migration-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let store;
  try {
    const database = new DatabaseSync(databasePath);
    try {
      database.exec(`
        CREATE TABLE projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
          archived INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
          title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO projects (id, name, archived) VALUES (7, 'Existing project', 1);
        INSERT INTO tasks (id, project_id, title, completed) VALUES
          (12, 7, 'Done', 1), (15, 7, 'Pending', 0);
      `);
    } finally {
      database.close();
    }
    store = openWorkboardStore(databasePath);
    const expected = [
      { id: 12, title: 'Done', completed: 1, priority: 'Normal', due_date: null },
      { id: 15, title: 'Pending', completed: 0, priority: 'Normal', due_date: null },
    ];
    assert.deepEqual(store.tasks.list(7).map((task) => ({ ...task })), expected);
    assert.equal(store.list('Archived')[0].completed_count, 1);
    assert.equal(store.tasks.setPriority(7, 12, 'High').status, 409);
    store.setArchived(7, false);
    store.tasks.setPriority(7, 12, 'High');
    const created = store.tasks.create(7, 'New');
    assert.ok(created.id > 15);
    assert.equal(created.priority, 'Normal');
    store.close();
    store = openWorkboardStore(databasePath);
    assert.deepEqual(store.tasks.list(7).map((task) => ({ ...task })), [
      { ...expected[0], priority: 'High' }, expected[1], created,
    ]);
  } finally {
    store?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('priority edits preserve task data, filters and summaries through rename, archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
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
    await post('/projects/1/tasks', { title: 'Finished' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/2/tasks', { title: 'Other' });
    await post('/projects/1/tasks/1/completion', { completed: 'on' });
    const original = await get('/projects/1');
    const otherProject = await get('/projects/2');
    const summary = await get('/');
    for (const row of taskRows(original)) {
      assert.match(row, /<label for="task-priority-\d+">Task priority<\/label>/);
      assert.deepEqual(priority(row), ['Normal']);
    }
    for (const value of ['', 'Urgent', 'high', ' High ']) {
      assert.equal((await post('/projects/1/tasks/1/priority', { priority: value })).status, 400);
      assert.equal(await get('/projects/1'), original);
    }
    assert.equal((await post('/projects/1/tasks/1/priority')).status, 400);
    for (const path of [
      '/projects/2/tasks/1/priority', '/projects/1/tasks/3/priority',
      '/projects/1/tasks/999/priority', '/projects/999/tasks/1/priority',
      '/projects/1/tasks/9007199254740993/priority',
    ]) {
      assert.equal((await post(path, { priority: 'High' })).status, 404);
    }
    for (const value of ['Low', 'Normal', 'High']) {
      const result = await post('/projects/1/tasks/1/priority', { priority: value, filter: 'Completed' });
      assert.equal(result.status, 303);
      assert.equal(result.headers.get('location'), '/projects/1?filter=Completed');
      const rows = taskRows(await get('/projects/1'));
      assert.deepEqual(priority(rows[0]), [value]);
      assert.match(rows[0], /class="task-title">Finished<\/span>/);
      assert.match(rows[0], /aria-label="Complete Finished" checked/);
      assert.equal(rows[1], taskRows(original)[1]);
      assert.equal(await get('/projects/2'), otherProject);
      assert.equal(await get('/'), summary);
      assert.equal(taskRows(await get('/projects/1?filter=Completed')).length, 1);
      assert.equal(taskRows(await get('/projects/1?filter=Open')).length, 1);
    }
    await post('/projects/1/tasks/2/priority', { priority: 'Low', filter: 'Open' });
    await post('/projects/1/tasks/1/rename', { title: ' Renamed ' });
    const saved = await get('/projects/1');
    assert.deepEqual(taskRows(saved).map(priority), [['High'], ['Low']]);
    assert.match(taskRows(saved)[0], /aria-label="Complete Renamed" checked/);
    await running.stop();
    running = await launch(databasePath);
    assert.equal(await get('/projects/1'), saved);
    assert.equal(await get('/'), summary);

    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    for (const row of taskRows(archived)) {
      assert.match(row, /<select id="task-priority-\d+"[^>]* disabled[^>]*>/);
    }
    assert.deepEqual(taskRows(archived).map(priority), [['High'], ['Low']]);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Normal' })).status, 409);
    assert.equal(await get('/projects/1'), archived);
    await running.stop();
    running = await launch(databasePath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), saved);
    assert.equal(await get('/'), summary);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Normal' })).status, 303);
    assert.deepEqual(taskRows(await get('/projects/1')).map(priority), [['Normal'], ['Low']]);
  } finally {
    await running?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
