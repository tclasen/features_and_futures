import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';

async function unusedPort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

test('projects and tasks: validation, order, isolation, completion, filtering and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  // Start with the original project schema to exercise the archive migration.
  const legacy = new DatabaseSync(join(directory, 'projects.sqlite'));
  legacy.exec('CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
  legacy.close();
  const port = await unusedPort();
  const base = `http://127.0.0.1:${port}`;
  let child;
  let output = '';
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await fetch(`${base}/health`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'ok' });
        return;
      } catch {
        if (child.exitCode !== null) throw new Error(output);
        await new Promise(resolve => setTimeout(resolve, 30));
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
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
  }
  try {
    await start();
    let html = await (await fetch(base)).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, />Create project<\/button>/);
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 0);
    for (const name of ['', '   \t\n']) {
      const response = await create(name);
      assert.equal(response.status, 422);
      html = await response.text();
      assert.match(html, /role="alert"[^>]*>Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    for (const name of ['  First project  ', 'Second <project>']) {
      const response = await create(name);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    html = await (await fetch(base)).text();
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(html, /<span>First project<\/span>/);
    assert.ok(html.indexOf('First project') < html.indexOf('Second &lt;project&gt;'));
    const paths = [...html.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    assert.equal((html.match(/data-testid="project-summary">0\/0 completed/g) || []).length, 2);
    assert.match(html, /<label for="project-filter">Project filter<\/label>/);
    assert.match(html, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.notEqual(paths[0], paths[1]);
    const detail = await (await fetch(base + paths[0])).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/" method="get"><button type="submit">Projects<\/button>/);
    const invalid = await create('   ');
    assert.equal(((await invalid.text()).match(/data-testid="project-row"/g) || []).length, 2);
    async function post(path, values) {
      return fetch(base + path, {
        method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
      });
    }
    async function detailHtml(path = paths[0]) {
      return (await fetch(base + path)).text();
    }
    const taskCount = html => (html.match(/data-testid="task-row"/g) || []).length;
    assert.match(detail, /<label for="task-title">Task title<\/label>/);
    assert.match(detail, />Create task<\/button>/);
    assert.match(detail, /<label for="task-filter">Task filter<\/label>/);
    assert.match(detail, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const response = await post(`${paths[0]}/tasks`, { title });
      assert.equal(response.status, 422);
      const invalidHtml = await response.text();
      assert.match(invalidHtml, /role="alert"[^>]*>Task title is required/);
      assert.equal(taskCount(invalidHtml), 0);
    }
    for (const title of ['  First task  ', 'Second <task>']) {
      assert.equal((await post(`${paths[0]}/tasks`, { title })).status, 303);
    }
    html = await detailHtml();
    assert.equal(taskCount(html), 2);
    assert.match(html, /aria-label="Complete First task"/);
    assert.match(html, /aria-label="Complete Second &lt;task&gt;"/);
    assert.match(html, /<span>First task<\/span>/);
    assert.ok(html.indexOf('First task') < html.indexOf('Second &lt;task&gt;'));
    assert.doesNotMatch(html, /\schecked\s/);
    assert.equal(taskCount(await detailHtml(paths[1])), 0);
    const completionPaths = [...html.matchAll(/action="([^" ]+\/completion)"/g)].map(match => match[1]);
    assert.equal(completionPaths.length, 2);
    assert.equal((await post(completionPaths[0], { completed: '1' })).status, 303);
    assert.match(await detailHtml(), /aria-label="Complete First task" checked/);
    const open = await detailHtml(`${paths[0]}?filter=Open`);
    assert.equal(taskCount(open), 1);
    assert.doesNotMatch(open, /Complete First task/);
    const completed = await detailHtml(`${paths[0]}?filter=Completed`);
    assert.equal(taskCount(completed), 1);
    assert.doesNotMatch(completed, /Complete Second/);
    assert.match(completed, /<option selected>Completed/);
    const taskId = completionPaths[0].match(/\/tasks\/(\d+)/)[1];
    assert.equal((await post(`${paths[1]}/tasks/${taskId}/completion`, {})).status, 404);
    assert.match(await detailHtml(), /aria-label="Complete First task" checked/);
    assert.equal((await post(completionPaths[0], {})).status, 303);
    assert.doesNotMatch(await detailHtml(), /\schecked\s/);
    assert.equal(taskCount(await detailHtml(`${paths[0]}?filter=Completed`)), 0);
    await post(completionPaths[1], { completed: '1' });
    const invalidTask = await post(`${paths[0]}/tasks`, { title: '  ' });
    assert.equal(taskCount(await invalidTask.text()), 2);
    const tasksBeforeRestart = await detailHtml();
    const beforeRestart = await (await fetch(base)).text();
    await stop();
    await start();
    assert.equal(await (await fetch(base)).text(), beforeRestart);
    assert.equal(await detailHtml(), tasksBeforeRestart);
    assert.equal(taskCount(await detailHtml(paths[1])), 0);
    assert.equal(taskCount(await detailHtml(`${paths[0]}?filter=Completed`)), 1);
    assert.equal((await fetch(`${base}/projects/99999`)).status, 404);

    html = await (await fetch(base)).text();
    assert.match(html, /data-testid="project-summary">1\/2 completed/);
    assert.equal((await post(`${paths[0]}/archive`, {})).status, 303);
    html = await (await fetch(base)).text();
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 1);
    assert.doesNotMatch(html, /First project/);
    const archivedList = await (await fetch(`${base}/?filter=Archived`)).text();
    assert.match(archivedList, /First project/);
    assert.match(archivedList, />Open project<\/button>/);
    assert.match(archivedList, />Restore project<\/button>/);
    assert.doesNotMatch(archivedList, />Archive project<\/button>/);
    assert.match(archivedList, /data-testid="project-summary">1\/2 completed/);
    const archivedDetail = await detailHtml();
    assert.match(archivedDetail, /<p>Archived project<\/p>/);
    assert.match(archivedDetail, /<button type="submit" disabled>Create task/);
    assert.equal((archivedDetail.match(/aria-label="Complete [^"]*"[^>]*disabled/g) || []).length, 2);
    assert.equal(taskCount(await detailHtml(`${paths[0]}?filter=Open`)), 1);
    assert.equal(taskCount(await detailHtml(`${paths[0]}?filter=Completed`)), 1);
    assert.equal((await post(`${paths[0]}/tasks`, { title: 'Forbidden' })).status, 403);
    assert.equal((await post(completionPaths[0], { completed: '1' })).status, 403);
    assert.equal(await detailHtml(), archivedDetail);
    await stop();
    await start();
    assert.equal(await detailHtml(), archivedDetail);
    assert.equal(await (await fetch(`${base}/?filter=Archived`)).text(), archivedList);
    assert.equal((await post(`${paths[0]}/restore`, {})).status, 303);
    assert.equal(await detailHtml(), tasksBeforeRestart);
    assert.equal(await (await fetch(base)).text(), beforeRestart);
    assert.doesNotMatch(await (await fetch(`${base}/?filter=Archived`)).text(), /data-testid="project-row"/);
    await stop();
    await start();
    assert.equal(await detailHtml(), tasksBeforeRestart);
    assert.equal(await (await fetch(base)).text(), beforeRestart);

    assert.match(await detailHtml(), /<label for="new-project-name">New project name<\/label>/);
    assert.match(await detailHtml(), /<button type="submit">Rename project<\/button>/);
    for (const name of ['', ' \t\n ']) {
      const response = await post(`${paths[0]}/rename`, { name });
      assert.equal(response.status, 422);
      const invalidHtml = await response.text();
      assert.match(invalidHtml, /role="alert"[^>]*>Project name is required/);
      assert.match(invalidHtml, /<h1>First project<\/h1>/);
      assert.equal(await detailHtml(), tasksBeforeRestart);
    }
    const renamed = await post(`${paths[0]}/rename`, { name: '  Renamed <project>  ', filter: 'Completed' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), `${paths[0]}?filter=Completed`);
    const renamedDetail = await detailHtml();
    assert.match(renamedDetail, /<h1>Renamed &lt;project&gt;<\/h1>/);
    assert.equal(taskCount(renamedDetail), 2);
    assert.match(renamedDetail, /aria-label="Complete Second &lt;task&gt;" checked/);
    assert.equal(taskCount(await detailHtml(`${paths[0]}?filter=Completed`)), 1);
    const renamedList = await (await fetch(base)).text();
    assert.ok(renamedList.indexOf('Renamed &lt;project&gt;') < renamedList.indexOf('Second &lt;project&gt;'));
    assert.match(renamedList, /data-testid="project-summary">1\/2 completed/);
    assert.deepEqual([...renamedList.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]), paths);
    await stop();
    await start();
    assert.equal(await detailHtml(), renamedDetail);
    assert.equal(await (await fetch(base)).text(), renamedList);
    await post(`${paths[0]}/archive`, {});
    html = await detailHtml();
    assert.match(html, /id="new-project-name"[^>]* disabled/);
    assert.match(html, /<button type="submit" disabled>Rename project/);
    assert.equal((await post(`${paths[0]}/rename`, { name: 'Forbidden' })).status, 403);
    assert.equal(await detailHtml(), html);
    await post(`${paths[0]}/restore`, {});
    assert.equal(await detailHtml(), renamedDetail);
    assert.equal((await post(`${paths[0]}/rename`, { name: 'Restored name' })).status, 303);
    const restoredDetail = await detailHtml();
    assert.match(restoredDetail, /<h1>Restored name<\/h1>/);
    assert.equal(taskCount(restoredDetail), 2);
    await stop();
    await start();
    assert.equal(await detailHtml(), restoredDetail);
    assert.match(await (await fetch(base)).text(), /data-testid="project-summary">1\/2 completed/);
    assert.equal((await post('/projects/99999/rename', { name: 'Missing' })).status, 404);

    const renamePaths = completionPaths.map(path => path.replace(/completion$/, 'rename'));
    html = await detailHtml();
    assert.equal((html.match(/>New task title<\/label>/g) || []).length, 2);
    assert.equal((html.match(/>Rename task<\/button>/g) || []).length, 2);
    for (const title of ['', ' \t\n ']) {
      const response = await post(renamePaths[1], { title, filter: 'Completed' });
      assert.equal(response.status, 422);
      const invalidHtml = await response.text();
      assert.match(invalidHtml, /role="alert"[^>]*>Task title is required/);
      assert.equal(taskCount(invalidHtml), 1);
      assert.match(invalidHtml, /aria-label="Complete Second &lt;task&gt;" checked/);
      assert.equal(await detailHtml(), html);
    }
    const renameResponse = await post(renamePaths[1], { title: '  Renamed <task> "title"  ', filter: 'Completed' });
    assert.equal(renameResponse.status, 303);
    assert.equal(renameResponse.headers.get('location'), `${paths[0]}?filter=Completed`);
    let renamedTasks = await detailHtml();
    assert.match(renamedTasks, /aria-label="Complete Renamed &lt;task&gt; &quot;title&quot;" checked/);
    assert.ok(renamedTasks.indexOf('First task') < renamedTasks.indexOf('Renamed &lt;task&gt;'));
    assert.deepEqual([...renamedTasks.matchAll(/action="([^" ]+\/completion)"/g)].map(match => match[1]), completionPaths);
    assert.equal(taskCount(await detailHtml(`${paths[0]}?filter=Completed`)), 1);
    assert.doesNotMatch(await detailHtml(`${paths[0]}?filter=Open`), /Renamed &lt;task&gt;/);
    assert.equal(taskCount(await detailHtml(paths[1])), 0);
    const summaryBefore = await (await fetch(base)).text();
    assert.match(summaryBefore, /data-testid="project-summary">1\/2 completed/);
    assert.equal((await post(`${paths[1]}/tasks/${taskId}/rename`, { title: 'Wrong owner' })).status, 404);
    assert.equal((await post(`${paths[0]}/tasks/99999/rename`, { title: 'Missing' })).status, 404);
    assert.equal((await post(renamePaths[0], { title: '  Renamed open task  ', filter: 'Open' })).status, 303);
    renamedTasks = await detailHtml();
    assert.match(renamedTasks, /aria-label="Complete Renamed open task"\s+onchange/);
    assert.equal(await (await fetch(base)).text(), summaryBefore);
    await stop();
    await start();
    assert.equal(await detailHtml(), renamedTasks);
    await post(`${paths[0]}/archive`, {});
    const archivedTasks = await detailHtml();
    assert.equal((archivedTasks.match(/id="new-task-title-\d+"[^>]* disabled/g) || []).length, 2);
    assert.equal((archivedTasks.match(/<button type="submit" disabled>Rename task/g) || []).length, 2);
    assert.equal((await post(renamePaths[1], { title: 'Forbidden' })).status, 403);
    assert.equal(await detailHtml(), archivedTasks);
    await stop();
    await start();
    assert.equal(await detailHtml(), archivedTasks);
    await post(`${paths[0]}/restore`, {});
    assert.equal(await detailHtml(), renamedTasks);
    assert.equal((await post(renamePaths[1], { title: 'Restored task' })).status, 303);
    const restoredTasks = await detailHtml();
    assert.match(restoredTasks, /aria-label="Complete Restored task" checked/);
    assert.equal(await (await fetch(base)).text(), summaryBefore);
    await stop();
    await start();
    assert.equal(await detailHtml(), restoredTasks);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
