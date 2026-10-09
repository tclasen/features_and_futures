import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const baseUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 10000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  return {
    baseUrl,
    async stop() {
      if (child.exitCode !== null) return;
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects validate, navigate, retain creation order, and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const health = await fetch(`${server.baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const initial = await (await fetch(server.baseUrl)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, /<button type="submit">Create project<\/button>/);
    assert.equal((initial.match(/data-testid="project-row"/g) || []).length, 0);

    const create = name => fetch(`${server.baseUrl}/projects`, {
      method: 'POST',
      body: new URLSearchParams({ name }),
      redirect: 'manual',
    });
    for (const name of ['', ' \t\n ']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 422);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.equal((html.match(/data-testid="project-row"/g) || []).length, 0);
    }

    for (const name of ['  First project  ', 'Second <project> & "team"', 'First project']) {
      const response = await create(name);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    const listing = await (await fetch(server.baseUrl)).text();
    assert.equal((listing.match(/data-testid="project-row"/g) || []).length, 3);
    const names = [...listing.matchAll(/<span class="name">(.*?)<\/span>/g)].map(match => match[1]);
    assert.deepEqual(names, ['First project', 'Second &lt;project&gt; &amp; &quot;team&quot;', 'First project']);
    const paths = [...listing.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(new Set(paths).size, 3);
    const detail = await (await fetch(`${server.baseUrl}${paths[1]}`)).text();
    assert.match(detail, /<h1>Second &lt;project&gt; &amp; &quot;team&quot;<\/h1>/);
    assert.match(detail, /action="\/">\s*<button type="submit">Projects<\/button>/);
    assert.equal((await fetch(`${server.baseUrl}/projects/99999`)).status, 404);

    const invalidWithProjects = await create('   ');
    assert.equal((await invalidWithProjects.text()).match(/data-testid="project-row"/g).length, 3);
    assert.equal(await (await fetch(server.baseUrl)).text(), listing);

    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await (await fetch(server.baseUrl)).text(), listing);
    assert.equal(await (await fetch(`${server.baseUrl}${paths[1]}`)).text(), detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, complete, stay in their project, and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, fields) => fetch(`${server.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const detail = (project = 1, filter = '') => fetch(`${server.baseUrl}/projects/${project}${filter ? `?filter=${filter}` : ''}`).then(response => response.text());
    const rows = html => [...html.matchAll(/data-testid="task-row">([\s\S]*?)<\/div>/g)].map(match => match[1]);
    const titles = html => rows(html).map(row => row.match(/<span>(.*?)<\/span>/)[1]);

    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const initial = await detail();
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, /<button type="submit">Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/tasks', { title });
      assert.equal(invalid.status, 422);
      const html = await invalid.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(rows(html).length, 0);
    }
    for (const title of ['  Plan work  ', 'Review <draft> & "notes"', 'Ship']) {
      assert.equal((await post('/projects/1/tasks', { title })).status, 303);
    }
    assert.deepEqual(titles(await detail()), ['Plan work', 'Review &lt;draft&gt; &amp; &quot;notes&quot;', 'Ship']);
    assert.equal(rows(await detail()).filter(row => / checked/.test(row)).length, 0);
    assert.match(await detail(), /aria-label="Complete Plan work"/);
    assert.match(await detail(), /aria-label="Complete Review &lt;draft&gt; &amp; &quot;notes&quot;"/);
    assert.equal(rows(await detail(2)).length, 0);
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Orphan' })).status, 404);

    const completed = await post('/projects/1/tasks/2', { completed: '1', filter: 'Open' });
    assert.equal(completed.status, 303);
    assert.equal(completed.headers.get('location'), '/projects/1?filter=Open');
    assert.deepEqual(titles(await detail(1, 'Open')), ['Plan work', 'Ship']);
    assert.deepEqual(titles(await detail(1, 'Completed')), ['Review &lt;draft&gt; &amp; &quot;notes&quot;']);
    assert.match(rows(await detail(1, 'Completed'))[0], / checked/);
    assert.equal(rows(await detail(1, 'All')).length, 3);
    const invalidWithTasks = await post('/projects/1/tasks', { title: '   ' });
    assert.equal(rows(await invalidWithTasks.text()).length, 3);
    await post('/projects/2/tasks', { title: 'Other project task' });
    assert.deepEqual(titles(await detail(2)), ['Other project task']);

    const saved = await detail();
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await detail(), saved);
    assert.deepEqual(titles(await detail(1, 'Open')), ['Plan work', 'Ship']);
    assert.deepEqual(titles(await detail(2)), ['Other project task']);
    assert.equal((await post('/projects/1/tasks/2', {})).status, 303);
    assert.equal(rows(await detail(1, 'Completed')).length, 0);
    assert.equal(rows(await detail(1, 'Open')).length, 3);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(rows(await detail()).filter(row => / checked/.test(row)).length, 0);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
