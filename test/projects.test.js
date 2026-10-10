import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { once } from 'node:events';

test('priorities migrate, stay independent, preserve task data, and survive restart and archive/restore', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data/test-'));
  let server;
  try {
    const dbPath = resolve(directory, 'priorities.sqlite');
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (name) VALUES ('Alpha'), ('Beta');
      INSERT INTO tasks (project_id, title, completed) VALUES
        (1, 'Finished', 1), (1, 'Pending', 0), (2, 'Other project', 0);`);
    legacy.close();
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const options = priority => ['Low', 'Normal', 'High'].map(value =>
      `<option${value === priority ? ' selected' : ''}>${value}</option>`).join('');
    const selector = (body, id) => {
      const match = body.match(new RegExp(`<select id="task-priority-${id}"[^>]*>(.*?)</select>`));
      assert.ok(match, `Priority selector for task ${id}`);
      return match[1];
    };
    const initial = await html('/projects/1');
    for (const id of [1, 2]) {
      assert.match(initial, new RegExp(`<label for="task-priority-${id}">Task priority</label>`));
      assert.equal(selector(initial, id), options('Normal'));
    }
    assert.equal(selector(await html('/projects/2'), 3), options('Normal'));
    await post('/projects/1/tasks', { title: 'New task' });
    const before = await html('/projects/1');
    assert.equal(selector(before, 4), options('Normal'));
    const summary = await html('/');
    const otherProject = await html('/projects/2');
    for (const priority of ['Low', 'High', 'Normal', 'High']) {
      const response = await post('/projects/1/tasks/1/priority', { priority, filter: 'Completed' });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/projects/1?filter=Completed');
      const saved = await html('/projects/1');
      const selectStart = '<select id="task-priority-1" name="priority" data-autosubmit>';
      assert.equal(saved, before.replace(selectStart + options('Normal'), selectStart + options(priority)));
      assert.equal(selector(await html('/projects/1?filter=Completed'), 1), options(priority));
      assert.doesNotMatch(await html('/projects/1?filter=Open'), /task-priority-1"/);
      assert.equal(await html('/'), summary);
      assert.equal(await html('/projects/2'), otherProject);
    }
    await post('/projects/1/tasks/2/priority', { priority: 'Low', filter: 'Open' });
    assert.equal(selector(await html('/projects/1'), 1), options('High'));
    assert.equal(selector(await html('/projects/1'), 2), options('Low'));
    await post('/projects/1/tasks/1/rename', { title: ' Renamed finished ' });
    const saved = await html('/projects/1');
    assert.equal(selector(saved, 1), options('High'));
    assert.match(saved, /aria-label="Complete Renamed finished" checked/);
    for (const priority of ['', 'Urgent', 'high']) {
      assert.equal((await post('/projects/1/tasks/1/priority', { priority })).status, 400);
    }
    assert.equal((await post('/projects/2/tasks/1/priority', { priority: 'Low' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/priority', { priority: 'Low' })).status, 404);
    assert.equal(await html('/projects/1'), saved);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await html('/projects/1'), saved);
    assert.equal(await html('/'), summary);
    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    for (const id of [1, 2, 4]) {
      assert.match(archived, new RegExp(`<select id="task-priority-${id}" name="priority" disabled data-autosubmit>`));
    }
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Normal' })).status, 403);
    assert.equal(await html('/projects/1'), archived);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await html('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), saved);
    assert.equal(await html('/'), summary);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Low' })).status, 303);
    const restored = await html('/projects/1');
    assert.equal(selector(restored, 1), options('Low'));
    await server.stop();
    server = await start(dbPath);
    assert.equal(await html('/projects/1'), restored);
    assert.equal(await html('/'), summary);
    assert.equal(await html('/projects/2'), otherProject);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task renaming preserves ownership, order, completion, filters, summaries, and restart state', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data/test-'));
  let server;
  try {
    const dbPath = resolve(directory, 'task-rename.sqlite');
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    for (const name of ['Alpha', 'Beta']) await post('/projects', { name });
    for (const title of ['First', 'Second']) await post('/projects/1/tasks', { title });
    await post('/projects/1/tasks/1/completion', { completed: '1' });
    const original = await html('/projects/1');
    const summary = await html('/');
    assert.match(original, /<label for="new-task-title-1">New task title<\/label>/);
    assert.match(original, /<button type="submit">Rename task<\/button>/);
    for (const title of ['', ' \t ']) {
      const response = await post('/projects/1/tasks/1/rename', { title, filter: 'Completed' });
      assert.equal(response.status, 400);
      const error = await response.text();
      assert.match(error, /role="alert">Task title is required/);
      assert.match(error, /<option selected>Completed<\/option>/);
      assert.equal(await html('/projects/1'), original);
      assert.equal(await html('/'), summary);
    }
    assert.equal((await post('/projects/2/tasks/1/rename', { title: 'Wrong owner' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/rename', { title: 'Missing' })).status, 404);
    assert.equal((await post('/projects/999/tasks/1/rename', { title: 'Missing' })).status, 404);
    const response = await post('/projects/1/tasks/1/rename', {
      title: '  New & <title> "quoted"  ', filter: 'Completed',
    });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1?filter=Completed');
    const saved = await html('/projects/1');
    assert.equal(saved, original.replaceAll('First', 'New &amp; &lt;title&gt; &quot;quoted&quot;'));
    assert.match(saved, /aria-label="Complete New &amp; &lt;title&gt; &quot;quoted&quot;" checked/);
    assert.equal(await html('/'), summary);
    assert.doesNotMatch(await html('/projects/1?filter=Open'), /Complete New/);
    assert.match(await html('/projects/1?filter=Completed'), /Complete New/);
    assert.doesNotMatch(await html('/projects/2'), /data-testid="task-row"/);
    const openRename = await post('/projects/1/tasks/2/rename', { title: ' Open renamed ', filter: 'Open' });
    assert.equal(openRename.status, 303);
    assert.equal(openRename.headers.get('location'), '/projects/1?filter=Open');
    assert.match(await html('/projects/1?filter=Open'), /aria-label="Complete Open renamed" data-autosubmit/);
    assert.doesNotMatch(await html('/projects/1?filter=Completed'), /Complete Open renamed/);
    const bothRenamed = await html('/projects/1');
    await server.stop();
    server = await start(dbPath);
    assert.equal(await html('/projects/1'), bothRenamed);
    assert.equal(await html('/'), summary);
    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    for (const id of [1, 2]) {
      assert.match(archived, new RegExp(`<input id="new-task-title-${id}" name="title" type="text" disabled>`));
    }
    assert.equal((archived.match(/<button type="submit" disabled>Rename task<\/button>/g) || []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Blocked' })).status, 403);
    assert.equal(await html('/projects/1'), archived);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await html('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), bothRenamed);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: ' Restored title ' })).status, 303);
    const restored = await html('/projects/1');
    assert.match(restored, /aria-label="Complete Restored title" checked/);
    assert.equal(await html('/'), summary);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await html('/projects/1'), restored);
    assert.equal(await html('/'), summary);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const base = await new Promise((resolveBase, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`Server exited ${code}: ${output}`)));
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolveBase(`http://127.0.0.1:${match[1]}`);
    });
  });
  return { base, async stop() { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; } };
}

