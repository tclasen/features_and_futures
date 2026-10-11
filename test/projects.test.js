import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';

async function startServer(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const base = await new Promise((resolveBase, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server did not start: ${errors}`));
    }, 5000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', chunk => {
      const match = /listening on port (\d+)/.exec(String(chunk));
      if (match) {
        clearTimeout(timeout);
        resolveBase(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  return {
    base,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('directory bulk completion targets only matching live active tasks and persists without changing other data', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'bulk-test-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(dbPath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const snapshot = () => {
      const database = new DatabaseSync(dbPath);
      try {
        return {
          projects: database.prepare('SELECT * FROM projects ORDER BY id').all(),
          tasks: database.prepare('SELECT * FROM tasks ORDER BY id').all().map(task => ({ ...task })),
          positions: database.prepare('SELECT * FROM task_positions ORDER BY project_id, position').all(),
        };
      } finally { database.close(); }
    };
    const buttonDisabled = (page, label) => {
      const button = new RegExp(`<button[^>]*>${label}</button>`).exec(page);
      assert.ok(button, `Missing ${label}`);
      return button[0].includes(' disabled');
    };
    const view = { scope: 'Active', filter: 'Open', priorityFilter: 'High',
      dueFrom: '2000-02-29', dueThrough: '2000-03-01', directorySearch: '  FIND\t this  ' };
    const path = values => `/directory?${new URLSearchParams(values)}`;
    const document = {
      format: 'workboard-project', version: 1,
      project: { name: 'Portable', archived: false, defaultPriority: 'Low', tasks: [
        { title: 'Find  THIS\t first', completed: false, priority: 'High', dueDate: '2000-02-29', notes: '  雪 <markup>\nline  ', deleted: false },
        { title: 'Find this completed', completed: true, priority: 'High', dueDate: '2000-03-01', notes: '', deleted: false },
        { title: 'Find this low', completed: false, priority: 'Low', dueDate: '2000-02-29', notes: '', deleted: false },
        { title: 'Find this undated', completed: false, priority: 'High', dueDate: '', notes: '', deleted: false },
        { title: 'Find this late', completed: false, priority: 'High', dueDate: '2000-03-02', notes: '', deleted: false },
        { title: 'Different title', completed: false, priority: 'High', dueDate: '2000-02-29', notes: 'Find this', deleted: false },
        { title: 'Find this deleted', completed: false, priority: 'High', dueDate: '2000-02-29', notes: '', deleted: true },
      ] },
    };
    await post('/projects/import', { json: JSON.stringify(document), name: 'First' });
    document.project.tasks = [document.project.tasks[0]];
    await post('/projects/import', { json: JSON.stringify(document), name: 'Second' });
    document.project.archived = true;
    await post('/projects/import', { json: JSON.stringify(document), name: 'Archived' });
    // Establish remembered return positions before the bulk action.
    await post('/projects/1/tasks/1/move', { destinationProject: '2' });
    await post('/projects/2/tasks/1/move', { destinationProject: '1' });
    const before = snapshot();
    let page = await html(path(view));
    assert.equal((page.match(/data-testid="directory-task-row"/g) ?? []).length, 2);
    assert.equal(buttonDisabled(page, 'Complete visible tasks'), false);
    assert.equal(buttonDisabled(page, 'Reopen visible tasks'), true);
    assert.doesNotMatch(page, /No matching tasks/);
    const bulkForm = /<form method="post" action="\/directory\/completion">[\s\S]*?<\/form>/.exec(page)[0];
    for (const [key, value] of Object.entries({ ...view, directorySearch: view.directorySearch.trim() })) {
      assert.ok(bulkForm.includes(`name="${key}" value="${value}"`));
    }
    const response = await post('/directory/completion', { ...view, completed: '1' });
    assert.equal(response.status, 303);
    const location = response.headers.get('location');
    for (const [key, value] of Object.entries(view)) {
      assert.equal(new URL(location, server.base).searchParams.get(key), value.trim());
    }
    page = await html(location);
    assert.doesNotMatch(page, /data-testid="directory-task-row"/);
    assert.match(page, /role="status">No matching tasks/);
    assert.match(page, /if \(empty\) empty.hidden = true/);
    assert.equal(buttonDisabled(page, 'Complete visible tasks'), true);
    assert.equal(buttonDisabled(page, 'Reopen visible tasks'), true);
    const completed = snapshot();
    assert.deepEqual(completed.projects, before.projects);
    assert.deepEqual(completed.positions, before.positions);
    assert.deepEqual(completed.tasks, before.tasks.map(task => [1, 8].includes(task.id) ? { ...task, completed: 1 } : task));
    assert.match(await html('/'), /project-summary">2\/6 completed/);
    assert.match(await html('/'), /project-summary">1\/1 completed/);
    // Ineligible scopes and deletion filters are enforced even for direct POSTs.
    for (const values of [{ ...view, scope: 'Archived' }, { ...view, filter: 'Deleted' }]) {
      page = await html(path(values));
      assert.equal(buttonDisabled(page, 'Complete visible tasks'), true);
      assert.equal(buttonDisabled(page, 'Reopen visible tasks'), true);
      await post('/directory/completion', { ...values, completed: '1' });
      await post('/directory/completion', { ...values, completed: '0' });
      assert.deepEqual(snapshot(), completed);
    }
    assert.equal((await post('/directory/completion', { ...view, completed: 'invalid' })).status, 400);
    assert.deepEqual(snapshot(), completed);
    await server.stop();
    server = await startServer(dbPath);
    assert.deepEqual(snapshot(), completed);
    const completedView = { ...view, filter: 'Completed' };
    page = await html(path(completedView));
    assert.equal(buttonDisabled(page, 'Complete visible tasks'), true);
    assert.equal(buttonDisabled(page, 'Reopen visible tasks'), false);
    const reopened = await post('/directory/completion', { ...completedView, completed: '0' });
    page = await html(reopened.headers.get('location'));
    assert.match(page, /No matching tasks/);
    assert.match(page, /<option selected>Completed/);
    assert.deepEqual(snapshot().tasks, before.tasks.map(task => task.id === 2 ? { ...task, completed: 0 } : task));
    // All supports both actions, including already completed/open matches.
    const allView = { ...view, filter: 'All' };
    await post('/directory/completion', { ...allView, completed: '1' });
    const saved = snapshot();
    await post('/directory/completion', { ...allView, completed: '1' });
    assert.deepEqual(snapshot(), saved);
    await server.stop();
    server = await startServer(dbPath);
    assert.deepEqual(snapshot(), saved);
    await post('/projects/1/tasks/1/move', { destinationProject: '2' });
    let moved = snapshot().tasks.find(task => task.id === 1);
    assert.equal(moved.completed, 1);
    assert.equal(moved.notes, before.tasks[0].notes);
    await post('/projects/2/tasks/1/move', { destinationProject: '1' });
    assert.deepEqual(snapshot(), saved);
    await post('/directory/completion', { ...allView, completed: '0' });
    page = await html(path(allView));
    assert.equal(buttonDisabled(page, 'Complete visible tasks'), false);
    assert.equal(buttonDisabled(page, 'Reopen visible tasks'), true);
    const final = snapshot();
    await server.stop();
    server = await startServer(dbPath);
    assert.deepEqual(snapshot(), final);
    assert.deepEqual(await (await fetch(`${server.base}/health`)).json(), { status: 'ok' });
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('directory summary counts only resolved matches across scopes, filters, ordering and bulk updates', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'directory-summary-test-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(dbPath);
    const post = (path, values) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const path = values => `/directory?${new URLSearchParams(values)}`;
    const task = (title, completed, priority = 'High', dueDate = '2026-10-11', deleted = false) => ({
      title, completed, priority, dueDate, deleted, notes: 'Find this in notes only',
    });
    for (const [name, archived, tasks] of [
      ['First', false, [task('Find  THIS\t open', false), task('Find this completed', true),
        task('Find this low', true, 'Low'), task('Find this undated', false, 'High', ''),
        task('Other title', true), task('Find this deleted', true, 'High', '2026-10-11', true)]],
      ['Second', false, [task('Find this second', false), task('Deleted open', false, 'Low', '', true)]],
      ['Archived', true, [task('Archived open', false), task('Archived completed', true),
        task('Archived deleted', true, 'High', '', true)]],
    ]) {
      assert.equal((await post('/projects/import', { name, json: JSON.stringify({
        format: 'workboard-project', version: 1,
        project: { name, archived, defaultPriority: 'Normal', tasks },
      }) })).status, 303);
    }
    const snapshot = () => {
      const database = new DatabaseSync(dbPath);
      try {
        return ['projects', 'tasks', 'task_positions'].map(table =>
          database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(record => ({ ...record })));
      } finally { database.close(); }
    };
    const checkSummary = (page, expected) => {
      const summaries = [...page.matchAll(/data-testid="directory-summary">([^<]*)<\/p>/g)];
      assert.deepEqual(summaries.map(match => match[1]), [expected]);
      const total = Number(expected.split('/')[1].split(' ')[0]);
      assert.equal((page.match(/data-testid="directory-task-row"/g) ?? []).length, total);
      assert.equal(page.includes('No matching tasks'), total === 0);
    };
    const view = { scope: 'Active', filter: 'All', priorityFilter: 'High',
      dueFrom: '2026-10-11', dueThrough: '2026-10-11', directorySearch: '  FIND\t this  ', order: 'Title' };
    const before = snapshot();
    for (const [values, expected] of [
      [{}, '3/6 completed'], [{ filter: 'Open' }, '0/3 completed'],
      [{ filter: 'Completed' }, '3/3 completed'], [{ filter: 'Deleted' }, '1/2 completed'],
      [{ priorityFilter: 'Low' }, '1/1 completed'], [{ dueFrom: '2026-10-11' }, '3/5 completed'],
      [{ directorySearch: 'find this' }, '2/5 completed'], [view, '1/3 completed'],
      [{ ...view, filter: 'Deleted' }, '1/1 completed'],
      [{ scope: 'Archived' }, '1/2 completed'], [{ scope: 'Archived', filter: 'Deleted' }, '1/1 completed'],
      [{ directorySearch: 'missing' }, '0/0 completed'],
      [{ ...view, dueFrom: '2026-10-12', dueThrough: '2026-10-12' }, '0/0 completed'],
    ]) {
      for (const order of ['Original', 'Priority', 'Due date', 'Title']) {
        checkSummary(await html(path({ ...values, order })), expected);
      }
    }
    const rangeResponse = await post('/directory/due-range', view);
    checkSummary(await html(rangeResponse.headers.get('location')), '1/3 completed');
    const invalidRange = await post('/directory/due-range', { ...view,
      appliedDueFrom: view.dueFrom, appliedDueThrough: view.dueThrough, dueFrom: '2026-02-29' });
    assert.equal(invalidRange.status, 400);
    checkSummary(await invalidRange.text(), '1/3 completed');
    assert.deepEqual(snapshot(), before);
    assert.deepEqual([...(await html('/')).matchAll(/data-testid="project-summary">([^<]*)/g)]
      .map(match => match[1]), ['3/5 completed', '0/1 completed']);

    const complete = await post('/directory/completion', { ...view, filter: 'Open', completed: '1' });
    checkSummary(await html(complete.headers.get('location')), '0/0 completed');
    checkSummary(await html(path(view)), '3/3 completed');
    checkSummary(await html(path({ scope: 'Archived' })), '1/2 completed');
    checkSummary(await html(path({ filter: 'Deleted' })), '1/2 completed');
    await server.stop();
    server = await startServer(dbPath);
    checkSummary(await html(path(view)), '3/3 completed');
    const reopen = await post('/directory/completion', { ...view, filter: 'Completed', completed: '0' });
    checkSummary(await html(reopen.headers.get('location')), '0/0 completed');
    checkSummary(await html(path(view)), '0/3 completed');
    const after = snapshot();
    assert.deepEqual(after[0], before[0]);
    assert.deepEqual(after[2], before[2]);
    assert.deepEqual(after[1], before[1].map(record => record.id === 2 ? { ...record, completed: 0 } : record));
    await server.stop();
    server = await startServer(dbPath);
    checkSummary(await html(path(view)), '0/3 completed');
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task priorities migrate, remain independent, and persist through renaming, restarts and restoration', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'priority-test-'));
  const dbPath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO projects (name) VALUES ('First'), ('Second');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing task', 1);
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(dbPath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const rows = page => [...page.matchAll(/<div data-testid="task-row"[\s\S]*?<\/div>/g)].map(match => match[0]);
    const prioritySelect = row => /<select id="task-priority-\d+"[\s\S]*?<\/select>/.exec(row)[0];
    const assertPriority = (row, priority, disabled = false) => {
      assert.match(row, /<label for="task-priority-\d+">Task priority<\/label>/);
      const select = prioritySelect(row);
      assert.deepEqual([...select.matchAll(/<option( selected)?>([^<]+)<\/option>/g)].map(match => match[2]), ['Low', 'Normal', 'High']);
      assert.deepEqual([...select.matchAll(/<option selected>([^<]+)<\/option>/g)].map(match => match[1]), [priority]);
      assert.equal(select.includes(' disabled'), disabled);
      assert.match(select, /onchange="this.form.requestSubmit\(\)"/);
    };
    await post('/projects/1/tasks', { title: 'New task' });
    await post('/projects/2/tasks', { title: 'Other task' });
    const original = await html('/projects/1');
    rows(original).forEach(row => assertPriority(row, 'Normal'));
    const otherProject = await html('/projects/2');
    assertPriority(rows(otherProject)[0], 'Normal');
    const summary = await html('/');
    const updated = await post('/projects/1/tasks/1/priority', { priority: 'High', filter: 'Completed' });
    assert.equal(updated.status, 303);
    assert.equal(updated.headers.get('location'), '/projects/1?filter=Completed');
    await post('/projects/1/tasks/2/priority', { priority: 'Low' });
    let tasks = rows(await html('/projects/1'));
    assertPriority(tasks[0], 'High');
    assertPriority(tasks[1], 'Low');
    assert.match(tasks[0], /<span>Existing task<\/span>/);
    assert.match(tasks[0], /aria-label="Complete Existing task" checked/);
    assert.doesNotMatch(tasks[1], / checked/);
    assert.equal(await html('/projects/2'), otherProject);
    assert.equal(await html('/'), summary);
    assert.deepEqual(rows(await html('/projects/1?filter=Completed')), [tasks[0].replaceAll('name="filter" value="All"', 'name="filter" value="Completed"')]);
    assert.deepEqual(rows(await html('/projects/1?filter=Open')), [tasks[1].replaceAll('name="filter" value="All"', 'name="filter" value="Open"')]);
    const beforeInvalid = await html('/projects/1');
    for (const priority of ['', 'Urgent', 'high']) {
      assert.equal((await post('/projects/1/tasks/1/priority', { priority })).status, 400);
    }
    assert.equal((await post('/projects/2/tasks/1/priority', { priority: 'Low' })).status, 404);
    assert.equal(await html('/projects/1'), beforeInvalid);
    assert.equal(await html('/projects/2'), otherProject);
    await post('/projects/1/tasks/1/rename', { title: '  Renamed task  ' });
    tasks = rows(await html('/projects/1'));
    assertPriority(tasks[0], 'High');
    assert.match(tasks[0], /aria-label="Complete Renamed task" checked/);
    const saved = await html('/projects/1');
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/1'), saved);
    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    tasks = rows(archived);
    assertPriority(tasks[0], 'High', true);
    assertPriority(tasks[1], 'Low', true);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Normal' })).status, 403);
    assert.equal(await html('/projects/1'), archived);
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), saved);
    assert.equal(await html('/'), summary);
    await post('/projects/1/tasks/1/priority', { priority: 'Normal' });
    const restored = await html('/projects/1');
    assertPriority(rows(restored)[0], 'Normal');
    assertPriority(rows(restored)[1], 'Low');
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/1'), restored);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task renaming preserves ownership, order, completion and filters across restarts and restoration', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'task-rename-test-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(dbPath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const rows = page => [...page.matchAll(/<div data-testid="task-row"[\s\S]*?<\/div>/g)].map(match => match[0]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Original completed task' });
    await post('/projects/1/tasks', { title: 'Original open task' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await html('/projects/1');
    for (const row of rows(original)) {
      assert.match(row, /<label for="new-task-title-\d+">New task title<\/label>/);
      assert.match(row, /<input id="new-task-title-\d+"[^>]*type="text"/);
      assert.match(row, /<button type="submit">Rename task<\/button>/);
    }
    for (const title of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/tasks/1/rename', { title, filter: 'Completed' });
      assert.equal(invalid.status, 400);
      const page = await invalid.text();
      assert.match(page, /role="alert"[^>]*>Task title is required/);
      assert.equal(rows(page).length, 1);
      assert.match(rows(page)[0], /Original completed task/);
      assert.equal(await html('/projects/1'), original);
    }
    assert.equal((await post('/projects/2/tasks/1/rename', { title: 'Wrong owner' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/rename', { title: 'Missing task' })).status, 404);
    assert.equal((await post('/projects/999/tasks/1/rename', { title: 'Missing project' })).status, 404);
    const summary = await html('/');
    const renamed = await post('/projects/1/tasks/1/rename', {
      title: '  Renamed <task> & "review"  ', filter: 'Completed',
    });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const renamedOpen = await post('/projects/1/tasks/2/rename', { title: '  Renamed open task  ', filter: 'Open' });
    assert.equal(renamedOpen.headers.get('location'), '/projects/1?filter=Open');
    const savedPage = await html('/projects/1');
    const tasks = rows(savedPage);
    assert.equal(tasks.length, 2);
    assert.match(tasks[0], /<span>Renamed &lt;task&gt; &amp; &quot;review&quot;<\/span>/);
    assert.match(tasks[0], /aria-label="Complete Renamed &lt;task&gt; &amp; &quot;review&quot;" checked/);
    assert.match(tasks[0], /action="\/projects\/1\/tasks\/1\/rename"/);
    assert.match(tasks[1], /<span>Renamed open task<\/span>/);
    assert.doesNotMatch(tasks[1], / checked/);
    assert.doesNotMatch(savedPage, /Original completed task|Original open task/);
    assert.deepEqual(rows(await html('/projects/1?filter=Completed')), [tasks[0].replaceAll('name="filter" value="All"', 'name="filter" value="Completed"')]);
    assert.deepEqual(rows(await html('/projects/1?filter=Open')), [tasks[1].replaceAll('name="filter" value="All"', 'name="filter" value="Open"')]);
    const otherPage = await html('/projects/2');
    assert.match(otherPage, /Other project task/);
    assert.doesNotMatch(otherPage, /Renamed/);
    assert.equal(await html('/'), summary);
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/1'), savedPage);
    assert.equal(await html('/projects/2'), otherPage);
    assert.equal(await html('/'), summary);
    await post('/projects/1/archive');
    const archivedPage = await html('/projects/1');
    for (const row of rows(archivedPage)) {
      assert.match(row, /<input id="new-task-title-\d+"[^>]* disabled>/);
      assert.match(row, /<button type="submit" disabled>Rename task<\/button>/);
    }
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Forbidden' })).status, 403);
    assert.equal(await html('/projects/1'), archivedPage);
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/1'), archivedPage);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), savedPage);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'After restore' })).status, 303);
    const restoredPage = await html('/projects/1');
    assert.match(rows(restoredPage)[0], /aria-label="Complete After restore" checked/);
    assert.equal(await html('/'), summary);
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/1'), restoredPage);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('projects validate, navigate, and persist in creation order across restarts', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'project-test-'));
  const dbPath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(dbPath);
    const health = await fetch(`${server.base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const initial = await (await fetch(server.base)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);

    async function create(name) {
      return fetch(`${server.base}/projects`, {
        method: 'POST',
        body: new URLSearchParams({ name }),
        redirect: 'manual',
      });
    }
    for (const name of ['', ' \t\n ']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert"[^>]*>Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    const first = await create('  First project  ');
    assert.equal(first.status, 303);
    assert.equal(first.headers.get('location'), '/');
    assert.equal((await create('Second <project> & "friends"')).status, 303);
    const list = await (await fetch(server.base)).text();
    assert.equal((list.match(/data-testid="project-row"/g) ?? []).length, 2);
    assert.match(list, /<span>First project<\/span>/);
    assert.match(list, /Second &lt;project&gt; &amp; &quot;friends&quot;/);
    assert.ok(list.indexOf('First project') < list.indexOf('Second &lt;project&gt;'));
    const paths = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    assert.notEqual(paths[0], paths[1]);

    const detail = await (await fetch(`${server.base}${paths[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /<form method="get" action="\/">.*>Projects<\/button>/);
    const invalidAfterCreate = await create('   ');
    assert.equal(((await invalidAfterCreate.text()).match(/data-testid="project-row"/g) ?? []).length, 2);
    assert.equal((await fetch(`${server.base}/projects/9999`)).status, 404);

    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await (await fetch(server.base)).text(), list);
    assert.equal(await (await fetch(`${server.base}${paths[0]}`)).text(), detail);
    assert.equal((await create('Third project')).status, 303);
    const restartedList = await (await fetch(server.base)).text();
    assert.equal((restartedList.match(/data-testid="project-row"/g) ?? []).length, 3);
    assert.ok(restartedList.indexOf('Second &lt;project&gt;') < restartedList.indexOf('Third project'));
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, isolate projects, and persist completion across restarts', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'task-test-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(dbPath);
    const post = (path, values) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const rows = page => [...page.matchAll(/<div data-testid="task-row"[\s\S]*?<\/div>/g)].map(match => match[0]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const initial = await html('/projects/1');
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, />Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    assert.equal(rows(initial).length, 0);
    for (const title of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/tasks', { title });
      assert.equal(invalid.status, 400);
      const page = await invalid.text();
      assert.match(page, /role="alert"[^>]*>Task title is required/);
      assert.equal(rows(page).length, 0);
    }
    const created = await post('/projects/1/tasks', { title: '  First task  ' });
    assert.equal(created.status, 303);
    assert.equal(created.headers.get('location'), '/projects/1');
    await post('/projects/1/tasks', { title: 'Second <task> & "review"' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    let tasks = rows(await html('/projects/1'));
    assert.equal(tasks.length, 2);
    assert.match(tasks[0], /<span>First task<\/span>/);
    assert.match(tasks[0], /aria-label="Complete First task"/);
    assert.match(tasks[1], /aria-label="Complete Second &lt;task&gt; &amp; &quot;review&quot;"/);
    assert.ok(tasks.every(row => !row.includes(' checked')));
    assert.doesNotMatch(await html('/projects/1'), /Other project task/);
    const otherTasks = rows(await html('/projects/2'));
    assert.equal(otherTasks.length, 1);
    assert.match(otherTasks[0], /Other project task/);
    const firstAction = /action="([^"]+)"/.exec(tasks[0])[1];
    const wrongProjectAction = firstAction.replace('/projects/1/', '/projects/2/');
    assert.equal((await post(wrongProjectAction, { completed: '1' })).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Missing project' })).status, 404);
    assert.equal((await post(firstAction, { completed: '1' })).status, 303);
    tasks = rows(await html('/projects/1'));
    assert.match(tasks[0], / checked/);
    assert.doesNotMatch(tasks[1], / checked/);
    const open = rows(await html('/projects/1?filter=Open'));
    const completed = rows(await html('/projects/1?filter=Completed'));
    assert.equal(open.length, 1);
    assert.match(open[0], /Second &lt;task&gt;/);
    assert.equal(completed.length, 1);
    assert.match(completed[0], /First task/);
    assert.equal(rows(await html('/projects/1?filter=invalid')).length, 2);
    const invalid = await post('/projects/1/tasks', { title: '   ' });
    assert.equal(rows(await invalid.text()).length, 2);
    const savedPage = await html('/projects/1');
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/1'), savedPage);
    assert.equal(rows(await html('/projects/1?filter=Completed')).length, 1);
    const unchecked = await post(firstAction, { filter: 'Completed' });
    assert.equal(unchecked.status, 303);
    assert.equal(unchecked.headers.get('location'), '/projects/1?filter=Completed');
    assert.equal(rows(await html('/projects/1?filter=Completed')).length, 0);
    assert.equal(rows(await html('/projects/1?filter=Open')).length, 2);
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.ok(rows(await html('/projects/1')).every(row => !row.includes(' checked')));
    assert.equal(rows(await html('/projects/2')).length, 1);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});


test('existing projects migrate, archive and restore with persistent summaries and protected tasks', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'archive-test-'));
  const dbPath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
    );
    INSERT INTO projects (name) VALUES ('Existing project');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Finished task', 1), (1, 'Open task', 0);
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(dbPath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const tasks = page => [...page.matchAll(/<div data-testid="task-row"[\s\S]*?<\/div>/g)].map(match => match[0]);
    await post('/projects', { name: 'New project' });
    const initial = await html('/');
    assert.match(initial, /<label for="project-filter">Project filter<\/label>/);
    assert.match(initial, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(initial, /data-testid="project-summary">1\/2 completed/);
    assert.match(initial, /data-testid="project-summary">0\/0 completed/);
    assert.ok(initial.indexOf('Existing project') < initial.indexOf('New project'));
    assert.match(initial, />Archive project<\/button>/);
    assert.doesNotMatch(initial, />Restore project<\/button>/);
    assert.equal((await post('/projects/999/archive')).status, 404);
    assert.equal((await post('/projects/1/archive')).status, 303);
    assert.doesNotMatch(await html('/'), /Existing project/);
    const archivedList = await html('/?filter=Archived');
    assert.match(archivedList, /Existing project/);
    assert.doesNotMatch(archivedList, /New project/);
    assert.match(archivedList, />Open project<\/button>/);
    assert.match(archivedList, />Restore project<\/button>/);
    assert.doesNotMatch(archivedList, />Archive project<\/button>/);
    assert.match(archivedList, /data-testid="project-summary">1\/2 completed/);
    const archivedPage = await html('/projects/1');
    assert.match(archivedPage, /Archived project/);
    assert.match(archivedPage, /<button type="submit" disabled>Create task/);
    assert.equal(tasks(archivedPage).length, 2);
    assert.ok(tasks(archivedPage).every(row => /type="checkbox"[\s\S]*? disabled/.test(row)));
    assert.match(tasks(archivedPage)[0], / checked/);
    assert.equal(tasks(await html('/projects/1?filter=Open')).length, 1);
    assert.match(tasks(await html('/projects/1?filter=Open'))[0], /Open task/);
    assert.equal(tasks(await html('/projects/1?filter=Completed')).length, 1);
    assert.equal((await post('/projects/1/tasks', { title: 'Forbidden' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1', {})).status, 403);
    assert.equal((await post('/projects/1/tasks/2', { completed: '1' })).status, 403);
    assert.equal(await html('/projects/1'), archivedPage);
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/?filter=Archived'), archivedList);
    assert.equal(await html('/projects/1'), archivedPage);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.doesNotMatch(await html('/?filter=Archived'), /data-testid="project-row"/);
    const restored = await html('/projects/1');
    assert.doesNotMatch(restored, /Archived project| disabled/);
    assert.equal(tasks(restored).length, 2);
    assert.match(tasks(restored)[0], / checked/);
    assert.doesNotMatch(tasks(restored)[1], / checked/);
    const restoredList = await html('/');
    assert.ok(restoredList.indexOf('Existing project') < restoredList.indexOf('New project'));
    assert.match(restoredList, /data-testid="project-summary">1\/2 completed/);
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/'), restoredList);
    assert.equal(await html('/projects/1'), restored);
    await post('/projects/1/tasks/2', { completed: '1', filter: 'Open' });
    assert.match(await html('/'), /data-testid="project-summary">2\/2 completed/);
    await post('/projects/1/tasks', { title: 'After restore' });
    assert.match(await html('/'), /data-testid="project-summary">2\/3 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('renaming preserves identity, order, tasks and summaries, and requires an active project', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'rename-test-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(dbPath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const rows = page => [...page.matchAll(/<div data-testid="project-row"[\s\S]*?<\/div>/g)].map(match => match[0]);
    const tasks = page => [...page.matchAll(/<div data-testid="task-row"[\s\S]*?<\/div>/g)].map(match => match[0]);
    await post('/projects', { name: 'Original name' });
    await post('/projects', { name: 'Second project' });
    await post('/projects/1/tasks', { title: 'Completed task' });
    await post('/projects/1/tasks', { title: 'Open task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await html('/projects/1');
    const originalTasks = tasks(original);
    assert.match(original, /<label for="new-project-name">New project name<\/label>/);
    assert.match(original, /<input id="new-project-name"[^>]*type="text"[^>]*>/);
    assert.match(original, /<button type="submit">Rename project<\/button>/);
    for (const name of ['', ' \t\n ']) {
      const response = await post('/projects/1/rename', { name });
      assert.equal(response.status, 400);
      const invalid = await response.text();
      assert.match(invalid, /role="alert"[^>]*>Project name is required/);
      assert.match(invalid, /<h1>Original name<\/h1>/);
      assert.equal(await html('/projects/1'), original);
    }
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
    const renamed = await post('/projects/1/rename', { name: '  Renamed <project> & "team"  ', filter: 'Open' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Open');
    const renamedPage = await html('/projects/1');
    assert.match(renamedPage, /<h1>Renamed &lt;project&gt; &amp; &quot;team&quot;<\/h1>/);
    assert.deepEqual(tasks(renamedPage), originalTasks);
    assert.equal(tasks(await html('/projects/1?filter=Open')).length, 1);
    assert.equal(tasks(await html('/projects/1?filter=Completed')).length, 1);
    const renamedList = await html('/');
    const projectRows = rows(renamedList);
    assert.equal(projectRows.length, 2);
    assert.match(projectRows[0], /Renamed &lt;project&gt; &amp; &quot;team&quot;/);
    assert.match(projectRows[0], /action="\/projects\/1"/);
    assert.match(projectRows[0], /data-testid="project-summary">1\/2 completed/);
    assert.match(projectRows[1], /Second project/);
    assert.doesNotMatch(renamedList, /Original name/);
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/1'), renamedPage);
    assert.equal(await html('/'), renamedList);
    await post('/projects/1/archive');
    const archivedPage = await html('/projects/1');
    assert.match(archivedPage, /<input id="new-project-name"[^>]* disabled>/);
    assert.match(archivedPage, /<button type="submit" disabled>Rename project<\/button>/);
    assert.equal((await post('/projects/1/rename', { name: 'Forbidden' })).status, 403);
    assert.equal(await html('/projects/1'), archivedPage);
    assert.match(await html('/?filter=Archived'), /Renamed &lt;project&gt; &amp; &quot;team&quot;/);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), renamedPage);
    assert.equal((await post('/projects/1/rename', { name: 'After restore' })).status, 303);
    const restoredPage = await html('/projects/1');
    assert.match(restoredPage, /<h1>After restore<\/h1>/);
    assert.deepEqual(tasks(restoredPage), originalTasks);
    const restoredList = await html('/');
    assert.match(rows(restoredList)[0], /After restore/);
    assert.match(rows(restoredList)[0], /data-testid="project-summary">1\/2 completed/);
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/1'), restoredPage);
    assert.equal(await html('/'), restoredList);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('combined filters retain selections, re-evaluate edits, and work through archive and restart', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'combined-filter-test-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(dbPath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const rows = page => [...page.matchAll(/<div data-testid="task-row"[\s\S]*?<\/div>/g)].map(match => match[0]);
    const titles = page => rows(page).map(row => /<span>(.*?)<\/span>/.exec(row)[1]);
    const assertFilters = (page, completion, priority) => {
      for (const [id, options, selected] of [
        ['task-filter', ['All', 'Open', 'Completed', 'Deleted'], completion],
        ['priority-filter', ['All', 'Low', 'Normal', 'High'], priority],
      ]) {
        const select = new RegExp(`<select id="${id}"[\\s\\S]*?<\\/select>`).exec(page)[0];
        assert.deepEqual([...select.matchAll(/<option(?: selected)?>([^<]+)<\/option>/g)].map(match => match[1]), options);
        assert.match(select, new RegExp(`<option selected>${selected}<\\/option>`));
        assert.doesNotMatch(select, /disabled/);
        assert.match(select, /onchange="this.form.requestSubmit\(\)"/);
      }
      // Both selects belong to the same GET form so either submits both values.
      assert.match(page, /<form method="get" action="\/projects\/1">\s*<label for="task-filter">[\s\S]*?<label for="priority-filter">[\s\S]*?<\/form>/);
    };
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const tasks = [];
    for (const priority of ['Low', 'Normal', 'High']) {
      for (const completed of [false, true]) {
        const id = tasks.length + 1;
        const title = `${priority} ${completed ? 'completed' : 'open'}`;
        await post('/projects/1/tasks', { title });
        await post(`/projects/1/tasks/${id}/priority`, { priority });
        if (completed) await post(`/projects/1/tasks/${id}`, { completed: '1' });
        tasks.push({ id, title, priority, completed });
      }
    }
    await post('/projects/2/tasks', { title: 'Other project task' });
    const otherProject = await html('/projects/2');
    const summary = await html('/');
    assert.match(summary, /3\/6 completed/);
    assert.match(await html('/projects/1'), /<label for="priority-filter">Priority filter<\/label>/);
    assertFilters(await html('/projects/1'), 'All', 'All');
    for (const filter of ['All', 'Open', 'Completed', 'Deleted']) {
      for (const priorityFilter of ['All', 'Low', 'Normal', 'High']) {
        const path = `/projects/1?${new URLSearchParams({ filter, priorityFilter })}`;
        const page = await html(path);
        assertFilters(page, filter, priorityFilter);
        assert.deepEqual(titles(page), tasks.filter(task =>
          filter !== 'Deleted' && (filter === 'All' || task.completed === (filter === 'Completed')) &&
          (priorityFilter === 'All' || task.priority === priorityFilter)).map(task => task.title));
      }
    }
    assert.equal(await html('/'), summary);
    const selection = { filter: 'Open', priorityFilter: 'High' };
    const selectedPath = '/projects/1?filter=Open&priorityFilter=High';
    const edited = await post('/projects/1/tasks/5/rename', { ...selection, title: '  Renamed high  ' });
    assert.equal(edited.headers.get('location'), selectedPath);
    let page = await html(selectedPath);
    assertFilters(page, 'Open', 'High');
    assert.deepEqual(titles(page), ['Renamed high']);
    assert.match(page, /aria-label="Complete Renamed high"/);
    const invalid = await post('/projects/1/tasks/5/rename', { ...selection, title: '   ' });
    const invalidPage = await invalid.text();
    assert.equal(invalid.status, 400);
    assertFilters(invalidPage, 'Open', 'High');
    assert.match(invalidPage, /Task title is required/);
    assert.deepEqual(titles(invalidPage), ['Renamed high']);
    assert.equal(await html('/'), summary);
    const priorityEdit = await post('/projects/1/tasks/5/priority', { ...selection, priority: 'Low' });
    assert.equal(priorityEdit.headers.get('location'), selectedPath);
    page = await html(selectedPath);
    assertFilters(page, 'Open', 'High');
    assert.deepEqual(titles(page), []);
    assert.deepEqual(titles(await html('/projects/1?filter=Open&priorityFilter=Low')), ['Low open', 'Renamed high']);
    assert.equal(await html('/'), summary);
    const completionSelection = { filter: 'Completed', priorityFilter: 'High' };
    const completionEdit = await post('/projects/1/tasks/6', completionSelection);
    assert.equal(completionEdit.headers.get('location'), '/projects/1?filter=Completed&priorityFilter=High');
    page = await html(completionEdit.headers.get('location'));
    assertFilters(page, 'Completed', 'High');
    assert.deepEqual(titles(page), []);
    assert.deepEqual(titles(await html(selectedPath)), ['High completed']);
    assert.match(await html('/'), /2\/6 completed/);
    assert.equal(await html('/projects/2'), otherProject);
    const savedPage = await html('/projects/1');
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/1'), savedPage);
    assertFilters(await html('/projects/1'), 'All', 'All');
    assert.deepEqual(titles(await html(selectedPath)), ['High completed']);
    await post('/projects/1/archive');
    const archived = await html(selectedPath);
    assertFilters(archived, 'Open', 'High');
    assert.deepEqual(titles(archived), ['High completed']);
    for (const row of rows(archived)) {
      assert.match(row, /type="checkbox"[\s\S]*?disabled/);
      assert.match(row, /<select id="task-priority-\d+"[^>]*disabled/);
      assert.match(row, /<input id="new-task-title-\d+"[^>]*disabled/);
      assert.match(row, /<button type="submit" disabled>Rename task/);
    }
    const blocked = await post('/projects/1/tasks/6/priority', { ...selection, priority: 'Low' });
    assert.equal(blocked.status, 403);
    assertFilters(await blocked.text(), 'Open', 'High');
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html(selectedPath), archived);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), savedPage);
    assertFilters(await html(selectedPath), 'Open', 'High');
    assert.doesNotMatch(await html(selectedPath), /disabled/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project priority defaults migrate and affect only future tasks, surviving archive and restart', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'default-priority-test-'));
  const dbPath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'Normal'
    );
    INSERT INTO projects (name) VALUES ('Existing');
    INSERT INTO tasks (project_id, title, completed, priority) VALUES (1, 'Original', 1, 'Low');
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(dbPath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const rows = page => [...page.matchAll(/<div data-testid="task-row"[\s\S]*?<\/div>/g)].map(match => match[0]);
    const assertDefault = (page, value, disabled = false) => {
      assert.match(page, /<label for="default-task-priority">Default task priority<\/label>/);
      const select = /<select id="default-task-priority"[\s\S]*?<\/select>/.exec(page)[0];
      assert.deepEqual([...select.matchAll(/<option(?: selected)?>([^<]+)<\/option>/g)].map(match => match[1]), ['Low', 'Normal', 'High']);
      assert.match(select, new RegExp(`<option selected>${value}<\\/option>`));
      assert.equal(select.includes(' disabled'), disabled);
      assert.match(select, /onchange="this.form.requestSubmit\(\)"/);
    };
    assertDefault(await html('/projects/1'), 'Normal');
    await post('/projects', { name: 'Independent' });
    assertDefault(await html('/projects/2'), 'Normal');
    await post('/projects/1/tasks', { title: 'Normal before change' });
    const originalRows = rows(await html('/projects/1'));
    const originalList = await html('/');
    const selectedPath = '/projects/1?filter=Completed&priorityFilter=Low';
    const selectedRows = rows(await html(selectedPath));
    const selection = { filter: 'Completed', priorityFilter: 'Low' };
    for (const priority of ['High', 'Low', 'Normal', 'High']) {
      const response = await post('/projects/1/default-priority', { ...selection, priority });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), selectedPath);
      const page = await html(selectedPath);
      assertDefault(page, priority);
      assert.match(page, /<option selected>Completed<\/option>/);
      assert.match(/<select id="priority-filter"[\s\S]*?<\/select>/.exec(page)[0], /<option selected>Low<\/option>/);
      assert.deepEqual(rows(page), selectedRows);
      assert.deepEqual(rows(await html('/projects/1')), originalRows);
      assert.equal(await html('/'), originalList);
    }
    assertDefault(await html('/projects/2'), 'Normal');
    for (const priority of ['', 'Urgent']) {
      assert.equal((await post('/projects/1/default-priority', { priority })).status, 400);
      assertDefault(await html('/projects/1'), 'High');
    }
    assert.equal((await post('/projects/999/default-priority', { priority: 'High' })).status, 404);
    await post('/projects/1/tasks', { title: 'Inherited High' });
    await post('/projects/2/tasks', { title: 'Independent Normal' });
    let taskRows = rows(await html('/projects/1'));
    assert.match(taskRows[2], /<option selected>High<\/option>/);
    assert.doesNotMatch(taskRows[2], / checked/);
    assert.match(rows(await html('/projects/2'))[0], /<option selected>Normal<\/option>/);
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Inherited Low' });
    taskRows = rows(await html('/projects/1'));
    assert.deepEqual(taskRows.slice(0, 2), originalRows);
    assert.match(taskRows[2], /<option selected>High<\/option>/);
    assert.match(taskRows[3], /<option selected>Low<\/option>/);
    assert.match(await html('/'), /1\/4 completed/);
    await post('/projects/1/rename', { name: 'Renamed' });
    assertDefault(await html('/projects/1'), 'Low');
    const saved = await html('/projects/1');
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/1'), saved);
    assertDefault(await html('/projects/2'), 'Normal');
    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    assertDefault(archived, 'Low', true);
    assert.equal((await post('/projects/1/default-priority', { ...selection, priority: 'High' })).status, 403);
    assert.equal(await html('/projects/1'), archived);
    assert.deepEqual(rows(await html(selectedPath)).map(row => /<span>(.*?)<\/span>/.exec(row)[1]), ['Original']);
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), saved);
    await post('/projects/1/tasks', { title: 'Low after restoration' });
    assert.match(rows(await html('/projects/1'))[4], /<option selected>Low<\/option>/);
    assert.match(await html('/'), /1\/5 completed/);
    const finalPage = await html('/projects/1');
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/1'), finalPage);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('due dates validate Gregorian days and preserve task data through migration, edits, archive and restart', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'due-date-test-'));
  const dbPath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal'
    );
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'Normal'
    );
    INSERT INTO projects (name) VALUES ('Existing'), ('Independent');
    INSERT INTO tasks (project_id, title, completed, priority) VALUES (1, 'Original', 1, 'High');
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(dbPath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const rows = page => [...page.matchAll(/<div data-testid="task-row"[\s\S]*?<\/div>/g)].map(match => match[0]);
    const dueDateInput = row => /<input id="task-due-date-\d+"[^>]*>/.exec(row)[0];
    const assertDate = (row, value, disabled = false) => {
      assert.match(row, /<label for="task-due-date-\d+">Task due date<\/label>/);
      const input = dueDateInput(row);
      assert.match(input, /type="text"/);
      assert.match(input, new RegExp(`value="${value}"`));
      assert.equal(input.includes(' disabled'), disabled);
      assert.match(row, disabled ? /<button type="submit" disabled>Save due date/ : /<button type="submit">Save due date/);
    };
    await post('/projects/1/tasks', { title: 'New task' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    const original = await html('/projects/1');
    rows(original).forEach(row => assertDate(row, ''));
    const otherProject = await html('/projects/2');
    const summary = await html('/');
    const selection = { filter: 'Completed', priorityFilter: 'High' };
    const selectedPath = '/projects/1?filter=Completed&priorityFilter=High';
    const save = dueDate => post('/projects/1/tasks/1/due-date', { ...selection, dueDate });
    const assertFilters = page => {
      assert.match(/<select id="task-filter"[\s\S]*?<\/select>/.exec(page)[0], /<option selected>Completed/);
      assert.match(/<select id="priority-filter"[\s\S]*?<\/select>/.exec(page)[0], /<option selected>High/);
    };
    // Century leap rules, early four-digit years, and boundary dates must be timezone-free.
    for (const date of ['0001-01-01', '0004-02-29', '0099-12-31', '0400-02-29', '1900-02-28', '2000-02-29', '2024-02-29', '2025-04-30', '9999-12-31']) {
      const response = await save(` \t${date}\n `);
      assert.equal(response.status, 303, date);
      assert.equal(response.headers.get('location'), selectedPath);
      const page = await html(selectedPath);
      assertFilters(page);
      assert.equal(rows(page).length, 1);
      assertDate(rows(page)[0], date);
      const allRows = rows(await html('/projects/1'));
      assertDate(allRows[1], '');
      assert.match(allRows[0], /aria-label="Complete Original" checked/);
      assert.match(allRows[0], /<option selected>High/);
      assert.deepEqual(allRows.map(row => /<span>(.*?)<\/span>/.exec(row)[1]), ['Original', 'New task']);
      assert.equal(await html('/'), summary);
      assert.equal(await html('/projects/2'), otherProject);
    }
    const saved = await html('/projects/1');
    for (const date of ['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2025-02-29', '2024-02-30', '2025-04-31', '2025-06-31', '2025-00-01', '2025-13-01', '2025-01-00', '2025-01-32', '2025-1-01', '25-01-01', '2025-01-1', '2025/01/01', '2025-01-01T00:00:00Z', '<script>bad</script>']) {
      const response = await save(date);
      assert.equal(response.status, 400, date);
      const page = await response.text();
      assert.match(page, /role="alert"[^>]*>Due date must be a valid YYYY-MM-DD date/);
      assertFilters(page);
      assertDate(rows(page)[0], '9999-12-31');
      assert.equal(await html('/projects/1'), saved);
    }
    assert.equal((await post('/projects/1/tasks/3/due-date', { dueDate: '2025-01-01' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/due-date', { dueDate: '2025-01-01' })).status, 404);
    assert.equal(await html('/projects/2'), otherProject);
    await post('/projects/1/tasks/2/due-date', { dueDate: '2025-03-10' });
    await post('/projects/1/tasks/1/rename', { ...selection, title: 'Renamed' });
    assertDate(rows(await html(selectedPath))[0], '9999-12-31');
    assert.match(await html(selectedPath), /aria-label="Complete Renamed" checked/);
    assert.equal(await html('/'), summary);
    const beforeRestart = await html('/projects/1');
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/1'), beforeRestart);
    assertFilters(await html(selectedPath));
    for (const empty of ['', ' \t\n ']) {
      assert.equal((await save(empty)).status, 303);
      assertDate(rows(await html(selectedPath))[0], '');
      assertDate(rows(await html('/projects/1'))[1], '2025-03-10');
      await save('2024-02-29');
    }
    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    assertDate(rows(archived)[0], '2024-02-29', true);
    assertDate(rows(archived)[1], '2025-03-10', true);
    assertFilters(await html(selectedPath));
    assert.equal((await save('2025-01-01')).status, 403);
    assert.equal((await save('')).status, 403);
    assert.equal(await html('/projects/1'), archived);
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/1'), archived);
    await post('/projects/1/restore');
    assertDate(rows(await html('/projects/1'))[0], '2024-02-29');
    assertDate(rows(await html('/projects/1'))[1], '2025-03-10');
    await save('');
    const cleared = await html('/projects/1');
    assertDate(rows(cleared)[0], '');
    assert.equal(await html('/'), summary);
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/1'), cleared);
    assert.equal(await html('/projects/2'), otherProject);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('inclusive due ranges intersect filters, retain applied state through edits, and work when archived', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'due-range-test-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(dbPath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const titles = page => [...page.matchAll(/data-testid="task-row"[^>]*>\s*<span>(.*?)<\/span>/g)].map(match => match[1]);
    const formAt = (page, action) => [...page.matchAll(/<form\b[\s\S]*?<\/form>/g)]
      .map(match => match[0]).find(form => form.includes(`action="${action}"`));
    // Submit the rendered hidden state, so omissions in UI forms cannot be masked by test fixtures.
    const hidden = form => Object.fromEntries([...form.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)]
      .map(match => [match[1], match[2]]));
    const submit = async (page, action, values) => {
      const form = formAt(page, action);
      assert.ok(form, action);
      return post(action, { ...hidden(form), ...values });
    };
    const follow = async response => {
      assert.equal(response.status, 303);
      return html(response.headers.get('location'));
    };
    const assertState = (page, filter, priority, from, through) => {
      assert.match(/<select id="task-filter"[\s\S]*?<\/select>/.exec(page)[0], new RegExp(`<option selected>${filter}<`));
      assert.match(/<select id="priority-filter"[\s\S]*?<\/select>/.exec(page)[0], new RegExp(`<option selected>${priority}<`));
      assert.match(page, new RegExp(`<input id="due-from"[^>]*value="${from}"`));
      assert.match(page, new RegExp(`<input id="due-through"[^>]*value="${through}"`));
    };
    await post('/projects', { name: 'Range project' });
    await post('/projects', { name: 'Independent' });
    const tasks = [
      { title: 'Undated', date: '', priority: 'Normal', completed: false },
      { title: 'Before', date: '2024-02-28', priority: 'High', completed: false },
      { title: 'From boundary', date: '2024-02-29', priority: 'High', completed: false },
      { title: 'Through boundary', date: '2024-03-01', priority: 'High', completed: true },
      { title: 'After', date: '2024-03-02', priority: 'Low', completed: true },
      { title: 'Early year', date: '0001-01-01', priority: 'Normal', completed: false },
      { title: 'Last year', date: '9999-12-31', priority: 'Normal', completed: true },
    ];
    for (const [index, task] of tasks.entries()) {
      await post('/projects/1/tasks', { title: task.title });
      const path = `/projects/1/tasks/${index + 1}`;
      await post(`${path}/due-date`, { dueDate: task.date });
      await post(`${path}/priority`, { priority: task.priority });
      if (task.completed) await post(path, { completed: '1' });
    }
    const summary = await html('/');
    assert.match(summary, /3\/7 completed/);
    const unfiltered = await html('/projects/1');
    const otherProject = await html('/projects/2');
    assertState(unfiltered, 'All', 'All', '', '');
    for (const [from, through] of [['', ''], ['2024-02-29', '2024-03-01'], ['2024-02-29', ''], ['', '2024-03-01'], ['2024-02-29', '2024-02-29'], ['0001-01-01', '9999-12-31']]) {
      for (const filter of ['All', 'Open', 'Completed', 'Deleted']) {
        for (const priority of ['All', 'Low', 'Normal', 'High']) {
          const response = await submit(unfiltered, '/projects/1/due-range', {
            filter, priorityFilter: priority, dueFrom: ` ${from} `, dueThrough: ` ${through} `,
          });
          const page = await follow(response);
          assertState(page, filter, priority, from, through);
          assert.deepEqual(titles(page), tasks.filter(task =>
            filter !== 'Deleted' && (filter === 'All' || task.completed === (filter === 'Completed')) &&
            (priority === 'All' || task.priority === priority) &&
            ((!from && !through) || (task.date && (!from || task.date >= from) && (!through || task.date <= through))))
            .map(task => task.title));
        }
      }
    }
    assert.equal(await html('/'), summary);
    assert.equal(await html('/projects/1'), unfiltered);
    let page = await follow(await submit(unfiltered, '/projects/1/due-range', {
      filter: 'Open', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-03-01',
    }));
    assert.deepEqual(titles(page), ['From boundary']);
    for (const [from, through, message] of [
      ['2023-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['', '1900-02-29', 'Due range must use valid YYYY-MM-DD dates'],
      ['0000-01-01', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['', '10000-01-01', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-2-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-03-02', '2024-03-01', 'Due from must not be after Due through'],
    ]) {
      const response = await submit(page, '/projects/1/due-range', { dueFrom: from, dueThrough: through });
      assert.equal(response.status, 400);
      const invalid = await response.text();
      assert.ok(invalid.includes(`role="alert" class="alert">${message}`));
      assert.deepEqual(titles(invalid), ['From boundary']);
      const retained = hidden(formAt(invalid, '/projects/1/default-priority'));
      assert.equal(retained.dueFrom, '2024-02-29');
      assert.equal(retained.dueThrough, '2024-03-01');
      page = await follow(await submit(invalid, '/projects/1/default-priority', { priority: 'High' }));
      assertState(page, 'Open', 'High', '2024-02-29', '2024-03-01');
    }
    // Changing either combobox carries the applied range and the other selected value.
    const filterForm = formAt(page, '/projects/1');
    assert.match(filterForm, /onchange="this.form.requestSubmit\(\)"/);
    page = await html(`/projects/1?${new URLSearchParams({ ...hidden(filterForm), filter: 'All', priorityFilter: 'High' })}`);
    assertState(page, 'All', 'High', '2024-02-29', '2024-03-01');
    assert.deepEqual(titles(page), ['From boundary', 'Through boundary']);
    page = await html(`/projects/1?${new URLSearchParams({ ...hidden(formAt(page, '/projects/1')), filter: 'All', priorityFilter: 'All' })}`);
    assertState(page, 'All', 'All', '2024-02-29', '2024-03-01');
    page = await follow(await submit(page, '/projects/1/tasks/3/rename', { title: 'Renamed boundary' }));
    assert.deepEqual(titles(page), ['Renamed boundary', 'Through boundary']);
    page = await follow(await submit(page, '/projects/1/rename', { name: 'Renamed project' }));
    page = await follow(await submit(page, '/projects/1/tasks', { title: 'New undated' }));
    assert.deepEqual(titles(page), ['Renamed boundary', 'Through boundary']);
    page = await follow(await submit(page, '/projects/1/tasks/3/due-date', { dueDate: '2024-03-02' }));
    assert.deepEqual(titles(page), ['Through boundary']);
    page = await follow(await submit(page, '/projects/1/tasks/4/due-date', { dueDate: ' ' }));
    assert.deepEqual(titles(page), []);
    page = await follow(await submit(page, '/projects/1/due-range', { dueFrom: '', dueThrough: '' }));
    assert.equal(titles(page).length, 8);
    page = await follow(await submit(page, '/projects/1/due-range', {
      filter: 'Open', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-03-02',
    }));
    page = await follow(await submit(page, '/projects/1/tasks/3/priority', { priority: 'Low' }));
    assert.deepEqual(titles(page), []);
    await post('/projects/1/tasks/3/priority', { priority: 'High' });
    page = await html('/projects/1?filter=Open&priorityFilter=High&dueFrom=2024-02-29&dueThrough=2024-03-02');
    page = await follow(await submit(page, '/projects/1/tasks/3', { completed: '1' }));
    assert.deepEqual(titles(page), []);
    assertState(page, 'Open', 'High', '2024-02-29', '2024-03-02');
    assert.match(await html('/'), /4\/8 completed/);
    assert.equal(await html('/projects/2'), otherProject);
    const saved = await html('/projects/1');
    await server.stop();
    server = await startServer(dbPath);
    assert.equal(await html('/projects/1'), saved);
    assertState(await html('/projects/1'), 'All', 'All', '', '');
    await post('/projects/1/archive');
    page = await follow(await submit(await html('/projects/1'), '/projects/1/due-range', {
      filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-03-02', dueThrough: '2024-03-02',
    }));
    assertState(page, 'Completed', 'High', '2024-03-02', '2024-03-02');
    assert.deepEqual(titles(page), ['Renamed boundary']);
    assert.doesNotMatch(formAt(page, '/projects/1/due-range'), /disabled/);
    assert.doesNotMatch(formAt(page, '/projects/1'), /disabled/);
    assert.match(page, /id="task-due-date-3"[^>]*disabled/);
    assert.equal((await submit(page, '/projects/1/tasks/3/due-date', { dueDate: '' })).status, 403);
    await server.stop();
    server = await startServer(dbPath);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), saved);
    const database = new DatabaseSync(dbPath);
    assert.deepEqual(database.prepare('SELECT title, completed, priority, due_date FROM tasks WHERE id = 3').get(),
      { __proto__: null, title: 'Renamed boundary', completed: 1, priority: 'High', due_date: '2024-03-02' });
    database.close();
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('moving tasks migrates order, preserves data and filters, and protects archived projects', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'move-test-'));
  const dbPath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal',
      due_date TEXT NOT NULL DEFAULT '');
    INSERT INTO projects (name) VALUES ('Source');
    INSERT INTO tasks (project_id, title, completed, priority, due_date)
      VALUES (1, 'Dated mover', 1, 'High', '2026-10-11'),
             (1, 'Blank mover', 0, 'Low', ''),
             (1, 'Remaining', 1, 'High', '2026-10-12');
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(dbPath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const rows = page => [...page.matchAll(/<div data-testid="task-row"[\s\S]*?<\/div>/g)].map(match => match[0]);
    const titles = page => rows(page).map(row => /<span>([^<]*)<\/span>/.exec(row)[1]);
    const destinations = row => /<select id="destination-project-\d+"[\s\S]*?<\/select>/.exec(row)[0];
    const summary = async () => [...(await html('/')).matchAll(/data-testid="project-summary">([^<]*)/g)].map(match => match[1]);
    const assertSavedMover = (row, { blank = false, archived = false } = {}) => {
      assert.match(row, blank ? /aria-label="Complete Blank mover"/ : /aria-label="Complete Dated mover" checked/);
      assert.match(row, blank ? /<option selected>Low<\/option>/ : /<option selected>High<\/option>/);
      assert.match(row, blank ? /name="dueDate" type="text" value=""/ : /name="dueDate" type="text" value="2026-10-11"/);
      assert.equal(destinations(row).includes(' disabled'), archived);
      assert.match(row, archived ? /<button type="submit" disabled>Move task/ : /<button type="submit">Move task/);
    };
    let source = await html('/projects/1');
    assert.deepEqual(titles(source), ['Dated mover', 'Blank mover', 'Remaining']);
    for (const row of rows(source)) {
      assert.match(row, /<label for="destination-project-\d+">Destination project<\/label>/);
      assert.match(destinations(row), / disabled/);
      assert.doesNotMatch(destinations(row), /<option/);
      assert.match(row, /<button type="submit" disabled>Move task/);
    }
    await post('/projects', { name: 'Destination' });
    await post('/projects', { name: 'Third' });
    await post('/projects', { name: 'Archived destination' });
    await post('/projects/4/archive');
    await post('/projects/2/default-priority', { priority: 'Low' });
    await post('/projects/2/tasks', { title: 'Destination first' });
    await post('/projects/2/tasks', { title: 'Destination second' });
    await post('/projects/2/rename', { name: 'Renamed & destination' });
    source = await html('/projects/1');
    for (const row of rows(source)) {
      assert.deepEqual([...destinations(row).matchAll(/<option value="(\d+)">([^<]*)<\/option>/g)].map(match => [match[1], match[2]]),
        [['2', 'Renamed &amp; destination'], ['3', 'Third']]);
    }
    for (const destinationProject of ['', '1', '4', '999', 'not-an-id']) {
      assert.equal((await post('/projects/1/tasks/1/move', { destinationProject })).status, 400);
    }
    assert.equal((await post('/projects/2/tasks/1/move', { destinationProject: '3' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/move', { destinationProject: '2' })).status, 404);
    assert.equal(await html('/projects/1'), source);
    const filters = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2026-10-11', dueThrough: '2026-10-12' };
    const filteredPath = `/projects/1?${new URLSearchParams(filters)}`;
    assert.deepEqual(titles(await html(filteredPath)), ['Dated mover', 'Remaining']);
    const moved = await post('/projects/1/tasks/1/move', { destinationProject: '2', ...filters });
    assert.equal(moved.status, 303);
    assert.equal(moved.headers.get('location'), filteredPath);
    const remaining = await html(filteredPath);
    assert.deepEqual(titles(remaining), ['Remaining']);
    assert.match(remaining, /<option selected>Completed/);
    assert.match(remaining, /<option selected>High/);
    assert.match(remaining, /id="due-from"[^>]*value="2026-10-11"/);
    assert.match(remaining, /id="due-through"[^>]*value="2026-10-12"/);
    assert.deepEqual(titles(await html('/projects/1')), ['Blank mover', 'Remaining']);
    let destination = await html('/projects/2');
    assert.deepEqual(titles(destination), ['Destination first', 'Destination second', 'Dated mover']);
    assertSavedMover(rows(destination)[2]);
    assert.deepEqual(await summary(), ['1/2 completed', '1/3 completed', '0/0 completed']);
    assert.equal((await post('/projects/1/tasks/1', { completed: '0' })).status, 404);
    await post('/projects/2/tasks', { title: 'Created after move' });
    await post('/projects/1/tasks/2/move', { destinationProject: '2' });
    destination = await html('/projects/2');
    assert.deepEqual(titles(destination), ['Destination first', 'Destination second', 'Dated mover', 'Created after move', 'Blank mover']);
    assertSavedMover(rows(destination)[4], { blank: true });
    assert.deepEqual(await summary(), ['1/1 completed', '1/5 completed', '0/0 completed']);
    const savedSource = await html('/projects/1');
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/2'), destination);
    assert.equal(await html('/projects/1'), savedSource);
    await post('/projects/2/archive');
    const archived = await html('/projects/2');
    assertSavedMover(rows(archived)[2], { archived: true });
    assertSavedMover(rows(archived)[4], { blank: true, archived: true });
    for (const row of rows(await html('/projects/1'))) assert.doesNotMatch(destinations(row), /value="2"/);
    assert.equal((await post('/projects/2/tasks/1/move', { destinationProject: '1' })).status, 403);
    assert.equal((await post('/projects/1/tasks/3/move', { destinationProject: '2' })).status, 400);
    assert.equal(await html('/projects/2'), archived);
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/2'), archived);
    await post('/projects/2/restore');
    assert.equal(await html('/projects/2'), destination);
    await post('/projects/2/tasks/1/move', { destinationProject: '1' });
    await post('/projects/2/tasks/2/move', { destinationProject: '1' });
    const returned = await html('/projects/1');
    assert.deepEqual(titles(returned), ['Dated mover', 'Blank mover', 'Remaining']);
    assertSavedMover(rows(returned)[0]);
    assertSavedMover(rows(returned)[1], { blank: true });
    assert.deepEqual(await summary(), ['2/3 completed', '0/3 completed', '0/0 completed']);
    await post('/projects/1/tasks/1/move', { destinationProject: '2' });
    assert.deepEqual(titles(await html('/projects/2')), ['Destination first', 'Destination second', 'Dated mover', 'Created after move']);
    const finalSource = await html('/projects/1');
    const finalDestination = await html('/projects/2');
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html('/projects/1'), finalSource);
    assert.equal(await html('/projects/2'), finalDestination);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('returning tasks restores per-project order after migration, reverse returns, edits and restarts', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'return-order-test-'));
  const dbPath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal',
      due_date TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Original'), ('Second'), ('Third');
    INSERT INTO tasks (project_id, title, position) VALUES
      (1, 'Middle', 20), (1, 'First', 10), (1, 'Last', 30), (2, 'Resident', 5);
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(dbPath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const titles = page => [...page.matchAll(/data-testid="task-row"[^>]*>\s*<span>([^<]*)/g)].map(match => match[1]);
    const order = async (projectId, expected) => assert.deepEqual(titles(await html(`/projects/${projectId}`)), expected);
    const move = async (source, task, destination, filters = {}) => {
      const response = await post(`/projects/${source}/tasks/${task}/move`, { destinationProject: destination, ...filters });
      assert.equal(response.status, 303);
      return response;
    };
    const restart = async () => {
      await server.stop();
      server = undefined;
      server = await startServer(dbPath);
    };
    await order(1, ['First', 'Middle', 'Last']);
    await move(1, 2, 2);
    await move(1, 1, 2);
    await move(1, 3, 2);
    await order(2, ['Resident', 'First', 'Middle', 'Last']);
    // Even with every original task away, new positions follow all remembered positions.
    await post('/projects/1/tasks', { title: 'New original' });
    await move(2, 4, 1);
    await post('/projects/1/rename', { name: 'Renamed original' });
    await post('/projects/2/tasks/1/rename', { title: 'Edited middle' });
    await post('/projects/2/tasks/1', { completed: '1' });
    await post('/projects/2/tasks/1/priority', { priority: 'High' });
    await post('/projects/2/tasks/1/due-date', { dueDate: '2026-10-11' });
    await post('/projects/1/default-priority', { priority: 'Low' });
    await restart();
    await move(2, 3, 1);
    await move(2, 1, 1);
    await move(2, 2, 1);
    await order(1, ['First', 'Edited middle', 'Last', 'New original', 'Resident']);
    const edited = await html('/projects/1?filter=Completed&priorityFilter=High&dueFrom=2026-10-11&dueThrough=2026-10-11');
    assert.deepEqual(titles(edited), ['Edited middle']);
    assert.match(edited, /aria-label="Complete Edited middle" checked/);
    assert.match(edited, /name="dueDate" type="text" value="2026-10-11"/);
    assert.match(await html('/'), /1\/5 completed/);
    // Returning through a third project still uses each project's independent history.
    await move(1, 3, 3);
    await move(1, 2, 3);
    await move(1, 1, 3, { filter: 'Completed', priorityFilter: 'High', dueFrom: '2026-10-11' });
    await order(3, ['Last', 'First', 'Edited middle']);
    await post('/projects/2/tasks', { title: 'New second' });
    await post('/projects/2/archive');
    assert.equal((await post('/projects/3/tasks/1/move', { destinationProject: '2' })).status, 400);
    assert.doesNotMatch(await html('/projects/3'), /<option value="2">/);
    await restart();
    await post('/projects/2/restore');
    const response = await move(3, 1, 2, { filter: 'Completed', priorityFilter: 'High', dueFrom: '2026-10-11' });
    assert.equal(response.headers.get('location'), '/projects/3?filter=Completed&priorityFilter=High&dueFrom=2026-10-11');
    await move(3, 3, 2);
    await move(3, 2, 2);
    await move(1, 4, 2);
    await order(2, ['Resident', 'First', 'Edited middle', 'Last', 'New second']);
    await order(1, ['New original']);
    await order(3, []);
    await move(2, 1, 3);
    await move(2, 2, 3);
    await move(2, 3, 3);
    await order(3, ['Last', 'First', 'Edited middle']);
    const saved = await html('/projects/3');
    await restart();
    assert.equal(await html('/projects/3'), saved);
    await move(3, 3, 1);
    await move(3, 1, 1);
    await move(3, 2, 1);
    await order(1, ['First', 'Edited middle', 'Last', 'New original']);
    assert.match(await html('/'), /1\/4 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('search collapses only ASCII spaces and tabs without changing saved names or titles', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'search-whitespace-test-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(dbPath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const titles = (page, kind) => [...page.matchAll(new RegExp(`data-testid="${kind}-row"[^>]*>\\s*<span>([^<]*)`, 'g'))].map(match => match[1]);
    const names = ['MiXeD  \t Team', 'MIXED Team', 'Mixed\nTeam', 'Mixed\u00a0Team', 'Älpha Team'];
    for (const name of names) await post('/projects', { name });
    for (const title of names) await post('/projects/1/tasks', { title });
    await post('/projects/1/tasks/1', { completed: '1' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2026-10-11' });
    const snapshot = () => {
      const database = new DatabaseSync(dbPath);
      try {
        return ['projects', 'tasks', 'task_positions'].map(table => database.prepare(`SELECT * FROM ${table}`).all());
      } finally {
        database.close();
      }
    };
    const beforeSearch = snapshot();
    for (const query of ['mixed team', ' \tMiXeD\t  \tTEAM\n ', 'XED\t T']) {
      assert.deepEqual(titles(await html(`/?${new URLSearchParams({ projectSearch: query })}`), 'project'), names.slice(0, 2));
      assert.deepEqual(titles(await html(`/projects/1?${new URLSearchParams({ taskSearch: query })}`), 'task'), names.slice(0, 2));
    }
    for (const query of ['mixed\nteam', 'mixed\u00a0team', 'älpha team']) {
      const expected = query === 'älpha team' ? [] : [names[query.includes('\n') ? 2 : 3]];
      assert.deepEqual(titles(await html(`/?${new URLSearchParams({ projectSearch: query })}`), 'project'), expected);
      assert.deepEqual(titles(await html(`/projects/1?${new URLSearchParams({ taskSearch: query })}`), 'task'), expected);
    }
    const view = new URLSearchParams({ taskSearch: 'mixed\t team', filter: 'Completed', priorityFilter: 'High', dueFrom: '2026-10-11', dueThrough: '2026-10-11' });
    const viewPath = `/projects/1?${view}`;
    assert.deepEqual(titles(await html(viewPath), 'task'), [names[0]]);
    assert.deepEqual(titles(await html('/?projectSearch=%20%09'), 'project'), names);
    assert.deepEqual(titles(await html('/projects/1?taskSearch=%20%09'), 'task'), names);
    assert.deepEqual(snapshot(), beforeSearch);
    const saved = await html(viewPath);
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assert.equal(await html(viewPath), saved);
    assert.deepEqual(snapshot(), beforeSearch);
    assert.deepEqual(titles(await html('/'), 'project'), names);
    assert.deepEqual(titles(await html('/projects/1'), 'task'), names);
    await post('/projects/1/archive');
    assert.deepEqual(titles(await html('/?filter=Archived&projectSearch=mixed+team'), 'project'), [names[0]]);
    assert.deepEqual(titles(await html(viewPath), 'task'), [names[0]]);
    assert.match(await html(viewPath), /aria-label="Complete MiXeD  \t Team" checked disabled/);
    await post('/projects/1/restore');
    assert.equal(await html(viewPath), saved);
    assert.deepEqual(snapshot(), beforeSearch);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('search intersects filters, retains view state through edits, and preserves data and return order', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'search-test-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(dbPath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const titles = (page, kind = 'task') => [...page.matchAll(new RegExp(`data-testid="${kind}-row"[^>]*>\\s*<span>([^<]*)`, 'g'))].map(match => match[1]);
    const forms = page => [...page.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)].map(match => match[0]);
    const formValues = form => Object.fromEntries([...form.matchAll(/<input type="hidden" name="([^"]*)" value="([^"]*)"/g)].map(match => [match[1], match[2]]));
    const submit = async (page, path, changes) => {
      const form = forms(page).find(form => form.includes(`action="${path}"`));
      assert.ok(form, `Missing form ${path}`);
      return post(path, { ...formValues(form), ...changes });
    };
    const follow = async response => {
      assert.equal(response.status, 303);
      return html(response.headers.get('location'));
    };
    for (const name of ['Alpha  Team', 'ALPHA Team', 'Other', 'Älpha']) await post('/projects', { name });
    await post('/projects/2/archive');
    await post('/projects/1/tasks', { title: 'Alpha first' });
    await post('/projects/1/tasks', { title: 'ALPHA  second' });
    await post('/projects/1/tasks', { title: 'Other' });
    await post('/projects/1/tasks', { title: 'Älpha' });
    await post('/projects/1/tasks/1', { completed: '1' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2026-10-11' });
    await post('/projects/1/tasks/2/priority', { priority: 'High' });
    await post('/projects/1/tasks/2/due-date', { dueDate: '2026-10-12' });
    let page = await html('/?projectSearch=%20aLpHa%20');
    assert.deepEqual(titles(page, 'project'), ['Alpha  Team']);
    assert.match(page, /id="project-search"[^>]*value="aLpHa"/);
    assert.match(page, /1\/4 completed/);
    const projectFilterForm = forms(page).find(form => form.includes('id="project-filter"'));
    page = await html(`/?${new URLSearchParams({ ...formValues(projectFilterForm), filter: 'Archived' })}`);
    assert.deepEqual(titles(page, 'project'), ['ALPHA Team']);
    assert.match(page, /id="project-search"[^>]*value="aLpHa"/);
    assert.deepEqual(titles(await html('/?projectSearch=alpha++team'), 'project'), ['Alpha  Team']);
    assert.deepEqual(titles(await html('/?projectSearch=%C3%A4lpha'), 'project'), []);
    assert.deepEqual(titles(await html('/?projectSearch=%20%20'), 'project'), ['Alpha  Team', 'Other', 'Älpha']);
    assert.match(await html('/'), /id="project-search"[^>]*value=""/);

    const database = new DatabaseSync(dbPath);
    const beforeSearch = database.prepare('SELECT * FROM tasks ORDER BY id').all();
    page = await html('/projects/1?taskSearch=%20aLpHa%20');
    assert.deepEqual(titles(page), ['Alpha first', 'ALPHA  second']);
    assert.match(page, /id="task-search"[^>]*value="aLpHa"/);
    assert.deepEqual(titles(await html('/projects/1?taskSearch=alpha++')), ['Alpha first', 'ALPHA  second']);
    assert.deepEqual(titles(await html('/projects/1?taskSearch=alpha++s')), ['ALPHA  second']);
    assert.deepEqual(titles(await html('/projects/1?taskSearch=%C3%A4lpha')), []);
    assert.deepEqual(database.prepare('SELECT * FROM tasks ORDER BY id').all(), beforeSearch);
    database.close();
    const searchForm = forms(page).find(form => form.includes('id="task-search"'));
    assert.match(searchForm, /Search tasks/);
    const filterForm = forms(page).find(form => form.includes('id="task-filter"'));
    page = await html(`/projects/1?${new URLSearchParams({ ...formValues(filterForm), filter: 'Completed', priorityFilter: 'High' })}`);
    assert.deepEqual(titles(page), ['Alpha first']);
    page = await follow(await submit(page, '/projects/1/due-range', { dueFrom: '2026-10-11', dueThrough: '2026-10-11' }));
    assert.deepEqual(titles(page), ['Alpha first']);
    const assertView = page => {
      assert.match(page, /id="task-search"[^>]*value="aLpHa"/);
      assert.match(page, /<option selected>Completed/);
      assert.match(page, /id="priority-filter"[\s\S]*?<option selected>High/);
      assert.match(page, /id="due-from"[^>]*value="2026-10-11"/);
      assert.match(page, /id="due-through"[^>]*value="2026-10-11"/);
      for (const form of forms(page).filter(form => form.includes('method="post"'))) {
        assert.equal(formValues(form).taskSearch, 'aLpHa');
      }
    };
    assertView(page);
    const invalid = await submit(page, '/projects/1/tasks/1/rename', { title: ' ' });
    assert.equal(invalid.status, 400);
    page = await invalid.text();
    assertView(page);
    assert.deepEqual(titles(page), ['Alpha first']);
    page = await follow(await submit(page, '/projects/1/default-priority', { priority: 'Low' }));
    page = await follow(await submit(page, '/projects/1/rename', { name: 'Alpha renamed' }));
    page = await follow(await submit(page, '/projects/1/tasks', { title: 'Alpha new' }));
    assertView(page);
    assert.deepEqual(titles(page), ['Alpha first']);
    page = await follow(await submit(page, '/projects/1/tasks/1/rename', { title: 'No match now' }));
    assertView(page);
    assert.deepEqual(titles(page), []);
    const clearForm = forms(page).find(form => form.includes('id="task-search"'));
    const clearPath = `/projects/1?${new URLSearchParams({ ...formValues(clearForm), taskSearch: ' ' })}`;
    assert.deepEqual(titles(await html(clearPath)), ['No match now']);
    const view = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2026-10-11', dueThrough: '2026-10-11', taskSearch: 'aLpHa' };
    const viewPath = `/projects/1?${new URLSearchParams(view)}`;
    await post('/projects/1/tasks/1/rename', { title: 'Alpha returned', ...view });
    page = await html(viewPath);
    page = await follow(await submit(page, '/projects/1/tasks/1/due-date', { dueDate: '' }));
    assertView(page);
    assert.deepEqual(titles(page), []);
    await post('/projects/1/tasks/1/due-date', { dueDate: '2026-10-11', ...view });
    page = await follow(await submit(await html(viewPath), '/projects/1/tasks/1/priority', { priority: 'Low' }));
    assertView(page);
    assert.deepEqual(titles(page), []);
    await post('/projects/1/tasks/1/priority', { priority: 'High', ...view });
    page = await follow(await submit(await html(viewPath), '/projects/1/tasks/1', {}));
    assertView(page);
    assert.deepEqual(titles(page), []);
    await post('/projects/1/tasks/1', { completed: '1', ...view });
    page = await follow(await submit(await html(viewPath), '/projects/1/tasks/1/move', { destinationProject: '3' }));
    assertView(page);
    assert.deepEqual(titles(page), []);
    assert.match(await html('/'), /1\/1 completed/);
    await post('/projects/3/tasks/1/move', { destinationProject: '1' });
    assert.deepEqual(titles(await html('/projects/1')), ['Alpha returned', 'ALPHA  second', 'Other', 'Älpha', 'Alpha new']);
    const saved = await html(viewPath);
    await server.stop();
    server = await startServer(dbPath);
    assert.equal(await html(viewPath), saved);
    assert.match(await html('/projects/1'), /id="task-search"[^>]*value=""/);
    assert.match(await html('/projects/1'), /action="\/"/);
    await post('/projects/1/archive');
    page = await html(viewPath);
    assertView(page);
    assert.deepEqual(titles(page), ['Alpha returned']);
    for (const form of forms(page).filter(form => form.includes('id="task-search"') || form.includes('id="task-filter"') || form.includes('/due-range'))) {
      assert.doesNotMatch(form, /disabled/);
    }
    assert.match(page, /aria-label="Complete Alpha returned" checked disabled/);
    assert.match(page, /id="new-task-title-1"[^>]*disabled/);
    assert.match(page, /id="task-priority-1"[^>]*disabled/);
    assert.match(page, /id="task-due-date-1"[^>]*disabled/);
    assert.match(page, /id="destination-project-1"[^>]*disabled/);
    await post('/projects/1/restore');
    assert.equal(await html(viewPath), saved);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('notes migrate without data loss and preserve exact text, filters, ownership and return order', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'notes-test-'));
  const dbPath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal'
    );
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'Normal', due_date TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE task_positions (
      task_id INTEGER NOT NULL REFERENCES tasks(id), project_id INTEGER NOT NULL REFERENCES projects(id),
      position INTEGER NOT NULL, PRIMARY KEY (task_id, project_id)
    );
    INSERT INTO projects (name, default_priority) VALUES ('Source', 'High'), ('Destination', 'Low');
    INSERT INTO tasks (project_id, title, completed, priority, due_date, position)
      VALUES (1, 'Keep  Title', 1, 'High', '2026-10-11', 1), (1, 'Second', 0, 'Normal', '', 2);
    INSERT INTO task_positions (task_id, project_id, position) VALUES (1, 1, 1), (2, 1, 2), (1, 2, 1);
  `);
  const before = legacy.prepare('SELECT * FROM tasks ORDER BY id').all().map(row => ({ ...row }));
  const positionsBefore = legacy.prepare('SELECT * FROM task_positions ORDER BY project_id, position').all().map(row => ({ ...row }));
  legacy.close();
  let server;
  try {
    server = await startServer(dbPath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const snapshot = (table = 'tasks') => {
      const database = new DatabaseSync(dbPath);
      try {
        return database.prepare(`SELECT * FROM ${table} ORDER BY ${table === 'tasks' ? 'id' : 'project_id, position'}`).all().map(row => ({ ...row }));
      } finally {
        database.close();
      }
    };
    const escaped = value => value.replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
    const textarea = (page, id) => new RegExp(`<textarea id="task-notes-${id}"[^>]*>([\\s\\S]*?)</textarea>`).exec(page);
    // HTML discards the first newline after a textarea opening tag. The extra
    // newline in the response preserves notes that themselves start with one.
    const assertNotes = (page, id, notes, disabled = false) => {
      const match = textarea(page, id);
      assert.ok(match, `Missing notes textarea for task ${id}`);
      assert.equal(match[1], `\n${escaped(notes)}`);
      assert.equal(match[0].includes(' disabled'), disabled);
      assert.ok(page.includes(`<label for="task-notes-${id}">Task notes</label>`));
      const form = [...page.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)]
        .find(match => match[0].includes(`action="/projects/1/tasks/${id}/notes"`));
      if (form) assert.ok(form[0].includes(`<button type="submit"${disabled ? ' disabled' : ''}>Save notes</button>`));
    };
    assert.deepEqual(snapshot(), before.map(task => ({ ...task, notes: '', deleted: 0 })));
    assert.deepEqual(snapshot('task_positions'), positionsBefore);
    const initial = await html('/projects/1');
    assertNotes(initial, 1, '');
    assertNotes(initial, 2, '');
    await post('/projects/1/tasks', { title: 'New' });
    assertNotes(await html('/projects/1'), 3, '');
    const notes = '\n  Leading spaces\nUnicode: 雪 📝 café\n</textarea><script>alert("x")</script> & literal markup\nTrailing spaces  \n';
    const view = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2026-10-11', dueThrough: '2026-10-11', taskSearch: 'keep\t title' };
    const viewPath = `/projects/1?${new URLSearchParams(view)}`;
    const current = snapshot();
    const summary = await html('/');
    const response = await post('/projects/1/tasks/1/notes', { notes, ...view });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), viewPath);
    let page = await html(response.headers.get('location'));
    assertNotes(page, 1, notes);
    assert.equal((page.match(/data-testid="task-row"/g) ?? []).length, 1);
    assert.deepEqual(snapshot(), current.map(task => task.id === 1 ? { ...task, notes } : task));
    assert.deepEqual(snapshot('task_positions'), positionsBefore.concat([{ task_id: 3, project_id: 1, position: 3 }])
      .sort((a, b) => a.project_id - b.project_id || a.position - b.position));
    assert.equal(await html('/'), summary);
    assertNotes(await html('/projects/1'), 2, '');
    assertNotes(await html('/projects/1'), 3, '');
    assert.doesNotMatch(await html('/projects/1?taskSearch=Unicode'), /data-testid="task-row"/);
    // Wrong ownership and missing tasks cannot alter notes.
    assert.equal((await post('/projects/2/tasks/1/notes', { notes: 'Wrong owner' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/notes', { notes: 'Missing' })).status, 404);
    assert.equal(snapshot()[0].notes, notes);
    await post('/projects/1/tasks/1/rename', { title: 'Renamed' });
    await post('/projects/1/rename', { name: 'Renamed project' });
    assertNotes(await html('/projects/1'), 1, notes);
    await post('/projects/1/tasks/1/move', { destinationProject: '2', ...view });
    assert.doesNotMatch(await html('/projects/1'), /id="task-notes-1"/);
    assertNotes(await html('/projects/2'), 1, notes);
    assert.equal(snapshot()[0].priority, 'High');
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assertNotes(await html('/projects/2'), 1, notes);
    await post('/projects/2/tasks/1/move', { destinationProject: '1' });
    page = await html('/projects/1');
    assert.deepEqual([...page.matchAll(/data-testid="task-row"[^>]*>\s*<span>([^<]*)/g)].map(match => match[1]), ['Renamed', 'Second', 'New']);
    assertNotes(page, 1, notes);
    assert.deepEqual(snapshot()[0], { ...current[0], title: 'Renamed', notes });
    await post('/projects/1/archive');
    page = await html('/projects/1');
    for (const id of [1, 2, 3]) assertNotes(page, id, id === 1 ? notes : '', true);
    assert.equal((await post('/projects/1/tasks/1/notes', { notes: 'Forbidden', ...view })).status, 403);
    assert.equal(snapshot()[0].notes, notes);
    await post('/projects/1/restore');
    assertNotes(await html('/projects/1'), 1, notes);
    for (const value of ['   \t\n  ', '']) {
      assert.equal((await post('/projects/1/tasks/1/notes', { notes: value })).status, 303);
      assert.equal(snapshot()[0].notes, value);
      assertNotes(await html('/projects/1'), 1, value);
    }
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    assertNotes(await html('/projects/1'), 1, '');
    assert.deepEqual(snapshot()[0], { ...current[0], title: 'Renamed', notes: '' });
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('deletion migrates live tasks and restores fields, reserved order, filters and summaries across restarts', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'deletion-test-'));
  const dbPath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'Normal', due_date TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO projects (name) VALUES ('Source'), ('Destination');
    INSERT INTO tasks (project_id, title, completed, priority, due_date, notes, position)
      VALUES (1, 'Keep  Title', 1, 'High', '2026-10-11', '  Notes 雪
<literal>  ', 1), (1, 'Second', 0, 'Normal', '', '', 2);
  `);
  const before = legacy.prepare('SELECT * FROM tasks ORDER BY id').all().map(row => ({ ...row }));
  legacy.close();
  let server;
  try {
    server = await startServer(dbPath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const snapshot = (table = 'tasks') => {
      const database = new DatabaseSync(dbPath);
      try {
        return database.prepare(`SELECT * FROM ${table} ORDER BY ${table === 'tasks' ? 'id' : 'project_id, position'}`).all().map(row => ({ ...row }));
      } finally { database.close(); }
    };
    const titles = page => [...page.matchAll(/data-testid="task-row"[^>]*>\s*<span>([^<]*)/g)].map(match => match[1]);
    const summary = async () => [...(await html('/')).matchAll(/data-testid="project-summary">([^<]*)/g)].map(match => match[1]);
    const view = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2026-10-11', dueThrough: '2026-10-11', taskSearch: 'keep\t title' };
    const viewPath = `/projects/1?${new URLSearchParams(view)}`;
    const deletedView = { ...view, filter: 'Deleted' };
    const deletedPath = `/projects/1?${new URLSearchParams(deletedView)}`;
    assert.deepEqual(snapshot(), before.map(task => ({ ...task, deleted: 0 })));
    const filter = /<select id="task-filter"[\s\S]*?<\/select>/.exec(await html('/projects/1'))[0];
    assert.deepEqual([...filter.matchAll(/<option(?: selected)?>([^<]*)/g)].map(match => match[1]), ['All', 'Open', 'Completed', 'Deleted']);
    await post('/projects/1/tasks/1/move', { destinationProject: '2' });
    await post('/projects/2/tasks/1/move', { destinationProject: '1' });
    const positions = snapshot('task_positions');
    const original = snapshot();
    const deleted = await post('/projects/1/tasks/1/delete', view);
    assert.equal(deleted.status, 303);
    assert.equal(deleted.headers.get('location'), viewPath);
    assert.deepEqual(titles(await html(viewPath)), []);
    assert.deepEqual(titles(await html('/projects/1')), ['Second']);
    assert.deepEqual(titles(await html('/projects/1?filter=Open')), ['Second']);
    assert.deepEqual(await summary(), ['0/1 completed', '0/0 completed']);
    assert.deepEqual(snapshot(), original.map(task => task.id === 1 ? { ...task, deleted: 1 } : task));
    assert.deepEqual(snapshot('task_positions'), positions);
    let page = await html(deletedPath);
    assert.deepEqual(titles(page), ['Keep  Title']);
    const controls = [...page.matchAll(/<form\b[^>]*action="\/projects\/1\/tasks\/1[^"\s]*"[^>]*>[\s\S]*?<\/form>/g)].map(match => match[0]);
    assert.equal(controls.length, 7);
    for (const form of controls) {
      const elements = [...form.matchAll(/<(?:input|select|textarea|button)\b[^>]*>/g)]
        .map(match => match[0]).filter(element => !element.includes('type="hidden"'));
      assert.ok(elements.length);
      for (const element of elements) assert.equal(element.includes(' disabled'), !form.includes('/restore"'));
    }
    assert.match(page, /  Notes 雪\n&lt;literal&gt;  <\/textarea>/);
    for (const values of [{ priorityFilter: 'Low' }, { dueFrom: '2026-10-12', dueThrough: '' }, { taskSearch: 'Notes' }]) {
      assert.deepEqual(titles(await html(`/projects/1?${new URLSearchParams({ ...deletedView, ...values })}`)), []);
    }
    for (const [suffix, values] of [
      ['', { completed: '0' }], ['/rename', { title: 'Changed' }], ['/priority', { priority: 'Low' }],
      ['/due-date', { dueDate: '' }], ['/notes', { notes: 'Changed' }], ['/move', { destinationProject: '2' }],
    ]) assert.equal((await post(`/projects/1/tasks/1${suffix}`, values)).status, 403);
    assert.equal((await post('/projects/2/tasks/1/restore')).status, 404);
    assert.deepEqual(snapshot(), original.map(task => task.id === 1 ? { ...task, deleted: 1 } : task));
    assert.deepEqual(snapshot('task_positions'), positions);
    await post('/projects/1/tasks/2/delete');
    assert.deepEqual(await summary(), ['0/0 completed', '0/0 completed']);
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Later' });
    await server.stop();
    server = await startServer(dbPath);
    assert.deepEqual(titles(await html('/projects/1')), ['Later']);
    assert.deepEqual(titles(await html('/projects/1?filter=Deleted')), ['Keep  Title', 'Second']);
    await post('/projects/1/archive');
    page = await html(deletedPath);
    assert.deepEqual(titles(page), ['Keep  Title']);
    assert.match(page, /<button type="submit" disabled>Restore task/);
    assert.match(await html('/projects/1'), /<button type="submit" disabled>Delete task/);
    const readingControls = [...page.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)]
      .map(match => match[0]).filter(form => /id="task-filter"|id="task-search"|id="due-from"/.test(form));
    for (const form of readingControls) assert.doesNotMatch(form, /disabled/);
    assert.equal((await post('/projects/1/tasks/1/restore', deletedView)).status, 403);
    assert.equal((await post('/projects/1/tasks/3/delete')).status, 403);
    await post('/projects/1/restore');
    await post('/projects/1/tasks/2/restore', { filter: 'Deleted' });
    const restored = await post('/projects/1/tasks/1/restore', deletedView);
    assert.equal(restored.status, 303);
    assert.equal(restored.headers.get('location'), deletedPath);
    assert.deepEqual(titles(await html(deletedPath)), []);
    assert.deepEqual(titles(await html('/projects/1')), ['Keep  Title', 'Second', 'Later']);
    assert.deepEqual(titles(await html(viewPath)), ['Keep  Title']);
    assert.deepEqual(snapshot().slice(0, 2), original);
    assert.deepEqual(await summary(), ['1/3 completed', '0/0 completed']);
    await post('/projects/1/tasks/1/move', { destinationProject: '2' });
    await post('/projects/2/tasks/1/delete');
    await post('/projects/2/tasks/1/restore', { filter: 'Deleted' });
    await post('/projects/2/tasks/1/move', { destinationProject: '1' });
    await server.stop();
    server = await startServer(dbPath);
    assert.deepEqual(titles(await html('/projects/1')), ['Keep  Title', 'Second', 'Later']);
    assert.deepEqual(snapshot().slice(0, 2), original);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('portable project export includes unfiltered current state without changing data or remembered order', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'export-test-'));
  const dbPath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO projects (name) VALUES ('Original  Project 雪'), ('Other'), ('Empty');
    INSERT INTO tasks (project_id, title, completed)
      VALUES (1, 'First  Title <literal>', 1), (1, 'Second', 0), (2, 'Other project task', 0);
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(dbPath);
    const post = async (path, values = {}) => {
      const response = await fetch(`${server.base}${path}`, {
        method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
      });
      assert.equal(response.status, 303);
    };
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const snapshot = () => {
      const database = new DatabaseSync(dbPath);
      try {
        return ['projects', 'tasks', 'task_positions'].map(table =>
          database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(row => ({ ...row })));
      } finally { database.close(); }
    };
    const download = async (id, query = '') => {
      const response = await fetch(`${server.base}/projects/${id}/export${query}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
      assert.equal(response.headers.get('content-disposition'), 'attachment; filename="workboard-project.json"');
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await response.arrayBuffer()));
    };
    const defaultTask = title => ({ title, completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false });
    const expected = {
      format: 'workboard-project', version: 1,
      project: {
        name: 'Original  Project 雪', archived: false, defaultPriority: 'Normal',
        tasks: [{ ...defaultTask('First  Title <literal>'), completed: true }, defaultTask('Second')],
      },
    };
    assert.deepEqual(await download(1), expected);
    assert.deepEqual(await download(3), {
      format: 'workboard-project', version: 1,
      project: { name: 'Empty', archived: false, defaultPriority: 'Normal', tasks: [] },
    });
    const notes = '  Leading 雪 📝\r\n<literal>&"\rAnother line\nTrailing  ';
    await post('/projects/1/tasks/1/notes', { notes });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '0001-01-01' });
    await post('/projects/1/tasks/1/move', { destinationProject: '2' });
    await post('/projects/2/tasks/1/move', { destinationProject: '1' });
    await post('/projects/1/tasks/2/delete');
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'New' });
    await post('/projects/1/rename', { name: 'Renamed  PROJECT 雪' });
    expected.project.name = 'Renamed  PROJECT 雪';
    expected.project.defaultPriority = 'Low';
    Object.assign(expected.project.tasks[0], { priority: 'High', dueDate: '0001-01-01', notes: notes.replace(/\r\n?/g, '\n') });
    expected.project.tasks[1].deleted = true;
    expected.project.tasks.push({ ...defaultTask('New'), priority: 'Low' });
    const query = '?filter=Deleted&priorityFilter=High&dueFrom=9999-12-31&taskSearch=absent';
    const beforePage = await html(`/projects/1${query}`);
    assert.doesNotMatch(beforePage, /data-testid="task-row"/);
    const control = /<form method="get" action="\/projects\/1\/export">[\s\S]*?<\/form>/.exec(beforePage);
    assert.ok(control);
    assert.match(control[0], />Download project<\/button>/);
    assert.doesNotMatch(control[0], /disabled/);
    const before = snapshot();
    assert.deepEqual(await download(1, query), expected);
    assert.deepEqual(snapshot(), before);
    assert.equal(await html(`/projects/1${query}`), beforePage);
    assert.equal(snapshot()[1][0].notes, notes);
    await post('/projects/1/tasks/1/delete');
    await post('/projects/1/tasks/4/delete');
    await post('/projects/1/archive');
    expected.project.archived = true;
    expected.project.tasks.forEach(task => { task.deleted = true; });
    const archivedPage = await html(`/projects/1${query}`);
    assert.match(archivedPage, /Archived project/);
    assert.match(archivedPage, /<button type="submit" class="secondary">Download project<\/button>/);
    const archivedSnapshot = snapshot();
    assert.deepEqual(await download(1), expected);
    assert.deepEqual(snapshot(), archivedSnapshot);
    await server.stop();
    server = await startServer(dbPath);
    assert.deepEqual(await download(1), expected);
    assert.deepEqual(snapshot(), archivedSnapshot);
    assert.equal((await fetch(`${server.base}/projects/999/export`)).status, 404);
    await post('/projects/1/restore');
    await post('/projects/1/tasks/1/restore');
    await post('/projects/1/tasks/1/move', { destinationProject: '2' });
    assert.deepEqual((await download(2)).project.tasks, [defaultTask('Other project task'), { ...expected.project.tasks[0], deleted: false }]);
    await post('/projects/2/tasks/1/move', { destinationProject: '1' });
    expected.project.archived = false;
    expected.project.tasks[0].deleted = false;
    assert.deepEqual(await download(1), expected);
    assert.deepEqual(snapshot()[2], archivedSnapshot[2]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project imports validate atomically and preserve independent portable state and return positions', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'import-test-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(dbPath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const exported = async id => (await fetch(`${server.base}/projects/${id}/export`)).json();
    const snapshot = () => {
      const database = new DatabaseSync(dbPath);
      try {
        return ['projects', 'tasks', 'task_positions', 'sqlite_sequence'].map(table =>
          database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(row => ({ ...row })));
      } finally { database.close(); }
    };
    await post('/projects', { name: 'Original' });
    await post('/projects/1/tasks', { title: 'Original task' });
    const original = await exported(1);
    const task = {
      title: '  First  TITLE 雪 <literal>  ', completed: true, priority: 'High',
      dueDate: '2000-02-29', notes: '  雪 <script>&"\r\nline\rfinal  ', deleted: false,
      id: 1, project_id: 1, position: 999,
    };
    const document = {
      format: 'workboard-project', version: 1,
      project: {
        name: 'Portable name', archived: false, defaultPriority: 'Low', id: 1,
        tasks: [task, { ...task, title: 'Deleted title', priority: 'Normal', completed: false, dueDate: '', notes: '', deleted: true }],
      },
    };
    const home = await html('/');
    assert.match(home, /<label for="project-json">Project JSON<\/label>/);
    assert.match(home, /<textarea id="project-json"/);
    assert.match(home, /<label for="imported-project-name">Imported project name<\/label>/);
    assert.match(home, />Import project<\/button>/);
    const invalidDocuments = ['{broken', 'null', '[]'];
    for (const [key, values] of Object.entries({ format: ['other', null], version: ['1', 2, 1.5], project: [null, []] })) {
      for (const value of values) invalidDocuments.push(JSON.stringify({ ...document, [key]: value }));
    }
    for (const [key, values] of Object.entries({ name: ['', ' \t', 5], archived: [0, 'false'], defaultPriority: ['normal', null], tasks: [null, {}] })) {
      for (const value of values) invalidDocuments.push(JSON.stringify({ ...document, project: { ...document.project, [key]: value } }));
    }
    for (const key of ['format', 'version', 'project']) {
      const copy = structuredClone(document);
      delete copy[key];
      invalidDocuments.push(JSON.stringify(copy));
    }
    for (const key of ['name', 'archived', 'defaultPriority', 'tasks']) {
      const copy = structuredClone(document);
      delete copy.project[key];
      invalidDocuments.push(JSON.stringify(copy));
    }
    for (const [key, values] of Object.entries({
      title: ['', ' \t\n', 2], completed: [1, 'true'], priority: ['HIGH', null],
      dueDate: ['1900-02-29', '2025-02-29', '0000-01-01', '10000-01-01', '2026-04-31', '2026-1-01', ' 2000-02-29 ', null],
      notes: [null, 2], deleted: [0, 'false'],
    })) {
      for (const value of values) {
        const copy = structuredClone(document);
        copy.project.tasks[1][key] = value;
        invalidDocuments.push(JSON.stringify(copy));
      }
      const copy = structuredClone(document);
      delete copy.project.tasks[1][key];
      invalidDocuments.push(JSON.stringify(copy));
    }
    const before = snapshot();
    for (const json of invalidDocuments) {
      const response = await post('/projects/import', { json, name: '  Override  ' });
      assert.equal(response.status, 400);
      const page = await response.text();
      assert.match(page, /role="alert" class="alert">Invalid project JSON<\/p>/);
      assert.match(page, /value="  Override  "/);
      // Decode text entities to check rejected content survives safely as textarea text.
      const retained = /<textarea id="project-json"[^>]*>\n([\s\S]*?)<\/textarea>/.exec(page)[1]
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
      assert.equal(retained, json);
      assert.deepEqual(snapshot(), before);
    }
    const blank = await post('/projects/import', { json: JSON.stringify(document), name: ' \t ' });
    assert.equal(blank.status, 400);
    assert.match(await blank.text(), /role="alert" class="alert">Project name is required/);
    assert.deepEqual(snapshot(), before);
    const response = await post('/projects/import', { json: JSON.stringify(document), name: '  Imported  ' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/2');
    const expected = {
      format: 'workboard-project', version: 1,
      project: {
        name: 'Imported', archived: false, defaultPriority: 'Low',
        tasks: document.project.tasks.map(({ id, project_id, position, ...fields }) => ({ ...fields, notes: fields.notes.replace(/\r\n?/g, '\n') })),
      },
    };
    assert.deepEqual(await exported(2), expected);
    assert.deepEqual(await exported(1), original);
    assert.match(await html('/'), /data-testid="project-summary">1\/1 completed/);
    assert.doesNotMatch(await html('/projects/2'), /<span>Deleted title<\/span>/);
    const deletedPage = await html('/projects/2?filter=Deleted');
    assert.match(deletedPage, /<span>Deleted title<\/span>/);
    assert.match(deletedPage, /<button type="submit" disabled>Save notes/);
    assert.match(deletedPage, /<button type="submit">Restore task/);
    await post('/projects/2/tasks', { title: 'Later' });
    await post('/projects/2/tasks/3/restore', { filter: 'Deleted' });
    await post('/projects/2/tasks/2/move', { destinationProject: '1' });
    await post('/projects/1/tasks/2/notes', { notes: 'Current notes' });
    await post('/projects/1/tasks/2/move', { destinationProject: '2' });
    expected.project.tasks[0].notes = 'Current notes';
    expected.project.tasks[1].deleted = false;
    expected.project.tasks.push({ title: 'Later', completed: false, priority: 'Low', dueDate: '', notes: '', deleted: false });
    assert.deepEqual(await exported(2), expected);
    assert.deepEqual(await exported(1), original);
    const archived = structuredClone(document);
    archived.project.archived = true;
    const importedArchive = await post('/projects/import', { json: JSON.stringify(archived), name: 'Archive copy' });
    assert.equal(importedArchive.headers.get('location'), '/projects/3');
    assert.match(await html('/projects/3'), /Archived project/);
    assert.match(await html('/projects/3?filter=Deleted'), /<button type="submit" disabled>Restore task/);
    assert.equal((await post('/projects/3/tasks/6/restore')).status, 403);
    await post('/projects/3/restore');
    await post('/projects/3/tasks/6/restore');
    assert.equal((await exported(3)).project.tasks[1].deleted, false);
    const empty = structuredClone(document);
    empty.project.tasks = [];
    assert.equal((await post('/projects/import', { json: JSON.stringify(empty), name: 'Empty' })).headers.get('location'), '/projects/4');
    assert.deepEqual((await exported(4)).project.tasks, []);
    const saved = snapshot();
    await server.stop();
    server = await startServer(dbPath);
    assert.deepEqual(snapshot(), saved);
    assert.deepEqual(await exported(2), expected);
    assert.deepEqual(await exported(1), original);
    assert.deepEqual(await (await fetch(`${server.base}/health`)).json(), { status: 'ok' });
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('read-only task directory intersects filters, preserves literal fields and order, and resets navigation', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'directory-test-'));
  const dbPath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('First owner'), ('Second owner');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Legacy title', 0);
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(dbPath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const rows = page => [...page.matchAll(/<div data-testid="directory-task-row"[\s\S]*?<\/form>\s*<\/div>/g)].map(match => match[0]);
    const titles = page => [...page.matchAll(/data-testid="directory-task-title">([^<]*)/g)].map(match => match[1]);
    const snapshot = () => {
      const database = new DatabaseSync(dbPath);
      try {
        return ['projects', 'tasks', 'task_positions', 'sqlite_sequence'].map(table =>
          database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(row => ({ ...row })));
      } finally { database.close(); }
    };
    const notes = '  雪 <script>&"\n\nline\t  \n trailing  ';
    await post('/projects/1/tasks', { title: 'Find  THIS\t title' });
    await post('/projects/1/tasks/2', { completed: '1' });
    await post('/projects/1/tasks/2/priority', { priority: 'High' });
    await post('/projects/1/tasks/2/due-date', { dueDate: '2000-02-29' });
    await post('/projects/1/tasks/2/notes', { notes });
    await post('/projects/1/tasks', { title: 'Find this title deleted' });
    await post('/projects/1/tasks/3/delete');
    await post('/projects/1/tasks', { title: 'Later' });
    await post('/projects/2/tasks', { title: 'Find this title second' });
    await post('/projects/2/tasks/5/priority', { priority: 'High' });
    await post('/projects/2/tasks/5/due-date', { dueDate: '2000-03-01' });
    await post('/projects/1/tasks/2/move', { destinationProject: '2' });
    await post('/projects/2/tasks/2/move', { destinationProject: '1' });
    const document = {
      format: 'workboard-project', version: 1,
      project: { name: 'Portable', archived: true, defaultPriority: 'Low', tasks: [
        { title: 'Find\tthis  title archive', completed: true, priority: 'High', dueDate: '2000-02-29', notes, deleted: false },
        { title: 'Reserved deleted', completed: false, priority: 'Low', dueDate: '', notes: 'deleted notes', deleted: true },
      ] },
    };
    await post('/projects/import', { json: JSON.stringify(document), name: 'Archived owner' });
    const before = snapshot();
    const home = await html('/');
    assert.match(home, /action="\/directory"><button class="secondary">Task directory/);
    let page = await html('/directory');
    assert.deepEqual(titles(page), ['Legacy title', 'Find  THIS\t title', 'Later', 'Find this title second']);
    for (const [id, options, selected] of [
      ['project-scope', ['Active', 'Archived'], 'Active'],
      ['task-filter', ['All', 'Open', 'Completed', 'Deleted'], 'All'],
      ['priority-filter', ['All', 'Low', 'Normal', 'High'], 'All'],
    ]) {
      const select = new RegExp(`<select id="${id}"[\\s\\S]*?<\\/select>`).exec(page)[0];
      assert.deepEqual([...select.matchAll(/<option(?: selected)?>([^<]*)/g)].map(match => match[1]), options);
      assert.ok(select.includes(`<option selected>${selected}</option>`));
    }
    for (const id of ['directory-search', 'due-from', 'due-through']) {
      assert.match(page, new RegExp(`id="${id}"[^>]*value=""`));
    }
    const resultRows = rows(page);
    assert.equal(resultRows.length, 4);
    for (const row of resultRows) {
      assert.doesNotMatch(row, /<(?:input|select|textarea)\b/);
      assert.equal([...row.matchAll(/<button\b/g)].length, 1);
      assert.match(row, />Open project<\/button>/);
    }
    assert.match(resultRows[0], /directory-task-completion">Open/);
    assert.match(resultRows[0], /directory-task-priority">Normal/);
    assert.match(resultRows[0], /directory-task-due-date"><\/p>/);
    assert.match(resultRows[0], /directory-task-notes" class="directory-notes"><\/div>/);
    assert.match(resultRows[1], /directory-project-name">First owner/);
    assert.match(resultRows[1], /directory-task-completion">Completed/);
    assert.match(resultRows[1], /directory-task-priority">High/);
    assert.match(resultRows[1], /directory-task-due-date">2000-02-29/);
    assert.match(resultRows[1], /directory-task-notes" class="directory-notes">  雪 &lt;script&gt;&amp;&quot;\n\nline\t  \n trailing  <\/div>/);
    const view = { scope: 'Active', filter: 'Completed', priorityFilter: 'High',
      dueFrom: '2000-02-29', dueThrough: '2000-02-29', directorySearch: '  FIND\t this  title  ' };
    const path = values => `/directory?${new URLSearchParams(values)}`;
    page = await html(path(view));
    assert.deepEqual(titles(page), ['Find  THIS\t title']);
    assert.match(page, /name="directorySearch" value="FIND\t this  title"/);
    assert.match(page, /name="dueFrom" value="2000-02-29"/);
    assert.match(page, /name="dueThrough" value="2000-02-29"/);
    const forms = [...page.matchAll(/<form\b[\s\S]*?<\/form>/g)].map(match => match[0]);
    const search = forms.find(form => form.includes('id="directory-search"'));
    assert.match(search, /name="scope" value="Active"/);
    assert.match(search, /name="filter" value="Completed"/);
    assert.match(search, /name="priorityFilter" value="High"/);
    assert.match(search, /name="dueFrom" value="2000-02-29"/);
    for (const query of ['First owner', '雪', 'script']) {
      assert.deepEqual(titles(await html(path({ directorySearch: query }))), []);
    }
    assert.deepEqual(titles(await html(path({ filter: 'Deleted' }))), ['Find this title deleted']);
    assert.deepEqual(titles(await html(path({ filter: 'Open' }))), ['Legacy title', 'Later', 'Find this title second']);
    assert.deepEqual(titles(await html(path({ priorityFilter: 'High', dueFrom: '2000-03-01' }))), ['Find this title second']);
    assert.deepEqual(titles(await html(path({ dueThrough: '2000-02-29' }))), ['Find  THIS\t title']);
    assert.deepEqual(titles(await html(path({ ...view, scope: 'Archived' }))), ['Find\tthis  title archive']);
    assert.deepEqual(titles(await html(path({ scope: 'Archived', filter: 'Deleted' }))), ['Reserved deleted']);
    const valid = await post('/directory/due-range', { ...view, dueFrom: ' 2000-02-29 ', dueThrough: ' 2000-02-29 ' });
    assert.equal(valid.status, 303);
    const location = valid.headers.get('location');
    assert.deepEqual(titles(await html(location)), ['Find  THIS\t title']);
    const applied = { ...view, appliedDueFrom: '2000-02-29', appliedDueThrough: '2000-02-29' };
    for (const [from, through, message] of [
      ['1900-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['0000-01-01', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2000-03-01', '2000-02-29', 'Due from must not be after Due through'],
    ]) {
      const response = await post('/directory/due-range', { ...applied, dueFrom: from, dueThrough: through });
      assert.equal(response.status, 400);
      page = await response.text();
      assert.ok(page.includes(`role="alert" class="alert">${message}`));
      assert.deepEqual(titles(page), ['Find  THIS\t title']);
      assert.match(page, /name="appliedDueFrom" value="2000-02-29"/);
      assert.match(page, /name="directorySearch" value="FIND\t this  title"/);
      assert.match(page, /<option selected>Completed/);
      assert.match(page, /<option selected>High/);
    }
    page = await html(path({ scope: 'Archived' }));
    assert.match(page, /action="\/projects\/3"/);
    const project = await html('/projects/3');
    assert.match(project, /Archived project/);
    assert.match(project, /<option selected>All/);
    assert.match(project, /id="task-search"[^>]*value=""/);
    assert.match(project, /id="due-from"[^>]*value=""/);
    assert.match(project, /<button type="submit" disabled>Save notes/);
    assert.match(page, /action="\/"><button class="secondary">Projects/);
    assert.match(await html('/'), /id="project-search"[^>]*value=""/);
    assert.deepEqual(snapshot(), before);
    await server.stop();
    server = await startServer(dbPath);
    assert.deepEqual(snapshot(), before);
    assert.deepEqual(titles(await html('/directory')), ['Legacy title', 'Find  THIS\t title', 'Later', 'Find this title second']);
    assert.deepEqual(titles(await html(path({ scope: 'Archived', filter: 'Deleted' }))), ['Reserved deleted']);
    assert.deepEqual(await (await fetch(`${server.base}/health`)).json(), { status: 'ok' });
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('directory ordering is stable across owners and view actions without changing stored positions', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'directory-order-test-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(dbPath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const titles = page => [...page.matchAll(/data-testid="directory-task-title">([^<]*)/g)].map(match => match[1]);
    const path = values => `/directory?${new URLSearchParams(values)}`;
    const task = (title, priority = 'Normal', dueDate = '', deleted = false) => ({
      title, priority, dueDate, deleted, completed: false, notes: ' literal notes\n雪 ',
    });
    const first = [task('Zulu', 'Low'), task('Alpha', 'High', '2026-02-01'),
      task('a  b', 'Normal', '2026-01-01'), task('\u{10000}', 'Normal'),
      task('Deleted Z', 'Low', '', true), task('Deleted A', 'High', '2026-01-01', true)];
    const second = [task('ALPHA', 'High', '2026-02-01'), task('a b', 'Low', '0001-01-01'),
      task('\ue000', 'Normal'), task('Ä', 'Normal'), task('ä', 'Normal')];
    for (const [name, archived, tasks] of [
      ['First', false, first], ['Second', false, second],
      ['Archive', true, [task('Archive Z', 'Low'), task('Archive A', 'High', '9999-12-31'),
        task('Deleted Z', 'Low', '', true), task('Deleted A', 'High', '0001-01-01', true)]],
    ]) {
      const response = await post('/projects/import', { name, json: JSON.stringify({
        format: 'workboard-project', version: 1,
        project: { name, archived, defaultPriority: 'Normal', tasks },
      }) });
      assert.equal(response.status, 303);
    }
    const snapshot = () => {
      const database = new DatabaseSync(dbPath);
      try {
        return ['projects', 'tasks', 'task_positions'].map(table =>
          database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(row => ({ ...row })));
      } finally { database.close(); }
    };
    const exportProject = async id => (await fetch(`${server.base}/projects/${id}/export`)).json();
    const original = ['Zulu', 'Alpha', 'a  b', '\u{10000}', 'ALPHA', 'a b', '\ue000', 'Ä', 'ä'];
    const before = snapshot();
    const exports = await Promise.all([exportProject(1), exportProject(2)]);
    const projectPage = await html('/projects/1');
    let page = await html('/directory');
    assert.match(page, /<label for="directory-order">Directory order<\/label>/);
    const select = /<select id="directory-order"[\s\S]*?<\/select>/.exec(page)[0];
    assert.deepEqual([...select.matchAll(/<option(?: selected)?>([^<]*)/g)].map(match => match[1]),
      ['Original', 'Priority', 'Due date', 'Title']);
    assert.match(select, /<option selected>Original/);
    assert.deepEqual(titles(page), original);
    assert.deepEqual(titles(await html(path({ order: 'invalid' }))), original);
    assert.deepEqual(titles(await html(path({ order: 'Priority' }))),
      ['Alpha', 'ALPHA', 'a  b', '\u{10000}', '\ue000', 'Ä', 'ä', 'Zulu', 'a b']);
    assert.deepEqual(titles(await html(path({ order: 'Due date' }))),
      ['a b', 'a  b', 'Alpha', 'ALPHA', 'Zulu', '\u{10000}', '\ue000', 'Ä', 'ä']);
    assert.deepEqual(titles(await html(path({ order: 'Title' }))),
      ['a  b', 'a b', 'Alpha', 'ALPHA', 'Zulu', 'Ä', 'ä', '\ue000', '\u{10000}']);
    for (const order of ['Priority', 'Due date', 'Title']) {
      assert.deepEqual(titles(await html(path({ order, filter: 'Deleted' }))), ['Deleted A', 'Deleted Z']);
      assert.deepEqual(titles(await html(path({ order, scope: 'Archived' }))), ['Archive A', 'Archive Z']);
      assert.deepEqual(titles(await html(path({ order, scope: 'Archived', filter: 'Deleted' }))), ['Deleted A', 'Deleted Z']);
    }
    const view = { scope: 'Active', filter: 'Open', priorityFilter: 'High', order: 'Title',
      dueFrom: '2026-02-01', dueThrough: '2026-02-01', directorySearch: 'alpha' };
    page = await html(path(view));
    assert.deepEqual(titles(page), ['Alpha', 'ALPHA']);
    const forms = [...page.matchAll(/<form\b[\s\S]*?<\/form>/g)].map(match => match[0]);
    const filters = forms.find(form => form.includes('id="directory-order"'));
    assert.match(filters, /<option selected>Active/);
    assert.match(filters, /<option selected>Open/);
    assert.match(filters, /<option selected>High/);
    for (const [key, value] of Object.entries(view).filter(([key]) => ['dueFrom', 'dueThrough', 'directorySearch'].includes(key))) {
      assert.ok(filters.includes(`name="${key}" value="${value}"`));
    }
    for (const form of forms.filter(form => /directory-search|directory\/due-range|directory\/completion/.test(form))) {
      for (const [key, value] of Object.entries(view).filter(([key]) => !['dueFrom', 'dueThrough', 'directorySearch'].includes(key))) {
        assert.ok(form.includes(`name="${key}" value="${value}"`));
      }
    }
    const applied = await post('/directory/due-range', view);
    assert.equal(applied.status, 303);
    assert.equal(new URL(applied.headers.get('location'), server.base).searchParams.get('order'), 'Title');
    const invalid = await post('/directory/due-range', { ...view, appliedDueFrom: view.dueFrom,
      appliedDueThrough: view.dueThrough, dueFrom: '2026-02-30' });
    assert.equal(invalid.status, 400);
    page = await invalid.text();
    assert.match(page, /<option selected>Title/);
    assert.deepEqual(titles(page), ['Alpha', 'ALPHA']);
    assert.deepEqual(snapshot(), before);
    assert.deepEqual(await Promise.all([exportProject(1), exportProject(2)]), exports);
    assert.equal(await html('/projects/1'), projectPage);
    const completed = await post('/directory/completion', { ...view, completed: '1' });
    assert.equal(completed.status, 303);
    const location = completed.headers.get('location');
    for (const [key, value] of Object.entries(view)) {
      assert.equal(new URL(location, server.base).searchParams.get(key), value);
    }
    page = await html(location);
    assert.match(page, /<option selected>Title/);
    assert.match(page, /No matching tasks/);
    assert.deepEqual(titles(page), []);
    assert.deepEqual(titles(await html(path({ ...view, filter: 'Completed' }))), ['Alpha', 'ALPHA']);
    const after = snapshot();
    assert.deepEqual(after[0], before[0]);
    assert.deepEqual(after[2], before[2]);
    assert.deepEqual(after[1].map(({ completed, ...fields }) => fields),
      before[1].map(({ completed, ...fields }) => fields));
    await post('/projects/1/tasks/2/move', { destinationProject: '2' });
    await post('/projects/2/tasks/2/move', { destinationProject: '1' });
    assert.deepEqual(titles(await html('/directory')), original);
    const afterMoves = snapshot();
    assert.deepEqual(afterMoves.slice(0, 2), after.slice(0, 2));
    assert.deepEqual(afterMoves[2], [...after[2], { task_id: 2, project_id: 2, position: 6 }]);
    await server.stop();
    server = await startServer(dbPath);
    assert.deepEqual(snapshot(), afterMoves);
    assert.deepEqual(titles(await html('/directory')), original);
    assert.match(await html('/directory'), /<option selected>Original/);
    assert.deepEqual(titles(await html(path({ ...view, filter: 'Completed' }))), ['Alpha', 'ALPHA']);
    const reopened = await post('/directory/completion', { ...view, filter: 'Completed', completed: '0' });
    assert.equal(new URL(reopened.headers.get('location'), server.base).searchParams.get('order'), 'Title');
    assert.match(await html(reopened.headers.get('location')), /No matching tasks/);
    assert.deepEqual(titles(await html(path(view))), ['Alpha', 'ALPHA']);
    assert.deepEqual(await (await fetch(`${server.base}/health`)).json(), { status: 'ok' });
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('directory owner totals follow matching results by identity and creation order', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'directory-owner-test-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(dbPath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const path = values => `/directory?${new URLSearchParams(values)}`;
    const task = (title, completed, priority = 'High', dueDate = '2026-01-01', deleted = false) =>
      ({ title, completed, priority, dueDate, deleted, notes: 'literal notes' });
    for (const [name, archived, tasks] of [
      ['Same  雪 <owner>', false, [task('Zulu match', true), task('Zulu open match', false),
        task('Other', true, 'Low', ''), task('Deleted match', true, 'High', '2026-01-01', true)]],
      ['Same  雪 <owner>', false, [task('Alpha match', false), task('Alpha complete match', true),
        task('Deleted match', false, 'High', '2026-01-01', true)]],
      ['Renamed later', false, [task('Middle match', false, 'Normal', '')]],
      ['Archive', true, [task('Archive match', true), task('Archive open', false),
        task('Archive deleted', true, 'Low', '', true)]],
      ['Empty', false, []],
    ]) {
      const response = await post('/projects/import', { name, json: JSON.stringify({
        format: 'workboard-project', version: 1,
        project: { name, archived, defaultPriority: 'Normal', tasks },
      }) });
      assert.equal(response.status, 303);
    }
    await post('/projects/3/rename', { name: ' Same  雪 <owner> ' });
    const snapshot = () => {
      const database = new DatabaseSync(dbPath);
      try {
        return ['projects', 'tasks', 'task_positions'].map(table =>
          database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(row => ({ ...row })));
      } finally { database.close(); }
    };
    const ownerRows = page => [...page.matchAll(/<div data-testid="directory-owner-row"[\s\S]*?<\/form>\s*<\/div>/g)]
      .map(([row]) => ({
        id: Number(/action="\/projects\/(\d+)"/.exec(row)[1]),
        name: /data-testid="directory-owner-name">([^<]*)/.exec(row)[1],
        summary: /data-testid="directory-owner-summary">([^<]*)/.exec(row)[1],
      }));
    const check = (page, expected) => {
      const rows = ownerRows(page);
      assert.deepEqual(rows.map(({ id, summary }) => [id, summary]), expected);
      const totals = rows.reduce((sum, row) => {
        const [, completed, total] = /^(\d+)\/(\d+) completed$/.exec(row.summary);
        return [sum[0] + Number(completed), sum[1] + Number(total)];
      }, [0, 0]);
      assert.match(page, new RegExp(`data-testid="directory-summary">${totals[0]}/${totals[1]} completed`));
      assert.equal((page.match(/data-testid="directory-task-row"/g) ?? []).length, totals[1]);
      assert.equal(page.includes('role="status">No matching tasks'), totals[1] === 0);
      return rows;
    };
    const before = snapshot();
    const original = [[1, '2/3 completed'], [2, '1/2 completed'], [3, '0/1 completed']];
    let page = await html('/directory');
    const rows = check(page, original);
    assert.deepEqual(rows.map(row => row.name), Array(3).fill('Same  雪 &lt;owner&gt;'));
    for (const order of ['Original', 'Priority', 'Due date', 'Title']) {
      check(await html(path({ order })), original);
    }
    page = await html(path({ order: 'Title' }));
    assert.match(page, /directory-task-title">Alpha complete match/);
    check(await html(path({ filter: 'Open' })), [[1, '0/1 completed'], [2, '0/1 completed'], [3, '0/1 completed']]);
    check(await html(path({ filter: 'Completed' })), [[1, '2/2 completed'], [2, '1/1 completed']]);
    check(await html(path({ filter: 'Deleted', order: 'Title' })), [[1, '1/1 completed'], [2, '0/1 completed']]);
    check(await html(path({ priorityFilter: 'Low' })), [[1, '1/1 completed']]);
    const view = { scope: 'Active', filter: 'Open', priorityFilter: 'High', order: 'Title',
      dueFrom: '2026-01-01', dueThrough: '2026-01-01', directorySearch: '  MATCH  ' };
    check(await html(path(view)), [[1, '0/1 completed'], [2, '0/1 completed']]);
    const range = await post('/directory/due-range', view);
    check(await html(range.headers.get('location')), [[1, '0/1 completed'], [2, '0/1 completed']]);
    const invalid = await post('/directory/due-range', { ...view, appliedDueFrom: view.dueFrom,
      appliedDueThrough: view.dueThrough, dueFrom: '2026-02-30' });
    assert.equal(invalid.status, 400);
    check(await invalid.text(), [[1, '0/1 completed'], [2, '0/1 completed']]);
    check(await html(path({ directorySearch: 'no match' })), []);
    check(await html(path({ scope: 'Archived', order: 'Priority' })), [[4, '1/2 completed']]);
    check(await html(path({ scope: 'Archived', filter: 'Deleted' })), [[4, '1/1 completed']]);
    const archived = await html('/projects/4');
    assert.match(archived, /Archived project/);
    assert.match(archived, /<option selected>All/);
    for (const id of [1, 2, 3]) {
      const project = await html(`/projects/${id}`);
      assert.match(project, /id="task-search"[^>]*value=""/);
      assert.match(project, /id="due-from"[^>]*value=""/);
      assert.match(project, /<option selected>All/);
    }
    assert.deepEqual(snapshot(), before);
    const completed = await post('/directory/completion', { ...view, completed: '1' });
    page = await html(completed.headers.get('location'));
    check(page, []);
    assert.match(page, /<option selected>Title/);
    check(await html(path({ ...view, filter: 'Completed' })), [[1, '2/2 completed'], [2, '2/2 completed']]);
    const saved = snapshot();
    await server.stop();
    server = await startServer(dbPath);
    assert.deepEqual(snapshot(), saved);
    check(await html('/directory'), [[1, '3/3 completed'], [2, '2/2 completed'], [3, '0/1 completed']]);
    check(await html(path({ ...view, filter: 'Completed' })), [[1, '2/2 completed'], [2, '2/2 completed']]);
    const reopened = await post('/directory/completion', { ...view, filter: 'Completed', completed: '0' });
    check(await html(reopened.headers.get('location')), []);
    check(await html(path(view)), [[1, '0/2 completed'], [2, '0/2 completed']]);
    assert.deepEqual(await (await fetch(`${server.base}/health`)).json(), { status: 'ok' });
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
