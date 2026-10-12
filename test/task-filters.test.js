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

async function projectPage(archived = false, dates = [], destinations = [], initialTitles = [], initialNotes = [], initialDeleted = []) {
  const project = { id: 1, name: 'Project', archived, total: 6, completed: 3, default_priority: 'Normal' };
  const tasks = ['Low', 'Normal', 'High'].flatMap((priority, index) => [
    { id: index * 2 + 1, title: `${priority} open`, completed: false, priority, due_date: '', notes: '' },
    { id: index * 2 + 2, title: `${priority} completed`, completed: true, priority, due_date: '', notes: '' },
  ]);
  tasks.forEach((task, index) => {
    task.due_date = dates[index] ?? '';
    task.title = initialTitles[index] ?? task.title;
    task.notes = initialNotes[index] ?? '';
    task.deleted = initialDeleted[index] ?? false;
  });
  const app = new Element('main');
  const downloads = [];
  const document = { querySelector: () => app, createElement: (tag) => {
    const element = new Element(tag);
    if (tag === 'a') element.click = () => downloads.push({ href: element.href, download: element.download });
    return element;
  } };
  const writes = [];
  const fetch = async (path, options) => {
    if (options) {
      assert.equal(archived, false, 'Archived controls must not write task data');
      const change = JSON.parse(options.body);
      if (options.method === 'POST') {
        const task = { id: tasks.length + 1, title: change.title.trim(), completed: false,
          priority: project.default_priority, due_date: '', notes: '', deleted: false };
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
  return { app, completion, priority, rows, titles, select, tasks, writes, project, downloads };
}

test('Download project stays enabled and preserves page controls for active and archived projects', async () => {
  for (const archived of [false, true]) {
    const page = await projectPage(archived, ['2024-03-01'], [], [], ['Exact notes'], [true]);
    const { app, completion, priority, select, downloads, tasks, project } = page;
    await select(completion, 'deleted');
    await select(priority, 'Low');
    await applyRange(page, '2024-03-01', '2024-03-01');
    await searchTasks(page, 'Low open');
    const beforeTasks = structuredClone(tasks);
    const beforeProject = structuredClone(project);
    const download = app.querySelectorAll('button').find((button) => button.textContent === 'Download project');
    assert.equal(download.type, 'button');
    assert.equal(download.disabled, false);
    await download.fire('click');
    assert.deepEqual(downloads, [{ href: '/api/projects/1/export', download: 'workboard-project.json' }]);
    assert.equal(completion.value, 'deleted');
    assert.equal(priority.value, 'Low');
    assert.equal(app.querySelector('#due-from').value, '2024-03-01');
    assert.equal(app.querySelector('#due-through').value, '2024-03-01');
    assert.equal(app.querySelector('#task-search').value, 'Low open');
    assert.deepEqual(page.titles(), ['Low open']);
    assert.deepEqual(tasks, beforeTasks);
    assert.deepEqual(project, beforeProject);
    assert.deepEqual(page.writes, []);
  }
});

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
  assert.deepEqual(tasks[0], { id: 1, title: 'Low open', completed: false, priority: 'High', due_date: '', notes: '', deleted: false });
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
  assert.deepEqual(tasks[0], { id: 1, title: 'Renamed task', completed: true, priority: 'High', due_date: '', notes: '', deleted: false });
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

async function searchTasks(page, query) {
  page.app.querySelector('#task-search').value = query;
  await page.app.querySelector('#task-search-form').fire('submit');
}

test('task search intersects all filters, retains applied queries, and works while archived', async () => {
  const dates = ['', '2024-03-01', '2024-03-01', '', '2024-03-01', '2024-03-01'];
  for (const archived of [false, true]) {
    const page = await projectPage(archived, dates);
    const { app, select, completion, priority, titles, tasks } = page;
    const input = app.querySelector('#task-search');
    assert.equal(input.value, '');
    assert.equal(input.disabled, false);
    assert.equal(app.querySelector('#task-search-form').querySelector('label').textContent, 'Task search');
    assert.equal(app.querySelector('#task-search-form').querySelector('button').textContent, 'Search tasks');
    const before = structuredClone(tasks);
    for (const query of [' OPEN ', 'CoMPLeTed', 'low', 'Low  open', 'missing', ' \t ']) {
      await searchTasks(page, query);
      for (const [from, through] of [['', ''], ['2024-03-01', '2024-03-01']]) {
        await applyRange(page, from, through);
        for (const completed of ['all', 'open', 'completed']) {
          await select(completion, completed);
          for (const prioritized of ['all', 'Low', 'Normal', 'High']) {
            await select(priority, prioritized);
            assert.deepEqual(titles(), tasks.filter((task) =>
              task.title.toLowerCase().includes(query.trim().replace(/[ \t]+/g, ' ').toLowerCase()) &&
              (completed === 'all' || task.completed === (completed === 'completed')) &&
              (prioritized === 'all' || task.priority === prioritized) &&
              (!from || task.due_date === from)).map((task) => task.title));
            assert.equal(input.value, query.trim());
            assert.equal(completion.value, completed);
            assert.equal(app.querySelector('#due-from').value, from);
          }
        }
      }
    }
    assert.deepEqual(tasks, before);
    assert.deepEqual(page.writes, []);
    assert.equal(page.project.total, 6);
    assert.equal(page.project.completed, 3);
  }
});

test('task changes re-evaluate search while retaining every applied filter', async () => {
  const page = await projectPage(false, ['2024-03-01'], [{ id: 2, name: 'Destination', archived: false }]);
  const { app, rows, titles, select, completion, priority } = page;
  await select(completion, 'open');
  await select(priority, 'Low');
  await applyRange(page, '2024-03-01', '2024-03-01');
  await searchTasks(page, ' OPEN ');
  const rename = rows()[0].querySelector('form');
  rename.querySelector('input').value = 'Closed title';
  await rename.fire('submit');
  assert.deepEqual(titles(), []);
  await searchTasks(page, 'title');
  assert.deepEqual(titles(), ['Closed title']);
  await select(app.querySelector('#default-task-priority'), 'Low');
  const projectRename = app.querySelector('#new-project-name').parent.parent;
  app.querySelector('#new-project-name').value = 'Changed project';
  await projectRename.fire('submit');
  const create = app.querySelector('#task-title').parent.parent;
  app.querySelector('#task-title').value = 'New TITLE';
  await create.fire('submit');
  assert.deepEqual(titles(), ['Closed title']);
  await applyRange(page, '', '');
  assert.deepEqual(titles(), ['Closed title', 'New TITLE']);
  await select(rows()[0].querySelector('select'), 'High');
  assert.deepEqual(titles(), ['New TITLE']);
  const checkbox = rows()[0].querySelector('input');
  checkbox.checked = true;
  await checkbox.fire('change');
  assert.deepEqual(titles(), []);
  await select(completion, 'completed');
  assert.deepEqual(titles(), ['New TITLE']);
  const due = rows()[0].querySelectorAll('form')[1];
  due.querySelector('input').value = '2024-03-01';
  await due.fire('submit');
  await applyRange(page, '2024-03-01', '2024-03-01');
  assert.deepEqual(titles(), ['New TITLE']);
  const move = rows()[0].querySelectorAll('form')[2];
  await move.fire('submit');
  assert.deepEqual(titles(), []);
  assert.equal(app.querySelector('#task-search').value, 'title');
  assert.equal(completion.value, 'completed');
  assert.equal(priority.value, 'Low');
  assert.equal(app.querySelector('#due-from').value, '2024-03-01');
  assert.equal(app.querySelector('#due-through').value, '2024-03-01');
  const reopened = await projectPage();
  assert.equal(reopened.app.querySelector('#task-search').value, '');
});

async function projectList(initialNames = []) {
  const projects = [
    { id: 1, name: 'Alpha  Team', archived: false, completed: 2, total: 3 },
    { id: 2, name: 'ALPHA Team', archived: false, completed: 0, total: 0 },
    { id: 3, name: 'Alpha archive', archived: true, completed: 1, total: 1 },
    { id: 4, name: 'Älpha', archived: false, completed: 0, total: 0 },
  ];
  projects.forEach((project, index) => { project.name = initialNames[index] ?? project.name; });
  const app = new Element('main');
  const writes = [];
  const window = { location: { pathname: '/' } };
  const fetch = async (path, options) => {
    if (!options) return { ok: true, json: async () => structuredClone(projects) };
    const change = JSON.parse(options.body);
    writes.push(change);
    let project;
    if (options.method === 'POST') {
      project = { id: 5, name: change.name.trim(), archived: false, completed: 0, total: 0 };
      projects.push(project);
    } else {
      project = projects.find((item) => item.id === Number(path.split('/').at(-1)));
      Object.assign(project, change);
    }
    return { ok: true, json: async () => structuredClone(project) };
  };
  await runInNewContext(await readFile(new URL('../public/app.js', import.meta.url), 'utf8'), {
    document: { querySelector: () => app, createElement: (tag) => new Element(tag) }, fetch, window,
  });
  const rows = () => app.querySelector('#projects').children;
  const names = () => rows().map((row) => row.children[0].textContent);
  const search = async (query) => {
    app.querySelector('#project-search').value = query;
    await app.querySelector('#project-search-form').fire('submit');
  };
  const filter = async (value) => {
    app.querySelector('#project-filter').value = value;
    await app.querySelector('#project-filter').fire('change');
  };
  return { app, rows, names, search, filter, writes, window };
}

test('project search preserves order and summaries and intersects archival without changing data', async () => {
  const page = await projectList();
  const { app, rows, names, search, filter, writes } = page;
  assert.equal(app.querySelector('#project-search').value, '');
  assert.equal(app.querySelector('#project-search-form').querySelector('label').textContent, 'Project search');
  assert.equal(app.querySelector('#project-search-form').querySelector('button').textContent, 'Search projects');
  await search('  aLPHa  ');
  assert.deepEqual(names(), ['Alpha  Team', 'ALPHA Team']);
  assert.deepEqual(rows().map((row) => row.children[1].textContent), ['2/3 completed', '0/0 completed']);
  await filter('archived');
  assert.deepEqual(names(), ['Alpha archive']);
  assert.equal(app.querySelector('#project-search').value, 'aLPHa');
  await filter('active');
  await search('alpha  team');
  assert.deepEqual(names(), ['Alpha  Team', 'ALPHA Team']);
  await search('älpha');
  assert.deepEqual(names(), []);
  await search('ÄLPHA');
  assert.deepEqual(names(), ['Älpha']);
  await search(' \t ');
  assert.deepEqual(names(), ['Alpha  Team', 'ALPHA Team', 'Älpha']);
  assert.deepEqual(writes, []);
  await search('alpha');
  await rows()[0].children[3].fire('click');
  assert.deepEqual(names(), ['ALPHA Team']);
  await filter('archived');
  assert.deepEqual(names(), ['Alpha  Team', 'Alpha archive']);
  await rows()[0].children[3].fire('click');
  assert.deepEqual(names(), ['Alpha archive']);
  await filter('active');
  assert.deepEqual(names(), ['Alpha  Team', 'ALPHA Team']);
  const create = app.querySelector('form');
  create.querySelector('input').value = 'Alpha new';
  await create.fire('submit');
  assert.deepEqual(names(), ['Alpha  Team', 'ALPHA Team', 'Alpha new']);
  assert.equal(app.querySelector('#project-search').value, 'alpha');
  await rows()[0].children[2].fire('click');
  assert.equal(page.window.location.href, '/projects/1');
  const reopened = await projectList();
  assert.equal(reopened.app.querySelector('#project-search').value, '');
});

test('project search collapses only spaces and tabs without changing displayed names', async () => {
  const original = ['Alpha \t  TEAM', 'ALPHA Team', 'Alpha\t\tTeam archive', 'Alpha\nTeam'];
  const page = await projectList(original);
  for (const query of ['alpha team', '  ALPHA\t \tTEAM  ', 'alpha   team']) {
    await page.search(query);
    assert.deepEqual(page.names(), original.slice(0, 2));
    assert.deepEqual(page.rows().map((row) => row.children[1].textContent), ['2/3 completed', '0/0 completed']);
    await page.filter('archived');
    assert.deepEqual(page.names(), [original[2]]);
    await page.filter('active');
    assert.deepEqual(page.names(), original.slice(0, 2));
  }
  await page.search('alpha\nteam');
  assert.deepEqual(page.names(), [original[3]]);
  await page.search('alpha\u00a0team');
  assert.deepEqual(page.names(), []);
  await page.search(' \t ');
  assert.deepEqual(page.names(), [original[0], original[1], original[3]]);
  assert.deepEqual(page.writes, []);
  const reopened = await projectList(original);
  assert.deepEqual(reopened.names(), page.names());
  assert.equal(reopened.app.querySelector('#project-search').value, '');
});

test('normalized task search preserves titles and intersects every filter while archived', async () => {
  const original = ['Alpha  \tTEAM', 'ALPHA\tTeam', 'Alpha Team', 'Alpha\nTeam', 'Alpha\u00a0Team', 'Other'];
  for (const archived of [false, true]) {
    const page = await projectPage(archived, ['2024-03-01', '2024-03-01', '2024-03-02'], [], original);
    const before = structuredClone(page.tasks);
    await searchTasks(page, '  aLPHa\t \tteam  ');
    assert.deepEqual(page.titles(), original.slice(0, 3));
    await applyRange(page, '2024-03-01', '2024-03-01');
    assert.deepEqual(page.titles(), original.slice(0, 2));
    await page.select(page.completion, 'completed');
    assert.deepEqual(page.titles(), [original[1]]);
    await page.select(page.priority, 'Low');
    assert.deepEqual(page.titles(), [original[1]]);
    await searchTasks(page, 'alpha team');
    assert.deepEqual(page.titles(), [original[1]]);
    assert.equal(page.completion.value, 'completed');
    assert.equal(page.priority.value, 'Low');
    assert.equal(page.app.querySelector('#due-from').value, '2024-03-01');
    await page.select(page.completion, 'all');
    await page.select(page.priority, 'all');
    await applyRange(page, '', '');
    await searchTasks(page, 'alpha\nteam');
    assert.deepEqual(page.titles(), [original[3]]);
    await searchTasks(page, 'alpha\u00a0team');
    assert.deepEqual(page.titles(), [original[4]]);
    await searchTasks(page, ' \t ');
    assert.deepEqual(page.titles(), original);
    assert.deepEqual(page.tasks, before);
    assert.deepEqual(page.writes, []);
    const reopened = await projectPage(archived, [], [], original);
    assert.deepEqual(reopened.titles(), original);
  }
});

test('multiline notes save exact plain text, preserve filters, and never add search matches', async () => {
  const page = await projectPage(false, ['2024-03-01']);
  const { app, rows, tasks, titles, select, completion, priority } = page;
  assert.ok(rows().every((row) => row.querySelector('textarea').value === ''));
  await select(completion, 'open');
  await select(priority, 'Low');
  await applyRange(page, '2024-03-01', '2024-03-01');
  await searchTasks(page, ' LOW\topen ');
  const before = structuredClone(tasks);
  const notes = '  Notes-only keyword\n\tΩ 日本語 📝\n<script>alert("text")</script> & <b>literal</b>  \n';
  let textarea = rows()[0].querySelector('textarea');
  assert.equal(rows()[0].querySelectorAll('label').find((label) => label.htmlFor === textarea.id).textContent, 'Task notes');
  assert.equal(textarea.parent.querySelector('button').textContent, 'Save notes');
  textarea.value = notes;
  await textarea.parent.fire('submit');
  assert.deepEqual(tasks, before.map((task, index) => index === 0 ? { ...task, notes } : task));
  assert.deepEqual(titles(), ['Low open']);
  assert.equal(rows()[0].querySelector('textarea').value, notes);
  assert.equal(rows()[0].querySelector('script'), null);
  assert.equal(completion.value, 'open');
  assert.equal(priority.value, 'Low');
  assert.equal(app.querySelector('#due-from').value, '2024-03-01');
  assert.equal(app.querySelector('#due-through').value, '2024-03-01');
  assert.equal(app.querySelector('#task-search').value, 'LOW\topen');
  assert.equal(page.project.total, 6);
  assert.equal(page.project.completed, 3);
  await searchTasks(page, 'Notes-only keyword');
  assert.deepEqual(titles(), []);
  await searchTasks(page, 'Low open');
  const rename = rows()[0].querySelector('form');
  rename.querySelector('input').value = 'LOW  open renamed';
  await rename.fire('submit');
  assert.equal(rows()[0].querySelector('textarea').value, notes);
  for (const text of [' \t\n  ', '']) {
    textarea = rows()[0].querySelector('textarea');
    textarea.value = text;
    await textarea.parent.fire('submit');
    assert.equal(rows()[0].querySelector('textarea').value, text);
    assert.equal(tasks[0].notes, text);
  }
});

test('archived notes remain readable and disabled; restored notes are editable', async () => {
  const notes = '  Saved\n<b>plain text</b> Ω  ';
  const archived = await projectPage(true, [], [], [], [notes]);
  const textarea = archived.rows()[0].querySelector('textarea');
  assert.equal(textarea.value, notes);
  for (const row of archived.rows()) {
    const input = row.querySelector('textarea');
    assert.equal(input.disabled, true);
    assert.equal(input.parent.querySelector('button').disabled, true);
    await input.parent.fire('submit');
  }
  assert.deepEqual(archived.writes, []);
  await searchTasks(archived, 'plain text');
  assert.deepEqual(archived.titles(), []);
  const restored = await projectPage(false, [], [], [], [notes]);
  const editable = restored.rows()[0].querySelector('textarea');
  assert.equal(editable.value, notes);
  assert.equal(editable.disabled, false);
  assert.equal(editable.parent.querySelector('button').disabled, false);
  editable.value = 'Changed after restoration';
  await editable.parent.fire('submit');
  assert.equal(restored.tasks[0].notes, 'Changed after restoration');
});


test('deleting and restoring retains all applied controls and returns rows to their order', async () => {
  const page = await projectPage(false, ['2024-03-01'], [{ id: 2, name: 'Other', archived: false }], [], [' Saved\nnotes ']);
  const { app, rows, titles, completion, priority, select, tasks } = page;
  assert.deepEqual(completion.children.map((option) => option.textContent), ['All', 'Open', 'Completed', 'Deleted']);
  await select(completion, 'open');
  await select(priority, 'Low');
  await applyRange(page, '2024-03-01', '2024-03-01');
  await searchTasks(page, 'LOW open');
  const original = structuredClone(tasks[0]);
  await rows()[0].children.at(-1).fire('click');
  assert.deepEqual(titles(), []);
  assert.deepEqual(tasks[0], { ...original, deleted: true });
  assert.equal(completion.value, 'open');
  assert.equal(priority.value, 'Low');
  assert.equal(app.querySelector('#due-from').value, '2024-03-01');
  assert.equal(app.querySelector('#due-through').value, '2024-03-01');
  assert.equal(app.querySelector('#task-search').value, 'LOW open');
  await select(completion, 'deleted');
  assert.deepEqual(titles(), ['Low open']);
  const row = rows()[0];
  assert.equal(row.children.at(-1).textContent, 'Restore task');
  assert.equal(row.children.at(-1).disabled, false);
  assert.equal(row.querySelector('textarea').value, original.notes);
  for (const control of [...row.querySelectorAll('input'), ...row.querySelectorAll('select'), ...row.querySelectorAll('textarea')]) {
    assert.equal(control.disabled, true);
  }
  for (const button of row.querySelectorAll('button').slice(0, -1)) assert.equal(button.disabled, true);
  const before = page.writes.length;
  for (const form of row.querySelectorAll('form')) await form.fire('submit');
  await row.querySelector('input').fire('change');
  await row.querySelector('select').fire('change');
  assert.equal(page.writes.length, before);
  await select(priority, 'High');
  assert.deepEqual(titles(), []);
  await select(priority, 'Low');
  await applyRange(page, '2024-03-02', '');
  assert.deepEqual(titles(), []);
  await applyRange(page, '2024-03-01', '2024-03-01');
  await searchTasks(page, 'Saved'); // Notes never match title search, including deleted rows.
  assert.deepEqual(titles(), []);
  await searchTasks(page, 'LOW open');
  await rows()[0].children.at(-1).fire('click');
  assert.equal(completion.value, 'deleted');
  assert.deepEqual(titles(), []);
  assert.deepEqual(tasks[0], original);
  await select(completion, 'open');
  assert.deepEqual(titles(), ['Low open']);
  assert.equal(rows()[0].querySelector('textarea').disabled, false);
  await select(completion, 'all');
  await select(priority, 'all');
  await applyRange(page, '', '');
  await searchTasks(page, '');
  assert.deepEqual(titles(), tasks.map((task) => task.title));
});

test('live filters exclude deleted tasks and archives disable deletion and restoration', async () => {
  for (const archived of [false, true]) {
    const page = await projectPage(archived, [], [], [], ['Deleted notes'], [true, true]);
    const { completion, select, titles, tasks, rows } = page;
    for (const value of ['all', 'open', 'completed']) {
      await select(completion, value);
      assert.deepEqual(titles(), tasks.filter((task) => !task.deleted &&
        (value === 'all' || task.completed === (value === 'completed'))).map((task) => task.title));
      assert.ok(rows().every((row) => row.children.at(-1).textContent === 'Delete task'));
      if (archived) {
        for (const row of rows()) {
          assert.equal(row.children.at(-1).disabled, true);
          await row.children.at(-1).fire('click');
        }
      }
    }
    await select(completion, 'deleted');
    assert.deepEqual(titles(), ['Low open', 'Low completed']);
    assert.equal(rows()[0].querySelector('textarea').value, 'Deleted notes');
    for (const row of rows()) {
      assert.equal(row.children.at(-1).textContent, 'Restore task');
      assert.equal(row.children.at(-1).disabled, archived);
      if (archived) await row.children.at(-1).fire('click');
    }
    assert.deepEqual(page.writes, []);
  }
});

test('project import retains submitted fields on errors and opens the independent project on success', async () => {
  const app = new Element('main');
  const location = { pathname: '/', href: '/' };
  const writes = [];
  let error = 'Invalid project JSON';
  const fetch = async (path, options) => {
    if (!options) return { ok: true, json: async () => [] };
    assert.equal(path, '/api/projects/import');
    assert.equal(options.method, 'POST');
    writes.push(JSON.parse(options.body));
    return { ok: !error, json: async () => error ? { error } : { id: 42 } };
  };
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  await runInNewContext(source, {
    document: { querySelector: () => app, createElement: (tag) => new Element(tag) },
    fetch, window: { location },
  });
  const form = app.querySelector('#project-import-form');
  const json = form.querySelector('#project-json');
  const name = form.querySelector('#imported-project-name');
  const button = form.querySelector('button');
  assert.equal(json.tag, 'textarea');
  assert.equal(button.textContent, 'Import project');
  for (const [control, label] of [[json, 'Project JSON'], [name, 'Imported project name']]) {
    assert.equal(form.querySelectorAll('label').find((item) => item.htmlFor === control.id).textContent, label);
    assert.equal(control.value, '');
  }
  json.value = '  { invalid JSON Ω\n';
  name.value = '  Copy  ';
  await form.fire('submit');
  assert.equal(app.querySelector('[role="alert"]').textContent, 'Invalid project JSON');
  assert.equal(json.value, '  { invalid JSON Ω\n');
  assert.equal(name.value, '  Copy  ');
  assert.equal(location.href, '/');
  assert.equal(button.disabled, false);
  error = 'Project name is required';
  name.value = ' \t ';
  await form.fire('submit');
  assert.equal(app.querySelector('[role="alert"]').textContent, 'Project name is required');
  assert.equal(json.value, '  { invalid JSON Ω\n');
  assert.equal(name.value, ' \t ');
  error = '';
  json.value = '{"format":"workboard-project"}';
  name.value = '  Copy  ';
  await form.fire('submit');
  assert.equal(app.querySelector('[role="alert"]'), null);
  assert.equal(location.href, '/projects/42');
  assert.deepEqual(writes.at(-1), { name: '  Copy  ', document: '{"format":"workboard-project"}' });
});

async function directoryPage(tasks) {
  const app = new Element('main');
  const location = { pathname: '/task-directory' };
  const requests = [];
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  await runInNewContext(source, {
    document: { querySelector: () => app, createElement: (tag) => new Element(tag) },
    window: { location },
    fetch: async (path, options) => {
      requests.push({ path, options });
      assert.equal(options, undefined, 'Directory must never write');
      return { ok: true, json: async () => structuredClone(tasks) };
    },
  });
  const rows = () => app.querySelector('#directory-tasks').children;
  const titles = () => rows().map((row) => row.children[0].textContent);
  const select = async (id, value) => { const control = app.querySelector(id); control.value = value; await control.fire('change'); };
  const search = async (value) => {
    app.querySelector('#directory-search').value = value;
    await app.querySelector('#directory-search-form').fire('submit');
  };
  const range = async (from, through) => {
    app.querySelector('#due-from').value = from;
    app.querySelector('#due-through').value = through;
    await app.querySelector('#due-range').fire('submit');
  };
  return { app, location, requests, rows, titles, select, search, range };
}

test('directory intersects all controls, validates ranges and reads literal fields without writes', async () => {
  const tasks = [
    { title: 'Alpha \t  TEAM Ω', completed: false, priority: 'High', due_date: '2024-02-29',
      notes: '  <b>literal</b> Ω\n\tlast  \n', deleted: false, archived: false, project_id: 1, project_name: 'Owner keyword' },
    { title: 'ALPHA Team Ω', completed: true, priority: 'High', due_date: '2024-03-01',
      notes: '', deleted: false, archived: false, project_id: 1, project_name: 'Owner keyword' },
    { title: 'Alpha team Ω removed', completed: true, priority: 'High', due_date: '2024-02-29',
      notes: 'notes keyword', deleted: true, archived: false, project_id: 1, project_name: 'Owner keyword' },
    { title: 'Undated', completed: false, priority: 'Normal', due_date: '',
      notes: '', deleted: false, archived: false, project_id: 2, project_name: 'Second' },
    { title: 'Alpha team Ω archived', completed: true, priority: 'High', due_date: '2024-02-29',
      notes: 'Archive notes', deleted: false, archived: true, project_id: 3, project_name: 'Archived' },
    { title: 'Alpha team Ω archived removed', completed: false, priority: 'High', due_date: '2024-02-29',
      notes: '', deleted: true, archived: true, project_id: 3, project_name: 'Archived' },
  ];
  const before = structuredClone(tasks);
  const page = await directoryPage(tasks);
  const { app, rows, titles, select, search, range } = page;
  for (const [id, label, options] of [
    ['project-scope', 'Project scope', ['Active', 'Archived']],
    ['task-filter', 'Task filter', ['All', 'Open', 'Completed', 'Deleted']],
    ['priority-filter', 'Priority filter', ['All', 'Low', 'Normal', 'High']],
  ]) {
    assert.equal(app.querySelectorAll('label').find((item) => item.htmlFor === id).textContent, label);
    assert.deepEqual(app.querySelector(`#${id}`).children.map((option) => option.textContent), options);
  }
  assert.deepEqual(titles(), [tasks[0].title, tasks[1].title, tasks[3].title]);
  assert.deepEqual(rows()[0].children.slice(0, 6).map((field) => [field.dataset.testid, field.textContent]), [
    ['directory-task-title', tasks[0].title], ['directory-project-name', tasks[0].project_name],
    ['directory-task-completion', 'Open'], ['directory-task-priority', 'High'],
    ['directory-task-due-date', '2024-02-29'], ['directory-task-notes', tasks[0].notes],
  ]);
  assert.ok(rows().every((row) => row.dataset.testid === 'directory-task-row'));
  for (const tag of ['input', 'textarea', 'select', 'form']) assert.equal(rows()[0].querySelectorAll(tag).length, 0);
  assert.equal(rows()[2].children[4].textContent, '');
  await search('owner keyword');
  assert.deepEqual(titles(), []);
  await search('literal');
  assert.deepEqual(titles(), []);
  await search('  aLPHa\t \tTEAM Ω  ');
  assert.deepEqual(titles(), [tasks[0].title, tasks[1].title]);
  await select('#priority-filter', 'High');
  await range(' 2024-02-29 ', '2024-02-29 ');
  assert.deepEqual(titles(), [tasks[0].title]);
  await select('#task-filter', 'completed');
  assert.deepEqual(titles(), []);
  await select('#task-filter', 'deleted');
  assert.deepEqual(titles(), [tasks[2].title]);
  for (const [from, through, message] of [
    ['2023-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
    ['', '0000-01-01', 'Due range must use valid YYYY-MM-DD dates'],
    ['2024-03-01', '2024-02-29', 'Due from must not be after Due through'],
  ]) {
    await range(from, through);
    assert.equal(app.querySelector('[role="alert"]').textContent, message);
    assert.deepEqual(titles(), [tasks[2].title]);
  }
  await select('#project-scope', 'archived');
  assert.deepEqual(titles(), [tasks[5].title]);
  assert.equal(app.querySelector('#task-filter').value, 'deleted');
  assert.equal(app.querySelector('#priority-filter').value, 'High');
  assert.equal(app.querySelector('#directory-search').value, 'aLPHa\t \tTEAM Ω');
  await select('#task-filter', 'all');
  assert.deepEqual(titles(), [tasks[4].title]);
  await rows()[0].children.at(-1).fire('click');
  assert.equal(page.location.href, '/projects/3');
  await select('#project-scope', 'active');
  await search('');
  await select('#priority-filter', 'all');
  await range('', '2024-03-01');
  assert.deepEqual(titles(), [tasks[0].title, tasks[1].title]);
  await range('2024-03-01', '');
  assert.deepEqual(titles(), [tasks[1].title]);
  await range('', '');
  assert.deepEqual(titles(), [tasks[0].title, tasks[1].title, tasks[3].title]);
  assert.deepEqual(tasks, before);
  assert.deepEqual(page.requests, [{ path: '/api/task-directory', options: undefined }]);
  await app.querySelector('#back').fire('click');
  assert.equal(page.location.href, '/');
  const reopened = await directoryPage(tasks);
  assert.equal(reopened.app.querySelector('#project-scope').value, 'active');
  assert.equal(reopened.app.querySelector('#task-filter').value, 'all');
  assert.equal(reopened.app.querySelector('#priority-filter').value, 'all');
  for (const id of ['directory-search', 'due-from', 'due-through']) assert.equal(reopened.app.querySelector(`#${id}`).value, '');
});

test('home Task directory control opens the directory', async () => {
  const page = await projectList();
  const button = page.app.querySelector('#task-directory');
  assert.equal(button.textContent, 'Task directory');
  await button.fire('click');
  assert.equal(page.window.location.href, '/task-directory');
});
