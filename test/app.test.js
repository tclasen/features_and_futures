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

test('task renaming preserves ownership, completion, order, filters, and persisted data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let app;
  try {
    app = await start(databasePath);
    await createProject(app.url, 'First');
    await createProject(app.url, 'Second');
    const [first, second] = rows(await (await fetch(app.url)).text());
    const detail = async (filter = 'All') => (await fetch(`${app.url}${first.path}?filter=${filter}`)).text();
    const list = async () => (await fetch(app.url)).text();
    await post(app.url, `${first.path}/tasks`, { title: 'Done' });
    await post(app.url, `${first.path}/tasks`, { title: 'Pending' });
    const tasks = taskRows(await detail());
    await post(app.url, tasks[0].action, { completed: '1' });
    const saved = taskRows(await detail());
    const renamePath = tasks[0].action.replace('/completion', '/rename');
    const pendingRenamePath = tasks[1].action.replace('/completion', '/rename');
    const initial = await detail();
    assert.equal((initial.match(/>New task title<\/label>/g) || []).length, 2);
    assert.equal((initial.match(/>Rename task<\/button>/g) || []).length, 2);
    for (const title of ['', ' \t\n ']) {
      const invalid = await post(app.url, renamePath, { title, filter: 'Completed' });
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.deepEqual(taskRows(html), [saved[0]]);
      assert.deepEqual(taskRows(await detail()), saved);
    }
    assert.equal((await post(app.url, renamePath.replace(first.path, second.path), { title: 'Wrong owner' })).status, 404);
    assert.equal((await post(app.url, `${first.path}/tasks/99999/rename`, { title: 'Missing' })).status, 404);
    assert.equal((await post(app.url, '/projects/99999/tasks/1/rename', { title: 'Missing project' })).status, 404);
    const renamed = await post(app.url, renamePath, { title: '  Done <new> & "safe"  ', filter: 'Completed' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), `${first.path}?filter=Completed`);
    assert.equal((await post(app.url, pendingRenamePath, { title: '  Still open  ', filter: 'Open' })).status, 303);
    const expected = [
      { ...saved[0], title: 'Done &lt;new&gt; &amp; &quot;safe&quot;' },
      { ...saved[1], title: 'Still open' },
    ];
    const checkSaved = async () => {
      assert.deepEqual(taskRows(await detail()), expected);
      assert.deepEqual(taskRows(await detail('Completed')), [expected[0]]);
      assert.deepEqual(taskRows(await detail('Open')), [expected[1]]);
      assert.match(await detail(), /aria-label="Complete Done &lt;new&gt; &amp; &quot;safe&quot;"/);
      assert.match(await detail(), /aria-label="Complete Still open"/);
      assert.deepEqual(taskRows(await (await fetch(`${app.url}${second.path}`)).text()), []);
    };
    await checkSaved();
    assert.match(await list(), /data-testid="project-summary">1\/2 completed/);
    await app.stop();
    app = await start(databasePath);
    await checkSaved();
    await post(app.url, `${first.path}/archive`, {});
    const archived = await detail();
    assert.equal((archived.match(/id="new-task-title-\d+"[^>]* disabled/g) || []).length, 2);
    assert.equal((archived.match(/<button type="submit" disabled>Rename task/g) || []).length, 2);
    assert.equal((await post(app.url, renamePath, { title: 'Blocked' })).status, 409);
    await app.stop();
    app = await start(databasePath);
    await checkSaved();
    await post(app.url, `${first.path}/restore`, {});
    assert.doesNotMatch(await detail(), / disabled/);
    assert.match(await list(), /data-testid="project-summary">1\/2 completed/);
    assert.equal((await post(app.url, renamePath, { title: 'After restoration' })).status, 303);
    expected[0].title = 'After restoration';
    await app.stop();
    app = await start(databasePath);
    assert.deepEqual(taskRows(await detail()), expected);
    assert.match(await detail(), /aria-label="Complete After restoration"/);
    assert.match(await list(), /data-testid="project-summary">1\/2 completed/);
  } finally {
    if (app) await app.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('priorities migrate, persist independently, and preserve task data through archive and rename', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('First'), ('Second');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Done', 1), (1, 'Pending', 0), (2, 'Other', 0);
  `);
  database.close();
  let app;
  try {
    app = await start(databasePath);
    const detail = async (project = 1, filter = 'All') => (await fetch(`${app.url}/projects/${project}?filter=${filter}`)).text();
    const priorities = (html) => [...html.matchAll(/<select id="task-priority-\d+"[^>]*>([\s\S]*?)<\/select>/g)].map((match) => {
      assert.deepEqual([...match[1].matchAll(/<option(?: selected)?>(.*?)<\/option>/g)].map((option) => option[1]), ['Low', 'Normal', 'High']);
      return /<option selected>(.*?)<\/option>/.exec(match[1])[1];
    });
    assert.deepEqual(priorities(await detail()), ['Normal', 'Normal']);
    await post(app.url, '/projects/1/tasks', { title: 'New' });
    assert.deepEqual(priorities(await detail()), ['Normal', 'Normal', 'Normal']);
    const saved = taskRows(await detail());
    assert.equal((await post(app.url, '/projects/1/tasks/1/priority', { priority: 'High', filter: 'Completed' })).headers.get('location'), '/projects/1?filter=Completed');
    assert.equal((await post(app.url, '/projects/1/tasks/2/priority', { priority: 'Low' })).status, 303);
    for (const priority of ['', 'Urgent', 'normal']) {
      assert.equal((await post(app.url, '/projects/1/tasks/1/priority', { priority })).status, 400);
    }
    assert.equal((await post(app.url, '/projects/2/tasks/1/priority', { priority: 'Low' })).status, 404);
    assert.equal((await post(app.url, '/projects/1/tasks/99999/priority', { priority: 'Low' })).status, 404);
    const check = async () => {
      assert.deepEqual(priorities(await detail()), ['High', 'Low', 'Normal']);
      assert.deepEqual(priorities(await detail(2)), ['Normal']);
      assert.deepEqual(priorities(await detail(1, 'Completed')), ['High']);
      assert.deepEqual(priorities(await detail(1, 'Open')), ['Low', 'Normal']);
      assert.deepEqual(taskRows(await detail()), saved);
      assert.match(await (await fetch(app.url)).text(), /data-testid="project-summary">1\/3 completed/);
    };
    await check();
    await post(app.url, '/projects/1/tasks/1/rename', { title: 'Renamed' });
    saved[0].title = 'Renamed';
    await check();
    await app.stop();
    app = await start(databasePath);
    await check();
    await post(app.url, '/projects/1/archive', {});
    assert.equal(((await detail()).match(/<select id="task-priority-\d+"[^>]* disabled/g) || []).length, 3);
    assert.equal((await post(app.url, '/projects/1/tasks/1/priority', { priority: 'Low' })).status, 409);
    await app.stop();
    app = await start(databasePath);
    assert.deepEqual(priorities(await detail()), ['High', 'Low', 'Normal']);
    await post(app.url, '/projects/1/restore', {});
    assert.doesNotMatch(await detail(), / disabled/);
    await check();
    await post(app.url, '/projects/1/tasks/1/priority', { priority: 'Normal' });
    await app.stop();
    app = await start(databasePath);
    assert.deepEqual(priorities(await detail()), ['Normal', 'Low', 'Normal']);
    assert.deepEqual(taskRows(await detail()), saved);
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

test('combined filters preserve selections through edits, validation, archive, and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-filters-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let app;
  try {
    app = await start(databasePath);
    await createProject(app.url, 'Combined');
    await createProject(app.url, 'Other');
    const path = '/projects/1';
    const detail = async (filter = 'All', priorityFilter = 'All') =>
      (await fetch(`${app.url}${path}?${new URLSearchParams({ filter, priorityFilter })}`)).text();
    const selected = (html, id) => /<option selected>(.*?)<\/option>/.exec(
      new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)<\\/select>`).exec(html)[1])[1];
    const assertSelections = (html, filter, priority) => {
      assert.equal(selected(html, 'task-filter'), filter);
      assert.equal(selected(html, 'priority-filter'), priority);
    };
    for (const title of ['Low open', 'Normal open', 'High done', 'High open']) {
      await post(app.url, `${path}/tasks`, { title });
    }
    await post(app.url, `${path}/tasks/1/priority`, { priority: 'Low' });
    await post(app.url, `${path}/tasks/3/priority`, { priority: 'High' });
    await post(app.url, `${path}/tasks/4/priority`, { priority: 'High' });
    await post(app.url, `${path}/tasks/3/completion`, { completed: '1' });
    const allTasks = taskRows(await detail());
    const initial = await (await fetch(`${app.url}${path}`)).text();
    assertSelections(initial, 'All', 'All');
    assert.match(initial, /<label for="priority-filter">Priority filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Low<\/option><option>Normal<\/option><option>High<\/option>/);
    for (const filter of ['All', 'Open', 'Completed']) {
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        const html = await detail(filter, priority);
        assertSelections(html, filter, priority);
        const expected = allTasks.filter((task, index) =>
          (filter === 'All' || task.completed === (filter === 'Completed')) &&
          (priority === 'All' || ['Low', 'Normal', 'High', 'High'][index] === priority));
        assert.deepEqual(taskRows(html), expected);
        // Both selects share a GET form, so changing either submits both values.
        assert.match(html, /<form class="task-filter"[^>]*>[\s\S]*id="task-filter"[\s\S]*id="priority-filter"[\s\S]*?<\/form>/);
      }
    }
    assert.deepEqual(taskRows(await detail('invalid', 'invalid')), allTasks);
    const fields = { filter: 'Open', priorityFilter: 'High' };
    const location = `${path}?filter=Open&priorityFilter=High`;
    const edit = async (suffix, values) => {
      const response = await post(app.url, `${path}${suffix}`, { ...fields, ...values });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), location);
      const html = await (await fetch(`${app.url}${location}`)).text();
      assertSelections(html, 'Open', 'High');
      return html;
    };
    const renamed = await edit('/tasks/4/rename', { title: '  Renamed  ' });
    assert.deepEqual(taskRows(renamed).map((task) => task.title), ['Renamed']);
    assert.match(renamed, /aria-label="Complete Renamed"/);
    const invalid = await post(app.url, `${path}/tasks/4/rename`, { ...fields, title: '  ' });
    assert.equal(invalid.status, 400);
    assertSelections(await invalid.text(), 'Open', 'High');
    const invalidPriority = await post(app.url, `${path}/tasks/4/priority`, { ...fields, priority: 'Bad' });
    assert.equal(invalidPriority.status, 400);
    assertSelections(await invalidPriority.text(), 'Open', 'High');
    assert.deepEqual(taskRows(await edit('/tasks/4/priority', { priority: 'Low' })), []);
    assert.deepEqual(taskRows(await edit('/tasks/1/priority', { priority: 'High' })).map((task) => task.title), ['Low open']);
    assert.deepEqual(taskRows(await edit('/tasks/1/completion', { completed: '1' })), []);
    assert.deepEqual(taskRows(await detail('Completed', 'High')).map((task) => task.title), ['Low open', 'High done']);
    assert.match(await (await fetch(app.url)).text(), /data-testid="project-summary">2\/4 completed/);
    assert.deepEqual(taskRows(await (await fetch(`${app.url}/projects/2`)).text()), []);
    await post(app.url, `${path}/archive`, {});
    const archived = await detail('Completed', 'High');
    assertSelections(archived, 'Completed', 'High');
    assert.doesNotMatch(archived, /id="(?:task-filter|priority-filter)"[^>]*disabled/);
    assert.equal((archived.match(/type="checkbox"[^>]* disabled/g) || []).length, 2);
    assert.equal((archived.match(/id="task-priority-\d+"[^>]* disabled/g) || []).length, 2);
    const saved = taskRows(await detail());
    await app.stop();
    app = await start(databasePath);
    assert.deepEqual(taskRows(await detail()), saved);
    assert.deepEqual(taskRows(await detail('Completed', 'High')), taskRows(archived));
    await post(app.url, `${path}/restore`, {});
    assert.deepEqual(taskRows(await detail()), saved);
    assert.doesNotMatch(await detail(), / disabled/);
    assertSelections(await (await fetch(`${app.url}${path}`)).text(), 'All', 'All');
  } finally {
    if (app) await app.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project defaults migrate, affect only future tasks, and persist independently', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-default-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
    INSERT INTO projects (name) VALUES ('Existing');
    INSERT INTO tasks (project_id, title, completed, priority) VALUES (1, 'Old high', 1, 'High'), (1, 'Old normal', 0, 'Normal');
  `);
  database.close();
  let app;
  try {
    app = await start(databasePath);
    await createProject(app.url, 'New');
    const detail = async (id = 1, query = '') => (await fetch(`${app.url}/projects/${id}${query}`)).text();
    const selected = (html, id) => /<option selected>(.*?)<\/option>/.exec(
      new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)<\\/select>`).exec(html)[1])[1];
    const priorities = (html) => [...html.matchAll(/<select id="task-priority-\d+"[^>]*>([\s\S]*?)<\/select>/g)]
      .map((match) => /<option selected>(.*?)<\/option>/.exec(match[1])[1]);
    const assertDefault = (html, value) => {
      assert.match(html, /<label for="default-task-priority">Default task priority<\/label>/);
      assert.match(html, /id="default-task-priority"[^>]*>[\s\S]*?<option(?: selected)?>Low<\/option><option(?: selected)?>Normal<\/option><option(?: selected)?>High<\/option>/);
      assert.equal(selected(html, 'default-task-priority'), value);
    };
    assertDefault(await detail(), 'Normal');
    assertDefault(await detail(2), 'Normal');
    const saved = taskRows(await detail());
    const fields = { filter: 'Completed', priorityFilter: 'High' };
    const change = await post(app.url, '/projects/1/default-priority', { ...fields, priority: 'Low' });
    assert.equal(change.status, 303);
    assert.equal(change.headers.get('location'), '/projects/1?filter=Completed&priorityFilter=High');
    const filtered = await detail(1, '?filter=Completed&priorityFilter=High');
    assertDefault(filtered, 'Low');
    assert.equal(selected(filtered, 'task-filter'), 'Completed');
    assert.equal(selected(filtered, 'priority-filter'), 'High');
    assert.deepEqual(taskRows(filtered), [saved[0]]);
    assert.deepEqual(taskRows(await detail()), saved);
    assert.deepEqual(priorities(await detail()), ['High', 'Normal']);
    assertDefault(await detail(2), 'Normal');
    for (const priority of ['', 'Urgent', 'normal']) {
      const invalid = await post(app.url, '/projects/1/default-priority', { ...fields, priority });
      assert.equal(invalid.status, 400);
      assertDefault(await invalid.text(), 'Low');
    }
    assert.equal((await post(app.url, '/projects/99999/default-priority', { priority: 'High' })).status, 404);
    await post(app.url, '/projects/1/tasks', { title: 'Inherited low' });
    await post(app.url, '/projects/2/tasks', { title: 'Other normal' });
    await post(app.url, '/projects/1/default-priority', { priority: 'High' });
    await post(app.url, '/projects/1/tasks', { title: 'Inherited high' });
    await post(app.url, '/projects/1/rename', { name: 'Renamed' });
    await post(app.url, '/projects/1/tasks/3/rename', { title: 'Still low' });
    const check = async () => {
      assertDefault(await detail(), 'High');
      assertDefault(await detail(2), 'Normal');
      assert.deepEqual(priorities(await detail()), ['High', 'Normal', 'Low', 'High']);
      assert.deepEqual(priorities(await detail(2)), ['Normal']);
      assert.deepEqual(taskRows(await detail()).slice(0, 2), saved);
      assert.deepEqual(taskRows(await detail()).map((task) => task.title), ['Old high', 'Old normal', 'Still low', 'Inherited high']);
    };
    await check();
    assert.match(await (await fetch(app.url)).text(), /data-testid="project-summary">1\/4 completed/);
    await app.stop();
    app = await start(databasePath);
    await check();
    await post(app.url, '/projects/1/archive', {});
    assert.match(await detail(), /id="default-task-priority"[^>]* disabled/);
    assert.equal((await post(app.url, '/projects/1/default-priority', { priority: 'Normal' })).status, 409);
    await app.stop();
    app = await start(databasePath);
    await check();
    await post(app.url, '/projects/1/restore', {});
    assert.doesNotMatch(await detail(), / disabled/);
    await check();
    await post(app.url, '/projects/1/tasks', { title: 'After restore' });
    assert.deepEqual(priorities(await detail()), ['High', 'Normal', 'Low', 'High', 'High']);
    await post(app.url, '/projects/1/default-priority', { priority: 'Normal' });
    await post(app.url, '/projects/1/tasks', { title: 'Normal again' });
    assert.deepEqual(priorities(await detail()), ['High', 'Normal', 'Low', 'High', 'High', 'Normal']);
  } finally {
    if (app) await app.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('due dates migrate, preserve task data and filters, and survive restart and archival', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-dates-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
    INSERT INTO projects (name) VALUES ('Existing'), ('Other');
    INSERT INTO tasks (project_id, title, completed, priority) VALUES (1, 'Saved', 1, 'High'), (2, 'Other task', 0, 'Normal');
  `);
  database.close();
  let app;
  try {
    app = await start(databasePath);
    const detail = async (id = 1, query = '') => (await fetch(`${app.url}/projects/${id}${query}`)).text();
    const dates = (html) => [...html.matchAll(/id="task-due-date-\d+"[^>]* value="([^"]*)"/g)].map((match) => match[1]);
    assert.deepEqual(dates(await detail()), ['']);
    await post(app.url, '/projects/1/tasks', { title: 'New task' });
    assert.deepEqual(dates(await detail()), ['', '']);
    const original = taskRows(await detail());
    const fields = { filter: 'Completed', priorityFilter: 'High' };
    const path = '/projects/1/tasks/1/due-date';
    const saved = await post(app.url, path, { ...fields, dueDate: '  2000-02-29  ' });
    assert.equal(saved.status, 303);
    assert.equal(saved.headers.get('location'), '/projects/1?filter=Completed&priorityFilter=High');
    const filtered = await detail(1, '?filter=Completed&priorityFilter=High');
    assert.match(filtered, /<label for="task-due-date-1">Task due date<\/label>/);
    assert.match(filtered, />Save due date<\/button>/);
    assert.match(filtered, /<option selected>Completed<\/option>/);
    assert.match(filtered, /<option selected>High<\/option>/);
    assert.deepEqual(dates(filtered), ['2000-02-29']);
    assert.deepEqual(taskRows(await detail()), original);
    assert.deepEqual(dates(await detail()), ['2000-02-29', '']);
    assert.deepEqual(dates(await detail(2)), ['']);
    for (const dueDate of ['1900-02-29', '2025-04-31', '0000-01-01', '<script>']) {
      const invalid = await post(app.url, path, { ...fields, dueDate });
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      assert.deepEqual(dates(html), ['2000-02-29']);
      assert.deepEqual(taskRows(html), [original[0]]);
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.match(html, /<option selected>High<\/option>/);
    }
    assert.equal((await post(app.url, '/projects/2/tasks/1/due-date', { dueDate: '2025-01-01' })).status, 404);
    assert.equal((await post(app.url, '/projects/1/tasks/999/due-date', { dueDate: '' })).status, 404);
    await post(app.url, '/projects/1/tasks/1/rename', { ...fields, title: 'Renamed' });
    assert.deepEqual(dates(await detail()), ['2000-02-29', '']);
    assert.match(await detail(), /aria-label="Complete Renamed" checked/);
    assert.match(await detail(), /<option selected>High<\/option>/);
    assert.match(await (await fetch(app.url)).text(), /data-testid="project-summary">1\/2 completed/);
    await post(app.url, '/projects/1/tasks/3/due-date', { dueDate: '9999-12-31' });
    await app.stop();
    app = await start(databasePath);
    assert.deepEqual(dates(await detail()), ['2000-02-29', '9999-12-31']);
    await post(app.url, '/projects/1/archive', {});
    const archived = await detail(1, '?filter=Completed&priorityFilter=High');
    assert.deepEqual(dates(archived), ['2000-02-29']);
    assert.match(archived, /id="task-due-date-1"[^>]* disabled/);
    assert.match(archived, /<button type="submit" disabled>Save due date/);
    assert.doesNotMatch(archived, /id="(?:task-filter|priority-filter)"[^>]*disabled/);
    assert.equal((await post(app.url, path, { dueDate: '' })).status, 409);
    await app.stop();
    app = await start(databasePath);
    assert.deepEqual(dates(await detail()), ['2000-02-29', '9999-12-31']);
    await post(app.url, '/projects/1/restore', {});
    assert.doesNotMatch(await detail(), / disabled/);
    for (const dueDate of ['', ' \t\n ']) {
      await post(app.url, path, { dueDate: '0001-01-01' });
      assert.equal((await post(app.url, path, { ...fields, dueDate })).status, 303);
      assert.deepEqual(dates(await detail()), ['', '9999-12-31']);
    }
    await app.stop();
    app = await start(databasePath);
    assert.deepEqual(dates(await detail()), ['', '9999-12-31']);
    assert.deepEqual(dates(await detail(2)), ['']);
    assert.match(await (await fetch(app.url)).text(), /data-testid="project-summary">1\/2 completed/);
  } finally {
    if (app) await app.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('due ranges intersect filters and survive edits, validation and archived viewing', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-range-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let app;
  try {
    app = await start(databasePath);
    await createProject(app.url, 'Ranges');
    for (const title of ['Before', 'Start', 'End', 'After', 'Undated']) {
      await post(app.url, '/projects/1/tasks', { title });
    }
    for (const [index, dueDate] of ['2025-01-01', '2025-02-01', '2025-02-28', '2025-03-01'].entries()) {
      await post(app.url, `/projects/1/tasks/${index + 1}/due-date`, { dueDate });
    }
    const get = async (fields = {}) => (await fetch(`${app.url}/projects/1?${new URLSearchParams(fields)}`)).text();
    const titles = (html) => taskRows(html).map((row) => row.title);
    const apply = async (fields) => fetch(`${app.url}/projects/1?${new URLSearchParams({ applyRange: '1', ...fields })}`);
    const fields = { filter: 'Open', priorityFilter: 'Normal', dueFrom: '2025-02-01', dueThrough: '2025-02-28' };
    const initial = await apply({ filter: 'Open', priorityFilter: 'Normal', rangeFrom: ' 2025-02-01 ', rangeThrough: ' 2025-02-28 ' });
    assert.deepEqual(titles(await initial.text()), ['Start', 'End']);
    assert.equal(new URL(initial.url).searchParams.get('dueFrom'), fields.dueFrom);
    assert.deepEqual(titles(await apply({ rangeThrough: '2025-02-01' }).then((r) => r.text())), ['Before', 'Start']);
    assert.deepEqual(titles(await apply({ rangeFrom: '2025-02-28' }).then((r) => r.text())), ['End', 'After']);
    assert.deepEqual(titles(await apply({ rangeFrom: ' ', rangeThrough: '' }).then((r) => r.text())), ['Before', 'Start', 'End', 'After', 'Undated']);
    for (const [rangeFrom, rangeThrough, message] of [
      ['2025-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['', '0000-01-01', 'Due range must use valid YYYY-MM-DD dates'],
      ['2025-03-01', '2025-02-28', 'Due from must not be after Due through'],
    ]) {
      const response = await apply({ ...fields, rangeFrom, rangeThrough });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.ok(html.includes(`role="alert">${message}`));
      assert.deepEqual(titles(html), ['Start', 'End']);
      assert.match(html, /name="dueFrom" value="2025-02-01"/);
      assert.match(html, /name="dueThrough" value="2025-02-28"/);
    }
    const mutate = async (path, values) => {
      const response = await post(app.url, `/projects/1${path}`, { ...fields, ...values });
      assert.equal(response.status, 303);
      const location = response.headers.get('location');
      const params = new URL(location, app.url).searchParams;
      for (const [key, value] of Object.entries(fields)) assert.equal(params.get(key), value);
      return (await fetch(`${app.url}${location}`)).text();
    };
    assert.deepEqual(titles(await mutate('/tasks/2/rename', { title: ' Renamed ' })), ['Renamed', 'End']);
    assert.deepEqual(titles(await mutate('/rename', { name: ' Renamed project ' })), ['Renamed', 'End']);
    assert.deepEqual(titles(await mutate('/default-priority', { priority: 'High' })), ['Renamed', 'End']);
    assert.deepEqual(titles(await mutate('/tasks', { title: 'New undated' })), ['Renamed', 'End']);
    assert.deepEqual(titles(await mutate('/tasks/2/completion', { completed: '1' })), ['End']);
    assert.deepEqual(titles(await get({ ...fields, filter: 'Completed' })), ['Renamed']);
    assert.deepEqual(titles(await mutate('/tasks/3/priority', { priority: 'High' })), []);
    assert.deepEqual(titles(await get({ ...fields, priorityFilter: 'High' })), ['End']);
    assert.deepEqual(titles(await mutate('/tasks/2/completion', {})), ['Renamed']);
    assert.deepEqual(titles(await mutate('/tasks/2/due-date', { dueDate: '2025-03-01' })), []);
    assert.deepEqual(titles(await mutate('/tasks/5/due-date', { dueDate: '2025-02-01' })), ['Undated']);
    assert.deepEqual(titles(await mutate('/tasks/5/due-date', { dueDate: ' ' })), []);
    const invalidDate = await post(app.url, '/projects/1/tasks/2/due-date', { ...fields, dueDate: 'bad' });
    assert.equal(invalidDate.status, 400);
    assert.deepEqual(titles(await invalidDate.text()), []);
    assert.match(await (await fetch(app.url)).text(), /data-testid="project-summary">0\/6 completed/);
    await post(app.url, '/projects/1/archive', {});
    const archived = await get({ ...fields, priorityFilter: 'High' });
    assert.deepEqual(titles(archived), ['End']);
    assert.doesNotMatch(archived, /id="(?:due-from|due-through|task-filter|priority-filter)"[^>]*disabled/);
    assert.match(archived, /id="task-due-date-3"[^>]*disabled/);
    assert.match(archived, /<button type="submit" disabled>Save due date/);
    assert.deepEqual(titles(await apply({ rangeFrom: '2025-02-28', rangeThrough: '2025-02-28' }).then((r) => r.text())), ['End']);
    await app.stop();
    app = await start(databasePath);
    assert.deepEqual(titles(await get({ ...fields, priorityFilter: 'High' })), ['End']);
    await post(app.url, '/projects/1/restore', {});
    // Move controls remain disabled with no other active project; restored editors do not.
    assert.doesNotMatch((await get()).replace(/<form[^>]*\/move">[\s\S]*?<\/form>/g, ''), / disabled/);
    const reopened = await get();
    assert.equal(taskRows(reopened).length, 6);
    assert.match(reopened, /id="due-from"[^>]*value=""/);
    assert.match(reopened, /id="due-through"[^>]*value=""/);
    assert.match(reopened, /id="task-due-date-2"[^>]*value="2025-03-01"/);
  } finally {
    if (app) await app.stop();
    await rm(directory, { recursive: true, force: true });
  }
});


test('move controls list active destinations and retain the source filtered view', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-move-ui-'));
  let app;
  try {
    app = await start(join(directory, 'db.sqlite'));
    const html = async (path) => (await fetch(`${app.url}${path}`)).text();
    await createProject(app.url, 'Source');
    await post(app.url, '/projects/1/tasks', { title: 'Moving' });
    const noDestination = await html('/projects/1');
    assert.match(noDestination, /name="destinationId" disabled>\s*<\/select>/);
    assert.match(noDestination, /<button type="submit" disabled>Move task<\/button>/);
    await createProject(app.url, 'Destination');
    await createProject(app.url, 'Archived');
    await createProject(app.url, '<Last>');
    await post(app.url, '/projects/3/archive', {});
    await post(app.url, '/projects/2/rename', { name: 'Renamed destination' });
    const ready = await html('/projects/1');
    assert.match(ready, /name="destinationId">\s*<option value="2">Renamed destination<\/option><option value="4">&lt;Last&gt;<\/option>\s*<\/select>/);
    await post(app.url, '/projects/1/tasks/1/priority', { priority: 'High' });
    await post(app.url, '/projects/1/tasks/1/completion', { completed: '1' });
    await post(app.url, '/projects/1/tasks/1/due-date', { dueDate: '2030-05-10' });
    await post(app.url, '/projects/1/tasks', { title: 'Remaining' });
    const fields = { destinationId: '2', filter: 'Completed', priorityFilter: 'High', dueFrom: '2030-05-01', dueThrough: '2030-05-31' };
    assert.equal((await post(app.url, '/projects/1/tasks/1/move', { ...fields, destinationId: '3' })).status, 400);
    const moved = await post(app.url, '/projects/1/tasks/1/move', fields);
    assert.equal(moved.status, 303);
    const location = moved.headers.get('location');
    assert.equal(location, '/projects/1?filter=Completed&priorityFilter=High&dueFrom=2030-05-01&dueThrough=2030-05-31');
    const source = await html(location);
    assert.deepEqual(taskRows(source), []);
    assert.match(source, /<option selected>Completed<\/option>/);
    assert.match(source, /<option selected>High<\/option>/);
    assert.match(source, /id="due-from"[^>]*value="2030-05-01"/);
    assert.deepEqual(taskRows(await html('/projects/1')).map((row) => row.title), ['Remaining']);
    const destination = await html('/projects/2');
    assert.deepEqual(taskRows(destination).map((row) => [row.title, row.completed]), [['Moving', true]]);
    assert.match(destination, /name="dueDate"[^>]*value="2030-05-10"/);
    assert.match(await html('/'), /data-testid="project-summary">1\/1 completed/);
    await post(app.url, '/projects/2/archive', {});
    const archived = await html('/projects/2');
    assert.match(archived, /name="destinationId" disabled>/);
    assert.match(archived, /<button type="submit" disabled>Move task<\/button>/);
    assert.equal((await post(app.url, '/projects/2/tasks/1/move', { destinationId: '1' })).status, 409);
    await post(app.url, '/projects/2/restore', {});
    await app.stop();
    app = await start(join(directory, 'db.sqlite'));
    assert.deepEqual(taskRows(await html('/projects/2')).map((row) => row.title), ['Moving']);
    assert.equal((await post(app.url, '/projects/2/tasks/1/move', { destinationId: '1' })).status, 303);
    assert.deepEqual(taskRows(await html('/projects/1')).map((row) => row.title), ['Moving', 'Remaining']);
  } finally {
    if (app) await app.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
