import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = /listening on port (\d+)/.exec(output);
      if (match) {
        clearTimeout(timeout);
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

test('projects and tasks validate, filter, isolate, and persist across restarts', async () => {
  const directory = await mkdtemp(join(process.cwd(), 'data-test-'));
  let server;
  try {
    const databasePath = join(directory, 'nested', 'projects.sqlite');
    server = await startServer(databasePath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const initial = await (await fetch(server.url)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);

    const create = name => fetch(`${server.url}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    for (const name of ['', ' \t\n ']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    const created = await create('  First project  ');
    assert.equal(created.status, 303);
    assert.equal(created.headers.get('location'), '/');
    await create('Second <script>alert("x")</script> & project');
    const list = await (await fetch(server.url)).text();
    assert.equal((list.match(/data-testid="project-row"/g) ?? []).length, 2);
    assert.match(list, /<span>First project<\/span>/);
    assert.match(list, /Second &lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; project/);
    assert.ok(list.indexOf('First project') < list.indexOf('Second'));
    const projectPath = /action="(\/projects\/\d+)"/.exec(list)[1];
    const detail = await (await fetch(`${server.url}${projectPath}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*>Projects<\/button>/);
    assert.equal((await fetch(`${server.url}/projects/99999`)).status, 404);

    assert.match(detail, /<label for="task-title">Task title<\/label>/);
    assert.match(detail, />Create task<\/button>/);
    assert.match(detail, /<label for="task-filter">Task filter<\/label>/);
    assert.match(detail, /<option value="all" selected>All<\/option>/);
    const createTask = (title, path = projectPath) => fetch(`${server.url}${path}/tasks`, {
      method: 'POST', body: new URLSearchParams({ title }), redirect: 'manual',
    });
    const taskCount = html => (html.match(/data-testid="task-row"/g) ?? []).length;
    const readProject = (query = '') => fetch(`${server.url}${projectPath}${query}`).then(response => response.text());
    for (const title of ['', ' \t\n ']) {
      const invalid = await createTask(title);
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(taskCount(html), 0);
    }
    const firstTask = await createTask('  First task  ');
    assert.equal(firstTask.status, 303);
    assert.equal(firstTask.headers.get('location'), projectPath);
    await createTask('Second <script> & "task"');
    const tasks = await readProject();
    assert.equal(taskCount(tasks), 2);
    assert.match(tasks, /<span>First task<\/span>/);
    assert.match(tasks, /aria-label="Complete First task"/);
    assert.match(tasks, /Second &lt;script&gt; &amp; &quot;task&quot;/);
    assert.ok(tasks.indexOf('<span>First task') < tasks.indexOf('<span>Second'));
    assert.doesNotMatch(tasks, / checked/);
    assert.equal(taskCount(await readProject('?filter=open')), 2);
    assert.equal(taskCount(await readProject('?filter=completed')), 0);
    const taskPath = /action="([^" ]+\/tasks\/\d+)"/.exec(tasks)[1];
    const setCompletion = (completed, filter = 'all', path = taskPath) => fetch(`${server.url}${path}`, {
      method: 'POST',
      body: new URLSearchParams({ ...(completed ? { completed: '1' } : {}), filter }),
      redirect: 'manual',
    });
    const complete = await setCompletion(true, 'open');
    assert.equal(complete.status, 303);
    assert.equal(complete.headers.get('location'), `${projectPath}?filter=open`);
    assert.match(await readProject(), /aria-label="Complete First task" checked/);
    const openTasks = await readProject('?filter=open');
    assert.equal(taskCount(openTasks), 1);
    assert.doesNotMatch(openTasks, /<span>First task/);
    const completedTasks = await readProject('?filter=completed');
    assert.equal(taskCount(completedTasks), 1);
    assert.match(completedTasks, /<span>First task/);
    assert.match(completedTasks, /value="completed" selected/);
    assert.equal(taskCount(await readProject('?filter=invalid')), 2);

    const secondPath = [...list.matchAll(/action="(\/projects\/\d+)"/g)][1][1];
    assert.equal(taskCount(await (await fetch(`${server.url}${secondPath}`)).text()), 0);
    assert.equal((await createTask('Other project task', secondPath)).status, 303);
    const otherTasks = await (await fetch(`${server.url}${secondPath}`)).text();
    assert.equal(taskCount(otherTasks), 1);
    assert.doesNotMatch(otherTasks, /<span>First task|<span>Second &lt;/);
    assert.equal((await setCompletion(false, 'all', taskPath.replace(projectPath, secondPath))).status, 404);
    assert.equal((await createTask('Missing', '/projects/99999')).status, 404);
    assert.equal((await setCompletion(true, 'all', `${projectPath}/tasks/99999`)).status, 404);
    await setCompletion(false);
    assert.equal(taskCount(await readProject('?filter=completed')), 0);
    assert.equal(taskCount(await readProject('?filter=open')), 2);
    await setCompletion(true);
    const savedDetail = await readProject();
    const savedList = await (await fetch(server.url)).text();

    await server.stop();
    server = await startServer(databasePath);
    const restored = await (await fetch(server.url)).text();
    assert.equal(restored, savedList);
    assert.equal(await readProject(), savedDetail);
    assert.equal(await readProject('?filter=completed'), completedTasks);
    assert.equal(await (await fetch(`${server.url}${secondPath}`)).text(), otherTasks);
    await setCompletion(false);
    assert.equal(taskCount(await readProject('?filter=completed')), 0);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});


test('an existing project database gains tasks without changing project IDs', async () => {
  const directory = await mkdtemp(join(process.cwd(), 'data-test-'));
  let server;
  try {
    const databasePath = join(directory, 'legacy.sqlite');
    const database = new DatabaseSync(databasePath);
    try {
      database.exec(`
        CREATE TABLE projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL CHECK(length(trim(name)) > 0)
        );
        INSERT INTO projects (id, name) VALUES (42, 'Existing project');
      `);
    } finally {
      database.close();
    }
    server = await startServer(databasePath);
    const list = await (await fetch(server.url)).text();
    assert.match(list, /action="\/projects\/42"/);
    assert.match(list, /data-testid="project-summary">0\/0 completed/);
    const result = await fetch(`${server.url}/projects/42/tasks`, {
      method: 'POST', body: new URLSearchParams({ title: 'New task' }), redirect: 'manual',
    });
    assert.equal(result.status, 303);
    const detail = await (await fetch(`${server.url}/projects/42`)).text();
    assert.match(detail, /<h1>Existing project<\/h1>/);
    assert.match(detail, /<span>New task<\/span>/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});


test('archive and restore preserve tasks, summaries, and read-only behavior across restarts', async () => {
  const directory = await mkdtemp(join(process.cwd(), 'data-test-'));
  let server;
  try {
    const databasePath = join(directory, 'archive.sqlite');
    server = await startServer(databasePath);
    const read = path => fetch(`${server.url}${path}`).then(response => response.text());
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const rows = html => (html.match(/data-testid="project-row"/g) ?? []).length;
    const tasks = html => (html.match(/data-testid="task-row"/g) ?? []).length;
    const initial = await read('/');
    assert.match(initial, /<label for="project-filter">Project filter<\/label>/);
    assert.match(initial, /value="active" selected>Active/);
    assert.match(initial, /value="archived">Archived/);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    let list = await read('/');
    assert.equal((list.match(/data-testid="project-summary">0\/0 completed/g) ?? []).length, 2);
    assert.match(list, />Archive project<\/button>/);
    assert.doesNotMatch(list, />Restore project<\/button>/);
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Open' });
    await post('/projects/1/tasks/1', { completed: '1' });
    assert.match(await read('/'), /data-testid="project-summary">1\/2 completed/);
    await read('/projects/1?filter=completed');
    assert.match(await read('/'), /data-testid="project-summary">1\/2 completed/);

    assert.equal((await post('/projects/1/archive')).status, 303);
    assert.equal(rows(await read('/')), 1);
    assert.doesNotMatch(await read('/'), /<span>First<\/span>/);
    const archivedList = await read('/?filter=archived');
    assert.equal(rows(archivedList), 1);
    assert.match(archivedList, /value="archived" selected>Archived/);
    assert.match(archivedList, /<span>First<\/span>/);
    assert.match(archivedList, /data-testid="project-summary">1\/2 completed/);
    assert.match(archivedList, />Open project<\/button>/);
    assert.match(archivedList, />Restore project<\/button>/);
    assert.doesNotMatch(archivedList, />Archive project<\/button>/);
    const archivedPage = await read('/projects/1');
    assert.match(archivedPage, /<p>Archived project<\/p>/);
    assert.match(archivedPage, /<button type="submit" disabled>Create task/);
    assert.equal((archivedPage.match(/type="checkbox"[^>]* disabled/g) ?? []).length, 2);
    assert.match(archivedPage, /aria-label="Complete Done" checked disabled/);
    assert.equal(tasks(await read('/projects/1?filter=open')), 1);
    assert.equal(tasks(await read('/projects/1?filter=completed')), 1);
    assert.equal((await post('/projects/1/tasks', { title: 'Forbidden' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1')).status, 403);
    assert.equal(await read('/projects/1'), archivedPage);
    assert.equal((await post('/projects/99999/archive')).status, 404);
    assert.equal((await post('/projects/99999/restore')).status, 404);

    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await read('/?filter=archived'), archivedList);
    assert.equal(await read('/projects/1'), archivedPage);
    assert.equal(rows(await read('/')), 1);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.equal(rows(await read('/?filter=archived')), 0);
    list = await read('/');
    assert.equal(rows(list), 2);
    assert.ok(list.indexOf('<span>First') < list.indexOf('<span>Second'));
    assert.match(list, /data-testid="project-summary">1\/2 completed/);
    const restoredPage = await read('/projects/1');
    assert.doesNotMatch(restoredPage, /Archived project| disabled/);
    assert.match(restoredPage, /aria-label="Complete Done" checked/);
    await post('/projects/1/tasks/2', { completed: '1' });
    assert.match(await read('/'), /data-testid="project-summary">2\/2 completed/);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(rows(await read('/')), 2);
    assert.match(await read('/'), /data-testid="project-summary">2\/2 completed/);
    assert.equal(tasks(await read('/projects/1?filter=completed')), 2);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive migration preserves existing task IDs and completion', async () => {
  const directory = await mkdtemp(join(process.cwd(), 'data-test-'));
  let server;
  try {
    const databasePath = join(directory, 'legacy-tasks.sqlite');
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
        INSERT INTO projects VALUES (42, 'Existing project');
        INSERT INTO tasks VALUES (73, 42, 'Existing task', 1);
      `);
    } finally {
      database.close();
    }
    server = await startServer(databasePath);
    const list = await (await fetch(server.url)).text();
    assert.match(list, /action="\/projects\/42"/);
    assert.match(list, /data-testid="project-summary">1\/1 completed/);
    assert.match(list, />Archive project<\/button>/);
    const detail = await (await fetch(`${server.url}/projects/42`)).text();
    assert.match(detail, /action="\/projects\/42\/tasks\/73"/);
    assert.match(detail, /aria-label="Complete Existing task" checked/);
    assert.doesNotMatch(detail, /Archived project| disabled/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
