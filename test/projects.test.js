import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const baseUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) {
        clearTimeout(timer);
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

async function createProject(baseUrl, name) {
  return fetch(`${baseUrl}/projects`, {
    method: 'POST',
    body: new URLSearchParams({ name }),
    redirect: 'manual',
  });
}

function rows(html) {
  return [...html.matchAll(/<li data-testid="project-row">(.*?)<\/li>/gs)].map((match) => match[1]);
}

function taskRows(html) {
  return [...html.matchAll(/<li data-testid="task-row">(.*?)<\/li>/gs)].map((match) => match[1]);
}

async function postForm(baseUrl, path, values) {
  return fetch(baseUrl + path, {
    method: 'POST',
    body: new URLSearchParams(values),
    redirect: 'manual',
  });
}

test('tasks validate, filter, remain project-owned, and persist completion across restarts', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  let server;
  try {
    const databasePath = join(directory, 'workboard.sqlite');
    server = await startServer(databasePath);
    await createProject(server.baseUrl, 'First');
    await createProject(server.baseUrl, 'Second');
    const readProject = async (path = '/projects/1') => (await fetch(server.baseUrl + path)).text();
    const initial = await readProject();
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, />Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const invalid = await postForm(server.baseUrl, '/projects/1/tasks', { title });
      assert.equal(invalid.status, 422);
      const html = await invalid.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(taskRows(html).length, 0);
    }
    for (const title of ['  First task  ', '<b>Second</b> & "task"']) {
      assert.equal((await postForm(server.baseUrl, '/projects/1/tasks', { title })).status, 303);
    }
    const originalRows = taskRows(await readProject());
    assert.equal(originalRows.length, 2);
    assert.match(originalRows[0], /<span class="name">First task<\/span>/);
    assert.match(originalRows[0], /type="checkbox".*aria-label="Complete First task"/);
    assert.match(originalRows[1], /aria-label="Complete &lt;b&gt;Second&lt;\/b&gt; &amp; &quot;task&quot;"/);
    assert.ok(originalRows.every((row) => !row.includes(' checked')));
    assert.deepEqual(taskRows(await readProject('/projects/1?filter=Open')), originalRows.map((row) => row.replace('value="All"', 'value="Open"')));
    assert.equal(taskRows(await readProject('/projects/1?filter=Completed')).length, 0);
    assert.equal(taskRows(await readProject('/projects/2')).length, 0);

    const completionPath = originalRows[0].match(/action="([^"]+\/completion)"/)[1];
    const checked = await postForm(server.baseUrl, completionPath, { completed: '1', filter: 'Open' });
    assert.equal(checked.status, 303);
    assert.equal(checked.headers.get('location'), '/projects/1?filter=Open');
    assert.equal(taskRows(await readProject('/projects/1?filter=Open')).length, 1);
    const completedRows = taskRows(await readProject('/projects/1?filter=Completed'));
    assert.equal(completedRows.length, 1);
    assert.match(completedRows[0], /aria-label="Complete First task" checked/);
    assert.equal((await postForm(server.baseUrl, completionPath.replace('/projects/1/', '/projects/2/'), { completed: '0' })).status, 404);
    assert.equal((await postForm(server.baseUrl, '/projects/999/tasks', { title: 'Missing' })).status, 404);
    assert.equal((await postForm(server.baseUrl, '/projects/1/tasks/999/completion', { completed: '1' })).status, 404);
    assert.deepEqual(taskRows(await readProject('/projects/1?filter=Completed')), completedRows);
    const invalid = await postForm(server.baseUrl, '/projects/1/tasks', { title: ' ' });
    assert.equal(taskRows(await invalid.text()).length, 2);

    const persistedRows = taskRows(await readProject());
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(taskRows(await readProject()), persistedRows);
    assert.equal(taskRows(await readProject('/projects/2')).length, 0);
    assert.equal((await postForm(server.baseUrl, completionPath, {})).status, 303);
    assert.deepEqual(taskRows(await readProject()), originalRows);
    await postForm(server.baseUrl, '/projects/2/tasks', { title: 'Other project task' });
    assert.equal(taskRows(await readProject('/projects/2')).length, 1);
    assert.deepEqual(taskRows(await readProject()), originalRows);
    assert.equal(taskRows(await readProject('/projects/1?filter=unknown')).length, 2);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(taskRows(await readProject()), originalRows);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('projects validate, navigate, and persist through a server process restart', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const health = await fetch(`${server.baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const initial = await (await fetch(server.baseUrl)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, /<input id="project-name" name="name" type="text"/);
    assert.match(initial, />Create project<\/button>/);
    assert.equal(rows(initial).length, 0);

    for (const name of ['', '  \t\n  ']) {
      const invalid = await createProject(server.baseUrl, name);
      assert.equal(invalid.status, 422);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.equal(rows(html).length, 0);
    }

    for (const name of ['  First project  ', '<script>alert("test")</script> & second']) {
      const created = await createProject(server.baseUrl, name);
      assert.equal(created.status, 303);
      assert.equal(created.headers.get('location'), '/');
    }
    const list = await (await fetch(server.baseUrl)).text();
    const projectRows = rows(list);
    assert.equal(projectRows.length, 2);
    assert.match(projectRows[0], /<span class="name">First project<\/span>/);
    assert.match(projectRows[1], /&lt;script&gt;alert\(&quot;test&quot;\)&lt;\/script&gt; &amp; second/);
    const projectPaths = projectRows.map((row) => {
      assert.match(row, />Open project<\/button>/);
      return row.match(/action="(\/projects\/\d+)"/)[1];
    });
    assert.notEqual(projectPaths[0], projectPaths[1]);
    const detail = await (await fetch(server.baseUrl + projectPaths[0])).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /<form action="\/" method="get"><button type="submit">Projects<\/button>/);
    assert.equal((await fetch(`${server.baseUrl}/projects/999999`)).status, 404);

    const invalidWithProjects = await createProject(server.baseUrl, ' ');
    assert.deepEqual(rows(await invalidWithProjects.text()), projectRows);
    assert.deepEqual(rows(await (await fetch(server.baseUrl)).text()), projectRows);

    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(rows(await (await fetch(server.baseUrl)).text()), projectRows);
    for (const path of projectPaths) {
      assert.equal((await fetch(server.baseUrl + path)).status, 200);
    }
    assert.equal((await createProject(server.baseUrl, 'Third project')).status, 303);
    const afterRestart = rows(await (await fetch(server.baseUrl)).text());
    assert.equal(afterRestart.length, 3);
    assert.deepEqual(afterRestart.slice(0, 2), projectRows);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive and restore preserve tasks, enforce read-only state, and summarize all tasks', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const read = async (path = '/') => (await fetch(server.baseUrl + path)).text();
    await createProject(server.baseUrl, 'First');
    await createProject(server.baseUrl, 'Second');
    const initial = await read();
    assert.match(initial, /<label for="project-filter">Project filter<\/label>/);
    assert.match(initial, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.ok(rows(initial).every((row) => row.includes('data-testid="project-summary">0/0 completed')));
    await postForm(server.baseUrl, '/projects/1/tasks', { title: 'Done' });
    await postForm(server.baseUrl, '/projects/1/tasks', { title: 'Pending' });
    await postForm(server.baseUrl, '/projects/1/tasks/1/completion', { completed: '1' });
    assert.match(rows(await read())[0], /data-testid="project-summary">1\/2 completed/);
    await read('/projects/1?filter=Open');
    assert.match(rows(await read())[0], /1\/2 completed/);
    assert.equal((await postForm(server.baseUrl, '/projects/999/archive', {})).status, 404);
    assert.equal((await postForm(server.baseUrl, '/projects/1/archive', {})).status, 303);
    assert.equal(rows(await read()).length, 1);
    assert.match(rows(await read())[0], /Second/);
    const archivedRows = rows(await read('/?filter=Archived'));
    assert.equal(archivedRows.length, 1);
    assert.match(archivedRows[0], /First/);
    assert.match(archivedRows[0], /1\/2 completed/);
    assert.match(archivedRows[0], />Open project<\/button>/);
    assert.match(archivedRows[0], />Restore project<\/button>/);
    assert.doesNotMatch(archivedRows[0], />Archive project<\/button>/);
    const archivedPage = await read('/projects/1');
    assert.match(archivedPage, /<p>Archived project<\/p>/);
    assert.match(archivedPage, /<button type="submit" disabled>Create task<\/button>/);
    const archivedTasks = taskRows(archivedPage);
    assert.equal(archivedTasks.length, 2);
    assert.ok(archivedTasks.every((row) => /type="checkbox"[^>]* disabled/.test(row)));
    assert.equal(taskRows(await read('/projects/1?filter=Open')).length, 1);
    assert.equal(taskRows(await read('/projects/1?filter=Completed')).length, 1);
    assert.equal((await postForm(server.baseUrl, '/projects/1/tasks', { title: 'Blocked' })).status, 403);
    assert.equal((await postForm(server.baseUrl, '/projects/1/tasks/1/completion', {})).status, 403);
    assert.deepEqual(taskRows(await read('/projects/1')), archivedTasks);
    assert.equal(taskRows(await read('/projects/2')).length, 0);
    const invalid = await postForm(server.baseUrl, '/projects', { name: ' ', filter: 'Archived' });
    assert.equal(invalid.status, 422);
    assert.deepEqual(rows(await invalid.text()), archivedRows);

    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(rows(await read('/?filter=Archived')), archivedRows);
    assert.deepEqual(taskRows(await read('/projects/1')), archivedTasks);
    assert.equal((await postForm(server.baseUrl, '/projects/1/restore', {})).status, 303);
    assert.equal(rows(await read('/?filter=Archived')).length, 0);
    const restoredRows = rows(await read());
    assert.equal(restoredRows.length, 2);
    assert.match(restoredRows[0], /First/);
    assert.match(restoredRows[0], /1\/2 completed/);
    assert.match(restoredRows[0], />Archive project<\/button>/);
    assert.doesNotMatch(await read('/projects/1'), /<(?:input|button)\b[^>]* disabled|<p>Archived project<\/p>/);
    assert.equal((await postForm(server.baseUrl, '/projects/1/tasks/1/completion', {})).status, 303);
    assert.match(rows(await read())[0], /0\/2 completed/);
    await postForm(server.baseUrl, '/projects/1/tasks', { title: 'After restore' });
    assert.match(rows(await read())[0], /0\/3 completed/);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(rows(await read()).length, 2);
    assert.match(rows(await read())[0], /0\/3 completed/);
    assert.equal(taskRows(await read('/projects/1')).length, 3);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('renaming preserves identity, ordering, tasks, summaries, and archive restrictions across restarts', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const read = async (path = '/') => (await fetch(server.baseUrl + path)).text();
    await createProject(server.baseUrl, 'Original');
    await createProject(server.baseUrl, 'Second');
    await postForm(server.baseUrl, '/projects/1/tasks', { title: 'Done' });
    await postForm(server.baseUrl, '/projects/1/tasks', { title: 'Pending' });
    await postForm(server.baseUrl, '/projects/1/tasks/1/completion', { completed: '1' });
    const originalRows = rows(await read());
    const originalTasks = taskRows(await read('/projects/1'));
    const initial = await read('/projects/1');
    assert.match(initial, /<label for="new-project-name">New project name<\/label>/);
    assert.match(initial, /<input id="new-project-name" name="name" type="text" value="Original">/);
    assert.match(initial, /<button type="submit">Rename project<\/button>/);
    for (const name of ['', ' \t\n ']) {
      const invalid = await postForm(server.baseUrl, '/projects/1/rename', { name, filter: 'Completed' });
      assert.equal(invalid.status, 422);
      const html = await invalid.text();
      assert.match(html, /<h1>Original<\/h1>/);
      assert.match(html, /id="rename-error" role="alert">Project name is required/);
      assert.match(html, /id="new-project-name"[^>]*aria-invalid="true"/);
      assert.doesNotMatch(html, /id="task-title"[^>]*aria-invalid/);
      assert.equal(taskRows(html).length, 1);
      assert.deepEqual(rows(await read()), originalRows);
    }
    assert.equal((await postForm(server.baseUrl, '/projects/999/rename', { name: 'Missing' })).status, 404);
    const renamed = await postForm(server.baseUrl, '/projects/1/rename', { name: '  Updated <name> & "team"  ', filter: 'Open' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Open');
    const escapedName = 'Updated &lt;name&gt; &amp; &quot;team&quot;';
    const renamedRows = rows(await read());
    assert.equal(renamedRows[0], originalRows[0].replace('Original', escapedName));
    assert.equal(renamedRows[1], originalRows[1]);
    assert.match(await read('/projects/1'), /<h1>Updated &lt;name&gt; &amp; &quot;team&quot;<\/h1>/);
    assert.deepEqual(taskRows(await read('/projects/1')), originalTasks);

    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(rows(await read()), renamedRows);
    assert.deepEqual(taskRows(await read('/projects/1')), originalTasks);
    await postForm(server.baseUrl, '/projects/1/archive', {});
    const archived = await read('/projects/1');
    assert.match(archived, /id="new-project-name"[^>]* disabled/);
    assert.match(archived, /<button type="submit" disabled>Rename project<\/button>/);
    assert.equal((await postForm(server.baseUrl, '/projects/1/rename', { name: 'Blocked' })).status, 403);
    assert.match(rows(await read('/?filter=Archived'))[0], /Updated &lt;name&gt; &amp; &quot;team&quot;/);
    await server.stop();
    server = await startServer(databasePath);
    assert.match(await read('/projects/1'), /id="new-project-name"[^>]* disabled/);
    await postForm(server.baseUrl, '/projects/1/restore', {});
    assert.doesNotMatch(await read('/projects/1'), /id="new-project-name"[^>]* disabled|<button[^>]* disabled>Rename project/);
    assert.equal((await postForm(server.baseUrl, '/projects/1/rename', { name: '  Restored name  ' })).status, 303);
    assert.deepEqual(taskRows(await read('/projects/1')), originalTasks);
    const restoredRows = rows(await read());
    assert.equal(restoredRows[0], originalRows[0].replace('Original', 'Restored name'));
    assert.equal(restoredRows[1], originalRows[1]);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(rows(await read()), restoredRows);
    assert.match(await read('/projects/1'), /<h1>Restored name<\/h1>/);
    assert.deepEqual(taskRows(await read('/projects/1')), originalTasks);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('existing project databases migrate to active without changing IDs or tasks', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const directory = await mkdtemp(join(tmpdir(), 'workboard-migration-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    const database = new DatabaseSync(databasePath);
    database.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (id, name) VALUES (7, 'Existing');
      INSERT INTO tasks (id, project_id, title, completed) VALUES (9, 7, 'Saved task', 1)`);
    database.close();
    server = await startServer(databasePath);
    const list = await (await fetch(server.baseUrl)).text();
    assert.match(rows(list)[0], /action="\/projects\/7"/);
    assert.match(rows(list)[0], /1\/1 completed/);
    const detail = await (await fetch(server.baseUrl + '/projects/7')).text();
    assert.match(taskRows(detail)[0], /Complete Saved task" checked/);
    assert.doesNotMatch(detail, /<(?:input|button)\b[^>]* disabled|<p>Archived project<\/p>/);
    await postForm(server.baseUrl, '/projects/7/archive', {});
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(rows(await (await fetch(server.baseUrl)).text()).length, 0);
    assert.match(rows(await (await fetch(server.baseUrl + '/?filter=Archived')).text())[0], /1\/1 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
