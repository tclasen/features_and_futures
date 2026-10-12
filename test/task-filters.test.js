import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// A small DOM adapter exercises the actual application event handlers without
// adding browser or application dependencies. It supports the markup used here.
class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.listeners = {};
    this.value = '';
    this.disabled = false;
  }
  append(...children) {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
      if (this.tag === 'select' && this.children.length === 1) this.value = child.value;
    }
  }
  replaceChildren() { this.children = []; }
  setAttribute(key, value) { this.attributes[key] = value; }
  remove() { this.parent.children = this.parent.children.filter((child) => child !== this); }
  focus() {}
  addEventListener(event, listener) { this.listeners[event] = listener; }
  async fire(event) { await this.listeners[event]?.({ preventDefault() {} }); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  querySelectorAll(selector) {
    const matches = (element) => selector.startsWith('#') ? element.id === selector.slice(1)
      : selector === '[role="alert"]' ? element.attributes.role === 'alert'
      : element.tag === selector;
    return this.children.flatMap((child) => [
      ...(matches(child) ? [child] : []), ...child.querySelectorAll(selector),
    ]);
  }
  set innerHTML(markup) {
    this.replaceChildren();
    const stack = [this];
    for (const token of markup.match(/<[^>]+>|[^<]+/g) ?? []) {
      if (token.startsWith('</')) { stack.pop(); continue; }
      if (!token.startsWith('<')) {
        stack.at(-1).textContent = (stack.at(-1).textContent ?? '') + token.trim();
        continue;
      }
      const tag = token.match(/^<(\w+)/)[1];
      const element = new Element(tag);
      for (const [, key, value] of token.matchAll(/([\w-]+)="([^"]*)"/g)) {
        element.setAttribute(key, value);
        if (['id', 'value', 'type'].includes(key)) element[key] = value;
        if (key === 'for') element.htmlFor = value;
      }
      element.disabled = /\sdisabled(?:\s|>)/.test(token);
      stack.at(-1).append(element);
      if (tag !== 'input') stack.push(element);
    }
  }
}

async function projectPage(archived = false, dates = [], destinations = []) {
  const project = { id: 1, name: 'Project', archived, total: 6, completed: 3, default_priority: 'Normal' };
  const tasks = ['Low', 'Normal', 'High'].flatMap((priority, index) => [
    { id: index * 2 + 1, title: `${priority} open`, completed: false, priority, due_date: '' },
    { id: index * 2 + 2, title: `${priority} completed`, completed: true, priority, due_date: '' },
  ]);
  tasks.forEach((task, index) => { task.due_date = dates[index] ?? ''; });
  const app = new Element('main');
  const document = { querySelector: () => app, createElement: (tag) => new Element(tag) };
  const writes = [];
  const fetch = async (path, options) => {
    if (options) {
      assert.equal(archived, false, 'Archived controls must not write task data');
      const change = JSON.parse(options.body);
      if (options.method === 'POST') {
        const task = { id: tasks.length + 1, title: change.title.trim(), completed: false,
          priority: project.default_priority, due_date: '' };
        tasks.push(task);
        writes.push(change);
        return { ok: true, json: async () => structuredClone(task) };
      }
      if (Object.hasOwn(change, 'default_priority') || Object.hasOwn(change, 'name')) {
        writes.push(change);
        Object.assign(project, change);
        return { ok: true, json: async () => structuredClone(project) };
      }
      const task = tasks.find((task) => task.id === Number(path.split('/').at(-1)));
      if (Object.hasOwn(change, 'destination_project_id')) {
        writes.push(change);
        tasks.splice(tasks.indexOf(task), 1);
        return { ok: true, json: async () => structuredClone(task) };
      }
      if (change.title !== undefined) change.title = change.title.trim();
      if (change.due_date !== undefined) {
        if (change.due_date === 'invalid') {
          return { ok: false, json: async () => ({ error: 'Due date must be a valid YYYY-MM-DD date' }) };
        }
        change.due_date = change.due_date.trim();
      }
      writes.push(change);
      Object.assign(task, change);
      return { ok: true, json: async () => structuredClone(task) };
    }
    return { ok: true, json: async () => structuredClone(path === '/api/projects' ?
      [project, ...destinations] : path.endsWith('/tasks') ? tasks : project) };
  };
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  await runInNewContext(source, {
    document, fetch, window: { location: { pathname: '/projects/1' } },
  });
  const completion = app.querySelector('#task-filter');
  const priority = app.querySelector('#priority-filter');
  const rows = () => app.querySelector('#tasks').children;
  const titles = () => rows().map((row) => row.children[0].textContent);
  const select = async (element, value) => { element.value = value; await element.fire('change'); };
  return { app, completion, priority, rows, titles, select, tasks, writes, project };
}

