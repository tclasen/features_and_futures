import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const port = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Server startup timed out')), 5000);
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = /listening on port (\d+)/.exec(output);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    stop: () => new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM'); })
  };
}

test('due dates validate calendar days, preserve task data, and survive archive and restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-dates-'));
  let server;
  try {
    const dbPath = join(dir, 'workboard.sqlite');
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (name) VALUES ('Alpha'), ('Beta');
      INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing', 1), (2, 'Other', 0);`);
    legacy.close();
    server = await start(dbPath);
    const get = async path => (await fetch(server.url + path)).text();
    const post = (path, values = {}) => fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
    });
    const dateInput = content => /<input id="task-due-date-1"[^>]*>/.exec(content)[0];
    assert.match(dateInput(await get('/projects/1')), /value=""/);
    await post('/projects/1/tasks', { title: 'New' });
    assert.match(await get('/projects/1'), /id="task-due-date-3"[^>]*value=""/);
    const summary = await get('/');
    const save = dueDate => post('/projects/1/tasks/1/due-date', {
      dueDate, filter: 'Completed', priorityFilter: 'Normal'
    });
    for (const value of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29']) {
      const response = await save(` ${value} `);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/projects/1?filter=Completed&priorityFilter=Normal');
      assert.match(dateInput(await get(response.headers.get('location'))), new RegExp(`value="${value}"`));
    }
    for (const value of ['0000-01-01', '10000-01-01', '1900-02-29', '2023-02-29', '2024-04-31', '2024-00-01', '2024-13-01', '2024-01-00', '2024-01-32', '2024-1-01', '2024-01-01T00:00:00Z', 'nonsense']) {
      const response = await save(value);
      assert.equal(response.status, 400, value);
      const content = await response.text();
      assert.match(content, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      assert.match(dateInput(content), /value="2024-02-29"/);
      assert.match(content, /<option selected>Completed/);
      assert.match(content, /<option selected>Normal/);
    }
    assert.equal(await get('/'), summary);
    assert.equal((await post('/projects/2/tasks/1/due-date', { dueDate: '2025-01-01' })).status, 404);
    await post('/projects/1/tasks/1/rename', { title: 'Renamed' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.match(dateInput(archived), /value="2024-02-29" disabled/);
    assert.match(archived, /<button type="submit" disabled>Save due date/);
    assert.equal((await save('2025-01-01')).status, 403);
    await server.stop();
    server = await start(dbPath);
    assert.match(dateInput(await get('/projects/1')), /value="2024-02-29" disabled/);
    await post('/projects/1/restore');
    assert.doesNotMatch(dateInput(await get('/projects/1')), /disabled/);
    const saved = new DatabaseSync(dbPath);
    assert.deepEqual({ ...saved.prepare('SELECT * FROM tasks WHERE id = 1').get() }, {
      id: 1, project_id: 1, title: 'Renamed', completed: 1, priority: 'High', due_date: '2024-02-29', position: 1
    });
    assert.equal(saved.prepare('SELECT due_date FROM tasks WHERE id = 2').get().due_date, '');
    saved.close();
    await save('   ');
    assert.match(dateInput(await get('/projects/1')), /value=""/);
    await server.stop();
    server = await start(dbPath);
    assert.match(dateInput(await get('/projects/1')), /value=""/);
  } finally {
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('project priority defaults migrate, persist independently, and only affect subsequent tasks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-defaults-'));
  let server;
  try {
    const dbPath = join(dir, 'workboard.sqlite');
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (name) VALUES ('Alpha');
      INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing', 1);`);
    legacy.close();
    server = await start(dbPath);
    const get = async path => (await fetch(server.url + path)).text();
    const post = (path, values = {}) => fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
    });
    const defaultSelect = content => /<select id="default-task-priority"[^>]*>([\s\S]*?)<\/select>/.exec(content)[0];
    assert.match(defaultSelect(await get('/projects/1')), /<option selected>Normal<\/option>/);
    await post('/projects', { name: 'Beta' });
    const before = await get('/projects/1?filter=Completed&priorityFilter=Normal');
    const summary = await get('/');
    const response = await post('/projects/1/default-priority', {
      priority: 'High', filter: 'Completed', priorityFilter: 'Normal'
    });
    assert.equal(response.headers.get('location'), '/projects/1?filter=Completed&priorityFilter=Normal');
    const after = await get(response.headers.get('location'));
    assert.equal(after.replace(defaultSelect(after), ''), before.replace(defaultSelect(before), ''));
    assert.equal(await get('/'), summary);
    assert.match(defaultSelect(await get('/projects/2')), /<option selected>Normal<\/option>/);
    await post('/projects/1/tasks', { title: 'Inherited high' });
    await post('/projects/2/tasks', { title: 'Independent normal' });
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Inherited low' });
    await post('/projects/1/tasks/2/rename', { title: 'Renamed high' });
    await post('/projects/1/rename', { name: 'Renamed project' });
    assert.equal((await post('/projects/1/default-priority', { priority: 'Invalid' })).status, 400);
    await post('/projects/1/archive');
    assert.match(defaultSelect(await get('/projects/1')), /disabled>[\s\S]*<option selected>Low<\/option>/);
    assert.equal((await post('/projects/1/default-priority', { priority: 'High' })).status, 403);
    await server.stop();
    server = await start(dbPath);
    assert.match(defaultSelect(await get('/projects/1')), /<option selected>Low<\/option>/);
    await post('/projects/1/restore');
    assert.doesNotMatch(defaultSelect(await get('/projects/1')), /disabled/);
    await post('/projects/1/tasks', { title: 'After restore' });
    const saved = new DatabaseSync(dbPath);
    assert.deepEqual(saved.prepare('SELECT title, completed, priority, project_id FROM tasks ORDER BY id').all().map(row => ({ ...row })), [
      { title: 'Existing', completed: 1, priority: 'Normal', project_id: 1 },
      { title: 'Renamed high', completed: 0, priority: 'High', project_id: 1 },
      { title: 'Independent normal', completed: 0, priority: 'Normal', project_id: 2 },
      { title: 'Inherited low', completed: 0, priority: 'Low', project_id: 1 },
      { title: 'After restore', completed: 0, priority: 'Low', project_id: 1 }
    ]);
    saved.close();
    assert.match(await get('/'), /1\/4 completed/);
  } finally {
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('combined filters preserve selections, re-evaluate edits, and work in archives', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-filters-'));
  let server;
  try {
    const dbPath = join(dir, 'workboard.sqlite');
    server = await start(dbPath);
    const get = async path => (await fetch(server.url + path)).text();
    const post = (path, values = {}) => fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
    });
    const titles = content => [...content.matchAll(/data-testid="task-row">\s*<span>(.*?)<\/span>/g)].map(match => match[1]);
    await post('/projects', { name: 'Alpha' });
    for (const title of ['First', 'Second', 'Third', 'Fourth']) {
      await post('/projects/1/tasks', { title });
    }
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/2/priority', { priority: 'Low' });
    await post('/projects/1/tasks/4/priority', { priority: 'High' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const expected = {
      All: { All: ['First', 'Second', 'Third', 'Fourth'], Low: ['Second'], Normal: ['Third'], High: ['First', 'Fourth'] },
      Open: { All: ['Second', 'Third', 'Fourth'], Low: ['Second'], Normal: ['Third'], High: ['Fourth'] },
      Completed: { All: ['First'], Low: [], Normal: [], High: ['First'] }
    };
    for (const filter of ['All', 'Open', 'Completed']) {
      for (const priorityFilter of ['All', 'Low', 'Normal', 'High']) {
        const content = await get(`/projects/1?filter=${filter}&priorityFilter=${priorityFilter}`);
        assert.deepEqual(titles(content), expected[filter][priorityFilter]);
        const selects = [...content.matchAll(/<select id="(?:task-filter|priority-filter)"[^>]*>([\s\S]*?)<\/select>/g)];
        assert.match(selects[0][1], new RegExp(`<option selected>${filter}</option>`));
        assert.match(selects[1][1], new RegExp(`<option selected>${priorityFilter}</option>`));
      }
    }
    const values = { filter: 'Open', priorityFilter: 'High' };
    let response = await post('/projects/1/tasks/4/rename', { ...values, title: ' Renamed ' });
    assert.equal(response.headers.get('location'), '/projects/1?filter=Open&priorityFilter=High');
    assert.deepEqual(titles(await get(response.headers.get('location'))), ['Renamed']);
    response = await post('/projects/1/tasks/4/rename', { ...values, title: ' ' });
    assert.equal(response.status, 400);
    assert.match(await response.text(), /<option selected>High<\/option>/);
    const summaryBefore = await get('/');
    response = await post('/projects/1/tasks/4/priority', { ...values, priority: 'Low' });
    assert.deepEqual(titles(await get(response.headers.get('location'))), []);
    assert.equal(await get('/'), summaryBefore);
    response = await post('/projects/1/tasks/1', { filter: 'Completed', priorityFilter: 'High' });
    assert.equal(response.headers.get('location'), '/projects/1?filter=Completed&priorityFilter=High');
    assert.deepEqual(titles(await get(response.headers.get('location'))), []);
    assert.match(await get('/'), /0\/4 completed/);
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual(titles(await get('/projects/1?filter=Open&priorityFilter=Low')), ['Second', 'Renamed']);
    assert.match(await get('/projects/1'), /<option selected>All<\/option>/);
    await post('/projects/1/archive');
    const archived = await get('/projects/1?filter=Open&priorityFilter=Low');
    assert.deepEqual(titles(archived), ['Second', 'Renamed']);
    assert.match(archived, /<select id="task-priority-4"[^>]* disabled>/);
    assert.doesNotMatch(archived, /<select id="(?:task-filter|priority-filter)"[^>]* disabled/);
    await post('/projects/1/restore');
    assert.deepEqual(titles(await get('/projects/1?filter=Open&priorityFilter=Low')), ['Second', 'Renamed']);
  } finally {
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('priorities migrate, stay independent, survive renaming and restart, and respect archives', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  let server;
  try {
    const dbPath = join(dir, 'workboard.sqlite');
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (name) VALUES ('Alpha');
      INSERT INTO tasks (project_id, title, completed) VALUES (1, 'First', 1);`);
    legacy.close();
    server = await start(dbPath);
    const get = async path => (await fetch(server.url + path)).text();
    const post = (path, values = {}) => fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
    });
    const priority = (content, id) => content.match(new RegExp(`<select id="task-priority-${id}"[^>]*>([\\s\\S]*?)</select>`))[1].trim();
    const normal = '<option>Low</option><option selected>Normal</option><option>High</option>';
    assert.equal(priority(await get('/projects/1'), 1), normal);
    await post('/projects/1/tasks', { title: 'Second' });
    await post('/projects', { name: 'Beta' });
    await post('/projects/2/tasks', { title: 'Other' });
    assert.equal(priority(await get('/projects/1'), 2), normal);
    const list = await get('/');
    const changed = await post('/projects/1/tasks/1/priority', { priority: 'High', filter: 'Completed' });
    assert.equal(changed.status, 303);
    assert.equal(changed.headers.get('location'), '/projects/1?filter=Completed');
    await post('/projects/1/tasks/2/priority', { priority: 'Low' });
    assert.equal((await post('/projects/2/tasks/1/priority', { priority: 'Low' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/priority', { priority: 'Low' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Urgent' })).status, 400);
    await post('/projects/1/tasks/1/rename', { title: 'Renamed' });
    const detail = await get('/projects/1');
    assert.equal(priority(detail, 1), '<option>Low</option><option>Normal</option><option selected>High</option>');
    assert.equal(priority(detail, 2), '<option selected>Low</option><option>Normal</option><option>High</option>');
    assert.equal(priority(await get('/projects/2'), 3), normal);
    assert.ok(detail.indexOf('<span>Renamed') < detail.indexOf('<span>Second'));
    assert.match(detail, /aria-label="Complete Renamed" checked/);
    assert.doesNotMatch(await get('/projects/1?filter=Open'), /Renamed/);
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /Second/);
    assert.equal(await get('/'), list);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), detail);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.equal((archived.match(/<select id="task-priority-\d+"[^>]* disabled>/g) || []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Low' })).status, 403);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), detail);
    assert.equal(await get('/'), list);
    await post('/projects/1/tasks/1/priority', { priority: 'Normal' });
    assert.equal(priority(await get('/projects/1'), 1), normal);
  } finally {
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('task renaming preserves order, ownership, completion, filters and persistence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  let server;
  try {
    const dbPath = join(dir, 'workboard.sqlite');
    server = await start(dbPath);
    const get = async path => (await fetch(server.url + path)).text();
    const post = (path, values = {}) => fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
    });
    await post('/projects', { name: 'Alpha' });
    await post('/projects', { name: 'Beta' });
    await post('/projects/1/tasks', { title: 'First' });
    await post('/projects/1/tasks', { title: 'Second' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const invalid = await post('/projects/1/tasks/1/rename', { title: ' \t ', filter: 'Completed' });
    assert.equal(invalid.status, 400);
    assert.match(await invalid.text(), /role="alert">Task title is required/);
    assert.match(await get('/projects/1'), /<span>First<\/span>/);
    assert.equal((await post('/projects/2/tasks/1/rename', { title: 'Wrong owner' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/rename', { title: 'Missing' })).status, 404);
    const renamed = await post('/projects/1/tasks/1/rename', { title: '  Revised <task>  ', filter: 'Completed' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const detail = await get('/projects/1');
    assert.match(detail, /<span>Revised &lt;task&gt;<\/span>/);
    assert.match(detail, /aria-label="Complete Revised &lt;task&gt;" checked/);
    assert.ok(detail.indexOf('Revised') < detail.indexOf('Second'));
    assert.match(detail, /<label for="new-task-title-1">New task title<\/label>/);
    assert.doesNotMatch(await get('/projects/1?filter=Open'), /Revised/);
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /Second/);
    assert.doesNotMatch(await get('/projects/2'), /Revised/);
    const list = await get('/');
    assert.match(list, /data-testid="project-summary">1\/2 completed/);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), detail);
    assert.equal(await get('/'), list);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.equal((archived.match(/name="title" type="text" disabled/g) || []).length, 2);
    assert.equal((archived.match(/disabled>Rename task/g) || []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Forbidden' })).status, 403);
    await post('/projects/1/restore');
    assert.doesNotMatch(await get('/projects/1'), / disabled/);
    await post('/projects/1/tasks/2/rename', { title: '  Revised open task  ', filter: 'Open' });
    assert.match(await get('/projects/1?filter=Open'), /Revised open task/);
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /Revised open task/);
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    await server.stop();
    server = await start(dbPath);
    assert.match(await get('/projects/1'), /Revised open task/);
    assert.match(await get('/projects/1'), /aria-label="Complete Revised &lt;task&gt;" checked/);
  } finally {
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('renaming validates, preserves identity and tasks, persists, and requires an active project', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  let server;
  try {
    const dbPath = join(dir, 'workboard.sqlite');
    server = await start(dbPath);
    const get = async path => (await fetch(server.url + path)).text();
    const post = (path, values = {}) => fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
    });
    await post('/projects', { name: 'Alpha' });
    await post('/projects', { name: 'Beta' });
    await post('/projects/1/tasks', { title: 'First' });
    await post('/projects/1/tasks', { title: 'Second' });
    await post('/projects/1/tasks/1', { completed: '1' });
    assert.match(await get('/projects/1'), /<label for="new-project-name">New project name<\/label>/);
    const invalid = await post('/projects/1/rename', { name: ' \t ' });
    assert.equal(invalid.status, 400);
    assert.match(await invalid.text(), /role="alert">Project name is required/);
    assert.match(await get('/projects/1'), /<h1>Alpha<\/h1>/);
    const renamed = await post('/projects/1/rename', { name: '  Renamed <project>  ', filter: 'Completed' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const detail = await get('/projects/1');
    assert.match(detail, /<h1>Renamed &lt;project&gt;<\/h1>/);
    assert.match(detail, /aria-label="Complete First" checked/);
    assert.match(detail, /Second/);
    const list = await get('/');
    assert.ok(list.indexOf('Renamed') < list.indexOf('Beta'));
    assert.match(list, /data-testid="project-summary">1\/2 completed/);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), detail);
    assert.equal(await get('/'), list);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.match(archived, /id="new-project-name" name="name" type="text" disabled/);
    assert.match(archived, /<button type="submit" disabled>Rename project/);
    assert.equal((await post('/projects/1/rename', { name: 'Forbidden' })).status, 403);
    assert.match(await get('/?filter=Archived'), /Renamed &lt;project&gt;/);
    await post('/projects/1/restore');
    assert.doesNotMatch(await get('/projects/1'), / disabled/);
    await post('/projects/1/rename', { name: 'Restored' });
    assert.match(await get('/projects/1'), /<h1>Restored<\/h1>/);
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    assert.equal((await post('/projects/99999/rename', { name: 'Missing' })).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('archives migrate existing projects, preserve tasks and summaries, and block changes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  let server;
  try {
    const dbPath = join(dir, 'workboard.sqlite');
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      INSERT INTO projects (name) VALUES ('Alpha');`);
    legacy.close();
    server = await start(dbPath);
    const get = async path => (await fetch(server.url + path)).text();
    const post = (path, values = {}) => fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
    });
    assert.match(await get('/'), /<option selected>Active<\/option>/);
    assert.match(await get('/'), /data-testid="project-summary">0\/0 completed/);
    await post('/projects', { name: 'Beta' });
    await post('/projects/1/tasks', { title: 'First' });
    await post('/projects/1/tasks', { title: 'Second' });
    await post('/projects/1/tasks/1', { completed: '1' });
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    assert.equal((await post('/projects/1/archive')).status, 303);
    assert.doesNotMatch(await get('/'), /Alpha/);
    let archived = await get('/?filter=Archived');
    assert.match(archived, /Alpha/);
    assert.doesNotMatch(archived, /Beta/);
    assert.match(archived, /Restore project/);
    assert.match(archived, /Open project/);
    assert.match(archived, /data-testid="project-summary">1\/2 completed/);
    let detail = await get('/projects/1');
    assert.match(detail, /Archived project/);
    assert.match(detail, /<button type="submit" disabled>Create task/);
    assert.equal((detail.match(/ disabled onchange/g) || []).length, 2);
    assert.match(await get('/projects/1?filter=Completed'), /First/);
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /Second/);
    assert.doesNotMatch(await get('/projects/1?filter=Open'), /First/);
    assert.equal((await post('/projects/1/tasks', { title: 'Forbidden' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1')).status, 403);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/?filter=Archived'), archived);
    assert.equal(await get('/projects/1'), detail);
    await post('/projects/1/restore');
    const active = await get('/');
    assert.ok(active.indexOf('Alpha') < active.indexOf('Beta'));
    assert.match(active, /data-testid="project-summary">1\/2 completed/);
    assert.doesNotMatch(await get('/?filter=Archived'), /data-testid="project-row"/);
    detail = await get('/projects/1');
    assert.doesNotMatch(detail, /Archived project| disabled/);
    assert.match(detail, /aria-label="Complete First" checked/);
    await post('/projects/1/tasks/1');
    assert.match(await get('/'), /data-testid="project-summary">0\/2 completed/);
    await server.stop();
    server = await start(dbPath);
    assert.match(await get('/'), /Alpha/);
    assert.match(await get('/'), /data-testid="project-summary">0\/2 completed/);
  } finally {
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('tasks validate, filter, stay project-scoped and persist completion across restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  let server;
  try {
    const dbPath = join(dir, 'workboard.sqlite');
    server = await start(dbPath);
    const get = async path => (await fetch(server.url + path)).text();
    const post = (path, values) => fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
    });
    await post('/projects', { name: 'Alpha' });
    await post('/projects', { name: 'Beta' });
    let content = await get('/projects/1');
    assert.match(content, /<label for="task-title">Task title<\/label>/);
    assert.match(content, /<option selected>All<\/option>/);
    const invalid = await post('/projects/1/tasks', { title: ' \t ' });
    assert.match(await invalid.text(), /role="alert">Task title is required/);
    assert.doesNotMatch(await get('/projects/1'), /data-testid="task-row"/);
    await post('/projects/1/tasks', { title: '  First <task>  ' });
    await post('/projects/1/tasks', { title: 'Second' });
    await post('/projects/2/tasks', { title: 'Other project' });
    content = await get('/projects/1');
    assert.equal((content.match(/data-testid="task-row"/g) || []).length, 2);
    assert.match(content, /<span>First &lt;task&gt;<\/span>/);
    assert.match(content, /aria-label="Complete First &lt;task&gt;"/);
    assert.ok(content.indexOf('First') < content.indexOf('Second'));
    assert.doesNotMatch(content, /Other project/);
    assert.doesNotMatch(content, /" checked/);
    await post('/projects/1/tasks/1', { completed: '1' });
    content = await get('/projects/1');
    assert.match(content, /aria-label="Complete First &lt;task&gt;" checked/);
    const open = await get('/projects/1?filter=Open');
    assert.doesNotMatch(open, /First/);
    assert.match(open, /Second/);
    const completed = await get('/projects/1?filter=Completed');
    assert.match(completed, /First/);
    assert.doesNotMatch(completed, /Second/);
    assert.match(completed, /<option selected>Completed<\/option>/);
    assert.equal((await post('/projects/2/tasks/1', {})).status, 404);
    assert.doesNotMatch(await get('/projects/2'), /First|Second/);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), content);
    assert.equal(await get('/projects/1?filter=Completed'), completed);
    await post('/projects/1/tasks/1', {});
    assert.doesNotMatch(await get('/projects/1'), /" checked/);
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /data-testid="task-row"/);
  } finally {
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('projects validate, render safely, keep creation order and survive restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let server;
  try {
    const dbPath = join(dir, 'nested', 'projects.sqlite');
    server = await start(dbPath);
    const get = path => fetch(server.url + path);
    const create = name => fetch(server.url + '/projects', {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual'
    });
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    let content = await (await get('/')).text();
    assert.match(content, /<h1>Workboard<\/h1>/);
    assert.match(content, /<label for="project-name">Project name<\/label>/);
    assert.doesNotMatch(content, /data-testid="project-row"/);
    const invalid = await create(' \t ');
    assert.match(await invalid.text(), /role="alert">Project name is required/);
    assert.doesNotMatch(await (await get('/')).text(), /data-testid="project-row"/);
    assert.equal((await create('  Alpha <script>  ')).status, 303);
    assert.equal((await create('Beta')).status, 303);
    content = await (await get('/')).text();
    assert.equal((content.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(content, /<span>Alpha &lt;script&gt;<\/span>/);
    assert.ok(content.indexOf('Alpha') < content.indexOf('Beta'));
    const paths = [...content.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    const detail = await (await get(paths[0])).text();
    assert.match(detail, /<h1>Alpha &lt;script&gt;<\/h1>/);
    assert.match(detail, /action="\/".*<button type="submit">Projects<\/button>/);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await (await get('/')).text(), content);
    assert.equal(await (await get(paths[0])).text(), detail);
    assert.equal((await get('/projects/99999')).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
