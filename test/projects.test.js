import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
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
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const baseUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', chunk => {
      const match = chunk.toString().match(/listening on port (\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
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

test('project creation, validation, navigation, and persistence across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const request = path => fetch(server.baseUrl + path);
    const create = name => fetch(server.baseUrl + '/projects', {
      method: 'POST',
      body: new URLSearchParams({ name }),
      redirect: 'manual',
    });
    const health = await request('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const initial = await (await request('/')).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);

    for (const blank of ['', '   \t\n']) {
      const invalid = await create(blank);
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    const created = await create('  First project  ');
    assert.equal(created.status, 303);
    assert.equal(created.headers.get('location'), '/');
    await create('Second <script>alert("x")</script>');
    const list = await (await request('/')).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(list, /<span class="project-name">First project<\/span>/);
    assert.ok(list.indexOf('First project') < list.indexOf('Second &lt;script&gt;'));
    assert.doesNotMatch(list, /<script>/);
    const paths = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    assert.notEqual(paths[0], paths[1]);
    const detail = await (await request(paths[0])).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/">.*>Projects<\/button>/);
    assert.equal((await request('/projects/999999')).status, 404);
    const rejected = await (await create('   ')).text();
    assert.equal((rejected.match(/data-testid="project-row"/g) || []).length, 2);
    assert.equal(await (await request('/')).text(), list);

    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await (await request('/')).text(), list);
    assert.equal(await (await request(paths[0])).text(), detail);
    assert.match(await (await request(paths[1])).text(), /<h1>Second &lt;script&gt;/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate titles, stay within their project, filter, and persist completion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const get = async path => (await fetch(server.baseUrl + path)).text();
    const post = (path, values) => fetch(server.baseUrl + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const rows = html => [...html.matchAll(/<div class="task-row" data-testid="task-row">([\s\S]*?)<\/div>/g)].map(match => match[1]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const initial = await get('/projects/1');
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, />Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    assert.equal(rows(initial).length, 0);
    for (const title of ['', '  \t\n']) {
      const invalid = await post('/projects/1/tasks', { title });
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(rows(html).length, 0);
    }
    const created = await post('/projects/1/tasks', { title: '  First task  ' });
    assert.equal(created.status, 303);
    assert.equal(created.headers.get('location'), '/projects/1?filter=All');
    await post('/projects/1/tasks', { title: 'Second <task> "quoted"' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    let all = rows(await get('/projects/1'));
    assert.equal(all.length, 2);
    assert.match(all[0], /<span>First task<\/span>/);
    assert.match(all[0], /aria-label="Complete First task"/);
    assert.match(all[1], /aria-label="Complete Second &lt;task&gt; &quot;quoted&quot;"/);
    assert.doesNotMatch(all.join(''), / checked/);
    assert.doesNotMatch(all.join(''), /Other project task/);
    const other = rows(await get('/projects/2'));
    assert.equal(other.length, 1);
    assert.match(other[0], /Other project task/);
    const taskPath = all[0].match(/action="([^"]+)"/)[1];
    const complete = await post(taskPath, { completed: '1', filter: 'Open' });
    assert.equal(complete.status, 303);
    assert.equal(complete.headers.get('location'), '/projects/1?filter=Open');
    all = rows(await get('/projects/1'));
    assert.match(all[0], / checked/);
    assert.doesNotMatch(all[1], / checked/);
    const open = rows(await get('/projects/1?filter=Open'));
    const completed = rows(await get('/projects/1?filter=Completed'));
    assert.equal(open.length, 1);
    assert.match(open[0], /Second &lt;task&gt;/);
    assert.equal(completed.length, 1);
    assert.match(completed[0], /First task/);
    const crossProjectPath = taskPath.replace('/projects/1/', '/projects/2/');
    assert.equal((await post(crossProjectPath, {})).status, 404);
    assert.match(rows(await get('/projects/1'))[0], / checked/);
    assert.equal((await post('/projects/999/tasks', { title: 'Missing project' })).status, 404);
    const invalid = await post('/projects/1/tasks', { title: '   ' });
    assert.equal(rows(await invalid.text()).length, 2);
    const saved = await get('/projects/1');
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), saved);
    assert.equal(rows(await get('/projects/1?filter=Completed')).length, 1);
    assert.deepEqual(rows(await get('/projects/2')), other);
    assert.equal((await post(taskPath, { filter: 'Completed' })).status, 303);
    assert.equal(rows(await get('/projects/1?filter=Completed')).length, 0);
    assert.equal(rows(await get('/projects/1?filter=Open')).length, 2);
    await server.stop();
    server = await startServer(databasePath);
    assert.doesNotMatch(rows(await get('/projects/1')).join(''), / checked/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('checkbox changes finish saving before an immediate reload', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-completion-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values) => fetch(server.baseUrl + path, {
      method: 'POST', body: new URLSearchParams(values),
    });
    const getProject = async () => (await fetch(server.baseUrl + '/projects/1')).text();
    await post('/projects', { name: 'Completion regression' });
    await post('/projects/1/tasks', { title: 'Done task' });
    const html = await getProject();
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    assert.match(html, /onchange="saveTaskCompletion\(this\)"/);
    const error = { hidden: true, textContent: '' };
    let reloads = 0;
    const context = {
      document: { getElementById: () => error },
      window: { location: { reload: () => { reloads++; } } },
      URLSearchParams,
      FormData: class {
        constructor(form) {
          return new URLSearchParams({
            filter: form.elements.filter.value,
            ...(checkbox.checked ? { completed: '1' } : {}),
          });
        }
      },
      XMLHttpRequest: class {
        headers = {};
        open(method, url, asynchronous) {
          assert.equal(asynchronous, false);
          this.method = method;
          this.url = url;
        }
        setRequestHeader(name, value) { this.headers[name] = value; }
        send(body) {
          // A separate process sends HTTP while the browser handler waits.
          this.status = Number(execFileSync(process.execPath, ['--input-type=module', '-e', `
            const response = await fetch(process.argv[1], {
              method: process.argv[2], headers: JSON.parse(process.argv[3]), body: process.argv[4],
            });
            console.log(response.status);
          `, this.url, this.method, JSON.stringify(this.headers), body], { encoding: 'utf8' }));
        }
      },
    };
    const checkbox = {
      checked: true,
      form: { action: server.baseUrl + '/projects/1/tasks/1', elements: { filter: { value: 'All' } } },
    };
    runInNewContext(script, context);
    context.saveTaskCompletion(checkbox);
    assert.match(await getProject(), /aria-label="Complete Done task" checked/);
    checkbox.checked = false;
    context.saveTaskCompletion(checkbox);
    assert.doesNotMatch(await getProject(), /aria-label="Complete Done task" checked/);
    assert.equal(error.hidden, true);
    await server.stop();
    server = await startServer(databasePath);
    assert.doesNotMatch(await getProject(), /aria-label="Complete Done task" checked/);

    checkbox.form.action = server.baseUrl + '/projects/1/tasks/1';
    checkbox.form.elements.filter.value = 'Open';
    checkbox.checked = true;
    context.saveTaskCompletion(checkbox);
    assert.equal(reloads, 1);
    assert.match(await getProject(), /aria-label="Complete Done task" checked/);

    checkbox.form.action = server.baseUrl + '/projects/2/tasks/1';
    checkbox.checked = false;
    context.saveTaskCompletion(checkbox);
    assert.equal(checkbox.checked, true);
    assert.equal(error.hidden, false);
    assert.match(error.textContent, /Could not save task completion/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive and restore preserve tasks and summaries, including existing databases', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  // Match the schema from the previous task to exercise the upgrade path.
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
    );
    INSERT INTO projects (name) VALUES ('Existing project');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing task', 1);
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(databasePath);
    const get = async path => (await fetch(server.baseUrl + path)).text();
    const post = (path, values = {}) => fetch(server.baseUrl + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const summaries = html => [...html.matchAll(/data-testid="project-summary">([^<]+)/g)].map(match => match[1]);
    const taskRows = html => [...html.matchAll(/data-testid="task-row">([\s\S]*?)<\/div>/g)].map(match => match[1]);

    let active = await get('/');
    assert.match(active, /<label for="project-filter">Project filter<\/label>/);
    assert.match(active, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.deepEqual(summaries(active), ['1/1 completed']);
    await post('/projects', { name: 'New project' });
    assert.deepEqual(summaries(await get('/')), ['1/1 completed', '0/0 completed']);
    await post('/projects/1/tasks', { title: 'Open task' });
    await post('/projects/2/tasks', { title: 'Separate task' });
    assert.deepEqual(summaries(await get('/')), ['1/2 completed', '0/1 completed']);
    const originalTasks = taskRows(await get('/projects/1'));
    assert.equal((await post('/projects/1/archive')).status, 303);
    active = await get('/');
    assert.doesNotMatch(active, /Existing project/);
    assert.match(active, /New project/);
    assert.deepEqual(summaries(active), ['0/1 completed']);
    const archivedList = await get('/?filter=Archived');
    assert.match(archivedList, /Existing project/);
    assert.doesNotMatch(archivedList, /New project/);
    assert.match(archivedList, />Open project<\/button>/);
    assert.match(archivedList, />Restore project<\/button>/);
    assert.doesNotMatch(archivedList, />Archive project<\/button>/);
    assert.deepEqual(summaries(archivedList), ['1/2 completed']);
    const archivedPage = await get('/projects/1');
    assert.match(archivedPage, />Archived project</);
    assert.match(archivedPage, /<button type="submit" disabled>Create task<\/button>/);
    const archivedTasks = taskRows(archivedPage);
    assert.equal(archivedTasks.length, 2);
    for (const row of archivedTasks) assert.match(row, /type="checkbox"[^>]* disabled/);
    assert.match(archivedTasks[0], / checked disabled/);
    assert.doesNotMatch(archivedTasks[1], / checked/);
    const open = taskRows(await get('/projects/1?filter=Open'));
    const completed = taskRows(await get('/projects/1?filter=Completed'));
    assert.equal(open.length, 1);
    assert.match(open[0], /Open task/);
    assert.equal(completed.length, 1);
    assert.match(completed[0], /Existing task/);
    assert.deepEqual(summaries(await get('/?filter=Archived')), ['1/2 completed']);
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked task' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1')).status, 403);
    assert.equal(await get('/projects/1'), archivedPage);
    assert.equal((await post('/projects/999/archive')).status, 404);
    assert.equal((await post('/projects/999/restore')).status, 404);

    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/?filter=Archived'), archivedList);
    assert.equal(await get('/projects/1'), archivedPage);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.doesNotMatch(await get('/?filter=Archived'), /data-testid="project-row"/);
    const restored = await get('/projects/1');
    assert.doesNotMatch(restored, />Archived project</);
    assert.deepEqual(taskRows(restored), originalTasks);
    active = await get('/');
    assert.ok(active.indexOf('Existing project') < active.indexOf('New project'));
    assert.deepEqual(summaries(active), ['1/2 completed', '0/1 completed']);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/'), active);
    assert.equal(await get('/projects/1'), restored);
    await post('/projects/1/tasks/2', { completed: '1' });
    assert.deepEqual(summaries(await get('/')), ['2/2 completed', '0/1 completed']);
    await post('/projects/1/tasks/1');
    assert.deepEqual(summaries(await get('/')), ['1/2 completed', '0/1 completed']);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