test('completion and priority filters intersect in creation order, including archived projects', async () => {
  for (const archived of [false, true]) {
    const page = await projectPage(archived);
    const { app, completion, priority, select, titles, tasks, rows } = page;
    assert.equal(completion.value, 'all');
    assert.equal(priority.value, 'all');
    assert.deepEqual(priority.children.map((option) => option.textContent), ['All', 'Low', 'Normal', 'High']);
    assert.equal(app.querySelectorAll('label').find((label) => label.htmlFor === 'priority-filter').textContent, 'Priority filter');
    for (const completed of ['all', 'open', 'completed']) {
      await select(completion, completed);
      for (const prioritized of ['all', 'Low', 'Normal', 'High']) {
        await select(priority, prioritized);
        assert.equal(completion.value, completed);
        assert.deepEqual(titles(), tasks.filter((task) =>
          (completed === 'all' || task.completed === (completed === 'completed')) &&
          (prioritized === 'all' || task.priority === prioritized)).map((task) => task.title));
        for (const row of rows()) {
          assert.equal(row.dataset.testid, 'task-row');
          assert.equal(row.querySelector('select').disabled, archived);
          assert.equal(row.querySelector('input').disabled, archived);
          assert.equal(row.querySelector('form').querySelector('input').disabled, archived);
          assert.equal(row.querySelector('form').querySelector('button').disabled, archived);
        }
      }
      await select(completion, 'all');
      assert.equal(priority.value, 'High');
    }
    assert.equal(completion.disabled, false);
    assert.equal(priority.disabled, false);
    assert.deepEqual(page.writes, []);
    assert.deepEqual(page.project, { id: 1, name: 'Project', archived, total: 6, completed: 3, default_priority: 'Normal' });
  }
});

test('default priority saves without changing filters or existing rows and is disabled when archived', async () => {
  for (const archived of [false, true]) {
    const { app, select, completion, priority, titles, tasks, project, writes } = await projectPage(archived);
    const defaultPriority = app.querySelector('#default-task-priority');
    assert.equal(app.querySelectorAll('label').find((label) => label.htmlFor === defaultPriority.id).textContent, 'Default task priority');
    assert.deepEqual(defaultPriority.children.map((option) => option.textContent), ['Low', 'Normal', 'High']);
    assert.equal(defaultPriority.value, 'Normal');
    assert.equal(defaultPriority.disabled, archived);
    await select(completion, 'completed');
    await select(priority, 'Low');
    const before = structuredClone(tasks);
    if (archived) {
      await defaultPriority.fire('change');
      assert.deepEqual(writes, []);
    } else {
      await select(defaultPriority, 'High');
      assert.deepEqual(writes, [{ default_priority: 'High' }]);
      assert.equal(project.default_priority, 'High');
      assert.equal(defaultPriority.value, 'High');
    }
    assert.equal(defaultPriority.disabled, archived);
    assert.equal(completion.value, 'completed');
    assert.equal(priority.value, 'Low');
    assert.deepEqual(titles(), ['Low completed']);
    assert.deepEqual(tasks, before);
    assert.equal(project.completed, 3);
    assert.equal(project.total, 6);
  }
});

