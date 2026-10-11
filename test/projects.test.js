import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function launch(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let errors = '';
  child.stderr.on('data', (data) => { errors += data; });
  const port = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', (data) => {
      output += data;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(match[1]);
    });
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`Server exited ${code}: ${errors}`)));
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('priorities migrate, persist independently, and respect ownership and archives', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/priority-test-');
  const databasePath = path.resolve(directory, 'projects.sqlite');
  const oldDb = new DatabaseSync(databasePath);
  oldDb.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    INSERT INTO projects (name) VALUES ('One'), ('Two');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing', 1);`);
  oldDb.close();
  let server;
  try {
    server = await launch(databasePath);
    const post = (route, values = {}) => fetch(server.url + route, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async (route) => (await fetch(server.url + route)).text();
    const priorityOptions = (markup, id) => markup.match(new RegExp(`<select id="task-priority-${id}"[^>]*>([\\s\\S]*?)</select>`))[1].trim();
    const normal = '<option>Low</option><option selected>Normal</option><option>High</option>';
    assert.equal(priorityOptions(await html('/projects/1'), 1), normal);
    await post('/projects/1/tasks', { title: 'New' });
    await post('/projects/2/tasks', { title: 'Other' });
    assert.equal(priorityOptions(await html('/projects/1'), 2), normal);
    const summary = await html('/');
    const changed = await post('/projects/1/tasks/1/priority', { priority: 'High', filter: 'Completed' });
    assert.equal(changed.status, 303);
    assert.equal(changed.headers.get('location'), '/projects/1?filter=Completed');
    await post('/projects/1/tasks/2/priority', { priority: 'Low' });
    assert.equal((await post('/projects/2/tasks/1/priority', { priority: 'Low' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/priority', { priority: 'Low' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Urgent' })).status, 400);
    await post('/projects/1/tasks/1/rename', { title: 'Renamed' });
    const detail = await html('/projects/1');
    assert.equal(priorityOptions(detail, 1), '<option>Low</option><option>Normal</option><option selected>High</option>');
    assert.equal(priorityOptions(detail, 2), '<option selected>Low</option><option>Normal</option><option>High</option>');
    assert.equal(priorityOptions(await html('/projects/2'), 3), normal);
    assert.match(detail, /aria-label="Complete Renamed" checked/);
    assert.ok(detail.indexOf('Complete Renamed') < detail.indexOf('Complete New'));
    assert.ok(!(await html('/projects/1?filter=Open')).includes('Complete Renamed'));
    assert.ok(!(await html('/projects/1?filter=Completed')).includes('Complete New'));
    assert.equal(await html('/'), summary);
    await server.stop();
    server = await launch(databasePath);
    assert.equal(await html('/projects/1'), detail);
    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    assert.equal((archived.match(/id="task-priority-\d+"[^>]* disabled/g) || []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Low' })).status, 403);
    await server.stop();
    server = await launch(databasePath);
    assert.equal(await html('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), detail);
    await post('/projects/1/tasks/1/priority', { priority: 'Normal' });
    assert.equal(priorityOptions(await html('/projects/1'), 1), normal);
    assert.equal(await html('/'), summary);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task renaming preserves completion, order, ownership, filters, and persistence', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/task-rename-test-');
  const databasePath = path.resolve(directory, 'projects.sqlite');
  let server;
  try {
    server = await launch(databasePath);
    const post = (route, values = {}) => fetch(server.url + route, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async (route) => (await fetch(server.url + route)).text();
    await post('/projects', { name: 'One' });
    await post('/projects', { name: 'Two' });
    await post('/projects/1/tasks', { title: 'First' });
    await post('/projects/1/tasks', { title: 'Second' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const summary = await html('/');
    for (const title of ['', '   ']) {
      const invalid = await (await post('/projects/1/tasks/1/rename', { title, filter: 'Completed' })).text();
      assert.match(invalid, /role="alert">Task title is required/);
      assert.match(invalid, /aria-label="Complete First" checked/);
      assert.match(invalid, /id="new-task-title-1"[^>]*aria-invalid="true"/);
    }
    assert.equal((await post('/projects/2/tasks/1/rename', { title: 'Wrong owner' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/rename', { title: 'Missing' })).status, 404);
    const renamed = await post('/projects/1/tasks/1/rename', { title: '  New <title> "quoted"  ', filter: 'Completed' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const detail = await html('/projects/1');
    assert.match(detail, /aria-label="Complete New &lt;title&gt; &quot;quoted&quot;" checked/);
    assert.ok(detail.indexOf('Complete New') < detail.indexOf('Complete Second'));
    assert.equal((detail.match(/data-testid="task-row"/g) || []).length, 2);
    assert.match(detail, /<label for="new-task-title-1">New task title<\/label>/);
    assert.ok(!(await html('/projects/1?filter=Open')).includes('Complete New'));
    assert.ok(!(await html('/projects/2')).includes('Complete New'));
    assert.equal(await html('/'), summary);
    await server.stop();
    server = await launch(databasePath);
    assert.equal(await html('/projects/1'), detail);
    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    assert.equal((archived.match(/id="new-task-title-\d+"[^>]* disabled/g) || []).length, 2);
    assert.equal((archived.match(/<button type="submit" disabled>Rename task/g) || []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Blocked' })).status, 403);
    await post('/projects/1/restore');
    assert.equal(await html('/projects/1'), detail);
    await post('/projects/1/tasks/2/rename', { title: '  Renamed open  ', filter: 'Open' });
    assert.match(await html('/projects/1?filter=Open'), /aria-label="Complete Renamed open" onchange=/);
    assert.equal(await html('/'), summary);
    await server.stop();
    server = await launch(databasePath);
    assert.match(await html('/projects/1?filter=Open'), /Complete Renamed open/);
    assert.match(await html('/projects/1?filter=Completed'), /Complete New/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('rename validates, preserves identity and tasks, and respects archives', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/rename-test-');
  const databasePath = path.resolve(directory, 'projects.sqlite');
  let server;
  try {
    server = await launch(databasePath);
    const post = (route, values = {}) => fetch(server.url + route, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async (route) => (await fetch(server.url + route)).text();
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1', { completed: '1' });
    assert.match(await html('/projects/1'), /<label for="new-project-name">New project name<\/label>/);
    for (const name of ['', '   ']) {
      const invalid = await (await post('/projects/1/rename', { name })).text();
      assert.match(invalid, /role="alert">Project name is required/);
      assert.match(invalid, /<h1>Original<\/h1>/);
    }
    const renamed = await post('/projects/1/rename', { name: '  Renamed <project>  ' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=All');
    const detail = await html('/projects/1');
    assert.match(detail, /<h1>Renamed &lt;project&gt;<\/h1>/);
    assert.match(detail, /aria-label="Complete Done" checked/);
    assert.match(detail, /Complete Pending/);
    const list = await html('/');
    assert.ok(list.indexOf('<span>Renamed &lt;project&gt;</span>') < list.indexOf('<span>Second</span>'));
    assert.match(list, /1\/2 completed/);
    await server.stop();
    server = await launch(databasePath);
    assert.equal(await html('/'), list);
    assert.equal(await html('/projects/1'), detail);
    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    assert.match(archived, /id="new-project-name"[^>]* disabled/);
    assert.match(archived, /<button type="submit" disabled>Rename project/);
    assert.equal((await post('/projects/1/rename', { name: 'Blocked' })).status, 403);
    assert.match(await html('/projects/1'), /<h1>Renamed &lt;project&gt;<\/h1>/);
    await post('/projects/1/restore');
    assert.ok(!(await html('/projects/1')).includes(' disabled'));
    await post('/projects/1/rename', { name: 'Restored' });
    assert.match(await html('/projects/1'), /<h1>Restored<\/h1>/);
    assert.match(await html('/'), /1\/2 completed/);
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive, summaries, restore, and migration persist without task loss', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/archive-test-');
  const databasePath = path.resolve(directory, 'projects.sqlite');
  const oldDb = new DatabaseSync(databasePath);
  oldDb.exec("CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL); INSERT INTO projects (name) VALUES ('Existing');");
  oldDb.close();
  let server;
  try {
    server = await launch(databasePath);
    const post = (route, values = {}) => fetch(server.url + route, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async (route) => (await fetch(server.url + route)).text();
    assert.match(await html('/'), /<option selected>Active<\/option>/);
    assert.match(await html('/'), /data-testid="project-summary">0\/0 completed/);
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'First task' });
    await post('/projects/1/tasks', { title: 'Second task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    assert.match(await html('/'), /data-testid="project-summary">1\/2 completed/);
    await post('/projects/1/archive');
    assert.ok(!(await html('/')).includes('<span>Existing</span>'));
    const archivedList = await html('/?filter=Archived');
    assert.match(archivedList, /Restore project/);
    assert.match(archivedList, /1\/2 completed/);
    const archivedPage = await html('/projects/1');
    assert.match(archivedPage, /Archived project/);
    assert.match(archivedPage, /<button type="submit" disabled>Create task/);
    assert.equal((archivedPage.match(/type="checkbox"[^>]* disabled/g) || []).length, 2);
    const completed = await html('/projects/1?filter=Completed');
    assert.ok(completed.includes('First task'));
    assert.ok(!completed.includes('Second task'));
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1')).status, 403);
    await server.stop();
    server = await launch(databasePath);
    assert.equal(await html('/?filter=Archived'), archivedList);
    assert.equal(await html('/projects/1'), archivedPage);
    await post('/projects/1/restore');
    assert.ok(!(await html('/?filter=Archived')).includes('data-testid="project-row"'));
    const active = await html('/');
    assert.ok(active.indexOf('<span>Existing</span>') < active.indexOf('<span>Second</span>'));
    assert.match(active, /1\/2 completed/);
    assert.ok(!(await html('/projects/1')).includes(' disabled'));
    await post('/projects/1/tasks/1');
    assert.match(await html('/'), /0\/2 completed/);
    await server.stop();
    server = await launch(databasePath);
    assert.match(await html('/'), /0\/2 completed/);
    assert.ok(!(await html('/projects/1')).includes('Archived project'));
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, stay project-scoped, and persist completion', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/tasks-test-');
  const databasePath = path.resolve(directory, 'tasks.sqlite');
  let server;
  try {
    server = await launch(databasePath);
    const post = (route, values) => fetch(server.url + route, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async (route) => (await fetch(server.url + route)).text();
    await post('/projects', { name: 'One' });
    await post('/projects', { name: 'Two' });
    const initial = await html('/projects/1');
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, /<option selected>All<\/option>/);
    for (const title of ['', '  ']) {
      const invalid = await (await post('/projects/1/tasks', { title })).text();
      assert.match(invalid, /role="alert">Task title is required/);
      assert.ok(!invalid.includes('data-testid="task-row"'));
    }
    await post('/projects/1/tasks', { title: '  First <task>  ' });
    await post('/projects/1/tasks', { title: 'Second task' });
    await post('/projects/2/tasks', { title: 'Other task' });
    const all = await html('/projects/1');
    assert.equal((all.match(/data-testid="task-row"/g) || []).length, 2);
    assert.ok(all.indexOf('First &lt;task&gt;') < all.indexOf('Second task'));
    assert.match(all, /aria-label="Complete First &lt;task&gt;"/);
    assert.ok(!all.includes(' checked'));
    assert.ok(!all.includes('Other task'));
    assert.ok(!(await html('/projects/2')).includes('Second task'));
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    await post('/projects/1/tasks/1', { completed: '1' });
    const completed = await html('/projects/1?filter=Completed');
    assert.match(completed, /aria-label="Complete First &lt;task&gt;" checked/);
    assert.ok(!completed.includes('Second task'));
    const open = await html('/projects/1?filter=Open');
    assert.ok(!open.includes('First &lt;task&gt;'));
    assert.ok(open.includes('Second task'));
    await server.stop();
    server = await launch(databasePath);
    assert.equal(await html('/projects/1?filter=Completed'), completed);
    assert.equal(await html('/projects/1?filter=Open'), open);
    await post('/projects/1/tasks/1', {});
    assert.ok(!(await html('/projects/1?filter=Completed')).includes('data-testid="task-row"'));
    assert.equal((await html('/projects/1?filter=Open')).match(/data-testid="task-row"/g).length, 2);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('projects validate, trim, preserve order, navigate, and survive a restart', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/test-');
  const databasePath = path.resolve(directory, 'projects.sqlite');
  let server;
  try {
    server = await launch(databasePath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const create = (name) => fetch(`${server.url}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    const initial = await (await fetch(server.url)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    for (const blank of ['', '   ']) {
      const response = await create(blank);
      const html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.equal((html.match(/data-testid="project-row"/g) || []).length, 0);
    }
    assert.equal((await create('  First project  ')).status, 303);
    assert.equal((await create('Second <project>')).status, 303);
    const list = await (await fetch(server.url)).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.ok(list.indexOf('First project') < list.indexOf('Second &lt;project&gt;'));
    assert.match(list, /<span>First project<\/span>/);
    const projectPaths = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
    assert.equal(projectPaths.length, 2);
    const detail = await (await fetch(server.url + projectPaths[0])).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/"[^>]*><button type="submit">Projects<\/button>/);
    assert.equal((await fetch(`${server.url}/projects/9999`)).status, 404);
    await server.stop();
    server = await launch(databasePath);
    assert.equal(await (await fetch(server.url)).text(), list);
    assert.equal(await (await fetch(server.url + projectPaths[0])).text(), detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
