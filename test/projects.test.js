import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('projects and tasks support validation, ownership, archives, summaries, and persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('exit', code => reject(new Error(`Server exited: ${code}`)));
      child.stdout.on('data', chunk => {
        output += chunk;
        const port = output.match(/listening on port (\d+)/);
        if (port) { base = `http://127.0.0.1:${port[1]}`; resolve(); }
      });
    });
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = undefined;
  }
  const get = path => fetch(`${base}${path}`);
  const create = name => fetch(`${base}/projects`, {
    method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
  });
  const post = (path, values) => fetch(`${base}${path}`, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const taskRows = html => html.match(/<div class="panel task" data-testid="task-row">[\s\S]*?<\/div>/g) || [];
  try {
    await start();
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const initial = await (await get('/')).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, /<button type="submit">Create project<\/button>/);
    assert.match(initial, /<label for="project-filter">Project filter<\/label>/);
    assert.match(initial, /<option selected>Active<\/option><option>Archived<\/option>/);
    for (const name of ['', '  \t\n ']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      assert.match(await invalid.text(), /role="alert">Project name is required/);
    }
    assert.doesNotMatch(await (await get('/')).text(), /data-testid="project-row"/);
    for (const name of ['  Alpha  ', 'Beta <script> & "test"']) {
      const response = await create(name);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    const listing = await (await get('/')).text();
    assert.equal((listing.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(listing, /class="project-name">Alpha<\/span>/);
    assert.ok(listing.indexOf('>Alpha</span>') < listing.indexOf('>Beta &lt;script&gt;'));
    assert.match(listing, /Beta &lt;script&gt; &amp; &quot;test&quot;/);
    assert.match(listing, /action="\/projects\/1"/);
    assert.equal((listing.match(/data-testid="project-summary">0\/0 completed/g) || []).length, 2);
    assert.equal((listing.match(/>Archive project<\/button>/g) || []).length, 2);
    assert.doesNotMatch(listing, />Restore project<\/button>/);
    const detail = await (await get('/projects/1')).text();
    assert.match(detail, /<h1>Alpha<\/h1>/);
    assert.match(detail, /action="\/" method="get"><button type="submit">Projects<\/button>/);
    assert.equal((await get('/projects/999')).status, 404);
    assert.match(detail, /<label for="task-title">Task title<\/label>/);
    assert.match(detail, />Create task<\/button>/);
    assert.match(detail, /<label for="task-filter">Task filter<\/label>/);
    assert.match(detail, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/tasks', { title });
      assert.equal(invalid.status, 400);
      assert.match(await invalid.text(), /role="alert">Task title is required/);
    }
    assert.equal(taskRows(await (await get('/projects/1')).text()).length, 0);
    for (const title of ['  First task  ', 'Second <script> & "task"']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/projects/1?filter=All');
    }
    await post('/projects/2/tasks', { title: 'Other project task' });
    let rows = taskRows(await (await get('/projects/1')).text());
    assert.equal(rows.length, 2);
    assert.match(rows[0], /aria-label="Complete First task"/);
    assert.match(rows[0], /<span>First task<\/span>/);
    assert.match(rows[1], /Second &lt;script&gt; &amp; &quot;task&quot;/);
    assert.ok(rows.every(row => !row.includes(' checked')));
    assert.equal(taskRows(await (await get('/projects/2')).text()).length, 1);
    assert.doesNotMatch(await (await get('/projects/2')).text(), /Complete First task/);
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Missing project' })).status, 404);
    const completed = await post('/projects/1/tasks/1', { completed: '1', filter: 'Open' });
    assert.equal(completed.status, 303);
    assert.equal(completed.headers.get('location'), '/projects/1?filter=Open');
    rows = taskRows(await (await get('/projects/1?filter=Open')).text());
    assert.equal(rows.length, 1);
    assert.match(rows[0], /Second &lt;script&gt;/);
    rows = taskRows(await (await get('/projects/1?filter=Completed')).text());
    assert.equal(rows.length, 1);
    assert.match(rows[0], /aria-label="Complete First task" checked/);
    assert.match(await (await get('/projects/1?filter=Completed')).text(), /<option selected>Completed<\/option>/);
    assert.equal(taskRows(await (await get('/projects/1?filter=All')).text()).length, 2);
    await post('/projects/1/tasks/1', {});
    assert.equal(taskRows(await (await get('/projects/1?filter=Completed')).text()).length, 0);
    assert.equal(taskRows(await (await get('/projects/1?filter=Open')).text()).length, 2);
    await post('/projects/1/tasks/1', { completed: '1' });
    const savedDetail = await (await get('/projects/1')).text();
    const savedOtherProject = await (await get('/projects/2')).text();
    const savedListing = await (await get('/')).text();
    assert.match(savedListing, /data-testid="project-summary">1\/2 completed/);
    assert.match(savedListing, /data-testid="project-summary">0\/1 completed/);
    await stop();
    // Recreate the Task 002 schema to verify migration preserves existing data.
    const legacyDatabase = new DatabaseSync(join(directory, 'projects.sqlite'));
    legacyDatabase.exec('ALTER TABLE projects DROP COLUMN archived');
    legacyDatabase.close();
    await start();
    assert.equal(await (await get('/')).text(), savedListing);
    assert.equal(await (await get('/projects/1')).text(), savedDetail);
    assert.equal(await (await get('/projects/2')).text(), savedOtherProject);
    assert.equal(taskRows(await (await get('/projects/1?filter=Completed')).text()).length, 1);
    assert.equal((await post('/projects/999/archive', {})).status, 404);
    const archived = await post('/projects/1/archive', {});
    assert.equal(archived.status, 303);
    const activeListing = await (await get('/')).text();
    assert.doesNotMatch(activeListing, /class="project-name">Alpha/);
    assert.match(activeListing, /Beta &lt;script&gt;/);
    const archivedListing = await (await get('/?filter=Archived')).text();
    assert.match(archivedListing, /<option selected>Archived<\/option>/);
    assert.match(archivedListing, /class="project-name">Alpha/);
    assert.match(archivedListing, />Open project<\/button>/);
    assert.match(archivedListing, />Restore project<\/button>/);
    assert.doesNotMatch(archivedListing, />Archive project<\/button>/);
    assert.match(archivedListing, /data-testid="project-summary">1\/2 completed/);
    assert.doesNotMatch(archivedListing, /Beta &lt;script&gt;/);
    const archivedDetail = await (await get('/projects/1')).text();
    assert.match(archivedDetail, /<p>Archived project<\/p>/);
    assert.match(archivedDetail, /<button type="submit" disabled>Create task<\/button>/);
    rows = taskRows(archivedDetail);
    assert.equal(rows.length, 2);
    assert.ok(rows.every(row => /type="checkbox"[^>]* disabled/.test(row)));
    assert.match(rows[0], /aria-label="Complete First task" checked disabled/);
    assert.equal(taskRows(await (await get('/projects/1?filter=Open')).text()).length, 1);
    assert.equal(taskRows(await (await get('/projects/1?filter=Completed')).text()).length, 1);
    assert.equal((await post('/projects/1/tasks', { title: 'Forbidden task' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1', {})).status, 403);
    assert.equal(await (await get('/projects/1')).text(), archivedDetail);
    await stop();
    await start();
    assert.equal(await (await get('/')).text(), activeListing);
    assert.equal(await (await get('/?filter=Archived')).text(), archivedListing);
    assert.equal(await (await get('/projects/1')).text(), archivedDetail);
    assert.equal((await post('/projects/1/restore', {})).status, 303);
    assert.equal(await (await get('/')).text(), savedListing);
    assert.equal(await (await get('/projects/1')).text(), savedDetail);
    assert.doesNotMatch(await (await get('/?filter=Archived')).text(), /data-testid="project-row"/);
    await stop();
    await start();
    assert.equal(await (await get('/')).text(), savedListing);
    assert.equal(await (await get('/projects/1')).text(), savedDetail);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
