import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stderr.on('data', chunk => { logs += chunk; });
  const address = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server did not start: ${logs}`));
    }, 10_000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with ${code}: ${logs}`));
    });
    let output = '';
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/Workboard listening on port (\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  return {
    address,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('due dates migrate, validate calendar days, and preserve task data across restarts and archives', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-dates-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0, default_task_priority TEXT NOT NULL DEFAULT 'Normal');
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
      INSERT INTO projects (name, default_task_priority) VALUES ('Existing project', 'High');
      INSERT INTO tasks (project_id, title, completed, priority) VALUES (1, 'Existing task', 1, 'Low');
    `);
    database.close();
    server = await startServer(databasePath);
    async function post(path, fields = {}) {
      return fetch(server.address + path, {
        method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
      });
    }
    async function view(path = '/projects/1') {
      return (await fetch(server.address + path)).text();
    }
    function assertDate(html, taskId, expected, disabled = false) {
      assert.match(html, new RegExp(`<label for="task-due-date-${taskId}">Task due date</label>`));
      const form = html.match(new RegExp(`<form[^>]*action="/projects/\\d+/tasks/${taskId}/due-date[^>]*>[\\s\\S]*?</form>`));
      assert.ok(form);
      assert.match(form[0], new RegExp(`id="task-due-date-${taskId}" name="dueDate" type="text" value="${expected}"${disabled ? ' disabled' : ''}>`));
      assert.match(form[0], new RegExp(`<button type="submit"${disabled ? ' disabled' : ''}>Save due date</button>`));
    }
    assertDate(await view(), 1, '');
    await post('/projects/1/tasks', { title: 'New task' });
    await post('/projects', { name: 'Other project' });
    await post('/projects/2/tasks', { title: 'Other task' });
    assertDate(await view(), 2, '');
    const other = await view('/projects/2');
    assertDate(other, 3, '');
    const summary = await view('/');
    const query = '?filter=Completed&priorityFilter=Low';
    const filteredPath = '/projects/1' + query;
    const datePath = '/projects/1/tasks/1/due-date' + query;
    const original = await view();
    const filteredOriginal = await view(filteredPath);
    for (const date of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '1900-02-28', '2026-04-30']) {
      const saved = await post(datePath, { dueDate: ` \t${date}\n ` });
      assert.equal(saved.status, 303);
      assert.equal(saved.headers.get('location'), filteredPath);
      const detail = await view();
      assertDate(detail, 1, date);
      assertDate(detail, 2, '');
      // Only the saved due date may differ; order, ownership, defaults and task state stay intact.
      assert.equal(detail.replace(`value="${date}"`, 'value=""'), original);
      const filtered = await view(filteredPath);
      assert.equal(filtered.replace(`value="${date}"`, 'value=""'), filteredOriginal);
      assert.equal(await view('/'), summary);
      assert.equal(await view('/projects/2'), other);
    }
    const savedDetail = await view();
    const savedFiltered = await view(filteredPath);
    for (const date of ['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2023-02-29',
      '2024-02-30', '2026-04-31', '2026-00-10', '2026-13-01', '2026-01-00', '2026-01-32',
      '2026-1-01', '26-01-01', '2026-01-1', '2026-01-01T00:00:00Z', 'not a date']) {
      const invalid = await post(datePath, { dueDate: date });
      assert.equal(invalid.status, 400, date);
      const html = await invalid.text();
      assert.match(html, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      assertDate(html, 1, '2026-04-30');
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.match(html, /<option selected>Low<\/option>/);
      assert.equal(await view(), savedDetail);
      assert.equal(await view(filteredPath), savedFiltered);
      assert.equal(await view('/'), summary);
    }
    assert.equal((await post('/projects/2/tasks/1/due-date', { dueDate: '2026-01-01' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/due-date', { dueDate: '2026-01-01' })).status, 404);
    await post('/projects/1/tasks/2/due-date', { dueDate: '2025-12-31' });
    await post('/projects/1/tasks/1/rename' + query, { title: 'Renamed task' });
    let detail = await view();
    assertDate(detail, 1, '2026-04-30');
    assertDate(detail, 2, '2025-12-31');
    assert.match(detail, /aria-label="Complete Renamed task" checked/);
    assert.equal(await view('/'), summary);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await view(), detail);
    await post('/projects/1/archive');
    const archived = await view();
    assertDate(archived, 1, '2026-04-30', true);
    assertDate(archived, 2, '2025-12-31', true);
    const archivedFiltered = await view(filteredPath);
    assertDate(archivedFiltered, 1, '2026-04-30', true);
    assert.doesNotMatch(archivedFiltered, /Complete New task/);
    assert.equal((await post(datePath, { dueDate: '' })).status, 403);
    assert.equal(await view(), archived);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await view(), archived);
    await post('/projects/1/restore');
    assert.equal(await view(), detail);
    for (const blank of ['', ' \t\n ']) {
      await post(datePath, { dueDate: '0004-02-29' });
      const cleared = await post(datePath, { dueDate: blank });
      assert.equal(cleared.status, 303);
      assert.equal(cleared.headers.get('location'), filteredPath);
      assertDate(await view(filteredPath), 1, '');
      assertDate(await view(), 2, '2025-12-31');
      assert.equal(await view('/'), summary);
    }
    detail = await view();
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await view(), detail);
    assert.equal(await view('/projects/2'), other);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project defaults migrate, affect only new tasks, and survive edits, archives, and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-defaults-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    // Seed the schema from Task 007 to verify existing project and task data.
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
      INSERT INTO projects (name) VALUES ('Existing project');
      INSERT INTO tasks (project_id, title, completed, priority) VALUES (1, 'Existing task', 1, 'Low');
    `);
    database.close();
    server = await startServer(databasePath);
    async function post(path, fields = {}) {
      return fetch(server.address + path, {
        method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
      });
    }
    async function view(path = '/projects/1') {
      return (await fetch(server.address + path)).text();
    }
    function assertDefault(html, expected, disabled = false) {
      assert.match(html, /<label for="default-task-priority">Default task priority<\/label>/);
      const select = html.match(/<select id="default-task-priority"[^>]*>([\s\S]*?)<\/select>/);
      assert.ok(select);
      assert.equal(select[0].includes(' disabled'), disabled);
      assert.match(select[0], /onchange="this.form.requestSubmit\(\)"/);
      assert.deepEqual([...select[1].matchAll(/<option(?: selected)?>([^<]*)<\/option>/g)].map(match => match[1]), ['Low', 'Normal', 'High']);
      assert.equal(select[1].match(/<option selected>([^<]*)<\/option>/)[1], expected);
    }
    assertDefault(await view(), 'Normal');
    await post('/projects', { name: 'Independent project' });
    assertDefault(await view('/projects/2'), 'Normal');
    await post('/projects/1/tasks', { title: 'Normal task' });
    const query = '?filter=Completed&priorityFilter=Low';
    const filteredBefore = await view('/projects/1' + query);
    const rows = html => [...html.matchAll(/<li class="task-row"[\s\S]*?<\/li>/g)].map(match => match[0]);
    const summaryBefore = await view('/');
    const changed = await post('/projects/1/default-task-priority' + query, { priority: 'High' });
    assert.equal(changed.status, 303);
    assert.equal(changed.headers.get('location'), '/projects/1' + query);
    const filteredAfter = await view(changed.headers.get('location'));
    assertDefault(filteredAfter, 'High');
    assert.deepEqual(rows(filteredAfter), rows(filteredBefore));
    assert.match(filteredAfter, /<option selected>Completed<\/option>/);
    assert.match(filteredAfter, /<option selected>Low<\/option>/);
    assert.equal(await view('/'), summaryBefore);
    assertDefault(await view('/projects/2'), 'Normal');
    for (const priority of ['', 'Urgent', 'high']) {
      assert.equal((await post('/projects/1/default-task-priority', { priority })).status, 400);
    }
    assert.equal(await view('/projects/1' + query), filteredAfter);
    assert.equal((await post('/projects/999/default-task-priority', { priority: 'High' })).status, 404);
    await post('/projects/1/tasks', { title: 'High task' });
    await post('/projects/1/tasks/3', { completed: '1' });
    await post('/projects/1/default-task-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Low task' });
    await post('/projects/2/tasks', { title: 'Independent task' });
    await post('/projects/1/rename', { name: 'Renamed project' });
    await post('/projects/1/tasks/3/rename', { title: 'Renamed high task' });
    const detail = await view();
    assertDefault(detail, 'Low');
    const taskRows = rows(detail);
    assert.equal(taskRows.length, 4);
    for (const [index, title, priority, completed] of [
      [0, 'Existing task', 'Low', true], [1, 'Normal task', 'Normal', false],
      [2, 'Renamed high task', 'High', true], [3, 'Low task', 'Low', false],
    ]) {
      assert.ok(taskRows[index].includes(`aria-label="Complete ${title}"${completed ? ' checked' : ''}`));
      assert.ok(taskRows[index].includes(`<option selected>${priority}</option>`));
    }
    assertDefault(await view('/projects/2'), 'Normal');
    assert.match(rows(await view('/projects/2'))[0], /<option selected>Normal<\/option>/);
    const summary = await view('/');
    assert.match(summary, /data-testid="project-summary">2\/4 completed/);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await view(), detail);
    assert.equal(await view('/'), summary);
    await post('/projects/1/archive');
    const archived = await view();
    assertDefault(archived, 'Low', true);
    assert.equal((await post('/projects/1/default-task-priority', { priority: 'Normal' })).status, 403);
    assert.equal(await view(), archived);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await view(), archived);
    await post('/projects/1/restore');
    assert.equal(await view(), detail);
    assert.equal(await view('/'), summary);
    await post('/projects/1/tasks', { title: 'After restore' });
    assert.match(rows(await view())[4], /<option selected>Low<\/option>/);
    await post('/projects/1/default-task-priority', { priority: 'Normal' });
    assertDefault(await view(), 'Normal');
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('combined filters preserve selections through edits, archives, and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-filters-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    async function post(path, fields = {}) {
      return fetch(server.address + path, {
        method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
      });
    }
    async function view(path = '/projects/1') {
      return (await fetch(server.address + path)).text();
    }
    const titles = html => [...html.matchAll(/class="task-title">([^<]*)<\/span>/g)].map(match => match[1]);
    function assertFilters(html, completion, priority) {
      for (const [id, expected, options] of [
        ['task-filter', completion, ['All', 'Open', 'Completed']],
        ['priority-filter', priority, ['All', 'Low', 'Normal', 'High']],
      ]) {
        const select = html.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`));
        assert.ok(select, `${id} exists`);
        assert.doesNotMatch(select[0], /disabled/);
        assert.deepEqual([...select[1].matchAll(/<option(?: selected)?>([^<]*)<\/option>/g)].map(match => match[1]), options);
        assert.equal(select[1].match(/<option selected>([^<]*)<\/option>/)[1], expected);
      }
      // Submitting either combobox must also send the other selected value.
      assert.match(html, /<form method="get"[^>]*>\s*<label for="task-filter">[\s\S]*?<select id="task-filter"[^>]*onchange="this.form.requestSubmit\(\)"[\s\S]*?<select id="priority-filter"[^>]*onchange="this.form.requestSubmit\(\)"[\s\S]*?<\/form>/);
    }
    await post('/projects', { name: 'First project' });
    await post('/projects', { name: 'Other project' });
    const tasks = [];
    for (const priority of ['Low', 'Normal', 'High']) {
      for (const completed of [false, true]) {
        const title = `${priority} ${completed ? 'completed' : 'open'}`;
        const id = tasks.length + 1;
        await post('/projects/1/tasks', { title });
        await post(`/projects/1/tasks/${id}/priority`, { priority });
        if (completed) await post(`/projects/1/tasks/${id}`, { completed: '1' });
        tasks.push({ id, title, completed, priority });
      }
    }
    await post('/projects/2/tasks', { title: 'Other project task' });
    const summary = await view('/');
    assert.match(summary, /data-testid="project-summary">3\/6 completed/);
    const otherProject = await view('/projects/2');
    assertFilters(await view(), 'All', 'All');
    for (const completion of ['All', 'Open', 'Completed']) {
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        const html = await view(`/projects/1?filter=${completion}&priorityFilter=${priority}`);
        assertFilters(html, completion, priority);
        assert.deepEqual(titles(html), tasks.filter(task =>
          (completion === 'All' || task.completed === (completion === 'Completed')) &&
          (priority === 'All' || task.priority === priority)).map(task => task.title));
      }
    }
    assert.equal(await view('/'), summary);
    const selectedPath = '/projects/1?filter=Open&priorityFilter=High';
    const selected = await view(selectedPath);
    // Every edit form carries both filters, including the project default and due date.
    const actions = [...selected.matchAll(/method="post" action="([^"]*)"/g)].map(match => match[1]);
    assert.equal(actions.length, 7);
    for (const action of actions) assert.ok(action.endsWith('?filter=Open&amp;priorityFilter=High'));
    for (const path of ['/projects/1/tasks', '/projects/1/tasks/5/rename', '/projects/1/rename']) {
      const invalid = await post(`${path}?filter=Open&priorityFilter=High`, { title: '  ', name: '  ' });
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">(?:Task title|Project name) is required/);
      assertFilters(html, 'Open', 'High');
      assert.deepEqual(titles(html), ['High open']);
    }
    const renamed = await post('/projects/1/tasks/5/rename?filter=Open&priorityFilter=High', { title: '  Renamed high  ' });
    assert.equal(renamed.headers.get('location'), selectedPath);
    let html = await view(renamed.headers.get('location'));
    assertFilters(html, 'Open', 'High');
    assert.deepEqual(titles(html), ['Renamed high']);
    assert.match(html, /aria-label="Complete Renamed high" onchange=/);
    assert.match(html, /id="task-priority-5"[^>]*>\s*<option>Low<\/option><option>Normal<\/option><option selected>High<\/option>/);
    assert.equal(await view('/'), summary);
    const changed = await post('/projects/1/tasks/5/priority?filter=Open&priorityFilter=High', { priority: 'Low' });
    assert.equal(changed.headers.get('location'), selectedPath);
    html = await view(changed.headers.get('location'));
    assertFilters(html, 'Open', 'High');
    assert.deepEqual(titles(html), []);
    assert.equal(await view('/'), summary);
    const completed = await post('/projects/1/tasks/1?filter=Open&priorityFilter=Low', { completed: '1' });
    assert.equal(completed.headers.get('location'), '/projects/1?filter=Open&priorityFilter=Low');
    html = await view(completed.headers.get('location'));
    assertFilters(html, 'Open', 'Low');
    assert.deepEqual(titles(html), ['Renamed high']);
    assert.match(await view('/'), /data-testid="project-summary">4\/6 completed/);
    assert.equal(await view('/projects/2'), otherProject);
    const saved = await view();
    const lowCompletedPath = '/projects/1?filter=Completed&priorityFilter=Low';
    const lowCompleted = await view(lowCompletedPath);
    assert.deepEqual(titles(lowCompleted), ['Low open', 'Low completed']);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await view(), saved);
    assert.equal(await view(lowCompletedPath), lowCompleted);
    assertFilters(await view(), 'All', 'All');
    await post('/projects/1/archive');
    html = await view(lowCompletedPath);
    assertFilters(html, 'Completed', 'Low');
    assert.deepEqual(titles(html), ['Low open', 'Low completed']);
    assert.match(html, /Archived project/);
    assert.equal((html.match(/type="checkbox"[^>]* disabled/g) ?? []).length, 2);
    assert.equal((html.match(/id="task-priority-\d+"[^>]* disabled/g) ?? []).length, 2);
    assert.equal((html.match(/id="new-task-title-\d+"[^>]* disabled/g) ?? []).length, 2);
    const forbidden = await post('/projects/1/tasks/1/priority?filter=Completed&priorityFilter=Low', { priority: 'High' });
    assert.equal(forbidden.status, 403);
    assertFilters(await forbidden.text(), 'Completed', 'Low');
    const archived = await view(lowCompletedPath);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await view(lowCompletedPath), archived);
    await post('/projects/1/restore');
    assert.equal(await view(), saved);
    assert.equal(await view(lowCompletedPath), lowCompleted);
    assert.equal(await view('/projects/2'), otherProject);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('existing databases migrate; archives, summaries, and restored tasks persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archives-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
    );
    INSERT INTO projects (name) VALUES ('Existing project');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Saved task', 1);
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(databasePath);
    async function post(path, fields = {}) {
      return fetch(server.address + path, {
        method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
      });
    }
    async function view(path = '/') {
      return (await fetch(server.address + path)).text();
    }
    const rows = html => (html.match(/data-testid="project-row"/g) ?? []).length;
    const tasks = html => (html.match(/data-testid="task-row"/g) ?? []).length;
    const initial = await view();
    assert.match(initial, /<label for="project-filter">Project filter<\/label>/);
    assert.match(initial, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(initial, /data-testid="project-summary">1\/1 completed/);
    assert.match(initial, />Archive project<\/button>/);
    assert.match(await view('/projects/1'), /id="task-priority-1"[^>]*>\s*<option>Low<\/option><option selected>Normal<\/option><option>High<\/option>/);
    await post('/projects', { name: 'New project' });
    assert.match(await view(), /data-testid="project-summary">0\/0 completed/);
    await post('/projects/1/tasks', { title: 'Open task' });
    assert.match(await view(), /data-testid="project-summary">1\/2 completed/);
    await view('/projects/1?filter=Completed');
    assert.match(await view(), /data-testid="project-summary">1\/2 completed/);

    const archived = await post('/projects/1/archive');
    assert.equal(archived.status, 303);
    assert.equal(rows(await view()), 1);
    assert.doesNotMatch(await view(), /Existing project/);
    const archivedList = await view('/?filter=Archived');
    assert.equal(rows(archivedList), 1);
    assert.match(archivedList, /<option selected>Archived<\/option>/);
    assert.match(archivedList, /Existing project/);
    assert.match(archivedList, />Open project<\/button>/);
    assert.match(archivedList, />Restore project<\/button>/);
    assert.doesNotMatch(archivedList, />Archive project<\/button>/);
    assert.match(archivedList, /data-testid="project-summary">1\/2 completed/);
    const detail = await view('/projects/1');
    assert.match(detail, /<p>Archived project<\/p>/);
    assert.match(detail, /<button type="submit" disabled>Create task/);
    assert.equal(tasks(detail), 2);
    assert.equal((detail.match(/type="checkbox"[^>]* disabled/g) ?? []).length, 2);
    assert.match(detail, /aria-label="Complete Saved task" checked disabled/);
    assert.equal(tasks(await view('/projects/1?filter=Open')), 1);
    assert.equal(tasks(await view('/projects/1?filter=Completed')), 1);
    assert.equal((await post('/projects/1/tasks', { title: 'Forbidden' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1')).status, 403);
    assert.equal(await view('/projects/1'), detail);
    assert.equal((await post('/projects/999/archive')).status, 404);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await view('/?filter=Archived'), archivedList);
    assert.equal(await view('/projects/1'), detail);
    assert.equal((await post('/projects/1/restore')).status, 303);
    const restoredList = await view();
    assert.equal(rows(restoredList), 2);
    assert.ok(restoredList.indexOf('Existing project') < restoredList.indexOf('New project'));
    assert.equal(rows(await view('/?filter=Archived')), 0);
    const restored = await view('/projects/1');
    assert.doesNotMatch(restored, /Archived project| disabled/);
    assert.match(restored, /aria-label="Complete Saved task" checked/);
    assert.equal(tasks(restored), 2);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await view(), restoredList);
    assert.equal(await view('/projects/1'), restored);
    await post('/projects/1/tasks/2', { completed: '1' });
    assert.match(await view(), /data-testid="project-summary">2\/2 completed/);
    await post('/projects/1/tasks/1');
    assert.match(await view(), /data-testid="project-summary">1\/2 completed/);
    await post('/projects/1/tasks', { title: 'After restore' });
    assert.match(await view(), /data-testid="project-summary">1\/3 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task priorities stay independent and persist through renames, archives, and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priorities-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    async function post(path, fields = {}) {
      return fetch(server.address + path, {
        method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
      });
    }
    async function view(path = '/projects/1') {
      return (await fetch(server.address + path)).text();
    }
    function priorityOptions(html, id, priority, disabled = false) {
      const select = html.match(new RegExp(`<select id="task-priority-${id}"[^>]*>([\\s\\S]*?)</select>`));
      assert.ok(select, `Task ${id} has a priority select`);
      assert.equal(select[0].includes(' disabled'), disabled);
      assert.equal(select[1].trim(), ['Low', 'Normal', 'High'].map(option =>
        `<option${option === priority ? ' selected' : ''}>${option}</option>`).join(''));
      assert.match(html, new RegExp(`<label for="task-priority-${id}">Task priority</label>`));
    }
    await post('/projects', { name: 'First project' });
    await post('/projects', { name: 'Second project' });
    await post('/projects/1/tasks', { title: 'First task' });
    await post('/projects/1/tasks', { title: 'Second task' });
    await post('/projects/2/tasks', { title: 'Other task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    priorityOptions(await view(), 1, 'Normal');
    priorityOptions(await view(), 2, 'Normal');
    const summary = await view('/');
    const otherProject = await view('/projects/2');
    const changed = await post('/projects/1/tasks/1/priority?filter=Completed', { priority: 'High' });
    assert.equal(changed.status, 303);
    assert.equal(changed.headers.get('location'), '/projects/1?filter=Completed');
    assert.equal((await post('/projects/1/tasks/2/priority?filter=Open', { priority: 'Low' })).status, 303);
    let detail = await view();
    priorityOptions(detail, 1, 'High');
    priorityOptions(detail, 2, 'Low');
    assert.match(detail, /aria-label="Complete First task" checked/);
    assert.match(detail, /aria-label="Complete Second task" onchange=/);
    assert.ok(detail.indexOf('Complete First task') < detail.indexOf('Complete Second task'));
    assert.equal(await view('/'), summary);
    assert.equal(await view('/projects/2'), otherProject);
    priorityOptions(await view('/projects/1?filter=Completed'), 1, 'High');
    assert.doesNotMatch(await view('/projects/1?filter=Completed'), /task-priority-2/);
    priorityOptions(await view('/projects/1?filter=Open'), 2, 'Low');
    assert.doesNotMatch(await view('/projects/1?filter=Open'), /task-priority-1/);
    assert.equal((await post('/projects/2/tasks/1/priority', { priority: 'Low' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/priority', { priority: 'High' })).status, 404);
    for (const priority of ['', 'Urgent', 'high']) {
      assert.equal((await post('/projects/1/tasks/1/priority', { priority })).status, 400);
    }
    assert.equal(await view(), detail);
    await post('/projects/1/tasks/1/rename', { title: '  Renamed task  ' });
    detail = await view();
    priorityOptions(detail, 1, 'High');
    assert.match(detail, /aria-label="Complete Renamed task" checked/);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await view(), detail);
    assert.equal(await view('/'), summary);
    assert.equal(await view('/projects/2'), otherProject);
    await post('/projects/1/archive');
    const archived = await view();
    priorityOptions(archived, 1, 'High', true);
    priorityOptions(archived, 2, 'Low', true);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Normal' })).status, 403);
    assert.equal(await view(), archived);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await view(), archived);
    await post('/projects/1/restore');
    assert.equal(await view(), detail);
    assert.equal(await view('/'), summary);
    await post('/projects/1/tasks/1/priority', { priority: 'Normal' });
    const restored = await view();
    priorityOptions(restored, 1, 'Normal');
    priorityOptions(restored, 2, 'Low');
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await view(), restored);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('renaming preserves identity, order, tasks, summaries, and archive restrictions across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    async function post(path, fields = {}) {
      return fetch(server.address + path, {
        method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
      });
    }
    async function view(path = '/projects/1') {
      return (await fetch(server.address + path)).text();
    }
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second project' });
    await post('/projects/1/tasks', { title: 'Finished task' });
    await post('/projects/1/tasks', { title: 'Open task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await view();
    assert.match(original, /<label for="new-project-name">New project name<\/label>/);
    assert.match(original, /<input id="new-project-name" name="name" type="text" value="Original">/);
    assert.match(original, /<button type="submit">Rename project<\/button>/);
    for (const name of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/rename', { name });
      assert.equal(invalid.status, 400);
      assert.match(await invalid.text(), /role="alert">Project name is required/);
      assert.equal(await view(), original);
    }
    const renamed = await post('/projects/1/rename?filter=Completed', { name: '  Renamed <project> & "name"  ' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const detail = await view();
    assert.match(detail, /<h1>Renamed &lt;project&gt; &amp; &quot;name&quot;<\/h1>/);
    assert.match(detail, /aria-label="Complete Finished task" checked/);
    assert.match(detail, /aria-label="Complete Open task" onchange=/);
    assert.equal((detail.match(/data-testid="task-row"/g) ?? []).length, 2);
    const listing = await view('/');
    assert.equal((listing.match(/data-testid="project-row"/g) ?? []).length, 2);
    assert.ok(listing.indexOf('Renamed &lt;project&gt;') < listing.indexOf('Second project'));
    assert.match(listing, /action="\/projects\/1"/);
    assert.match(listing, /data-testid="project-summary">1\/2 completed/);
    assert.match(await view('/projects/2'), /<h1>Second project<\/h1>/);
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await view(), detail);
    assert.equal(await view('/'), listing);

    await post('/projects/1/archive');
    const archived = await view();
    assert.match(archived, /id="new-project-name"[^>]* disabled/);
    assert.match(archived, /<button type="submit" disabled>Rename project<\/button>/);
    assert.equal((await post('/projects/1/rename', { name: 'Forbidden' })).status, 403);
    assert.equal(await view(), archived);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await view(), archived);
    await post('/projects/1/restore');
    assert.equal(await view(), detail);
    assert.equal(await view('/'), listing);
    assert.equal((await post('/projects/1/rename', { name: '  After restore  ' })).status, 303);
    const restored = await view();
    assert.match(restored, /<h1>After restore<\/h1>/);
    assert.match(restored, /aria-label="Complete Finished task" checked/);
    assert.match(await view('/'), /data-testid="project-summary">1\/2 completed/);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await view(), restored);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task renaming preserves completion, ownership, order, filters, and summaries across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    async function post(path, fields = {}) {
      return fetch(server.address + path, {
        method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
      });
    }
    async function view(path = '/projects/1') {
      return (await fetch(server.address + path)).text();
    }
    await post('/projects', { name: 'First project' });
    await post('/projects', { name: 'Second project' });
    await post('/projects/1/tasks', { title: 'Original task' });
    await post('/projects/1/tasks', { title: 'Open task' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await view();
    const summary = await view('/');
    assert.match(original, /<label for="new-task-title-1">New task title<\/label>/);
    assert.match(original, /<button type="submit">Rename task<\/button>/);
    for (const title of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/tasks/1/rename?filter=Completed', { title });
      assert.equal(invalid.status, 400);
      const content = await invalid.text();
      assert.match(content, /role="alert">Task title is required/);
      assert.match(content, /<option selected>Completed<\/option>/);
      assert.match(content, /aria-label="Complete Original task" checked/);
      assert.equal(await view(), original);
    }
    const renamed = await post('/projects/1/tasks/1/rename?filter=Completed', {
      title: '  Renamed <task> & "title"  ',
    });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    await post('/projects/1/tasks/2/rename?filter=Open', { title: '  Renamed open task  ' });
    const detail = await view();
    assert.match(detail, /class="task-title">Renamed &lt;task&gt; &amp; &quot;title&quot;<\/span>/);
    assert.match(detail, /aria-label="Complete Renamed &lt;task&gt; &amp; &quot;title&quot;" checked/);
    assert.match(detail, /aria-label="Complete Renamed open task" onchange=/);
    assert.ok(detail.indexOf('Complete Renamed &lt;task&gt;') < detail.indexOf('Complete Renamed open task'));
    assert.equal((detail.match(/data-testid="task-row"/g) ?? []).length, 2);
    const completed = await view('/projects/1?filter=Completed');
    assert.match(completed, /Complete Renamed &lt;task&gt;/);
    assert.doesNotMatch(completed, /Complete Renamed open task/);
    const open = await view('/projects/1?filter=Open');
    assert.match(open, /Complete Renamed open task/);
    assert.doesNotMatch(open, /Complete Renamed &lt;task&gt;/);
    assert.equal(await view('/'), summary);
    const otherProject = await view('/projects/2');
    assert.doesNotMatch(otherProject, /Renamed/);
    assert.equal((await post('/projects/2/tasks/1/rename', { title: 'Wrong owner' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/rename', { title: 'Missing' })).status, 404);
    assert.equal(await view(), detail);
    assert.equal(await view('/projects/2'), otherProject);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await view(), detail);
    assert.equal(await view('/projects/1?filter=Completed'), completed);
    assert.equal(await view('/projects/1?filter=Open'), open);
    assert.equal(await view('/'), summary);
    await post('/projects/1/archive');
    const archived = await view();
    assert.equal((archived.match(/id="new-task-title-\d+"[^>]* disabled/g) ?? []).length, 2);
    assert.equal((archived.match(/<button type="submit" disabled>Rename task<\/button>/g) ?? []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Forbidden' })).status, 403);
    assert.equal(await view(), archived);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await view(), archived);
    await post('/projects/1/restore');
    assert.equal(await view(), detail);
    assert.equal(await view('/'), summary);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: '  After restore  ' })).status, 303);
    const restored = await view();
    assert.match(restored, /aria-label="Complete After restore" checked/);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await view(), restored);
    assert.equal(await view('/'), summary);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project validation, order, navigation, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const health = await fetch(`${server.address}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const initial = await (await fetch(server.address)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, /<input id="project-name" name="name" type="text"/);
    assert.match(initial, />Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);

    async function create(name) {
      return fetch(`${server.address}/projects`, {
        method: 'POST',
        body: new URLSearchParams({ name }),
        redirect: 'manual',
      });
    }
    for (const name of ['', ' \t\n ']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      const content = await response.text();
      assert.match(content, /role="alert">Project name is required/);
      assert.doesNotMatch(content, /data-testid="project-row"/);
    }

    const created = await create('  First project  ');
    assert.equal(created.status, 303);
    assert.equal(created.headers.get('location'), '/');
    await create('Second <script> & "project"');
    const listing = await (await fetch(server.address)).text();
    assert.equal((listing.match(/data-testid="project-row"/g) ?? []).length, 2);
    assert.match(listing, /class="project-name">First project<\/span>/);
    assert.match(listing, /Second &lt;script&gt; &amp; &quot;project&quot;/);
    assert.ok(listing.indexOf('First project') < listing.indexOf('Second &lt;script&gt;'));
    const projectPaths = [...listing.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(projectPaths.length, 2);
    assert.notEqual(projectPaths[0], projectPaths[1]);

    const detail = await (await fetch(server.address + projectPaths[0])).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /<form action="\/" method="get"><button type="submit">Projects<\/button>/);
    assert.equal((await fetch(`${server.address}/projects/999999`)).status, 404);

    const invalidAfterCreation = await create('   ');
    assert.equal(((await invalidAfterCreation.text()).match(/data-testid="project-row"/g) ?? []).length, 2);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await (await fetch(server.address)).text(), listing);
    assert.equal(await (await fetch(server.address + projectPaths[0])).text(), detail);
    await create('Third project');
    const afterRestart = await (await fetch(server.address)).text();
    assert.equal((afterRestart.match(/data-testid="project-row"/g) ?? []).length, 3);
    assert.ok(afterRestart.indexOf('Third project') > afterRestart.indexOf('Second &lt;script&gt;'));
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, toggle, stay project-scoped, and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    async function post(path, fields) {
      return fetch(server.address + path, {
        method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
      });
    }
    async function view(path = '/projects/1') {
      return (await fetch(server.address + path)).text();
    }
    const rowCount = html => (html.match(/data-testid="task-row"/g) ?? []).length;
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const initial = await view();
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, />Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    assert.equal(rowCount(initial), 0);
    for (const title of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/tasks', { title });
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(rowCount(html), 0);
    }
    const created = await post('/projects/1/tasks', { title: '  First task  ' });
    assert.equal(created.status, 303);
    assert.equal(created.headers.get('location'), '/projects/1?filter=All');
    await post('/projects/1/tasks', { title: 'Second <task> & "quoted"' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    const listing = await view();
    assert.equal(rowCount(listing), 2);
    assert.match(listing, /aria-label="Complete First task"/);
    assert.match(listing, /class="task-title">First task<\/span>/);
    assert.match(listing, /Complete Second &lt;task&gt; &amp; &quot;quoted&quot;/);
    assert.doesNotMatch(listing, / checked/);
    assert.ok(listing.indexOf('First task') < listing.indexOf('Second &lt;task&gt;'));
    assert.doesNotMatch(listing, /Other project task/);
    assert.equal(rowCount(await view('/projects/2')), 1);
    const invalid = await post('/projects/1/tasks', { title: '   ' });
    assert.equal(rowCount(await invalid.text()), 2);

    const completed = await post('/projects/1/tasks/1?filter=Open', { completed: '1' });
    assert.equal(completed.headers.get('location'), '/projects/1?filter=Open');
    const all = await view();
    assert.match(all, /aria-label="Complete First task" checked/);
    const open = await view('/projects/1?filter=Open');
    assert.equal(rowCount(open), 1);
    assert.doesNotMatch(open, /Complete First task/);
    assert.match(open, /<option selected>Open<\/option>/);
    const done = await view('/projects/1?filter=Completed');
    assert.equal(rowCount(done), 1);
    assert.match(done, /Complete First task/);
    assert.doesNotMatch(done, /Complete Second/);
    assert.equal((await post('/projects/2/tasks/1', {})).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Missing' })).status, 404);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await view(), all);
    assert.equal(await view('/projects/1?filter=Completed'), done);
    await post('/projects/1/tasks/1?filter=Completed', {});
    assert.equal(rowCount(await view('/projects/1?filter=Completed')), 0);
    assert.equal(rowCount(await view('/projects/1?filter=Open')), 2);
    assert.doesNotMatch(await view(), / checked/);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.doesNotMatch(await view(), / checked/);
    assert.equal(rowCount(await view('/projects/1?filter=Open')), 2);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
