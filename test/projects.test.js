import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const base = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Server exited: ${code}`)));
  });
  return { child, base };
}

async function stop(child) {
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await exited;
}

test('project priority defaults migrate, affect only future tasks and persist independently', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-defaults-'));
  const dbPath = join(directory, 'workboard.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
    INSERT INTO projects (name) VALUES ('Existing');
    INSERT INTO tasks (project_id, title, completed, priority) VALUES (1, 'Existing task', 1, 'Low');
  `);
  db.close();
  let running;
  try {
    running = await start(dbPath);
    let base = running.base;
    const post = (path, values = {}) => fetch(`${base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = path => fetch(`${base}${path}`).then(response => response.text());
    const defaultSelect = text => text.match(/<select id="default-task-priority"[\s\S]*?<\/select>/)[0];
    const rows = text => [...text.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    const options = priority => ['Low', 'Normal', 'High'].map(value =>
      `<option${value === priority ? ' selected' : ''}>${value}</option>`).join('');
    await post('/projects', { name: 'Other' });
    for (const id of [1, 2]) {
      const text = await html(`/projects/${id}`);
      assert.match(text, /<label for="default-task-priority">Default task priority<\/label>/);
      assert.ok(defaultSelect(text).includes(options('Normal')));
    }
    await post('/projects/1/tasks', { title: 'Normal task' });
    const selection = { filter: 'Completed', priorityFilter: 'Low' };
    const path = '/projects/1?filter=Completed&priorityFilter=Low';
    const existingRows = rows(await html('/projects/1'));
    const visibleRows = rows(await html(path));
    const summary = await html('/');
    const other = await html('/projects/2');
    for (const priority of ['Low', 'Normal', 'High']) {
      const response = await post('/projects/1/default-priority', { ...selection, priority });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), path);
      const text = await html(path);
      assert.ok(defaultSelect(text).includes(options(priority)));
      assert.deepEqual(rows(text), visibleRows);
      assert.deepEqual(rows(await html('/projects/1')), existingRows);
      assert.equal(await html('/'), summary);
      assert.equal(await html('/projects/2'), other);
      assert.match(text, /<option selected>Completed<\/option>/);
    }
    assert.equal((await post('/projects/1/default-priority', { priority: 'Urgent' })).status, 400);
    assert.equal((await post('/projects/999/default-priority', { priority: 'Low' })).status, 404);
    await post('/projects/1/tasks', { title: 'High task' });
    await post('/projects/2/tasks', { title: 'Other normal task' });
    assert.ok(rows(await html('/projects/1'))[2].includes(options('High')));
    assert.ok(rows(await html('/projects/2'))[0].includes(options('Normal')));
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Low task' });
    await post('/projects/1/rename', { name: 'Renamed project' });
    await post('/projects/1/tasks/3/rename', { title: 'Renamed high task' });
    const saved = await html('/projects/1');
    assert.ok(defaultSelect(saved).includes(options('Low')));
    assert.ok(rows(saved)[2].includes(options('High')));
    assert.ok(rows(saved)[3].includes(options('Low')));
    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    assert.match(defaultSelect(archived), /name="priority" disabled/);
    assert.ok(defaultSelect(archived).includes(options('Low')));
    assert.equal((await post('/projects/1/default-priority', { priority: 'High' })).status, 403);
    assert.equal(await html('/projects/1'), archived);
    await stop(running.child);
    running = undefined;
    running = await start(dbPath);
    base = running.base;
    assert.equal(await html('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), saved);
    await post('/projects/1/tasks', { title: 'After restart' });
    assert.ok(rows(await html('/projects/1'))[4].includes(options('Low')));
    assert.match(await html('/'), /1\/5 completed/);
  } finally {
    if (running) await stop(running.child);
    await rm(directory, { recursive: true, force: true });
  }
});

test('combined filters preserve selections, re-evaluate edits and work when archived', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-filters-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let running;
  try {
    running = await start(dbPath);
    let base = running.base;
    const post = (path, values = {}) => fetch(`${base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = path => fetch(`${base}${path}`).then(response => response.text());
    const titles = text => [...text.matchAll(/<span class="task-title">([^<]*)<\/span>/g)].map(match => match[1]);
    await post('/projects', { name: 'Filters' });
    const tasks = [];
    for (const priority of ['Low', 'Normal', 'High']) {
      for (const completed of [false, true]) {
        const id = tasks.length + 1;
        const title = `${priority} ${completed ? 'done' : 'open'}`;
        await post('/projects/1/tasks', { title });
        await post(`/projects/1/tasks/${id}/priority`, { priority });
        if (completed) await post(`/projects/1/tasks/${id}/completion`, { completed: '1' });
        tasks.push({ title, priority, completed });
      }
    }
    const summary = await html('/');
    for (const filter of ['All', 'Open', 'Completed']) {
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        const text = await html(`/projects/1?filter=${filter}&priorityFilter=${priority}`);
        assert.deepEqual(titles(text), tasks.filter(task =>
          (filter === 'All' || task.completed === (filter === 'Completed')) &&
          (priority === 'All' || task.priority === priority)).map(task => task.title));
        const filterForm = text.match(/<form class="filter-form"[\s\S]*?<\/form>/)[0];
        assert.match(filterForm, /<label for="priority-filter">Priority filter<\/label>/);
        assert.ok(filterForm.includes(['All', 'Low', 'Normal', 'High'].map(value =>
          `<option${value === priority ? ' selected' : ''}>${value}</option>`).join('')));
        assert.ok(filterForm.includes(`<option selected>${filter}</option>`));
        assert.match(filterForm, /onchange="this.form.requestSubmit\(\)"/);
        for (const form of text.matchAll(/<form[^>]*method="post"[\s\S]*?<\/form>/g)) {
          assert.ok(form[0].includes(`name="filter" value="${filter}"`));
          assert.ok(form[0].includes(`name="priorityFilter" value="${priority}"`));
        }
      }
    }
    assert.equal(await html('/'), summary);
    const selection = { filter: 'Open', priorityFilter: 'High' };
    const path = '/projects/1?filter=Open&priorityFilter=High';
    let response = await post('/projects/1/tasks/5/rename', { ...selection, title: '  Renamed  ' });
    assert.equal(response.headers.get('location'), path);
    assert.deepEqual(titles(await html(path)), ['Renamed']);
    assert.match(await html(path), /aria-label="Complete Renamed"/);
    assert.equal(await html('/'), summary);
    response = await post('/projects/1/tasks/5/rename', { ...selection, title: '  ' });
    assert.equal(response.status, 400);
    const error = await response.text();
    assert.match(error, /Task title is required/);
    assert.match(error, /<option selected>Open<\/option>/);
    assert.match(error, /<option selected>High<\/option>/);
    response = await post('/projects/1/tasks/5/priority', { ...selection, priority: 'Low' });
    assert.equal(response.headers.get('location'), path);
    assert.deepEqual(titles(await html(path)), []);
    assert.equal(await html('/'), summary);
    await post('/projects/1/tasks/5/priority', { ...selection, priority: 'High' });
    response = await post('/projects/1/tasks/5/completion', { ...selection, completed: '1' });
    assert.equal(response.headers.get('location'), path);
    assert.deepEqual(titles(await html(path)), []);
    assert.deepEqual(titles(await html('/projects/1?filter=Completed&priorityFilter=High')), ['Renamed', 'High done']);
    const saved = await html('/projects/1?filter=Completed&priorityFilter=High');
    await stop(running.child);
    running = undefined;
    running = await start(dbPath);
    base = running.base;
    assert.equal(await html('/projects/1?filter=Completed&priorityFilter=High'), saved);
    await post('/projects/1/archive');
    const archived = await html('/projects/1?filter=Completed&priorityFilter=High');
    assert.deepEqual(titles(archived), ['Renamed', 'High done']);
    const filterForm = archived.match(/<form class="filter-form"[\s\S]*?<\/form>/)[0];
    assert.ok(!filterForm.includes('disabled'));
    for (const row of archived.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)) {
      assert.match(row[1], /name="completed"[\s\S]*? disabled/);
      assert.match(row[1], /name="priority" disabled/);
      assert.match(row[1], /name="title"[^>]* disabled/);
      assert.match(row[1], /<button type="submit" disabled>Rename task/);
    }
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1?filter=Completed&priorityFilter=High'), saved);
    const initial = await html('/projects/1');
    assert.match(initial, /id="priority-filter"[^>]*>\s*<option selected>All<\/option>/);
  } finally {
    if (running) await stop(running.child);
    await rm(directory, { recursive: true, force: true });
  }
});

