import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function assertDirectorySummary(html, completed, total) {
  const summaries = [...html.matchAll(/data-testid="directory-summary">([^<]*)<\/p>/g)];
  assert.deepEqual(summaries.map((match) => match[1]), [`${completed}/${total} completed`]);
  assert.equal(html.includes('role="status">No matching tasks'), total === 0);
  const owners = directoryOwners(html);
  assert.equal(owners.reduce((sum, owner) => sum + owner.completed, 0), completed);
  assert.equal(owners.reduce((sum, owner) => sum + owner.total, 0), total);
  const ids = owners.map((owner) => owner.id);
  assert.deepEqual(ids, [...new Set(ids)].sort((left, right) => left - right));
  assert.ok(owners.every((owner) => owner.total > 0));
}

function directoryOwners(html) {
  return [...html.matchAll(/data-testid="directory-owner-row">([\s\S]*?)<\/form>\s*<\/div>/g)].map((match) => {
    const row = match[1];
    const counts = row.match(/data-testid="directory-owner-summary">(\d+)\/(\d+) completed<\/span>/);
    assert.ok(counts);
    assert.match(row, /<button type="submit">Open project<\/button>/);
    return {
      id: Number(row.match(/action="\/projects\/(\d+)"/)[1]),
      name: row.match(/data-testid="directory-owner-name">([\s\S]*?)<\/span>/)[1],
      completed: Number(counts[1]), total: Number(counts[2]),
    };
  });
}

