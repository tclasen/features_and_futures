import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server did not start: ${stderr}`));
    }, 5000);
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = /listening on port (\d+)/.exec(output);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited (${code}): ${stderr}`));
    });
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

async function createProject(url, name) {
  return fetch(`${url}/projects`, {
    method: 'POST',
    body: new URLSearchParams({ name }),
    redirect: 'manual',
  });
}

function rows(html) {
  return [...html.matchAll(/<li data-testid="project-row">([\s\S]*?)<\/li>/g)]
    .map((match) => ({
      name: /<span>(.*?)<\/span>/.exec(match[1])[1],
      path: /action="([^"]+)"/.exec(match[1])[1],
    }));
}

function taskRows(html) {
  return [...html.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)]
    .map((match) => ({
      title: /<span>(.*?)<\/span>/.exec(match[1])[1],
      action: /action="([^"]+)"/.exec(match[1])[1],
      completed: / checked/.test(match[1]),
    }));
}

async function post(url, path, fields) {
  return fetch(`${url}${path}`, {
    method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
  });
}

test('tasks validate, filter, remain isolated, and persist completion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let app;
  try {
    app = await start(databasePath);
    await createProject(app.url, 'First');
    await createProject(app.url, 'Second');
    const [first, second] = rows(await (await fetch(app.url)).text());
    const detail = async (path = first.path) => (await fetch(`${app.url}${path}`)).text();
    const initial = await detail();
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, />Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const invalid = await post(app.url, `${first.path}/tasks`, { title });
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.deepEqual(taskRows(html), []);
    }
    for (const title of ['  Plan  ', '<b>Build</b> & ship']) {
      const created = await post(app.url, `${first.path}/tasks`, { title });
      assert.equal(created.status, 303);
    }
    const tasks = taskRows(await detail());
    assert.deepEqual(tasks.map((task) => task.title), ['Plan', '&lt;b&gt;Build&lt;/b&gt; &amp; ship']);
    assert.ok(tasks.every((task) => !task.completed));
    assert.match(await detail(), /aria-label="Complete Plan"/);
    assert.deepEqual(taskRows(await detail(second.path)), []);
    assert.equal((await post(app.url, tasks[0].action.replace(first.path, second.path), { completed: '1' })).status, 404);
    assert.equal((await post(app.url, '/projects/99999/tasks', { title: 'No' })).status, 404);
    const completed = await post(app.url, tasks[0].action, { completed: '1', filter: 'Open' });
    assert.equal(completed.status, 303);
    assert.equal(completed.headers.get('location'), `${first.path}?filter=Open`);
    assert.deepEqual(taskRows(await detail(`${first.path}?filter=Open`)).map((task) => task.title), [tasks[1].title]);
    assert.deepEqual(taskRows(await detail(`${first.path}?filter=Completed`)).map((task) => task.title), ['Plan']);
    const saved = taskRows(await detail());
    assert.equal(saved[0].completed, true);
    assert.equal(saved[1].completed, false);
    assert.deepEqual(taskRows(await detail(`${first.path}?filter=invalid`)), saved);
    const invalid = await post(app.url, `${first.path}/tasks`, { title: '   ' });
    assert.deepEqual(taskRows(await invalid.text()), saved);
    await app.stop();
    app = await start(databasePath);
    assert.deepEqual(taskRows(await detail()), saved);
    assert.deepEqual(taskRows(await detail(second.path)), []);
    assert.equal((await post(app.url, tasks[0].action, {})).status, 303);
    assert.deepEqual(taskRows(await detail(`${first.path}?filter=Completed`)), []);
    await app.stop();
    app = await start(databasePath);
    assert.ok(taskRows(await detail()).every((task) => !task.completed));
  } finally {
    if (app) await app.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive and restore migrate existing data, preserve summaries, and reject archived writes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const databasePath = join(directory, 'workboard.sqlite');
  // Simulate the pre-archive schema and persisted task data.
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Existing');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Done', 1), (1, 'Pending', 0);
  `);
  database.close();
  let app;
  try {
    app = await start(databasePath);
    const list = async (filter = 'Active') => (await fetch(`${app.url}/?filter=${filter}`)).text();
    const detail = async (filter = 'All') => (await fetch(`${app.url}/projects/1?filter=${filter}`)).text();
    assert.match(await list(), /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(await list(), /data-testid="project-summary">1\/2 completed/);
    assert.match(await list(), />Archive project<\/button>/);
    await createProject(app.url, 'New');
    assert.match(await list(), /data-testid="project-summary">0\/0 completed/);
    const savedTasks = taskRows(await detail());
    assert.equal((await post(app.url, '/projects/1/archive', {})).status, 303);
    assert.deepEqual(rows(await list()).map((row) => row.name), ['New']);
    assert.deepEqual(rows(await list('Archived')).map((row) => row.name), ['Existing']);
    assert.match(await list('Archived'), />Restore project<\/button>/);
    assert.match(await list('Archived'), /data-testid="project-summary">1\/2 completed/);
    const archived = await detail();
    assert.match(archived, /<p>Archived project<\/p>/);
    assert.match(archived, /<button type="submit" disabled>Create task/);
    assert.equal((archived.match(/type="checkbox"[^>]* disabled/g) || []).length, 2);
    assert.deepEqual(taskRows(await detail('Open')).map((task) => task.title), ['Pending']);
    assert.deepEqual(taskRows(await detail('Completed')).map((task) => task.title), ['Done']);
    assert.equal((await post(app.url, '/projects/1/tasks', { title: 'Blocked' })).status, 409);
    assert.equal((await post(app.url, savedTasks[0].action, {})).status, 409);
    await app.stop();
    app = await start(databasePath);
    assert.deepEqual(taskRows(await detail()), savedTasks);
    assert.match(await detail(), /Archived project/);
    assert.match(await list('Archived'), /1\/2 completed/);
    assert.equal((await post(app.url, '/projects/1/restore', {})).status, 303);
    assert.deepEqual(rows(await list()).map((row) => row.name), ['Existing', 'New']);
    assert.deepEqual(rows(await list('Archived')), []);
    assert.doesNotMatch(await detail(), / disabled|Archived project/);
    assert.deepEqual(taskRows(await detail()), savedTasks);
    await app.stop();
    app = await start(databasePath);
    assert.deepEqual(rows(await list()).map((row) => row.name), ['Existing', 'New']);
    assert.match(await list(), /1\/2 completed/);
    assert.equal((await post(app.url, savedTasks[1].action, { completed: '1' })).status, 303);
    assert.match(await list(), /2\/2 completed/);
    assert.equal((await post(app.url, '/projects/99999/archive', {})).status, 404);
  } finally {
    if (app) await app.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('renaming preserves identity, order, tasks, and summaries across restarts and restoration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let app;
  try {
    app = await start(databasePath);
    await createProject(app.url, 'Original');
    await createProject(app.url, 'Second');
    const originalRows = rows(await (await fetch(app.url)).text());
    const path = originalRows[0].path;
    const detail = async () => (await fetch(`${app.url}${path}`)).text();
    const list = async () => (await fetch(app.url)).text();
    assert.match(await detail(), /<label for="new-project-name">New project name<\/label>/);
    assert.match(await detail(), /<button type="submit">Rename project<\/button>/);
    await post(app.url, `${path}/tasks`, { title: 'Done' });
    await post(app.url, `${path}/tasks`, { title: 'Pending' });
    const tasks = taskRows(await detail());
    await post(app.url, tasks[0].action, { completed: '1' });
    const savedTasks = taskRows(await detail());
    for (const name of ['', ' \t\n ']) {
      const invalid = await post(app.url, `${path}/rename`, { name });
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.match(html, /<h1>Original<\/h1>/);
      assert.deepEqual(taskRows(html), savedTasks);
      assert.deepEqual(rows(await list()), originalRows);
    }
    const renamed = await post(app.url, `${path}/rename`, { name: '  Renamed <name> & team  ', filter: 'Open' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), `${path}?filter=Open`);
    const expectedName = 'Renamed &lt;name&gt; &amp; team';
    assert.match(await detail(), /<h1>Renamed &lt;name&gt; &amp; team<\/h1>/);
    assert.deepEqual(rows(await list()), [{ name: expectedName, path }, originalRows[1]]);
    assert.match(await list(), /data-testid="project-summary">1\/2 completed/);
    assert.deepEqual(taskRows(await detail()), savedTasks);
    await app.stop();
    app = await start(databasePath);
    assert.deepEqual(rows(await list()), [{ name: expectedName, path }, originalRows[1]]);
    assert.deepEqual(taskRows(await detail()), savedTasks);
    await post(app.url, `${path}/archive`, {});
    const archived = await detail();
    assert.match(archived, /id="new-project-name"[^>]* disabled/);
    assert.match(archived, /<button type="submit" disabled>Rename project/);
    assert.equal((await post(app.url, `${path}/rename`, { name: 'Blocked' })).status, 409);
    await app.stop();
    app = await start(databasePath);
    assert.match(await detail(), /<h1>Renamed &lt;name&gt; &amp; team<\/h1>/);
    await post(app.url, `${path}/restore`, {});
    assert.doesNotMatch(await detail(), / disabled/);
    assert.equal((await post(app.url, `${path}/rename`, { name: 'Restored name' })).status, 303);
    await app.stop();
    app = await start(databasePath);
    assert.deepEqual(rows(await list()), [{ name: 'Restored name', path }, originalRows[1]]);
    assert.deepEqual(taskRows(await detail()), savedTasks);
    assert.match(await list(), /data-testid="project-summary">1\/2 completed/);
    assert.equal((await post(app.url, '/projects/99999/rename', { name: 'Missing' })).status, 404);
  } finally {
    if (app) await app.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('projects validate, navigate, escape HTML, and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let app;
  try {
    app = await start(databasePath);
    const health = await fetch(`${app.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const initial = await (await fetch(app.url)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.deepEqual(rows(initial), []);

    for (const name of ['', ' \t\n ']) {
      const invalid = await createProject(app.url, name);
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.deepEqual(rows(html), []);
    }

    for (const name of ['  First project  ', '<script>alert("x")</script> & Second']) {
      const response = await createProject(app.url, name);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    const savedRows = rows(await (await fetch(app.url)).text());
    assert.deepEqual(savedRows.map((row) => row.name), [
      'First project', '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; Second',
    ]);
    assert.notEqual(savedRows[0].path, savedRows[1].path);
    const detail = await (await fetch(`${app.url}${savedRows[0].path}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /<form action="\/" method="get"><button type="submit">Projects<\/button>/);
    assert.equal((await fetch(`${app.url}/projects/99999`)).status, 404);

    const invalid = await createProject(app.url, '   ');
    assert.deepEqual(rows(await invalid.text()), savedRows);
    await app.stop();
    app = await start(databasePath);
    assert.deepEqual(rows(await (await fetch(app.url)).text()), savedRows);
    const persistedDetail = await fetch(`${app.url}${savedRows[0].path}`);
    assert.equal(persistedDetail.status, 200);
    assert.match(await persistedDetail.text(), /<h1>First project<\/h1>/);
  } finally {
    if (app) await app.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
