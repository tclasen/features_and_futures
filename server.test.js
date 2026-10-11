import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runInNewContext } from 'node:vm';

test('directory bulk priority uses the current live intersections and preserves all other data across restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-directory-priority-'));
  const dbPath = join(dir, 'workboard.sqlite');
  let app;
  try {
    app = await launch(dbPath);
    const post = (path, fields = {}) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async (path) => (await fetch(app.url + path)).text();
    const snapshot = () => {
      const db = new DatabaseSync(dbPath);
      try {
        return Object.fromEntries(['projects', 'tasks', 'task_positions'].map((table) =>
          [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map((row) => ({ ...row }))]));
      } finally { db.close(); }
    };
    const task = (title, extra = {}) => ({ title, completed: false, priority: 'High',
      dueDate: '2024-02-29', notes: '  literal 雪 <b> &\n trailing  ', deleted: false, ...extra });
    for (const [name, archived, tasks] of [
      ['Duplicate', false, [task('Match  first'), task('Match completed', { completed: true }),
        task('Match low', { priority: 'Low' }), task('Match undated', { dueDate: '' }),
        task('Match outside', { dueDate: '2024-03-01' }), task('Other'), task('Match deleted', { deleted: true })]],
      ['Duplicate', false, [task('Match\t second', { completed: true })]],
      ['Archive', true, [task('Match archived'), task('Match archived deleted', { deleted: true })]],
    ]) {
      await post('/projects/import', { name, json: JSON.stringify({
        format: 'workboard-project', version: 1,
        project: { name, archived, defaultPriority: 'Low', tasks },
      }) });
    }
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    const initial = await get('/directory');
    const select = initial.match(/<select id="visible-tasks-priority"[^>]*>([\s\S]*?)<\/select>/)[1];
    assert.deepEqual([...select.matchAll(/<option(?: selected)?>([^<]*)<\/option>/g)].map((m) => m[1]), ['Low', 'Normal', 'High']);
    assert.match(select, /<option selected>Normal/);
    assert.match(initial, /<label for="visible-tasks-priority">Visible tasks priority/);
    const pathFor = (fields) => '/directory?' + new URLSearchParams(fields);
    const selected = { scope: 'Active', filter: 'All', priorityFilter: 'High',
      dueFrom: '2024-02-29', dueThrough: '2024-02-29', searchQuery: 'MATCH', order: 'Title' };
    const before = snapshot();
    for (const fields of [
      { scope: 'Archived' }, { filter: 'Deleted' }, { searchQuery: 'absent' },
    ]) assert.match(await get(pathFor(fields)), /<button type="submit" disabled>Set visible priority/);
    for (const extra of [
      { scope: 'Archived', priority: 'Low' }, { filter: 'Deleted', priority: 'Low' },
      { searchQuery: 'absent', priority: 'Low' }, { priority: 'invalid' },
      { priority: 'high' }, { priority: '' }, {},
    ]) {
      await post('/directory/priority', { ...selected, ...extra });
      assert.deepEqual(snapshot(), before);
    }
    // Open, Completed and All each use their own resolved result across independent owners.
    let expected = structuredClone(before);
    for (const [filter, priority, ids] of [
      ['Open', 'Low', [1]], ['Completed', 'Normal', [2, 8]], ['All', 'Low', [1, 2, 8]],
    ]) {
      const fields = { ...selected, filter, priorityFilter: filter === 'All' ? 'All' : 'High' };
      const response = await post('/directory/priority', { ...fields, priority });
      assert.equal(response.status, 303);
      const location = new URL(response.headers.get('location'), app.url);
      for (const [key, value] of Object.entries(fields)) {
        assert.equal(location.searchParams.get(key) || (key === 'scope' ? 'Active' : 'All'), value);
      }
      for (const row of expected.tasks) if (ids.includes(row.id)) row.priority = priority;
      assert.deepEqual(snapshot(), expected);
      const body = await get(location.pathname + location.search);
      if (filter !== 'All') {
        assert.match(body, /data-testid="directory-summary">0\/0 completed/);
        assert.doesNotMatch(body, /data-testid="directory-owner-row"/);
        assert.match(body, /No matching tasks/);
        assert.match(body, /disabled>Set visible priority/);
        assert.match(body, /disabled>Complete visible tasks/);
        assert.match(body, /disabled>Reopen visible tasks/);
        assert.match(body, /disabled>Delete visible tasks/);
        assert.match(body, /disabled>Restore visible tasks/);
      } else {
        assert.match(body, /data-testid="directory-summary">2\/4 completed/);
        assert.match(body, /data-testid="directory-owner-summary">1\/3 completed/);
        assert.match(body, /data-testid="directory-owner-summary">1\/1 completed/);
      }
    }
    // View ordering reflects saved priorities; exporting still uses the original positions.
    const ordered = await get('/directory?order=Priority');
    const titles = [...ordered.matchAll(/data-testid="directory-task-title"[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]);
    assert.deepEqual(titles, ['Match undated', 'Match outside', 'Other', 'Match  first', 'Match completed', 'Match low', 'Match\t second']);
    assert.match(await get('/'), /data-testid="project-summary">1\/6 completed/);
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(snapshot(), expected);
    const exported = (await (await fetch(app.url + '/projects/1/download')).json()).project;
    assert.deepEqual(exported.tasks[0], task('Match  first', { priority: 'Low' }));
    await app.stop();
    app = await launch(dbPath);
    assert.deepEqual(snapshot(), expected);
    assert.equal(await get('/directory?order=Priority'), ordered);
    assert.match(await get('/directory'), /<option selected>Normal/);
    assert.deepEqual(await (await fetch(app.url + '/health')).json(), { status: 'ok' });
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('directory bulk deletion and restoration preserve owners, fields, filters and reserved positions across restarts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-directory-deletion-'));
  const dbPath = join(dir, 'workboard.sqlite');
  let app;
  try {
    app = await launch(dbPath);
    const post = (path, fields = {}) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async (path) => (await fetch(app.url + path)).text();
    const snapshot = () => {
      const db = new DatabaseSync(dbPath);
      try {
        return Object.fromEntries(['projects', 'tasks', 'task_positions'].map((table) =>
          [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map((row) => ({ ...row }))]));
      } finally { db.close(); }
    };
    const task = (title, extra = {}) => ({ title, completed: false, priority: 'High',
      dueDate: '2024-02-29', notes: '  literal 雪 <b> &\n trailing  ', deleted: false, ...extra });
    for (const [name, archived, tasks] of [
      ['Duplicate', false, [task('Match  first'), task('Match completed', { completed: true }),
        task('Match low', { priority: 'Low' }), task('Match undated', { dueDate: '' }),
        task('Match outside', { dueDate: '2024-03-01' }), task('Other'), task('Match deleted', { deleted: true })]],
      ['Duplicate', false, [task('Match\t second', { completed: true })]],
      ['Archived', true, [task('Match archived'), task('Match archived deleted', { deleted: true })]],
    ]) {
      assert.equal((await post('/projects/import', { name, json: JSON.stringify({
        format: 'workboard-project', version: 1,
        project: { name, archived, defaultPriority: 'Low', tasks },
      }) })).status, 303);
    }
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    const before = snapshot();
    const selected = { scope: 'Active', filter: 'All', priorityFilter: 'High',
      dueFrom: '2024-02-29', dueThrough: '2024-02-29', searchQuery: 'MATCH', order: 'Title' };
    const pathFor = (fields) => '/directory?' + new URLSearchParams(fields);
    const buttons = (body, deleteDisabled, restoreDisabled) => {
      assert.match(body, new RegExp('name="deleted" value="1"' + (deleteDisabled ? ' disabled' : '') + '>Delete visible tasks'));
      assert.match(body, new RegExp('name="deleted" value="0"' + (restoreDisabled ? ' disabled' : '') + '>Restore visible tasks'));
    };
    const check = (body, completed, total, ownerTotals) => {
      assert.match(body, new RegExp('data-testid="directory-summary">' + completed + '/' + total + ' completed'));
      assert.equal([...body.matchAll(/data-testid="directory-task-row"/g)].length, total);
      const owners = [...body.matchAll(/data-testid="directory-owner-summary">([^<]*)<\/p>/g)].map((match) => match[1]);
      assert.deepEqual(owners, ownerTotals);
      assert.equal(body.includes('role="status">No matching tasks'), total === 0);
    };
    const initial = await get(pathFor(selected));
    check(initial, 2, 3, ['1/2 completed', '1/1 completed']);
    buttons(initial, false, true);
    for (const fields of [
      { scope: 'Archived' }, { scope: 'Archived', filter: 'Deleted' },
      { filter: 'Deleted' }, { searchQuery: 'absent' },
    ]) buttons(await get(pathFor(fields)), true, fields.filter !== 'Deleted' || fields.scope === 'Archived');
    // Both live completion subsets are eligible, but only the matching rows change.
    for (const filter of ['Open', 'Completed', 'All']) {
      const fields = { ...selected, filter };
      buttons(await get(pathFor(fields)), false, true);
      const response = await post('/directory/deletion', { ...fields, deleted: '1' });
      assert.equal(response.status, 303);
      const location = new URL(response.headers.get('location'), app.url);
      for (const [key, value] of Object.entries(fields)) {
        if (key !== 'scope' && !(key === 'filter' && value === 'All')) assert.equal(location.searchParams.get(key), value);
      }
      const empty = await get(location.pathname + location.search);
      check(empty, 0, 0, []);
      buttons(empty, true, true);
      const expected = structuredClone(before);
      const ids = filter === 'Open' ? [1] : filter === 'Completed' ? [2, 8] : [1, 2, 8];
      for (const row of expected.tasks) if (ids.includes(row.id)) row.deleted = 1;
      assert.deepEqual(snapshot(), expected);
      const deletedView = { ...selected, filter: 'Deleted' };
      const deletedPage = await get(pathFor(deletedView));
      buttons(deletedPage, true, false);
      check(deletedPage, filter === 'Open' ? 0 : 2, ids.length + 1,
        filter === 'Open' ? ['0/2 completed'] : filter === 'Completed' ? ['1/2 completed', '1/1 completed'] : ['1/3 completed', '1/1 completed']);
      // Direct submissions cannot bypass protected scope or action/filter rules.
      for (const invalid of [
        { ...deletedView, deleted: '1' }, { ...selected, deleted: '0' },
        { ...deletedView, scope: 'Archived', deleted: '0' },
        { ...selected, scope: 'Archived', deleted: '1' },
        { ...selected, deleted: 'invalid' }, { ...selected, searchQuery: 'absent', deleted: '1' },
      ]) {
        await post('/directory/deletion', invalid);
        assert.deepEqual(snapshot(), expected);
      }
      await app.stop();
      app = await launch(dbPath);
      assert.deepEqual(snapshot(), expected);
      if (filter === 'All') {
        const home = await get('/');
        assert.match(home, /data-testid="project-summary">0\/4 completed/);
        assert.match(home, /data-testid="project-summary">0\/0 completed/);
        const exported = await (await fetch(app.url + '/projects/2/download')).json();
        assert.equal(exported.project.tasks[0].deleted, true);
      }
      // Restoration uses the current intersections, including any older deleted matches.
      const restoreSearch = filter === 'Open' ? 'Match first' : filter === 'Completed' ? 'Match' : 'Match';
      const restored = await post('/directory/deletion', { ...deletedView, searchQuery: restoreSearch, deleted: '0' });
      assert.equal(restored.status, 303);
      const restoredPage = await get(restored.headers.get('location'));
      if (filter === 'Open') {
        check(restoredPage, 0, 0, []);
        assert.deepEqual(snapshot(), before);
      } else {
        // The pre-existing matching deleted record is restored as part of the same result.
        check(restoredPage, 0, 0, []);
        const restoredState = structuredClone(before);
        restoredState.tasks[6].deleted = 0;
        assert.deepEqual(snapshot(), restoredState);
        await post('/projects/1/tasks/7/delete');
        assert.deepEqual(snapshot(), before);
      }
      assert.match(restoredPage, /<option selected>Deleted/);
      assert.match(restoredPage, /<option selected>Title/);
      buttons(restoredPage, true, true);
    }
    // A reserved position survives bulk deletion, later creation, restoration and moves.
    await post('/directory/deletion', { ...selected, searchQuery: 'Match first', deleted: '1' });
    await post('/projects/1/tasks', { title: 'Later' });
    await post('/projects/1/default-priority', { priority: 'Normal' });
    await post('/directory/deletion', { ...selected, filter: 'Deleted', searchQuery: 'Match first', deleted: '0' });
    const exportProject = async () => (await (await fetch(app.url + '/projects/1/download')).json()).project;
    const restoredProject = await exportProject();
    assert.equal(restoredProject.tasks[0].title, 'Match  first');
    assert.equal(restoredProject.tasks.at(-1).title, 'Later');
    assert.deepEqual(restoredProject.tasks[0], task('Match  first'));
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(await exportProject(), restoredProject);
    await app.stop();
    app = await launch(dbPath);
    assert.deepEqual(await exportProject(), restoredProject);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('directory totals follow resolved intersections, ordering and bulk updates without mutating other data', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-directory-summary-'));
  const dbPath = join(dir, 'workboard.sqlite');
  let app;
  try {
    app = await launch(dbPath);
    const get = async (path) => (await fetch(app.url + path)).text();
    const post = (path, fields) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const task = (title, completed, priority = 'High', dueDate = '2024-02-29', deleted = false) =>
      ({ title, completed, priority, dueDate, notes: ' exact\n雪 <b> ', deleted });
    for (const [name, archived, tasks] of [
      ['First', false, [task('Needle  one', false), task('Needle two', true), task('Other', false, 'Low', ''), task('Deleted one', true, 'High', '', true)]],
      ['Second', false, [task('Needle three', false), task('Deleted two', false, 'Low', '', true)]],
      ['Archived', true, [task('Archived one', true), task('Archived two', false), task('Archived deleted', true, 'Normal', '', true)]],
    ]) {
      const response = await post('/projects/import', { name, json: JSON.stringify({
        format: 'workboard-project', version: 1,
        project: { name, archived, defaultPriority: 'Normal', tasks },
      }) });
      assert.equal(response.status, 303);
    }
    const snapshot = () => {
      const db = new DatabaseSync(dbPath);
      try { return ['projects', 'tasks', 'task_positions'].map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map((row) => ({ ...row }))); }
      finally { db.close(); }
    };
    const check = (body, completed, total) => {
      const summaries = [...body.matchAll(/data-testid="directory-summary">([^<]*)<\/p>/g)];
      assert.equal(summaries.length, 1);
      assert.equal(summaries[0][1], `${completed}/${total} completed`);
      assert.equal([...body.matchAll(/data-testid="directory-task-row"/g)].length, total);
      assert.equal([...body.matchAll(/data-testid="directory-task-completion">Completed/g)].length, completed);
      assert.equal(body.includes('role="status">No matching tasks'), total === 0);
      const owners = [...body.matchAll(/data-testid="directory-owner-summary">(\d+)\/(\d+) completed<\/p>/g)];
      assert.equal(owners.reduce((sum, owner) => sum + Number(owner[1]), 0), completed);
      assert.equal(owners.reduce((sum, owner) => sum + Number(owner[2]), 0), total);
      assert.equal([...body.matchAll(/data-testid="directory-owner-row"/g)].length, owners.length);
      assert.ok(owners.every((owner) => Number(owner[2]) > 0));
    };
    const before = snapshot();
    for (const [query, completed, total] of [
      ['', 1, 4], ['filter=Open', 0, 3], ['filter=Completed', 1, 1],
      ['filter=Deleted', 1, 2], ['scope=Archived', 1, 2],
      ['scope=Archived&filter=Deleted', 1, 1], ['priorityFilter=Low', 0, 1],
      ['dueFrom=2024-02-29&dueThrough=2024-02-29', 1, 3],
      ['searchQuery=Needle', 1, 3], ['searchQuery=missing', 0, 0],
    ]) {
      for (const order of ['Original', 'Priority', 'Due date', 'Title']) {
        check(await get('/directory?' + query + '&order=' + encodeURIComponent(order)), completed, total);
      }
    }
    const selected = { scope: 'Active', filter: 'Open', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-02-29', searchQuery: 'Needle', order: 'Title' };
    const searched = await post('/directory/search', { ...selected, query: '  NEEDLE\t one  ' });
    check(await get(searched.headers.get('location')), 0, 1);
    const ranged = await post('/directory/due-range', { ...selected, rangeFrom: '2024-03-01', rangeThrough: '' });
    check(await get(ranged.headers.get('location')), 0, 0);
    const invalid = await post('/directory/due-range', { ...selected, rangeFrom: '2023-02-29' });
    assert.equal(invalid.status, 422);
    check(await invalid.text(), 0, 2);
    assert.deepEqual(snapshot(), before);
    const complete = await post('/directory/completion', { ...selected, completed: '1' });
    const completePath = complete.headers.get('location');
    check(await get(completePath), 0, 0);
    assert.match(await get(completePath), /<option selected>Title/);
    check(await get('/directory'), 3, 4);
    assert.match(await get('/'), /data-testid="project-summary">2\/3 completed/);
    assert.match(await get('/'), /data-testid="project-summary">1\/1 completed/);
    const expected = structuredClone(before);
    expected[1][0].completed = 1;
    expected[1][4].completed = 1;
    assert.deepEqual(snapshot(), expected);
    await app.stop();
    app = await launch(dbPath);
    check(await get(completePath), 0, 0);
    check(await get('/directory'), 3, 4);
    const reopen = await post('/directory/completion', { ...selected, filter: 'Completed', completed: '0' });
    check(await get(reopen.headers.get('location')), 0, 0);
    check(await get('/directory'), 0, 4);
    check(await get('/directory?filter=Deleted'), 1, 2);
    check(await get('/directory?scope=Archived'), 1, 2);
    assert.match(await get('/'), /data-testid="project-summary">0\/3 completed/);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('directory owner rows preserve distinct identities and creation order through sorting and result updates', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-directory-owners-'));
  const dbPath = join(dir, 'workboard.sqlite');
  let app;
  try {
    app = await launch(dbPath);
    const get = async (path) => (await fetch(app.url + path)).text();
    const post = (path, fields = {}) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const task = (title, completed, priority, dueDate = '', deleted = false) =>
      ({ title, completed, priority, dueDate, notes: '', deleted });
    const name = 'Same  雪 <b>';
    for (const [owner, archived, tasks] of [
      [name, false, [task('Zebra', true, 'Low', '2025-03-01'), task('Needle first', false, 'High', '2025-01-01'), task('Deleted first', true, 'High', '', true)]],
      [name, false, [task('Alpha', false, 'Normal', '2025-02-01'), task('Needle second', true, 'High', '2025-01-01'), task('Deleted second', false, 'Low', '', true)]],
      ['Archive', true, [task('Archived live', true, 'Normal'), task('Archived deleted', false, 'High', '', true)]],
      ['Empty', false, []],
    ]) {
      assert.equal((await post('/projects/import', { name: owner, json: JSON.stringify({
        format: 'workboard-project', version: 1,
        project: { name: owner, archived, defaultPriority: 'Normal', tasks },
      }) })).status, 303);
    }
    const owners = (body) => [...body.matchAll(/data-testid="directory-owner-row">([\s\S]*?)<\/form>\s*<\/div>/g)].map(([, row]) => ({
      id: Number(row.match(/action="\/projects\/(\d+)"/)[1]),
      name: row.match(/data-testid="directory-owner-name"[^>]*>([^<]*)<\/span>/)[1],
      summary: row.match(/data-testid="directory-owner-summary">([^<]*)<\/p>/)[1],
    }));
    const escapedName = 'Same  雪 &lt;b&gt;';
    const expected = [
      { id: 1, name: escapedName, summary: '1/2 completed' },
      { id: 2, name: escapedName, summary: '1/2 completed' },
    ];
    const snapshot = () => {
      const db = new DatabaseSync(dbPath);
      try { return ['projects', 'tasks', 'task_positions'].map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()); }
      finally { db.close(); }
    };
    const before = snapshot();
    for (const order of ['Original', 'Priority', 'Due date', 'Title']) {
      assert.deepEqual(owners(await get('/directory?order=' + encodeURIComponent(order))), expected);
    }
    assert.deepEqual(owners(await get('/directory?filter=Deleted&order=Title')), [
      { ...expected[0], summary: '1/1 completed' }, { ...expected[1], summary: '0/1 completed' },
    ]);
    assert.deepEqual(owners(await get('/directory?scope=Archived')), [{ id: 3, name: 'Archive', summary: '1/1 completed' }]);
    assert.deepEqual(owners(await get('/directory?scope=Archived&filter=Deleted')), [{ id: 3, name: 'Archive', summary: '0/1 completed' }]);
    assert.deepEqual(owners(await get('/directory?priorityFilter=Low')), [{ ...expected[0], summary: '1/1 completed' }]);
    const selected = { scope: 'Active', filter: 'All', priorityFilter: 'High', dueFrom: '2025-01-01', dueThrough: '2025-01-01', searchQuery: 'Needle', order: 'Title' };
    const selectedPath = '/directory?' + new URLSearchParams(selected);
    const matching = [{ ...expected[0], summary: '0/1 completed' }, { ...expected[1], summary: '1/1 completed' }];
    assert.deepEqual(owners(await get(selectedPath)), matching);
    const invalid = await post('/directory/due-range', { ...selected, rangeFrom: '2025-02-29' });
    assert.equal(invalid.status, 422);
    assert.deepEqual(owners(await invalid.text()), matching);
    const searched = await post('/directory/search', { ...selected, query: ' NEEDLE\t second ' });
    assert.deepEqual(owners(await get(searched.headers.get('location'))), [matching[1]]);
    const ranged = await post('/directory/due-range', { ...selected, rangeFrom: '2025-02-01', rangeThrough: '' });
    const empty = await get(ranged.headers.get('location'));
    assert.deepEqual(owners(empty), []);
    assert.match(empty, /data-testid="directory-summary">0\/0 completed/);
    assert.match(empty, /No matching tasks/);
    assert.deepEqual(snapshot(), before);
    const completed = await post('/directory/completion', { ...selected, filter: 'Open', completed: '1' });
    assert.deepEqual(owners(await get(completed.headers.get('location'))), []);
    assert.deepEqual(owners(await get(selectedPath)), matching.map((owner) => ({ ...owner, summary: '1/1 completed' })));
    const reopened = await post('/directory/completion', { ...selected, filter: 'Completed', completed: '0' });
    assert.deepEqual(owners(await get(reopened.headers.get('location'))), []);
    await post('/projects/2/rename', { name: '  Renamed  ' });
    await post('/projects/2/rename', { name: '  ' + name + '  ' });
    assert.deepEqual(owners(await get('/directory')), [expected[0], { ...expected[1], summary: '0/2 completed' }]);
    // Owner navigation contains no directory state; each project opens with its default filters.
    const opened = await get('/projects/2');
    assert.match(opened, /<option selected>All/);
    assert.match(opened, /name="query" type="text" value=""/);
    assert.match(await get('/projects/3'), /Archived project/);
    await app.stop();
    app = await launch(dbPath);
    assert.deepEqual(owners(await get('/directory')), [expected[0], { ...expected[1], summary: '0/2 completed' }]);
    assert.deepEqual(owners(await get('/directory?filter=Deleted')), [
      { ...expected[0], summary: '1/1 completed' }, { ...expected[1], summary: '0/1 completed' },
    ]);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('filtered checkbox edits save without navigation or disconnecting the interacted control', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-checkbox-'));
  const dbPath = join(dir, 'workboard.sqlite');
  let app;
  try {
    app = await launch(dbPath);
    const post = (path, fields) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    await post('/projects/import', { name: 'Range intersections', json: JSON.stringify({
      format: 'workboard-project', version: 1,
      project: { name: 'Original', archived: false, defaultPriority: 'Low', tasks: [
        { title: 'Range completed', completed: true, priority: 'High', dueDate: '2029-01-15', notes: ' exact\n雪 ', deleted: false },
        { title: 'Outside', completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false },
      ] },
    }) });
    const exportProject = async () => (await fetch(app.url + '/projects/1/download')).json();
    const before = await exportProject();
    const selection = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2029-01-01', dueThrough: '2029-01-31', searchQuery: 'range' };
    const path = '/projects/1?' + new URLSearchParams(selection);
    const page = await (await fetch(app.url + path)).text();
    assert.match(page, /<script src="\/completion.js" defer><\/script>/);
    const scriptResponse = await fetch(app.url + '/completion.js');
    assert.match(scriptResponse.headers.get('content-type'), /text\/javascript/);
    const script = await scriptResponse.text();
    let handler;
    let lastResponse;
    // Exercise the shipped event handler against the real server with a minimal DOM
    // adapter. Removing/replacing the control would break the retained-node assertion.
    const checkbox = { checked: false, disabled: false };
    const row = { hidden: false, testId: 'task-row',
      setAttribute(name, value) { assert.equal(name, 'data-testid'); this.testId = value; },
      removeAttribute(name) { assert.equal(name, 'data-testid'); this.testId = null; } };
    const section = { children: [row],
      querySelector(selector) {
        if (selector === '[data-testid="task-row"]') return row.testId ? row : null;
        if (selector === '.empty') return this.children.find((node) => node.className === 'empty');
      },
      append(node) { this.children.push(node); },
    };
    row.parentElement = section;
    let alert;
    const form = { dataset: { taskId: '1' }, action: app.url + '/projects/1/tasks/1',
      matches(selector) { return selector === '[data-task-completion]'; },
      querySelector(selector) { return selector === '[name="completed"]' ? checkbox : alert; },
      closest() { return row; },
      append(node) { alert = node; },
    };
    const context = {
      document: {
        addEventListener(type, listener) { assert.equal(type, 'submit'); handler = listener; },
        createElement() { return { setAttribute(name, value) { this[name] = value; } }; },
      },
      URLSearchParams,
      FormData: class {
        constructor() { return Object.entries({ ...selection, ...(checkbox.checked ? { completed: '1' } : {}) }); }
      },
      fetch: async (url, options) => {
        // Assert that the browser gets a direct, bounded response, rather than
        // relying on a redirected page or a mocked HTML parser for membership.
        if (selection.filter === 'Open' || selection.filter === 'Completed') {
          assert.equal(row.hidden, true, 'excluded rows hide before the save resolves');
          assert.equal(row.testId, null);
        }
        const response = await fetch(url, { ...options, redirect: 'manual' });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
        lastResponse = await response.clone().json();
        return response;
      },
    };
    runInNewContext(script, context);
    let prevented = false;
    await handler({ target: form, preventDefault() { prevented = true; } });
    assert.ok(prevented);
    assert.equal(form.querySelector('[name="completed"]'), checkbox);
    assert.equal(row.parentElement, section);
    assert.equal(checkbox.checked, false);
    assert.equal(checkbox.disabled, false);
    assert.equal(row.hidden, true);
    assert.equal(row.testId, null);
    assert.equal(section.children[1].textContent, 'No tasks to show.');
    assert.deepEqual(lastResponse, { completed: false, visible: false });
    const retainedPage = await (await fetch(app.url + path)).text();
    assert.match(retainedPage, /<option selected>Completed/);
    assert.match(retainedPage, /<option selected>High/);
    for (const [name, value] of Object.entries(selection)) {
      assert.ok(retainedPage.includes('name="' + name + '" value="' + value + '"'));
    }
    const expected = structuredClone(before);
    expected.project.tasks[0].completed = false;
    assert.deepEqual(await exportProject(), expected);
    assert.match(await (await fetch(app.url + '/')).text(), /project-summary">0\/2 completed/);
    await app.stop();
    app = await launch(dbPath);
    assert.deepEqual(await exportProject(), expected);
    assert.doesNotMatch(await (await fetch(app.url + path)).text(), /data-testid="task-row"/);

    // Completing an Open result follows the same path; All retains the visible node.
    for (const filter of ['Open', 'All']) {
      selection.filter = filter;
      form.action = app.url + '/projects/1/tasks/1';
      row.hidden = false;
      row.testId = 'task-row';
      section.children = [row];
      checkbox.checked = true;
      await handler({ target: form, preventDefault() {} });
      assert.equal(checkbox.checked, true);
      assert.equal(row.hidden, filter === 'Open');
      assert.equal(row.parentElement, section);
      assert.deepEqual(lastResponse, { completed: true, visible: filter === 'All' });
    }
    // A failed save restores the input and reports an accessible error without hiding it.
    runInNewContext(script, { ...context, fetch: async () => { throw new Error('offline'); } });
    checkbox.checked = false;
    await handler({ target: form, preventDefault() {} });
    assert.equal(checkbox.checked, true);
    assert.equal(checkbox.disabled, false);
    assert.equal(row.hidden, false);
    assert.equal(row.testId, 'task-row');
    assert.equal(alert.role, 'alert');
    assert.match(alert.textContent, /Could not save task completion/);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('directory ordering is stable across owners, retained by actions, and never changes stored positions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-directory-order-'));
  const dbPath = join(dir, 'workboard.sqlite');
  let app;
  try {
    app = await launch(dbPath);
    const post = (path, fields = {}) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async (path) => (await fetch(app.url + path)).text();
    const titles = (html) => [...html.matchAll(/data-testid="directory-task-title"[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]);
    const pathFor = (fields) => '/directory?' + new URLSearchParams(fields);
    const snapshot = () => {
      const db = new DatabaseSync(dbPath);
      try { return ['projects', 'tasks', 'task_positions'].map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()); }
      finally { db.close(); }
    };
    const task = (title, priority, dueDate) => ({ title, priority, dueDate,
      completed: false, notes: ' literal\n雪 ', deleted: false });
    const first = [task('Zebra', 'Low', ''), task('alpha', 'High', '2025-01-01'),
      task('a  b', 'Normal', '0001-01-01'), task('\u{10000}', 'Normal', '')];
    const second = [task('ALPHA', 'High', '2025-01-01'), task('a b', 'Low', '9999-12-31'),
      task('\ue000', 'Normal', '')];
    for (const [name, tasks] of [['First', first], ['Second', second]]) {
      const document = { format: 'workboard-project', version: 1,
        project: { name, archived: false, defaultPriority: 'Normal', tasks } };
      await post('/projects/import', { name, json: JSON.stringify(document) });
    }
    const original = [...first, ...second].map((task) => task.title);
    const expected = {
      Original: original,
      Priority: ['alpha', 'ALPHA', 'a  b', '\u{10000}', '\ue000', 'Zebra', 'a b'],
      'Due date': ['a  b', 'alpha', 'ALPHA', 'a b', 'Zebra', '\u{10000}', '\ue000'],
      Title: ['a  b', 'a b', 'alpha', 'ALPHA', 'Zebra', '\ue000', '\u{10000}'],
    };
    const before = snapshot();
    const exportBefore = await (await fetch(app.url + '/projects/1/download')).json();
    const initial = await get('/directory');
    const options = initial.match(/<select id="directory-order"[^>]*>([\s\S]*?)<\/select>/)[1];
    assert.deepEqual([...options.matchAll(/<option(?: selected)?>([^<]*)<\/option>/g)].map((m) => m[1]), Object.keys(expected));
    assert.match(initial, /<label for="directory-order">Directory order<\/label>/);
    assert.match(options, /<option selected>Original/);
    for (const [order, names] of Object.entries(expected)) {
      assert.deepEqual(titles(await get(pathFor({ order }))), names);
    }
    assert.deepEqual(titles(await get('/directory?order=unknown')), original);
    assert.deepEqual(snapshot(), before);
    assert.deepEqual(await (await fetch(app.url + '/projects/1/download')).json(), exportBefore);
    assert.deepEqual([... (await get('/projects/1')).matchAll(/<span>([^<]*)<\/span>/g)].map((m) => m[1]), first.map((t) => t.title));

    const selected = { scope: 'Active', filter: 'Open', priorityFilter: 'High',
      dueFrom: '2025-01-01', dueThrough: '2025-01-01', searchQuery: 'alpha', order: 'Title' };
    const html = await get(pathFor(selected));
    assert.deepEqual(titles(html), ['alpha', 'ALPHA']);
    assert.equal([...html.matchAll(/name="order" value="Title"/g)].length, 5);
    for (const [path, extra] of [
      ['/directory/search', { query: ' ALPHA ' }],
      ['/directory/due-range', { rangeFrom: '2025-01-01', rangeThrough: '2025-01-01' }],
    ]) {
      const response = await post(path, { ...selected, ...extra });
      const location = new URL(response.headers.get('location'), app.url);
      for (const key of ['scope', 'filter', 'priorityFilter', 'dueFrom', 'dueThrough', 'order']) {
        if (key !== 'scope') assert.equal(location.searchParams.get(key), selected[key]);
      }
      assert.deepEqual(titles(await get(location.pathname + location.search)), ['alpha', 'ALPHA']);
    }
    const invalid = await post('/directory/due-range', { ...selected, rangeFrom: '2025-02-29' });
    assert.equal(invalid.status, 422);
    const invalidHtml = await invalid.text();
    assert.match(invalidHtml, /<option selected>Title/);
    assert.deepEqual(titles(invalidHtml), ['alpha', 'ALPHA']);
    assert.deepEqual(snapshot(), before);
    const complete = await post('/directory/completion', { ...selected, completed: '1' });
    const completedLocation = new URL(complete.headers.get('location'), app.url);
    assert.equal(completedLocation.searchParams.get('order'), 'Title');
    assert.deepEqual(titles(await get(completedLocation.pathname + completedLocation.search)), []);
    assert.match(await get(completedLocation.pathname + completedLocation.search), /No matching tasks/);
    assert.deepEqual(titles(await get(pathFor({ order: 'Priority', filter: 'Completed' }))), ['alpha', 'ALPHA']);
    const reopen = await post('/directory/completion', { ...selected, filter: 'Completed', order: 'Due date', completed: '0' });
    assert.equal(new URL(reopen.headers.get('location'), app.url).searchParams.get('order'), 'Due date');
    assert.deepEqual(snapshot(), before);

    // Sorting cannot revise the reserved positions used by subsequent moves and returns.
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await get('/directory?order=Title');
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(titles(await get('/directory')), original);
    for (const id of [1, 2, 3, 4]) await post(`/projects/1/tasks/${id}/delete`);
    assert.deepEqual(titles(await get('/directory?filter=Deleted&order=Title')), ['a  b', 'alpha', 'Zebra', '\u{10000}']);
    await post('/projects/1/archive');
    assert.deepEqual(titles(await get('/directory?scope=Archived&filter=Deleted&order=Priority')), ['alpha', 'a  b', '\u{10000}', 'Zebra']);
    const saved = snapshot();
    await app.stop();
    app = await launch(dbPath);
    assert.deepEqual(titles(await get('/directory?scope=Archived&filter=Deleted&order=Due+date')), ['a  b', 'alpha', 'Zebra', '\u{10000}']);
    assert.match(await get('/directory'), /<option selected>Original/);
    assert.deepEqual(snapshot(), saved);
    await post('/projects/1/restore');
    for (const id of [1, 2, 3, 4]) await post(`/projects/1/tasks/${id}/restore`);
    assert.deepEqual(titles(await get('/directory')), original);
    assert.deepEqual(await (await fetch(app.url + '/projects/1/download')).json(), exportBefore);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('directory bulk completion changes only eligible matching tasks and persists without changing fields or positions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-directory-bulk-'));
  const dbPath = join(dir, 'workboard.sqlite');
  let app;
  try {
    app = await launch(dbPath);
    const post = (path, fields = {}) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async (path) => (await fetch(app.url + path)).text();
    const snapshot = () => {
      const db = new DatabaseSync(dbPath);
      try {
        return Object.fromEntries(['projects', 'tasks', 'task_positions'].map((table) =>
          [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map((row) => ({ ...row }))]));
      } finally { db.close(); }
    };
    const task = (title, extra = {}) => ({ title, completed: false, priority: 'High',
      dueDate: '2024-02-29', notes: '  雪 <b>literal</b>\n trailing  ', deleted: false, ...extra });
    for (const [name, archived, tasks] of [
      ['First', false, [task('Match  FIRST'), task('Match completed', { completed: true }),
        task('Match deleted', { deleted: true }), task('Match low', { priority: 'Low' }),
        task('Match undated', { dueDate: '' }), task('Match outside', { dueDate: '2024-03-01' }), task('Other title')]],
      ['Second', false, [task('Match\t SECOND')]],
      ['Archived', true, [task('Match archived')]],
    ]) {
      const document = { format: 'workboard-project', version: 1,
        project: { name, archived, defaultPriority: 'Low', tasks } };
      assert.equal((await post('/projects/import', { name, json: JSON.stringify(document) })).status, 303);
    }
    // Establish an additional remembered position before bulk changes.
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    const before = snapshot();
    const selected = { scope: 'Active', filter: 'Open', priorityFilter: 'High',
      dueFrom: '2024-02-29', dueThrough: '2024-02-29', searchQuery: '  MATCH  ' };
    const pathFor = (fields) => '/directory?' + new URLSearchParams(fields);
    const titles = (html) => [...html.matchAll(/data-testid="directory-task-title"[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]);
    const buttons = (html, completeDisabled, reopenDisabled) => {
      assert.match(html, new RegExp('value="1"' + (completeDisabled ? ' disabled' : '') + '>Complete visible tasks'));
      assert.match(html, new RegExp('value="0"' + (reopenDisabled ? ' disabled' : '') + '>Reopen visible tasks'));
    };
    const initial = await get(pathFor(selected));
    assert.deepEqual(titles(initial), ['Match  FIRST', 'Match\t SECOND']);
    buttons(initial, false, true);
    assert.doesNotMatch(initial, /No matching tasks/);
    const completed = await post('/directory/completion', { ...selected, completed: '1' });
    assert.equal(completed.status, 303);
    const location = new URL(completed.headers.get('location'), app.url);
    for (const key of ['filter', 'priorityFilter', 'dueFrom', 'dueThrough']) {
      assert.equal(location.searchParams.get(key), selected[key]);
    }
    assert.equal(location.searchParams.get('searchQuery'), 'MATCH');
    const empty = await get(location.pathname + location.search);
    assert.deepEqual(titles(empty), []);
    assert.match(empty, /role="status">No matching tasks<\/p>/);
    buttons(empty, true, true);
    const expected = structuredClone(before);
    expected.tasks[0].completed = 1;
    expected.tasks[7].completed = 1;
    assert.deepEqual(snapshot(), expected);
    const home = await get('/');
    assert.match(home, /data-testid="project-summary">2\/6 completed/);
    assert.match(home, /data-testid="project-summary">1\/1 completed/);
    const completedView = { ...selected, filter: 'Completed' };
    buttons(await get(pathFor(completedView)), true, false);
    buttons(await get(pathFor({ ...selected, filter: 'All' })), true, false);
    // No-op actions and direct requests against protected scopes leave all tables unchanged.
    for (const fields of [
      { ...selected, completed: '1' },
      { ...selected, scope: 'Archived', completed: '1' },
      { ...selected, filter: 'Deleted', completed: '1' },
      { ...selected, completed: 'invalid' },
    ]) {
      await post('/directory/completion', fields);
      assert.deepEqual(snapshot(), expected);
    }
    buttons(await get('/directory?scope=Archived'), true, true);
    buttons(await get('/directory?filter=Deleted'), true, true);
    await app.stop();
    app = await launch(dbPath);
    assert.deepEqual(snapshot(), expected);
    assert.deepEqual(titles(await get(pathFor(selected))), []);
    assert.deepEqual(titles(await get(pathFor(completedView))), ['Match  FIRST', 'Match completed', 'Match\t SECOND']);
    // Later movement preserves the bulk state and every portable field.
    await post('/projects/1/tasks/1/move', { destination: '2' });
    const moved = snapshot().tasks[0];
    assert.equal(moved.completed, 1);
    assert.deepEqual({ ...moved, project_id: before.tasks[0].project_id, position: before.tasks[0].position }, expected.tasks[0]);
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(snapshot(), expected);
    const reopened = await post('/directory/completion', { ...completedView, completed: '0' });
    const reopenLocation = new URL(reopened.headers.get('location'), app.url);
    assert.equal(reopenLocation.searchParams.get('filter'), 'Completed');
    const reopenedPage = await get(reopenLocation.pathname + reopenLocation.search);
    assert.deepEqual(titles(reopenedPage), []);
    assert.match(reopenedPage, /No matching tasks/);
    const reopenedState = structuredClone(before);
    reopenedState.tasks[1].completed = 0;
    assert.deepEqual(snapshot(), reopenedState);
    buttons(await get(pathFor({ ...selected, filter: 'All' })), false, true);
    assert.deepEqual(titles(await get(pathFor(selected))), ['Match  FIRST', 'Match completed', 'Match\t SECOND']);
    assert.match(await get('/'), /data-testid="project-summary">0\/6 completed/);
    await app.stop();
    app = await launch(dbPath);
    assert.deepEqual(snapshot(), reopenedState);
    assert.match(await get(pathFor(completedView)), /No matching tasks/);
    // Both actions are available for a mixed matching result set.
    await post('/projects/1/tasks/1', { completed: '1' });
    buttons(await get(pathFor({ ...selected, filter: 'All' })), false, false);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('notes migrate without changing existing data and survive edits, moves, archives, and restarts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-notes-'));
  const dbPath = join(dir, 'workboard.sqlite');
  const oldDb = new DatabaseSync(dbPath);
  oldDb.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal', due_date TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL);
    CREATE TABLE task_positions (task_id INTEGER NOT NULL REFERENCES tasks(id), project_id INTEGER NOT NULL REFERENCES projects(id), position INTEGER NOT NULL, PRIMARY KEY (task_id, project_id));
    INSERT INTO projects (name, default_priority) VALUES ('Source', 'Low'), ('Destination', 'High');
    INSERT INTO tasks (project_id, title, completed, priority, due_date, position) VALUES
      (1, 'Matching title', 1, 'High', '2024-02-29', 10), (1, 'Other title', 0, 'Low', '', 20);
    INSERT INTO task_positions VALUES (1, 1, 10), (2, 1, 20);`);
  const originalTasks = oldDb.prepare('SELECT * FROM tasks ORDER BY id').all().map((row) => ({ ...row }));
  const originalPositions = oldDb.prepare('SELECT * FROM task_positions ORDER BY task_id, project_id').all();
  oldDb.close();
  let app;
  try {
    app = await launch(dbPath);
    const get = async (path) => (await fetch(app.url + path)).text();
    const post = (path, fields = {}) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const savedRows = () => {
      const savedDb = new DatabaseSync(dbPath);
      try { return savedDb.prepare('SELECT * FROM tasks ORDER BY id').all(); }
      finally { savedDb.close(); }
    };
    const titles = (body) => [...body.matchAll(/<span>([^<]*)<\/span>/g)].map((match) => match[1]);
    const notesControl = (body, id) => body.match(new RegExp('<textarea id="task-notes-' + id + '"[^>]*>[\\s\\S]*?</textarea>'))[0];
    assert.deepEqual(savedRows().map(({ notes, deleted, ...row }) => row), originalTasks);
    assert.deepEqual(savedRows().map((row) => row.notes), ['', '']);
    assert.match(await get('/projects/1'), /<label for="task-notes-1">Task notes<\/label>/);
    assert.match(notesControl(await get('/projects/1'), 1), />\n<\/textarea>/);
    const summary = await get('/');
    const selected = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-02-29', searchQuery: 'matching' };
    const selectedPath = '/projects/1?' + new URLSearchParams(selected);
    const notes = '\n  Leading and trailing  \n雪 😀 café\n</textarea><script>alert("literal")</script> & <b>text</b>\n\t ';
    const response = await post('/projects/1/tasks/1/notes', { ...selected, notes });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), selectedPath);
    assert.equal(savedRows()[0].notes, notes);
    assert.deepEqual(savedRows().map(({ notes, deleted, ...row }) => row), originalTasks);
    const filtered = await get(selectedPath);
    assert.deepEqual(titles(filtered), ['Matching title']);
    assert.match(notesControl(filtered, 1), />\n\n  Leading and trailing  \n雪 😀 café/);
    assert.match(notesControl(filtered, 1), /&lt;\/textarea&gt;&lt;script&gt;alert\(&quot;literal&quot;\)&lt;\/script&gt;/);
    assert.doesNotMatch(filtered, /<script>/);
    assert.equal(await get('/'), summary);
    // Notes never participate in title searches.
    assert.deepEqual(titles(await get('/projects/1?searchQuery=caf%C3%A9')), []);
    await post('/projects/1/tasks/2/notes', { notes: 'Matching title' });
    assert.deepEqual(titles(await get('/projects/1?searchQuery=matching')), ['Matching title']);
    for (const path of ['/projects/2/tasks/1/notes', '/projects/1/tasks/999/notes', '/projects/999/tasks/1/notes']) {
      assert.equal((await post(path, { notes: 'Wrong owner' })).status, 404);
    }
    await post('/projects/1/tasks/1/rename', { title: 'Renamed title' });
    await post('/projects/1/rename', { name: 'Renamed source' });
    await post('/projects/1/tasks/1/priority', { priority: 'Normal' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '' });
    await post('/projects/1/tasks/1', {});
    assert.equal(savedRows()[0].notes, notes);
    await post('/projects/1/tasks/1/move', { destination: '2' });
    assert.match(notesControl(await get('/projects/2'), 1), /雪 😀 café/);
    const updatedNotes = '  Edited while away\n\n終  ';
    await post('/projects/2/tasks/1/notes', { notes: updatedNotes });
    await app.stop();
    app = await launch(dbPath);
    assert.equal(savedRows()[0].notes, updatedNotes);
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(titles(await get('/projects/1')), ['Renamed title', 'Other title']);
    assert.equal(savedRows()[0].notes, updatedNotes);
    const savedDb = new DatabaseSync(dbPath);
    try {
      assert.deepEqual(savedDb.prepare('SELECT * FROM task_positions WHERE project_id = 1 ORDER BY task_id, project_id').all(), originalPositions);
    } finally { savedDb.close(); }
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.match(notesControl(archived, 1), / disabled>/);
    assert.match(archived, /disabled>Save notes/);
    assert.equal((await post('/projects/1/tasks/1/notes', { notes: 'Blocked' })).status, 409);
    assert.equal(savedRows()[0].notes, updatedNotes);
    await app.stop();
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.doesNotMatch(notesControl(await get('/projects/1'), 1), / disabled/);
    await post('/projects/1/tasks/1/notes', { notes: ' \t\n ' });
    assert.equal(savedRows()[0].notes, ' \t\n ');
    await post('/projects/1/tasks/1/notes', { notes: '' });
    assert.equal(savedRows()[0].notes, '');
    assert.equal(savedRows()[1].notes, 'Matching title');
    await post('/projects/1/tasks', { title: 'New task' });
    assert.equal(savedRows()[2].notes, '');
    const finalPage = await get('/projects/1');
    await app.stop();
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), finalPage);
    assert.equal((await fetch(app.url + '/health')).status, 200);
    assert.deepEqual(await (await fetch(app.url + '/health')).json(), { status: 'ok' });
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('per-project positions migrate and restore reverse returns after edits, new arrivals, archive, and restarts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-return-order-'));
  const dbPath = join(dir, 'workboard.sqlite');
  const oldDb = new DatabaseSync(dbPath);
  oldDb.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal', due_date TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL);
    INSERT INTO projects (name, default_priority) VALUES ('First', 'Low'), ('Second', 'High'), ('Third', 'Normal');
    INSERT INTO tasks (project_id, title, position) VALUES
      (1, 'Later ID first', 30), (1, 'Earlier position', 10), (1, 'Middle', 20),
      (2, 'Second resident', 1), (3, 'Third resident', 1);`);
  oldDb.close();
  let app;
  try {
    app = await launch(dbPath);
    const get = async (path) => (await fetch(app.url + path)).text();
    const post = (path, fields = {}) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const titles = async (id) => [...(await get('/projects/' + id)).matchAll(/<span>([^<]*)<\/span>/g)].map((match) => match[1]);
    const move = async (source, task, destination, fields = {}) => {
      const response = await post(`/projects/${source}/tasks/${task}/move`, { ...fields, destination: String(destination) });
      assert.equal(response.status, 303);
      return response;
    };
    assert.deepEqual(await titles(1), ['Earlier position', 'Middle', 'Later ID first']);
    await move(1, 2, 2);
    await move(1, 3, 2);
    await move(1, 1, 2);
    assert.deepEqual(await titles(2), ['Second resident', 'Earlier position', 'Middle', 'Later ID first']);
    // New tasks and first-time visitors must follow positions reserved by absent tasks.
    await post('/projects/1/tasks', { title: 'Created while away' });
    await move(3, 5, 1);
    await post('/projects/2/tasks/2/rename', { title: 'Edited away' });
    await post('/projects/2/tasks/2', { completed: '1' });
    await post('/projects/2/tasks/2/priority', { priority: 'High' });
    await post('/projects/2/tasks/2/due-date', { dueDate: '2024-02-29' });
    await post('/projects/1/rename', { name: 'Renamed first' });
    await post('/projects/1/archive');
    assert.equal((await post('/projects/2/tasks/2/move', { destination: '1' })).status, 409);
    await app.stop();
    app = await launch(dbPath);
    await post('/projects/1/restore');
    // Return in the opposite order, including across a restart.
    await move(2, 1, 1);
    await move(2, 3, 1);
    await app.stop();
    app = await launch(dbPath);
    const filters = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-02-29' };
    const moved = await move(2, 2, 1, filters);
    assert.equal(moved.headers.get('location'), '/projects/2?' + new URLSearchParams(filters));
    assert.deepEqual(await titles(1), ['Edited away', 'Middle', 'Later ID first', 'Created while away', 'Third resident']);
    const returned = await get('/projects/1');
    assert.match(returned, /aria-label="Complete Edited away" checked/);
    assert.match(returned, /id="task-priority-2"[^>]*>[\s\S]*?<option selected>High/);
    assert.match(returned, /id="task-due-date-2"[^>]*value="2024-02-29"/);
    assert.match(returned, /id="task-due-date-1"[^>]*value=""/);
    assert.match(await get('/'), /data-testid="project-summary">1\/5 completed/);
    // Second project's positions were established in a different order from First's.
    await move(1, 1, 2);
    await move(1, 3, 2);
    await move(1, 2, 2);
    assert.deepEqual(await titles(2), ['Second resident', 'Edited away', 'Middle', 'Later ID first']);
    await move(2, 2, 3);
    await move(2, 1, 3);
    await move(2, 3, 3);
    await move(1, 5, 3);
    assert.deepEqual(await titles(3), ['Third resident', 'Edited away', 'Later ID first', 'Middle']);
    await post('/projects/2/tasks', { title: 'Second new' });
    await move(3, 3, 2);
    await move(3, 1, 2);
    await move(3, 2, 2);
    assert.deepEqual(await titles(2), ['Second resident', 'Edited away', 'Middle', 'Later ID first', 'Second new']);
    const finalPages = await Promise.all([get('/projects/1'), get('/projects/2'), get('/projects/3'), get('/')]);
    await app.stop();
    app = await launch(dbPath);
    assert.deepEqual(await Promise.all([get('/projects/1'), get('/projects/2'), get('/projects/3'), get('/')]), finalPages);
    // Migration must never overwrite remembered positions on subsequent starts.
    await move(2, 1, 1);
    await move(2, 3, 1);
    await move(2, 2, 1);
    assert.deepEqual(await titles(1), ['Edited away', 'Middle', 'Later ID first', 'Created while away']);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('priorities migrate, persist independently, and preserve task data and archive restrictions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  const dbPath = join(dir, 'workboard.sqlite');
  const oldDb = new DatabaseSync(dbPath);
  oldDb.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('First project'), ('Other project');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing task', 1), (2, 'Other task', 0);`);
  oldDb.close();
  let app;
  try {
    app = await launch(dbPath);
    const get = async (path) => (await fetch(app.url + path)).text();
    const post = (path, fields = {}) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const rows = (body) => [...body.matchAll(/<div class="task" data-testid="task-row">([\s\S]*?)\n      <\/div>/g)].map((match) => match[1]);
    const selectedPriority = (row) => row.match(/<select id="task-priority-\d+"[\s\S]*?<\/select>/)[0];
    await post('/projects/1/tasks', { title: 'New task' });
    const initial = await get('/projects/1');
    const other = await get('/projects/2');
    const summary = await get('/');
    for (const row of [...rows(initial), ...rows(other)]) {
      assert.match(row, /<label for="task-priority-\d+">Task priority<\/label>/);
      assert.match(selectedPriority(row), /<option>Low<\/option><option selected>Normal<\/option><option>High<\/option>/);
      assert.equal((selectedPriority(row).match(/<option/g) || []).length, 3);
    }
    for (const path of ['/projects/2/tasks/1/priority', '/projects/1/tasks/2/priority', '/projects/1/tasks/999/priority', '/projects/999/tasks/1/priority']) {
      assert.equal((await post(path, { priority: 'High' })).status, 404);
    }
    for (const priority of ['', 'Urgent', 'high']) {
      assert.equal((await post('/projects/1/tasks/1/priority', { priority })).status, 422);
      assert.equal(await get('/projects/1'), initial);
    }
    const high = await post('/projects/1/tasks/1/priority', { priority: 'High', filter: 'Completed' });
    assert.equal(high.status, 303);
    assert.equal(high.headers.get('location'), '/projects/1?filter=Completed');
    assert.equal((await post('/projects/1/tasks/3/priority', { priority: 'Low', filter: 'Open' })).headers.get('location'), '/projects/1?filter=Open');
    const changed = await get('/projects/1');
    const changedRows = rows(changed);
    assert.equal(changedRows.length, 2);
    assert.match(changedRows[0], /aria-label="Complete Existing task" checked/);
    assert.match(selectedPriority(changedRows[0]), /<option selected>High<\/option>/);
    assert.match(changedRows[1], /aria-label="Complete New task" onchange/);
    assert.match(selectedPriority(changedRows[1]), /<option selected>Low<\/option>/);
    assert.equal(rows(await get('/projects/1?filter=Completed'))[0], changedRows[0].replaceAll('name="filter" value="All"', 'name="filter" value="Completed"'));
    assert.equal(rows(await get('/projects/1?filter=Open'))[0], changedRows[1].replaceAll('name="filter" value="All"', 'name="filter" value="Open"'));
    assert.equal(await get('/projects/2'), other);
    assert.equal(await get('/'), summary);
    await post('/projects/1/tasks/1/rename', { title: 'Renamed task' });
    await post('/projects/1/rename', { name: 'Renamed project' });
    const renamed = await get('/projects/1');
    assert.match(rows(renamed)[0], /aria-label="Complete Renamed task" checked/);
    assert.match(selectedPriority(rows(renamed)[0]), /<option selected>High<\/option>/);
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), renamed);
    assert.equal(await get('/projects/2'), other.replace('<option value="1">First project</option>', '<option value="1">Renamed project</option>'));
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    for (const row of rows(archived)) assert.match(selectedPriority(row), / disabled/);
    assert.equal(rows(await get('/projects/1?filter=Completed')).length, 1);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Normal' })).status, 409);
    assert.equal(await get('/projects/1'), archived);
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), renamed);
    const restoredSummary = await get('/');
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Normal' })).status, 303);
    const restored = await get('/projects/1');
    assert.match(selectedPriority(rows(restored)[0]), /<option selected>Normal<\/option>/);
    assert.match(selectedPriority(rows(restored)[1]), /<option selected>Low<\/option>/);
    assert.equal(await get('/'), restoredSummary);
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), restored);
    assert.equal(await get('/projects/2'), other.replace('<option value="1">First project</option>', '<option value="1">Renamed project</option>'));
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('task renaming preserves ownership, order, completion, filters, and persisted archive restrictions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  const dbPath = join(dir, 'workboard.sqlite');
  let app;
  try {
    app = await launch(dbPath);
    const get = async (path) => (await fetch(app.url + path)).text();
    const post = (path, fields = {}) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const rows = (body) => [...body.matchAll(/<div class="task" data-testid="task-row">([\s\S]*?)\n      <\/div>/g)].map((match) => match[1]);
    await post('/projects', { name: 'First project' });
    await post('/projects', { name: 'Other project' });
    await post('/projects/1/tasks', { title: 'First task' });
    await post('/projects/1/tasks', { title: 'Second task' });
    await post('/projects/2/tasks', { title: 'Other task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const initial = await get('/projects/1');
    const other = await get('/projects/2');
    const summary = await get('/');
    const initialRows = rows(initial);
    assert.equal(initialRows.length, 2);
    for (const [index, row] of initialRows.entries()) {
      assert.match(row, new RegExp(`<label for="new-task-title-${index + 1}">New task title</label>`));
      assert.match(row, /<button type="submit">Rename task<\/button>/);
      assert.doesNotMatch(row, / disabled/);
    }
    for (const title of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/tasks/1/rename', { title, filter: 'Completed' });
      assert.equal(invalid.status, 422);
      const body = await invalid.text();
      assert.match(body, /role="alert">Task title is required/);
      assert.match(body, /<option selected>Completed<\/option>/);
      assert.match(rows(body)[0], /aria-label="Complete First task" checked/);
      assert.equal(await get('/projects/1'), initial);
      assert.equal(await get('/'), summary);
    }
    for (const path of ['/projects/2/tasks/1/rename', '/projects/1/tasks/3/rename', '/projects/1/tasks/999/rename', '/projects/999/tasks/1/rename']) {
      assert.equal((await post(path, { title: 'Forbidden change' })).status, 404);
    }
    const renamed = await post('/projects/1/tasks/1/rename', { title: '  Finished renamed  ', filter: 'Completed' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const openRename = await post('/projects/1/tasks/2/rename', { title: '  Pending <task> & "title"  ', filter: 'Open' });
    assert.equal(openRename.status, 303);
    assert.equal(openRename.headers.get('location'), '/projects/1?filter=Open');
    const detail = await get('/projects/1');
    const renamedRows = rows(detail);
    assert.equal(renamedRows.length, 2);
    assert.match(renamedRows[0], /action="\/projects\/1\/tasks\/1\/rename"/);
    assert.match(renamedRows[0], /<span>Finished renamed<\/span>/);
    assert.match(renamedRows[0], /aria-label="Complete Finished renamed" checked/);
    assert.match(renamedRows[1], /action="\/projects\/1\/tasks\/2\/rename"/);
    assert.match(renamedRows[1], /<span>Pending &lt;task&gt; &amp; &quot;title&quot;<\/span>/);
    assert.match(renamedRows[1], /aria-label="Complete Pending &lt;task&gt; &amp; &quot;title&quot;" onchange/);
    assert.match(renamedRows[1], /value="Pending &lt;task&gt; &amp; &quot;title&quot;"/);
    assert.doesNotMatch(detail, /Complete First task|Complete Second task/);
    const completed = await get('/projects/1?filter=Completed');
    const open = await get('/projects/1?filter=Open');
    assert.equal(rows(completed).length, 1);
    assert.match(completed, /Complete Finished renamed/);
    assert.equal(rows(open).length, 1);
    assert.match(open, /Complete Pending &lt;task&gt;/);
    assert.equal(await get('/projects/2'), other);
    assert.equal(await get('/'), summary);
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), detail);
    assert.equal(await get('/projects/1?filter=Completed'), completed);
    assert.equal(await get('/projects/1?filter=Open'), open);
    assert.equal(await get('/projects/2'), other);
    assert.equal(await get('/'), summary);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    for (const row of rows(archived)) {
      assert.match(row, /id="new-task-title-\d+"[^>]* disabled/);
      assert.match(row, /<button type="submit" disabled>Rename task<\/button>/);
    }
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Blocked rename' })).status, 409);
    assert.equal(await get('/projects/1'), archived);
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), detail);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: '  Restored title  ' })).status, 303);
    const restored = await get('/projects/1');
    assert.match(restored, /aria-label="Complete Restored title" checked/);
    assert.doesNotMatch(restored, / disabled/);
    assert.equal(await get('/'), summary);
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), restored);
    assert.equal(await get('/projects/2'), other);
    assert.equal(await get('/'), summary);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

