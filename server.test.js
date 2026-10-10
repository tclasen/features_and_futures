import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('projects and tasks: validation, rename, archive, priorities, summaries, isolation, migration, and persistence', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.workboard-test-'));
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Server startup timed out')), 5000);
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
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
    const client = await fetch(`${base}/client.js`);
    assert.equal(client.status, 200);
    assert.match(client.headers.get('content-type'), /text\/javascript/);
    assert.match(await client.text(), /event.preventDefault\(\)/);
    const initial = await (await fetch(base)).text();
    assert.match(initial, /<script src="\/client.js" defer><\/script>/);
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.match(initial, /<label for="project-filter">Project filter<\/label>/);
    assert.match(initial, /<option selected>Active<\/option><option>Archived<\/option>/);
    for (const name of ['', '   \t ']) {
      const invalid = await (await fetch(`${base}/projects`, {
        method: 'POST', body: new URLSearchParams({ name }),
      })).text();
      assert.match(invalid, /role="alert">Project name is required/);
      assert.doesNotMatch(invalid, /data-testid="project-row"/);
    }
    for (const name of ['  First project  ', 'Second <project> & "name"']) {
      const created = await fetch(`${base}/projects`, {
        method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
      });
      assert.equal(created.status, 303);
      assert.equal(created.headers.get('location'), '/');
    }
    const list = await (await fetch(base)).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(list, /<span>First project<\/span>/);
    assert.match(list, /Second &lt;project&gt; &amp; &quot;name&quot;/);
    assert.ok(list.indexOf('First project') < list.indexOf('Second &lt;project&gt;'));
    const paths = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    assert.equal((list.match(/data-testid="project-summary">0\/0 completed/g) || []).length, 2);
    assert.equal((list.match(/>Archive project<\/button>/g) || []).length, 2);
    const detail = await (await fetch(base + paths[0])).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/" method="get"><button type="submit">Projects/);
    assert.equal((await fetch(`${base}/projects/999999`)).status, 404);
    const projectUrl = base + paths[0];
    assert.match(detail, /<label for="task-title">Task title<\/label>/);
    assert.match(detail, />Create task<\/button>/);
    assert.match(detail, /<label for="task-filter">Task filter<\/label>/);
    assert.match(detail, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', '  \t ']) {
      const invalid = await (await fetch(`${projectUrl}/tasks`, {
        method: 'POST', body: new URLSearchParams({ title }),
      })).text();
      assert.match(invalid, /role="alert">Task title is required/);
      assert.doesNotMatch(invalid, /data-testid="task-row"/);
    }
    for (const title of ['  First task  ', 'Second <task> & "title"', 'Third task']) {
      assert.equal((await fetch(`${projectUrl}/tasks`, {
        method: 'POST', body: new URLSearchParams({ title }), redirect: 'manual',
      })).status, 303);
    }
    const tasks = await (await fetch(projectUrl)).text();
    assert.equal((tasks.match(/data-testid="task-row"/g) || []).length, 3);
    assert.match(tasks, /<span>First task<\/span>/);
    assert.match(tasks, /aria-label="Complete First task"/);
    assert.match(tasks, /aria-label="Complete Second &lt;task&gt; &amp; &quot;title&quot;"/);
    assert.doesNotMatch(tasks, / checked/);
    assert.ok(tasks.indexOf('<span>First task') < tasks.indexOf('<span>Second'));
    assert.ok(tasks.indexOf('<span>Second') < tasks.indexOf('<span>Third'));
    const taskPaths = [...tasks.matchAll(/action="(\/projects\/\d+\/tasks\/\d+)"/g)].map(match => match[1]);
    assert.equal(taskPaths.length, 3);
    assert.doesNotMatch(await (await fetch(base + paths[1])).text(), /data-testid="task-row"/);
    const saveCompletion = async (path, completed) => fetch(base + path, {
      method: 'POST', body: new URLSearchParams(completed ? { completed: '1' } : {}), redirect: 'manual',
    });
    assert.equal((await saveCompletion(taskPaths[0], true)).status, 303);
    const completed = await (await fetch(`${projectUrl}?filter=Completed`)).text();
    assert.equal((completed.match(/data-testid="task-row"/g) || []).length, 1);
    assert.match(completed, /aria-label="Complete First task" checked/);
    assert.match(completed, /<option selected>Completed<\/option>/);
    const open = await (await fetch(`${projectUrl}?filter=Open`)).text();
    assert.equal((open.match(/data-testid="task-row"/g) || []).length, 2);
    assert.doesNotMatch(open, /<span>First task/);
    assert.match(open, /<option selected>Open<\/option>/);
    assert.equal((await saveCompletion(taskPaths[0], false)).status, 303);
    assert.doesNotMatch(await (await fetch(projectUrl)).text(), / checked/);
    assert.equal((await saveCompletion(taskPaths[1], true)).status, 303);
    const wrongProjectPath = taskPaths[1].replace(paths[0], paths[1]);
    assert.equal((await saveCompletion(wrongProjectPath, false)).status, 404);
    const invalidWithTasks = await (await fetch(`${projectUrl}/tasks`, {
      method: 'POST', body: new URLSearchParams({ title: '   ' }),
    })).text();
    assert.match(invalidWithTasks, /role="alert">Task title is required/);
    assert.equal((invalidWithTasks.match(/data-testid="task-row"/g) || []).length, 3);
    const savedDetail = await (await fetch(projectUrl)).text();
    const savedCompleted = await (await fetch(`${projectUrl}?filter=Completed`)).text();
    const savedList = await (await fetch(base)).text();
    assert.match(savedList, /data-testid="project-summary">1\/3 completed/);
    await stop();
    // Simulate the populated Task 002 schema to verify the additive migration.
    const legacy = new DatabaseSync(join(directory, 'projects.sqlite'));
    legacy.exec('ALTER TABLE projects DROP COLUMN archived');
    legacy.close();
    base = await start();
    assert.equal(await (await fetch(base)).text(), savedList);
    assert.equal(await (await fetch(base + paths[0])).text(), savedDetail);
    assert.equal(await (await fetch(`${base}${paths[0]}?filter=Completed`)).text(), savedCompleted);
    assert.doesNotMatch(await (await fetch(base + paths[1])).text(), /data-testid="task-row"/);
    const archive = await fetch(`${base}${paths[0]}/archive`, { method: 'POST', redirect: 'manual' });
    assert.equal(archive.status, 303);
    const activeList = await (await fetch(base)).text();
    assert.doesNotMatch(activeList, /First project/);
    assert.match(activeList, /Second &lt;project&gt;/);
    const archivedList = await (await fetch(`${base}/?filter=Archived`)).text();
    assert.equal((archivedList.match(/data-testid="project-row"/g) || []).length, 1);
    assert.match(archivedList, /First project/);
    assert.match(archivedList, /data-testid="project-summary">1\/3 completed/);
    assert.match(archivedList, />Restore project<\/button>/);
    assert.match(archivedList, />Open project<\/button>/);
    assert.match(archivedList, /<option selected>Archived<\/option>/);
    const archivedDetail = await (await fetch(base + paths[0])).text();
    assert.match(archivedDetail, /<p>Archived project<\/p>/);
    assert.match(archivedDetail, /<button type="submit" disabled>Create task/);
    assert.equal((archivedDetail.match(/aria-label="Complete [^"]*"(?: checked)? disabled/g) || []).length, 3);
    const archivedCompleted = await (await fetch(`${base}${paths[0]}?filter=Completed`)).text();
    assert.equal((archivedCompleted.match(/data-testid="task-row"/g) || []).length, 1);
    const archivedOpen = await (await fetch(`${base}${paths[0]}?filter=Open`)).text();
    assert.equal((archivedOpen.match(/data-testid="task-row"/g) || []).length, 2);
    assert.equal((await fetch(`${base}${paths[0]}/tasks`, {
      method: 'POST', body: new URLSearchParams({ title: 'Blocked task' }),
    })).status, 403);
    assert.equal((await saveCompletion(taskPaths[1], false)).status, 403);
    assert.equal(await (await fetch(base + paths[0])).text(), archivedDetail);
    await stop();
    base = await start();
    assert.equal(await (await fetch(base)).text(), activeList);
    assert.equal(await (await fetch(`${base}/?filter=Archived`)).text(), archivedList);
    assert.equal(await (await fetch(base + paths[0])).text(), archivedDetail);
    const restore = await fetch(`${base}${paths[0]}/restore`, { method: 'POST', redirect: 'manual' });
    assert.equal(restore.status, 303);
    assert.equal(await (await fetch(base)).text(), savedList);
    assert.doesNotMatch(await (await fetch(`${base}/?filter=Archived`)).text(), /data-testid="project-row"/);
    assert.equal(await (await fetch(base + paths[0])).text(), savedDetail);
    assert.equal((await saveCompletion(taskPaths[0], true)).status, 303);
    const restoredList = await (await fetch(base)).text();
    assert.match(restoredList, /data-testid="project-summary">2\/3 completed/);
    await stop();
    base = await start();
    assert.equal(await (await fetch(base)).text(), restoredList);
    assert.equal((await saveCompletion(taskPaths[0], false)).status, 303);
    assert.equal(await (await fetch(base + paths[0])).text(), savedDetail);
    const rename = async (name, filter = 'All') => fetch(`${base}${paths[0]}/rename`, {
      method: 'POST', body: new URLSearchParams({ name, filter }), redirect: 'manual',
    });
    assert.match(savedDetail, /<label for="new-project-name">New project name<\/label>/);
    assert.match(savedDetail, /<input id="new-project-name" name="name" type="text">/);
    assert.match(savedDetail, /<button type="submit">Rename project<\/button>/);
    for (const name of ['', '  \t ']) {
      const invalid = await rename(name);
      assert.equal(invalid.status, 200);
      const body = await invalid.text();
      assert.match(body, /role="alert">Project name is required/);
      assert.match(body, /<h1>First project<\/h1>/);
      assert.equal(await (await fetch(base)).text(), savedList);
      assert.equal(await (await fetch(base + paths[0])).text(), savedDetail);
    }
    const renamed = await rename('  Renamed <project> & "name"  ', 'Completed');
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), `${paths[0]}?filter=Completed`);
    const renamedDetail = await (await fetch(base + paths[0])).text();
    const replaceName = body => body.replace('First project', 'Renamed &lt;project&gt; &amp; &quot;name&quot;');
    assert.equal(renamedDetail, replaceName(savedDetail));
    const renamedList = await (await fetch(base)).text();
    assert.equal(renamedList, replaceName(savedList));
    assert.equal(await (await fetch(`${base}${paths[0]}?filter=Completed`)).text(), replaceName(savedCompleted));
    assert.equal((await fetch(`${base}/projects/999999/rename`, {
      method: 'POST', body: new URLSearchParams({ name: 'Missing' }),
    })).status, 404);
    await stop();
    base = await start();
    assert.equal(await (await fetch(base)).text(), renamedList);
    assert.equal(await (await fetch(base + paths[0])).text(), renamedDetail);
    await fetch(`${base}${paths[0]}/archive`, { method: 'POST' });
    const archivedRenamedDetail = await (await fetch(base + paths[0])).text();
    assert.match(archivedRenamedDetail, /<input id="new-project-name" name="name" type="text" disabled>/);
    assert.match(archivedRenamedDetail, /<button type="submit" disabled>Rename project<\/button>/);
    assert.equal((await rename('Blocked rename')).status, 403);
    assert.equal(await (await fetch(base + paths[0])).text(), archivedRenamedDetail);
    await fetch(`${base}${paths[0]}/restore`, { method: 'POST' });
    assert.equal(await (await fetch(base + paths[0])).text(), renamedDetail);
    assert.equal((await rename('  Restored project  ')).status, 303);
    const restoredRenamedDetail = await (await fetch(base + paths[0])).text();
    assert.equal(restoredRenamedDetail, savedDetail.replace('First project', 'Restored project'));
    const restoredRenamedList = await (await fetch(base)).text();
    assert.equal(restoredRenamedList, savedList.replace('First project', 'Restored project'));
    await stop();
    base = await start();
    assert.equal(await (await fetch(base + paths[0])).text(), restoredRenamedDetail);
    assert.equal(await (await fetch(base)).text(), restoredRenamedList);
    const renameTask = async (path, title, filter = 'All') => fetch(`${base}${path}/rename`, {
      method: 'POST', body: new URLSearchParams({ title, filter }), redirect: 'manual',
    });
    assert.equal((restoredRenamedDetail.match(/>New task title<\/label>/g) || []).length, 3);
    assert.equal((restoredRenamedDetail.match(/>Rename task<\/button>/g) || []).length, 3);
    for (const title of ['', '  \t ']) {
      const invalid = await renameTask(taskPaths[1], title, 'Completed');
      assert.equal(invalid.status, 200);
      const body = await invalid.text();
      assert.match(body, /role="alert">Task title is required/);
      assert.match(body, /aria-label="Complete Second &lt;task&gt; &amp; &quot;title&quot;" checked/);
      assert.equal((body.match(/data-testid="task-row"/g) || []).length, 1);
      assert.equal(await (await fetch(base + paths[0])).text(), restoredRenamedDetail);
    }
    const renamedTask = await renameTask(taskPaths[1], '  Renamed <task> & "title"  ', 'Completed');
    assert.equal(renamedTask.status, 303);
    assert.equal(renamedTask.headers.get('location'), `${paths[0]}?filter=Completed`);
    const renamedTasksDetail = await (await fetch(base + paths[0])).text();
    const expectedTaskRename = restoredRenamedDetail.replaceAll('Second &lt;task&gt;', 'Renamed &lt;task&gt;');
    assert.equal(renamedTasksDetail, expectedTaskRename);
    assert.match(renamedTasksDetail, /aria-label="Complete Renamed &lt;task&gt; &amp; &quot;title&quot;" checked/);
    assert.equal(await (await fetch(base)).text(), restoredRenamedList);
    const renamedCompleted = await (await fetch(`${base}${paths[0]}?filter=Completed`)).text();
    assert.equal((renamedCompleted.match(/data-testid="task-row"/g) || []).length, 1);
    assert.match(renamedCompleted, /<span>Renamed &lt;task&gt; &amp; &quot;title&quot;<\/span>/);
    const renamedOpen = await (await fetch(`${base}${paths[0]}?filter=Open`)).text();
    assert.equal((renamedOpen.match(/data-testid="task-row"/g) || []).length, 2);
    assert.doesNotMatch(renamedOpen, /<span>Renamed &lt;task&gt;/);
    assert.equal((await renameTask(wrongProjectPath, 'Wrong owner')).status, 404);
    assert.equal((await renameTask(`${paths[0]}/tasks/999999`, 'Missing')).status, 404);
    assert.doesNotMatch(await (await fetch(base + paths[1])).text(), /data-testid="task-row"/);
    await stop();
    base = await start();
    assert.equal(await (await fetch(base + paths[0])).text(), renamedTasksDetail);
    assert.equal(await (await fetch(base)).text(), restoredRenamedList);
    await fetch(`${base}${paths[0]}/archive`, { method: 'POST' });
    const archivedTasksDetail = await (await fetch(base + paths[0])).text();
    assert.equal((archivedTasksDetail.match(/id="new-task-title-\d+" name="title" type="text" disabled/g) || []).length, 3);
    assert.equal((archivedTasksDetail.match(/<button type="submit" disabled>Rename task/g) || []).length, 3);
    assert.equal((await renameTask(taskPaths[1], 'Blocked title')).status, 403);
    assert.equal(await (await fetch(base + paths[0])).text(), archivedTasksDetail);
    await fetch(`${base}${paths[0]}/restore`, { method: 'POST' });
    assert.equal(await (await fetch(base + paths[0])).text(), renamedTasksDetail);
    assert.equal((await renameTask(taskPaths[0], '  Restored task  ', 'Open')).status, 303);
    const restoredTasksDetail = await (await fetch(base + paths[0])).text();
    assert.equal(restoredTasksDetail, renamedTasksDetail.replaceAll('First task', 'Restored task'));
    assert.match(restoredTasksDetail, /aria-label="Complete Restored task" onchange=/);
    await stop();
    base = await start();
    assert.equal(await (await fetch(base + paths[0])).text(), restoredTasksDetail);
    assert.equal(await (await fetch(base)).text(), restoredRenamedList);
    // Upgrade a populated Task 005 database; every existing task gets Normal.
    await stop();
    const priorDatabase = new DatabaseSync(join(directory, 'projects.sqlite'));
    priorDatabase.exec('ALTER TABLE tasks DROP COLUMN priority');
    priorDatabase.close();
    base = await start();
    assert.equal(await (await fetch(base + paths[0])).text(), restoredTasksDetail);
    const prioritySelects = body => [...body.matchAll(/<select id="task-priority-\d+"[^>]*>([\s\S]*?)<\/select>/g)];
    const selectedPriorities = body => prioritySelects(body).map(match => match[1].match(/<option selected>(\w+)<\/option>/)[1]);
    assert.deepEqual(selectedPriorities(restoredTasksDetail), ['Normal', 'Normal', 'Normal']);
    for (const select of prioritySelects(restoredTasksDetail)) {
      assert.equal(select[1].trim(), '<option>Low</option><option selected>Normal</option><option>High</option>');
    }
    assert.equal((restoredTasksDetail.match(/>Task priority<\/label>/g) || []).length, 3);
    const savePriority = async (path, priority, filter = 'All') => fetch(`${base}${path}/priority`, {
      method: 'POST', body: new URLSearchParams({ priority, filter }), redirect: 'manual',
    });
    const priorityResponse = await savePriority(taskPaths[1], 'High', 'Completed');
    assert.equal(priorityResponse.status, 303);
    assert.equal(priorityResponse.headers.get('location'), `${paths[0]}?filter=Completed`);
    assert.equal((await savePriority(taskPaths[0], 'Low', 'Open')).status, 303);
    const prioritizedDetail = await (await fetch(base + paths[0])).text();
    assert.deepEqual(selectedPriorities(prioritizedDetail), ['Low', 'High', 'Normal']);
    // Removing only the selected flags makes the whole page identical: title,
    // completion, order, ownership, and every other control are unchanged.
    const withoutPrioritySelection = body => body.replace(/(<select id="task-priority-\d+"[^>]*>)([\s\S]*?)(<\/select>)/g,
      (_, opening, options, closing) => opening + options.replaceAll(' selected', '') + closing);
    assert.equal(withoutPrioritySelection(prioritizedDetail), withoutPrioritySelection(restoredTasksDetail));
    assert.equal(await (await fetch(base)).text(), restoredRenamedList);
    assert.deepEqual(selectedPriorities(await (await fetch(`${base}${paths[0]}?filter=Completed`)).text()), ['High']);
    assert.deepEqual(selectedPriorities(await (await fetch(`${base}${paths[0]}?filter=Open`)).text()), ['Low', 'Normal']);
    assert.equal((await savePriority(wrongProjectPath, 'Low')).status, 404);
    assert.equal((await savePriority(`${paths[0]}/tasks/999999`, 'High')).status, 404);
    assert.equal((await savePriority(taskPaths[1], 'Urgent')).status, 400);
    assert.equal(await (await fetch(base + paths[0])).text(), prioritizedDetail);
    assert.equal((await fetch(`${base}${paths[1]}/tasks`, {
      method: 'POST', body: new URLSearchParams({ title: 'Independent task' }), redirect: 'manual',
    })).status, 303);
    const otherProject = await (await fetch(base + paths[1])).text();
    assert.deepEqual(selectedPriorities(otherProject), ['Normal']);
    assert.equal((await savePriority(taskPaths[0], 'Normal')).status, 303);
    assert.equal((await savePriority(taskPaths[0], 'Low')).status, 303);
    assert.equal(await (await fetch(base + paths[1])).text(), otherProject);
    assert.equal((await renameTask(taskPaths[1], '  Priority preserved  ')).status, 303);
    const renamedPriorityDetail = await (await fetch(base + paths[0])).text();
    assert.deepEqual(selectedPriorities(renamedPriorityDetail), ['Low', 'High', 'Normal']);
    assert.match(renamedPriorityDetail, /aria-label="Complete Priority preserved" checked/);
    await stop();
    base = await start();
    assert.equal(await (await fetch(base + paths[0])).text(), renamedPriorityDetail);
    await fetch(`${base}${paths[0]}/archive`, { method: 'POST' });
    const archivedPriorityDetail = await (await fetch(base + paths[0])).text();
    assert.equal((archivedPriorityDetail.match(/<select id="task-priority-\d+" name="priority" disabled/g) || []).length, 3);
    assert.deepEqual(selectedPriorities(archivedPriorityDetail), ['Low', 'High', 'Normal']);
    assert.equal((await savePriority(taskPaths[1], 'Low')).status, 403);
    assert.equal(await (await fetch(base + paths[0])).text(), archivedPriorityDetail);
    await stop();
    base = await start();
    assert.equal(await (await fetch(base + paths[0])).text(), archivedPriorityDetail);
    await fetch(`${base}${paths[0]}/restore`, { method: 'POST' });
    assert.equal(await (await fetch(base + paths[0])).text(), renamedPriorityDetail);
    assert.equal((await savePriority(taskPaths[2], 'High')).status, 303);
    const finalDetail = await (await fetch(base + paths[0])).text();
    assert.deepEqual(selectedPriorities(finalDetail), ['Low', 'High', 'High']);
    await stop();
    base = await start();
    assert.equal(await (await fetch(base + paths[0])).text(), finalDetail);
    // Task 007: exercise every intersection and preserve selections through edits.
    const filteredUrl = (completion, priority) =>
      `${base}${paths[0]}?filter=${completion}&priorityFilter=${priority}`;
    const rowTitles = body => [...body.matchAll(/<span>(.*?)<\/span>/g)].map(match => match[1]);
    const assertFilters = (body, completion, priority) => {
      for (const [id, selected] of [['task-filter', completion], ['priority-filter', priority]]) {
        const select = body.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`));
        assert.ok(select, `${id} exists`);
        assert.match(select[1], new RegExp(`<option selected>${selected}</option>`));
      }
    };
    const records = [
      { title: 'Restored task', completed: false, priority: 'Low' },
      { title: 'Priority preserved', completed: true, priority: 'High' },
      { title: 'Third task', completed: false, priority: 'High' },
    ];
    const summaryBeforeFilters = await (await fetch(base)).text();
    for (const completion of ['All', 'Open', 'Completed']) {
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        const body = await (await fetch(filteredUrl(completion, priority))).text();
        assertFilters(body, completion, priority);
        assert.deepEqual(rowTitles(body), records.filter(task =>
          (completion === 'All' || task.completed === (completion === 'Completed')) &&
          (priority === 'All' || task.priority === priority)).map(task => task.title));
      }
    }
    assert.equal(await (await fetch(base)).text(), summaryBeforeFilters);
    assertFilters(finalDetail, 'All', 'All');
    const priorityOptions = finalDetail.match(/<select id="priority-filter"[^>]*>([\s\S]*?)<\/select>/)[1];
    assert.equal(priorityOptions.trim(), '<option selected>All</option><option>Low</option><option>Normal</option><option>High</option>');
    const openHigh = await (await fetch(filteredUrl('Open', 'High'))).text();
    const filterForm = openHigh.match(/<form action="\/projects\/\d+" method="get">([\s\S]*?)<\/form>/)[1];
    assert.match(filterForm, /name="filter"/);
    assert.match(filterForm, /name="priorityFilter"/);
    for (const form of openHigh.matchAll(/<form[^>]*method="post">([\s\S]*?)<\/form>/g)) {
      assert.match(form[1], /name="filter" value="Open"/);
      assert.match(form[1], /name="priorityFilter" value="High"/);
    }
    const mutateFiltered = (path, fields, completion = 'Open', priority = 'High') => fetch(base + path, {
      method: 'POST', redirect: 'manual',
      body: new URLSearchParams({ ...fields, filter: completion, priorityFilter: priority }),
    });
    const blankRename = await mutateFiltered(`${taskPaths[2]}/rename`, { title: '  ' });
    assert.equal(blankRename.status, 200);
    const invalidBody = await blankRename.text();
    assertFilters(invalidBody, 'Open', 'High');
    assert.match(invalidBody, /role="alert">Task title is required/);
    assert.deepEqual(rowTitles(invalidBody), ['Third task']);
    const filteredRename = await mutateFiltered(`${taskPaths[2]}/rename`, { title: '  Filtered task  ' });
    assert.equal(filteredRename.headers.get('location'), `${paths[0]}?filter=Open&priorityFilter=High`);
    const renamedFiltered = await (await fetch(base + filteredRename.headers.get('location'))).text();
    assertFilters(renamedFiltered, 'Open', 'High');
    assert.deepEqual(rowTitles(renamedFiltered), ['Filtered task']);
    assert.deepEqual(selectedPriorities(renamedFiltered), ['High']);
    assert.equal(await (await fetch(base)).text(), summaryBeforeFilters);
    const filteredComplete = await mutateFiltered(taskPaths[2], { completed: '1' });
    const afterComplete = await (await fetch(base + filteredComplete.headers.get('location'))).text();
    assertFilters(afterComplete, 'Open', 'High');
    assert.deepEqual(rowTitles(afterComplete), []);
    const summaryAfterCompletion = await (await fetch(base)).text();
    assert.match(summaryAfterCompletion, /data-testid="project-summary">2\/3 completed/);
    const filteredPriority = await mutateFiltered(`${taskPaths[2]}/priority`, { priority: 'Normal' }, 'Completed');
    const afterPriority = await (await fetch(base + filteredPriority.headers.get('location'))).text();
    assertFilters(afterPriority, 'Completed', 'High');
    assert.deepEqual(rowTitles(afterPriority), ['Priority preserved']);
    assert.equal(await (await fetch(base)).text(), summaryAfterCompletion);
    const completedNormal = await (await fetch(filteredUrl('Completed', 'Normal'))).text();
    assert.deepEqual(rowTitles(completedNormal), ['Filtered task']);
    assert.match(completedNormal, /aria-label="Complete Filtered task" checked/);
    await stop();
    base = await start();
    assert.equal(await (await fetch(filteredUrl('Completed', 'Normal'))).text(), completedNormal);
    assert.equal(await (await fetch(base)).text(), summaryAfterCompletion);
    await fetch(`${base}${paths[0]}/archive`, { method: 'POST' });
    const archivedFiltered = await (await fetch(filteredUrl('Completed', 'Normal'))).text();
    assertFilters(archivedFiltered, 'Completed', 'Normal');
    assert.deepEqual(rowTitles(archivedFiltered), ['Filtered task']);
    assert.match(archivedFiltered, /aria-label="Complete Filtered task" checked disabled/);
    assert.match(archivedFiltered, /name="priority" disabled/);
    assert.match(archivedFiltered, /name="title" type="text" disabled/);
    assert.doesNotMatch(archivedFiltered, /id="(?:task|priority)-filter"[^>]*disabled/);
    const blocked = await mutateFiltered(`${taskPaths[2]}/priority`, { priority: 'Low' }, 'Completed', 'Normal');
    assert.equal(blocked.status, 403);
    assertFilters(await blocked.text(), 'Completed', 'Normal');
    await stop();
    base = await start();
    assert.equal(await (await fetch(filteredUrl('Completed', 'Normal'))).text(), archivedFiltered);
    await fetch(`${base}${paths[0]}/restore`, { method: 'POST' });
    assert.equal(await (await fetch(filteredUrl('Completed', 'Normal'))).text(), completedNormal);
    assertFilters(await (await fetch(base + paths[0])).text(), 'All', 'All');
    // Task 008: migrate existing projects without changing any existing tasks.
    await stop();
    const legacyProjects = new DatabaseSync(join(directory, 'projects.sqlite'));
    legacyProjects.exec('ALTER TABLE projects DROP COLUMN default_priority');
    legacyProjects.close();
    base = await start();
    assert.equal(await (await fetch(filteredUrl('Completed', 'Normal'))).text(), completedNormal);
    const defaultOptions = body => body.match(/<select id="default-task-priority"[^>]*>([\s\S]*?)<\/select>/)[1].trim();
    const normalOptions = '<option>Low</option><option selected>Normal</option><option>High</option>';
    assert.equal(defaultOptions(completedNormal), normalOptions);
    const otherBeforeDefault = await (await fetch(base + paths[1])).text();
    assert.equal(defaultOptions(otherBeforeDefault), normalOptions);
    const summaryBeforeDefault = await (await fetch(base)).text();
    const saveDefault = (path, priority, completion = 'Completed', prioritySelection = 'Normal') =>
      mutateFiltered(`${path}/default-priority`, { priority }, completion, prioritySelection);
    assert.equal((await saveDefault('/projects/999999', 'Low')).status, 404);
    assert.equal((await saveDefault(paths[0], 'Urgent')).status, 400);
    assert.equal(await (await fetch(filteredUrl('Completed', 'Normal'))).text(), completedNormal);
    const changedDefault = await saveDefault(paths[0], 'High');
    assert.equal(changedDefault.status, 303);
    assert.equal(changedDefault.headers.get('location'), `${paths[0]}?filter=Completed&priorityFilter=Normal`);
    const highDefaultDetail = await (await fetch(base + changedDefault.headers.get('location'))).text();
    assertFilters(highDefaultDetail, 'Completed', 'Normal');
    const highOptions = '<option>Low</option><option>Normal</option><option selected>High</option>';
    assert.equal(highDefaultDetail, completedNormal.replace(normalOptions, highOptions));
    assert.equal(await (await fetch(base + paths[1])).text(), otherBeforeDefault);
    assert.equal(await (await fetch(base)).text(), summaryBeforeDefault);
    await stop();
    base = await start();
    assert.equal(await (await fetch(filteredUrl('Completed', 'Normal'))).text(), highDefaultDetail);
    const createInherited = async (path, title) => {
      const response = await mutateFiltered(`${path}/tasks`, { title });
      assert.equal(response.status, 303);
      const body = await (await fetch(base + path)).text();
      return [...body.matchAll(/class="task-completion" action="([^"]+)"/g)].at(-1)[1];
    };
    const inheritedHigh = await createInherited(paths[0], 'Inherited high');
    assert.deepEqual(selectedPriorities(await (await fetch(base + paths[0])).text()), ['Low', 'High', 'Normal', 'High']);
    await saveDefault(paths[0], 'Low', 'Open', 'High');
    const beforeLowTask = await (await fetch(filteredUrl('Open', 'High'))).text();
    assertFilters(beforeLowTask, 'Open', 'High');
    assert.deepEqual(rowTitles(beforeLowTask), ['Inherited high']);
    assert.equal(await (await fetch(base + paths[1])).text(), otherBeforeDefault);
    const inheritedLow = await createInherited(paths[0], 'Inherited low');
    assert.deepEqual(selectedPriorities(await (await fetch(base + paths[0])).text()), ['Low', 'High', 'Normal', 'High', 'Low']);
    assert.deepEqual(rowTitles(await (await fetch(filteredUrl('Open', 'High'))).text()), ['Inherited high']);
    await createInherited(paths[1], 'Independent normal');
    assert.deepEqual(selectedPriorities(await (await fetch(base + paths[1])).text()), ['Normal', 'Normal']);
    await mutateFiltered(inheritedHigh, { completed: '1' });
    await mutateFiltered(`${inheritedLow}/rename`, { title: '  Renamed inherited low  ' });
    await mutateFiltered(`${paths[0]}/rename`, { name: '  Project with default  ' });
    const preservedDefault = await (await fetch(base + paths[0])).text();
    assert.match(preservedDefault, /<h1>Project with default<\/h1>/);
    assert.match(preservedDefault, /aria-label="Complete Inherited high" checked/);
    assert.match(preservedDefault, /aria-label="Complete Renamed inherited low" onchange/);
    assert.equal(defaultOptions(preservedDefault), '<option selected>Low</option><option>Normal</option><option>High</option>');
    assert.deepEqual(selectedPriorities(preservedDefault), ['Low', 'High', 'Normal', 'High', 'Low']);
    const summaryWithInherited = await (await fetch(base)).text();
    assert.match(summaryWithInherited, /data-testid="project-summary">3\/5 completed/);
    await fetch(`${base}${paths[0]}/archive`, { method: 'POST' });
    const archivedDefault = await (await fetch(filteredUrl('Open', 'Low'))).text();
    assert.match(archivedDefault, /id="default-task-priority" name="priority" disabled/);
    assert.equal(defaultOptions(archivedDefault), defaultOptions(preservedDefault));
    assertFilters(archivedDefault, 'Open', 'Low');
    assert.deepEqual(rowTitles(archivedDefault), ['Restored task', 'Renamed inherited low']);
    const blockedDefault = await saveDefault(paths[0], 'Normal', 'Open', 'Low');
    assert.equal(blockedDefault.status, 403);
    assertFilters(await blockedDefault.text(), 'Open', 'Low');
    assert.equal((await mutateFiltered(`${paths[0]}/tasks`, { title: 'Blocked inherited' })).status, 403);
    assert.equal(await (await fetch(filteredUrl('Open', 'Low'))).text(), archivedDefault);
    await stop();
    base = await start();
    assert.equal(await (await fetch(filteredUrl('Open', 'Low'))).text(), archivedDefault);
    await fetch(`${base}${paths[0]}/restore`, { method: 'POST' });
    assert.equal(await (await fetch(base + paths[0])).text(), preservedDefault);
    assert.equal(await (await fetch(base)).text(), summaryWithInherited);
    await createInherited(paths[0], 'Restored default task');
    assert.deepEqual(selectedPriorities(await (await fetch(base + paths[0])).text()), ['Low', 'High', 'Normal', 'High', 'Low', 'Low']);
    await fetch(`${base}/projects`, { method: 'POST', body: new URLSearchParams({ name: 'New normal project' }) });
    const newProjectList = await (await fetch(base)).text();
    const newProjectPath = [...newProjectList.matchAll(/action="(\/projects\/\d+)"/g)].at(-1)[1];
    assert.equal(defaultOptions(await (await fetch(base + newProjectPath)).text()), normalOptions);
    const finalDefaultDetail = await (await fetch(base + paths[0])).text();
    await stop();
    base = await start();
    assert.equal(await (await fetch(base + paths[0])).text(), finalDefaultDetail);
    // Task 009: migrate existing tasks, validate calendar days, and isolate edits.
    await stop();
    const legacyDates = new DatabaseSync(join(directory, 'projects.sqlite'));
    legacyDates.exec('ALTER TABLE tasks DROP COLUMN due_date');
    legacyDates.close();
    base = await start();
    assert.equal(await (await fetch(base + paths[0])).text(), finalDefaultDetail);
    const dueDates = body => [...body.matchAll(/name="dueDate" type="text" value="([^"]*)"/g)].map(match => match[1]);
    assert.deepEqual(dueDates(finalDefaultDetail), ['', '', '', '', '', '']);
    const saveDate = (path, dueDate) => mutateFiltered(`${path}/due-date`, { dueDate }, 'Open', 'Low');
    const datedTask = taskPaths[0];
    const beforeDates = await (await fetch(filteredUrl('Open', 'Low'))).text();
    const otherBeforeDates = await (await fetch(base + paths[1])).text();
    const summaryBeforeDates = await (await fetch(base)).text();
    for (const date of ['0001-01-01', '0099-12-31', '2000-02-29', '2024-02-29', '9999-12-31']) {
      const saved = await saveDate(datedTask, `  ${date}  `);
      assert.equal(saved.status, 303);
      assert.equal(saved.headers.get('location'), `${paths[0]}?filter=Open&priorityFilter=Low`);
      const body = await (await fetch(base + saved.headers.get('location'))).text();
      assert.equal(body, beforeDates.replace('name="dueDate" type="text" value=""', `name="dueDate" type="text" value="${date}"`));
    }
    const savedDates = await (await fetch(filteredUrl('Open', 'Low'))).text();
    for (const date of ['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2025-02-29', '2024-04-31', '2024-00-01', '2024-13-01', '2024-01-00', '2024-01-32', '2024-1-01', '2024-01-1', '2024-01-01T00:00:00Z', 'not a date']) {
      const invalid = await saveDate(datedTask, date);
      assert.equal(invalid.status, 200);
      const body = await invalid.text();
      assert.match(body, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      assertFilters(body, 'Open', 'Low');
      assert.deepEqual(dueDates(body), dueDates(savedDates));
      assert.equal(await (await fetch(filteredUrl('Open', 'Low'))).text(), savedDates);
    }
    assert.equal(await (await fetch(base)).text(), summaryBeforeDates);
    assert.equal(await (await fetch(base + paths[1])).text(), otherBeforeDates);
    assert.equal((await saveDate(`${paths[1]}/tasks/${datedTask.split('/').at(-1)}`, '2024-01-01')).status, 404);
    assert.equal((await saveDate(`${paths[0]}/tasks/999999`, '2024-01-01')).status, 404);
    await saveDate(inheritedLow, '2026-10-10');
    const independentDates = await (await fetch(filteredUrl('Open', 'Low'))).text();
    assert.deepEqual(dueDates(independentDates), ['9999-12-31', '2026-10-10', '']);
    await stop();
    base = await start();
    assert.equal(await (await fetch(filteredUrl('Open', 'Low'))).text(), independentDates);
    for (const empty of ['', '  \t  ']) {
      await saveDate(datedTask, empty);
      assert.deepEqual(dueDates(await (await fetch(filteredUrl('Open', 'Low'))).text()), ['', '2026-10-10', '']);
      await saveDate(datedTask, '2000-02-29');
    }
    await mutateFiltered(`${datedTask}/rename`, { title: 'Renamed dated task' }, 'Open', 'Low');
    const renamedDates = await (await fetch(filteredUrl('Open', 'Low'))).text();
    assertFilters(renamedDates, 'Open', 'Low');
    assert.match(renamedDates, /aria-label="Complete Renamed dated task" onchange/);
    assert.deepEqual(dueDates(renamedDates), ['2000-02-29', '2026-10-10', '']);
    await fetch(`${base}${paths[0]}/archive`, { method: 'POST' });
    const archivedDates = await (await fetch(filteredUrl('Open', 'Low'))).text();
    assert.equal((archivedDates.match(/name="dueDate" type="text" value="[^"]*" disabled/g) || []).length, 3);
    assert.equal((archivedDates.match(/<button type="submit" disabled>Save due date/g) || []).length, 3);
    assert.equal((await saveDate(datedTask, '2026-01-01')).status, 403);
    assert.equal(await (await fetch(filteredUrl('Open', 'Low'))).text(), archivedDates);
    await stop();
    base = await start();
    assert.equal(await (await fetch(filteredUrl('Open', 'Low'))).text(), archivedDates);
    await fetch(`${base}${paths[0]}/restore`, { method: 'POST' });
    assert.equal(await (await fetch(filteredUrl('Open', 'Low'))).text(), renamedDates);
    await saveDate(datedTask, ' ');
    const clearedDates = await (await fetch(filteredUrl('Open', 'Low'))).text();
    assert.deepEqual(dueDates(clearedDates), ['', '2026-10-10', '']);
    await stop();
    base = await start();
    assert.equal(await (await fetch(filteredUrl('Open', 'Low'))).text(), clearedDates);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
