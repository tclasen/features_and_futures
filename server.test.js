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
    const initial = await (await fetch(base)).text();
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
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
