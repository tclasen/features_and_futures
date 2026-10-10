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

test('rename preserves identity, order, tasks, summaries, and archive restrictions across restarts', async () => {
  const directory = await mkdtemp(join(process.cwd(), 'data-test-'));
  let server;
  try {
    const databasePath = join(directory, 'rename.sqlite');
    server = await startServer(databasePath);
    const read = path => fetch(`${server.url}${path}`).then(response => response.text());
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Open' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await read('/projects/1');
    assert.match(original, /<label for="new-project-name">New project name<\/label>/);
    assert.match(original, /<button type="submit">Rename project<\/button>/);
    assert.doesNotMatch(original, / disabled/);
    for (const name of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/rename', { name, filter: 'open' });
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /id="rename-error" role="alert">Project name is required/);
      assert.match(html, /<h1>Original<\/h1>/);
      assert.match(html, /value="open" selected>Open/);
      assert.doesNotMatch(html, /id="task-title"[^>]*aria-invalid/);
      assert.equal(await read('/projects/1'), original);
    }
    assert.equal((await post('/projects/99999/rename', { name: 'Missing' })).status, 404);
    assert.equal((await post('/projects/9007199254740992/rename', { name: 'Missing' })).status, 404);
    const renamed = await post('/projects/1/rename', { name: '  Renamed <one> & "two"  ', filter: 'completed' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=completed');
    const heading = '<h1>Renamed &lt;one&gt; &amp; &quot;two&quot;</h1>';
    const detail = await read('/projects/1');
    assert.ok(detail.includes(heading));
    assert.match(detail, /action="\/projects\/1\/tasks\/1"/);
    assert.match(detail, /aria-label="Complete Done" checked/);
    assert.match(detail, /aria-label="Complete Open" onchange/);
    assert.equal((detail.match(/data-testid="task-row"/g) ?? []).length, 2);
    const list = await read('/');
    assert.match(list, /<span>Renamed &lt;one&gt; &amp; &quot;two&quot;<\/span>/);
    assert.ok(list.indexOf('<span>Renamed') < list.indexOf('<span>Second'));
    assert.match(list, /data-testid="project-summary">1\/2 completed/);
    assert.match(list, /action="\/projects\/1"/);

    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await read('/'), list);
    assert.equal(await read('/projects/1'), detail);
    await post('/projects/1/archive');
    const archived = await read('/projects/1');
    assert.match(archived, /id="new-project-name"[^>]* disabled/);
    assert.match(archived, /<button type="submit" disabled>Rename project/);
    assert.equal((await post('/projects/1/rename', { name: 'Forbidden' })).status, 403);
    assert.equal(await read('/projects/1'), archived);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await read('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.doesNotMatch(await read('/projects/1'), / disabled/);
    assert.equal((await post('/projects/1/rename', { name: '  Restored name  ' })).status, 303);
    const restored = await read('/projects/1');
    assert.match(restored, /<h1>Restored name<\/h1>/);
    assert.match(restored, /aria-label="Complete Done" checked/);
    assert.match(restored, /<span>Open<\/span>/);
    assert.match(await read('/'), /data-testid="project-summary">1\/2 completed/);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await read('/projects/1'), restored);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive and priority migrations preserve existing task IDs and completion', async () => {
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
    assert.match(detail, /id="task-priority-73" name="priority" onchange/);
    assert.match(detail, /value="Normal" selected>Normal/);
    assert.doesNotMatch(detail, /Archived project| disabled/);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await (await fetch(`${server.url}/projects/42`)).text(), detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task rename preserves ownership, order, completion, filters, and archive restrictions across restarts', async () => {
  const directory = await mkdtemp(join(process.cwd(), 'data-test-'));
  let server;
  try {
    const databasePath = join(directory, 'task-rename.sqlite');
    server = await startServer(databasePath);
    const read = path => fetch(`${server.url}${path}`).then(response => response.text());
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    await post('/projects', { name: 'First project' });
    await post('/projects', { name: 'Second project' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Open' });
    await post('/projects/2/tasks', { title: 'Other task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await read('/projects/1');
    const other = await read('/projects/2');
    const summary = await read('/');
    assert.equal((original.match(/>New task title<\/label>/g) ?? []).length, 2);
    assert.equal((original.match(/>Rename task<\/button>/g) ?? []).length, 2);
    assert.match(original, /id="new-task-title-1" name="title" type="text">/);
    assert.doesNotMatch(original, / disabled/);
    for (const title of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/tasks/1/rename', { title, filter: 'completed' });
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.match(html, /id="new-task-title-1"[^>]*aria-invalid="true"/);
      assert.match(html, /aria-label="Complete Done" checked/);
      assert.match(html, /value="completed" selected/);
      assert.equal(await read('/projects/1'), original);
      assert.equal(await read('/'), summary);
    }
    for (const path of [
      '/projects/2/tasks/1/rename', '/projects/1/tasks/3/rename',
      '/projects/1/tasks/99999/rename', '/projects/99999/tasks/1/rename',
      '/projects/1/tasks/9007199254740992/rename',
    ]) {
      assert.equal((await post(path, { title: 'Forbidden' })).status, 404);
    }
    assert.equal(await read('/projects/2'), other);
    const renamed = await post('/projects/1/tasks/1/rename', {
      title: '  Renamed <done> & "task"  ', filter: 'completed',
    });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=completed');
    const escapedTitle = 'Renamed &lt;done&gt; &amp; &quot;task&quot;';
    let detail = await read('/projects/1');
    assert.ok(detail.includes(`<span>${escapedTitle}</span>`));
    assert.ok(detail.includes(`aria-label="Complete ${escapedTitle}" checked`));
    assert.match(detail, /action="\/projects\/1\/tasks\/1\/rename"/);
    assert.ok(detail.indexOf(`<span>${escapedTitle}`) < detail.indexOf('<span>Open'));
    assert.doesNotMatch(await read('/projects/1?filter=open'), /<span>Renamed/);
    assert.match(await read('/projects/1?filter=completed'), /<span>Renamed/);
    assert.equal(await read('/'), summary);
    assert.equal(await read('/projects/2'), other);
    const renameOpen = await post('/projects/1/tasks/2/rename', { title: '  Renamed open  ', filter: 'open' });
    assert.equal(renameOpen.headers.get('location'), '/projects/1?filter=open');
    assert.match(await read('/projects/1?filter=open'), /aria-label="Complete Renamed open" onchange/);
    assert.doesNotMatch(await read('/projects/1?filter=completed'), /<span>Renamed open/);
    detail = await read('/projects/1');

    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await read('/projects/1'), detail);
    assert.equal(await read('/'), summary);
    assert.equal(await read('/projects/2'), other);
    await post('/projects/1/archive');
    const archived = await read('/projects/1');
    assert.equal((archived.match(/id="new-task-title-\d+"[^>]* disabled/g) ?? []).length, 2);
    assert.equal((archived.match(/<button type="submit" disabled>Rename task/g) ?? []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Forbidden' })).status, 403);
    assert.equal(await read('/projects/1'), archived);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await read('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await read('/projects/1'), detail);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: '  Restored title  ' })).status, 303);
    const restored = await read('/projects/1');
    assert.match(restored, /aria-label="Complete Restored title" checked/);
    assert.equal(await read('/'), summary);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await read('/projects/1'), restored);
    // Completion still targets the same task after renaming.
    await post('/projects/1/tasks/1');
    assert.match(await read('/projects/1'), /aria-label="Complete Restored title" onchange/);
    assert.match(await read('/'), /data-testid="project-summary">0\/2 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('priorities persist independently and preserve task data through renaming, archive, and restore', async () => {
  const directory = await mkdtemp(join(process.cwd(), 'data-test-'));
  let server;
  try {
    const databasePath = join(directory, 'priorities.sqlite');
    server = await startServer(databasePath);
    const read = path => fetch(`${server.url}${path}`).then(response => response.text());
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const priorityPath = '/projects/1/tasks/1/priority';
    const priorityOptions = (html, id) => {
      const select = new RegExp(`<select id="task-priority-${id}"[^>]*>([\\s\\S]*?)</select>`).exec(html);
      assert.ok(select, `Priority selector for task ${id} exists`);
      return [...select[1].matchAll(/<option value="([^"]+)"( selected)?>([^<]+)<\/option>/g)]
        .map(match => ({ value: match[1], selected: Boolean(match[2]), label: match[3] }));
    };
    const selectedPriority = (html, id) => priorityOptions(html, id).find(option => option.selected)?.value;
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Open' });
    await post('/projects/2/tasks', { title: 'Other' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await read('/projects/1');
    const other = await read('/projects/2');
    const summary = await read('/');
    assert.match(original, /<label for="task-priority-1">Task priority<\/label>/);
    assert.deepEqual(priorityOptions(original, 1), [
      { value: 'Low', selected: false, label: 'Low' },
      { value: 'Normal', selected: true, label: 'Normal' },
      { value: 'High', selected: false, label: 'High' },
    ]);
    assert.equal(selectedPriority(original, 2), 'Normal');
    assert.equal(selectedPriority(other, 3), 'Normal');
    for (const priority of ['', 'Urgent', 'high', ' High ']) {
      assert.equal((await post(priorityPath, { priority })).status, 400);
      assert.equal(await read('/projects/1'), original);
    }
    assert.equal((await post(priorityPath)).status, 400);
    for (const path of [
      '/projects/2/tasks/1/priority', '/projects/1/tasks/3/priority',
      '/projects/99999/tasks/1/priority', '/projects/1/tasks/99999/priority',
      '/projects/1/tasks/9007199254740992/priority',
      '/projects/9007199254740992/tasks/1/priority',
    ]) {
      assert.equal((await post(path, { priority: 'High' })).status, 404);
    }
    for (const priority of ['Low', 'Normal', 'High']) {
      const changed = await post(priorityPath, { priority, filter: 'completed' });
      assert.equal(changed.status, 303);
      assert.equal(changed.headers.get('location'), '/projects/1?filter=completed');
      const detail = await read('/projects/1');
      assert.equal(selectedPriority(detail, 1), priority);
      assert.equal(selectedPriority(detail, 2), 'Normal');
      assert.match(detail, /aria-label="Complete Done" checked/);
      assert.ok(detail.indexOf('<span>Done') < detail.indexOf('<span>Open'));
      assert.equal(await read('/projects/2'), other);
      assert.equal(await read('/'), summary);
      assert.doesNotMatch(await read('/projects/1?filter=open'), /id="task-priority-1"/);
      assert.equal(selectedPriority(await read('/projects/1?filter=completed'), 1), priority);
    }
    await post('/projects/1/tasks/2/priority', { priority: 'Low', filter: 'open' });
    await post('/projects/1/tasks/1/rename', { title: '  Renamed done  ' });
    let detail = await read('/projects/1');
    assert.match(detail, /aria-label="Complete Renamed done" checked/);
    assert.equal(selectedPriority(detail, 1), 'High');
    assert.equal(selectedPriority(detail, 2), 'Low');
    assert.equal(await read('/'), summary);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await read('/projects/1'), detail);
    assert.equal(await read('/projects/2'), other);
    assert.equal(await read('/'), summary);

    await post('/projects/1/archive');
    const archived = await read('/projects/1');
    assert.equal((archived.match(/<select id="task-priority-\d+"[^>]* disabled/g) ?? []).length, 2);
    assert.equal((await post(priorityPath, { priority: 'Low' })).status, 403);
    assert.equal(await read('/projects/1'), archived);
    assert.equal(selectedPriority(await read('/projects/1?filter=completed'), 1), 'High');
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await read('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await read('/projects/1'), detail);
    assert.equal((await post(priorityPath, { priority: 'Normal' })).status, 303);
    await post('/projects/1/tasks/1');
    detail = await read('/projects/1');
    assert.equal(selectedPriority(detail, 1), 'Normal');
    assert.equal(selectedPriority(detail, 2), 'Low');
    assert.match(detail, /aria-label="Complete Renamed done" onchange/);
    assert.match(await read('/'), /data-testid="project-summary">0\/2 completed/);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await read('/projects/1'), detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('combined filters retain selections and re-evaluate edits across archive and restarts', async () => {
  const directory = await mkdtemp(join(process.cwd(), 'data-test-'));
  let server;
  try {
    const databasePath = join(directory, 'combined-filters.sqlite');
    server = await startServer(databasePath);
    const read = path => fetch(`${server.url}${path}`).then(response => response.text());
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const titles = html => [...html.matchAll(/<span>([^<]*)<\/span>/g)].map(match => match[1]);
    const assertSelections = (html, completion, priority) => {
      for (const [id, value] of [['task-filter', completion], ['priority-filter', priority]]) {
        const select = new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`).exec(html);
        assert.ok(select);
        assert.match(select[1], new RegExp(`value="${value}" selected>`));
        assert.doesNotMatch(select[0], / disabled/);
      }
    };
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Other' });
    const fixtures = [
      ['Low open', 'Low', false], ['High done', 'High', true],
      ['Normal open', 'Normal', false], ['Low done', 'Low', true],
      ['High open', 'High', false], ['Normal done', 'Normal', true],
    ];
    for (const [index, [title, priority, completed]] of fixtures.entries()) {
      await post('/projects/1/tasks', { title });
      await post(`/projects/1/tasks/${index + 1}/priority`, { priority });
      if (completed) await post(`/projects/1/tasks/${index + 1}`, { completed: '1' });
    }
    await post('/projects/2/tasks', { title: 'Other task' });
    const summary = await read('/');
    assert.match(summary, /data-testid="project-summary">3\/6 completed/);
    const original = await read('/projects/1');
    assertSelections(original, 'all', 'All');
    const filterForm = /<form class="task-filter"[^>]*>([\s\S]*?)<\/form>/.exec(original)[1];
    assert.match(filterForm, /id="task-filter"[^>]*onchange="this.form.requestSubmit\(\)"/);
    assert.match(filterForm, /<label for="priority-filter">Priority filter<\/label>/);
    const prioritySelect = /<select id="priority-filter"[^>]*>([\s\S]*?)<\/select>/.exec(filterForm)[1];
    assert.deepEqual([...prioritySelect.matchAll(/>([^<]+)<\/option>/g)].map(match => match[1]),
      ['All', 'Low', 'Normal', 'High']);
    for (const completion of ['all', 'open', 'completed']) {
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        const html = await read(`/projects/1?filter=${completion}&priorityFilter=${priority}`);
        assertSelections(html, completion, priority);
        assert.deepEqual(titles(html), fixtures.filter(([, value, completed]) =>
          (priority === 'All' || priority === value) &&
          (completion === 'all' || completed === (completion === 'completed'))).map(([title]) => title));
      }
    }
    assert.equal(await read('/'), summary);
    assert.equal(await read('/projects/1'), original);
    assertSelections(await read('/projects/1?filter=invalid&priorityFilter=%22High'), 'all', 'All');

    const fields = { filter: 'open', priorityFilter: 'High' };
    const path = '/projects/1?filter=open&priorityFilter=High';
    const filtered = await read(path);
    // Every mutation form submits both filters; both selectors share a GET form.
    for (const match of filtered.matchAll(/<form[^>]*method="post"[^>]*>([\s\S]*?)<\/form>/g)) {
      assert.match(match[1], /name="filter" value="open"/);
      assert.match(match[1], /name="priorityFilter" value="High"/);
    }
    const rename = await post('/projects/1/tasks/5/rename', { ...fields, title: '  Renamed high  ' });
    assert.equal(rename.headers.get('location'), path);
    assert.deepEqual(titles(await read(path)), ['Renamed high']);
    assertSelections(await read(path), 'open', 'High');
    assert.equal(await read('/'), summary);
    const invalid = await post('/projects/1/tasks/5/rename', { ...fields, title: ' ' });
    assert.equal(invalid.status, 400);
    const invalidHtml = await invalid.text();
    assertSelections(invalidHtml, 'open', 'High');
    assert.match(invalidHtml, /role="alert">Task title is required/);
    assert.deepEqual(titles(invalidHtml), ['Renamed high']);
    const completed = await post('/projects/1/tasks/5', { ...fields, completed: '1' });
    assert.equal(completed.headers.get('location'), path);
    assert.deepEqual(titles(await read(path)), []);
    assertSelections(await read(path), 'open', 'High');
    const donePath = '/projects/1?filter=completed&priorityFilter=High';
    assert.deepEqual(titles(await read(donePath)), ['High done', 'Renamed high']);
    const priority = await post('/projects/1/tasks/2/priority', {
      filter: 'completed', priorityFilter: 'High', priority: 'Low',
    });
    assert.equal(priority.headers.get('location'), donePath);
    assert.deepEqual(titles(await read(donePath)), ['Renamed high']);
    assertSelections(await read(donePath), 'completed', 'High');
    assert.match(await read('/'), /data-testid="project-summary">4\/6 completed/);
    const saved = await read('/projects/1');
    assert.deepEqual(titles(await read('/projects/2')), ['Other task']);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await read('/projects/1'), saved);
    assert.deepEqual(titles(await read(donePath)), ['Renamed high']);

    await post('/projects/1/archive');
    const archived = await read(donePath);
    assertSelections(archived, 'completed', 'High');
    assert.deepEqual(titles(archived), ['Renamed high']);
    assert.match(archived, /type="checkbox"[^>]* disabled/);
    assert.match(archived, /id="new-task-title-5"[^>]* disabled/);
    assert.match(archived, /id="task-priority-5"[^>]* disabled/);
    assert.match(archived, /disabled>Rename task/);
    assert.deepEqual(titles(await read('/projects/1?filter=completed&priorityFilter=Low')), ['High done', 'Low done']);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await read(donePath), archived);
    await post('/projects/1/restore');
    assert.equal(await read('/projects/1'), saved);
    assertSelections(await read('/projects/1'), 'all', 'All');
    assert.deepEqual(titles(await read(donePath)), ['Renamed high']);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
