import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApplication } from '../server.js';

test('inclusive due ranges intersect filters, survive edits, validate and work while archived', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-range-'));
  let server;
  let url;
  const start = async () => {
    server = createApplication(join(directory, 'db.sqlite'));
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    url = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = () => new Promise(resolve => server.close(resolve));
  const html = async path => (await fetch(url + path)).text();
  const post = (path, values = {}) => fetch(url + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const titles = text => [...text.matchAll(/aria-label="Complete ([^"]+)"/g)].map(match => match[1]);
  const selected = (text, id) => text.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`))[1].match(/<option selected>(.*?)<\/option>/)[1];
  const range = { rangeFrom: '2000-02-29', rangeThrough: '2000-03-01' };
  const filters = { filter: 'Open', priorityFilter: 'High', ...range };
  const path = values => `/projects/1?${new URLSearchParams(values)}`;
  const apply = (dueFrom, dueThrough, previous = {}) => post('/projects/1/due-range', { ...previous, dueFrom, dueThrough });
  try {
    await start();
    await post('/projects', { name: 'Calendar' });
    const dates = ['', '2000-02-28', '2000-02-29', '2000-03-01', '2000-03-02'];
    for (let index = 0; index < dates.length; index++) {
      await post('/projects/1/tasks', { title: `Task ${index + 1}` });
      await post(`/projects/1/tasks/${index + 1}/due-date`, { dueDate: dates[index] });
      await post(`/projects/1/tasks/${index + 1}/priority`, { priority: 'High' });
    }
    await post('/projects/1/tasks/4/completion', { completed: '1' });
    const summary = await html('/');
    for (const [from, through, expected] of [
      ['', '', ['Task 1', 'Task 2', 'Task 3', 'Task 4', 'Task 5']],
      ['2000-02-29', '', ['Task 3', 'Task 4', 'Task 5']],
      ['', '2000-03-01', ['Task 2', 'Task 3', 'Task 4']],
      ['2000-02-29', '2000-03-01', ['Task 3', 'Task 4']],
      ['2000-02-29', '2000-02-29', ['Task 3']],
      ['0001-01-01', '9999-12-31', ['Task 2', 'Task 3', 'Task 4', 'Task 5']],
    ]) {
      const response = await apply(` ${from} `, ` ${through} `);
      assert.equal(response.status, 303);
      assert.deepEqual(titles(await html(response.headers.get('location'))), expected);
    }
    const applied = await apply(' 2000-02-29 ', ' 2000-03-01 ', filters);
    assert.equal(applied.headers.get('location'), path(filters));
    const visible = await html(path(filters));
    assert.deepEqual(titles(visible), ['Task 3']);
    assert.match(visible, /id="due-from" name="dueFrom" value="2000-02-29"/);
    assert.match(visible, /name="rangeThrough" value="2000-03-01"/);
    assert.equal(selected(visible, 'task-filter'), 'Open');
    assert.equal(selected(visible, 'priority-filter'), 'High');
    assert.deepEqual(titles(await html(path({ ...filters, filter: 'Completed' }))), ['Task 4']);
    assert.deepEqual(titles(await html(path({ ...filters, priorityFilter: 'Low' }))), []);
    for (const [from, through, message] of [
      ['1900-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['', '2000-04-31', 'Due range must use valid YYYY-MM-DD dates'],
      ['0000-01-01', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2000-2-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2000-03-02', '2000-03-01', 'Due from must not be after Due through'],
    ]) {
      const response = await apply(from, through, filters);
      assert.equal(response.status, 400);
      const text = await response.text();
      assert.ok(text.includes(`role="alert">${message}`));
      assert.deepEqual(titles(text), ['Task 3']);
      assert.match(text, /name="dueFrom" value="2000-02-29"/);
      assert.equal(selected(text, 'priority-filter'), 'High');
    }
    assert.equal(await html('/'), summary);
    const edit = async (endpoint, values, expected) => {
      const response = await post(`/projects/1/${endpoint}`, { ...filters, ...values });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), path(filters));
      assert.deepEqual(titles(await html(response.headers.get('location'))), expected);
    };
    await edit('tasks/3/rename', { title: 'Renamed' }, ['Renamed']);
    await edit('rename', { name: 'New calendar' }, ['Renamed']);
    await edit('default-priority', { priority: 'Low' }, ['Renamed']);
    await edit('tasks', { title: 'Undated' }, ['Renamed']);
    await edit('tasks/3/due-date', { dueDate: '2000-03-02' }, []);
    await edit('tasks/3/due-date', { dueDate: '2000-03-01' }, ['Renamed']);
    await edit('tasks/3/priority', { priority: 'Low' }, []);
    await edit('tasks/3/priority', { priority: 'High' }, ['Renamed']);
    await edit('tasks/3/completion', { completed: '1' }, []);
    await edit('tasks/3/completion', { completed: '0' }, ['Renamed']);
    assert.match(await html('/'), /1\/6 completed/);
    const persisted = await html(path(filters));
    await stop();
    await start();
    assert.equal(await html(path(filters)), persisted);
    await post('/projects/1/archive');
    const archived = await apply(range.rangeFrom, range.rangeThrough, filters);
    assert.equal(archived.status, 303);
    const archivedHtml = await html(archived.headers.get('location'));
    assert.deepEqual(titles(archivedHtml), ['Renamed']);
    assert.doesNotMatch(archivedHtml, /id="(?:due-from|due-through|task-filter|priority-filter)"[^>]*disabled/);
    assert.match(archivedHtml, /id="task-due-date-3"[^>]*disabled/);
    assert.match(archivedHtml, /disabled>Save due date/);
    const rejected = await post('/projects/1/tasks/3/due-date', { ...filters, dueDate: '' });
    assert.equal(rejected.status, 403);
    assert.deepEqual(titles(await rejected.text()), ['Renamed']);
    await post('/projects/1/restore');
    assert.equal(await html(path(filters)), persisted);
    await edit('tasks/3/due-date', { dueDate: ' ' }, []);
    const cleared = await apply('', '', filters);
    assert.equal(cleared.headers.get('location'), '/projects/1?filter=Open&priorityFilter=High');
    assert.deepEqual(titles(await html(cleared.headers.get('location'))), ['Task 1', 'Task 2', 'Renamed', 'Task 5']);
    const reopened = await html('/projects/1');
    assert.match(reopened, /name="dueFrom" value=""/);
    assert.match(reopened, /name="dueThrough" value=""/);
    assert.equal(selected(reopened, 'task-filter'), 'All');
    assert.equal(selected(reopened, 'priority-filter'), 'All');
  } finally {
    if (server?.listening) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
