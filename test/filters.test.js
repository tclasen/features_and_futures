import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApplication } from '../app.js';

test('combined filters preserve selection through edits, archive, and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-filters-'));
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
  const rows = html => [...html.matchAll(/aria-label="Complete ([^"]+)"/g)].map(match => match[1]);
  function selection(html, id) {
    const control = html.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`));
    assert.ok(control);
    assert.doesNotMatch(control[0], /disabled/);
    return control[1].match(/<option selected>(.*?)<\/option>/)[1];
  }
  function check(html, filter, priority, titles) {
    assert.equal(selection(html, 'task-filter'), filter);
    assert.equal(selection(html, 'priority-filter'), priority);
    assert.deepEqual(rows(html), titles);
  }
  const path = (filter, priority) => `/projects/1?filter=${filter}&priorityFilter=${priority}`;
  try {
    await start();
    await post('/projects', { name: 'Project' });
    for (const title of ['Low open', 'Normal open', 'High open', 'Low done', 'Normal done', 'High done']) {
      await post('/projects/1/tasks', { title });
    }
    for (let id = 1; id <= 6; id++) {
      await post(`/projects/1/tasks/${id}/priority`, { priority: ['Low', 'Normal', 'High'][(id - 1) % 3] });
      if (id > 3) await post(`/projects/1/tasks/${id}`, { completed: '1' });
    }
    const summary = await get('/');
    assert.match(summary, /3\/6 completed/);
    const initial = await get('/projects/1');
    check(initial, 'All', 'All', ['Low open', 'Normal open', 'High open', 'Low done', 'Normal done', 'High done']);
    assert.deepEqual([...initial.match(/<select id="priority-filter"[^>]*>([\s\S]*?)<\/select>/)[1]
      .matchAll(/<option(?: selected)?>(.*?)<\/option>/g)].map(match => match[1]), ['All', 'Low', 'Normal', 'High']);
    for (const filter of ['All', 'Open', 'Completed']) {
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        const titles = ['Low open', 'Normal open', 'High open', 'Low done', 'Normal done', 'High done']
          .filter(title => (priority === 'All' || title.startsWith(priority))
            && (filter === 'All' || title.endsWith(filter === 'Open' ? 'open' : 'done')));
        check(await get(path(filter, priority)), filter, priority, titles);
      }
    }
    assert.equal(await get('/'), summary);
    const selected = { filter: 'Open', priorityFilter: 'High' };
    async function edit(route, values, titles) {
      const response = await post(route, { ...selected, ...values });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), path('Open', 'High'));
      check(await get(response.headers.get('location')), 'Open', 'High', titles);
    }
    await edit('/projects/1/tasks/3/rename', { title: '  Renamed  ' }, ['Renamed']);
    assert.equal(await get('/'), summary);
    await edit('/projects/1/tasks/3/priority', { priority: 'Low' }, []);
    assert.equal(await get('/'), summary);
    await edit('/projects/1/tasks/1/priority', { priority: 'High' }, ['Low open']);
    await edit('/projects/1/tasks/1', { completed: '1' }, []);
    await edit('/projects/1/tasks/6', {}, ['High done']);
    assert.equal(await get('/'), summary);
    for (const [route, values] of [
      ['/projects/1/tasks/6/rename', { title: ' ' }],
      ['/projects/1/tasks', { title: '' }],
      ['/projects/1/rename', { name: ' ' }],
      ['/projects/1/tasks/6/priority', { priority: 'Urgent' }],
    ]) {
      const response = await post(route, { ...selected, ...values });
      assert.equal(response.status, 422);
      check(await response.text(), 'Open', 'High', ['High done']);
    }
    await edit('/projects/1/rename', { name: 'Renamed project' }, ['High done']);
    await post('/projects/1/archive');
    const archived = await get(path('Open', 'High'));
    check(archived, 'Open', 'High', ['High done']);
    assert.match(archived, /Archived project/);
    assert.match(archived, /id="task-priority-6"[^>]*disabled/);
    assert.match(archived, /id="task-6"[^>]*disabled/);
    assert.match(archived, /id="new-task-title-6"[^>]*disabled/);
    const denied = await post('/projects/1/tasks/6/priority', { ...selected, priority: 'Low' });
    assert.equal(denied.status, 403);
    check(await denied.text(), 'Open', 'High', ['High done']);
    await stop();
    await start();
    assert.equal(await get(path('Open', 'High')), archived);
    await post('/projects/1/restore');
    check(await get(path('Open', 'High')), 'Open', 'High', ['High done']);
    assert.doesNotMatch((await get(path('Open', 'High'))).match(/<select id="task-priority-6"[^>]*>/)[0], /disabled/);
    // Opening from the list has no filter query, so both controls default to All.
    check(await get('/projects/1'), 'All', 'All', ['Low open', 'Normal open', 'Renamed', 'Low done', 'Normal done', 'High done']);
    check(await get('/projects/1?filter=invalid&priorityFilter=invalid'), 'All', 'All', ['Low open', 'Normal open', 'Renamed', 'Low done', 'Normal done', 'High done']);
  } finally {
    if (server) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
