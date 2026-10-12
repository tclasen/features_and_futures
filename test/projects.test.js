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
    assert.deepEqual(taskRows(await readProject('/projects/1?filter=Open')), originalRows.map((row) => row.replaceAll('name="filter" value="All"', 'name="filter" value="Open"')));
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
    assertDefaultTaskPriority(detail, 'Normal');
    assert.match(taskRows(detail)[0], /Complete Saved task" checked/);
    assert.match(taskRows(detail)[0], /id="task-due-date-9" name="dueDate" type="text" value=""/);
    assert.match(taskRows(detail)[0], /<option>Low<\/option><option selected>Normal<\/option><option>High<\/option>/);
    assert.equal((await postForm(server.baseUrl, '/projects/7/tasks/9/priority', { priority: 'High' })).status, 303);
    assert.doesNotMatch(detail, /<input\b[^>]* disabled|<p>Archived project<\/p>/);
    assert.match(detail, /<button type="submit" disabled>Move task/);
    await postForm(server.baseUrl, '/projects/7/archive', {});
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(rows(await (await fetch(server.baseUrl)).text()).length, 0);
    assert.match(rows(await (await fetch(server.baseUrl + '/?filter=Archived')).text())[0], /1\/1 completed/);
    const savedTask = taskRows(await (await fetch(server.baseUrl + '/projects/7')).text())[0];
    assert.match(savedTask, /Complete Saved task" checked disabled/);
    assert.match(savedTask, /id="task-priority-9"[^>]* disabled/);
    assert.match(savedTask, /<option>Low<\/option><option>Normal<\/option><option selected>High<\/option>/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('priorities are independent, validated, persistent, and read-only while archived', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const read = async (path = '/projects/1') => (await fetch(server.baseUrl + path)).text();
    await createProject(server.baseUrl, 'First');
    await createProject(server.baseUrl, 'Second');
    await postForm(server.baseUrl, '/projects/1/tasks', { title: 'Done' });
    await postForm(server.baseUrl, '/projects/1/tasks', { title: 'Pending' });
    await postForm(server.baseUrl, '/projects/2/tasks', { title: 'Other' });
    await postForm(server.baseUrl, '/projects/1/tasks/1/completion', { completed: '1' });
    const originalTasks = taskRows(await read());
    const otherTasks = taskRows(await read('/projects/2'));
    const originalProjects = rows(await read('/'));
    const normalOptions = '<option>Low</option><option selected>Normal</option><option>High</option>';
    const highOptions = '<option>Low</option><option>Normal</option><option selected>High</option>';
    const lowOptions = '<option selected>Low</option><option>Normal</option><option>High</option>';
    for (const row of [...originalTasks, ...otherTasks]) {
      assert.match(row, /<label for="task-priority-\d+">Task priority<\/label>/);
      const options = row.match(/<select[^>]*name="priority"[^>]*>(.*?)<\/select>/s)[1];
      assert.equal(options, normalOptions);
    }
    const changed = await postForm(server.baseUrl, '/projects/1/tasks/1/priority', { priority: 'High', filter: 'Completed' });
    assert.equal(changed.status, 303);
    assert.equal(changed.headers.get('location'), '/projects/1?filter=Completed');
    assert.equal((await postForm(server.baseUrl, '/projects/1/tasks/2/priority', { priority: 'Low', filter: 'Open' })).status, 303);
    const expectedTasks = [originalTasks[0].replace(normalOptions, highOptions), originalTasks[1].replace(normalOptions, lowOptions)];
    assert.deepEqual(taskRows(await read()), expectedTasks);
    assert.deepEqual(taskRows(await read('/projects/1?filter=Completed')), [expectedTasks[0].replaceAll('name="filter" value="All"', 'name="filter" value="Completed"')]);
    assert.deepEqual(taskRows(await read('/projects/1?filter=Open')), [expectedTasks[1].replaceAll('name="filter" value="All"', 'name="filter" value="Open"')]);
    assert.deepEqual(taskRows(await read('/projects/2')), otherTasks);
    assert.deepEqual(rows(await read('/')), originalProjects);

    for (const values of [{}, { priority: '' }, { priority: 'Urgent' }, { priority: 'high' }]) {
      const invalid = await postForm(server.baseUrl, '/projects/1/tasks/1/priority', values);
      assert.equal(invalid.status, 422);
      assert.match(await invalid.text(), /role="alert">Task priority must be Low, Normal, or High/);
      assert.deepEqual(taskRows(await read()), expectedTasks);
    }
    for (const path of ['/projects/2/tasks/1/priority', '/projects/1/tasks/999/priority', '/projects/999/tasks/1/priority']) {
      assert.equal((await postForm(server.baseUrl, path, { priority: 'Low' })).status, 404);
    }
    await postForm(server.baseUrl, '/projects/1/tasks/1/rename', { title: '  Renamed  ' });
    expectedTasks[0] = expectedTasks[0].replaceAll('Done', 'Renamed');
    assert.deepEqual(taskRows(await read()), expectedTasks);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(taskRows(await read()), expectedTasks);
    assert.deepEqual(taskRows(await read('/projects/2')), otherTasks);
    assert.deepEqual(rows(await read('/')), originalProjects);

    await postForm(server.baseUrl, '/projects/1/archive', {});
    const archivedTasks = taskRows(await read());
    assert.ok(archivedTasks.every((row) => /<select id="task-priority-\d+"[^>]* disabled/.test(row)));
    assert.equal((await postForm(server.baseUrl, '/projects/1/tasks/1/priority', { priority: 'Normal' })).status, 403);
    assert.deepEqual(taskRows(await read()), archivedTasks);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(taskRows(await read()), archivedTasks);
    await postForm(server.baseUrl, '/projects/1/restore', {});
    assert.deepEqual(taskRows(await read()), expectedTasks);
    assert.equal((await postForm(server.baseUrl, '/projects/1/tasks/1/priority', { priority: 'Normal' })).status, 303);
    expectedTasks[0] = expectedTasks[0].replace(highOptions, normalOptions);
    await postForm(server.baseUrl, '/projects/1/tasks', { title: 'New task' });
    const finalTasks = taskRows(await read());
    assert.deepEqual(finalTasks.slice(0, 2), expectedTasks);
    assert.ok(finalTasks[2].includes(normalOptions));
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(taskRows(await read()), finalTasks);
    assert.deepEqual(taskRows(await read('/projects/2')), otherTasks);
    assert.match(rows(await read('/'))[0], /1\/3 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task renames preserve ownership, order, completion, filters, and persistence', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const read = async (path = '/projects/1') => (await fetch(server.baseUrl + path)).text();
    await createProject(server.baseUrl, 'First');
    await createProject(server.baseUrl, 'Second');
    await postForm(server.baseUrl, '/projects/1/tasks', { title: 'Original' });
    await postForm(server.baseUrl, '/projects/1/tasks', { title: 'Pending' });
    await postForm(server.baseUrl, '/projects/2/tasks', { title: 'Other project' });
    await postForm(server.baseUrl, '/projects/1/tasks/1/completion', { completed: '1' });
    const originalTasks = taskRows(await read());
    const originalProjects = rows(await read('/'));
    const otherTasks = taskRows(await read('/projects/2'));
    assert.match(originalTasks[0], /<label for="new-task-title-1">New task title<\/label>/);
    assert.match(originalTasks[0], /<input id="new-task-title-1" name="title" type="text" value="Original">/);
    assert.match(originalTasks[0], /<button type="submit">Rename task<\/button>/);
    for (const title of ['', ' \t\n ']) {
      const invalid = await postForm(server.baseUrl, '/projects/1/tasks/1/rename', { title, filter: 'Completed' });
      assert.equal(invalid.status, 422);
      const html = await invalid.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.match(html, /id="new-task-title-1"[^>]*aria-invalid="true"/);
      assert.doesNotMatch(html, /id="task-title"[^>]*aria-invalid/);
      assert.equal(taskRows(html).length, 1);
      assert.match(taskRows(html)[0], /Complete Original" checked/);
      assert.deepEqual(taskRows(await read()), originalTasks);
    }
    for (const path of ['/projects/2/tasks/1/rename', '/projects/1/tasks/999/rename', '/projects/999/tasks/1/rename']) {
      assert.equal((await postForm(server.baseUrl, path, { title: 'Wrong owner' })).status, 404);
    }
    const renamed = await postForm(server.baseUrl, '/projects/1/tasks/1/rename', {
      title: '  Updated <title> & "task"  ', filter: 'Completed',
    });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const escapedTitle = 'Updated &lt;title&gt; &amp; &quot;task&quot;';
    const renamedTasks = taskRows(await read());
    assert.equal(renamedTasks[0], originalTasks[0].replaceAll('Original', escapedTitle));
    assert.equal(renamedTasks[1], originalTasks[1]);
    assert.deepEqual(taskRows(await read('/projects/1?filter=Completed')), [renamedTasks[0].replaceAll('name="filter" value="All"', 'name="filter" value="Completed"')]);
    assert.deepEqual(taskRows(await read('/projects/1?filter=Open')), [renamedTasks[1].replaceAll('name="filter" value="All"', 'name="filter" value="Open"')]);
    assert.deepEqual(taskRows(await read('/projects/2')), otherTasks);
    assert.deepEqual(rows(await read('/')), originalProjects);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(taskRows(await read()), renamedTasks);
    assert.deepEqual(rows(await read('/')), originalProjects);

    await postForm(server.baseUrl, '/projects/1/archive', {});
    const archivedTasks = taskRows(await read());
    assert.ok(archivedTasks.every((row) => /id="new-task-title-\d+"[^>]* disabled/.test(row)));
    assert.ok(archivedTasks.every((row) => /<button type="submit" disabled>Rename task<\/button>/.test(row)));
    assert.equal((await postForm(server.baseUrl, '/projects/1/tasks/1/rename', { title: 'Blocked' })).status, 403);
    assert.deepEqual(taskRows(await read()), archivedTasks);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(taskRows(await read()), archivedTasks);
    await postForm(server.baseUrl, '/projects/1/restore', {});
    assert.deepEqual(taskRows(await read()), renamedTasks);
    const restoredRename = await postForm(server.baseUrl, '/projects/1/tasks/2/rename', { title: '  Renamed open task  ', filter: 'Open' });
    assert.equal(restoredRename.status, 303);
    assert.equal(restoredRename.headers.get('location'), '/projects/1?filter=Open');
    const finalTasks = taskRows(await read());
    assert.equal(finalTasks[0], renamedTasks[0]);
    assert.equal(finalTasks[1], originalTasks[1].replaceAll('Pending', 'Renamed open task'));
    assert.doesNotMatch(finalTasks[1], / checked/);
    assert.deepEqual(rows(await read('/')), originalProjects);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(taskRows(await read()), finalTasks);
    assert.deepEqual(taskRows(await read('/projects/2')), otherTasks);
    assert.deepEqual(rows(await read('/')), originalProjects);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

function assertTaskFilters(html, filter, priorityFilter) {
  for (const [id, selected, options] of [
    ['task-filter', filter, ['All', 'Open', 'Completed']],
    ['priority-filter', priorityFilter, ['All', 'Low', 'Normal', 'High']],
  ]) {
    const select = html.match(new RegExp(`<select id="${id}"[^>]*>(.*?)</select>`, 's'));
    assert.ok(select, `${id} exists`);
    assert.doesNotMatch(select[0], / disabled/);
    assert.match(select[0], /onchange="this.form.requestSubmit\(\)"/);
    assert.equal(select[1], options.map((option) => `<option${option === selected ? ' selected' : ''}>${option}</option>`).join(''));
  }
  // Both selects submit together, so changing either preserves the other.
  assert.match(html, /<form class="filter"[^>]*>[\s\S]*id="task-filter"[\s\S]*id="priority-filter"[\s\S]*?<\/form>/);
  for (const form of html.matchAll(/<form method="post"[^>]*>(.*?)<\/form>/gs)) {
    assert.ok(form[1].includes(`name="filter" value="${filter}"`));
    assert.ok(form[1].includes(`name="priorityFilter" value="${priorityFilter}"`));
  }
}

function taskTitles(html) {
  return taskRows(html).map((row) => row.match(/<span class="name">(.*?)<\/span>/s)[1]);
}

function assertDefaultTaskPriority(html, selected, disabled = false) {
  assert.match(html, /<label for="default-task-priority">Default task priority<\/label>/);
  const select = html.match(/<select id="default-task-priority"[^>]*>(.*?)<\/select>/s);
  assert.ok(select);
  assert.equal(select[0].includes(' disabled'), disabled);
  assert.match(select[0], /onchange="this.form.requestSubmit\(\)"/);
  assert.equal(select[1], ['Low', 'Normal', 'High'].map((priority) =>
    `<option${priority === selected ? ' selected' : ''}>${priority}</option>`).join(''));
}

test('project defaults affect only future tasks and survive filters, renames, archives, and restarts', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-default-priority-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const read = async (path = '/projects/1') => (await fetch(server.baseUrl + path)).text();
    await createProject(server.baseUrl, 'First');
    await createProject(server.baseUrl, 'Second');
    assertDefaultTaskPriority(await read(), 'Normal');
    assertDefaultTaskPriority(await read('/projects/2'), 'Normal');
    await postForm(server.baseUrl, '/projects/1/tasks', { title: 'Existing' });
    await postForm(server.baseUrl, '/projects/1/tasks/1/completion', { completed: '1' });
    const existingTasks = taskRows(await read());
    const originalProjects = rows(await read('/'));
    const filters = { filter: 'Completed', priorityFilter: 'Normal' };
    const setDefault = async (priority) => {
      const response = await postForm(server.baseUrl, '/projects/1/default-priority', { priority, ...filters });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/projects/1?filter=Completed&priorityFilter=Normal');
      const html = await read(response.headers.get('location'));
      assertTaskFilters(html, 'Completed', 'Normal');
      assertDefaultTaskPriority(html, priority);
      assert.deepEqual(taskTitles(html), ['Existing']);
    };
    await setDefault('High');
    assert.deepEqual(taskRows(await read()), existingTasks);
    assert.deepEqual(rows(await read('/')), originalProjects);
    for (const priority of ['', 'Urgent', 'high', undefined]) {
      const response = await postForm(server.baseUrl, '/projects/1/default-priority', {
        ...filters, ...(priority === undefined ? {} : { priority }),
      });
      assert.equal(response.status, 422);
      const html = await response.text();
      assertTaskFilters(html, 'Completed', 'Normal');
      assertDefaultTaskPriority(html, 'High');
      assert.match(html, /role="alert">Task priority must be Low, Normal, or High/);
    }
    assert.equal((await postForm(server.baseUrl, '/projects/999/default-priority', { priority: 'Low' })).status, 404);
    await postForm(server.baseUrl, '/projects/1/tasks', { title: 'Inherited High' });
    await setDefault('Low');
    await postForm(server.baseUrl, '/projects/1/tasks', { title: 'Inherited Low' });
    await postForm(server.baseUrl, '/projects/2/tasks', { title: 'Independent Normal' });
    assertDefaultTaskPriority(await read('/projects/2'), 'Normal');
    const otherTasks = taskRows(await read('/projects/2'));
    assert.match(otherTasks[0], /<option selected>Normal<\/option>/);
    await postForm(server.baseUrl, '/projects/1/tasks/2/rename', { title: 'Renamed High' });
    await postForm(server.baseUrl, '/projects/1/rename', { name: 'Renamed project' });
    const savedTasks = taskRows(await read());
    assert.deepEqual(savedTasks.slice(0, 1), existingTasks);
    assert.match(savedTasks[1], /Renamed High/);
    assert.match(savedTasks[1], /<option selected>High<\/option>/);
    assert.match(savedTasks[2], /<option selected>Low<\/option>/);
    const savedProjects = rows(await read('/'));
    assert.match(savedProjects[0], /1\/3 completed/);
    await server.stop();
    server = await startServer(databasePath);
    assertDefaultTaskPriority(await read(), 'Low');
    assert.deepEqual(taskRows(await read()), savedTasks);
    assert.deepEqual(rows(await read('/')), savedProjects);
    await postForm(server.baseUrl, '/projects/1/archive', {});
    const archived = await read('/projects/1?filter=Completed&priorityFilter=Normal');
    assertDefaultTaskPriority(archived, 'Low', true);
    assertTaskFilters(archived, 'Completed', 'Normal');
    assert.deepEqual(taskTitles(archived), ['Existing']);
    const blocked = await postForm(server.baseUrl, '/projects/1/default-priority', { priority: 'High', ...filters });
    assert.equal(blocked.status, 403);
    assertDefaultTaskPriority(await blocked.text(), 'Low', true);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await read('/projects/1?filter=Completed&priorityFilter=Normal'), archived);
    await postForm(server.baseUrl, '/projects/1/restore', {});
    assertDefaultTaskPriority(await read(), 'Low');
    assert.deepEqual(taskRows(await read()), savedTasks);
    assert.deepEqual(rows(await read('/')), savedProjects);
    await postForm(server.baseUrl, '/projects/1/tasks', { title: 'Restored Low' });
    assert.match(taskRows(await read())[3], /<option selected>Low<\/option>/);
    await setDefault('Normal');
    await postForm(server.baseUrl, '/projects/1/tasks', { title: 'New Normal' });
    assert.match(taskRows(await read())[4], /<option selected>Normal<\/option>/);
    assert.deepEqual(taskRows(await read()).slice(0, 3), savedTasks);
    assert.deepEqual(taskRows(await read('/projects/2')), otherTasks.map((row) => row.replace('<option value="1">First</option>', '<option value="1">Renamed project</option>')));
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('combined filters preserve selections, order, edits, summaries, and archived data across restarts', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-combined-filters-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const read = async (path = '/projects/1') => (await fetch(server.baseUrl + path)).text();
    await createProject(server.baseUrl, 'First');
    await createProject(server.baseUrl, 'Second');
    const tasks = [
      { title: 'Open High', priority: 'High', completed: false },
      { title: 'Done Low', priority: 'Low', completed: true },
      { title: 'Open Normal', priority: 'Normal', completed: false },
      { title: 'Done High', priority: 'High', completed: true },
      { title: 'Open Low', priority: 'Low', completed: false },
      { title: 'Done Normal', priority: 'Normal', completed: true },
    ];
    for (const [index, task] of tasks.entries()) {
      await postForm(server.baseUrl, '/projects/1/tasks', { title: task.title });
      await postForm(server.baseUrl, `/projects/1/tasks/${index + 1}/priority`, { priority: task.priority });
      if (task.completed) await postForm(server.baseUrl, `/projects/1/tasks/${index + 1}/completion`, { completed: '1' });
    }
    await postForm(server.baseUrl, '/projects/2/tasks', { title: 'Other project' });
    const originalTasks = taskRows(await read());
    const originalProjects = rows(await read('/'));
    const otherTasks = taskRows(await read('/projects/2'));
    assertTaskFilters(await read(), 'All', 'All');
    assert.match(originalProjects[0], /3\/6 completed/);
    for (const filter of ['All', 'Open', 'Completed']) {
      for (const priorityFilter of ['All', 'Low', 'Normal', 'High']) {
        const html = await read(`/projects/1?${new URLSearchParams({ filter, priorityFilter })}`);
        assertTaskFilters(html, filter, priorityFilter);
        assert.deepEqual(taskTitles(html), tasks.filter((task) =>
          (filter === 'All' || task.completed === (filter === 'Completed')) &&
          (priorityFilter === 'All' || task.priority === priorityFilter)).map((task) => task.title));
      }
    }
    assert.deepEqual(taskRows(await read()), originalTasks);
    assert.deepEqual(rows(await read('/')), originalProjects);
    assertTaskFilters(await read('/projects/1?filter=Open&priorityFilter=Unknown'), 'Open', 'All');
    assertTaskFilters(await read('/projects/1?filter=Unknown&priorityFilter=High'), 'All', 'High');

    // Validation failures retain both filters and leave saved rows unchanged.
    for (const [path, values, message] of [
      ['/projects/1/tasks', { title: ' ' }, 'Task title is required'],
      ['/projects/1/rename', { name: ' ' }, 'Project name is required'],
      ['/projects/1/tasks/1/rename', { title: ' ' }, 'Task title is required'],
      ['/projects/1/tasks/1/priority', { priority: 'Urgent' }, 'Task priority must be Low, Normal, or High'],
    ]) {
      const response = await postForm(server.baseUrl, path, { ...values, filter: 'Open', priorityFilter: 'High' });
      assert.equal(response.status, 422);
      const html = await response.text();
      assertTaskFilters(html, 'Open', 'High');
      assert.ok(html.includes(`role="alert">${message}`));
      assert.deepEqual(taskTitles(html), ['Open High']);
    }
    assert.deepEqual(taskRows(await read()), originalTasks);

    const edit = async (path, values, expectedTitles) => {
      const response = await postForm(server.baseUrl, path, values);
      assert.equal(response.status, 303);
      const location = response.headers.get('location');
      const parameters = new URL(location, server.baseUrl).searchParams;
      assert.equal(parameters.get('filter'), values.filter);
      assert.equal(parameters.get('priorityFilter'), values.priorityFilter);
      const html = await read(location);
      assertTaskFilters(html, values.filter, values.priorityFilter);
      assert.deepEqual(taskTitles(html), expectedTitles);
    };
    await edit('/projects/1/tasks/1/rename', { title: '  Renamed High  ', filter: 'Open', priorityFilter: 'High' }, ['Renamed High']);
    assert.match(taskRows(await read('/projects/1?filter=Open&priorityFilter=High'))[0], /aria-label="Complete Renamed High"/);
    assert.deepEqual(rows(await read('/')), originalProjects);
    await edit('/projects/1/tasks/1/completion', { completed: '1', filter: 'Open', priorityFilter: 'High' }, []);
    assert.match(rows(await read('/'))[0], /4\/6 completed/);
    await edit('/projects/1/tasks/2/priority', { priority: 'High', filter: 'Completed', priorityFilter: 'Low' }, []);
    await edit('/projects/1/tasks/4/completion', { filter: 'Completed', priorityFilter: 'High' }, ['Renamed High', 'Done Low']);
    await edit('/projects/1/tasks/5/priority', { priority: 'High', filter: 'Open', priorityFilter: 'Low' }, []);
    const finalTasks = taskRows(await read());
    const finalProjects = rows(await read('/'));
    assert.match(finalProjects[0], /3\/6 completed/);
    assert.deepEqual(taskRows(await read('/projects/2')), otherTasks);

    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(taskRows(await read()), finalTasks);
    assert.deepEqual(rows(await read('/')), finalProjects);
    assert.deepEqual(taskTitles(await read('/projects/1?filter=Open&priorityFilter=High')), ['Done High', 'Open Low']);
    assertTaskFilters(await read(), 'All', 'All');
    await postForm(server.baseUrl, '/projects/1/archive', {});
    const archived = await read('/projects/1?filter=Completed&priorityFilter=High');
    assertTaskFilters(archived, 'Completed', 'High');
    assert.deepEqual(taskTitles(archived), ['Renamed High', 'Done Low']);
    for (const row of taskRows(archived)) {
      assert.match(row, /type="checkbox"[^>]* disabled/);
      assert.match(row, /id="task-priority-\d+"[^>]* disabled/);
      assert.match(row, /id="new-task-title-\d+"[^>]* disabled/);
      assert.match(row, /<button type="submit" disabled>Rename task/);
    }
    const blocked = await postForm(server.baseUrl, '/projects/1/tasks/1/priority', { priority: 'Low', filter: 'Completed', priorityFilter: 'High' });
    assert.equal(blocked.status, 403);
    assertTaskFilters(await blocked.text(), 'Completed', 'High');
    assert.match(rows(await read('/?filter=Archived'))[0], /3\/6 completed/);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await read('/projects/1?filter=Completed&priorityFilter=High'), archived);
    await postForm(server.baseUrl, '/projects/1/restore', {});
    assert.deepEqual(taskRows(await read()), finalTasks);
    assert.deepEqual(rows(await read('/')), finalProjects);
    assert.deepEqual(taskRows(await read('/projects/2')), otherTasks);
    assertTaskFilters(await read(), 'All', 'All');
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('due dates preserve task data, filters, ownership, and archive restrictions across restarts', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-due-dates-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const read = async (path = '/projects/1') => (await fetch(server.baseUrl + path)).text();
    await createProject(server.baseUrl, 'First');
    await createProject(server.baseUrl, 'Second');
    await postForm(server.baseUrl, '/projects/1/tasks', { title: 'First task' });
    await postForm(server.baseUrl, '/projects/1/tasks', { title: 'Second task' });
    await postForm(server.baseUrl, '/projects/2/tasks', { title: 'Other project task' });
    await postForm(server.baseUrl, '/projects/1/tasks/1/completion', { completed: '1' });
    await postForm(server.baseUrl, '/projects/1/tasks/1/priority', { priority: 'High' });
    const filters = { filter: 'Completed', priorityFilter: 'High' };
    const filteredPath = '/projects/1?filter=Completed&priorityFilter=High';
    const initialTasks = taskRows(await read());
    const initialProjects = rows(await read('/'));
    const otherTasks = taskRows(await read('/projects/2'));
    for (const [index, row] of initialTasks.entries()) {
      assert.ok(row.includes(`<label for="task-due-date-${index + 1}">Task due date</label>`));
      assert.match(row, /name="dueDate" type="text" value=""/);
      assert.match(row, />Save due date<\/button>/);
    }
    let expectedTitle = 'First task';
    const save = async (dueDate) => {
      const response = await postForm(server.baseUrl, '/projects/1/tasks/1/due-date', { dueDate, ...filters });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), filteredPath);
      const html = await read(filteredPath);
      assertTaskFilters(html, 'Completed', 'High');
      assert.deepEqual(taskTitles(html), [expectedTitle]);
      assert.deepEqual(rows(await read('/')), initialProjects);
      assert.deepEqual(taskRows(await read('/projects/2')), otherTasks);
    };
    await save('  2000-02-29  ');
    const savedTasks = taskRows(await read());
    assert.equal(savedTasks[0], initialTasks[0].replace('name="dueDate" type="text" value=""', 'name="dueDate" type="text" value="2000-02-29"'));
    assert.equal(savedTasks[1], initialTasks[1]);
    for (const dueDate of ['1900-02-29', '2026-04-31', '0000-01-01', '2026-1-01', '<script>']) {
      const response = await postForm(server.baseUrl, '/projects/1/tasks/1/due-date', { dueDate, ...filters });
      assert.equal(response.status, 422);
      const html = await response.text();
      assert.match(html, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      assert.match(html, /name="dueDate" type="text" value="2000-02-29"/);
      assertTaskFilters(html, 'Completed', 'High');
      assert.deepEqual(taskRows(await read()), savedTasks);
    }
    for (const path of ['/projects/2/tasks/1/due-date', '/projects/1/tasks/999/due-date', '/projects/999/tasks/1/due-date']) {
      assert.equal((await postForm(server.baseUrl, path, { dueDate: '2026-01-01' })).status, 404);
    }
    assert.deepEqual(taskRows(await read()), savedTasks);
    assert.deepEqual(taskRows(await read('/projects/2')), otherTasks);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(taskRows(await read()), savedTasks);
    await postForm(server.baseUrl, '/projects/1/tasks/1/rename', { title: 'Renamed task', ...filters });
    expectedTitle = 'Renamed task';
    const renamedTasks = taskRows(await read());
    assert.equal(renamedTasks[0], savedTasks[0].replaceAll('First task', 'Renamed task'));
    await postForm(server.baseUrl, '/projects/1/archive', {});
    const archived = await read(filteredPath);
    assertTaskFilters(archived, 'Completed', 'High');
    for (const row of taskRows(await read())) {
      assert.match(row, /id="task-due-date-\d+"[^>]* disabled/);
      assert.match(row, /<button type="submit" disabled>Save due date/);
    }
    for (const dueDate of ['', '2026-01-01']) {
      const blocked = await postForm(server.baseUrl, '/projects/1/tasks/1/due-date', { dueDate, ...filters });
      assert.equal(blocked.status, 403);
      assertTaskFilters(await blocked.text(), 'Completed', 'High');
      assert.equal(await read(filteredPath), archived);
    }
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await read(filteredPath), archived);
    await postForm(server.baseUrl, '/projects/1/restore', {});
    assert.deepEqual(taskRows(await read()), renamedTasks);
    await save(' \t\n ');
    assert.match(taskRows(await read())[0], /name="dueDate" type="text" value=""/);
    await server.stop();
    server = await startServer(databasePath);
    assert.match(taskRows(await read())[0], /name="dueDate" type="text" value=""/);
    await save('0001-01-01');
    await save('');
    await save('9999-12-31');
    await postForm(server.baseUrl, '/projects/1/tasks/2/due-date', { dueDate: '2024-02-29' });
    const finalTasks = taskRows(await read());
    assert.match(finalTasks[0], /name="dueDate" type="text" value="9999-12-31"/);
    assert.match(finalTasks[1], /name="dueDate" type="text" value="2024-02-29"/);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(taskRows(await read()), finalTasks);
    assert.deepEqual(rows(await read('/')), initialProjects);
    assert.deepEqual(taskRows(await read('/projects/2')), otherTasks);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('due ranges intersect filters and retain applied state through errors, edits, and archives', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-due-range-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const read = async (path = '/projects/1') => (await fetch(server.baseUrl + path)).text();
    await createProject(server.baseUrl, 'First');
    await createProject(server.baseUrl, 'Other');
    const tasks = [
      { title: 'Undated', date: '', priority: 'Normal', completed: false },
      { title: 'Before', date: '2026-01-01', priority: 'High', completed: true },
      { title: 'Start', date: '2026-02-01', priority: 'High', completed: false },
      { title: 'End', date: '2026-02-28', priority: 'Low', completed: true },
      { title: 'After', date: '2026-03-01', priority: 'High', completed: false },
    ];
    for (const [index, task] of tasks.entries()) {
      await postForm(server.baseUrl, '/projects/1/tasks', { title: task.title });
      await postForm(server.baseUrl, `/projects/1/tasks/${index + 1}/due-date`, { dueDate: task.date });
      await postForm(server.baseUrl, `/projects/1/tasks/${index + 1}/priority`, { priority: task.priority });
      if (task.completed) await postForm(server.baseUrl, `/projects/1/tasks/${index + 1}/completion`, { completed: '1' });
    }
    const originalTasks = taskRows(await read());
    const originalProjects = rows(await read('/'));
    const assertRange = (html, dueFrom, dueThrough) => {
      assert.match(html, /<label for="due-from">Due from<\/label>/);
      assert.match(html, /<label for="due-through">Due through<\/label>/);
      assert.match(html, />Apply due range<\/button>/);
      for (const form of html.matchAll(/<form (?:method="post"|class="filter" method="get")[^>]*>(.*?)<\/form>/gs)) {
        assert.ok(form[1].includes(`name="dueFrom" value="${dueFrom}"`));
        assert.ok(form[1].includes(`name="dueThrough" value="${dueThrough}"`));
      }
    };
    assertRange(await read(), '', '');
    for (const [dueFrom, dueThrough] of [['', ''], ['2026-02-01', ''], ['', '2026-02-28'], ['2026-02-01', '2026-02-28'], ['2026-02-01', '2026-02-01'], ['0001-01-01', '9999-12-31']]) {
      for (const filter of ['All', 'Open', 'Completed']) {
        for (const priorityFilter of ['All', 'Low', 'Normal', 'High']) {
          const response = await postForm(server.baseUrl, '/projects/1/due-range', {
            rangeFrom: ` ${dueFrom} `, rangeThrough: ` ${dueThrough} `, filter, priorityFilter,
          });
          assert.equal(response.status, 303);
          const html = await read(response.headers.get('location'));
          assertTaskFilters(html, filter, priorityFilter);
          assertRange(html, dueFrom, dueThrough);
          assert.deepEqual(taskTitles(html), tasks.filter((task) =>
            (filter === 'All' || task.completed === (filter === 'Completed')) &&
            (priorityFilter === 'All' || task.priority === priorityFilter) &&
            (!dueFrom || (task.date && task.date >= dueFrom)) &&
            (!dueThrough || (task.date && task.date <= dueThrough))).map((task) => task.title));
        }
      }
    }
    assert.deepEqual(taskRows(await read()), originalTasks);
    assert.deepEqual(rows(await read('/')), originalProjects);
    const filters = { filter: 'Open', priorityFilter: 'High', dueFrom: '2026-02-01', dueThrough: '2026-02-28' };
    const path = `/projects/1?${new URLSearchParams(filters)}`;
    for (const [rangeFrom, rangeThrough, message] of [
      ['2026-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['', '2026-04-31', 'Due range must use valid YYYY-MM-DD dates'],
      ['2026-1-01', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2026-03-01', '2026-02-28', 'Due from must not be after Due through'],
      ['<script>', '', 'Due range must use valid YYYY-MM-DD dates'],
    ]) {
      const response = await postForm(server.baseUrl, '/projects/1/due-range', { ...filters, rangeFrom, rangeThrough });
      assert.equal(response.status, 422);
      const html = await response.text();
      assert.ok(html.includes(`role="alert">${message}`));
      assertTaskFilters(html, 'Open', 'High');
      assertRange(html, filters.dueFrom, filters.dueThrough);
      assert.deepEqual(taskTitles(html), ['Start']);
      assert.doesNotMatch(html, /value="<script>"/);
    }
    const edit = async (endpoint, values, titles) => {
      const response = await postForm(server.baseUrl, endpoint, { ...filters, ...values });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), path);
      const html = await read(path);
      assertRange(html, filters.dueFrom, filters.dueThrough);
      assertTaskFilters(html, 'Open', 'High');
      assert.deepEqual(taskTitles(html), titles);
    };
    await edit('/projects/1/tasks/3/rename', { title: 'Renamed start' }, ['Renamed start']);
    await edit('/projects/1/rename', { name: 'Renamed project' }, ['Renamed start']);
    await edit('/projects/1/default-priority', { priority: 'High' }, ['Renamed start']);
    await edit('/projects/1/tasks', { title: 'New undated' }, ['Renamed start']);
    await edit('/projects/1/tasks/3/due-date', { dueDate: '2026-03-01' }, []);
    await edit('/projects/1/tasks/5/due-date', { dueDate: '2026-02-15' }, ['After']);
    await edit('/projects/1/tasks/5/priority', { priority: 'Low' }, []);
    await edit('/projects/1/tasks/4/priority', { priority: 'High' }, []);
    await edit('/projects/1/tasks/4/completion', {}, ['End']);
    // Changing either select retains the applied range and the other selection.
    assert.deepEqual(taskTitles(await read(`/projects/1?${new URLSearchParams({ ...filters, filter: 'Completed' })}`)), []);
    assert.deepEqual(taskTitles(await read(`/projects/1?${new URLSearchParams({ ...filters, priorityFilter: 'Low' })}`)), ['After']);
    const savedTasks = taskRows(await read());
    const savedProjects = rows(await read('/'));
    assert.match(savedProjects[0], /1\/6 completed/);
    await postForm(server.baseUrl, '/projects/1/archive', {});
    const archived = await read(path);
    assertRange(archived, filters.dueFrom, filters.dueThrough);
    assert.deepEqual(taskTitles(archived), ['End']);
    assert.doesNotMatch(archived, /id="due-(?:from|through)"[^>]* disabled/);
    for (const row of taskRows(archived)) {
      assert.match(row, /type="checkbox"[^>]* disabled/);
      assert.match(row, /id="task-priority-\d+"[^>]* disabled/);
      assert.match(row, /id="task-due-date-\d+"[^>]* disabled/);
    }
    const applyArchived = await postForm(server.baseUrl, '/projects/1/due-range', { ...filters, rangeFrom: '', rangeThrough: '' });
    assert.equal(applyArchived.status, 303);
    const unbounded = await read(applyArchived.headers.get('location'));
    assertRange(unbounded, '', '');
    assert.deepEqual(taskTitles(unbounded), ['Renamed start', 'End', 'New undated']);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await read(path), archived);
    await postForm(server.baseUrl, '/projects/1/restore', {});
    assert.deepEqual(taskRows(await read()), savedTasks);
    assert.deepEqual(rows(await read('/')), savedProjects);
    assert.deepEqual(taskTitles(await read(path)), ['End']);
    assertRange(await read(), '', '');
    assert.deepEqual(taskTitles(await read()), ['Undated', 'Before', 'Renamed start', 'End', 'After', 'New undated']);
    assert.deepEqual(taskTitles(await read('/projects/2')), []);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('moves append tasks, preserve data and filters, update summaries, and survive restarts', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-moves-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const read = async (path = '/projects/1') => (await fetch(server.baseUrl + path)).text();
    const move = (source, task, destination, filters = {}) => postForm(server.baseUrl,
      `/projects/${source}/tasks/${task}/move`, { destinationProject: String(destination), ...filters });
    await createProject(server.baseUrl, 'Source');
    await postForm(server.baseUrl, '/projects/1/tasks', { title: 'Moving' });
    const alone = taskRows(await read())[0];
    assert.match(alone, /<label for="destination-project-1">Destination project<\/label>/);
    assert.match(alone, /name="destinationProject" disabled><\/select>/);
    assert.match(alone, /disabled>Move task<\/button>/);
    await createProject(server.baseUrl, 'Destination');
    await createProject(server.baseUrl, '<Third>');
    await createProject(server.baseUrl, 'Archived');
    await postForm(server.baseUrl, '/projects/4/archive', {});
    await postForm(server.baseUrl, '/projects/2/rename', { name: 'Renamed destination' });
    const options = taskRows(await read())[0].match(/name="destinationProject"[^>]*>(.*?)<\/select>/s)[1];
    assert.equal(options, '<option value="2">Renamed destination</option><option value="3">&lt;Third&gt;</option>');
    // The moving task predates destination tasks; order must no longer depend on IDs.
    await postForm(server.baseUrl, '/projects/2/default-priority', { priority: 'Low' });
    await postForm(server.baseUrl, '/projects/2/tasks', { title: 'Destination first' });
    await postForm(server.baseUrl, '/projects/2/tasks', { title: 'Destination second' });
    await postForm(server.baseUrl, '/projects/1/tasks', { title: 'Remaining' });
    for (const task of [1, 4]) {
      await postForm(server.baseUrl, `/projects/1/tasks/${task}/priority`, { priority: 'High' });
      await postForm(server.baseUrl, `/projects/1/tasks/${task}/completion`, { completed: '1' });
      await postForm(server.baseUrl, `/projects/1/tasks/${task}/due-date`, { dueDate: '2026-02-15' });
    }
    const filters = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2026-02-01', dueThrough: '2026-02-28' };
    const filteredPath = `/projects/1?${new URLSearchParams(filters)}`;
    const remaining = taskRows(await read(filteredPath))[1];
    for (const destination of ['', '1', '4', '999', '2.0', '-2', '9007199254740993']) {
      const response = await move(1, 1, destination, filters);
      assert.equal(response.status, 422);
      const html = await response.text();
      assertTaskFilters(html, 'Completed', 'High');
      assert.deepEqual(taskTitles(html), ['Moving', 'Remaining']);
    }
    assert.equal((await move(2, 1, 3)).status, 404);
    assert.equal((await move(1, 999, 2)).status, 404);
    const moved = await move(1, 1, 2, filters);
    assert.equal(moved.status, 303);
    assert.equal(moved.headers.get('location'), filteredPath);
    assert.deepEqual(taskRows(await read(filteredPath)), [remaining]);
    assert.deepEqual(taskTitles(await read('/projects/2')), ['Destination first', 'Destination second', 'Moving']);
    const movedRow = taskRows(await read('/projects/2'))[2];
    assert.match(movedRow, /action="\/projects\/2\/tasks\/1\/completion"/);
    assert.match(movedRow, /aria-label="Complete Moving" checked/);
    assert.match(movedRow, /<option selected>High<\/option>/);
    assert.match(movedRow, /name="dueDate" type="text" value="2026-02-15"/);
    let summaries = rows(await read('/'));
    assert.match(summaries[0], /1\/1 completed/);
    assert.match(summaries[1], /1\/3 completed/);
    await postForm(server.baseUrl, '/projects/2/tasks', { title: 'New after move' });
    assert.deepEqual(taskTitles(await read('/projects/2')), ['Destination first', 'Destination second', 'Moving', 'New after move']);
    const saved = taskRows(await read('/projects/2'));
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(taskRows(await read('/projects/2')), saved);
    assert.deepEqual(taskRows(await read(filteredPath)), [remaining]);
    // Returning restores the source position and retains task identity.
    assert.equal((await move(2, 1, 1)).status, 303);
    assert.deepEqual(taskTitles(await read()), ['Moving', 'Remaining']);
    assert.equal((await move(2, 2, 1)).status, 303);
    const blankDate = taskRows(await read())[2];
    assert.match(blankDate, /name="dueDate" type="text" value=""/);
    assert.match(blankDate, /<option selected>Low<\/option>/);
    assert.doesNotMatch(blankDate, /aria-label="Complete Destination first" checked/);
    summaries = rows(await read('/'));
    assert.match(summaries[0], /2\/3 completed/);
    assert.match(summaries[1], /0\/2 completed/);
    await postForm(server.baseUrl, '/projects/1/archive', {});
    const archived = await read(filteredPath);
    assertTaskFilters(archived, 'Completed', 'High');
    for (const row of taskRows(archived)) {
      assert.match(row, /name="destinationProject" disabled/);
      assert.match(row, /disabled>Move task<\/button>/);
    }
    assert.equal((await move(1, 1, 2, filters)).status, 403);
    assert.equal((await move(2, 3, 1)).status, 422);
    assert.equal(await read(filteredPath), archived);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await read(filteredPath), archived);
    await postForm(server.baseUrl, '/projects/1/restore', {});
    assert.doesNotMatch(taskRows(await read())[0], /name="destinationProject" disabled|disabled>Move task/);
    assert.deepEqual(taskTitles(await read()), ['Moving', 'Remaining', 'Destination first']);
    assert.equal((await move(1, 1, 2)).status, 303);
    assert.deepEqual(taskTitles(await read('/projects/2')), ['Destination second', 'Moving', 'New after move']);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('per-project return positions migrate current order and survive reversed returns, edits, and restarts', { timeout: 15000 }, async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const directory = await mkdtemp(join(tmpdir(), 'workboard-return-order-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    // Task 011 databases may have a current order unrelated to task IDs.
    const database = new DatabaseSync(databasePath);
    database.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
        priority TEXT NOT NULL DEFAULT 'Normal', due_date TEXT NOT NULL DEFAULT '',
        position INTEGER NOT NULL
      );
      INSERT INTO projects (id, name) VALUES (1, 'Source'), (2, 'Second'), (3, 'Third');
      INSERT INTO tasks (id, project_id, title, completed, priority, due_date, position) VALUES
        (3, 1, 'A', 1, 'High', '2026-02-15', 10),
        (1, 1, 'B', 0, 'Normal', '', 20),
        (2, 1, 'C', 1, 'High', '2026-02-15', 30),
        (4, 2, 'D', 0, 'Low', '', 1),
        (5, 2, 'E', 0, 'Normal', '', 2),
        (6, 3, 'F', 0, 'Normal', '', 1);`);
    database.close();
    server = await startServer(databasePath);
    const read = async (path) => (await fetch(server.baseUrl + path)).text();
    const titles = async (project) => taskTitles(await read(`/projects/${project}`));
    const move = async (source, task, destination, filters = {}) => {
      const response = await postForm(server.baseUrl, `/projects/${source}/tasks/${task}/move`, {
        destinationProject: String(destination), ...filters,
      });
      assert.equal(response.status, 303);
      return response;
    };
    assert.deepEqual(await titles(1), ['A', 'B', 'C']);
    const filters = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2026-02-01', dueThrough: '2026-02-28' };
    const filteredPath = `/projects/1?${new URLSearchParams(filters)}`;
    const moved = await move(1, 3, 2, filters);
    assert.equal(moved.headers.get('location'), filteredPath);
    assert.deepEqual(taskTitles(await read(filteredPath)), ['C']);
    await move(1, 2, 2, filters);
    assert.deepEqual(taskTitles(await read(filteredPath)), []);
    assert.deepEqual(await titles(2), ['D', 'E', 'A', 'C']);
    await move(1, 1, 3);
    assert.deepEqual(await titles(1), []);
    // New tasks and first-time arrivals must follow even unoccupied positions.
    await postForm(server.baseUrl, '/projects/1/tasks', { title: 'New' });
    await move(1, 7, 2);
    await move(2, 4, 1);
    assert.deepEqual(await titles(1), ['D']);
    assert.deepEqual(await titles(2), ['E', 'A', 'C', 'New']);
    await postForm(server.baseUrl, '/projects/2/tasks/3/rename', { title: 'Updated A' });
    await postForm(server.baseUrl, '/projects/2/tasks/3/priority', { priority: 'Low' });
    await postForm(server.baseUrl, '/projects/2/tasks/3/completion', {});
    await postForm(server.baseUrl, '/projects/2/tasks/3/due-date', { dueDate: '' });
    await postForm(server.baseUrl, '/projects/1/rename', { name: 'Renamed source' });
    await postForm(server.baseUrl, '/projects/1/archive', {});
    assert.equal((await postForm(server.baseUrl, '/projects/2/tasks/2/move', { destinationProject: '1' })).status, 422);
    assert.equal((await postForm(server.baseUrl, '/projects/1/tasks/4/move', { destinationProject: '2' })).status, 403);
    assert.doesNotMatch(await read('/projects/2'), /<option value="1">/);
    await server.stop();
    server = await startServer(databasePath);
    await postForm(server.baseUrl, '/projects/1/restore', {});
    assert.match(await read('/projects/2'), /<option value="1">Renamed source<\/option>/);
    // Return in a different order, across three projects and a process restart.
    await move(2, 2, 1);
    await move(2, 3, 1);
    await move(3, 1, 1);
    assert.deepEqual(await titles(1), ['Updated A', 'B', 'C', 'D']);
    await move(2, 7, 1);
    assert.deepEqual(await titles(1), ['Updated A', 'B', 'C', 'New', 'D']);
    assert.deepEqual(taskTitles(await read(filteredPath)), ['C']);
    const updated = taskRows(await read('/projects/1'))[0];
    assert.match(updated, /aria-label="Complete Updated A"/);
    assert.doesNotMatch(updated, / checked/);
    assert.match(updated, /<option selected>Low<\/option>/);
    assert.match(updated, /name="dueDate" type="text" value=""/);
    assert.match(rows(await read('/'))[0], /1\/5 completed/);
    assert.match(rows(await read('/'))[1], /0\/1 completed/);
    // A task remembers independent positions in both projects on repeated trips.
    await move(1, 7, 2);
    await move(1, 2, 2);
    await move(1, 3, 2);
    await move(1, 4, 2);
    assert.deepEqual(await titles(2), ['D', 'E', 'Updated A', 'C', 'New']);
    const saved = taskRows(await read('/projects/2'));
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(taskRows(await read('/projects/2')), saved);
    await move(2, 4, 1);
    await move(2, 7, 1);
    await move(2, 3, 1);
    await move(2, 2, 1);
    assert.deepEqual(await titles(1), ['Updated A', 'B', 'C', 'New', 'D']);
    assert.deepEqual(await titles(2), ['E']);
    assert.deepEqual(await titles(3), ['F']);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project search intersects archive state, escapes queries, and starts empty on return', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-project-search-'));
  let server;
  try {
    server = await startServer(join(directory, 'workboard.sqlite'));
    const read = async (path = '/') => (await fetch(server.baseUrl + path)).text();
    await createProject(server.baseUrl, 'Alpha  One');
    await createProject(server.baseUrl, 'ALPHA Two');
    await createProject(server.baseUrl, 'Unrelated');
    await postForm(server.baseUrl, '/projects/1/tasks', { title: 'Done' });
    await postForm(server.baseUrl, '/projects/1/tasks/1/completion', { completed: '1' });
    const result = await read('/?search=%20aLpHa%20');
    assert.equal(rows(result).length, 2);
    assert.match(rows(result)[0], /Alpha  One/);
    assert.match(rows(result)[0], /1\/1 completed/);
    assert.match(result, /id="project-search"[^>]*value="aLpHa"/);
    assert.match(result, /<label for="project-search">Project search<\/label>/);
    assert.match(result, />Search projects<\/button>/);
    const filterForm = result.match(/<form class="filter"[^>]*>(.*?)<\/form>/s)[1];
    assert.match(filterForm, /name="search" value="aLpHa"/);
    assert.equal(rows(await read('/?search=alpha%20one')).length, 0);
    assert.equal(rows(await read('/?search=alpha%20%20one')).length, 1);
    assert.equal(rows(await read('/?search=%25')).length, 0);
    assert.equal(rows(await read('/?search=%20%20')).length, 3);
    assert.match(await read('/?search=%22%3E%3Cscript%3E'), /value="&quot;&gt;&lt;script&gt;"/);
    await postForm(server.baseUrl, '/projects/2/archive', {});
    assert.equal(rows(await read('/?search=alpha')).length, 1);
    const archived = rows(await read('/?filter=Archived&search=alpha'));
    assert.equal(archived.length, 1);
    assert.match(archived[0], /ALPHA Two/);
    assert.match(archived[0], /Restore project/);
    await postForm(server.baseUrl, '/projects/1/rename', { name: 'Changed' });
    assert.equal(rows(await read('/?search=alpha')).length, 0);
    assert.match(await read('/projects/1'), /<form action="\/" method="get"><button type="submit">Projects/);
    assert.match(await read(), /id="project-search"[^>]*value=""/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task search retains intersecting filters through edits, movement, errors, archive and restart', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-search-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const read = async (path = '/projects/1') => (await fetch(server.baseUrl + path)).text();
    await createProject(server.baseUrl, 'Source');
    await createProject(server.baseUrl, 'Destination');
    for (const title of ['Alpha first', 'Other', 'ALPHA second', 'Alpha undated']) {
      await postForm(server.baseUrl, '/projects/1/tasks', { title });
    }
    for (const task of [1, 2, 3]) {
      await postForm(server.baseUrl, `/projects/1/tasks/${task}/priority`, { priority: 'High' });
      await postForm(server.baseUrl, `/projects/1/tasks/${task}/completion`, { completed: '1' });
      await postForm(server.baseUrl, `/projects/1/tasks/${task}/due-date`, { dueDate: '2026-02-15' });
    }
    const filters = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2026-02-01', dueThrough: '2026-02-28', search: 'alpha' };
    const path = `/projects/1?${new URLSearchParams(filters)}`;
    const assertState = (html) => {
      assertTaskFilters(html, 'Completed', 'High');
      assert.match(html, /id="due-from"[^>]*value="2026-02-01"/);
      assert.match(html, /id="due-through"[^>]*value="2026-02-28"/);
      assert.match(html, /id="task-search"[^>]*value="alpha"/);
      for (const form of html.matchAll(/<form[^>]*action="\/projects\/1[^\"]*"[^>]*>(.*?)<\/form>/gs)) {
        assert.match(form[1], /name="search"[^>]*value="alpha"/);
      }
    };
    let html = await read(path);
    assertState(html);
    assert.deepEqual(taskTitles(html), ['Alpha first', 'ALPHA second']);
    assert.deepEqual(taskTitles(await read('/projects/1?search=ALPHA%20SECOND')), ['ALPHA second']);
    const edit = async (route, values) => {
      const response = await postForm(server.baseUrl, route, { ...filters, ...values });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), path);
      const result = await read(response.headers.get('location'));
      assertState(result);
      return taskTitles(result);
    };
    assert.deepEqual(await edit('/projects/1/tasks/1/rename', { title: 'No longer matches' }), ['ALPHA second']);
    assert.deepEqual(await edit('/projects/1/tasks/1/rename', { title: 'Alpha renamed' }), ['Alpha renamed', 'ALPHA second']);
    assert.deepEqual(await edit('/projects/1/tasks/1/due-date', { dueDate: '' }), ['ALPHA second']);
    await edit('/projects/1/tasks/1/due-date', { dueDate: '2026-02-15' });
    assert.deepEqual(await edit('/projects/1/tasks/1/priority', { priority: 'Low' }), ['ALPHA second']);
    await edit('/projects/1/tasks/1/priority', { priority: 'High' });
    assert.deepEqual(await edit('/projects/1/tasks/1/completion', {}), ['ALPHA second']);
    await edit('/projects/1/tasks/1/completion', { completed: '1' });
    await edit('/projects/1/rename', { name: 'Renamed source' });
    await edit('/projects/1/default-priority', { priority: 'Low' });
    assert.deepEqual(await edit('/projects/1/tasks', { title: 'Alpha new undated' }), ['Alpha renamed', 'ALPHA second']);
    const invalid = await postForm(server.baseUrl, '/projects/1/due-range', { ...filters, rangeFrom: 'invalid', rangeThrough: '' });
    assert.equal(invalid.status, 422);
    assert.deepEqual(taskTitles(await invalid.text()), ['Alpha renamed', 'ALPHA second']);
    assert.deepEqual(await edit('/projects/1/tasks/1/move', { destinationProject: '2' }), ['ALPHA second']);
    await postForm(server.baseUrl, '/projects/2/tasks/1/move', { destinationProject: '1' });
    assert.deepEqual(taskTitles(await read(path)), ['Alpha renamed', 'ALPHA second']);
    assert.match(rows(await read('/'))[0], /3\/5 completed/);
    const savedRows = taskRows(await read(path));
    await postForm(server.baseUrl, '/projects/1/archive', {});
    html = await read(path);
    assertState(html);
    assert.doesNotMatch(html, /id="task-search"[^>]*disabled|disabled>Search tasks/);
    assert.match(taskRows(html)[0], /disabled>Rename task/);
    assert.deepEqual(taskTitles(await read(`/projects/1?${new URLSearchParams({ ...filters, search: '' })}`)), ['Alpha renamed', 'Other', 'ALPHA second']);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await read(path), html);
    await postForm(server.baseUrl, '/projects/1/restore', {});
    assert.deepEqual(taskRows(await read(path)), savedRows);
    assert.match(await read(), /id="task-search"[^>]*value=""/);
    assert.match(await read(), /id="due-from"[^>]*value=""/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
