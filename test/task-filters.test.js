import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { validDueDate } from '../public/dates.js';

// Small DOM stand-in lets the actual browser event handlers run without dependencies.
class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.listeners = {};
    this.dataset = {};
    this.attributes = {};
    this.disabled = false;
    this.textContent = '';
  }
  focus() {}
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = value; }
  get value() {
    return this.savedValue ?? (this.tag === 'select' ? this.children[0]?.value : '') ?? '';
  }
  set value(value) { this.savedValue = value; }
  set innerHTML(html) {
    this.children = [];
    const stack = [this];
    for (const token of html.match(/<[^>]+>|[^<]+/g) || []) {
      if (token.startsWith('</')) { stack.pop(); continue; }
      if (token.startsWith('<')) {
        const tag = token.match(/^<(\w+)/)[1];
        const child = new Element(tag);
        for (const match of token.matchAll(/([\w-]+)="([^"]*)"/g)) {
          child.setAttribute(match[1], match[2]);
          if (match[1] === 'id') child.id = match[2];
          if (match[1] === 'for') child.htmlFor = match[2];
        }
        child.disabled = /\sdisabled[\s>]/.test(token);
        stack.at(-1).append(child);
        if (tag !== 'input') stack.push(child);
      } else if (token.trim()) {
        stack.at(-1).textContent += token.trim();
        if (stack.at(-1).tag === 'option') stack.at(-1).value = token.trim();
      }
    }
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const matches = [];
    for (const child of this.children) {
      if (selector.startsWith('#') ? child.id === selector.slice(1) : child.tag === selector) matches.push(child);
      matches.push(...child.querySelectorAll(selector));
    }
    return matches;
  }
  addEventListener(type, handler) { (this.listeners[type] ??= []).push(handler); }
  async fire(type) {
    assert.equal(this.disabled, false, 'control should be enabled');
    for (const handler of this.listeners[type] || []) await handler({ preventDefault() {} });
  }
}

async function page(archived = false) {
  const app = new Element('main');
  const alert = new Element('p');
  const tasks = [];
  for (const priority of ['Low', 'Normal', 'High']) {
    for (const completed of [false, true]) {
      tasks.push({ id: tasks.length + 1, project_id: 1, title: `${priority} ${completed ? 'done' : 'open'}`, priority, completed });
    }
  }
  const project = { id: 1, archived, default_priority: 'Normal' };
  const context = vm.createContext({
    validDueDate,
    document: {
      querySelector: selector => selector === '#app' ? app : alert,
      createElement: tag => new Element(tag),
    },
    fetch: async (path, options) => {
      if (!options) return { ok: true, json: async () => structuredClone(tasks) };
      const input = JSON.parse(options.body);
      if (path === '/api/projects/1') {
        Object.assign(project, input);
        return { ok: true, json: async () => structuredClone(project) };
      }
      if (options.method === 'POST') {
        const task = { id: tasks.length + 1, project_id: 1, title: input.title, completed: false, priority: project.default_priority };
        tasks.push(task);
        return { ok: true, json: async () => structuredClone(task) };
      }
      const task = tasks.find(task => path.endsWith(`/${task.id}`));
      Object.assign(task, input);
      return { ok: true, json: async () => structuredClone(task) };
    },
  });
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  vm.runInContext(source.replace(/^import .*\n/, '').replace(/render\(\);\s*$/, ''), context);
  await context.renderTasks(structuredClone(project));
  const completion = app.querySelector('#task-filter');
  const priority = app.querySelector('#priority-filter');
  const rows = () => app.querySelector('#tasks').children;
  const titles = () => rows().map(row => row.querySelector('span').textContent);
  async function select(control, value) { control.value = value; await control.fire('change'); }
  return { app, alert, tasks, completion, priority, rows, titles, select };
}

