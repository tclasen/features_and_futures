import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { runInNewContext } from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

test('archive migration, summaries, read-only tasks, restore and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const dbPath = join(directory, 'workboard.sqlite');
  // Model a database from the previous checkpoint.
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    INSERT INTO projects (name) VALUES ('Existing project');`);
  legacy.close();
  let server;
  try {
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual'
    });
    const get = path => fetch(`${server.base}${path}`).then(res => res.text());
    let active = await get('/');
    assert.match(active, /<label for="project-filter">Project filter<\/label>/);
    assert.match(active, /<option selected>Active<\/option>/);
    assert.match(active, /data-testid="project-summary">0\/0 completed/);
    await post('/projects', { name: 'Second project' });
    await post('/projects/1/tasks', { title: 'First task' });
    await post('/projects/1/tasks', { title: 'Second task' });
    await post('/projects/1/tasks/1/completion', { completed: 'true' });
    active = await get('/');
    assert.match(active, /data-testid="project-summary">1\/2 completed/);
    assert.match(active, /data-testid="project-summary">0\/0 completed/);
    assert.equal((await post('/projects/1/archive')).status, 303);
    assert.doesNotMatch(await get('/'), /Existing project/);
    let archived = await get('/?filter=Archived');
    assert.match(archived, /<option selected>Archived<\/option>/);
    assert.match(archived, /Existing project/);
    assert.match(archived, /data-testid="project-summary">1\/2 completed/);
    assert.match(archived, />Open project<\/button>/);
    assert.match(archived, />Restore project<\/button>/);
    assert.doesNotMatch(archived, /Second project|>Archive project<\/button>/);
    let detail = await get('/projects/1');
    assert.match(detail, /Archived project/);
    assert.match(detail, /<button type="submit" disabled>Create task/);
    assert.match(detail, /tasks\/1\/completion" checked disabled/);
    assert.match(detail, /tasks\/2\/completion" disabled/);
    // The same client filter continues to operate on disabled checkboxes.
    const filter = { value: 'All', addEventListener(type, handler) { this.change = handler; } };
    const rows = [true, false].map(checked => ({
      checkbox: { checked, disabled: true, addEventListener() {} },
      querySelector(selector) { return selector === 'span' ? { textContent: 'Task' } : selector === '[data-saved-date]' ? { dataset: { savedDate: '' } } : selector === '[data-priority-url]' ? { value: 'Normal' } : this.checkbox; }, hidden: false
    }));
    runInNewContext(detail.match(/<script>([\s\S]*?)function bindTaskRows/)[1], {
      document: {
        getElementById: id => id === 'task-filter' ? filter : { value: 'All', addEventListener() {} },
        querySelectorAll: selector => selector === '[data-testid="task-row"]' ? rows : rows.map(row => row.checkbox)
      }
    });
    for (const [value, expected] of [['All', [false, false]], ['Open', [true, false]], ['Completed', [false, true]]]) {
      filter.value = value;
      filter.change();
      assert.deepEqual(rows.map(row => row.hidden), expected);
      assert.ok(rows.every(row => row.checkbox.disabled));
    }
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked task' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1/completion', { completed: 'false' })).status, 403);
    assert.equal(await get('/projects/1'), detail);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/?filter=Archived'), archived);
    assert.equal(await get('/projects/1'), detail);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.doesNotMatch(await get('/?filter=Archived'), /data-testid="project-row"/);
    active = await get('/');
    assert.ok(active.indexOf('Existing project') < active.indexOf('Second project'));
    assert.match(active, /data-testid="project-summary">1\/2 completed/);
    detail = await get('/projects/1');
    assert.doesNotMatch(detail, /Archived project| disabled/);
    assert.match(detail, /tasks\/1\/completion" checked/);
    assert.equal((await post('/projects/1/tasks/2/completion', { completed: 'true' })).status, 204);
    assert.match(await get('/'), /data-testid="project-summary">2\/2 completed/);
    await server.stop();
    server = await start(dbPath);
    assert.match(await get('/'), /data-testid="project-summary">2\/2 completed/);
    assert.doesNotMatch(await get('/projects/1'), /Archived project| disabled/);
    assert.equal((await post('/projects/9999/archive')).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('rename preserves identity, ordering, tasks and persistence; archived names are protected', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual'
    });
    const get = path => fetch(`${server.base}${path}`).then(res => res.text());
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second project' });
    await post('/projects/1/tasks', { title: 'Saved task' });
    await post('/projects/1/tasks/1/completion', { completed: 'true' });
    const original = await get('/projects/1');
    assert.match(original, /<label for="new-project-name">New project name<\/label>/);
    assert.match(original, /<button type="submit">Rename project<\/button>/);
    for (const name of ['', ' \t ']) {
      const response = await post('/projects/1/rename', { name });
      assert.equal(response.status, 422);
      assert.match(await response.text(), /role="alert"[^>]*>Project name is required/);
      assert.equal(await get('/projects/1'), original);
    }
    const response = await post('/projects/1/rename', { name: '  Renamed <&>  ' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1');
    const renamed = await get('/projects/1');
    assert.match(renamed, /<h1>Renamed &lt;&amp;&gt;<\/h1>/);
    assert.match(renamed, /tasks\/1\/completion" checked/);
    assert.match(renamed, /<span>Saved task<\/span>/);
    const list = await get('/');
    assert.ok(list.indexOf('Renamed &lt;&amp;&gt;') < list.indexOf('Second project'));
    assert.match(list, /data-testid="project-summary">1\/1 completed/);
    assert.match(list, /action="\/projects\/1"/);
    assert.doesNotMatch(list, /Original/);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), renamed);
    assert.equal(await get('/'), list);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.match(archived, /id="new-project-name"[^>]* disabled/);
    assert.match(archived, /<button type="submit" disabled>Rename project/);
    assert.equal((await post('/projects/1/rename', { name: 'Blocked' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), renamed);
    assert.equal((await post('/projects/1/rename', { name: 'Restored name' })).status, 303);
    await server.stop();
    server = await start(dbPath);
    assert.match(await get('/projects/1'), /<h1>Restored name<\/h1>/);
    assert.match(await get('/projects/1'), /tasks\/1\/completion" checked/);
    assert.match(await get('/'), /data-testid="project-summary">1\/1 completed/);
    assert.equal((await post('/projects/9999/rename', { name: 'Missing' })).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task rename preserves ownership, order, completion, filtering and persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual'
    });
    const get = path => fetch(`${server.base}${path}`).then(res => res.text());
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Original' });
    await post('/projects/1/tasks', { title: 'Later task' });
    await post('/projects/1/tasks/1/completion', { completed: 'true' });
    const original = await get('/projects/1');
    assert.match(original, /<label for="new-task-title-1">New task title<\/label>/);
    assert.match(original, />Rename task<\/button>/);
    for (const title of ['', ' \t ']) {
      const response = await post('/projects/1/tasks/1/rename', { title });
      assert.equal(response.status, 422);
      assert.match(await response.text(), /role="alert"[^>]*>Task title is required/);
      assert.equal(await get('/projects/1'), original);
    }
    assert.equal((await post('/projects/2/tasks/1/rename', { title: 'Wrong owner' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/rename', { title: 'Missing' })).status, 404);
    const response = await post('/projects/1/tasks/1/rename', { title: '  Renamed <&>  ' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1');
    const renamed = await get('/projects/1');
    assert.match(renamed, /<span>Renamed &lt;&amp;&gt;<\/span>/);
    assert.match(renamed, /aria-label="Complete Renamed &lt;&amp;&gt;"/);
    assert.match(renamed, /tasks\/1\/completion" checked/);
    assert.ok(renamed.indexOf('<span>Renamed') < renamed.indexOf('<span>Later task'));
    assert.doesNotMatch(await get('/projects/2'), /Renamed/);
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);

    // Run the rename script against a small DOM: the row, checkbox and filter stay intact.
    const input = { value: '  Browser title  ' };
    const button = { disabled: false };
    const span = { textContent: 'Original' };
    const checkbox = { checked: true, setAttribute(name, value) { this[name] = value; } };
    const row = { hidden: false, querySelector: selector => selector === 'span' ? span : checkbox };
    const form = {
      elements: { title: input }, action: '/projects/1/tasks/1/rename',
      querySelector: () => button, closest: () => row,
      addEventListener(type, handler) { this.submit = handler; }
    };
    const alert = { textContent: '' };
    let saves = 0;
    let saveOk = true;
    const scripts = [...renamed.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    runInNewContext(scripts[0][1].split("      document.querySelectorAll('[data-task-rename]')")[1].split("      document.querySelectorAll('[data-priority-url]')")[0].replace(/^/, "document.querySelectorAll('[data-task-rename]')"), {
      URLSearchParams,
      document: { querySelectorAll: () => [form], getElementById: () => alert },
      fetch: async (path, options) => {
        saves++;
        assert.equal(path, form.action);
        assert.equal(options.body.get('title'), 'Browser title');
        return { ok: saveOk };
      }
    });
    await form.submit({ preventDefault() {} });
    assert.equal(span.textContent, 'Browser title');
    assert.equal(checkbox['aria-label'], 'Complete Browser title');
    assert.equal(checkbox.checked, true);
    assert.equal(row.hidden, false);
    assert.equal(input.value, 'Browser title');
    assert.equal(button.disabled, false);
    input.value = ' \t ';
    await form.submit({ preventDefault() {} });
    assert.equal(saves, 1);
    assert.equal(alert.textContent, 'Task title is required');
    input.value = 'Browser title';
    saveOk = false;
    await form.submit({ preventDefault() {} });
    assert.match(alert.textContent, /Could not rename task/);
    assert.equal(button.disabled, false);

    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), renamed);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.match(archived, /id="new-task-title-1"[^>]* disabled/);
    assert.match(archived, /id="new-task-title-2"[^>]* disabled/);
    assert.equal((archived.match(/<button type="submit" disabled>Rename task/g) || []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Blocked' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), renamed);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Restored title' })).status, 303);
    await server.stop();
    server = await start(dbPath);
    assert.match(await get('/projects/1'), /aria-label="Complete Restored title"/);
    assert.match(await get('/projects/1'), /tasks\/1\/completion" checked/);
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('priorities migrate, save independently, survive rename/restart and respect archives', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  const dbPath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('First'), ('Second');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Legacy', 1);`);
  legacy.close();
  let server;
  try {
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual'
    });
    const get = path => fetch(`${server.base}${path}`).then(res => res.text());
    const priorityOptions = (html, id) => html.match(new RegExp(`<select id="task-priority-${id}"[^>]*>([\\s\\S]*?)</select>`))[1].trim();
    const normal = '<option>Low</option><option selected>Normal</option><option>High</option>';
    assert.equal(priorityOptions(await get('/projects/1'), 1), normal);
    await post('/projects/1/tasks', { title: 'New task' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    assert.equal(priorityOptions(await get('/projects/1'), 2), normal);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'High' })).status, 204);
    assert.equal((await post('/projects/1/tasks/2/priority', { priority: 'Low' })).status, 204);
    for (const priority of ['', 'Urgent', 'high']) {
      assert.equal((await post('/projects/1/tasks/1/priority', { priority })).status, 400);
    }
    assert.equal((await post('/projects/2/tasks/1/priority', { priority: 'Low' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/priority', { priority: 'Low' })).status, 404);
    await post('/projects/1/tasks/1/rename', { title: 'Renamed' });
    let detail = await get('/projects/1');
    assert.equal(priorityOptions(detail, 1), '<option>Low</option><option>Normal</option><option selected>High</option>');
    assert.equal(priorityOptions(detail, 2), '<option selected>Low</option><option>Normal</option><option>High</option>');
    assert.equal(priorityOptions(await get('/projects/2'), 3), normal);
    assert.match(detail, /aria-label="Complete Renamed"/);
    assert.match(detail, /tasks\/1\/completion" checked/);
    assert.ok(detail.indexOf('<span>Renamed') < detail.indexOf('<span>New task'));
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);

    // Exercise the browser save and error rollback without altering the row/filter.
    const select = {
      value: 'Low', disabled: false,
      dataset: { priorityUrl: '/projects/1/tasks/1/priority', savedPriority: 'High' },
      addEventListener(type, handler) { this.change = handler; }
    };
    const alert = { textContent: '' };
    let ok = true;
    const scripts = [...detail.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    runInNewContext(scripts[0][1].split("      document.querySelectorAll('[data-priority-url]')")[1].split("      document.querySelectorAll('[data-task-due-date]')")[0].replace(/^/, "document.querySelectorAll('[data-priority-url]')"), {
      URLSearchParams,
      applyFilter() {},
      document: { querySelectorAll: () => [select], getElementById: () => alert },
      fetch: async (path, options) => {
        assert.equal(path, select.dataset.priorityUrl);
        assert.equal(options.body.get('priority'), select.value);
        assert.equal(select.disabled, true);
        return { ok };
      }
    });
    await select.change();
    assert.equal(select.dataset.savedPriority, 'Low');
    assert.equal(select.disabled, false);
    ok = false;
    select.value = 'Normal';
    await select.change();
    assert.equal(select.value, 'Low');
    assert.equal(select.disabled, false);
    assert.match(alert.textContent, /Could not save task priority/);

    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), detail);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.equal((archived.match(/<select id="task-priority-\d+"[^>]* disabled>/g) || []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Normal' })).status, 403);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), detail);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Normal' })).status, 204);
    await server.stop();
    server = await start(dbPath);
    assert.equal(priorityOptions(await get('/projects/1'), 1), normal);
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project defaults migrate, stay independent and persist without changing existing tasks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-defaults-'));
  const dbPath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    INSERT INTO projects (name) VALUES ('Legacy');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing', 1);`);
  legacy.close();
  let server;
  try {
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual'
    });
    const get = path => fetch(`${server.base}${path}`).then(res => res.text());
    const defaultSelect = html => html.match(/<select id="default-task-priority"[^>]*>[\s\S]*?<\/select>/)[0];
    const priorities = html => [...html.matchAll(/data-priority-url="[^"]+" data-saved-priority="([^"]+)"/g)].map(match => match[1]);
    assert.match(defaultSelect(await get('/projects/1')), /<option>Low<\/option>\s*<option selected>Normal<\/option>\s*<option>High<\/option>/);
    await post('/projects', { name: 'Independent' });
    assert.equal((await post('/projects/1/default-priority', { priority: 'High' })).status, 204);
    await post('/projects/1/tasks', { title: 'Inherited high' });
    await post('/projects/2/tasks', { title: 'Independent normal' });
    assert.deepEqual(priorities(await get('/projects/1')), ['Normal', 'High']);
    assert.deepEqual(priorities(await get('/projects/2')), ['Normal']);
    assert.equal((await post('/projects/1/default-priority', { priority: 'Low' })).status, 204);
    await post('/projects/1/tasks', { title: 'Inherited low' });
    await post('/projects/1/tasks/2/rename', { title: 'Renamed high' });
    await post('/projects/1/rename', { name: 'Renamed project' });
    let detail = await get('/projects/1');
    assert.deepEqual(priorities(detail), ['Normal', 'High', 'Low']);
    assert.match(detail, /tasks\/1\/completion" checked/);
    assert.match(await get('/'), /project-summary">1\/3 completed/);
    for (const priority of ['', 'Urgent', 'normal']) {
      assert.equal((await post('/projects/1/default-priority', { priority })).status, 400);
      assert.equal(await get('/projects/1'), detail);
    }
    assert.equal((await post('/projects/999/default-priority', { priority: 'High' })).status, 404);
    await post('/projects/1/archive');
    detail = await get('/projects/1');
    assert.match(defaultSelect(detail), / disabled>/);
    assert.match(defaultSelect(detail), /<option selected>Low/);
    assert.equal((await post('/projects/1/default-priority', { priority: 'High' })).status, 403);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), detail);
    await post('/projects/1/restore');
    assert.doesNotMatch(defaultSelect(await get('/projects/1')), / disabled/);
    await post('/projects/1/tasks', { title: 'Restored low' });
    assert.deepEqual(priorities(await get('/projects/1')), ['Normal', 'High', 'Low', 'Low']);
    await server.stop();
    server = await start(dbPath);
    assert.match(defaultSelect(await get('/projects/1')), /<option selected>Low/);
    assert.deepEqual(priorities(await get('/projects/1')), ['Normal', 'High', 'Low', 'Low']);
    assert.deepEqual(priorities(await get('/projects/2')), ['Normal']);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const base = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Startup timed out: ${errors}`));
    }, 5000);
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Server exited ${code}: ${errors}`));
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
    base,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  };
}