test('task edits re-evaluate both filters and renaming preserves selections and membership', async () => {
  const page = await projectPage();
  const { app, completion, priority, select, titles, rows, tasks } = page;
  await select(completion, 'open');
  await select(priority, 'Low');
  assert.deepEqual(titles(), ['Low open']);
  const rowPriority = rows()[0].querySelector('select');
  await select(rowPriority, 'High');
  assert.deepEqual(titles(), []);
  assert.equal(app.querySelector('#empty-tasks').hidden, false);
  assert.equal(completion.value, 'open');
  assert.equal(priority.value, 'Low');
  assert.deepEqual(tasks[0], { id: 1, title: 'Low open', completed: false, priority: 'High', due_date: '' });
  await select(priority, 'High');
  assert.deepEqual(titles(), ['Low open', 'High open']);
  const checkbox = rows()[0].querySelector('input');
  checkbox.checked = true;
  await checkbox.fire('change');
  assert.deepEqual(titles(), ['High open']);
  assert.equal(completion.value, 'open');
  assert.equal(priority.value, 'High');
  await select(completion, 'completed');
  assert.deepEqual(titles(), ['Low open', 'High completed']);
  const rename = rows()[0].querySelector('form');
  rename.querySelector('input').value = '  Renamed task  ';
  await rename.fire('submit');
  assert.deepEqual(titles(), ['Renamed task', 'High completed']);
  assert.equal(rows()[0].querySelector('input').attributes['aria-label'], 'Complete Renamed task');
  assert.equal(completion.value, 'completed');
  assert.equal(priority.value, 'High');
  assert.deepEqual(tasks[0], { id: 1, title: 'Renamed task', completed: true, priority: 'High', due_date: '' });
  assert.deepEqual(page.writes, [{ priority: 'High' }, { completed: true }, { title: 'Renamed task' }]);
});

test('due date controls save, clear, and report errors without changing filters or task membership', async () => {
  const { app, select, completion, priority, rows, titles, tasks, project } = await projectPage();
  await select(completion, 'completed');
  await select(priority, 'Low');
  let row = rows()[0];
  let dueForm = row.querySelectorAll('form')[1];
  let input = dueForm.querySelector('input');
  assert.equal(input.type, 'text');
  assert.equal(input.value, '');
  assert.equal(dueForm.querySelector('label').textContent, 'Task due date');
  assert.equal(dueForm.querySelector('label').htmlFor, input.id);
  assert.equal(dueForm.querySelector('button').textContent, 'Save due date');
  const before = structuredClone(tasks[1]);
  input.value = '  0001-01-01  ';
  await dueForm.fire('submit');
  row = rows()[0];
  dueForm = row.querySelectorAll('form')[1];
  input = dueForm.querySelector('input');
  assert.equal(input.value, '0001-01-01');
  assert.deepEqual(tasks[1], { ...before, due_date: '0001-01-01' });
  input.value = 'invalid';
  await dueForm.fire('submit');
  assert.equal(app.querySelector('[role="alert"]').textContent, 'Due date must be a valid YYYY-MM-DD date');
  assert.equal(tasks[1].due_date, '0001-01-01');
  const rename = row.querySelector('form');
  rename.querySelector('input').value = 'Renamed dated task';
  await rename.fire('submit');
  assert.equal(tasks[1].due_date, '0001-01-01');
  input.value = '  \t\n';
  await dueForm.fire('submit');
  assert.equal(input.value, '');
  assert.equal(tasks[1].due_date, '');
  assert.equal(app.querySelector('[role="alert"]'), null);
  assert.equal(completion.value, 'completed');
  assert.equal(priority.value, 'Low');
  assert.deepEqual(titles(), ['Renamed dated task']);
  assert.equal(project.completed, 3);
  assert.equal(project.total, 6);
});

test('archived task due dates disable both controls and prevent saves', async () => {
  const { rows, writes } = await projectPage(true);
  for (const row of rows()) {
    const form = row.querySelectorAll('form')[1];
    assert.equal(form.querySelector('input').disabled, true);
    assert.equal(form.querySelector('button').disabled, true);
    await form.fire('submit');
  }
  assert.deepEqual(writes, []);
});

async function applyRange(page, from, through) {
  page.app.querySelector('#due-from').value = from;
  page.app.querySelector('#due-through').value = through;
  await page.app.querySelector('#due-range').fire('submit');
}

