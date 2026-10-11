import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const port = await new Promise((resolvePort, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Server startup timed out')); }, 5000);
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${errors}`)); });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) { clearTimeout(timer); resolvePort(match[1]); }
    });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    stop: () => new Promise(resolveStop => {
      child.once('exit', resolveStop);
      child.kill('SIGTERM');
    }),
  };
}

test('due ranges intersect filters, validate inclusively and remain applied through edits', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/test-');
  const databasePath = resolve(directory, 'ranges.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const ids = html => [...html.matchAll(/<li data-testid="task-row">\s*<span>(.*?)<\/span>/g)].map(match => match[1]);
    const apply = (from, through, state = {}) => fetch(`${server.url}/projects/1/due-range?${new URLSearchParams({ ...state, from, through })}`, { redirect: 'manual' });
    const applied = async (from, through, state = {}) => {
      const response = await apply(from, through, state);
      assert.equal(response.status, 303);
      return get(response.headers.get('location'));
    };
    await post('/projects', { name: 'Dates' });
    for (const title of ['Undated', 'Before', 'Start', 'End', 'After']) {
      await post('/projects/1/tasks', { title });
    }
    for (const [id, dueDate] of [[2, '2024-02-28'], [3, '2024-02-29'], [4, '2024-03-01'], [5, '2024-03-02']]) {
      await post(`/projects/1/tasks/${id}/due-date`, { dueDate });
    }
    await post('/projects/1/tasks/3/priority', { priority: 'High' });
    await post('/projects/1/tasks/4/priority', { priority: 'High' });
    await post('/projects/1/tasks/3', { completed: '1' });
    const summary = await get('/');
    assert.deepEqual(ids(await applied('', '')), ['Undated', 'Before', 'Start', 'End', 'After']);
    assert.deepEqual(ids(await applied(' 2024-02-29 ', ' 2024-03-01 ')), ['Start', 'End']);
    assert.deepEqual(ids(await applied('2024-02-29', '2024-02-29')), ['Start']);
    assert.deepEqual(ids(await applied('', '2024-02-29')), ['Before', 'Start']);
    assert.deepEqual(ids(await applied('2024-03-01', '')), ['End', 'After']);
    assert.deepEqual(ids(await applied('0001-01-01', '9999-12-31')), ['Before', 'Start', 'End', 'After']);
    const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-03-01' };
    const location = `/projects/1?${new URLSearchParams(state)}`;
    let html = await get(location);
    assert.deepEqual(ids(html), ['Start']);
    assert.match(html, /id="due-from" name="from" type="text" value="2024-02-29"/);
    assert.match(html, /id="due-through" name="through" type="text" value="2024-03-01"/);
    // Every editing form carries all applied filters; the combobox form carries the range.
    for (const form of html.matchAll(/<form[^>]*>([\s\S]*?)<\/form>/g)) {
      if (!form[0].includes('action="/"')) {
        assert.match(form[1], /name="dueFrom" value="2024-02-29"/);
        assert.match(form[1], /name="dueThrough" value="2024-03-01"/);
      }
    }
    assert.deepEqual(ids(await get(`/projects/1?${new URLSearchParams({ ...state, filter: 'Open' })}`)), ['End']);
    assert.deepEqual(ids(await get(`/projects/1?${new URLSearchParams({ ...state, priorityFilter: 'Low' })}`)), []);
    for (const [from, through, message] of [
      ['2023-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['', '1900-02-29', 'Due range must use valid YYYY-MM-DD dates'],
      ['0000-01-01', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['10000-01-01', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-4-01', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-04-31', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-03-01', '2024-02-29', 'Due from must not be after Due through'],
    ]) {
      const response = await apply(from, through, state);
      assert.equal(response.status, 422);
      html = await response.text();
      assert.match(html, new RegExp(`role="alert">${message}`));
      assert.deepEqual(ids(html), ['Start']);
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.match(html, /<option selected>High<\/option>/);
      assert.match(html, /id="due-from" name="from" type="text" value="2024-02-29"/);
    }
    assert.equal(await get('/'), summary);
    const edit = async (path, values, expected) => {
      const response = await post(path, { ...state, ...values });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), location);
      html = await get(location);
      assert.deepEqual(ids(html), expected);
    };
    await edit('/projects/1/tasks/3/rename', { title: 'Renamed' }, ['Renamed']);
    await edit('/projects/1/rename', { name: 'New project' }, ['Renamed']);
    await edit('/projects/1/default-priority', { priority: 'Low' }, ['Renamed']);
    await edit('/projects/1/tasks', { title: 'New undated' }, ['Renamed']);
    await edit('/projects/1/tasks/3/due-date', { dueDate: '2024-03-02' }, []);
    await edit('/projects/1/tasks/3/due-date', { dueDate: '2024-02-29' }, ['Renamed']);
    await edit('/projects/1/tasks/3/priority', { priority: 'Low' }, []);
    await edit('/projects/1/tasks/3/priority', { priority: 'High' }, ['Renamed']);
    await edit('/projects/1/tasks/3', {}, []);
    await edit('/projects/1/tasks/3', { completed: '1' }, ['Renamed']);
    await edit('/projects/1/tasks/3/due-date', { dueDate: ' ' }, []);
    await edit('/projects/1/tasks/3/due-date', { dueDate: '2024-03-01' }, ['Renamed']);
    await post('/projects/1/archive');
    html = await applied('2024-03-01', '2024-03-01', state);
    assert.deepEqual(ids(html), ['Renamed']);
    assert.doesNotMatch(html.match(/<input id="due-from"[^>]*>/)[0], /disabled/);
    assert.doesNotMatch(html.match(/<input id="due-through"[^>]*>/)[0], /disabled/);
    assert.match(html, /<button type="submit">Apply due range<\/button>/);
    assert.match(html, /id="task-due-date-3"[^>]*disabled/);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(ids(await get(location)), ['Renamed']);
    await post('/projects/1/restore');
    assert.deepEqual(ids(await get(location)), ['Renamed']);
    html = await get('/projects/1');
    assert.deepEqual(ids(html), ['Undated', 'Before', 'Renamed', 'End', 'After', 'New undated']);
    assert.match(html, /id="due-from" name="from" type="text" value=""/);
    assert.match(html, /id="due-through" name="through" type="text" value=""/);
    assert.match(html, /id="task-due-date-3"[^>]*value="2024-03-01"/);
    assert.deepEqual(ids(await applied('  ', '\t', state)), ['Renamed']);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('optional due dates validate Gregorian days, migrate and persist without changing other task data', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/test-');
  const databasePath = resolve(directory, 'dates.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Existing'), ('Other');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Original', 1);
  `);
  legacy.close();
  let server;
  try {
    server = await start(databasePath);
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const dateInput = (html, id) => html.match(new RegExp(`<input id="task-due-date-${id}"[^>]*>`))[0];
    const snapshot = () => {
      const db = new DatabaseSync(databasePath);
      try { return db.prepare('SELECT * FROM tasks ORDER BY id').all().map(row => ({ ...row })); }
      finally { db.close(); }
    };
    assert.match(dateInput(await get('/projects/1'), 1), /type="text" value=""/);
    await post('/projects/1/tasks', { title: 'Second' });
    await post('/projects/2/tasks', { title: 'Other task' });
    assert.match(dateInput(await get('/projects/1'), 2), /value=""/);
    const before = snapshot();
    const summary = await get('/');
    const filters = { filter: 'Completed', priorityFilter: 'Normal' };
    const location = '/projects/1?filter=Completed&priorityFilter=Normal';
    const save = dueDate => post('/projects/1/tasks/1/due-date', { ...filters, dueDate });
    for (const date of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '1900-02-28', '2025-04-30']) {
      const response = await save(`  ${date}  `);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), location);
      assert.match(dateInput(await get(location), 1), new RegExp(`value="${date}"`));
    }
    for (const date of ['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2025-02-29',
      '2024-04-31', '2024-00-10', '2024-13-01', '2024-01-00', '2024-01-32', '2024-1-01',
      '24-01-01', '2024-01-01T00:00:00Z', 'not a date', '<script>']) {
      const saved = snapshot();
      const response = await save(date);
      assert.equal(response.status, 422, date);
      const html = await response.text();
      assert.match(html, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      assert.match(dateInput(html, 1), /value="2025-04-30"/);
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.match(html, /<option selected>Normal<\/option>/);
      assert.deepEqual(snapshot(), saved);
    }
    const after = snapshot();
    assert.deepEqual(after.map(({ due_date, ...row }) => row), before.map(({ due_date, ...row }) => row));
    assert.equal(after[1].due_date, '');
    assert.equal(after[2].due_date, '');
    assert.equal(await get('/'), summary);
    assert.equal((await post('/projects/2/tasks/1/due-date', { dueDate: '2024-01-01' })).status, 404);
    await post('/projects/1/tasks/1/rename', { ...filters, title: 'Renamed' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1', {});
    assert.equal(snapshot()[0].due_date, '2025-04-30');
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    for (const id of [1, 2]) {
      assert.match(dateInput(archived, id), /disabled/);
    }
    assert.equal((archived.match(/<button type="submit" disabled>Save due date<\/button>/g) || []).length, 2);
    assert.equal((await save('2024-01-01')).status, 403);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.doesNotMatch(dateInput(await get('/projects/1'), 1), /disabled/);
    assert.equal(snapshot()[0].due_date, '2025-04-30');
    for (const empty of ['', '  \t  ']) {
      await save('2024-01-01');
      assert.equal((await save(empty)).status, 303);
      assert.equal(snapshot()[0].due_date, '');
    }
    await post('/projects/1/tasks/2/due-date', { dueDate: '2030-12-31' });
    await server.stop();
    server = await start(databasePath);
    const html = await get('/projects/1');
    assert.match(dateInput(html, 1), /value=""/);
    assert.match(dateInput(html, 2), /value="2030-12-31"/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project defaults migrate, affect only new tasks, and survive independent edits and restarts', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/test-');
  const databasePath = resolve(directory, 'defaults.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
    INSERT INTO projects (name) VALUES ('Existing');
    INSERT INTO tasks (project_id, title, completed, priority) VALUES (1, 'Original', 1, 'Low');
  `);
  legacy.close();
  let server;
  try {
    server = await start(databasePath);
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const defaultSelect = html => html.match(/<select id="default-task-priority"[^>]*>[\s\S]*?<\/select>/)[0];
    const selectedDefault = (html, value) => {
      const select = defaultSelect(html);
      assert.deepEqual([...select.matchAll(/<option(?: selected)?>([^<]+)<\/option>/g)].map(match => match[1]), ['Low', 'Normal', 'High']);
      assert.match(select, new RegExp(`<option selected>${value}</option>`));
    };
    selectedDefault(await get('/projects/1'), 'Normal');
    await post('/projects', { name: 'New' });
    selectedDefault(await get('/projects/2'), 'Normal');
    const path = '/projects/1?filter=Completed&priorityFilter=Low';
    const before = await get(path);
    const summary = await get('/');
    const filters = { filter: 'Completed', priorityFilter: 'Low' };
    const response = await post('/projects/1/default-priority', { ...filters, priority: 'High' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), path);
    const after = await get(path);
    selectedDefault(after, 'High');
    assert.equal(after.replace(defaultSelect(after), ''), before.replace(defaultSelect(before), ''));
    assert.equal(await get('/'), summary);
    selectedDefault(await get('/projects/2'), 'Normal');
    for (const priority of ['', 'Urgent', 'high']) {
      assert.equal((await post('/projects/1/default-priority', { priority })).status, 422);
    }
    assert.equal((await post('/projects/999/default-priority', { priority: 'Low' })).status, 404);
    await post('/projects/1/tasks', { title: 'Inherited high' });
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Inherited low' });
    await post('/projects/2/tasks', { title: 'Independent normal' });
    await post('/projects/1/rename', { name: 'Renamed project' });
    await post('/projects/1/tasks/2/rename', { title: 'Renamed high' });
    await post('/projects/1/tasks/2', { completed: '1' });
    assert.match(await get('/'), /2\/3 completed/);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    selectedDefault(archived, 'Low');
    assert.match(defaultSelect(archived), / disabled/);
    assert.equal((await post('/projects/1/default-priority', { priority: 'Normal' })).status, 403);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.doesNotMatch(defaultSelect(await get('/projects/1')), /disabled/);
    selectedDefault(await get('/projects/1'), 'Low');
    await post('/projects/1/tasks', { title: 'After restoration' });
    const db = new DatabaseSync(databasePath);
    try {
      assert.deepEqual(db.prepare('SELECT project_id, title, completed, priority FROM tasks ORDER BY id').all().map(row => ({ ...row })), [
        { project_id: 1, title: 'Original', completed: 1, priority: 'Low' },
        { project_id: 1, title: 'Renamed high', completed: 1, priority: 'High' },
        { project_id: 1, title: 'Inherited low', completed: 0, priority: 'Low' },
        { project_id: 2, title: 'Independent normal', completed: 0, priority: 'Normal' },
        { project_id: 1, title: 'After restoration', completed: 0, priority: 'Low' },
      ]);
    } finally { db.close(); }
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('combined filters preserve selections, intersect in creation order and re-evaluate edits', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/test-');
  let server;
  try {
    const databasePath = resolve(directory, 'filters.sqlite');
    server = await start(databasePath);
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const titles = html => [...html.matchAll(/data-testid="task-row">\s*<span>([^<]*)<\/span>/g)].map(match => match[1]);
    const selections = (html, completion, priority) => {
      assert.match(html, new RegExp(`<select id="task-filter"[^>]*>[\\s\\S]*?<option selected>${completion}</option>`));
      const prioritySelect = html.match(/<select id="priority-filter"[^>]*>([\s\S]*?)<\/select>/)[1];
      assert.equal(prioritySelect.replace(/\s+/g, ''), ['All', 'Low', 'Normal', 'High'].map(value => `<option${value === priority ? ' selected' : ''}>${value}</option>`).join('').replace(/\s+/g, ''));
    };
    await post('/projects', { name: 'One' });
    const tasks = [];
    for (const priority of ['Low', 'Normal', 'High']) {
      for (const completed of [false, true]) {
        const id = tasks.length + 1;
        const title = `Task ${id}`;
        await post('/projects/1/tasks', { title });
        await post(`/projects/1/tasks/${id}/priority`, { priority });
        if (completed) await post(`/projects/1/tasks/${id}`, { completed: '1' });
        tasks.push({ title, priority, completed });
      }
    }
    selections(await get('/projects/1'), 'All', 'All');
    const summary = await get('/');
    for (const filter of ['All', 'Open', 'Completed']) {
      for (const priorityFilter of ['All', 'Low', 'Normal', 'High']) {
        const html = await get(`/projects/1?filter=${filter}&priorityFilter=${priorityFilter}`);
        selections(html, filter, priorityFilter);
        assert.deepEqual(titles(html), tasks.filter(task =>
          (filter === 'All' || task.completed === (filter === 'Completed')) &&
          (priorityFilter === 'All' || task.priority === priorityFilter)).map(task => task.title));
      }
    }
    assert.equal(await get('/'), summary);
    const selected = { filter: 'Open', priorityFilter: 'High' };
    const location = '/projects/1?filter=Open&priorityFilter=High';
    let response = await post('/projects/1/tasks/5/rename', { ...selected, title: '  Renamed  ' });
    assert.equal(response.headers.get('location'), location);
    assert.deepEqual(titles(await get(location)), ['Renamed']);
    response = await post('/projects/1/tasks/5/rename', { ...selected, title: ' ' });
    assert.equal(response.status, 422);
    const invalid = await response.text();
    selections(invalid, 'Open', 'High');
    assert.match(invalid, /Task title is required/);
    assert.match(invalid, /name="priorityFilter" value="High"/);
    assert.equal(await get('/'), summary);
    response = await post('/projects/1/tasks/5/priority', { ...selected, priority: 'Low' });
    assert.equal(response.headers.get('location'), location);
    selections(await get(location), 'Open', 'High');
    assert.deepEqual(titles(await get(location)), []);
    await post('/projects/1/tasks/5/priority', { ...selected, priority: 'High' });
    response = await post('/projects/1/tasks/5', { ...selected, completed: '1' });
    assert.equal(response.headers.get('location'), location);
    assert.deepEqual(titles(await get(location)), []);
    selections(await get(location), 'Open', 'High');
    assert.deepEqual(titles(await get('/projects/1?filter=Completed&priorityFilter=High')), ['Renamed', 'Task 6']);
    assert.match(await get('/'), /4\/6 completed/);
    await post('/projects/1/archive');
    const archived = await get('/projects/1?filter=Completed&priorityFilter=High');
    selections(archived, 'Completed', 'High');
    assert.doesNotMatch(archived, /<select id="(?:task-filter|priority-filter)"[^>]*disabled/);
    assert.equal((archived.match(/<select id="task-priority-\d+"[^>]*disabled/g) || []).length, 2);
    response = await post('/projects/1/tasks/5/priority', { ...selected, priority: 'Normal' });
    assert.equal(response.status, 403);
    selections(await response.text(), 'Open', 'High');
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/projects/1?filter=Completed&priorityFilter=High'), archived);
    await post('/projects/1/restore');
    const restored = await get('/projects/1?filter=Completed&priorityFilter=High');
    assert.deepEqual(titles(restored), ['Renamed', 'Task 6']);
    // With no other active project, only the new move controls stay disabled.
    assert.doesNotMatch(restored.replace(/<form[^>]*action="[^"]*\/move"[\s\S]*?<\/form>/g, ''), /disabled/);
    selections(await get('/projects/1'), 'All', 'All');
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('priorities migrate, remain independent, preserve task state and persist through archive and restart', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/test-');
  const databasePath = resolve(directory, 'priority.sqlite');
  const oldDatabase = new DatabaseSync(databasePath);
  oldDatabase.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('One'), ('Two');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'First', 1), (1, 'Second', 0), (2, 'Other', 0);
  `);
  oldDatabase.close();
  let server;
  try {
    server = await start(databasePath);
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const normalOptions = '<option>Low</option><option selected>Normal</option><option>High</option>';
    const highOptions = '<option>Low</option><option>Normal</option><option selected>High</option>';
    const original = await get('/projects/1');
    const summary = await get('/');
    assert.equal(original.split(normalOptions).length - 1, 3); // Two tasks and the project default.
    assert.match(original, /<label for="task-priority-1">Task priority<\/label>/);
    const changed = await post('/projects/1/tasks/1/priority', { priority: 'High', filter: 'Completed' });
    assert.equal(changed.status, 303);
    assert.equal(changed.headers.get('location'), '/projects/1?filter=Completed');
    const highPage = await get('/projects/1');
    assert.equal(highPage, original.replace(
      /(<select id="task-priority-1"[^>]*>\s*)[^<]*(?:<option[^>]*>[^<]*<\/option>){3}/,
      `$1${highOptions}`));
    assert.equal(await get('/'), summary);
    assert.doesNotMatch(await get('/projects/1?filter=Open'), /First/);
    assert.match(await get('/projects/1?filter=Completed'), /First/);
    assert.match(await get('/projects/2'), new RegExp(normalOptions));
    assert.equal((await post('/projects/2/tasks/1/priority', { priority: 'Low' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/priority', { priority: 'Low' })).status, 404);
    for (const priority of ['', 'Urgent', 'low']) {
      assert.equal((await post('/projects/1/tasks/1/priority', { priority })).status, 422);
    }
    assert.equal(await get('/projects/1'), highPage);
    await post('/projects/1/tasks/1/rename', { title: 'Renamed' });
    const renamed = highPage.replaceAll('First', 'Renamed');
    assert.equal(await get('/projects/1'), renamed);
    await post('/projects/1/tasks/2/priority', { priority: 'Low' });
    const saved = await get('/projects/1');
    assert.match(saved, /<option selected>Low<\/option><option>Normal<\/option><option>High<\/option>/);
    assert.match(saved, /aria-label="Complete Renamed" checked/);
    assert.equal(await get('/'), summary);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/projects/1'), saved);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.equal((archived.match(/<select id="task-priority-\d+"[^>]* disabled/g) || []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Normal' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), saved);
    await post('/projects/1/tasks/1/priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'New task' });
    assert.equal((await get('/projects/1')).split(normalOptions).length - 1, 2); // One task and the project default.
    assert.match(await get('/'), /data-testid="project-summary">1\/3 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task renaming preserves ownership, order, completion, filters and restart persistence', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/test-');
  const databasePath = resolve(directory, 'task-rename.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    await post('/projects', { name: 'One' });
    await post('/projects', { name: 'Two' });
    await post('/projects/1/tasks', { title: 'First' });
    await post('/projects/1/tasks', { title: 'Second' });
    await post('/projects/2/tasks', { title: 'Other' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const original = await get('/projects/1');
    const summary = await get('/');
    assert.match(original, /<label for="new-task-title-1">New task title<\/label>/);
    assert.equal((original.match(/>Rename task<\/button>/g) || []).length, 2);
    for (const title of ['', '  \t ']) {
      const invalid = await post('/projects/1/tasks/1/rename', { title, filter: 'Completed' });
      assert.equal(invalid.status, 422);
      const html = await invalid.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.equal(await get('/projects/1'), original);
    }
    assert.equal((await post('/projects/2/tasks/1/rename', { title: 'Wrong owner' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/rename', { title: 'Missing' })).status, 404);
    assert.equal((await post('/projects/999/tasks/1/rename', { title: 'Missing' })).status, 404);
    const response = await post('/projects/1/tasks/1/rename', { title: '  Renamed <task> "quoted"  ', filter: 'Completed' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1?filter=Completed');
    const renamed = await get('/projects/1');
    assert.equal(renamed, original.replaceAll('First', 'Renamed &lt;task&gt; &quot;quoted&quot;'));
    assert.match(renamed, /aria-label="Complete Renamed &lt;task&gt; &quot;quoted&quot;" checked/);
    assert.equal(await get('/'), summary);
    assert.doesNotMatch(await get('/projects/1?filter=Open'), /Renamed/);
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /<span>Second<\/span>/);
    assert.doesNotMatch(await get('/projects/2'), /Renamed|Wrong owner/);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/projects/1'), renamed);
    assert.equal(await get('/'), summary);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.equal((archived.match(/id="new-task-title-\d+"[^>]* disabled/g) || []).length, 2);
    assert.equal((archived.match(/<button type="submit" disabled>Rename task/g) || []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Forbidden' })).status, 403);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), renamed);
    await post('/projects/1/tasks/2/rename', { title: '  Renamed open  ', filter: 'Open' });
    assert.match(await get('/projects/1?filter=Open'), /aria-label="Complete Renamed open"\s+onchange/);
    await server.stop();
    server = await start(databasePath);
    assert.match(await get('/projects/1?filter=Open'), /<span>Renamed open<\/span>/);
    assert.equal(await get('/'), summary);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('renaming preserves identity, order, tasks and summary, validates and respects archives', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/test-');
  const databasePath = resolve(directory, 'rename.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Finished' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const originalPage = await get('/projects/1');
    assert.match(originalPage, /<label for="new-project-name">New project name<\/label>/);
    assert.match(originalPage, /Rename project/);
    for (const name of ['', '  \t ']) {
      const response = await post('/projects/1/rename', { name });
      assert.equal(response.status, 422);
      assert.match(await response.text(), /role="alert">Project name is required/);
      assert.equal(await get('/projects/1'), originalPage);
    }
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
    const renamed = await post('/projects/1/rename', { name: '  Renamed <project>  ', filter: 'Completed' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    let html = await get('/');
    assert.match(html, /<span>Renamed &lt;project&gt;<\/span>/);
    assert.doesNotMatch(html, /Original/);
    assert.ok(html.indexOf('Renamed &lt;project&gt;') < html.indexOf('<span>Second</span>'));
    assert.match(html, /action="\/projects\/1"/);
    assert.match(html, /data-testid="project-summary">1\/2 completed/);
    const renamedPage = await get('/projects/1');
    assert.equal(renamedPage, originalPage.replaceAll('Original', 'Renamed &lt;project&gt;'));
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/projects/1'), renamedPage);
    assert.equal(await get('/'), html);
    await post('/projects/1/archive');
    html = await get('/projects/1');
    assert.match(html, /id="new-project-name"[^>]* disabled/);
    assert.match(html, /<button type="submit" disabled>Rename project/);
    assert.equal((await post('/projects/1/rename', { name: 'Forbidden' })).status, 403);
    assert.equal(await get('/projects/1'), html);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), renamedPage);
    await post('/projects/1/rename', { name: 'Restored name' });
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/projects/1'), originalPage.replaceAll('Original', 'Restored name'));
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive migration, summaries, read-only tasks, restoration and persistence', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/test-');
  const databasePath = resolve(directory, 'archive.sqlite');
  // Simulate an existing Task 002 database, including saved task state.
  const oldDatabase = new DatabaseSync(databasePath);
  oldDatabase.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)));
    INSERT INTO projects (name) VALUES ('Existing'), ('Other');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Done', 1), (1, 'Pending', 0);
  `);
  oldDatabase.close();
  let server;
  try {
    server = await start(databasePath);
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    let html = await get('/');
    assert.match(html, /<label for="project-filter">Project filter<\/label>/);
    assert.match(html, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(html, /data-testid="project-summary">1\/2 completed/);
    assert.match(html, /data-testid="project-summary">0\/0 completed/);
    assert.equal((html.match(/Archive project/g) || []).length, 2);
    assert.doesNotMatch(html, /Restore project/);
    assert.equal((await post('/projects/999/archive')).status, 404);
    assert.equal((await post('/projects/1/archive')).status, 303);
    assert.doesNotMatch(await get('/'), /Existing/);
    html = await get('/?filter=Archived');
    assert.match(html, /Existing/);
    assert.doesNotMatch(html, /<span>Other<\/span>/);
    assert.match(html, /Open project/);
    assert.match(html, /Restore project/);
    assert.match(html, /data-testid="project-summary">1\/2 completed/);
    assert.match(html, /<option selected>Archived<\/option>/);
    html = await get('/projects/1');
    assert.match(html, /Archived project/);
    assert.match(html, /<button type="submit" disabled>Create task/);
    assert.equal((html.match(/data-testid="task-row"/g) || []).length, 2);
    assert.equal((html.match(/aria-label="Complete [^"]+"[^>]*disabled/g) || []).length, 2);
    assert.match(await get('/projects/1?filter=Completed'), /<span>Done<\/span>/);
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /<span>Pending<\/span>/);
    assert.match(await get('/projects/1?filter=Open'), /<span>Pending<\/span>/);
    assert.doesNotMatch(await get('/projects/1?filter=Open'), /<span>Done<\/span>/);
    assert.equal((await post('/projects/1/tasks', { title: 'Forbidden' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1', {})).status, 403);
    const archivedList = await get('/?filter=Archived');
    const archivedPage = await get('/projects/1');
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/?filter=Archived'), archivedList);
    assert.equal(await get('/projects/1'), archivedPage);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.doesNotMatch(await get('/?filter=Archived'), /data-testid="project-row"/);
    html = await get('/');
    assert.ok(html.indexOf('Existing') < html.indexOf('<span>Other</span>'));
    assert.match(html, /data-testid="project-summary">1\/2 completed/);
    html = await get('/projects/1');
    assert.doesNotMatch(html, /disabled|Archived project/);
    assert.match(html, /aria-label="Complete Done" checked/);
    await post('/projects/1/tasks/2', { completed: '1' });
    assert.match(await get('/'), /data-testid="project-summary">2\/2 completed/);
    await post('/projects/1/tasks', { title: 'New' });
    assert.match(await get('/'), /data-testid="project-summary">2\/3 completed/);
    await server.stop();
    server = await start(databasePath);
    assert.match(await get('/'), /data-testid="project-summary">2\/3 completed/);
    assert.doesNotMatch(await get('/projects/1'), /disabled|Archived project/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, remain project-scoped, and persist completion across restarts', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/test-');
  const databasePath = resolve(directory, 'tasks.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const post = (path, values) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    await post('/projects', { name: 'One' });
    await post('/projects', { name: 'Two' });
    let html = await get('/projects/1');
    assert.match(html, /<label for="task-title">Task title<\/label>/);
    assert.match(html, /Create task/);
    assert.match(html, /<label for="task-filter">Task filter<\/label>/);
    assert.match(html, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', '  \t ']) {
      const invalid = await post('/projects/1/tasks', { title });
      assert.equal(invalid.status, 422);
      html = await invalid.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.doesNotMatch(html, /data-testid="task-row"/);
    }
    assert.equal((await post('/projects/1/tasks', { title: '  First task  ' })).status, 303);
    await post('/projects/1/tasks', { title: 'Second <task> "quoted"' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    html = await get('/projects/1');
    assert.equal((html.match(/data-testid="task-row"/g) || []).length, 2);
    assert.match(html, /<span>First task<\/span>/);
    assert.match(html, /aria-label="Complete Second &lt;task&gt; &quot;quoted&quot;"/);
    assert.doesNotMatch(html, /\bchecked\b|Other project task/);
    assert.ok(html.indexOf('First task') < html.indexOf('Second &lt;task&gt;'));
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Missing' })).status, 404);
    await post('/projects/1/tasks/1', { completed: '1' });
    html = await get('/projects/1?filter=Completed');
    assert.match(html, /First task/);
    assert.match(html, /\bchecked\b/);
    assert.doesNotMatch(html, /Second &lt;task&gt;/);
    assert.match(html, /<option selected>Completed<\/option>/);
    html = await get('/projects/1?filter=Open');
    assert.doesNotMatch(html, /First task/);
    assert.match(html, /Second &lt;task&gt;/);
    const allBefore = await get('/projects/1');
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/projects/1'), allBefore);
    assert.match(await get('/projects/2'), /Other project task/);
    assert.doesNotMatch(await get('/projects/2'), /First task|Second &lt;task&gt;/);
    const unchecked = await post('/projects/1/tasks/1', { filter: 'Completed' });
    assert.equal(unchecked.headers.get('location'), '/projects/1?filter=Completed');
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /data-testid="task-row"/);
    assert.equal((await get('/projects/1?filter=Open')).match(/data-testid="task-row"/g).length, 2);
    await server.stop();
    server = await start(databasePath);
    assert.doesNotMatch(await get('/projects/1'), /\bchecked\b/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task moves append, preserve data and filters, enforce active ownership, and persist', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/test-');
  const databasePath = resolve(directory, 'moves.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const titles = html => [...html.matchAll(/<li data-testid="task-row">\s*<span>(.*?)<\/span>/g)].map(match => match[1]);
    await post('/projects', { name: 'Source' });
    await post('/projects/1/tasks', { title: 'Moved' });
    let html = await get('/projects/1');
    assert.match(html, /name="destination" disabled>\s*<\/select>/);
    assert.match(html, /disabled>Move task/);
    for (const name of ['Destination', 'Archived', 'Last']) await post('/projects', { name });
    await post('/projects/3/archive');
    await post('/projects/2/rename', { name: 'Renamed destination' });
    await post('/projects/2/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Remaining' });
    await post('/projects/2/tasks', { title: 'Existing' });
    await post('/projects/1/tasks/1', { completed: '1' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
    html = await get('/projects/1');
    const options = html.match(/name="destination">([\s\S]*?)<\/select>/)[1];
    assert.deepEqual([...options.matchAll(/<option value="(\d+)">(.*?)<\/option>/g)].map(m => [m[1], m[2]]), [['2', 'Renamed destination'], ['4', 'Last']]);
    for (const destination of ['1', '3', '999', '']) {
      assert.equal((await post('/projects/1/tasks/1/move', { destination })).status, 422);
    }
    assert.equal((await post('/projects/4/tasks/1/move', { destination: '2' })).status, 404);
    const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-03-01' };
    const moved = await post('/projects/1/tasks/1/move', { ...state, destination: '2' });
    assert.equal(moved.status, 303);
    const location = moved.headers.get('location');
    const parameters = new URL(location, server.url).searchParams;
    for (const [key, value] of Object.entries(state)) assert.equal(parameters.get(key), value);
    assert.deepEqual(titles(await get(location)), []);
    assert.deepEqual(titles(await get('/projects/1')), ['Remaining']);
    assert.deepEqual(titles(await get('/projects/2')), ['Existing', 'Moved']);
    html = await get('/projects/2');
    assert.match(html, /aria-label="Complete Moved" checked/);
    assert.match(html, /id="task-priority-1"[\s\S]*?<option selected>High<\/option>/);
    assert.match(html, /id="task-due-date-1" name="dueDate" type="text" value="2024-02-29"/);
    const summaries = [...(await get('/')).matchAll(/data-testid="project-summary">(.*?)<\/span>/g)].map(m => m[1]);
    assert.deepEqual(summaries, ['0/1 completed', '1/2 completed', '0/0 completed']);
    await post('/projects/2/tasks', { title: 'New after move' });
    assert.deepEqual(titles(await get('/projects/2')), ['Existing', 'Moved', 'New after move']);
    await post('/projects/2/archive');
    html = await get('/projects/2');
    assert.match(html, /name="destination" disabled>/);
    assert.match(html, /disabled>Move task/);
    assert.equal((await post('/projects/2/tasks/1/move', { destination: '1' })).status, 403);
    await post('/projects/2/restore');
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(titles(await get('/projects/2')), ['Existing', 'Moved', 'New after move']);
    assert.equal((await post('/projects/2/tasks/1/move', { destination: '1' })).status, 303);
    assert.deepEqual(titles(await get('/projects/1')), ['Moved', 'Remaining']);
    // An undated task also keeps its blank date when moved.
    assert.equal((await post('/projects/1/tasks/2/move', { destination: '2' })).status, 303);
    html = await get('/projects/2');
    assert.deepEqual(titles(html), ['Existing', 'New after move', 'Remaining']);
    assert.match(html, /id="task-due-date-2" name="dueDate" type="text" value=""/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('remembered positions migrate, reserve departed slots, and restore reverse-order returns across restarts', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/test-');
  const databasePath = resolve(directory, 'positions.sqlite');
  let server;
  try {
    const legacy = new DatabaseSync(databasePath);
    legacy.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL);
      INSERT INTO projects (name) VALUES ('Original'), ('Destination');
      INSERT INTO tasks (project_id, title, position) VALUES (1, 'First', 5), (1, 'Middle', 8), (1, 'Last', 12);
    `);
    legacy.close();
    server = await start(databasePath);
    const get = async id => (await fetch(`${server.url}/projects/${id}`)).text();
    const post = async (path, values = {}) => {
      const response = await fetch(`${server.url}${path}`, {
        method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
      });
      assert.equal(response.status, 303);
    };
    const titles = html => [...html.matchAll(/<li data-testid="task-row">\s*<span>(.*?)<\/span>/g)].map(m => m[1]);
    const move = (source, task, destination) => post(`/projects/${source}/tasks/${task}/move`, { destination });
    assert.deepEqual(titles(await get(1)), ['First', 'Middle', 'Last']);
    await move(1, 1, '2');
    await move(1, 3, '2');
    await post('/projects/1/tasks', { title: 'New' });
    await post('/projects/2/tasks/1/rename', { title: 'Changed' });
    await post('/projects/2/tasks/1/priority', { priority: 'High' });
    await post('/projects/2/tasks/1/due-date', { dueDate: '0001-01-01' });
    await post('/projects/2/tasks/1', { completed: '1' });
    await post('/projects/1/rename', { name: 'Renamed' });
    await post('/projects/1/archive');
    await server.stop();
    server = await start(databasePath);
    await post('/projects/1/restore');
    await move(2, 3, '1');
    assert.deepEqual(titles(await get(1)), ['Middle', 'Last', 'New']);
    await move(2, 1, '1');
    let html = await get(1);
    assert.deepEqual(titles(html), ['Changed', 'Middle', 'Last', 'New']);
    assert.match(html, /aria-label="Complete Changed" checked/);
    assert.match(html, /id="task-priority-1"[\s\S]*?<option selected>High<\/option>/);
    assert.match(html, /id="task-due-date-1" name="dueDate" type="text" value="0001-01-01"/);
    // Reverse arrival order also restores remembered destination positions.
    await post('/projects/2/tasks', { title: 'Destination new' });
    await move(1, 3, '2');
    await move(1, 1, '2');
    assert.deepEqual(titles(await get(2)), ['Changed', 'Last', 'Destination new']);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(titles(await get(2)), ['Changed', 'Last', 'Destination new']);
    await move(2, 1, '1');
    await move(2, 3, '1');
    assert.deepEqual(titles(await get(1)), ['Changed', 'Middle', 'Last', 'New']);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('projects validate, trim, retain creation order, navigate, and persist across restart', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/test-');
  const databasePath = resolve(directory, 'projects.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const create = name => fetch(`${server.url}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    let html = await (await fetch(server.url)).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, /Create project/);
    assert.doesNotMatch(html, /data-testid="project-row"/);
    for (const name of ['', '   \t ']) {
      const invalid = await create(name);
      html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    assert.equal((await create('  First project  ')).status, 303);
    assert.equal((await create('Second <project>')).status, 303);
    html = await (await fetch(server.url)).text();
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(html, /<span>First project<\/span>/);
    assert.ok(html.indexOf('First project') < html.indexOf('Second &lt;project&gt;'));
    const paths = [...html.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    const detail = await (await fetch(`${server.url}${paths[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*<button type="submit">Projects<\/button>/);
    const second = await (await fetch(`${server.url}${paths[1]}`)).text();
    assert.match(second, /<h1>Second &lt;project&gt;<\/h1>/);
    await server.stop();
    server = await start(databasePath);
    const persisted = await (await fetch(server.url)).text();
    assert.equal(persisted, html);
    assert.match(await (await fetch(`${server.url}${paths[0]}`)).text(), /<h1>First project<\/h1>/);
    assert.equal((await fetch(`${server.url}/projects/99999`)).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
