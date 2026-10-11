import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { openProjects } from '../projects.js';

test('notes controls save literal multiline text, retain all filters, and survive moves, archive and process restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-notes-http-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const page = async (path) => (await fetch(`${server.url}${path}`)).text();
    const notesForm = (html) => html.match(/<form[^>]*class="task-notes"[^>]*>([\s\S]*?)<\/form>/)[1];
    const titles = (html) => [...html.matchAll(/data-testid="task-row"[^>]*>\s*<span>(.*?)<\/span>/g)].map((match) => match[1]);
    await post('/projects', { name: 'Source' });
    await post('/projects', { name: 'Destination' });
    await post('/projects/1/tasks', { title: 'Match title' });
    await post('/projects/1/tasks', { title: 'Other' });
    await post('/projects/1/tasks/1/completion', { completed: 'on' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
    const filters = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-02-29', search: 'mAtCh' };
    const filteredPath = `/projects/1?${new URLSearchParams(filters)}`;
    const summary = await page('/');
    const initial = await page(filteredPath);
    assert.match(notesForm(initial), /<label for="task-notes-1">Task notes<\/label>/);
    assert.match(notesForm(initial), /<textarea id="task-notes-1" name="notes" rows="4">\n<\/textarea>/);
    assert.match(notesForm(initial), /<button type="submit">Save notes<\/button>/);
    for (const [name, value] of Object.entries(filters)) {
      assert.match(notesForm(initial), new RegExp(`name="${name}" value="${value}"`));
    }
    const notes = '\n  café 😀\n\t</textarea><script>alert("literal")</script> & <b>text</b>  \n';
    const escapedNotes = '\n  café 😀\n\t&lt;/textarea&gt;&lt;script&gt;alert(&quot;literal&quot;)&lt;/script&gt; &amp; &lt;b&gt;text&lt;/b&gt;  \n';
    const savedResponse = await post('/projects/1/tasks/1/notes', { ...filters, notes });
    assert.equal(savedResponse.status, 303);
    assert.equal(savedResponse.headers.get('location'), filteredPath);
    const saved = await page(filteredPath);
    assert.equal(saved, initial.replace('rows="4">\n</textarea>', `rows="4">\n${escapedNotes}</textarea>`));
    assert.deepEqual(titles(saved), ['Match title']);
    assert.deepEqual(titles(await page('/projects/1?search=literal')), []);
    assert.deepEqual(titles(await page('/?search=literal')), []);
    assert.equal(await page('/'), summary);
    for (const path of ['/projects/2/tasks/1/notes', '/projects/1/tasks/999/notes']) {
      assert.equal((await post(path, { notes: 'wrong owner' })).status, 404);
    }
    const moved = await post('/projects/1/tasks/1/move', { ...filters, destination: '2' });
    assert.equal(moved.headers.get('location'), filteredPath);
    assert.deepEqual(titles(await page(filteredPath)), []);
    assert.match(notesForm(await page('/projects/2')), /café 😀/);
    await post('/projects/2/tasks/1/rename', { title: 'Match renamed' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(titles(await page('/projects/1')), ['Match renamed', 'Other']);
    const renamed = saved.replaceAll('Match title', 'Match renamed');
    assert.equal(await page(filteredPath), renamed);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await page(filteredPath), renamed);
    await post('/projects/1/archive');
    const archived = await page(filteredPath);
    assert.match(notesForm(archived), /<textarea[^>]* disabled>/);
    assert.match(notesForm(archived), /disabled>Save notes/);
    assert.equal((await post('/projects/1/tasks/1/notes', { notes: '' })).status, 409);
    assert.equal(await page(filteredPath), archived);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await page(filteredPath), archived);
    await post('/projects/1/restore');
    assert.equal(await page(filteredPath), renamed);
    for (const value of [' \t\n ', '']) {
      const cleared = await post('/projects/1/tasks/1/notes', { ...filters, notes: value });
      assert.equal(cleared.headers.get('location'), filteredPath);
      assert.equal(await page(filteredPath), initial.replaceAll('Match title', 'Match renamed')
        .replace('rows="4">\n</textarea>', `rows="4">\n${value}</textarea>`));
    }
    await server.stop();
    server = await start(databasePath);
    assert.equal(await page(filteredPath), initial.replaceAll('Match title', 'Match renamed'));
    assert.equal(await page('/'), summary);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('due dates migrate and preserve filters and task data through validation, restart and restoration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-dates-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, default_task_priority TEXT NOT NULL DEFAULT 'Normal');
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
      INSERT INTO projects (name) VALUES ('First'), ('Second');
      INSERT INTO tasks (project_id, title, completed, priority) VALUES (1, 'Saved task', 1, 'High'), (1, 'Other task', 0, 'Normal'), (2, 'Private', 0, 'Normal');
    `);
    database.close();
    server = await start(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const page = async (path) => (await fetch(`${server.url}${path}`)).text();
    const rows = (html) => [...html.matchAll(/<div data-testid="task-row"[\s\S]*?<\/div>/g)].map((match) => match[0]);
    const filters = { filter: 'Completed', priorityFilter: 'High' };
    const filteredPath = '/projects/1?filter=Completed&priorityFilter=High';
    const summary = await page('/');
    const initial = await page('/projects/1');
    for (const row of rows(initial)) {
      assert.match(row, /<label for="task-due-date-\d+">Task due date<\/label>/);
      assert.match(row, /name="dueDate" type="text" value=""/);
      assert.match(row, /<button type="submit">Save due date<\/button>/);
    }
    const edit = async (value) => {
      const response = await post('/projects/1/tasks/1/due-date', { ...filters, dueDate: value });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), filteredPath);
      return page(filteredPath);
    };
    const filteredInitial = await page(filteredPath);
    let saved = await edit(' \t2000-02-29\n ');
    assert.equal(saved, filteredInitial.replace('name="dueDate" type="text" value=""', 'name="dueDate" type="text" value="2000-02-29"'));
    assert.equal(rows(saved).length, 1);
    assert.match(rows(await page('/projects/1'))[1], /name="dueDate" type="text" value=""/);
    assert.match(rows(await page('/projects/2'))[0], /name="dueDate" type="text" value=""/);
    for (const dueDate of ['1900-02-29', '2026-04-31', '0000-01-01', '2026-2-01', '<script>']) {
      const response = await post('/projects/1/tasks/1/due-date', { ...filters, dueDate });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      assert.deepEqual(rows(html), rows(saved));
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.match(html, /<option selected>High<\/option>/);
      assert.equal(await page(filteredPath), saved);
    }
    for (const path of ['/projects/2/tasks/1/due-date', '/projects/1/tasks/999/due-date', '/projects/999/tasks/1/due-date']) {
      assert.equal((await post(path, { dueDate: '2026-01-01' })).status, 404);
    }
    assert.equal(await page('/'), summary);
    await post('/projects/1/tasks/1/rename', { ...filters, title: 'Renamed' });
    saved = saved.replaceAll('Saved task', 'Renamed');
    assert.equal(await page(filteredPath), saved);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page(filteredPath), saved);
    await post('/projects/1/archive');
    const archived = await page(filteredPath);
    assert.match(archived, /name="dueDate" type="text" value="2000-02-29"[^>]* disabled>/);
    assert.match(archived, /disabled>Save due date/);
    assert.equal((await post('/projects/1/tasks/1/due-date', { dueDate: '' })).status, 409);
    assert.equal(await page(filteredPath), archived);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page(filteredPath), archived);
    await post('/projects/1/restore');
    assert.equal(await page(filteredPath), saved);
    assert.equal(await page('/'), summary);
    assert.equal(await edit(' \n '), saved.replace('value="2000-02-29"', 'value=""'));
    saved = await page(filteredPath);
    await post('/projects/1/tasks', { title: 'New task' });
    assert.match(rows(await page('/projects/1'))[2], /name="dueDate" type="text" value=""/);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page(filteredPath), saved);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('priority storage validates values, isolates tasks, and protects archived projects', () => {
  const projects = openProjects(':memory:');
  try {
    projects.create('First');
    projects.create('Second');
    projects.createTask(1, 'First task');
    projects.createTask(1, 'Second task');
    projects.createTask(2, 'Private');
    projects.setTaskCompleted(1, 1, true);
    const original = projects.listTasks(1).map((task) => ({ ...task }));
    assert.equal(original[0].priority, 'Normal');
    for (const priority of ['', 'Urgent', 'high', null]) {
      assert.equal(projects.setTaskPriority(1, 1, priority), false);
    }
    assert.equal(projects.setTaskPriority(2, 1, 'High'), false);
    assert.equal(projects.setTaskPriority(1, 999, 'Low'), false);
    assert.deepEqual(projects.listTasks(1).map((task) => ({ ...task })), original);
    assert.equal(projects.setTaskPriority(1, 1, 'High'), true);
    assert.deepEqual(projects.listTasks(1).map((task) => ({ ...task })), [
      { ...original[0], priority: 'High' }, original[1],
    ]);
    assert.equal(projects.listTasks(2)[0].priority, 'Normal');
    projects.setArchived(1, true);
    assert.equal(projects.setTaskPriority(1, 1, 'Low'), false);
    assert.equal(projects.listTasks(1)[0].priority, 'High');
    projects.setArchived(1, false);
    assert.equal(projects.setTaskPriority(1, 1, 'Low'), true);
    projects.renameTask(1, 1, 'Renamed');
    assert.equal(projects.listTasks(1)[0].priority, 'Low');
    assert.equal(projects.list()[0].completed_count, 1);
    assert.equal(projects.list()[0].total_count, 2);
  } finally {
    projects.close();
  }
});

test('priorities migrate, render saved options, preserve task data, and survive restart and restoration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (name) VALUES ('Existing'), ('Other');
      INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Done', 1), (1, 'Pending', 0), (2, 'Private', 0);
    `);
    database.close();
    server = await start(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const page = async (path) => (await fetch(`${server.url}${path}`)).text();
    const rows = (html) => [...html.matchAll(/<div data-testid="task-row"[\s\S]*?<\/div>/g)]
      .map((match) => match[0]);
    const selected = (row, priority) => {
      const select = row.match(/<select[^>]*name="priority"[^>]*>([\s\S]*?)<\/select>/);
      assert.ok(select);
      assert.deepEqual([...select[1].matchAll(/<option(?: selected)?>(.*?)<\/option>/g)].map((match) => match[1]), ['Low', 'Normal', 'High']);
      assert.match(select[1], new RegExp(`<option selected>${priority}</option>`));
    };
    const list = await page('/');
    const initial = await page('/projects/1');
    for (const row of rows(initial)) {
      assert.match(row, /<label for="task-priority-\d+">Task priority<\/label>/);
      selected(row, 'Normal');
    }
    for (const priority of ['', 'Urgent', 'high']) {
      assert.equal((await post('/projects/1/tasks/1/priority', { priority })).status, 400);
    }
    for (const path of ['/projects/2/tasks/1/priority', '/projects/1/tasks/999/priority', '/projects/999/tasks/1/priority']) {
      assert.equal((await post(path, { priority: 'High' })).status, 404);
    }
    assert.equal(await page('/projects/1'), initial);
    const changed = await post('/projects/1/tasks/1/priority', { priority: 'High', filter: 'Completed' });
    assert.equal(changed.status, 303);
    assert.equal(changed.headers.get('location'), '/projects/1?filter=Completed');
    const detail = await page('/projects/1');
    assert.equal(detail, initial.replace(rows(initial)[0], rows(initial)[0].replace(
      '<option selected>Normal</option><option>High</option>', '<option>Normal</option><option selected>High</option>')));
    selected(rows(detail)[0], 'High');
    selected(rows(detail)[1], 'Normal');
    selected(rows(await page('/projects/2'))[0], 'Normal');
    assert.equal(rows(await page('/projects/1?filter=Completed')).length, 1);
    assert.match(rows(await page('/projects/1?filter=Open'))[0], /Complete Pending/);
    assert.equal(await page('/'), list);
    await post('/projects/1/tasks/1/rename', { title: 'Renamed' });
    const renamed = await page('/projects/1');
    assert.equal(renamed, detail.replaceAll('Done', 'Renamed'));
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page('/projects/1'), renamed);
    assert.equal(await page('/'), list);
    await post('/projects/1/archive');
    const archived = await page('/projects/1');
    for (const row of rows(archived)) {
      assert.match(row, /<select[^>]*name="priority" disabled>/);
    }
    selected(rows(archived)[0], 'High');
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Low' })).status, 409);
    assert.equal(await page('/projects/1'), archived);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await page('/projects/1'), renamed);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Low' })).status, 303);
    await post('/projects/1/tasks', { title: 'New task' });
    const restored = await page('/projects/1');
    selected(rows(restored)[0], 'Low');
    selected(rows(restored)[2], 'Normal');
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page('/projects/1'), restored);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project import retains rejected input, opens independent copies and persists across process restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-import-http-'));
  let server;
  try {
    const path = join(directory, 'workboard.sqlite');
    server = await start(path);
    const post = (route, values = {}) => fetch(`${server.url}${route}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const page = async (route) => (await fetch(`${server.url}${route}`)).text();
    const download = async (id) => (await fetch(`${server.url}/projects/${id}/download`)).json();
    const home = await page('/');
    assert.match(home, /<label for="project-json">Project JSON<\/label>/);
    assert.match(home, /<textarea id="project-json" name="json" rows="6">\n<\/textarea>/);
    assert.match(home, /<label for="imported-project-name">Imported project name<\/label>/);
    assert.match(home, />Import project<\/button>/);
    await post('/projects', { name: 'Original' });
    await post('/projects/1/tasks', { title: '  Match\tTITLE  ' });
    await post('/projects/1/tasks', { title: 'Second' });
    await post('/projects/1/tasks/1/completion', { completed: 'on' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
    await post('/projects/1/tasks/1/notes', { notes: '\n  😀 <literal>\nnext  ' });
    await post('/projects/1/tasks/1/delete');
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/archive');
    const original = await download(1);
    const listBefore = await page('/?filter=Archived');
    const json = '\n  </textarea><script>literal</script>\n  ';
    const importedName = '  Copy "<& 😀  ';
    const invalid = await post('/projects/import', { json, importedName, filter: 'Archived' });
    assert.equal(invalid.status, 400);
    const rejected = await invalid.text();
    assert.match(rejected, /role="alert">Invalid project JSON/);
    assert.match(rejected, /rows="6">\n\n  &lt;\/textarea&gt;&lt;script&gt;literal&lt;\/script&gt;\n  <\/textarea>/);
    assert.match(rejected, /name="importedName" type="text" value="  Copy &quot;&lt;&amp; 😀  "/);
    assert.equal(await page('/?filter=Archived'), listBefore);
    const blank = await post('/projects/import', { json: JSON.stringify(original), importedName: ' \t ' });
    assert.equal(blank.status, 400);
    assert.match(await blank.text(), /role="alert">Project name is required/);
    const laterInvalid = structuredClone(original);
    laterInvalid.project.tasks[1].dueDate = '1900-02-29';
    assert.equal((await post('/projects/import', { json: JSON.stringify(laterInvalid), importedName })).status, 400);
    assert.equal(await page('/?filter=Archived'), listBefore);
    assert.deepEqual(await download(1), original);

    // Import an export larger than the ordinary edit-form limit.
    const imported = structuredClone(original);
    imported.project.tasks[0].notes += '\n' + '😀'.repeat(20000);
    const success = await post('/projects/import', { json: JSON.stringify(imported), importedName });
    assert.equal(success.status, 303);
    assert.equal(success.headers.get('location'), '/projects/2');
    imported.project.name = importedName.trim();
    assert.deepEqual(await download(2), imported);
    const detail = await page('/projects/2');
    assert.match(detail, /Archived project/);
    assert.match(detail, /<option selected>All<\/option>/);
    assert.match(detail, /id="task-search" name="search" type="text" value=""/);
    assert.match(detail, /id="due-from" name="rangeFrom" type="text" value=""/);
    assert.match(detail, /disabled>Create task/);
    const deleted = await page('/projects/2?filter=Deleted&search=match');
    assert.match(deleted, /disabled>Restore task/);
    assert.match(deleted, /name="notes" rows="4" disabled>/);
    assert.equal((await post('/projects/2/tasks/3/restore')).status, 409);
    await server.stop();
    server = await start(path);
    assert.deepEqual(await download(2), imported);
    assert.equal(await page('/projects/2'), detail);
    await post('/projects/2/restore');
    await post('/projects/2/tasks', { title: 'Later' });
    assert.equal((await post('/projects/2/tasks/3/restore', { filter: 'Deleted' })).headers.get('location'), '/projects/2?filter=Deleted');
    const restored = await page('/projects/2');
    const titles = [...restored.matchAll(/data-testid="task-row"[^>]*>\s*<span>(.*?)<\/span>/g)].map((m) => m[1]);
    assert.deepEqual(titles, ['Match\tTITLE', 'Second', 'Later']);
    await post('/projects/2/tasks/3/rename', { title: 'Independent' });
    assert.deepEqual(await download(1), original);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
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

test('project download serves portable UTF-8 JSON regardless of filters and remains enabled when archived', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-download-http-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const page = async (path) => (await fetch(`${server.url}${path}`)).text();
    await post('/projects', { name: 'Board  café <literal>' });
    await post('/projects', { name: 'Empty' });
    await post('/projects/1/tasks', { title: 'First\tTITLE' });
    await post('/projects/1/tasks', { title: 'Second' });
    await post('/projects/1/tasks/1/notes', { notes: '  😀 <script>literal</script>\r\nnext\rline  ' });
    await post('/projects/1/tasks/1/completion', { completed: 'on' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
    await post('/projects/1/tasks/1/delete');
    await post('/projects/1/default-priority', { priority: 'Low' });
    const query = new URLSearchParams({ filter: 'Open', priorityFilter: 'Low',
      dueFrom: '2025-01-01', dueThrough: '2026-01-01', search: 'no match' });
    const filteredPath = `/projects/1?${query}`;
    const initial = await page(filteredPath);
    assert.match(initial, /<button type="submit">Download project<\/button>/);
    const downloadForm = initial.match(/<form action="\/projects\/1\/download"[^>]*>([\s\S]*?)<\/form>/)[1];
    assert.doesNotMatch(downloadForm, /disabled/);
    const expected = {
      format: 'workboard-project', version: 1,
      project: {
        name: 'Board  café <literal>', archived: false, defaultPriority: 'Low',
        tasks: [
          { title: 'First\tTITLE', completed: true, priority: 'High', dueDate: '2024-02-29',
            notes: '  😀 <script>literal</script>\nnext\nline  ', deleted: true },
          { title: 'Second', completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false },
        ],
      },
    };
    const download = async () => {
      const response = await fetch(`${server.url}/projects/1/download?${query}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
      assert.equal(response.headers.get('content-disposition'), 'attachment; filename="workboard-project.json"');
      assert.deepEqual(await response.json(), expected);
    };
    const summary = await page('/');
    await download();
    assert.equal(await page(filteredPath), initial);
    assert.equal(await page('/'), summary);
    const empty = await fetch(`${server.url}/projects/2/download`);
    assert.deepEqual((await empty.json()).project.tasks, []);
    assert.equal((await fetch(`${server.url}/projects/999/download`)).status, 404);
    await post('/projects/1/tasks/2/delete');
    expected.project.tasks[1].deleted = true;
    await post('/projects/1/archive');
    expected.project.archived = true;
    const archived = await page(filteredPath);
    assert.match(archived, /<button type="submit">Download project<\/button>/);
    await download();
    await server.stop();
    server = await start(databasePath);
    await download();
    assert.equal(await page(filteredPath), archived);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('rename storage rejects invalid and archived changes while preserving project data', () => {
  const projects = openProjects(':memory:');
  try {
    projects.create('Original');
    projects.createTask(1, 'Saved task');
    projects.setTaskCompleted(1, 1, true);
    assert.equal(projects.rename(1, ' \t '), false);
    assert.equal(projects.find(1).name, 'Original');
    assert.equal(projects.rename(999, 'Missing'), false);
    projects.setArchived(1, true);
    assert.equal(projects.rename(1, 'Blocked'), false);
    assert.equal(projects.find(1).name, 'Original');
    projects.setArchived(1, false);
    assert.equal(projects.rename(1, '  Renamed  '), true);
    assert.deepEqual(projects.list().map((project) => ({ ...project })), [
      { id: 1, name: 'Renamed', archived: 0, total_count: 1, completed_count: 1 },
    ]);
    assert.deepEqual(projects.listTasks(1).map((task) => ({ ...task })), [
      { id: 1, title: 'Saved task', completed: 1, priority: 'Normal', due_date: '', notes: '', deleted: 0 },
    ]);
  } finally {
    projects.close();
  }
});

test('rename validates, preserves identity and order, persists, and is enabled after restoration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const page = async (path) => (await fetch(`${server.url}${path}`)).text();
    const rows = (html) => [...html.matchAll(/<div data-testid="project-row"[\s\S]*?<\/div>/g)]
      .map((match) => match[0]);
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1/completion', { completed: 'on' });
    const initial = await page('/projects/1');
    assert.match(initial, /<label for="new-project-name">New project name<\/label>/);
    assert.match(initial, /id="new-project-name"[^>]*type="text"/);
    assert.match(initial, /<button type="submit">Rename project<\/button>/);
    for (const name of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/rename', { name, filter: 'Completed' });
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.match(html, /<h1>Original<\/h1>/);
      assert.match(html, /<option selected>Completed/);
      assert.doesNotMatch(html, /Complete Pending/);
      assert.equal(await page('/projects/1'), initial);
    }
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
    const renamed = await post('/projects/1/rename', { name: '  New & <name>  ', filter: 'Open' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Open');
    const detail = await page('/projects/1');
    assert.match(detail, /<h1>New &amp; &lt;name&gt;<\/h1>/);
    assert.match(detail, /aria-label="Complete Done" checked/);
    assert.match(detail, /aria-label="Complete Pending">/);
    assert.equal(detail, initial.replaceAll('Original', 'New &amp; &lt;name&gt;'));
    const list = await page('/');
    assert.match(rows(list)[0], /<span>New &amp; &lt;name&gt;<\/span>/);
    assert.match(rows(list)[0], /action="\/projects\/1"/);
    assert.match(rows(list)[0], /data-testid="project-summary">1\/2 completed/);
    assert.match(rows(list)[1], /<span>Second<\/span>/);

    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page('/projects/1'), detail);
    assert.equal(await page('/'), list);
    await post('/projects/1/archive');
    const archived = await page('/projects/1');
    assert.match(archived, /id="new-project-name"[^>]* disabled>/);
    assert.match(archived, /<button type="submit" disabled>Rename project<\/button>/);
    assert.equal((await post('/projects/1/rename', { name: 'Blocked' })).status, 409);
    assert.equal(await page('/projects/1'), archived);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await page('/projects/1'), detail);
    assert.equal((await post('/projects/1/rename', { name: ' Restored name ' })).status, 303);
    const restored = await page('/projects/1');
    assert.equal(restored, detail.replaceAll('New &amp; &lt;name&gt;', 'Restored name'));
    assert.match(rows(await page('/'))[0], /data-testid="project-summary">1\/2 completed/);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page('/projects/1'), restored);
    assert.match(rows(await page('/'))[0], /<span>Restored name<\/span>/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project validation, navigation, creation order, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await start(databasePath);
    let response = await fetch(`${server.url}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });

    const create = (name) => fetch(`${server.url}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    for (const name of ['', '  \t\n ']) {
      response = await create(name);
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    response = await create('  Alpha & <team>  ');
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/');
    assert.equal((await create('Beta')).status, 303);

    const html = await (await fetch(server.url)).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, />Create project<\/button>/);
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.ok(html.indexOf('Alpha &amp; &lt;team&gt;') < html.indexOf('Beta'));
    const projectPath = html.match(/action="(\/projects\/\d+)" method="get"/)[1];
    const detail = await (await fetch(`${server.url}${projectPath}`)).text();
    assert.match(detail, /<h1>Alpha &amp; &lt;team&gt;<\/h1>/);
    assert.match(detail, /action="\/" method="get"><button type="submit">Projects/);
    assert.equal((await fetch(`${server.url}/projects/99999`)).status, 404);
    assert.equal(await (await fetch(server.url)).text(), html);

    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await (await fetch(server.url)).text(), html);
    assert.equal(await (await fetch(`${server.url}${projectPath}`)).text(), detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('existing projects migrate, summaries count all tasks, and archive/restore preserve saved state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    // Seed the previous schema to verify upgrades preserve IDs and task state.
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id),
        title TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO projects (name) VALUES ('Existing');
      INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Done', 1), (1, 'Pending', 0);
    `);
    database.close();
    server = await start(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const page = async (path) => (await fetch(`${server.url}${path}`)).text();
    const rows = (html) => [...html.matchAll(/<div data-testid="project-row"[\s\S]*?<\/div>/g)]
      .map((match) => match[0]);
    let html = await page('/');
    assert.match(html, /<label for="project-filter">Project filter<\/label>/);
    assert.match(html, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(rows(html)[0], /data-testid="project-summary">1\/2 completed/);
    assert.match(rows(html)[0], />Archive project<\/button>/);
    await post('/projects', { name: 'New' });
    html = await page('/');
    assert.equal(rows(html).length, 2);
    assert.match(rows(html)[1], /data-testid="project-summary">0\/0 completed/);
    await post('/projects/2/tasks', { title: 'Another' });
    await post('/projects/2/tasks/3/completion', { completed: 'on' });
    assert.match(rows(await page('/'))[1], /data-testid="project-summary">1\/1 completed/);
    await page('/projects/1?filter=Completed');
    assert.match(rows(await page('/'))[0], /data-testid="project-summary">1\/2 completed/);

    assert.equal((await post('/projects/999/archive')).status, 404);
    assert.equal((await post('/projects/1/archive')).status, 303);
    assert.equal(rows(await page('/')).length, 1);
    assert.doesNotMatch(await page('/'), /Existing/);
    const archivedList = await page('/?filter=Archived');
    assert.equal(rows(archivedList).length, 1);
    assert.match(rows(archivedList)[0], /Existing/);
    assert.match(rows(archivedList)[0], /data-testid="project-summary">1\/2 completed/);
    assert.match(rows(archivedList)[0], />Open project<\/button>/);
    assert.match(rows(archivedList)[0], />Restore project<\/button>/);
    assert.doesNotMatch(rows(archivedList)[0], />Archive project<\/button>/);
    const archivedPage = await page('/projects/1');
    assert.match(archivedPage, /<p>Archived project<\/p>/);
    assert.match(archivedPage, /<button type="submit" disabled>Create task<\/button>/);
    assert.equal((archivedPage.match(/type="checkbox"[^>]* disabled/g) || []).length, 2);
    assert.match(archivedPage, /aria-label="Complete Done" checked disabled/);
    assert.match(await page('/projects/1?filter=Completed'), /Complete Done/);
    assert.doesNotMatch(await page('/projects/1?filter=Completed'), /Complete Pending/);
    assert.match(await page('/projects/1?filter=Open'), /Complete Pending/);
    assert.doesNotMatch(await page('/projects/1?filter=Open'), /Complete Done/);
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked' })).status, 409);
    assert.equal((await post('/projects/1/tasks/1/completion')).status, 409);
    assert.equal((await post('/projects/1/tasks/2/completion', { completed: 'on' })).status, 409);
    assert.equal(await page('/projects/1'), archivedPage);

    const invalid = await post('/projects', { name: ' ', filter: 'Archived' });
    assert.equal(invalid.status, 400);
    const invalidHtml = await invalid.text();
    assert.match(invalidHtml, /Project name is required/);
    assert.match(invalidHtml, /<option selected>Archived/);
    assert.equal(rows(invalidHtml).length, 1);

    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page('/?filter=Archived'), archivedList);
    assert.equal(await page('/projects/1'), archivedPage);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.equal(rows(await page('/?filter=Archived')).length, 0);
    html = await page('/');
    assert.equal(rows(html).length, 2);
    assert.match(rows(html)[0], /Existing/);
    assert.match(rows(html)[0], /data-testid="project-summary">1\/2 completed/);
    assert.doesNotMatch(await page('/projects/1'), /Archived project| disabled/);
    assert.equal((await post('/projects/1/tasks/2/completion', { completed: 'on' })).status, 303);
    await post('/projects/1/tasks', { title: 'After restore' });
    assert.match(rows(await page('/'))[0], /data-testid="project-summary">2\/3 completed/);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(rows(await page('/?filter=Archived')).length, 0);
    assert.match(rows(await page('/'))[0], /data-testid="project-summary">2\/3 completed/);
    assert.match(await page('/projects/1'), /After restore/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter in order, remain project-owned, and persist completion across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  let server;
  try {
    const databasePath = join(directory, 'workboard.sqlite');
    server = await start(databasePath);
    const post = (path, values) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const page = async (path) => (await fetch(`${server.url}${path}`)).text();
    const rows = (html) => [...html.matchAll(/<div data-testid="task-row"[\s\S]*?<\/div>/g)]
      .map((match) => match[0]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const initial = await page('/projects/1');
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, />Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(rows(html).length, 0);
    }
    assert.equal((await post('/projects/999/tasks', { title: 'Orphan' })).status, 404);
    const created = await post('/projects/1/tasks', { title: '  Alpha & <task>  ' });
    assert.equal(created.status, 303);
    assert.equal(created.headers.get('location'), '/projects/1?filter=All');
    await post('/projects/1/tasks', { title: 'Beta' });
    await post('/projects/2/tasks', { title: 'Private' });
    let html = await page('/projects/1');
    const taskRows = rows(html);
    assert.equal(taskRows.length, 2);
    assert.match(taskRows[0], /<span>Alpha &amp; &lt;task&gt;<\/span>/);
    assert.match(taskRows[0], /aria-label="Complete Alpha &amp; &lt;task&gt;"/);
    assert.match(taskRows[1], /<span>Beta<\/span>/);
    assert.doesNotMatch(html, / checked/);
    assert.equal(rows(await page('/projects/1?filter=Open')).length, 2);
    assert.equal(rows(await page('/projects/1?filter=Completed')).length, 0);
    assert.doesNotMatch(html, /Private/);
    assert.doesNotMatch(await page('/projects/2'), /Alpha|Beta/);

    assert.equal((await post('/projects/2/tasks/1/completion', { completed: 'on' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/completion', { completed: 'on' })).status, 404);
    const completed = await post('/projects/1/tasks/1/completion', { completed: 'on', filter: 'Open' });
    assert.equal(completed.status, 303);
    assert.equal(completed.headers.get('location'), '/projects/1?filter=Open');
    html = await page('/projects/1');
    assert.match(rows(html)[0], / checked/);
    assert.doesNotMatch(rows(html)[1], / checked/);
    assert.match(rows(await page('/projects/1?filter=Open'))[0], /Beta/);
    assert.match(rows(await page('/projects/1?filter=Completed'))[0], /Alpha/);
    assert.equal(rows(await page('/projects/1?filter=invalid')).length, 2);
    const invalid = await post('/projects/1/tasks', { title: ' ', filter: 'Completed' });
    const invalidHtml = await invalid.text();
    assert.equal(rows(invalidHtml).length, 1);
    assert.match(invalidHtml, /<option selected>Completed/);

    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page('/projects/1'), html);
    assert.equal(rows(await page('/projects/2')).length, 1);
    assert.equal((await post('/projects/1/tasks/1/completion', {})).status, 303);
    assert.equal(rows(await page('/projects/1?filter=Completed')).length, 0);
    assert.equal(rows(await page('/projects/1?filter=Open')).length, 2);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.doesNotMatch(await page('/projects/1'), / checked/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task rename storage preserves ownership, order and completion and guards invalid changes', () => {
  const projects = openProjects(':memory:');
  try {
    projects.create('First');
    projects.create('Second');
    projects.createTask(1, 'Original');
    projects.createTask(1, 'Next');
    projects.setTaskCompleted(1, 1, true);
    for (const title of ['', ' \t\n ']) {
      assert.equal(projects.renameTask(1, 1, title), false);
    }
    assert.equal(projects.renameTask(2, 1, 'Wrong owner'), false);
    assert.equal(projects.renameTask(1, 999, 'Missing'), false);
    projects.setArchived(1, true);
    assert.equal(projects.renameTask(1, 1, 'Blocked'), false);
    assert.equal(projects.listTasks(1)[0].title, 'Original');
    projects.setArchived(1, false);
    assert.equal(projects.renameTask(1, 1, '  Renamed  '), true);
    assert.deepEqual(projects.listTasks(1).map((task) => ({ ...task })), [
      { id: 1, title: 'Renamed', completed: 1, priority: 'Normal', due_date: '', notes: '', deleted: 0 },
      { id: 2, title: 'Next', completed: 0, priority: 'Normal', due_date: '', notes: '', deleted: 0 },
    ]);
    assert.deepEqual(projects.listTasks(2), []);
    assert.equal(projects.list()[0].completed_count, 1);
    assert.equal(projects.list()[0].total_count, 2);
  } finally {
    projects.close();
  }
});

test('task rename updates accessible controls, preserves filters and summaries, and survives restart and restoration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const page = async (path) => (await fetch(`${server.url}${path}`)).text();
    const rows = (html) => [...html.matchAll(/<div data-testid="task-row"[\s\S]*?<\/div>/g)]
      .map((match) => match[0]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Original' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/2/tasks', { title: 'Private' });
    await post('/projects/1/tasks/1/completion', { completed: 'on' });
    const initial = await page('/projects/1');
    const list = await page('/');
    assert.match(rows(initial)[0], /<label for="new-task-title-1">New task title<\/label>/);
    assert.match(rows(initial)[0], /id="new-task-title-1"[^>]*type="text"/);
    assert.match(rows(initial)[0], /<button type="submit">Rename task<\/button>/);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks/1/rename', { title, filter: 'Completed' });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.match(html, /<option selected>Completed/);
      assert.equal(rows(html).length, 1);
      assert.match(rows(html)[0], /aria-label="Complete Original" checked/);
      assert.equal(await page('/projects/1'), initial);
    }
    for (const path of ['/projects/2/tasks/1/rename', '/projects/1/tasks/999/rename', '/projects/999/tasks/1/rename']) {
      assert.equal((await post(path, { title: 'Blocked' })).status, 404);
    }
    const renamed = await post('/projects/1/tasks/1/rename', { title: '  New & <title>  ', filter: 'Completed' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const detail = await page('/projects/1');
    assert.equal(detail, initial.replaceAll('Original', 'New &amp; &lt;title&gt;'));
    assert.match(rows(detail)[0], /<span>New &amp; &lt;title&gt;<\/span>/);
    assert.match(rows(detail)[0], /aria-label="Complete New &amp; &lt;title&gt;" checked/);
    assert.match(rows(detail)[1], /<span>Pending<\/span>/);
    assert.equal(rows(await page('/projects/1?filter=Completed')).length, 1);
    assert.match(rows(await page('/projects/1?filter=Open'))[0], /Complete Pending/);
    assert.doesNotMatch(await page('/projects/2'), /New &amp;|Original|Pending/);
    assert.equal(await page('/'), list);

    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page('/projects/1'), detail);
    assert.equal(await page('/'), list);
    await post('/projects/1/archive');
    const archived = await page('/projects/1');
    for (const row of rows(archived)) {
      assert.match(row, /id="new-task-title-\d+"[^>]* disabled>/);
      assert.match(row, /<button type="submit" disabled>Rename task<\/button>/);
    }
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Blocked' })).status, 409);
    assert.equal(await page('/projects/1'), archived);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await page('/projects/1'), detail);
    assert.equal(await page('/'), list);
    assert.equal((await post('/projects/1/tasks/2/rename', { title: ' Restored task ', filter: 'Open' })).status, 303);
    const restored = await page('/projects/1');
    assert.equal(restored, detail.replaceAll('Pending', 'Restored task'));
    assert.match(rows(restored)[1], /aria-label="Complete Restored task">/);
    assert.equal(await page('/'), list);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page('/projects/1'), restored);
    assert.equal(await page('/'), list);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('combined filters intersect completion and priority without changing order, ownership or summaries', () => {
  const projects = openProjects(':memory:');
  try {
    projects.create('First');
    projects.create('Second');
    const tasks = [];
    for (const priority of ['Low', 'Normal', 'High']) {
      for (const completed of [false, true]) {
        projects.createTask(1, `${priority} ${completed ? 'done' : 'open'}`);
        const id = tasks.length + 1;
        projects.setTaskPriority(1, id, priority);
        projects.setTaskCompleted(1, id, completed);
        tasks.push({ id, priority, completed });
      }
    }
    projects.createTask(2, 'Private');
    const original = projects.listTasks(1);
    const summary = projects.list();
    for (const completion of ['All', 'Open', 'Completed']) {
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        const expected = tasks.filter((task) =>
          (completion === 'All' || task.completed === (completion === 'Completed')) &&
          (priority === 'All' || task.priority === priority)).map((task) => task.id);
        assert.deepEqual(projects.listTasks(1, completion, priority).map((task) => task.id), expected);
      }
    }
    assert.deepEqual(projects.listTasks(1, 'invalid', 'invalid'), original);
    assert.deepEqual(projects.list(), summary);
    projects.setArchived(1, true);
    assert.deepEqual(projects.listTasks(1, 'Completed', 'High').map((task) => task.id), [6]);
  } finally {
    projects.close();
  }
});

test('combined filter controls survive edits, validation, reload, restart and archive/restore', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-filters-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const page = async (path) => (await fetch(`${server.url}${path}`)).text();
    const rows = (html) => [...html.matchAll(/<div data-testid="task-row"[\s\S]*?<\/div>/g)]
      .map((match) => match[0]);
    const titles = (html) => rows(html).map((row) => row.match(/<span>(.*?)<\/span>/)[1]);
    const assertFilters = (html, completion, priority) => {
      const form = html.match(/<form[^>]*class="task-filter"[^>]*>([\s\S]*?)<\/form>/)[1];
      for (const [id, options, selected] of [
        ['task-filter', ['All', 'Open', 'Completed', 'Deleted'], completion],
        ['priority-filter', ['All', 'Low', 'Normal', 'High'], priority],
      ]) {
        const select = form.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`));
        assert.ok(select);
        assert.doesNotMatch(select[0], /disabled/);
        assert.deepEqual([...select[1].matchAll(/<option(?: selected)?>(.*?)<\/option>/g)].map((match) => match[1]), options);
        assert.match(select[1], new RegExp(`<option selected>${selected}</option>`));
      }
      // Every project-page mutation form must retain both selected filters.
      for (const match of html.matchAll(/<form[^>]*method="post"[^>]*>([\s\S]*?)<\/form>/g)) {
        assert.match(match[1], new RegExp(`name="filter" value="${completion}"`));
        assert.match(match[1], new RegExp(`name="priorityFilter" value="${priority}"`));
      }
    };
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    for (const title of ['First high', 'Normal', 'Low', 'Second high']) {
      await post('/projects/1/tasks', { title });
    }
    await post('/projects/2/tasks', { title: 'Private' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/3/priority', { priority: 'Low' });
    await post('/projects/1/tasks/4/priority', { priority: 'High' });
    await post('/projects/1/tasks/4/completion', { completed: 'on' });
    const summary = await page('/');
    assertFilters(await page('/projects/1'), 'All', 'All');
    const filteredPath = '/projects/1?filter=Open&priorityFilter=High';
    let html = await page(filteredPath);
    assertFilters(html, 'Open', 'High');
    assert.match(html, /<label for="priority-filter">Priority filter<\/label>/);
    assert.deepEqual(titles(html), ['First high']);
    assert.deepEqual(titles(await page('/projects/1?filter=All&priorityFilter=High')), ['First high', 'Second high']);
    assertFilters(await page('/projects/1?filter=Completed&priorityFilter=High'), 'Completed', 'High');
    assert.deepEqual(titles(await page('/projects/1?filter=Open&priorityFilter=Low')), ['Low']);
    assertFilters(await page('/projects/1?filter=Open&priorityFilter=invalid'), 'Open', 'All');
    assert.equal(await page('/'), summary);
    const filters = { filter: 'Open', priorityFilter: 'High' };
    for (const [path, values, error] of [
      ['/projects/1/tasks/1/rename', { title: ' ' }, 'Task title is required'],
      ['/projects/1/tasks', { title: ' ' }, 'Task title is required'],
      ['/projects/1/rename', { name: ' ' }, 'Project name is required'],
      ['/projects/1/tasks/1/priority', { priority: 'Urgent' }, 'Invalid task priority'],
    ]) {
      const response = await post(path, { ...filters, ...values });
      assert.equal(response.status, 400);
      const errorPage = await response.text();
      assert.match(errorPage, new RegExp(`role="alert">${error}`));
      assertFilters(errorPage, 'Open', 'High');
      assert.deepEqual(titles(errorPage), ['First high']);
    }
    const edit = async (path, values) => {
      const response = await post(path, { ...filters, ...values });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), filteredPath);
      const html = await page(response.headers.get('location'));
      assertFilters(html, 'Open', 'High');
      return html;
    };
    html = await edit('/projects/1/tasks/1/rename', { title: '  Renamed high  ' });
    assert.deepEqual(titles(html), ['Renamed high']);
    assert.match(rows(html)[0], /aria-label="Complete Renamed high"/);
    assert.equal(await page('/'), summary);
    html = await edit('/projects/1/tasks/1/priority', { priority: 'Low' });
    assert.deepEqual(titles(html), []);
    assert.equal(await page('/'), summary);
    await edit('/projects/1/tasks/1/priority', { priority: 'High' });
    html = await edit('/projects/1/tasks/1/completion', { completed: 'on' });
    assert.deepEqual(titles(html), []);
    assert.match(await page('/'), /data-testid="project-summary">2\/4 completed/);
    html = await edit('/projects/1/tasks/4/completion', {});
    assert.deepEqual(titles(html), ['Second high']);
    assert.equal(await page('/'), summary);
    assert.deepEqual(titles(await page('/projects/2')), ['Private']);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page(filteredPath), html);
    assertFilters(await page('/projects/1'), 'All', 'All');
    await post('/projects/1/archive');
    const archived = await page(filteredPath);
    assertFilters(archived, 'Open', 'High');
    assert.deepEqual(titles(archived), ['Second high']);
    assert.match(rows(archived)[0], /type="checkbox"[^>]* disabled/);
    assert.match(rows(archived)[0], /name="priority" disabled/);
    assert.match(rows(archived)[0], /id="new-task-title-4"[^>]* disabled/);
    assert.match(rows(archived)[0], /disabled>Rename task/);
    assert.deepEqual(titles(await page('/projects/1?filter=Completed&priorityFilter=High')), ['Renamed high']);
    assert.match(await page('/?filter=Archived'), /data-testid="project-summary">1\/4 completed/);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page(filteredPath), archived);
    await post('/projects/1/restore');
    assert.equal(await page(filteredPath), html);
    assert.equal(await page('/'), summary);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project default migration preserves existing tasks and applies defaults only to subsequent tasks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-default-migration-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let projects;
  try {
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
      INSERT INTO projects (name) VALUES ('Existing'), ('Other');
      INSERT INTO tasks (project_id, title, completed, priority) VALUES (1, 'Saved high', 1, 'High'), (1, 'Saved normal', 0, 'Normal');
    `);
    database.close();
    projects = openProjects(databasePath);
    assert.equal(projects.find(1).default_task_priority, 'Normal');
    projects.create('New');
    assert.equal(projects.find(3).default_task_priority, 'Normal');
    const existing = projects.listTasks(1);
    const summary = projects.list();
    for (const priority of ['', 'Urgent', 'high', null]) {
      assert.equal(projects.setDefaultTaskPriority(1, priority), false);
    }
    assert.equal(projects.setDefaultTaskPriority(999, 'High'), false);
    assert.equal(projects.setDefaultTaskPriority(1, 'Low'), true);
    assert.equal(projects.find(2).default_task_priority, 'Normal');
    assert.deepEqual(projects.listTasks(1), existing);
    assert.deepEqual(projects.list(), summary);
    projects.createTask(1, '  Inherited low  ');
    projects.createTask(2, 'Independent normal');
    assert.equal(projects.listTasks(1)[2].priority, 'Low');
    assert.equal(projects.listTasks(1)[2].title, 'Inherited low');
    assert.equal(projects.listTasks(1)[2].completed, 0);
    assert.equal(projects.listTasks(2)[0].priority, 'Normal');
    projects.setDefaultTaskPriority(1, 'High');
    projects.renameTask(1, 3, 'Renamed low');
    assert.equal(projects.listTasks(1)[2].priority, 'Low');
    projects.rename(1, 'Renamed project');
    projects.setArchived(1, true);
    assert.equal(projects.setDefaultTaskPriority(1, 'Normal'), false);
    assert.equal(projects.createTask(1, 'Blocked'), false);
    projects.close();
    projects = openProjects(databasePath);
    assert.equal(projects.find(1).default_task_priority, 'High');
    assert.deepEqual(projects.listTasks(1).slice(0, 2), existing);
    projects.setArchived(1, false);
    projects.createTask(1, 'Inherited high');
    assert.deepEqual(projects.listTasks(1).map((task) => task.priority), ['High', 'Normal', 'Low', 'High']);
    assert.equal(projects.list()[0].completed_count, 1);
    assert.equal(projects.list()[0].total_count, 4);
  } finally {
    if (projects) projects.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('default priority controls preserve filters and saved data across edits, restart, archive and restore', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-default-http-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const page = async (path) => (await fetch(`${server.url}${path}`)).text();
    const rows = (html) => [...html.matchAll(/<div data-testid="task-row"[\s\S]*?<\/div>/g)].map((match) => match[0]);
    const assertDefault = (html, priority, disabled = false) => {
      assert.match(html, /<label for="default-task-priority">Default task priority<\/label>/);
      const select = html.match(/<select id="default-task-priority"[^>]*>([\s\S]*?)<\/select>/);
      assert.ok(select);
      assert.equal(select[0].includes('disabled'), disabled);
      assert.deepEqual([...select[1].matchAll(/<option(?: selected)?>(.*?)<\/option>/g)].map((match) => match[1]), ['Low', 'Normal', 'High']);
      assert.match(select[1], new RegExp(`<option selected>${priority}</option>`));
      const form = html.match(/<form[^>]*action="[^\"]*\/default-priority"[^>]*>/)[0];
      assert.match(form, /data-auto-submit/);
    };
    const filters = { filter: 'Open', priorityFilter: 'Normal' };
    const filteredPath = '/projects/1?filter=Open&priorityFilter=Normal';
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Existing normal' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks/2/completion', { completed: 'on' });
    const initial = await page(filteredPath);
    const summary = await page('/');
    assertDefault(initial, 'Normal');
    for (const priority of ['', 'Urgent', 'normal']) {
      const response = await post('/projects/1/default-priority', { ...filters, priority });
      assert.equal(response.status, 400);
      assert.match(await response.text(), /role="alert">Invalid task priority/);
      assert.equal(await page(filteredPath), initial);
    }
    assert.equal((await post('/projects/999/default-priority', { priority: 'High' })).status, 404);
    const changed = await post('/projects/1/default-priority', { ...filters, priority: 'High' });
    assert.equal(changed.status, 303);
    assert.equal(changed.headers.get('location'), filteredPath);
    const high = await page(filteredPath);
    assertDefault(high, 'High');
    assert.deepEqual(rows(high), rows(initial));
    assert.match(high, /<select id="task-filter"[^>]*>\s*<option>All<\/option><option selected>Open/);
    assert.match(high, /<select id="priority-filter"[^>]*>\s*<option>All<\/option><option>Low<\/option><option selected>Normal/);
    assert.equal(await page('/'), summary);
    assertDefault(await page('/projects/2'), 'Normal');
    await post('/projects/1/tasks', { ...filters, title: 'Inherited high' });
    assert.deepEqual(rows(await page(filteredPath)), rows(initial));
    assert.match(rows(await page('/projects/1?priorityFilter=High'))[0], /<span>Inherited high<\/span>/);
    await post('/projects/1/default-priority', { ...filters, priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Inherited low' });
    await post('/projects/2/tasks', { title: 'Independent normal' });
    assert.match(rows(await page('/projects/2'))[0], /<option selected>Normal/);
    await post('/projects/1/rename', { ...filters, name: 'Renamed project' });
    assertDefault(await page(filteredPath), 'Low');
    const beforeArchive = await page('/projects/1');
    const savedSummary = await page('/');
    await post('/projects/1/archive');
    const archived = await page('/projects/1');
    assertDefault(archived, 'Low', true);
    assert.equal((await post('/projects/1/default-priority', { priority: 'High' })).status, 409);
    assert.equal(await page('/projects/1'), archived);
    assert.equal(rows(await page(filteredPath)).length, 1);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await page('/projects/1'), beforeArchive);
    assert.equal(await page('/'), savedSummary);
    await post('/projects/1/tasks', { title: 'Restored low' });
    const restored = await page('/projects/1');
    assertDefault(restored, 'Low');
    assert.equal(rows(restored).length, 5);
    assert.match(rows(restored)[4], /<option selected>Low/);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await page('/projects/1'), restored);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('applied due ranges survive all edits and validation, reset on reopening and work when archived', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-range-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const page = async (path) => (await fetch(`${server.url}${path}`)).text();
    const titles = (html) => [...html.matchAll(/data-testid="task-row"[^>]*>\s*<span>(.*?)<\/span>/g)].map((match) => match[1]);
    await post('/projects', { name: 'Range project' });
    for (const title of ['Before', 'Start', 'End', 'After', 'Undated']) {
      await post('/projects/1/tasks', { title });
    }
    for (const [id, date] of [[1, '2024-02-28'], [2, '2024-02-29'], [3, '2024-03-01'], [4, '2024-03-02']]) {
      await post(`/projects/1/tasks/${id}/due-date`, { dueDate: date });
    }
    await post('/projects/1/tasks/2/priority', { priority: 'High' });
    await post('/projects/1/tasks/3/priority', { priority: 'High' });
    await post('/projects/1/tasks/3/completion', { completed: 'on' });
    const summary = await page('/');
    const filters = { filter: 'Open', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-03-01' };
    const filteredPath = `/projects/1?${new URLSearchParams(filters)}`;
    const apply = await post('/projects/1/due-range', {
      filter: 'Open', priorityFilter: 'High', rangeFrom: ' 2024-02-29 ', rangeThrough: ' 2024-03-01 ',
    });
    assert.equal(apply.status, 303);
    assert.equal(apply.headers.get('location'), filteredPath);
    let html = await page(filteredPath);
    assert.deepEqual(titles(html), ['Start']);
    assert.match(html, /<label for="due-from">Due from<\/label>/);
    assert.match(html, /<label for="due-through">Due through<\/label>/);
    for (const form of html.matchAll(/<form[^>]*>([\s\S]*?)<\/form>/g)) {
      if (form[0].includes('action="/"')) continue;
      assert.match(form[1], /name="dueFrom" value="2024-02-29"/);
      assert.match(form[1], /name="dueThrough" value="2024-03-01"/);
    }
    for (const [rangeFrom, rangeThrough, message] of [
      ['2024-02-30', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['', '1900-02-29', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-03-01', '2024-02-29', 'Due from must not be after Due through'],
    ]) {
      const response = await post('/projects/1/due-range', { ...filters, rangeFrom, rangeThrough });
      assert.equal(response.status, 400);
      const invalid = await response.text();
      assert.match(invalid, new RegExp(`role="alert">${message}`));
      assert.deepEqual(titles(invalid), ['Start']);
      assert.match(invalid, /<option selected>Open/);
      assert.match(invalid, /<option selected>High/);
      assert.equal(await page('/'), summary);
    }
    const edit = async (path, values, expected) => {
      const response = await post(path, { ...filters, ...values });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), filteredPath);
      html = await page(filteredPath);
      assert.deepEqual(titles(html), expected);
    };
    await edit('/projects/1/tasks/2/rename', { title: 'Renamed' }, ['Renamed']);
    await edit('/projects/1/rename', { name: 'Renamed project' }, ['Renamed']);
    await edit('/projects/1/default-priority', { priority: 'High' }, ['Renamed']);
    await edit('/projects/1/tasks', { title: 'New undated' }, ['Renamed']);
    await edit('/projects/1/tasks/2/due-date', { dueDate: '2024-03-02' }, []);
    await edit('/projects/1/tasks/2/due-date', { dueDate: '2024-02-29' }, ['Renamed']);
    await edit('/projects/1/tasks/2/priority', { priority: 'Low' }, []);
    await edit('/projects/1/tasks/2/priority', { priority: 'High' }, ['Renamed']);
    await edit('/projects/1/tasks/2/completion', { completed: 'on' }, []);
    await edit('/projects/1/tasks/2/completion', {}, ['Renamed']);
    await edit('/projects/1/tasks/2/due-date', { dueDate: '  ' }, []);
    await edit('/projects/1/tasks/2/due-date', { dueDate: '2024-02-29' }, ['Renamed']);
    const completedPath = filteredPath.replace('filter=Open', 'filter=Completed');
    assert.deepEqual(titles(await page(completedPath)), ['End']);
    assert.deepEqual(titles(await page(filteredPath.replace('priorityFilter=High', 'priorityFilter=Low'))), []);
    const savedSummary = await page('/');
    await server.stop();
    server = await start(databasePath);
    assert.equal(await page(filteredPath), html);
    const reopened = await page('/projects/1');
    assert.equal(titles(reopened).length, 6);
    assert.match(reopened, /name="rangeFrom" type="text" value=""/);
    assert.match(reopened, /name="rangeThrough" type="text" value=""/);
    await post('/projects/1/archive');
    const archived = await page(filteredPath);
    const rangeForm = archived.match(/<form[^>]*class="due-range"[^>]*>([\s\S]*?)<\/form>/)[1];
    assert.doesNotMatch(rangeForm, /disabled/);
    assert.match(archived, /name="dueDate"[^>]* disabled/);
    const cleared = await post('/projects/1/due-range', { ...filters, rangeFrom: ' ', rangeThrough: '' });
    assert.equal(cleared.headers.get('location'), '/projects/1?filter=Open&priorityFilter=High');
    assert.deepEqual(titles(await page(cleared.headers.get('location'))), ['Renamed', 'New undated']);
    await post('/projects/1/restore');
    assert.equal(await page(filteredPath), html);
    assert.equal(await page('/'), savedSummary);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task moves migrate order, remember return positions, preserve data and reject ineligible projects', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-move-migration-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let projects;
  try {
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (name) VALUES ('Source'), ('Destination'), ('Other');
      INSERT INTO tasks (project_id, title) VALUES (1, 'First'), (2, 'Destination first'), (1, 'Second');
    `);
    database.close();
    projects = openProjects(databasePath);
    assert.deepEqual(projects.listTasks(1).map((task) => task.title), ['First', 'Second']);
    projects.setTaskCompleted(1, 1, true);
    projects.setTaskPriority(1, 1, 'High');
    projects.setTaskDueDate(1, 1, '0001-01-01');
    projects.setDefaultTaskPriority(2, 'Low');
    const saved = projects.listTasks(1)[0];
    for (const destination of [1, 999, 0, 1.5, '2', null]) {
      assert.equal(projects.moveTask(1, 1, destination), false);
    }
    assert.equal(projects.moveTask(2, 1, 3), false);
    assert.equal(projects.moveTask(1, 999, 2), false);
    projects.setArchived(2, true);
    assert.equal(projects.moveTask(1, 1, 2), false);
    projects.setArchived(2, false);
    projects.setArchived(1, true);
    assert.equal(projects.moveTask(1, 1, 2), false);
    projects.setArchived(1, false);
    assert.equal(projects.moveTask(1, 1, 2), true);
    assert.deepEqual(projects.listTasks(1).map((task) => task.id), [3]);
    assert.deepEqual(projects.listTasks(2).map((task) => task.id), [2, 1]);
    assert.deepEqual(projects.listTasks(2)[1], saved);
    projects.createTask(2, 'Created after move');
    assert.deepEqual(projects.listTasks(2).map((task) => task.id), [2, 1, 4]);
    assert.equal(projects.listTasks(2)[2].priority, 'Low');
    assert.equal(projects.moveTask(2, 1, 1), true);
    assert.deepEqual(projects.listTasks(1).map((task) => task.id), [1, 3]);
    assert.equal(projects.moveTask(1, 3, 2), true);
    assert.deepEqual(projects.listTasks(2).map((task) => task.id), [2, 4, 3]);
    assert.equal(projects.listTasks(2)[2].due_date, '');
    assert.deepEqual(projects.list().map((project) => [project.completed_count, project.total_count]), [[1, 1], [0, 3], [0, 0]]);
    projects.close();
    projects = openProjects(databasePath);
    assert.deepEqual(projects.listTasks(1), [saved]);
    assert.deepEqual(projects.listTasks(2).map((task) => task.id), [2, 4, 3]);
    assert.equal(projects.moveTask(1, 1, 2), true);
    assert.deepEqual(projects.listTasks(2).map((task) => task.id), [2, 1, 4, 3]);
    assert.deepEqual(projects.listTasks(2)[1], saved);
  } finally {
    if (projects) projects.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('move controls list eligible names, retain source filters, update summaries and persist through restart and archive', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-move-http-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const page = async (path) => (await fetch(`${server.url}${path}`)).text();
    const titles = (html) => [...html.matchAll(/data-testid="task-row"[^>]*>\s*<span>(.*?)<\/span>/g)].map((match) => match[1]);
    const assertDestinations = (html, expected, disabled = false) => {
      const selects = [...html.matchAll(/<select id="destination-project-\d+"[^>]*>([\s\S]*?)<\/select>/g)];
      assert.ok(selects.length);
      for (const select of selects) {
        assert.equal(select[0].includes('disabled'), disabled);
        assert.deepEqual([...select[1].matchAll(/<option value="(\d+)">(.*?)<\/option>/g)].map((option) => [option[1], option[2]]), expected);
      }
      assert.match(html, /<label for="destination-project-\d+">Destination project<\/label>/);
      assert.match(html, disabled ? /disabled>Move task/ : /<button type="submit">Move task/);
    };
    await post('/projects', { name: 'Source' });
    await post('/projects/1/tasks', { title: 'Move me' });
    assertDestinations(await page('/projects/1'), [], true);
    for (const name of ['Destination', 'Other', 'Archived']) await post('/projects', { name });
    await post('/projects/4/archive');
    await post('/projects/2/rename', { name: 'Renamed & destination' });
    await post('/projects/2/default-priority', { priority: 'Low' });
    await post('/projects/2/tasks', { title: 'Destination existing' });
    await post('/projects/1/tasks', { title: 'Remain' });
    for (const id of [1, 3]) {
      await post(`/projects/1/tasks/${id}/completion`, { completed: 'on' });
      await post(`/projects/1/tasks/${id}/priority`, { priority: 'High' });
      await post(`/projects/1/tasks/${id}/due-date`, { dueDate: '2024-02-29' });
    }
    const filters = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-02-29' };
    const filteredPath = `/projects/1?${new URLSearchParams(filters)}`;
    assertDestinations(await page(filteredPath), [['2', 'Renamed &amp; destination'], ['3', 'Other']]);
    for (const destination of ['1', '4', '999', '', '2.5']) {
      assert.equal((await post('/projects/1/tasks/1/move', { ...filters, destination })).status, 400);
      assert.deepEqual(titles(await page(filteredPath)), ['Move me', 'Remain']);
    }
    assert.equal((await post('/projects/2/tasks/1/move', { destination: '3' })).status, 400);
    const moved = await post('/projects/1/tasks/1/move', { ...filters, destination: '2' });
    assert.equal(moved.status, 303);
    assert.equal(moved.headers.get('location'), filteredPath);
    const source = await page(filteredPath);
    assert.deepEqual(titles(source), ['Remain']);
    assert.match(source, /<option selected>Completed/);
    assert.match(source, /<option selected>High/);
    assert.match(source, /name="rangeFrom" type="text" value="2024-02-29"/);
    assert.match(source, /name="rangeThrough" type="text" value="2024-02-29"/);
    const destination = await page('/projects/2');
    assert.deepEqual(titles(destination), ['Destination existing', 'Move me']);
    assert.match(destination, /aria-label="Complete Move me" checked/);
    assert.match(destination, /<option selected>High/);
    assert.match(destination, /name="dueDate" type="text" value="2024-02-29"/);
    assertDestinations(destination, [['1', 'Source'], ['3', 'Other']]);
    assert.deepEqual([...((await page('/')).matchAll(/data-testid="project-summary">(\d+\/\d+) completed/g))].map((match) => match[1]), ['1/1', '1/2', '0/0']);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await page(filteredPath), source);
    assert.equal(await page('/projects/2'), destination);
    await post('/projects/2/archive');
    assertDestinations(await page('/projects/2'), [['1', 'Source'], ['3', 'Other']], true);
    assert.equal((await post('/projects/2/tasks/1/move', { destination: '1' })).status, 409);
    assertDestinations(await page('/projects/1'), [['3', 'Other']]);
    await post('/projects/3/archive');
    assertDestinations(await page('/projects/1'), [], true);
    await post('/projects/2/restore');
    assertDestinations(await page('/projects/2'), [['1', 'Source']]);
    assert.equal((await post('/projects/2/tasks/1/move', { destination: '1' })).status, 303);
    assert.deepEqual(titles(await page(filteredPath)), ['Move me', 'Remain']);
    assert.deepEqual(titles(await page('/projects/2')), ['Destination existing']);
    // Moving a blank-dated task must preserve the blank date and its Low priority.
    await post('/projects/2/tasks/2/move', { destination: '1' });
    const allSource = await page('/projects/1');
    assert.deepEqual(titles(allSource), ['Move me', 'Remain', 'Destination existing']);
    assert.deepEqual(titles(await page(filteredPath)), ['Move me', 'Remain']);
    assert.match(allSource, /name="dueDate" type="text" value=""/);
    assert.match(allSource, /<option selected>Low/);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await page('/projects/1'), allSource);
    assert.deepEqual(titles(await page('/projects/2')), []);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('normalized search preserves original names and titles through filters, moves, archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-search-spacing-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const page = async (path) => (await fetch(`${server.url}${path}`)).text();
    const titles = (html, kind = 'task') => [...html.matchAll(new RegExp(`data-testid="${kind}-row"[^>]*>\\s*<span>(.*?)</span>`, 'g'))].map((match) => match[1]);
    const name = 'ALpha \t  Board';
    const title = 'Plan\t \t  RELEASE';
    for (const projectName of [name, 'Destination', 'Alpha\tBoard']) {
      assert.equal((await post('/projects', { name: projectName })).status, 303);
    }
    await post('/projects/3/archive');
    const projectQuery = new URLSearchParams({ search: ' \talpha\t \tboard  ' });
    assert.deepEqual(titles(await page(`/?${projectQuery}`), 'project'), [name]);
    assert.deepEqual(titles(await page(`/?filter=Archived&${projectQuery}`), 'project'), ['Alpha\tBoard']);
    for (const taskTitle of [title, 'Plan release', 'Plan\nrelease']) {
      await post('/projects/1/tasks', { title: taskTitle });
    }
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/completion', { completed: 'on' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
    const filters = {
      filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-29',
      dueThrough: '2024-02-29', search: 'pLaN \t release',
    };
    const filteredPath = `/projects/1?${new URLSearchParams(filters)}`;
    assert.deepEqual(titles(await page(filteredPath)), [title]);
    assert.deepEqual(titles(await page('/projects/1?search=plan+release')), [title, 'Plan release']);
    const renamed = 'PLAN  \tRelease updated';
    const response = await post('/projects/1/tasks/1/rename', { ...filters, title: renamed });
    assert.equal(response.headers.get('location'), filteredPath);
    assert.deepEqual(titles(await page(filteredPath)), [renamed]);
    await post('/projects/1/tasks/1/move', { ...filters, destination: '2' });
    assert.deepEqual(titles(await page(filteredPath)), []);
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(titles(await page('/projects/1?search=plan+release')), [renamed, 'Plan release']);
    const unfiltered = await page('/projects/1');
    assert.match(unfiltered, new RegExp(`<h1>${name}</h1>`));
    assert.match(unfiltered, /data-testid="task-row"[^>]*>\s*<span>Plan\nrelease<\/span>/);
    const summary = await page('/');
    await server.stop();
    server = await start(databasePath);
    assert.equal(await page('/projects/1'), unfiltered);
    assert.equal(await page('/'), summary);
    assert.deepEqual(titles(await page(filteredPath)), [renamed]);
    await post('/projects/1/archive');
    assert.deepEqual(titles(await page(`/?filter=Archived&${projectQuery}`), 'project'), [name, 'Alpha\tBoard']);
    assert.deepEqual(titles(await page(filteredPath)), [renamed]);
    await post('/projects/1/restore');
    assert.equal(await page('/projects/1'), unfiltered);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('search forms retain applied queries across filters, edits, movement and archived pages and reset on navigation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-search-http-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const page = async (path) => (await fetch(`${server.url}${path}`)).text();
    const titles = (html, kind = 'task') => [...html.matchAll(new RegExp(`data-testid="${kind}-row"[^>]*>\\s*<span>(.*?)</span>`, 'g'))].map((match) => match[1]);
    const form = (html, className) => html.match(new RegExp(`<form[^>]*class="${className}"[^>]*>([\\s\\S]*?)</form>`))[1];
    for (const name of ['Alpha one', 'Other', 'ALPHA  two', 'Alpha archived']) await post('/projects', { name });
    await post('/projects/4/archive');
    let html = await page('/?search=%20aLpHa%20');
    assert.deepEqual(titles(html, 'project'), ['Alpha one', 'ALPHA  two']);
    assert.match(html, /<label for="project-search">Project search<\/label>/);
    assert.match(form(html, 'project-search'), /name="search" type="text" value="aLpHa"/);
    assert.match(form(html, 'project-filter'), /name="search" value="aLpHa"/);
    html = await page('/?filter=Archived&search=alpha');
    assert.deepEqual(titles(html, 'project'), ['Alpha archived']);
    assert.match(form(html, 'project-search'), /name="filter" value="Archived"/);
    assert.deepEqual(titles(await page('/?search=alpha+two'), 'project'), ['ALPHA  two']);
    assert.deepEqual(titles(await page('/?search=%20%20'), 'project'), ['Alpha one', 'Other', 'ALPHA  two']);
    assert.match(await page('/'), /id="project-search" name="search" type="text" value=""/);
    for (const title of ['Match first', 'MATCH  second', 'Other', 'Match undated']) await post('/projects/1/tasks', { title });
    await post('/projects/2/tasks', { title: 'Match private' });
    for (const id of [1, 2]) {
      await post(`/projects/1/tasks/${id}/priority`, { priority: 'High' });
      await post(`/projects/1/tasks/${id}/due-date`, { dueDate: '2024-02-29' });
    }
    await post('/projects/1/tasks/2/completion', { completed: 'on' });
    const filters = { filter: 'Open', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-02-29', search: 'mAtCh' };
    const filteredPath = `/projects/1?${new URLSearchParams(filters)}`;
    html = await page(filteredPath);
    assert.deepEqual(titles(html), ['Match first']);
    assert.match(html, /<label for="task-search">Task search<\/label>/);
    const searchForm = form(html, 'task-search');
    for (const [key, value] of Object.entries(filters)) {
      assert.match(searchForm, new RegExp(`name="${key}"(?: type="text")? value="${value}"`));
    }
    assert.equal([...searchForm.matchAll(/name="search"/g)].length, 1);
    for (const match of html.matchAll(/<form[^>]*>([\s\S]*?)<\/form>/g)) {
      if (match[0].includes('action="/"')) continue;
      assert.match(match[1], /name="search"(?: type="text")? value="mAtCh"/);
    }
    const summary = await page('/');
    assert.deepEqual(titles(await page(filteredPath.replace('filter=Open', 'filter=Completed'))), ['MATCH  second']);
    assert.deepEqual(titles(await page(filteredPath.replace('priorityFilter=High', 'priorityFilter=Normal'))), []);
    const rangeResponse = await post('/projects/1/due-range', { ...filters, rangeFrom: '', rangeThrough: '' });
    assert.equal(rangeResponse.headers.get('location'), '/projects/1?filter=Open&priorityFilter=High&search=mAtCh');
    assert.equal(await page('/'), summary);
    const edit = async (path, values, expected) => {
      const response = await post(path, { ...filters, ...values });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), filteredPath);
      html = await page(filteredPath);
      assert.deepEqual(titles(html), expected);
    };
    await edit('/projects/1/tasks/1/rename', { title: 'Does not fit' }, []);
    await edit('/projects/1/tasks/1/rename', { title: 'Match renamed' }, ['Match renamed']);
    await edit('/projects/1/rename', { name: 'Renamed project' }, ['Match renamed']);
    await edit('/projects/1/default-priority', { priority: 'High' }, ['Match renamed']);
    await edit('/projects/1/tasks', { title: 'Match created' }, ['Match renamed']);
    await edit('/projects/1/tasks/1/priority', { priority: 'Low' }, []);
    await edit('/projects/1/tasks/1/priority', { priority: 'High' }, ['Match renamed']);
    await edit('/projects/1/tasks/1/completion', { completed: 'on' }, []);
    await edit('/projects/1/tasks/1/completion', {}, ['Match renamed']);
    await edit('/projects/1/tasks/1/due-date', { dueDate: '' }, []);
    await edit('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' }, ['Match renamed']);
    const invalid = await post('/projects/1/due-range', { ...filters, rangeFrom: 'bad' });
    assert.equal(invalid.status, 400);
    assert.deepEqual(titles(await invalid.text()), ['Match renamed']);
    await edit('/projects/1/tasks/1/move', { destination: '2' }, []);
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(titles(await page(filteredPath)), ['Match renamed']);
    assert.deepEqual(titles(await page('/projects/1?search=match')), ['Match renamed', 'MATCH  second', 'Match undated', 'Match created']);
    const reopened = await page('/projects/1');
    assert.match(reopened, /id="task-search" name="search" type="text" value=""/);
    assert.match(reopened, /<form action="\/" method="get"><button type="submit">Projects/);
    assert.deepEqual(titles(await page(filteredPath.replace('search=mAtCh', 'search='))), ['Match renamed']);
    await post('/projects/1/archive');
    html = await page(filteredPath);
    assert.doesNotMatch(form(html, 'task-search'), /disabled/);
    assert.deepEqual(titles(await page('/projects/1?search=second')), ['MATCH  second']);
    assert.match(html, /name="dueDate"[^>]* disabled/);
    assert.match(html, /name="destination" disabled/);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await page(filteredPath), html);
    await post('/projects/1/restore');
    assert.deepEqual(titles(await page(filteredPath)), ['Match renamed']);
    assert.deepEqual(titles(await page('/projects/1?search=match')), ['Match renamed', 'MATCH  second', 'Match undated', 'Match created']);
    const escaped = await page('/projects/1?search=%22%3E%3Cscript%3E');
    assert.match(escaped, /value="&quot;&gt;&lt;script&gt;"/);
    assert.deepEqual(titles(escaped), []);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('delete and restore controls retain intersecting filters, disable deleted edits and survive process restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-deletion-http-'));
  let server;
  try {
    const path = join(directory, 'workboard.sqlite');
    server = await start(path);
    const post = (route, values = {}) => fetch(`${server.url}${route}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const page = async (route) => (await fetch(`${server.url}${route}`)).text();
    const titles = (html) => [...html.matchAll(/data-testid="task-row"[^>]*>\s*<span>(.*?)<\/span>/g)].map((m) => m[1]);
    await post('/projects', { name: 'Source' });
    await post('/projects', { name: 'Destination' });
    await post('/projects/1/tasks', { title: 'Match title' });
    await post('/projects/1/tasks/1/completion', { completed: 'on' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
    await post('/projects/1/tasks/1/notes', { notes: '  café\n<literal>  ' });
    const filters = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-02-29', search: 'mAtCh' };
    const livePath = `/projects/1?${new URLSearchParams(filters)}`;
    const live = await page(livePath);
    assert.match(live, />Delete task<\/button>/);
    const response = await post('/projects/1/tasks/1/delete', filters);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), livePath);
    assert.deepEqual(titles(await page(livePath)), []);
    assert.match(await page('/'), /data-testid="project-summary">0\/0 completed/);
    const deletedFilters = { ...filters, filter: 'Deleted' };
    const deletedPath = `/projects/1?${new URLSearchParams(deletedFilters)}`;
    const deleted = await page(deletedPath);
    assert.deepEqual(titles(deleted), ['Match title']);
    const select = deleted.match(/<select id="task-filter"[^>]*>([\s\S]*?)<\/select>/)[1];
    assert.deepEqual([...select.matchAll(/<option[^>]*>(.*?)<\/option>/g)].map((m) => m[1]), ['All', 'Open', 'Completed', 'Deleted']);
    const row = deleted.match(/<div data-testid="task-row"[\s\S]*?<\/div>/)[0];
    for (const control of row.matchAll(/<(?:input|select|textarea|button)\b[^>]*>/g)) {
      if (control[0].includes('type="hidden"') || control[0] === '<button type="submit">') continue;
      assert.match(control[0], /disabled/);
    }
    assert.match(row, /<button type="submit">Restore task<\/button>/);
    assert.doesNotMatch(row, />Delete task<\/button>/);
    for (const [action, values] of [
      ['rename', { title: 'Changed' }], ['completion', {}], ['priority', { priority: 'Low' }],
      ['due-date', { dueDate: '' }], ['notes', { notes: '' }], ['move', { destination: '2' }],
    ]) assert.equal((await post(`/projects/1/tasks/1/${action}`, values)).status, action === 'move' ? 400 : 404);
    assert.equal(await page(deletedPath), deleted);
    assert.deepEqual(titles(await page(deletedPath.replace('priorityFilter=High', 'priorityFilter=Low'))), []);
    assert.deepEqual(titles(await page(deletedPath.replace('search=mAtCh', 'search=literal'))), []);
    await server.stop();
    server = await start(path);
    assert.equal(await page(deletedPath), deleted);
    await post('/projects/1/archive');
    const archived = await page(deletedPath);
    assert.match(archived, /disabled>Restore task/);
    assert.doesNotMatch(archived.match(/<form[^>]*class="task-filter"[\s\S]*?<\/form>/)[0], /disabled/);
    for (const action of ['delete', 'restore']) {
      assert.equal((await post(`/projects/1/tasks/1/${action}`)).status, 409);
    }
    await post('/projects/1/restore');
    await post('/projects/1/tasks', { title: 'Later' });
    await post('/projects/1/default-priority', { priority: 'Low' });
    const restored = await post('/projects/1/tasks/1/restore', deletedFilters);
    assert.equal(restored.headers.get('location'), deletedPath);
    assert.deepEqual(titles(await page(deletedPath)), []);
    assert.equal(await page(livePath), live.replace('<option>Low</option><option selected>Normal</option>', '<option selected>Low</option><option>Normal</option>'));
    assert.deepEqual(titles(await page('/projects/1')), ['Match title', 'Later']);
    assert.match(await page('/'), /data-testid="project-summary">1\/2 completed/);
    await server.stop();
    server = await start(path);
    assert.deepEqual(titles(await page('/projects/1')), ['Match title', 'Later']);
    assert.deepEqual(titles(await page('/projects/1?filter=Completed')), ['Match title']);
    assert.deepEqual(titles(await page('/projects/1?filter=Open')), ['Later']);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