test('moving uses only eligible destinations and preserves all source filters and remaining membership', async () => {
  const destinations = [
    { id: 2, name: 'Renamed destination', archived: false },
    { id: 3, name: 'Archived destination', archived: true },
    { id: 4, name: 'Another destination', archived: false },
  ];
  const page = await projectPage(false, ['', '2024-03-01', '', '', '', '2024-03-01'], destinations);
  const { rows, app, select, completion, priority, titles, writes } = page;
  await select(completion, 'completed');
  await select(priority, 'all');
  await applyRange(page, '2024-03-01', '2024-03-01');
  assert.deepEqual(titles(), ['Low completed', 'High completed']);
  const moveForm = rows()[0].querySelectorAll('form')[2];
  const destination = moveForm.querySelector('select');
  assert.equal(moveForm.querySelector('label').textContent, 'Destination project');
  assert.equal(moveForm.querySelector('label').htmlFor, destination.id);
  assert.deepEqual(destination.children.map((option) => option.textContent),
    ['Renamed destination', 'Another destination']);
  assert.deepEqual(destination.children.map((option) => option.value), ['2', '4']);
  assert.equal(moveForm.querySelector('button').textContent, 'Move task');
  destination.value = '4';
  await moveForm.fire('submit');
  assert.deepEqual(writes, [{ destination_project_id: 4 }]);
  assert.deepEqual(titles(), ['High completed']);
  assert.equal(completion.value, 'completed');
  assert.equal(priority.value, 'all');
  assert.equal(app.querySelector('#due-from').value, '2024-03-01');
  assert.equal(app.querySelector('#due-through').value, '2024-03-01');
  await select(priority, 'High');
  assert.deepEqual(titles(), ['High completed']);
  await select(completion, 'all');
  assert.deepEqual(titles(), ['High completed']);
});

test('move controls are disabled without destinations or in an archived source', async () => {
  for (const [archived, destinations] of [
    [false, []],
    [false, [{ id: 2, name: 'Archived', archived: true }]],
    [true, [{ id: 2, name: 'Active', archived: false }]],
  ]) {
    const page = await projectPage(archived, [], destinations);
    for (const row of page.rows()) {
      const form = row.querySelectorAll('form')[2];
      assert.equal(form.querySelector('select').disabled, true);
      assert.equal(form.querySelector('button').disabled, true);
      assert.equal(form.querySelector('select').children.length, archived ? 1 : 0);
      await form.fire('submit');
    }
    assert.deepEqual(page.writes, []);
    assert.equal(page.titles().length, 6);
  }
});

test('inclusive due ranges intersect both filters, keep order, and work while archived', async () => {
  const dates = ['', '0001-01-01', '2024-02-29', '2024-03-01', '2024-03-01', '9999-12-31'];
  for (const archived of [false, true]) {
    const page = await projectPage(archived, dates);
    const { app, completion, priority, select, tasks, titles } = page;
    assert.equal(app.querySelector('#due-from').value, '');
    assert.equal(app.querySelector('#due-through').value, '');
    for (const id of ['due-from', 'due-through']) {
      assert.equal(app.querySelector(`#${id}`).type, 'text');
      assert.equal(app.querySelector(`#${id}`).disabled, false);
    }
    assert.equal(app.querySelector('#due-range').querySelector('button').textContent, 'Apply due range');
    const before = structuredClone(tasks);
    for (const [from, through] of [
      ['', ''], ['', '2024-03-01'], ['2024-03-01', ''],
      ['2024-03-01', '2024-03-01'], ['0001-01-01', '9999-12-31'],
      ['2025-01-01', '2025-12-31'],
    ]) {
      await applyRange(page, ` ${from} `, ` ${through} `);
      for (const completed of ['all', 'open', 'completed']) {
        await select(completion, completed);
        for (const prioritized of ['all', 'Low', 'Normal', 'High']) {
          await select(priority, prioritized);
          assert.deepEqual(titles(), tasks.filter((task) =>
            (completed === 'all' || task.completed === (completed === 'completed')) &&
            (prioritized === 'all' || task.priority === prioritized) &&
            ((!from && !through) || (task.due_date &&
              (!from || task.due_date >= from) && (!through || task.due_date <= through))))
            .map((task) => task.title));
          assert.equal(completion.value, completed);
          assert.equal(app.querySelector('#due-from').value, from);
          assert.equal(app.querySelector('#due-through').value, through);
        }
      }
    }
    assert.deepEqual(tasks, before);
    assert.deepEqual(page.writes, []);
    assert.equal(page.project.completed, 3);
    assert.equal(page.project.total, 6);
  }
});

