import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { launch } from './server-helper.js';

function projectRows(html) {
  return [...html.matchAll(/<article class="project-row" data-testid="project-row">([\s\S]*?)<\/article>/g)]
    .map((match) => match[1]);
}

function taskRows(html) {
  return [...html.matchAll(/<article class="task-row" data-testid="task-row">([\s\S]*?)<\/article>/g)]
    .map((match) => match[1]);
}

test('archive and restore preserve tasks, enforce read-only state, and persist summaries', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
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
    const initial = await get('/');
    assert.match(initial, /<label for="project-filter">Project filter<\/label>/);
    assert.match(initial, /<option selected>Active<\/option><option>Archived<\/option>/);
    for (const row of projectRows(initial)) {
      assert.match(row, /data-testid="project-summary">0\/0 completed/);
      assert.match(row, />Archive project<\/button>/);
      assert.doesNotMatch(row, />Restore project<\/button>/);
    }
    assert.equal(projectRows(await get('/?filter=Archived')).length, 0);

    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Next' });
    await post('/projects/1/tasks/1/completion', { completed: 'on' });
    assert.match(projectRows(await get('/'))[0], /data-testid="project-summary">1\/2 completed/);
    await get('/projects/1?filter=Open');
    assert.match(projectRows(await get('/'))[0], /data-testid="project-summary">1\/2 completed/);

    assert.equal((await post('/projects/1/archive')).status, 303);
    assert.equal(projectRows(await get('/')).length, 1);
    assert.match(projectRows(await get('/'))[0], /class="project-name">Second/);
    const archivedList = await get('/?filter=Archived');
    assert.match(archivedList, /<option selected>Archived<\/option>/);
    const archivedRow = projectRows(archivedList)[0];
    assert.match(archivedRow, /data-testid="project-summary">1\/2 completed/);
    assert.match(archivedRow, />Open project<\/button>/);
    assert.match(archivedRow, />Restore project<\/button>/);
    assert.doesNotMatch(archivedRow, />Archive project<\/button>/);

    const archivedPage = await get('/projects/1');
    assert.match(archivedPage, /<p>Archived project<\/p>/);
    assert.match(archivedPage, /<button type="submit" disabled>Create task<\/button>/);
    assert.equal(taskRows(archivedPage).length, 2);
    for (const row of taskRows(archivedPage)) assert.match(row, /type="checkbox"[^>]* disabled/);
    assert.match(taskRows(archivedPage)[0], / checked/);
    const openRows = taskRows(await get('/projects/1?filter=Open'));
    assert.equal(openRows.length, 1);
    assert.match(openRows[0], /class="task-title">Next/);
    const completedRows = taskRows(await get('/projects/1?filter=Completed'));
    assert.equal(completedRows.length, 1);
    assert.match(completedRows[0], /class="task-title">Done/);
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked' })).status, 409);
    assert.equal((await post('/projects/1/tasks/1/completion')).status, 409);
    assert.equal((await post('/projects/1/tasks/2/completion', { completed: 'on' })).status, 409);
    assert.equal(await get('/projects/1'), archivedPage);
    assert.equal((await post('/projects/999/archive')).status, 404);
    assert.equal((await post('/projects/9007199254740993/restore')).status, 404);

    await running.stop();
    running = await launch(databasePath);
    assert.equal(await get('/?filter=Archived'), archivedList);
    assert.equal(await get('/projects/1'), archivedPage);
    assert.equal(projectRows(await get('/')).length, 1);

    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.equal(projectRows(await get('/?filter=Archived')).length, 0);
    const restoredList = await get('/');
    assert.equal(projectRows(restoredList).length, 2);
    assert.match(projectRows(restoredList)[0], /class="project-name">First/);
    assert.match(projectRows(restoredList)[0], /data-testid="project-summary">1\/2 completed/);
    const restoredPage = await get('/projects/1');
    assert.doesNotMatch(restoredPage, /Archived project| disabled/);
    assert.match(taskRows(restoredPage)[0], / checked/);
    assert.match(taskRows(restoredPage)[1], /class="task-title">Next/);
    await running.stop();
    running = await launch(databasePath);
    assert.equal(await get('/'), restoredList);
    assert.equal(await get('/projects/1'), restoredPage);
    await post('/projects/1/tasks/1/completion');
    assert.match(projectRows(await get('/'))[0], /data-testid="project-summary">0\/2 completed/);
    await post('/projects/1/tasks', { title: 'After restore' });
    assert.match(projectRows(await get('/'))[0], /data-testid="project-summary">0\/3 completed/);
  } finally {
    await running?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('existing project and task databases migrate without changing saved IDs or completion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-migration-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let running;
  try {
    const legacy = new DatabaseSync(databasePath);
    try {
      legacy.exec(`
        CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
        CREATE TABLE tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL REFERENCES projects(id),
          title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO projects (id, name) VALUES (7, 'Existing project');
        INSERT INTO tasks (id, project_id, title, completed) VALUES (9, 7, 'Saved task', 1);
      `);
    } finally {
      legacy.close();
    }
    running = await launch(databasePath);
    const list = await (await fetch(`${running.baseUrl}/`)).text();
    assert.match(list, /action="\/projects\/7"/);
    assert.match(list, /data-testid="project-summary">1\/1 completed/);
    const detail = await (await fetch(`${running.baseUrl}/projects/7`)).text();
    assert.match(detail, /<h1>Existing project<\/h1>/);
    assert.match(detail, /action="\/projects\/7\/tasks\/9\/completion"/);
    assert.match(detail, /aria-label="Complete Saved task" checked/);
    assert.doesNotMatch(detail, / disabled/);
    await running.stop();
    running = await launch(databasePath);
    assert.equal(await (await fetch(`${running.baseUrl}/projects/7`)).text(), detail);
  } finally {
    await running?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
