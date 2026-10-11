import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';

test('projects and tasks: migration, validation, filters, archiving, renaming, priorities, defaults, summaries, and persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  // Start with the original schema to verify existing databases are upgraded.
  const legacy = new DatabaseSync(join(directory, 'projects.sqlite'));
  legacy.exec('CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
  legacy.close();
  let child;
  let baseUrl;

  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    baseUrl = await new Promise((resolve, reject) => {
      let output = '';
      let errors = '';
      const timeout = setTimeout(() => reject(new Error('Server startup timed out')), 5000);
      child.stderr.on('data', chunk => { errors += chunk; });
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
  }

  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }

  async function create(name) {
    return fetch(`${baseUrl}/projects`, {
      method: 'POST',
      body: new URLSearchParams({ name }),
      redirect: 'manual',
    });
  }

  try {
    await start();
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const initial = await (await fetch(baseUrl)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, /<button type="submit">Create project<\/button>/);
    assert.match(initial, /<label for="project-filter">Project filter<\/label>/);
    assert.match(initial, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);

    for (const name of ['', '   \t\n']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 422);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }

    const created = await create('  First project  ');
    assert.equal(created.status, 303);
    assert.equal(created.headers.get('location'), '/');
    await create('Second <project> & "team"');
    const listing = await (await fetch(baseUrl)).text();
    assert.equal((listing.match(/data-testid="project-row"/g) || []).length, 2);
    assert.equal((listing.match(/data-testid="project-summary">0\/0 completed/g) || []).length, 2);
    assert.equal((listing.match(/>Archive project<\/button>/g) || []).length, 2);
    assert.match(listing, /<span>First project<\/span>/);
    assert.match(listing, /Second &lt;project&gt; &amp; &quot;team&quot;/);
    assert.ok(listing.indexOf('First project') < listing.indexOf('Second &lt;project&gt;'));
    const paths = [...listing.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    assert.notEqual(paths[0], paths[1]);

    const detail = await (await fetch(`${baseUrl}${paths[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*<button type="submit">Projects<\/button>/);
    const rejectedAfterCreation = await create('  ');
    assert.equal((await rejectedAfterCreation.text()).match(/data-testid="project-row"/g).length, 2);
    assert.equal(await (await fetch(baseUrl)).text(), listing);

    async function post(path, fields) {
      return fetch(`${baseUrl}${path}`, {
        method: 'POST',
        body: new URLSearchParams(fields),
        redirect: 'manual',
      });
    }
    async function projectHtml(path = paths[0]) {
      return (await fetch(`${baseUrl}${path}`)).text();
    }
    function rows(html) {
      return [...html.matchAll(/<div class="card task" data-testid="task-row">([\s\S]*?)\n        <\/div>/g)]
        .map(match => match[1]);
    }
    assert.match(detail, /<label for="task-title">Task title<\/label>/);
    assert.match(detail, /<button type="submit">Create task<\/button>/);
    assert.match(detail, /<label for="task-filter">Task filter<\/label>/);
    assert.match(detail, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const invalid = await post(`${paths[0]}/tasks`, { title });
      assert.equal(invalid.status, 422);
      const html = await invalid.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(rows(html).length, 0);
    }
    const taskCreated = await post(`${paths[0]}/tasks`, { title: '  First task  ' });
    assert.equal(taskCreated.status, 303);
    assert.equal(taskCreated.headers.get('location'), paths[0]);
    await post(`${paths[0]}/tasks`, { title: 'Second <task> & "review"' });
    await post(`${paths[1]}/tasks`, { title: 'Other project task' });
    const taskListing = await projectHtml();
    const taskRows = rows(taskListing);
    assert.equal(taskRows.length, 2);
    assert.match(taskRows[0], /<span>First task<\/span>/);
    assert.match(taskRows[0], /type="checkbox".*aria-label="Complete First task"/);
    assert.match(taskRows[1], /aria-label="Complete Second &lt;task&gt; &amp; &quot;review&quot;"/);
    assert.ok(taskRows.every(row => !row.includes(' checked')));
    assert.doesNotMatch(taskListing, /Other project task/);
    assert.equal(rows(await projectHtml(paths[1])).length, 1);
    const invalidWithTasks = await post(`${paths[0]}/tasks`, { title: '  ' });
    assert.equal(rows(await invalidWithTasks.text()).length, 2);
    assert.equal(await projectHtml(), taskListing);

    const completionPath = /action="([^"]+\/completion)"/.exec(taskRows[0])[1];
    const completed = await post(completionPath, { completed: '1' });
    assert.equal(completed.status, 303);
    assert.match(rows(await projectHtml())[0], / checked/);
    assert.equal(rows(await projectHtml(`${paths[0]}?filter=Open`)).length, 1);
    assert.match(rows(await projectHtml(`${paths[0]}?filter=Open`))[0], /Second &lt;task&gt;/);
    const completedHtml = await projectHtml(`${paths[0]}?filter=Completed`);
    assert.equal(rows(completedHtml).length, 1);
    assert.match(rows(completedHtml)[0], /First task/);
    assert.match(completedHtml, /<option selected>Completed<\/option>/);

    // A task cannot be changed through another project's URL.
    const foreignCompletionPath = completionPath.replace(paths[0], paths[1]);
    assert.equal((await post(foreignCompletionPath, {})).status, 404);
    assert.match(rows(await projectHtml())[0], / checked/);
    const unchecked = await post(completionPath, { filter: 'Completed' });
    assert.equal(unchecked.headers.get('location'), `${paths[0]}?filter=Completed`);
    assert.equal(rows(await projectHtml(`${paths[0]}?filter=Completed`)).length, 0);
    assert.equal(rows(await projectHtml(`${paths[0]}?filter=Open`)).length, 2);
    await post(completionPath, { completed: '1' });
    const savedDetail = await projectHtml();
    const otherDetail = await projectHtml(paths[1]);
    const savedListing = await (await fetch(baseUrl)).text();
    assert.match(savedListing, /data-testid="project-summary">1\/2 completed/);
    assert.match(savedListing, /data-testid="project-summary">0\/1 completed/);

    await stop();
    await start();
    assert.equal(await (await fetch(baseUrl)).text(), savedListing);
    assert.equal(await projectHtml(), savedDetail);
    assert.equal(await projectHtml(paths[1]), otherDetail);
    assert.equal(await projectHtml(`${paths[0]}?filter=Completed`), completedHtml);
    await post(completionPath, {});
    assert.ok(rows(await projectHtml()).every(row => !row.includes(' checked')));
    assert.match(await (await fetch(baseUrl)).text(), /data-testid="project-summary">0\/2 completed/);
    await post(completionPath, { completed: '1' });

    const archived = await post(`${paths[0]}/archive`, {});
    assert.equal(archived.status, 303);
    assert.equal(archived.headers.get('location'), '/');
    const activeListing = await (await fetch(baseUrl)).text();
    assert.doesNotMatch(activeListing, /First project/);
    assert.match(activeListing, /Second &lt;project&gt;/);
    const archivedListing = await (await fetch(`${baseUrl}/?filter=Archived`)).text();
    assert.match(archivedListing, /<option>Active<\/option><option selected>Archived<\/option>/);
    assert.equal((archivedListing.match(/data-testid="project-row"/g) || []).length, 1);
    assert.match(archivedListing, /First project/);
    assert.doesNotMatch(archivedListing, /Second &lt;project&gt;/);
    assert.match(archivedListing, /data-testid="project-summary">1\/2 completed/);
    assert.match(archivedListing, /action="\/projects\/1"/);
    assert.match(archivedListing, />Open project<\/button>/);
    assert.match(archivedListing, />Restore project<\/button>/);
    assert.doesNotMatch(archivedListing, />Archive project<\/button>/);

    const archivedDetail = await projectHtml();
    assert.match(archivedDetail, /<p>Archived project<\/p>/);
    assert.match(archivedDetail, /<button type="submit" disabled>Create task<\/button>/);
    assert.equal(rows(archivedDetail).length, 2);
    assert.ok(rows(archivedDetail).every(row => /type="checkbox"[^>]* disabled/.test(row)));
    assert.match(rows(archivedDetail)[0], / checked/);
    assert.equal(rows(await projectHtml(`${paths[0]}?filter=Open`)).length, 1);
    assert.equal(rows(await projectHtml(`${paths[0]}?filter=Completed`)).length, 1);
    assert.equal((await post(`${paths[0]}/tasks`, { title: 'Blocked task' })).status, 403);
    assert.equal((await post(completionPath, {})).status, 403);
    assert.equal(await projectHtml(), archivedDetail);
    assert.equal(await projectHtml(paths[1]), otherDetail);

    await stop();
    await start();
    assert.equal(await (await fetch(baseUrl)).text(), activeListing);
    assert.equal(await (await fetch(`${baseUrl}/?filter=Archived`)).text(), archivedListing);
    assert.equal(await projectHtml(), archivedDetail);

    const restored = await post(`${paths[0]}/restore`, {});
    assert.equal(restored.status, 303);
    assert.equal(restored.headers.get('location'), '/?filter=Archived');
    assert.equal(await (await fetch(baseUrl)).text(), savedListing);
    assert.doesNotMatch(await (await fetch(`${baseUrl}/?filter=Archived`)).text(), /data-testid="project-row"/);
    assert.equal(await projectHtml(), savedDetail);
    await stop();
    await start();
    assert.equal(await (await fetch(baseUrl)).text(), savedListing);
    assert.equal(await projectHtml(), savedDetail);
    await post(completionPath, {});
    assert.ok(rows(await projectHtml()).every(row => !row.includes(' checked')));
    assert.equal((await post(`${paths[0]}/tasks`, { title: 'After restoration' })).status, 303);
    assert.equal(rows(await projectHtml()).length, 3);
    assert.match(await (await fetch(baseUrl)).text(), /data-testid="project-summary">0\/3 completed/);

    await post(completionPath, { completed: '1' });
    const beforeRename = await projectHtml();
    const tasksBeforeRename = rows(beforeRename);
    assert.match(beforeRename, /<label for="new-project-name">New project name<\/label>/);
    assert.match(beforeRename, /<input id="new-project-name"[^>]*>/);
    assert.match(beforeRename, /<button type="submit">Rename project<\/button>/);
    for (const name of ['', ' \t\n ']) {
      const invalidRename = await post(`${paths[0]}/rename`, { name });
      assert.equal(invalidRename.status, 422);
      const html = await invalidRename.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.match(html, /<h1>First project<\/h1>/);
      assert.deepEqual(rows(html), tasksBeforeRename);
      assert.equal(await projectHtml(), beforeRename);
    }
    const renamed = await post(`${paths[0]}/rename`, {
      name: '  Renamed <project> & "team"  ', filter: 'Completed',
    });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), `${paths[0]}?filter=Completed`);
    const renamedDetail = await projectHtml();
    assert.match(renamedDetail, /<h1>Renamed &lt;project&gt; &amp; &quot;team&quot;<\/h1>/);
    assert.deepEqual(rows(renamedDetail), tasksBeforeRename);
    const renamedListing = await (await fetch(baseUrl)).text();
    assert.doesNotMatch(renamedListing, /First project/);
    assert.match(renamedListing, /data-testid="project-summary">1\/3 completed/);
    assert.ok(renamedListing.indexOf('Renamed &lt;project&gt;') < renamedListing.indexOf('Second &lt;project&gt;'));
    assert.deepEqual([...renamedListing.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]), paths);
    assert.equal(await projectHtml(paths[1]), otherDetail);
    await stop();
    await start();
    assert.equal(await projectHtml(), renamedDetail);
    assert.equal(await (await fetch(baseUrl)).text(), renamedListing);

    await post(`${paths[0]}/archive`, {});
    const archivedRenamedDetail = await projectHtml();
    assert.match(archivedRenamedDetail, /<input id="new-project-name"[^>]* disabled>/);
    assert.match(archivedRenamedDetail, /<button type="submit" disabled>Rename project<\/button>/);
    assert.equal((await post(`${paths[0]}/rename`, { name: 'Blocked rename' })).status, 403);
    assert.equal(await projectHtml(), archivedRenamedDetail);
    await stop();
    await start();
    assert.equal(await projectHtml(), archivedRenamedDetail);
    await post(`${paths[0]}/restore`, {});
    assert.equal(await projectHtml(), renamedDetail);
    assert.equal((await post(`${paths[0]}/rename`, { name: '  Restored name  ' })).status, 303);
    assert.match(await projectHtml(), /<h1>Restored name<\/h1>/);
    assert.deepEqual(rows(await projectHtml()), tasksBeforeRename);
    const restoredRenamedListing = await (await fetch(baseUrl)).text();
    assert.match(restoredRenamedListing, /data-testid="project-summary">1\/3 completed/);
    await stop();
    await start();
    assert.match(await projectHtml(), /<h1>Restored name<\/h1>/);
    assert.deepEqual(rows(await projectHtml()), tasksBeforeRename);
    assert.equal(await (await fetch(baseUrl)).text(), restoredRenamedListing);

    const taskRenamePath = completionPath.replace('/completion', '/rename');
    const beforeTaskRename = await projectHtml();
    for (const row of rows(beforeTaskRename)) {
      assert.match(row, /<label for="new-task-title-\d+">New task title<\/label>/);
      assert.match(row, /<input id="new-task-title-\d+" name="title" type="text">/);
      assert.match(row, /<button type="submit">Rename task<\/button>/);
    }
    for (const title of ['', ' \t\n ']) {
      const invalid = await post(taskRenamePath, { title, filter: 'Completed' });
      assert.equal(invalid.status, 422);
      const html = await invalid.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.equal(rows(html).length, 1);
      assert.match(rows(html)[0], /aria-label="Complete First task" checked/);
      assert.equal(await projectHtml(), beforeTaskRename);
    }
    const taskRenamed = await post(taskRenamePath, {
      title: '  Renamed <task> & "review"  ', filter: 'Completed',
    });
    assert.equal(taskRenamed.status, 303);
    assert.equal(taskRenamed.headers.get('location'), `${paths[0]}?filter=Completed`);
    const renamedTaskDetail = await projectHtml();
    const renamedTaskRows = rows(renamedTaskDetail);
    assert.equal(renamedTaskRows.length, 3);
    assert.match(renamedTaskRows[0], /<span>Renamed &lt;task&gt; &amp; &quot;review&quot;<\/span>/);
    assert.match(renamedTaskRows[0], /aria-label="Complete Renamed &lt;task&gt; &amp; &quot;review&quot;" checked/);
    assert.ok(renamedTaskRows[0].includes(`action="${completionPath}"`));
    assert.deepEqual(renamedTaskRows.slice(1), rows(beforeTaskRename).slice(1));
    assert.deepEqual(rows(await projectHtml(`${paths[0]}?filter=Completed`)),
      [renamedTaskRows[0].replaceAll('name="filter" value="All"', 'name="filter" value="Completed"')]);
    assert.deepEqual(rows(await projectHtml(`${paths[0]}?filter=Open`)),
      renamedTaskRows.slice(1).map(row => row.replaceAll('name="filter" value="All"', 'name="filter" value="Open"')));
    assert.equal(await (await fetch(baseUrl)).text(), restoredRenamedListing);
    assert.equal(await projectHtml(paths[1]), otherDetail);
    assert.equal((await post(taskRenamePath.replace(paths[0], paths[1]), { title: 'Foreign rename' })).status, 404);
    assert.equal((await post(`${paths[0]}/tasks/999999/rename`, { title: 'Missing task' })).status, 404);
    assert.equal(await projectHtml(), renamedTaskDetail);
    await stop();
    await start();
    assert.equal(await projectHtml(), renamedTaskDetail);
    assert.equal(await (await fetch(baseUrl)).text(), restoredRenamedListing);

    await post(`${paths[0]}/archive`, {});
    const archivedTaskDetail = await projectHtml();
    for (const row of rows(archivedTaskDetail)) {
      assert.match(row, /<input id="new-task-title-\d+"[^>]* disabled>/);
      assert.match(row, /<button type="submit" disabled>Rename task<\/button>/);
    }
    assert.equal((await post(taskRenamePath, { title: 'Blocked task rename' })).status, 403);
    assert.equal(await projectHtml(), archivedTaskDetail);
    await stop();
    await start();
    assert.equal(await projectHtml(), archivedTaskDetail);
    await post(`${paths[0]}/restore`, {});
    assert.equal(await projectHtml(), renamedTaskDetail);
    assert.equal((await post(taskRenamePath, { title: '  Restored task title  ' })).status, 303);
    const restoredTaskDetail = await projectHtml();
    assert.match(rows(restoredTaskDetail)[0], /aria-label="Complete Restored task title" checked/);
    assert.equal(await (await fetch(baseUrl)).text(), restoredRenamedListing);
    await stop();
    await start();
    assert.equal(await projectHtml(), restoredTaskDetail);

    const priorityPath = completionPath.replace('/completion', '/priority');
    const secondPriorityPath = /action="([^"]+\/priority)"/.exec(rows(restoredTaskDetail)[1])[1];
    function priorityOptions(row) {
      return /<select id="task-priority-\d+"[^>]*>([\s\S]*?)<\/select>/.exec(row)[1].trim();
    }
    for (const row of rows(restoredTaskDetail)) {
      assert.match(row, /<label for="task-priority-\d+">Task priority<\/label>/);
      assert.equal(priorityOptions(row), '<option>Low</option><option selected>Normal</option><option>High</option>');
    }
    const priorityChanged = await post(priorityPath, { priority: 'High', filter: 'Completed' });
    assert.equal(priorityChanged.status, 303);
    assert.equal(priorityChanged.headers.get('location'), `${paths[0]}?filter=Completed`);
    const highDetail = await projectHtml();
    // Priority changes only the selected option, preserving identity, title, and completion.
    assert.equal(highDetail, restoredTaskDetail.replace(rows(restoredTaskDetail)[0], rows(restoredTaskDetail)[0].replace(
      '<option>Low</option><option selected>Normal</option><option>High</option>',
      '<option>Low</option><option>Normal</option><option selected>High</option>')));
    assert.equal(rows(await projectHtml(`${paths[0]}?filter=Completed`)).length, 1);
    assert.equal(rows(await projectHtml(`${paths[0]}?filter=Open`)).length, 2);
    assert.equal(await (await fetch(baseUrl)).text(), restoredRenamedListing);
    assert.equal(await projectHtml(paths[1]), otherDetail);
    await post(secondPriorityPath, { priority: 'Low' });
    const mixedPriorities = await projectHtml();
    assert.equal(priorityOptions(rows(mixedPriorities)[0]), '<option>Low</option><option>Normal</option><option selected>High</option>');
    assert.equal(priorityOptions(rows(mixedPriorities)[1]), '<option selected>Low</option><option>Normal</option><option>High</option>');
    assert.equal(priorityOptions(rows(mixedPriorities)[2]), '<option>Low</option><option selected>Normal</option><option>High</option>');
    for (const priority of ['', 'Urgent', 'high']) {
      assert.equal((await post(priorityPath, { priority })).status, 422);
      assert.equal(await projectHtml(), mixedPriorities);
    }
    assert.equal((await post(priorityPath.replace(paths[0], paths[1]), { priority: 'Low' })).status, 404);
    assert.equal((await post(`${paths[0]}/tasks/999999/priority`, { priority: 'Low' })).status, 404);
    assert.equal(await projectHtml(), mixedPriorities);
    await post(taskRenamePath, { title: 'Priority retained' });
    const priorityRenamed = await projectHtml();
    assert.match(rows(priorityRenamed)[0], /aria-label="Complete Priority retained" checked/);
    assert.equal(priorityOptions(rows(priorityRenamed)[0]), priorityOptions(rows(mixedPriorities)[0]));
    assert.equal(await (await fetch(baseUrl)).text(), restoredRenamedListing);
    await stop();
    await start();
    assert.equal(await projectHtml(), priorityRenamed);
    assert.equal(await projectHtml(paths[1]), otherDetail);
    await post(`${paths[0]}/archive`, {});
    const archivedPriorities = await projectHtml();
    assert.ok(rows(archivedPriorities).every(row => /<select id="task-priority-\d+"[^>]* disabled/.test(row)));
    assert.equal((await post(priorityPath, { priority: 'Low' })).status, 403);
    assert.equal(await projectHtml(), archivedPriorities);
    await stop();
    await start();
    assert.equal(await projectHtml(), archivedPriorities);
    await post(`${paths[0]}/restore`, {});
    assert.equal(await projectHtml(), priorityRenamed);
    await post(priorityPath, { priority: 'Normal' });
    assert.equal(priorityOptions(rows(await projectHtml())[0]), '<option>Low</option><option selected>Normal</option><option>High</option>');
    assert.equal(priorityOptions(rows(await projectHtml())[1]), priorityOptions(rows(mixedPriorities)[1]));
    await post(`${paths[0]}/tasks`, { title: 'New normal task' });
    assert.equal(priorityOptions(rows(await projectHtml())[3]), '<option>Low</option><option selected>Normal</option><option>High</option>');
    // Combined filters intersect without changing task data or summary counts.
    await post(priorityPath, { priority: 'High' });
    const combinedSummary = await (await fetch(baseUrl)).text();
    function selectedFilter(html, id) {
      const options = new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`).exec(html)[1];
      return /<option selected>([^<]+)<\/option>/.exec(options)[1];
    }
    function taskTitles(html) {
      return rows(html).map(row => /<span>([^<]+)<\/span>/.exec(row)[1]);
    }
    const expectedTasks = [
      { title: 'Priority retained', completed: true, priority: 'High' },
      { title: 'Second &lt;task&gt; &amp; &quot;review&quot;', completed: false, priority: 'Low' },
      { title: 'After restoration', completed: false, priority: 'Normal' },
      { title: 'New normal task', completed: false, priority: 'Normal' },
    ];
    for (const filter of ['All', 'Open', 'Completed']) {
      for (const priorityFilter of ['All', 'Low', 'Normal', 'High']) {
        const html = await projectHtml(`${paths[0]}?${new URLSearchParams({ filter, priorityFilter })}`);
        assert.equal(selectedFilter(html, 'task-filter'), filter);
        assert.equal(selectedFilter(html, 'priority-filter'), priorityFilter);
        assert.deepEqual(taskTitles(html), expectedTasks.filter(task =>
          (filter === 'All' || task.completed === (filter === 'Completed')) &&
          (priorityFilter === 'All' || task.priority === priorityFilter)).map(task => task.title));
      }
    }
    assert.equal(await (await fetch(baseUrl)).text(), combinedSummary);
    const combinedUrl = `${paths[0]}?filter=Open&priorityFilter=Low`;
    const combinedHtml = await projectHtml(combinedUrl);
    const filterForm = /<form class="filter" method="get"[^>]*>([\s\S]*?)<\/form>/.exec(combinedHtml)[1];
    assert.match(filterForm, /id="task-filter"[^>]*onchange="this.form.requestSubmit\(\)"/);
    assert.match(filterForm, /id="priority-filter"[^>]*onchange="this.form.requestSubmit\(\)"/);
    assert.match(filterForm, /<option>All<\/option><option selected>Low<\/option><option>Normal<\/option><option>High<\/option>/);
    for (const form of rows(combinedHtml)[0].matchAll(/<form[^>]*>([\s\S]*?)<\/form>/g)) {
      assert.match(form[1], /name="filter" value="Open"/);
      assert.match(form[1], /name="priorityFilter" value="Low"/);
    }
    const secondRenamePath = secondPriorityPath.replace('/priority', '/rename');
    const secondCompletionPath = secondPriorityPath.replace('/priority', '/completion');
    const filters = { filter: 'Open', priorityFilter: 'Low' };
    const invalidCombinedRename = await post(secondRenamePath, { ...filters, title: '  ' });
    assert.equal(invalidCombinedRename.status, 422);
    const invalidCombinedHtml = await invalidCombinedRename.text();
    assert.match(invalidCombinedHtml, /role="alert">Task title is required/);
    assert.equal(selectedFilter(invalidCombinedHtml, 'task-filter'), 'Open');
    assert.equal(selectedFilter(invalidCombinedHtml, 'priority-filter'), 'Low');
    const combinedRename = await post(secondRenamePath, { ...filters, title: '  Low renamed task  ' });
    assert.equal(combinedRename.headers.get('location'), combinedUrl);
    assert.deepEqual(taskTitles(await projectHtml(combinedUrl)), ['Low renamed task']);
    assert.match(rows(await projectHtml(combinedUrl))[0], /aria-label="Complete Low renamed task"/);
    assert.equal(await (await fetch(baseUrl)).text(), combinedSummary);
    const movedPriority = await post(secondPriorityPath, { ...filters, priority: 'High' });
    assert.equal(movedPriority.headers.get('location'), combinedUrl);
    assert.equal(rows(await projectHtml(combinedUrl)).length, 0);
    await post(secondPriorityPath, { ...filters, priority: 'Low' });
    const movedCompletion = await post(secondCompletionPath, { ...filters, completed: '1' });
    assert.equal(movedCompletion.headers.get('location'), combinedUrl);
    assert.equal(rows(await projectHtml(combinedUrl)).length, 0);
    const completedLowUrl = `${paths[0]}?filter=Completed&priorityFilter=Low`;
    const savedCombined = await projectHtml(completedLowUrl);
    assert.deepEqual(taskTitles(savedCombined), ['Low renamed task']);
    assert.match(await (await fetch(baseUrl)).text(), /data-testid="project-summary">2\/4 completed/);
    await stop();
    await start();
    assert.equal(await projectHtml(completedLowUrl), savedCombined);
    const defaultFilters = await projectHtml();
    assert.equal(selectedFilter(defaultFilters, 'task-filter'), 'All');
    assert.equal(selectedFilter(defaultFilters, 'priority-filter'), 'All');
    assert.equal(rows(defaultFilters).length, 4);
    await post(`${paths[0]}/archive`, {});
    const archivedCombined = await projectHtml(completedLowUrl);
    assert.deepEqual(taskTitles(archivedCombined), ['Low renamed task']);
    for (const id of ['task-filter', 'priority-filter']) {
      assert.doesNotMatch(new RegExp(`<select id="${id}"[^>]*>`).exec(archivedCombined)[0], /disabled/);
    }
    assert.match(rows(archivedCombined)[0], /type="checkbox"[^>]* disabled/);
    assert.match(rows(archivedCombined)[0], /<select id="task-priority-\d+"[^>]* disabled/);
    assert.match(rows(archivedCombined)[0], /<input id="new-task-title-\d+"[^>]* disabled/);
    assert.equal(rows(await projectHtml(combinedUrl)).length, 0);
    await stop();
    await start();
    assert.equal(await projectHtml(completedLowUrl), archivedCombined);
    await post(`${paths[0]}/restore`, {});
    assert.equal(await projectHtml(completedLowUrl), savedCombined);
    const uncheckedLow = await post(secondCompletionPath, { filter: 'Completed', priorityFilter: 'Low' });
    assert.equal(uncheckedLow.headers.get('location'), completedLowUrl);
    assert.equal(rows(await projectHtml(completedLowUrl)).length, 0);
    assert.deepEqual(taskTitles(await projectHtml(combinedUrl)), ['Low renamed task']);

    // Project defaults affect only subsequent tasks and preserve selected filters.
    function defaultOptions(html) {
      return /<select id="default-task-priority"[^>]*>([\s\S]*?)<\/select>/.exec(html)[1].trim();
    }
    const normalOptions = '<option>Low</option><option selected>Normal</option><option>High</option>';
    const highOptions = '<option>Low</option><option>Normal</option><option selected>High</option>';
    const lowOptions = '<option selected>Low</option><option>Normal</option><option>High</option>';
    const defaultPath = `${paths[0]}/default-task-priority`;
    const beforeDefault = await projectHtml(combinedUrl);
    const beforeDefaultRows = rows(await projectHtml());
    const beforeDefaultSummary = await (await fetch(baseUrl)).text();
    const otherBeforeDefault = await projectHtml(paths[1]);
    assert.match(beforeDefault, /<label for="default-task-priority">Default task priority<\/label>/);
    assert.equal(defaultOptions(beforeDefault), normalOptions);
    assert.equal(defaultOptions(otherBeforeDefault), normalOptions);
    const defaultForm = /<form[^>]*action="[^\"]+\/default-task-priority">([\s\S]*?)<\/form>/.exec(beforeDefault)[1];
    assert.match(defaultForm, /name="filter" value="Open"/);
    assert.match(defaultForm, /name="priorityFilter" value="Low"/);
    assert.match(defaultForm, /onchange="this.form.requestSubmit\(\)"/);
    const defaultChanged = await post(defaultPath, { ...filters, priority: 'High' });
    assert.equal(defaultChanged.status, 303);
    assert.equal(defaultChanged.headers.get('location'), combinedUrl);
    const highDefault = await projectHtml(combinedUrl);
    assert.equal(defaultOptions(highDefault), highOptions);
    assert.equal(selectedFilter(highDefault, 'task-filter'), 'Open');
    assert.equal(selectedFilter(highDefault, 'priority-filter'), 'Low');
    assert.deepEqual(rows(highDefault), rows(beforeDefault));
    assert.deepEqual(rows(await projectHtml()), beforeDefaultRows);
    assert.equal(await (await fetch(baseUrl)).text(), beforeDefaultSummary);
    assert.equal(await projectHtml(paths[1]), otherBeforeDefault);
    for (const priority of ['', 'Urgent', 'high']) {
      assert.equal((await post(defaultPath, { ...filters, priority })).status, 422);
      assert.equal(await projectHtml(combinedUrl), highDefault);
    }
    await stop();
    await start();
    assert.equal(await projectHtml(combinedUrl), highDefault);
    const inherited = await post(`${paths[0]}/tasks`, { ...filters, title: '  Inherited high  ' });
    assert.equal(inherited.headers.get('location'), combinedUrl);
    assert.deepEqual(rows(await projectHtml(combinedUrl)), rows(highDefault));
    let defaultRows = rows(await projectHtml());
    assert.deepEqual(defaultRows.slice(0, 4), beforeDefaultRows);
    assert.match(defaultRows[4], /aria-label="Complete Inherited high" onchange/);
    assert.equal(priorityOptions(defaultRows[4]), highOptions);
    await post(defaultPath, { ...filters, priority: 'Low' });
    assert.deepEqual(rows(await projectHtml()), defaultRows);
    await post(`${paths[0]}/tasks`, { title: 'Inherited low' });
    defaultRows = rows(await projectHtml());
    assert.equal(priorityOptions(defaultRows[4]), highOptions);
    assert.equal(priorityOptions(defaultRows[5]), lowOptions);
    await post(`${paths[1]}/default-task-priority`, { priority: 'High' });
    await post(`${paths[1]}/tasks`, { title: 'Other inherited high' });
    assert.equal(defaultOptions(await projectHtml()), lowOptions);
    assert.equal(priorityOptions(rows(await projectHtml(paths[1]))[0]), normalOptions);
    assert.equal(priorityOptions(rows(await projectHtml(paths[1]))[1]), highOptions);
    await create('Third project');
    const thirdPath = [...(await (await fetch(baseUrl)).text()).matchAll(/action="(\/projects\/\d+)"/g)][2][1];
    assert.equal(defaultOptions(await projectHtml(thirdPath)), normalOptions);
    await post(`${paths[0]}/rename`, { ...filters, name: 'Default retained' });
    assert.equal(defaultOptions(await projectHtml()), lowOptions);
    assert.deepEqual(rows(await projectHtml()), defaultRows);
    const savedDefaultDetail = await projectHtml(combinedUrl);
    const savedDefaultSummary = await (await fetch(baseUrl)).text();
    assert.match(savedDefaultSummary, /data-testid="project-summary">1\/6 completed/);
    await stop();
    await start();
    assert.equal(await projectHtml(combinedUrl), savedDefaultDetail);
    assert.equal(await (await fetch(baseUrl)).text(), savedDefaultSummary);
    await post(`${paths[0]}/archive`, {});
    const archivedDefault = await projectHtml(combinedUrl);
    assert.equal(defaultOptions(archivedDefault), lowOptions);
    assert.match(archivedDefault, /<select id="default-task-priority"[^>]* disabled/);
    assert.equal((await post(defaultPath, { ...filters, priority: 'High' })).status, 403);
    assert.equal(await projectHtml(combinedUrl), archivedDefault);
    await stop();
    await start();
    assert.equal(await projectHtml(combinedUrl), archivedDefault);
    await post(`${paths[0]}/restore`, {});
    assert.equal(await projectHtml(combinedUrl), savedDefaultDetail);
    await post(`${paths[0]}/tasks`, { title: 'Restored inherited low' });
    assert.equal(priorityOptions(rows(await projectHtml())[6]), lowOptions);
    await post(defaultPath, { priority: 'Normal' });
    await post(`${paths[0]}/tasks`, { title: 'Inherited normal' });
    assert.equal(priorityOptions(rows(await projectHtml())[7]), normalOptions);
    assert.equal((await post('/projects/999999/default-task-priority', { priority: 'High' })).status, 404);

    assert.equal((await fetch(`${baseUrl}/projects/999999`)).status, 404);
    assert.equal((await post('/projects/999999/rename', { name: 'Missing project' })).status, 404);
    assert.equal((await post('/projects/999999/tasks', { title: 'Missing project' })).status, 404);
    assert.equal((await post('/projects/999999/archive', {})).status, 404);
    assert.equal((await post('/projects/999999/restore', {})).status, 404);

    // Replace the fixture with a populated Task 005 database to check backfilled priorities.
    await stop();
    await rm(join(directory, 'projects.sqlite'));
    const previous = new DatabaseSync(join(directory, 'projects.sqlite'));
    previous.exec(`
      CREATE TABLE projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))
      );
      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
      );
      INSERT INTO projects (id, name) VALUES (17, 'Existing project');
      INSERT INTO tasks (id, project_id, title, completed) VALUES
        (23, 17, 'Existing completed task', 1), (24, 17, 'Existing open task', 0);
    `);
    previous.close();
    await start();
    const migratedDetail = await projectHtml('/projects/17');
    assert.equal(defaultOptions(migratedDetail), normalOptions);
    assert.equal(rows(migratedDetail).length, 2);
    assert.match(rows(migratedDetail)[0], /aria-label="Complete Existing completed task" checked/);
    assert.match(rows(migratedDetail)[1], /aria-label="Complete Existing open task" onchange/);
    for (const row of rows(migratedDetail)) {
      assert.equal(priorityOptions(row), '<option>Low</option><option selected>Normal</option><option>High</option>');
    }
    assert.match(await (await fetch(baseUrl)).text(), /data-testid="project-summary">1\/2 completed/);
    assert.equal((await post('/projects/17/tasks/23/priority', { priority: 'High' })).status, 303);
    const migratedUpdated = await projectHtml('/projects/17');
    await stop();
    await start();
    assert.equal(await projectHtml('/projects/17'), migratedUpdated);
    // A populated Task 007 database already has task priorities but no project defaults.
    await stop();
    const task007 = new DatabaseSync(join(directory, 'projects.sqlite'));
    task007.exec('ALTER TABLE projects DROP COLUMN default_task_priority');
    task007.close();
    await start();
    assert.equal(await projectHtml('/projects/17'), migratedUpdated);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
