import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApplication } from '../server.js';

test('combined filters retain selections through edits, validation, archives and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-filters-'));
  let server;
  let url;
  const start = async () => {
    server = createApplication(join(directory, 'db.sqlite'));
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    url = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = () => new Promise(resolve => server.close(resolve));
  const html = async path => (await fetch(`${url}${path}`)).text();
  const post = (path, values = {}) => fetch(`${url}${path}`, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const titles = text => [...text.matchAll(/aria-label="Complete ([^"]+)"/g)].map(match => match[1]);
  const selected = (text, id) => text.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`))[1].match(/<option selected>(.*?)<\/option>/)[1];
  const view = (filter, priorityFilter) => html(`/projects/1?${new URLSearchParams({ filter, priorityFilter })}`);
  try {
    await start();
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Other' });
    const priorities = ['Low', 'Normal', 'High', 'Low', 'Normal', 'High'];
    for (let index = 0; index < priorities.length; index++) {
      await post('/projects/1/tasks', { title: `Task ${index + 1}` });
      await post(`/projects/1/tasks/${index + 1}/priority`, { priority: priorities[index] });
      if (index >= 3) await post(`/projects/1/tasks/${index + 1}/completion`, { completed: '1' });
    }
    const summary = await html('/');
    assert.match(summary, /3\/6 completed/);
    for (const filter of ['All', 'Open', 'Completed']) {
      for (const priorityFilter of ['All', 'Low', 'Normal', 'High']) {
        const text = await view(filter, priorityFilter);
        assert.equal(selected(text, 'task-filter'), filter);
        assert.equal(selected(text, 'priority-filter'), priorityFilter);
        assert.deepEqual(titles(text), priorities.flatMap((priority, index) =>
          (priorityFilter === 'All' || priority === priorityFilter) &&
          (filter === 'All' || (index >= 3) === (filter === 'Completed')) ? [`Task ${index + 1}`] : []));
      }
    }
    const initial = await html('/projects/1');
    assert.equal(selected(initial, 'priority-filter'), 'All');
    assert.match(initial, /<option selected>All<\/option><option>Low<\/option><option>Normal<\/option><option>High<\/option>/);
    assert.deepEqual(titles(await html('/projects/2')), []);
    const filters = { filter: 'Open', priorityFilter: 'High' };
    const edit = async (action, values) => {
      const response = await post(`/projects/1/tasks/3/${action}`, { ...filters, ...values });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/projects/1?filter=Open&priorityFilter=High');
      const text = await html(response.headers.get('location'));
      assert.equal(selected(text, 'task-filter'), 'Open');
      assert.equal(selected(text, 'priority-filter'), 'High');
      return text;
    };
    assert.deepEqual(titles(await edit('rename', { title: ' Renamed ' })), ['Renamed']);
    assert.equal(await html('/'), summary);
    const invalid = await post('/projects/1/tasks/3/rename', { ...filters, title: ' ' });
    assert.equal(invalid.status, 400);
    const invalidHtml = await invalid.text();
    assert.match(invalidHtml, /role="alert">Task title is required/);
    assert.equal(selected(invalidHtml, 'priority-filter'), 'High');
    assert.deepEqual(titles(await edit('priority', { priority: 'Low' })), []);
    assert.equal(await html('/'), summary);
    assert.deepEqual(titles(await edit('priority', { priority: 'High' })), ['Renamed']);
    assert.deepEqual(titles(await edit('completion', { completed: '1' })), []);
    assert.deepEqual(titles(await view('Completed', 'High')), ['Renamed', 'Task 6']);
    const persisted = await view('Completed', 'High');
    await stop();
    await start();
    assert.equal(await view('Completed', 'High'), persisted);
    await post('/projects/1/archive');
    const archived = await view('Completed', 'High');
    assert.equal(selected(archived, 'priority-filter'), 'High');
    assert.match(archived, /name="priority" disabled data-auto-submit/);
    assert.doesNotMatch(archived, /id="(?:task-filter|priority-filter)"[^>]*disabled/);
    const rejected = await post('/projects/1/tasks/3/priority', { ...filters, priority: 'Normal' });
    assert.equal(rejected.status, 403);
    assert.equal(selected(await rejected.text(), 'priority-filter'), 'High');
    assert.deepEqual(titles(await view('Open', 'Low')), ['Task 1']);
    await post('/projects/1/restore');
    assert.equal(await view('Completed', 'High'), persisted);
    assert.equal(selected(await html('/projects/1'), 'priority-filter'), 'All');
    const fallback = await view('invalid', 'invalid');
    assert.equal(selected(fallback, 'task-filter'), 'All');
    assert.equal(selected(fallback, 'priority-filter'), 'All');
  } finally {
    if (server?.listening) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
