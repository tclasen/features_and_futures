import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('projects and tasks: validation, ownership, filters, archive, rename, and restart persistence', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data/test-'));
  // Start from the Task 002 schema to exercise the archive migration.
  const legacy = new DatabaseSync(resolve(directory, 'projects.sqlite'));
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)));`);
  legacy.close();
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: resolve(directory, 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const port = await new Promise((resolvePort, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server did not start')), 5000);
      child.once('error', (error) => { clearTimeout(timeout); reject(error); });
      child.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Server exited: ${code}`)); });
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) { clearTimeout(timeout); resolvePort(match[1]); }
      });
    });
    return `http://127.0.0.1:${port}`;
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  try {
    let base = await start();
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const initial = await (await fetch(base)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.equal((initial.match(/data-testid="project-row"/g) || []).length, 0);
    assert.match(initial, /<label for="project-filter">Project filter<\/label>/);
    assert.match(initial, /<option selected>Active<\/option><option>Archived<\/option>/);
    const create = (name) => fetch(`${base}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    for (const name of ['', ' \t\n ']) {
      const response = await create(name);
      assert.equal(response.status, 422);
      const html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    for (const name of ['  First project  ', '<Second & project>']) {
      const response = await create(name);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    const listing = await (await fetch(base)).text();
    assert.equal((listing.match(/data-testid="project-row"/g) || []).length, 2);
    assert.equal((listing.match(/data-testid="project-summary">0\/0 completed/g) || []).length, 2);
    assert.match(listing, /<h3>First project<\/h3>/);
    assert.ok(listing.indexOf('First project') < listing.indexOf('&lt;Second &amp; project&gt;'));
    const ids = [...listing.matchAll(/action="\/projects\/(\d+)"/g)].map((match) => match[1]);
    assert.equal(ids.length, 2);
    assert.notEqual(ids[0], ids[1]);
    const detail = await (await fetch(`${base}/projects/${ids[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/" method="get"/);
    assert.match(detail, />Projects<\/button>/);
    assert.equal((await fetch(`${base}/projects/999999`)).status, 404);
    assert.equal(await (await fetch(base)).text(), listing);
    const taskPage = (projectId = ids[0], filter = 'All') =>
      fetch(`${base}/projects/${projectId}?filter=${filter}`).then((response) => response.text());
    const createTask = (title, projectId = ids[0]) => fetch(`${base}/projects/${projectId}/tasks`, {
      method: 'POST', body: new URLSearchParams({ title }), redirect: 'manual',
    });
    const rows = (html) => [...html.matchAll(/<article class="task-row"[\s\S]*?<\/article>/g)].map((match) => match[0]);
    assert.match(detail, /<label for="task-title">Task title<\/label>/);
    assert.match(detail, />Create task<\/button>/);
    assert.match(detail, /<label for="task-filter">Task filter<\/label>/);
    assert.match(detail, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const response = await createTask(title);
      assert.equal(response.status, 422);
      const html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(rows(html).length, 0);
    }
    for (const title of ['  First task  ', '<Second & "task">']) {
      const response = await createTask(title);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), `/projects/${ids[0]}`);
    }
    const openTasks = await taskPage();
    const taskRows = rows(openTasks);
    assert.equal(taskRows.length, 2);
    assert.match(taskRows[0], /aria-label="Complete First task"/);
    assert.match(taskRows[0], /<span>First task<\/span>/);
    assert.match(taskRows[1], /aria-label="Complete &lt;Second &amp; &quot;task&quot;&gt;"/);
    assert.doesNotMatch(openTasks, / checked/);
    assert.equal(rows(await taskPage(ids[0], 'Open')).length, 2);
    assert.equal(rows(await taskPage(ids[0], 'Completed')).length, 0);
    assert.equal(rows(await taskPage(ids[1])).length, 0);
    const taskIds = taskRows.map((row) => row.match(/\/tasks\/(\d+)\/completion/)[1]);
    const complete = (taskId, completed, projectId = ids[0], filter = 'All') => fetch(
      `${base}/projects/${projectId}/tasks/${taskId}/completion`, {
        method: 'POST', body: new URLSearchParams({ ...(completed ? { completed: '1' } : {}), filter }), redirect: 'manual',
      });
    assert.equal((await complete(taskIds[0], true, ids[1])).status, 404);
    assert.doesNotMatch(await taskPage(), / checked/);
    const completion = await complete(taskIds[0], true, ids[0], 'Open');
    assert.equal(completion.status, 303);
    assert.equal(completion.headers.get('location'), `/projects/${ids[0]}?filter=Open`);
    assert.match(rows(await taskPage())[0], / checked/);
    assert.doesNotMatch(rows(await taskPage())[1], / checked/);
    assert.match(rows(await taskPage(ids[0], 'Completed'))[0], /<span>First task<\/span>/);
    assert.equal(rows(await taskPage(ids[0], 'Completed')).length, 1);
    assert.equal(rows(await taskPage(ids[0], 'Open')).length, 1);
    assert.match(rows(await taskPage(ids[0], 'Open'))[0], /Second/);
    assert.equal((await complete(taskIds[0], false)).status, 303);
    assert.equal(await taskPage(), openTasks);
    assert.equal((await complete(taskIds[1], true)).status, 303);
    assert.equal((await createTask('Other project task', ids[1])).status, 303);
    assert.equal(rows(await taskPage(ids[1])).length, 1);
    assert.doesNotMatch(await taskPage(), /Other project task/);
    const savedTasks = await taskPage();
    const savedOtherTasks = await taskPage(ids[1]);
    const invalid = await createTask('   ');
    assert.equal(invalid.status, 422);
    assert.equal(rows(await invalid.text()).length, 2);
    assert.equal(await taskPage(), savedTasks);
    const savedListing = await (await fetch(base)).text();
    assert.match(savedListing, /data-testid="project-summary">1\/2 completed/);
    assert.match(savedListing, /data-testid="project-summary">0\/1 completed/);
    await stop();
    base = await start();
    assert.equal(await (await fetch(base)).text(), savedListing);
    assert.match(await (await fetch(`${base}/projects/${ids[0]}`)).text(), /<h1>First project<\/h1>/);
    assert.match(await (await fetch(`${base}/projects/${ids[1]}`)).text(), /<h1>&lt;Second &amp; project&gt;<\/h1>/);
    assert.equal(await taskPage(), savedTasks);
    assert.equal(await taskPage(ids[1]), savedOtherTasks);
    assert.equal(rows(await taskPage(ids[0], 'Completed')).length, 1);
    assert.match(rows(await taskPage(ids[0], 'Completed'))[0], /Second/);
    const projectRows = (html) => [...html.matchAll(/<article class="project-row"[\s\S]*?<\/article>/g)].map((match) => match[0]);
    const projectList = (filter = 'Active') => fetch(`${base}/?filter=${filter}`).then((response) => response.text());
    const archive = (action, id = ids[0]) => fetch(`${base}/projects/${id}/${action}`, {
      method: 'POST', redirect: 'manual',
    });
    assert.equal((await archive('archive', '999999')).status, 404);
    assert.equal((await archive('archive')).status, 303);
    assert.equal(projectRows(await projectList()).length, 1);
    assert.doesNotMatch(await projectList(), /First project/);
    const archivedListing = await projectList('Archived');
    assert.equal(projectRows(archivedListing).length, 1);
    assert.match(archivedListing, />Restore project<\/button>/);
    assert.match(archivedListing, />Open project<\/button>/);
    assert.doesNotMatch(archivedListing, />Archive project<\/button>/);
    assert.match(archivedListing, /data-testid="project-summary">1\/2 completed/);
    const archivedPage = await taskPage();
    assert.match(archivedPage, /Archived project/);
    assert.match(archivedPage, /<button type="submit" disabled>Create task<\/button>/);
    assert.equal(rows(archivedPage).length, 2);
    for (const row of rows(archivedPage)) assert.match(row, /disabled/);
    assert.match(rows(archivedPage)[1], / checked/);
    assert.equal(rows(await taskPage(ids[0], 'Completed')).length, 1);
    assert.equal(rows(await taskPage(ids[0], 'Open')).length, 1);
    assert.equal((await createTask('Cannot create')).status, 403);
    assert.equal((await complete(taskIds[0], true)).status, 403);
    assert.equal((await complete(taskIds[1], false)).status, 403);
    assert.equal(await taskPage(), archivedPage);
    assert.equal(await taskPage(ids[1]), savedOtherTasks);
    await stop();
    base = await start();
    assert.equal(await projectList('Archived'), archivedListing);
    assert.equal(await taskPage(), archivedPage);
    assert.equal((await archive('restore')).status, 303);
    assert.equal(projectRows(await projectList('Archived')).length, 0);
    assert.equal(await projectList(), savedListing);
    assert.equal(await taskPage(), savedTasks);
    assert.equal((await complete(taskIds[0], true)).status, 303);
    assert.match(await projectList(), /data-testid="project-summary">2\/2 completed/);
    assert.equal((await complete(taskIds[0], false)).status, 303);
    await stop();
    base = await start();
    assert.equal(await projectList(), savedListing);
    assert.equal(await taskPage(), savedTasks);
    const rename = (name, id = ids[0], filter = 'All') => fetch(`${base}/projects/${id}/rename`, {
      method: 'POST', body: new URLSearchParams({ name, filter }), redirect: 'manual',
    });
    assert.match(savedTasks, /<label for="new-project-name">New project name<\/label>/);
    assert.match(savedTasks, /<button type="submit">Rename project<\/button>/);
    assert.equal((await rename('Missing', '999999')).status, 404);
    for (const name of ['', ' \t\n ']) {
      const response = await rename(name);
      assert.equal(response.status, 422);
      const html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.match(html, /<h1>First project<\/h1>/);
      assert.equal(await taskPage(), savedTasks);
      assert.equal(await projectList(), savedListing);
    }
    const renamed = await rename('  Renamed <project & "name">  ', ids[0], 'Completed');
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), `/projects/${ids[0]}?filter=Completed`);
    const renamedPage = await taskPage();
    const renamedListing = await projectList();
    assert.match(renamedPage, /<h1>Renamed &lt;project &amp; &quot;name&quot;&gt;<\/h1>/);
    assert.match(renamedPage, /value="Renamed &lt;project &amp; &quot;name&quot;&gt;"/);
    assert.deepEqual(rows(renamedPage), rows(savedTasks));
    assert.equal(await taskPage(ids[1]), savedOtherTasks);
    const renamedRows = projectRows(renamedListing);
    assert.match(renamedRows[0], /<h3>Renamed &lt;project &amp; &quot;name&quot;&gt;<\/h3>/);
    assert.match(renamedRows[0], new RegExp(`action="/projects/${ids[0]}"`));
    assert.match(renamedRows[0], /data-testid="project-summary">1\/2 completed/);
    assert.equal(renamedRows[1], projectRows(savedListing)[1]);
    await stop();
    base = await start();
    assert.equal(await taskPage(), renamedPage);
    assert.equal(await projectList(), renamedListing);
    assert.equal((await archive('archive')).status, 303);
    const archivedRenamedPage = await taskPage();
    assert.match(archivedRenamedPage, /id="new-project-name"[^>]* disabled/);
    assert.match(archivedRenamedPage, /<button type="submit" disabled>Rename project<\/button>/);
    assert.equal((await rename('Cannot rename')).status, 403);
    assert.equal(await taskPage(), archivedRenamedPage);
    await stop();
    base = await start();
    assert.equal(await taskPage(), archivedRenamedPage);
    assert.equal((await archive('restore')).status, 303);
    assert.equal(await taskPage(), renamedPage);
    assert.equal(await projectList(), renamedListing);
    assert.equal((await rename(' Restored project ')).status, 303);
    const restoredRenamedPage = await taskPage();
    assert.match(restoredRenamedPage, /<h1>Restored project<\/h1>/);
    assert.deepEqual(rows(restoredRenamedPage), rows(savedTasks));
    const restoredListing = await projectList();
    await stop();
    base = await start();
    assert.equal(await taskPage(), restoredRenamedPage);
    assert.equal(await projectList(), restoredListing);
    const renameTask = (title, taskId = taskIds[1], projectId = ids[0], filter = 'All') =>
      fetch(`${base}/projects/${projectId}/tasks/${taskId}/rename`, {
        method: 'POST', body: new URLSearchParams({ title, filter }), redirect: 'manual',
      });
    for (const row of rows(await taskPage())) {
      assert.match(row, /<label for="new-task-title-\d+">New task title<\/label>/);
      assert.match(row, /<button type="submit">Rename task<\/button>/);
    }
    assert.equal((await renameTask('Wrong project', taskIds[1], ids[1])).status, 404);
    assert.equal((await renameTask('Missing task', '999999')).status, 404);
    assert.equal((await renameTask('Missing project', taskIds[1], '999999')).status, 404);
    for (const title of ['', ' \t\n ']) {
      const response = await renameTask(title, taskIds[1], ids[0], 'Completed');
      assert.equal(response.status, 422);
      const html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(rows(html).length, 1);
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.equal(await taskPage(), restoredRenamedPage);
      assert.equal(await projectList(), restoredListing);
    }
    const taskRename = await renameTask('  Renamed <task & "title">  ', taskIds[1], ids[0], 'Completed');
    assert.equal(taskRename.status, 303);
    assert.equal(taskRename.headers.get('location'), `/projects/${ids[0]}?filter=Completed`);
    const taskRenamedPage = await taskPage();
    const taskRenamedRows = rows(taskRenamedPage);
    assert.equal(taskRenamedRows[0], rows(restoredRenamedPage)[0]);
    assert.match(taskRenamedRows[1], /<span>Renamed &lt;task &amp; &quot;title&quot;&gt;<\/span>/);
    assert.match(taskRenamedRows[1], /aria-label="Complete Renamed &lt;task &amp; &quot;title&quot;&gt;" checked/);
    assert.match(taskRenamedRows[1], /value="Renamed &lt;task &amp; &quot;title&quot;&gt;"/);
    assert.match(taskRenamedRows[1], new RegExp(`/tasks/${taskIds[1]}/rename`));
    assert.deepEqual(rows(await taskPage(ids[0], 'Completed')), [taskRenamedRows[1].replace('value="All"', 'value="Completed"').replace('value="All"', 'value="Completed"')]);
    assert.equal(rows(await taskPage(ids[0], 'Open')).length, 1);
    assert.equal(await taskPage(ids[1]), savedOtherTasks);
    assert.equal(await projectList(), restoredListing);
    assert.equal((await renameTask(' Renamed open task ', taskIds[0])).status, 303);
    assert.match(rows(await taskPage(ids[0], 'Open'))[0], /aria-label="Complete Renamed open task"/);
    assert.doesNotMatch(rows(await taskPage())[0], / checked/);
    const bothRenamedPage = await taskPage();
    await stop();
    base = await start();
    assert.equal(await taskPage(), bothRenamedPage);
    assert.equal(await projectList(), restoredListing);
    assert.equal((await archive('archive')).status, 303);
    const archivedTasksPage = await taskPage();
    for (const row of rows(archivedTasksPage)) {
      assert.match(row, /id="new-task-title-\d+"[^>]* disabled/);
      assert.match(row, /<button type="submit" disabled>Rename task<\/button>/);
    }
    assert.equal((await renameTask('Forbidden')).status, 403);
    assert.equal(await taskPage(), archivedTasksPage);
    await stop();
    base = await start();
    assert.equal(await taskPage(), archivedTasksPage);
    assert.equal((await archive('restore')).status, 303);
    assert.equal(await taskPage(), bothRenamedPage);
    assert.equal(await projectList(), restoredListing);
    assert.equal((await renameTask(' Restored task ')).status, 303);
    assert.match(rows(await taskPage())[1], /aria-label="Complete Restored task" checked/);
    const finalPage = await taskPage();
    await stop();
    base = await start();
    assert.equal(await taskPage(), finalPage);
    assert.equal(await projectList(), restoredListing);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