test('all combinations intersect in creation order and do not change task data', async () => {
  const p = await page();
  assert.equal(p.completion.value, 'All');
  assert.equal(p.priority.value, 'All');
  assert.deepEqual(p.priority.children.map(option => option.textContent), ['All', 'Low', 'Normal', 'High']);
  const original = structuredClone(p.tasks);
  for (const completion of ['All', 'Open', 'Completed']) {
    await p.select(p.completion, completion);
    for (const priority of ['All', 'Low', 'Normal', 'High']) {
      await p.select(p.priority, priority);
      assert.equal(p.completion.value, completion);
      assert.deepEqual(p.titles(), p.tasks.filter(task =>
        (completion === 'All' || task.completed === (completion === 'Completed')) &&
        (priority === 'All' || task.priority === priority)).map(task => task.title));
    }
    assert.equal(p.priority.value, 'High');
  }
  assert.deepEqual(p.tasks, original);
});

test('priority, completion and rename edits retain filters and immediately update visible rows', async () => {
  const p = await page();
  await p.select(p.completion, 'Open');
  await p.select(p.priority, 'High');
  const rename = p.rows()[0].querySelector('form');
  rename.querySelector('input').value = '  Renamed high task  ';
  await rename.fire('submit');
  assert.deepEqual(p.titles(), ['Renamed high task']);
  assert.equal(p.rows()[0].querySelector('input').attributes['aria-label'], 'Complete Renamed high task');
  assert.equal(p.completion.value, 'Open');
  assert.equal(p.priority.value, 'High');
  await p.select(p.rows()[0].querySelector('select'), 'Low');
  assert.deepEqual(p.titles(), []);
  assert.equal(p.completion.value, 'Open');
  assert.equal(p.priority.value, 'High');
  await p.select(p.priority, 'Low');
  assert.deepEqual(p.titles(), ['Low open', 'Renamed high task']);
  const checkbox = p.rows()[1].querySelector('input');
  checkbox.checked = true;
  await checkbox.fire('change');
  assert.deepEqual(p.titles(), ['Low open']);
  assert.equal(p.completion.value, 'Open');
  assert.equal(p.priority.value, 'Low');
  await p.select(p.completion, 'Completed');
  assert.deepEqual(p.titles(), ['Low done', 'Renamed high task']);
  assert.deepEqual(p.tasks[4], { id: 5, project_id: 1, title: 'Renamed high task', priority: 'Low', completed: true });
  assert.equal(p.tasks.filter(task => task.completed).length, 4);
  const uncheck = p.rows()[1].querySelector('input');
  uncheck.checked = false;
  await uncheck.fire('change');
  assert.deepEqual(p.titles(), ['Low done']);
  assert.equal(p.completion.value, 'Completed');
  assert.equal(p.priority.value, 'Low');
});

test('archived project filters work while every task editing control stays disabled', async () => {
  const p = await page(true);
  await p.select(p.completion, 'Completed');
  await p.select(p.priority, 'Normal');
  assert.deepEqual(p.titles(), ['Normal done']);
  for (const tag of ['input', 'button', 'select']) {
    for (const control of p.rows()[0].querySelectorAll(tag)) assert.equal(control.disabled, true);
  }
  assert.equal(p.app.querySelector('#task-form').querySelector('button').disabled, true);
  assert.equal(p.priority.disabled, false);
  assert.equal(p.completion.disabled, false);
  const defaultPriority = p.app.querySelector('#default-task-priority');
  assert.equal(defaultPriority.value, 'Normal');
  assert.equal(defaultPriority.disabled, true);
});

