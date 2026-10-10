import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

async function availablePort() {
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  return port;
}

test('projects and tasks validate, isolate, archive, rename, summarize, and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  // Start from the previous schema to exercise the archive migration.
  const oldDatabase = new DatabaseSync(join(directory, 'projects.sqlite'));
  oldDatabase.exec('CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
  oldDatabase.close();
  const port = await availablePort();
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'projects.sqlite') },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await fetch(`${base}/health`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'ok' });
        return;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 30));
      }
    }
    throw new Error('Server did not become healthy');
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = undefined;
  }
  const create = name => fetch(`${base}/projects`, {
    method: 'POST',
    body: new URLSearchParams({ name }),
    redirect: 'manual',
  });
  try {
    await start();
    const initial = await (await fetch(base)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);
    for (const name of ['', '   \t ']) {
      const response = await create(name);
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
    assert.match(listing, /<span>First project<\/span>/);
    assert.match(listing, /<span>&lt;Second &amp; project&gt;<\/span>/);
    assert.ok(listing.indexOf('First project') < listing.indexOf('&lt;Second'));
    const paths = [...listing.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    const detail = await (await fetch(base + paths[0])).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*>Projects<\/button>/);
    await stop();
    await start();
    assert.equal(await (await fetch(base)).text(), listing);
    assert.equal(await (await fetch(base + paths[0])).text(), detail);
    assert.equal((await fetch(`${base}/projects/99999`)).status, 404);

    const post = (path, values) => fetch(base + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const projectPath = paths[0];
    const tasksPath = `${projectPath}/tasks`;
    for (const title of ['', '  \t ']) {
      const invalid = await post(tasksPath, { title });
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.doesNotMatch(html, /data-testid="task-row"/);
    }
    for (const title of ['  First task  ', '<Second & task>']) {
      assert.equal((await post(tasksPath, { title })).status, 303);
    }
    const tasks = await (await fetch(base + projectPath)).text();
    assert.match(tasks, /<label for="task-title">Task title<\/label>/);
    assert.match(tasks, /<label for="task-filter">Task filter<\/label>/);
    assert.match(tasks, /<option selected>All<\/option>/);
    assert.match(tasks, /aria-label="Complete First task"/);
    assert.match(tasks, /aria-label="Complete &lt;Second &amp; task&gt;"/);
    assert.doesNotMatch(tasks, / checked/);
    assert.equal((tasks.match(/data-testid="task-row"/g) || []).length, 2);
    assert.ok(tasks.indexOf('<span>First task') < tasks.indexOf('<span>&lt;Second'));
    assert.doesNotMatch(await (await fetch(base + paths[1])).text(), /data-testid="task-row"/);
    const taskPath = tasks.match(/action="(\/projects\/\d+\/tasks\/\d+)"/)[1];
    const taskId = taskPath.split('/').at(-1);
    assert.equal((await post(`${paths[1]}/tasks/${taskId}`, { completed: '1' })).status, 404);
    assert.equal((await post(taskPath, { completed: '1' })).status, 303);
    const completed = await (await fetch(`${base}${projectPath}?filter=Completed`)).text();
    assert.match(completed, /<span>First task<\/span>/);
    assert.match(completed, / checked/);
    assert.doesNotMatch(completed, /<span>&lt;Second/);
    const open = await (await fetch(`${base}${projectPath}?filter=Open`)).text();
    assert.doesNotMatch(open, /<span>First task/);
    assert.match(open, /<span>&lt;Second/);
    const saved = await (await fetch(base + projectPath)).text();
    await stop();
    await start();
    assert.equal(await (await fetch(base + projectPath)).text(), saved);
    assert.equal(await (await fetch(`${base}${projectPath}?filter=Completed`)).text(), completed);
    assert.equal((await post(taskPath, {})).status, 303);
    assert.equal(await (await fetch(base + projectPath)).text(), tasks);
    await stop();
    await start();
    assert.equal(await (await fetch(base + projectPath)).text(), tasks);

    assert.match(await (await fetch(base)).text(), /data-testid="project-summary">0\/2 completed/);
    assert.equal((await post(taskPath, { completed: '1' })).status, 303);
    assert.match(await (await fetch(base)).text(), /data-testid="project-summary">1\/2 completed/);
    assert.equal((await post(`${projectPath}/archive`, {})).status, 303);
    const activeList = await (await fetch(base)).text();
    assert.match(activeList, /<option selected>Active<\/option>/);
    assert.doesNotMatch(activeList, /First project/);
    assert.match(activeList, /data-testid="project-summary">0\/0 completed/);
    const archivedList = await (await fetch(`${base}/?filter=Archived`)).text();
    assert.match(archivedList, /<option selected>Archived<\/option>/);
    assert.match(archivedList, />Restore project<\/button>/);
    assert.match(archivedList, /data-testid="project-summary">1\/2 completed/);
    assert.doesNotMatch(archivedList, />Archive project<\/button>/);
    const archivedPage = await (await fetch(base + projectPath)).text();
    assert.match(archivedPage, /<p>Archived project<\/p>/);
    assert.match(archivedPage, /<button type="submit" disabled>Create task/);
    assert.equal((archivedPage.match(/type="checkbox"[^>]* disabled/g) || []).length, 2);
    assert.match(archivedPage, / checked disabled/);
    const archivedOpen = await (await fetch(`${base}${projectPath}?filter=Open`)).text();
    assert.doesNotMatch(archivedOpen, /<span>First task/);
    assert.match(archivedOpen, /<span>&lt;Second/);
    assert.equal((await post(tasksPath, { title: 'Blocked task' })).status, 403);
    assert.equal((await post(taskPath, {})).status, 403);
    await stop();
    await start();
    assert.equal(await (await fetch(`${base}/?filter=Archived`)).text(), archivedList);
    assert.equal(await (await fetch(base + projectPath)).text(), archivedPage);
    assert.equal((await post(`${projectPath}/restore`, {})).status, 303);
    assert.doesNotMatch(await (await fetch(`${base}/?filter=Archived`)).text(), /data-testid="project-row"/);
    const restored = await (await fetch(base + projectPath)).text();
    assert.doesNotMatch(restored, /<(?:button|input)[^>]* disabled|<p>Archived project/);
    assert.match(restored, / checked/);
    assert.equal((restored.match(/data-testid="task-row"/g) || []).length, 2);
    const restoredList = await (await fetch(base)).text();
    assert.match(restoredList, /data-testid="project-summary">1\/2 completed/);
    assert.ok(restoredList.indexOf('First project') < restoredList.indexOf('&lt;Second'));
    await stop();
    await start();
    assert.equal(await (await fetch(base)).text(), restoredList);
    assert.equal(await (await fetch(base + projectPath)).text(), restored);
    assert.equal((await post(taskPath, {})).status, 303);
    assert.match(await (await fetch(base)).text(), /data-testid="project-summary">0\/2 completed/);

    assert.equal((await post(taskPath, { completed: '1' })).status, 303);
    const beforeRename = await (await fetch(base + projectPath)).text();
    assert.match(beforeRename, /<label for="new-project-name">New project name<\/label>/);
    assert.match(beforeRename, /<button type="submit">Rename project<\/button>/);
    for (const name of ['', '  \t ']) {
      const invalid = await post(`${projectPath}/rename`, { name });
      assert.equal(invalid.status, 400);
      assert.match(await invalid.text(), /role="alert">Project name is required/);
      assert.equal(await (await fetch(base + projectPath)).text(), beforeRename);
    }
    assert.equal((await post('/projects/99999/rename', { name: 'Missing' })).status, 404);
    const renamedResponse = await post(`${projectPath}/rename`, { name: '  Renamed <project> & team  ', filter: 'Completed' });
    assert.equal(renamedResponse.status, 303);
    assert.equal(renamedResponse.headers.get('location'), `${projectPath}?filter=Completed&priorityFilter=All`);
    const renamedPage = await (await fetch(base + projectPath)).text();
    assert.match(renamedPage, /<h1>Renamed &lt;project&gt; &amp; team<\/h1>/);
    assert.equal((renamedPage.match(/data-testid="task-row"/g) || []).length, 2);
    assert.match(renamedPage, /aria-label="Complete First task" checked/);
    const renamedList = await (await fetch(base)).text();
    assert.match(renamedList, /data-testid="project-summary">1\/2 completed/);
    assert.ok(renamedList.indexOf('Renamed &lt;project&gt;') < renamedList.indexOf('&lt;Second'));
    assert.match(renamedList, new RegExp(`action="${projectPath}"`));
    await stop();
    await start();
    assert.equal(await (await fetch(base)).text(), renamedList);
    assert.equal(await (await fetch(base + projectPath)).text(), renamedPage);

    assert.equal((await post(`${projectPath}/archive`, {})).status, 303);
    const archivedRenamed = await (await fetch(base + projectPath)).text();
    assert.match(archivedRenamed, /id="new-project-name"[^>]* disabled/);
    assert.match(archivedRenamed, /<button type="submit" disabled>Rename project/);
    assert.equal((await post(`${projectPath}/rename`, { name: 'Blocked rename' })).status, 403);
    assert.equal(await (await fetch(base + projectPath)).text(), archivedRenamed);
    await stop();
    await start();
    assert.equal(await (await fetch(base + projectPath)).text(), archivedRenamed);
    assert.equal((await post(`${projectPath}/restore`, {})).status, 303);
    assert.equal(await (await fetch(base + projectPath)).text(), renamedPage);
    assert.equal((await post(`${projectPath}/rename`, { name: 'Restored name' })).status, 303);
    const finalPage = await (await fetch(base + projectPath)).text();
    assert.match(finalPage, /<h1>Restored name<\/h1>/);
    assert.match(finalPage, /aria-label="Complete First task" checked/);
    await stop();
    await start();
    assert.equal(await (await fetch(base + projectPath)).text(), finalPage);
    assert.match(await (await fetch(base)).text(), /data-testid="project-summary">1\/2 completed/);

    // Task renames preserve identity, ownership, order, completion and filter membership.
    const renamePath = `${taskPath}/rename`;
    assert.match(finalPage, /<label for="new-task-title-\d+">New task title<\/label>/);
    assert.equal((finalPage.match(/>Rename task<\/button>/g) || []).length, 2);
    for (const title of ['', '  \t ']) {
      const invalid = await post(renamePath, { title, filter: 'Completed' });
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.equal(await (await fetch(base + projectPath)).text(), finalPage);
    }
    assert.equal((await post(`${paths[1]}/tasks/${taskId}/rename`, { title: 'Wrong owner' })).status, 404);
    assert.equal((await post(`${tasksPath}/99999/rename`, { title: 'Missing' })).status, 404);
    const taskRename = await post(renamePath, { title: '  Renamed <task> & title  ', filter: 'Completed' });
    assert.equal(taskRename.status, 303);
    assert.equal(taskRename.headers.get('location'), `${projectPath}?filter=Completed&priorityFilter=All`);
    const renamedTasks = await (await fetch(base + projectPath)).text();
    assert.match(renamedTasks, /<span>Renamed &lt;task&gt; &amp; title<\/span>/);
    assert.match(renamedTasks, /aria-label="Complete Renamed &lt;task&gt; &amp; title" checked/);
    assert.doesNotMatch(renamedTasks, /Complete First task/);
    assert.ok(renamedTasks.indexOf('<span>Renamed') < renamedTasks.indexOf('<span>&lt;Second'));
    assert.match(renamedTasks, new RegExp(`action="${taskPath}"`));
    assert.doesNotMatch(await (await fetch(base + paths[1])).text(), /Renamed &lt;task&gt;/);
    const renamedCompleted = await (await fetch(`${base}${projectPath}?filter=Completed`)).text();
    assert.match(renamedCompleted, /<span>Renamed &lt;task&gt; &amp; title<\/span>/);
    assert.doesNotMatch(await (await fetch(`${base}${projectPath}?filter=Open`)).text(), /Renamed &lt;task&gt;/);
    assert.match(await (await fetch(base)).text(), /data-testid="project-summary">1\/2 completed/);
    await stop();
    await start();
    assert.equal(await (await fetch(base + projectPath)).text(), renamedTasks);
    assert.equal(await (await fetch(`${base}${projectPath}?filter=Completed`)).text(), renamedCompleted);
    assert.equal((await post(`${projectPath}/archive`, {})).status, 303);
    const archivedTasks = await (await fetch(base + projectPath)).text();
    assert.equal((archivedTasks.match(/id="new-task-title-\d+"[^>]* disabled/g) || []).length, 2);
    assert.equal((archivedTasks.match(/<button type="submit" disabled>Rename task/g) || []).length, 2);
    assert.equal((await post(renamePath, { title: 'Blocked title' })).status, 403);
    assert.equal(await (await fetch(base + projectPath)).text(), archivedTasks);
    await stop();
    await start();
    assert.equal(await (await fetch(base + projectPath)).text(), archivedTasks);
    assert.equal((await post(`${projectPath}/restore`, {})).status, 303);
    assert.equal(await (await fetch(base + projectPath)).text(), renamedTasks);
    assert.equal((await post(renamePath, { title: 'Restored task' })).status, 303);
    assert.equal((await post(taskPath, {})).status, 303);
    const restoredTask = await (await fetch(base + projectPath)).text();
    assert.match(restoredTask, /aria-label="Complete Restored task"/);
    assert.doesNotMatch(restoredTask, / checked/);
    await stop();
    await start();
    assert.equal(await (await fetch(base + projectPath)).text(), restoredTask);
    assert.match(await (await fetch(base)).text(), /data-testid="project-summary">0\/2 completed/);

    // Priorities are independent, validated, read-only when archived, and persistent.
    const priorityPath = `${taskPath}/priority`;
    const rows = html => html.split('data-testid="task-row"').slice(1);
    const normalOptions = /<option>Low<\/option><option selected>Normal<\/option><option>High<\/option>/;
    assert.equal(rows(restoredTask).length, 2);
    for (const row of rows(restoredTask)) assert.match(row, normalOptions);
    assert.equal((await post(`${paths[1]}/tasks/${taskId}/priority`, { priority: 'High' })).status, 404);
    assert.equal((await post(`${tasksPath}/99999/priority`, { priority: 'High' })).status, 404);
    assert.equal((await post(priorityPath, { priority: 'Urgent' })).status, 400);
    assert.equal(await (await fetch(base + projectPath)).text(), restoredTask);
    assert.equal((await post(taskPath, { completed: '1' })).status, 303);
    const priorityChange = await post(priorityPath, { priority: 'High', filter: 'Completed' });
    assert.equal(priorityChange.status, 303);
    assert.equal(priorityChange.headers.get('location'), `${projectPath}?filter=Completed&priorityFilter=All`);
    const highPage = await (await fetch(base + projectPath)).text();
    assert.match(rows(highPage)[0], /<option>Low<\/option><option>Normal<\/option><option selected>High<\/option>/);
    assert.match(rows(highPage)[0], /aria-label="Complete Restored task" checked/);
    assert.match(rows(highPage)[1], normalOptions);
    assert.match(await (await fetch(base)).text(), /data-testid="project-summary">1\/2 completed/);
    assert.doesNotMatch(await (await fetch(`${base}${projectPath}?filter=Open`)).text(), /Complete Restored task/);
    await stop();
    await start();
    assert.equal(await (await fetch(base + projectPath)).text(), highPage);
    assert.equal((await post(renamePath, { title: 'Priority preserved' })).status, 303);
    const priorityRenamed = await (await fetch(base + projectPath)).text();
    assert.match(rows(priorityRenamed)[0], /<option selected>High<\/option>/);
    assert.match(rows(priorityRenamed)[0], /aria-label="Complete Priority preserved" checked/);
    assert.equal((await post(`${projectPath}/archive`, {})).status, 303);
    const priorityArchived = await (await fetch(base + projectPath)).text();
    assert.equal((priorityArchived.match(/id="task-priority-\d+"[^>]* disabled/g) || []).length, 2);
    assert.equal((await post(priorityPath, { priority: 'Low' })).status, 403);
    await stop();
    await start();
    assert.equal(await (await fetch(base + projectPath)).text(), priorityArchived);
    assert.equal((await post(`${projectPath}/restore`, {})).status, 303);
    assert.equal(await (await fetch(base + projectPath)).text(), priorityRenamed);
    assert.equal((await post(priorityPath, { priority: 'Low' })).status, 303);
    const lowPage = await (await fetch(base + projectPath)).text();
    assert.match(rows(lowPage)[0], /<option selected>Low<\/option>/);
    assert.match(rows(lowPage)[1], normalOptions);
    await stop();
    await start();
    assert.equal(await (await fetch(base + projectPath)).text(), lowPage);

    // Combined filters retain selections through edits, errors and archived viewing.
    const filtered = (filter, priorityFilter) => fetch(`${base}${projectPath}?${new URLSearchParams({ filter, priorityFilter })}`).then(response => response.text());
    for (const filter of ['All', 'Open', 'Completed']) {
      for (const priorityFilter of ['All', 'Low', 'Normal', 'High']) {
        const html = await filtered(filter, priorityFilter);
        const firstMatches = filter !== 'Open' && ['All', 'Low'].includes(priorityFilter);
        const secondMatches = filter !== 'Completed' && ['All', 'Normal'].includes(priorityFilter);
        assert.equal(rows(html).length, Number(firstMatches) + Number(secondMatches));
        assert.equal(html.includes('Complete Priority preserved'), firstMatches);
        assert.match(html, new RegExp(`<option selected>${filter}</option>`));
        assert.match(html, new RegExp(`<option selected>${priorityFilter}</option>`));
      }
    }
    assert.match(lowPage, /id="priority-filter"[\s\S]*?<option selected>All<\/option><option>Low<\/option><option>Normal<\/option><option>High<\/option>/);
    const selections = { filter: 'Completed', priorityFilter: 'Low' };
    const renamedFiltered = await post(renamePath, { ...selections, title: '  Filtered rename  ' });
    assert.equal(renamedFiltered.headers.get('location'), `${projectPath}?filter=Completed&priorityFilter=Low`);
    assert.match(await filtered('Completed', 'Low'), /Complete Filtered rename" checked/);
    const invalidFiltered = await post(renamePath, { ...selections, title: '  ' });
    const invalidHtml = await invalidFiltered.text();
    assert.match(invalidHtml, /Task title is required/);
    assert.match(invalidHtml, /<option selected>Completed/);
    assert.match(invalidHtml, /<option selected>Low/);
    const moved = await post(priorityPath, { ...selections, priority: 'High' });
    assert.equal(rows(await (await fetch(base + moved.headers.get('location'))).text()).length, 0);
    assert.equal(rows(await filtered('Completed', 'High')).length, 1);
    const completedChange = await post(taskPath, { filter: 'Completed', priorityFilter: 'High' });
    assert.equal(rows(await (await fetch(base + completedChange.headers.get('location'))).text()).length, 0);
    assert.equal(rows(await filtered('Open', 'High')).length, 1);
    assert.match(await (await fetch(base)).text(), /data-testid="project-summary">0\/2 completed/);
    await post(`${projectPath}/archive`, {});
    const archivedFiltered = await filtered('Open', 'High');
    assert.equal(rows(archivedFiltered).length, 1);
    assert.match(archivedFiltered, /id="task-priority-\d+"[^>]* disabled/);
    assert.doesNotMatch(archivedFiltered, /id="(?:task-filter|priority-filter)"[^>]* disabled/);
    await stop();
    await start();
    assert.equal(await filtered('Open', 'High'), archivedFiltered);
    await post(`${projectPath}/restore`, {});
    assert.equal(rows(await filtered('Open', 'High')).length, 1);
    // Restore the prior values for the legacy migration checks below.
    await post(renamePath, { title: 'Priority preserved' });
    await post(taskPath, { completed: '1' });

    // Simulate a pre-priority database containing existing tasks.
    await stop();
    const legacyDatabase = new DatabaseSync(join(directory, 'projects.sqlite'));
    legacyDatabase.exec('ALTER TABLE tasks DROP COLUMN priority');
    legacyDatabase.close();
    await start();
    const migrated = await (await fetch(base + projectPath)).text();
    for (const row of rows(migrated)) assert.match(row, normalOptions);
    assert.match(migrated, /aria-label="Complete Priority preserved" checked/);
    assert.match(await (await fetch(base)).text(), /data-testid="project-summary">1\/2 completed/);

    // Project defaults affect only subsequent tasks and preserve both filters.
    const defaultOptions = /id="default-task-priority"[^>]*>\s*<option>Low<\/option><option selected>Normal<\/option><option>High<\/option>/;
    assert.match(migrated, defaultOptions);
    const defaultPath = `${projectPath}/default-priority`;
    const beforeDefault = await filtered('Completed', 'Normal');
    const summaryBefore = await (await fetch(base)).text();
    const changedDefault = await post(defaultPath, {
      priority: 'High', filter: 'Completed', priorityFilter: 'Normal',
    });
    assert.equal(changedDefault.status, 303);
    assert.equal(changedDefault.headers.get('location'), `${projectPath}?filter=Completed&priorityFilter=Normal`);
    const afterDefault = await (await fetch(base + changedDefault.headers.get('location'))).text();
    assert.deepEqual(rows(afterDefault), rows(beforeDefault));
    assert.match(afterDefault, /<option selected>Completed/);
    assert.match(afterDefault, /id="priority-filter"[^>]*>\s*<option>All<\/option><option>Low<\/option><option selected>Normal/);
    assert.equal(await (await fetch(base)).text(), summaryBefore);
    assert.match(await (await fetch(base + paths[1])).text(), defaultOptions);
    assert.equal((await post(defaultPath, { priority: 'Urgent' })).status, 400);
    await stop();
    await start();
    assert.equal(await filtered('Completed', 'Normal'), afterDefault);
    await post(tasksPath, { title: 'Inherited high' });
    let defaultRows = rows(await (await fetch(base + projectPath)).text());
    assert.match(defaultRows[2], /<span>Inherited high<\/span>/);
    assert.match(defaultRows[2], /<option selected>High/);
    assert.doesNotMatch(defaultRows[2], / checked/);
    await post(defaultPath, { priority: 'Low' });
    await post(tasksPath, { title: 'Inherited low' });
    defaultRows = rows(await (await fetch(base + projectPath)).text());
    assert.match(defaultRows[2], /<option selected>High/);
    assert.match(defaultRows[3], /<option selected>Low/);
    for (const row of defaultRows.slice(0, 2)) assert.match(row, normalOptions);
    await post(`${paths[1]}/tasks`, { title: 'Independent normal' });
    assert.match(rows(await (await fetch(base + paths[1])).text())[0], normalOptions);
    await post(`${projectPath}/rename`, { name: 'Default preserved' });
    await post(`${projectPath}/archive`, {});
    const defaultArchived = await filtered('All', 'Low');
    assert.match(defaultArchived, /id="default-task-priority"[^>]* disabled[^>]*>\s*<option selected>Low/);
    assert.equal(rows(defaultArchived).length, 1);
    assert.equal((await post(defaultPath, { priority: 'High' })).status, 403);
    await stop();
    await start();
    assert.equal(await filtered('All', 'Low'), defaultArchived);
    await post(`${projectPath}/restore`, {});
    const defaultRestored = await (await fetch(base + projectPath)).text();
    assert.match(defaultRestored, /id="default-task-priority" name="priority" onchange=[^>]*>\s*<option selected>Low/);
    assert.deepEqual(rows(defaultRestored), defaultRows);
    await post(tasksPath, { title: 'Restored low' });
    assert.match(rows(await (await fetch(base + projectPath)).text())[4], /<option selected>Low/);

    // An existing database without project defaults gains Normal without changing tasks.
    await stop();
    const previousDatabase = new DatabaseSync(join(directory, 'projects.sqlite'));
    previousDatabase.exec('ALTER TABLE projects DROP COLUMN default_priority');
    previousDatabase.close();
    await start();
    const defaultMigrated = await (await fetch(base + projectPath)).text();
    assert.match(defaultMigrated, defaultOptions);
    assert.match(rows(defaultMigrated)[2], /<option selected>High/);
    assert.match(rows(defaultMigrated)[3], /<option selected>Low/);
    assert.match(rows(defaultMigrated)[0], /aria-label="Complete Priority preserved" checked/);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
