import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('projects and tasks validate, stay isolated, filter, and survive server restarts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const port = 18080;
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(dir, 'projects.sqlite') },
      stdio: 'ignore'
    });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error('Server exited before ready');
      try {
        const response = await fetch(`${base}/health`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'ok' });
        return;
      } catch { await new Promise(resolve => setTimeout(resolve, 25)); }
    }
    throw new Error('Server did not become ready');
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  const create = name => fetch(`${base}/projects`, {
    method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual'
  });
  try {
    await start();
    const initial = await (await fetch(base)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    const invalid = await create('   ');
    assert.equal(invalid.status, 422);
    const invalidPage = await invalid.text();
    assert.match(invalidPage, /role="alert">Project name is required/);
    assert.doesNotMatch(invalidPage, /data-testid="project-row"/);
    assert.equal((await create('  First project  ')).status, 303);
    assert.equal((await create('<Second>')).status, 303);
    const listing = await (await fetch(base)).text();
    assert.equal((listing.match(/data-testid="project-row"/g) || []).length, 2);
    assert.ok(listing.indexOf('First project') < listing.indexOf('&lt;Second&gt;'));
    assert.match(listing, /action="\/projects\/1"/);
    const detail = await (await fetch(`${base}/projects/1`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /<button type="submit">Projects<\/button>/);
    assert.equal((await fetch(`${base}/projects/999`)).status, 404);
    await stop();
    await start();
    assert.equal(await (await fetch(base)).text(), listing);
    assert.equal(await (await fetch(`${base}/projects/1`)).text(), detail);

    const postTask = (path, values) => fetch(`${base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
    });
    const tasksPage = async (project = 1, filter = 'All') =>
      (await fetch(`${base}/projects/${project}?filter=${filter}`)).text();
    const rowCount = html => (html.match(/data-testid="task-row"/g) || []).length;
    const invalidTask = await postTask('/projects/1/tasks', { title: '   ' });
    assert.equal(invalidTask.status, 422);
    const invalidTaskPage = await invalidTask.text();
    assert.match(invalidTaskPage, /role="alert">Task title is required/);
    assert.equal(rowCount(invalidTaskPage), 0);
    assert.equal((await postTask('/projects/1/tasks', { title: '  First task  ' })).status, 303);
    assert.equal((await postTask('/projects/1/tasks', { title: '<Second task>' })).status, 303);
    let all = await tasksPage();
    assert.equal(rowCount(all), 2);
    assert.ok(all.indexOf('First task') < all.indexOf('&lt;Second task&gt;'));
    assert.match(all, /aria-label="Complete First task"/);
    assert.match(all, /<option selected>All<\/option>/);
    assert.doesNotMatch(all, / checked/);
    assert.equal(rowCount(await tasksPage(2)), 0);
    assert.equal(rowCount(await tasksPage(1, 'Open')), 2);
    assert.equal(rowCount(await tasksPage(1, 'Completed')), 0);
    assert.equal((await postTask('/projects/2/tasks/1', { completed: '1' })).status, 404);
    assert.equal((await postTask('/projects/1/tasks/1', { completed: '1' })).status, 303);
    assert.equal(rowCount(await tasksPage(1, 'Open')), 1);
    const completed = await tasksPage(1, 'Completed');
    assert.equal(rowCount(completed), 1);
    assert.match(completed, /First task/);
    assert.doesNotMatch(completed, /Second task/);
    assert.match(completed, / checked/);
    all = await tasksPage();
    await stop();
    await start();
    assert.equal(await tasksPage(), all);
    assert.equal(await tasksPage(1, 'Completed'), completed);
    assert.equal(rowCount(await tasksPage(2)), 0);
    assert.equal((await postTask('/projects/1/tasks/1', {})).status, 303);
    assert.equal(rowCount(await tasksPage(1, 'Completed')), 0);
    assert.equal(rowCount(await tasksPage(1, 'Open')), 2);
    await stop();
    await start();
    assert.equal(rowCount(await tasksPage(1, 'Completed')), 0);
    assert.equal(rowCount(await tasksPage(1, 'Open')), 2);

    assert.equal((await postTask('/projects/1/tasks/1', { completed: '1' })).status, 303);
    const active = await (await fetch(base)).text();
    assert.match(active, /data-testid="project-summary">1\/2 completed/);
    assert.match(active, /data-testid="project-summary">0\/0 completed/);
    assert.match(active, /<option selected>Active<\/option>/);
    assert.equal((await postTask('/projects/1/archive', {})).status, 303);
    assert.doesNotMatch(await (await fetch(base)).text(), /First project/);
    const archivedList = await (await fetch(`${base}/?filter=Archived`)).text();
    assert.match(archivedList, /First project/);
    assert.match(archivedList, /Restore project/);
    assert.match(archivedList, /Open project/);
    assert.match(archivedList, /1\/2 completed/);
    const archivedPage = await tasksPage();
    assert.match(archivedPage, /Archived project/);
    assert.match(archivedPage, /<button type="submit" disabled>Create task/);
    assert.equal((archivedPage.match(/ disabled onchange/g) || []).length, 2);
    assert.equal(rowCount(await tasksPage(1, 'Completed')), 1);
    assert.equal(rowCount(await tasksPage(1, 'Open')), 1);
    assert.equal((await postTask('/projects/1/tasks', { title: 'Forbidden' })).status, 403);
    assert.equal((await postTask('/projects/1/tasks/1', {})).status, 403);
    await stop();
    await start();
    assert.equal(await tasksPage(), archivedPage);
    assert.equal(await (await fetch(`${base}/?filter=Archived`)).text(), archivedList);
    assert.equal((await postTask('/projects/1/restore', {})).status, 303);
    assert.equal(await (await fetch(base)).text(), active);
    assert.doesNotMatch(await tasksPage(), / disabled[ >]|Archived project/);
    assert.equal(rowCount(await tasksPage(1, 'Completed')), 1);
    await stop();
    await start();
    assert.equal(await (await fetch(base)).text(), active);
    assert.equal(rowCount(await tasksPage(1, 'Completed')), 1);
    assert.equal((await postTask('/projects/1/tasks/1', {})).status, 303);
    assert.equal(rowCount(await tasksPage(1, 'Completed')), 0);
  } finally {
    await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
