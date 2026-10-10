import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch } from './server-helper.js';

function taskRows(html) {
  return [...html.matchAll(/<article class="task-row" data-testid="task-row">([\s\S]*?)<\/article>/g)]
    .map((match) => match[1]);
}

function titles(html) {
  return taskRows(html).map((row) => row.match(/class="task-title">(.*?)<\/span>/)[1]);
}

function assertFilters(html, filter, priorityFilter) {
  for (const [id, values, selected] of [
    ['task-filter', ['All', 'Open', 'Completed'], filter],
    ['priority-filter', ['All', 'Low', 'Normal', 'High'], priorityFilter],
  ]) {
    const select = html.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`));
    assert.ok(select);
    assert.doesNotMatch(select[0], / disabled/);
    const options = [...select[1].matchAll(/<option( selected)?>(.*?)<\/option>/g)];
    assert.deepEqual(options.map((option) => option[2]), values);
    assert.deepEqual(options.filter((option) => option[1]).map((option) => option[2]), [selected]);
  }
  const forms = [...html.matchAll(/<form[^>]*method="post">([\s\S]*?)<\/form>/g)];
  for (const [, form] of forms) {
    assert.ok(form.includes(`name="filter" value="${filter}"`));
    assert.ok(form.includes(`name="priorityFilter" value="${priorityFilter}"`));
  }
  // Both selects submit together, preserving the other selection on change.
  const filterForm = html.match(/<form class="task-filter"[^>]*>([\s\S]*?)<\/form>/)[1];
  assert.match(filterForm, /id="task-filter"[^>]* data-submit-on-change/);
  assert.match(filterForm, /id="priority-filter"[^>]* data-submit-on-change/);
}

test('combined filters preserve order, selections and saved data through edits, archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-combined-filters-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let running;
  try {
    running = await launch(databasePath);
    const get = async (path) => (await fetch(`${running.baseUrl}${path}`)).text();
    const post = (path, values = {}) => fetch(`${running.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const tasks = [];
    // Interleave priorities and completion to make ordering checks meaningful.
    for (const [index, priority] of ['High', 'Low', 'Normal', 'Low', 'High', 'Normal'].entries()) {
      const id = index + 1;
      const completed = index >= 3;
      const title = `${priority} ${completed ? 'done' : 'open'}`;
      await post('/projects/1/tasks', { title });
      await post(`/projects/1/tasks/${id}/priority`, { priority });
      if (completed) await post(`/projects/1/tasks/${id}/completion`, { completed: 'on' });
      tasks.push({ id, title, priority, completed });
    }
    await post('/projects/2/tasks', { title: 'Other project' });
    const saved = await get('/projects/1');
    const summary = await get('/');
    const otherProject = await get('/projects/2');
    assert.match(summary, /3\/6 completed/);
    assert.match(await get('/projects/1'), /<label for="priority-filter">Priority filter<\/label>/);
    assertFilters(saved, 'All', 'All');
    assert.match(summary, /action="\/projects\/1" method="get"/);
    for (const filter of ['All', 'Open', 'Completed']) {
      for (const priorityFilter of ['All', 'Low', 'Normal', 'High']) {
        const html = await get(`/projects/1?${new URLSearchParams({ filter, priorityFilter })}`);
        assertFilters(html, filter, priorityFilter);
        assert.deepEqual(titles(html), tasks.filter((task) =>
          (filter === 'All' || task.completed === (filter === 'Completed')) &&
          (priorityFilter === 'All' || priorityFilter === task.priority)).map((task) => task.title));
      }
    }
    assert.equal(await get('/projects/1'), saved);
    assert.equal(await get('/'), summary);
    assertFilters(await get('/projects/1?filter=invalid&priorityFilter=Urgent'), 'All', 'All');

    const selection = { filter: 'Open', priorityFilter: 'High' };
    const path = '/projects/1?filter=Open&priorityFilter=High';
    const edit = async (action, values) => {
      const response = await post(action, { ...selection, ...values });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), path);
      const html = await get(response.headers.get('location'));
      assertFilters(html, 'Open', 'High');
      return html;
    };
    for (const [action, alert] of [
      ['/projects/1/tasks/1/rename', 'Task title is required'],
      ['/projects/1/tasks', 'Task title is required'],
      ['/projects/1/rename', 'Project name is required'],
    ]) {
      const response = await post(action, { ...selection, title: '  ', name: '  ' });
      assert.equal(response.status, 400);
      const html = await response.text();
      assertFilters(html, 'Open', 'High');
      assert.ok(html.includes(`role="alert">${alert}`));
      assert.deepEqual(titles(html), ['High open']);
    }
    let html = await edit('/projects/1/tasks/1/rename', { title: '  Renamed  ' });
    assert.deepEqual(titles(html), ['Renamed']);
    assert.match(taskRows(html)[0], /aria-label="Complete Renamed"/);
    assert.match(taskRows(html)[0], /<option selected>High<\/option>/);
    assert.doesNotMatch(taskRows(html)[0], /aria-label="Complete Renamed" checked/);
    assert.equal(await get('/'), summary);
    html = await edit('/projects/1/tasks/1/priority', { priority: 'Low' });
    assert.deepEqual(titles(html), []);
    assert.deepEqual(titles(await get('/projects/1?filter=Open&priorityFilter=Low')), ['Renamed', 'Low open']);
    assert.equal(await get('/'), summary);
    await edit('/projects/1/tasks/1/priority', { priority: 'High' });
    html = await edit('/projects/1/tasks/1/completion', { completed: 'on' });
    assert.deepEqual(titles(html), []);
    assert.deepEqual(titles(await get('/projects/1?filter=Completed&priorityFilter=High')), ['Renamed', 'High done']);
    assert.match(await get('/'), /4\/6 completed/);
    html = await edit('/projects/1/tasks/1/completion', {});
    assert.deepEqual(titles(html), ['Renamed']);
    assert.equal(await get('/'), summary);
    assert.equal(await get('/projects/2'), otherProject);

    const updated = await get('/projects/1');
    await post('/projects/1/archive');
    const archivedPath = '/projects/1?filter=Completed&priorityFilter=Low';
    const archived = await get(archivedPath);
    assertFilters(archived, 'Completed', 'Low');
    assert.deepEqual(titles(archived), ['Low done']);
    assert.match(archived, /Archived project/);
    for (const row of taskRows(archived)) {
      assert.match(row, /type="checkbox"[^>]* disabled/);
      assert.match(row, /name="title"[^>]* disabled/);
      assert.match(row, /<button type="submit" disabled>Rename task/);
      assert.match(row, /name="priority"[^>]* disabled/);
    }
    for (const action of ['rename', 'completion', 'priority']) {
      assert.equal((await post(`/projects/1/tasks/4/${action}`, {
        title: 'Blocked', completed: 'on', priority: 'High', ...selection,
      })).status, 409);
    }
    await running.stop();
    running = await launch(databasePath);
    assert.equal(await get(archivedPath), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), updated);
    assert.equal(await get('/'), summary);
    assertFilters(await get('/projects/1'), 'All', 'All');
    html = await edit('/projects/1/tasks/1/priority', { priority: 'Normal' });
    assert.deepEqual(titles(html), []);
    const persistedPath = '/projects/1?filter=Open&priorityFilter=Normal';
    const persisted = await get(persistedPath);
    assert.deepEqual(titles(persisted), ['Renamed', 'Normal open']);
    await running.stop();
    running = await launch(databasePath);
    assert.equal(await get(persistedPath), persisted);
    assert.equal(await get('/'), summary);
  } finally {
    await running?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
