import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('inclusive due ranges intersect filters and survive edits without changing task data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-range-'));
  let child, base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'db.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Startup timed out')), 5000);
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Exited ${code}`)); });
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    base = `http://127.0.0.1:${port}`;
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  const get = (path) => fetch(base + path).then((response) => response.text());
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', redirect: 'manual', body: new URLSearchParams(values),
  });
  const rows = (html) => [...html.matchAll(/<article class="task-row"[\s\S]*?<\/article>/g)].map((match) => match[0]);
  const titles = (html) => rows(html).map((row) => row.match(/<span>(.*?)<\/span>/)[1]);
  const pagePath = (state = {}) => `/projects/1?${new URLSearchParams(state)}`;
  const state = { filter: 'Open', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-03-01' };
  const assertState = (html, expected = state) => {
    for (const [id, value] of [['task-filter', expected.filter], ['priority-filter', expected.priorityFilter]]) {
      assert.match(html.match(new RegExp(`<select id="${id}"[\\s\\S]*?</select>`))[0], new RegExp(`<option selected>${value}</option>`));
    }
    assert.match(html, new RegExp(`id="due-from"[^>]*value="${expected.dueFrom}"`));
    assert.match(html, new RegExp(`id="due-through"[^>]*value="${expected.dueThrough}"`));
    for (const form of html.matchAll(/<form[^>]*method="post"[\s\S]*?<\/form>/g)) {
      assert.match(form[0], new RegExp(`name="dueFrom" value="${expected.dueFrom}"`));
      assert.match(form[0], new RegExp(`name="dueThrough" value="${expected.dueThrough}"`));
    }
  };
  async function edit(path, values, expectedTitles, expectedState = state, status = 303) {
    const response = await post(path, { ...expectedState, ...values });
    assert.equal(response.status, status);
    const html = status === 303 ? await get(response.headers.get('location')) : await response.text();
    assertState(html, expectedState);
    assert.deepEqual(titles(html), expectedTitles);
    return html;
  }
  try {
    await start();
    await post('/projects', { name: 'Dates' });
    const tasks = [
      { title: 'Before', date: '2024-02-28', priority: 'High', completed: false },
      { title: 'Lower', date: '2024-02-29', priority: 'High', completed: false },
      { title: 'Upper', date: '2024-03-01', priority: 'High', completed: false },
      { title: 'After', date: '2024-03-02', priority: 'High', completed: false },
      { title: 'Undated', date: '', priority: 'High', completed: false },
      { title: 'Done', date: '2024-02-29', priority: 'Low', completed: true },
      { title: 'Normal', date: '2024-03-01', priority: 'Normal', completed: false },
    ];
    for (const [index, task] of tasks.entries()) {
      await post('/projects/1/tasks', { title: task.title });
      const path = `/projects/1/tasks/${index + 1}`;
      await post(path + '/due-date', { dueDate: task.date });
      await post(path + '/priority', { priority: task.priority });
      if (task.completed) await post(path + '/completion', { completed: '1' });
    }
    const saved = await get('/projects/1');
    const summary = await get('/');
    assert.match(summary, /1\/7 completed/);
    for (const [from, through] of [['', ''], ['', '2024-02-29'], ['2024-03-01', ''],
      ['2024-02-29', '2024-03-01'], ['2024-02-29', '2024-02-29'], ['0001-01-01', '9999-12-31']]) {
      for (const filter of ['All', 'Open', 'Completed']) {
        for (const priorityFilter of ['All', 'Low', 'Normal', 'High']) {
          const html = await get(pagePath({ filter, priorityFilter, dueFrom: from, dueThrough: through }));
          const expected = tasks.filter((task) =>
            (filter === 'All' || task.completed === (filter === 'Completed')) &&
            (priorityFilter === 'All' || task.priority === priorityFilter) &&
            ((!from && !through) || (task.date && (!from || task.date >= from) && (!through || task.date <= through))));
          assert.deepEqual(titles(html), expected.map((task) => task.title));
        }
      }
    }
    await edit('/projects/1/due-range', { rangeFrom: ' 2024-02-29 ', rangeThrough: ' 2024-03-01 ' }, ['Lower', 'Upper']);
    for (const value of ['2023-02-29', '1900-02-29', '0000-01-01', '10000-01-01', '2024-04-31', '2024-2-29', '<invalid>']) {
      for (const field of ['rangeFrom', 'rangeThrough']) {
        const html = await edit('/projects/1/due-range', {
          rangeFrom: state.dueFrom, rangeThrough: state.dueThrough, [field]: value,
        }, ['Lower', 'Upper'], state, 422);
        assert.match(html, /role="alert">Due range must use valid YYYY-MM-DD dates/);
      }
    }
    const reversed = await edit('/projects/1/due-range', { rangeFrom: '2024-03-02', rangeThrough: '2024-02-29' }, ['Lower', 'Upper'], state, 422);
    assert.match(reversed, /role="alert">Due from must not be after Due through/);
    assert.equal(await get('/projects/1'), saved);
    assert.equal(await get('/'), summary);
    await edit('/projects/1/rename', { name: 'Renamed dates' }, ['Lower', 'Upper']);
    await edit('/projects/1/default-priority', { priority: 'High' }, ['Lower', 'Upper']);
    await edit('/projects/1/tasks', { title: 'New undated' }, ['Lower', 'Upper']);
    await edit('/projects/1/tasks/2/rename', { title: 'Renamed lower' }, ['Renamed lower', 'Upper']);
    await edit('/projects/1/tasks/2/due-date', { dueDate: '2024-02-30' }, ['Renamed lower', 'Upper'], state, 422);
    await edit('/projects/1/tasks/2/due-date', { dueDate: '2024-03-02' }, ['Upper']);
    await edit('/projects/1/tasks/2/due-date', { dueDate: '2024-02-29' }, ['Renamed lower', 'Upper']);
    await edit('/projects/1/tasks/2/priority', { priority: 'Low' }, ['Upper']);
    await edit('/projects/1/tasks/2/priority', { priority: 'High' }, ['Renamed lower', 'Upper']);
    await edit('/projects/1/tasks/2/completion', { completed: '1' }, ['Upper']);
    await edit('/projects/1/tasks/2/completion', {}, ['Renamed lower', 'Upper']);
    await edit('/projects/1/tasks/3/due-date', { dueDate: ' ' }, ['Renamed lower']);
    const otherState = { ...state, filter: 'Completed', priorityFilter: 'Low' };
    assertState(await get(pagePath(otherState)), otherState);
    assert.deepEqual(titles(await get(pagePath(otherState))), ['Done']);
    const finalPage = await get('/projects/1');
    await post('/projects/1/archive');
    const archived = await get(pagePath(state));
    assertState(archived);
    assert.deepEqual(titles(archived), ['Renamed lower']);
    assert.doesNotMatch(archived.match(/<form[^>]*class="create-form due-range-form">[\s\S]*?<\/form>/)[0], /disabled/);
    for (const row of rows(archived)) {
      for (const control of row.matchAll(/<(?:input|select|button)[^>]*>/g)) {
        if (!control[0].includes('type="hidden"')) assert.match(control[0], /disabled/);
      }
    }
    await edit('/projects/1/due-range', { rangeFrom: state.dueFrom, rangeThrough: state.dueThrough }, ['Renamed lower']);
    await stop();
    await start();
    assert.equal(await get(pagePath(state)), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), finalPage);
    const reopened = await get('/projects/1');
    assertState(reopened, { filter: 'All', priorityFilter: 'All', dueFrom: '', dueThrough: '' });
    assert.equal(titles(reopened).length, 8);
    const clearedResponse = await post('/projects/1/due-range', { ...state, rangeFrom: ' ', rangeThrough: '\t' });
    const cleared = await get(clearedResponse.headers.get('location'));
    assertState(cleared, { ...state, dueFrom: '', dueThrough: '' });
    assert.deepEqual(titles(cleared), ['Before', 'Renamed lower', 'Upper', 'After', 'Undated', 'New undated']);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
