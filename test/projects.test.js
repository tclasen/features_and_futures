import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { openProjectStore } from '../store.js';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Server startup timed out: ${stderr}`)), 5000);
      let stdout = '';
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
        const match = /listening on port (\d+)/.exec(stdout);
        if (match) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      });
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Server exited with ${code}: ${stderr}`));
      });
    });
    return {
      url: `http://127.0.0.1:${port}`,
      async stop() {
        if (child.exitCode !== null) return;
        const exited = once(child, 'exit');
        child.kill('SIGTERM');
        await exited;
      },
    };
  } catch (error) {
    child.kill('SIGKILL');
    throw error;
  }
}

test('project validation, navigation, order, escaping, and restart persistence', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.test-runtime-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const initial = await (await fetch(server.url)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);

    const create = (name) => fetch(`${server.url}/projects`, {
      method: 'POST',
      body: new URLSearchParams({ name }),
      redirect: 'manual',
    });
    for (const name of ['', ' \t\n ']) {
      const response = await create(name);
      assert.equal(response.status, 422);
      const html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }

    const first = await create('  Alpha  ');
    assert.equal(first.status, 303);
    assert.equal(first.headers.get('location'), '/');
    assert.equal((await create('Second <script>alert("x")</script>')).status, 303);
    const list = await (await fetch(server.url)).text();
    assert.equal((list.match(/data-testid="project-row"/g) ?? []).length, 2);
    assert.match(list, /<span>Alpha<\/span>/);
    assert.ok(list.indexOf('Alpha') < list.indexOf('Second'));
    assert.match(list, /Second &lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
    const projectPaths = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
    assert.equal(projectPaths.length, 2);
    const detail = await (await fetch(`${server.url}${projectPaths[0]}`)).text();
    assert.match(detail, /<h1>Alpha<\/h1>/);
    assert.match(detail, /action="\/".*>Projects<\/button>/);

    const invalid = await create('   ');
    assert.equal((await invalid.text()).match(/data-testid="project-row"/g).length, 2);
    assert.equal((await fetch(`${server.url}/projects/999999`)).status, 404);
    assert.equal((await fetch(`${server.url}/projects/999999999999999999999`)).status, 404);

    await server.stop();
    server = await startServer(databasePath);
    const restartedList = await (await fetch(server.url)).text();
    assert.equal(restartedList, list);
    const restartedDetail = await (await fetch(`${server.url}${projectPaths[0]}`)).text();
    assert.equal(restartedDetail, detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('existing project databases gain task storage without changing projects', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.test-runtime-'));
  const databasePath = join(directory, 'legacy.sqlite');
  let store;
  try {
    const legacy = new DatabaseSync(databasePath);
    try {
      legacy.exec(`
        CREATE TABLE projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL CHECK (length(trim(name)) > 0)
        );
        INSERT INTO projects (id, name) VALUES (42, 'Existing project');
      `);
    } finally {
      legacy.close();
    }
    store = openProjectStore(databasePath);
    assert.deepEqual({ ...store.find(42) }, { id: 42, name: 'Existing project', archived: 0 });
    assert.deepEqual(store.listTasks(42), []);
    assert.throws(() => store.createTask(42, ' \t\n '), /Task title is required/);
    assert.throws(() => store.createTask(999, 'Orphan'), /FOREIGN KEY constraint failed/);
    const taskId = store.createTask(42, '  Preserved task  ');
    assert.equal(store.setTaskCompleted(42, taskId, true), true);
    store.close();
    store = openProjectStore(databasePath);
    assert.deepEqual({ ...store.find(42) }, { id: 42, name: 'Existing project', archived: 0 });
    assert.deepEqual(store.listTasks(42).map((task) => ({ ...task })), [
      { id: taskId, title: 'Preserved task', completed: 1 },
    ]);
    assert.equal(store.create('Next project'), 43);
  } finally {
    if (store) store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, stay within their project, and persist completion across restarts', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.test-runtime-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, fields) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const page = async (path) => (await fetch(`${server.url}${path}`)).text();
    const rowCount = (html) => (html.match(/data-testid="task-row"/g) ?? []).length;
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const initial = await page('/projects/1');
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, />Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /value="all" selected>All/);
    assert.match(initial, /value="open">Open/);
    assert.match(initial, /value="completed">Completed/);
    assert.equal(rowCount(initial), 0);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 422);
      const html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(rowCount(html), 0);
    }
    const created = await post('/projects/1/tasks', { title: '  Write proposal  ' });
    assert.equal(created.status, 303);
    assert.equal(created.headers.get('location'), '/projects/1?filter=all');
    await post('/projects/1/tasks', { title: 'Review <draft> "today"' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    const all = await page('/projects/1');
    assert.equal(rowCount(all), 2);
    assert.match(all, /<span>Write proposal<\/span>/);
    assert.match(all, /aria-label="Complete Write proposal" onchange=/);
    assert.match(all, /aria-label="Complete Review &lt;draft&gt; &quot;today&quot;"/);
    assert.ok(all.indexOf('<span>Write proposal') < all.indexOf('<span>Review'));
    assert.doesNotMatch(all, /Other project task/);
    assert.doesNotMatch(all, / checked/);
    assert.equal(rowCount(await page('/projects/1?filter=open')), 2);
    assert.equal(rowCount(await page('/projects/1?filter=completed')), 0);

    const completion = '/projects/1/tasks/1/completion';
    const completed = await post(completion, { completed: 'on', filter: 'open' });
    assert.equal(completed.status, 303);
    assert.equal(completed.headers.get('location'), '/projects/1?filter=open');
    const savedAll = await page('/projects/1');
    assert.match(savedAll, /aria-label="Complete Write proposal" checked/);
    const open = await page('/projects/1?filter=open');
    assert.equal(rowCount(open), 1);
    assert.doesNotMatch(open, /Write proposal/);
    assert.match(open, /value="open" selected>Open/);
    const done = await page('/projects/1?filter=completed');
    assert.equal(rowCount(done), 1);
    assert.match(done, /Write proposal/);
    assert.doesNotMatch(done, /Review &lt;draft&gt;/);
    const second = await page('/projects/2');
    assert.equal(rowCount(second), 1);
    assert.doesNotMatch(second, /Write proposal|Review &lt;draft&gt;/);
    assert.equal((await post('/projects/2/tasks/1/completion', { completed: 'on' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999999/completion', { completed: 'on' })).status, 404);
    assert.equal((await post('/projects/999999/tasks', { title: 'Orphan' })).status, 404);
    assert.equal((await post('/projects/1/tasks', { title: '   ' })).status, 422);
    assert.equal(await page('/projects/1'), savedAll);
    assert.equal(rowCount(await page('/projects/1?filter=unknown')), 2);

    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await page('/projects/1'), savedAll);
    assert.equal(await page('/projects/1?filter=open'), open);
    assert.equal(await page('/projects/1?filter=completed'), done);
    assert.equal(await page('/projects/2'), second);
    assert.equal((await post(completion, { filter: 'completed' })).status, 303);
    assert.equal(rowCount(await page('/projects/1?filter=completed')), 0);
    assert.equal(rowCount(await page('/projects/1?filter=open')), 2);
    await server.stop();
    server = await startServer(databasePath);
    assert.doesNotMatch(await page('/projects/1'), / checked/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive and restore preserve tasks, enforce read-only pages, and persist summaries', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.test-runtime-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const page = async (path) => (await fetch(`${server.url}${path}`)).text();
    const rowCount = (html, kind) => (html.match(new RegExp(`data-testid="${kind}-row"`, 'g')) ?? []).length;
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const initial = await page('/');
    assert.match(initial, /<label for="project-filter">Project filter<\/label>/);
    assert.match(initial, /value="active" selected>Active/);
    assert.match(initial, /value="archived">Archived/);
    assert.equal((initial.match(/data-testid="project-summary">0\/0 completed/g) ?? []).length, 2);
    assert.match(initial, />Archive project<\/button>/);
    assert.doesNotMatch(initial, />Restore project<\/button>/);
    await post('/projects/1/tasks', { title: 'Done task' });
    await post('/projects/1/tasks', { title: 'Open task' });
    await post('/projects/1/tasks/1/completion', { completed: 'on' });
    await page('/projects/1?filter=open');
    assert.match(await page('/'), /data-testid="project-summary">1\/2 completed/);

    const archived = await post('/projects/1/archive');
    assert.equal(archived.status, 303);
    assert.equal(archived.headers.get('location'), '/?filter=active');
    assert.equal(rowCount(await page('/'), 'project'), 1);
    assert.doesNotMatch(await page('/'), /<span>First<\/span>/);
    const archivedList = await page('/?filter=archived');
    assert.equal(rowCount(archivedList, 'project'), 1);
    assert.match(archivedList, /<span>First<\/span>/);
    assert.match(archivedList, /data-testid="project-summary">1\/2 completed/);
    assert.match(archivedList, />Open project<\/button>/);
    assert.match(archivedList, />Restore project<\/button>/);
    assert.doesNotMatch(archivedList, />Archive project<\/button>/);
    const detail = await page('/projects/1');
    assert.match(detail, /<p>Archived project<\/p>/);
    assert.match(detail, /<button type="submit" disabled>Create task/);
    assert.equal((detail.match(/type="checkbox"[^>]* disabled/g) ?? []).length, 2);
    assert.match(detail, /aria-label="Complete Done task" checked disabled/);
    assert.equal(rowCount(detail, 'task'), 2);
    const open = await page('/projects/1?filter=open');
    assert.equal(rowCount(open, 'task'), 1);
    assert.doesNotMatch(open, /Done task/);
    const completed = await page('/projects/1?filter=completed');
    assert.equal(rowCount(completed, 'task'), 1);
    assert.doesNotMatch(completed, /Open task/);
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked task' })).status, 409);
    assert.equal((await post('/projects/1/tasks/1/completion')).status, 409);
    assert.equal(await page('/projects/1'), detail);
    assert.equal((await post('/projects/999/archive')).status, 404);
    assert.equal((await post('/projects/999999999999999999999/restore')).status, 404);

    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await page('/?filter=archived'), archivedList);
    assert.equal(await page('/projects/1'), detail);
    const restored = await post('/projects/1/restore');
    assert.equal(restored.status, 303);
    assert.equal(restored.headers.get('location'), '/?filter=archived');
    assert.equal(rowCount(await page('/?filter=archived'), 'project'), 0);
    const active = await page('/');
    assert.equal(rowCount(active, 'project'), 2);
    assert.ok(active.indexOf('<span>First') < active.indexOf('<span>Second'));
    assert.match(active, /data-testid="project-summary">1\/2 completed/);
    const restoredDetail = await page('/projects/1');
    assert.doesNotMatch(restoredDetail, /<(?:button|input)\b[^>]* disabled|<p>Archived project<\/p>/);
    assert.match(restoredDetail, /aria-label="Complete Done task" checked/);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await page('/'), active);
    assert.equal(await page('/projects/1'), restoredDetail);
    assert.equal((await post('/projects/1/tasks/1/completion')).status, 303);
    assert.match(await page('/'), /data-testid="project-summary">0\/2 completed/);
    assert.equal((await post('/projects/1/tasks', { title: 'After restoration' })).status, 303);
    assert.match(await page('/'), /data-testid="project-summary">0\/3 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task database upgrade preserves IDs and completion and store rejects archived mutations', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.test-runtime-'));
  const databasePath = join(directory, 'legacy-tasks.sqlite');
  let store;
  try {
    const legacy = new DatabaseSync(databasePath);
    try {
      legacy.exec(`
        CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
        CREATE TABLE tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL REFERENCES projects(id),
          title TEXT NOT NULL,
          completed INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO projects (id, name) VALUES (42, 'Existing');
        INSERT INTO tasks (id, project_id, title, completed) VALUES (17, 42, 'Saved task', 1);
      `);
    } finally {
      legacy.close();
    }
    store = openProjectStore(databasePath);
    assert.deepEqual({ ...store.list()[0] }, {
      id: 42, name: 'Existing', archived: 0, total_count: 1, completed_count: 1,
    });
    store.setArchived(42, true);
    assert.throws(() => store.createTask(42, 'Blocked'), /Archived project/);
    assert.throws(() => store.setTaskCompleted(42, 17, false), /Archived project/);
    assert.throws(() => store.rename(42, 'Blocked rename'), /Archived project/);
    store.close();
    store = openProjectStore(databasePath);
    assert.deepEqual(store.list(), []);
    assert.equal(store.list('archived')[0].completed_count, 1);
    assert.deepEqual({ ...store.listTasks(42)[0] }, { id: 17, title: 'Saved task', completed: 1 });
    store.setArchived(42, false);
    assert.throws(() => store.rename(42, ' \t\n '), /Project name is required/);
    assert.equal(store.rename(999, 'Missing'), false);
    assert.equal(store.rename(42, '  Renamed existing  '), true);
    assert.equal(store.find(42).name, 'Renamed existing');
    assert.equal(store.createTask(42, 'Next task'), 18);
    assert.equal(store.create('Next project'), 43);
  } finally {
    if (store) store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('renaming validates, preserves project identity and tasks, and survives archive, restore, and restarts', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.test-runtime-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const page = async (path) => (await fetch(`${server.url}${path}`)).text();
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Completed task' });
    await post('/projects/1/tasks', { title: 'Open task' });
    await post('/projects/1/tasks/1/completion', { completed: 'on' });
    const initial = await page('/projects/1');
    assert.match(initial, /<label for="new-project-name">New project name<\/label>/);
    assert.match(initial, /<input id="new-project-name" name="name" type="text">/);
    assert.match(initial, /<button type="submit">Rename project<\/button>/);
    for (const name of ['', ' \t\n ']) {
      const response = await post('/projects/1/rename', { name, filter: 'open' });
      assert.equal(response.status, 422);
      const html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.match(html, /<h1>Original<\/h1>/);
      assert.match(html, /value="open" selected>Open/);
      assert.equal(await page('/projects/1'), initial);
    }
    const renamed = await post('/projects/1/rename', { name: '  Renamed <board> "one"  ', filter: 'completed' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=completed');
    const detail = await page('/projects/1');
    assert.match(detail, /<h1>Renamed &lt;board&gt; &quot;one&quot;<\/h1>/);
    assert.match(detail, /aria-label="Complete Completed task" checked/);
    assert.match(detail, /aria-label="Complete Open task" onchange=/);
    assert.equal((detail.match(/data-testid="task-row"/g) ?? []).length, 2);
    const list = await page('/');
    assert.match(list, /<span>Renamed &lt;board&gt; &quot;one&quot;<\/span>/);
    assert.ok(list.indexOf('<span>Renamed') < list.indexOf('<span>Second'));
    assert.match(list, /action="\/projects\/1"/);
    assert.match(list, /data-testid="project-summary">1\/2 completed/);
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
    assert.equal((await post('/projects/999999999999999999999/rename', { name: 'Missing' })).status, 404);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await page('/projects/1'), detail);
    assert.equal(await page('/'), list);

    await post('/projects/1/archive');
    const archived = await page('/projects/1');
    assert.match(archived, /<input id="new-project-name" name="name" type="text" disabled>/);
    assert.match(archived, /<button type="submit" disabled>Rename project<\/button>/);
    assert.equal((await post('/projects/1/rename', { name: 'Blocked' })).status, 409);
    assert.equal(await page('/projects/1'), archived);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await page('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await page('/projects/1'), detail);
    assert.equal((await post('/projects/1/rename', { name: '  After restoration  ' })).status, 303);
    const restored = await page('/projects/1');
    assert.match(restored, /<h1>After restoration<\/h1>/);
    assert.match(restored, /aria-label="Complete Completed task" checked/);
    const restoredList = await page('/');
    assert.ok(restoredList.indexOf('<span>After restoration') < restoredList.indexOf('<span>Second'));
    assert.match(restoredList, /data-testid="project-summary">1\/2 completed/);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await page('/projects/1'), restored);
    assert.equal(await page('/'), restoredList);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
