import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let diagnostics = '';
  child.stderr.on('data', (chunk) => { diagnostics += chunk; });
  const baseUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${diagnostics}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited (${code}): ${diagnostics}`));
    });
    child.stdout.on('data', (chunk) => {
      const match = /listening on port (\d+)/.exec(String(chunk));
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

test('task renaming preserves ownership, order, completion, filters, and persisted state through archive and restore', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.workboard-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let running;
  try {
    running = await start(databasePath);
    const get = async (path) => (await fetch(`${running.baseUrl}${path}`)).text();
    const post = (path, values = {}) => fetch(`${running.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    await post('/projects/1/tasks/1/completion', { completed: '1' });
    const originalPage = await get('/projects/1');
    const otherPage = await get('/projects/2');
    const originalList = await get('/');
    assert.match(originalPage, /<label for="new-task-title-1">New task title<\/label>/);
    assert.match(originalPage, /<input id="new-task-title-1" name="title" type="text">/);
    assert.equal((originalPage.match(/>Rename task<\/button>/g) ?? []).length, 2);
    for (const values of [{}, { title: '' }, { title: ' \t\n ', filter: 'Completed' }]) {
      const response = await post('/projects/1/tasks/1/rename', values);
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert"[^>]*>Task title is required/);
      assert.match(html, /<span>Done<\/span>/);
      assert.match(html, /aria-label="Complete Done" checked/);
      if (values.filter) {
        assert.match(html, /<option selected>Completed<\/option>/);
        assert.doesNotMatch(html, /<span>Pending<\/span>/);
      }
      assert.equal(await get('/projects/1'), originalPage);
    }
    for (const path of ['/projects/2/tasks/1/rename', '/projects/1/tasks/3/rename',
      '/projects/1/tasks/999/rename', '/projects/999/tasks/1/rename']) {
      assert.equal((await post(path, { title: 'Blocked' })).status, 404);
    }
    assert.equal(await get('/projects/1'), originalPage);
    assert.equal(await get('/projects/2'), otherPage);
    const renamed = await post('/projects/1/tasks/1/rename', {
      title: '  Finished <task> "one"  ', filter: 'Completed',
    });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const openRename = await post('/projects/1/tasks/2/rename', { title: '  Still open  ', filter: 'Open' });
    assert.equal(openRename.status, 303);
    assert.equal(openRename.headers.get('location'), '/projects/1?filter=Open');
    const renamedPage = await get('/projects/1');
    assert.match(renamedPage, /<span>Finished &lt;task&gt; &quot;one&quot;<\/span>/);
    assert.match(renamedPage, /aria-label="Complete Finished &lt;task&gt; &quot;one&quot;" checked/);
    assert.match(renamedPage, /aria-label="Complete Still open" onchange/);
    assert.doesNotMatch(renamedPage, /Complete Done|Complete Pending/);
    assert.ok(renamedPage.indexOf('<span>Finished') < renamedPage.indexOf('<span>Still open'));
    assert.match(renamedPage, /action="\/projects\/1\/tasks\/1\/rename"/);
    assert.equal(await get('/'), originalList);
    assert.equal(await get('/projects/2'), otherPage);
    const completedPage = await get('/projects/1?filter=Completed');
    const openPage = await get('/projects/1?filter=Open');
    assert.match(completedPage, /<span>Finished/);
    assert.doesNotMatch(completedPage, /<span>Still open/);
    assert.match(openPage, /<span>Still open/);
    assert.doesNotMatch(openPage, /<span>Finished/);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get('/projects/1'), renamedPage);
    assert.equal(await get('/projects/1?filter=Completed'), completedPage);
    assert.equal(await get('/projects/1?filter=Open'), openPage);
    assert.equal(await get('/'), originalList);
    await post('/projects/1/archive');
    const archivedPage = await get('/projects/1');
    assert.equal((archivedPage.match(/id="new-task-title-\d+" name="title" type="text" disabled/g) ?? []).length, 2);
    assert.equal((archivedPage.match(/<button type="submit" disabled>Rename task<\/button>/g) ?? []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Blocked' })).status, 409);
    assert.equal(await get('/projects/1'), archivedPage);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get('/projects/1'), archivedPage);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), renamedPage);
    assert.equal(await get('/'), originalList);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: '  Restored title  ' })).status, 303);
    const restoredPage = await get('/projects/1');
    assert.match(restoredPage, /aria-label="Complete Restored title" checked/);
    assert.ok(restoredPage.indexOf('<span>Restored title') < restoredPage.indexOf('<span>Still open'));
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get('/projects/1'), restoredPage);
    assert.equal(await get('/'), originalList);
    assert.equal(await get('/projects/2'), otherPage);
  } finally {
    if (running) await running.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('renaming preserves project identity, order, tasks, and persisted state; archived projects reject renaming', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.workboard-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let running;
  try {
    running = await start(databasePath);
    const get = async (path) => (await fetch(`${running.baseUrl}${path}`)).text();
    const post = (path, values = {}) => fetch(`${running.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1/completion', { completed: '1' });
    const originalPage = await get('/projects/1');
    assert.match(originalPage, /<label for="new-project-name">New project name<\/label>/);
    assert.match(originalPage, /<input id="new-project-name" name="name" type="text">/);
    assert.match(originalPage, /<button type="submit">Rename project<\/button>/);
    for (const values of [{}, { name: '' }, { name: ' \t\n ' }]) {
      const response = await post('/projects/1/rename', values);
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert"[^>]*>Project name is required/);
      assert.match(html, /<h1>Original<\/h1>/);
      assert.equal(await get('/projects/1'), originalPage);
    }
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
    const renamed = await post('/projects/1/rename', { name: '  Renamed <project> "one"  ', filter: 'Completed' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const renamedPage = await get('/projects/1');
    assert.match(renamedPage, /<h1>Renamed &lt;project&gt; &quot;one&quot;<\/h1>/);
    assert.match(renamedPage, /aria-label="Complete Done" checked/);
    assert.match(renamedPage, /aria-label="Complete Pending" onchange/);
    assert.equal((renamedPage.match(/data-testid="task-row"/g) ?? []).length, 2);
    const renamedList = await get('/');
    assert.match(renamedList, /<span>Renamed &lt;project&gt; &quot;one&quot;<\/span>/);
    assert.match(renamedList, /data-testid="project-summary">1\/2 completed/);
    assert.ok(renamedList.indexOf('<span>Renamed') < renamedList.indexOf('<span>Second'));
    assert.match(renamedList, /action="\/projects\/1"/);
    assert.match(await get('/projects/2'), /<h1>Second<\/h1>/);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get('/projects/1'), renamedPage);
    assert.equal(await get('/'), renamedList);
    await post('/projects/1/archive');
    const archivedPage = await get('/projects/1');
    assert.match(archivedPage, /<input id="new-project-name" name="name" type="text" disabled>/);
    assert.match(archivedPage, /<button type="submit" disabled>Rename project<\/button>/);
    const blocked = await post('/projects/1/rename', { name: 'Blocked' });
    assert.equal(blocked.status, 409);
    assert.match(await blocked.text(), /Archived project is read-only/);
    assert.equal(await get('/projects/1'), archivedPage);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get('/projects/1'), archivedPage);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), renamedPage);
    const restoredRename = await post('/projects/1/rename', { name: '  Restored name  ' });
    assert.equal(restoredRename.status, 303);
    assert.equal(restoredRename.headers.get('location'), '/projects/1');
    const restoredPage = await get('/projects/1');
    assert.match(restoredPage, /<h1>Restored name<\/h1>/);
    assert.match(restoredPage, /aria-label="Complete Done" checked/);
    const restoredList = await get('/');
    assert.match(restoredList, /data-testid="project-summary">1\/2 completed/);
    assert.ok(restoredList.indexOf('<span>Restored name') < restoredList.indexOf('<span>Second'));
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get('/projects/1'), restoredPage);
    assert.equal(await get('/'), restoredList);
  } finally {
    if (running) await running.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project validation, order, navigation, escaping, and process restart persistence', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let running;
  try {
    running = await start(databasePath);
    const get = (path) => fetch(`${running.baseUrl}${path}`);
    const create = (name) => fetch(`${running.baseUrl}/projects`, {
      method: 'POST',
      body: new URLSearchParams({ name }),
      redirect: 'manual',
    });
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    let html = await (await get('/')).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, />Create project<\/button>/);
    assert.doesNotMatch(html, /data-testid="project-row"/);
    for (const name of ['', '  \t\n ']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      html = await invalid.text();
      assert.match(html, /role="alert"[^>]*>Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    for (const name of ['  First project  ', '<script>alert("hi")</script>']) {
      const created = await create(name);
      assert.equal(created.status, 303);
      assert.equal(created.headers.get('location'), '/');
    }
    const beforeRestart = await (await get('/')).text();
    assert.equal((beforeRestart.match(/data-testid="project-row"/g) ?? []).length, 2);
    assert.match(beforeRestart, /<span>First project<\/span>/);
    assert.match(beforeRestart, /&lt;script&gt;alert\(&quot;hi&quot;\)&lt;\/script&gt;/);
    assert.ok(beforeRestart.indexOf('First project') < beforeRestart.indexOf('&lt;script&gt;'));
    const paths = [...beforeRestart.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
    assert.equal(paths.length, 2);
    assert.notEqual(paths[0], paths[1]);
    html = await (await get(paths[0])).text();
    assert.match(html, /<h1>First project<\/h1>/);
    assert.match(html, /action="\/"[^>]*><button type="submit">Projects<\/button>/);
    assert.equal((await get('/projects/999999')).status, 404);
    const invalid = await create('   ');
    assert.equal(( (await invalid.text()).match(/data-testid="project-row"/g) ?? []).length, 2);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await (await get('/')).text(), beforeRestart);
    assert.match(await (await get(paths[0])).text(), /<h1>First project<\/h1>/);
  } finally {
    if (running) await running.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('legacy projects migrate; archive, summaries, read-only tasks, and restoration persist', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.workboard-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    INSERT INTO projects (name) VALUES ('Legacy');
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
    );
    INSERT INTO tasks (project_id, title, completed) VALUES
      (1, 'Done', 1), (1, 'Pending', 0);`);
  legacy.close();
  let running;
  try {
    running = await start(databasePath);
    const get = async (path) => (await fetch(`${running.baseUrl}${path}`)).text();
    const post = (path, values = {}) => fetch(`${running.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const rows = (html, kind) => (html.match(new RegExp(`data-testid="${kind}-row"`, 'g')) ?? []).length;
    let html = await get('/');
    assert.match(html, /<label for="project-filter">Project filter<\/label>/);
    assert.match(html, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(html, /data-testid="project-summary">1\/2 completed/);
    assert.match(html, />Archive project<\/button>/);
    assert.doesNotMatch(html, />Restore project<\/button>/);
    await post('/projects', { name: 'New project' });
    html = await get('/');
    assert.equal(rows(html, 'project'), 2);
    assert.match(html, /data-testid="project-summary">0\/0 completed/);
    assert.equal(rows(await get('/?filter=Archived'), 'project'), 0);
    assert.equal((await post('/projects/999/archive')).status, 404);
    const archivedResponse = await post('/projects/1/archive');
    assert.equal(archivedResponse.status, 303);
    assert.equal(archivedResponse.headers.get('location'), '/');
    assert.equal(rows(await get('/'), 'project'), 1);
    assert.doesNotMatch(await get('/'), /<span>Legacy<\/span>/);
    const archivedList = await get('/?filter=Archived');
    assert.equal(rows(archivedList, 'project'), 1);
    assert.match(archivedList, /<span>Legacy<\/span>/);
    assert.match(archivedList, /data-testid="project-summary">1\/2 completed/);
    assert.match(archivedList, />Open project<\/button>/);
    assert.match(archivedList, />Restore project<\/button>/);
    assert.doesNotMatch(archivedList, />Archive project<\/button>/);
    const archivedPage = await get('/projects/1');
    assert.match(archivedPage, /<p>Archived project<\/p>/);
    assert.match(archivedPage, /<button type="submit" disabled>Create task<\/button>/);
    assert.equal(rows(archivedPage, 'task'), 2);
    const checkboxes = [...archivedPage.matchAll(/<input type="checkbox"[^>]*>/g)].map((match) => match[0]);
    assert.equal(checkboxes.length, 2);
    assert.ok(checkboxes.every((checkbox) => checkbox.includes(' disabled')));
    assert.match(checkboxes[0], / checked/);
    assert.doesNotMatch(checkboxes[1], / checked/);
    assert.equal(rows(await get('/projects/1?filter=Open'), 'task'), 1);
    assert.equal(rows(await get('/projects/1?filter=Completed'), 'task'), 1);
    // Disabled controls also have server-side protection against direct writes.
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked' })).status, 409);
    assert.equal((await post('/projects/1/tasks/1/completion')).status, 409);
    assert.equal((await post('/projects/1/tasks/2/completion', { completed: '1' })).status, 409);
    assert.equal(await get('/projects/1'), archivedPage);
    assert.equal(await get('/?filter=Archived'), archivedList);
    const invalid = await post('/projects', { name: ' ', filter: 'Archived' });
    assert.equal(invalid.status, 400);
    html = await invalid.text();
    assert.match(html, /Project name is required/);
    assert.match(html, /<option selected>Archived<\/option>/);
    assert.equal(rows(html, 'project'), 1);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get('/?filter=Archived'), archivedList);
    assert.equal(await get('/projects/1'), archivedPage);
    const restore = await post('/projects/1/restore');
    assert.equal(restore.status, 303);
    assert.equal(rows(await get('/?filter=Archived'), 'project'), 0);
    html = await get('/');
    assert.equal(rows(html, 'project'), 2);
    assert.ok(html.indexOf('<span>Legacy') < html.indexOf('<span>New project'));
    assert.match(html, /data-testid="project-summary">1\/2 completed/);
    html = await get('/projects/1');
    assert.doesNotMatch(html, /Archived project| disabled/);
    assert.match(html, /aria-label="Complete Done" checked/);
    await post('/projects/1/tasks/2/completion', { completed: '1', filter: 'Open' });
    assert.equal(rows(await get('/projects/1?filter=Open'), 'task'), 0);
    assert.match(await get('/'), /data-testid="project-summary">2\/2 completed/);
    await post('/projects/1/tasks', { title: 'After restore' });
    await post('/projects/1/tasks/1/completion');
    const restoredList = await get('/');
    const restoredPage = await get('/projects/1');
    assert.match(restoredList, /data-testid="project-summary">1\/3 completed/);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get('/'), restoredList);
    assert.equal(await get('/projects/1'), restoredPage);
    assert.equal(rows(await get('/?filter=Archived'), 'project'), 0);
  } finally {
    if (running) await running.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks are validated, scoped, filtered, saved, and restored after process restart', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.workboard-test-'));
  let running;
  try {
    const databasePath = join(directory, 'workboard.sqlite');
    running = await start(databasePath);
    const get = async (path) => (await fetch(`${running.baseUrl}${path}`)).text();
    const post = (path, values) => fetch(`${running.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    let html = await get('/projects/1');
    assert.match(html, /<label for="task-title">Task title<\/label>/);
    assert.match(html, />Create task<\/button>/);
    assert.match(html, /<label for="task-filter">Task filter<\/label>/);
    assert.match(html, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    const rows = (value) => [...value.matchAll(/data-testid="task-row"/g)].length;
    assert.equal(rows(html), 0);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      assert.match(await response.text(), /role="alert"[^>]*>Task title is required/);
    }
    for (const title of ['  First task  ', 'Second <task> "quoted"']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/projects/1');
    }
    html = await get('/projects/1');
    assert.equal(rows(html), 2);
    assert.match(html, /<span>First task<\/span>/);
    assert.match(html, /aria-label="Complete First task"/);
    assert.match(html, /aria-label="Complete Second &lt;task&gt; &quot;quoted&quot;"/);
    assert.doesNotMatch(html, / checked/);
    assert.ok(html.indexOf('<span>First task') < html.indexOf('<span>Second'));
    assert.equal(rows(await get('/projects/2')), 0);
    // Ownership also applies to writes, not only rendering.
    assert.equal((await post('/projects/2/tasks/1/completion', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Orphan' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/completion', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1/completion', { completed: '1' })).status, 303);
    html = await get('/projects/1');
    assert.match(html, /aria-label="Complete First task" checked/);
    assert.equal(rows(html), 2);
    const open = await get('/projects/1?filter=Open');
    assert.equal(rows(open), 1);
    assert.doesNotMatch(open, /<span>First task/);
    assert.match(open, /<option selected>Open<\/option>/);
    const completed = await get('/projects/1?filter=Completed');
    assert.equal(rows(completed), 1);
    assert.match(completed, /<span>First task/);
    assert.doesNotMatch(completed, /<span>Second/);
    assert.equal(rows(await get('/projects/1?filter=unknown')), 2);
    const invalid = await post('/projects/1/tasks', { title: '  ', filter: 'Completed' });
    assert.equal(invalid.status, 400);
    assert.equal(rows(await invalid.text()), 1);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get('/projects/1'), html);
    assert.equal(await get('/projects/1?filter=Open'), open);
    assert.equal(await get('/projects/1?filter=Completed'), completed);
    assert.equal(rows(await get('/projects/2')), 0);
    const uncheck = await post('/projects/1/tasks/1/completion', { filter: 'Completed' });
    assert.equal(uncheck.status, 303);
    assert.equal(uncheck.headers.get('location'), '/projects/1?filter=Completed');
    assert.equal(rows(await get('/projects/1?filter=Completed')), 0);
    assert.equal(rows(await get('/projects/1?filter=Open')), 2);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.doesNotMatch(await get('/projects/1'), / checked/);
    assert.equal(rows(await get('/projects/1?filter=Open')), 2);
  } finally {
    if (running) await running.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
