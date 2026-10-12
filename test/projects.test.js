import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const baseUrl = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`Server exited (${code}): ${stderr}`)));
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

async function create(baseUrl, name) {
  return fetch(`${baseUrl}/projects`, {
    method: 'POST',
    body: new URLSearchParams({ name }),
    redirect: 'manual',
  });
}

async function post(baseUrl, path, fields) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
  });
}

function taskRows(html) {
  return [...html.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)].map((match) => ({
    title: match[1].match(/<span>(.*?)<\/span>/s)[1],
    path: match[1].match(/action="(.*?)"/)[1],
    completed: / checked/.test(match[1]),
  }));
}

function projectSummaries(html) {
  return [...html.matchAll(/data-testid="project-summary">(.*?)<\/span>/g)].map((match) => match[1]);
}

function projectRows(html) {
  return [...html.matchAll(/<li data-testid="project-row">([\s\S]*?)<\/li>/g)].map((match) => ({
    name: match[1].match(/<span>(.*?)<\/span>/s)[1],
    path: match[1].match(/action="(.*?)"/)[1],
  }));
}

function priorityControls(html) {
  return [...html.matchAll(/<select id="task-priority-\d+"[^>]*>([\s\S]*?)<\/select>/g)].map((match) => ({
    disabled: / disabled/.test(match[0]),
    options: [...match[1].matchAll(/<option(?: selected)?>(.*?)<\/option>/g)].map((option) => option[1]),
    selected: match[1].match(/<option selected>(.*?)<\/option>/)[1],
  }));
}

