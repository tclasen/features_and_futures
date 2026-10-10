import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('projects and tasks support validation, filters, archiving, renaming, priorities, defaults, dates, moves, summaries, and restart persistence', async (t) => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(join(process.cwd(), 'data', 'test-'));
  // Exercise upgrading the original projects schema without resetting its IDs or names.
  const previousDatabase = new DatabaseSync(join(directory, 'projects.sqlite'));
  previousDatabase.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    INSERT INTO projects (name) VALUES ('Existing project');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)));
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing task', 1)`);
  previousDatabase.close();
  let child;
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  t.after(async () => {
    await stop();
    await rm(directory, { recursive: true, force: true });
  });
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const port = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server did not start')), 5000);
      child.once('error', (error) => { clearTimeout(timeout); reject(error); });
      child.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Server exited: ${code}`)); });
      child.stdout.on('data', (chunk) => {
        const match = /listening on port (\d+)/.exec(chunk.toString());
        if (match) { clearTimeout(timeout); resolve(match[1]); }
      });
    });
    return `http://127.0.0.1:${port}`;
  }
  let base = await start();
  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });
  const initial = await (await fetch(base)).text();
  assert.match(initial, /<h1>Workboard<\/h1>/);
  assert.match(initial, /<label for="project-name">Project name<\/label>/);
  assert.match(initial, />Create project<\/button>/);
  assert.match(initial, /Existing project/);
  assert.match(initial, /action="\/projects\/1"/);
  assert.match(initial, /data-testid="project-summary">1\/1 completed/);
  const migratedPage = await (await fetch(`${base}/projects/1`)).text();
  assert.match(migratedPage, /<label for="default-task-priority">Default task priority<\/label>/);
  assert.match(migratedPage, /<option value="Low">Low<\/option><option value="Normal" selected>Normal<\/option><option value="High">High<\/option>/);
  assert.match(migratedPage, /aria-label="Complete Existing task" checked/);
  assert.match(migratedPage, /<label for="task-due-date-1">Task due date<\/label>/);
  assert.match(migratedPage, /id="task-due-date-1" name="dueDate" type="text" value=""/);
  assert.match(migratedPage, /<option>Low<\/option><option selected>Normal<\/option><option>High<\/option>/);
  assert.match(initial, /<label for="project-filter">Project filter<\/label>/);
  assert.match(initial, /<option selected>Active<\/option><option>Archived<\/option>/);
  // Remove only the seeded migration fixture so the creation assertions remain independent.
  const fixtureDatabase = new DatabaseSync(join(directory, 'projects.sqlite'));
  fixtureDatabase.exec('DELETE FROM tasks WHERE project_id = 1; DELETE FROM projects WHERE id = 1');
  fixtureDatabase.close();

  async function create(name) {
    return fetch(`${base}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
  }
  for (const name of ['', ' \t\n ']) {
    const response = await create(name);
    assert.equal(response.status, 400);
    const html = await response.text();
    assert.match(html, /role="alert">Project name is required/);
    assert.doesNotMatch(html, /data-testid="project-row"/);
  }
  assert.equal((await create('  First project  ')).status, 303);
  assert.equal((await create('Second <project> & "team"')).status, 303);
  const list = await (await fetch(base)).text();
  assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
  assert.match(list, />First project<\/span>/);
  assert.ok(list.indexOf('First project') < list.indexOf('Second &lt;project&gt;'));
  assert.match(list, /Second &lt;project&gt; &amp; &quot;team&quot;/);
  const paths = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
  assert.equal(paths.length, 2);
  assert.notEqual(paths[0], paths[1]);
  const detail = await (await fetch(`${base}${paths[0]}`)).text();
  assert.match(detail, /<h1>First project<\/h1>/);
  assert.match(detail, /action="\/".*>Projects<\/button>/);
  const invalid = await create('   ');
  const invalidHtml = await invalid.text();
  assert.equal((invalidHtml.match(/data-testid="project-row"/g) || []).length, 2);
  assert.equal(await (await fetch(base)).text(), list);
  assert.equal((await fetch(`${base}/projects/99999`)).status, 404);

  async function taskPage(path = paths[0], filter = 'All') {
    return (await fetch(`${base}${path}?filter=${filter}`)).text();
  }
  async function postTask(path, values) {
    return fetch(`${base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
  }
  const taskCount = (html) => (html.match(/data-testid="task-row"/g) || []).length;
  assert.match(detail, /<label for="task-title">Task title<\/label>/);
  assert.match(detail, />Create task<\/button>/);
  assert.match(detail, /<label for="task-filter">Task filter<\/label>/);
  assert.match(detail, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
  for (const title of ['', ' \t\n ']) {
    const response = await postTask(`${paths[0]}/tasks`, { title });
    assert.equal(response.status, 400);
    const html = await response.text();
    assert.match(html, /role="alert">Task title is required/);
    assert.equal(taskCount(html), 0);
  }
  assert.equal((await postTask(`${paths[0]}/tasks`, { title: '  First task  ' })).status, 303);
  assert.equal((await postTask(`${paths[0]}/tasks`, { title: 'Second <task> & "review"' })).status, 303);
  const openTasks = await taskPage();
  assert.equal(taskCount(openTasks), 2);
  assert.match(openTasks, /aria-label="Complete First task"/);
  assert.match(openTasks, /aria-label="Complete Second &lt;task&gt; &amp; &quot;review&quot;"/);
  assert.ok(openTasks.indexOf('First task') < openTasks.indexOf('Second &lt;task&gt;'));
  assert.doesNotMatch(openTasks, / checked/);
  assert.equal(taskCount(await taskPage(paths[0], 'Open')), 2);
  assert.equal(taskCount(await taskPage(paths[0], 'Completed')), 0);
  assert.equal(taskCount(await taskPage(paths[1])), 0);
  const taskPaths = [...openTasks.matchAll(/action="(\/projects\/\d+\/tasks\/\d+)"/g)].map((match) => match[1]);
  assert.equal(taskPaths.length, 2);
  const completion = await postTask(taskPaths[0], { completed: '1', filter: 'Open' });
  assert.equal(completion.status, 303);
  assert.equal(completion.headers.get('location'), `${paths[0]}?filter=Open`);
  const completed = await taskPage(paths[0], 'Completed');
  assert.equal(taskCount(completed), 1);
  assert.match(completed, /aria-label="Complete First task" checked/);
  assert.doesNotMatch(completed, /Second &lt;task&gt;/);
  const remaining = await taskPage(paths[0], 'Open');
  assert.equal(taskCount(remaining), 1);
  assert.doesNotMatch(remaining, /First task/);
  const wrongProjectPath = taskPaths[0].replace(paths[0], paths[1]);
  assert.equal((await postTask(wrongProjectPath, {})).status, 404);
  assert.equal(await taskPage(paths[0], 'Completed'), completed);
  assert.equal((await postTask(`${paths[0]}/tasks`, { title: '   ' })).status, 400);
  assert.equal(taskCount(await taskPage()), 2);
  assert.equal((await postTask(`${paths[1]}/tasks`, { title: 'Other project task' })).status, 303);
  assert.equal(taskCount(await taskPage(paths[1])), 1);
  assert.doesNotMatch(await taskPage(), /Other project task/);
  const savedTasks = await taskPage();
  const savedList = await (await fetch(base)).text();
  assert.match(savedList, /data-testid="project-summary">1\/2 completed/);
  assert.match(savedList, /data-testid="project-summary">0\/1 completed/);

  await stop();
  base = await start();
  assert.equal(await (await fetch(base)).text(), savedList);
  assert.equal(await taskPage(), savedTasks);
  assert.equal(await taskPage(paths[0], 'Completed'), completed);
  assert.equal(taskCount(await taskPage(paths[1])), 1);
  assert.equal((await postTask(taskPaths[0], {})).status, 303);
  assert.equal(taskCount(await taskPage(paths[0], 'Completed')), 0);
  assert.equal(taskCount(await taskPage(paths[0], 'Open')), 2);
  await stop();
  base = await start();
  assert.equal(taskCount(await taskPage(paths[0], 'Completed')), 0);
  assert.equal(await taskPage(), openTasks);

  assert.equal((await postTask(taskPaths[0], { completed: '1' })).status, 303);
  const beforeArchive = await taskPage();
  assert.equal((await postTask(`${paths[0]}/archive`, {})).status, 303);
  const activeList = await (await fetch(base)).text();
  assert.doesNotMatch(activeList, /First project/);
  assert.match(activeList, /Second &lt;project&gt;/);
  const archivedList = await (await fetch(`${base}/?filter=Archived`)).text();
  assert.match(archivedList, /First project/);
  assert.doesNotMatch(archivedList, /Second &lt;project&gt;/);
  assert.match(archivedList, />Open project<\/button>/);
  assert.match(archivedList, />Restore project<\/button>/);
  assert.doesNotMatch(archivedList, />Archive project<\/button>/);
  assert.match(archivedList, /data-testid="project-summary">1\/2 completed/);
  const archivedPage = await taskPage();
  assert.match(archivedPage, /<p>Archived project<\/p>/);
  assert.match(archivedPage, /<button type="submit" disabled>Create task<\/button>/);
  assert.equal((archivedPage.match(/type="checkbox"[^>]* disabled/g) || []).length, 2);
  assert.equal(taskCount(await taskPage(paths[0], 'Completed')), 1);
  assert.equal(taskCount(await taskPage(paths[0], 'Open')), 1);
  assert.equal((await postTask(`${paths[0]}/tasks`, { title: 'Blocked task' })).status, 403);
  assert.equal((await postTask(taskPaths[0], {})).status, 403);
  assert.equal(await taskPage(), archivedPage);
  // Task filters must not affect the project summary.
  assert.equal(await (await fetch(`${base}/?filter=Archived`)).text(), archivedList);
  await stop();
  base = await start();
  assert.equal(await (await fetch(base)).text(), activeList);
  assert.equal(await (await fetch(`${base}/?filter=Archived`)).text(), archivedList);
  assert.equal(await taskPage(), archivedPage);
  assert.equal((await postTask(`${paths[0]}/restore`, {})).status, 303);
  assert.equal(await taskPage(), beforeArchive);
  assert.equal((await (await fetch(base)).text()).match(/data-testid="project-row"/g).length, 2);
  assert.doesNotMatch(await (await fetch(`${base}/?filter=Archived`)).text(), /data-testid="project-row"/);
  await stop();
  base = await start();
  assert.equal(await taskPage(), beforeArchive);
  assert.match(await (await fetch(base)).text(), /data-testid="project-summary">1\/2 completed/);
  assert.equal((await postTask(taskPaths[0], {})).status, 303);
  assert.match(await (await fetch(base)).text(), /data-testid="project-summary">0\/2 completed/);
  assert.equal((await postTask('/projects/99999/archive', {})).status, 404);

  assert.equal((await postTask(taskPaths[0], { completed: '1' })).status, 303);
  const beforeRename = await taskPage();
  const listBeforeRename = await (await fetch(base)).text();
  assert.match(beforeRename, /<label for="new-project-name">New project name<\/label>/);
  assert.match(beforeRename, /<button type="submit">Rename project<\/button>/);
  for (const name of ['', ' \t\n ']) {
    const response = await postTask(`${paths[0]}/rename`, { name });
    assert.equal(response.status, 400);
    const html = await response.text();
    assert.match(html, /role="alert">Project name is required/);
    assert.match(html, /<h1>First project<\/h1>/);
    assert.equal(await taskPage(), beforeRename);
    assert.equal(await (await fetch(base)).text(), listBeforeRename);
  }
  const rename = await postTask(`${paths[0]}/rename`, { name: '  Renamed <project> & "team"  ', filter: 'Completed' });
  assert.equal(rename.status, 303);
  assert.equal(rename.headers.get('location'), `${paths[0]}?filter=Completed`);
  const renamedPage = await taskPage();
  const renamedList = await (await fetch(base)).text();
  const escapedName = 'Renamed &lt;project&gt; &amp; &quot;team&quot;';
  assert.match(renamedPage, /<h1>Renamed &lt;project&gt; &amp; &quot;team&quot;<\/h1>/);
  assert.equal(renamedPage, beforeRename.replaceAll('First project', escapedName));
  assert.equal(renamedList, listBeforeRename.replaceAll('First project', escapedName));
  assert.equal(taskCount(await taskPage(paths[0], 'Completed')), 1);
  assert.equal(taskCount(await taskPage(paths[0], 'Open')), 1);
  await stop();
  base = await start();
  assert.equal(await taskPage(), renamedPage);
  assert.equal(await (await fetch(base)).text(), renamedList);

  assert.equal((await postTask(`${paths[0]}/archive`, {})).status, 303);
  const archivedRenamedPage = await taskPage();
  assert.match(archivedRenamedPage, /<input id="new-project-name"[^>]* disabled>/);
  assert.match(archivedRenamedPage, /<button type="submit" disabled>Rename project<\/button>/);
  assert.equal((await postTask(`${paths[0]}/rename`, { name: 'Blocked rename' })).status, 403);
  assert.equal(await taskPage(), archivedRenamedPage);
  await stop();
  base = await start();
  assert.equal(await taskPage(), archivedRenamedPage);
  assert.equal((await postTask(`${paths[0]}/restore`, {})).status, 303);
  assert.equal(await taskPage(), renamedPage);
  assert.equal((await postTask(`${paths[0]}/rename`, { name: '  Restored project  ' })).status, 303);
  const restoredPage = await taskPage();
  const restoredList = await (await fetch(base)).text();
  assert.equal(restoredPage, renamedPage.replaceAll(escapedName, 'Restored project'));
  assert.equal(restoredList, renamedList.replaceAll(escapedName, 'Restored project'));
  await stop();
  base = await start();
  assert.equal(await taskPage(), restoredPage);
  assert.equal(await (await fetch(base)).text(), restoredList);
  assert.equal((await postTask('/projects/99999/rename', { name: 'Missing' })).status, 404);

  // Renaming a completed task changes only its title, including its checkbox label.
  assert.match(restoredPage, /<label for="new-task-title-\d+">New task title<\/label>/);
  assert.equal((restoredPage.match(/>Rename task<\/button>/g) || []).length, 2);
  for (const title of ['', ' \t\n ']) {
    const response = await postTask(`${taskPaths[0]}/rename`, { title, filter: 'Completed' });
    assert.equal(response.status, 400);
    const html = await response.text();
    assert.match(html, /role="alert">Task title is required/);
    assert.equal(taskCount(html), 1);
    assert.match(html, /aria-label="Complete First task" checked/);
    assert.equal(await taskPage(), restoredPage);
    assert.equal(await (await fetch(base)).text(), restoredList);
  }
  const taskRename = await postTask(`${taskPaths[0]}/rename`, {
    title: '  Renamed <task> & "review"  ', filter: 'Completed',
  });
  assert.equal(taskRename.status, 303);
  assert.equal(taskRename.headers.get('location'), `${paths[0]}?filter=Completed`);
  const escapedTitle = 'Renamed &lt;task&gt; &amp; &quot;review&quot;';
  const renamedTaskPage = await taskPage();
  assert.equal(renamedTaskPage, restoredPage.replaceAll('First task', escapedTitle));
  const renamedCompleted = await taskPage(paths[0], 'Completed');
  assert.equal(taskCount(renamedCompleted), 1);
  assert.match(renamedCompleted, /aria-label="Complete Renamed &lt;task&gt; &amp; &quot;review&quot;" checked/);
  assert.equal(taskCount(await taskPage(paths[0], 'Open')), 1);
  assert.equal(await (await fetch(base)).text(), restoredList);
  assert.equal((await postTask(`${wrongProjectPath}/rename`, { title: 'Wrong owner' })).status, 404);
  assert.equal((await postTask(`${paths[0]}/tasks/99999/rename`, { title: 'Missing task' })).status, 404);
  assert.equal(await taskPage(), renamedTaskPage);
  assert.doesNotMatch(await taskPage(paths[1]), /Renamed &lt;task&gt;/);
  await stop();
  base = await start();
  assert.equal(await taskPage(), renamedTaskPage);
  assert.equal(await taskPage(paths[0], 'Completed'), renamedCompleted);
  assert.equal(await (await fetch(base)).text(), restoredList);

  // Open tasks retain their filter membership and order too.
  assert.equal((await postTask(`${taskPaths[1]}/rename`, { title: '  Renamed open task  ', filter: 'Open' })).status, 303);
  const bothRenamed = await taskPage();
  assert.equal(bothRenamed, renamedTaskPage.replaceAll('Second &lt;task&gt; &amp; &quot;review&quot;', 'Renamed open task'));
  assert.equal(taskCount(await taskPage(paths[0], 'Open')), 1);
  assert.equal(await taskPage(paths[0], 'Completed'), renamedCompleted);
  assert.equal(await (await fetch(base)).text(), restoredList);
  assert.equal((await postTask(`${paths[0]}/archive`, {})).status, 303);
  const archivedTaskPage = await taskPage();
  assert.equal((archivedTaskPage.match(/<input id="new-task-title-\d+"[^>]* disabled>/g) || []).length, 2);
  assert.equal((archivedTaskPage.match(/<button type="submit" disabled>Rename task<\/button>/g) || []).length, 2);
  assert.equal((await postTask(`${taskPaths[0]}/rename`, { title: 'Blocked task rename' })).status, 403);
  assert.equal(await taskPage(), archivedTaskPage);
  await stop();
  base = await start();
  assert.equal(await taskPage(), archivedTaskPage);
  assert.equal((await postTask(`${paths[0]}/restore`, {})).status, 303);
  assert.equal(await taskPage(), bothRenamed);
  assert.equal((await postTask(`${taskPaths[0]}/rename`, { title: '  Restored task  ' })).status, 303);
  const restoredTaskPage = await taskPage();
  assert.equal(restoredTaskPage, bothRenamed.replaceAll(escapedTitle, 'Restored task'));
  assert.equal(await (await fetch(base)).text(), restoredList);
  await stop();
  base = await start();
  assert.equal(await taskPage(), restoredTaskPage);
  assert.equal(await (await fetch(base)).text(), restoredList);

  // Priority edits preserve every other task field, filter, and summary.
  const priorityOptions = '<option>Low</option><option selected>Normal</option><option>High</option>';
  const highOptions = '<option>Low</option><option>Normal</option><option selected>High</option>';
  const lowOptions = '<option selected>Low</option><option>Normal</option><option>High</option>';
  assert.equal(restoredTaskPage.split(priorityOptions).length - 1, 2);
  assert.equal((restoredTaskPage.match(/<label for="task-priority-\d+">Task priority<\/label>/g) || []).length, 2);
  const otherProjectPage = await taskPage(paths[1]);
  const openBeforePriority = await taskPage(paths[0], 'Open');
  const completedBeforePriority = await taskPage(paths[0], 'Completed');
  const priorityResponse = await postTask(`${taskPaths[0]}/priority`, { priority: 'High', filter: 'Completed' });
  assert.equal(priorityResponse.status, 303);
  assert.equal(priorityResponse.headers.get('location'), `${paths[0]}?filter=Completed`);
  const highPage = await taskPage();
  assert.equal(highPage, restoredTaskPage.replace(priorityOptions, highOptions));
  assert.equal(await taskPage(paths[0], 'Completed'), completedBeforePriority.replace(priorityOptions, highOptions));
  assert.equal(await taskPage(paths[0], 'Open'), openBeforePriority);
  assert.equal(await taskPage(paths[1]), otherProjectPage);
  assert.equal(await (await fetch(base)).text(), restoredList);
  assert.equal((await postTask(`${taskPaths[1]}/priority`, { priority: 'Low' })).status, 303);
  const mixedPage = await taskPage();
  assert.equal(mixedPage, highPage.replace(priorityOptions, lowOptions));
  for (const priority of ['', 'Urgent']) {
    assert.equal((await postTask(`${taskPaths[0]}/priority`, { priority })).status, 400);
  }
  assert.equal((await postTask(`${wrongProjectPath}/priority`, { priority: 'Low' })).status, 404);
  assert.equal((await postTask(`${paths[0]}/tasks/99999/priority`, { priority: 'High' })).status, 404);
  assert.equal(await taskPage(), mixedPage);
  await stop();
  base = await start();
  assert.equal(await taskPage(), mixedPage);
  assert.equal(await taskPage(paths[1]), otherProjectPage);
  assert.equal(await (await fetch(base)).text(), restoredList);

  assert.equal((await postTask(`${taskPaths[0]}/rename`, { title: '  Priority preserved  ' })).status, 303);
  const priorityRenamed = await taskPage();
  assert.equal(priorityRenamed, mixedPage.replaceAll('Restored task', 'Priority preserved'));
  assert.equal((await postTask(`${paths[0]}/archive`, {})).status, 303);
  const archivedPriorities = await taskPage();
  assert.equal((archivedPriorities.match(/<select id="task-priority-\d+" name="priority" disabled/g) || []).length, 2);
  assert.equal((await postTask(`${taskPaths[0]}/priority`, { priority: 'Normal' })).status, 403);
  assert.equal(await taskPage(), archivedPriorities);
  assert.equal(taskCount(await taskPage(paths[0], 'Completed')), 1);
  assert.equal(taskCount(await taskPage(paths[0], 'Open')), 1);
  await stop();
  base = await start();
  assert.equal(await taskPage(), archivedPriorities);
  assert.equal((await postTask(`${paths[0]}/restore`, {})).status, 303);
  assert.equal(await taskPage(), priorityRenamed);
  assert.equal((await postTask(`${taskPaths[0]}/priority`, { priority: 'Normal' })).status, 303);
  const normalAgain = await taskPage();
  assert.equal(normalAgain, priorityRenamed.replace(highOptions, priorityOptions));
  assert.equal(await (await fetch(base)).text(), restoredList);
  await stop();
  base = await start();
  assert.equal(await taskPage(), normalAgain);
  // Combined filters select the intersection, without changing saved data.
  async function combinedPage(filter = 'All', priority = 'All') {
    return (await fetch(`${base}${paths[0]}?${new URLSearchParams({ filter, priorityFilter: priority })}`)).text();
  }
  const filterOptions = (html, id) =>
    new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`).exec(html)[1].trim();
  assert.equal(filterOptions(await combinedPage(), 'priority-filter'),
    '<option selected>All</option><option>Low</option><option>Normal</option><option>High</option>');
  for (const filter of ['All', 'Open', 'Completed']) {
    for (const priority of ['All', 'Low', 'Normal', 'High']) {
      const html = await combinedPage(filter, priority);
      const expectedTitles = [
        { title: 'Priority preserved', completed: true, priority: 'Normal' },
        { title: 'Renamed open task', completed: false, priority: 'Low' },
      ].filter((task) =>
        (filter === 'All' || task.completed === (filter === 'Completed')) &&
        (priority === 'All' || task.priority === priority)).map((task) => task.title);
      assert.equal(taskCount(html), expectedTitles.length);
      const visibleTitles = [...html.matchAll(/class="task-title">([^<]*)<\/span>/g)].map((match) => match[1]);
      assert.deepEqual(visibleTitles, expectedTitles);
      assert.match(filterOptions(html, 'task-filter'), new RegExp(`<option selected>${filter}</option>`));
      assert.match(filterOptions(html, 'priority-filter'), new RegExp(`<option selected>${priority}</option>`));
    }
  }
  assert.equal(await (await fetch(base)).text(), restoredList);
  assert.equal(await taskPage(), normalAgain);
  assert.equal(await combinedPage('bad', 'bad'), normalAgain);

  const selected = { filter: 'Completed', priorityFilter: 'Normal' };
  const selectedPage = await combinedPage('Completed', 'Normal');
  // Every editing form carries both selections, including creation/project rename.
  for (const form of selectedPage.matchAll(/<form[^>]*method="post"[^>]*>([\s\S]*?)<\/form>/g)) {
    assert.match(form[1], /name="filter" value="Completed"/);
    assert.match(form[1], /name="priorityFilter" value="Normal"/);
  }
  for (const path of [`${taskPaths[0]}/rename`, `${paths[0]}/tasks`]) {
    const response = await postTask(path, { ...selected, title: '   ' });
    assert.equal(response.status, 400);
    const html = await response.text();
    assert.equal(taskCount(html), 1);
    assert.match(filterOptions(html, 'task-filter'), /<option selected>Completed<\/option>/);
    assert.match(filterOptions(html, 'priority-filter'), /<option selected>Normal<\/option>/);
  }
  const renameFiltered = await postTask(`${taskPaths[0]}/rename`, { ...selected, title: '  Filtered rename  ' });
  assert.equal(renameFiltered.headers.get('location'), `${paths[0]}?filter=Completed&priorityFilter=Normal`);
  assert.match(await combinedPage('Completed', 'Normal'), /aria-label="Complete Filtered rename" checked/);
  const priorityFiltered = await postTask(`${taskPaths[0]}/priority`, { ...selected, priority: 'High' });
  assert.equal(priorityFiltered.headers.get('location'), `${paths[0]}?filter=Completed&priorityFilter=Normal`);
  assert.equal(taskCount(await (await fetch(`${base}${priorityFiltered.headers.get('location')}`)).text()), 0);
  assert.equal(taskCount(await combinedPage('Completed', 'High')), 1);
  assert.equal(await (await fetch(base)).text(), restoredList);
  const completionFiltered = await postTask(taskPaths[0], { filter: 'Completed', priorityFilter: 'High' });
  assert.equal(completionFiltered.headers.get('location'), `${paths[0]}?filter=Completed&priorityFilter=High`);
  assert.equal(taskCount(await (await fetch(`${base}${completionFiltered.headers.get('location')}`)).text()), 0);
  assert.equal(taskCount(await combinedPage('Open', 'High')), 1);
  assert.match(await (await fetch(base)).text(), /data-testid="project-summary">0\/2 completed/);
  const savedCombined = await combinedPage('Open', 'High');
  await stop();
  base = await start();
  assert.equal(await combinedPage('Open', 'High'), savedCombined);

  assert.equal((await postTask(`${paths[0]}/archive`, {})).status, 303);
  const archivedCombined = await combinedPage('Open', 'High');
  assert.equal(taskCount(archivedCombined), 1);
  assert.doesNotMatch(archivedCombined, /<select id="(?:task-filter|priority-filter)"[^>]*disabled/);
  assert.match(archivedCombined, /<select id="task-priority-\d+"[^>]*disabled/);
  assert.match(archivedCombined, /type="checkbox"[^>]*disabled/);
  assert.match(archivedCombined, /<input id="new-task-title-\d+"[^>]*disabled/);
  assert.match(archivedCombined, /disabled>Rename task<\/button>/);
  assert.equal(taskCount(await combinedPage('Completed', 'High')), 0);
  assert.equal(taskCount(await combinedPage('Open', 'Low')), 1);
  await stop();
  base = await start();
  assert.equal(await combinedPage('Open', 'High'), archivedCombined);
  assert.equal((await postTask(`${paths[0]}/restore`, {})).status, 303);
  assert.equal(await combinedPage('Open', 'High'), savedCombined);
  // Project-list links have no filter parameters, so each opening defaults to All.
  assert.match(await (await fetch(base)).text(), new RegExp(`action="${paths[0]}"`));
  assert.equal(taskCount(await taskPage()), 2);
  assert.match(filterOptions(await taskPage(), 'priority-filter'), /<option selected>All<\/option>/);

  // Project defaults affect only future tasks and preserve both selected filters.
  const defaultOptions = (html) => filterOptions(html, 'default-task-priority');
  const taskSection = (html) => /<section[^>]*aria-label="Tasks">([\s\S]*?)<\/section>/.exec(html)[1];
  const defaultPath = `${paths[0]}/default-priority`;
  const selectedFilters = { filter: 'Open', priorityFilter: 'High' };
  const beforeDefaultChange = await combinedPage('Open', 'High');
  const beforeDefaultList = await (await fetch(base)).text();
  const otherBeforeDefault = await taskPage(paths[1]);
  assert.equal(defaultOptions(beforeDefaultChange),
    '<option value="Low">Low</option><option value="Normal" selected>Normal</option><option value="High">High</option>');
  const changeDefault = await postTask(defaultPath, { ...selectedFilters, priority: 'High' });
  assert.equal(changeDefault.status, 303);
  assert.equal(changeDefault.headers.get('location'), `${paths[0]}?filter=Open&priorityFilter=High`);
  const afterDefaultChange = await (await fetch(`${base}${changeDefault.headers.get('location')}`)).text();
  assert.match(defaultOptions(afterDefaultChange), /value="High" selected/);
  assert.match(filterOptions(afterDefaultChange, 'task-filter'), /<option selected>Open<\/option>/);
  assert.match(filterOptions(afterDefaultChange, 'priority-filter'), /<option selected>High<\/option>/);
  assert.equal(taskSection(afterDefaultChange), taskSection(beforeDefaultChange));
  assert.equal(await taskPage(paths[1]), otherBeforeDefault);
  assert.equal(await (await fetch(base)).text(), beforeDefaultList);
  for (const priority of ['', 'Urgent']) {
    assert.equal((await postTask(defaultPath, { ...selectedFilters, priority })).status, 400);
  }
  assert.equal((await postTask('/projects/99999/default-priority', { priority: 'Low' })).status, 404);
  assert.equal(await combinedPage('Open', 'High'), afterDefaultChange);
  await stop();
  base = await start();
  assert.equal(await combinedPage('Open', 'High'), afterDefaultChange);

  const highCreation = await postTask(`${paths[0]}/tasks`, { ...selectedFilters, title: '  Inherited high  ' });
  assert.equal(highCreation.headers.get('location'), `${paths[0]}?filter=Open&priorityFilter=High`);
  const highFiltered = await combinedPage('Open', 'High');
  assert.equal(taskCount(highFiltered), 2);
  assert.ok(highFiltered.indexOf('class="task-title">Filtered rename') < highFiltered.indexOf('class="task-title">Inherited high'));
  const taskRows = [...(await taskPage()).matchAll(/<div class="task-row" data-testid="task-row">[\s\S]*?<\/div>/g)];
  const highRow = taskRows.find(([html]) => html.includes('aria-label="Complete Inherited high"'))[0];
  assert.match(highRow, /<option selected>High<\/option>/);
  assert.doesNotMatch(highRow, /type="checkbox"[^>]* checked/);
  const inheritedTaskPath = /action="(\/projects\/\d+\/tasks\/\d+)"/.exec(highRow)[1];
  assert.equal((await postTask(inheritedTaskPath, { completed: '1' })).status, 303);
  assert.equal((await postTask(`${inheritedTaskPath}/rename`, { title: 'Inherited renamed' })).status, 303);

  for (const priority of ['Low', 'Normal']) {
    const existingTasks = taskSection(await taskPage());
    const existingList = await (await fetch(base)).text();
    assert.equal((await postTask(defaultPath, { priority })).status, 303);
    assert.equal(taskSection(await taskPage()), existingTasks);
    assert.equal(await (await fetch(base)).text(), existingList);
    assert.equal((await postTask(`${paths[0]}/tasks`, { title: `Inherited ${priority}` })).status, 303);
    const matchingPage = await combinedPage('Open', priority);
    assert.match(matchingPage, new RegExp(`aria-label="Complete Inherited ${priority}"`));
  }
  const inheritedCompleted = await combinedPage('Completed', 'High');
  assert.equal(taskCount(inheritedCompleted), 1);
  assert.match(inheritedCompleted, /aria-label="Complete Inherited renamed" checked/);
  assert.match(await (await fetch(base)).text(), /data-testid="project-summary">1\/5 completed/);
  // Each project inherits its own default, independently of all existing tasks.
  assert.equal((await postTask(`${paths[1]}/default-priority`, { priority: 'Low' })).status, 303);
  assert.equal((await postTask(`${paths[1]}/tasks`, { title: 'Other inherited low' })).status, 303);
  assert.match(defaultOptions(await taskPage()), /value="Normal" selected/);
  assert.match(defaultOptions(await taskPage(paths[1])), /value="Low" selected/);
  const otherSaved = await taskPage(paths[1]);
  assert.match(otherSaved, /<option selected>Low<\/option>/);
  assert.match(otherSaved, /<option selected>Normal<\/option>/);

  assert.equal((await postTask(defaultPath, { priority: 'High' })).status, 303);
  assert.equal((await postTask(`${paths[0]}/rename`, { name: 'Default preserved' })).status, 303);
  const defaultSaved = await taskPage();
  assert.match(defaultOptions(defaultSaved), /value="High" selected/);
  const defaultSavedList = await (await fetch(base)).text();
  await stop();
  base = await start();
  assert.equal(await taskPage(), defaultSaved);
  assert.equal(await taskPage(paths[1]), otherSaved.replaceAll('Restored project', 'Default preserved'));
  assert.equal(await (await fetch(base)).text(), defaultSavedList);
  assert.equal((await postTask(`${paths[0]}/archive`, {})).status, 303);
  const archivedDefault = await taskPage();
  assert.match(archivedDefault, /<select id="default-task-priority"[^>]* disabled/);
  assert.match(defaultOptions(archivedDefault), /value="High" selected/);
  assert.equal((await postTask(defaultPath, { ...selectedFilters, priority: 'Low' })).status, 403);
  assert.equal(await taskPage(), archivedDefault);
  assert.equal(taskCount(await combinedPage('Completed', 'High')), 1);
  await stop();
  base = await start();
  assert.equal(await taskPage(), archivedDefault);
  assert.equal((await postTask(`${paths[0]}/restore`, {})).status, 303);
  assert.equal(await taskPage(), defaultSaved);
  assert.equal((await postTask(defaultPath, { priority: 'Low' })).status, 303);
  assert.match(defaultOptions(await taskPage()), /value="Low" selected/);
  assert.equal(taskSection(await taskPage()), taskSection(defaultSaved));
  assert.equal(await (await fetch(base)).text(), defaultSavedList);

  // Due dates use calendar arithmetic, preserve all other data, and carry both filters.
  const duePath = `${taskPaths[0]}/due-date`;
  const dueInput = (value, disabled = false) =>
    `id="task-due-date-${taskPaths[0].split('/').at(-1)}" name="dueDate" type="text" value="${value}"${disabled ? ' disabled' : ''}`;
  const beforeDates = await taskPage();
  const beforeDatesList = await (await fetch(base)).text();
  const otherBeforeDates = await taskPage(paths[1]);
  assert.match(beforeDates, new RegExp(dueInput('')));
  const dateFilters = { filter: 'Open', priorityFilter: 'High' };
  for (const date of ['0001-01-01', '0096-02-29', '2000-02-29', '2024-02-29', '9999-12-31']) {
    const response = await postTask(duePath, { ...dateFilters, dueDate: `  ${date} \t` });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), `${paths[0]}?filter=Open&priorityFilter=High`);
    assert.equal(await taskPage(), beforeDates.replace(dueInput(''), dueInput(date)));
    assert.equal(await (await fetch(base)).text(), beforeDatesList);
    assert.equal(await taskPage(paths[1]), otherBeforeDates);
    const filtered = await combinedPage('Open', 'High');
    assert.equal(taskCount(filtered), 1);
    assert.match(filterOptions(filtered, 'task-filter'), /<option selected>Open<\/option>/);
    assert.match(filterOptions(filtered, 'priority-filter'), /<option selected>High<\/option>/);
  }
  const savedDatePage = await taskPage();
  for (const date of ['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2023-02-29',
    '2024-04-31', '2024-00-01', '2024-13-01', '2024-01-00', '2024-01-32', '2024-1-01',
    '24-01-01', '2024/01/01', '2024-01-01T00:00:00Z', 'tomorrow']) {
    const response = await postTask(duePath, { ...dateFilters, dueDate: date });
    assert.equal(response.status, 400, date);
    const html = await response.text();
    assert.match(html, /role="alert">Due date must be a valid YYYY-MM-DD date/);
    assert.match(html, new RegExp(dueInput('9999-12-31')));
    assert.match(filterOptions(html, 'task-filter'), /<option selected>Open<\/option>/);
    assert.match(filterOptions(html, 'priority-filter'), /<option selected>High<\/option>/);
    assert.equal(await taskPage(), savedDatePage);
  }
  assert.equal((await postTask(`${wrongProjectPath}/due-date`, { dueDate: '2026-10-10' })).status, 404);
  assert.equal((await postTask(`${paths[0]}/tasks/99999/due-date`, { dueDate: '' })).status, 404);
  assert.equal((await postTask(`${taskPaths[1]}/due-date`, { dueDate: '2026-10-10' })).status, 303);
  assert.match(await taskPage(), new RegExp(dueInput('9999-12-31')));
  assert.equal((await postTask(`${taskPaths[0]}/rename`, { ...dateFilters, title: 'Dated task' })).status, 303);
  const datedRenamed = await taskPage();
  assert.match(datedRenamed, /aria-label="Complete Dated task"/);
  assert.match(datedRenamed, new RegExp(dueInput('9999-12-31')));
  assert.equal(await (await fetch(base)).text(), beforeDatesList);
  await stop();
  base = await start();
  assert.equal(await taskPage(), datedRenamed);
  assert.equal(await taskPage(paths[1]), otherBeforeDates);

  assert.equal((await postTask(`${paths[0]}/archive`, {})).status, 303);
  const archivedDates = await taskPage();
  assert.equal((archivedDates.match(/id="task-due-date-\d+"[^>]* disabled/g) || []).length, 5);
  assert.equal((archivedDates.match(/disabled>Save due date<\/button>/g) || []).length, 5);
  assert.match(archivedDates, new RegExp(dueInput('9999-12-31', true)));
  assert.equal((await postTask(duePath, { dueDate: '' })).status, 403);
  assert.equal(await taskPage(), archivedDates);
  await stop();
  base = await start();
  assert.equal(await taskPage(), archivedDates);
  assert.equal((await postTask(`${paths[0]}/restore`, {})).status, 303);
  assert.equal(await taskPage(), datedRenamed);
  for (const dueDate of ['', ' \t\n ']) {
    assert.equal((await postTask(duePath, { dueDate: '2026-10-10' })).status, 303);
    const response = await postTask(duePath, { ...dateFilters, dueDate });
    assert.equal(response.headers.get('location'), `${paths[0]}?filter=Open&priorityFilter=High`);
    assert.equal(await taskPage(), datedRenamed.replace(dueInput('9999-12-31'), dueInput('')));
  }
  const clearedDates = await taskPage();
  await stop();
  base = await start();
  assert.equal(await taskPage(), clearedDates);
  assert.equal(await (await fetch(base)).text(), beforeDatesList);
  assert.equal((await postTask(`${paths[0]}/tasks`, { title: 'New undated task' })).status, 303);
  const newDateRow = [...(await taskPage()).matchAll(/<div class="task-row" data-testid="task-row">[\s\S]*?<\/div>/g)]
    .find(([html]) => html.includes('aria-label="Complete New undated task"'))[0];
  assert.match(newDateRow, /name="dueDate" type="text" value=""/);

  // Inclusive ranges intersect both filters without changing saved data.
  await create('Range project');
  const rangeProject = [...(await (await fetch(base)).text()).matchAll(/action="(\/projects\/\d+)"/g)].at(-1)[1];
  const fixtures = [
    { title: 'At upper', date: '2024-03-01', priority: 'High', completed: false },
    { title: 'Before', date: '2024-02-28', priority: 'Normal', completed: false },
    { title: 'At lower', date: '2024-02-29', priority: 'High', completed: true },
    { title: 'After', date: '2024-03-02', priority: 'Low', completed: false },
    { title: 'Undated', date: '', priority: 'High', completed: false },
  ];
  const visibleTitles = (html) => [...html.matchAll(/class="task-title">([^<]*)<\/span>/g)].map((match) => match[1]);
  const rangePage = async (state = {}) => (await fetch(`${base}${rangeProject}?${new URLSearchParams(state)}`)).text();
  for (const fixture of fixtures) {
    await postTask(`${rangeProject}/tasks`, { title: fixture.title });
    const html = await rangePage();
    fixture.path = [...html.matchAll(/action="(\/projects\/\d+\/tasks\/\d+)"/g)].at(-1)[1];
    await postTask(`${fixture.path}/due-date`, { dueDate: fixture.date });
    await postTask(`${fixture.path}/priority`, { priority: fixture.priority });
    if (fixture.completed) await postTask(fixture.path, { completed: '1' });
  }
  const unfilteredRangePage = await rangePage();
  const rangeList = await (await fetch(base)).text();
  assert.match(rangeList, /data-testid="project-summary">1\/5 completed/);
  assert.match(unfilteredRangePage, /<label for="due-from">Due from<\/label>/);
  assert.match(unfilteredRangePage, /<label for="due-through">Due through<\/label>/);
  assert.match(unfilteredRangePage, /id="due-from" name="rangeFrom" type="text" value=""/);
  assert.match(unfilteredRangePage, /id="due-through" name="rangeThrough" type="text" value=""/);
  assert.match(unfilteredRangePage, />Apply due range<\/button>/);

  for (const [from, through] of [['', ''], ['2024-02-29', ''], ['', '2024-03-01'],
    ['2024-02-29', '2024-03-01'], ['2024-02-29', '2024-02-29'], ['0001-01-01', '9999-12-31']]) {
    for (const filter of ['All', 'Open', 'Completed']) {
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        const response = await postTask(`${rangeProject}/due-range`, {
          filter, priorityFilter: priority, rangeFrom: ` ${from} `, rangeThrough: ` ${through} `,
        });
        assert.equal(response.status, 303);
        const html = await (await fetch(`${base}${response.headers.get('location')}`)).text();
        const expected = fixtures.filter((task) =>
          (filter === 'All' || task.completed === (filter === 'Completed')) &&
          (priority === 'All' || task.priority === priority) &&
          ((!from && !through) || (task.date && (!from || task.date >= from) && (!through || task.date <= through))));
        assert.deepEqual(visibleTitles(html), expected.map((task) => task.title));
        assert.match(filterOptions(html, 'task-filter'), new RegExp(`<option selected>${filter}</option>`));
        assert.match(filterOptions(html, 'priority-filter'), new RegExp(`<option selected>${priority}</option>`));
        assert.ok(html.includes(`id="due-from" name="rangeFrom" type="text" value="${from}"`));
        assert.ok(html.includes(`id="due-through" name="rangeThrough" type="text" value="${through}"`));
      }
    }
  }
  assert.equal(await rangePage(), unfilteredRangePage);
  assert.equal(await (await fetch(base)).text(), rangeList);

  const rangeState = { filter: 'Open', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-03-01' };
  const appliedRangePage = await rangePage(rangeState);
  assert.deepEqual(visibleTitles(appliedRangePage), ['At upper']);
  // Applied boundaries are carried by every edit, apply, and combobox form.
  for (const [form] of appliedRangePage.matchAll(/<form[^>]*>([\s\S]*?)<\/form>/g)) {
    if (form.includes('action="/"')) continue;
    assert.match(form, /name="dueFrom" value="2024-02-29"/);
    assert.match(form, /name="dueThrough" value="2024-03-01"/);
  }
  for (const [from, through, message] of [
    ['2023-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
    ['', '1900-02-29', 'Due range must use valid YYYY-MM-DD dates'],
    ['0000-01-01', '', 'Due range must use valid YYYY-MM-DD dates'],
    ['', '10000-01-01', 'Due range must use valid YYYY-MM-DD dates'],
    ['2024-04-31', '', 'Due range must use valid YYYY-MM-DD dates'],
    ['2024-2-29', '', 'Due range must use valid YYYY-MM-DD dates'],
    ['', 'tomorrow', 'Due range must use valid YYYY-MM-DD dates'],
    ['2024-03-02', '2024-03-01', 'Due from must not be after Due through'],
  ]) {
    const response = await postTask(`${rangeProject}/due-range`, { ...rangeState, rangeFrom: from, rangeThrough: through });
    assert.equal(response.status, 400);
    const html = await response.text();
    assert.ok(html.includes(`role="alert">${message}`));
    assert.equal(html.replace(`<p role="alert">${message}</p>`, ''), appliedRangePage);
  }

  async function rangeEdit(path, values) {
    const response = await postTask(path, { ...rangeState, ...values });
    assert.equal(response.status, 303);
    const location = new URL(response.headers.get('location'), base);
    for (const [key, value] of Object.entries(rangeState)) assert.equal(location.searchParams.get(key), value);
    return (await (await fetch(location)).text());
  }
  assert.deepEqual(visibleTitles(await rangeEdit(`${fixtures[0].path}/due-date`, { dueDate: '2024-03-02' })), []);
  assert.deepEqual(visibleTitles(await rangeEdit(`${fixtures[0].path}/due-date`, { dueDate: '2024-02-29' })), ['At upper']);
  assert.deepEqual(visibleTitles(await rangeEdit(`${fixtures[0].path}/due-date`, { dueDate: '' })), []);
  await rangeEdit(`${fixtures[0].path}/due-date`, { dueDate: '2024-03-01' });
  assert.deepEqual(visibleTitles(await rangeEdit(`${fixtures[0].path}/priority`, { priority: 'Normal' })), []);
  await rangeEdit(`${fixtures[0].path}/priority`, { priority: 'High' });
  assert.deepEqual(visibleTitles(await rangeEdit(fixtures[0].path, { completed: '1' })), []);
  await rangeEdit(fixtures[0].path, {});
  assert.deepEqual(visibleTitles(await rangeEdit(`${fixtures[0].path}/rename`, { title: 'Renamed upper' })), ['Renamed upper']);
  assert.deepEqual(visibleTitles(await rangeEdit(`${rangeProject}/rename`, { name: 'Renamed range project' })), ['Renamed upper']);
  assert.deepEqual(visibleTitles(await rangeEdit(`${rangeProject}/default-priority`, { priority: 'High' })), ['Renamed upper']);
  assert.deepEqual(visibleTitles(await rangeEdit(`${rangeProject}/tasks`, { title: 'Undated new task' })), ['Renamed upper']);
  assert.deepEqual(visibleTitles(await rangePage({ ...rangeState, filter: 'Completed' })), ['At lower']);
  assert.deepEqual(visibleTitles(await rangePage({ ...rangeState, priorityFilter: 'Normal' })), []);
  const savedRangePage = await rangePage(rangeState);
  await stop();
  base = await start();
  assert.equal(await rangePage(rangeState), savedRangePage);
  assert.equal(visibleTitles(await rangePage()).length, 6);

  await postTask(`${rangeProject}/archive`, {});
  const archivedRangePage = await rangePage(rangeState);
  assert.match(archivedRangePage, /Archived project/);
  assert.doesNotMatch(archivedRangePage, /id="(?:due-from|due-through|task-filter|priority-filter)"[^>]*disabled/);
  assert.doesNotMatch(archivedRangePage, /disabled>Apply due range/);
  assert.match(archivedRangePage, /id="task-due-date-\d+"[^>]*disabled/);
  const archivedRangeResponse = await postTask(`${rangeProject}/due-range`, {
    ...rangeState, rangeFrom: '', rangeThrough: '',
  });
  assert.equal(archivedRangeResponse.status, 303);
  assert.deepEqual(visibleTitles(await (await fetch(`${base}${archivedRangeResponse.headers.get('location')}`)).text()),
    ['Renamed upper', 'Undated', 'Undated new task']);
  await stop();
  base = await start();
  assert.equal(await rangePage(rangeState), archivedRangePage);
  await postTask(`${rangeProject}/restore`, {});
  assert.equal(await rangePage(rangeState), savedRangePage);
  assert.match(await (await fetch(base)).text(), new RegExp(`action="${rangeProject}"`));
  assert.match(await rangePage(), /id="due-from" name="rangeFrom" type="text" value=""/);

  // Moving preserves identity and saved data, but appends to destination order.
  const projectId = (path) => path.split('/').at(-1);
  const movingTaskId = fixtures[0].path.split('/').at(-1);
  const destination = paths[1];
  const destinationBefore = visibleTitles(await taskPage(destination));
  await postTask(`${destination}/default-priority`, { priority: 'Low' });
  await postTask(fixtures[0].path, { completed: '1' });
  const movingState = { ...rangeState, filter: 'Completed' };
  const sourceBefore = await rangePage(movingState);
  const destinationSelect = (html, id) => new RegExp(`<select id="destination-project-${id}"[^>]*>([\\s\\S]*?)</select>`).exec(html);
  const expectedDestinations = paths.map((path, index) =>
    `<option value="${projectId(path)}">${index === 0 ? 'Default preserved' : 'Second &lt;project&gt; &amp; &quot;team&quot;'}</option>`).join('');
  assert.equal(destinationSelect(sourceBefore, movingTaskId)[1].trim(), expectedDestinations);
  assert.match(sourceBefore, /<label for="destination-project-\d+">Destination project<\/label>/);
  const summary = async (path) => {
    const html = await (await fetch(base)).text();
    const row = html.split('data-testid="project-row">').slice(1)
      .find((content) => content.includes(`action="${path}"`));
    return /data-testid="project-summary">([^<]+)/.exec(row)[1];
  };
  assert.equal(await summary(rangeProject), '2/6 completed');
  assert.equal(await summary(destination), '0/2 completed');
  const moved = await postTask(`${fixtures[0].path}/move`, { ...movingState, destinationProject: projectId(destination) });
  assert.equal(moved.status, 303);
  const movedLocation = new URL(moved.headers.get('location'), base);
  assert.equal(movedLocation.pathname, rangeProject);
  for (const [key, value] of Object.entries(movingState)) assert.equal(movedLocation.searchParams.get(key), value);
  assert.deepEqual(visibleTitles(await (await fetch(movedLocation)).text()), ['At lower']);
  const movedPath = `${destination}/tasks/${movingTaskId}`;
  const movedRow = [...(await taskPage(destination)).matchAll(/data-testid="task-row">([\s\S]*?)<\/div>/g)]
    .find(([html]) => html.includes('Complete Renamed upper'))[0];
  assert.match(movedRow, /aria-label="Complete Renamed upper" checked/);
  assert.match(movedRow, /<option selected>High<\/option>/);
  assert.match(movedRow, /name="dueDate" type="text" value="2024-03-01"/);
  assert.ok(movedRow.includes(`action="${movedPath}"`));
  assert.deepEqual(visibleTitles(await taskPage(destination)), [...destinationBefore, 'Renamed upper']);
  assert.equal(await summary(rangeProject), '1/5 completed');
  assert.equal(await summary(destination), '1/3 completed');
  assert.equal((await postTask(fixtures[0].path, {})).status, 404);
  assert.equal((await postTask(`${fixtures[0].path}/move`, { destinationProject: projectId(destination) })).status, 404);
  // Creating after a move must append, including after an older task ID.
  await postTask(`${destination}/tasks`, { title: 'After moved task' });
  assert.deepEqual(visibleTitles(await taskPage(destination)), [...destinationBefore, 'Renamed upper', 'After moved task']);
  const savedSource = await rangePage(movingState);
  const savedDestination = await taskPage(destination);
  await stop();
  base = await start();
  assert.equal(await rangePage(movingState), savedSource);
  assert.equal(await taskPage(destination), savedDestination);

  for (const destinationProject of ['', '99999', projectId(destination), 'garbage']) {
    assert.equal((await postTask(`${movedPath}/move`, { destinationProject })).status, 400);
    assert.equal(await taskPage(destination), savedDestination);
  }
  await postTask(`${rangeProject}/archive`, {});
  assert.ok(!destinationSelect(await taskPage(destination), movingTaskId)[1].includes(`value="${projectId(rangeProject)}"`));
  assert.equal((await postTask(`${movedPath}/move`, { destinationProject: projectId(rangeProject) })).status, 400);
  await postTask(`${destination}/archive`, {});
  const archivedMoves = await taskPage(destination);
  assert.match(archivedMoves, /id="destination-project-\d+"[^>]* disabled/);
  assert.equal((archivedMoves.match(/disabled>Move task/g) || []).length, 4);
  assert.equal((await postTask(`${movedPath}/move`, { destinationProject: projectId(paths[0]) })).status, 403);
  await postTask(`${destination}/restore`, {});
  await postTask(`${rangeProject}/restore`, {});
  await postTask(`${rangeProject}/rename`, { name: 'Move destination renamed' });
  assert.ok(destinationSelect(await taskPage(destination), movingTaskId)[1].includes('Move destination renamed'));
  assert.equal((await postTask(`${movedPath}/move`, { destinationProject: projectId(rangeProject) })).status, 303);
  assert.deepEqual(visibleTitles(await rangePage()), ['Before', 'At lower', 'After', 'Undated', 'Undated new task', 'Renamed upper']);
  // Blank dates also survive moves; no active alternatives disable both controls.
  const undatedId = fixtures[4].path.split('/').at(-1);
  await postTask(`${fixtures[4].path}/move`, { destinationProject: projectId(destination) });
  assert.match(await taskPage(destination), new RegExp(`id="task-due-date-${undatedId}" name="dueDate" type="text" value=""`));
  await postTask(`${paths[0]}/archive`, {});
  await postTask(`${rangeProject}/archive`, {});
  const noDestinations = await taskPage(destination);
  const emptySelect = destinationSelect(noDestinations, undatedId);
  assert.match(emptySelect[0], / disabled/);
  assert.equal(emptySelect[1].trim(), '');
  assert.equal((noDestinations.match(/disabled>Move task/g) || []).length, 4);
  await postTask(`${rangeProject}/restore`, {});
  assert.doesNotMatch(destinationSelect(await taskPage(destination), undatedId)[0], / disabled/);
  assert.equal((await postTask(`${destination}/tasks/${undatedId}/move`, { destinationProject: projectId(rangeProject) })).status, 303);
  const finalSource = await rangePage();
  const finalDestination = await taskPage(destination);
  await stop();
  base = await start();
  assert.equal(await rangePage(), finalSource);
  assert.equal(await taskPage(destination), finalDestination);

});
