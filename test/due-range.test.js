import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApplication } from '../app.js';

test('inclusive due ranges intersect filters and survive edits without changing saved data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-range-'));
  let server;
  let base;
  async function start() {
    server = createApplication(join(directory, 'db.sqlite'));
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = `http://127.0.0.1:${server.address().port}`;
  }
  async function stop() {
    const closed = once(server, 'close');
    server.close();
    await closed;
    server = undefined;
  }
  const get = async path => (await fetch(base + path)).text();
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const ids = html => [...html.matchAll(/<input id="task-(\d+)" type="checkbox"/g)].map(match => Number(match[1]));
  const state = { filter: 'Open', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-03-01' };
  const pathFor = values => '/projects/1?' + new URLSearchParams(values);
  const apply = (rangeFrom, rangeThrough, previous = state) => fetch(base + '/projects/1/due-range?' + new URLSearchParams({
    ...previous, rangeFrom, rangeThrough,
  }), { redirect: 'manual' });
  try {
    await start();
    await post('/projects', { name: 'Dates' });
    for (const [index, dueDate] of ['', '2024-02-28', '2024-02-29', '2024-03-01', '2024-03-02'].entries()) {
      await post('/projects/1/tasks', { title: `Task ${index + 1}` });
      await post(`/projects/1/tasks/${index + 1}/due-date`, { dueDate });
      await post(`/projects/1/tasks/${index + 1}/priority`, { priority: 'High' });
    }
    const summary = await get('/');
    let response = await apply(' 2024-02-29 ', '2024-03-01 ');
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), pathFor(state));
    let html = await get(pathFor(state));
    assert.deepEqual(ids(html), [3, 4]);
    assert.match(html, /id="due-from"[^>]*value="2024-02-29"/);
    assert.match(html, /id="due-through"[^>]*value="2024-03-01"/);
    assert.match(html, /name="dueFrom" value="2024-02-29"/);
    for (const value of ['0000-01-01', '1900-02-29', '2024-04-31', '2024-2-29', '99999-01-01']) {
      response = await apply(value, '');
      assert.equal(response.status, 422);
      html = await response.text();
      assert.match(html, /role="alert">Due range must use valid YYYY-MM-DD dates/);
      assert.deepEqual(ids(html), [3, 4]);
    }
    response = await apply('2024-03-02', '2024-03-01');
    assert.equal(response.status, 422);
    html = await response.text();
    assert.match(html, /role="alert">Due from must not be after Due through/);
    assert.deepEqual(ids(html), [3, 4]);
    for (const [from, through, expected] of [
      ['', '', [1, 2, 3, 4, 5]], ['', '2024-02-29', [2, 3]],
      ['2024-03-01', '', [4, 5]], ['2024-02-29', '2024-02-29', [3]],
      ['0001-01-01', '9999-12-31', [2, 3, 4, 5]],
    ]) {
      response = await apply(from, through);
      assert.equal(response.status, 303);
      assert.deepEqual(ids(await get(response.headers.get('location'))), expected);
    }
    assert.equal(await get('/'), summary);
    for (const [action, values] of [
      ['/rename', { name: 'Renamed' }], ['/default-priority', { priority: 'Low' }],
      ['/tasks/3/rename', { title: 'Renamed task' }], ['/tasks', { title: 'Undated new' }],
    ]) {
      response = await post('/projects/1' + action, { ...state, ...values });
      assert.equal(response.headers.get('location'), pathFor(state));
      assert.deepEqual(ids(await get(pathFor(state))), [3, 4]);
    }
    response = await post('/projects/1/tasks/3/rename', { ...state, title: ' ' });
    assert.equal(response.status, 422);
    assert.deepEqual(ids(await response.text()), [3, 4]);
    await post('/projects/1/tasks/3', { ...state, completed: '1' });
    assert.deepEqual(ids(await get(pathFor(state))), [4]);
    assert.deepEqual(ids(await get(pathFor({ ...state, filter: 'Completed' }))), [3]);
    await post('/projects/1/tasks/4/priority', { ...state, priority: 'Low' });
    assert.deepEqual(ids(await get(pathFor(state))), []);
    assert.deepEqual(ids(await get(pathFor({ ...state, priorityFilter: 'Low' }))), [4]);
    await post('/projects/1/tasks/4/due-date', { ...state, dueDate: '2024-04-01' });
    assert.deepEqual(ids(await get(pathFor({ ...state, priorityFilter: 'All' }))), []);
    await post('/projects/1/tasks/2/due-date', { ...state, dueDate: '2024-02-29' });
    assert.deepEqual(ids(await get(pathFor(state))), [2]);
    await post('/projects/1/tasks/2/due-date', { ...state, dueDate: ' ' });
    assert.deepEqual(ids(await get(pathFor(state))), []);
    assert.match(await get('/'), /1\/6 completed/);
    await post('/projects/1/archive');
    html = await get(pathFor({ ...state, filter: 'All' }));
    assert.deepEqual(ids(html), [3]);
    assert.match(html, /id="task-due-date-3"[^>]* disabled/);
    assert.doesNotMatch(html, /id="due-(?:from|through)"[^>]* disabled/);
    response = await apply('', '', { ...state, filter: 'All' });
    assert.equal(response.status, 303);
    assert.equal(ids(await get(response.headers.get('location'))).length, 4);
    await stop();
    await start();
    assert.deepEqual(ids(await get(pathFor({ ...state, filter: 'Completed' }))), [3]);
    await post('/projects/1/restore');
    html = await get('/projects/1');
    assert.equal(ids(html).length, 6);
    assert.match(html, /id="due-from"[^>]*value=""/);
    assert.match(html, /id="due-through"[^>]*value=""/);
    assert.match(html, /id="task-due-date-3"[^>]*value="2024-02-29"/);
    assert.doesNotMatch(html, /id="task-due-date-3"[^>]* disabled/);
  } finally {
    if (server) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
