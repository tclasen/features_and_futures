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

test('project search uses trimmed ASCII-insensitive substrings and intersects archive filtering', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-project-search-'));
  let server;
  try {
    server = await startServer(join(directory, 'board.sqlite'));
    for (const name of ['Alpha Board', 'ALPHA  Board', 'Other', 'Älpha', '<Alpha & Board>']) {
      await create(server.baseUrl, name);
    }
    await post(server.baseUrl, '/projects/1/tasks', { title: 'Hidden by search' });
    await post(server.baseUrl, '/projects/1/tasks/1/completion', { completed: '1' });
    const list = async (fields = {}) => (await fetch(`${server.baseUrl}/?${new URLSearchParams(fields)}`)).text();
    const names = (html) => projectRows(html).map((row) => row.name);
    assert.deepEqual(names(await list({ search: '  aLpHa  ' })), ['Alpha Board', 'ALPHA  Board', '&lt;Alpha &amp; Board&gt;']);
    assert.deepEqual(names(await list({ search: 'alpha board' })), ['Alpha Board']);
    assert.deepEqual(names(await list({ search: 'alpha  board' })), ['ALPHA  Board']);
    assert.deepEqual(names(await list({ search: 'älpha' })), []); // No Unicode case folding.
    assert.deepEqual(names(await list({ search: 'Älpha' })), ['Älpha']);
    assert.equal(names(await list({ search: ' \t ' })).length, 5);
    const html = await list({ search: 'alpha' });
    assert.deepEqual(projectSummaries(html), ['1/1 completed', '0/0 completed', '0/0 completed']);
    assert.match(html, /id="project-search" name="search" type="text" value="alpha"/);
    assert.match(html, /class="project-filter">\s*<input type="hidden" name="search" value="alpha"/);
    const opened = await (await fetch(`${server.baseUrl}/projects/1`)).text();
    assert.match(opened, /id="task-search" name="search" type="text" value=""/);
    assert.match(opened, /<form action="\/" method="get"><button type="submit">Projects/);
    const archived = await post(server.baseUrl, '/projects/1/archive', { search: 'alpha' });
    assert.equal(new URL(archived.headers.get('location'), server.baseUrl).searchParams.get('search'), 'alpha');
    assert.deepEqual(names(await list({ search: 'alpha' })), ['ALPHA  Board', '&lt;Alpha &amp; Board&gt;']);
    assert.deepEqual(names(await list({ search: 'alpha', filter: 'Archived' })), ['Alpha Board']);
    assert.deepEqual(projectSummaries(await list({ search: 'alpha', filter: 'Archived' })), ['1/1 completed']);
    await post(server.baseUrl, '/projects/1/restore', { search: 'alpha' });
    assert.deepEqual(names(await list({ search: 'alpha' })), ['Alpha Board', 'ALPHA  Board', '&lt;Alpha &amp; Board&gt;']);
    assert.match(await list({ search: '"<script>' }), /value="&quot;&lt;script&gt;"/);
    assert.equal(names(await list()).length, 5);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task search intersects all filters and survives edits, validation, moves, and restart', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-search-'));
  const databasePath = join(directory, 'board.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    await create(server.baseUrl, 'Source');
    await create(server.baseUrl, 'Destination');
    for (const title of ['Alpha task', 'ALPHA  task', 'Other', 'Älpha']) {
      await post(server.baseUrl, '/projects/1/tasks', { title });
    }
    const titles = (html) => taskRows(html).map((row) => row.title);
    const get = async (fields = {}) => (await fetch(`${server.baseUrl}/projects/1?${new URLSearchParams(fields)}`)).text();
    assert.deepEqual(titles(await get({ search: '  aLpHa  ' })), ['Alpha task', 'ALPHA  task']);
    assert.deepEqual(titles(await get({ search: 'alpha task' })), ['Alpha task']);
    assert.deepEqual(titles(await get({ search: 'alpha  task' })), ['ALPHA  task']);
    assert.deepEqual(titles(await get({ search: 'älpha' })), []);
    assert.equal(titles(await get({ search: ' \t ' })).length, 4);
    await post(server.baseUrl, '/projects/1/tasks/1/priority', { priority: 'High' });
    await post(server.baseUrl, '/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
    const state = { filter: 'Open', priorityFilter: 'High', dueFrom: '2024-02-01', dueThrough: '2024-03-01', search: 'alpha' };
    assert.deepEqual(titles(await get(state)), ['Alpha task']);
    const html = await get(state);
    // Every mutation and filter form carries the applied search; the search form has only its visible input.
    for (const match of html.matchAll(/<form action="\/projects\/1[^\"]*"[^>]*>([\s\S]*?)<\/form>/g)) {
      if (match[1].includes('id="task-search"')) {
        assert.equal((match[1].match(/name="search"/g) || []).length, 1);
      } else {
        assert.match(match[1], /type="hidden" name="search" value="alpha"/);
      }
    }
    const mutate = async (path, fields, expectedTitles) => {
      const response = await post(server.baseUrl, path, { ...state, ...fields });
      assert.equal(response.status, 303);
      const location = new URL(response.headers.get('location'), server.baseUrl);
      for (const [key, value] of Object.entries(state)) assert.equal(location.searchParams.get(key), value);
      assert.deepEqual(titles(await (await fetch(location)).text()), expectedTitles);
    };
    await mutate('/projects/1/tasks/1/rename', { title: 'No match' }, []);
    await mutate('/projects/1/tasks/1/rename', { title: 'Updated Alpha' }, ['Updated Alpha']);
    await mutate('/projects/1/tasks/1/completion', { completed: '1' }, []);
    await mutate('/projects/1/tasks/1/completion', {}, ['Updated Alpha']);
    await mutate('/projects/1/tasks/1/priority', { priority: 'Low' }, []);
    await mutate('/projects/1/tasks/1/priority', { priority: 'High' }, ['Updated Alpha']);
    await mutate('/projects/1/tasks/1/due-date', { dueDate: '' }, []);
    await mutate('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' }, ['Updated Alpha']);
    await mutate('/projects/1/rename', { name: 'Renamed source' }, ['Updated Alpha']);
    await mutate('/projects/1/default-priority', { priority: 'High' }, ['Updated Alpha']);
    await mutate('/projects/1/tasks', { title: 'New Alpha' }, ['Updated Alpha']); // Undated, so excluded.
    for (const [path, fields, message] of [
      ['/projects/1/tasks/1/rename', { title: ' ' }, 'Task title is required'],
      ['/projects/1/rename', { name: ' ' }, 'Project name is required'],
      ['/projects/1/tasks/1/due-date', { dueDate: '2024-02-30' }, 'Due date must be a valid'],
    ]) {
      const response = await post(server.baseUrl, path, { ...state, ...fields });
      assert.equal(response.status, 400);
      const errorHtml = await response.text();
      assert.match(errorHtml, new RegExp(message));
      assert.match(errorHtml, /id="task-search"[^>]*value="alpha"/);
      assert.deepEqual(titles(errorHtml), ['Updated Alpha']);
    }
    const invalidRange = await get({ ...state, dueFrom: 'bad', appliedFrom: state.dueFrom, appliedThrough: state.dueThrough });
    assert.match(invalidRange, /Due range must use valid/);
    assert.deepEqual(titles(invalidRange), ['Updated Alpha']);
    assert.deepEqual(titles(await get({ ...state, filter: 'Completed' })), []);
    assert.deepEqual(titles(await get({ ...state, search: '' })), ['Updated Alpha']);
    await mutate('/projects/1/tasks/1/move', { destination: '2' }, []);
    await post(server.baseUrl, '/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(titles(await get({ search: 'alpha' })), ['Updated Alpha', 'ALPHA  task', 'New Alpha']);
    await post(server.baseUrl, '/projects/1/archive', {});
    const archived = await get(state);
    assert.deepEqual(titles(archived), ['Updated Alpha']);
    for (const id of ['task-search', 'task-filter', 'priority-filter', 'due-from', 'due-through']) {
      assert.doesNotMatch(archived, new RegExp(`id="${id}"[^>]* disabled`));
    }
    assert.match(archived, /id="task-priority-1"[^>]* disabled/);
    await post(server.baseUrl, '/projects/1/restore', {});
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(titles(await get(state)), ['Updated Alpha']);
    assert.match(await get(), /id="task-search"[^>]*value=""/);
    assert.deepEqual(projectSummaries(await (await fetch(server.baseUrl)).text()), ['0/5 completed', '0/0 completed']);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('moves append tasks, preserve saved data and filters, and enforce active ownership', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-moves-'));
  const databasePath = join(directory, 'board.sqlite');
  // A pre-move database must keep its original order when upgraded.
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Source'), ('Destination'), ('Other');
    INSERT INTO tasks (project_id, title, completed) VALUES
      (1, 'Moving', 1), (1, 'Staying', 0), (2, 'Existing', 0);
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(databasePath);
    const get = async (id, query = '') => (await fetch(`${server.baseUrl}/projects/${id}${query}`)).text();
    const titles = (html) => taskRows(html).map((row) => row.title);
    const move = (source, task, destination, fields = {}) => post(server.baseUrl,
      `/projects/${source}/tasks/${task}/move`, { destination, ...fields });
    await post(server.baseUrl, '/projects/2/rename', { name: 'Renamed destination' });
    await post(server.baseUrl, '/projects/2/default-priority', { priority: 'Low' });
    await post(server.baseUrl, '/projects/1/tasks/1/priority', { priority: 'High' });
    await post(server.baseUrl, '/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
    const options = (html) => [...html.matchAll(/<select id="destination-project-\d+"[^>]*>([\s\S]*?)<\/select>/g)]
      .map((match) => [...match[1].matchAll(/<option value="(\d+)">(.*?)<\/option>/g)].map((option) => [option[1], option[2]]));
    assert.deepEqual(options(await get(1)), [
      [['2', 'Renamed destination'], ['3', 'Other']],
      [['2', 'Renamed destination'], ['3', 'Other']],
    ]);
    for (const destination of ['1', '999', '', '2.5']) {
      assert.equal((await move(1, 1, destination)).status, 400);
      assert.deepEqual(titles(await get(1)), ['Moving', 'Staying']);
    }
    await post(server.baseUrl, '/projects/2/archive', {});
    assert.deepEqual(options(await get(1))[0], [['3', 'Other']]);
    assert.equal((await move(1, 1, '2')).status, 400);
    await post(server.baseUrl, '/projects/2/restore', {});
    assert.equal((await move(3, 1, '2')).status, 404);
    const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-03-01' };
    const response = await move(1, 1, '2', state);
    assert.equal(response.status, 303);
    const location = new URL(response.headers.get('location'), server.baseUrl);
    assert.equal(location.pathname, '/projects/1');
    for (const [key, value] of Object.entries(state)) assert.equal(location.searchParams.get(key), value);
    assert.deepEqual(titles(await (await fetch(location)).text()), []);
    assert.deepEqual(titles(await get(1)), ['Staying']);
    assert.deepEqual(titles(await get(2)), ['Existing', 'Moving']);
    const moved = await get(2);
    assert.match(moved, /aria-label="Complete Moving" checked/);
    assert.equal(priorityControls(moved)[1].selected, 'High');
    assert.match(moved, /id="task-due-date-1"[^>]*value="2024-02-29"/);
    assert.deepEqual(projectSummaries(await (await fetch(server.baseUrl)).text()), ['0/1 completed', '1/2 completed', '0/0 completed']);
    await post(server.baseUrl, '/projects/2/tasks', { title: 'Created after move' });
    assert.deepEqual(titles(await get(2)), ['Existing', 'Moving', 'Created after move']);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(titles(await get(2)), ['Existing', 'Moving', 'Created after move']);
    assert.equal(priorityControls(await get(2))[1].selected, 'High');
    assert.match(await get(2), /id="task-due-date-1"[^>]*value="2024-02-29"/);
    await post(server.baseUrl, '/projects/2/archive', {});
    assert.match(await get(2), /id="destination-project-1"[^>]* disabled/);
    assert.match(await get(2), /<button type="submit" disabled>Move task/);
    assert.equal((await move(2, 1, '1')).status, 409);
    await post(server.baseUrl, '/projects/2/restore', {});
    assert.doesNotMatch(await get(2), /id="destination-project-1"[^>]* disabled/);
    assert.equal((await move(2, 1, '1')).status, 303);
    assert.deepEqual(titles(await get(1)), ['Moving', 'Staying']);
    assert.equal((await move(2, 3, '1')).status, 303); // Blank due date stays blank.
    assert.deepEqual(titles(await get(1)), ['Moving', 'Staying', 'Existing']);
    assert.match(await get(1), /id="task-due-date-3"[^>]*value=""/);
    await post(server.baseUrl, '/projects/2/archive', {});
    await post(server.baseUrl, '/projects/3/archive', {});
    const noDestinations = await get(1);
    assert.deepEqual(options(noDestinations), [[], [], []]);
    assert.match(noDestinations, /id="destination-project-1"[^>]* disabled/);
    assert.match(noDestinations, /<button type="submit" disabled>Move task/);
    await post(server.baseUrl, '/projects/3/restore', {});
    assert.deepEqual(options(await get(1))[0], [['3', 'Other']]);
    assert.doesNotMatch(await get(1), /id="destination-project-1"[^>]* disabled/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('returning tasks restore independent project positions across restarts', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-return-order-'));
  const databasePath = join(directory, 'board.sqlite');
  // Task 011 databases may have an order different from task ID order.
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Home'), ('Away'), ('Third');
    INSERT INTO tasks (project_id, title, position) VALUES
      (1, 'Second', 2), (1, 'First', 1), (1, 'Third', 3), (2, 'Resident', 1);
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(databasePath);
    const get = async (id) => (await fetch(`${server.baseUrl}/projects/${id}`)).text();
    const titles = async (id) => taskRows(await get(id)).map((row) => row.title);
    const move = async (source, task, destination) => {
      assert.equal((await post(server.baseUrl, `/projects/${source}/tasks/${task}/move`, { destination })).status, 303);
    };
    assert.deepEqual(await titles(1), ['First', 'Second', 'Third']);
    await move(1, 2, 2);
    await move(1, 1, 2);
    await move(1, 3, 2);
    assert.deepEqual(await titles(2), ['Resident', 'First', 'Second', 'Third']);
    // New tasks follow all remembered positions, even when every previous task is away.
    assert.equal((await post(server.baseUrl, '/projects/1/tasks', { title: 'New home task' })).status, 303);
    await post(server.baseUrl, '/projects/2/tasks/2/rename', { title: 'First renamed' });
    await post(server.baseUrl, '/projects/2/tasks/2/priority', { priority: 'High' });
    await post(server.baseUrl, '/projects/2/tasks/2/completion', { completed: '1' });
    await post(server.baseUrl, '/projects/2/tasks/2/due-date', { dueDate: '2030-05-01' });
    await post(server.baseUrl, '/projects/1/rename', { name: 'Renamed home' });
    await post(server.baseUrl, '/projects/1/archive', {});
    assert.equal((await post(server.baseUrl, '/projects/2/tasks/2/move', { destination: '1' })).status, 400);
    await server.stop();
    server = await startServer(databasePath);
    await post(server.baseUrl, '/projects/1/restore', {});
    // Return in reverse order; field edits must not be reverted by order restoration.
    await move(2, 3, 1);
    await move(2, 1, 1);
    await move(2, 2, 1);
    assert.deepEqual(await titles(1), ['First renamed', 'Second', 'Third', 'New home task']);
    const returned = await get(1);
    assert.match(returned, /aria-label="Complete First renamed" checked/);
    assert.equal(priorityControls(returned)[0].selected, 'High');
    assert.match(returned, /id="task-due-date-2"[^>]*value="2030-05-01"/);
    assert.deepEqual(projectSummaries(await (await fetch(server.baseUrl)).text()), ['1/4 completed', '0/1 completed', '0/0 completed']);
    // A first arrival also follows established positions, not only resident tasks.
    await move(1, 2, 3);
    await move(1, 1, 3);
    await move(1, 3, 3);
    await move(1, 5, 2);
    await move(3, 1, 2);
    await move(3, 3, 2);
    await move(3, 2, 2);
    assert.deepEqual(await titles(2), ['Resident', 'First renamed', 'Second', 'Third', 'New home task']);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await titles(2), ['Resident', 'First renamed', 'Second', 'Third', 'New home task']);
    await move(2, 1, 3);
    await move(2, 2, 3);
    assert.deepEqual(await titles(3), ['First renamed', 'Second']);
    await move(2, 3, 3);
    assert.deepEqual(await titles(3), ['First renamed', 'Second', 'Third']);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('due ranges intersect filters, validate boundaries and survive task edits', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-ranges-'));
  let server;
  try {
    server = await startServer(join(directory, 'board.sqlite'));
    await create(server.baseUrl, 'Ranges');
    const get = async (query = '') => (await fetch(`${server.baseUrl}/projects/1${query}`)).text();
    const titles = (html) => taskRows(html).map((row) => row.title);
    for (const title of ['Undated', 'Before', 'Start', 'End', 'After']) {
      await post(server.baseUrl, '/projects/1/tasks', { title });
    }
    for (const [id, dueDate] of [[2, '2024-02-28'], [3, '2024-02-29'], [4, '2024-03-01'], [5, '2024-03-02']]) {
      await post(server.baseUrl, `/projects/1/tasks/${id}/due-date`, { dueDate });
    }
    await post(server.baseUrl, '/projects/1/tasks/3/priority', { priority: 'High' });
    await post(server.baseUrl, '/projects/1/tasks/3/completion', { completed: '1' });
    const range = { dueFrom: '2024-02-29', dueThrough: '2024-03-01' };
    const query = (fields) => `?${new URLSearchParams(fields)}`;
    assert.deepEqual(titles(await get()), ['Undated', 'Before', 'Start', 'End', 'After']);
    assert.deepEqual(titles(await get(query(range))), ['Start', 'End']);
    assert.deepEqual(titles(await get(query({ dueFrom: '2024-02-29', dueThrough: '2024-02-29' }))), ['Start']);
    assert.deepEqual(titles(await get(query({ dueFrom: ' ', dueThrough: ' ', applyDueRange: '1' }))), ['Undated', 'Before', 'Start', 'End', 'After']);
    assert.deepEqual(titles(await get(query({ dueFrom: '2024-03-01' }))), ['End', 'After']);
    assert.deepEqual(titles(await get(query({ dueThrough: '2024-02-29' }))), ['Before', 'Start']);
    assert.deepEqual(titles(await get(query({ ...range, filter: 'Completed', priorityFilter: 'High' }))), ['Start']);
    assert.deepEqual(titles(await get(query({ ...range, filter: 'Open', priorityFilter: 'High' }))), []);
    const applied = { applyDueRange: '1', appliedFrom: range.dueFrom, appliedThrough: range.dueThrough };
    for (const invalid of ['2023-02-29', '1900-02-29', '0000-01-01', '10000-01-01', '2024-2-29', '2024-04-31', '<script>']) {
      const html = await get(query({ ...applied, dueFrom: invalid, dueThrough: '' }));
      assert.match(html, /role="alert">Due range must use valid YYYY-MM-DD dates/);
      assert.deepEqual(titles(html), ['Start', 'End']);
      assert.match(html, /name="dueFrom" value="2024-02-29"/);
    }
    const reversed = await get(query({ ...applied, dueFrom: '2024-03-02', dueThrough: '2024-02-29' }));
    assert.match(reversed, /Due from must not be after Due through/);
    assert.deepEqual(titles(reversed), ['Start', 'End']);
    assert.deepEqual(titles(await get(query({ dueFrom: ' 2024-02-29 ', dueThrough: ' 2024-03-01 ' }))), ['Start', 'End']);
    for (const date of ['0001-01-01', '2000-02-29', '9999-12-31']) {
      assert.doesNotMatch(await get(query({ dueFrom: date, dueThrough: date })), /role="alert"/);
    }
    const state = { ...range, filter: 'Completed', priorityFilter: 'High' };
    for (const [path, fields] of [
      ['/rename', { name: 'Renamed project' }],
      ['/default-priority', { priority: 'Low' }],
      ['/tasks', { title: 'New undated' }],
      ['/tasks/3/rename', { title: 'Renamed task' }],
    ]) {
      const response = await post(server.baseUrl, `/projects/1${path}`, { ...state, ...fields });
      const location = response.headers.get('location');
      const params = new URL(location, server.baseUrl).searchParams;
      for (const [key, value] of Object.entries(state)) assert.equal(params.get(key), value);
      const html = await (await fetch(`${server.baseUrl}${location}`)).text();
      assert.equal(taskRows(html).length, 1);
    }
    const change = await post(server.baseUrl, '/projects/1/tasks/3/due-date', { ...state, dueDate: '2024-03-02' });
    assert.deepEqual(titles(await (await fetch(`${server.baseUrl}${change.headers.get('location')}`)).text()), []);
    await post(server.baseUrl, '/projects/1/tasks/3/due-date', { ...state, dueDate: '2024-02-29' });
    const completion = await post(server.baseUrl, '/projects/1/tasks/3/completion', state);
    assert.deepEqual(titles(await (await fetch(`${server.baseUrl}${completion.headers.get('location')}`)).text()), []);
    const priority = await post(server.baseUrl, '/projects/1/tasks/3/priority', { ...range, priorityFilter: 'High', priority: 'Low' });
    assert.deepEqual(titles(await (await fetch(`${server.baseUrl}${priority.headers.get('location')}`)).text()), []);
    await post(server.baseUrl, '/projects/1/archive', {});
    const archived = await get(query(range));
    assert.deepEqual(titles(archived), ['Renamed task', 'End']);
    assert.match(archived, /id="task-due-date-3"[^>]* disabled/);
    assert.doesNotMatch(archived, /id="due-(?:from|through)"[^>]* disabled/);
    await server.stop();
    server = await startServer(join(directory, 'board.sqlite'));
    assert.deepEqual(titles(await get(query(range))), ['Renamed task', 'End']);
    await post(server.baseUrl, '/projects/1/restore', {});
    assert.equal(taskRows(await get()).length, 6);
    assert.doesNotMatch(await get(), /id="task-due-date-3"[^>]* disabled/);
    assert.deepEqual(projectSummaries(await (await fetch(server.baseUrl)).text()), ['0/6 completed']);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('due dates validate calendar days and preserve task data through edits and restarts', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-dates-'));
  const databasePath = join(directory, 'board.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Legacy');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing', 1);
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(databasePath);
    const get = async (path = '/projects/1') => (await fetch(`${server.baseUrl}${path}`)).text();
    const controls = (html) => [...html.matchAll(/<input id="task-due-date-(\d+)"[^>]*>/g)].map((match) => ({
      id: Number(match[1]), value: match[0].match(/value="([^"]*)"/)[1], disabled: / disabled/.test(match[0]),
    }));
    await post(server.baseUrl, '/projects/1/tasks', { title: 'New' });
    await create(server.baseUrl, 'Other');
    await post(server.baseUrl, '/projects/2/tasks', { title: 'Other task' });
    assert.deepEqual(controls(await get()), [
      { id: 1, value: '', disabled: false }, { id: 2, value: '', disabled: false },
    ]);
    assert.match(await get(), /<label for="task-due-date-1">Task due date<\/label>/);
    const originalRows = taskRows(await get());
    const fields = { filter: 'Completed', priorityFilter: 'Normal' };
    const location = '/projects/1?filter=Completed&priorityFilter=Normal';
    const save = (dueDate, id = 1) => post(server.baseUrl, `/projects/1/tasks/${id}/due-date`, { ...fields, dueDate });
    for (const dueDate of ['0001-01-01', '0099-12-31', '2000-02-29', '2024-02-29', '9999-12-31', '  2026-04-30  ']) {
      const response = await save(dueDate);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), location);
      assert.equal(controls(await get())[0].value, dueDate.trim());
    }
    for (const dueDate of ['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2025-02-29',
      '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '2026-01-32', '2026-1-01',
      '26-01-01', '2026-01-1', '2026-01-01T00:00:00Z', 'not a date', '<script>']) {
      const response = await save(dueDate);
      assert.equal(response.status, 400, dueDate);
      const html = await response.text();
      assert.match(html, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.match(html, /<select id="priority-filter"[^>]*>\s*<option>All<\/option>\s*<option>Low<\/option>\s*<option selected>Normal<\/option>/);
      assert.equal(controls(html)[0].value, '2026-04-30');
    }
    assert.deepEqual(taskRows(await get()), originalRows);
    assert.deepEqual(projectSummaries(await get('/')), ['1/2 completed', '0/1 completed']);
    assert.equal((await save('2026-01-01', 3)).status, 404);
    assert.equal((await save('2026-01-01', 999)).status, 404);
    assert.equal(controls(await get('/projects/2'))[0].value, '');
    await save('2027-05-12', 2);
    await post(server.baseUrl, '/projects/1/tasks/1/rename', { title: 'Renamed', ...fields });
    await post(server.baseUrl, '/projects/1/tasks/1/priority', { priority: 'High', ...fields });
    await post(server.baseUrl, '/projects/1/tasks/1/completion', { ...fields });
    assert.deepEqual(controls(await get()).map((c) => c.value), ['2026-04-30', '2027-05-12']);
    await post(server.baseUrl, '/projects/1/archive', {});
    assert.equal((await save('2028-01-01')).status, 409);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    const archived = await get();
    assert.deepEqual(controls(archived), [
      { id: 1, value: '2026-04-30', disabled: true }, { id: 2, value: '2027-05-12', disabled: true },
    ]);
    assert.equal([...archived.matchAll(/<button type="submit" disabled>Save due date<\/button>/g)].length, 2);
    assert.deepEqual(taskRows(archived).map((r) => [r.title, r.completed]), [['Renamed', false], ['New', false]]);
    assert.deepEqual(priorityControls(archived).map((c) => c.selected), ['High', 'Normal']);
    await post(server.baseUrl, '/projects/1/restore', {});
    assert.ok(controls(await get()).every((c) => !c.disabled));
    for (const dueDate of ['', ' \t\n ']) {
      await save('2024-02-29');
      assert.equal((await save(dueDate)).status, 303);
      assert.equal(controls(await get())[0].value, '');
      assert.equal(controls(await get())[1].value, '2027-05-12');
    }
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.deepEqual(controls(await get()).map((c) => c.value), ['', '2027-05-12']);
    assert.deepEqual(projectSummaries(await get('/')), ['0/2 completed', '0/1 completed']);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project defaults migrate, persist independently and apply only to subsequent tasks', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-defaults-'));
  const databasePath = join(directory, 'board.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
    INSERT INTO projects (id, name) VALUES (7, 'Legacy');
    INSERT INTO tasks (id, project_id, title, completed, priority) VALUES (9, 7, 'Existing', 1, 'Low');
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(databasePath);
    const get = async (path = '/') => (await fetch(`${server.baseUrl}${path}`)).text();
    const first = '/projects/7';
    const second = '/projects/8';
    const defaultControl = (html) => {
      assert.match(html, /<label for="default-task-priority">Default task priority<\/label>/);
      const select = html.match(/<select id="default-task-priority"[^>]*>([\s\S]*?)<\/select>/);
      assert.ok(select);
      assert.deepEqual([...select[1].matchAll(/<option(?: selected)?>(.*?)<\/option>/g)].map((m) => m[1]), ['Low', 'Normal', 'High']);
      return { selected: select[1].match(/<option selected>(.*?)<\/option>/)[1], disabled: / disabled/.test(select[0]) };
    };
    await create(server.baseUrl, 'Other');
    assert.deepEqual(defaultControl(await get(first)), { selected: 'Normal', disabled: false });
    assert.deepEqual(defaultControl(await get(second)), { selected: 'Normal', disabled: false });
    await post(server.baseUrl, `${first}/tasks`, { title: 'Normal inherited' });
    const original = taskRows(await get(first));
    const fields = { filter: 'Completed', priorityFilter: 'Low' };
    const filteredPath = `${first}?filter=Completed&priorityFilter=Low`;
    const before = taskRows(await get(filteredPath));
    for (const priority of ['', 'Urgent', 'high']) {
      assert.equal((await post(server.baseUrl, `${first}/default-priority`, { ...fields, priority })).status, 400);
    }
    assert.equal((await post(server.baseUrl, '/projects/999/default-priority', { priority: 'High' })).status, 404);
    const changed = await post(server.baseUrl, `${first}/default-priority`, { ...fields, priority: 'High' });
    assert.equal(changed.status, 303);
    assert.equal(changed.headers.get('location'), filteredPath);
    const filtered = await get(filteredPath);
    assert.match(filtered, /<option selected>Completed<\/option>/);
    assert.match(filtered, /<select id="priority-filter"[^>]*>\s*<option>All<\/option>\s*<option selected>Low<\/option>/);
    assert.deepEqual(taskRows(filtered), before);
    assert.deepEqual(taskRows(await get(first)), original);
    assert.deepEqual(priorityControls(await get(first)).map((c) => c.selected), ['Low', 'Normal']);
    assert.deepEqual(projectSummaries(await get()), ['1/2 completed', '0/0 completed']);
    await post(server.baseUrl, `${first}/tasks`, { title: 'High inherited', ...fields });
    await post(server.baseUrl, `${second}/default-priority`, { priority: 'Low' });
    await post(server.baseUrl, `${second}/tasks`, { title: 'Other inherited' });
    await post(server.baseUrl, `${first}/default-priority`, { priority: 'Low' });
    await post(server.baseUrl, `${first}/tasks`, { title: 'Low inherited' });
    await post(server.baseUrl, `${first}/rename`, { name: 'Renamed project' });
    await post(server.baseUrl, `${first}/tasks/11/rename`, { title: 'Renamed high task' });
    const expected = taskRows(await get(first));
    assert.deepEqual(expected.map((row) => row.title), ['Existing', 'Normal inherited', 'Renamed high task', 'Low inherited']);
    const priorities = ['Low', 'Normal', 'High', 'Low'];
    assert.deepEqual(priorityControls(await get(first)).map((c) => c.selected), priorities);
    await post(server.baseUrl, `${first}/archive`, {});
    assert.equal((await post(server.baseUrl, `${first}/default-priority`, { priority: 'Normal' })).status, 409);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.deepEqual(defaultControl(await get(first)), { selected: 'Low', disabled: true });
    assert.deepEqual(defaultControl(await get(second)), { selected: 'Low', disabled: false });
    assert.deepEqual(taskRows(await get(first)), expected);
    assert.deepEqual(priorityControls(await get(first)).map((c) => c.selected), priorities);
    assert.deepEqual(projectSummaries(await get('/?filter=Archived')), ['1/4 completed']);
    assert.deepEqual(taskRows(await get(filteredPath)), before);
    await post(server.baseUrl, `${first}/restore`, {});
    assert.deepEqual(defaultControl(await get(first)), { selected: 'Low', disabled: false });
    await post(server.baseUrl, `${first}/tasks`, { title: 'After restoration' });
    assert.equal(priorityControls(await get(first)).at(-1).selected, 'Low');
    await post(server.baseUrl, `${first}/default-priority`, { priority: 'High' });
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.deepEqual(defaultControl(await get(first)), { selected: 'High', disabled: false });
    assert.deepEqual(defaultControl(await get(second)), { selected: 'Low', disabled: false });
    await post(server.baseUrl, `${first}/tasks`, { title: 'After restart' });
    assert.deepEqual(priorityControls(await get(first)).map((c) => c.selected), [...priorities, 'Low', 'High']);
    assert.deepEqual(taskRows(await get(first)).slice(0, 4), expected);
    assert.deepEqual(projectSummaries(await get()), ['1/6 completed', '0/1 completed']);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('combined filters retain selections through edits, archives and restarts', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-filters-'));
  let server;
  try {
    const databasePath = join(directory, 'board.sqlite');
    server = await startServer(databasePath);
    const get = async (path = '/') => (await fetch(`${server.baseUrl}${path}`)).text();
    await create(server.baseUrl, 'Filtered');
    const path = '/projects/1';
    for (const title of ['First', 'Second', 'Third', 'Fourth']) {
      await post(server.baseUrl, `${path}/tasks`, { title });
    }
    await post(server.baseUrl, `${path}/tasks/1/priority`, { priority: 'High' });
    await post(server.baseUrl, `${path}/tasks/3/priority`, { priority: 'High' });
    await post(server.baseUrl, `${path}/tasks/4/priority`, { priority: 'Low' });
    await post(server.baseUrl, `${path}/tasks/3/completion`, { completed: '1' });
    const selections = (html, completion, priority) => {
      for (const [id, value] of [['task-filter', completion], ['priority-filter', priority]]) {
        const select = html.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`));
        assert.ok(select);
        assert.doesNotMatch(select[0], / disabled/);
        assert.ok(select[1].includes(`<option selected>${value}</option>`));
      }
    };
    const initial = await get(path);
    selections(initial, 'All', 'All');
    assert.deepEqual([...initial.match(/<select id="priority-filter"[^>]*>([\s\S]*?)<\/select>/)[1]
      .matchAll(/<option(?: selected)?>(.*?)<\/option>/g)].map((m) => m[1]), ['All', 'Low', 'Normal', 'High']);
    const expected = {
      All: { All: ['First', 'Second', 'Third', 'Fourth'], Low: ['Fourth'], Normal: ['Second'], High: ['First', 'Third'] },
      Open: { All: ['First', 'Second', 'Fourth'], Low: ['Fourth'], Normal: ['Second'], High: ['First'] },
      Completed: { All: ['Third'], Low: [], Normal: [], High: ['Third'] },
    };
    for (const [completion, priorities] of Object.entries(expected)) {
      for (const [priority, titles] of Object.entries(priorities)) {
        const html = await get(`${path}?filter=${completion}&priorityFilter=${priority}`);
        selections(html, completion, priority);
        assert.deepEqual(taskRows(html).map((row) => row.title), titles);
      }
    }
    const fields = { filter: 'Open', priorityFilter: 'High' };
    const edit = async (action, values) => {
      const response = await post(server.baseUrl, `${path}/tasks/1/${action}`, { ...fields, ...values });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), `${path}?filter=Open&priorityFilter=High`);
      const html = await get(response.headers.get('location'));
      selections(html, 'Open', 'High');
      return html;
    };
    let html = await edit('rename', { title: ' Renamed ' });
    assert.deepEqual(taskRows(html).map((row) => row.title), ['Renamed']);
    assert.match(html, /aria-label="Complete Renamed"/);
    const invalid = await post(server.baseUrl, `${path}/tasks/1/rename`, { ...fields, title: ' ' });
    selections(await invalid.text(), 'Open', 'High');
    html = await edit('priority', { priority: 'Low' });
    assert.equal(taskRows(html).length, 0);
    await edit('priority', { priority: 'High' });
    html = await edit('completion', { completed: '1' });
    assert.equal(taskRows(html).length, 0);
    assert.deepEqual(projectSummaries(await get()), ['2/4 completed']);
    await post(server.baseUrl, `${path}/archive`, {});
    html = await get(`${path}?filter=Completed&priorityFilter=High`);
    selections(html, 'Completed', 'High');
    assert.deepEqual(taskRows(html).map((row) => row.title), ['Renamed', 'Third']);
    assert.ok(priorityControls(html).every((control) => control.disabled));
    await post(server.baseUrl, `${path}/restore`, {});
    await server.stop();
    server = await startServer(databasePath);
    html = await get(`${path}?filter=Completed&priorityFilter=High`);
    assert.deepEqual(taskRows(html).map((row) => row.title), ['Renamed', 'Third']);
    assert.ok(priorityControls(html).every((control) => !control.disabled && control.selected === 'High'));
    selections(await get(path), 'All', 'All');
    assert.deepEqual(projectSummaries(await get()), ['2/4 completed']);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

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
