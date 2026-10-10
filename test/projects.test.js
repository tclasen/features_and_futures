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
    assert.doesNotMatch(detail, /Archived project/);
    assert.match(detail, /aria-label="Complete Existing task" checked onchange/);
    assert.match(detail, /id="destination-project-73"[^>]* disabled/);
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

test('project defaults affect only future tasks and persist independently through rename and archive', async () => {
  const directory = await mkdtemp(join(process.cwd(), 'data-test-'));
  let server;
  try {
    const databasePath = join(directory, 'defaults.sqlite');
    server = await startServer(databasePath);
    const read = path => fetch(`${server.url}${path}`).then(response => response.text());
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const options = (html, id) => {
      const select = new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`).exec(html);
      assert.ok(select);
      return [...select[1].matchAll(/<option value="([^"]+)"( selected)?>([^<]+)<\/option>/g)]
        .map(match => ({ value: match[1], selected: Boolean(match[2]), label: match[3] }));
    };
    const selected = (html, id) => options(html, id).find(option => option.selected)?.value;
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Existing' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await read('/projects/1');
    assert.match(original, /<label for="default-task-priority">Default task priority<\/label>/);
    assert.deepEqual(options(original, 'default-task-priority'), [
      { value: 'Low', selected: false, label: 'Low' },
      { value: 'Normal', selected: true, label: 'Normal' },
      { value: 'High', selected: false, label: 'High' },
    ]);
    const fields = { filter: 'completed', priorityFilter: 'Normal' };
    const path = '/projects/1?filter=completed&priorityFilter=Normal';
    const rows = html => html.slice(html.indexOf('<ul class="project-list"'));
    const beforeRows = rows(await read(path));
    const summary = await read('/');
    for (const priority of ['', 'Urgent', 'high', ' High ']) {
      assert.equal((await post('/projects/1/default-priority', { priority })).status, 400);
      assert.equal(await read('/projects/1'), original);
    }
    assert.equal((await post('/projects/1/default-priority')).status, 400);
    for (const id of ['99999', '9007199254740992']) {
      assert.equal((await post(`/projects/${id}/default-priority`, { priority: 'High' })).status, 404);
    }
    const changed = await post('/projects/1/default-priority', { ...fields, priority: 'High' });
    assert.equal(changed.status, 303);
    assert.equal(changed.headers.get('location'), path);
    const filtered = await read(path);
    assert.equal(selected(filtered, 'default-task-priority'), 'High');
    assert.equal(selected(filtered, 'task-filter'), 'completed');
    assert.equal(selected(filtered, 'priority-filter'), 'Normal');
    assert.equal(rows(filtered), beforeRows);
    assert.equal(await read('/'), summary);
    assert.equal(selected(await read('/projects/2'), 'default-task-priority'), 'Normal');
    await post('/projects/1/tasks', { title: '  Inherited high  ' });
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Inherited low' });
    await post('/projects/2/tasks', { title: 'Other normal' });
    await post('/projects/2/default-priority', { priority: 'High' });
    await post('/projects/1/tasks/2/rename', { title: 'Renamed high' });
    await post('/projects/1/rename', { name: 'Renamed project' });
    const saved = await read('/projects/1');
    assert.equal(selected(saved, 'default-task-priority'), 'Low');
    assert.equal(selected(saved, 'task-priority-1'), 'Normal');
    assert.equal(selected(saved, 'task-priority-2'), 'High');
    assert.equal(selected(saved, 'task-priority-3'), 'Low');
    assert.match(saved, /aria-label="Complete Existing" checked/);
    assert.ok(saved.indexOf('<span>Existing') < saved.indexOf('<span>Renamed high'));
    assert.ok(saved.indexOf('<span>Renamed high') < saved.indexOf('<span>Inherited low'));
    const other = await read('/projects/2');
    assert.equal(selected(other, 'default-task-priority'), 'High');
    assert.equal(selected(other, 'task-priority-4'), 'Normal');
    assert.match(await read('/'), /data-testid="project-summary">1\/3 completed/);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await read('/projects/1'), saved);
    assert.equal(await read('/projects/2'), other);
    await post('/projects/1/tasks', { title: 'Low after restart' });
    assert.equal(selected(await read('/projects/1'), 'task-priority-5'), 'Low');
    await post('/projects/1/archive');
    const archived = await read('/projects/1');
    assert.match(archived, /id="default-task-priority"[^>]* disabled/);
    assert.equal(selected(archived, 'default-task-priority'), 'Low');
    assert.equal((await post('/projects/1/default-priority', { ...fields, priority: 'High' })).status, 403);
    assert.equal(await read('/projects/1'), archived);
    assert.equal(selected(await read(path), 'task-filter'), 'completed');
    assert.equal(selected(await read(path), 'priority-filter'), 'Normal');
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await read('/projects/1'), archived);
    await post('/projects/1/restore');
    const restored = await read('/projects/1');
    assert.match(restored, /id="default-task-priority" name="priority" onchange/);
    assert.equal(selected(restored, 'default-task-priority'), 'Low');
    await post('/projects/1/default-priority', { priority: 'Normal' });
    await post('/projects/1/tasks', { title: 'Normal after restoration' });
    assert.equal(selected(await read('/projects/1'), 'task-priority-6'), 'Normal');
    assert.equal(selected(await read('/projects/1'), 'task-priority-5'), 'Low');
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(selected(await read('/projects/1'), 'default-task-priority'), 'Normal');
    assert.equal(selected(await read('/projects/1'), 'task-priority-6'), 'Normal');
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('default priority migration preserves existing project and task priorities', async () => {
  const directory = await mkdtemp(join(process.cwd(), 'data-test-'));
  let server;
  try {
    const databasePath = join(directory, 'legacy-defaults.sqlite');
    const database = new DatabaseSync(databasePath);
    try {
      database.exec(`
        CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
          title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal'
        );
        INSERT INTO projects VALUES (42, 'Legacy', 1);
        INSERT INTO tasks VALUES (73, 42, 'Legacy high', 1, 'High');
      `);
    } finally {
      database.close();
    }
    server = await startServer(databasePath);
    const read = () => fetch(`${server.url}/projects/42`).then(response => response.text());
    const html = await read();
    const defaultSelect = /<select id="default-task-priority"[^>]*>[\s\S]*?<\/select>/.exec(html)[0];
    const taskSelect = /<select id="task-priority-73"[^>]*>[\s\S]*?<\/select>/.exec(html)[0];
    assert.match(defaultSelect, / disabled/);
    assert.match(defaultSelect, /value="Normal" selected/);
    assert.match(taskSelect, / disabled/);
    assert.match(taskSelect, /value="High" selected/);
    assert.match(html, /aria-label="Complete Legacy high" checked disabled/);
    assert.match(html, /id="task-due-date-73" name="dueDate" type="text" value="" disabled/);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await read(), html);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('due dates validate calendar boundaries and preserve task data, filters, and archive state', async () => {
  const directory = await mkdtemp(join(process.cwd(), 'data-test-'));
  let server;
  try {
    const databasePath = join(directory, 'due-dates.sqlite');
    server = await startServer(databasePath);
    const read = path => fetch(`${server.url}${path}`).then(response => response.text());
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const dateInput = (html, id) => new RegExp(`<input id="task-due-date-${id}"[^>]*>`).exec(html)?.[0];
    const savedDate = (html, id) => /value="([^"]*)"/.exec(dateInput(html, id))?.[1];
    const fields = { filter: 'completed', priorityFilter: 'High' };
    const path = '/projects/1?filter=completed&priorityFilter=High';
    const endpoint = '/projects/1/tasks/1/due-date';
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Other' });
    await post('/projects/1/tasks', { title: 'First task' });
    await post('/projects/1/tasks', { title: 'Second task' });
    await post('/projects/2/tasks', { title: 'Other task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    const summary = await read('/');
    const other = await read('/projects/2');
    const original = await read(path);
    assert.equal(savedDate(original, 1), '');
    assert.match(original, /<label for="task-due-date-1">Task due date<\/label>/);
    assert.match(original, /type="text" value=""/);
    assert.match(original, />Save due date<\/button>/);
    for (const dueDate of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '2400-02-29', '1900-02-28', '2026-04-30']) {
      const response = await post(endpoint, { ...fields, dueDate: ` \t${dueDate}\n ` });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), path);
      const html = await read(path);
      assert.equal(savedDate(html, 1), dueDate);
      assert.equal(html.replace(`value="${dueDate}"`, 'value=""'), original);
      assert.equal(savedDate(await read('/projects/1'), 2), '');
      assert.equal(await read('/projects/2'), other);
      assert.equal(await read('/'), summary);
    }
    const beforeInvalid = await read('/projects/1');
    for (const dueDate of [
      '0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2023-02-29',
      '2026-04-31', '2026-02-30', '2026-00-01', '2026-13-01', '2026-01-00',
      '2026-01-32', '2026-1-01', '26-01-01', '2026-01-1', '2026/01/01',
      '2026-01-01T00:00:00Z', '<script>alert(1)</script>', 'tomorrow',
    ]) {
      const response = await post(endpoint, { ...fields, dueDate });
      assert.equal(response.status, 400, dueDate);
      const html = await response.text();
      assert.match(html, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      assert.match(html, /value="completed" selected/);
      assert.match(html, /value="High" selected/);
      assert.equal(savedDate(html, 1), '2026-04-30');
      assert.equal(await read('/projects/1'), beforeInvalid);
    }
    for (const endpoint of ['/projects/2/tasks/1/due-date', '/projects/1/tasks/3/due-date',
      '/projects/999/tasks/1/due-date', '/projects/1/tasks/999/due-date',
      '/projects/9007199254740992/tasks/1/due-date', '/projects/1/tasks/9007199254740992/due-date']) {
      assert.equal((await post(endpoint, { dueDate: '2024-02-29' })).status, 404);
    }
    await post('/projects/1/tasks/2/due-date', { dueDate: '2025-12-31' });
    await post('/projects/1/tasks/1/rename', { ...fields, title: 'Renamed' });
    let saved = await read('/projects/1');
    assert.equal(savedDate(saved, 1), '2026-04-30');
    assert.equal(savedDate(saved, 2), '2025-12-31');
    assert.match(saved, /aria-label="Complete Renamed" checked/);
    assert.ok(saved.indexOf('<span>Renamed') < saved.indexOf('<span>Second task'));
    assert.equal(await read('/'), summary);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await read('/projects/1'), saved);
    await post('/projects/1/archive');
    const archived = await read('/projects/1');
    for (const id of [1, 2]) assert.match(dateInput(archived, id), / disabled/);
    assert.equal((archived.match(/disabled>Save due date/g) ?? []).length, 2);
    assert.equal((await post(endpoint, { dueDate: '' })).status, 403);
    assert.equal(await read('/projects/1'), archived);
    assert.equal(savedDate(await read(path), 1), '2026-04-30');
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await read('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await read('/projects/1'), saved);
    for (const dueDate of ['', ' \t\n ']) {
      await post(endpoint, { ...fields, dueDate: '2024-02-29' });
      const cleared = await post(endpoint, { ...fields, dueDate });
      assert.equal(cleared.headers.get('location'), path);
      assert.equal(savedDate(await read(path), 1), '');
      assert.equal(savedDate(await read('/projects/1'), 2), '2025-12-31');
      assert.equal(await read('/'), summary);
    }
    saved = await read('/projects/1');
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await read('/projects/1'), saved);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('due ranges intersect filters, preserve applied membership on errors, and survive edits', async () => {
  const directory = await mkdtemp(join(process.cwd(), 'data-test-'));
  let server;
  try {
    const databasePath = join(directory, 'due-ranges.sqlite');
    server = await startServer(databasePath);
    const read = path => fetch(`${server.url}${path}`).then(response => response.text());
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const titles = html => [...html.matchAll(/<span>([^<]+)<\/span>/g)].map(match => match[1]);
    const pathFor = fields => '/projects/1?' + new URLSearchParams(fields);
    const apply = (fields, from, through) => fetch(`${server.url}${pathFor({
      ...fields, applyDueRange: '1', rangeFrom: from, rangeThrough: through,
    })}`, { redirect: 'manual' });
    const fixtures = [
      ['Undated', 'Normal', false, ''],
      ['Before', 'Low', false, '2024-02-28'],
      ['Start', 'High', false, '2024-02-29'],
      ['End', 'High', true, '2024-03-01'],
      ['After', 'Normal', true, '2024-03-02'],
      ['Ancient', 'Low', false, '0001-01-01'],
      ['Future', 'High', true, '9999-12-31'],
    ];
    await post('/projects', { name: 'Dates' });
    await post('/projects', { name: 'Other' });
    for (const [index, [title, priority, completed, dueDate]] of fixtures.entries()) {
      await post('/projects/1/tasks', { title });
      await post(`/projects/1/tasks/${index + 1}/priority`, { priority });
      if (completed) await post(`/projects/1/tasks/${index + 1}`, { completed: '1' });
      if (dueDate) await post(`/projects/1/tasks/${index + 1}/due-date`, { dueDate });
    }
    await post('/projects/2/tasks', { title: 'Other' });
    const summary = await read('/');
    const original = await read('/projects/1');
    assert.match(original, /<label for="due-from">Due from<\/label>/);
    assert.match(original, /<label for="due-through">Due through<\/label>/);
    assert.match(original, /id="due-from"[^>]*type="text" value=""/);
    assert.match(original, /id="due-through"[^>]*type="text" value=""/);
    assert.match(original, />Apply due range<\/button>/);
    for (const [from, through] of [
      ['', ''], ['2024-02-29', ''], ['', '2024-03-01'],
      ['2024-02-29', '2024-03-01'], ['2024-02-29', '2024-02-29'],
      ['0001-01-01', '9999-12-31'],
    ]) {
      for (const completion of ['all', 'open', 'completed']) {
        for (const priority of ['All', 'Low', 'Normal', 'High']) {
          const fields = { filter: completion, priorityFilter: priority };
          const response = await apply(fields, ` ${from} `, ` ${through} `);
          assert.equal(response.status, 303);
          const html = await read(response.headers.get('location'));
          assert.deepEqual(titles(html), fixtures.filter(([, value, completed, date]) =>
            (completion === 'all' || completed === (completion === 'completed')) &&
            (priority === 'All' || priority === value) &&
            ((!from && !through) || (date && (!from || date >= from) && (!through || date <= through)))
          ).map(([title]) => title));
          assert.match(html, new RegExp(`id="due-from"[^>]*value="${from}"`));
          assert.match(html, new RegExp(`id="due-through"[^>]*value="${through}"`));
          assert.match(html, new RegExp(`value="${completion}" selected`));
          assert.match(html, new RegExp(`value="${priority}" selected`));
        }
      }
    }
    assert.equal(await read('/'), summary);
    assert.equal(await read('/projects/1'), original);
    const fields = { filter: 'open', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-03-01' };
    const path = pathFor(fields);
    const filtered = await read(path);
    assert.deepEqual(titles(filtered), ['Start']);
    // Every edit and filter submission carries the applied range, independently of draft inputs.
    for (const match of filtered.matchAll(/<form[^>]*action="\/projects\/1[^"]*"[^>]*>([\s\S]*?)<\/form>/g)) {
      assert.match(match[1], /name="dueFrom" value="2024-02-29"/);
      assert.match(match[1], /name="dueThrough" value="2024-03-01"/);
    }
    for (const [from, through, message] of [
      ['2023-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['', '1900-02-29', 'Due range must use valid YYYY-MM-DD dates'],
      ['0000-01-01', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['', '10000-01-01', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-2-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-04-31', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['<script>', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-03-02', '2024-03-01', 'Due from must not be after Due through'],
    ]) {
      const response = await apply(fields, from, through);
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, new RegExp(`role="alert">${message}`));
      assert.equal(html.replace(/    <p role="alert">[^<]*<\/p>/, '    '), filtered);
      assert.deepEqual(titles(html), ['Start']);
    }
    const edit = async (endpoint, changes) => {
      const response = await post(endpoint, { ...fields, ...changes });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), path);
      return read(path);
    };
    assert.deepEqual(titles(await edit('/projects/1/tasks/3/rename', { title: 'Renamed' })), ['Renamed']);
    assert.deepEqual(titles(await edit('/projects/1/rename', { name: 'Renamed project' })), ['Renamed']);
    assert.deepEqual(titles(await edit('/projects/1/default-priority', { priority: 'High' })), ['Renamed']);
    assert.deepEqual(titles(await edit('/projects/1/tasks', { title: 'New undated' })), ['Renamed']);
    assert.deepEqual(titles(await edit('/projects/1/tasks/3/due-date', { dueDate: '2024-03-02' })), []);
    assert.deepEqual(titles(await edit('/projects/1/tasks/3/due-date', { dueDate: '2024-03-01' })), ['Renamed']);
    assert.deepEqual(titles(await edit('/projects/1/tasks/3/priority', { priority: 'Low' })), []);
    assert.deepEqual(titles(await edit('/projects/1/tasks/3/priority', { priority: 'High' })), ['Renamed']);
    assert.deepEqual(titles(await edit('/projects/1/tasks/3', { completed: '1' })), []);
    assert.deepEqual(titles(await edit('/projects/1/tasks/3', {})), ['Renamed']);
    assert.deepEqual(titles(await edit('/projects/1/tasks/3/due-date', { dueDate: '  ' })), []);
    await edit('/projects/1/tasks/3/due-date', { dueDate: '2024-02-29' });
    assert.match(await read('/'), /data-testid="project-summary">3\/8 completed/);
    assert.deepEqual(titles(await read('/projects/2')), ['Other']);
    const saved = await read('/projects/1');
    const savedFiltered = await read(path);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await read('/projects/1'), saved);
    assert.equal(await read(path), savedFiltered);
    await post('/projects/1/archive');
    const archived = await read(path);
    assert.deepEqual(titles(archived), ['Renamed']);
    for (const id of ['due-from', 'due-through', 'task-filter', 'priority-filter']) {
      assert.doesNotMatch(new RegExp(`<(?:input|select) id="${id}"[^>]*>`).exec(archived)[0], / disabled/);
    }
    assert.match(archived, /id="task-due-date-3"[^>]* disabled/);
    assert.match(archived, /disabled>Save due date/);
    const appliedArchived = await apply(fields, '2024-03-01', '2024-03-02');
    assert.equal(appliedArchived.status, 303);
    assert.deepEqual(titles(await read(appliedArchived.headers.get('location'))), []);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await read(path), archived);
    await post('/projects/1/restore');
    assert.equal(await read('/projects/1'), saved);
    assert.equal(await read(path), savedFiltered);
    assert.match(await read('/'), /action="\/projects\/1"><button type="submit">Open project/);
    const clear = await apply(fields, ' ', '\t');
    assert.equal(clear.headers.get('location'), '/projects/1?filter=open&priorityFilter=High');
    assert.deepEqual(titles(await read(clear.headers.get('location'))), ['Renamed', 'New undated']);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('moves preserve data and filters and enforce active ownership across restarts', async () => {
  const directory = await mkdtemp(join(process.cwd(), 'data-test-'));
  let server;
  try {
    const databasePath = join(directory, 'moves.sqlite');
    server = await startServer(databasePath);
    const read = path => fetch(`${server.url}${path}`).then(response => response.text());
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const titles = html => [...html.matchAll(/<span>([^<]+)<\/span>/g)].map(match => match[1]);
    const destinations = (html, id) => new RegExp(`<select id="destination-project-${id}"[^>]*>([\\s\\S]*?)<\\/select>`).exec(html);
    await post('/projects', { name: 'Source' });
    await post('/projects/1/tasks', { title: 'Moving' });
    let html = await read('/projects/1');
    assert.match(destinations(html, 1)[0], / disabled/);
    assert.doesNotMatch(destinations(html, 1)[1], /<option/);
    assert.match(html, /disabled>Move task/);
    for (const name of ['Destination', 'Third', 'Archived']) await post('/projects', { name });
    await post('/projects/4/archive');
    await post('/projects/2/rename', { name: 'Renamed & destination' });
    await post('/projects/2/default-priority', { priority: 'Low' });
    await post('/projects/2/tasks', { title: 'Destination first' });
    await post('/projects/1/tasks', { title: 'Source remaining' });
    await post('/projects/2/tasks', { title: 'Destination second' });
    await post('/projects/1/tasks/1', { completed: '1' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
    html = await read('/projects/1');
    assert.deepEqual([...destinations(html, 1)[1].matchAll(/<option value="(\d+)">([^<]+)<\/option>/g)]
      .map(match => match.slice(1)), [['2', 'Renamed &amp; destination'], ['3', 'Third']]);
    const beforeInvalid = html;
    for (const destinationProject of ['', '1', '4', '999', '2.0', '9007199254740992']) {
      assert.equal((await post('/projects/1/tasks/1/move', { destinationProject })).status, 400);
      assert.equal(await read('/projects/1'), beforeInvalid);
    }
    for (const endpoint of ['/projects/2/tasks/1/move', '/projects/1/tasks/999/move',
      '/projects/999/tasks/1/move', '/projects/1/tasks/9007199254740992/move']) {
      assert.equal((await post(endpoint, { destinationProject: '3' })).status, 404);
    }
    const fields = { filter: 'completed', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-02-29' };
    const filteredPath = '/projects/1?' + new URLSearchParams(fields);
    const response = await post('/projects/1/tasks/1/move', { ...fields, destinationProject: '2' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), filteredPath);
    const filtered = await read(filteredPath);
    assert.deepEqual(titles(filtered), []);
    assert.match(filtered, /value="completed" selected/);
    assert.match(filtered, /value="High" selected/);
    assert.match(filtered, /id="due-from"[^>]*value="2024-02-29"/);
    assert.match(filtered, /id="due-through"[^>]*value="2024-02-29"/);
    assert.deepEqual(titles(await read('/projects/1')), ['Source remaining']);
    html = await read('/projects/2');
    assert.deepEqual(titles(html), ['Destination first', 'Destination second', 'Moving']);
    assert.match(html, /aria-label="Complete Moving" checked/);
    assert.match(html, /id="task-priority-1"[\s\S]*?value="High" selected/);
    assert.match(html, /id="task-due-date-1"[^>]*value="2024-02-29"/);
    let summaries = [...(await read('/')).matchAll(/data-testid="project-summary">([^<]+)/g)].map(match => match[1]);
    assert.deepEqual(summaries, ['0/1 completed', '1/3 completed', '0/0 completed']);
    await post('/projects/2/tasks', { title: 'Created after move' });
    assert.deepEqual(titles(await read('/projects/2')), ['Destination first', 'Destination second', 'Moving', 'Created after move']);
    await post('/projects/2/tasks/1/rename', { title: 'Renamed moving' });
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(titles(await read('/projects/2')), ['Destination first', 'Destination second', 'Renamed moving', 'Created after move']);
    assert.equal(await read(filteredPath), filtered);
    await post('/projects/2/archive');
    const archived = await read('/projects/2');
    for (const id of [2, 4, 1, 5]) assert.match(destinations(archived, id)[0], / disabled/);
    assert.equal((archived.match(/disabled>Move task/g) ?? []).length, 4);
    assert.equal((await post('/projects/2/tasks/1/move', { destinationProject: '1' })).status, 403);
    assert.equal((await post('/projects/1/tasks/3/move', { destinationProject: '2' })).status, 400);
    assert.equal(await read('/projects/2'), archived);
    await post('/projects/2/restore');
    assert.doesNotMatch(destinations(await read('/projects/2'), 1)[0], / disabled/);
    await post('/projects/2/tasks/2/move', { destinationProject: '1' });
    await post('/projects/2/tasks/1/move', { destinationProject: '1' });
    assert.deepEqual(titles(await read('/projects/1')), ['Renamed moving', 'Source remaining', 'Destination first']);
    // Moving an undated task retains its blank date and original priority.
    await post('/projects/1/tasks/3/move', { destinationProject: '2' });
    html = await read('/projects/2');
    assert.deepEqual(titles(html), ['Destination second', 'Created after move', 'Source remaining']);
    assert.match(html, /id="task-due-date-3"[^>]*value=""/);
    assert.match(html, /id="task-priority-3"[\s\S]*?value="Normal" selected/);
    summaries = [...(await read('/')).matchAll(/data-testid="project-summary">([^<]+)/g)].map(match => match[1]);
    assert.deepEqual(summaries, ['1/2 completed', '0/3 completed', '0/0 completed']);
    const savedSource = await read('/projects/1');
    const savedDestination = html;
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await read('/projects/1'), savedSource);
    assert.equal(await read('/projects/2'), savedDestination);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task position migration preserves legacy ID order and appends older moved tasks', async () => {
  const directory = await mkdtemp(join(process.cwd(), 'data-test-'));
  let server;
  try {
    const databasePath = join(directory, 'legacy-moves.sqlite');
    const database = new DatabaseSync(databasePath);
    try {
      database.exec(`
        CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
        CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
          title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
        INSERT INTO projects VALUES (1, 'Source'), (2, 'Destination');
        INSERT INTO tasks VALUES (30, 2, 'Later', 0), (20, 2, 'Earlier', 1), (10, 1, 'Oldest', 1);
      `);
    } finally {
      database.close();
    }
    server = await startServer(databasePath);
    const read = () => fetch(`${server.url}/projects/2`).then(response => response.text());
    const titles = html => [...html.matchAll(/<span>([^<]+)<\/span>/g)].map(match => match[1]);
    assert.deepEqual(titles(await read()), ['Earlier', 'Later']);
    await fetch(`${server.url}/projects/1/tasks/10/move`, {
      method: 'POST', body: new URLSearchParams({ destinationProject: '2' }), redirect: 'manual',
    });
    const saved = await read();
    assert.deepEqual(titles(saved), ['Earlier', 'Later', 'Oldest']);
    assert.match(saved, /aria-label="Complete Oldest" checked/);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await read(), saved);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('returning tasks restore independent project positions including absent slots across restarts', async () => {
  const directory = await mkdtemp(join(process.cwd(), 'data-test-'));
  let server;
  try {
    const databasePath = join(directory, 'return-order.sqlite');
    server = await startServer(databasePath);
    const read = id => fetch(`${server.url}/projects/${id}`).then(response => response.text());
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const titles = html => [...html.matchAll(/<span>([^<]+)<\/span>/g)].map(match => match[1]);
    const expectOrder = async (id, expected) => assert.deepEqual(titles(await read(id)), expected);
    const move = async (source, task, destination, fields = {}) => {
      const response = await post(`/projects/${source}/tasks/${task}/move`, {
        ...fields, destinationProject: String(destination),
      });
      assert.equal(response.status, 303);
      return response;
    };
    for (const name of ['First', 'Second', 'Third']) await post('/projects', { name });
    for (const title of ['A', 'B', 'C']) await post('/projects/1/tasks', { title });
    await post('/projects/2/tasks', { title: 'D' });
    await move(1, 1, 2);
    await move(1, 2, 2);
    await expectOrder(2, ['D', 'A', 'B']);
    // Even an empty project retains its established positions for new arrivals.
    await move(1, 3, 3);
    await post('/projects/1/tasks', { title: 'E' });
    await move(2, 4, 1);
    await expectOrder(1, ['E', 'D']);
    await post('/projects/1/rename', { name: 'Renamed first' });
    await post('/projects/2/tasks/1/rename', { title: 'Changed A' });
    await post('/projects/2/tasks/1', { completed: '1' });
    await post('/projects/2/tasks/1/priority', { priority: 'High' });
    await post('/projects/2/tasks/1/due-date', { dueDate: '0001-01-01' });
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/archive');
    assert.equal((await post('/projects/2/tasks/1/move', { destinationProject: '1' })).status, 400);
    await server.stop();
    server = await startServer(databasePath);
    await post('/projects/1/restore');
    // Returning in reverse order restores the original relative order.
    await move(2, 2, 1);
    await move(3, 3, 1);
    const filters = { filter: 'completed', priorityFilter: 'High', dueFrom: '0001-01-01', dueThrough: '0001-01-01' };
    const response = await move(2, 1, 1, filters);
    assert.equal(response.headers.get('location'), '/projects/2?' + new URLSearchParams(filters));
    await expectOrder(1, ['Changed A', 'B', 'C', 'E', 'D']);
    let html = await read(1);
    assert.match(html, /aria-label="Complete Changed A" checked/);
    assert.match(html, /id="task-priority-1"[\s\S]*?value="High" selected/);
    assert.match(html, /id="task-due-date-1"[^>]*value="0001-01-01"/);
    const summaries = [...(await fetch(server.url).then(response => response.text()))
      .matchAll(/data-testid="project-summary">([^<]+)/g)].map(match => match[1]);
    assert.deepEqual(summaries, ['1/5 completed', '0/0 completed', '0/0 completed']);
    // Positions are remembered independently at the second and third projects.
    await post('/projects/2/tasks', { title: 'F' });
    await move(1, 2, 2);
    await move(1, 1, 2);
    await move(1, 4, 2);
    await expectOrder(2, ['D', 'Changed A', 'B', 'F']);
    await move(1, 3, 3);
    await post('/projects/3/tasks', { title: 'G' });
    await move(2, 1, 3);
    await expectOrder(3, ['C', 'G', 'Changed A']);
    await move(3, 1, 1);
    await expectOrder(1, ['Changed A', 'E']);
    const saved = await Promise.all([1, 2, 3].map(read));
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await Promise.all([1, 2, 3].map(read)), saved);
    await move(2, 2, 1);
    await move(3, 3, 1);
    await move(2, 4, 1);
    await expectOrder(1, ['Changed A', 'B', 'C', 'E', 'D']);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('remembered position migration preserves existing move order rather than ID order', async () => {
  const directory = await mkdtemp(join(process.cwd(), 'data-test-'));
  let server;
  try {
    const databasePath = join(directory, 'existing-order.sqlite');
    const database = new DatabaseSync(databasePath);
    try {
      database.exec(`
        CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
        CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
          title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL);
        INSERT INTO projects VALUES (1, 'First'), (2, 'Second');
        INSERT INTO tasks VALUES (10, 1, 'First position', 0, 1),
          (5, 1, 'Second position', 1, 2), (1, 1, 'Third position', 0, 3);
      `);
    } finally {
      database.close();
    }
    server = await startServer(databasePath);
    const read = () => fetch(`${server.url}/projects/1`).then(response => response.text());
    const titles = html => [...html.matchAll(/<span>([^<]+)<\/span>/g)].map(match => match[1]);
    const move = (source, task, destination) => fetch(`${server.url}/projects/${source}/tasks/${task}/move`, {
      method: 'POST', body: new URLSearchParams({ destinationProject: String(destination) }), redirect: 'manual',
    });
    const expected = ['First position', 'Second position', 'Third position'];
    assert.deepEqual(titles(await read()), expected);
    for (const id of [10, 5, 1]) assert.equal((await move(1, id, 2)).status, 303);
    await server.stop();
    server = await startServer(databasePath);
    for (const id of [1, 5, 10]) assert.equal((await move(2, id, 1)).status, 303);
    assert.deepEqual(titles(await read()), expected);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(titles(await read()), expected);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project search intersects archive filtering with ASCII-only matching and unchanged summaries', async () => {
  const directory = await mkdtemp(join(process.cwd(), 'data-test-'));
  let server;
  try {
    server = await startServer(join(directory, 'search.sqlite'));
    const read = path => fetch(`${server.url}${path}`).then(response => response.text());
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const names = html => [...html.matchAll(/<div><span>([^<]+)<\/span>/g)].map(match => match[1]);
    for (const name of ['Alpha  Board', 'ALPHA board', 'alpha archived', 'Ä board', 'ä board', '<Alpha & "board">']) {
      await post('/projects', { name });
    }
    await post('/projects/1/tasks', { title: 'Task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    await post('/projects/3/archive');
    const search = (query, filter = 'active') => read('/?' + new URLSearchParams({ search: query, filter }));
    let html = await search(' \tAlPhA\n ');
    assert.deepEqual(names(html), ['Alpha  Board', 'ALPHA board', '&lt;Alpha &amp; &quot;board&quot;&gt;']);
    assert.match(html, /data-testid="project-summary">1\/1 completed/);
    assert.match(html, /id="project-search"[^>]*value="AlPhA"/);
    assert.match(html, /<label for="project-search">Project search<\/label>/);
    assert.match(html, />Search projects<\/button>/);
    assert.match(html, /<form class="task-filter" method="get" action="\/">\s*<input type="hidden" name="search" value="AlPhA">/);
    assert.deepEqual(names(await search('alpha  b')), ['Alpha  Board']);
    assert.deepEqual(names(await search('alpha b')), ['ALPHA board']);
    assert.deepEqual(names(await search('Ä')), ['Ä board']);
    assert.deepEqual(names(await search('ä')), ['ä board']);
    assert.deepEqual(names(await search('alpha', 'archived')), ['alpha archived']);
    assert.equal(names(await search(' \t ')).length, 5);
    html = await search('<Alpha & "board">');
    assert.deepEqual(names(html), ['&lt;Alpha &amp; &quot;board&quot;&gt;']);
    assert.match(html, /id="project-search"[^>]*value="&lt;Alpha &amp; &quot;board&quot;&gt;"/);
    const archived = await post('/projects/1/archive', { search: ' alpha ' });
    assert.equal(archived.headers.get('location'), '/?search=alpha');
    assert.deepEqual(names(await search('alpha', 'archived')), ['Alpha  Board', 'alpha archived']);
    const restored = await post('/projects/1/restore', { search: 'alpha' });
    assert.equal(restored.headers.get('location'), '/?filter=archived&search=alpha');
    // The Projects navigation has no query; visiting the list starts with all active rows.
    assert.match(await read('/projects/1?search=task'), /action="\/".*>Projects<\/button>/);
    assert.equal(names(await read('/')).length, 5);
    assert.match(await read('/'), /id="project-search"[^>]*value=""/);
    const saved = await search('alpha');
    await server.stop();
    server = await startServer(join(directory, 'search.sqlite'));
    assert.equal(await search('alpha'), saved);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task search intersects all filters and survives edits, moves, archive and restarts', async () => {
  const directory = await mkdtemp(join(process.cwd(), 'data-test-'));
  let server;
  try {
    const databasePath = join(directory, 'task-search.sqlite');
    server = await startServer(databasePath);
    const read = path => fetch(`${server.url}${path}`).then(response => response.text());
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const titles = html => [...html.matchAll(/<span>([^<]+)<\/span>/g)].map(match => match[1]);
    const pathFor = fields => '/projects/1?' + new URLSearchParams(fields);
    for (const name of ['Source', 'Destination']) await post('/projects', { name });
    const tasks = [
      ['Alpha  One', 'High', false, '2024-02-29'],
      ['ALPHA Two', 'Low', true, '2024-03-01'],
      ['Other', 'Normal', false, ''],
      ['alpha Three', 'High', true, '2024-03-02'],
      ['Älpha', 'Normal', false, ''],
      ['älpha', 'Normal', false, ''],
    ];
    for (const [index, [title, priority, completed, dueDate]] of tasks.entries()) {
      await post('/projects/1/tasks', { title });
      await post(`/projects/1/tasks/${index + 1}/priority`, { priority });
      await post(`/projects/1/tasks/${index + 1}/due-date`, { dueDate });
      if (completed) await post(`/projects/1/tasks/${index + 1}`, { completed: '1' });
    }
    const original = await read('/projects/1');
    const summary = await read('/');
    for (const completion of ['all', 'open', 'completed']) {
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        for (const [dueFrom, dueThrough] of [['', ''], ['2024-02-29', '2024-03-01'], ['', '2024-03-01'], ['2024-03-01', '']]) {
          const fields = { filter: completion, priorityFilter: priority, dueFrom, dueThrough, search: ' AlPhA ' };
          const html = await read(pathFor(fields));
          assert.deepEqual(titles(html), tasks.filter(([title, taskPriority, completed, date]) =>
            title.replace(/[A-Z]/g, letter => letter.toLowerCase()).includes('alpha') &&
            (completion === 'all' || completed === (completion === 'completed')) &&
            (priority === 'All' || priority === taskPriority) &&
            ((!dueFrom && !dueThrough) || (date && (!dueFrom || date >= dueFrom) && (!dueThrough || date <= dueThrough)))
          ).map(([title]) => title));
        }
      }
    }
    assert.equal(await read('/'), summary);
    assert.equal(await read('/projects/1'), original);
    assert.deepEqual(titles(await read(pathFor({ search: 'alpha  o' }))), ['Alpha  One']);
    assert.deepEqual(titles(await read(pathFor({ search: 'alpha o' }))), []);
    assert.deepEqual(titles(await read(pathFor({ search: 'Ä' }))), ['Älpha']);
    assert.deepEqual(titles(await read(pathFor({ search: 'ä' }))), ['älpha']);
    assert.deepEqual(titles(await read(pathFor({ search: ' \t ' }))), tasks.map(([title]) => title));
    const fields = { filter: 'open', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-03-01', search: 'alpha' };
    const path = pathFor(fields);
    let html = await read(path);
    assert.deepEqual(titles(html), ['Alpha  One']);
    assert.match(html, /<label for="task-search">Task search<\/label>/);
    assert.match(html, />Search tasks<\/button>/);
    // Every form except Projects retains the applied query, including both other filter forms.
    for (const match of html.matchAll(/<form[^>]*action="\/projects\/1[^"]*"[^>]*>([\s\S]*?)<\/form>/g)) {
      assert.match(match[1], /name="search" value="alpha"/);
    }
    const searched = await fetch(`${server.url}${path}&applySearch=1&query=%20ONE%20`, { redirect: 'manual' });
    assert.equal(searched.status, 303);
    assert.equal(searched.headers.get('location'), pathFor({ ...fields, search: 'ONE' }));
    const range = await fetch(`${server.url}${path}&applyDueRange=1&rangeFrom=2024-02-29&rangeThrough=2024-02-29`, { redirect: 'manual' });
    assert.equal(range.headers.get('location'), pathFor({ ...fields, dueThrough: '2024-02-29' }));
    const invalidRange = await fetch(`${server.url}${path}&applyDueRange=1&rangeFrom=2024-02-30`);
    assert.equal(invalidRange.status, 400);
    assert.deepEqual(titles(await invalidRange.text()), ['Alpha  One']);
    const edit = async (endpoint, changes = {}) => {
      const response = await post(endpoint, { ...fields, ...changes });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), path);
      return read(path);
    };
    assert.deepEqual(titles(await edit('/projects/1/rename', { name: 'Renamed' })), ['Alpha  One']);
    assert.deepEqual(titles(await edit('/projects/1/default-priority', { priority: 'High' })), ['Alpha  One']);
    assert.deepEqual(titles(await edit('/projects/1/tasks', { title: 'Alpha undated' })), ['Alpha  One']);
    assert.deepEqual(titles(await edit('/projects/1/tasks/1/rename', { title: 'Renamed away' })), []);
    assert.deepEqual(titles(await edit('/projects/1/tasks/1/rename', { title: 'Alpha renamed' })), ['Alpha renamed']);
    assert.deepEqual(titles(await edit('/projects/1/tasks/1', { completed: '1' })), []);
    assert.deepEqual(titles(await edit('/projects/1/tasks/1')), ['Alpha renamed']);
    assert.deepEqual(titles(await edit('/projects/1/tasks/1/priority', { priority: 'Low' })), []);
    assert.deepEqual(titles(await edit('/projects/1/tasks/1/priority', { priority: 'High' })), ['Alpha renamed']);
    assert.deepEqual(titles(await edit('/projects/1/tasks/1/due-date', { dueDate: '' })), []);
    assert.deepEqual(titles(await edit('/projects/1/tasks/1/due-date', { dueDate: '2024-03-01' })), ['Alpha renamed']);
    assert.deepEqual(titles(await edit('/projects/1/tasks/1/move', { destinationProject: '2' })), []);
    assert.deepEqual(titles(await read('/projects/2?search=ALPHA')), ['Alpha renamed']);
    await post('/projects/2/tasks/1/move', { destinationProject: '1', search: 'ALPHA' });
    assert.deepEqual(titles(await read('/projects/1')), ['Alpha renamed', ...tasks.slice(1).map(([title]) => title), 'Alpha undated']);
    assert.deepEqual(titles(await read(path)), ['Alpha renamed']);
    assert.match(await read('/'), /data-testid="project-summary">2\/7 completed/);
    await post('/projects/1/archive');
    html = await read(path);
    assert.match(html, /id="task-search"[^>]*value="alpha"/);
    assert.doesNotMatch(/<input id="task-search"[^>]*>/.exec(html)[0], / disabled/);
    assert.match(html, /id="new-task-title-1"[^>]* disabled/);
    assert.match(html, /id="task-priority-1"[^>]* disabled/);
    assert.match(html, /id="task-due-date-1"[^>]* disabled/);
    assert.match(html, /id="destination-project-1"[^>]* disabled/);
    const clear = await fetch(`${server.url}${path}&applySearch=1&query=%20%20`, { redirect: 'manual' });
    assert.equal(clear.headers.get('location'), pathFor({ filter: 'open', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-03-01' }));
    const escaped = await read(pathFor({ search: '<"&' }));
    assert.match(escaped, /id="task-search"[^>]*value="&lt;&quot;&amp;"/);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await read(path), html);
    await post('/projects/1/restore');
    assert.deepEqual(titles(await read(path)), ['Alpha renamed']);
    assert.match(await read('/projects/1'), /id="task-search"[^>]*value=""/);
    assert.match(await read('/'), /action="\/projects\/1"><button type="submit">Open project/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
