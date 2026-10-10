import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${output}`));
    }, 5000);
    child.stderr.on('data', data => { output += data; });
    child.stdout.on('data', data => {
      output += data;
      const match = /listening on port (\d+)/.exec(output);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Server exited (${code}): ${output}`));
    });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects validate, trim, preserve order, navigate, and survive a restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const initial = await (await fetch(server.url)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, /<button type="submit">Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);

    async function create(name) {
      return fetch(`${server.url}/projects`, {
        method: 'POST',
        body: new URLSearchParams({ name }),
        redirect: 'manual',
      });
    }
    for (const name of ['', ' \t\n ']) {
      const result = await create(name);
      assert.equal(result.status, 400);
      const html = await result.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }

    const first = await create('  Launch <plan> & review  ');
    assert.equal(first.status, 303);
    assert.equal(first.headers.get('location'), '/');
    assert.equal((await create('Second project')).status, 303);
    const list = await (await fetch(server.url)).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(list, /class="project-name">Launch &lt;plan&gt; &amp; review<\/span>/);
    assert.ok(list.indexOf('Launch &lt;plan&gt;') < list.indexOf('Second project'));
    const paths = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    assert.notEqual(paths[0], paths[1]);
    const project = await (await fetch(`${server.url}${paths[0]}`)).text();
    assert.match(project, /<h1>Launch &lt;plan&gt; &amp; review<\/h1>/);
    assert.match(project, /action="\/">\s*<button type="submit">Projects<\/button>/);

    const invalid = await create('   ');
    assert.equal((await invalid.text()).match(/data-testid="project-row"/g).length, 2);
    assert.equal(await (await fetch(server.url)).text(), list);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await (await fetch(server.url)).text(), list);
    assert.equal(await (await fetch(`${server.url}${paths[0]}`)).text(), project);
    assert.equal((await fetch(`${server.url}/projects/99999`)).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, toggle, stay within their project, and survive a restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async path => (await fetch(`${server.url}${path}`)).text();
    const rows = page => [...page.matchAll(/<div class="task-row" data-testid="task-row">([\s\S]*?)<\/div>/g)].map(match => match[1]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const project = '/projects/1';
    const initial = await html(project);
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, /<button type="submit">Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    assert.equal(rows(initial).length, 0);

    for (const title of ['', ' \t\n ']) {
      const response = await post(`${project}/tasks`, { title });
      assert.equal(response.status, 400);
      const page = await response.text();
      assert.match(page, /role="alert">Task title is required/);
      assert.equal(rows(page).length, 0);
    }
    const created = await post(`${project}/tasks`, { title: '  Plan <launch> & "review"  ' });
    assert.equal(created.status, 303);
    assert.equal(created.headers.get('location'), project);
    await post(`${project}/tasks`, { title: 'Follow up' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    const all = await html(project);
    const taskRows = rows(all);
    assert.equal(taskRows.length, 2);
    assert.match(taskRows[0], /<span>Plan &lt;launch&gt; &amp; &quot;review&quot;<\/span>/);
    assert.match(taskRows[0], /aria-label="Complete Plan &lt;launch&gt; &amp; &quot;review&quot;"/);
    assert.match(taskRows[1], /aria-label="Complete Follow up"/);
    assert.ok(taskRows.every(row => !row.includes(' checked')));
    assert.match(taskRows[0], /onchange="this.form.requestSubmit\(\)"/);
    assert.doesNotMatch(all, /Other project task/);
    assert.equal(rows(await html('/projects/2')).length, 1);
    assert.equal(rows(await html(`${project}?filter=Completed`)).length, 0);
    assert.equal(rows(await html(`${project}?filter=Open`)).length, 2);

    const completed = await post(`${project}/tasks/1`, { completed: '1', filter: 'Open' });
    assert.equal(completed.status, 303);
    assert.equal(completed.headers.get('location'), `${project}?filter=Open`);
    const saved = await html(project);
    assert.match(rows(saved)[0], / checked/);
    assert.doesNotMatch(rows(saved)[1], / checked/);
    const open = await html(`${project}?filter=Open`);
    assert.equal(rows(open).length, 1);
    assert.match(rows(open)[0], /Follow up/);
    assert.match(open, /<option selected>Open<\/option>/);
    const done = await html(`${project}?filter=Completed`);
    assert.equal(rows(done).length, 1);
    assert.match(rows(done)[0], /Plan &lt;launch&gt;/);

    assert.equal((await post('/projects/2/tasks/1', {})).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Missing' })).status, 404);
    assert.equal((await post(`${project}/tasks/999`, { completed: '1' })).status, 404);
    const invalid = await post(`${project}/tasks`, { title: '   ' });
    assert.equal(invalid.status, 400);
    assert.equal(rows(await invalid.text()).length, 2);
    assert.equal(await html(project), saved);

    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await html(project), saved);
    assert.equal(await html(`${project}?filter=Open`), open);
    assert.equal(await html(`${project}?filter=Completed`), done);
    assert.equal(rows(await html('/projects/2')).length, 1);
    const reopened = await post(`${project}/tasks/1`, {});
    assert.equal(reopened.status, 303);
    assert.equal(rows(await html(`${project}?filter=Completed`)).length, 0);
    assert.equal(rows(await html(`${project}?filter=Open`)).length, 2);
    await server.stop();
    server = await startServer(databasePath);
    assert.ok(rows(await html(project)).every(row => !row.includes(' checked')));
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