test('project validation, creation order, navigation, and restart persistence', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data/test-'));
  let server;
  try {
    const dbPath = resolve(directory, 'projects.sqlite');
    server = await start(dbPath);
    const health = await fetch(`${server.base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const initial = await (await fetch(server.base)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    for (const name of ['', '   ']) {
      const response = await fetch(`${server.base}/projects`, {
        method: 'POST', body: new URLSearchParams({ name }),
      });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    for (const name of ['  Alpha & <team>  ', 'Beta']) {
      const response = await fetch(`${server.base}/projects`, {
        method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
      });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    const list = await (await fetch(server.base)).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.ok(list.indexOf('Alpha &amp; &lt;team&gt;') < list.indexOf('Beta'));
    assert.match(list, /action="\/projects\/1"/);
    assert.match(list, /action="\/projects\/2"/);
    const detail = await (await fetch(`${server.base}/projects/1`)).text();
    assert.match(detail, /<h1>Alpha &amp; &lt;team&gt;<\/h1>/);
    assert.match(detail, /action="\/".*>Projects<\/button>/);
    assert.equal((await fetch(`${server.base}/projects/999`)).status, 404);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await (await fetch(server.base)).text(), list);
    assert.equal(await (await fetch(`${server.base}/projects/1`)).text(), detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task validation, ordering, filters, ownership, completion, and restart persistence', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data/test-'));
  let server;
  try {
    const dbPath = resolve(directory, 'tasks.sqlite');
    server = await start(dbPath);
    const post = (path, fields) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const detail = async (id, filter = 'All') => (await fetch(`${server.base}/projects/${id}?filter=${filter}`)).text();
    const rows = html => [...html.matchAll(/data-testid="task-row"/g)].length;
    for (const name of ['Alpha', 'Beta']) assert.equal((await post('/projects', { name })).status, 303);
    const empty = await detail(1);
    assert.match(empty, /<label for="task-title">Task title<\/label>/);
    assert.match(empty, />Create task<\/button>/);
    assert.match(empty, /<label for="task-filter">Task filter<\/label>/);
    assert.match(empty, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', ' \t ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(rows(html), 0);
    }
    for (const title of ['  First & <task> "quoted"  ', 'Second']) {
      assert.equal((await post('/projects/1/tasks', { title })).status, 303);
    }
    const all = await detail(1);
    assert.equal(rows(all), 2);
    assert.ok(all.indexOf('Complete First') < all.indexOf('Complete Second'));
    assert.match(all, /aria-label="Complete First &amp; &lt;task&gt; &quot;quoted&quot;"/);
    assert.doesNotMatch(all, / checked/);
    assert.equal(rows(await detail(1, 'Open')), 2);
    assert.equal(rows(await detail(1, 'Completed')), 0);
    assert.equal(rows(await detail(2)), 0);
    assert.equal((await post('/projects/2/tasks/1/completion', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Orphan' })).status, 404);
    const completed = await post('/projects/1/tasks/1/completion', { completed: '1', filter: 'Open' });
    assert.equal(completed.status, 303);
    assert.equal(completed.headers.get('location'), '/projects/1?filter=Open');
    const saved = await detail(1);
    assert.match(saved, /aria-label="Complete First[^\n]* checked/);
    assert.equal(rows(await detail(1, 'Open')), 1);
    const completedList = await detail(1, 'Completed');
    assert.equal(rows(completedList), 1);
    assert.match(completedList, /Complete First/);
    assert.doesNotMatch(completedList, /Complete Second/);
    assert.equal(rows(await detail(1, 'invalid')), 2);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await detail(1), saved);
    assert.equal(await detail(1, 'Completed'), completedList);
    assert.equal(rows(await detail(2)), 0);
    assert.equal((await post('/projects/1/tasks/1/completion', {})).status, 303);
    assert.equal(rows(await detail(1, 'Completed')), 0);
    assert.equal(rows(await detail(1, 'Open')), 2);
    await server.stop();
    server = await start(dbPath);
    assert.doesNotMatch(await detail(1), / checked/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('legacy database migration, archive/restore, summaries, and restart persistence', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data/test-'));
  let server;
  try {
    const dbPath = resolve(directory, 'archive.sqlite');
    // Start from the schema used before archive support, with existing data.
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)));
      INSERT INTO projects (name) VALUES ('Alpha'), ('Beta');
      INSERT INTO tasks (project_id, title, completed) VALUES
        (1, 'Finished', 1), (1, 'Pending', 0);`);
    legacy.close();
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const rowCount = (body, kind) => (body.match(new RegExp(`data-testid="${kind}-row"`, 'g')) || []).length;
    const initial = await html('/');
    assert.match(initial, /<label for="project-filter">Project filter<\/label>/);
    assert.match(initial, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.equal(rowCount(initial, 'project'), 2);
    assert.match(initial, /data-testid="project-summary">1\/2 completed/);
    assert.match(initial, /data-testid="project-summary">0\/0 completed/);
    assert.ok(initial.indexOf('Alpha') < initial.indexOf('Beta'));
    assert.equal(rowCount(await html('/?filter=Archived'), 'project'), 0);
    assert.equal((await post('/projects/999/archive')).status, 404);
    assert.equal((await post('/projects/1/archive')).status, 303);
    const active = await html('/');
    assert.equal(rowCount(active, 'project'), 1);
    assert.doesNotMatch(active, /Alpha/);
    const archived = await html('/?filter=Archived');
    assert.equal(rowCount(archived, 'project'), 1);
    assert.match(archived, /Alpha/);
    assert.match(archived, />Open project<\/button>/);
    assert.match(archived, />Restore project<\/button>/);
    assert.doesNotMatch(archived, />Archive project<\/button>/);
    assert.match(archived, /data-testid="project-summary">1\/2 completed/);
    const detail = await html('/projects/1');
    assert.match(detail, /<p>Archived project<\/p>/);
    assert.match(detail, /<button type="submit" disabled>Create task<\/button>/);
    assert.equal(rowCount(detail, 'task'), 2);
    const checkboxes = [...detail.matchAll(/<input type="checkbox"[^>]*>/g)].map(match => match[0]);
    assert.equal(checkboxes.length, 2);
    assert.ok(checkboxes.every(input => input.includes(' disabled')));
    assert.match(checkboxes[0], / checked/);
    const open = await html('/projects/1?filter=Open');
    assert.equal(rowCount(open, 'task'), 1);
    assert.match(open, /Complete Pending/);
    const completed = await html('/projects/1?filter=Completed');
    assert.equal(rowCount(completed, 'task'), 1);
    assert.match(completed, /Complete Finished/);
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1/completion')).status, 403);
    assert.equal(await html('/projects/1'), detail);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await html('/'), active);
    assert.equal(await html('/?filter=Archived'), archived);
    assert.equal(await html('/projects/1'), detail);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.equal(await html('/'), initial);
    assert.equal(rowCount(await html('/?filter=Archived'), 'project'), 0);
    const restored = await html('/projects/1');
    assert.doesNotMatch(restored, / disabled|Archived project/);
    assert.match(restored, /aria-label="Complete Finished" checked/);
    assert.equal((await post('/projects/1/tasks/2/completion', { completed: '1' })).status, 303);
    assert.match(await html('/'), /data-testid="project-summary">2\/2 completed/);
    assert.equal((await post('/projects/1/tasks', { title: 'Third' })).status, 303);
    assert.match(await html('/'), /data-testid="project-summary">2\/3 completed/);
    await server.stop();
    server = await start(dbPath);
    assert.match(await html('/'), /data-testid="project-summary">2\/3 completed/);
    assert.equal(rowCount(await html('/projects/1'), 'task'), 3);
    assert.doesNotMatch(await html('/projects/1'), / disabled|Archived project/);
    assert.equal(rowCount(await html('/projects/2'), 'task'), 0);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('renaming preserves project identity, order, tasks, archive protection, and persistence', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data/test-'));
  let server;
  try {
    const dbPath = resolve(directory, 'rename.sqlite');
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    for (const name of ['Alpha', 'Beta']) assert.equal((await post('/projects', { name })).status, 303);
    await post('/projects/1/tasks', { title: 'Finished' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1/completion', { completed: '1' });
    const original = await html('/projects/1');
    assert.match(original, /<label for="new-project-name">New project name<\/label>/);
    assert.match(original, /<input id="new-project-name" name="name" type="text">/);
    assert.match(original, /<button type="submit">Rename project<\/button>/);
    const originalList = await html('/');
    for (const name of ['', ' \t ']) {
      const response = await post('/projects/1/rename', { name });
      assert.equal(response.status, 400);
      assert.match(await response.text(), /role="alert">Project name is required/);
      assert.equal(await html('/projects/1'), original);
      assert.equal(await html('/'), originalList);
    }
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
    const renamed = await post('/projects/1/rename', { name: '  New & <name> "quoted"  ', filter: 'Open' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Open');
    const saved = await html('/projects/1');
    assert.match(saved, /<h1>New &amp; &lt;name&gt; &quot;quoted&quot;<\/h1>/);
    // Only the page title and heading change: forms, task IDs and state stay identical.
    assert.equal(saved, original.replaceAll('Alpha', 'New &amp; &lt;name&gt; &quot;quoted&quot;'));
    const savedList = await html('/');
    assert.equal(savedList, originalList.replaceAll('Alpha', 'New &amp; &lt;name&gt; &quot;quoted&quot;'));
    assert.match(savedList, /data-testid="project-summary">1\/2 completed/);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await html('/projects/1'), saved);
    assert.equal(await html('/'), savedList);
    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    assert.match(archived, /<input id="new-project-name" name="name" type="text" disabled>/);
    assert.match(archived, /<button type="submit" disabled>Rename project<\/button>/);
    assert.equal((await post('/projects/1/rename', { name: 'Blocked' })).status, 403);
    assert.equal(await html('/projects/1'), archived);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await html('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), saved);
    assert.equal((await post('/projects/1/rename', { name: ' Restored name ' })).status, 303);
    const restored = await html('/projects/1');
    assert.match(restored, /<h1>Restored name<\/h1>/);
    assert.match(restored, /aria-label="Complete Finished" checked/);
    assert.match(restored, /aria-label="Complete Pending" data-autosubmit/);
    assert.equal(await html('/'), originalList.replaceAll('Alpha', 'Restored name'));
    await server.stop();
    server = await start(dbPath);
    assert.equal(await html('/projects/1'), restored);
    assert.equal(await html('/'), originalList.replaceAll('Alpha', 'Restored name'));
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('combined filters retain selections, re-evaluate edits, and work across archive and restart', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data/test-'));
  let server;
  try {
    const dbPath = resolve(directory, 'combined-filters.sqlite');
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const detail = (filter = 'All', priorityFilter = 'All') =>
      html(`/projects/1?${new URLSearchParams({ filter, priorityFilter })}`);
    const titles = body => [...body.matchAll(/aria-label="Complete ([^"]*)"/g)].map(match => match[1]);
    const assertFilters = (body, filter, priority) => {
      for (const [id, values, selected] of [
        ['task-filter', ['All', 'Open', 'Completed'], filter],
        ['priority-filter', ['All', 'Low', 'Normal', 'High'], priority],
      ]) {
        const select = body.match(new RegExp(`<select id="${id}"[^>]*>(.*?)</select>`));
        assert.ok(select, `Missing ${id}`);
        assert.doesNotMatch(select[0], /disabled/);
        assert.equal(select[1], values.map(value =>
          `<option${value === selected ? ' selected' : ''}>${value}</option>`).join(''));
      }
    };
    await post('/projects', { name: 'Alpha' });
    await post('/projects', { name: 'Beta' });
    const tasks = [
      { title: 'Low open', priority: 'Low', completed: false },
      { title: 'High done', priority: 'High', completed: true },
      { title: 'Normal open', priority: 'Normal', completed: false },
      { title: 'Low done', priority: 'Low', completed: true },
      { title: 'High open', priority: 'High', completed: false },
      { title: 'Normal done', priority: 'Normal', completed: true },
    ];
    for (const [index, task] of tasks.entries()) {
      await post('/projects/1/tasks', { title: task.title });
      await post(`/projects/1/tasks/${index + 1}/priority`, { priority: task.priority });
      if (task.completed) await post(`/projects/1/tasks/${index + 1}/completion`, { completed: '1' });
    }
    const summary = await html('/');
    assert.match(summary, /3\/6 completed/);
    assertFilters(await html('/projects/1'), 'All', 'All');
    for (const filter of ['All', 'Open', 'Completed']) {
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        const body = await detail(filter, priority);
        assertFilters(body, filter, priority);
        assert.deepEqual(titles(body), tasks.filter(task =>
          (filter === 'All' || task.completed === (filter === 'Completed')) &&
          (priority === 'All' || task.priority === priority)).map(task => task.title));
        // Both selectors submit in one GET form, preserving the other value.
        const form = body.match(/<form class="filter"[^>]*>([\s\S]*?)<\/form>/)[1];
        assert.match(form, /name="filter" data-autosubmit/);
        assert.match(form, /name="priorityFilter" data-autosubmit/);
      }
    }
    assert.equal(await html('/'), summary);
    assert.deepEqual(titles(await html('/projects/2?filter=Open&priorityFilter=Low')), []);
    assert.deepEqual(titles(await detail('invalid', 'invalid')), tasks.map(task => task.title));

    const filters = { filter: 'Open', priorityFilter: 'Low' };
    const location = '/projects/1?filter=Open&priorityFilter=Low';
    const before = await detail('Open', 'Low');
    const forms = [...before.matchAll(/<form[^>]*method="post"[^>]*>([\s\S]*?)<\/form>/g)];
    assert.equal(forms.length, 6);
    for (const form of forms) {
      assert.match(form[1], /name="filter" value="Open"/);
      assert.match(form[1], /name="priorityFilter" value="Low"/);
    }
    for (const path of ['/projects/1/tasks/1/rename', '/projects/1/tasks']) {
      const response = await post(path, { ...filters, title: '  ' });
      assert.equal(response.status, 400);
      const body = await response.text();
      assert.match(body, /role="alert">Task title is required/);
      assertFilters(body, 'Open', 'Low');
      assert.deepEqual(titles(body), ['Low open']);
    }
    const rename = await post('/projects/1/tasks/1/rename', { ...filters, title: ' Low renamed ' });
    assert.equal(rename.headers.get('location'), location);
    let saved = await html(location);
    assertFilters(saved, 'Open', 'Low');
    assert.deepEqual(titles(saved), ['Low renamed']);
    assert.match(saved, /id="task-priority-1"[^>]*><option selected>Low/);
    assert.equal(await html('/'), summary);

    const priority = await post('/projects/1/tasks/1/priority', { ...filters, priority: 'High' });
    assert.equal(priority.headers.get('location'), location);
    saved = await html(location);
    assertFilters(saved, 'Open', 'Low');
    assert.deepEqual(titles(saved), []);
    assert.deepEqual(titles(await detail('Open', 'High')), ['Low renamed', 'High open']);
    assert.equal(await html('/'), summary);
    const completed = await post('/projects/1/tasks/4/completion', filters);
    assert.equal(completed.headers.get('location'), location);
    assert.deepEqual(titles(await html(location)), ['Low done']);
    const checked = await post('/projects/1/tasks/4/completion', { ...filters, completed: '1' });
    assert.equal(checked.headers.get('location'), location);
    assertFilters(await html(location), 'Open', 'Low');
    assert.deepEqual(titles(await html(location)), []);
    assert.deepEqual(titles(await detail('Completed', 'Low')), ['Low done']);
    assert.equal(await html('/'), summary);

    const allSaved = await html('/projects/1');
    const combinedSaved = await detail('Completed', 'High');
    await server.stop();
    server = await start(dbPath);
    assert.equal(await html('/projects/1'), allSaved);
    assert.equal(await detail('Completed', 'High'), combinedSaved);
    await post('/projects/1/archive');
    const archived = await detail('Completed', 'High');
    assertFilters(archived, 'Completed', 'High');
    assert.deepEqual(titles(archived), ['High done']);
    assert.match(archived, /Archived project/);
    assert.match(archived, /aria-label="Complete High done" checked disabled/);
    assert.match(archived, /id="new-task-title-2"[^>]* disabled/);
    assert.match(archived, /disabled>Rename task/);
    assert.match(archived, /id="task-priority-2"[^>]* disabled/);
    assert.deepEqual(titles(await detail('Open', 'High')), ['Low renamed', 'High open']);
    assert.match(await html('/?filter=Archived'), /3\/6 completed/);
    const blocked = await post('/projects/1/tasks/2/priority', {
      filter: 'Completed', priorityFilter: 'High', priority: 'Low',
    });
    assert.equal(blocked.status, 403);
    assertFilters(await blocked.text(), 'Completed', 'High');
    await server.stop();
    server = await start(dbPath);
    assert.equal(await detail('Completed', 'High'), archived);
    await post('/projects/1/restore');
    assert.equal(await detail('Completed', 'High'), combinedSaved);
    assert.equal(await html('/projects/1'), allSaved);
    assert.equal(await html('/'), summary);
    assertFilters(await html('/projects/1'), 'All', 'All');
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project defaults migrate, affect only subsequent tasks, and persist through rename and archive', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data/test-'));
  let server;
  try {
    const dbPath = resolve(directory, 'defaults.sqlite');
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
      INSERT INTO projects (name) VALUES ('Alpha');
      INSERT INTO tasks (project_id, title, completed, priority) VALUES
        (1, 'Existing high', 1, 'High'), (1, 'Existing normal', 0, 'Normal');`);
    legacy.close();
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.base}${path}`)).text();
    const selector = (body, id, expected, disabled = false) => {
      const match = body.match(new RegExp(`<select id="${id}"([^>]*)>(.*?)</select>`));
      assert.ok(match, `Missing ${id}`);
      assert.equal(match[1].includes(' disabled'), disabled);
      const values = id === 'task-filter' ? ['All', 'Open', 'Completed'] :
        id === 'priority-filter' ? ['All', 'Low', 'Normal', 'High'] : ['Low', 'Normal', 'High'];
      assert.equal(match[2], values.map(value =>
        `<option${value === expected ? ' selected' : ''}>${value}</option>`).join(''));
    };
    const rows = body => [...body.matchAll(/<div class="project task" data-testid="task-row">[\s\S]*?(?=<div class="project task"|<\/section>)/g)].map(match => match[0]);
    await post('/projects', { name: 'Beta' });
    const initial = await html('/projects/1');
    assert.match(initial, /<label for="default-task-priority">Default task priority<\/label>/);
    selector(initial, 'default-task-priority', 'Normal');
    selector(await html('/projects/2'), 'default-task-priority', 'Normal');
    const summary = await html('/');
    const otherProject = await html('/projects/2');
    const filters = { filter: 'Completed', priorityFilter: 'High' };
    const location = '/projects/1?filter=Completed&priorityFilter=High';
    const matchingBefore = rows(await html(location));
    const change = await post('/projects/1/default-priority', { ...filters, priority: 'Low' });
    assert.equal(change.status, 303);
    assert.equal(change.headers.get('location'), location);
    const changed = await html(location);
    selector(changed, 'default-task-priority', 'Low');
    selector(changed, 'task-filter', 'Completed');
    selector(changed, 'priority-filter', 'High');
    assert.deepEqual(rows(changed), matchingBefore);
    assert.deepEqual(rows(await html('/projects/1')), rows(initial));
    assert.equal(await html('/'), summary);
    assert.equal(await html('/projects/2'), otherProject);
    for (const priority of ['', 'Urgent']) {
      assert.equal((await post('/projects/1/default-priority', { priority })).status, 400);
      selector(await html('/projects/1'), 'default-task-priority', 'Low');
    }
    assert.equal((await post('/projects/999/default-priority', { priority: 'High' })).status, 404);
    await post('/projects/1/tasks', { title: 'Inherited low', ...filters });
    selector(await html('/projects/1'), 'task-priority-3', 'Low');
    assert.deepEqual(rows(await html(location)), matchingBefore);
    await post('/projects/1/default-priority', { priority: 'High' });
    await post('/projects/1/tasks', { title: 'Inherited high' });
    await post('/projects/2/tasks', { title: 'Independent normal' });
    let all = await html('/projects/1');
    selector(all, 'task-priority-1', 'High');
    selector(all, 'task-priority-2', 'Normal');
    selector(all, 'task-priority-3', 'Low');
    selector(all, 'task-priority-4', 'High');
    selector(await html('/projects/2'), 'task-priority-5', 'Normal');
    assert.ok(all.indexOf('Complete Existing high') < all.indexOf('Complete Existing normal'));
    assert.ok(all.indexOf('Complete Existing normal') < all.indexOf('Complete Inherited low'));
    assert.ok(all.indexOf('Complete Inherited low') < all.indexOf('Complete Inherited high'));
    assert.match(await html('/'), /1\/4 completed/);
    await post('/projects/1/rename', { name: 'Renamed' });
    await post('/projects/1/tasks/3/rename', { title: 'Low renamed' });
    all = await html('/projects/1');
    selector(all, 'default-task-priority', 'High');
    selector(all, 'task-priority-3', 'Low');
    assert.match(all, /aria-label="Complete Existing high" checked/);
    const list = await html('/');
    await server.stop();
    server = await start(dbPath);
    assert.equal(await html('/projects/1'), all);
    assert.equal(await html('/'), list);
    await post('/projects/1/tasks', { title: 'High after restart' });
    selector(await html('/projects/1'), 'task-priority-6', 'High');
    const saved = await html('/projects/1');
    await post('/projects/1/archive');
    const archived = await html(location);
    selector(archived, 'default-task-priority', 'High', true);
    selector(archived, 'task-filter', 'Completed');
    selector(archived, 'priority-filter', 'High');
    const blocked = await post('/projects/1/default-priority', { ...filters, priority: 'Normal' });
    assert.equal(blocked.status, 403);
    assert.equal(await html(location), archived);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await html(location), archived);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), saved);
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Low after restore' });
    selector(await html('/projects/1'), 'task-priority-7', 'Low');
    selector(await html('/projects/1'), 'task-priority-6', 'High');
    const final = await html('/projects/1');
    await server.stop();
    server = await start(dbPath);
    assert.equal(await html('/projects/1'), final);
    selector(await html('/projects/2'), 'default-task-priority', 'Normal');
    selector(await html('/projects/2'), 'task-priority-5', 'Normal');
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
