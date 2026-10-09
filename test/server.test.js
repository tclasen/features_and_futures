import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const baseUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = /listening on port (\d+)/.exec(output);
      if (match) {
        clearTimeout(timeout);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  return {
    baseUrl,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('project validation, ordering, navigation, escaping, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let server;
  try {
    const databasePath = join(directory, 'nested', 'projects.sqlite');
    server = await startServer(databasePath);
    const get = (path) => fetch(`${server.baseUrl}${path}`);
    const create = (name) => fetch(`${server.baseUrl}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ name }),
      redirect: 'manual',
    });
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const initial = await (await get('/')).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);

    for (const name of ['', ' \t\n ']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 422);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    const created = await create('  First project  ');
    assert.equal(created.status, 303);
    assert.equal(created.headers.get('location'), '/');
    assert.equal((await create('<script> & café')).status, 303);
    const listing = await (await get('/')).text();
    assert.equal((listing.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(listing, /<span>First project<\/span>/);
    assert.match(listing, /&lt;script&gt; &amp; café/);
    assert.ok(listing.indexOf('First project') < listing.indexOf('&lt;script&gt;'));
    const paths = [...listing.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
    assert.equal(paths.length, 2);
    assert.notEqual(paths[0], paths[1]);
    const detail = await (await get(paths[0])).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/" method="get"><button type="submit">Projects/);
    assert.equal((await get('/projects/99999')).status, 404);
    assert.equal((await get('/projects/999999999999999999999')).status, 404);

    const invalidAfterCreation = await (await create('   ')).text();
    assert.equal((invalidAfterCreation.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(invalidAfterCreation, /role="alert">Project name is required/);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await (await get('/')).text(), listing);
    assert.equal(await (await get(paths[0])).text(), detail);
    assert.equal((await create('Third project')).status, 303);
    const finalListing = await (await get('/')).text();
    assert.equal((finalListing.match(/data-testid="project-row"/g) || []).length, 3);
    assert.ok(finalListing.indexOf('Third project') > finalListing.indexOf('&lt;script&gt;'));
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, remain project-owned, and persist across restarts on an existing database', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  let server;
  try {
    const databasePath = join(directory, 'workboard.sqlite');
    // Model a database from Task 001 so schema upgrades preserve existing projects.
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      INSERT INTO projects (name) VALUES ('Existing project'), ('Other project');
    `);
    database.close();
    server = await startServer(databasePath);
    const get = (path) => fetch(`${server.baseUrl}${path}`);
    const post = (path, values) => fetch(`${server.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(values),
      redirect: 'manual',
    });
    const html = async (path) => (await get(path)).text();
    const taskRows = (content) => [...content.matchAll(/<form class="task"[^>]*data-testid="task-row"[\s\S]*?<\/form>/g)]
      .map((match) => match[0]);
    const initial = await html('/projects/1');
    assert.match(initial, /<h1>Existing project<\/h1>/);
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, />Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    assert.equal(taskRows(initial).length, 0);

    for (const title of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/tasks', { title });
      assert.equal(invalid.status, 422);
      const content = await invalid.text();
      assert.match(content, /role="alert">Task title is required/);
      assert.equal(taskRows(content).length, 0);
    }
    const missingTitle = await post('/projects/1/tasks', {});
    assert.equal(missingTitle.status, 422);
    const created = await post('/projects/1/tasks', { title: '  First task  ' });
    assert.equal(created.status, 303);
    assert.equal(created.headers.get('location'), '/projects/1?filter=All');
    assert.equal((await post('/projects/1/tasks', { title: '<script> " & café' })).status, 303);
    assert.equal((await post('/projects/2/tasks', { title: 'Other task' })).status, 303);

    const all = await html('/projects/1');
    const rows = taskRows(all);
    assert.equal(rows.length, 2);
    assert.match(rows[0], />First task<\/label>/);
    assert.match(rows[0], /type="checkbox"[^>]*aria-label="Complete First task"/);
    assert.match(rows[1], /aria-label="Complete &lt;script&gt; &quot; &amp; café"/);
    assert.doesNotMatch(all, /Other task/);
    assert.ok(rows.every((row) => !/\bchecked\b/.test(row)));
    assert.equal(taskRows(await html('/projects/1?filter=Open')).length, 2);
    assert.equal(taskRows(await html('/projects/1?filter=Completed')).length, 0);
    assert.equal(await html('/projects/1?filter=Invalid'), all);
    const taskPath = /action="([^"]+)"/.exec(rows[0])[1];

    const foreignUpdate = await post(taskPath.replace('/projects/1/', '/projects/2/'), { completed: '1' });
    assert.equal(foreignUpdate.status, 404);
    assert.equal(await html('/projects/1'), all);
    assert.equal((await post('/projects/99999/tasks', { title: 'Orphan task' })).status, 404);
    assert.equal((await post('/projects/1/tasks/99999', { completed: '1' })).status, 404);

    const completed = await post(taskPath, { completed: '1', filter: 'Open' });
    assert.equal(completed.status, 303);
    assert.equal(completed.headers.get('location'), '/projects/1?filter=Open');
    const saved = await html('/projects/1');
    const savedRows = taskRows(saved);
    assert.match(savedRows[0], /\bchecked\b/);
    assert.doesNotMatch(savedRows[1], /\bchecked\b/);
    const openRows = taskRows(await html('/projects/1?filter=Open'));
    assert.equal(openRows.length, 1);
    assert.match(openRows[0], /&lt;script&gt;/);
    const completedPage = await html('/projects/1?filter=Completed');
    assert.match(completedPage, /<option selected>Completed<\/option>/);
    assert.equal(taskRows(completedPage).length, 1);
    assert.match(taskRows(completedPage)[0], />First task<\/label>/);
    const invalidAfterCreation = await post('/projects/1/tasks', { title: ' ', filter: 'Completed' });
    assert.equal(invalidAfterCreation.status, 422);
    assert.equal(taskRows(await invalidAfterCreation.text()).length, 1);
    assert.equal(await html('/projects/1'), saved);
    const otherPage = await html('/projects/2');
    assert.equal(taskRows(otherPage).length, 1);
    assert.match(otherPage, />Other task<\/label>/);
    assert.doesNotMatch(otherPage, /First task|&lt;script&gt;/);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), saved);
    assert.equal(await html('/projects/1?filter=Completed'), completedPage);
    assert.equal(await html('/projects/2'), otherPage);
    assert.equal((await post(taskPath, { filter: 'Completed' })).status, 303);
    assert.equal(taskRows(await html('/projects/1?filter=Completed')).length, 0);
    assert.equal(await html('/projects/1'), all);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await html('/projects/1'), all);
    assert.equal((await post('/projects/1/tasks', { title: 'Third task' })).status, 303);
    const finalRows = taskRows(await html('/projects/1'));
    assert.equal(finalRows.length, 3);
    assert.match(finalRows[2], />Third task<\/label>/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
