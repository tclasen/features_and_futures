import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('projects validate, navigate, escape HTML, and persist across restarts', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/test-');
  // Simulate a database from before archive support to verify migration.
  const legacy = new DatabaseSync(resolve(directory, 'projects.sqlite'));
  legacy.exec('CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
  legacy.close();
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  let logs = '';
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: resolve(directory, 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.on('data', chunk => { logs += chunk; });
    child.stderr.on('data', chunk => { logs += chunk; });
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await fetch(`${base}/health`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'ok' });
        return;
      } catch {
        if (child.exitCode !== null) throw new Error(logs);
        await new Promise(resolve => setTimeout(resolve, 30));
      }
    }
    throw new Error(`Server did not become ready: ${logs}`);
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
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual'
    });
  }
  try {
    await start();
    let html = await (await fetch(base)).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, /Create project/);
    assert.match(html, /<label for="project-filter">Project filter<\/label>/);
    assert.match(html, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.doesNotMatch(html, /data-testid="project-row"/);
    for (const name of ['', '  \t\n ']) {
      const response = await create(name);
      html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    const response = await create('  First project  ');
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/');
    await create('<Second & project>');
    html = await (await fetch(base)).text();
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(html, /<span>First project<\/span>/);
    assert.ok(html.indexOf('First project') < html.indexOf('&lt;Second &amp; project&gt;'));
    const paths = [...html.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    assert.equal((html.match(/data-testid="project-summary">0\/0 completed/g) || []).length, 2);
    assert.equal((html.match(/>Archive project<\/button>/g) || []).length, 2);
    const detail = await (await fetch(base + paths[0])).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /<label for="new-project-name">New project name<\/label>/);
    assert.match(detail, /<input id="new-project-name" name="name" type="text">/);
    assert.match(detail, /<button type="submit">Rename project<\/button>/);
    assert.match(detail, /action="\/".*button type="submit">Projects/);
    assert.equal((await fetch(`${base}/projects/999999`)).status, 404);
    async function postTask(path, values) {
      return fetch(base + path, {
        method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
      });
    }
    const taskPath = `${paths[0]}/tasks`;
    for (const title of ['', '  \t\n ']) {
      const invalid = await postTask(taskPath, { title });
      const invalidHtml = await invalid.text();
      assert.match(invalidHtml, /role="alert">Task title is required/);
      assert.doesNotMatch(invalidHtml, /data-testid="task-row"/);
    }
    assert.equal((await postTask(taskPath, { title: '  First task  ' })).status, 303);
    await postTask(taskPath, { title: '<Second & task>' });
    let tasksHtml = await (await fetch(base + paths[0])).text();
    assert.match(tasksHtml, /<label for="task-title">Task title<\/label>/);
    assert.match(tasksHtml, /<label for="task-filter">Task filter<\/label>/);
    assert.match(tasksHtml, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    assert.match(tasksHtml, /aria-label="Complete First task"/);
    assert.match(tasksHtml, /<span>First task<\/span>/);
    assert.doesNotMatch(tasksHtml, / checked/);
    assert.equal((tasksHtml.match(/data-testid="task-row"/g) || []).length, 2);
    assert.ok(tasksHtml.indexOf('First task') < tasksHtml.indexOf('&lt;Second &amp; task&gt;'));
    const completionPath = [...tasksHtml.matchAll(/action="(\/projects\/\d+\/tasks\/\d+)"/g)][0][1];
    assert.equal((await postTask(completionPath, { completed: '1' })).status, 303);
    tasksHtml = await (await fetch(base + paths[0])).text();
    assert.match(tasksHtml, /aria-label="Complete First task" checked/);
    assert.match(await (await fetch(base)).text(), /data-testid="project-summary">1\/2 completed/);
    const openHtml = await (await fetch(base + paths[0] + '?filter=Open')).text();
    assert.doesNotMatch(openHtml, /Complete First task/);
    assert.match(openHtml, /Complete &lt;Second &amp; task&gt;/);
    const completedHtml = await (await fetch(base + paths[0] + '?filter=Completed')).text();
    assert.match(completedHtml, /Complete First task/);
    assert.doesNotMatch(completedHtml, /Complete &lt;Second &amp; task&gt;/);
    assert.doesNotMatch(await (await fetch(base + paths[1])).text(), /data-testid="task-row"/);
    const foreignTaskPath = completionPath.replace(paths[0], paths[1]);
    assert.equal((await postTask(foreignTaskPath, {})).status, 404);
    await stop();
    await start();
    assert.equal(await (await fetch(base + paths[0])).text(), tasksHtml);
    await postTask(completionPath, {});
    assert.doesNotMatch(await (await fetch(base + paths[0])).text(), / checked/);
    await stop();
    await start();
    assert.doesNotMatch(await (await fetch(base + paths[0])).text(), / checked/);
    const reloaded = await (await fetch(base)).text();
    assert.equal(reloaded, html.replace('0/0 completed', '0/2 completed'));
    assert.match(await (await fetch(base + paths[0])).text(), /<h1>First project<\/h1>/);

    await postTask(completionPath, { completed: '1' });
    assert.equal((await postTask(paths[0] + '/archive', {})).status, 303);
    const activeHtml = await (await fetch(base)).text();
    assert.doesNotMatch(activeHtml, /First project/);
    assert.match(activeHtml, /&lt;Second &amp; project&gt;/);
    const archivedHtml = await (await fetch(base + '/?filter=Archived')).text();
    assert.match(archivedHtml, /<option selected>Archived<\/option>/);
    assert.match(archivedHtml, /First project/);
    assert.match(archivedHtml, /data-testid="project-summary">1\/2 completed/);
    assert.match(archivedHtml, />Open project<\/button>/);
    assert.match(archivedHtml, />Restore project<\/button>/);
    assert.doesNotMatch(archivedHtml, />Archive project<\/button>/);
    const archivedDetail = await (await fetch(base + paths[0])).text();
    assert.match(archivedDetail, /Archived project/);
    assert.match(archivedDetail, /<input id="new-project-name" name="name" type="text" disabled>/);
    assert.match(archivedDetail, /<button type="submit" disabled>Rename project/);
    assert.equal((await postTask(paths[0] + '/rename', { name: 'Blocked rename' })).status, 403);
    assert.equal(await (await fetch(base + paths[0])).text(), archivedDetail);
    assert.match(archivedDetail, /<button type="submit" disabled>Create task/);
    assert.equal((archivedDetail.match(/type="checkbox"[^>]* disabled/g) || []).length, 2);
    assert.match(archivedDetail, /aria-label="Complete First task" checked disabled/);
    const archivedOpen = await (await fetch(base + paths[0] + '?filter=Open')).text();
    assert.doesNotMatch(archivedOpen, /Complete First task/);
    assert.match(archivedOpen, /Complete &lt;Second &amp; task&gt;/);
    const archivedCompleted = await (await fetch(base + paths[0] + '?filter=Completed')).text();
    assert.match(archivedCompleted, /Complete First task/);
    assert.doesNotMatch(archivedCompleted, /Complete &lt;Second &amp; task&gt;/);
    assert.equal((await postTask(taskPath, { title: 'Blocked task' })).status, 403);
    assert.equal((await postTask(completionPath, {})).status, 403);
    await stop();
    await start();
    assert.equal(await (await fetch(base + '/?filter=Archived')).text(), archivedHtml);
    assert.equal(await (await fetch(base + paths[0])).text(), archivedDetail);
    assert.equal((await postTask(paths[0] + '/restore', {})).status, 303);
    assert.doesNotMatch(await (await fetch(base + '/?filter=Archived')).text(), /data-testid="project-row"/);
    const restoredList = await (await fetch(base)).text();
    assert.ok(restoredList.indexOf('First project') < restoredList.indexOf('&lt;Second &amp; project&gt;'));
    assert.match(restoredList, /data-testid="project-summary">1\/2 completed/);
    const restoredDetail = await (await fetch(base + paths[0])).text();
    assert.doesNotMatch(restoredDetail, /Archived project| disabled/);
    assert.match(restoredDetail, /aria-label="Complete First task" checked/);
    assert.equal((restoredDetail.match(/data-testid="task-row"/g) || []).length, 2);
    await stop();
    await start();
    assert.equal(await (await fetch(base)).text(), restoredList);
    assert.equal(await (await fetch(base + paths[0])).text(), restoredDetail);
    const renamePath = paths[0] + '/rename';
    for (const name of ['', '  \t\n ']) {
      const invalid = await postTask(renamePath, { name });
      assert.equal(invalid.status, 200);
      const invalidHtml = await invalid.text();
      assert.match(invalidHtml, /role="alert">Project name is required/);
      assert.match(invalidHtml, /<h1>First project<\/h1>/);
      assert.equal(await (await fetch(base)).text(), restoredList);
    }
    assert.equal((await postTask('/projects/999999/rename', { name: 'Missing' })).status, 404);
    const renamed = await postTask(renamePath, { name: '  <Renamed & project>  ', filter: 'Completed' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), paths[0] + '?filter=Completed');
    const renamedDetail = await (await fetch(base + paths[0])).text();
    assert.equal(renamedDetail, restoredDetail.replaceAll('First project', '&lt;Renamed &amp; project&gt;'));
    const renamedList = await (await fetch(base)).text();
    assert.equal(renamedList, restoredList.replace('First project', '&lt;Renamed &amp; project&gt;'));
    await stop();
    await start();
    assert.equal(await (await fetch(base)).text(), renamedList);
    assert.equal(await (await fetch(base + paths[0])).text(), renamedDetail);
    await postTask(completionPath, {});
    assert.match(await (await fetch(base)).text(), /data-testid="project-summary">0\/2 completed/);
    assert.equal((await postTask(taskPath, { title: 'After restore' })).status, 303);
    assert.match(await (await fetch(base)).text(), /data-testid="project-summary">0\/3 completed/);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
