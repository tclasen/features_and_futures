import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

test('projects and tasks: validation, isolation, filtering, completion, and persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
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
      return [...html.matchAll(/<div class="card task" data-testid="task-row">([\s\S]*?)<\/div>/g)]
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

    await stop();
    await start();
    assert.equal(await (await fetch(baseUrl)).text(), listing);
    assert.equal(await projectHtml(), savedDetail);
    assert.equal(await projectHtml(paths[1]), otherDetail);
    assert.equal(await projectHtml(`${paths[0]}?filter=Completed`), completedHtml);
    await post(completionPath, {});
    assert.ok(rows(await projectHtml()).every(row => !row.includes(' checked')));
    assert.equal((await fetch(`${baseUrl}/projects/999999`)).status, 404);
    assert.equal((await post('/projects/999999/tasks', { title: 'Missing project' })).status, 404);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
