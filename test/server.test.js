import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => {
      clearTimeout(timer);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = /listening on port (\d+)/.exec(output);
      if (match) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  return {
    url,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects validate, render safely in creation order, and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let server;
  try {
    const dbPath = join(directory, 'nested', 'projects.sqlite');
    server = await start(dbPath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const initial = await (await fetch(server.url)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.equal((initial.match(/data-testid="project-row"/g) || []).length, 0);

    async function create(name) {
      return fetch(`${server.url}/projects`, {
        method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
      });
    }
    for (const name of ['', ' \t\n ']) {
      const result = await create(name);
      assert.equal(result.status, 422);
      const html = await result.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    for (const name of ['  First project  ', 'Café <script>alert("x")</script>']) {
      const result = await create(name);
      assert.equal(result.status, 303);
      assert.equal(result.headers.get('location'), '/');
    }
    const list = await (await fetch(server.url)).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(list, /<span class="project-name">First project<\/span>/);
    assert.ok(list.indexOf('First project') < list.indexOf('Café'));
    assert.match(list, /Café &lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
    const paths = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    const detail = await (await fetch(`${server.url}${paths[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/">\s*<button type="submit">Projects<\/button>/);
    assert.equal((await fetch(`${server.url}/projects/999999`)).status, 404);

    await server.stop();
    server = await start(dbPath);
    assert.equal(await (await fetch(server.url)).text(), list);
    assert.match(await (await fetch(`${server.url}${paths[0]}`)).text(), /<h1>First project<\/h1>/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, remain project scoped, and persist completion across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  let server;
  try {
    const dbPath = join(directory, 'workboard.sqlite');
    server = await start(dbPath);
    const post = (path, fields) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const rows = html => [...html.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const initial = await get('/projects/1');
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, />Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const result = await post('/projects/1/tasks', { title });
      assert.equal(result.status, 422);
      const html = await result.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(rows(html).length, 0);
    }
    for (const title of ['  First task  ', 'Second <task> "quoted"']) {
      assert.equal((await post('/projects/1/tasks', { title })).status, 303);
    }
    const all = rows(await get('/projects/1'));
    assert.equal(all.length, 2);
    assert.match(all[0], /aria-label="Complete First task"/);
    assert.match(all[0], /<label for="task-1">First task<\/label>/);
    assert.match(all[1], /Second &lt;task&gt; &quot;quoted&quot;/);
    assert.ok(all.every(row => !row.includes(' checked')));
    assert.equal(rows(await get('/projects/2')).length, 0);
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Missing' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1', { completed: '1' })).status, 303);
    const open = rows(await get('/projects/1?filter=Open'));
    const completed = rows(await get('/projects/1?filter=Completed'));
    assert.equal(open.length, 1);
    assert.match(open[0], /Second &lt;task&gt;/);
    assert.equal(completed.length, 1);
    assert.match(completed[0], /aria-label="Complete First task" checked/);
    const saved = await get('/projects/1');
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), saved);
    assert.equal(rows(await get('/projects/2')).length, 0);
    const unchecked = await post('/projects/1/tasks/1', { filter: 'Completed' });
    assert.equal(unchecked.status, 303);
    assert.equal(unchecked.headers.get('location'), '/projects/1?filter=Completed');
    assert.equal(rows(await get('/projects/1?filter=Completed')).length, 0);
    assert.equal(rows(await get('/projects/1?filter=Open')).length, 2);
    await server.stop();
    server = await start(dbPath);
    assert.equal(rows(await get('/projects/1?filter=Open')).length, 2);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive migration, summaries, read-only tasks, and restoration persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  let server;
  try {
    const dbPath = join(directory, 'workboard.sqlite');
    // Seed the original schema to verify upgrades preserve existing IDs and names.
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      INSERT INTO projects (name) VALUES ('Existing project');`);
    legacy.close();
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const projectRows = html => [...html.matchAll(/<li class="project" data-testid="project-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    const taskRows = html => [...html.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    const initial = await get('/');
    assert.match(initial, /<label for="project-filter">Project filter<\/label>/);
    assert.match(initial, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(initial, /data-testid="project-summary">0\/0 completed/);
    await post('/projects', { name: 'Second project' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1', { completed: '1' });
    assert.match(projectRows(await get('/'))[0], /data-testid="project-summary">1\/2 completed/);
    await get('/projects/1?filter=Completed');
    assert.match(projectRows(await get('/'))[0], /1\/2 completed/);
    const archived = await post('/projects/1/archive');
    assert.equal(archived.status, 303);
    const activeRows = projectRows(await get('/'));
    assert.equal(activeRows.length, 1);
    assert.match(activeRows[0], /Second project/);
    const archivedList = await get('/?filter=Archived');
    const archivedRows = projectRows(archivedList);
    assert.equal(archivedRows.length, 1);
    assert.match(archivedRows[0], /Existing project/);
    assert.match(archivedRows[0], /1\/2 completed/);
    assert.match(archivedRows[0], />Open project<\/button>/);
    assert.match(archivedRows[0], />Restore project<\/button>/);
    assert.doesNotMatch(archivedRows[0], />Archive project<\/button>/);
    const archivedPage = await get('/projects/1');
    assert.match(archivedPage, /<p>Archived project<\/p>/);
    assert.match(archivedPage, /<button type="submit" disabled>Create task/);
    assert.equal(taskRows(archivedPage).length, 2);
    assert.ok(taskRows(archivedPage).every(row => /type="checkbox"[^>]* disabled/.test(row)));
    assert.match(taskRows(archivedPage)[0], /checked disabled/);
    assert.equal(taskRows(await get('/projects/1?filter=Open')).length, 1);
    assert.match(taskRows(await get('/projects/1?filter=Completed'))[0], /Complete Done/);
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1')).status, 403);
    assert.equal(await get('/projects/1'), archivedPage);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/?filter=Archived'), archivedList);
    assert.equal(await get('/projects/1'), archivedPage);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.equal(projectRows(await get('/?filter=Archived')).length, 0);
    const restoredList = await get('/');
    const restoredRows = projectRows(restoredList);
    assert.equal(restoredRows.length, 2);
    assert.match(restoredRows[0], /Existing project/);
    assert.match(restoredRows[1], /Second project/);
    assert.match(restoredRows[0], /1\/2 completed/);
    const restoredPage = await get('/projects/1');
    assert.doesNotMatch(restoredPage, /<(?:button|input)\b[^>]* disabled|<p>Archived project<\/p>/);
    assert.match(taskRows(restoredPage)[0], /checked/);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/'), restoredList);
    assert.equal(await get('/projects/1'), restoredPage);
    assert.equal((await post('/projects/1/tasks/1')).status, 303);
    assert.match(projectRows(await get('/'))[0], /0\/2 completed/);
    assert.equal((await post('/projects/1/tasks', { title: 'After restore' })).status, 303);
    assert.match(projectRows(await get('/'))[0], /0\/3 completed/);
    assert.equal((await post('/projects/999/archive')).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