test('changing the project default leaves filters and existing rows intact; new tasks inherit it', async () => {
  const p = await page();
  const control = p.app.querySelector('#default-task-priority');
  assert.deepEqual(control.children.map(option => option.textContent), ['Low', 'Normal', 'High']);
  assert.equal(control.value, 'Normal');
  await p.select(p.completion, 'Open');
  await p.select(p.priority, 'High');
  const existing = structuredClone(p.tasks);
  await p.select(control, 'Low');
  assert.equal(control.value, 'Low');
  assert.deepEqual(p.tasks, existing);
  assert.equal(p.completion.value, 'Open');
  assert.equal(p.priority.value, 'High');
  assert.deepEqual(p.titles(), ['High open']);
  p.app.querySelector('#task-title').value = 'Inherits Low';
  await p.app.querySelector('#task-form').fire('submit');
  assert.deepEqual(p.titles(), ['High open']);
  assert.equal(p.tasks.at(-1).priority, 'Low');
  await p.select(p.priority, 'Low');
  assert.deepEqual(p.titles(), ['Low open', 'Inherits Low']);
  await p.select(control, 'High');
  assert.deepEqual(p.titles(), ['Low open', 'Inherits Low']);
  assert.equal(p.tasks.at(-1).priority, 'Low');
});

test('due date controls save and clear independently without resetting filters or rename data', async () => {
  const p = await page();
  await p.select(p.completion, 'Open');
  await p.select(p.priority, 'High');
  function dueForm() { return p.rows()[0].querySelectorAll('form')[1]; }
  assert.equal(dueForm().querySelector('label').textContent, 'Task due date');
  assert.equal(dueForm().querySelector('button').textContent, 'Save due date');
  assert.equal(dueForm().querySelector('input').type, 'text');
  assert.equal(dueForm().querySelector('input').value, '');
  dueForm().querySelector('input').value = '2024-02-29';
  await dueForm().fire('submit');
  assert.equal(dueForm().querySelector('input').value, '2024-02-29');
  assert.equal(p.completion.value, 'Open');
  assert.equal(p.priority.value, 'High');
  assert.deepEqual(p.titles(), ['High open']);
  assert.equal(p.tasks[4].due_date, '2024-02-29');
  assert.equal(p.tasks[0].due_date, undefined);
  const rename = p.rows()[0].querySelector('form');
  rename.querySelector('input').value = 'New title';
  await rename.fire('submit');
  assert.equal(dueForm().querySelector('input').value, '2024-02-29');
  dueForm().querySelector('input').value = '';
  await dueForm().fire('submit');
  assert.equal(dueForm().querySelector('input').value, '');
  assert.deepEqual(p.titles(), ['New title']);
  assert.equal(p.completion.value, 'Open');
  assert.equal(p.priority.value, 'High');
});

async function applyRange(p, from, through) {
  p.app.querySelector('#due-from').value = from;
  p.app.querySelector('#due-through').value = through;
  await p.app.querySelector('#due-range-form').fire('submit');
}

async function saveDate(p, rowIndex, value) {
  const form = p.rows()[rowIndex].querySelectorAll('form')[1];
  form.querySelector('input').value = value;
  await form.fire('submit');
}

async function datedPage() {
  const p = await page();
  for (const [index, date] of ['0001-01-01', '2024-02-28', '2024-02-29', '2024-03-01', '9999-12-31'].entries()) {
    await saveDate(p, index, date);
  }
  return p;
}

test('due boundaries are inclusive, unbounded when blank, and intersect both filters', async () => {
  const p = await datedPage();
  assert.equal(p.app.querySelector('#due-from').value, '');
  assert.equal(p.app.querySelector('#due-through').value, '');
  await applyRange(p, ' 2024-02-28 ', ' 2024-03-01 ');
  assert.deepEqual(p.titles(), ['Low done', 'Normal open', 'Normal done']);
  assert.equal(p.app.querySelector('#due-from').value, '2024-02-28');
  await p.select(p.completion, 'Open');
  await p.select(p.priority, 'Normal');
  assert.deepEqual(p.titles(), ['Normal open']);
  await applyRange(p, '', '2024-02-28');
  assert.deepEqual(p.titles(), []);
  assert.equal(p.completion.value, 'Open');
  assert.equal(p.priority.value, 'Normal');
  await p.select(p.completion, 'All');
  await p.select(p.priority, 'All');
  assert.deepEqual(p.titles(), ['Low open', 'Low done']);
  await applyRange(p, '2024-03-01', '');
  assert.deepEqual(p.titles(), ['Normal done', 'High open']);
  await applyRange(p, '0001-01-01', '9999-12-31');
  assert.equal(p.rows().length, 5);
  await applyRange(p, ' ', ' ');
  assert.equal(p.rows().length, 6);
});

