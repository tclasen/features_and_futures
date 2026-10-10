import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';

test('projects and tasks: validation, filtering, archive, project/task rename, priorities, summaries, migration, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  // Start with the previous schema to exercise migration of existing databases.
  const previousDb = new DatabaseSync(join(directory, 'projects.sqlite'));
  previousDb.exec('CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
  previousDb.close();
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  let output = '';

  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await fetch(`${base}/health`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'ok' });
        return;
      } catch {
        if (child.exitCode !== null) throw new Error(`Server exited: ${output}`);
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    }
    throw new Error(`Server did not start: ${output}`);
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
      method: 'POST',
      body: new URLSearchParams({ name }),
      redirect: 'manual',
    });
  }

  try {
    await start();
    const initial = await (await fetch(base)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.equal((initial.match(/data-testid="project-row"/g) || []).length, 0);
    assert.match(initial, /<label for="project-filter">Project filter<\/label>/);
    assert.match(initial, /<option selected>Active<\/option><option>Archived<\/option>/);

    for (const blank of ['', '  \t\n ']) {
      const response = await create(blank);
      const html = await response.text();
      assert.equal(response.status, 422);
      assert.match(html, /role="alert">Project name is required/);
      assert.equal((html.match(/data-testid="project-row"/g) || []).length, 0);
    }

    for (const name of ['  First project  ', 'Second <project> 🎉']) {
      const response = await create(name);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    const html = await (await fetch(base)).text();
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.equal((html.match(/data-testid="project-summary">0\/0 completed/g) || []).length, 2);
    assert.equal((html.match(/>Archive project<\/button>/g) || []).length, 2);
    assert.doesNotMatch(html, />Restore project<\/button>/);
    assert.match(html, />First project<\/span>/);
    assert.match(html, /Second &lt;project&gt; 🎉/);
    assert.ok(html.indexOf('First project') < html.indexOf('Second &lt;project&gt;'));
    const ids = [...html.matchAll(/action="\/projects\/(\d+)"/g)].map(match => match[1]);
    assert.equal(ids.length, 2);
    assert.notEqual(ids[0], ids[1]);
    const detail = await (await fetch(`${base}/projects/${ids[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*>Projects<\/button>/);

    async function post(path, fields) {
      return fetch(`${base}${path}`, {
        method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
      });
    }
    async function projectHtml(id, filter = 'All') {
      return (await fetch(`${base}/projects/${id}?filter=${filter}`)).text();
    }
    const rows = page => [...page.matchAll(/<div class="task-row" data-testid="task-row">([\s\S]*?)<\/form>\s*<\/div>/g)].map(match => match[1]);
    assert.match(detail, /<label for="task-title">Task title<\/label>/);
    assert.match(detail, />Create task<\/button>/);
    assert.match(detail, /<label for="task-filter">Task filter<\/label>/);
    assert.match(detail, /<option selected>All<\/option>/);
    for (const title of ['', '  \t\n ']) {
      const response = await post(`/projects/${ids[0]}/tasks`, { title });
      assert.equal(response.status, 422);
      const invalid = await response.text();
      assert.match(invalid, /role="alert">Task title is required/);
      assert.equal(rows(invalid).length, 0);
    }
    for (const title of ['  First task  ', 'Second <task> "quoted" 🎉']) {
      assert.equal((await post(`/projects/${ids[0]}/tasks`, { title })).status, 303);
    }
    assert.equal((await post(`/projects/${ids[1]}/tasks`, { title: 'Other project task' })).status, 303);
    const openHtml = await projectHtml(ids[0]);
    const openRows = rows(openHtml);
    assert.equal(openRows.length, 2);
    assert.match(openRows[0], /<span>First task<\/span>/);
    assert.match(openRows[0], /aria-label="Complete First task"/);
    assert.match(openRows[1], /Second &lt;task&gt; &quot;quoted&quot; 🎉/);
    assert.ok(openRows.every(row => !row.includes(' checked')));
    assert.equal(rows(await projectHtml(ids[0], 'Open')).length, 2);
    assert.equal(rows(await projectHtml(ids[0], 'Completed')).length, 0);
    assert.equal(rows(await projectHtml(ids[1])).length, 1);
    assert.doesNotMatch(await projectHtml(ids[1]), /First task/);
    const taskId = /action="\/projects\/\d+\/tasks\/(\d+)"/.exec(openRows[0])[1];
    assert.equal((await post(`/projects/${ids[1]}/tasks/${taskId}`, { completed: '1' })).status, 404);
    assert.equal((await post(`/projects/${ids[0]}/tasks/${taskId}`, [['completed', '0'], ['completed', '1']])).status, 303);
    const completedHtml = await projectHtml(ids[0]);
    assert.match(rows(completedHtml)[0], / checked/);
    assert.doesNotMatch(rows(completedHtml)[1], / checked/);
    assert.match(rows(await projectHtml(ids[0], 'Open'))[0], /Second &lt;task&gt;/);
    const completedRows = rows(await projectHtml(ids[0], 'Completed'));
    assert.equal(completedRows.length, 1);
    assert.match(completedRows[0], /First task/);

    const projectRows = page => [...page.matchAll(/<div class="project-row" data-testid="project-row">([\s\S]*?)<\/form><\/div>\s*<\/div>/g)].map(match => match[1]);
    const summarized = await (await fetch(base)).text();
    assert.match(projectRows(summarized)[0], /data-testid="project-summary">1\/2 completed/);
    assert.match(projectRows(summarized)[1], /data-testid="project-summary">0\/1 completed/);
    assert.equal((await post(`/projects/${ids[0]}/archive`, {})).status, 303);
    const active = await (await fetch(base)).text();
    assert.equal(projectRows(active).length, 1);
    assert.doesNotMatch(active, /First project/);
    const archivedList = await (await fetch(`${base}/?filter=Archived`)).text();
    assert.equal(projectRows(archivedList).length, 1);
    assert.match(archivedList, /<option selected>Archived<\/option>/);
    assert.match(archivedList, /data-testid="project-summary">1\/2 completed/);
    assert.match(archivedList, />Open project<\/button>/);
    assert.match(archivedList, />Restore project<\/button>/);
    assert.doesNotMatch(archivedList, />Archive project<\/button>/);
    const archivedDetail = await projectHtml(ids[0]);
    assert.match(archivedDetail, />Archived project<\/p>/);
    assert.match(archivedDetail, /<button type="submit" disabled>Create task<\/button>/);
    assert.equal(rows(archivedDetail).length, 2);
    assert.ok(rows(archivedDetail).every(row => /type="checkbox"[^>]* disabled/.test(row)));
    assert.match(rows(await projectHtml(ids[0], 'Completed'))[0], /First task/);
    assert.match(rows(await projectHtml(ids[0], 'Open'))[0], /Second &lt;task&gt;/);
    assert.equal((await post(`/projects/${ids[0]}/tasks`, { title: 'Blocked task' })).status, 403);
    assert.equal((await post(`/projects/${ids[0]}/tasks/${taskId}`, { completed: '0' })).status, 403);
    assert.equal(await projectHtml(ids[0]), archivedDetail);
    assert.equal((await post('/projects/999999/archive', {})).status, 404);

    await stop();
    await start();
    assert.equal(await projectHtml(ids[0]), archivedDetail);
    assert.equal(await (await fetch(`${base}/?filter=Archived`)).text(), archivedList);
    assert.equal(await (await fetch(base)).text(), active);
    assert.equal((await post(`/projects/${ids[0]}/restore`, {})).status, 303);
    assert.equal(await projectHtml(ids[0]), completedHtml);
    assert.equal(await (await fetch(base)).text(), summarized);
    assert.equal(projectRows(await (await fetch(`${base}/?filter=Archived`)).text()).length, 0);

    await stop();
    await start();
    assert.equal(await projectHtml(ids[0]), completedHtml);
    assert.equal(rows(await projectHtml(ids[1])).length, 1);
    assert.equal((await post(`/projects/${ids[0]}/tasks/${taskId}`, { completed: '0', filter: 'Completed' })).status, 303);
    assert.equal(rows(await projectHtml(ids[0], 'Completed')).length, 0);
    assert.equal(rows(await projectHtml(ids[0], 'Open')).length, 2);
    await stop();
    await start();
    assert.equal(await projectHtml(ids[0]), openHtml);
    const finalList = await (await fetch(base)).text();
    assert.equal(projectRows(finalList).length, 2);
    assert.match(projectRows(finalList)[0], /data-testid="project-summary">0\/2 completed/);
    assert.match(projectRows(finalList)[1], /data-testid="project-summary">0\/1 completed/);
    assert.equal(await (await fetch(`${base}/projects/${ids[0]}`)).text(), openHtml);
    assert.equal((await fetch(`${base}/projects/999999`)).status, 404);

    assert.match(openHtml, /<label for="new-project-name">New project name<\/label>/);
    assert.match(openHtml, /<input id="new-project-name"[^>]*>/);
    assert.match(openHtml, /<button type="submit">Rename project<\/button>/);
    for (const name of ['', '  \t\n ']) {
      const invalidRename = await post(`/projects/${ids[0]}/rename`, { name });
      assert.equal(invalidRename.status, 422);
      const invalidHtml = await invalidRename.text();
      assert.match(invalidHtml, /role="alert">Project name is required/);
      assert.match(invalidHtml, /<h1>First project<\/h1>/);
      assert.deepEqual(rows(invalidHtml), rows(openHtml));
      assert.equal(await (await fetch(base)).text(), finalList);
    }
    // Rename with a completed task to check that completion state survives.
    await post(`/projects/${ids[0]}/tasks/${taskId}`, { completed: '1' });
    const beforeRename = await projectHtml(ids[0]);
    const renameResponse = await post(`/projects/${ids[0]}/rename`, { name: '  Renamed <project> "quoted" 🎉  ', filter: 'Completed' });
    assert.equal(renameResponse.status, 303);
    assert.equal(renameResponse.headers.get('location'), `/projects/${ids[0]}?filter=Completed`);
    const renamedDetail = await projectHtml(ids[0]);
    assert.match(renamedDetail, /<h1>Renamed &lt;project&gt; &quot;quoted&quot; 🎉<\/h1>/);
    assert.deepEqual(rows(renamedDetail), rows(beforeRename));
    const renamedList = await (await fetch(base)).text();
    const renamedRows = projectRows(renamedList);
    assert.equal(renamedRows.length, 2);
    assert.match(renamedRows[0], /Renamed &lt;project&gt; &quot;quoted&quot; 🎉/);
    assert.match(renamedRows[0], new RegExp(`action="/projects/${ids[0]}"`));
    assert.match(renamedRows[0], /data-testid="project-summary">1\/2 completed/);
    assert.match(renamedRows[1], /Second &lt;project&gt;/);
    assert.equal(rows(await projectHtml(ids[1])).length, 1);
    assert.equal((await post('/projects/999999/rename', { name: 'Missing' })).status, 404);

    await stop();
    await start();
    assert.equal(await projectHtml(ids[0]), renamedDetail);
    assert.equal(await (await fetch(base)).text(), renamedList);
    await post(`/projects/${ids[0]}/archive`, {});
    const archivedRenamed = await projectHtml(ids[0]);
    assert.match(archivedRenamed, /<input id="new-project-name"[^>]* disabled>/);
    assert.match(archivedRenamed, /<button type="submit" disabled>Rename project<\/button>/);
    assert.equal((await post(`/projects/${ids[0]}/rename`, { name: 'Blocked rename' })).status, 403);
    assert.equal(await projectHtml(ids[0]), archivedRenamed);
    await stop();
    await start();
    assert.equal(await projectHtml(ids[0]), archivedRenamed);
    await post(`/projects/${ids[0]}/restore`, {});
    assert.equal(await projectHtml(ids[0]), renamedDetail);
    assert.equal(await (await fetch(base)).text(), renamedList);
    assert.equal((await post(`/projects/${ids[0]}/rename`, { name: 'Restored project' })).status, 303);
    const restoredRenamed = await projectHtml(ids[0]);
    assert.match(restoredRenamed, /<h1>Restored project<\/h1>/);
    assert.deepEqual(rows(restoredRenamed), rows(beforeRename));
    await stop();
    await start();
    assert.equal(await projectHtml(ids[0]), restoredRenamed);

    // Task renames retain identity, ordering, completion, and project ownership.
    const beforeTaskRenameList = await (await fetch(base)).text();
    const otherProjectBefore = await projectHtml(ids[1]);
    const renameTaskPath = `/projects/${ids[0]}/tasks/${taskId}/rename`;
    assert.match(rows(restoredRenamed)[0], new RegExp(`<label for="new-task-title-${taskId}">New task title</label>`));
    assert.match(rows(restoredRenamed)[0], /<button type="submit">Rename task<\/button>/);
    for (const title of ['', '  \t\n ']) {
      const response = await post(renameTaskPath, { title, filter: 'Completed' });
      assert.equal(response.status, 422);
      const invalidHtml = await response.text();
      assert.match(invalidHtml, /role="alert">Task title is required/);
      assert.equal(rows(invalidHtml).length, 1);
      assert.match(rows(invalidHtml)[0], /aria-label="Complete First task"[^>]* checked/);
      assert.equal(await projectHtml(ids[0]), restoredRenamed);
    }
    assert.equal((await post(`/projects/${ids[1]}/tasks/${taskId}/rename`, { title: 'Wrong owner' })).status, 404);
    assert.equal((await post(`/projects/${ids[0]}/tasks/999999/rename`, { title: 'Missing' })).status, 404);
    const taskRenameResponse = await post(renameTaskPath, { title: '  Renamed <task> "quoted" 🎉  ', filter: 'Completed' });
    assert.equal(taskRenameResponse.status, 303);
    assert.equal(taskRenameResponse.headers.get('location'), `/projects/${ids[0]}?filter=Completed`);
    const renamedTasks = await projectHtml(ids[0]);
    assert.equal(rows(renamedTasks).length, 2);
    assert.match(rows(renamedTasks)[0], /<span>Renamed &lt;task&gt; &quot;quoted&quot; 🎉<\/span>/);
    assert.match(rows(renamedTasks)[0], /aria-label="Complete Renamed &lt;task&gt; &quot;quoted&quot; 🎉"[^>]* checked/);
    assert.match(rows(renamedTasks)[0], new RegExp(`action="/projects/${ids[0]}/tasks/${taskId}"`));
    assert.equal(rows(renamedTasks)[1], rows(restoredRenamed)[1]);
    assert.equal(rows(await projectHtml(ids[0], 'Completed')).length, 1);
    assert.match(rows(await projectHtml(ids[0], 'Open'))[0], /Second &lt;task&gt;/);
    assert.equal(await projectHtml(ids[1]), otherProjectBefore);
    assert.equal(await (await fetch(base)).text(), beforeTaskRenameList);
    await stop();
    await start();
    assert.equal(await projectHtml(ids[0]), renamedTasks);
    assert.equal(await (await fetch(base)).text(), beforeTaskRenameList);

    await post(`/projects/${ids[0]}/archive`, {});
    const archivedTasks = await projectHtml(ids[0]);
    assert.ok(rows(archivedTasks).every(row => /name="title"[^>]* disabled/.test(row)));
    assert.ok(rows(archivedTasks).every(row => /<button type="submit" disabled>Rename task<\/button>/.test(row)));
    assert.equal((await post(renameTaskPath, { title: 'Blocked task rename' })).status, 403);
    assert.equal(await projectHtml(ids[0]), archivedTasks);
    await stop();
    await start();
    assert.equal(await projectHtml(ids[0]), archivedTasks);
    await post(`/projects/${ids[0]}/restore`, {});
    assert.equal(await projectHtml(ids[0]), renamedTasks);
    assert.equal(await (await fetch(base)).text(), beforeTaskRenameList);
    assert.equal((await post(renameTaskPath, { title: '  Restored task  ' })).status, 303);
    assert.match(rows(await projectHtml(ids[0]))[0], /aria-label="Complete Restored task"[^>]* checked/);
    // Open tasks can also be renamed without leaving the Open filter.
    const secondTaskId = /action="\/projects\/\d+\/tasks\/(\d+)"/.exec(rows(renamedTasks)[1])[1];
    const openRenameResponse = await post(`/projects/${ids[0]}/tasks/${secondTaskId}/rename`, { title: '  Renamed open task  ', filter: 'Open' });
    assert.equal(openRenameResponse.status, 303);
    assert.equal(openRenameResponse.headers.get('location'), `/projects/${ids[0]}?filter=Open`);
    const renamedOpenRows = rows(await projectHtml(ids[0], 'Open'));
    assert.equal(renamedOpenRows.length, 1);
    assert.match(renamedOpenRows[0], /aria-label="Complete Renamed open task"/);
    assert.doesNotMatch(renamedOpenRows[0], / checked/);
    const finalTasks = await projectHtml(ids[0]);
    assert.equal(await (await fetch(base)).text(), beforeTaskRenameList);
    await stop();
    await start();
    assert.equal(await projectHtml(ids[0]), finalTasks);
    assert.equal(await (await fetch(base)).text(), beforeTaskRenameList);

    // Priorities change independently and preserve the rest of each task.
    const priorityPath = `/projects/${ids[0]}/tasks/${taskId}/priority`;
    const secondPriorityPath = `/projects/${ids[0]}/tasks/${secondTaskId}/priority`;
    const normalOptions = /<option>Low<\/option><option selected>Normal<\/option><option>High<\/option>/;
    assert.ok(rows(finalTasks).every(row => normalOptions.test(row)));
    assert.match(rows(finalTasks)[0], new RegExp(`<label for="task-priority-${taskId}">Task priority</label>`));
    assert.equal((await post(`/projects/${ids[1]}/tasks/${taskId}/priority`, { priority: 'High' })).status, 404);
    assert.equal((await post(`/projects/${ids[0]}/tasks/999999/priority`, { priority: 'High' })).status, 404);
    for (const priority of ['', 'Urgent', 'high']) {
      assert.equal((await post(priorityPath, { priority })).status, 422);
      assert.equal(await projectHtml(ids[0]), finalTasks);
    }
    const priorityResponse = await post(priorityPath, { priority: 'High', filter: 'Completed' });
    assert.equal(priorityResponse.status, 303);
    assert.equal(priorityResponse.headers.get('location'), `/projects/${ids[0]}?filter=Completed`);
    const highTasks = await projectHtml(ids[0]);
    assert.equal(highTasks, finalTasks.replace('<option selected>Normal</option><option>High</option>', '<option>Normal</option><option selected>High</option>'));
    assert.equal((await post(secondPriorityPath, { priority: 'Low', filter: 'Open' })).status, 303);
    const prioritizedTasks = await projectHtml(ids[0]);
    assert.match(rows(prioritizedTasks)[0], /<option selected>High<\/option>/);
    assert.match(rows(prioritizedTasks)[1], /<option selected>Low<\/option>/);
    assert.match(rows(await projectHtml(ids[0], 'Completed'))[0], /<option selected>High<\/option>/);
    assert.match(rows(await projectHtml(ids[0], 'Open'))[0], /<option selected>Low<\/option>/);
    assert.equal(await projectHtml(ids[1]), otherProjectBefore);
    assert.equal(await (await fetch(base)).text(), beforeTaskRenameList);
    await post(renameTaskPath, { title: 'Priority retained' });
    const renamedPriorityTasks = await projectHtml(ids[0]);
    assert.match(rows(renamedPriorityTasks)[0], /aria-label="Complete Priority retained"[^>]* checked/);
    assert.match(rows(renamedPriorityTasks)[0], /<option selected>High<\/option>/);
    await stop();
    await start();
    assert.equal(await projectHtml(ids[0]), renamedPriorityTasks);
    assert.equal(await (await fetch(base)).text(), beforeTaskRenameList);
    await post(`/projects/${ids[0]}/archive`, {});
    const archivedPriorities = await projectHtml(ids[0]);
    assert.ok(rows(archivedPriorities).every(row => /<select[^>]*name="priority"[^>]* disabled/.test(row)));
    assert.equal((await post(priorityPath, { priority: 'Normal' })).status, 403);
    assert.equal(await projectHtml(ids[0]), archivedPriorities);
    await stop();
    await start();
    assert.equal(await projectHtml(ids[0]), archivedPriorities);
    await post(`/projects/${ids[0]}/restore`, {});
    assert.equal(await projectHtml(ids[0]), renamedPriorityTasks);
    await post(priorityPath, { priority: 'Normal' });
    assert.match(rows(await projectHtml(ids[0]))[0], normalOptions);
    assert.match(rows(await projectHtml(ids[0]))[1], /<option selected>Low<\/option>/);
    await post(`/projects/${ids[0]}/tasks`, { title: 'New normal task' });
    const afterNewTask = rows(await projectHtml(ids[0]));
    assert.equal(afterNewTask.length, 3);
    assert.match(afterNewTask[2], normalOptions);
    assert.doesNotMatch(afterNewTask[2], / checked/);

    // Exercise every intersection, including creation order and independent selections.
    for (const [title, priority, completed] of [
      ['High open', 'High', '0'], ['High completed', 'High', '1'], ['Low completed', 'Low', '1'],
    ]) {
      await post(`/projects/${ids[0]}/tasks`, { title });
      const newRows = rows(await projectHtml(ids[0]));
      const newId = /action="\/projects\/\d+\/tasks\/(\d+)"/.exec(newRows.at(-1))[1];
      await post(`/projects/${ids[0]}/tasks/${newId}/priority`, { priority });
      await post(`/projects/${ids[0]}/tasks/${newId}`, { completed });
    }
    const allRows = rows(await projectHtml(ids[0]));
    const records = allRows.map(row => ({
      id: /action="\/projects\/\d+\/tasks\/(\d+)"/.exec(row)[1],
      priority: /<option selected>(Low|Normal|High)<\/option>/.exec(row)[1],
      completed: /type="checkbox"[^>]* checked/.test(row),
    }));
    async function combinedHtml(filter, priority) {
      return (await fetch(`${base}/projects/${ids[0]}?filter=${filter}&priorityFilter=${priority}`)).text();
    }
    function assertSelections(html, filter, priority) {
      for (const [id, value] of [['task-filter', filter], ['priority-filter', priority]]) {
        const select = new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`).exec(html)[1];
        assert.match(select, new RegExp(`<option selected>${value}</option>`));
        assert.doesNotMatch(new RegExp(`<select id="${id}"[^>]*>`).exec(html)[0], /disabled/);
      }
    }
    const beforeCombinedList = await (await fetch(base)).text();
    assert.match(projectRows(beforeCombinedList)[0], /data-testid="project-summary">3\/6 completed/);
    for (const filter of ['All', 'Open', 'Completed']) {
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        const html = await combinedHtml(filter, priority);
        assertSelections(html, filter, priority);
        const visibleIds = rows(html).map(row => /action="\/projects\/\d+\/tasks\/(\d+)"/.exec(row)[1]);
        assert.deepEqual(visibleIds, records.filter(task =>
          (filter === 'All' || task.completed === (filter === 'Completed')) &&
          (priority === 'All' || task.priority === priority)).map(task => task.id));
        // Both selects share a GET form, so changing either submits both values.
        assert.match(html, /<form class="filter" method="get"[^>]*>[\s\S]*?id="task-filter"[\s\S]*?id="priority-filter"[\s\S]*?<\/form>/);
        for (const row of rows(html)) {
          for (const form of row.matchAll(/<form[^>]*>([\s\S]*?)<\/form>/g)) {
            assert.ok(form[1].includes(`name="filter" value="${filter}"`));
            assert.ok(form[1].includes(`name="priorityFilter" value="${priority}"`));
          }
        }
      }
    }
    assert.equal(await (await fetch(base)).text(), beforeCombinedList);
    const defaultPriority = /<select id="priority-filter"[^>]*>([\s\S]*?)<\/select>/.exec(await projectHtml(ids[0]))[1];
    assert.equal(defaultPriority.trim(), '<option selected>All</option><option>Low</option><option>Normal</option><option>High</option>');

    const selection = { filter: 'Open', priorityFilter: 'High' };
    const highOpen = records.find(task => task.priority === 'High' && !task.completed);
    const highOpenPath = `/projects/${ids[0]}/tasks/${highOpen.id}`;
    const invalid = await post(`${highOpenPath}/rename`, { ...selection, title: '  ' });
    assert.equal(invalid.status, 422);
    assertSelections(await invalid.text(), 'Open', 'High');
    const renamed = await post(`${highOpenPath}/rename`, { ...selection, title: '  Renamed high open  ' });
    assert.equal(renamed.headers.get('location'), `/projects/${ids[0]}?filter=Open&priorityFilter=High`);
    const renamedView = await (await fetch(`${base}${renamed.headers.get('location')}`)).text();
    assertSelections(renamedView, 'Open', 'High');
    assert.equal(rows(renamedView).length, 1);
    assert.match(rows(renamedView)[0], /aria-label="Complete Renamed high open"/);
    assert.equal(await (await fetch(base)).text(), beforeCombinedList);

    const reprioritized = await post(`${highOpenPath}/priority`, { ...selection, priority: 'Low' });
    const reprioritizedView = await (await fetch(`${base}${reprioritized.headers.get('location')}`)).text();
    assertSelections(reprioritizedView, 'Open', 'High');
    assert.equal(rows(reprioritizedView).length, 0);
    assert.equal(await (await fetch(base)).text(), beforeCombinedList);
    await post(`${highOpenPath}/priority`, { ...selection, priority: 'High' });
    const completed = await post(highOpenPath, { ...selection, completed: '1' });
    const completedView = await (await fetch(`${base}${completed.headers.get('location')}`)).text();
    assertSelections(completedView, 'Open', 'High');
    assert.equal(rows(completedView).length, 0);
    assert.equal(rows(await combinedHtml('Completed', 'High')).length, 2);
    const savedView = await combinedHtml('Completed', 'High');
    await stop();
    await start();
    assert.equal(await combinedHtml('Completed', 'High'), savedView);
    assert.match(projectRows(await (await fetch(base)).text())[0], /data-testid="project-summary">4\/6 completed/);
    await post(`/projects/${ids[0]}/archive`, {});
    const archivedCombined = await combinedHtml('Completed', 'High');
    assertSelections(archivedCombined, 'Completed', 'High');
    assert.equal(rows(archivedCombined).length, 2);
    assert.ok(rows(archivedCombined).every(row => /type="checkbox"[^>]* disabled/.test(row) &&
      /name="title"[^>]* disabled/.test(row) && /name="priority"[^>]* disabled/.test(row)));
    assert.equal(rows(await combinedHtml('Open', 'Low')).length, 1);
    await stop();
    await start();
    assert.equal(await combinedHtml('Completed', 'High'), archivedCombined);
    await post(`/projects/${ids[0]}/restore`, {});
    assert.equal(await combinedHtml('Completed', 'High'), savedView);

  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('migrates existing tasks to Normal without changing their saved data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-migration-'));
  const databasePath = join(directory, 'legacy.sqlite');
  const database = new DatabaseSync(databasePath);
  database.exec(`CREATE TABLE projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0
  );
  INSERT INTO projects (name, archived) VALUES ('Existing active', 0), ('Existing archived', 1);
  INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing open', 0), (2, 'Existing completed', 1);`);
  const before = database.prepare('SELECT * FROM tasks ORDER BY id').all();
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stderr.on('data', chunk => { output += chunk; });
  try {
    let migrated = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (database.prepare('PRAGMA table_info(tasks)').all().some(column => column.name === 'priority')) {
        migrated = true;
        break;
      }
      if (child.exitCode !== null) throw new Error(`Server exited: ${output}`);
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.ok(migrated, `Migration did not complete: ${output}`);
    assert.deepEqual(database.prepare('SELECT * FROM tasks ORDER BY id').all().map(task => ({ ...task })),
      before.map(task => ({ ...task, priority: 'Normal' })));
    assert.equal(database.prepare('SELECT archived FROM projects WHERE id = 2').get().archived, 1);
  } finally {
    if (child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});