test('invalid range applications retain applied membership and validate Gregorian dates', async () => {
  const page = await projectPage(false, ['', '2024-02-29', '2024-03-01']);
  await page.select(page.completion, 'completed');
  await page.select(page.priority, 'Low');
  await applyRange(page, '2024-02-29', '2024-02-29');
  assert.deepEqual(page.titles(), ['Low completed']);
  for (const invalid of ['0000-01-01', '10000-01-01', '2023-02-29', '1900-02-29',
    '2024-04-31', '2024-00-01', '2024-13-01', '2024-01-00', '2024-1-01',
    '2024-01-1', '2024-01-01x', 'invalid']) {
    for (const boundaries of [[invalid, ''], ['', invalid]]) {
      await applyRange(page, ...boundaries);
      assert.equal(page.app.querySelector('[role="alert"]').textContent,
        'Due range must use valid YYYY-MM-DD dates');
      assert.deepEqual(page.titles(), ['Low completed']);
      await page.select(page.priority, 'all');
      assert.deepEqual(page.titles(), ['Low completed']);
      await page.select(page.priority, 'Low');
    }
  }
  await applyRange(page, '2024-03-01', '2024-02-29');
  assert.equal(page.app.querySelector('[role="alert"]').textContent,
    'Due from must not be after Due through');
  assert.deepEqual(page.titles(), ['Low completed']);
  for (const valid of ['0001-01-01', '2000-02-29', '2024-02-29', '9999-12-31']) {
    await applyRange(page, valid, valid);
    assert.equal(page.app.querySelector('[role="alert"]'), null);
  }
  assert.equal(page.completion.value, 'completed');
  assert.equal(page.priority.value, 'Low');
  assert.deepEqual(page.writes, []);
});

test('edits re-evaluate the applied range and creation, renames, and defaults preserve filters', async () => {
  const page = await projectPage(false, ['2024-03-01', '', '', '', '2024-03-01']);
  const { app, rows, titles, completion, priority, select } = page;
  await select(completion, 'open');
  await select(priority, 'Low');
  await applyRange(page, '2024-03-01', '2024-03-01');
  const rename = rows()[0].querySelector('form');
  rename.querySelector('input').value = 'Renamed';
  await rename.fire('submit');
  assert.deepEqual(titles(), ['Renamed']);
  await select(app.querySelector('#default-task-priority'), 'High');
  const projectRename = app.querySelector('#new-project-name').parent.parent;
  app.querySelector('#new-project-name').value = 'New project name';
  await projectRename.fire('submit');
  const create = app.querySelector('#task-title').parent.parent;
  app.querySelector('#task-title').value = 'New undated task';
  await create.fire('submit');
  assert.deepEqual(titles(), ['Renamed']);
  assert.equal(page.tasks.at(-1).priority, 'High');
  let dueForm = rows()[0].querySelectorAll('form')[1];
  dueForm.querySelector('input').value = '2024-03-02';
  await dueForm.fire('submit');
  assert.deepEqual(titles(), []);
  await applyRange(page, '2024-03-01', '2024-03-02');
  assert.deepEqual(titles(), ['Renamed']);
  dueForm = rows()[0].querySelectorAll('form')[1];
  dueForm.querySelector('input').value = '  ';
  await dueForm.fire('submit');
  assert.deepEqual(titles(), []);
  await select(priority, 'High');
  assert.deepEqual(titles(), ['High open']);
  await select(rows()[0].querySelector('select'), 'Low');
  assert.deepEqual(titles(), []);
  await select(priority, 'Low');
  assert.deepEqual(titles(), ['High open']);
  const checkbox = rows()[0].querySelector('input');
  checkbox.checked = true;
  await checkbox.fire('change');
  assert.deepEqual(titles(), []);
  assert.equal(completion.value, 'open');
  assert.equal(priority.value, 'Low');
  assert.equal(app.querySelector('#due-from').value, '2024-03-01');
  assert.equal(app.querySelector('#due-through').value, '2024-03-02');
  await select(completion, 'completed');
  assert.deepEqual(titles(), ['High open']);
  const reopened = await projectPage();
  assert.equal(reopened.app.querySelector('#due-from').value, '');
  assert.equal(reopened.app.querySelector('#due-through').value, '');
});
