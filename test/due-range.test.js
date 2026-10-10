import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeDueRange } from '../src/due-date.js';
import { launch } from './server-helper.js';

function titles(html) {
  return [...html.matchAll(/class="task-title">(.*?)<\/span>/g)].map((match) => match[1]);
}

function assertSelection(html, selection) {
  for (const [name, value] of Object.entries(selection)) {
    if (name === 'filter' || name === 'priorityFilter') {
      const id = name === 'filter' ? 'task-filter' : 'priority-filter';
      const select = html.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`))[1];
      assert.ok(select.includes(`<option selected>${value}</option>`));
    }
    for (const [, form] of html.matchAll(/<form[^>]*method="post">([\s\S]*?)<\/form>/g)) {
      assert.ok(form.includes(`name="${name}" value="${value}"`));
    }
  }
  const filterForm = html.match(/<form class="task-filter"[^>]*>([\s\S]*?)<\/form>/)[1];
  for (const name of ['dueFrom', 'dueThrough']) {
    assert.ok(filterForm.includes(`name="${name}" value="${selection[name]}"`));
  }
}

test('due range validation shares calendar rules and validates ordering after trimming', () => {
  assert.deepEqual(normalizeDueRange(' \t ', ''), { dueFrom: '', dueThrough: '' });
  assert.deepEqual(normalizeDueRange(' 0001-01-01 ', ' 9999-12-31 '), {
    dueFrom: '0001-01-01', dueThrough: '9999-12-31',
  });
  assert.deepEqual(normalizeDueRange('2000-02-29', '2000-02-29'), {
    dueFrom: '2000-02-29', dueThrough: '2000-02-29',
  });
  for (const invalid of ['0000-01-01', '10000-01-01', '1900-02-29', '2024-04-31', '2024-2-01', '<invalid>']) {
    for (const pair of [[invalid, ''], ['', invalid]]) {
      assert.equal(normalizeDueRange(...pair).error, 'Due range must use valid YYYY-MM-DD dates');
    }
  }
  assert.equal(normalizeDueRange('2024-03-01', '2024-02-29').error,
    'Due from must not be after Due through');
});

test('inclusive due ranges intersect filters and preserve data through edits, validation, archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-ranges-'));
  let running;
  try {
    const databasePath = join(directory, 'workboard.sqlite');
    running = await launch(databasePath);
    const get = async (path) => (await fetch(`${running.baseUrl}${path}`)).text();
    const post = (path, values = {}) => fetch(`${running.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const apply = (selection, rangeFrom, rangeThrough) => fetch(`${running.baseUrl}/projects/1?${
      new URLSearchParams({ ...selection, applyDueRange: '1', rangeFrom, rangeThrough })
    }`, { redirect: 'manual' });
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Other' });
    const tasks = [];
    for (const [index, date] of ['', '0001-01-01', '2024-02-28', '2024-02-29', '2024-03-01', '9999-12-31'].entries()) {
      const id = index + 1;
      const title = `Task ${id}`;
      const priority = ['High', 'Low', 'Normal'][index % 3];
      const completed = index % 2 === 1;
      await post('/projects/1/tasks', { title });
      await post(`/projects/1/tasks/${id}/due-date`, { dueDate: date });
      await post(`/projects/1/tasks/${id}/priority`, { priority });
      if (completed) await post(`/projects/1/tasks/${id}/completion`, { completed: 'on' });
      tasks.push({ title, date, priority, completed });
    }
    await post('/projects/2/tasks', { title: 'Other task' });
    const summary = await get('/');
    const other = await get('/projects/2');
    const original = await get('/projects/1');
    assert.match(original, /<label for="due-from">Due from<\/label>/);
    assert.match(original, /<label for="due-through">Due through<\/label>/);
    assert.match(original, /id="due-from" name="rangeFrom" type="text" value=""/);
    assert.match(original, /id="due-through" name="rangeThrough" type="text" value=""/);
    assert.match(original, />Apply due range<\/button>/);
    const ranges = [['', ''], ['2024-02-29', ''], ['', '2024-02-29'],
      ['2024-02-28', '2024-03-01'], ['2024-02-29', '2024-02-29'], ['0001-01-01', '9999-12-31']];
    for (const [dueFrom, dueThrough] of ranges) {
      for (const filter of ['All', 'Open', 'Completed']) {
        for (const priorityFilter of ['All', 'Low', 'Normal', 'High']) {
          const selection = { filter, priorityFilter, dueFrom, dueThrough };
          const response = await apply(selection, ` ${dueFrom} `, ` ${dueThrough} `);
          assert.equal(response.status, 303);
          const html = await get(response.headers.get('location'));
          assertSelection(html, selection);
          assert.deepEqual(titles(html), tasks.filter((task) =>
            (filter === 'All' || task.completed === (filter === 'Completed')) &&
            (priorityFilter === 'All' || task.priority === priorityFilter) &&
            (!(dueFrom || dueThrough) || (task.date &&
              (!dueFrom || task.date >= dueFrom) && (!dueThrough || task.date <= dueThrough))))
            .map((task) => task.title));
        }
      }
    }
    assert.equal(await get('/'), summary);
    assert.equal(await get('/projects/1'), original);
    const selection = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-03-01' };
    const path = `/projects/1?${new URLSearchParams(selection)}`;
    assert.deepEqual(titles(await get(path)), ['Task 4']);
    for (const [from, through, message] of [
      ['1900-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['', '2024-04-31', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-03-01', '2024-02-29', 'Due from must not be after Due through'],
    ]) {
      const response = await apply(selection, from, through);
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.ok(html.includes(`role="alert">${message}`));
      assertSelection(html, selection);
      assert.deepEqual(titles(html), ['Task 4']);
    }
    const edit = async (action, values, expectedTitles) => {
      const response = await post(action, { ...selection, ...values });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), path);
      const html = await get(path);
      assertSelection(html, selection);
      assert.deepEqual(titles(html), expectedTitles);
      return html;
    };
    for (const [action, values] of [
      ['/projects/1/rename', { name: ' ' }],
      ['/projects/1/tasks', { title: ' ' }],
      ['/projects/1/tasks/4/rename', { title: ' ' }],
      ['/projects/1/tasks/4/due-date', { dueDate: '2024-02-30' }],
    ]) {
      const response = await post(action, { ...selection, ...values });
      assert.equal(response.status, 400);
      const html = await response.text();
      assertSelection(html, selection);
      assert.deepEqual(titles(html), ['Task 4']);
    }
    await edit('/projects/1/tasks/4/rename', { title: 'Renamed' }, ['Renamed']);
    await edit('/projects/1/rename', { name: 'Renamed project' }, ['Renamed']);
    await edit('/projects/1/default-task-priority', { priority: 'High' }, ['Renamed']);
    await edit('/projects/1/tasks', { title: 'New undated' }, ['Renamed']);
    await edit('/projects/1/tasks/4/due-date', { dueDate: '' }, []);
    await edit('/projects/1/tasks/4/due-date', { dueDate: '2024-03-01' }, ['Renamed']);
    await edit('/projects/1/tasks/4/priority', { priority: 'Low' }, []);
    await edit('/projects/1/tasks/4/priority', { priority: 'High' }, ['Renamed']);
    await edit('/projects/1/tasks/4/completion', {}, []);
    await edit('/projects/1/tasks/4/completion', { completed: 'on' }, ['Renamed']);
    assert.match(await get('/'), /3\/7 completed/);
    assert.equal(await get('/projects/2'), other.replace('<option value="1">First</option>', '<option value="1">Renamed project</option>'));
    const saved = await get('/projects/1');
    const filtered = await get(path);
    await post('/projects/1/archive');
    const response = await apply(selection, '2024-02-29', '2024-03-01');
    assert.equal(response.status, 303);
    const archived = await get(response.headers.get('location'));
    assertSelection(archived, selection);
    assert.deepEqual(titles(archived), ['Renamed']);
    const rangeForm = archived.match(/<form class="due-range-form"[^>]*>([\s\S]*?)<\/form>/)[1];
    assert.doesNotMatch(rangeForm, /disabled/);
    assert.match(archived, /name="dueDate"[^>]* disabled/);
    assert.equal((await post('/projects/1/tasks/4/due-date', { dueDate: '2024-02-29' })).status, 409);
    await running.stop();
    running = await launch(databasePath);
    assert.equal(await get(path), archived);
    await post('/projects/1/restore');
    assert.equal(await get(path), filtered);
    assert.equal(await get('/projects/1'), saved);
    assert.match(saved, /id="due-from" name="rangeFrom" type="text" value=""/);
    assert.match(saved, /id="due-through" name="rangeThrough" type="text" value=""/);
  } finally {
    await running?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