test('directory intersects read-only filters, preserves order and literal fields across restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-directory-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  const snapshot = () => {
    const database = new DatabaseSync(databasePath);
    try {
      return ['projects', 'tasks', 'task_project_positions', 'sqlite_sequence'].map((table) =>
        database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
    } finally { database.close(); }
  };
  try {
    server = await startServer(databasePath);
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const checkedPost = async (path, values) => assert.equal((await post(path, values)).status, 303);
    const titles = (html) => [...html.matchAll(/data-testid="directory-task-title">(.*?)<\/div>/g)].map((match) => match[1]);
    const path = (state) => `/directory?${new URLSearchParams(state)}`;
    for (const name of ['First owner', 'Second owner', 'Archived owner']) await checkedPost('/projects', { name });
    for (const [project, title] of [[1, 'Plan \t  Release'], [1, 'Other'], [1, 'PLAN release deleted'], [2, 'Plan release second'], [3, 'Plan release archived']]) {
      await checkedPost(`/projects/${project}/tasks`, { title });
    }
    await checkedPost('/projects/1/tasks/1', { completed: '1' });
    await checkedPost('/projects/3/tasks/5', { completed: '1' });
    for (const [project, id] of [[1, 1], [1, 3], [2, 4], [3, 5]]) {
      await checkedPost(`/projects/${project}/tasks/${id}/priority`, { priority: 'High' });
      await checkedPost(`/projects/${project}/tasks/${id}/due-date`, { dueDate: '2028-02-29' });
    }
    const notes = ' \n日本語 📝 <script>&literal</script>\n\t ';
    await checkedPost('/projects/1/tasks/1/notes', { notes });
    await checkedPost('/projects/1/tasks/2/notes', { notes: 'NotesOnlyMatch' });
    await checkedPost('/projects/1/tasks/1/move', { destination: '2' });
    await checkedPost('/projects/2/tasks/1/move', { destination: '1' });
    await checkedPost('/projects/1/tasks/3/delete');
    await checkedPost('/projects/3/archive');
    const portable = { format: 'workboard-project', version: 1, project: {
      name: 'Copy', archived: false, defaultPriority: 'Low', tasks: [
        { title: 'Imported live', completed: false, priority: 'Low', dueDate: '', notes: '', deleted: false },
        { title: 'Imported deleted', completed: true, priority: 'High', dueDate: '2028-02-29', notes, deleted: true },
      ],
    } };
    await checkedPost('/projects/import', { importedName: 'Imported owner', json: JSON.stringify(portable) });
    const before = snapshot();
    const home = await get('/');
    assert.match(home, /action="\/directory"><button type="submit">Task directory/);
    const initial = await get('/directory');
    assertDirectorySummary(initial, 1, 4);
    for (const order of ['Original', 'Priority', 'Due date', 'Title']) {
      assertDirectorySummary(await get(path({ order })), 1, 4);
    }
    assert.deepEqual(titles(initial), ['Plan \t  Release', 'Other', 'Plan release second', 'Imported live']);
    assert.match(initial, /data-testid="directory-project-name">First owner/);
    assert.match(initial, /data-testid="directory-task-completion">Completed/);
    assert.match(initial, /data-testid="directory-task-priority">High/);
    assert.match(initial, /data-testid="directory-task-due-date">2028-02-29/);
    assert.match(initial, /data-testid="directory-task-due-date"><\/div>/);
    assert.ok(initial.includes(`data-testid="directory-task-notes"> \n日本語 📝 &lt;script&gt;&amp;literal&lt;/script&gt;\n\t </div>`));
    assert.match(initial, /\.directory-field \{ white-space: pre-wrap;/);
    assert.match(initial, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option><option>Deleted<\/option>/);
    assert.match(initial, /<option selected>All<\/option><option>Low<\/option><option>Normal<\/option><option>High<\/option>/);
    for (const row of initial.matchAll(/data-testid="directory-task-row">([\s\S]*?)<\/form>\s*<\/div>/g)) {
      assert.doesNotMatch(row[1], /<(?:input|textarea|select)\b/);
      assert.match(row[1], /action="\/projects\/\d+"><button type="submit">Open project/);
    }
    assert.match(initial, /action="\/"><button type="submit">Projects/);
    for (const search of ['NotesOnlyMatch', 'First owner', '日本語']) assert.deepEqual(titles(await get(path({ search }))), []);
    const state = { scope: 'Active', filter: 'Completed', priorityFilter: 'High', dueFrom: '2028-02-29', dueThrough: '2028-02-29', search: ' \t pLaN\t  release \n' };
    const filtered = await get(path(state));
    assertDirectorySummary(filtered, 1, 1);
    for (const [selection, completed, total] of [
      [{ ...state, filter: 'Open' }, 0, 1],
      [{ ...state, filter: 'Deleted' }, 0, 1],
      [{ ...state, filter: 'Deleted', search: '' }, 1, 2],
      [{ ...state, scope: 'Archived', filter: 'All' }, 1, 1],
      [{ ...state, dueFrom: '2028-03-01', dueThrough: '' }, 0, 0],
      [{ priorityFilter: 'Normal' }, 0, 1],
      [{ priorityFilter: 'Low' }, 0, 1],
    ]) assertDirectorySummary(await get(path(selection)), completed, total);
    assert.deepEqual(titles(filtered), ['Plan \t  Release']);
    assert.deepEqual(titles(await get(path({ ...state, filter: 'Open' }))), ['Plan release second']);
    assert.deepEqual(titles(await get(path({ ...state, filter: 'Deleted' }))), ['PLAN release deleted']);
    assert.deepEqual(titles(await get(path({ ...state, filter: 'Deleted', search: '' }))), ['PLAN release deleted', 'Imported deleted']);
    assert.deepEqual(titles(await get(path({ ...state, scope: 'Archived', filter: 'All' }))), ['Plan release archived']);
    assert.deepEqual(titles(await get(path({ ...state, dueFrom: '2028-03-01', dueThrough: '' }))), []);
    // Applied values are carried independently of draft range inputs.
    for (const form of filtered.matchAll(/<form[^>]*>[\s\S]*?<\/form>/g)) {
      if (!form[0].includes('/directory')) continue;
      assert.match(form[0], /name="dueFrom" value="2028-02-29"/);
      assert.match(form[0], /name="dueThrough" value="2028-02-29"/);
      assert.match(form[0], /name="search"[^>]*value="pLaN\t  release"/);
    }
    for (const [from, through, message] of [
      ['2027-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2028-03-01', '2028-02-29', 'Due from must not be after Due through'],
    ]) {
      const response = await post('/directory/due-range', { ...state, rangeFrom: from, rangeThrough: through });
      assert.equal(response.status, 400);
      const html = await response.text();
      assertDirectorySummary(html, 1, 1);
      assert.ok(html.includes(`role="alert">${message}`));
      assert.deepEqual(titles(html), ['Plan \t  Release']);
      assert.ok(html.includes(`name="rangeFrom" type="text" value="${from}"`));
    }
    const applied = await post('/directory/due-range', { ...state, rangeFrom: ' 2028-02-29 ', rangeThrough: '' });
    assert.equal(applied.status, 303);
    const location = applied.headers.get('location');
    assert.equal(new URL(location, server.url).searchParams.get('dueThrough'), '');
    assert.deepEqual(titles(await get(location)), ['Plan \t  Release']);
    assertDirectorySummary(await get(location), 1, 1);
    assert.equal((await post('/directory')).status, 404);
    assert.deepEqual(snapshot(), before);
    assert.equal(await get('/directory'), initial);
    assert.match(await get('/projects/3'), /Archived project/);
    assert.match(await get('/projects/1'), /id="task-search"[^>]*value=""/);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/directory'), initial);
    assert.equal(await get(path(state)), filtered);
    assert.deepEqual(snapshot(), before);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});


test('directory bulk completion targets only matching active live tasks and persists without changing fields or positions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-directory-bulk-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  const snapshot = () => {
    const database = new DatabaseSync(databasePath);
    try {
      return Object.fromEntries(['projects', 'tasks', 'task_project_positions'].map((table) =>
        [table, database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map((row) => ({ ...row }))]));
    } finally { database.close(); }
  };
  try {
    server = await startServer(databasePath);
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const post = async (path, values = {}) => {
      const response = await fetch(`${server.url}${path}`, {
        method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
      });
      assert.equal(response.status, 303);
      return response.headers.get('location');
    };
    const titles = (html) => [...html.matchAll(/data-testid="directory-task-title">(.*?)<\/div>/g)].map((match) => match[1]);
    const path = (state) => `/directory?${new URLSearchParams(state)}`;
    const assertButtons = (html, complete, reopen) => {
      assert.ok(html.includes(`<button type="submit"${complete ? '' : ' disabled'}>Complete visible tasks</button>`));
      assert.ok(html.includes(`<button type="submit" formaction="/directory/reopen"${reopen ? '' : ' disabled'}>Reopen visible tasks</button>`));
    };
    const task = (title, overrides = {}) => ({
      title, completed: false, priority: 'High', dueDate: '2028-02-29',
      notes: ' \n日本語 <b>literal</b>\n\t ', deleted: false, ...overrides,
    });
    for (const project of [
      { name: 'First', archived: false, defaultPriority: 'Low', tasks: [
        task('Plan \t Release first'), task('Plan release already', { completed: true }),
        task('Plan release low', { priority: 'Low' }), task('Plan release undated', { dueDate: '' }),
        task('Unrelated title'), task('Plan release deleted', { deleted: true }),
        task('Plan release late', { dueDate: '2028-03-01' }),
      ] },
      { name: 'Second', archived: false, defaultPriority: 'Normal', tasks: [task('PLAN release second')] },
      { name: 'Archived', archived: true, defaultPriority: 'High', tasks: [task('Plan release archived')] },
    ]) {
      await post('/projects/import', { importedName: project.name, json: JSON.stringify({ format: 'workboard-project', version: 1, project }) });
    }
    // A normal, non-imported task participates alongside imported tasks.
    await post('/projects', { name: 'Original' });
    await post('/projects/4/tasks', { title: 'Plan release original' });
    await post('/projects/4/tasks/10/priority', { priority: 'High' });
    await post('/projects/4/tasks/10/due-date', { dueDate: '2028-02-29' });
    // Reserve positions through a move/return before changing completion.
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    const before = snapshot();
    const state = { scope: 'Active', filter: 'Open', priorityFilter: 'High', dueFrom: '2028-02-29', dueThrough: '2028-02-29', search: 'Plan\t  release' };
    const expectedOpen = ['Plan \t Release first', 'PLAN release second', 'Plan release original'];
    assert.deepEqual(titles(await get(path(state))), expectedOpen);
    assertButtons(await get(path(state)), true, false);
    assertButtons(await get(path({ ...state, filter: 'All' })), true, true);
    assertButtons(await get(path({ ...state, filter: 'Completed' })), false, true);
    for (const protectedState of [{ ...state, scope: 'Archived' }, { ...state, filter: 'Deleted' }]) {
      assertButtons(await get(path(protectedState)), false, false);
      for (const action of ['complete', 'reopen']) await post(`/directory/${action}`, protectedState);
      assert.deepEqual(snapshot(), before);
    }
    const emptyState = { ...state, search: 'missing' };
    const empty = await get(path(emptyState));
    assertDirectorySummary(empty, 0, 0);
    assertButtons(empty, false, false);
    assert.match(empty, /role="status">No matching tasks/);
    for (const action of ['complete', 'reopen']) await post(`/directory/${action}`, emptyState);
    assert.deepEqual(snapshot(), before);
    const location = await post('/directory/complete', state);
    assert.deepEqual(Object.fromEntries(new URL(location, server.url).searchParams), state);
    const completedResult = await get(location);
    assertDirectorySummary(completedResult, 0, 0);
    assertDirectorySummary(await get(path({ ...state, filter: 'All' })), 4, 4);
    assert.deepEqual(titles(completedResult), []);
    assert.match(completedResult, /role="status">No matching tasks/);
    assertButtons(completedResult, false, false);
    const expected = structuredClone(before);
    for (const row of expected.tasks) if ([1, 8, 10].includes(row.id)) row.completed = 1;
    assert.deepEqual(snapshot(), expected);
    assert.match(await get('/'), /data-testid="project-summary">2\/6 completed/);
    assert.match(await get('/'), /data-testid="project-summary">1\/1 completed/);
    const completedState = { ...state, filter: 'Completed' };
    const completedTitles = ['Plan \t Release first', 'Plan release already', 'PLAN release second', 'Plan release original'];
    assert.deepEqual(titles(await get(path(completedState))), completedTitles);
    assertDirectorySummary(await get(path(completedState)), 4, 4);
    assert.doesNotMatch(await get(path(completedState)), /No matching tasks/);
    // Repeating an action whose visible set is already completed is harmless.
    await post('/directory/complete', completedState);
    assert.deepEqual(snapshot(), expected);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(snapshot(), expected);
    assert.deepEqual(titles(await get(path(completedState))), completedTitles);
    assertDirectorySummary(await get(path(completedState)), 4, 4);
    const reopenedLocation = await post('/directory/reopen', completedState);
    assert.deepEqual(Object.fromEntries(new URL(reopenedLocation, server.url).searchParams), completedState);
    const reopenedResult = await get(reopenedLocation);
    assertDirectorySummary(reopenedResult, 0, 0);
    assertDirectorySummary(await get(path({ ...state, filter: 'All' })), 0, 4);
    assert.deepEqual(titles(reopenedResult), []);
    assert.match(reopenedResult, /No matching tasks/);
    assertButtons(reopenedResult, false, false);
    for (const row of expected.tasks) if ([1, 2, 8, 10].includes(row.id)) row.completed = 0;
    assert.deepEqual(snapshot(), expected);
    assert.match(await get('/'), /data-testid="project-summary">0\/6 completed/);
    assert.deepEqual(titles(await get(path(state))), completedTitles);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(snapshot(), expected);
    // Later movement carries the saved completion and all fields; returning keeps order.
    await post('/projects/1/tasks/1/move', { destination: '2' });
    assert.deepEqual(snapshot().tasks.find((row) => row.id === 1), {
      ...expected.tasks.find((row) => row.id === 1), project_id: 2, position: 2,
    });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(snapshot(), expected);
    assert.deepEqual(titles(await get(path(state))), completedTitles);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('directory order survives controls and bulk actions without changing stored order', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-directory-order-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  const snapshot = () => {
    const database = new DatabaseSync(databasePath);
    try {
      return ['projects', 'tasks', 'task_project_positions'].map((table) =>
        database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map((row) => ({ ...row })));
    } finally { database.close(); }
  };
  try {
    server = await startServer(databasePath);
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const post = (path, values) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const redirect = async (path, values) => {
      const response = await post(path, values);
      assert.equal(response.status, 303);
      return response.headers.get('location');
    };
    const titles = (html) => [...html.matchAll(/data-testid="directory-task-title">(.*?)<\/div>/g)].map((match) => match[1]);
    const path = (state) => `/directory?${new URLSearchParams(state)}`;
    const task = (title, priority, dueDate, deleted = false) => ({
      title, priority, dueDate, completed: false, notes: 'literal <b>notes</b>\n', deleted,
    });
    for (const project of [
      { name: 'First', archived: false, defaultPriority: 'Normal', tasks: [
        task('beta', 'Low', ''), task('Alpha', 'High', '2028-02-29'),
        task('alpha', 'Normal', '2027-01-01'), task('Deleted z', 'Low', '', true),
        task('Deleted a', 'High', '2028-02-29', true),
      ] },
      { name: 'Second', archived: false, defaultPriority: 'Low', tasks: [
        task('ALPHA', 'High', '2028-02-29'), task('Zeta', 'Normal', ''),
      ] },
      { name: 'Archived', archived: true, defaultPriority: 'High', tasks: [
        task('Archive z', 'Low', ''), task('Archive a', 'High', '2028-02-29'),
      ] },
    ]) {
      await redirect('/projects/import', { importedName: project.name, json: JSON.stringify({ format: 'workboard-project', version: 1, project }) });
    }
    const before = snapshot();
    const original = ['beta', 'Alpha', 'alpha', 'ALPHA', 'Zeta'];
    const exports = await Promise.all([1, 2, 3].map((id) => get(`/projects/${id}/export`)));
    const projectPages = await Promise.all([1, 2, 3].map((id) => get(`/projects/${id}`)));
    assert.match(await get('/directory'), /<option selected>Original<\/option><option>Priority<\/option><option>Due date<\/option><option>Title<\/option>/);
    for (const [order, expected] of [
      ['Original', original], ['Priority', ['Alpha', 'ALPHA', 'alpha', 'Zeta', 'beta']],
      ['Due date', ['alpha', 'Alpha', 'ALPHA', 'beta', 'Zeta']],
      ['Title', ['Alpha', 'alpha', 'ALPHA', 'beta', 'Zeta']],
    ]) {
      const html = await get(path({ order }));
      assert.deepEqual(titles(html), expected);
      assertDirectorySummary(html, 0, 5);
    }
    assert.deepEqual(titles(await get(path({ order: 'invalid' }))), original);
    for (const order of ['Priority', 'Due date', 'Title']) {
      assert.deepEqual(titles(await get(path({ order, scope: 'Archived' }))), ['Archive a', 'Archive z']);
      assert.deepEqual(titles(await get(path({ order, filter: 'Deleted' }))), ['Deleted a', 'Deleted z']);
      assertDirectorySummary(await get(path({ order, scope: 'Archived' })), 0, 2);
      assertDirectorySummary(await get(path({ order, filter: 'Deleted' })), 0, 2);
    }
    const state = { scope: 'Active', filter: 'Open', priorityFilter: 'All', dueFrom: '2027-01-01', dueThrough: '2028-02-29', search: 'alpha', order: 'Due date' };
    const filtered = await get(path(state));
    assertDirectorySummary(filtered, 0, 3);
    assert.deepEqual(titles(filtered), ['alpha', 'Alpha', 'ALPHA']);
    // All directory forms carry ordering alongside applied filters/search/range.
    for (const form of filtered.matchAll(/<form[^>]*>[\s\S]*?<\/form>/g)) {
      if (!form[0].includes('/directory')) continue;
      assert.match(form[0], /name="order"/);
      assert.match(form[0], /(?:name="order" value="Due date"|<option selected>Due date<\/option>)/);
      assert.match(form[0], /name="dueFrom" value="2027-01-01"/);
      assert.match(form[0], /name="dueThrough" value="2028-02-29"/);
      assert.match(form[0], /name="search"[^>]*value="alpha"/);
    }
    assert.deepEqual(titles(await get(path({ ...state, priorityFilter: 'High' }))), ['Alpha', 'ALPHA']);
    assert.deepEqual(titles(await get(path({ ...state, search: 'beta' }))), []);
    const invalidRange = await post('/directory/due-range', { ...state, rangeFrom: '2027-02-29', rangeThrough: '' });
    assert.equal(invalidRange.status, 400);
    const invalidHtml = await invalidRange.text();
    assert.match(invalidHtml, /role="alert">Due range must use valid YYYY-MM-DD dates/);
    assert.deepEqual(titles(invalidHtml), ['alpha', 'Alpha', 'ALPHA']);
    assert.match(invalidHtml, /<option selected>Due date<\/option>/);
    const rangeLocation = await redirect('/directory/due-range', { ...state, rangeFrom: '2028-02-29', rangeThrough: '' });
    assert.deepEqual(Object.fromEntries(new URL(rangeLocation, server.url).searchParams), { ...state, dueFrom: '2028-02-29', dueThrough: '' });
    assert.deepEqual(titles(await get(rangeLocation)), ['Alpha', 'ALPHA']);
    assert.deepEqual(snapshot(), before);
    assert.deepEqual(await Promise.all([1, 2, 3].map((id) => get(`/projects/${id}/export`))), exports);
    assert.deepEqual(await Promise.all([1, 2, 3].map((id) => get(`/projects/${id}`))), projectPages);
    const completedLocation = await redirect('/directory/complete', state);
    assert.deepEqual(Object.fromEntries(new URL(completedLocation, server.url).searchParams), state);
    assert.match(await get(completedLocation), /role="status">No matching tasks/);
    const expected = structuredClone(before);
    for (const row of expected[1]) if ([2, 3, 6].includes(row.id)) row.completed = 1;
    assert.deepEqual(snapshot(), expected);
    const completedState = { ...state, filter: 'Completed' };
    assert.deepEqual(titles(await get(path(completedState))), ['alpha', 'Alpha', 'ALPHA']);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(snapshot(), expected);
    assert.deepEqual(titles(await get(path(completedState))), ['alpha', 'Alpha', 'ALPHA']);
    assert.deepEqual(titles(await get('/directory')), original);
    const reopenedLocation = await redirect('/directory/reopen', completedState);
    assert.deepEqual(Object.fromEntries(new URL(reopenedLocation, server.url).searchParams), completedState);
    assert.match(await get(reopenedLocation), /role="status">No matching tasks/);
    assert.deepEqual(snapshot(), before);
    // Directory sorting never overwrites remembered return positions.
    await redirect('/projects/1/tasks/2/move', { destination: '2' });
    await get(path({ order: 'Title' }));
    await redirect('/projects/2/tasks/2/move', { destination: '1' });
    assert.deepEqual(titles(await get('/directory')), original);
    assert.deepEqual(snapshot()[1], before[1]);
    assert.deepEqual(await Promise.all([1, 2, 3].map((id) => get(`/projects/${id}/export`))), exports);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('directory owner totals keep duplicate identities and follow resolved membership', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-directory-owners-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const post = async (path, values = {}) => {
      const response = await fetch(`${server.url}${path}`, {
        method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
      });
      assert.equal(response.status, 303);
      return response.headers.get('location');
    };
    const task = (title, completed, overrides = {}) => ({
      title, completed, priority: 'High', dueDate: '2028-02-29', notes: '', deleted: false, ...overrides,
    });
    const name = 'Same  <owner> 日本語';
    const escapedName = 'Same  &lt;owner&gt; 日本語';
    for (const project of [
      { name, archived: false, defaultPriority: 'Normal', tasks: [
        task('Zulu match', true), task('Zulu open match', false),
        task('Other', true, { priority: 'Low', dueDate: '' }),
        task('Deleted match', true, { deleted: true }),
      ] },
      { name: 'Different', archived: false, defaultPriority: 'Low', tasks: [
        task('Alpha match', false), task('Deleted match', false, { deleted: true }),
      ] },
      { name, archived: true, defaultPriority: 'High', tasks: [
        task('Archive match', true), task('Archive open match', false),
        task('Archive deleted match', true, { deleted: true }),
      ] },
      { name: 'Empty owner', archived: false, defaultPriority: 'Normal', tasks: [] },
    ]) {
      await post('/projects/import', { importedName: project.name,
        json: JSON.stringify({ format: 'workboard-project', version: 1, project }) });
    }
    // Creating and renaming to an existing name must both preserve independent IDs.
    await post('/projects', { name });
    await post('/projects/2/rename', { name: `  ${name}  ` });
    const state = { scope: 'Active', filter: 'All', priorityFilter: 'High',
      dueFrom: '2028-02-29', dueThrough: '2028-02-29', search: 'match', order: 'Title' };
    const path = (values) => `/directory?${new URLSearchParams(values)}`;
    const owner = (id, completed, total) => ({ id, name: escapedName, completed, total });
    const check = async (values, expected) => {
      const html = await get(path(values));
      assert.deepEqual(directoryOwners(html), expected);
      assertDirectorySummary(html, expected.reduce((sum, row) => sum + row.completed, 0),
        expected.reduce((sum, row) => sum + row.total, 0));
      return html;
    };
    const initial = await check(state, [owner(1, 1, 2), owner(2, 0, 1)]);
    assert.ok(initial.indexOf('directory-task-title">Alpha match') < initial.indexOf('directory-task-title">Zulu match'));
    for (const order of ['Original', 'Priority', 'Due date', 'Title']) {
      await check({ ...state, order }, [owner(1, 1, 2), owner(2, 0, 1)]);
    }
    await check({ ...state, filter: 'Completed' }, [owner(1, 1, 1)]);
    await check({ ...state, filter: 'Deleted' }, [owner(1, 1, 1), owner(2, 0, 1)]);
    await check({ ...state, scope: 'Archived' }, [owner(3, 1, 2)]);
    await check({ ...state, scope: 'Archived', filter: 'Deleted' }, [owner(3, 1, 1)]);
    await check({ ...state, search: 'missing' }, []);
    await check({ ...state, priorityFilter: 'Low' }, []);
    await check({ ...state, dueFrom: '2028-03-01', dueThrough: '' }, []);
    const invalid = await fetch(`${server.url}/directory/due-range`, {
      method: 'POST', body: new URLSearchParams({ ...state, rangeFrom: '2027-02-29', rangeThrough: '' }),
    });
    assert.equal(invalid.status, 400);
    assert.deepEqual(directoryOwners(await invalid.text()), [owner(1, 1, 2), owner(2, 0, 1)]);
    const open = { ...state, filter: 'Open' };
    const location = await post('/directory/complete', open);
    assert.deepEqual(Object.fromEntries(new URL(location, server.url).searchParams), open);
    await check(open, []);
    await check(state, [owner(1, 2, 2), owner(2, 1, 1)]);
    const completed = { ...state, filter: 'Completed' };
    await post('/directory/reopen', completed);
    await check(completed, []);
    await check(state, [owner(1, 0, 2), owner(2, 0, 1)]);
    // The owner's bare URL resets the project filters and archive restrictions remain.
    const archivedPage = await get('/projects/3');
    assert.match(archivedPage, /Archived project/);
    assert.match(archivedPage, /<button type="submit" disabled>Create task/);
    const projectPage = await get('/projects/2');
    assert.match(projectPage, /id="task-search"[^>]*value=""/);
    assert.match(projectPage, /<option selected>All<\/option>/);
    await server.stop();
    server = await startServer(databasePath);
    await check(state, [owner(1, 0, 2), owner(2, 0, 1)]);
    await check({ ...state, filter: 'Deleted' }, [owner(1, 1, 1), owner(2, 0, 1)]);
    await check({ ...state, scope: 'Archived' }, [owner(3, 1, 2)]);
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await check(state, [owner(1, 0, 1), owner(2, 0, 2)]);
    await post('/projects/2/tasks/1/move', { destination: '1' });
    await check(state, [owner(1, 0, 2), owner(2, 0, 1)]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const port = await new Promise((resolve, reject) => {
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
      const match = output.match(/listening on port (\d+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
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