test('priorities default, persist independently, preserve task data and respect archives', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  const databasePath = join(directory, 'board.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (id, name) VALUES (7, 'Legacy');
    INSERT INTO tasks (id, project_id, title, completed) VALUES (9, 7, 'Done', 1);
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(databasePath);
    const get = async (path = '/') => (await fetch(`${server.baseUrl}${path}`)).text();
    const first = '/projects/7';
    await create(server.baseUrl, 'Other');
    const second = '/projects/8';
    await post(server.baseUrl, `${first}/tasks`, { title: 'Open' });
    await post(server.baseUrl, `${second}/tasks`, { title: 'Other task' });
    const original = taskRows(await get(first));
    const priorityPath = original[0].path.replace('/completion', '/priority');
    assert.deepEqual(priorityControls(await get(first)), [0, 1].map(() => ({
      disabled: false, options: ['Low', 'Normal', 'High'], selected: 'Normal',
    })));
    for (const priority of ['', 'Urgent', 'high']) {
      assert.equal((await post(server.baseUrl, priorityPath, { priority })).status, 400);
    }
    assert.equal((await post(server.baseUrl, priorityPath.replace(first, second), { priority: 'High' })).status, 404);
    assert.equal((await post(server.baseUrl, `${first}/tasks/999/priority`, { priority: 'High' })).status, 404);
    const changed = await post(server.baseUrl, priorityPath, { priority: 'High', filter: 'Completed' });
    assert.equal(changed.status, 303);
    assert.equal(changed.headers.get('location'), `${first}?filter=Completed`);
    const secondPriorityPath = original[1].path.replace('/completion', '/priority');
    await post(server.baseUrl, secondPriorityPath, { priority: 'Low' });
    assert.deepEqual(taskRows(await get(first)), original);
    assert.deepEqual(taskRows(await get(`${first}?filter=Completed`)), [original[0]]);
    assert.deepEqual(taskRows(await get(`${first}?filter=Open`)), [original[1]]);
    assert.deepEqual(projectSummaries(await get()), ['1/2 completed', '0/1 completed']);
    assert.equal(priorityControls(await get(second))[0].selected, 'Normal');
    await post(server.baseUrl, original[0].path.replace('/completion', '/rename'), { title: 'Renamed' });
    original[0].title = 'Renamed';
    for (let restart = 0; restart < 2; restart++) {
      await server.stop();
      server = undefined;
      server = await startServer(databasePath);
      assert.deepEqual(taskRows(await get(first)), original);
      assert.deepEqual(priorityControls(await get(first)).map((control) => control.selected), ['High', 'Low']);
      if (restart === 0) {
        await post(server.baseUrl, `${first}/archive`, {});
        assert.equal((await post(server.baseUrl, priorityPath, { priority: 'Normal' })).status, 409);
      }
    }
    assert.ok(priorityControls(await get(first)).every((control) => control.disabled));
    assert.deepEqual(projectSummaries(await get('/?filter=Archived')), ['1/2 completed']);
    await post(server.baseUrl, `${first}/restore`, {});
    assert.ok(priorityControls(await get(first)).every((control) => !control.disabled));
    assert.deepEqual(priorityControls(await get(first)).map((control) => control.selected), ['High', 'Low']);
    await post(server.baseUrl, priorityPath, { priority: 'Normal' });
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.deepEqual(priorityControls(await get(first)).map((control) => control.selected), ['Normal', 'Low']);
    assert.deepEqual(taskRows(await get(first)), original);
    assert.deepEqual(projectSummaries(await get()), ['1/2 completed', '0/1 completed']);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task rename preserves ownership, order, completion and persists through archive and restart', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  const databasePath = join(directory, 'board.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const get = async (path = '/') => (await fetch(`${server.baseUrl}${path}`)).text();
    await create(server.baseUrl, 'One');
    await create(server.baseUrl, 'Two');
    const [first, second] = projectRows(await get()).map((row) => row.path);
    await post(server.baseUrl, `${first}/tasks`, { title: 'Original' });
    await post(server.baseUrl, `${first}/tasks`, { title: 'Second' });
    const rows = taskRows(await get(first));
    await post(server.baseUrl, rows[0].path, { completed: '1' });
    const renamePath = rows[0].path.replace('/completion', '/rename');
    let html = await get(first);
    assert.equal((html.match(/>New task title<\/label>/g) || []).length, 2);
    assert.equal((html.match(/>Rename task<\/button>/g) || []).length, 2);
    for (const title of ['', ' \t\n ']) {
      const invalid = await post(server.baseUrl, renamePath, { title, filter: 'Completed' });
      assert.equal(invalid.status, 400);
      html = await invalid.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(taskRows(html)[0].title, 'Original');
    }
    assert.equal((await post(server.baseUrl, renamePath.replace(first, second), { title: 'Foreign' })).status, 404);
    assert.equal((await post(server.baseUrl, `${first}/tasks/99999/rename`, { title: 'Missing' })).status, 404);
    const renamed = await post(server.baseUrl, renamePath, { title: '  Renamed <task> "safe"  ', filter: 'Completed' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), `${first}?filter=Completed`);
    const expected = [
      { ...rows[0], title: 'Renamed &lt;task&gt; &quot;safe&quot;', completed: true },
      rows[1],
    ];
    assert.deepEqual(taskRows(await get(first)), expected);
    assert.match(await get(first), /aria-label="Complete Renamed &lt;task&gt; &quot;safe&quot;"/);
    assert.deepEqual(taskRows(await get(`${first}?filter=Completed`)), [expected[0]]);
    assert.deepEqual(taskRows(await get(`${first}?filter=Open`)), [expected[1]]);
    assert.deepEqual(taskRows(await get(second)), []);
    assert.deepEqual(projectSummaries(await get()), ['1/2 completed', '0/0 completed']);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.deepEqual(taskRows(await get(first)), expected);
    await post(server.baseUrl, `${first}/archive`, {});
    html = await get(first);
    assert.equal((html.match(/id="new-task-title-\d+" name="title" type="text" disabled/g) || []).length, 2);
    assert.equal((html.match(/<button type="submit" disabled>Rename task<\/button>/g) || []).length, 2);
    assert.equal((await post(server.baseUrl, renamePath, { title: 'Blocked' })).status, 409);
    assert.deepEqual(taskRows(await get(first)), expected);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.deepEqual(taskRows(await get(first)), expected);
    assert.deepEqual(projectSummaries(await get('/?filter=Archived')), ['1/2 completed']);
    await post(server.baseUrl, `${first}/restore`, {});
    assert.doesNotMatch(await get(first), / disabled/);
    assert.equal((await post(server.baseUrl, renamePath, { title: 'Restored title' })).status, 303);
    expected[0].title = 'Restored title';
    assert.deepEqual(taskRows(await get(first)), expected);
    assert.deepEqual(projectSummaries(await get()), ['1/2 completed', '0/0 completed']);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.deepEqual(taskRows(await get(first)), expected);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('rename preserves project identity, tasks and summaries and respects archive state', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const databasePath = join(directory, 'board.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const get = async (path = '/') => (await fetch(`${server.baseUrl}${path}`)).text();
    await create(server.baseUrl, 'Original');
    await create(server.baseUrl, 'Second');
    const originalProjects = projectRows(await get());
    const path = originalProjects[0].path;
    await post(server.baseUrl, `${path}/tasks`, { title: 'Done' });
    await post(server.baseUrl, `${path}/tasks`, { title: 'Open' });
    await post(server.baseUrl, taskRows(await get(path))[0].path, { completed: '1' });
    const originalTasks = taskRows(await get(path));
    let html = await get(path);
    assert.match(html, /<label for="new-project-name">New project name<\/label>/);
    assert.match(html, /<button type="submit">Rename project<\/button>/);
    for (const name of ['', ' \t\n ']) {
      const invalid = await post(server.baseUrl, `${path}/rename`, { name });
      assert.equal(invalid.status, 400);
      html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.match(html, /<h1>Original<\/h1>/);
      assert.deepEqual(projectRows(await get()), originalProjects);
    }
    assert.equal((await post(server.baseUrl, '/projects/99999/rename', { name: 'Missing' })).status, 404);
    const renamed = await post(server.baseUrl, `${path}/rename`, { name: '  Renamed <board>  ', filter: 'Completed' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), `${path}?filter=Completed`);
    assert.match(await get(path), /<h1>Renamed &lt;board&gt;<\/h1>/);
    const expectedProjects = [{ name: 'Renamed &lt;board&gt;', path }, originalProjects[1]];
    assert.deepEqual(projectRows(await get()), expectedProjects);
    assert.deepEqual(taskRows(await get(path)), originalTasks);
    assert.deepEqual(projectSummaries(await get()), ['1/2 completed', '0/0 completed']);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.deepEqual(projectRows(await get()), expectedProjects);
    assert.match(await get(path), /<h1>Renamed &lt;board&gt;<\/h1>/);
    assert.deepEqual(taskRows(await get(path)), originalTasks);
    await post(server.baseUrl, `${path}/archive`, {});
    html = await get(path);
    assert.match(html, /id="new-project-name" name="name" type="text" disabled/);
    assert.match(html, /<button type="submit" disabled>Rename project<\/button>/);
    assert.equal((await post(server.baseUrl, `${path}/rename`, { name: 'Blocked' })).status, 409);
    assert.deepEqual(projectRows(await get('/?filter=Archived')), [expectedProjects[0]]);
    await post(server.baseUrl, `${path}/restore`, {});
    html = await get(path);
    assert.doesNotMatch(html, / disabled/);
    assert.equal((await post(server.baseUrl, `${path}/rename`, { name: 'Restored name' })).status, 303);
    assert.match(await get(path), /<h1>Restored name<\/h1>/);
    assert.deepEqual(taskRows(await get(path)), originalTasks);
    assert.deepEqual(projectSummaries(await get()), ['1/2 completed', '0/0 completed']);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.deepEqual(projectRows(await get()), [{ name: 'Restored name', path }, originalProjects[1]]);
    assert.deepEqual(taskRows(await get(path)), originalTasks);
    assert.deepEqual(projectSummaries(await get()), ['1/2 completed', '0/0 completed']);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('projects validate, render safely, retain order and persist after restart', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const health = await fetch(`${server.baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    let html = await (await fetch(server.baseUrl)).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, />Create project<\/button>/);
    assert.deepEqual(projectRows(html), []);

    for (const name of ['', '  \t\n  ']) {
      const invalid = await create(server.baseUrl, name);
      assert.equal(invalid.status, 400);
      const invalidHtml = await invalid.text();
      assert.match(invalidHtml, /role="alert">Project name is required/);
      assert.deepEqual(projectRows(invalidHtml), []);
    }

    for (const name of ['  First project  ', '<script>alert("x")</script>', 'First project']) {
      const result = await create(server.baseUrl, name);
      assert.equal(result.status, 303);
      assert.equal(result.headers.get('location'), '/');
    }
    html = await (await fetch(server.baseUrl)).text();
    const rows = projectRows(html);
    assert.deepEqual(rows.map((row) => row.name), [
      'First project', '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;', 'First project',
    ]);
    assert.equal(new Set(rows.map((row) => row.path)).size, 3);
    assert.match(html, />Open project<\/button>/);
    for (const row of rows) {
      const detail = await fetch(`${server.baseUrl}${row.path}`);
      assert.equal(detail.status, 200);
      const detailHtml = await detail.text();
      assert.ok(detailHtml.includes(`<h1>${row.name}</h1>`));
      assert.match(detailHtml, /action="\/" method="get"><button type="submit">Projects<\/button>/);
    }
    assert.equal((await fetch(`${server.baseUrl}/projects/99999`)).status, 404);
    const invalid = await create(server.baseUrl, '   ');
    assert.deepEqual(projectRows(await invalid.text()), rows);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    const persisted = await (await fetch(server.baseUrl)).text();
    assert.deepEqual(projectRows(persisted), rows);
    for (const row of rows) {
      assert.equal((await fetch(`${server.baseUrl}${row.path}`)).status, 200);
    }
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, isolate completion updates and persist', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const databasePath = join(directory, 'board.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    await create(server.baseUrl, 'One');
    await create(server.baseUrl, 'Two');
    const projects = projectRows(await (await fetch(server.baseUrl)).text());
    const [first, second] = projects.map((project) => project.path);
    const detail = async (path = first) => (await fetch(`${server.baseUrl}${path}`)).text();
    let html = await detail();
    assert.match(html, /<label for="task-title">Task title<\/label>/);
    assert.match(html, />Create task<\/button>/);
    assert.match(html, /<label for="task-filter">Task filter<\/label>/);
    assert.match(html, /<option selected>All<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const result = await post(server.baseUrl, `${first}/tasks`, { title });
      assert.equal(result.status, 400);
      html = await result.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.deepEqual(taskRows(html), []);
    }
    for (const title of ['  First task  ', '<b>Second</b>', 'First task']) {
      assert.equal((await post(server.baseUrl, `${first}/tasks`, { title })).status, 303);
    }
    html = await detail();
    const rows = taskRows(html);
    assert.deepEqual(rows.map((row) => row.title), ['First task', '&lt;b&gt;Second&lt;/b&gt;', 'First task']);
    assert.ok(rows.every((row) => !row.completed));
    assert.match(html, /aria-label="Complete First task"/);
    assert.match(html, /aria-label="Complete &lt;b&gt;Second&lt;\/b&gt;"/);
    assert.deepEqual(taskRows(await detail(second)), []);
    const foreignPath = rows[0].path.replace(first, second);
    assert.equal((await post(server.baseUrl, foreignPath, { completed: '1' })).status, 404);
    assert.equal((await post(server.baseUrl, '/projects/99999/tasks', { title: 'Bad' })).status, 404);
    await post(server.baseUrl, rows[1].path, { completed: '1', filter: 'All' });
    assert.deepEqual(taskRows(await detail()).map((row) => row.completed), [false, true, false]);
    assert.deepEqual(taskRows(await detail(`${first}?filter=Open`)).map((row) => row.path), [rows[0].path, rows[2].path]);
    assert.deepEqual(taskRows(await detail(`${first}?filter=Completed`)).map((row) => row.path), [rows[1].path]);
    assert.equal(taskRows(await detail(`${first}?filter=invalid`)).length, 3);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.deepEqual(taskRows(await detail()).map((row) => row.completed), [false, true, false]);
    assert.deepEqual(taskRows(await detail(second)), []);
    const unchecked = await post(server.baseUrl, rows[1].path, { filter: 'Completed' });
    assert.equal(unchecked.headers.get('location'), `${first}?filter=Completed`);
    assert.deepEqual(taskRows(await detail(`${first}?filter=Completed`)), []);
    assert.deepEqual(taskRows(await detail()), rows);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive and restore preserve tasks, summaries and legacy database IDs', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const databasePath = join(directory, 'board.sqlite');
  // Simulate a database created before archive support was introduced.
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL
      REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (id, name) VALUES (7, 'Legacy');
    INSERT INTO tasks (id, project_id, title, completed) VALUES (9, 7, 'Done', 1), (10, 7, 'Open', 0);
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(databasePath);
    const get = async (path = '/') => (await fetch(`${server.baseUrl}${path}`)).text();
    await create(server.baseUrl, 'New');
    let html = await get();
    assert.match(html, /<label for="project-filter">Project filter<\/label>/);
    assert.match(html, /<option selected>Active<\/option>/);
    assert.deepEqual(projectSummaries(html), ['1/2 completed', '0/0 completed']);
    assert.deepEqual(projectRows(html).map((row) => row.path), ['/projects/7', '/projects/8']);
    assert.match(html, />Archive project<\/button>/);
    const originalTasks = taskRows(await get('/projects/7'));
    assert.equal((await post(server.baseUrl, '/projects/999/archive', {})).status, 404);
    assert.equal((await post(server.baseUrl, '/projects/7/archive', {})).status, 303);
    assert.deepEqual(projectRows(await get()).map((row) => row.name), ['New']);
    html = await get('/?filter=Archived');
    assert.deepEqual(projectRows(html), [{ name: 'Legacy', path: '/projects/7' }]);
    assert.deepEqual(projectSummaries(html), ['1/2 completed']);
    assert.match(html, />Restore project<\/button>/);
    assert.match(html, />Open project<\/button>/);
    assert.doesNotMatch(html, />Archive project<\/button>/);
    html = await get('/projects/7');
    assert.match(html, /<p>Archived project<\/p>/);
    assert.match(html, /<button type="submit" disabled>Create task<\/button>/);
    assert.equal((html.match(/ disabled data-auto-submit/g) || []).length, 2);
    assert.deepEqual(taskRows(html), originalTasks);
    assert.deepEqual(taskRows(await get('/projects/7?filter=Completed')).map((row) => row.title), ['Done']);
    assert.deepEqual(taskRows(await get('/projects/7?filter=Open')).map((row) => row.title), ['Open']);
    assert.equal((await post(server.baseUrl, '/projects/7/tasks', { title: 'Blocked' })).status, 409);
    assert.equal((await post(server.baseUrl, originalTasks[0].path, {})).status, 409);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.deepEqual(projectSummaries(await get('/?filter=Archived')), ['1/2 completed']);
    assert.match(await get('/projects/7'), /Archived project/);
    assert.deepEqual(taskRows(await get('/projects/7')), originalTasks);
    assert.equal((await post(server.baseUrl, '/projects/7/restore', {})).status, 303);
    assert.deepEqual(projectRows(await get('/?filter=Archived')), []);
    html = await get('/projects/7');
    assert.doesNotMatch(html, /Archived project| disabled/);
    assert.deepEqual(taskRows(html), originalTasks);
    await post(server.baseUrl, originalTasks[1].path, { completed: '1' });
    await post(server.baseUrl, '/projects/7/tasks', { title: 'Third' });
    assert.deepEqual(projectSummaries(await get()), ['2/3 completed', '0/0 completed']);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.deepEqual(projectSummaries(await get()), ['2/3 completed', '0/0 completed']);
    assert.equal(taskRows(await get('/projects/7')).length, 3);
    assert.deepEqual(projectRows(await get('/?filter=Archived')), []);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
