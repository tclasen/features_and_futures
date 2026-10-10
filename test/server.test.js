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
    assert.equal(renamedResponse.headers.get('location'), `${projectPath}?filter=Completed`);
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
    assert.equal(taskRename.headers.get('location'), `${projectPath}?filter=Completed`);
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
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
