import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stderr.on('data', chunk => { logs += chunk; });
  const address = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server did not start: ${logs}`));
    }, 10_000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with ${code}: ${logs}`));
    });
    let output = '';
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/Workboard listening on port (\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  return {
    address,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('existing databases migrate; archives, summaries, and restored tasks persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archives-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
    );
    INSERT INTO projects (name) VALUES ('Existing project');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Saved task', 1);
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(databasePath);
    async function post(path, fields = {}) {
      return fetch(server.address + path, {
        method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
      });
    }
    async function view(path = '/') {
      return (await fetch(server.address + path)).text();
    }
    const rows = html => (html.match(/data-testid="project-row"/g) ?? []).length;
    const tasks = html => (html.match(/data-testid="task-row"/g) ?? []).length;
    const initial = await view();
    assert.match(initial, /<label for="project-filter">Project filter<\/label>/);
    assert.match(initial, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(initial, /data-testid="project-summary">1\/1 completed/);
    assert.match(initial, />Archive project<\/button>/);
    assert.match(await view('/projects/1'), /id="task-priority-1"[^>]*>\s*<option>Low<\/option><option selected>Normal<\/option><option>High<\/option>/);
    await post('/projects', { name: 'New project' });
    assert.match(await view(), /data-testid="project-summary">0\/0 completed/);
    await post('/projects/1/tasks', { title: 'Open task' });
    assert.match(await view(), /data-testid="project-summary">1\/2 completed/);
    await view('/projects/1?filter=Completed');
    assert.match(await view(), /data-testid="project-summary">1\/2 completed/);

    const archived = await post('/projects/1/archive');
    assert.equal(archived.status, 303);
    assert.equal(rows(await view()), 1);
    assert.doesNotMatch(await view(), /Existing project/);
    const archivedList = await view('/?filter=Archived');
    assert.equal(rows(archivedList), 1);
    assert.match(archivedList, /<option selected>Archived<\/option>/);
    assert.match(archivedList, /Existing project/);
    assert.match(archivedList, />Open project<\/button>/);
    assert.match(archivedList, />Restore project<\/button>/);
    assert.doesNotMatch(archivedList, />Archive project<\/button>/);
    assert.match(archivedList, /data-testid="project-summary">1\/2 completed/);
    const detail = await view('/projects/1');
    assert.match(detail, /<p>Archived project<\/p>/);
    assert.match(detail, /<button type="submit" disabled>Create task/);
    assert.equal(tasks(detail), 2);
    assert.equal((detail.match(/type="checkbox"[^>]* disabled/g) ?? []).length, 2);
    assert.match(detail, /aria-label="Complete Saved task" checked disabled/);
    assert.equal(tasks(await view('/projects/1?filter=Open')), 1);
    assert.equal(tasks(await view('/projects/1?filter=Completed')), 1);
    assert.equal((await post('/projects/1/tasks', { title: 'Forbidden' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1')).status, 403);
    assert.equal(await view('/projects/1'), detail);
    assert.equal((await post('/projects/999/archive')).status, 404);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await view('/?filter=Archived'), archivedList);
    assert.equal(await view('/projects/1'), detail);
    assert.equal((await post('/projects/1/restore')).status, 303);
    const restoredList = await view();
    assert.equal(rows(restoredList), 2);
    assert.ok(restoredList.indexOf('Existing project') < restoredList.indexOf('New project'));
    assert.equal(rows(await view('/?filter=Archived')), 0);
    const restored = await view('/projects/1');
    assert.doesNotMatch(restored, /Archived project| disabled/);
    assert.match(restored, /aria-label="Complete Saved task" checked/);
    assert.equal(tasks(restored), 2);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await view(), restoredList);
    assert.equal(await view('/projects/1'), restored);
    await post('/projects/1/tasks/2', { completed: '1' });
    assert.match(await view(), /data-testid="project-summary">2\/2 completed/);
    await post('/projects/1/tasks/1');
    assert.match(await view(), /data-testid="project-summary">1\/2 completed/);
    await post('/projects/1/tasks', { title: 'After restore' });
    assert.match(await view(), /data-testid="project-summary">1\/3 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task priorities stay independent and persist through renames, archives, and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priorities-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    async function post(path, fields = {}) {
      return fetch(server.address + path, {
        method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
      });
    }
    async function view(path = '/projects/1') {
      return (await fetch(server.address + path)).text();
    }
    function priorityOptions(html, id, priority, disabled = false) {
      const select = html.match(new RegExp(`<select id="task-priority-${id}"[^>]*>([\\s\\S]*?)</select>`));
      assert.ok(select, `Task ${id} has a priority select`);
      assert.equal(select[0].includes(' disabled'), disabled);
      assert.equal(select[1].trim(), ['Low', 'Normal', 'High'].map(option =>
        `<option${option === priority ? ' selected' : ''}>${option}</option>`).join(''));
      assert.match(html, new RegExp(`<label for="task-priority-${id}">Task priority</label>`));
    }
    await post('/projects', { name: 'First project' });
    await post('/projects', { name: 'Second project' });
    await post('/projects/1/tasks', { title: 'First task' });
    await post('/projects/1/tasks', { title: 'Second task' });
    await post('/projects/2/tasks', { title: 'Other task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    priorityOptions(await view(), 1, 'Normal');
    priorityOptions(await view(), 2, 'Normal');
    const summary = await view('/');
    const otherProject = await view('/projects/2');
    const changed = await post('/projects/1/tasks/1/priority?filter=Completed', { priority: 'High' });
    assert.equal(changed.status, 303);
    assert.equal(changed.headers.get('location'), '/projects/1?filter=Completed');
    assert.equal((await post('/projects/1/tasks/2/priority?filter=Open', { priority: 'Low' })).status, 303);
    let detail = await view();
    priorityOptions(detail, 1, 'High');
    priorityOptions(detail, 2, 'Low');
    assert.match(detail, /aria-label="Complete First task" checked/);
    assert.match(detail, /aria-label="Complete Second task" onchange=/);
    assert.ok(detail.indexOf('Complete First task') < detail.indexOf('Complete Second task'));
    assert.equal(await view('/'), summary);
    assert.equal(await view('/projects/2'), otherProject);
    priorityOptions(await view('/projects/1?filter=Completed'), 1, 'High');
    assert.doesNotMatch(await view('/projects/1?filter=Completed'), /task-priority-2/);
    priorityOptions(await view('/projects/1?filter=Open'), 2, 'Low');
    assert.doesNotMatch(await view('/projects/1?filter=Open'), /task-priority-1/);
    assert.equal((await post('/projects/2/tasks/1/priority', { priority: 'Low' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/priority', { priority: 'High' })).status, 404);
    for (const priority of ['', 'Urgent', 'high']) {
      assert.equal((await post('/projects/1/tasks/1/priority', { priority })).status, 400);
    }
    assert.equal(await view(), detail);
    await post('/projects/1/tasks/1/rename', { title: '  Renamed task  ' });
    detail = await view();
    priorityOptions(detail, 1, 'High');
    assert.match(detail, /aria-label="Complete Renamed task" checked/);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await view(), detail);
    assert.equal(await view('/'), summary);
    assert.equal(await view('/projects/2'), otherProject);
    await post('/projects/1/archive');
    const archived = await view();
    priorityOptions(archived, 1, 'High', true);
    priorityOptions(archived, 2, 'Low', true);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Normal' })).status, 403);
    assert.equal(await view(), archived);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await view(), archived);
    await post('/projects/1/restore');
    assert.equal(await view(), detail);
    assert.equal(await view('/'), summary);
    await post('/projects/1/tasks/1/priority', { priority: 'Normal' });
    const restored = await view();
    priorityOptions(restored, 1, 'Normal');
    priorityOptions(restored, 2, 'Low');
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await view(), restored);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('renaming preserves identity, order, tasks, summaries, and archive restrictions across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    async function post(path, fields = {}) {
      return fetch(server.address + path, {
        method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
      });
    }
    async function view(path = '/projects/1') {
      return (await fetch(server.address + path)).text();
    }
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second project' });
    await post('/projects/1/tasks', { title: 'Finished task' });
    await post('/projects/1/tasks', { title: 'Open task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await view();
    assert.match(original, /<label for="new-project-name">New project name<\/label>/);
    assert.match(original, /<input id="new-project-name" name="name" type="text" value="Original">/);
    assert.match(original, /<button type="submit">Rename project<\/button>/);
    for (const name of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/rename', { name });
      assert.equal(invalid.status, 400);
      assert.match(await invalid.text(), /role="alert">Project name is required/);
      assert.equal(await view(), original);
    }
    const renamed = await post('/projects/1/rename?filter=Completed', { name: '  Renamed <project> & "name"  ' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const detail = await view();
    assert.match(detail, /<h1>Renamed &lt;project&gt; &amp; &quot;name&quot;<\/h1>/);
    assert.match(detail, /aria-label="Complete Finished task" checked/);
    assert.match(detail, /aria-label="Complete Open task" onchange=/);
    assert.equal((detail.match(/data-testid="task-row"/g) ?? []).length, 2);
    const listing = await view('/');
    assert.equal((listing.match(/data-testid="project-row"/g) ?? []).length, 2);
    assert.ok(listing.indexOf('Renamed &lt;project&gt;') < listing.indexOf('Second project'));
    assert.match(listing, /action="\/projects\/1"/);
    assert.match(listing, /data-testid="project-summary">1\/2 completed/);
    assert.match(await view('/projects/2'), /<h1>Second project<\/h1>/);
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await view(), detail);
    assert.equal(await view('/'), listing);

    await post('/projects/1/archive');
    const archived = await view();
    assert.match(archived, /id="new-project-name"[^>]* disabled/);
    assert.match(archived, /<button type="submit" disabled>Rename project<\/button>/);
    assert.equal((await post('/projects/1/rename', { name: 'Forbidden' })).status, 403);
    assert.equal(await view(), archived);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await view(), archived);
    await post('/projects/1/restore');
    assert.equal(await view(), detail);
    assert.equal(await view('/'), listing);
    assert.equal((await post('/projects/1/rename', { name: '  After restore  ' })).status, 303);
    const restored = await view();
    assert.match(restored, /<h1>After restore<\/h1>/);
    assert.match(restored, /aria-label="Complete Finished task" checked/);
    assert.match(await view('/'), /data-testid="project-summary">1\/2 completed/);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await view(), restored);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task renaming preserves completion, ownership, order, filters, and summaries across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    async function post(path, fields = {}) {
      return fetch(server.address + path, {
        method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
      });
    }
    async function view(path = '/projects/1') {
      return (await fetch(server.address + path)).text();
    }
    await post('/projects', { name: 'First project' });
    await post('/projects', { name: 'Second project' });
    await post('/projects/1/tasks', { title: 'Original task' });
    await post('/projects/1/tasks', { title: 'Open task' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await view();
    const summary = await view('/');
    assert.match(original, /<label for="new-task-title-1">New task title<\/label>/);
    assert.match(original, /<button type="submit">Rename task<\/button>/);
    for (const title of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/tasks/1/rename?filter=Completed', { title });
      assert.equal(invalid.status, 400);
      const content = await invalid.text();
      assert.match(content, /role="alert">Task title is required/);
      assert.match(content, /<option selected>Completed<\/option>/);
      assert.match(content, /aria-label="Complete Original task" checked/);
      assert.equal(await view(), original);
    }
    const renamed = await post('/projects/1/tasks/1/rename?filter=Completed', {
      title: '  Renamed <task> & "title"  ',
    });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    await post('/projects/1/tasks/2/rename?filter=Open', { title: '  Renamed open task  ' });
    const detail = await view();
    assert.match(detail, /class="task-title">Renamed &lt;task&gt; &amp; &quot;title&quot;<\/span>/);
    assert.match(detail, /aria-label="Complete Renamed &lt;task&gt; &amp; &quot;title&quot;" checked/);
    assert.match(detail, /aria-label="Complete Renamed open task" onchange=/);
    assert.ok(detail.indexOf('Complete Renamed &lt;task&gt;') < detail.indexOf('Complete Renamed open task'));
    assert.equal((detail.match(/data-testid="task-row"/g) ?? []).length, 2);
    const completed = await view('/projects/1?filter=Completed');
    assert.match(completed, /Complete Renamed &lt;task&gt;/);
    assert.doesNotMatch(completed, /Complete Renamed open task/);
    const open = await view('/projects/1?filter=Open');
    assert.match(open, /Complete Renamed open task/);
    assert.doesNotMatch(open, /Complete Renamed &lt;task&gt;/);
    assert.equal(await view('/'), summary);
    const otherProject = await view('/projects/2');
    assert.doesNotMatch(otherProject, /Renamed/);
    assert.equal((await post('/projects/2/tasks/1/rename', { title: 'Wrong owner' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/rename', { title: 'Missing' })).status, 404);
    assert.equal(await view(), detail);
    assert.equal(await view('/projects/2'), otherProject);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await view(), detail);
    assert.equal(await view('/projects/1?filter=Completed'), completed);
    assert.equal(await view('/projects/1?filter=Open'), open);
    assert.equal(await view('/'), summary);
    await post('/projects/1/archive');
    const archived = await view();
    assert.equal((archived.match(/id="new-task-title-\d+"[^>]* disabled/g) ?? []).length, 2);
    assert.equal((archived.match(/<button type="submit" disabled>Rename task<\/button>/g) ?? []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Forbidden' })).status, 403);
    assert.equal(await view(), archived);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await view(), archived);
    await post('/projects/1/restore');
    assert.equal(await view(), detail);
    assert.equal(await view('/'), summary);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: '  After restore  ' })).status, 303);
    const restored = await view();
    assert.match(restored, /aria-label="Complete After restore" checked/);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await view(), restored);
    assert.equal(await view('/'), summary);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project validation, order, navigation, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const health = await fetch(`${server.address}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const initial = await (await fetch(server.address)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, /<input id="project-name" name="name" type="text"/);
    assert.match(initial, />Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);

    async function create(name) {
      return fetch(`${server.address}/projects`, {
        method: 'POST',
        body: new URLSearchParams({ name }),
        redirect: 'manual',
      });
    }
    for (const name of ['', ' \t\n ']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      const content = await response.text();
      assert.match(content, /role="alert">Project name is required/);
      assert.doesNotMatch(content, /data-testid="project-row"/);
    }

    const created = await create('  First project  ');
    assert.equal(created.status, 303);
    assert.equal(created.headers.get('location'), '/');
    await create('Second <script> & "project"');
    const listing = await (await fetch(server.address)).text();
    assert.equal((listing.match(/data-testid="project-row"/g) ?? []).length, 2);
    assert.match(listing, /class="project-name">First project<\/span>/);
    assert.match(listing, /Second &lt;script&gt; &amp; &quot;project&quot;/);
    assert.ok(listing.indexOf('First project') < listing.indexOf('Second &lt;script&gt;'));
    const projectPaths = [...listing.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(projectPaths.length, 2);
    assert.notEqual(projectPaths[0], projectPaths[1]);

    const detail = await (await fetch(server.address + projectPaths[0])).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /<form action="\/" method="get"><button type="submit">Projects<\/button>/);
    assert.equal((await fetch(`${server.address}/projects/999999`)).status, 404);

    const invalidAfterCreation = await create('   ');
    assert.equal(((await invalidAfterCreation.text()).match(/data-testid="project-row"/g) ?? []).length, 2);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await (await fetch(server.address)).text(), listing);
    assert.equal(await (await fetch(server.address + projectPaths[0])).text(), detail);
    await create('Third project');
    const afterRestart = await (await fetch(server.address)).text();
    assert.equal((afterRestart.match(/data-testid="project-row"/g) ?? []).length, 3);
    assert.ok(afterRestart.indexOf('Third project') > afterRestart.indexOf('Second &lt;script&gt;'));
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, toggle, stay project-scoped, and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    async function post(path, fields) {
      return fetch(server.address + path, {
        method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
      });
    }
    async function view(path = '/projects/1') {
      return (await fetch(server.address + path)).text();
    }
    const rowCount = html => (html.match(/data-testid="task-row"/g) ?? []).length;
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const initial = await view();
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, />Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    assert.equal(rowCount(initial), 0);
    for (const title of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/tasks', { title });
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(rowCount(html), 0);
    }
    const created = await post('/projects/1/tasks', { title: '  First task  ' });
    assert.equal(created.status, 303);
    assert.equal(created.headers.get('location'), '/projects/1?filter=All');
    await post('/projects/1/tasks', { title: 'Second <task> & "quoted"' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    const listing = await view();
    assert.equal(rowCount(listing), 2);
    assert.match(listing, /aria-label="Complete First task"/);
    assert.match(listing, /class="task-title">First task<\/span>/);
    assert.match(listing, /Complete Second &lt;task&gt; &amp; &quot;quoted&quot;/);
    assert.doesNotMatch(listing, / checked/);
    assert.ok(listing.indexOf('First task') < listing.indexOf('Second &lt;task&gt;'));
    assert.doesNotMatch(listing, /Other project task/);
    assert.equal(rowCount(await view('/projects/2')), 1);
    const invalid = await post('/projects/1/tasks', { title: '   ' });
    assert.equal(rowCount(await invalid.text()), 2);

    const completed = await post('/projects/1/tasks/1?filter=Open', { completed: '1' });
    assert.equal(completed.headers.get('location'), '/projects/1?filter=Open');
    const all = await view();
    assert.match(all, /aria-label="Complete First task" checked/);
    const open = await view('/projects/1?filter=Open');
    assert.equal(rowCount(open), 1);
    assert.doesNotMatch(open, /Complete First task/);
    assert.match(open, /<option selected>Open<\/option>/);
    const done = await view('/projects/1?filter=Completed');
    assert.equal(rowCount(done), 1);
    assert.match(done, /Complete First task/);
    assert.doesNotMatch(done, /Complete Second/);
    assert.equal((await post('/projects/2/tasks/1', {})).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Missing' })).status, 404);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await view(), all);
    assert.equal(await view('/projects/1?filter=Completed'), done);
    await post('/projects/1/tasks/1?filter=Completed', {});
    assert.equal(rowCount(await view('/projects/1?filter=Completed')), 0);
    assert.equal(rowCount(await view('/projects/1?filter=Open')), 2);
    assert.doesNotMatch(await view(), / checked/);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.doesNotMatch(await view(), / checked/);
    assert.equal(rowCount(await view('/projects/1?filter=Open')), 2);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
