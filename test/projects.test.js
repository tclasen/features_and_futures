import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('projects and tasks support validation, filtering, isolation, archiving, renaming, priorities, summaries, and restart persistence', async (t) => {
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
  assert.match(migratedPage, /aria-label="Complete Existing task" checked/);
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
});