async function launch(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: import.meta.dirname,
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(new Error(`Startup timed out: ${errors}`)); }, 5000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Server exited (${code}): ${errors}`)); });
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

test('project validation, creation order, navigation, and restart persistence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const dbPath = join(dir, 'nested', 'projects.sqlite');
  let app;
  try {
    app = await launch(dbPath);
    const get = async (path) => (await fetch(app.url + path)).text();
    const create = (name) => fetch(app.url + '/projects', {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    const health = await fetch(app.url + '/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const initial = await get('/');
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    for (const name of ['', ' \t\n ']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 422);
      const body = await invalid.text();
      assert.match(body, /role="alert">Project name is required/);
      assert.doesNotMatch(body, /data-testid="project-row"/);
    }
    assert.equal((await create('  First project  ')).status, 303);
    assert.equal((await create('Second <project> & "name"')).status, 303);
    const listing = await get('/');
    assert.equal((listing.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(listing, /class="project-name">First project<\/span>/);
    assert.ok(listing.indexOf('First project') < listing.indexOf('Second &lt;project&gt;'));
    const paths = [...listing.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
    assert.equal(paths.length, 2);
    assert.notEqual(paths[0], paths[1]);
    const detail = await get(paths[0]);
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/" method="get"><button type="submit">Projects<\/button>/);
    assert.match(await get(paths[1]), /<h1>Second &lt;project&gt; &amp; &quot;name&quot;<\/h1>/);
    assert.equal(await get('/'), listing);
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get('/'), listing);
    assert.equal(await get(paths[0]), detail);
    assert.equal((await fetch(app.url + '/projects/999999')).status, 404);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('tasks validate, stay in their project, filter, toggle, and survive restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const dbPath = join(dir, 'workboard.sqlite');
  let app;
  try {
    app = await launch(dbPath);
    const get = async (path) => (await fetch(app.url + path)).text();
    const post = (path, fields) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const initial = await get('/projects/1');
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, />Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option>\s*<option>Open<\/option>\s*<option>Completed<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 422);
      const body = await response.text();
      assert.match(body, /role="alert">Task title is required/);
      assert.doesNotMatch(body, /data-testid="task-row"/);
    }
    assert.equal((await post('/projects/1/tasks', { title: '  First task  ' })).status, 303);
    await post('/projects/1/tasks', { title: 'Second <task> & "title"' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    const listing = await get('/projects/1');
    assert.equal((listing.match(/data-testid="task-row"/g) || []).length, 2);
    assert.match(listing, /aria-label="Complete First task"/);
    assert.match(listing, /aria-label="Complete Second &lt;task&gt; &amp; &quot;title&quot;"/);
    assert.match(listing, /<span>First task<\/span>/);
    assert.ok(listing.indexOf('<span>First task') < listing.indexOf('<span>Second &lt;task&gt;'));
    assert.doesNotMatch(listing, / checked/);
    assert.doesNotMatch(listing, /Other project task/);
    assert.doesNotMatch(await get('/projects/2'), /Complete First task|Complete Second/);
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /data-testid="task-row"/);
    const complete = await post('/projects/1/tasks/1', { completed: '1', filter: 'Open' });
    assert.equal(complete.status, 303);
    assert.equal(complete.headers.get('location'), '/projects/1?filter=Open');
    assert.match(await get('/projects/1'), /aria-label="Complete First task" checked/);
    const open = await get('/projects/1?filter=Open');
    assert.match(open, /<option selected>Open<\/option>/);
    assert.doesNotMatch(open, /Complete First task/);
    assert.match(open, /Complete Second/);
    const completed = await get('/projects/1?filter=Completed');
    assert.match(completed, /<option selected>Completed<\/option>/);
    assert.match(completed, /Complete First task/);
    assert.doesNotMatch(completed, /Complete Second/);
    assert.equal((await post('/projects/2/tasks/1', { completed: '0' })).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Missing' })).status, 404);
    const saved = await get('/projects/1');
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), saved);
    assert.equal(await get('/projects/1?filter=Open'), open);
    assert.equal(await get('/projects/1?filter=Completed'), completed);
    assert.match(await get('/projects/2'), /Complete Other project task/);
    assert.equal((await post('/projects/1/tasks/1', {})).status, 303);
    assert.doesNotMatch(await get('/projects/1'), / checked/);
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /data-testid="task-row"/);
    const reopened = await get('/projects/1');
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), reopened);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('archive migration, summaries, read-only tasks, restoration, and restart persistence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const dbPath = join(dir, 'workboard.sqlite');
  // Simulate the database produced before archive support was added.
  const oldDb = new DatabaseSync(dbPath);
  oldDb.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    INSERT INTO projects (name) VALUES ('Existing project');`);
  oldDb.close();
  let app;
  try {
    app = await launch(dbPath);
    const get = async (path) => (await fetch(app.url + path)).text();
    const post = (path, fields = {}) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const rows = (body) => [...body.matchAll(/data-testid="project-summary">([^<]+)/g)].map((match) => match[1]);
    const initial = await get('/');
    assert.match(initial, /Existing project/);
    assert.match(initial, /<label for="project-filter">Project filter<\/label>/);
    assert.match(initial, /<option selected>Active<\/option>\s*<option>Archived<\/option>/);
    assert.deepEqual(rows(initial), ['0/0 completed']);
    await post('/projects', { name: 'Second project' });
    await post('/projects/1/tasks', { title: 'Done task' });
    await post('/projects/1/tasks', { title: 'Open task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    assert.deepEqual(rows(await get('/')), ['1/2 completed', '0/0 completed']);
    await get('/projects/1?filter=Completed');
    assert.deepEqual(rows(await get('/')), ['1/2 completed', '0/0 completed']);
    assert.equal((await post('/projects/999/archive')).status, 404);
    const archive = await post('/projects/1/archive');
    assert.equal(archive.status, 303);
    assert.equal(archive.headers.get('location'), '/');
    assert.doesNotMatch(await get('/'), /Existing project/);
    const archived = await get('/?filter=Archived');
    assert.match(archived, /Existing project/);
    assert.match(archived, /<option selected>Archived<\/option>/);
    assert.match(archived, />Open project<\/button>/);
    assert.match(archived, />Restore project<\/button>/);
    assert.doesNotMatch(archived, />Archive project<\/button>/);
    assert.deepEqual(rows(archived), ['1/2 completed']);
    const detail = await get('/projects/1');
    assert.match(detail, /Archived project/);
    assert.match(detail, /<button type="submit" disabled>Create task<\/button>/);
    assert.match(detail, /aria-label="Complete Done task" checked disabled/);
    assert.match(detail, /aria-label="Complete Open task" disabled/);
    assert.equal((detail.match(/data-testid="task-row"/g) || []).length, 2);
    assert.doesNotMatch(await get('/projects/1?filter=Open'), /Complete Done task/);
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /Complete Open task/);
    assert.equal((await post('/projects/1/tasks', { title: 'Forbidden task' })).status, 409);
    assert.equal((await post('/projects/1/tasks/1', { completed: '0' })).status, 409);
    assert.equal(await get('/projects/1'), detail);
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get('/?filter=Archived'), archived);
    assert.equal(await get('/projects/1'), detail);
    assert.doesNotMatch(await get('/'), /Existing project/);
    const restore = await post('/projects/1/restore');
    assert.equal(restore.status, 303);
    assert.equal(restore.headers.get('location'), '/?filter=Archived');
    assert.doesNotMatch(await get('/?filter=Archived'), /data-testid="project-row"/);
    const active = await get('/');
    assert.ok(active.indexOf('Existing project') < active.indexOf('Second project'));
    assert.deepEqual(rows(active), ['1/2 completed', '0/0 completed']);
    const restored = await get('/projects/1');
    assert.doesNotMatch(restored, /Archived project| disabled/);
    assert.match(restored, /aria-label="Complete Done task" checked/);
    await post('/projects/1/tasks/2', { completed: '1' });
    await post('/projects/1/tasks', { title: 'After restore' });
    assert.deepEqual(rows(await get('/')), ['2/3 completed', '0/0 completed']);
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.deepEqual(rows(await get('/')), ['2/3 completed', '0/0 completed']);
    assert.match(await get('/projects/1'), /Complete After restore/);
    assert.doesNotMatch(await get('/projects/1'), /Archived project| disabled/);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('renaming validates and preserves identity, order, tasks, summaries, and archive restrictions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const dbPath = join(dir, 'workboard.sqlite');
  let app;
  try {
    app = await launch(dbPath);
    const get = async (path) => (await fetch(app.url + path)).text();
    const post = (path, fields = {}) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second project' });
    await post('/projects/1/tasks', { title: 'Finished task' });
    await post('/projects/1/tasks', { title: 'Pending task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const initial = await get('/projects/1');
    assert.match(initial, /<label for="new-project-name">New project name<\/label>/);
    assert.match(initial, /<button type="submit">Rename project<\/button>/);
    for (const name of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/rename', { name });
      assert.equal(invalid.status, 422);
      assert.match(await invalid.text(), /role="alert">Project name is required/);
      assert.equal(await get('/projects/1'), initial);
    }
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
    const renamed = await post('/projects/1/rename', { name: '  Renamed <project> & "name"  ', filter: 'Open' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Open');
    const detail = await get('/projects/1');
    assert.match(detail, /<h1>Renamed &lt;project&gt; &amp; &quot;name&quot;<\/h1>/);
    assert.match(detail, /aria-label="Complete Finished task" checked/);
    assert.match(detail, /aria-label="Complete Pending task" onchange/);
    assert.equal((detail.match(/data-testid="task-row"/g) || []).length, 2);
    const listing = await get('/');
    assert.ok(listing.indexOf('Renamed &lt;project&gt;') < listing.indexOf('Second project'));
    assert.match(listing, /action="\/projects\/1"/);
    assert.match(listing, /data-testid="project-summary">1\/2 completed/);
    assert.match(await get('/projects/2'), /<h1>Second project<\/h1>/);
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), detail);
    assert.equal(await get('/'), listing);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.match(archived, /id="new-project-name"[^>]* disabled/);
    assert.match(archived, /<button type="submit" disabled>Rename project<\/button>/);
    assert.equal((await post('/projects/1/rename', { name: 'Forbidden rename' })).status, 409);
    assert.equal(await get('/projects/1'), archived);
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), detail);
    assert.equal((await post('/projects/1/rename', { name: '  Restored name  ' })).status, 303);
    const restored = await get('/projects/1');
    assert.match(restored, /<h1>Restored name<\/h1>/);
    assert.match(restored, /aria-label="Complete Finished task" checked/);
    assert.match(restored, /aria-label="Complete Pending task" onchange/);
    assert.doesNotMatch(restored, / disabled/);
    const restoredListing = await get('/');
    assert.ok(restoredListing.indexOf('Restored name') < restoredListing.indexOf('Second project'));
    assert.match(restoredListing, /data-testid="project-summary">1\/2 completed/);
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), restored);
    assert.equal(await get('/'), restoredListing);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('combined filters retain selections through edits, archive, and persistence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-combined-filters-'));
  const dbPath = join(dir, 'workboard.sqlite');
  let app;
  try {
    app = await launch(dbPath);
    const get = async (path) => (await fetch(app.url + path)).text();
    const post = (path, fields = {}) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const titles = (body) => [...body.matchAll(/<span>([^<]+)<\/span>/g)].map((match) => match[1]);
    const select = (body, id) => body.match(new RegExp('<select id="' + id + '"[^>]*>([\\s\\S]*?)</select>'))[1];
    const assertSelections = (body, filter, priorityFilter) => {
      assert.match(select(body, 'task-filter'), new RegExp('<option selected>' + filter + '</option>'));
      assert.match(select(body, 'priority-filter'), new RegExp('<option selected>' + priorityFilter + '</option>'));
    };
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const tasks = [];
    for (const priority of ['Low', 'Normal', 'High']) {
      for (const completed of [false, true]) {
        const id = tasks.length + 1;
        const title = priority + (completed ? ' done' : ' open');
        tasks.push({ id, title, priority, completed });
        await post('/projects/1/tasks', { title });
        await post('/projects/1/tasks/' + id + '/priority', { priority });
        if (completed) await post('/projects/1/tasks/' + id, { completed: '1' });
      }
    }
    await post('/projects/2/tasks', { title: 'Other task' });
    const summary = await get('/');
    const other = await get('/projects/2');
    const original = await get('/projects/1');
    assertSelections(original, 'All', 'All');
    assert.equal(select(original, 'priority-filter'),
      '\n        <option selected>All</option><option>Low</option><option>Normal</option><option>High</option>\n      ');
    // Every intersection must preserve creation order and leave saved data untouched.
    for (const filter of ['All', 'Open', 'Completed']) {
      for (const priorityFilter of ['All', 'Low', 'Normal', 'High']) {
        const body = await get('/projects/1?' + new URLSearchParams({ filter, priorityFilter }));
        assertSelections(body, filter, priorityFilter);
        assert.deepEqual(titles(body), tasks.filter((task) =>
          (filter === 'All' || task.completed === (filter === 'Completed')) &&
          (priorityFilter === 'All' || task.priority === priorityFilter)).map((task) => task.title));
        // Both selectors submit together; every mutation form carries both selections.
        const forms = [...body.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)];
        const filterForm = forms.find((form) => form[1].includes('id="task-filter"'));
        assert.match(filterForm[1], /id="priority-filter"/);
        for (const form of forms.filter((form) => /method="post"/.test(form[0]))) {
          assert.match(form[1], new RegExp('name="filter" value="' + filter + '"'));
          assert.match(form[1], new RegExp('name="priorityFilter" value="' + priorityFilter + '"'));
        }
      }
    }
    assert.equal(await get('/projects/1'), original);
    assert.equal(await get('/'), summary);
    const fields = { filter: 'Open', priorityFilter: 'High' };
    const filteredPath = '/projects/1?filter=Open&priorityFilter=High';
    for (const [path, extra] of [
      ['/projects/1/tasks', { title: '   ' }],
      ['/projects/1/tasks/5/rename', { title: '   ' }],
      ['/projects/1/rename', { name: '   ' }],
    ]) {
      const response = await post(path, { ...fields, ...extra });
      assert.equal(response.status, 422);
      const body = await response.text();
      assertSelections(body, 'Open', 'High');
      assert.deepEqual(titles(body), ['High open']);
    }
    const renamed = await post('/projects/1/tasks/5/rename', { ...fields, title: '  Renamed high  ' });
    assert.equal(renamed.headers.get('location'), filteredPath);
    const renamedBody = await get(filteredPath);
    assertSelections(renamedBody, 'Open', 'High');
    assert.deepEqual(titles(renamedBody), ['Renamed high']);
    assert.match(renamedBody, /aria-label="Complete Renamed high" onchange/);
    assert.match(select(renamedBody, 'task-priority-5'), /<option selected>High<\/option>/);
    assert.equal(await get('/'), summary);

    // Changing priority removes a row under the retained intersection.
    const changed = await post('/projects/1/tasks/5/priority', { ...fields, priority: 'Low' });
    assert.equal(changed.headers.get('location'), filteredPath);
    const empty = await get(filteredPath);
    assertSelections(empty, 'Open', 'High');
    assert.deepEqual(titles(empty), []);
    assert.equal(await get('/'), summary);
    const lowPath = '/projects/1?filter=Open&priorityFilter=Low';
    assert.deepEqual(titles(await get(lowPath)), ['Low open', 'Renamed high']);
    const done = await post('/projects/1/tasks/5', { filter: 'Open', priorityFilter: 'Low', completed: '1' });
    assert.equal(done.headers.get('location'), lowPath);
    assertSelections(await get(lowPath), 'Open', 'Low');
    assert.deepEqual(titles(await get(lowPath)), ['Low open']);
    const completedPath = '/projects/1?filter=Completed&priorityFilter=Low';
    assert.deepEqual(titles(await get(completedPath)), ['Low done', 'Renamed high']);
    const updatedSummary = await get('/');
    assert.match(updatedSummary, /data-testid="project-summary">4\/6 completed/);
    assert.equal(await get('/projects/2'), other);
    const saved = await get('/projects/1');
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), saved);
    assert.equal(await get('/'), updatedSummary);
    assert.deepEqual(titles(await get(completedPath)), ['Low done', 'Renamed high']);

    await post('/projects/1/archive');
    const archived = await get(completedPath);
    assertSelections(archived, 'Completed', 'Low');
    assert.deepEqual(titles(archived), ['Low done', 'Renamed high']);
    assert.doesNotMatch(archived, /id="(?:task-filter|priority-filter)"[^>]*disabled/);
    for (const control of archived.matchAll(/<(?:input|select)\b[^>]*(?:type="checkbox"|id="new-task-title-\d+"|id="task-priority-\d+")[^>]*>/g)) {
      assert.match(control[0], /disabled/);
    }
    const blocked = await post('/projects/1/tasks/5/priority', {
      filter: 'Completed', priorityFilter: 'Low', priority: 'High',
    });
    assert.equal(blocked.status, 409);
    assertSelections(await blocked.text(), 'Completed', 'Low');
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get(completedPath), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), saved);
    assert.equal(await get('/'), updatedSummary);
    assert.equal(await get('/projects/2'), other);
    const reopened = await get('/projects/1');
    assertSelections(reopened, 'All', 'All');
    assert.doesNotMatch(reopened, / disabled/);
    const uncheck = await post('/projects/1/tasks/5', { filter: 'Completed', priorityFilter: 'Low' });
    assert.equal(uncheck.headers.get('location'), completedPath);
    assertSelections(await get(completedPath), 'Completed', 'Low');
    assert.deepEqual(titles(await get(completedPath)), ['Low done']);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('project defaults migrate, apply only to subsequent tasks, and survive archive and restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-defaults-'));
  const dbPath = join(dir, 'workboard.sqlite');
  const oldDb = new DatabaseSync(dbPath);
  oldDb.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
    INSERT INTO projects (name) VALUES ('Existing project');
    INSERT INTO tasks (project_id, title, completed, priority) VALUES (1, 'Existing high', 1, 'High'), (1, 'Existing normal', 0, 'Normal');`);
  oldDb.close();
  let app;
  try {
    app = await launch(dbPath);
    const get = async (path) => (await fetch(app.url + path)).text();
    const post = (path, fields = {}) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const selector = (body, id) => body.match(new RegExp('<select id="' + id + '"[^>]*>[\\s\\S]*?</select>'))[0];
    const rows = (body) => [...body.matchAll(/<div class="task" data-testid="task-row">([\s\S]*?)\n      <\/div>/g)].map((match) => match[1]);
    const assertDefault = (body, priority) => {
      const control = selector(body, 'default-task-priority');
      assert.deepEqual([...control.matchAll(/<option(?: selected)?>([^<]+)<\/option>/g)].map((match) => match[1]), ['Low', 'Normal', 'High']);
      assert.match(control, new RegExp('<option selected>' + priority + '</option>'));
      assert.match(body, /<label for="default-task-priority">Default task priority<\/label>/);
    };
    await post('/projects', { name: 'Second project' });
    const other = await get('/projects/2');
    assertDefault(other, 'Normal');
    assertDefault(await get('/projects/1'), 'Normal');
    await post('/projects/1/tasks', { title: 'Initially normal' });
    assert.match(selector(await get('/projects/1'), 'task-priority-3'), /<option selected>Normal<\/option>/);
    const selected = { filter: 'Completed', priorityFilter: 'High' };
    const filteredPath = '/projects/1?filter=Completed&priorityFilter=High';
    const before = await get(filteredPath);
    const summary = await get('/');
    const changed = await post('/projects/1/default-priority', { ...selected, priority: 'Low' });
    assert.equal(changed.status, 303);
    assert.equal(changed.headers.get('location'), filteredPath);
    const after = await get(filteredPath);
    assertDefault(after, 'Low');
    assert.deepEqual(rows(after), rows(before));
    assert.equal(selector(after, 'task-filter'), selector(before, 'task-filter'));
    assert.equal(selector(after, 'priority-filter'), selector(before, 'priority-filter'));
    assert.equal(await get('/'), summary);
    assert.equal(await get('/projects/2'), other);
    for (const priority of ['', 'Urgent', 'low']) {
      assert.equal((await post('/projects/1/default-priority', { ...selected, priority })).status, 422);
      assert.equal(await get(filteredPath), after);
    }
    assert.equal((await post('/projects/999/default-priority', { priority: 'High' })).status, 404);
    await post('/projects/1/tasks', { title: 'Inherited low' });
    await post('/projects/1/default-priority', { priority: 'High' });
    await post('/projects/1/tasks', { title: 'Inherited high' });
    await post('/projects/2/tasks', { title: 'Other normal' });
    await post('/projects/2/default-priority', { priority: 'Low' });
    const detail = await get('/projects/1');
    for (const [id, priority] of [[1, 'High'], [2, 'Normal'], [3, 'Normal'], [4, 'Low'], [5, 'High']]) {
      assert.match(selector(detail, 'task-priority-' + id), new RegExp('<option selected>' + priority + '</option>'));
    }
    assert.match(detail, /aria-label="Complete Existing high" checked/);
    assert.deepEqual(rows(detail).map((row) => row.match(/<span>([^<]+)<\/span>/)[1]),
      ['Existing high', 'Existing normal', 'Initially normal', 'Inherited low', 'Inherited high']);
    assert.match(selector(await get('/projects/2'), 'task-priority-6'), /<option selected>Normal<\/option>/);
    await post('/projects/1/rename', { name: 'Renamed project' });
    await post('/projects/1/tasks/4/rename', { title: 'Renamed low' });
    const saved = await get('/projects/1');
    assertDefault(saved, 'High');
    assert.match(selector(saved, 'task-priority-4'), /<option selected>Low<\/option>/);
    assert.match(await get('/'), /data-testid="project-summary">1\/5 completed/);
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), saved);
    assertDefault(await get('/projects/2'), 'Low');
    await post('/projects/1/archive');
    const archived = await get(filteredPath);
    assertDefault(archived, 'High');
    assert.match(selector(archived, 'default-task-priority'), /disabled/);
    assert.doesNotMatch(selector(archived, 'task-filter'), /disabled/);
    assert.doesNotMatch(selector(archived, 'priority-filter'), /disabled/);
    const blocked = await post('/projects/1/default-priority', { ...selected, priority: 'Normal' });
    assert.equal(blocked.status, 409);
    assert.equal(selector(await blocked.text(), 'priority-filter'), selector(archived, 'priority-filter'));
    assert.equal(await get(filteredPath), archived);
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get(filteredPath), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), saved);
    assert.equal((await post('/projects/1/default-priority', { priority: 'Normal' })).status, 303);
    await post('/projects/1/tasks', { title: 'Restored normal' });
    assert.match(selector(await get('/projects/1'), 'task-priority-7'), /<option selected>Normal<\/option>/);
    assert.match(selector(await get('/projects/1'), 'task-priority-5'), /<option selected>High<\/option>/);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('due dates migrate, validate Gregorian days, and persist without changing other task data', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-dates-'));
  const dbPath = join(dir, 'workboard.sqlite');
  const oldDb = new DatabaseSync(dbPath);
  oldDb.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
    INSERT INTO projects (name) VALUES ('Existing project'), ('Other project');
    INSERT INTO tasks (project_id, title, completed, priority) VALUES (1, 'Existing task', 1, 'High'), (2, 'Other task', 0, 'Low');`);
  oldDb.close();
  let app;
  try {
    app = await launch(dbPath);
    const get = async (path) => (await fetch(app.url + path)).text();
    const post = (path, fields = {}) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const dateInput = (body, id) => body.match(new RegExp('<input id="task-due-date-' + id + '"[^>]*>'))[0];
    const date = (body, id) => dateInput(body, id).match(/value="([^"]*)"/)[1];
    await post('/projects/1/tasks', { title: 'New task' });
    const original = await get('/projects/1');
    const other = await get('/projects/2');
    const summary = await get('/');
    for (const [body, id] of [[original, 1], [original, 3], [other, 2]]) {
      assert.equal(date(body, id), '');
      assert.match(dateInput(body, id), /type="text"/);
      assert.match(body, new RegExp('<label for="task-due-date-' + id + '">Task due date</label>'));
      assert.match(body, /<button type="submit">Save due date<\/button>/);
    }
    const fields = { filter: 'Completed', priorityFilter: 'High' };
    const filteredPath = '/projects/1?filter=Completed&priorityFilter=High';
    const filteredOriginal = await get(filteredPath);
    for (const value of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '1900-02-28', '2026-04-30']) {
      const saved = await post('/projects/1/tasks/1/due-date', { ...fields, dueDate: ' \t' + value + '\n ' });
      assert.equal(saved.status, 303);
      assert.equal(saved.headers.get('location'), filteredPath);
      const body = await get(filteredPath);
      assert.equal(date(body, 1), value);
      assert.equal(body.replace('value="' + value + '"', 'value=""'), filteredOriginal);
      assert.equal(date(await get('/projects/1'), 3), '');
      assert.equal(await get('/projects/2'), other);
      assert.equal(await get('/'), summary);
    }
    const validBody = await get('/projects/1');
    for (const dueDate of ['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2025-02-29', '2026-04-31', '2026-01-00', '2026-00-01', '2026-13-01', '2026-1-01', '26-01-01', '2026-01-1', '2026-01-01T00:00:00Z', 'not a date', '<script>']) {
      const invalid = await post('/projects/1/tasks/1/due-date', { ...fields, dueDate });
      assert.equal(invalid.status, 422, dueDate);
      const body = await invalid.text();
      assert.match(body, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      assert.equal(date(body, 1), '2026-04-30');
      assert.match(body, /<option selected>Completed<\/option>/);
      assert.match(body, /<option selected>High<\/option>/);
      assert.equal(await get('/projects/1'), validBody);
    }
    for (const path of ['/projects/2/tasks/1/due-date', '/projects/1/tasks/2/due-date', '/projects/1/tasks/999/due-date', '/projects/999/tasks/1/due-date']) {
      assert.equal((await post(path, { dueDate: '2026-01-01' })).status, 404);
    }
    await post('/projects/1/tasks/3/due-date', { dueDate: '2030-12-25' });
    await post('/projects/2/tasks/2/due-date', { dueDate: '0004-02-29' });
    await post('/projects/1/tasks/1/rename', { ...fields, title: 'Renamed task' });
    const saved = await get('/projects/1');
    assert.equal(date(saved, 1), '2026-04-30');
    assert.equal(date(saved, 3), '2030-12-25');
    assert.match(saved, /aria-label="Complete Renamed task" checked/);
    assert.equal(await get('/'), summary);
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), saved);
    assert.equal(date(await get('/projects/2'), 2), '0004-02-29');
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    for (const id of [1, 3]) assert.match(dateInput(archived, id), /disabled/);
    assert.equal((archived.match(/<button type="submit" disabled>Save due date<\/button>/g) || []).length, 2);
    assert.doesNotMatch(archived, /id="(?:task-filter|priority-filter)"[^>]*disabled/);
    assert.equal((await post('/projects/1/tasks/1/due-date', { ...fields, dueDate: '' })).status, 409);
    assert.equal(await get('/projects/1'), archived);
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), saved);
    for (const dueDate of ['', ' \t\n ']) {
      await post('/projects/1/tasks/1/due-date', { ...fields, dueDate: '2024-02-29' });
      const cleared = await post('/projects/1/tasks/1/due-date', { ...fields, dueDate });
      assert.equal(cleared.headers.get('location'), filteredPath);
      assert.equal(date(await get(filteredPath), 1), '');
      assert.equal(date(await get('/projects/1'), 3), '2030-12-25');
      assert.equal(await get('/'), summary);
    }
    const clearedBody = await get('/projects/1');
    await app.stop();
    app = undefined;
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), clearedBody);
    assert.equal(date(await get('/projects/2'), 2), '0004-02-29');
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('inclusive due ranges intersect filters and retain applied state through validation, edits, and archive', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-ranges-'));
  const dbPath = join(dir, 'workboard.sqlite');
  let app;
  try {
    app = await launch(dbPath);
    const get = async (path) => (await fetch(app.url + path)).text();
    const post = (path, fields = {}) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const titles = (body) => [...body.matchAll(/<span>([^<]*)<\/span>/g)].map((match) => match[1]);
    const location = (fields) => '/projects/1?' + new URLSearchParams(fields);
    const range = { dueFrom: '2024-02-29', dueThrough: '2024-03-01' };
    const selected = { filter: 'Open', priorityFilter: 'High', ...range };
    const selectedPath = location(selected);
    const apply = (fields) => post('/projects/1/due-range', fields);
    await post('/projects', { name: 'Dates' });
    for (const title of ['Undated', 'Before', 'Start', 'End', 'After', 'Completed', 'Low']) {
      await post('/projects/1/tasks', { title });
    }
    for (const [id, dueDate] of [[2, '2024-02-28'], [3, '2024-02-29'], [4, '2024-03-01'], [5, '2024-03-02'], [6, '2024-03-01'], [7, '2024-03-01']]) {
      await post(`/projects/1/tasks/${id}/due-date`, { dueDate });
    }
    for (let id = 1; id <= 6; id++) await post(`/projects/1/tasks/${id}/priority`, { priority: 'High' });
    await post('/projects/1/tasks/6', { completed: '1' });
    const saved = await get('/projects/1');
    const summary = await get('/');
    const all = ['Undated', 'Before', 'Start', 'End', 'After', 'Completed', 'Low'];
    assert.deepEqual(titles(saved), all);
    for (const [boundaries, expected] of [
      [{}, all],
      [{ dueFrom: range.dueFrom }, ['Start', 'End', 'After', 'Completed', 'Low']],
      [{ dueThrough: range.dueThrough }, ['Before', 'Start', 'End', 'Completed', 'Low']],
      [range, ['Start', 'End', 'Completed', 'Low']],
      [{ dueFrom: '2024-03-01', dueThrough: '2024-03-01' }, ['End', 'Completed', 'Low']],
      [{ dueFrom: '0001-01-01', dueThrough: '9999-12-31' }, all.slice(1)],
    ]) {
      const response = await apply({ rangeFrom: boundaries.dueFrom || '', rangeThrough: boundaries.dueThrough || '' });
      assert.equal(response.status, 303);
      assert.deepEqual(titles(await get(response.headers.get('location'))), expected);
    }
    const applied = await apply({ filter: 'Open', priorityFilter: 'High', rangeFrom: ' \t2024-02-29 ', rangeThrough: '2024-03-01\n' });
    assert.equal(applied.headers.get('location'), selectedPath);
    const filtered = await get(selectedPath);
    assert.deepEqual(titles(filtered), ['Start', 'End']);
    assert.match(filtered, /id="due-from"[^>]*value="2024-02-29"/);
    assert.match(filtered, /id="due-through"[^>]*value="2024-03-01"/);
    assert.match(filtered, /<option selected>Open<\/option>/);
    assert.match(filtered, /<option selected>High<\/option>/);
    // All edit and combobox forms carry the applied range.
    for (const form of filtered.matchAll(/<form[^>]*action="\/projects\/1[^\"]*"[^>]*>([\s\S]*?)<\/form>/g)) {
      assert.match(form[1], /name="dueFrom" value="2024-02-29"/);
      assert.match(form[1], /name="dueThrough" value="2024-03-01"/);
    }
    assert.deepEqual(titles(await get(location({ ...selected, filter: 'Completed' }))), ['Completed']);
    assert.deepEqual(titles(await get(location({ ...selected, priorityFilter: 'Normal' }))), ['Low']);
    for (const [from, through, message] of [
      ['1900-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['', '2024-04-31', 'Due range must use valid YYYY-MM-DD dates'],
      ['0000-01-01', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-2-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-03-02', '2024-03-01', 'Due from must not be after Due through'],
    ]) {
      const invalid = await apply({ ...selected, rangeFrom: from, rangeThrough: through });
      assert.equal(invalid.status, 422);
      const body = await invalid.text();
      assert.ok(body.includes('role="alert">' + message));
      assert.deepEqual(titles(body), ['Start', 'End']);
      assert.match(body, /name="dueFrom" value="2024-02-29"/);
      assert.equal(await get(selectedPath), filtered);
    }
    assert.equal(await get('/projects/1'), saved);
    assert.equal(await get('/'), summary);
    for (const [path, fields] of [
      ['/projects/1/tasks/3/rename', { title: 'Renamed start' }],
      ['/projects/1/rename', { name: 'Renamed dates' }],
      ['/projects/1/default-priority', { priority: 'High' }],
      ['/projects/1/tasks', { title: 'New undated' }],
    ]) {
      const response = await post(path, { ...selected, ...fields });
      assert.equal(response.headers.get('location'), selectedPath);
    }
    assert.deepEqual(titles(await get(selectedPath)), ['Renamed start', 'End']);
    for (const [path, fields, expected] of [
      ['/projects/1/tasks/3/due-date', { dueDate: '2024-03-02' }, ['End']],
      ['/projects/1/tasks/4/priority', { priority: 'Low' }, []],
      ['/projects/1/tasks/3/due-date', { dueDate: '2024-02-29' }, ['Renamed start']],
      ['/projects/1/tasks/3', { completed: '1' }, []],
      ['/projects/1/tasks/3', {}, ['Renamed start']],
      ['/projects/1/tasks/3/due-date', { dueDate: '' }, []],
    ]) {
      const response = await post(path, { ...selected, ...fields });
      assert.equal(response.headers.get('location'), selectedPath);
      assert.deepEqual(titles(await get(selectedPath)), expected);
    }
    const finalSaved = await get('/projects/1');
    const finalSummary = await get('/');
    await app.stop();
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), finalSaved);
    assert.equal(await get('/'), finalSummary);
    await post('/projects/1/archive');
    const archivedRange = await apply({ ...selected, rangeFrom: '2024-03-01', rangeThrough: '2024-03-01', priorityFilter: 'Low' });
    const archivedPath = archivedRange.headers.get('location');
    assert.equal(archivedRange.status, 303);
    const archived = await get(archivedPath);
    assert.deepEqual(titles(archived), ['End']);
    assert.doesNotMatch(archived, /id="(?:due-from|due-through|task-filter|priority-filter)"[^>]*disabled/);
    assert.match(archived, /disabled>Save due date/);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), finalSaved);
    assert.equal(await get('/'), finalSummary);
    assert.match(await get('/projects/1'), /id="due-from"[^>]*value=""/);
    assert.match(await get('/projects/1'), /id="due-through"[^>]*value=""/);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('moves preserve saved data and source filters, and enforce active ownership across restarts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-moves-'));
  const dbPath = join(dir, 'workboard.sqlite');
  const oldDb = new DatabaseSync(dbPath);
  oldDb.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal', due_date TEXT NOT NULL DEFAULT '');
    INSERT INTO projects (name, default_priority) VALUES ('Source', 'Normal'), ('Destination', 'Low'), ('Third', 'Normal');
    INSERT INTO tasks (project_id, title, completed, priority, due_date) VALUES
      (1, 'Move dated', 1, 'High', '0004-02-29'), (1, 'Remain', 1, 'High', '0004-02-29'),
      (1, 'Move blank', 0, 'Normal', ''), (2, 'Existing destination', 0, 'Low', '9999-12-31');`);
  oldDb.close();
  let app;
  try {
    app = await launch(dbPath);
    const get = async (path) => (await fetch(app.url + path)).text();
    const post = (path, fields = {}) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const titles = (body) => [...body.matchAll(/<span>([^<]*)<\/span>/g)].map((match) => match[1]);
    const selector = (body, id) => body.match(new RegExp('<select id="' + id + '"[^>]*>[\\s\\S]*?</select>'))[0];
    const options = (control) => [...control.matchAll(/<option value="(\d+)">([^<]*)<\/option>/g)].map((match) => [match[1], match[2]]);
    const summaries = async () => [...(await get('/')).matchAll(/data-testid="project-summary">([^<]*)</g)].map((match) => match[1]);
    assert.deepEqual(titles(await get('/projects/1')), ['Move dated', 'Remain', 'Move blank']);
    assert.deepEqual(options(selector(await get('/projects/1'), 'destination-project-1')), [['2', 'Destination'], ['3', 'Third']]);
    await post('/projects/3/rename', { name: 'Renamed third' });
    assert.deepEqual(options(selector(await get('/projects/1'), 'destination-project-1')), [['2', 'Destination'], ['3', 'Renamed third']]);
    await post('/projects/3/archive');
    const initial = await get('/projects/1');
    assert.deepEqual(options(selector(initial, 'destination-project-1')), [['2', 'Destination']]);
    for (const destination of ['', '1', '999', '2.5', 'not a project']) {
      assert.equal((await post('/projects/1/tasks/1/move', { destination })).status, 422);
      assert.equal(await get('/projects/1'), initial);
    }
    assert.equal((await post('/projects/1/tasks/1/move', { destination: '3' })).status, 409);
    for (const path of ['/projects/2/tasks/1/move', '/projects/1/tasks/999/move', '/projects/999/tasks/1/move']) {
      assert.equal((await post(path, { destination: '2' })).status, 404);
    }
    const selected = { filter: 'Completed', priorityFilter: 'High', dueFrom: '0004-02-29', dueThrough: '0004-02-29' };
    const selectedPath = '/projects/1?' + new URLSearchParams(selected);
    const before = await get(selectedPath);
    const remainingRow = before.match(/<div class="task" data-testid="task-row">[\s\S]*?<\/div>/g)[1];
    const moved = await post('/projects/1/tasks/1/move', { ...selected, destination: '2' });
    assert.equal(moved.status, 303);
    assert.equal(moved.headers.get('location'), selectedPath);
    const after = await get(selectedPath);
    assert.deepEqual(titles(after), ['Remain']);
    assert.ok(after.includes(remainingRow));
    assert.match(selector(after, 'task-filter'), /<option selected>Completed/);
    assert.match(selector(after, 'priority-filter'), /<option selected>High/);
    assert.match(after, /id="due-from"[^>]*value="0004-02-29"/);
    assert.match(after, /id="due-through"[^>]*value="0004-02-29"/);
    let destinationPage = await get('/projects/2');
    assert.deepEqual(titles(destinationPage), ['Existing destination', 'Move dated']);
    assert.match(destinationPage, /aria-label="Complete Move dated" checked/);
    assert.match(selector(destinationPage, 'task-priority-1'), /<option selected>High/);
    assert.match(destinationPage, /id="task-due-date-1"[^>]*value="0004-02-29"/);
    assert.deepEqual(await summaries(), ['1/2 completed', '1/2 completed']);
    assert.equal((await post('/projects/1/tasks/1/move', { destination: '2' })).status, 404);
    await post('/projects/1/tasks/3/move', { destination: '2' });
    await post('/projects/2/tasks', { title: 'Created after move' });
    destinationPage = await get('/projects/2');
    assert.deepEqual(titles(destinationPage), ['Existing destination', 'Move dated', 'Move blank', 'Created after move']);
    assert.match(destinationPage, /id="task-due-date-3"[^>]*value=""/);
    assert.match(selector(destinationPage, 'task-priority-3'), /<option selected>Normal/);
    assert.match(selector(destinationPage, 'task-priority-5'), /<option selected>Low/);
    await app.stop();
    app = await launch(dbPath);
    assert.equal(await get('/projects/2'), destinationPage);
    assert.deepEqual(titles(await get('/projects/1')), ['Remain']);
    // Returning restores the task's original position before the remaining task.
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(titles(await get('/projects/1')), ['Move dated', 'Remain']);
    await post('/projects/2/archive');
    const noDestinations = await get('/projects/1');
    assert.match(selector(noDestinations, 'destination-project-1'), / disabled/);
    assert.deepEqual(options(selector(noDestinations, 'destination-project-1')), []);
    assert.match(noDestinations, /disabled>Move task/);
    assert.equal((await post('/projects/1/tasks/1/move', { destination: '2' })).status, 409);
    const archived = await get('/projects/2');
    assert.match(selector(archived, 'destination-project-3'), / disabled/);
    assert.match(archived, /disabled>Move task/);
    assert.equal((await post('/projects/2/tasks/3/move', { destination: '1' })).status, 409);
    assert.equal(await get('/projects/2'), archived);
    await app.stop();
    app = await launch(dbPath);
    assert.equal(await get('/projects/2'), archived);
    await post('/projects/2/restore');
    assert.doesNotMatch(selector(await get('/projects/2'), 'destination-project-3'), / disabled/);
    await post('/projects/2/tasks/3/move', { destination: '1' });
    const saved = await get('/projects/1');
    assert.deepEqual(titles(saved), ['Move dated', 'Remain', 'Move blank']);
    assert.match(saved, /id="task-due-date-3"[^>]*value=""/);
    assert.deepEqual(await summaries(), ['2/3 completed', '0/2 completed']);
    await app.stop();
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), saved);
    assert.deepEqual(titles(await get('/projects/2')), ['Existing destination', 'Created after move']);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('space and tab search normalization preserves saved text across archive and restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-search-whitespace-'));
  const dbPath = join(dir, 'workboard.sqlite');
  let app;
  try {
    app = await launch(dbPath);
    const get = async (path) => (await fetch(app.url + path)).text();
    const post = (path, fields = {}) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const names = (body) => [...body.matchAll(/class="project-name">([^<]*)<\/span>/g)].map((match) => match[1]);
    const titles = (body) => [...body.matchAll(/<span>([^<]*)<\/span>/g)].map((match) => match[1]);
    const originals = ['MiXeD \t\t  Name', 'mixed name', 'mixed\nname', 'mixed\u00a0name'];
    for (const name of originals) await post('/projects', { name });
    for (const title of originals) await post('/projects/1/tasks', { title });
    const query = ' \nMIXED\t \t NAME\t ';
    const listPath = '/?' + new URLSearchParams({ searchQuery: query });
    const taskPath = '/projects/1?' + new URLSearchParams({ searchQuery: query });
    const listBefore = await get('/');
    const tasksBefore = await get('/projects/1');
    for (let pass = 0; pass < 2; pass++) {
      assert.deepEqual(names(await get(listPath)), originals.slice(0, 2));
      assert.deepEqual(titles(await get(taskPath)), originals.slice(0, 2));
      // Internal newlines and non-ASCII spaces must not collapse like spaces/tabs.
      for (const index of [2, 3]) {
        const searchQuery = originals[index];
        assert.deepEqual(names(await get('/?' + new URLSearchParams({ searchQuery }))), [originals[index]]);
        assert.deepEqual(titles(await get('/projects/1?' + new URLSearchParams({ searchQuery }))), [originals[index]]);
      }
      assert.equal(await get('/'), listBefore);
      assert.equal(await get('/projects/1'), tasksBefore);
      if (pass === 0) {
        await app.stop();
        app = await launch(dbPath);
      }
    }
    await post('/projects/1/archive');
    assert.deepEqual(names(await get(listPath + '&filter=Archived')), [originals[0]]);
    const archivedTasks = await get(taskPath);
    assert.deepEqual(titles(archivedTasks), originals.slice(0, 2));
    assert.match(archivedTasks, /disabled>Rename task/);
    assert.doesNotMatch(archivedTasks, /id="task-search"[^>]*disabled/);
    await post('/projects/1/restore');
    assert.equal(await get('/'), listBefore);
    assert.equal(await get('/projects/1'), tasksBefore);
    const savedDb = new DatabaseSync(dbPath);
    try {
      assert.deepEqual(savedDb.prepare('SELECT name FROM projects ORDER BY id').all().map((row) => row.name), originals);
      assert.deepEqual(savedDb.prepare('SELECT title FROM tasks ORDER BY id').all().map((row) => row.title), originals);
    } finally {
      savedDb.close();
    }
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('search matches normalized substrings and intersects filters while edits retain applied state', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-search-'));
  const dbPath = join(dir, 'workboard.sqlite');
  let app;
  try {
    app = await launch(dbPath);
    const get = async (path) => (await fetch(app.url + path)).text();
    const post = (path, fields = {}) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const titles = (body) => [...body.matchAll(/<span>([^<]*)<\/span>/g)].map((match) => match[1]);
    const names = (body) => [...body.matchAll(/class="project-name">([^<]*)<\/span>/g)].map((match) => match[1]);
    for (const name of ['Alpha  PLAN', 'Other', 'alpha plan', 'ÄLPHA']) await post('/projects', { name });
    await post('/projects/3/archive');
    for (const [query, expected] of [['  pLaN  ', ['Alpha  PLAN']], ['alpha plan', ['Alpha  PLAN']], ['alpha  plan', ['Alpha  PLAN']], ['alpha\t \tplan', ['Alpha  PLAN']], ['ä', []], ['Ä', ['ÄLPHA']], [' \t ', ['Alpha  PLAN', 'Other', 'ÄLPHA']], ['%', []]]) {
      assert.deepEqual(names(await get('/?' + new URLSearchParams({ searchQuery: query }))), expected);
    }
    assert.deepEqual(names(await get('/?filter=Archived&searchQuery=PLAN')), ['alpha plan']);
    const list = await get('/?searchQuery=PLAN');
    assert.match(list, /<label for="project-search">Project search<\/label>/);
    assert.match(list, /<button type="submit">Search projects<\/button>/);
    assert.match(list, /action="\/projects\/1"><button type="submit">Open project/);
    assert.match(list, /action="\/"[^>]*>[\s\S]*?name="searchQuery" value="PLAN"/);
    const invalidProject = await post('/projects', { name: ' ', searchQuery: 'PLAN' });
    assert.deepEqual(names(await invalidProject.text()), ['Alpha  PLAN']);
    for (const title of ['Needle  ONE', 'needle one', 'Other', 'NEEDLE last', 'ÄNEEDLE']) await post('/projects/1/tasks', { title });
    for (const id of [1, 2, 3, 4]) {
      await post(`/projects/1/tasks/${id}/priority`, { priority: 'High' });
      await post(`/projects/1/tasks/${id}/due-date`, { dueDate: '2024-02-29' });
    }
    await post('/projects/1/tasks/4', { completed: '1' });
    for (const [query, expected] of [[' nEeDlE ', ['Needle  ONE', 'needle one', 'NEEDLE last', 'ÄNEEDLE']], ['needle one', ['Needle  ONE', 'needle one']], ['needle  one', ['Needle  ONE', 'needle one']], ['needle\t \tONE', ['Needle  ONE', 'needle one']], ['äne', []], ['', ['Needle  ONE', 'needle one', 'Other', 'NEEDLE last', 'ÄNEEDLE']]]) {
      const response = await post('/projects/1/search', { query });
      assert.equal(response.status, 303);
      assert.deepEqual(titles(await get(response.headers.get('location'))), expected);
    }
    const selected = { filter: 'Open', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-02-29', searchQuery: 'needle' };
    const path = '/projects/1?' + new URLSearchParams(selected);
    const apply = await post('/projects/1/search', { ...selected, query: ' needle ' });
    assert.equal(apply.headers.get('location'), path);
    const filtered = await get(path);
    assert.deepEqual(titles(filtered), ['Needle  ONE', 'needle one']);
    // Every form that changes project state or filters retains the applied query.
    for (const form of filtered.matchAll(/<form[^>]*action="\/projects\/1[^\"]*"[^>]*>([\s\S]*?)<\/form>/g)) {
      assert.match(form[1], /name="searchQuery" value="needle"/);
    }
    assert.match(filtered, /<form action="\/" method="get"><button type="submit">Projects/);
    const summary = await get('/');
    const invalidDate = await post('/projects/1/tasks/1/due-date', { ...selected, dueDate: '2024-02-30' });
    assert.deepEqual(titles(await invalidDate.text()), ['Needle  ONE', 'needle one']);
    const invalidRange = await post('/projects/1/due-range', { ...selected, rangeFrom: 'bad', rangeThrough: '' });
    assert.deepEqual(titles(await invalidRange.text()), ['Needle  ONE', 'needle one']);
    const invalidRename = await post('/projects/1/tasks/1/rename', { ...selected, title: ' ' });
    assert.deepEqual(titles(await invalidRename.text()), ['Needle  ONE', 'needle one']);
    assert.equal(await get('/'), summary);
    for (const [route, fields, expected] of [
      ['/projects/1/tasks/1/rename', { title: 'Renamed away' }, ['needle one']],
      ['/projects/1/tasks/2/priority', { priority: 'Low' }, []],
      ['/projects/1/tasks/2/priority', { priority: 'High' }, ['needle one']],
      ['/projects/1/tasks/2', { completed: '1' }, []],
      ['/projects/1/tasks/2', {}, ['needle one']],
      ['/projects/1/tasks/2/due-date', { dueDate: '' }, []],
      ['/projects/1/tasks/2/due-date', { dueDate: '2024-02-29' }, ['needle one']],
      ['/projects/1/default-priority', { priority: 'Low' }, ['needle one']],
      ['/projects/1/rename', { name: 'New project name' }, ['needle one']],
      ['/projects/1/tasks', { title: 'Needle new' }, ['needle one']],
      ['/projects/1/tasks/2/move', { destination: '2' }, []],
    ]) {
      const response = await post(route, { ...selected, ...fields });
      assert.equal(response.headers.get('location'), path);
      assert.deepEqual(titles(await get(path)), expected);
    }
    await post('/projects/2/tasks/2/move', { destination: '1' });
    assert.deepEqual(titles(await get(path)), ['needle one']);
    const cleared = await post('/projects/1/search', { ...selected, query: ' \t ' });
    assert.deepEqual(titles(await get(cleared.headers.get('location'))), ['Renamed away', 'needle one', 'Other']);
    const completed = { ...selected, filter: 'Completed' };
    assert.deepEqual(titles(await get('/projects/1?' + new URLSearchParams(completed))), ['NEEDLE last']);
    const ranged = await post('/projects/1/due-range', { ...selected, rangeFrom: '2024-03-01', rangeThrough: '' });
    assert.match(ranged.headers.get('location'), /searchQuery=needle/);
    assert.deepEqual(titles(await get(ranged.headers.get('location'))), []);
    const saved = await get('/projects/1');
    await app.stop();
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), saved);
    assert.match(saved, /id="task-search"[^>]*value=""/);
    await post('/projects/1/archive');
    const archivedSearch = await post('/projects/1/search', { ...selected, query: 'needle' });
    const archived = await get(archivedSearch.headers.get('location'));
    assert.deepEqual(titles(archived), ['needle one']);
    assert.doesNotMatch(archived, /id="task-search"[^>]*disabled/);
    assert.match(archived, /disabled>Rename task/);
    assert.match(archived, /disabled>Move task/);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), saved);
    assert.equal((await post('/projects/999/search', { query: 'needle' })).status, 404);
    const escaped = await post('/projects/1/search', { query: '<script>"&' });
    assert.match(await get(escaped.headers.get('location')), /value="&lt;script&gt;&quot;&amp;"/);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('deletion migrates live data, intersects filters, blocks edits, and restores reserved positions across restarts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-deletion-'));
  const dbPath = join(dir, 'workboard.sqlite');
  const oldDb = new DatabaseSync(dbPath);
  oldDb.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal', due_date TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL);
    CREATE TABLE task_positions (task_id INTEGER NOT NULL REFERENCES tasks(id), project_id INTEGER NOT NULL REFERENCES projects(id), position INTEGER NOT NULL, PRIMARY KEY (task_id, project_id));
    INSERT INTO projects (name) VALUES ('Source'), ('Destination');
    INSERT INTO tasks (project_id, title, completed, priority, due_date, notes, position) VALUES
      (1, 'Needle  FIRST', 1, 'High', '2024-02-29', '  notes\n雪 <b>literal</b>  ', 10),
      (1, 'Needle second', 0, 'Low', '', '', 20), (1, 'Last', 0, 'Normal', '', '', 30);
    INSERT INTO task_positions VALUES (1, 1, 10), (2, 1, 20), (3, 1, 30);`);
  const original = oldDb.prepare('SELECT * FROM tasks ORDER BY id').all().map((row) => ({ ...row }));
  oldDb.close();
  let app;
  try {
    app = await launch(dbPath);
    const get = async (path) => (await fetch(app.url + path)).text();
    const post = (path, fields = {}) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const titles = (body) => [...body.matchAll(/<span>([^<]*)<\/span>/g)].map((match) => match[1]);
    const rows = () => {
      const database = new DatabaseSync(dbPath);
      try { return database.prepare('SELECT * FROM tasks ORDER BY id').all().map((row) => ({ ...row })); }
      finally { database.close(); }
    };
    const summaries = async (path = '/') => [...(await get(path)).matchAll(/data-testid="project-summary">([^<]*)</g)].map((match) => match[1]);
    assert.deepEqual(rows().map(({ deleted, ...row }) => row), original);
    assert.deepEqual(rows().map((row) => row.deleted), [0, 0, 0]);
    assert.deepEqual(await summaries(), ['1/3 completed', '0/0 completed']);
    const filterControl = (await get('/projects/1')).match(/<select id="task-filter"[^>]*>([\s\S]*?)<\/select>/)[1];
    assert.deepEqual([...filterControl.matchAll(/<option(?: selected)?>([^<]*)<\/option>/g)].map((m) => m[1]), ['All', 'Open', 'Completed', 'Deleted']);
    const selected = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-02-29', searchQuery: 'needle first' };
    const selectedPath = '/projects/1?' + new URLSearchParams(selected);
    const deletedSelected = { ...selected, filter: 'Deleted' };
    const deletedPath = '/projects/1?' + new URLSearchParams(deletedSelected);
    assert.deepEqual(titles(await get(selectedPath)), ['Needle  FIRST']);
    const deletion = await post('/projects/1/tasks/1/delete', selected);
    assert.equal(deletion.status, 303);
    assert.equal(deletion.headers.get('location'), selectedPath);
    assert.deepEqual(titles(await get(selectedPath)), []);
    assert.deepEqual(await summaries(), ['0/2 completed', '0/0 completed']);
    await post('/projects/1/tasks/2/delete');
    await post('/projects/1/tasks/3/delete');
    for (const filter of ['All', 'Open', 'Completed']) {
      assert.deepEqual(titles(await get('/projects/1?filter=' + filter)), []);
    }
    assert.deepEqual(await summaries(), ['0/0 completed', '0/0 completed']);
    assert.deepEqual(rows().map(({ deleted, ...row }) => row), original);
    assert.deepEqual(titles(await get('/projects/1?filter=Deleted')), ['Needle  FIRST', 'Needle second', 'Last']);
    const deletedPage = await get(deletedPath);
    assert.deepEqual(titles(deletedPage), ['Needle  FIRST']);
    const row = deletedPage.slice(deletedPage.indexOf('<div class="task" data-testid="task-row">'));
    for (const control of row.matchAll(/<(?:input|textarea|select)\b[^>]*>/g)) {
      if (!/type="hidden"/.test(control[0])) assert.match(control[0], / disabled/);
    }
    for (const button of ['Rename task', 'Move task', 'Save due date', 'Save notes']) assert.ok(row.includes('disabled>' + button));
    assert.match(row, /<button type="submit">Restore task/);
    assert.match(row, /notes\n雪 &lt;b&gt;literal&lt;\/b&gt;  /);
    assert.doesNotMatch(row, />Delete task/);
    for (const [suffix, fields] of [
      ['', { completed: '0' }], ['/rename', { title: 'Changed' }], ['/priority', { priority: 'Low' }],
      ['/due-date', { dueDate: '' }], ['/notes', { notes: 'Changed' }], ['/move', { destination: '2' }],
    ]) assert.equal((await post('/projects/1/tasks/1' + suffix, fields)).status, 409);
    assert.deepEqual(rows().map(({ deleted, ...row }) => row), original);
    for (const suffix of ['delete', 'restore']) {
      assert.equal((await post('/projects/2/tasks/1/' + suffix)).status, 404);
      assert.equal((await post('/projects/1/tasks/999/' + suffix)).status, 404);
    }
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'New after deletion' });
    assert.equal(rows()[3].deleted, 0);
    const beforeRestart = await get(deletedPath);
    await app.stop();
    app = await launch(dbPath);
    assert.equal(await get(deletedPath), beforeRestart);
    await post('/projects/1/archive');
    const archived = await get('/projects/1?filter=Deleted');
    assert.deepEqual(titles(archived), ['Needle  FIRST', 'Needle second', 'Last']);
    assert.match(archived, /disabled>Restore task/);
    assert.match(await get('/projects/1'), /disabled>Delete task/);
    for (const id of ['task-filter', 'priority-filter', 'due-from', 'due-through', 'task-search']) {
      assert.doesNotMatch(archived, new RegExp('id="' + id + '"[^>]*disabled'));
    }
    assert.equal((await post('/projects/1/tasks/1/restore', deletedSelected)).status, 409);
    assert.equal((await post('/projects/1/tasks/4/delete')).status, 409);
    assert.deepEqual(await summaries('/?filter=Archived'), ['0/1 completed']);
    await app.stop();
    app = await launch(dbPath);
    assert.equal(await get('/projects/1?filter=Deleted'), archived);
    await post('/projects/1/restore');
    // Restore in reverse order; original positions precede new tasks.
    await post('/projects/1/tasks/3/restore', { filter: 'Deleted' });
    await post('/projects/1/tasks/2/restore', { filter: 'Deleted' });
    const restoration = await post('/projects/1/tasks/1/restore', deletedSelected);
    assert.equal(restoration.headers.get('location'), deletedPath);
    assert.deepEqual(titles(await get(deletedPath)), []);
    assert.deepEqual(titles(await get('/projects/1')), ['Needle  FIRST', 'Needle second', 'Last', 'New after deletion']);
    assert.deepEqual(titles(await get(selectedPath)), ['Needle  FIRST']);
    assert.deepEqual(rows().slice(0, 3).map(({ deleted, ...row }) => row), original);
    assert.deepEqual(await summaries(), ['1/4 completed', '0/0 completed']);
    // Restored tasks can move and still return to the original reserved position.
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/2/tasks/1/delete');
    assert.deepEqual(titles(await get('/projects/1?filter=Deleted')), []);
    assert.deepEqual(titles(await get('/projects/2?filter=Deleted')), ['Needle  FIRST']);
    await post('/projects/2/tasks/1/restore', { filter: 'Deleted' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    const saved = await get('/projects/1');
    await app.stop();
    app = await launch(dbPath);
    assert.equal(await get('/projects/1'), saved);
    assert.deepEqual(titles(saved), ['Needle  FIRST', 'Needle second', 'Last', 'New after deletion']);
    assert.deepEqual(rows().slice(0, 3).map(({ deleted, ...row }) => row), original);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('portable export includes ordered live and deleted tasks without changing saved state or filters', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-export-'));
  const dbPath = join(dir, 'workboard.sqlite');
  let app;
  try {
    app = await launch(dbPath);
    const post = (path, fields = {}) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async (path) => (await fetch(app.url + path)).text();
    const download = async (id) => {
      const response = await fetch(app.url + `/projects/${id}/download`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
      assert.equal(response.headers.get('content-disposition'), 'attachment; filename="workboard-project.json"');
      return response.json();
    };
    const snapshot = () => {
      const database = new DatabaseSync(dbPath);
      try {
        return ['projects', 'tasks', 'task_positions'].map((table) => database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
      } finally { database.close(); }
    };
    await post('/projects', { name: '  Source  雪 <b> &  ' });
    await post('/projects', { name: 'Destination' });
    await post('/projects', { name: 'Empty' });
    await post('/projects/1/tasks', { title: '  First  TASK <script>  ' });
    await post('/projects/1/tasks', { title: 'Second' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '0001-01-01' });
    const notes = ' \r\n  café 雪 😀 <b>literal</b> &\rline\n\t ';
    await post('/projects/1/tasks/1/notes', { notes });
    // Returning restores order even when the task's global ID is unchanged.
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    await post('/projects/1/tasks/1/delete');
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Third' });
    const expected = {
      format: 'workboard-project', version: 1,
      project: {
        name: 'Source  雪 <b> &', archived: false, defaultPriority: 'Low',
        tasks: [
          { title: 'First  TASK <script>', completed: true, priority: 'High', dueDate: '0001-01-01', notes: ' \n  café 雪 😀 <b>literal</b> &\nline\n\t ', deleted: true },
          { title: 'Second', completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false },
          { title: 'Third', completed: false, priority: 'Low', dueDate: '', notes: '', deleted: false },
        ],
      },
    };
    const selectedPath = '/projects/1?' + new URLSearchParams({ filter: 'Deleted', priorityFilter: 'Low', dueFrom: '2024-01-01', dueThrough: '2025-01-01', searchQuery: 'missing' });
    const selectedPage = await get(selectedPath);
    assert.match(selectedPage, /<form method="get" action="\/projects\/1\/download">[\s\S]*?<button type="submit">Download project<\/button>/);
    assert.doesNotMatch(selectedPage, /data-testid="task-row"/);
    const before = snapshot();
    assert.deepEqual(await download(1), expected);
    assert.deepEqual(snapshot(), before);
    assert.equal(await get(selectedPath), selectedPage);
    assert.equal(snapshot()[1][0].notes, notes);
    assert.deepEqual(await download(3), {
      format: 'workboard-project', version: 1,
      project: { name: 'Empty', archived: false, defaultPriority: 'Normal', tasks: [] },
    });
    await post('/projects/1/tasks/2/delete');
    await post('/projects/1/tasks/4/delete');
    expected.project.tasks.forEach((task) => { task.deleted = true; });
    await post('/projects/1/archive');
    expected.project.archived = true;
    const archivedPage = await get(selectedPath);
    assert.match(archivedPage, />Download project<\/button>/);
    assert.deepEqual(await download(1), expected);
    const archivedState = snapshot();
    await app.stop();
    app = await launch(dbPath);
    assert.deepEqual(await download(1), expected);
    assert.deepEqual(snapshot(), archivedState);
    assert.equal(await get(selectedPath), archivedPage);
    assert.equal((await fetch(app.url + '/projects/999/download')).status, 404);
    assert.equal((await fetch(app.url + '/projects/99999999999999999999/download')).status, 404);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('portable export uses public defaults for older records while preserving their original data', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-export-upgrade-'));
  const dbPath = join(dir, 'workboard.sqlite');
  const database = new DatabaseSync(dbPath);
  database.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Legacy  Project');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Legacy  Title', 1), (1, 'Next', 0);`);
  database.close();
  let app;
  try {
    app = await launch(dbPath);
    const response = await fetch(app.url + '/projects/1/download');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      format: 'workboard-project', version: 1,
      project: {
        name: 'Legacy  Project', archived: false, defaultPriority: 'Normal',
        tasks: [
          { title: 'Legacy  Title', completed: true, priority: 'Normal', dueDate: '', notes: '', deleted: false },
          { title: 'Next', completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false },
        ],
      },
    });
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('project import validates the entire document atomically and retains rejected inputs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-import-validation-'));
  const dbPath = join(dir, 'workboard.sqlite');
  let app;
  try {
    app = await launch(dbPath);
    const post = (path, fields) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    await post('/projects', { name: 'Original' });
    await post('/projects/1/tasks', { title: 'Original task' });
    const snapshot = () => {
      const db = new DatabaseSync(dbPath);
      try {
        return ['projects', 'tasks', 'task_positions', 'sqlite_sequence'].map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
      } finally { db.close(); }
    };
    const original = snapshot();
    const valid = {
      format: 'workboard-project', version: 1,
      project: { name: 'Document name', archived: false, defaultPriority: 'Normal', tasks: [
        { title: 'First', completed: false, priority: 'High', dueDate: '2000-02-29', notes: '', deleted: false },
        { title: 'Later', completed: true, priority: 'Low', dueDate: '', notes: '', deleted: true },
      ] },
    };
    const invalid = ['{', 'null', '[]', JSON.stringify({ ...valid, format: 'other' }), JSON.stringify({ ...valid, version: '1' }), JSON.stringify({ ...valid, version: 2 })];
    for (const [field, values] of Object.entries({
      name: ['', ' \t ', 42], archived: [0, 'false'], defaultPriority: ['normal', null], tasks: [{}, null],
    })) {
      const missing = structuredClone(valid);
      delete missing.project[field];
      invalid.push(JSON.stringify(missing));
      for (const value of values) {
        const document = structuredClone(valid);
        document.project[field] = value;
        invalid.push(JSON.stringify(document));
      }
    }
    for (const [field, values] of Object.entries({
      title: ['', ' \n ', null], completed: [1, 'true'], priority: ['Normal ', false],
      dueDate: ['1900-02-29', '2023-02-29', '0000-01-01', '10000-01-01', '2024-04-31', ' 2024-01-01', '2024-1-01', null],
      notes: [null, 12], deleted: [0, 'false'],
    })) {
      const missing = structuredClone(valid);
      delete missing.project.tasks[1][field];
      invalid.push(JSON.stringify(missing));
      for (const value of values) {
        const document = structuredClone(valid);
        document.project.tasks[1][field] = value;
        invalid.push(JSON.stringify(document));
      }
    }
    for (const json of invalid) {
      const response = await post('/projects/import', { json, name: '  Copy 雪  ' });
      assert.equal(response.status, 422);
      const body = await response.text();
      assert.match(body, /role="alert">Invalid project JSON/);
      assert.match(body, /value="  Copy 雪  "/);
      const escaped = json.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
      assert.ok(body.includes('name="json">\n' + escaped + '</textarea>'));
      assert.deepEqual(snapshot(), original);
    }
    const blank = await post('/projects/import', { json: JSON.stringify(valid), name: ' \t\n ' });
    assert.match(await blank.text(), /role="alert">Project name is required/);
    assert.deepEqual(snapshot(), original);
    assert.match(await (await fetch(app.url + '/')).text(), /<label for="project-json">Project JSON/);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('import creates independent persistent projects with portable fields and reserved ordering', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-import-'));
  const dbPath = join(dir, 'workboard.sqlite');
  let app;
  try {
    app = await launch(dbPath);
    const post = (path, fields = {}) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async (path) => (await fetch(app.url + path)).text();
    const download = async (id) => (await fetch(app.url + `/projects/${id}/download`)).json();
    const document = {
      format: 'workboard-project', version: 1, id: 1,
      project: { id: 1, name: 'Original', archived: true, defaultPriority: 'High', tasks: [
        { id: 1, project_id: 1, position: 999, title: '  FIRST\t 雪 <b>  ', completed: true, priority: 'Low', dueDate: '0001-01-01', notes: '\n leading \r\n雪 <script>literal</script>\r trailing  ', deleted: true },
        { title: 'Second', completed: false, priority: 'Normal', dueDate: '9999-12-31', notes: '', deleted: false },
      ] },
    };
    await post('/projects', { name: 'Original' });
    await post('/projects/1/tasks', { title: 'Untouched' });
    const original = await download(1);
    const imported = await post('/projects/import', { json: JSON.stringify(document), name: '  Independent 雪  ' });
    assert.equal(imported.status, 303);
    assert.equal(imported.headers.get('location'), '/projects/2');
    const expected = {
      format: document.format, version: 1,
      project: { name: 'Independent 雪', archived: true, defaultPriority: 'High', tasks: document.project.tasks.map(({ id, project_id, position, ...task }) => ({ ...task, notes: task.notes.replace(/\r\n?/g, '\n') })) },
    };
    assert.deepEqual(await download(2), expected);
    assert.deepEqual(await download(1), original);
    assert.match(await get('/projects/2?filter=Deleted'), /disabled>Restore task/);
    assert.match(await get('/?filter=Archived'), /data-testid="project-summary">0\/1 completed/);
    await app.stop();
    app = await launch(dbPath);
    assert.deepEqual(await download(2), expected);
    await post('/projects/2/restore');
    await post('/projects/2/tasks', { title: 'Third' });
    await post('/projects/2/default-priority', { priority: 'Normal' });
    await post('/projects/2/tasks/2/restore', { filter: 'Deleted' });
    const titles = (body) => [...body.matchAll(/<span>([^<]*)<\/span>/g)].map((match) => match[1]);
    assert.deepEqual(titles(await get('/projects/2')), ['  FIRST\t 雪 &lt;b&gt;  ', 'Second', 'Third']);
    await post('/projects/2/tasks/2/move', { destination: '1' });
    await post('/projects/2/tasks/3/move', { destination: '1' });
    await post('/projects/1/tasks/3/move', { destination: '2' });
    await post('/projects/1/tasks/2/move', { destination: '2' });
    const saved = await download(2);
    assert.equal(saved.project.tasks[0].priority, 'Low');
    assert.equal(saved.project.tasks[0].title, expected.project.tasks[0].title);
    assert.equal(saved.project.tasks[0].notes, expected.project.tasks[0].notes);
    assert.equal(saved.project.tasks[2].priority, 'High');
    assert.deepEqual(await download(1), original);
    await app.stop();
    app = await launch(dbPath);
    assert.deepEqual(await download(2), saved);
    const empty = await post('/projects/import', { json: JSON.stringify({ ...document, project: { ...document.project, archived: false, tasks: [] } }), name: 'Empty' });
    assert.equal(empty.status, 303);
    assert.deepEqual((await download(3)).project.tasks, []);
    // A downloaded document can be copied without merging identities or altering its source.
    const copy = await post('/projects/import', { json: JSON.stringify(saved), name: 'Copy' });
    assert.equal(copy.headers.get('location'), '/projects/4');
    await post('/projects/4/tasks/5/rename', { title: 'Copy edit' });
    assert.deepEqual(await download(2), saved);
    assert.equal((await download(4)).project.tasks[0].title, 'Copy edit');
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('directory intersects read-only filters, preserves literal fields, order, and saved data across restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-directory-'));
  const dbPath = join(dir, 'workboard.sqlite');
  let app;
  try {
    app = await launch(dbPath);
    const get = async (path) => (await fetch(app.url + path)).text();
    const post = (path, fields = {}) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const titles = (html) => [...html.matchAll(/data-testid="directory-task-title"[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]);
    const snapshot = () => {
      const db = new DatabaseSync(dbPath);
      try { return ['projects', 'tasks', 'task_positions'].map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()); }
      finally { db.close(); }
    };
    await post('/projects', { name: 'First owner' });
    await post('/projects', { name: 'Second owner' });
    await post('/projects', { name: 'Archived owner' });
    await post('/projects/1/tasks', { title: 'Needle  FIRST' });
    await post('/projects/1/tasks', { title: 'Needle\t second' });
    await post('/projects/1/tasks', { title: 'Undated' });
    await post('/projects/2/tasks', { title: 'Needle third' });
    await post('/projects/3/tasks', { title: 'Needle archived' });
    await post('/projects/1/tasks/1', { completed: '1' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
    const notes = '\n  literal 雪 <b>markup</b> &\n trailing  \t';
    await post('/projects/1/tasks/1/notes', { notes });
    await post('/projects/1/tasks/2/delete');
    await post('/projects/3/archive');
    // First arrival appends, and a return resumes the reserved position.
    await post('/projects/1/tasks/1/move', { destination: '2' });
    assert.deepEqual(titles(await get('/directory')), ['Undated', 'Needle third', 'Needle  FIRST']);
    await post('/projects/2/tasks/1/move', { destination: '1' });
    const document = {
      format: 'workboard-project', version: 1,
      project: { name: 'Portable', archived: false, defaultPriority: 'Low', tasks: [
        { title: 'Imported live', completed: true, priority: 'Low', dueDate: '0001-01-01', notes: 'notes-only-match', deleted: false },
        { title: 'Imported deleted', completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: true },
      ] },
    };
    await post('/projects/import', { json: JSON.stringify(document), name: 'Imported owner' });
    const before = snapshot();
    const home = await get('/');
    assert.match(home, /action="\/directory"><button type="submit">Task directory/);
    const initial = await get('/directory');
    assert.deepEqual(titles(initial), ['Needle  FIRST', 'Undated', 'Needle third', 'Imported live']);
    for (const [name, options] of [
      ['scope', ['Active', 'Archived']], ['filter', ['All', 'Open', 'Completed', 'Deleted']],
      ['priorityFilter', ['All', 'Low', 'Normal', 'High']],
    ]) {
      const select = initial.match(new RegExp('<select id="directory-' + name + '"[^>]*>([\\s\\S]*?)</select>'))[1];
      assert.deepEqual([...select.matchAll(/<option(?: selected)?>([^<]*)<\/option>/g)].map((m) => m[1]), options);
      assert.ok(select.includes('<option selected>' + options[0]));
    }
    assert.match(initial, /data-testid="directory-project-name"[^>]*>First owner/);
    assert.match(initial, /data-testid="directory-task-completion">Completed/);
    assert.match(initial, /data-testid="directory-task-priority">High/);
    assert.match(initial, /data-testid="directory-task-due-date">2024-02-29/);
    assert.match(initial, /data-testid="directory-task-notes"[^>]*>\n  literal 雪 &lt;b&gt;markup&lt;\/b&gt; &amp;\n trailing  \t<\/div>/);
    const rows = initial.slice(initial.indexOf('data-testid="directory-task-row"'));
    assert.doesNotMatch(rows, /<(?:input|textarea|select)\b/);
    assert.doesNotMatch(rows, /method="post"/);
    assert.match(rows, /action="\/projects\/1"><button type="submit">Open project/);
    assert.deepEqual(titles(await get('/directory?filter=Open')), ['Undated', 'Needle third']);
    assert.deepEqual(titles(await get('/directory?filter=Completed')), ['Needle  FIRST', 'Imported live']);
    assert.deepEqual(titles(await get('/directory?filter=Deleted')), ['Needle\t second', 'Imported deleted']);
    assert.deepEqual(titles(await get('/directory?scope=Archived')), ['Needle archived']);
    assert.deepEqual(titles(await get('/directory?scope=Archived&filter=Deleted')), []);
    for (const query of ['notes-only-match', 'First owner', 'literal', '雪']) {
      assert.deepEqual(titles(await get('/directory?searchQuery=' + encodeURIComponent(query))), []);
    }
    const selected = { scope: 'Active', filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-02-29', searchQuery: 'NEEDLE\t  FIRST' };
    const selectedPath = '/directory?' + new URLSearchParams(selected);
    assert.deepEqual(titles(await get(selectedPath)), ['Needle  FIRST']);
    assert.deepEqual(titles(await get('/directory?dueFrom=2024-02-29')), ['Needle  FIRST']);
    assert.deepEqual(titles(await get('/directory?dueThrough=2024-02-29')), ['Needle  FIRST', 'Imported live']);
    const searchResponse = await post('/directory/search', { ...selected, query: '  needle\t FIRST  ' });
    assert.equal(searchResponse.status, 303);
    const location = new URL(searchResponse.headers.get('location'), app.url);
    assert.equal(location.searchParams.get('searchQuery'), 'needle\t FIRST');
    for (const key of ['filter', 'priorityFilter', 'dueFrom', 'dueThrough']) assert.equal(location.searchParams.get(key), selected[key]);
    assert.deepEqual(titles(await get(location.pathname + location.search)), ['Needle  FIRST']);
    for (const [from, through, message] of [
      ['2023-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['0000-01-01', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-03-01', '2024-02-29', 'Due from must not be after Due through'],
    ]) {
      const response = await post('/directory/due-range', { ...selected, rangeFrom: from, rangeThrough: through });
      assert.equal(response.status, 422);
      const body = await response.text();
      assert.ok(body.includes('role="alert">' + message));
      assert.deepEqual(titles(body), ['Needle  FIRST']);
      assert.match(body, /name="dueFrom" value="2024-02-29"/);
      assert.match(body, /name="dueThrough" value="2024-02-29"/);
      assert.match(body, /<option selected>Completed/);
      assert.match(body, /<option selected>High/);
    }
    const rangeResponse = await post('/directory/due-range', { ...selected, rangeFrom: ' 0001-01-01 ', rangeThrough: ' 9999-12-31 ' });
    const rangeLocation = new URL(rangeResponse.headers.get('location'), app.url);
    assert.equal(rangeLocation.searchParams.get('dueFrom'), '0001-01-01');
    assert.equal(rangeLocation.searchParams.get('dueThrough'), '9999-12-31');
    assert.equal(rangeLocation.searchParams.get('filter'), 'Completed');
    assert.equal(rangeLocation.searchParams.get('priorityFilter'), 'High');
    assert.equal(rangeLocation.searchParams.get('searchQuery'), selected.searchQuery);
    // Clearing the range includes undated tasks again without changing data.
    const cleared = await post('/directory/due-range', { filter: 'All', rangeFrom: ' ', rangeThrough: '' });
    assert.equal(cleared.headers.get('location'), '/directory');
    assert.equal(await get('/directory'), initial);
    assert.deepEqual(snapshot(), before);
    await app.stop();
    app = await launch(dbPath);
    assert.equal(await get('/directory'), initial);
    assert.deepEqual(snapshot(), before);
    await post('/projects/1/tasks/3/delete');
    assert.deepEqual(titles(await get('/directory?filter=Deleted')), ['Needle\t second', 'Undated', 'Imported deleted']);
    await post('/projects/1/tasks/2/restore');
    assert.deepEqual(titles(await get('/directory')), ['Needle  FIRST', 'Needle\t second', 'Needle third', 'Imported live']);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('directory includes upgraded tasks with public defaults without changing their order', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-directory-upgrade-'));
  const dbPath = join(dir, 'workboard.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Legacy');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'First', 1), (1, 'Second', 0);`);
  db.close();
  let app;
  try {
    app = await launch(dbPath);
    const html = await (await fetch(app.url + '/directory')).text();
    assert.deepEqual([...html.matchAll(/data-testid="directory-task-title"[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]), ['First', 'Second']);
    assert.equal([...html.matchAll(/data-testid="directory-task-priority">Normal/g)].length, 2);
    assert.equal([...html.matchAll(/data-testid="directory-task-due-date"><\/p>/g)].length, 2);
    assert.equal([...html.matchAll(/data-testid="directory-task-notes"[^>]*><\/div>/g)].length, 2);
    assert.doesNotMatch(await (await fetch(app.url + '/directory?filter=Deleted')).text(), /data-testid="directory-task-row"/);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