test('project validation, ordering, navigation, escaping and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const dbPath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const health = await fetch(`${server.base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const getList = () => fetch(`${server.base}/`).then(response => response.text());
    const create = name => fetch(`${server.base}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual'
    });
    let list = await getList();
    assert.match(list, /<h1>Workboard<\/h1>/);
    assert.match(list, /<label for="project-name">Project name<\/label>/);
    assert.match(list, />Create project<\/button>/);
    assert.doesNotMatch(list, /data-testid="project-row"/);
    for (const name of ['', '  \t  ']) {
      const response = await create(name);
      assert.equal(response.status, 422);
      assert.match(await response.text(), /role="alert">Project name is required/);
    }
    assert.doesNotMatch(await getList(), /data-testid="project-row"/);
    for (const name of ['  First project  ', '<Second & project>']) {
      const response = await create(name);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    list = await getList();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(list, /<span>First project<\/span>/);
    assert.match(list, /<span>&lt;Second &amp; project&gt;<\/span>/);
    assert.ok(list.indexOf('First project') < list.indexOf('&lt;Second'));
    const paths = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    const detail = await fetch(`${server.base}${paths[0]}`).then(response => response.text());
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/" method="get"><button type="submit">Projects<\/button>/);
    assert.equal((await fetch(`${server.base}/projects/99999`)).status, 404);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await getList(), list);
    assert.equal(await fetch(`${server.base}${paths[0]}`).then(response => response.text()), detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project-scoped tasks, validation, completion, filtering and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  let server;
  try {
    const dbPath = join(directory, 'workboard.sqlite');
    server = await start(dbPath);
    const post = (path, fields) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual'
    });
    const detail = id => fetch(`${server.base}/projects/${id}`).then(res => res.text());
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    for (const title of ['', ' \t ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 422);
      assert.match(await response.text(), /role="alert"[^>]*>Task title is required/);
    }
    assert.doesNotMatch(await detail(1), /data-testid="task-row">/);
    for (const title of ['  Alpha  ', '<Beta & "quoted">']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/projects/1');
    }
    await post('/projects/2/tasks', { title: 'Other task' });
    let content = await detail(1);
    assert.equal((content.match(/data-testid="task-row">/g) || []).length, 2);
    assert.match(content, /<span>Alpha<\/span>/);
    assert.match(content, /aria-label="Complete &lt;Beta &amp; &quot;quoted&quot;&gt;"/);
    assert.ok(content.indexOf('<span>Alpha') < content.indexOf('<span>&lt;Beta'));
    assert.doesNotMatch(content, /Other task/);
    assert.doesNotMatch(await detail(2), /Complete Alpha/);
    assert.doesNotMatch(content, / checked/);
    assert.match(content, /<label for="task-title">Task title<\/label>/);
    assert.match(content, /<label for="task-filter">Task filter<\/label>/);
    assert.match(content, /<option>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    assert.equal((await post('/projects/2/tasks/1/completion', { completed: 'true' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1/completion', { completed: 'invalid' })).status, 400);
    assert.equal((await post('/projects/1/tasks/1/completion', { completed: 'true' })).status, 204);
    content = await detail(1);
    assert.match(content, /tasks\/1\/completion" checked/);

    // Execute the browser script with a minimal DOM to check filtering and saves.
    const filter = { value: 'All', addEventListener(type, handler) { this.change = handler; } };
    const priorityFilter = { value: 'All', addEventListener(type, handler) { this.change = handler; } };
    const alert = { textContent: '' };
    const rows = [true, false].map((checked, index) => {
      const checkbox = {
        checked, dataset: { completionUrl: `/projects/1/tasks/${index + 1}/completion` },
        addEventListener(type, handler) { this.change = handler; }
      };
      return { checkbox, querySelector(selector) { return selector === 'span' ? { textContent: 'Task' } : selector === '[data-saved-date]' ? { dataset: { savedDate: '' } } : selector === '[data-priority-url]' ? { value: 'Normal' } : checkbox; }, hidden: false };
    });
    let saveOk = true;
    const client = content.match(/<script>([\s\S]*?)<\/script>/)[1];
    runInNewContext(client.split('      function bindTaskRows() {')[0] + client.split('      function bindTaskRows() {')[1].split("      document.querySelectorAll('[data-task-rename]')")[0], {
      URLSearchParams,
      document: {
        getElementById: id => id === 'task-filter' ? filter : id === 'priority-filter' ? priorityFilter : id === 'task-error' ? alert : { value: '', addEventListener() {} },
        querySelectorAll: selector => selector === '[data-testid="task-row"]' ? rows : rows.map(row => row.checkbox)
      },
      fetch: async (path, options) => {
        assert.equal(path, '/projects/1/tasks/1/completion');
        assert.equal(options.body.get('completed'), 'false');
        return { ok: saveOk };
      }
    });
    filter.change();
    assert.deepEqual(rows.map(row => row.hidden), [false, false]);
    filter.value = 'Open';
    filter.change();
    assert.deepEqual(rows.map(row => row.hidden), [true, false]);
    filter.value = 'Completed';
    filter.change();
    assert.deepEqual(rows.map(row => row.hidden), [false, true]);
    rows[0].checkbox.checked = false;
    await rows[0].checkbox.change();
    assert.deepEqual(rows.map(row => row.hidden), [true, true]);
    saveOk = false;
    rows[0].checkbox.checked = false;
    await rows[0].checkbox.change();
    assert.equal(rows[0].checkbox.checked, true);
    assert.match(alert.textContent, /Could not save/);

    await server.stop();
    server = await start(dbPath);
    assert.equal(await detail(1), content);
    assert.match(await detail(2), /Other task/);
    assert.equal((await post('/projects/1/tasks/1/completion', { completed: 'false' })).status, 204);
    assert.doesNotMatch(await detail(1), / checked/);
    await server.stop();
    server = await start(dbPath);
    assert.doesNotMatch(await detail(1), / checked/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project search intersects archive filter with ASCII-only matching and fresh navigation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-search-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const post = (path, fields = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual'
    });
    const get = path => fetch(`${server.base}${path}`).then(res => res.text());
    const names = html => [...html.matchAll(/data-testid="project-row">\s*<span>(.*?)<\/span>/g)].map(match => match[1]);
    for (const name of ['Alpha Board', 'ALPHA  Board', 'Beta', 'École']) await post('/projects', { name });
    await post('/projects/1/tasks', { title: 'Saved task' });
    await post('/projects/1/tasks/1/completion', { completed: 'true' });
    const search = (query, filter = 'Active') => get('/?' + new URLSearchParams({ query, filter }));
    let result = await search('  aLpHa  ');
    assert.deepEqual(names(result), ['Alpha Board', 'ALPHA  Board']);
    assert.match(result, /data-testid="project-summary">1\/1 completed/);
    assert.match(result, /name="query" value="aLpHa"/);
    assert.deepEqual(names(await search('alpha board')), ['Alpha Board', 'ALPHA  Board']);
    assert.deepEqual(names(await search('  alpha \t  board  ')), ['Alpha Board', 'ALPHA  Board']);
    assert.deepEqual(names(await search('alphaboard')), []);
    assert.deepEqual(names(await search('école')), []);
    assert.deepEqual(names(await search('ÉCOLE')), ['École']);
    assert.deepEqual(names(await search('   ')), ['Alpha Board', 'ALPHA  Board', 'Beta', 'École']);
    const archive = await post('/projects/1/archive', { query: 'aLpHa' });
    result = await get(archive.headers.get('location'));
    assert.deepEqual(names(result), ['ALPHA  Board']);
    result = await search('aLpHa', 'Archived');
    assert.deepEqual(names(result), ['Alpha Board']);
    assert.match(result, /name="query" value="aLpHa"/);
    assert.match(result, /data-testid="project-summary">1\/1 completed/);
    const detail = await get('/projects/1');
    assert.match(detail, /form action="\/" method="get"><button type="submit">Projects/);
    assert.match(detail, /<input id="task-search" type="text">/);
    assert.match(detail, /<button type="submit">Search tasks/);
    assert.deepEqual(names(await get('/')), ['ALPHA  Board', 'Beta', 'École']);
    await post('/projects/1/restore', { query: 'aLpHa' });
    await post('/projects/1/rename', { name: 'Gamma' });
    assert.deepEqual(names(await search('alpha')), ['ALPHA  Board']);
    assert.deepEqual(names(await search('gamma')), ['Gamma']);
    await post('/projects/1/rename', { name: 'Gamma \t  Board' });
    await post('/projects/1/tasks/1/rename', { title: 'Saved \t  TASK' });
    assert.deepEqual(names(await search('gamma board')), ['Gamma \t  Board']);
    assert.match(await get('/projects/1'), /Saved \t  TASK/);
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual(names(await get('/')), ['Gamma \t  Board', 'ALPHA  Board', 'Beta', 'École']);
    assert.deepEqual(names(await search('gamma  \t board')), ['Gamma \t  Board']);
    assert.match(await get('/projects/1'), /Saved \t  TASK/);
    assert.deepEqual(names(await search('alpha')), ['ALPHA  Board']);
    assert.match(await get('/health'), /"status":"ok"/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
