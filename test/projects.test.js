import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, DB_PATH: dbPath, PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Server startup timed out'));
    }, 5000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = /listening on port (\d+)/.exec(output);
      if (match) { clearTimeout(timer); resolve(match[1]); }
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

test('tasks validate, filter, remain project-scoped, and persist completion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const post = (path, values) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const detail = (path = '/projects/1') => fetch(`${server.url}${path}`).then(response => response.text());
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    let content = await detail();
    assert.match(content, /<label for="task-title">Task title<\/label>/);
    assert.match(content, />Create task<\/button>/);
    assert.match(content, /<label for="task-filter">Task filter<\/label>/);
    assert.match(content, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks', { title });
      content = await response.text();
      assert.match(content, /role="alert">Task title is required/);
      assert.doesNotMatch(content, /data-testid="task-row"/);
    }
    for (const title of ['  One  ', 'Two < & "three"']) {
      assert.equal((await post('/projects/1/tasks', { title })).status, 303);
    }
    content = await detail();
    assert.equal((content.match(/data-testid="task-row"/g) || []).length, 2);
    assert.ok(content.indexOf('<span>One</span>') < content.indexOf('<span>Two'));
    assert.match(content, /aria-label="Complete One"/);
    assert.match(content, /Complete Two &lt; &amp; &quot;three&quot;/);
    assert.doesNotMatch(content, / checked/);
    assert.doesNotMatch(await detail('/projects/2'), /data-testid="task-row"/);
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1', { completed: '1', filter: 'Open' })).headers.get('location'), '/projects/1?filter=Open');
    content = await detail();
    assert.match(content, /aria-label="Complete One" checked/);
    const open = await detail('/projects/1?filter=Open');
    assert.doesNotMatch(open, /<span>One<\/span>/);
    assert.match(open, /<span>Two/);
    const completed = await detail('/projects/1?filter=Completed');
    assert.match(completed, /<span>One<\/span>/);
    assert.doesNotMatch(completed, /<span>Two/);
    assert.equal(await detail(), content);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await detail(), content);
    assert.equal(await detail('/projects/1?filter=Completed'), completed);
    await post('/projects/1/tasks/1', {});
    assert.doesNotMatch(await detail(), / checked/);
    assert.doesNotMatch(await detail('/projects/1?filter=Completed'), /data-testid="task-row"/);
    await server.stop();
    server = await start(dbPath);
    assert.doesNotMatch(await detail(), / checked/);
    assert.equal((await post('/projects/999/tasks', { title: 'Missing' })).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive migration, summaries, read-only tasks, restoration, and persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const dbPath = join(directory, 'workboard.sqlite');
  // Simulate the schema and data from the previous checkpoint.
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Existing');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Done', 1), (1, 'Pending', 0);
  `);
  legacy.close();
  let server;
  try {
    server = await start(dbPath);
    const get = path => fetch(`${server.url}${path}`).then(response => response.text());
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    let list = await get('/');
    assert.match(list, /<label for="project-filter">Project filter<\/label>/);
    assert.match(list, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(list, /data-testid="project-summary">1\/2 completed/);
    assert.match(list, />Archive project<\/button>/);
    await post('/projects', { name: 'Empty' });
    assert.match(await get('/'), /data-testid="project-summary">0\/0 completed/);
    assert.equal((await post('/projects/1/archive')).status, 303);
    assert.doesNotMatch(await get('/'), /<span>Existing<\/span>/);
    list = await get('/?filter=Archived');
    assert.match(list, /<span>Existing<\/span>/);
    assert.match(list, />Open project<\/button>/);
    assert.match(list, />Restore project<\/button>/);
    assert.doesNotMatch(list, />Archive project<\/button>/);
    const archived = await get('/projects/1');
    assert.match(archived, /<p>Archived project<\/p>/);
    assert.match(archived, /<button type="submit" disabled>Create task/);
    assert.match(archived, /aria-label="Complete Done" checked disabled/);
    assert.match(archived, /aria-label="Complete Pending" disabled/);
    assert.doesNotMatch(await get('/projects/1?filter=Open'), /<span>Done<\/span>/);
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /<span>Pending<\/span>/);
    assert.equal((await post('/projects/1/tasks', { title: 'Forbidden' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1')).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/?filter=Archived'), list);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.doesNotMatch(await get('/?filter=Archived'), /data-testid="project-row"/);
    list = await get('/');
    assert.ok(list.indexOf('<span>Existing</span>') < list.indexOf('<span>Empty</span>'));
    assert.match(list, /data-testid="project-summary">1\/2 completed/);
    assert.doesNotMatch(await get('/projects/1'), / disabled/);
    await post('/projects/1/tasks/2', { completed: '1' });
    assert.match(await get('/'), /data-testid="project-summary">2\/2 completed/);
    await server.stop();
    server = await start(dbPath);
    assert.match(await get('/'), /data-testid="project-summary">2\/2 completed/);
    assert.doesNotMatch(await get('/projects/1'), /Archived project| disabled/);
    assert.equal((await post('/projects/999/archive')).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('renaming preserves identity, order and tasks, validates names, and respects archive state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const get = path => fetch(`${server.url}${path}`).then(response => response.text());
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await get('/projects/1');
    assert.match(original, /<label for="new-project-name">New project name<\/label>/);
    assert.match(original, />Rename project<\/button>/);
    for (const name of ['', ' \t\n ']) {
      const response = await post('/projects/1/rename', { name });
      assert.match(await response.text(), /role="alert">Project name is required/);
      assert.equal(await get('/projects/1'), original);
    }
    const renamed = await post('/projects/1/rename', { name: '  New < & "name"  ', filter: 'Completed' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const detail = await get('/projects/1');
    assert.match(detail, /<h1>New &lt; &amp; &quot;name&quot;<\/h1>/);
    assert.equal(detail.replace('New &lt; &amp; &quot;name&quot;', 'First'), original);
    const list = await get('/');
    assert.ok(list.indexOf('<span>New') < list.indexOf('<span>Second'));
    assert.match(list, /data-testid="project-summary">1\/2 completed/);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), detail);
    assert.equal(await get('/'), list);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.match(archived, /id="new-project-name"[^>]* disabled/);
    assert.match(archived, /<button type="submit" disabled>Rename project/);
    assert.equal((await post('/projects/1/rename', { name: 'Forbidden' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), detail);
    await post('/projects/1/rename', { name: 'Restored name' });
    assert.match(await get('/projects/1'), /<h1>Restored name<\/h1>/);
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task renaming preserves completion, order, ownership, filters and persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const get = path => fetch(`${server.url}${path}`).then(response => response.text());
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Original' });
    await post('/projects/1/tasks', { title: 'Later' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await get('/projects/1');
    assert.match(original, /<label for="new-task-title-1">New task title<\/label>/);
    assert.equal((original.match(/>Rename task<\/button>/g) || []).length, 2);
    for (const title of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/tasks/1/rename', { title, filter: 'Completed' });
      const content = await invalid.text();
      assert.match(content, /role="alert">Task title is required/);
      assert.match(content, /<option selected>Completed/);
      assert.equal(await get('/projects/1'), original);
    }
    assert.equal((await post('/projects/2/tasks/1/rename', { title: 'Wrong owner' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/rename', { title: 'Missing' })).status, 404);
    assert.equal((await post('/projects/999/tasks/1/rename', { title: 'Missing' })).status, 404);
    const response = await post('/projects/1/tasks/1/rename', { title: '  New < & "title"  ', filter: 'Completed' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1?filter=Completed');
    const detail = await get('/projects/1');
    assert.match(detail, /aria-label="Complete New &lt; &amp; &quot;title&quot;" checked/);
    assert.ok(detail.indexOf('<span>New') < detail.indexOf('<span>Later'));
    assert.doesNotMatch(await get('/projects/1?filter=Open'), /<span>New/);
    assert.match(await get('/projects/1?filter=Completed'), /<span>New/);
    assert.doesNotMatch(await get('/projects/2'), /data-testid="task-row"/);
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), detail);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.equal((archived.match(/id="new-task-title-\d+"[^>]* disabled/g) || []).length, 2);
    assert.equal((archived.match(/<button type="submit" disabled>Rename task/g) || []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Forbidden' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), detail);
    await post('/projects/1/tasks/2/rename', { title: '  Restored  ', filter: 'Open' });
    assert.match(await get('/projects/1?filter=Open'), /aria-label="Complete Restored" onchange/);
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    await server.stop();
    server = await start(dbPath);
    assert.match(await get('/projects/1'), /<span>Restored<\/span>/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('priorities migrate, remain independent, preserve task data, and survive archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priorities-'));
  const dbPath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('First'), ('Second');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Original', 1);
  `);
  legacy.close();
  let server;
  try {
    server = await start(dbPath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = (path) => fetch(`${server.url}${path}`).then(response => response.text());
    const selected = content => [...content.matchAll(/<select id="task-priority-\d+"[^>]*>([\s\S]*?)<\/select>/g)]
      .map(match => /<option selected>(Low|Normal|High)<\/option>/.exec(match[1])[1]);
    assert.deepEqual(selected(await get('/projects/1')), ['Normal']);
    await post('/projects/1/tasks', { title: 'Other' });
    await post('/projects/2/tasks', { title: 'Separate' });
    let content = await get('/projects/1');
    assert.deepEqual(selected(content), ['Normal', 'Normal']);
    assert.match(content, /<label for="task-priority-1">Task priority<\/label>/);
    assert.match(content, /<option>Low<\/option><option selected>Normal<\/option><option>High<\/option>/);
    const response = await post('/projects/1/tasks/1/priority', { priority: 'High', filter: 'Completed' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1?filter=Completed');
    await post('/projects/1/tasks/2/priority', { priority: 'Low' });
    assert.equal((await post('/projects/2/tasks/1/priority', { priority: 'Low' })).status, 404);
    assert.equal((await post('/projects/999/tasks/1/priority', { priority: 'Low' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Urgent' })).status, 400);
    await post('/projects/1/tasks/1/rename', { title: '  Renamed  ' });
    content = await get('/projects/1');
    assert.deepEqual(selected(content), ['High', 'Low']);
    assert.ok(content.indexOf('<span>Renamed</span>') < content.indexOf('<span>Other</span>'));
    assert.match(content, /aria-label="Complete Renamed" checked/);
    assert.deepEqual(selected(await get('/projects/1?filter=Completed')), ['High']);
    assert.deepEqual(selected(await get('/projects/1?filter=Open')), ['Low']);
    assert.deepEqual(selected(await get('/projects/2')), ['Normal']);
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), content);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.match(archived, /id="task-priority-1" name="priority" disabled/);
    assert.match(archived, /id="task-priority-2" name="priority" disabled/);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Normal' })).status, 403);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), content);
    await post('/projects/1/tasks/1/priority', { priority: 'Normal' });
    assert.deepEqual(selected(await get('/projects/1')), ['Normal', 'Low']);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('projects validate, navigate, escape names, and persist in creation order', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const dbPath = join(directory, 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    let list = await (await fetch(server.url)).text();
    assert.match(list, /<h1>Workboard<\/h1>/);
    assert.match(list, /<label for="project-name">Project name<\/label>/);
    assert.match(list, />Create project<\/button>/);
    assert.doesNotMatch(list, /data-testid="project-row"/);

    async function create(name) {
      return fetch(`${server.url}/projects`, {
        method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
      });
    }
    for (const name of ['', ' \t\n ']) {
      const invalid = await create(name);
      const content = await invalid.text();
      assert.match(content, /role="alert">Project name is required/);
      assert.doesNotMatch(content, /data-testid="project-row"/);
    }
    for (const name of ['  Alpha  ', 'Beta <script> & "quoted"']) {
      const created = await create(name);
      assert.equal(created.status, 303);
      assert.equal(created.headers.get('location'), '/');
    }
    list = await (await fetch(server.url)).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.ok(list.indexOf('<span>Alpha</span>') < list.indexOf('<span>Beta'));
    assert.match(list, /Beta &lt;script&gt; &amp; &quot;quoted&quot;/);
    const paths = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    const detail = await (await fetch(`${server.url}${paths[0]}`)).text();
    assert.match(detail, /<h1>Alpha<\/h1>/);
    assert.match(detail, /action="\/".*>Projects<\/button>/);
    assert.equal((await fetch(`${server.url}/projects/99999`)).status, 404);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await (await fetch(server.url)).text(), list);
    assert.match(await (await fetch(`${server.url}${paths[0]}`)).text(), /<h1>Alpha<\/h1>/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('combined filters preserve selections through edits, archive, and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-filters-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const get = path => fetch(`${server.url}${path}`).then(response => response.text());
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const view = (filter, priorityFilter) => get(`/projects/1?${new URLSearchParams({ filter, priorityFilter })}`);
    const titles = content => [...content.matchAll(/data-testid="task-row">\s*<span>(.*?)<\/span>/g)].map(match => match[1]);
    const selections = (content, filter, priority) => {
      assert.match(content, new RegExp(`id="task-filter"[^>]*>[\\s\\S]*?<option selected>${filter}</option>`));
      const prioritySelect = /<select id="priority-filter"[^>]*>([\s\S]*?)<\/select>/.exec(content)[1];
      assert.equal(prioritySelect.replace(/\s+/g, ''), ['All', 'Low', 'Normal', 'High'].map(value =>
        `<option${value === priority ? ' selected' : ''}>${value}</option>`.replace(/\s+/g, '')).join(''));
    };
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Other' });
    const tasks = [
      ['Low open', 'Low', false], ['High done', 'High', true],
      ['Normal open', 'Normal', false], ['High open', 'High', false],
      ['Low done', 'Low', true], ['Normal done', 'Normal', true],
    ];
    for (const [index, [title, priority, completed]] of tasks.entries()) {
      await post('/projects/1/tasks', { title });
      await post(`/projects/1/tasks/${index + 1}/priority`, { priority });
      if (completed) await post(`/projects/1/tasks/${index + 1}`, { completed: '1' });
    }
    selections(await get('/projects/1'), 'All', 'All');
    for (const filter of ['All', 'Open', 'Completed']) {
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        const content = await view(filter, priority);
        selections(content, filter, priority);
        assert.deepEqual(titles(content), tasks.filter(([, p, done]) =>
          (priority === 'All' || p === priority) &&
          (filter === 'All' || done === (filter === 'Completed'))).map(([title]) => title));
      }
    }
    assert.match(await get('/'), /project-summary">3\/6 completed/);
    assert.deepEqual(titles(await get('/projects/2?filter=Open&priorityFilter=High')), []);
    const state = { filter: 'Open', priorityFilter: 'High' };
    const edit = async (path, values) => {
      const response = await post(path, { ...state, ...values });
      assert.equal(response.headers.get('location'), '/projects/1?filter=Open&priorityFilter=High');
      const content = await get(response.headers.get('location'));
      selections(content, 'Open', 'High');
      return content;
    };
    let content = await edit('/projects/1/tasks/4/rename', { title: '  Renamed  ' });
    assert.deepEqual(titles(content), ['Renamed']);
    assert.match(content, /aria-label="Complete Renamed"/);
    const invalid = await post('/projects/1/tasks/4/rename', { ...state, title: '  ' });
    content = await invalid.text();
    selections(content, 'Open', 'High');
    assert.match(content, /role="alert">Task title is required/);
    assert.deepEqual(titles(content), ['Renamed']);
    content = await edit('/projects/1/tasks/4/priority', { priority: 'Low' });
    assert.deepEqual(titles(content), []);
    content = await edit('/projects/1/tasks/1/priority', { priority: 'High' });
    assert.deepEqual(titles(content), ['Low open']);
    content = await edit('/projects/1/tasks/1', { completed: '1' });
    assert.deepEqual(titles(content), []);
    assert.match(await get('/'), /project-summary">4\/6 completed/);
    await post('/projects/1/archive');
    content = await view('Open', 'Low');
    selections(content, 'Open', 'Low');
    assert.deepEqual(titles(content), ['Renamed']);
    assert.match(content, /id="task-priority-4"[^>]* disabled/);
    assert.doesNotMatch(content, /id="(?:task-filter|priority-filter)"[^>]* disabled/);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await view('Open', 'Low'), content);
    await post('/projects/1/restore');
    content = await view('Open', 'Low');
    assert.deepEqual(titles(content), ['Renamed']);
    assert.doesNotMatch(content, / disabled/);
    assert.match(await get('/'), /project-summary">4\/6 completed/);
    selections(await get('/projects/1'), 'All', 'All');
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project defaults migrate, affect only new tasks, and persist independently', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-defaults-'));
  const dbPath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
    INSERT INTO projects (name) VALUES ('Existing');
    INSERT INTO tasks (project_id, title, completed, priority) VALUES (1, 'Old', 1, 'Low');
  `);
  legacy.close();
  let server;
  try {
    server = await start(dbPath);
    const get = path => fetch(`${server.url}${path}`).then(response => response.text());
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const defaultOptions = content => /<select id="default-task-priority"[^>]*>([\s\S]*?)<\/select>/.exec(content)[1].trim();
    const taskPriorities = content => [...content.matchAll(/<select id="task-priority-\d+"[^>]*>([\s\S]*?)<\/select>/g)]
      .map(match => /<option selected>(Low|Normal|High)<\/option>/.exec(match[1])[1]);
    const normalOptions = '<option>Low</option><option selected>Normal</option><option>High</option>';
    assert.equal(defaultOptions(await get('/projects/1')), normalOptions);
    assert.deepEqual(taskPriorities(await get('/projects/1')), ['Low']);
    await post('/projects', { name: 'Second' });
    assert.equal(defaultOptions(await get('/projects/2')), normalOptions);
    await post('/projects/1/tasks', { title: 'Before change' });
    const filteredPath = '/projects/1?filter=Completed&priorityFilter=Low';
    const before = await get(filteredPath);
    const response = await post('/projects/1/default-priority', {
      priority: 'High', filter: 'Completed', priorityFilter: 'Low',
    });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), filteredPath);
    const after = await get(filteredPath);
    assert.equal(after.replace('<option>Normal</option><option selected>High</option>', '<option selected>Normal</option><option>High</option>'), before);
    assert.deepEqual(taskPriorities(await get('/projects/1')), ['Low', 'Normal']);
    await post('/projects/1/tasks', { title: 'Inherited high' });
    await post('/projects/2/tasks', { title: 'Independent' });
    assert.deepEqual(taskPriorities(await get('/projects/2')), ['Normal']);
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Inherited low' });
    await post('/projects/1/tasks/3/rename', { title: 'Renamed high' });
    await post('/projects/1/rename', { name: 'Renamed project' });
    assert.deepEqual(taskPriorities(await get('/projects/1')), ['Low', 'Normal', 'High', 'Low']);
    assert.match(await get('/'), /project-summary">1\/4 completed/);
    const saved = await get('/projects/1');
    assert.equal((await post('/projects/1/default-priority', { priority: 'Urgent' })).status, 400);
    assert.equal((await post('/projects/999/default-priority', { priority: 'High' })).status, 404);
    assert.equal(await get('/projects/1'), saved);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), saved);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.match(archived, /id="default-task-priority" name="priority" disabled/);
    assert.equal((await post('/projects/1/default-priority', { priority: 'Normal' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), saved);
    await post('/projects/1/tasks', { title: 'After restore' });
    assert.deepEqual(taskPriorities(await get('/projects/1')), ['Low', 'Normal', 'High', 'Low', 'Low']);
    assert.match(await get('/'), /project-summary">1\/5 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('due dates validate Gregorian days, migrate, preserve task data, and survive restoration and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-dates-'));
  const dbPath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Existing');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Old', 1);
  `);
  legacy.close();
  let server;
  try {
    server = await start(dbPath);
    const get = path => fetch(`${server.url}${path}`).then(response => response.text());
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const dates = content => [...content.matchAll(/id="task-due-date-\d+" name="dueDate" value="([^"]*)"/g)].map(match => match[1]);
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'New' });
    await post('/projects/2/tasks', { title: 'Other' });
    assert.deepEqual(dates(await get('/projects/1')), ['', '']);
    assert.match(await get('/projects/1'), /<label for="task-due-date-1">Task due date<\/label>/);
    const path = '/projects/1?filter=Completed&priorityFilter=Normal';
    const selections = { filter: 'Completed', priorityFilter: 'Normal' };
    for (const dueDate of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '  2025-04-30 \t']) {
      const response = await post('/projects/1/tasks/1/due-date', { dueDate, ...selections });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), path);
      assert.deepEqual(dates(await get(path)), [dueDate.trim()]);
    }
    const saved = await get(path);
    for (const dueDate of ['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2025-02-29', '2024-04-31', '2024-00-01', '2024-13-01', '2024-01-00', '2024-01-32', '2024-1-01', '24-01-01', '2024-01-01T00:00:00Z', 'not a date']) {
      const response = await post('/projects/1/tasks/1/due-date', { dueDate, ...selections });
      assert.match(await response.text(), /role="alert">Due date must be a valid YYYY-MM-DD date/);
      assert.equal(await get(path), saved);
    }
    assert.equal((await post('/projects/2/tasks/1/due-date', { dueDate: '2024-01-01' })).status, 404);
    assert.equal((await post('/projects/999/tasks/1/due-date', { dueDate: '2024-01-01' })).status, 404);
    assert.deepEqual(dates(await get('/projects/2')), ['']);
    await post('/projects/1/tasks/2/due-date', { dueDate: '2026-12-25' });
    await post('/projects/1/tasks/1/rename', { title: 'Renamed', ...selections });
    assert.deepEqual(dates(await get('/projects/1')), ['2025-04-30', '2026-12-25']);
    assert.match(await get(path), /aria-label="Complete Renamed" checked/);
    assert.match(await get('/'), /project-summary">1\/2 completed/);
    const active = await get('/projects/1');
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), active);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.equal((archived.match(/name="dueDate" value="[^"]*" autocomplete="off" disabled/g) || []).length, 2);
    assert.equal((archived.match(/disabled>Save due date/g) || []).length, 2);
    assert.deepEqual(dates(await get(path)), ['2025-04-30']);
    assert.equal((await post('/projects/1/tasks/1/due-date', { dueDate: '' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), active);
    for (const dueDate of ['', ' \t\n ']) {
      await post('/projects/1/tasks/1/due-date', { dueDate, ...selections });
      assert.deepEqual(dates(await get(path)), ['']);
    }
    assert.deepEqual(dates(await get('/projects/1')), ['', '2026-12-25']);
    const cleared = await get('/projects/1');
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), cleared);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('inclusive due ranges intersect filters, validate without changing membership, and survive edits', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-ranges-'));
  let server;
  try {
    const dbPath = join(directory, 'workboard.sqlite');
    server = await start(dbPath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = path => fetch(`${server.url}${path}`).then(response => response.text());
    const titles = html => [...html.matchAll(/data-testid="task-row">\s*<span>([^<]*)<\/span>/g)].map(match => match[1]);
    const detail = values => get(`/projects/1?${new URLSearchParams(values)}`);
    await post('/projects', { name: 'Ranges' });
    for (const title of ['Before', 'Start', 'End', 'After', 'Undated']) {
      await post('/projects/1/tasks', { title });
    }
    for (const [index, dueDate] of ['2024-02-28', '2024-02-29', '2024-03-01', '2024-03-02'].entries()) {
      await post(`/projects/1/tasks/${index + 1}/due-date`, { dueDate });
    }
    const range = { dueFrom: '2024-02-29', dueThrough: '2024-03-01' };
    const applied = await post('/projects/1/due-range', { rangeFrom: ' 2024-02-29 ', rangeThrough: ' 2024-03-01 ' });
    assert.equal(applied.status, 303);
    assert.deepEqual(titles(await get(applied.headers.get('location'))), ['Start', 'End']);
    assert.deepEqual(titles(await detail({ dueFrom: '2024-03-01' })), ['End', 'After']);
    assert.deepEqual(titles(await detail({ dueThrough: '2024-02-29' })), ['Before', 'Start']);
    assert.deepEqual(titles(await detail({ dueFrom: '0001-01-01', dueThrough: '9999-12-31' })), ['Before', 'Start', 'End', 'After']);
    assert.equal(titles(await detail({})).length, 5);
    for (const [rangeFrom, rangeThrough, message] of [
      ['2023-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['', '0000-01-01', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-2-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-03-01', '2024-02-29', 'Due from must not be after Due through'],
    ]) {
      const html = await (await post('/projects/1/due-range', { ...range, rangeFrom, rangeThrough })).text();
      assert.ok(html.includes(`role="alert">${message}`));
      assert.deepEqual(titles(html), ['Start', 'End']);
      assert.ok(html.includes('name="dueFrom" value="2024-02-29"'));
    }
    const selections = { ...range, filter: 'Open', priorityFilter: 'Normal' };
    const edit = async (path, values) => {
      const response = await post(path, { ...selections, ...values });
      assert.equal(response.status, 303);
      const location = new URL(response.headers.get('location'), server.url);
      for (const [key, value] of Object.entries(selections)) assert.equal(location.searchParams.get(key), value);
      return get(location.pathname + location.search);
    };
    assert.deepEqual(titles(await edit('/projects/1/tasks/2/rename', { title: 'Renamed' })), ['Renamed', 'End']);
    assert.deepEqual(titles(await edit('/projects/1/rename', { name: 'New name' })), ['Renamed', 'End']);
    assert.deepEqual(titles(await edit('/projects/1/default-priority', { priority: 'High' })), ['Renamed', 'End']);
    assert.deepEqual(titles(await edit('/projects/1/tasks', { title: 'New undated' })), ['Renamed', 'End']);
    assert.deepEqual(titles(await edit('/projects/1/tasks/2/priority', { priority: 'High' })), ['End']);
    assert.deepEqual(titles(await edit('/projects/1/tasks/3', { completed: '1' })), []);
    assert.deepEqual(titles(await detail({ ...range, filter: 'Completed', priorityFilter: 'Normal' })), ['End']);
    assert.deepEqual(titles(await edit('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' })), ['Before']);
    assert.deepEqual(titles(await edit('/projects/1/tasks/1/due-date', { dueDate: '' })), []);
    assert.match(await get('/'), /project-summary">1\/6 completed/);
    const saved = await detail(range);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await detail(range), saved);
    await post('/projects/1/archive');
    const archived = await detail(range);
    assert.deepEqual(titles(archived), ['Renamed', 'End']);
    assert.match(archived, /id="due-from" name="rangeFrom" value="2024-02-29" autocomplete="off">/);
    assert.match(archived, />Apply due range<\/button>/);
    const archivedRange = await post('/projects/1/due-range', { rangeFrom: '', rangeThrough: '2024-02-29' });
    assert.deepEqual(titles(await get(archivedRange.headers.get('location'))), ['Renamed']);
    await post('/projects/1/restore');
    assert.equal(await detail(range), saved);
    const reopened = await get('/projects/1');
    assert.match(reopened, /id="due-from" name="rangeFrom" value=""/);
    assert.match(reopened, /id="due-through" name="rangeThrough" value=""/);
    assert.equal(titles(reopened).length, 6);
    const cleared = await post('/projects/1/due-range', { ...range, rangeFrom: '  ', rangeThrough: ' ' });
    assert.equal(titles(await get(cleared.headers.get('location'))).length, 6);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