test('invalid range drafts preserve applied membership even after filter changes', async () => {
  const p = await datedPage();
  await applyRange(p, '2024-02-29', '2024-03-01');
  for (const invalid of ['0000-01-01', '2023-02-29', '1900-02-29', '2024-04-31', '2024-13-01', '2024-00-01', '2024-01-00', '2024-2-29', '10000-01-01', 'no date']) {
    await applyRange(p, invalid, '');
    assert.equal(p.alert.textContent, 'Due range must use valid YYYY-MM-DD dates');
    assert.deepEqual(p.titles(), ['Normal open', 'Normal done']);
    await applyRange(p, '', invalid);
    assert.deepEqual(p.titles(), ['Normal open', 'Normal done']);
  }
  await applyRange(p, '2024-03-02', '2024-03-01');
  assert.equal(p.alert.textContent, 'Due from must not be after Due through');
  await p.select(p.completion, 'Completed');
  assert.deepEqual(p.titles(), ['Normal done']);
  await applyRange(p, '2000-02-29', '2400-02-29');
  assert.equal(p.alert.hidden, true);
});

test('task edits, creation and defaults retain the range and re-evaluate membership', async () => {
  const p = await datedPage();
  await applyRange(p, '2024-02-28', '2024-03-01');
  await p.select(p.completion, 'Open');
  await p.select(p.priority, 'Normal');
  const rename = p.rows()[0].querySelector('form');
  rename.querySelector('input').value = 'Renamed';
  await rename.fire('submit');
  assert.deepEqual(p.titles(), ['Renamed']);
  await p.select(p.app.querySelector('#default-task-priority'), 'High');
  p.app.querySelector('#task-title').value = 'Undated new task';
  await p.app.querySelector('#task-form').fire('submit');
  assert.deepEqual(p.titles(), ['Renamed']);
  await saveDate(p, 0, '2024-03-02');
  assert.deepEqual(p.titles(), []);
  await p.select(p.completion, 'All');
  assert.deepEqual(p.titles(), ['Normal done']);
  await p.select(p.rows()[0].querySelector('select'), 'High');
  assert.deepEqual(p.titles(), []);
  await p.select(p.priority, 'High');
  assert.deepEqual(p.titles(), ['Normal done']);
  await p.select(p.completion, 'Completed');
  const checkbox = p.rows()[0].querySelector('input');
  checkbox.checked = false;
  await checkbox.fire('change');
  assert.deepEqual(p.titles(), []);
  await p.select(p.completion, 'Open');
  assert.deepEqual(p.titles(), ['Normal done']);
  await saveDate(p, 0, '');
  assert.deepEqual(p.titles(), []);
  assert.equal(p.app.querySelector('#due-from').value, '2024-02-28');
  assert.equal(p.app.querySelector('#due-through').value, '2024-03-01');
  assert.equal(p.completion.value, 'Open');
  assert.equal(p.priority.value, 'High');
});

test('archived pages allow due-range applications and a fresh page has no range', async () => {
  const p = await page(true);
  await applyRange(p, '2024-01-01', '');
  assert.deepEqual(p.titles(), []);
  await applyRange(p, '', '');
  assert.equal(p.rows().length, 6);
  for (const row of p.rows()) {
    for (const tag of ['input', 'button', 'select']) {
      for (const control of row.querySelectorAll(tag)) assert.equal(control.disabled, true);
    }
  }
  const reopened = await page();
  assert.equal(reopened.app.querySelector('#due-from').value, '');
  assert.equal(reopened.app.querySelector('#due-through').value, '');
  assert.equal(reopened.rows().length, 6);
});
