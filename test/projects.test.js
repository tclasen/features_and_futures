import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const baseUrl = await new Promise((resolve, reject) => {
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
    child.on('error', reject);
    child.on('exit', (code) => reject(new Error(`Server exited: ${code}`)));
  });
  return {
    baseUrl,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('task priorities migrate, remain independent, and persist through rename and archive', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  const databasePath = join(directory, 'projects.sqlite');
  const oldDb = new DatabaseSync(databasePath);
  oldDb.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('One'), ('Two');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing', 1);
  `);
  oldDb.close();
  let server;
  try {
    server = await start(databasePath);
    const get = async (path) => (await fetch(server.baseUrl + path)).text();
    const post = (path, values = {}) => fetch(server.baseUrl + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const selected = (body, id, priority, disabled = false) => {
      const select = body.match(new RegExp(`<select id="task-priority-${id}"[^>]*>([\\s\\S]*?)</select>`));
      assert.ok(select);
      assert.equal(select[0].includes(' disabled'), disabled);
      assert.equal(select[1].trim(), ['Low', 'Normal', 'High'].map((value) =>
        `<option${value === priority ? ' selected' : ''}>${value}</option>`).join(''));
      assert.match(body, new RegExp(`<label for="task-priority-${id}">Task priority</label>`));
    };
    selected(await get('/projects/1'), 1, 'Normal');
    await post('/projects/1/tasks', { title: 'New' });
    await post('/projects/2/tasks', { title: 'Other' });
    selected(await get('/projects/1'), 2, 'Normal');
    const summary = await get('/');
    for (const priority of ['High', 'Low', 'Normal', 'High']) {
      const response = await post('/projects/1/tasks/1/priority', { priority, filter: 'Completed' });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/projects/1?filter=Completed');
      const body = await get('/projects/1');
      selected(body, 1, priority);
      selected(body, 2, 'Normal');
      selected(await get('/projects/2'), 3, 'Normal');
      assert.match(body, /aria-label="Complete Existing" checked/);
      assert.ok(body.indexOf('Complete Existing') < body.indexOf('Complete New'));
      assert.equal(await get('/'), summary);
      assert.doesNotMatch(await get('/projects/1?filter=Open'), /Complete Existing/);
      selected(await get('/projects/1?filter=Completed'), 1, priority);
    }
    const beforeInvalid = await get('/projects/1');
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Urgent' })).status, 400);
    assert.equal((await post('/projects/2/tasks/1/priority', { priority: 'Low' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/priority', { priority: 'Low' })).status, 404);
    assert.equal(await get('/projects/1'), beforeInvalid);
    await post('/projects/1/tasks/1/rename', { title: 'Renamed' });
    selected(await get('/projects/1'), 1, 'High');
    assert.match(await get('/projects/1'), /aria-label="Complete Renamed" checked/);
    await post('/projects/1/tasks/2/priority', { priority: 'Low' });
    let saved = await get('/projects/1');
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/projects/1'), saved);
    await post('/projects/1/archive');
    saved = await get('/projects/1');
    selected(saved, 1, 'High', true);
    selected(saved, 2, 'Low', true);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Normal' })).status, 403);
    assert.equal(await get('/projects/1'), saved);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/projects/1'), saved);
    await post('/projects/1/restore');
    selected(await get('/projects/1'), 1, 'High');
    selected(await get('/projects/1'), 2, 'Low');
    assert.equal(await get('/'), summary);
    await post('/projects/1/tasks/1/priority', { priority: 'Normal' });
    selected(await get('/projects/1'), 1, 'Normal');
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task renaming preserves order, ownership, completion, filters, and persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  const databasePath = join(directory, 'projects.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const get = async (path) => (await fetch(server.baseUrl + path)).text();
    const post = (path, values = {}) => fetch(server.baseUrl + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    await post('/projects', { name: 'One' });
    await post('/projects', { name: 'Two' });
    await post('/projects/1/tasks', { title: 'First' });
    await post('/projects/1/tasks', { title: 'Second' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await get('/projects/1');
    assert.equal((original.match(/>New task title<\/label>/g) || []).length, 2);
    assert.equal((original.match(/>Rename task<\/button>/g) || []).length, 2);
    for (const title of ['', ' \t\n']) {
      const response = await post('/projects/1/tasks/1/rename', { title, filter: 'Completed' });
      assert.equal(response.status, 400);
      const body = await response.text();
      assert.match(body, /role="alert">Task title is required/);
      assert.match(body, /aria-label="Complete First" checked/);
      assert.doesNotMatch(body, /Complete Second/);
      assert.equal(await get('/projects/1'), original);
    }
    const summary = await get('/');
    const response = await post('/projects/1/tasks/1/rename', { title: '  New <first> & "title"  ', filter: 'Completed' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1?filter=Completed');
    let saved = await get('/projects/1');
    assert.match(saved, /aria-label="Complete New &lt;first&gt; &amp; &quot;title&quot;" checked/);
    assert.match(saved, /<span>New &lt;first&gt; &amp; &quot;title&quot;<\/span>/);
    assert.ok(saved.indexOf('Complete New') < saved.indexOf('Complete Second'));
    assert.doesNotMatch(saved, /Complete First/);
    assert.equal(await get('/'), summary);
    assert.doesNotMatch(await get('/projects/1?filter=Open'), /Complete New/);
    assert.match(await get('/projects/1?filter=Completed'), /Complete New/);
    assert.doesNotMatch(await get('/projects/2'), /data-testid="task-row"/);
    assert.equal((await post('/projects/2/tasks/1/rename', { title: 'Stolen' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/rename', { title: 'Missing' })).status, 404);
    assert.equal((await post('/projects/999/tasks/1/rename', { title: 'Missing' })).status, 404);
    assert.equal(await get('/projects/1'), saved);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/projects/1'), saved);
    await post('/projects/1/archive');
    saved = await get('/projects/1');
    assert.equal((saved.match(/name="title" type="text" disabled/g) || []).length, 2);
    assert.equal((saved.match(/disabled>Rename task/g) || []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Blocked' })).status, 403);
    assert.equal(await get('/projects/1'), saved);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/projects/1'), saved);
    await post('/projects/1/restore');
    assert.doesNotMatch(await get('/projects/1'), / disabled/);
    await post('/projects/1/tasks/2/rename', { title: '  New second  ', filter: 'Open' });
    saved = await get('/projects/1');
    assert.match(saved, /aria-label="Complete New second" onchange=/);
    assert.match(saved, /<span>New second<\/span>/);
    assert.match(saved, /aria-label="Complete New &lt;first&gt; &amp; &quot;title&quot;" checked/);
    assert.equal(await get('/'), summary);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/projects/1'), saved);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('renaming preserves identity, order, tasks, and archived protection across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const databasePath = join(directory, 'projects.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const get = async (path) => (await fetch(server.baseUrl + path)).text();
    const post = (path, values = {}) => fetch(server.baseUrl + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1', { completed: '1' });
    let body = await get('/projects/1');
    assert.match(body, /<label for="new-project-name">New project name<\/label>/);
    assert.match(body, />Rename project<\/button>/);
    assert.doesNotMatch(body, / disabled/);
    for (const name of ['', ' \t\n']) {
      const response = await post('/projects/1/rename', { name });
      assert.equal(response.status, 400);
      const errorPage = await response.text();
      assert.match(errorPage, /role="alert">Project name is required/);
      assert.match(errorPage, /<h1>Original<\/h1>/);
      assert.equal(await get('/projects/1'), body);
    }
    const renamed = await post('/projects/1/rename', { name: '  Renamed <one>  ', filter: 'Open' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Open');
    body = await get('/projects/1');
    assert.match(body, /<h1>Renamed &lt;one&gt;<\/h1>/);
    assert.match(body, /aria-label="Complete Done" checked/);
    assert.match(body, /aria-label="Complete Pending"/);
    let list = await get('/');
    assert.ok(list.indexOf('<span>Renamed &lt;one&gt;</span>') < list.indexOf('<span>Second</span>'));
    assert.match(list, /data-testid="project-summary">1\/2 completed/);
    assert.match(list, /action="\/projects\/1"/);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/projects/1'), body);
    assert.equal(await get('/'), list);
    await post('/projects/1/archive');
    body = await get('/projects/1');
    assert.match(body, /id="new-project-name" name="name" type="text" disabled/);
    assert.match(body, /<button type="submit" disabled>Rename project/);
    assert.equal((await post('/projects/1/rename', { name: 'Blocked' })).status, 403);
    assert.equal(await get('/projects/1'), body);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/projects/1'), body);
    await post('/projects/1/restore');
    assert.doesNotMatch(await get('/projects/1'), / disabled/);
    assert.equal((await post('/projects/1/rename', { name: 'Restored name' })).status, 303);
    body = await get('/projects/1');
    assert.match(body, /<h1>Restored name<\/h1>/);
    assert.match(body, /aria-label="Complete Done" checked/);
    assert.match(body, /aria-label="Complete Pending"/);
    list = await get('/');
    assert.match(list, /1\/2 completed/);
    assert.ok(list.indexOf('<span>Restored name</span>') < list.indexOf('<span>Second</span>'));
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/projects/1'), body);
    assert.equal(await get('/'), list);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive migration, summaries, read-only tasks, restore, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const databasePath = join(directory, 'projects.sqlite');
  // Simulate a database from the previous checkpoint.
  const oldDb = new DatabaseSync(databasePath);
  oldDb.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    INSERT INTO projects (name) VALUES ('Original');`);
  oldDb.close();
  let server;
  try {
    server = await start(databasePath);
    const get = async (path) => (await fetch(server.baseUrl + path)).text();
    const post = (path, values = {}) => fetch(server.baseUrl + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    let body = await get('/');
    assert.match(body, /<label for="project-filter">Project filter<\/label>/);
    assert.match(body, /<option selected>Active<\/option>/);
    assert.match(body, /data-testid="project-summary">0\/0 completed/);
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1', { completed: '1' });
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    assert.equal((await post('/projects/1/archive')).status, 303);
    assert.doesNotMatch(await get('/'), /<span>Original<\/span>/);
    body = await get('/?filter=Archived');
    assert.match(body, /<span>Original<\/span>/);
    assert.doesNotMatch(body, /<span>Second<\/span>/);
    assert.match(body, />Open project<\/button>/);
    assert.match(body, />Restore project<\/button>/);
    assert.doesNotMatch(body, />Archive project<\/button>/);
    assert.match(body, /data-testid="project-summary">1\/2 completed/);
    body = await get('/projects/1');
    assert.match(body, /Archived project/);
    assert.match(body, /<button type="submit" disabled>Create task/);
    assert.match(body, /aria-label="Complete Done" checked disabled/);
    assert.match(body, /aria-label="Complete Pending" disabled/);
    const saved = body;
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1', {})).status, 403);
    assert.equal(await get('/projects/1'), saved);
    body = await get('/projects/1?filter=Open');
    assert.match(body, /Complete Pending/);
    assert.doesNotMatch(body, /Complete Done/);
    body = await get('/projects/1?filter=Completed');
    assert.match(body, /Complete Done/);
    assert.doesNotMatch(body, /Complete Pending/);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/projects/1'), saved);
    assert.match(await get('/?filter=Archived'), /1\/2 completed/);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.doesNotMatch(await get('/?filter=Archived'), /data-testid="project-row"/);
    body = await get('/');
    assert.ok(body.indexOf('<span>Original</span>') < body.indexOf('<span>Second</span>'));
    assert.match(body, /1\/2 completed/);
    body = await get('/projects/1');
    assert.doesNotMatch(body, / disabled|Archived project/);
    assert.match(body, /aria-label="Complete Done" checked/);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/projects/1'), body);
    await post('/projects/1/tasks/1', {});
    assert.match(await get('/'), /0\/2 completed/);
    await post('/projects/1/tasks', { title: 'After restore' });
    assert.match(await get('/'), /0\/3 completed/);
    assert.equal((await post('/projects/999/archive')).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, stay within projects, and persist completion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const databasePath = join(directory, 'tasks.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const get = async (path) => (await fetch(server.baseUrl + path)).text();
    const post = (path, values) => fetch(server.baseUrl + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    await post('/projects', { name: 'One' });
    await post('/projects', { name: 'Two' });
    let body = await get('/projects/1');
    assert.match(body, /<label for="task-title">Task title<\/label>/);
    assert.match(body, />Create task<\/button>/);
    assert.match(body, /<label for="task-filter">Task filter<\/label>/);
    assert.match(body, /<option selected>All<\/option>/);
    for (const title of ['', ' \t\n']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      body = await response.text();
      assert.match(body, /role="alert">Task title is required/);
      assert.doesNotMatch(body, /data-testid="task-row"/);
    }
    assert.equal((await post('/projects/1/tasks', { title: '  First task  ' })).status, 303);
    await post('/projects/1/tasks', { title: '<Second> & "task"' });
    body = await get('/projects/1');
    assert.equal((body.match(/data-testid="task-row"/g) || []).length, 2);
    assert.match(body, /aria-label="Complete First task"/);
    assert.match(body, /<span>First task<\/span>/);
    assert.match(body, /&lt;Second&gt; &amp; &quot;task&quot;/);
    assert.ok(body.indexOf('First task') < body.indexOf('&lt;Second&gt;'));
    assert.doesNotMatch(body, / checked/);
    assert.doesNotMatch(await get('/projects/2'), /data-testid="task-row"/);
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Invalid' })).status, 404);
    await post('/projects/1/tasks/1', { completed: '1' });
    body = await get('/projects/1?filter=Completed');
    assert.match(body, /aria-label="Complete First task" checked/);
    assert.doesNotMatch(body, /&lt;Second&gt;/);
    body = await get('/projects/1?filter=Open');
    assert.doesNotMatch(body, /First task/);
    assert.match(body, /&lt;Second&gt;/);
    const saved = await get('/projects/1');
    await post('/projects/1/tasks', { title: '  ' });
    assert.equal(await get('/projects/1'), saved);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/projects/1'), saved);
    assert.doesNotMatch(await get('/projects/2'), /data-testid="task-row"/);
    await post('/projects/1/tasks/1', {});
    assert.doesNotMatch(await get('/projects/1'), / checked/);
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /data-testid="task-row"/);
    await server.stop();
    server = await start(databasePath);
    assert.doesNotMatch(await get('/projects/1'), / checked/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('projects validate, render safely, navigate, and persist after restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const get = (path) => fetch(server.baseUrl + path);
    const create = (name) => fetch(server.baseUrl + '/projects', {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    let body = await (await get('/')).text();
    assert.match(body, /<h1>Workboard<\/h1>/);
    assert.match(body, /<label for="project-name">Project name<\/label>/);
    assert.match(body, />Create project<\/button>/);
    assert.doesNotMatch(body, /data-testid="project-row"/);

    for (const name of ['', '   \t\n']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      body = await response.text();
      assert.match(body, /role="alert">Project name is required/);
      assert.doesNotMatch(body, /data-testid="project-row"/);
    }
    assert.equal((await create('  First project  ')).status, 303);
    assert.equal((await create('<script> & Second')).status, 303);
    body = await (await get('/')).text();
    assert.equal((body.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(body, /<span>First project<\/span>/);
    assert.match(body, /&lt;script&gt; &amp; Second/);
    assert.ok(body.indexOf('First project') < body.indexOf('&lt;script&gt;'));
    const projectPaths = [...body.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
    assert.equal(projectPaths.length, 2);
    body = await (await get(projectPaths[0])).text();
    assert.match(body, /<h1>First project<\/h1>/);
    assert.match(body, /action="\/".*>Projects<\/button>/);
    const beforeRestart = await (await get('/')).text();
    await create('  ');
    assert.equal(await (await get('/')).text(), beforeRestart);
    assert.equal((await get('/projects/999')).status, 404);

    await server.stop();
    server = await start(databasePath);
    assert.equal(await (await get('/')).text(), beforeRestart);
    assert.match(await (await get(projectPaths[0])).text(), /<h1>First project<\/h1>/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