test('priorities migrate, remain independent and persist through rename and archive', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  const dbPath = join(directory, 'workboard.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Existing'), ('Other');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Done', 1), (1, 'Pending', 0), (2, 'Other task', 0);
  `);
  db.close();
  let running;
  try {
    running = await start(dbPath);
    let base = running.base;
    const post = (path, values = {}) => fetch(`${base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = path => fetch(`${base}${path}`).then(response => response.text());
    const rows = text => [...text.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    const options = priority => ['Low', 'Normal', 'High'].map(value =>
      `<option${value === priority ? ' selected' : ''}>${value}</option>`).join('');
    for (const row of rows(await html('/projects/1'))) {
      assert.match(row, /<label for="task-priority-\d+">Task priority<\/label>/);
      assert.ok(row.includes(options('Normal')));
    }
    await post('/projects/1/tasks', { title: 'New' });
    assert.ok(rows(await html('/projects/1'))[2].includes(options('Normal')));
    const summary = await html('/');
    const other = await html('/projects/2');
    for (const priority of ['High', 'Low', 'Normal', 'High']) {
      const response = await post('/projects/1/tasks/1/priority', { priority, filter: 'Completed' });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/projects/1?filter=Completed');
      const tasks = rows(await html('/projects/1'));
      assert.ok(tasks[0].includes(options(priority)));
      assert.match(tasks[0], /aria-label="Complete Done" checked/);
      assert.ok(tasks[1].includes(options('Normal')));
      assert.ok(tasks[2].includes(options('Normal')));
      assert.equal(rows(await html('/projects/1?filter=Completed')).length, 1);
      assert.equal(rows(await html('/projects/1?filter=Open')).length, 2);
      assert.equal(await html('/'), summary);
      assert.equal(await html('/projects/2'), other);
    }
    await post('/projects/1/tasks/2/priority', { priority: 'Low' });
    await post('/projects/1/tasks/1/rename', { title: 'Renamed' });
    let tasks = rows(await html('/projects/1'));
    assert.match(tasks[0], /aria-label="Complete Renamed" checked/);
    assert.ok(tasks[0].includes(options('High')));
    assert.ok(tasks[1].includes(options('Low')));
    const detail = await html('/projects/1');
    assert.equal((await post('/projects/2/tasks/1/priority', { priority: 'Low' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/priority', { priority: 'Low' })).status, 404);
    for (const priority of ['', 'Urgent', 'high']) {
      assert.equal((await post('/projects/1/tasks/1/priority', { priority })).status, 400);
    }
    assert.equal(await html('/projects/1'), detail);
    await stop(running.child);
    running = undefined;
    running = await start(dbPath);
    base = running.base;
    assert.equal(await html('/projects/1'), detail);
    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    for (const row of rows(archived)) {
      assert.match(row, /<select id="task-priority-\d+" name="priority" disabled/);
    }
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Low' })).status, 403);
    assert.equal(await html('/projects/1'), archived);
    await stop(running.child);
    running = undefined;
    running = await start(dbPath);
    base = running.base;
    assert.equal(await html('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), detail);
    assert.equal(await html('/'), summary);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Low' })).status, 303);
    assert.ok(rows(await html('/projects/1'))[0].includes(options('Low')));
  } finally {
    if (running) await stop(running.child);
    await rm(directory, { recursive: true, force: true });
  }
});

test('task renaming preserves ownership, order, completion, filters and persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let running;
  try {
    running = await start(dbPath);
    let base = running.base;
    const post = (path, values = {}) => fetch(`${base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = path => fetch(`${base}${path}`).then(response => response.text());
    const rows = text => [...text.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Original' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/2/tasks', { title: 'Other' });
    await post('/projects/1/tasks/1/completion', { completed: '1' });
    const original = await html('/projects/1');
    for (const row of rows(original)) {
      assert.match(row, /<label for="new-task-title-\d+">New task title<\/label>/);
      assert.match(row, />Rename task<\/button>/);
    }
    for (const title of ['', '   \t ']) {
      const response = await post('/projects/1/tasks/1/rename', { title, filter: 'Completed' });
      assert.equal(response.status, 400);
      const invalid = await response.text();
      assert.match(invalid, /role="alert">Task title is required/);
      assert.equal(rows(invalid).length, 1);
      assert.equal(await html('/projects/1'), original);
    }
    assert.equal((await post('/projects/2/tasks/1/rename', { title: 'Wrong owner' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/rename', { title: 'Missing' })).status, 404);
    const summary = await html('/');
    const other = await html('/projects/2');
    const response = await post('/projects/1/tasks/1/rename', { title: '  New <title> & café  ', filter: 'Completed' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1?filter=Completed');
    const detail = await html('/projects/1');
    const renamedRows = rows(detail);
    assert.equal(renamedRows.length, 2);
    assert.match(renamedRows[0], /aria-label="Complete New &lt;title&gt; &amp; café" checked/);
    assert.match(renamedRows[0], />New &lt;title&gt; &amp; café<\/span>/);
    assert.match(renamedRows[0], /action="\/projects\/1\/tasks\/1\/rename"/);
    assert.match(renamedRows[1], />Pending<\/span>/);
    assert.doesNotMatch(detail, /Complete Original/);
    assert.equal(rows(await html('/projects/1?filter=Completed')).length, 1);
    assert.match(rows(await html('/projects/1?filter=Open'))[0], /Complete Pending/);
    assert.equal(await html('/'), summary);
    assert.equal(await html('/projects/2'), other);
    await stop(running.child);
    running = undefined;
    running = await start(dbPath);
    base = running.base;
    assert.equal(await html('/projects/1'), detail);
    assert.equal(await html('/'), summary);
    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    for (const row of rows(archived)) {
      assert.match(row, /id="new-task-title-\d+"[^>]* disabled/);
      assert.match(row, /<button type="submit" disabled>Rename task<\/button>/);
    }
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Forbidden' })).status, 403);
    assert.equal(await html('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), detail);
    assert.equal((await post('/projects/1/tasks/2/rename', { title: '  Renamed open  ', filter: 'Open' })).status, 303);
    const openRow = rows(await html('/projects/1?filter=Open'))[0];
    assert.match(openRow, /aria-label="Complete Renamed open"/);
    assert.doesNotMatch(openRow, / checked| disabled/);
    assert.equal(await html('/'), summary);
  } finally {
    if (running) await stop(running.child);
    await rm(directory, { recursive: true, force: true });
  }
});

test('rename preserves identity, ordering, tasks and persistence and rejects archived edits', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let running;
  try {
    running = await start(dbPath);
    let base = running.base;
    const post = (path, values = {}) => fetch(`${base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = path => fetch(`${base}${path}`).then(response => response.text());
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1/completion', { completed: '1' });
    const original = await html('/projects/1');
    assert.match(original, /<label for="new-project-name">New project name<\/label>/);
    assert.match(original, />Rename project<\/button>/);
    for (const name of ['', '   \t ']) {
      const response = await post('/projects/1/rename', { name });
      assert.equal(response.status, 400);
      assert.match(await response.text(), /role="alert">Project name is required/);
      assert.equal(await html('/projects/1'), original);
    }
    const renamed = await post('/projects/1/rename', { name: '  Renamed <one> & café  ', filter: 'Open' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Open');
    const detail = await html('/projects/1');
    assert.match(detail, /<h1>Renamed &lt;one&gt; &amp; café<\/h1>/);
    assert.match(detail, /aria-label="Complete Done" checked/);
    assert.match(detail, /aria-label="Complete Pending"\s/);
    assert.equal((detail.match(/data-testid="task-row"/g) || []).length, 2);
    const listing = await html('/');
    assert.ok(listing.indexOf('Renamed &lt;one&gt;') < listing.indexOf('Second'));
    assert.match(listing, /data-testid="project-summary">1\/2 completed/);
    assert.match(listing, /action="\/projects\/1"/);
    await stop(running.child);
    running = undefined;
    running = await start(dbPath);
    base = running.base;
    assert.equal(await html('/projects/1'), detail);
    assert.equal(await html('/'), listing);
    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    assert.match(archived, /id="new-project-name"[^>]* disabled/);
    assert.match(archived, /<button type="submit" disabled>Rename project<\/button>/);
    assert.equal((await post('/projects/1/rename', { name: 'Forbidden' })).status, 403);
    assert.equal(await html('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), detail);
    assert.equal((await post('/projects/1/rename', { name: 'Restored name' })).status, 303);
    assert.match(await html('/projects/1'), /<h1>Restored name<\/h1>/);
    assert.match(await html('/'), /1\/2 completed/);
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
  } finally {
    if (running) await stop(running.child);
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive migration, summaries, read-only tasks and restore persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const dbPath = join(directory, 'workboard.sqlite');
  // Seed the previous schema to exercise upgrading a populated database.
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Existing');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Done', 1), (1, 'Pending', 0);
  `);
  db.close();
  let running;
  try {
    running = await start(dbPath);
    let base = running.base;
    const post = (path, values = {}) => fetch(`${base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = path => fetch(`${base}${path}`).then(response => response.text());
    const rows = text => [...text.matchAll(/<li data-testid="project-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    let active = await html('/');
    assert.match(active, /<label for="project-filter">Project filter<\/label>/);
    assert.match(active, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(rows(active)[0], /data-testid="project-summary">1\/2 completed/);
    assert.match(rows(active)[0], />Archive project<\/button>/);
    await post('/projects', { name: 'New' });
    assert.match(rows(await html('/'))[1], /data-testid="project-summary">0\/0 completed/);
    assert.equal((await post('/projects/1/archive')).status, 303);
    assert.equal(rows(await html('/')).length, 1);
    const archived = await html('/?filter=Archived');
    assert.equal(rows(archived).length, 1);
    assert.match(rows(archived)[0], />Open project<\/button>/);
    assert.match(rows(archived)[0], />Restore project<\/button>/);
    assert.match(rows(archived)[0], /1\/2 completed/);
    const detail = await html('/projects/1');
    assert.match(detail, /<p>Archived project<\/p>/);
    assert.match(detail, /<button type="submit" disabled>Create task<\/button>/);
    assert.equal((detail.match(/data-testid="task-row"/g) || []).length, 2);
    assert.match(detail, /aria-label="Complete Done" checked disabled/);
    assert.match(detail, /aria-label="Complete Pending" disabled/);
    assert.equal(((await html('/projects/1?filter=Open')).match(/data-testid="task-row"/g) || []).length, 1);
    assert.match(await html('/projects/1?filter=Completed'), /Complete Done/);
    assert.equal((await post('/projects/1/tasks', { title: 'Forbidden' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1/completion')).status, 403);
    assert.equal(await html('/projects/1'), detail);
    await stop(running.child);
    running = undefined;
    running = await start(dbPath);
    base = running.base;
    assert.equal(await html('/?filter=Archived'), archived);
    assert.equal(await html('/projects/1'), detail);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.equal(rows(await html('/?filter=Archived')).length, 0);
    active = await html('/');
    assert.equal(rows(active).length, 2);
    assert.match(rows(active)[0], /Existing/);
    assert.match(rows(active)[0], /1\/2 completed/);
    assert.doesNotMatch(await html('/projects/1'), / disabled|Archived project/);
    await post('/projects/1/tasks/2/completion', { completed: '1', filter: 'Open' });
    assert.match(rows(await html('/'))[0], /2\/2 completed/);
    await stop(running.child);
    running = undefined;
    running = await start(dbPath);
    base = running.base;
    assert.match(rows(await html('/'))[0], /2\/2 completed/);
    assert.doesNotMatch(await html('/projects/1'), / disabled|Archived project/);
    assert.equal((await post('/projects/999/archive')).status, 404);
  } finally {
    if (running) await stop(running.child);
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, stay project-scoped and persist completion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let running;
  try {
    running = await start(dbPath);
    let base = running.base;
    const post = (path, values) => fetch(`${base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const detail = (id, filter = 'All') => fetch(`${base}/projects/${id}?filter=${filter}`).then(r => r.text());
    const rows = html => [...html.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)].map(m => m[1]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const initial = await detail(1);
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, />Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', '   \t ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      assert.match(await response.text(), /role="alert">Task title is required/);
      assert.equal(rows(await detail(1)).length, 0);
    }
    assert.equal((await post('/projects/1/tasks', { title: '  One & <two>  ' })).status, 303);
    await post('/projects/1/tasks', { title: 'Next' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    let tasks = rows(await detail(1));
    assert.equal(tasks.length, 2);
    assert.match(tasks[0], /aria-label="Complete One &amp; &lt;two&gt;"/);
    assert.match(tasks[0], />One &amp; &lt;two&gt;<\/span>/);
    assert.match(tasks[1], />Next<\/span>/);
    assert.doesNotMatch(tasks.join(''), / checked|Other project task/);
    assert.equal(rows(await detail(1, 'Open')).length, 2);
    assert.equal(rows(await detail(1, 'Completed')).length, 0);
    assert.equal((await post('/projects/2/tasks/1/completion', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1/completion', { completed: '1' })).status, 303);
    assert.match(rows(await detail(1))[0], / checked/);
    assert.match(rows(await detail(1, 'Open'))[0], />Next<\/span>/);
    assert.equal(rows(await detail(1, 'Open')).length, 1);
    assert.equal(rows(await detail(1, 'Completed')).length, 1);
    assert.match(rows(await detail(2))[0], /Other project task/);
    const beforeRestart = await detail(1);
    await stop(running.child);
    running = undefined;
    running = await start(dbPath);
    base = running.base;
    assert.equal(await detail(1), beforeRestart);
    assert.equal((await post('/projects/1/tasks/1/completion', {})).status, 303);
    assert.doesNotMatch(rows(await detail(1))[0], / checked/);
    assert.equal(rows(await detail(1, 'Completed')).length, 0);
    assert.equal(rows(await detail(1, 'Open')).length, 2);
    assert.equal((await post('/projects/999/tasks', { title: 'Missing' })).status, 404);
  } finally {
    if (running) await stop(running.child);
    await rm(directory, { recursive: true, force: true });
  }
});

test('projects validate, escape, preserve order and survive server restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let running;
  try {
    running = await start(join(directory, 'projects.sqlite'));
    let { base } = running;
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const initial = await (await fetch(base)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.equal((initial.match(/data-testid="project-row"/g) || []).length, 0);
    const create = name => fetch(`${base}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    for (const name of ['', '   \t  ']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    assert.equal((await create('  First project  ')).status, 303);
    assert.equal((await create('Second <script> & café')).status, 303);
    const listing = await (await fetch(base)).text();
    assert.equal((listing.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(listing, />First project<\/span>/);
    assert.match(listing, /Second &lt;script&gt; &amp; café/);
    assert.ok(listing.indexOf('First project') < listing.indexOf('Second &lt;'));
    const paths = [...listing.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    const detail = await (await fetch(`${base}${paths[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/">.*>Projects<\/button>/);
    assert.equal((await fetch(`${base}/projects/9999`)).status, 404);
    await stop(running.child);
    running = undefined;
    running = await start(join(directory, 'projects.sqlite'));
    base = running.base;
    assert.equal(await (await fetch(base)).text(), listing);
    assert.match(await (await fetch(`${base}${paths[0]}`)).text(), /<h1>First project<\/h1>/);
  } finally {
    if (running) await stop(running.child);
    await rm(directory, { recursive: true, force: true });
  }
});
