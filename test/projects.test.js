import { test } from 'node:test';
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
  let output = '';
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = /listening on port (\d+)/.exec(output);
      if (match) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}`);
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

test('project validation, ordering, navigation and durable IDs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const health = await fetch(`${server.base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const initial = await (await fetch(server.base)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);

    for (const name of ['', ' \t\n ']) {
      const invalid = await fetch(`${server.base}/projects`, {
        method: 'POST', body: new URLSearchParams({ name }),
      });
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }

    for (const name of ['  First project  ', '<script>alert("x")</script>']) {
      const created = await fetch(`${server.base}/projects`, {
        method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
      });
      assert.equal(created.status, 303);
      assert.equal(created.headers.get('location'), '/');
    }
    const list = await (await fetch(server.base)).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(list, /<span>First project<\/span>/);
    assert.match(list, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
    assert.ok(list.indexOf('First project') < list.indexOf('&lt;script&gt;'));
    const routes = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
    assert.equal(routes.length, 2);
    const detail = await (await fetch(`${server.base}${routes[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*>Projects<\/button>/);
    assert.equal((await fetch(`${server.base}/projects/999999`)).status, 404);

    await server.stop();
    server = await startServer(databasePath);
    const restored = await (await fetch(server.base)).text();
    assert.equal(restored, list);
    const restoredDetail = await fetch(`${server.base}${routes[0]}`);
    assert.equal(restoredDetail.status, 200);
    assert.match(await restoredDetail.text(), /<h1>First project<\/h1>/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, stay in their project and persist completion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async (path) => (await fetch(`${server.base}${path}`)).text();
    const rows = (content) => [...content.matchAll(/<div class="task" data-testid="task-row">([\s\S]*?)<\/div>/g)]
      .map((match) => match[1]);
    await post('/projects', { name: 'One' });
    await post('/projects', { name: 'Two' });
    const initial = await html('/projects/1');
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, />Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      const invalid = await response.text();
      assert.match(invalid, /role="alert"[^>]*>Task title is required/);
      assert.equal(rows(invalid).length, 0);
    }
    for (const title of ['  First task  ', '<script>Second</script>']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/projects/1');
    }
    await post('/projects/2/tasks', { title: 'Other project task' });
    const created = rows(await html('/projects/1'));
    assert.equal(created.length, 2);
    assert.match(created[0], /aria-label="Complete First task"/);
    assert.match(created[0], /<label[^>]*>First task<\/label>/);
    assert.match(created[1], /&lt;script&gt;Second&lt;\/script&gt;/);
    assert.doesNotMatch(created.join(''), / checked/);
    assert.equal(rows(await html('/projects/1?filter=Open')).length, 2);
    assert.equal(rows(await html('/projects/1?filter=Completed')).length, 0);
    assert.equal((await post('/projects/1/tasks/1', { completed: '1' })).status, 204);
    assert.match(rows(await html('/projects/1'))[0], / checked/);
    const open = rows(await html('/projects/1?filter=Open'));
    assert.equal(open.length, 1);
    assert.match(open[0], /Second/);
    const completed = rows(await html('/projects/1?filter=Completed'));
    assert.equal(completed.length, 1);
    assert.match(completed[0], /First task/);
    assert.equal((await post('/projects/2/tasks/1', { completed: '0' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1', { completed: 'invalid' })).status, 400);
    assert.equal((await post('/projects/999/tasks', { title: 'Orphan' })).status, 404);
    const other = rows(await html('/projects/2'));
    assert.equal(other.length, 1);
    assert.match(other[0], /Other project task/);
    assert.doesNotMatch(other[0], /First task|Second/);
    const beforeRestart = await html('/projects/1');
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), beforeRestart);
    assert.equal((await post('/projects/1/tasks/1', { completed: '0' })).status, 204);
    assert.equal(rows(await html('/projects/1?filter=Completed')).length, 0);
    assert.equal(rows(await html('/projects/1?filter=Open')).length, 2);
    await server.stop();
    server = await startServer(databasePath);
    assert.doesNotMatch(rows(await html('/projects/1')).join(''), / checked/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive and restore preserve tasks, summaries and state across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async (path) => (await fetch(`${server.base}${path}`)).text();
    const projectRows = (content) => content.split('data-testid="project-row"').slice(1);
    const taskRows = (content) => [...content.matchAll(/<div class="task" data-testid="task-row">([\s\S]*?)<\/div>/g)]
      .map((match) => match[1]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const initial = await html('/');
    assert.match(initial, /<label for="project-filter">Project filter<\/label>/);
    assert.match(initial, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.equal(projectRows(initial).length, 2);
    for (const row of projectRows(initial)) {
      assert.match(row, /data-testid="project-summary">0\/0 completed/);
      assert.match(row, />Archive project<\/button>/);
      assert.doesNotMatch(row, />Restore project<\/button>/);
    }
    await post('/projects/1/tasks', { title: 'Open task' });
    await post('/projects/1/tasks', { title: 'Done task' });
    await post('/projects/1/tasks/2', { completed: '1' });
    await post('/projects/2/tasks', { title: 'Separate task' });
    assert.match(projectRows(await html('/'))[0], /data-testid="project-summary">1\/2 completed/);
    assert.match(projectRows(await html('/'))[1], /data-testid="project-summary">0\/1 completed/);
    await html('/projects/1?filter=Completed');
    assert.match(projectRows(await html('/'))[0], /data-testid="project-summary">1\/2 completed/);

    assert.equal((await post('/projects/1/archive')).status, 303);
    const active = projectRows(await html('/'));
    assert.equal(active.length, 1);
    assert.match(active[0], /<span>Second<\/span>/);
    const archivedList = await html('/?filter=Archived');
    assert.match(archivedList, /<option>Active<\/option><option selected>Archived<\/option>/);
    const archived = projectRows(archivedList);
    assert.equal(archived.length, 1);
    assert.match(archived[0], /<span>First<\/span>/);
    assert.match(archived[0], /data-testid="project-summary">1\/2 completed/);
    assert.match(archived[0], /action="\/projects\/1".*>Open project<\/button>/);
    assert.match(archived[0], />Restore project<\/button>/);
    assert.doesNotMatch(archived[0], />Archive project<\/button>/);
    const detail = await html('/projects/1');
    assert.match(detail, /<p>Archived project<\/p>/);
    assert.match(detail, /<button type="submit" disabled>Create task<\/button>/);
    const archivedTasks = taskRows(detail);
    assert.equal(archivedTasks.length, 2);
    for (const row of archivedTasks) assert.match(row, /<input[^>]* disabled>/);
    assert.doesNotMatch(archivedTasks[0], / checked/);
    assert.match(archivedTasks[1], / checked/);
    assert.match(taskRows(await html('/projects/1?filter=Open'))[0], /Open task/);
    assert.equal(taskRows(await html('/projects/1?filter=Open')).length, 1);
    assert.match(taskRows(await html('/projects/1?filter=Completed'))[0], /Done task/);
    assert.equal(taskRows(await html('/projects/1?filter=Completed')).length, 1);
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1', { completed: '1' })).status, 403);
    assert.equal((await post('/projects/1/tasks/2', { completed: '0' })).status, 403);
    assert.equal(await html('/projects/1'), detail);
    assert.equal((await post('/projects/999/archive')).status, 404);
    assert.equal((await post('/projects/999/restore')).status, 404);

    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/?filter=Archived'), archivedList);
    assert.equal(await html('/projects/1'), detail);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.equal(projectRows(await html('/?filter=Archived')).length, 0);
    const restored = projectRows(await html('/'));
    assert.equal(restored.length, 2);
    assert.match(restored[0], /<span>First<\/span>/);
    assert.match(restored[1], /<span>Second<\/span>/);
    assert.match(restored[0], /data-testid="project-summary">1\/2 completed/);
    const restoredDetail = await html('/projects/1');
    assert.doesNotMatch(restoredDetail, /<p>Archived project<\/p>/);
    assert.match(restoredDetail, /<button type="submit">Create task<\/button>/);
    for (const row of taskRows(restoredDetail)) assert.doesNotMatch(row, / disabled/);
    assert.equal((await post('/projects/1/tasks/1', { completed: '1' })).status, 204);
    assert.equal((await post('/projects/1/tasks', { title: 'After restore' })).status, 303);
    const restoredList = await html('/');
    assert.match(projectRows(restoredList)[0], /data-testid="project-summary">2\/3 completed/);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html('/'), restoredList);
    assert.equal(taskRows(await html('/projects/1')).length, 3);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});


test('existing task databases migrate without losing IDs or completion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-migration-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    const database = new DatabaseSync(databasePath);
    try {
      database.exec(`
        CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
        CREATE TABLE tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL REFERENCES projects(id),
          title TEXT NOT NULL,
          completed INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO projects (id, name) VALUES (42, 'Existing project');
        INSERT INTO tasks (id, project_id, title, completed) VALUES (73, 42, 'Existing task', 1);
      `);
    } finally {
      database.close();
    }
    server = await startServer(databasePath);
    const list = await (await fetch(server.base)).text();
    assert.match(list, /Existing project/);
    assert.match(list, /data-testid="project-summary">1\/1 completed/);
    assert.match(list, /action="\/projects\/42"/);
    const detail = await (await fetch(`${server.base}/projects/42`)).text();
    assert.match(detail, /data-task-id="73"/);
    assert.match(detail, /aria-label="Complete Existing task" checked>/);
    assert.doesNotMatch(detail, /<p>Archived project<\/p>/);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await (await fetch(server.base)).text(), list);
    assert.equal(await (await fetch(`${server.base}/projects/42`)).text(), detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
