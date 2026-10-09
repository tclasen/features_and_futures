import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { runInNewContext } from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const url = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', code => reject(new Error(`Server exited: ${code}\n${output}`)));
    child.stderr.on('data', data => { output += data; });
    child.stdout.on('data', data => {
      output += data;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
  });
  return {
    url,
    async stop() {
      const exit = once(child, 'exit');
      child.kill('SIGTERM');
      await exit;
    },
  };
}

test('projects validate, render safely, navigate, and survive restart', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const dbPath = join(directory, 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    let html = await (await fetch(server.url)).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, />Create project<\/button>/);
    const create = name => fetch(`${server.url}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    for (const name of ['', '  \t  ']) {
      const response = await create(name);
      html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    for (const name of ['  First project  ', 'Second <project>']) {
      const response = await create(name);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    html = await (await fetch(server.url)).text();
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(html, /<span>First project<\/span>/);
    assert.match(html, /<span>Second &lt;project&gt;<\/span>/);
    assert.ok(html.indexOf('First project') < html.indexOf('Second &lt;project&gt;'));
    const paths = [...html.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    const detail = await (await fetch(`${server.url}${paths[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*>Projects<\/button>/);
    assert.equal((await fetch(`${server.url}/projects/9999`)).status, 404);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await (await fetch(server.url)).text(), html);
    assert.equal(await (await fetch(`${server.url}${paths[0]}`)).text(), detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, remain scoped, and persist completion', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  let server;
  try {
    const dbPath = join(directory, 'tasks.sqlite');
    server = await start(dbPath);
    const post = (path, values) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const detail = (id, filter = 'All') => fetch(`${server.url}/projects/${id}?filter=${filter}`).then(r => r.text());
    const rows = html => [...html.matchAll(/data-testid="task-row"[\s\S]*?<\/form>/g)].map(match => match[0]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    let html = await detail(1);
    assert.match(html, /<label for="task-title">Task title<\/label>/);
    assert.match(html, />Create task<\/button>/);
    assert.match(html, /<label for="task-filter">Task filter<\/label>/);
    assert.match(html, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', '  \t ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      assert.match(await response.text(), /role="alert">Task title is required/);
      assert.equal(rows(await detail(1)).length, 0);
    }
    await post('/projects/1/tasks', { title: '  First task  ' });
    await post('/projects/1/tasks', { title: 'Next <task>' });
    await post('/projects/2/tasks', { title: 'Other task' });
    html = await detail(1);
    assert.equal(rows(html).length, 2);
    assert.match(rows(html)[0], /aria-label="Complete First task"/);
    assert.doesNotMatch(rows(html)[0], / checked/);
    assert.match(rows(html)[1], /Next &lt;task&gt;/);
    assert.doesNotMatch(html, /Other task/);
    assert.equal(rows(await detail(1, 'Completed')).length, 0);
    assert.equal(rows(await detail(1, 'Open')).length, 2);
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    const update = await post('/projects/1/tasks/1', { completed: '1', filter: 'Open' });
    assert.equal(update.headers.get('location'), '/projects/1?filter=Open');
    assert.match(rows(await detail(1))[0], / checked/);
    assert.equal(rows(await detail(1, 'Open')).length, 1);
    assert.match(rows(await detail(1, 'Completed'))[0], /First task/);
    const saved = await detail(1);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await detail(1), saved);
    assert.match(await detail(2), /Other task/);
    await post('/projects/1/tasks/1', {});
    assert.doesNotMatch(rows(await detail(1))[0], / checked/);
    assert.equal(rows(await detail(1, 'Completed')).length, 0);
    assert.equal(rows(await detail(1, 'Open')).length, 2);

    // Exercise the actual page script: checkbox saves must not navigate, and
    // filter navigation must wait until the database update has finished.
    const script = (await detail(1)).match(/<script>([\s\S]*?)<\/script>/)[1];
    const alert = { hidden: true };
    let release;
    let gate;
    const requests = [];
    const context = {
      URLSearchParams,
      FormData: class {
        constructor() {
          return [['filter', 'All'], ...(input.checked ? [['completed', '1']] : [])];
        }
      },
      document: { getElementById: () => alert },
      fetch: async (url, options) => {
        requests.push(options);
        await gate;
        return fetch(url, options);
      },
    };
    const input = {
      checked: false, disabled: false,
      form: { action: `${server.url}/projects/1/tasks/1` },
    };
    runInNewContext(script, context);
    for (const completed of [true, false]) {
      input.checked = completed;
      gate = new Promise(resolve => { release = resolve; });
      const save = context.saveCompletion(input);
      assert.equal(input.disabled, true);
      let navigated = false;
      const navigation = context.submitTaskFilter({ requestSubmit() { navigated = true; } });
      await Promise.resolve();
      assert.equal(navigated, false);
      release();
      await save;
      await navigation;
      assert.equal(navigated, true);
      assert.equal(input.disabled, false);
      assert.equal(input.checked, completed);
      assert.equal(rows(await detail(1))[0].includes(' checked'), completed);
    }
    assert.equal(requests[0].body.get('completed'), '1');
    assert.equal(requests[1].body.has('completed'), false);
    assert.equal(alert.hidden, true);
    await server.stop();
    server = await start(dbPath);
    assert.doesNotMatch(rows(await detail(1))[0], / checked/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive migration, summaries, read-only tasks, and restore persist', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const dbPath = join(directory, 'archive.sqlite');
  // Seed the previous schema to verify existing data survives the upgrade.
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)));
    INSERT INTO projects (name) VALUES ('Existing'), ('Empty');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Done', 1), (1, 'Open', 0);
  `);
  db.close();
  let server;
  try {
    server = await start(dbPath);
    const get = path => fetch(`${server.url}${path}`).then(response => response.text());
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const projectRows = html => [...html.matchAll(/data-testid="project-row"[\s\S]*?<\/div>/g)].map(match => match[0]);
    let html = await get('/');
    assert.match(html, /<label for="project-filter">Project filter<\/label>/);
    assert.match(html, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(projectRows(html)[0], /data-testid="project-summary">1\/2 completed/);
    assert.match(projectRows(html)[1], /data-testid="project-summary">0\/0 completed/);
    assert.match(projectRows(html)[0], />Archive project<\/button>/);
    assert.equal((await post('/projects/1/archive')).status, 303);
    assert.equal(projectRows(await get('/')).length, 1);
    html = await get('/?filter=Archived');
    assert.equal(projectRows(html).length, 1);
    assert.match(html, /Existing/);
    assert.match(html, />Open project<\/button>/);
    assert.match(html, />Restore project<\/button>/);
    assert.match(html, /1\/2 completed/);
    const archivedPage = await get('/projects/1');
    assert.match(archivedPage, /Archived project/);
    assert.match(archivedPage, /<button type="submit" disabled>Create task/);
    assert.equal((archivedPage.match(/type="checkbox"[^>]* disabled/g) || []).length, 2);
    html = await get('/projects/1?filter=Completed');
    assert.match(html, /aria-label="Complete Done"/);
    assert.doesNotMatch(html, /aria-label="Complete Open"/);
    html = await get('/projects/1?filter=Open');
    assert.match(html, /aria-label="Complete Open"/);
    assert.doesNotMatch(html, /aria-label="Complete Done"/);
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1', {})).status, 403);
    assert.equal(await get('/projects/1'), archivedPage);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), archivedPage);
    assert.match(await get('/?filter=Archived'), /1\/2 completed/);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.equal(projectRows(await get('/?filter=Archived')).length, 0);
    html = await get('/projects/1');
    assert.doesNotMatch(html, /Archived project| disabled/);
    assert.match(html, /aria-label="Complete Done" checked/);
    assert.equal((await post('/projects/1/tasks', { title: 'After restore' })).status, 303);
    assert.match(await get('/'), /1\/3 completed/);
    await post('/projects/1/tasks/2', { completed: '1' });
    assert.match(await get('/'), /2\/3 completed/);
    await server.stop();
    server = await start(dbPath);
    assert.match(await get('/'), /2\/3 completed/);
    assert.match(await get('/projects/1'), /After restore/);
    assert.equal((await post('/projects/999/archive')).status, 404);
    assert.equal((await post('/projects/999/restore')).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
