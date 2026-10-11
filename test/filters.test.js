import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { validDueDate, matchesDueRange } from '../public/dates.js';
import { matchesSearch } from '../public/search.js';

// Minimal DOM harness for exercising the real browser event handlers without dependencies.
class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.listeners = {};
    this.textContent = '';
    this._value = undefined;
  }
  append(...children) {
    for (const child of children) child.parent = this;
    this.children.push(...children);
  }
  remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  async fire(name) { await this.listeners[name]({ preventDefault() {} }); }
  focus() {}
  get value() { return this._value ?? (this.tag === 'select' ? this.children[0]?.textContent : '') ?? ''; }
  set value(value) { this._value = value; }
  querySelector(selector) {
    for (const child of this.children) {
      if (selector === '[role="alert"]' ? child.attributes.role === 'alert' :
        selector.startsWith('#') ? child.id === selector.slice(1) : child.tag === selector) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
  querySelectorAll(selector) {
    const tags = selector.split(',').map(tag => tag.trim());
    return this.children.flatMap(child => [
      ...(tags.includes(child.tag) ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }
  set innerHTML(html) {
    this.children = [];
    const stack = [this];
    for (const token of html.match(/<[^>]+>|[^<]+/g)) {
      if (token.startsWith('</')) { stack.pop(); continue; }
      if (token.startsWith('<')) {
        const tag = token.match(/^<(\w+)/)[1];
        const element = new Element(tag);
        element.id = token.match(/id="([^"]+)"/)?.[1];
        stack.at(-1).append(element);
        if (tag !== 'input') stack.push(element);
      } else {
        stack.at(-1).textContent += token.trim();
      }
    }
  }
}

async function fixture(archived = false, destinations = [
  { id: 1, name: 'Source', archived: false },
  { id: 2, name: 'Destination', archived: false },
  { id: 3, name: 'Archived', archived: true },
  { id: 4, name: 'Other destination', archived: false },
], beforeRead = async () => {}, deletedIds = []) {
  const app = new Element('main');
  const tasks = [
    { id: 1, title: 'First', completed: false, priority: 'High' },
    { id: 2, title: 'Second', completed: true, priority: 'Normal' },
    { id: 3, title: 'Third', completed: true, priority: 'High' },
    { id: 4, title: 'Fourth', completed: false, priority: 'Low' },
  ].map(task => ({ ...task, due_date: '', notes: '', deleted: deletedIds.includes(task.id) }));
  const requests = [];
  const project = { id: 1, archived, default_priority: 'Normal' };
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const context = {
    validDueDate, matchesDueRange, matchesSearch,
    document: { querySelector: () => app, createElement: tag => new Element(tag) },
    fetch: async (path, options) => {
      if (!options) {
        await beforeRead(app, path);
        return { ok: true, json: async () => structuredClone(path === '/api/projects' ? destinations : tasks) };
      }
      requests.push(options);
      if (path === '/api/projects/1') {
        Object.assign(project, JSON.parse(options.body));
        return { ok: true, json: async () => structuredClone(project) };
      }
      if (options.method === 'POST') {
        const task = { id: tasks.length + 1, ...JSON.parse(options.body), completed: false, priority: project.default_priority, notes: '' };
        tasks.push(task);
        return { ok: true, json: async () => structuredClone(task) };
      }
      const task = tasks.find(item => item.id === Number(path.split('/').at(-1)));
      const input = JSON.parse(options.body);
      if (input.destination_project_id) {
        task.project_id = input.destination_project_id;
      } else {
        Object.assign(task, input);
      }
      return { ok: true, json: async () => structuredClone(task) };
    },
  };
  runInNewContext(source.slice(0, source.lastIndexOf('\nrender().catch')).replace(/^import .*;\n/gm, '') + '\nthis.renderTasks = renderTasks;', context);
  await context.renderTasks({ ...project });
  const completion = app.querySelector('#task-filter');
  const priority = app.querySelector('#priority-filter');
  const rows = () => app.querySelector('#task-list').children;
  const titles = () => rows().map(row => row.children[0].textContent);
  return { app, completion, priority, rows, titles, requests, tasks, project };
}

async function choose(select, value) {
  select.value = value;
  await select.fire('change');
}

test('deletion and restoration retain intersecting filters and disable deleted-row edits', async () => {
  const f = await fixture();
  assert.deepEqual(f.completion.children.map(option => option.textContent), ['All', 'Open', 'Completed', 'Deleted']);
  const dueForm = f.rows()[0].children[4];
  dueForm.children[1].value = '2025-01-15';
  await dueForm.fire('submit');
  const notesForm = f.rows()[0].children[6];
  notesForm.children[1].value = '  saved\nnotes  ';
  await notesForm.fire('submit');
  await choose(f.completion, 'Open');
  await choose(f.priority, 'High');
  f.app.querySelector('#due-from').value = '2025-01-01';
  f.app.querySelector('#due-through').value = '2025-01-31';
  await f.app.querySelector('#due-range-form').fire('submit');
  f.app.querySelector('#task-search').value = 'first';
  await f.app.querySelector('#task-search-form').fire('submit');
  const before = structuredClone(f.tasks[0]);
  assert.equal(f.rows()[0].children[7].textContent, 'Delete task');
  await f.rows()[0].children[7].fire('click');
  assert.deepEqual(f.titles(), []);
  assert.deepEqual(f.tasks[0], { ...before, deleted: true });
  assert.equal(f.completion.value, 'Open');
  for (const value of ['All', 'Open', 'Completed']) {
    await choose(f.completion, value);
    assert.deepEqual(f.titles(), []);
  }
  await choose(f.completion, 'Deleted');
  assert.deepEqual(f.titles(), ['First']);
  const deleted = f.rows()[0];
  assert.equal(deleted.children[7].textContent, 'Restore task');
  assert.equal(deleted.children[7].disabled, false);
  for (const control of deleted.querySelectorAll('input, textarea, select, button')) {
    if (control !== deleted.children[7]) assert.equal(control.disabled, true);
  }
  assert.equal(deleted.children[6].children[1].value, before.notes);
  await choose(f.priority, 'Low');
  assert.deepEqual(f.titles(), []);
  await choose(f.priority, 'High');
  f.app.querySelector('#task-search').value = 'missing';
  await f.app.querySelector('#task-search-form').fire('submit');
  assert.deepEqual(f.titles(), []);
  f.app.querySelector('#task-search').value = 'first';
  await f.app.querySelector('#task-search-form').fire('submit');
  await f.rows()[0].children[7].fire('click');
  assert.deepEqual(f.titles(), []);
  assert.equal(f.completion.value, 'Deleted');
  assert.equal(f.priority.value, 'High');
  assert.equal(f.app.querySelector('#due-from').value, '2025-01-01');
  assert.equal(f.app.querySelector('#due-through').value, '2025-01-31');
  assert.equal(f.app.querySelector('#task-search').value, 'first');
  assert.deepEqual(f.tasks[0], before);
  await choose(f.completion, 'Open');
  assert.deepEqual(f.titles(), ['First']);
  assert.equal(f.rows()[0].children[1].disabled, false);
});

test('archived projects keep deleted tasks readable but cannot delete or restore', async () => {
  const archived = await fixture(true, undefined, undefined, [2]);
  for (const row of archived.rows()) {
    assert.equal(row.children[7].disabled, true);
    await row.children[7].fire('click');
  }
  await choose(archived.completion, 'Deleted');
  assert.deepEqual(archived.titles(), ['Second']);
  assert.equal(archived.rows()[0].children[7].textContent, 'Restore task');
  for (const control of archived.rows()[0].querySelectorAll('input, textarea, select, button')) {
    assert.equal(control.disabled, true);
  }
  await archived.rows()[0].children[7].fire('click');
  await choose(archived.priority, 'High');
  assert.deepEqual(archived.titles(), []);
  await choose(archived.priority, 'Normal');
  assert.deepEqual(archived.titles(), ['Second']);
  assert.equal(archived.requests.length, 0);
});

test('notes save exact plain text while preserving all applied filters and membership', async () => {
  const f = await fixture();
  f.tasks[0].due_date = '2025-01-15';
  // Refresh rows from the fixture's saved data by editing the existing date control.
  const dueForm = f.rows()[0].children[4];
  dueForm.children[1].value = '2025-01-15';
  await dueForm.fire('submit');
  await choose(f.completion, 'Open');
  await choose(f.priority, 'High');
  f.app.querySelector('#due-from').value = '2025-01-01';
  f.app.querySelector('#due-through').value = '2025-01-31';
  await f.app.querySelector('#due-range-form').fire('submit');
  f.app.querySelector('#task-search').value = 'First';
  await f.app.querySelector('#task-search-form').fire('submit');
  const before = structuredClone(f.tasks[0]);
  const form = f.rows()[0].children[6];
  assert.equal(form.children[0].textContent, 'Task notes');
  assert.equal(form.children[1].tag, 'textarea');
  assert.equal(form.children[1].id, form.children[0].htmlFor);
  assert.equal(form.children[1].value, '');
  assert.equal(form.children[2].textContent, 'Save notes');
  const notes = '  <b>literal</b>\nUnicode 雪\n  ';
  form.children[1].value = notes;
  await form.fire('submit');
  assert.deepEqual(f.tasks[0], { ...before, notes });
  assert.deepEqual(f.titles(), ['First']);
  assert.equal(f.rows()[0].children[6].children[1].value, notes);
  assert.equal(f.completion.value, 'Open');
  assert.equal(f.priority.value, 'High');
  assert.equal(f.app.querySelector('#due-from').value, '2025-01-01');
  assert.equal(f.app.querySelector('#due-through').value, '2025-01-31');
  assert.equal(f.app.querySelector('#task-search').value, 'First');
  f.app.querySelector('#task-search').value = 'literal';
  await f.app.querySelector('#task-search-form').fire('submit');
  assert.deepEqual(f.titles(), []);
  const archived = await fixture(true);
  for (const row of archived.rows()) {
    assert.equal(row.children[6].children[1].disabled, true);
    assert.equal(row.children[6].children[2].disabled, true);
    await row.children[6].fire('submit');
  }
  assert.equal(archived.requests.length, 0);
});

test('priority and completion filters combine in creation order without data writes', async () => {
  const f = await fixture();
  assert.equal(f.priority.value, 'All');
  assert.deepEqual(f.priority.children.map(option => option.textContent), ['All', 'Low', 'Normal', 'High']);
  const expected = {
    All: { All: ['First', 'Second', 'Third', 'Fourth'], Low: ['Fourth'], Normal: ['Second'], High: ['First', 'Third'] },
    Open: { All: ['First', 'Fourth'], Low: ['Fourth'], Normal: [], High: ['First'] },
    Completed: { All: ['Second', 'Third'], Low: [], Normal: ['Second'], High: ['Third'] },
  };
  for (const state of ['All', 'Open', 'Completed']) {
    await choose(f.completion, state);
    for (const priority of ['All', 'Low', 'Normal', 'High']) {
      await choose(f.priority, priority);
      assert.equal(f.completion.value, state);
      assert.deepEqual(f.titles(), expected[state][priority]);
    }
  }
  assert.equal(f.requests.length, 0);
});

test('editing re-evaluates both filters and renaming preserves selections and membership', async () => {
  const f = await fixture();
  await choose(f.completion, 'Open');
  await choose(f.priority, 'High');
  const rename = f.rows()[0].children[2];
  rename.children[1].value = '  Renamed  ';
  await rename.fire('submit');
  assert.deepEqual(f.titles(), ['Renamed']);
  assert.equal(f.rows()[0].children[1].attributes['aria-label'], 'Complete Renamed');
  assert.equal(f.tasks[0].priority, 'High');
  assert.equal(f.tasks[0].completed, false);
  await choose(f.rows()[0].children[3], 'Low');
  assert.deepEqual(f.titles(), []);
  assert.equal(f.completion.value, 'Open');
  assert.equal(f.priority.value, 'High');
  await choose(f.priority, 'Low');
  const checkbox = f.rows()[0].children[1];
  checkbox.checked = true;
  await checkbox.fire('change');
  assert.deepEqual(f.titles(), ['Fourth']);
  assert.equal(f.completion.value, 'Open');
  assert.equal(f.priority.value, 'Low');
  await choose(f.completion, 'Completed');
  assert.deepEqual(f.titles(), ['Renamed']);
});

test('archived projects keep both filters usable while task edits remain disabled', async () => {
  const f = await fixture(true);
  assert.ok(!f.completion.disabled);
  assert.ok(!f.priority.disabled);
  for (const row of f.rows()) {
    assert.equal(row.children[1].disabled, true);
    assert.equal(row.children[2].children[1].disabled, true);
    assert.equal(row.children[2].children[2].disabled, true);
    assert.equal(row.children[3].disabled, true);
    assert.equal(row.children[4].children[1].disabled, true);
    assert.equal(row.children[4].children[2].disabled, true);
  }
  await choose(f.priority, 'High');
  await choose(f.completion, 'Completed');
  assert.deepEqual(f.titles(), ['Third']);
  assert.equal(f.requests.length, 0);
  assert.equal((await fixture()).priority.value, 'All');
});


test('due date save and clear preserve both filters, task identity, and row order', async () => {
  const f = await fixture();
  await choose(f.completion, 'Completed');
  await choose(f.priority, 'High');
  const original = structuredClone(f.tasks);
  let form = f.rows()[0].children[4];
  assert.equal(form.children[0].textContent, 'Task due date');
  assert.equal(form.children[1].type, 'text');
  assert.equal(form.children[1].value, '');
  assert.equal(form.children[2].textContent, 'Save due date');
  form.children[1].value = '  2024-02-29  ';
  await form.fire('submit');
  assert.deepEqual(f.tasks, original.map(task => task.id === 3 ? { ...task, due_date: '2024-02-29' } : task));
  assert.deepEqual(f.titles(), ['Third']);
  assert.equal(f.completion.value, 'Completed');
  assert.equal(f.priority.value, 'High');
  form = f.rows()[0].children[4];
  assert.equal(form.children[1].value, '2024-02-29');
  form.children[1].value = '   ';
  await form.fire('submit');
  assert.deepEqual(f.tasks, original);
  assert.equal(f.rows()[0].children[4].children[1].value, '');
  assert.equal(f.completion.value, 'Completed');
  assert.equal(f.priority.value, 'High');
});

test('task controls are not exposed during asynchronous initialization', async () => {
  const reads = [];
  const f = await fixture(false, undefined, async (app, path) => {
    reads.push(path);
    // Simulate slow task/destination reads: no editable control may be exposed
    // before its initial saved value and event handler are installed.
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(app.querySelector('#default-task-priority'), null);
    assert.equal(app.querySelector('#task-title'), null);
  });
  assert.deepEqual(reads, ['/api/projects/1/tasks', '/api/projects']);
  const defaultPriority = f.app.querySelector('#default-task-priority');
  await choose(defaultPriority, 'Low');
  assert.equal(f.project.default_priority, 'Low');
  f.app.querySelector('#task-title').value = 'Lifecycle task';
  await f.app.querySelector('form').fire('submit');
  assert.equal(f.tasks.at(-1).priority, 'Low');
  assert.equal(defaultPriority.value, 'Low');
});

test('default priority changes preserve both filters and existing rows', async () => {
  const f = await fixture();
  const defaultPriority = f.app.querySelector('#default-task-priority');
  assert.equal(defaultPriority.value, 'Normal');
  assert.deepEqual(defaultPriority.children.map(option => option.textContent), ['Low', 'Normal', 'High']);
  await choose(f.completion, 'Open');
  await choose(f.priority, 'High');
  const originalTasks = structuredClone(f.tasks);
  const originalRows = f.rows();
  await choose(defaultPriority, 'High');
  assert.equal(f.project.default_priority, 'High');
  assert.equal(defaultPriority.value, 'High');
  assert.equal(defaultPriority.disabled, false);
  assert.equal(f.completion.value, 'Open');
  assert.equal(f.priority.value, 'High');
  assert.equal(f.rows(), originalRows);
  assert.deepEqual(f.tasks, originalTasks);
  f.app.querySelector('#task-title').value = 'New high task';
  await f.app.querySelector('form').fire('submit');
  assert.deepEqual(f.titles(), ['First', 'New high task']);
  assert.equal(f.completion.value, 'Open');
  assert.equal(f.priority.value, 'High');
  const archived = await fixture(true);
  assert.equal(archived.app.querySelector('#default-task-priority').disabled, true);
  assert.equal(archived.app.querySelector('#default-task-priority').value, 'Normal');
});

async function applyRange(f, from, through) {
  f.app.querySelector('#due-from').value = from;
  f.app.querySelector('#due-through').value = through;
  await f.app.querySelector('#due-range-form').fire('submit');
}

async function saveDate(f, rowIndex, date) {
  const form = f.rows()[rowIndex].children[4];
  form.children[1].value = date;
  await form.fire('submit');
}

test('inclusive ranges intersect both filters, preserve applied boundaries, and reset on reopening', async () => {
  const f = await fixture();
  assert.equal(f.app.querySelector('#due-from').value, '');
  assert.equal(f.app.querySelector('#due-through').value, '');
  await saveDate(f, 0, '2024-02-28');
  await saveDate(f, 1, '2024-02-29');
  await saveDate(f, 2, '2024-03-01');
  const saved = structuredClone(f.tasks);
  await applyRange(f, ' 2024-02-29 ', ' 2024-03-01 ');
  assert.deepEqual(f.titles(), ['Second', 'Third']);
  assert.equal(f.app.querySelector('#due-from').value, '2024-02-29');
  await choose(f.priority, 'High');
  await choose(f.completion, 'Completed');
  assert.deepEqual(f.titles(), ['Third']);
  await choose(f.completion, 'Open');
  assert.deepEqual(f.titles(), []);
  await choose(f.priority, 'All');
  await choose(f.completion, 'All');
  await applyRange(f, '', '2024-02-29');
  assert.deepEqual(f.titles(), ['First', 'Second']);
  await applyRange(f, '2024-02-29', '');
  assert.deepEqual(f.titles(), ['Second', 'Third']);
  await applyRange(f, '2024-02-29', '2024-02-29');
  assert.deepEqual(f.titles(), ['Second']);
  for (const value of ['2023-02-29', '1900-02-29', '0000-01-01', '10000-01-01', '2024-04-31', '2024-2-29']) {
    await applyRange(f, value, '');
    assert.match(f.app.querySelector('[role="alert"]').textContent, /Due range must use valid YYYY-MM-DD dates/);
    assert.deepEqual(f.titles(), ['Second']);
  }
  await applyRange(f, '2024-03-01', '2024-02-29');
  assert.match(f.app.querySelector('[role="alert"]').textContent, /Due from must not be after Due through/);
  await choose(f.completion, 'Completed');
  assert.deepEqual(f.titles(), ['Second']);
  assert.deepEqual(f.tasks, saved);
  await applyRange(f, '  ', ' ');
  await choose(f.completion, 'All');
  assert.deepEqual(f.titles(), ['First', 'Second', 'Third', 'Fourth']);
  const reopened = await fixture();
  assert.equal(reopened.app.querySelector('#due-from').value, '');
  assert.equal(reopened.app.querySelector('#due-through').value, '');
});

test('task edits and creation retain all three filters and immediately re-evaluate membership', async () => {
  const f = await fixture();
  await saveDate(f, 0, '2000-02-29');
  await saveDate(f, 2, '2000-02-29');
  await choose(f.priority, 'High');
  await choose(f.completion, 'Open');
  await applyRange(f, '2000-02-29', '2000-02-29');
  const rename = f.rows()[0].children[2];
  rename.children[1].value = 'Renamed';
  await rename.fire('submit');
  assert.deepEqual(f.titles(), ['Renamed']);
  await choose(f.app.querySelector('#default-task-priority'), 'High');
  f.app.querySelector('#task-title').value = 'Undated';
  await f.app.querySelector('form').fire('submit');
  assert.deepEqual(f.titles(), ['Renamed']);
  await choose(f.rows()[0].children[3], 'Low');
  assert.deepEqual(f.titles(), []);
  await choose(f.priority, 'Low');
  const checkbox = f.rows()[0].children[1];
  checkbox.checked = true;
  await checkbox.fire('change');
  assert.deepEqual(f.titles(), []);
  await choose(f.completion, 'Completed');
  assert.deepEqual(f.titles(), ['Renamed']);
  await saveDate(f, 0, '2000-03-01');
  assert.deepEqual(f.titles(), []);
  assert.equal(f.priority.value, 'Low');
  assert.equal(f.completion.value, 'Completed');
  await applyRange(f, '', '');
  assert.deepEqual(f.titles(), ['Renamed']);
  await saveDate(f, 0, '2000-02-29');
  await applyRange(f, '2000-02-29', '');
  await saveDate(f, 0, '');
  assert.deepEqual(f.titles(), []);
});

test('archived projects can apply ranges without enabling edits or writing data', async () => {
  const f = await fixture(true);
  assert.ok(!f.app.querySelector('#due-from').disabled);
  assert.ok(!f.app.querySelector('#due-through').disabled);
  assert.ok(!f.app.querySelector('#due-range-form').querySelector('button').disabled);
  await applyRange(f, '0001-01-01', '9999-12-31');
  assert.deepEqual(f.titles(), []);
  await applyRange(f, '', '');
  assert.equal(f.rows().length, 4);
  assert.ok(f.rows().every(row => row.children[4].children[1].disabled));
  assert.equal(f.requests.length, 0);
});


test('moving retains all filters and removes only the moved source row', async () => {
  const f = await fixture();
  await saveDate(f, 0, '2025-01-20');
  await choose(f.completion, 'Open');
  await choose(f.priority, 'High');
  await applyRange(f, '2025-01-01', '2025-01-31');
  const move = f.rows()[0].children[5];
  assert.equal(move.children[0].attributes['aria-label'], 'Destination project');
  assert.deepEqual(move.children[0].children.map(option => option.textContent), ['Destination', 'Other destination']);
  move.children[0].value = '2';
  await move.fire('submit');
  assert.deepEqual(f.titles(), []);
  assert.equal(f.completion.value, 'Open');
  assert.equal(f.priority.value, 'High');
  assert.equal(f.app.querySelector('#due-from').value, '2025-01-01');
  assert.equal(f.app.querySelector('#due-through').value, '2025-01-31');
  assert.equal(f.tasks[0].project_id, 2);
  assert.equal(f.tasks[0].due_date, '2025-01-20');
  await choose(f.priority, 'All');
  await choose(f.completion, 'All');
  assert.deepEqual(f.titles(), []); // Applied range was retained.
  await applyRange(f, '', '');
  assert.deepEqual(f.titles(), ['Second', 'Third', 'Fourth']);
});

async function searchTasks(f, query) {
  f.app.querySelector('#task-search').value = query;
  await f.app.querySelector('#task-search-form').fire('submit');
}

test('search collapses ASCII spaces and tabs with trimmed queries and ASCII-only case folding', () => {
  assert.ok(matchesSearch('One TWO  three', '  tWo  '));
  assert.ok(matchesSearch('One TWO  three', 'TWO  three'));
  assert.ok(matchesSearch('One TWO  three', 'TWO three'));
  assert.ok(matchesSearch('One TWO \t \tthree', '  two\t\tthree  '));
  assert.ok(matchesSearch('One TWO three', 'two  \t three'));
  for (const separator of ['\n', '\r', '\u00a0', '\u2003']) {
    assert.ok(!matchesSearch(`One${separator}two`, 'one two'));
  }
  assert.ok(matchesSearch('ÄBC', 'Äbc'));
  assert.ok(!matchesSearch('ÄBC', 'äbc'));
  assert.ok(matchesSearch('anything', '   '));
});

test('task search intersects filters, keeps draft queries unapplied, and resets on reopening', async () => {
  const f = await fixture();
  assert.equal(f.app.querySelector('#task-search').value, '');
  await searchTasks(f, '  IR  ');
  assert.deepEqual(f.titles(), ['First', 'Third']);
  await saveDate(f, 0, '2025-01-01');
  await saveDate(f, 1, '2025-01-02');
  await applyRange(f, '2025-01-01', '2025-01-02');
  await choose(f.priority, 'High');
  await choose(f.completion, 'Completed');
  assert.deepEqual(f.titles(), ['Third']);
  f.app.querySelector('#task-search').value = 'Second';
  await choose(f.completion, 'All');
  assert.deepEqual(f.titles(), ['First', 'Third']);
  await searchTasks(f, 'second');
  assert.deepEqual(f.titles(), []);
  await searchTasks(f, '');
  assert.deepEqual(f.titles(), ['First', 'Third']);
  assert.equal(f.priority.value, 'High');
  assert.equal(f.app.querySelector('#due-through').value, '2025-01-02');
  assert.equal((await fixture()).app.querySelector('#task-search').value, '');
});

test('task search survives edits, creation, default changes, and movement', async () => {
  const f = await fixture();
  await searchTasks(f, 'first');
  await choose(f.priority, 'High');
  await choose(f.completion, 'Open');
  await choose(f.app.querySelector('#default-task-priority'), 'High');
  f.app.querySelector('#task-title').value = 'Unmatched';
  await f.app.querySelector('form').fire('submit');
  assert.deepEqual(f.titles(), ['First']);
  f.app.querySelector('#task-title').value = 'First arrival';
  await f.app.querySelector('form').fire('submit');
  assert.deepEqual(f.titles(), ['First', 'First arrival']);
  await saveDate(f, 0, '2025-01-01');
  await applyRange(f, '2025-01-01', '');
  const rename = f.rows()[0].children[2];
  rename.children[1].value = 'No match';
  await rename.fire('submit');
  assert.deepEqual(f.titles(), []);
  await searchTasks(f, 'no match');
  const checkbox = f.rows()[0].children[1];
  checkbox.checked = true;
  await checkbox.fire('change');
  assert.deepEqual(f.titles(), []);
  await choose(f.completion, 'Completed');
  await choose(f.rows()[0].children[3], 'Low');
  assert.deepEqual(f.titles(), []);
  await choose(f.priority, 'Low');
  const move = f.rows()[0].children[5];
  move.children[0].value = '2';
  await move.fire('submit');
  assert.deepEqual(f.titles(), []);
  assert.equal(f.app.querySelector('#task-search').value, 'no match');
  assert.equal(f.completion.value, 'Completed');
  assert.equal(f.priority.value, 'Low');
  assert.equal(f.app.querySelector('#due-from').value, '2025-01-01');
});

test('normalized task search retains filters and displays original titles after edits and clearing', async () => {
  const f = await fixture();
  const title = 'First  \t ARRIVAL';
  const rename = f.rows()[0].children[2];
  rename.children[1].value = title;
  await rename.fire('submit');
  await saveDate(f, 0, '2025-01-01');
  await choose(f.priority, 'High');
  await choose(f.completion, 'Open');
  await applyRange(f, '2025-01-01', '2025-01-01');
  await searchTasks(f, '  FIRST\t \tarrival  ');
  assert.deepEqual(f.titles(), [title]);
  assert.equal(f.rows()[0].children[1].attributes['aria-label'], `Complete ${title}`);
  await searchTasks(f, '');
  assert.deepEqual(f.titles(), [title]);
  assert.equal(f.tasks[0].title, title);
  assert.equal(f.priority.value, 'High');
  assert.equal(f.completion.value, 'Open');
  assert.equal(f.app.querySelector('#due-from').value, '2025-01-01');
});

test('archived task search remains usable and never writes task data', async () => {
  const f = await fixture(true);
  assert.ok(!f.app.querySelector('#task-search').disabled);
  assert.ok(!f.app.querySelector('#task-search-form').querySelector('button').disabled);
  await searchTasks(f, 'ir');
  assert.deepEqual(f.titles(), ['First', 'Third']);
  assert.ok(f.rows().every(row => row.children[1].disabled));
  await choose(f.completion, 'Completed');
  assert.deepEqual(f.titles(), ['Third']);
  await searchTasks(f, '');
  assert.deepEqual(f.titles(), ['Second', 'Third']);
  assert.equal(f.requests.length, 0);
});

test('project search intersects archive filter, preserves summaries and resets on list navigation', async () => {
  const app = new Element('main');
  const projects = [
    { id: 1, name: 'Alpha  ONE', archived: false, completed: 1, total: 3 },
    { id: 2, name: 'Alpha two', archived: true, completed: 2, total: 2 },
    { id: 3, name: 'Beta', archived: false, completed: 0, total: 0 },
  ];
  const navigations = [];
  const requests = [];
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const context = {
    matchesSearch,
    location: { pathname: '/', assign: path => navigations.push(path) },
    document: { querySelector: () => app, createElement: tag => new Element(tag) },
    fetch: async (path, options) => {
      if (options) {
        requests.push(options);
        Object.assign(projects.find(project => project.id === Number(path.split('/').at(-1))), JSON.parse(options.body));
      }
      return { ok: true, json: async () => structuredClone(options ? projects.find(project => project.id === Number(path.split('/').at(-1))) : projects) };
    },
  };
  runInNewContext(source.slice(0, source.lastIndexOf('\nrender().catch')).replace(/^import .*;\n/gm, '') + '\nthis.render = render;', context);
  await context.render();
  const titles = () => app.querySelector('#project-list').children.map(row => row.children[0].textContent);
  const search = async query => {
    app.querySelector('#project-search').value = query;
    await app.querySelector('#project-search-form').fire('submit');
  };
  await search(' ALPHA ');
  assert.deepEqual(titles(), ['Alpha  ONE']);
  assert.equal(app.querySelector('#project-list').children[0].children[1].textContent, '1/3 completed');
  await choose(app.querySelector('#project-filter'), 'Archived');
  assert.deepEqual(titles(), ['Alpha two']);
  await app.querySelector('#project-list').children[0].children[3].fire('click');
  assert.deepEqual(titles(), []);
  await choose(app.querySelector('#project-filter'), 'Active');
  assert.deepEqual(titles(), ['Alpha  ONE', 'Alpha two']);
  await search('alpha one');
  assert.deepEqual(titles(), ['Alpha  ONE']);
  await search('  alpha\t \tone  ');
  assert.deepEqual(titles(), ['Alpha  ONE']);
  await app.querySelector('#project-list').children[0].children[2].fire('click');
  assert.deepEqual(navigations, ['/projects/1']);
  assert.equal(requests.length, 1); // Only restoration writes data.
  await context.render();
  assert.equal(app.querySelector('#project-search').value, '');
  assert.deepEqual(titles(), ['Alpha  ONE', 'Alpha two', 'Beta']);
});

test('move controls disable for archived sources or no active destinations', async () => {
  for (const f of [await fixture(true), await fixture(false, [{ id: 1, name: 'Source' }, { id: 2, archived: true }])]) {
    for (const row of f.rows()) {
      const form = row.children[5];
      assert.equal(form.children[0].disabled, true);
      assert.equal(form.children[1].disabled, true);
      await form.fire('submit');
    }
    assert.equal(f.requests.length, 0);
  }
});
