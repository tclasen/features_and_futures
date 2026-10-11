import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let diagnostics = '';
  child.stderr.on('data', (chunk) => { diagnostics += chunk; });
  const baseUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${diagnostics}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited (${code}): ${diagnostics}`));
    });
    child.stdout.on('data', (chunk) => {
      const match = /listening on port (\d+)/.exec(String(chunk));
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

test('due dates migrate, validate, stay independent, and survive rename, archive, and restart', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.workboard-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0,
      default_priority TEXT NOT NULL DEFAULT 'Normal');
    INSERT INTO projects (name) VALUES ('First'), ('Other');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
    INSERT INTO tasks (project_id, title, completed, priority) VALUES
      (1, 'Legacy task', 1, 'High'), (2, 'Other task', 0, 'Low');`);
  legacy.close();
  let running;
  try {
    running = await start(databasePath);
    const get = async (path) => (await fetch(`${running.baseUrl}${path}`)).text();
    const post = (path, values = {}) => fetch(`${running.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const assertDate = (html, id, date, disabled = false) => {
      assert.match(html, new RegExp(`<label for="task-due-date-${id}">Task due date</label>`));
      assert.match(html, new RegExp(`<input id="task-due-date-${id}" name="dueDate" type="text" value="${date}"${disabled ? ' disabled' : ''}>`));
      const form = new RegExp(`<form[^>]*action="/projects/\\d+/tasks/${id}/due-date"[^>]*>([\\s\\S]*?)</form>`).exec(html);
      assert.ok(form);
      assert.match(form[1], new RegExp(`<button type="submit"${disabled ? ' disabled' : ''}>Save due date</button>`));
    };
    assertDate(await get('/projects/1'), 1, '');
    assertDate(await get('/projects/2'), 2, '');
    await post('/projects/1/tasks', { title: 'New task' });
    assertDate(await get('/projects/1'), 3, '');
    const originalList = await get('/');
    const otherPage = await get('/projects/2');
    const filters = { filter: 'Completed', priorityFilter: 'High' };
    const path = '/projects/1?filter=Completed&priorityFilter=High';
    const dateForm = /<form[^>]*action="\/projects\/1\/tasks\/1\/due-date"[^>]*>([\s\S]*?)<\/form>/.exec(await get(path))[1];
    const fields = Object.fromEntries([...dateForm.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)]
      .map((match) => [match[1], match[2]]));
    assert.deepEqual(fields, filters);
    const saved = await post('/projects/1/tasks/1/due-date', { ...fields, dueDate: '  2000-02-29 \n' });
    assert.equal(saved.status, 303);
    assert.equal(saved.headers.get('location'), path);
    const savedPage = await get(path);
    assertDate(savedPage, 1, '2000-02-29');
    assert.match(savedPage, /<option selected>Completed<\/option>/);
    assert.match(savedPage, /id="priority-filter"[^>]*>\s*<option>All<\/option><option>Low<\/option><option>Normal<\/option><option selected>High<\/option>/);
    assert.match(savedPage, /aria-label="Complete Legacy task" checked/);
    assert.equal((savedPage.match(/data-testid="task-row"/g) ?? []).length, 1);
    assertDate(await get('/projects/1'), 3, '');
    assert.equal(await get('/projects/2'), otherPage);
    assert.equal(await get('/'), originalList);
    for (const dueDate of ['1900-02-29', '0000-01-01', '2026-04-31', '2026-1-01', '<invalid>']) {
      const response = await post('/projects/1/tasks/1/due-date', { ...filters, dueDate });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert"[^>]*>Due date must be a valid YYYY-MM-DD date/);
      assertDate(html, 1, '2000-02-29');
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.equal(await get(path), savedPage);
      assert.equal(await get('/'), originalList);
    }
    assert.equal((await post('/projects/2/tasks/1/due-date', { dueDate: '2026-01-01' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/due-date', { dueDate: '2026-01-01' })).status, 404);
    await post('/projects/1/tasks/3/due-date', { dueDate: '9999-12-31' });
    await post('/projects/1/tasks/1/rename', { title: 'Renamed task', ...filters });
    let html = await get(path);
    assertDate(html, 1, '2000-02-29');
    assert.match(html, /aria-label="Complete Renamed task" checked/);
    const renamedPage = html;
    const unfilteredPage = await get('/projects/1');
    assertDate(unfilteredPage, 3, '9999-12-31');
    assert.ok(unfilteredPage.indexOf('<span>Renamed task') < unfilteredPage.indexOf('<span>New task'));
    const renamedList = await get('/');
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get(path), renamedPage);
    assert.equal(await get('/projects/1'), unfilteredPage);
    assert.equal(await get('/'), renamedList);
    await post('/projects/1/archive');
    html = await get('/projects/1');
    assertDate(html, 1, '2000-02-29', true);
    assertDate(html, 3, '9999-12-31', true);
    const archivedPage = await get(path);
    assertDate(archivedPage, 1, '2000-02-29', true);
    assert.equal((await post('/projects/1/tasks/1/due-date', { dueDate: '', ...filters })).status, 409);
    assert.equal(await get(path), archivedPage);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get(path), archivedPage);
    await post('/projects/1/restore');
    assert.equal(await get(path), renamedPage);
    assert.equal(await get('/projects/1'), unfilteredPage);
    for (const dueDate of ['', ' \t\n ']) {
      await post('/projects/1/tasks/1/due-date', { dueDate: '0001-01-01', ...filters });
      const response = await post('/projects/1/tasks/1/due-date', { dueDate, ...filters });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), path);
      assertDate(await get(path), 1, '');
      assertDate(await get('/projects/1'), 3, '9999-12-31');
      assert.equal(await get('/'), renamedList);
    }
    const clearedPage = await get(path);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get(path), clearedPage);
    assertDate(await get('/projects/1'), 3, '9999-12-31');
    assert.equal(await get('/projects/2'), otherPage);
  } finally {
    if (running) await running.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('combined filters preserve selections, task data, summaries, and archive behavior', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.workboard-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let running;
  try {
    running = await start(databasePath);
    const get = async (path) => (await fetch(`${running.baseUrl}${path}`)).text();
    const post = (path, values = {}) => fetch(`${running.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const titles = (html) => [...html.matchAll(/data-testid="task-row"[^>]*>\s*<span>(.*?)<\/span>/g)]
      .map((match) => match[1]);
    const filterForm = (html) => /<form[^>]*class="task-filter">([\s\S]*?)<\/form>/.exec(html)[1];
    const assertFilters = (html, completion, priority) => {
      const form = filterForm(html);
      for (const [id, name, label, options, selected] of [
        ['task-filter', 'filter', 'Task filter', ['All', 'Open', 'Completed'], completion],
        ['priority-filter', 'priorityFilter', 'Priority filter', ['All', 'Low', 'Normal', 'High'], priority],
      ]) {
        assert.match(form, new RegExp(`<label for="${id}">${label}</label>`));
        const control = new RegExp(`<select id="${id}" name="${name}"([^>]*)>([\\s\\S]*?)</select>`).exec(form);
        assert.ok(control);
        assert.match(control[1], /onchange="this.form.requestSubmit\(\)"/);
        assert.doesNotMatch(control[1], /disabled/);
        assert.equal(control[2].trim(), options.map((value) =>
          `<option${value === selected ? ' selected' : ''}>${value}</option>`).join(''));
      }
    };
    // Submit the actual rendered form's hidden fields, as a browser would.
    const edit = async (html, path, values) => {
      const form = [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)]
        .find((match) => match[1].includes(`action="${path}"`));
      assert.ok(form, `Rendered edit form ${path}`);
      const fields = Object.fromEntries([...form[2].matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)]
        .map((match) => [match[1], match[2]]));
      return post(path, { ...fields, ...values });
    };
    const changeFilter = async (html, name, value) => {
      const fields = Object.fromEntries([...filterForm(html).matchAll(/<select[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)]
        .map((match) => [match[1], /<option selected>(.*?)<\/option>/.exec(match[2])[1]]));
      fields[name] = value;
      return get(`/projects/1?${new URLSearchParams(fields)}`);
    };
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    // Interleave priority and completion to exercise ordering within intersections.
    const tasks = [
      { title: 'High open', priority: 'High', completed: false },
      { title: 'Low done', priority: 'Low', completed: true },
      { title: 'Normal open', priority: 'Normal', completed: false },
      { title: 'High done', priority: 'High', completed: true },
      { title: 'Low open', priority: 'Low', completed: false },
      { title: 'Normal done', priority: 'Normal', completed: true },
    ];
    for (const [index, task] of tasks.entries()) {
      await post('/projects/1/tasks', { title: task.title });
      await post(`/projects/1/tasks/${index + 1}/priority`, { priority: task.priority });
      if (task.completed) await post(`/projects/1/tasks/${index + 1}/completion`, { completed: '1' });
    }
    await post('/projects/2/tasks', { title: 'Other project' });
    const originalList = await get('/');
    const originalOther = await get('/projects/2');
    const originalPage = await get('/projects/1');
    assertFilters(originalPage, 'All', 'All');
    // The project-list navigation has no query and resets both filters to All.
    assert.match(originalList, /<form method="get" action="\/projects\/1"><button type="submit">Open project/);
    for (const completion of ['All', 'Open', 'Completed']) {
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        const html = await get(`/projects/1?${new URLSearchParams({ filter: completion, priorityFilter: priority })}`);
        assertFilters(html, completion, priority);
        assert.deepEqual(titles(html), tasks.filter((task) =>
          (completion === 'All' || task.completed === (completion === 'Completed')) &&
          (priority === 'All' || task.priority === priority)).map((task) => task.title));
      }
    }
    assert.equal(await get('/'), originalList);
    assert.equal(await get('/projects/1'), originalPage);
    assertFilters(await get('/projects/1?filter=Open&priorityFilter=unknown'), 'Open', 'All');
    assertFilters(await get('/projects/1?filter=unknown&priorityFilter=High'), 'All', 'High');

    let html = await changeFilter(originalPage, 'priorityFilter', 'High');
    html = await changeFilter(html, 'filter', 'Open');
    assertFilters(html, 'Open', 'High');
    assert.deepEqual(titles(html), ['High open']);
    html = await changeFilter(html, 'priorityFilter', 'Low');
    assertFilters(html, 'Open', 'Low');
    assert.deepEqual(titles(html), ['Low open']);
    const filteredPath = '/projects/1?filter=Open&priorityFilter=High';
    html = await get(filteredPath);
    for (const [path, values, message] of [
      ['/projects/1/tasks/1/rename', { title: '  ' }, 'Task title is required'],
      ['/projects/1/tasks', { title: '  ' }, 'Task title is required'],
      ['/projects/1/rename', { name: '  ' }, 'Project name is required'],
      ['/projects/1/tasks/1/priority', { priority: 'Urgent' }, 'Task priority is invalid'],
    ]) {
      const response = await edit(html, path, values);
      assert.equal(response.status, 400);
      const invalid = await response.text();
      assertFilters(invalid, 'Open', 'High');
      assert.deepEqual(titles(invalid), ['High open']);
      assert.ok(invalid.includes(message));
    }
    let response = await edit(html, '/projects/1/tasks/1/rename', { title: '  Renamed high  ' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), filteredPath);
    html = await get(response.headers.get('location'));
    assertFilters(html, 'Open', 'High');
    assert.deepEqual(titles(html), ['Renamed high']);
    assert.match(html, /aria-label="Complete Renamed high" onchange/);
    assert.equal(await get('/'), originalList);
    response = await edit(html, '/projects/1/tasks/1/priority', { priority: 'Low' });
    assert.equal(response.headers.get('location'), filteredPath);
    html = await get(response.headers.get('location'));
    assertFilters(html, 'Open', 'High');
    assert.deepEqual(titles(html), []);
    assert.equal(await get('/'), originalList);
    html = await changeFilter(html, 'priorityFilter', 'Low');
    assert.deepEqual(titles(html), ['Renamed high', 'Low open']);
    response = await edit(html, '/projects/1/tasks/1/completion', { completed: '1' });
    assert.equal(response.headers.get('location'), '/projects/1?filter=Open&priorityFilter=Low');
    html = await get(response.headers.get('location'));
    assertFilters(html, 'Open', 'Low');
    assert.deepEqual(titles(html), ['Low open']);
    html = await changeFilter(html, 'filter', 'Completed');
    assertFilters(html, 'Completed', 'Low');
    assert.deepEqual(titles(html), ['Renamed high', 'Low done']);
    response = await edit(html, '/projects/1/tasks/1/completion', {});
    html = await get(response.headers.get('location'));
    assertFilters(html, 'Completed', 'Low');
    assert.deepEqual(titles(html), ['Low done']);
    assert.equal(await get('/'), originalList);
    assert.equal(await get('/projects/2'), originalOther);
    const savedPage = await get('/projects/1');
    assert.match(savedPage, /aria-label="Complete Renamed high" onchange/);
    assert.match(savedPage, /id="task-priority-1"[^>]*>\s*<option selected>Low/);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get('/projects/1'), savedPage);
    assert.equal(await get('/projects/1?filter=Completed&priorityFilter=Low'), html);
    await post('/projects/1/archive');
    const archived = await get(filteredPath);
    assertFilters(archived, 'Open', 'High');
    assert.deepEqual(titles(archived), []);
    const archivedLow = await changeFilter(archived, 'priorityFilter', 'Low');
    assertFilters(archivedLow, 'Open', 'Low');
    assert.deepEqual(titles(archivedLow), ['Renamed high', 'Low open']);
    for (const tag of archivedLow.matchAll(/<(?:input|button|select)\b[^>]*>/g)) {
      if (/type="checkbox"|id="new-task-title-|id="task-priority-|<button[^>]*type="submit" disabled/.test(tag[0])) {
        assert.match(tag[0], /disabled/);
      }
    }
    const blocked = await edit(archivedLow, '/projects/1/tasks/1/priority', { priority: 'High' });
    assert.equal(blocked.status, 409);
    assertFilters(await blocked.text(), 'Open', 'Low');
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get(filteredPath), archived);
    assert.match(await get('/?filter=Archived'), /data-testid="project-summary">3\/6 completed/);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), savedPage);
    assert.equal(await get('/'), originalList);
  } finally {
    if (running) await running.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task priorities migrate, remain independent, and persist through renaming, archive, and restart', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.workboard-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('First'), ('Second');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)));
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Done', 1), (1, 'Open', 0), (2, 'Other', 0);`);
  legacy.close();
  let running;
  try {
    running = await start(databasePath);
    const get = async (path) => (await fetch(`${running.baseUrl}${path}`)).text();
    const post = (path, values = {}) => fetch(`${running.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const priorityControl = (html, id) => {
      const match = new RegExp(`<select id="task-priority-${id}"[^>]*>([\\s\\S]*?)</select>`).exec(html);
      assert.ok(match, `Priority control for task ${id} exists`);
      return { tag: match[0], options: match[1].trim() };
    };
    const assertPriority = (html, id, priority, disabled = false) => {
      const control = priorityControl(html, id);
      const expected = ['Low', 'Normal', 'High'].map((value) =>
        `<option${value === priority ? ' selected' : ''}>${value}</option>`).join('');
      assert.equal(control.options, expected);
      assert.equal(control.tag.includes(' disabled'), disabled);
      assert.match(html, new RegExp(`<label for="task-priority-${id}">Task priority</label>`));
      assert.match(control.tag, /onchange="this.form.requestSubmit\(\)"/);
    };
    let html = await get('/projects/1');
    assertPriority(html, 1, 'Normal');
    assertPriority(html, 2, 'Normal');
    assertPriority(await get('/projects/2'), 3, 'Normal');
    await post('/projects/1/tasks', { title: 'New' });
    html = await get('/projects/1');
    assertPriority(html, 4, 'Normal');
    const originalList = await get('/');
    const originalOther = await get('/projects/2');
    for (const values of [{}, { priority: '' }, { priority: 'Urgent' }, { priority: 'high' }]) {
      const response = await post('/projects/1/tasks/1/priority', values);
      assert.equal(response.status, 400);
      assert.match(await response.text(), /role="alert"[^>]*>Task priority is invalid/);
      assert.equal(await get('/projects/1'), html);
    }
    for (const path of ['/projects/2/tasks/1/priority', '/projects/1/tasks/3/priority',
      '/projects/1/tasks/999/priority', '/projects/999/tasks/1/priority']) {
      assert.equal((await post(path, { priority: 'High' })).status, 404);
    }
    assert.equal(await get('/projects/1'), html);
    const changed = await post('/projects/1/tasks/1/priority', { priority: 'High', filter: 'Completed' });
    assert.equal(changed.status, 303);
    assert.equal(changed.headers.get('location'), '/projects/1?filter=Completed');
    await post('/projects/1/tasks/2/priority', { priority: 'Low', filter: 'Open' });
    html = await get('/projects/1');
    assertPriority(html, 1, 'High');
    assertPriority(html, 2, 'Low');
    assertPriority(html, 4, 'Normal');
    assert.match(html, /aria-label="Complete Done" checked/);
    assert.match(html, /aria-label="Complete Open" onchange/);
    assert.ok(html.indexOf('<span>Done') < html.indexOf('<span>Open'));
    assert.ok(html.indexOf('<span>Open') < html.indexOf('<span>New'));
    assert.equal(await get('/'), originalList);
    assert.equal(await get('/projects/2'), originalOther);
    const completed = await get('/projects/1?filter=Completed');
    const open = await get('/projects/1?filter=Open');
    assertPriority(completed, 1, 'High');
    assert.doesNotMatch(completed, /task-priority-2|task-priority-4/);
    assertPriority(open, 2, 'Low');
    assertPriority(open, 4, 'Normal');
    assert.doesNotMatch(open, /task-priority-1/);
    await running.stop();
    running = await start(databasePath);
    assert.equal(await get('/projects/1'), html);
    assert.equal(await get('/projects/1?filter=Completed'), completed);
    assert.equal(await get('/projects/1?filter=Open'), open);
    await post('/projects/1/tasks/1/rename', { title: '  Renamed  ' });
    await post('/projects/1/rename', { name: 'Renamed project' });
    const renamed = await get('/projects/1');
    assertPriority(renamed, 1, 'High');
    assert.match(renamed, /aria-label="Complete Renamed" checked/);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assertPriority(archived, 1, 'High', true);
    assertPriority(archived, 2, 'Low', true);
    assertPriority(archived, 4, 'Normal', true);
    assertPriority(await get('/projects/1?filter=Completed'), 1, 'High', true);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Low' })).status, 409);
    assert.equal(await get('/projects/1'), archived);
    await running.stop();
    running = await start(databasePath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), renamed);
    await post('/projects/1/tasks/1/priority', { priority: 'Normal' });
    const restored = await get('/projects/1');
    assertPriority(restored, 1, 'Normal');
    assertPriority(restored, 2, 'Low');
    assert.match(await get('/'), /data-testid="project-summary">1\/3 completed/);
    await running.stop();
    running = await start(databasePath);
    assert.equal(await get('/projects/1'), restored);
    assert.equal(await get('/projects/2'), originalOther.replace('<option value="1">First</option>', '<option value="1">Renamed project</option>'));
  } finally {
    if (running) await running.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task renaming preserves ownership, order, completion, filters, and persisted state through archive and restore', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.workboard-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let running;
  try {
    running = await start(databasePath);
    const get = async (path) => (await fetch(`${running.baseUrl}${path}`)).text();
    const post = (path, values = {}) => fetch(`${running.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    await post('/projects/1/tasks/1/completion', { completed: '1' });
    const originalPage = await get('/projects/1');
    const otherPage = await get('/projects/2');
    const originalList = await get('/');
    assert.match(originalPage, /<label for="new-task-title-1">New task title<\/label>/);
    assert.match(originalPage, /<input id="new-task-title-1" name="title" type="text">/);
    assert.equal((originalPage.match(/>Rename task<\/button>/g) ?? []).length, 2);
    for (const values of [{}, { title: '' }, { title: ' \t\n ', filter: 'Completed' }]) {
      const response = await post('/projects/1/tasks/1/rename', values);
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert"[^>]*>Task title is required/);
      assert.match(html, /<span>Done<\/span>/);
      assert.match(html, /aria-label="Complete Done" checked/);
      if (values.filter) {
        assert.match(html, /<option selected>Completed<\/option>/);
        assert.doesNotMatch(html, /<span>Pending<\/span>/);
      }
      assert.equal(await get('/projects/1'), originalPage);
    }
    for (const path of ['/projects/2/tasks/1/rename', '/projects/1/tasks/3/rename',
      '/projects/1/tasks/999/rename', '/projects/999/tasks/1/rename']) {
      assert.equal((await post(path, { title: 'Blocked' })).status, 404);
    }
    assert.equal(await get('/projects/1'), originalPage);
    assert.equal(await get('/projects/2'), otherPage);
    const renamed = await post('/projects/1/tasks/1/rename', {
      title: '  Finished <task> "one"  ', filter: 'Completed',
    });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const openRename = await post('/projects/1/tasks/2/rename', { title: '  Still open  ', filter: 'Open' });
    assert.equal(openRename.status, 303);
    assert.equal(openRename.headers.get('location'), '/projects/1?filter=Open');
    const renamedPage = await get('/projects/1');
    assert.match(renamedPage, /<span>Finished &lt;task&gt; &quot;one&quot;<\/span>/);
    assert.match(renamedPage, /aria-label="Complete Finished &lt;task&gt; &quot;one&quot;" checked/);
    assert.match(renamedPage, /aria-label="Complete Still open" onchange/);
    assert.doesNotMatch(renamedPage, /Complete Done|Complete Pending/);
    assert.ok(renamedPage.indexOf('<span>Finished') < renamedPage.indexOf('<span>Still open'));
    assert.match(renamedPage, /action="\/projects\/1\/tasks\/1\/rename"/);
    assert.equal(await get('/'), originalList);
    assert.equal(await get('/projects/2'), otherPage);
    const completedPage = await get('/projects/1?filter=Completed');
    const openPage = await get('/projects/1?filter=Open');
    assert.match(completedPage, /<span>Finished/);
    assert.doesNotMatch(completedPage, /<span>Still open/);
    assert.match(openPage, /<span>Still open/);
    assert.doesNotMatch(openPage, /<span>Finished/);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get('/projects/1'), renamedPage);
    assert.equal(await get('/projects/1?filter=Completed'), completedPage);
    assert.equal(await get('/projects/1?filter=Open'), openPage);
    assert.equal(await get('/'), originalList);
    await post('/projects/1/archive');
    const archivedPage = await get('/projects/1');
    assert.equal((archivedPage.match(/id="new-task-title-\d+" name="title" type="text" disabled/g) ?? []).length, 2);
    assert.equal((archivedPage.match(/<button type="submit" disabled>Rename task<\/button>/g) ?? []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Blocked' })).status, 409);
    assert.equal(await get('/projects/1'), archivedPage);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get('/projects/1'), archivedPage);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), renamedPage);
    assert.equal(await get('/'), originalList);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: '  Restored title  ' })).status, 303);
    const restoredPage = await get('/projects/1');
    assert.match(restoredPage, /aria-label="Complete Restored title" checked/);
    assert.ok(restoredPage.indexOf('<span>Restored title') < restoredPage.indexOf('<span>Still open'));
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get('/projects/1'), restoredPage);
    assert.equal(await get('/'), originalList);
    assert.equal(await get('/projects/2'), otherPage);
  } finally {
    if (running) await running.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('renaming preserves project identity, order, tasks, and persisted state; archived projects reject renaming', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.workboard-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let running;
  try {
    running = await start(databasePath);
    const get = async (path) => (await fetch(`${running.baseUrl}${path}`)).text();
    const post = (path, values = {}) => fetch(`${running.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1/completion', { completed: '1' });
    const originalPage = await get('/projects/1');
    assert.match(originalPage, /<label for="new-project-name">New project name<\/label>/);
    assert.match(originalPage, /<input id="new-project-name" name="name" type="text">/);
    assert.match(originalPage, /<button type="submit">Rename project<\/button>/);
    for (const values of [{}, { name: '' }, { name: ' \t\n ' }]) {
      const response = await post('/projects/1/rename', values);
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert"[^>]*>Project name is required/);
      assert.match(html, /<h1>Original<\/h1>/);
      assert.equal(await get('/projects/1'), originalPage);
    }
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
    const renamed = await post('/projects/1/rename', { name: '  Renamed <project> "one"  ', filter: 'Completed' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const renamedPage = await get('/projects/1');
    assert.match(renamedPage, /<h1>Renamed &lt;project&gt; &quot;one&quot;<\/h1>/);
    assert.match(renamedPage, /aria-label="Complete Done" checked/);
    assert.match(renamedPage, /aria-label="Complete Pending" onchange/);
    assert.equal((renamedPage.match(/data-testid="task-row"/g) ?? []).length, 2);
    const renamedList = await get('/');
    assert.match(renamedList, /<span>Renamed &lt;project&gt; &quot;one&quot;<\/span>/);
    assert.match(renamedList, /data-testid="project-summary">1\/2 completed/);
    assert.ok(renamedList.indexOf('<span>Renamed') < renamedList.indexOf('<span>Second'));
    assert.match(renamedList, /action="\/projects\/1"/);
    assert.match(await get('/projects/2'), /<h1>Second<\/h1>/);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get('/projects/1'), renamedPage);
    assert.equal(await get('/'), renamedList);
    await post('/projects/1/archive');
    const archivedPage = await get('/projects/1');
    assert.match(archivedPage, /<input id="new-project-name" name="name" type="text" disabled>/);
    assert.match(archivedPage, /<button type="submit" disabled>Rename project<\/button>/);
    const blocked = await post('/projects/1/rename', { name: 'Blocked' });
    assert.equal(blocked.status, 409);
    assert.match(await blocked.text(), /Archived project is read-only/);
    assert.equal(await get('/projects/1'), archivedPage);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get('/projects/1'), archivedPage);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), renamedPage);
    const restoredRename = await post('/projects/1/rename', { name: '  Restored name  ' });
    assert.equal(restoredRename.status, 303);
    assert.equal(restoredRename.headers.get('location'), '/projects/1');
    const restoredPage = await get('/projects/1');
    assert.match(restoredPage, /<h1>Restored name<\/h1>/);
    assert.match(restoredPage, /aria-label="Complete Done" checked/);
    const restoredList = await get('/');
    assert.match(restoredList, /data-testid="project-summary">1\/2 completed/);
    assert.ok(restoredList.indexOf('<span>Restored name') < restoredList.indexOf('<span>Second'));
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get('/projects/1'), restoredPage);
    assert.equal(await get('/'), restoredList);
  } finally {
    if (running) await running.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project validation, order, navigation, escaping, and process restart persistence', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let running;
  try {
    running = await start(databasePath);
    const get = (path) => fetch(`${running.baseUrl}${path}`);
    const create = (name) => fetch(`${running.baseUrl}/projects`, {
      method: 'POST',
      body: new URLSearchParams({ name }),
      redirect: 'manual',
    });
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    let html = await (await get('/')).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, />Create project<\/button>/);
    assert.doesNotMatch(html, /data-testid="project-row"/);
    for (const name of ['', '  \t\n ']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      html = await invalid.text();
      assert.match(html, /role="alert"[^>]*>Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    for (const name of ['  First project  ', '<script>alert("hi")</script>']) {
      const created = await create(name);
      assert.equal(created.status, 303);
      assert.equal(created.headers.get('location'), '/');
    }
    const beforeRestart = await (await get('/')).text();
    assert.equal((beforeRestart.match(/data-testid="project-row"/g) ?? []).length, 2);
    assert.match(beforeRestart, /<span>First project<\/span>/);
    assert.match(beforeRestart, /&lt;script&gt;alert\(&quot;hi&quot;\)&lt;\/script&gt;/);
    assert.ok(beforeRestart.indexOf('First project') < beforeRestart.indexOf('&lt;script&gt;'));
    const paths = [...beforeRestart.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
    assert.equal(paths.length, 2);
    assert.notEqual(paths[0], paths[1]);
    html = await (await get(paths[0])).text();
    assert.match(html, /<h1>First project<\/h1>/);
    assert.match(html, /action="\/"[^>]*><button type="submit">Projects<\/button>/);
    assert.equal((await get('/projects/999999')).status, 404);
    const invalid = await create('   ');
    assert.equal(( (await invalid.text()).match(/data-testid="project-row"/g) ?? []).length, 2);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await (await get('/')).text(), beforeRestart);
    assert.match(await (await get(paths[0])).text(), /<h1>First project<\/h1>/);
  } finally {
    if (running) await running.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('legacy projects migrate; archive, summaries, read-only tasks, and restoration persist', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.workboard-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    INSERT INTO projects (name) VALUES ('Legacy');
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
    );
    INSERT INTO tasks (project_id, title, completed) VALUES
      (1, 'Done', 1), (1, 'Pending', 0);`);
  legacy.close();
  let running;
  try {
    running = await start(databasePath);
    const get = async (path) => (await fetch(`${running.baseUrl}${path}`)).text();
    const post = (path, values = {}) => fetch(`${running.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const rows = (html, kind) => (html.match(new RegExp(`data-testid="${kind}-row"`, 'g')) ?? []).length;
    let html = await get('/');
    assert.match(html, /<label for="project-filter">Project filter<\/label>/);
    assert.match(html, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(html, /data-testid="project-summary">1\/2 completed/);
    assert.match(html, />Archive project<\/button>/);
    assert.doesNotMatch(html, />Restore project<\/button>/);
    await post('/projects', { name: 'New project' });
    html = await get('/');
    assert.equal(rows(html, 'project'), 2);
    assert.match(html, /data-testid="project-summary">0\/0 completed/);
    assert.equal(rows(await get('/?filter=Archived'), 'project'), 0);
    assert.equal((await post('/projects/999/archive')).status, 404);
    const archivedResponse = await post('/projects/1/archive');
    assert.equal(archivedResponse.status, 303);
    assert.equal(archivedResponse.headers.get('location'), '/');
    assert.equal(rows(await get('/'), 'project'), 1);
    assert.doesNotMatch(await get('/'), /<span>Legacy<\/span>/);
    const archivedList = await get('/?filter=Archived');
    assert.equal(rows(archivedList, 'project'), 1);
    assert.match(archivedList, /<span>Legacy<\/span>/);
    assert.match(archivedList, /data-testid="project-summary">1\/2 completed/);
    assert.match(archivedList, />Open project<\/button>/);
    assert.match(archivedList, />Restore project<\/button>/);
    assert.doesNotMatch(archivedList, />Archive project<\/button>/);
    const archivedPage = await get('/projects/1');
    assert.match(archivedPage, /<p>Archived project<\/p>/);
    assert.match(archivedPage, /<button type="submit" disabled>Create task<\/button>/);
    assert.equal(rows(archivedPage, 'task'), 2);
    const checkboxes = [...archivedPage.matchAll(/<input type="checkbox"[^>]*>/g)].map((match) => match[0]);
    assert.equal(checkboxes.length, 2);
    assert.ok(checkboxes.every((checkbox) => checkbox.includes(' disabled')));
    assert.match(checkboxes[0], / checked/);
    assert.doesNotMatch(checkboxes[1], / checked/);
    assert.equal(rows(await get('/projects/1?filter=Open'), 'task'), 1);
    assert.equal(rows(await get('/projects/1?filter=Completed'), 'task'), 1);
    // Disabled controls also have server-side protection against direct writes.
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked' })).status, 409);
    assert.equal((await post('/projects/1/tasks/1/completion')).status, 409);
    assert.equal((await post('/projects/1/tasks/2/completion', { completed: '1' })).status, 409);
    assert.equal(await get('/projects/1'), archivedPage);
    assert.equal(await get('/?filter=Archived'), archivedList);
    const invalid = await post('/projects', { name: ' ', filter: 'Archived' });
    assert.equal(invalid.status, 400);
    html = await invalid.text();
    assert.match(html, /Project name is required/);
    assert.match(html, /<option selected>Archived<\/option>/);
    assert.equal(rows(html, 'project'), 1);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get('/?filter=Archived'), archivedList);
    assert.equal(await get('/projects/1'), archivedPage);
    const restore = await post('/projects/1/restore');
    assert.equal(restore.status, 303);
    assert.equal(rows(await get('/?filter=Archived'), 'project'), 0);
    html = await get('/');
    assert.equal(rows(html, 'project'), 2);
    assert.ok(html.indexOf('<span>Legacy') < html.indexOf('<span>New project'));
    assert.match(html, /data-testid="project-summary">1\/2 completed/);
    html = await get('/projects/1');
    assert.doesNotMatch(html, /Archived project| disabled/);
    assert.match(html, /aria-label="Complete Done" checked/);
    await post('/projects/1/tasks/2/completion', { completed: '1', filter: 'Open' });
    assert.equal(rows(await get('/projects/1?filter=Open'), 'task'), 0);
    assert.match(await get('/'), /data-testid="project-summary">2\/2 completed/);
    await post('/projects/1/tasks', { title: 'After restore' });
    await post('/projects/1/tasks/1/completion');
    const restoredList = await get('/');
    const restoredPage = await get('/projects/1');
    assert.match(restoredList, /data-testid="project-summary">1\/3 completed/);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get('/'), restoredList);
    assert.equal(await get('/projects/1'), restoredPage);
    assert.equal(rows(await get('/?filter=Archived'), 'project'), 0);
  } finally {
    if (running) await running.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks are validated, scoped, filtered, saved, and restored after process restart', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.workboard-test-'));
  let running;
  try {
    const databasePath = join(directory, 'workboard.sqlite');
    running = await start(databasePath);
    const get = async (path) => (await fetch(`${running.baseUrl}${path}`)).text();
    const post = (path, values) => fetch(`${running.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    let html = await get('/projects/1');
    assert.match(html, /<label for="task-title">Task title<\/label>/);
    assert.match(html, />Create task<\/button>/);
    assert.match(html, /<label for="task-filter">Task filter<\/label>/);
    assert.match(html, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    const rows = (value) => [...value.matchAll(/data-testid="task-row"/g)].length;
    assert.equal(rows(html), 0);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      assert.match(await response.text(), /role="alert"[^>]*>Task title is required/);
    }
    for (const title of ['  First task  ', 'Second <task> "quoted"']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/projects/1');
    }
    html = await get('/projects/1');
    assert.equal(rows(html), 2);
    assert.match(html, /<span>First task<\/span>/);
    assert.match(html, /aria-label="Complete First task"/);
    assert.match(html, /aria-label="Complete Second &lt;task&gt; &quot;quoted&quot;"/);
    assert.doesNotMatch(html, / checked/);
    assert.ok(html.indexOf('<span>First task') < html.indexOf('<span>Second'));
    assert.equal(rows(await get('/projects/2')), 0);
    // Ownership also applies to writes, not only rendering.
    assert.equal((await post('/projects/2/tasks/1/completion', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Orphan' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/completion', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1/completion', { completed: '1' })).status, 303);
    html = await get('/projects/1');
    assert.match(html, /aria-label="Complete First task" checked/);
    assert.equal(rows(html), 2);
    const open = await get('/projects/1?filter=Open');
    assert.equal(rows(open), 1);
    assert.doesNotMatch(open, /<span>First task/);
    assert.match(open, /<option selected>Open<\/option>/);
    const completed = await get('/projects/1?filter=Completed');
    assert.equal(rows(completed), 1);
    assert.match(completed, /<span>First task/);
    assert.doesNotMatch(completed, /<span>Second/);
    assert.equal(rows(await get('/projects/1?filter=unknown')), 2);
    const invalid = await post('/projects/1/tasks', { title: '  ', filter: 'Completed' });
    assert.equal(invalid.status, 400);
    assert.equal(rows(await invalid.text()), 1);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get('/projects/1'), html);
    assert.equal(await get('/projects/1?filter=Open'), open);
    assert.equal(await get('/projects/1?filter=Completed'), completed);
    assert.equal(rows(await get('/projects/2')), 0);
    const uncheck = await post('/projects/1/tasks/1/completion', { filter: 'Completed' });
    assert.equal(uncheck.status, 303);
    assert.equal(uncheck.headers.get('location'), '/projects/1?filter=Completed');
    assert.equal(rows(await get('/projects/1?filter=Completed')), 0);
    assert.equal(rows(await get('/projects/1?filter=Open')), 2);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.doesNotMatch(await get('/projects/1'), / checked/);
    assert.equal(rows(await get('/projects/1?filter=Open')), 2);
  } finally {
    if (running) await running.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project priority defaults migrate and affect only future tasks, preserving filters and archived data', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.workboard-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name, archived) VALUES ('Existing', 0), ('Archived', 1);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
    INSERT INTO tasks (project_id, title, completed, priority) VALUES
      (1, 'Existing high', 1, 'High'), (1, 'Existing low', 0, 'Low'),
      (2, 'Archived task', 1, 'Low');`);
  legacy.close();
  let running;
  try {
    running = await start(databasePath);
    const get = async (path) => (await fetch(`${running.baseUrl}${path}`)).text();
    const post = (path, values = {}) => fetch(`${running.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const assertDefault = (html, priority, disabled = false) => {
      assert.match(html, /<label for="default-task-priority">Default task priority<\/label>/);
      const control = /<select id="default-task-priority" name="priority"([^>]*)>([\s\S]*?)<\/select>/.exec(html);
      assert.ok(control);
      assert.equal(control[1].includes(' disabled'), disabled);
      assert.match(control[1], /onchange="this.form.requestSubmit\(\)"/);
      assert.equal(control[2].trim(), ['Low', 'Normal', 'High'].map((option) =>
        `<option${priority === option ? ' selected' : ''}>${option}</option>`).join(''));
    };
    const titles = (html) => [...html.matchAll(/data-testid="task-row"[^>]*>\s*<span>(.*?)<\/span>/g)]
      .map((match) => match[1]);
    const taskSection = (html) => html.slice(html.indexOf('<section aria-label="Tasks"'));
    const assertTaskPriority = (html, id, priority) => {
      assert.match(html, new RegExp(`id="task-priority-${id}"[^>]*>[\\s\\S]*?<option selected>${priority}</option>`));
    };
    await post('/projects', { name: 'New project' });
    assertDefault(await get('/projects/1'), 'Normal');
    assertDefault(await get('/projects/2'), 'Normal', true);
    assertDefault(await get('/projects/3'), 'Normal');
    await post('/projects/1/tasks', { title: 'Initial normal' });
    assertTaskPriority(await get('/projects/1'), 4, 'Normal');
    const initialList = await get('/');
    const originalTasks = taskSection(await get('/projects/1'));
    const otherPage = await get('/projects/3');
    const filters = { filter: 'Completed', priorityFilter: 'High' };
    const filteredPath = '/projects/1?filter=Completed&priorityFilter=High';
    const originalFilteredTasks = taskSection(await get(filteredPath));
    // Use the actual rendered form fields, including both current filters.
    const filteredPage = await get(filteredPath);
    const defaultForm = /<form[^>]*class="default-priority">([\s\S]*?)<\/form>/.exec(filteredPage)[1];
    const fields = Object.fromEntries([...defaultForm.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)]
      .map((match) => [match[1], match[2]]));
    assert.deepEqual(fields, filters);
    const change = await post('/projects/1/default-priority', { ...fields, priority: 'High' });
    assert.equal(change.status, 303);
    assert.equal(change.headers.get('location'), filteredPath);
    let html = await get(filteredPath);
    assertDefault(html, 'High');
    assert.match(html, /<option selected>Completed<\/option>/);
    assert.match(html, /id="priority-filter"[^>]*>\s*<option>All<\/option><option>Low<\/option><option>Normal<\/option><option selected>High<\/option>/);
    assert.equal(taskSection(html), originalFilteredTasks);
    assert.equal(taskSection(await get('/projects/1')), originalTasks);
    assert.equal(await get('/'), initialList);
    assert.equal(await get('/projects/3'), otherPage);
    for (const values of [{}, { priority: '' }, { priority: 'Urgent' }, { priority: 'high' }]) {
      const response = await post('/projects/1/default-priority', { ...filters, ...values });
      assert.equal(response.status, 400);
      assert.match(await response.text(), /role="alert"[^>]*>Task priority is invalid/);
      assert.equal(await get(filteredPath), html);
    }
    assert.equal((await post('/projects/999/default-priority', { priority: 'Low' })).status, 404);
    await post('/projects/1/tasks', { title: 'Inherited high', ...filters });
    await post('/projects/1/default-priority', { priority: 'Low', ...filters });
    await post('/projects/1/tasks', { title: 'Inherited low' });
    await post('/projects/3/tasks', { title: 'Independent normal' });
    html = await get('/projects/1');
    assert.deepEqual(titles(html), ['Existing high', 'Existing low', 'Initial normal', 'Inherited high', 'Inherited low']);
    for (const [id, priority] of [[1, 'High'], [2, 'Low'], [4, 'Normal'], [5, 'High'], [6, 'Low']]) {
      assertTaskPriority(html, id, priority);
    }
    assertTaskPriority(await get('/projects/3'), 7, 'Normal');
    assert.match(await get('/'), /data-testid="project-summary">1\/5 completed/);
    await post('/projects/1/rename', { name: 'Renamed project', ...filters });
    await post('/projects/1/tasks/5/rename', { title: 'Renamed high' });
    await post('/projects/1/tasks/5/completion', { completed: '1' });
    const savedPage = await get('/projects/1');
    assertDefault(savedPage, 'Low');
    assertTaskPriority(savedPage, 5, 'High');
    assert.match(savedPage, /aria-label="Complete Renamed high" checked/);
    const savedList = await get('/');
    assert.match(savedList, /data-testid="project-summary">2\/5 completed/);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get('/projects/1'), savedPage);
    assert.equal(await get('/'), savedList);
    assertDefault(await get('/projects/3'), 'Normal');
    await post('/projects/1/archive');
    const archivedPage = await get(filteredPath);
    assertDefault(archivedPage, 'Low', true);
    assert.deepEqual(titles(archivedPage), ['Existing high', 'Renamed high']);
    assert.equal((await post('/projects/1/default-priority', { priority: 'High', ...filters })).status, 409);
    assert.equal(await get(filteredPath), archivedPage);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get(filteredPath), archivedPage);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), savedPage);
    assert.equal(await get('/'), savedList);
    await post('/projects/1/tasks', { title: 'Restored low' });
    assertTaskPriority(await get('/projects/1'), 8, 'Low');
    await post('/projects/1/default-priority', { priority: 'Normal' });
    assertDefault(await get('/projects/1'), 'Normal');
    assertTaskPriority(await get('/projects/1'), 8, 'Low');
    await post('/projects/1/tasks', { title: 'Later normal' });
    assertTaskPriority(await get('/projects/1'), 9, 'Normal');
  } finally {
    if (running) await running.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('inclusive due ranges combine with filters, preserve applied state, and remain usable when archived', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.workboard-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let running;
  try {
    running = await start(databasePath);
    const get = async (path) => (await fetch(`${running.baseUrl}${path}`)).text();
    const post = (path, values = {}) => fetch(`${running.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const titles = (html) => [...html.matchAll(/data-testid="task-row"[^>]*>\s*<span>(.*?)<\/span>/g)]
      .map((match) => match[1]);
    const hiddenFields = (html, action) => {
      const form = [...html.matchAll(/<form[^>]*action="([^"]+)"[^>]*>([\s\S]*?)<\/form>/g)]
        .find((match) => match[1] === action);
      assert.ok(form, `Missing form ${action}`);
      return Object.fromEntries([...form[2].matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)]
        .map((match) => [match[1], match[2]]));
    };
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Other' });
    for (const [index, title, date, priority, completed] of [
      [1, 'Undated', '', 'High', '1'],
      [2, 'Before', '2026-01-01', 'High', '1'],
      [3, 'From', '2026-02-01', 'High', '1'],
      [4, 'Inside', '2026-02-15', 'High', '1'],
      [5, 'Through', '2026-02-28', 'High', '1'],
      [6, 'After', '2026-03-01', 'High', '1'],
      [7, 'Open', '2026-02-15', 'High', ''],
      [8, 'Low', '2026-02-15', 'Low', '1'],
    ]) {
      await post('/projects/1/tasks', { title });
      await post(`/projects/1/tasks/${index}/due-date`, { dueDate: date });
      await post(`/projects/1/tasks/${index}/priority`, { priority });
      await post(`/projects/1/tasks/${index}/completion`, { completed });
    }
    const originalList = await get('/');
    assert.match(originalList, /data-testid="project-summary">7\/8 completed/);
    const initial = await get('/projects/1');
    assert.match(initial, /<label for="due-from">Due from<\/label>/);
    assert.match(initial, /<label for="due-through">Due through<\/label>/);
    assert.match(initial, /id="due-from"[^>]*value=""/);
    assert.match(initial, /id="due-through"[^>]*value=""/);
    const apply = async (html, dueFrom, dueThrough) => post('/projects/1/due-range', {
      ...hiddenFields(html, '/projects/1/due-range'), dueFrom, dueThrough,
    });
    // Exercise the actual form state, inclusive endpoints and each unbounded side.
    for (const [from, through, expected] of [
      ['', '', ['Undated', 'Before', 'From', 'Inside', 'Through', 'After', 'Open', 'Low']],
      ['', '2026-02-01', ['Before', 'From']],
      ['2026-02-28', '', ['Through', 'After']],
      ['2026-02-15', '2026-02-15', ['Inside', 'Open', 'Low']],
      [' 2026-02-01 ', ' 2026-02-28 ', ['From', 'Inside', 'Through', 'Open', 'Low']],
    ]) {
      const response = await apply(initial, from, through);
      assert.equal(response.status, 303);
      assert.deepEqual(titles(await get(response.headers.get('location'))), expected);
    }
    const path = '/projects/1?filter=Completed&priorityFilter=High&dueFrom=2026-02-01&dueThrough=2026-02-28';
    let html = await get(path);
    assert.deepEqual(titles(html), ['From', 'Inside', 'Through']);
    const filters = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2026-02-01', dueThrough: '2026-02-28' };
    assert.deepEqual(hiddenFields(html, '/projects/1/tasks/3/due-date'), filters);
    // Combobox submissions carry the applied range while retaining the other selection.
    const fields = hiddenFields(html, '/projects/1');
    assert.deepEqual(fields, { dueFrom: filters.dueFrom, dueThrough: filters.dueThrough });
    assert.deepEqual(titles(await get(`/projects/1?${new URLSearchParams({ ...fields, filter: 'Open', priorityFilter: 'High' })}`)), ['Open']);
    assert.deepEqual(titles(await get(`/projects/1?${new URLSearchParams({ ...fields, filter: 'Completed', priorityFilter: 'Low' })}`)), ['Low']);
    for (const [from, through, error] of [
      ['2026-02-30', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['', '1900-02-29', 'Due range must use valid YYYY-MM-DD dates'],
      ['0000-01-01', '9999-12-31', 'Due range must use valid YYYY-MM-DD dates'],
      ['2026-03-01', '2026-02-28', 'Due from must not be after Due through'],
    ]) {
      const response = await apply(html, from, through);
      assert.equal(response.status, 400);
      const invalidHtml = await response.text();
      assert.match(invalidHtml, new RegExp(`role="alert"[^>]*>${error}`));
      assert.deepEqual(titles(invalidHtml), ['From', 'Inside', 'Through']);
      assert.deepEqual(hiddenFields(invalidHtml, '/projects/1/tasks/3/due-date'), filters);
    }
    assert.equal(await get('/'), originalList);
    // All editing paths retain all filters; membership reacts to saved changes.
    const edit = async (action, values, expected) => {
      const response = await post(action, { ...hiddenFields(html, action), ...values });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), path);
      html = await get(path);
      assert.deepEqual(titles(html), expected);
    };
    await edit('/projects/1/tasks/3/rename', { title: ' Renamed from ' }, ['Renamed from', 'Inside', 'Through']);
    await edit('/projects/1/rename', { name: ' Renamed project ' }, ['Renamed from', 'Inside', 'Through']);
    await edit('/projects/1/default-priority', { priority: 'Low' }, ['Renamed from', 'Inside', 'Through']);
    await edit('/projects/1/tasks', { title: 'Created undated' }, ['Renamed from', 'Inside', 'Through']);
    await edit('/projects/1/tasks/3/due-date', { dueDate: '2026-03-01' }, ['Inside', 'Through']);
    await edit('/projects/1/tasks/4/priority', { priority: 'Low' }, ['Through']);
    await edit('/projects/1/tasks/5/completion', {}, []);
    assert.match(await get('/'), /data-testid="project-summary">6\/9 completed/);
    assert.deepEqual(titles(await get('/projects/2')), []);
    const saved = await get('/projects/1');
    const savedList = await get('/');
    assert.match(saved, /aria-label="Complete Renamed from" checked/);
    assert.match(saved, /id="task-due-date-3"[^>]*value="2026-03-01"/);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get('/projects/1'), saved);
    assert.equal(await get('/'), savedList);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    const applied = await apply(archived, '2026-02-15', '2026-02-15');
    assert.equal(applied.status, 303);
    const archivedRange = applied.headers.get('location');
    const archivedHtml = await get(archivedRange);
    assert.deepEqual(titles(archivedHtml), ['Inside', 'Open', 'Low']);
    assert.match(archivedHtml, /id="task-due-date-4"[^>]* disabled/);
    for (const id of ['due-from', 'due-through']) {
      const control = new RegExp(`<input id="${id}"[^>]*>`).exec(archivedHtml)[0];
      assert.doesNotMatch(control, / disabled/);
    }
    assert.match(archivedHtml, /<button type="submit">Apply due range<\/button>/);
    assert.equal((await post('/projects/1/tasks/4/due-date', { dueDate: '', ...filters })).status, 409);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get(archivedRange), archivedHtml);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), saved);
    const cleared = await apply(await get(archivedRange), ' \t ', '');
    assert.equal(cleared.headers.get('location'), '/projects/1');
    assert.deepEqual(titles(await get('/projects/1')), titles(saved));
    // Opening from the list has no range or combobox state in the target URL.
    assert.match(await get('/'), /action="\/projects\/1"><button type="submit">Open project/);
    assert.match(await get('/projects/1'), /id="due-from"[^>]*value=""/);
  } finally {
    if (running) await running.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('moves preserve remembered order, data and filters, validate ownership, and survive restarts', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.workboard-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0,
      default_priority TEXT NOT NULL DEFAULT 'Normal');
    INSERT INTO projects (name, archived, default_priority) VALUES
      ('Source', 0, 'Normal'), ('Destination', 0, 'Low'), ('Archived', 1, 'Normal'), ('Last', 0, 'Normal');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal',
      due_date TEXT NOT NULL DEFAULT '');
    INSERT INTO tasks (project_id, title, completed, priority, due_date) VALUES
      (1, 'Dated move', 1, 'High', '2026-02-01'),
      (2, 'Destination first', 0, 'Low', ''),
      (1, 'Blank move', 0, 'Normal', ''),
      (1, 'Source stays', 1, 'High', '2026-02-28'),
      (2, 'Destination last', 1, 'Normal', ''),
      (3, 'Archived task', 1, 'High', '0001-01-01');`);
  legacy.close();
  let running;
  try {
    running = await start(databasePath);
    const get = async (path) => (await fetch(`${running.baseUrl}${path}`)).text();
    const post = (path, values = {}) => fetch(`${running.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const titles = (html) => [...html.matchAll(/data-testid="task-row"[^>]*>\s*<span>(.*?)<\/span>/g)]
      .map((match) => match[1]);
    const moveForm = (html, projectId, taskId) => {
      const action = `/projects/${projectId}/tasks/${taskId}/move`;
      const form = [...html.matchAll(/<form[^>]*action="([^"]+)"[^>]*>([\s\S]*?)<\/form>/g)]
        .find((match) => match[1] === action);
      assert.ok(form, `Missing ${action}`);
      return form[2];
    };
    const fields = (form) => Object.fromEntries([...form.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)]
      .map((match) => [match[1], match[2]]));
    const options = (form) => [...form.matchAll(/<option value="(\d+)">(.*?)<\/option>/g)]
      .map((match) => [Number(match[1]), match[2]]);
    const summary = (html, projectId) => {
      const row = [...html.matchAll(/data-testid="project-row"[^>]*>([\s\S]*?)<\/div>/g)]
        .find((match) => match[1].includes(`action="/projects/${projectId}"`));
      assert.ok(row);
      return /data-testid="project-summary">([^<]+)/.exec(row[1])[1];
    };
    assert.deepEqual(titles(await get('/projects/1')), ['Dated move', 'Blank move', 'Source stays']);
    assert.deepEqual(options(moveForm(await get('/projects/1'), 1, 1)), [[2, 'Destination'], [4, 'Last']]);
    await post('/projects/2/rename', { name: 'Renamed & destination' });
    assert.deepEqual(options(moveForm(await get('/projects/1'), 1, 1)), [[2, 'Renamed &amp; destination'], [4, 'Last']]);
    const filters = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2026-02-01', dueThrough: '2026-02-28' };
    const path = `/projects/1?${new URLSearchParams(filters)}`;
    let html = await get(path);
    assert.deepEqual(titles(html), ['Dated move', 'Source stays']);
    const form = moveForm(html, 1, 1);
    assert.match(form, /<label for="destination-project-1">Destination project<\/label>/);
    assert.deepEqual(fields(form), filters);
    const moved = await post('/projects/1/tasks/1/move', { ...fields(form), destinationProject: '2' });
    assert.equal(moved.status, 303);
    assert.equal(moved.headers.get('location'), path);
    html = await get(path);
    assert.deepEqual(titles(html), ['Source stays']);
    assert.deepEqual(fields(moveForm(html, 1, 4)), filters);
    const destination = await get('/projects/2');
    assert.deepEqual(titles(destination), ['Destination first', 'Destination last', 'Dated move']);
    assert.match(destination, /aria-label="Complete Dated move" checked/);
    assert.match(destination, /id="task-priority-1"[^>]*>\s*<option>Low<\/option><option>Normal<\/option><option selected>High<\/option>/);
    assert.match(destination, /id="task-due-date-1"[^>]*value="2026-02-01"/);
    assert.equal(summary(await get('/'), 1), '1/2 completed');
    assert.equal(summary(await get('/'), 2), '2/3 completed');
    // Ownership protects every edit endpoint after a move.
    for (const action of ['move', 'rename', 'completion', 'priority', 'due-date']) {
      const result = await post(`/projects/1/tasks/1/${action}`, {
        destinationProject: '2', title: 'Wrong owner', priority: 'Low', dueDate: '', completed: '1',
      });
      assert.equal(result.status, 404);
    }
    const unchanged = await get('/projects/1');
    for (const destinationProject of ['', '1', '3', '999', 'invalid', '9007199254740992']) {
      assert.equal((await post('/projects/1/tasks/3/move', { destinationProject })).status, 400);
      assert.equal(await get('/projects/1'), unchanged);
      assert.equal(await get('/projects/2'), destination);
    }
    assert.equal((await post('/projects/1/tasks/999/move', { destinationProject: '2' })).status, 404);
    // Undated tasks retain their empty dates, and new tasks follow moved tasks.
    await post('/projects/1/tasks/3/move', { destinationProject: '2', ...filters });
    await post('/projects/2/tasks', { title: 'New destination task' });
    assert.deepEqual(titles(await get('/projects/2')), ['Destination first', 'Destination last', 'Dated move', 'Blank move', 'New destination task']);
    assert.match(await get('/projects/2'), /id="task-due-date-3"[^>]*value=""/);
    await post('/projects/2/tasks/1/rename', { title: 'Renamed moved task' });
    await post('/projects/2/tasks/1/move', { destinationProject: '1' });
    assert.deepEqual(titles(await get(path)), ['Renamed moved task', 'Source stays']);
    await post('/projects/1/tasks', { title: 'New source task', ...filters });
    assert.deepEqual(titles(await get('/projects/1')), ['Renamed moved task', 'Source stays', 'New source task']);
    const savedSource = await get('/projects/1');
    const savedDestination = await get('/projects/2');
    const savedList = await get('/');
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get('/projects/1'), savedSource);
    assert.equal(await get('/projects/2'), savedDestination);
    assert.equal(await get('/'), savedList);
    // Archival blocks sources and removes destinations, including direct requests.
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    const archivedForm = moveForm(archived, 1, 1);
    assert.match(archivedForm, /<select[^>]* disabled>/);
    assert.match(archivedForm, /<button type="submit" disabled>Move task<\/button>/);
    assert.equal((await post('/projects/1/tasks/1/move', { destinationProject: '2' })).status, 409);
    assert.deepEqual(options(moveForm(await get('/projects/2'), 2, 3)), [[4, 'Last']]);
    assert.equal((await post('/projects/2/tasks/3/move', { destinationProject: '1' })).status, 400);
    await post('/projects/4/archive');
    const archivedBeforeRestart = await get('/projects/1');
    const noDestination = moveForm(await get('/projects/2'), 2, 3);
    assert.deepEqual(options(noDestination), []);
    assert.match(noDestination, /<select[^>]* disabled>/);
    assert.match(noDestination, /<button type="submit" disabled>Move task<\/button>/);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get('/projects/1'), archivedBeforeRestart);
    await post('/projects/1/restore');
    const restoredForm = moveForm(await get('/projects/1'), 1, 1);
    assert.doesNotMatch(restoredForm, / disabled/);
    assert.deepEqual(options(restoredForm), [[2, 'Renamed &amp; destination']]);
    await post('/projects/1/tasks/1/move', { destinationProject: '2', ...filters });
    assert.deepEqual(titles(await get(path)), ['Source stays']);
    assert.deepEqual(titles(await get('/projects/2')), ['Destination first', 'Destination last', 'Renamed moved task', 'Blank move', 'New destination task']);
    assert.equal(summary(await get('/'), 1), '1/2 completed');
    assert.equal(summary(await get('/'), 2), '2/5 completed');
  } finally {
    if (running) await running.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('per-project positions migrate current order, reserve absent slots, and restore multiple tasks across restarts', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.workboard-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0,
      default_priority TEXT NOT NULL DEFAULT 'Normal');
    INSERT INTO projects (name) VALUES ('Origin'), ('Second'), ('Third');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal',
      due_date TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0);
    INSERT INTO tasks (project_id, title, position) VALUES
      (1, 'Middle', 20), (1, 'Last', 30), (1, 'First', 10),
      (2, 'Second resident', 1), (3, 'Third resident', 1);`);
  legacy.close();
  let running;
  try {
    running = await start(databasePath);
    const get = async (path) => (await fetch(`${running.baseUrl}${path}`)).text();
    const post = (path, values = {}) => fetch(`${running.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const titles = async (projectId) => [...(await get(`/projects/${projectId}`))
      .matchAll(/data-testid="task-row"[^>]*>\s*<span>(.*?)<\/span>/g)].map((match) => match[1]);
    const move = async (taskId, source, destination) => {
      assert.equal((await post(`/projects/${source}/tasks/${taskId}/move`, {
        destinationProject: String(destination),
      })).status, 303);
    };
    const restart = async () => {
      await running.stop();
      running = undefined;
      running = await start(databasePath);
    };
    assert.deepEqual(await titles(1), ['First', 'Middle', 'Last']);
    // Send tasks in a different order: each new destination has its own order.
    await move(2, 1, 2);
    await move(3, 1, 2);
    await move(1, 1, 2);
    assert.deepEqual(await titles(1), []);
    assert.deepEqual(await titles(2), ['Second resident', 'Last', 'First', 'Middle']);
    await restart();
    // All original positions are absent. A new task must still come after them.
    await post('/projects/1/tasks', { title: 'New origin task' });
    await move(5, 3, 1);
    await post('/projects/1/rename', { name: 'Renamed origin' });
    await post('/projects/1/archive');
    assert.equal((await post('/projects/2/tasks/1/move', { destinationProject: '1' })).status, 400);
    await restart();
    await post('/projects/1/restore');
    // Returning order is independent of return sequence and project renaming.
    await move(2, 2, 1);
    await move(1, 2, 1);
    await move(3, 2, 1);
    assert.deepEqual(await titles(1), ['First', 'Middle', 'Last', 'New origin task', 'Third resident']);
    // Current fields, rather than historical fields, travel back with the task.
    await post('/projects/1/tasks/3/rename', { title: 'Updated first' });
    await post('/projects/1/tasks/3/completion', { completed: '1' });
    await post('/projects/1/tasks/3/priority', { priority: 'High' });
    await post('/projects/1/tasks/3/due-date', { dueDate: '0001-01-01' });
    // Second's absent positions are reserved for new tasks as well.
    await post('/projects/2/tasks', { title: 'New second task' });
    await move(1, 1, 2);
    await move(3, 1, 2);
    await move(2, 1, 2);
    assert.deepEqual(await titles(2), ['Second resident', 'Last', 'Updated first', 'Middle', 'New second task']);
    // A third project's remembered positions are independent of both others.
    await move(3, 2, 3);
    await move(1, 2, 3);
    await move(5, 1, 3);
    assert.deepEqual(await titles(3), ['Third resident', 'Updated first', 'Middle']);
    await restart();
    await move(1, 3, 2);
    await move(3, 3, 2);
    assert.deepEqual(await titles(2), ['Second resident', 'Last', 'Updated first', 'Middle', 'New second task']);
    const html = await get('/projects/2');
    assert.match(html, /aria-label="Complete Updated first" checked/);
    assert.match(html, /id="task-priority-3"[^>]*>\s*<option>Low<\/option><option>Normal<\/option><option selected>High<\/option>/);
    assert.match(html, /id="task-due-date-3"[^>]*value="0001-01-01"/);
    await move(2, 2, 1);
    await move(3, 2, 1);
    await move(1, 2, 1);
    assert.deepEqual(await titles(1), ['Updated first', 'Middle', 'Last', 'New origin task']);
    await restart();
    assert.deepEqual(await titles(1), ['Updated first', 'Middle', 'Last', 'New origin task']);
    // Repeated moves never allocate another position for a known membership.
    const database = new DatabaseSync(databasePath);
    try {
      assert.deepEqual(database.prepare(`SELECT project_id, position FROM task_project_positions
        WHERE task_id = 3 ORDER BY project_id`).all().map((row) => ({ ...row })), [
        { project_id: 1, position: 10 },
        { project_id: 2, position: 3 },
        { project_id: 3, position: 2 },
      ]);
    } finally {
      database.close();
    }
  } finally {
    if (running) await running.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('search intersects filters, survives edits and moves, and resets at navigation boundaries', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.workboard-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let running;
  try {
    running = await start(databasePath);
    const get = async (path) => (await fetch(`${running.baseUrl}${path}`)).text();
    const post = (path, values = {}) => fetch(`${running.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const taskTitles = (html) => [...html.matchAll(/data-testid="task-row"[^>]*>\s*<span>(.*?)<\/span>/g)]
      .map((match) => match[1]);
    const projectNames = (html) => [...html.matchAll(/data-testid="project-row"[^>]*>\s*<span>(.*?)<\/span>/g)]
      .map((match) => match[1]);
    const formAt = (html, action) => [...html.matchAll(/<form[^>]*action="([^"]+)"[^>]*>([\s\S]*?)<\/form>/g)]
      .find((match) => match[1] === action)?.[2];
    const fields = (form) => Object.fromEntries([...form.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)]
      .map((match) => [match[1], match[2]]));
    for (const name of ['Alpha  board', 'ALPHA board', 'Beta', 'Archived alpha']) {
      await post('/projects', { name });
    }
    await post('/projects/4/archive');
    let html = await get('/?search=%20aLpHa%20');
    assert.deepEqual(projectNames(html), ['Alpha  board', 'ALPHA board']);
    assert.match(html, /<label for="project-search">Project search<\/label>/);
    assert.match(html, /<button type="submit">Search projects<\/button>/);
    assert.deepEqual(fields(formAt(html, '/')), { search: 'aLpHa' });
    assert.deepEqual(projectNames(await get('/?filter=Archived&search=aLpHa')), ['Archived alpha']);
    assert.deepEqual(projectNames(await get('/?search=alpha++board')), ['Alpha  board']);
    assert.deepEqual(projectNames(await get('/?search=%20%20')), ['Alpha  board', 'ALPHA board', 'Beta']);
    assert.deepEqual(projectNames(await get('/')), ['Alpha  board', 'ALPHA board', 'Beta']);
    // Search and filter forms carry each other's applied values.
    assert.match(html, /<form method="get" action="\/projects\/1"><button type="submit">Open project/);
    const creation = await post('/projects', { name: 'New alpha', search: 'alpha', filter: 'Active' });
    assert.equal(creation.headers.get('location'), '/?search=alpha');
    const invalidProject = await post('/projects', { name: ' ', search: 'alpha', filter: 'Active' });
    assert.deepEqual(projectNames(await invalidProject.text()), ['Alpha  board', 'ALPHA board', 'New alpha']);
    assert.equal((await post('/projects/5/archive', { search: 'alpha' })).headers.get('location'), '/?search=alpha');
    assert.equal((await post('/projects/5/restore', { search: 'alpha' })).headers.get('location'), '/?filter=Archived&search=alpha');

    for (const title of ['Alpha  item', 'ALPHA item', 'Alpha late', 'Beta item', 'Alpha undated']) {
      await post('/projects/1/tasks', { title });
    }
    for (let id = 1; id <= 5; id++) {
      await post(`/projects/1/tasks/${id}/priority`, { priority: 'High' });
      await post(`/projects/1/tasks/${id}/completion`, { completed: '1' });
      if (id !== 5) await post(`/projects/1/tasks/${id}/due-date`, {
        dueDate: id === 3 ? '2026-03-01' : '2026-02-15',
      });
    }
    const filters = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2026-02-01', dueThrough: '2026-02-28', search: 'aLpHa' };
    const path = `/projects/1?${new URLSearchParams(filters)}`;
    html = await get(path);
    assert.deepEqual(taskTitles(html), ['Alpha  item', 'ALPHA item']);
    assert.match(html, /<label for="task-search">Task search<\/label>/);
    assert.match(html, /<button type="submit">Search tasks<\/button>/);
    assert.match(html, /id="task-search"[^>]*value="aLpHa"/);
    for (const match of html.matchAll(/<form method="post"[^>]*>([\s\S]*?)<\/form>/g)) {
      assert.equal(fields(match[1]).search, 'aLpHa');
    }
    const filterForm = [...html.matchAll(/<form[^>]*class="task-filter">([\s\S]*?)<\/form>/g)][0][1];
    assert.deepEqual(fields(filterForm), { dueFrom: filters.dueFrom, dueThrough: filters.dueThrough, search: filters.search });
    const searchForm = [...html.matchAll(/<form[^>]*class="search-form">([\s\S]*?)<\/form>/g)][0][1];
    assert.deepEqual(fields(searchForm), { filter: filters.filter, priorityFilter: filters.priorityFilter, dueFrom: filters.dueFrom, dueThrough: filters.dueThrough });
    assert.deepEqual(taskTitles(await get(path.replace('search=aLpHa', 'search=alpha++item'))), ['Alpha  item']);
    assert.deepEqual(taskTitles(await get(path.replace('search=aLpHa', 'search='))), ['Alpha  item', 'ALPHA item', 'Beta item']);
    assert.deepEqual(taskTitles(await get(path.replace('filter=Completed', 'filter=Open'))), []);
    assert.deepEqual(taskTitles(await get(path.replace('priorityFilter=High', 'priorityFilter=Low'))), []);
    const appliedRange = await post('/projects/1/due-range', filters);
    assert.equal(appliedRange.headers.get('location'), path);
    const listBefore = await get('/');
    assert.match(listBefore, /data-testid="project-summary">5\/5 completed/);
    await get('/projects/1?search=not-present');
    await get('/?search=not-present');
    assert.equal(await get('/'), listBefore);
    const edit = async (action, values) => {
      const response = await post(action, { ...filters, ...values });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), path);
      return get(path);
    };
    assert.deepEqual(taskTitles(await edit('/projects/1/tasks/1/rename', { title: 'No longer matching' })), ['ALPHA item']);
    assert.deepEqual(taskTitles(await edit('/projects/1/tasks/2/priority', { priority: 'Low' })), []);
    await edit('/projects/1/tasks/2/priority', { priority: 'High' });
    assert.deepEqual(taskTitles(await edit('/projects/1/tasks/2/completion', {})), []);
    await edit('/projects/1/tasks/2/completion', { completed: '1' });
    assert.deepEqual(taskTitles(await edit('/projects/1/tasks/2/due-date', { dueDate: '' })), []);
    await edit('/projects/1/tasks/2/due-date', { dueDate: '2026-02-15' });
    assert.deepEqual(taskTitles(await edit('/projects/1/rename', { name: 'Renamed project' })), ['ALPHA item']);
    assert.deepEqual(taskTitles(await edit('/projects/1/default-priority', { priority: 'Low' })), ['ALPHA item']);
    assert.deepEqual(taskTitles(await edit('/projects/1/tasks', { title: 'Alpha new' })), ['ALPHA item']);
    for (const [action, values] of [
      ['/projects/1/tasks/2/rename', { title: ' ' }],
      ['/projects/1/tasks/2/due-date', { dueDate: '2026-02-30' }],
      ['/projects/1/due-range', { dueFrom: 'bad', appliedDueFrom: filters.dueFrom, appliedDueThrough: filters.dueThrough }],
    ]) {
      const response = await post(action, { ...filters, ...values });
      assert.equal(response.status, 400);
      const invalidHtml = await response.text();
      assert.deepEqual(taskTitles(invalidHtml), ['ALPHA item']);
      assert.equal(fields(formAt(invalidHtml, '/projects/1/tasks/2/rename')).search, filters.search);
    }
    assert.deepEqual(taskTitles(await edit('/projects/1/tasks/2/move', { destinationProject: '2' })), []);
    assert.deepEqual(taskTitles(await get('/projects/2?search=alpha')), ['ALPHA item']);
    await post('/projects/2/tasks/2/move', { destinationProject: '1' });
    assert.deepEqual(taskTitles(await get(path)), ['ALPHA item']);
    await post('/projects/1/archive');
    html = await get(path);
    assert.deepEqual(taskTitles(html), ['ALPHA item']);
    const archivedSearch = [...html.matchAll(/<form[^>]*class="search-form">([\s\S]*?)<\/form>/g)][0][1];
    assert.doesNotMatch(archivedSearch, /disabled/);
    assert.match(formAt(html, '/projects/1/tasks/2/rename'), /disabled/);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get(path), html);
    assert.match(await get('/projects/1'), /id="task-search"[^>]*value=""/);
    assert.match(await get('/'), /id="project-search"[^>]*value=""/);
    await post('/projects/1/restore');
    assert.deepEqual(taskTitles(await get(path)), ['ALPHA item']);
    assert.deepEqual(taskTitles(await get('/projects/1')), ['No longer matching', 'ALPHA item', 'Alpha late', 'Beta item', 'Alpha undated', 'Alpha new']);
    // Query text is safely escaped in both visible fields and retained form state.
    const unsafe = await get(`/projects/1?search=${encodeURIComponent('<tag> & "quote"')}`);
    assert.match(unsafe, /value="&lt;tag&gt; &amp; &quot;quote&quot;"/);
    assert.doesNotMatch(unsafe, /value="<tag>/);
  } finally {
    if (running) await running.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
