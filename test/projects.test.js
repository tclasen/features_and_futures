import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function launch(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => {
      clearTimeout(timer);
      reject(new Error(`Server exited (${code}): ${errors}`));
    });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
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

test('projects validate, render safely, navigate, and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'workboard.sqlite');
  let app;
  try {
    app = await launch(databasePath);
    const health = await fetch(`${app.base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    let html = await (await fetch(app.base)).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, />Create project<\/button>/);
    assert.doesNotMatch(html, /data-testid="project-row"/);

    const create = name => fetch(`${app.base}/projects`, {
      method: 'POST',
      body: new URLSearchParams({ name }),
      redirect: 'manual',
    });
    for (const name of ['', ' \t\n ']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      const invalidHtml = await invalid.text();
      assert.match(invalidHtml, /role="alert">Project name is required/);
      assert.doesNotMatch(invalidHtml, /data-testid="project-row"/);
    }
    for (const name of ['  First project  ', '<script>alert("x")</script>']) {
      const response = await create(name);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    html = await (await fetch(app.base)).text();
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(html, /<span>First project<\/span>/);
    assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script>/);
    assert.ok(html.indexOf('First project') < html.indexOf('&lt;script&gt;'));
    const projectPaths = [...html.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(projectPaths.length, 2);
    const detail = await (await fetch(`${app.base}${projectPaths[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/"/);
    assert.match(detail, />Projects<\/button>/);
    assert.equal((await fetch(`${app.base}/projects/999`)).status, 404);

    await app.stop();
    app = undefined;
    app = await launch(databasePath);
    const persisted = await (await fetch(app.base)).text();
    assert.equal(persisted, html);
    const persistedDetail = await fetch(`${app.base}${projectPaths[0]}`);
    assert.equal(persistedDetail.status, 200);
    assert.match(await persistedDetail.text(), /<h1>First project<\/h1>/);
  } finally {
    if (app) await app.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, remain project-owned, and save completion across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let app;
  try {
    // Start with the Task 001 schema to verify a compatible database upgrade.
    const existingDatabase = new DatabaseSync(databasePath);
    try {
      existingDatabase.exec(`
        CREATE TABLE projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL CHECK(length(trim(name)) > 0)
        );
        INSERT INTO projects (name) VALUES ('One');
      `);
    } finally {
      existingDatabase.close();
    }
    app = await launch(databasePath);
    const post = (path, values) => fetch(`${app.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const getPage = async path => (await fetch(`${app.base}${path}`)).text();
    const rows = html => [...html.matchAll(/<li data-testid="task-row">[\s\S]*?<\/li>/g)].map(match => match[0]);

    await post('/projects', { name: 'Two' });
    let html = await getPage('/projects/1');
    assert.match(html, /<h1>One<\/h1>/);
    assert.match(html, /<label for="task-title">Task title<\/label>/);
    assert.match(html, />Create task<\/button>/);
    assert.match(html, /<label for="task-filter">Task filter<\/label>/);
    assert.match(html, /<option selected>All<\/option>/);
    assert.match(html, /<option>Open<\/option>/);
    assert.match(html, /<option>Completed<\/option>/);
    assert.equal(rows(html).length, 0);

    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(rows(html).length, 0);
    }
    for (const title of ['  First task  ', '<script>"second"</script>']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/projects/1');
    }
    await post('/projects/2/tasks', { title: 'Other project task' });
    html = await getPage('/projects/1');
    const taskRows = rows(html);
    assert.equal(taskRows.length, 2);
    assert.match(taskRows[0], /<span>First task<\/span>/);
    assert.match(taskRows[0], /type="checkbox".*aria-label="Complete First task"/);
    assert.match(taskRows[1], /&lt;script&gt;&quot;second&quot;&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script>/);
    assert.doesNotMatch(taskRows.join(''), / checked/);
    assert.doesNotMatch(html, /Other project task/);
    assert.equal(rows(await getPage('/projects/1?filter=Open')).length, 2);
    assert.equal(rows(await getPage('/projects/1?filter=Completed')).length, 0);

    const completionPath = taskRows[0].match(/action="([^"]+\/completion)"/)[1];
    const completed = await post(completionPath, { completed: '1', filter: 'Open' });
    assert.equal(completed.status, 303);
    assert.equal(completed.headers.get('location'), '/projects/1?filter=Open');
    const completedPage = await getPage('/projects/1?filter=Completed');
    assert.equal(rows(completedPage).length, 1);
    assert.match(rows(completedPage)[0], / checked/);
    assert.match(completedPage, /<option selected>Completed<\/option>/);
    const openRows = rows(await getPage('/projects/1?filter=Open'));
    assert.equal(openRows.length, 1);
    assert.match(openRows[0], /second/);
    const invalid = await post('/projects/1/tasks', { title: '   ' });
    assert.equal(rows(await invalid.text()).length, 2);

    const crossProject = await post(completionPath.replace('/projects/1/', '/projects/2/'), {});
    assert.equal(crossProject.status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Orphan' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/completion', {})).status, 404);
    const otherPage = await getPage('/projects/2');
    assert.equal(rows(otherPage).length, 1);
    assert.match(otherPage, /Other project task/);
    assert.doesNotMatch(rows(otherPage)[0], / checked/);
    assert.match(await getPage('/projects/1?filter=invalid'), /<option selected>All<\/option>/);

    const savedPage = await getPage('/projects/1');
    await app.stop();
    app = undefined;
    app = await launch(databasePath);
    assert.equal(await getPage('/projects/1'), savedPage);
    assert.equal(await getPage('/projects/1?filter=Completed'), completedPage);
    assert.equal(await getPage('/projects/2'), otherPage);

    assert.equal((await post(completionPath, {})).status, 303);
    html = await getPage('/projects/1');
    assert.equal(rows(html).length, 2);
    assert.doesNotMatch(rows(html).join(''), / checked/);
    assert.equal(rows(await getPage('/projects/1?filter=Completed')).length, 0);
    await app.stop();
    app = undefined;
    app = await launch(databasePath);
    assert.equal(await getPage('/projects/1'), html);
  } finally {
    if (app) await app.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive migration, summaries, read-only tasks, and restoration persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let app;
  try {
    // Upgrade a Task 002 database with existing tasks and completion state.
    const existingDatabase = new DatabaseSync(databasePath);
    try {
      existingDatabase.exec(`
        CREATE TABLE projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL CHECK(length(trim(name)) > 0)
        );
        CREATE TABLE tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL REFERENCES projects(id),
          title TEXT NOT NULL CHECK(length(trim(title)) > 0),
          completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1))
        );
        INSERT INTO projects (name) VALUES ('Existing project');
        INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Done', 1), (1, 'Pending', 0);
      `);
    } finally {
      existingDatabase.close();
    }
    app = await launch(databasePath);
    const post = (path, values = {}) => fetch(`${app.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const getPage = async path => (await fetch(`${app.base}${path}`)).text();
    const rows = (html, type) => [...html.matchAll(new RegExp(`<li data-testid="${type}-row">[\\s\\S]*?<\\/li>`, 'g'))].map(match => match[0]);
    const summary = (row, counts) => assert.ok(row.includes(`data-testid="project-summary">${counts} completed`));

    await post('/projects', { name: 'New project' });
    let active = await getPage('/');
    assert.match(active, /<label for="project-filter">Project filter<\/label>/);
    assert.match(active, /<option selected>Active<\/option>/);
    assert.match(active, /<option>Archived<\/option>/);
    const initialRows = rows(active, 'project');
    assert.equal(initialRows.length, 2);
    assert.match(initialRows[0], /Existing project/);
    summary(initialRows[0], '1/2');
    summary(initialRows[1], '0/0');
    assert.match(initialRows[0], />Archive project<\/button>/);
    assert.doesNotMatch(active, />Restore project<\/button>/);
    assert.equal(rows(await getPage('/?filter=Archived'), 'project').length, 0);
    assert.match(await getPage('/?filter=invalid'), /<option selected>Active<\/option>/);

    await getPage('/projects/1?filter=Completed');
    summary(rows(await getPage('/'), 'project')[0], '1/2');
    const archive = await post('/projects/1/archive');
    assert.equal(archive.status, 303);
    assert.equal(archive.headers.get('location'), '/');
    active = await getPage('/');
    assert.equal(rows(active, 'project').length, 1);
    assert.doesNotMatch(active, /Existing project/);
    let archived = await getPage('/?filter=Archived');
    assert.match(archived, /<option selected>Archived<\/option>/);
    const archivedRows = rows(archived, 'project');
    assert.equal(archivedRows.length, 1);
    assert.match(archivedRows[0], />Open project<\/button>/);
    assert.match(archivedRows[0], />Restore project<\/button>/);
    assert.doesNotMatch(archivedRows[0], />Archive project<\/button>/);
    summary(archivedRows[0], '1/2');
    const detail = await getPage('/projects/1');
    assert.match(detail, /<h1>Existing project<\/h1>/);
    assert.match(detail, /<p>Archived project<\/p>/);
    assert.match(detail, /<button type="submit" disabled>Create task<\/button>/);
    const tasks = rows(detail, 'task');
    assert.equal(tasks.length, 2);
    assert.match(tasks[0], /aria-label="Complete Done" checked disabled/);
    assert.match(tasks[1], /aria-label="Complete Pending" disabled/);
    assert.equal(rows(await getPage('/projects/1?filter=Completed'), 'task').length, 1);
    assert.equal(rows(await getPage('/projects/1?filter=Open'), 'task').length, 1);

    // Disabled controls are backed by server guards, including crafted requests.
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked' })).status, 409);
    assert.equal((await post('/projects/1/tasks/1/completion')).status, 409);
    assert.equal((await post('/projects/1/tasks/2/completion', { completed: '1' })).status, 409);
    assert.equal(await getPage('/projects/1'), detail);
    assert.equal(await getPage('/?filter=Archived'), archived);
    assert.equal((await post('/projects/999/archive')).status, 404);
    assert.equal((await post('/projects/999/restore')).status, 404);

    await app.stop();
    app = undefined;
    app = await launch(databasePath);
    assert.equal(await getPage('/'), active);
    assert.equal(await getPage('/?filter=Archived'), archived);
    assert.equal(await getPage('/projects/1'), detail);

    const restore = await post('/projects/1/restore');
    assert.equal(restore.status, 303);
    assert.equal(restore.headers.get('location'), '/?filter=Archived');
    assert.equal(rows(await getPage('/?filter=Archived'), 'project').length, 0);
    active = await getPage('/');
    const restoredRows = rows(active, 'project');
    assert.equal(restoredRows.length, 2);
    assert.match(restoredRows[0], /Existing project/);
    summary(restoredRows[0], '1/2');
    const restored = await getPage('/projects/1');
    assert.doesNotMatch(restored, /Archived project| disabled/);
    assert.equal(rows(restored, 'task').length, 2);
    assert.match(rows(restored, 'task')[0], / checked/);
    assert.doesNotMatch(rows(restored, 'task')[1], / checked/);
    await post('/projects/1/tasks/2/completion', { completed: '1' });
    await post('/projects/1/tasks', { title: 'After restoration' });
    summary(rows(await getPage('/'), 'project')[0], '2/3');
    const saved = await getPage('/projects/1');
    active = await getPage('/');
    await app.stop();
    app = undefined;
    app = await launch(databasePath);
    assert.equal(await getPage('/'), active);
    assert.equal(await getPage('/projects/1'), saved);
  } finally {
    if (app) await app.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
