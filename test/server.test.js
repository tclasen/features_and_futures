import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';

async function availablePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test('projects and tasks validate, filter, archive, restore, rename, and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-'));
  // Exercise migration from the original projects schema, including existing data.
  const legacy = new DatabaseSync(join(directory, 'db.sqlite'));
  legacy.exec(`CREATE TABLE projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0)
  ); INSERT INTO projects (name) VALUES ('Legacy');
  CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0
  ); INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Legacy task', 1);`);
  legacy.close();
  const port = await availablePort();
  const base = `http://127.0.0.1:${port}`;
  let child;
  let output = '';
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'db.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (data) => { output += data; });
    child.stderr.on('data', (data) => { output += data; });
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await fetch(`${base}/health`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'ok' });
        return;
      } catch {
        if (child.exitCode !== null) throw new Error(output);
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    throw new Error(`Server failed to start: ${output}`);
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  async function create(name) {
    return fetch(`${base}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
  }
  try {
    await start();
    const migrated = await (await fetch(base)).text();
    assert.match(migrated, /Legacy/);
    assert.match(migrated, /data-testid="project-summary">1\/1 completed/);
    const migratedTasks = await (await fetch(`${base}/projects/1`)).text();
    assert.match(migratedTasks, /<option>Low<\/option><option selected>Normal<\/option><option>High<\/option>/);
    assert.match(migratedTasks, /aria-label="Complete Legacy task" checked/);
    assert.match(migratedTasks, /id="task-due-date-1" name="dueDate" type="text" value=""/);
    // Remove fixture data so the original creation-order checks remain unchanged.
    await stop();
    const fixture = new DatabaseSync(join(directory, 'db.sqlite'));
    assert.deepEqual({ ...fixture.prepare('SELECT task_id, project_id, position FROM task_positions').get() }, { task_id: 1, project_id: 1, position: 1 });
    fixture.exec("DELETE FROM task_positions; DELETE FROM tasks; DELETE FROM projects; DELETE FROM sqlite_sequence WHERE name IN ('projects', 'tasks')");
    fixture.close();
    await start();
    const initial = await (await fetch(base)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, /Create project/);
    for (const blank of ['', ' \t\n ']) {
      const response = await create(blank);
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    const response = await create('  First <project> & "test"  ');
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/');
    await create('Second');
    const list = await (await fetch(base)).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.ok(list.indexOf('First &lt;project&gt;') < list.indexOf('Second'));
    assert.match(list, /First &lt;project&gt; &amp; &quot;test&quot;<\/span>/);
    const detailPath = list.match(/action="(\/projects\/\d+)"/)[1];
    const detail = await (await fetch(base + detailPath)).text();
    assert.match(detail, /<h1>First &lt;project&gt; &amp; &quot;test&quot;<\/h1>/);
    assert.match(detail, /action="\/" method="get"><button>Projects<\/button>/);
    assert.equal((await fetch(`${base}/projects/999999`)).status, 404);
    async function post(path, values) {
      return fetch(base + path, {
        method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
      });
    }
    async function tasksPage(query = '') {
      return (await fetch(base + detailPath + query)).text();
    }
    assert.match(detail, /<label for="task-title">Task title<\/label>/);
    assert.match(detail, /<label for="task-filter">Task filter<\/label>/);
    assert.match(detail, /<option selected>All<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const invalid = await post(`${detailPath}/tasks`, { title });
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.doesNotMatch(html, /data-testid="task-row"/);
    }
    assert.equal((await post(`${detailPath}/tasks`, { title: '  First <task> & "test"  ' })).status, 303);
    await post(`${detailPath}/tasks`, { title: 'Second task' });
    const taskList = await tasksPage();
    assert.equal((taskList.match(/data-testid="task-row"/g) || []).length, 2);
    assert.ok(taskList.indexOf('First &lt;task&gt;') < taskList.indexOf('Second task'));
    assert.match(taskList, /aria-label="Complete First &lt;task&gt; &amp; &quot;test&quot;"/);
    assert.doesNotMatch(taskList, / checked/);
    const completionPath = taskList.match(/action="([^\"]+\/completion)"/)[1];
    assert.equal((await post(completionPath.replace('/projects/1/', '/projects/2/'), { completed: '1' })).status, 404);
    assert.doesNotMatch(await (await fetch(`${base}/projects/2`)).text(), /data-testid="task-row"/);
    assert.equal((await post(completionPath, { completed: '1' })).status, 303);
    assert.match(await tasksPage(), / checked/);
    const open = await tasksPage('?filter=Open');
    assert.doesNotMatch(open, /First &lt;task&gt;/);
    assert.match(open, /Second task/);
    const completed = await tasksPage('?filter=Completed');
    assert.match(completed, /First &lt;task&gt;/);
    assert.doesNotMatch(completed, /Second task/);
    assert.match(completed, /<option selected>Completed<\/option>/);
    await post(completionPath, {});
    assert.doesNotMatch(await tasksPage(), / checked/);
    assert.doesNotMatch(await tasksPage('?filter=Completed'), /data-testid="task-row"/);
    await post(completionPath, { completed: '1' });
    const savedDetail = await tasksPage();
    const activeList = await (await fetch(base)).text();
    assert.match(activeList, /data-testid="project-summary">1\/2 completed/);
    assert.match(activeList, /<label for="project-filter">Project filter<\/label>/);
    assert.match(activeList, /<option selected>Active<\/option>/);
    assert.match(activeList, /Archive project/);
    assert.equal((await post(`${detailPath}/archive`, {})).status, 303);
    const activeAfterArchive = await (await fetch(base)).text();
    assert.doesNotMatch(activeAfterArchive, /First &lt;project&gt;/);
    assert.match(activeAfterArchive, /Second/);
    const archivedList = await (await fetch(`${base}/?filter=Archived`)).text();
    assert.match(archivedList, /First &lt;project&gt;/);
    assert.doesNotMatch(archivedList, /Second/);
    assert.match(archivedList, /Restore project/);
    assert.match(archivedList, /Open project/);
    assert.match(archivedList, /data-testid="project-summary">1\/2 completed/);
    const archivedDetail = await tasksPage();
    assert.match(archivedDetail, /<p>Archived project<\/p>/);
    assert.match(archivedDetail, /<button type="submit" disabled>Create task/);
    assert.equal((archivedDetail.match(/aria-label="Complete [^\n]+ disabled/g) || []).length, 2);
    assert.doesNotMatch(await tasksPage('?filter=Open'), /First &lt;task&gt;/);
    assert.doesNotMatch(await tasksPage('?filter=Completed'), /Second task/);
    assert.equal((await post(`${detailPath}/tasks`, { title: 'Blocked' })).status, 403);
    assert.equal((await post(completionPath, {})).status, 403);
    assert.equal(await tasksPage(), archivedDetail);
    await stop();
    await start();
    assert.equal(await (await fetch(base)).text(), activeAfterArchive);
    assert.equal(await (await fetch(`${base}/?filter=Archived`)).text(), archivedList);
    assert.equal(await tasksPage(), archivedDetail);
    assert.equal((await post(`${detailPath}/restore`, {})).status, 303);
    assert.equal(await (await fetch(base)).text(), activeList);
    assert.equal(await tasksPage(), savedDetail);
    assert.equal(await tasksPage('?filter=Completed'), completed);
    assert.doesNotMatch(await (await fetch(`${base}/?filter=Archived`)).text(), /data-testid="project-row"/);
    await stop();
    await start();
    assert.equal(await (await fetch(base)).text(), activeList);
    assert.equal(await tasksPage(), savedDetail);
    assert.equal((await post('/projects/999999/archive', {})).status, 404);

    assert.match(savedDetail, /<label for="new-project-name">New project name<\/label>/);
    assert.match(savedDetail, /<button type="submit">Rename project<\/button>/);
    for (const name of ['', ' \t\n ']) {
      const invalid = await post(`${detailPath}/rename`, { name, filter: 'Completed' });
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.match(html, /<h1>First &lt;project&gt; &amp; &quot;test&quot;<\/h1>/);
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.equal(await tasksPage(), savedDetail);
      assert.equal(await (await fetch(base)).text(), activeList);
    }
    const renamed = await post(`${detailPath}/rename`, { name: '  Renamed <project> & "name"  ', filter: 'Completed' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), `${detailPath}?filter=Completed`);
    const renamedDetail = await tasksPage();
    assert.match(renamedDetail, /<h1>Renamed &lt;project&gt; &amp; &quot;name&quot;<\/h1>/);
    // Only the title and heading change: task IDs, ordering, state, and form URLs remain intact.
    assert.equal(renamedDetail, savedDetail.replaceAll('First &lt;project&gt; &amp; &quot;test&quot;', 'Renamed &lt;project&gt; &amp; &quot;name&quot;'));
    const renamedList = await (await fetch(base)).text();
    assert.equal(renamedList, activeList.replaceAll('First &lt;project&gt; &amp; &quot;test&quot;', 'Renamed &lt;project&gt; &amp; &quot;name&quot;'));
    await stop();
    await start();
    assert.equal(await tasksPage(), renamedDetail);
    assert.equal(await (await fetch(base)).text(), renamedList);
    await post(`${detailPath}/archive`, {});
    const readOnly = await tasksPage();
    assert.match(readOnly, /<input id="new-project-name" name="name" type="text" disabled>/);
    assert.match(readOnly, /<button type="submit" disabled>Rename project<\/button>/);
    assert.equal((await post(`${detailPath}/rename`, { name: 'Blocked rename' })).status, 403);
    assert.equal(await tasksPage(), readOnly);
    await post(`${detailPath}/restore`, {});
    assert.equal(await tasksPage(), renamedDetail);
    assert.equal((await post(`${detailPath}/rename`, { name: 'Restored name' })).status, 303);
    const restoredDetail = await tasksPage();
    assert.equal(restoredDetail, renamedDetail.replaceAll('Renamed &lt;project&gt; &amp; &quot;name&quot;', 'Restored name'));
    await stop();
    await start();
    assert.equal(await tasksPage(), restoredDetail);
    assert.equal(await (await fetch(base)).text(), renamedList.replaceAll('Renamed &lt;project&gt; &amp; &quot;name&quot;', 'Restored name'));
    assert.equal((await post('/projects/999999/rename', { name: 'Missing' })).status, 404);

    const taskRenamePath = completionPath.replace('/completion', '/rename');
    const beforeTaskRenameList = await (await fetch(base)).text();
    assert.match(restoredDetail, /<label for="new-task-title-1">New task title<\/label>/);
    assert.equal((restoredDetail.match(/>Rename task<\/button>/g) || []).length, 2);
    for (const title of ['', ' \t\n ']) {
      const invalid = await post(taskRenamePath, { title, filter: 'Completed' });
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.equal(await tasksPage(), restoredDetail);
    }
    assert.equal((await post(taskRenamePath.replace('/projects/1/', '/projects/2/'), { title: 'Wrong owner' })).status, 404);
    assert.equal((await post(`${detailPath}/tasks/999999/rename`, { title: 'Missing' })).status, 404);
    assert.equal((await post('/projects/999999/tasks/1/rename', { title: 'Missing' })).status, 404);
    const taskRenamed = await post(taskRenamePath, { title: '  Renamed <task> & "title"  ', filter: 'Completed' });
    assert.equal(taskRenamed.status, 303);
    assert.equal(taskRenamed.headers.get('location'), `${detailPath}?filter=Completed`);
    const renamedTaskDetail = await tasksPage();
    // Exact comparison checks title/label changes while preserving IDs, order and completion.
    assert.equal(renamedTaskDetail, restoredDetail.replaceAll('First &lt;task&gt; &amp; &quot;test&quot;', 'Renamed &lt;task&gt; &amp; &quot;title&quot;'));
    assert.match(renamedTaskDetail, /aria-label="Complete Renamed &lt;task&gt; &amp; &quot;title&quot;" checked/);
    assert.doesNotMatch(await tasksPage('?filter=Open'), /Renamed &lt;task&gt;/);
    assert.match(await tasksPage('?filter=Completed'), /Renamed &lt;task&gt;/);
    assert.equal(await (await fetch(base)).text(), beforeTaskRenameList);
    assert.doesNotMatch(await (await fetch(`${base}/projects/2`)).text(), /data-testid="task-row"/);
    await stop();
    await start();
    assert.equal(await tasksPage(), renamedTaskDetail);
    assert.equal(await (await fetch(base)).text(), beforeTaskRenameList);
    await post(`${detailPath}/archive`, {});
    const archivedTaskDetail = await tasksPage();
    assert.equal((archivedTaskDetail.match(/name="title" type="text" disabled/g) || []).length, 2);
    assert.equal((archivedTaskDetail.match(/<button type="submit" disabled>Rename task/g) || []).length, 2);
    assert.equal((await post(taskRenamePath, { title: 'Blocked task rename' })).status, 403);
    assert.equal(await tasksPage(), archivedTaskDetail);
    await stop();
    await start();
    assert.equal(await tasksPage(), archivedTaskDetail);
    await post(`${detailPath}/restore`, {});
    assert.equal(await tasksPage(), renamedTaskDetail);
    const secondRenamePath = `${detailPath}/tasks/2/rename`;
    assert.equal((await post(secondRenamePath, { title: '  Renamed open task  ', filter: 'Open' })).status, 303);
    const finalDetail = await tasksPage();
    assert.equal(finalDetail, renamedTaskDetail.replaceAll('Second task', 'Renamed open task'));
    assert.match(await tasksPage('?filter=Open'), /Renamed open task/);
    assert.doesNotMatch(await tasksPage('?filter=Completed'), /Renamed open task/);
    assert.equal(await (await fetch(base)).text(), beforeTaskRenameList);
    await stop();
    await start();
    assert.equal(await tasksPage(), finalDetail);

    const priorityPath = completionPath.replace('/completion', '/priority');
    const normalOptions = '<option>Low</option><option selected>Normal</option><option>High</option>';
    const highOptions = '<option>Low</option><option>Normal</option><option selected>High</option>';
    const lowOptions = '<option selected>Low</option><option>Normal</option><option>High</option>';
    assert.equal(finalDetail.split(normalOptions).length - 1, 3);
    function replaceTaskOptions(html, id, before, after) {
      const prefix = `id="task-priority-${id}" name="priority" onchange="this.form.requestSubmit()">\n            `;
      assert.ok(html.includes(prefix + before));
      return html.replace(prefix + before, prefix + after);
    }
    assert.equal((finalDetail.match(/>Task priority<\/label>/g) || []).length, 2);
    const otherProjectBefore = await (await fetch(`${base}/projects/2`)).text();
    for (const priority of ['', 'Urgent', 'high']) {
      assert.equal((await post(priorityPath, { priority })).status, 400);
      assert.equal(await tasksPage(), finalDetail);
    }
    assert.equal((await post(priorityPath.replace('/projects/1/', '/projects/2/'), { priority: 'High' })).status, 404);
    assert.equal((await post(`${detailPath}/tasks/999999/priority`, { priority: 'High' })).status, 404);
    const priorityResponse = await post(priorityPath, { priority: 'High', filter: 'Completed' });
    assert.equal(priorityResponse.status, 303);
    assert.equal(priorityResponse.headers.get('location'), `${detailPath}?filter=Completed`);
    let prioritizedDetail = replaceTaskOptions(finalDetail, 1, normalOptions, highOptions);
    assert.equal(await tasksPage(), prioritizedDetail);
    assert.equal(await (await fetch(`${base}/projects/2`)).text(), otherProjectBefore);
    assert.equal(await (await fetch(base)).text(), beforeTaskRenameList);
    assert.match(await tasksPage('?filter=Completed'), /<option selected>High<\/option>/);
    assert.match(await tasksPage('?filter=Open'), /<option selected>Normal<\/option>/);
    await post(`${detailPath}/tasks/2/priority`, { priority: 'Low', filter: 'Open' });
    prioritizedDetail = replaceTaskOptions(prioritizedDetail, 2, normalOptions, lowOptions);
    assert.equal(await tasksPage(), prioritizedDetail);
    await post(taskRenamePath, { title: 'Priority preserved' });
    prioritizedDetail = prioritizedDetail.replaceAll('Renamed &lt;task&gt; &amp; &quot;title&quot;', 'Priority preserved');
    assert.equal(await tasksPage(), prioritizedDetail);
    await stop();
    await start();
    assert.equal(await tasksPage(), prioritizedDetail);
    assert.equal(await (await fetch(base)).text(), beforeTaskRenameList);
    await post(`${detailPath}/archive`, {});
    const archivedPriorities = await tasksPage();
    assert.equal((archivedPriorities.match(/name="priority" disabled/g) || []).length, 3);
    assert.equal((await post(priorityPath, { priority: 'Normal' })).status, 403);
    assert.equal(await tasksPage(), archivedPriorities);
    await stop();
    await start();
    assert.equal(await tasksPage(), archivedPriorities);
    await post(`${detailPath}/restore`, {});
    assert.equal(await tasksPage(), prioritizedDetail);
    await post(priorityPath, { priority: 'Normal' });
    assert.equal(await tasksPage(), replaceTaskOptions(prioritizedDetail, 1, highOptions, normalOptions));

    // Combine both filters, keeping creation order and independent selections.
    await post(`${detailPath}/tasks`, { title: 'Third high task' });
    await post(`${detailPath}/tasks/3/priority`, { priority: 'High' });
    await post(`${detailPath}/tasks`, { title: 'Fourth normal task' });
    const expectedTasks = [
      { title: 'Priority preserved', completed: true, priority: 'Normal' },
      { title: 'Renamed open task', completed: false, priority: 'Low' },
      { title: 'Third high task', completed: false, priority: 'High' },
      { title: 'Fourth normal task', completed: false, priority: 'Normal' },
    ];
    function visibleTitles(html) {
      return [...html.matchAll(/data-testid="task-row">\s*<span>([^<]+)<\/span>/g)].map((match) => match[1]);
    }
    function assertSelections(html, filter, priority) {
      assert.match(html, new RegExp(`id="task-filter"[^>]*>[\\s\\S]*?<option selected>${filter}</option>`));
      const options = html.match(/id="priority-filter"[^>]*>([\s\S]*?)<\/select>/)[1].trim();
      assert.equal(options, ['All', 'Low', 'Normal', 'High'].map((option) =>
        `<option${option === priority ? ' selected' : ''}>${option}</option>`).join(''));
    }
    const summaryBeforeFilters = await (await fetch(base)).text();
    for (const filter of ['All', 'Open', 'Completed']) {
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        const html = await tasksPage(`?filter=${filter}&priorityFilter=${priority}`);
        assertSelections(html, filter, priority);
        assert.deepEqual(visibleTitles(html), expectedTasks.filter((task) =>
          (filter === 'All' || task.completed === (filter === 'Completed'))
          && (priority === 'All' || task.priority === priority)).map((task) => task.title));
      }
    }
    assert.equal(await (await fetch(base)).text(), summaryBeforeFilters);
    assertSelections(await tasksPage(), 'All', 'All');
    const selection = { filter: 'Open', priorityFilter: 'High' };
    const changedPriority = await post(`${detailPath}/tasks/3/priority`, { ...selection, priority: 'Normal' });
    assert.equal(changedPriority.headers.get('location'), `${detailPath}?filter=Open&priorityFilter=High`);
    let filtered = await tasksPage('?filter=Open&priorityFilter=High');
    assertSelections(filtered, 'Open', 'High');
    assert.deepEqual(visibleTitles(filtered), []);
    await post(`${detailPath}/tasks/3/priority`, { ...selection, priority: 'High' });
    const renamedFiltered = await post(`${detailPath}/tasks/3/rename`, { ...selection, title: '  High renamed  ' });
    assert.equal(renamedFiltered.headers.get('location'), changedPriority.headers.get('location'));
    filtered = await tasksPage('?filter=Open&priorityFilter=High');
    assertSelections(filtered, 'Open', 'High');
    assert.deepEqual(visibleTitles(filtered), ['High renamed']);
    assert.match(filtered, /aria-label="Complete High renamed"/);
    const invalidRename = await post(`${detailPath}/tasks/3/rename`, { ...selection, title: ' ' });
    assert.equal(invalidRename.status, 400);
    assertSelections(await invalidRename.text(), 'Open', 'High');
    const changedCompletion = await post(`${detailPath}/tasks/3/completion`, { ...selection, completed: '1' });
    assert.equal(changedCompletion.headers.get('location'), changedPriority.headers.get('location'));
    filtered = await tasksPage('?filter=Open&priorityFilter=High');
    assertSelections(filtered, 'Open', 'High');
    assert.deepEqual(visibleTitles(filtered), []);
    const completedHigh = await tasksPage('?filter=Completed&priorityFilter=High');
    assert.deepEqual(visibleTitles(completedHigh), ['High renamed']);
    assert.match(await (await fetch(base)).text(), /project-summary">2\/4 completed/);
    await stop();
    await start();
    assert.equal(await tasksPage('?filter=Completed&priorityFilter=High'), completedHigh);
    await post(`${detailPath}/archive`, {});
    const archivedHigh = await tasksPage('?filter=Completed&priorityFilter=High');
    assertSelections(archivedHigh, 'Completed', 'High');
    assert.deepEqual(visibleTitles(archivedHigh), ['High renamed']);
    assert.match(archivedHigh, /name="priority" disabled/);
    assert.doesNotMatch(archivedHigh, /id="(?:task|priority)-filter"[^>]*disabled/);
    assert.deepEqual(visibleTitles(await tasksPage('?filter=Open&priorityFilter=Normal')), ['Fourth normal task']);
    await post(`${detailPath}/restore`, {});
    assert.equal(await tasksPage('?filter=Completed&priorityFilter=High'), completedHigh);

    // Defaults affect only future tasks in their own project, never existing rows.
    function defaultOptions(html) {
      return html.match(/id="default-task-priority"[^>]*>([\s\S]*?)<\/select>/)[1].trim();
    }
    assert.equal(defaultOptions(migratedTasks), normalOptions);
    assert.equal(defaultOptions(await tasksPage()), normalOptions);
    const allBeforeDefault = await tasksPage();
    const beforeDefault = await tasksPage('?filter=Completed&priorityFilter=High');
    const beforeDefaultSummary = await (await fetch(base)).text();
    const defaultPath = `${detailPath}/default-priority`;
    for (const priority of ['', 'Urgent', 'high']) {
      const invalid = await post(defaultPath, { ...selection, priority });
      assert.equal(invalid.status, 400);
      assertSelections(await invalid.text(), 'Open', 'High');
      assert.equal(await tasksPage('?filter=Completed&priorityFilter=High'), beforeDefault);
    }
    assert.equal((await post('/projects/999999/default-priority', { priority: 'High' })).status, 404);
    const defaultChanged = await post(defaultPath, { filter: 'Completed', priorityFilter: 'High', priority: 'High' });
    assert.equal(defaultChanged.status, 303);
    assert.equal(defaultChanged.headers.get('location'), `${detailPath}?filter=Completed&priorityFilter=High`);
    const afterDefault = await tasksPage('?filter=Completed&priorityFilter=High');
    assert.equal(defaultOptions(afterDefault), highOptions);
    assertSelections(afterDefault, 'Completed', 'High');
    assert.deepEqual(visibleTitles(afterDefault), visibleTitles(beforeDefault));
    assert.equal(afterDefault, beforeDefault.replace(normalOptions, highOptions));
    assert.equal(await tasksPage(), allBeforeDefault.replace(normalOptions, highOptions));
    assert.equal(await (await fetch(base)).text(), beforeDefaultSummary);
    assert.equal(defaultOptions(await (await fetch(`${base}/projects/2`)).text()), normalOptions);
    await post(`${detailPath}/tasks`, { title: 'Inherited high' });
    await post('/projects/2/tasks', { title: 'Independent normal' });
    assert.match(await tasksPage(), /id="task-priority-5"[^>]*>\s*<option>Low<\/option><option>Normal<\/option><option selected>High<\/option>/);
    const secondProject = await (await fetch(`${base}/projects/2`)).text();
    assert.match(secondProject, /id="task-priority-6"[^>]*>\s*<option>Low<\/option><option selected>Normal<\/option><option>High<\/option>/);
    await post(defaultPath, { ...selection, priority: 'Low' });
    assert.equal(defaultOptions(await tasksPage()), lowOptions);
    assert.match(await tasksPage(), /id="task-priority-5"[^>]*>\s*<option>Low<\/option><option>Normal<\/option><option selected>High<\/option>/);
    await post(`${detailPath}/tasks`, { title: 'Inherited low' });
    assert.match(await tasksPage(), /id="task-priority-7"[^>]*>\s*<option selected>Low<\/option><option>Normal<\/option><option>High<\/option>/);
    await post(`${detailPath}/rename`, { name: 'Default preserved' });
    const savedDefaults = await tasksPage();
    assert.equal(defaultOptions(savedDefaults), lowOptions);
    assert.match(await (await fetch(base)).text(), /project-summary">2\/6 completed/);
    await stop();
    await start();
    assert.equal(await tasksPage(), savedDefaults);
    // Another project's rename updates destination labels, not this project's task data.
    assert.equal(await (await fetch(`${base}/projects/2`)).text(), secondProject.replace('<option value="1">Restored name</option>', '<option value="1">Default preserved</option>'));
    await post(`${detailPath}/archive`, {});
    const archivedDefaults = await tasksPage('?filter=Open&priorityFilter=Low');
    assert.match(archivedDefaults, /id="default-task-priority" name="priority" disabled/);
    assert.equal(defaultOptions(archivedDefaults), lowOptions);
    assertSelections(archivedDefaults, 'Open', 'Low');
    assert.deepEqual(visibleTitles(archivedDefaults), ['Renamed open task', 'Inherited low']);
    assert.equal((await post(defaultPath, { priority: 'Normal' })).status, 403);
    assert.equal(await tasksPage('?filter=Open&priorityFilter=Low'), archivedDefaults);
    await stop();
    await start();
    assert.equal(await tasksPage('?filter=Open&priorityFilter=Low'), archivedDefaults);
    await post(`${detailPath}/restore`, {});
    assert.equal(await tasksPage(), savedDefaults);
    await post(`${detailPath}/tasks`, { title: 'Restored low' });
    assert.match(await tasksPage(), /id="task-priority-8"[^>]*>\s*<option selected>Low<\/option><option>Normal<\/option><option>High<\/option>/);
    await post(defaultPath, { priority: 'Normal' });
    assert.equal(defaultOptions(await tasksPage()), normalOptions);

    // Due dates edit a single calendar-day value without affecting any other data.
    const duePath = `${detailPath}/tasks/3/due-date`;
    const dueSelection = { filter: 'Completed', priorityFilter: 'High' };
    const dueQuery = '?filter=Completed&priorityFilter=High';
    const beforeDue = await tasksPage(dueQuery);
    const summaryBeforeDue = await (await fetch(base)).text();
    const otherBeforeDue = await (await fetch(`${base}/projects/2`)).text();
    const emptyDateInput = 'id="task-due-date-3" name="dueDate" type="text" value=""';
    const savedDateInput = 'id="task-due-date-3" name="dueDate" type="text" value="2000-02-29"';
    assert.ok(beforeDue.includes(emptyDateInput));
    const dueSaved = await post(duePath, { ...dueSelection, dueDate: '  2000-02-29  ' });
    assert.equal(dueSaved.status, 303);
    assert.equal(dueSaved.headers.get('location'), `${detailPath}?filter=Completed&priorityFilter=High`);
    let savedDue = beforeDue.replace(emptyDateInput, savedDateInput);
    assert.equal(await tasksPage(dueQuery), savedDue);
    assert.equal(await (await fetch(base)).text(), summaryBeforeDue);
    assert.equal(await (await fetch(`${base}/projects/2`)).text(), otherBeforeDue);
    assert.match(await tasksPage(), /id="task-due-date-8" name="dueDate" type="text" value=""/);
    for (const dueDate of ['1900-02-29', '2025-04-31', '0000-01-01', '10000-01-01', '2025-1-01', 'tomorrow', '2025-01-01T00:00:00Z']) {
      const invalid = await post(duePath, { ...dueSelection, dueDate });
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      assertSelections(html, 'Completed', 'High');
      assert.ok(html.includes(savedDateInput));
      assert.equal(await tasksPage(dueQuery), savedDue);
    }
    assert.equal((await post('/projects/2/tasks/3/due-date', { dueDate: '2025-01-01' })).status, 404);
    assert.equal((await post(`${detailPath}/tasks/999999/due-date`, { dueDate: '' })).status, 404);
    await post(`${detailPath}/tasks/3/rename`, { ...dueSelection, title: 'Dated task' });
    savedDue = savedDue.replaceAll('High renamed', 'Dated task');
    assert.equal(await tasksPage(dueQuery), savedDue);
    await stop();
    await start();
    assert.equal(await tasksPage(dueQuery), savedDue);
    await post(`${detailPath}/archive`, {});
    const archivedDates = await tasksPage(dueQuery);
    assert.match(archivedDates, /id="task-due-date-3" name="dueDate" type="text" value="2000-02-29" disabled/);
    assert.match(archivedDates, /<button type="submit" disabled>Save due date/);
    assertSelections(archivedDates, 'Completed', 'High');
    assert.equal((await post(duePath, { dueDate: '' })).status, 403);
    assert.equal(await tasksPage(dueQuery), archivedDates);
    await stop();
    await start();
    assert.equal(await tasksPage(dueQuery), archivedDates);
    await post(`${detailPath}/restore`, {});
    assert.equal(await tasksPage(dueQuery), savedDue);
    for (const dueDate of ['', ' \t\n ']) {
      const cleared = await post(duePath, { ...dueSelection, dueDate });
      assert.equal(cleared.status, 303);
      assert.equal(cleared.headers.get('location'), `${detailPath}?filter=Completed&priorityFilter=High`);
      assert.equal(await tasksPage(dueQuery), savedDue.replace(savedDateInput, emptyDateInput));
      await post(duePath, { ...dueSelection, dueDate: '2000-02-29' });
    }
    await post(duePath, { ...dueSelection, dueDate: '' });
    await stop();
    await start();
    assert.equal(await tasksPage(dueQuery), savedDue.replace(savedDateInput, emptyDateInput));
    assert.equal(await (await fetch(base)).text(), summaryBeforeDue);

    // Applied ranges intersect both filters and travel with every editing form.
    await post(duePath, { dueDate: '2000-02-29' });
    const rangeState = { ...dueSelection, dueFrom: '2000-02-29', dueThrough: '2000-02-29' };
    const apply = await post(`${detailPath}/due-range`, {
      ...dueSelection, from: ' 2000-02-29 ', through: '2000-02-29 ',
    });
    assert.equal(apply.status, 303);
    const rangeLocation = apply.headers.get('location');
    const rangeQuery = rangeLocation.slice(detailPath.length);
    assert.deepEqual(visibleTitles(await tasksPage(rangeQuery)), ['Dated task']);
    assert.match(await tasksPage(rangeQuery), /id="due-from" name="from" type="text" value="2000-02-29"/);
    for (const [from, through, message] of [
      ['1900-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['', '2000-04-31', 'Due range must use valid YYYY-MM-DD dates'],
      ['2000-03-01', '2000-02-29', 'Due from must not be after Due through'],
    ]) {
      const invalid = await post(`${detailPath}/due-range`, { ...rangeState, from, through });
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.ok(html.includes(`role="alert">${message}`));
      assert.deepEqual(visibleTitles(html), ['Dated task']);
      assertSelections(html, 'Completed', 'High');
    }
    for (const [suffix, fields] of [
      ['rename', { title: 'Range renamed' }],
      ['priority', { priority: 'High' }],
      ['completion', { completed: '1' }],
    ]) {
      const edited = await post(`${detailPath}/tasks/3/${suffix}`, { ...rangeState, ...fields });
      assert.equal(edited.headers.get('location'), rangeLocation);
    }
    for (const [suffix, fields] of [
      ['rename', { name: 'Range project' }],
      ['default-priority', { priority: 'Low' }],
      ['tasks', { title: 'Undated range task' }],
    ]) {
      const edited = await post(`${detailPath}/${suffix}`, { ...rangeState, ...fields });
      assert.equal(edited.headers.get('location'), rangeLocation);
    }
    assert.deepEqual(visibleTitles(await tasksPage(rangeQuery)), ['Range renamed']);
    await post(duePath, { ...rangeState, dueDate: '2000-03-01' });
    assert.deepEqual(visibleTitles(await tasksPage(rangeQuery)), []);
    assert.deepEqual(visibleTitles(await tasksPage('?filter=Completed&priorityFilter=High&dueFrom=2000-03-01')), ['Range renamed']);
    assert.deepEqual(visibleTitles(await tasksPage('?filter=Completed&priorityFilter=High&dueThrough=2000-03-01')), ['Range renamed']);
    await post(duePath, { ...rangeState, dueDate: '2000-02-29' });
    await post(`${detailPath}/archive`, {});
    const archivedRange = await tasksPage(rangeQuery);
    assert.deepEqual(visibleTitles(archivedRange), ['Range renamed']);
    assert.match(archivedRange, /id="due-from" name="from" type="text" value="2000-02-29">/);
    assert.equal((await post(`${detailPath}/due-range`, { ...rangeState, from: '', through: '' })).status, 303);
    await stop();
    await start();
    assert.equal(await tasksPage(rangeQuery), archivedRange);
    await post(`${detailPath}/restore`, {});
    assert.deepEqual(visibleTitles(await tasksPage(rangeQuery)), ['Range renamed']);
    assert.match(await tasksPage(), /id="due-from" name="from" type="text" value=""/);
    assert.ok(visibleTitles(await tasksPage()).includes('Undated range task'));
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
