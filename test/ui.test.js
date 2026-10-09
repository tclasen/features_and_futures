import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// Minimal DOM adapter for exercising the application's browser event handlers.
class Element {
  constructor() {
    this.children = [];
    this.dataset = {};
    this.listeners = {};
    this.attributes = {};
    this.value = '';
    this.textContent = '';
  }
  append(...children) { this.children.push(...children); }
  replaceChildren() { this.children = []; }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  setAttribute(name, value) { this.attributes[name] = value; }
  querySelector() { return this.button ??= new Element(); }
  focus() {}
  async trigger(type) { await this.listeners[type]({ preventDefault() {} }); }
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('project task UI validates, filters, updates completion and rolls back errors', async () => {
  const elements = new Map();
  const element = (selector) => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  element('#task-filter').value = 'all';
  const tasks = [
    { id: 1, title: '<b>Open task</b>', completed: false },
    { id: 2, title: 'Done task', completed: true },
  ];
  let failUpdate = false;
  let creates = 0;
  const fetch = async (path, options) => {
    let data;
    let ok = true;
    if (options?.method === 'POST') {
      creates++;
      data = { id: 3, title: JSON.parse(options.body).title, completed: false };
      tasks.push(data);
    } else if (options?.method === 'PATCH') {
      if (failUpdate) {
        ok = false;
        data = { error: 'Save failed' };
      } else {
        const task = tasks.find((task) => path.endsWith(`/${task.id}`));
        task.completed = JSON.parse(options.body).completed;
        data = task;
      }
    } else {
      data = path.endsWith('/tasks') ? tasks : { id: 7, name: 'Project' };
    }
    return { ok, json: async () => structuredClone(data) };
  };
  runInNewContext(await readFile(new URL('../public/app.js', import.meta.url), 'utf8'), {
    document: { querySelector: element, createElement: () => new Element() },
    window: { location: { pathname: '/projects/7' } },
    fetch,
  });
  await settle();
  const rows = () => element('#tasks').children;
  const titles = () => rows().map((row) => row.children[0].textContent);
  assert.deepEqual(titles(), ['<b>Open task</b>', 'Done task']);
  assert.equal(rows()[0].dataset.testid, 'task-row');
  assert.equal(rows()[0].children[1].attributes['aria-label'], 'Complete <b>Open task</b>');
  assert.equal(rows()[0].children[1].checked, false);
  assert.equal(rows()[1].children[1].checked, true);

  element('#task-title').value = ' \t ';
  await element('#create-task').trigger('submit');
  assert.equal(creates, 0);
  assert.equal(element('#error').textContent, 'Task title is required');
  element('#task-title').value = '  New task  ';
  await element('#create-task').trigger('submit');
  assert.equal(creates, 1);
  assert.deepEqual(titles(), ['<b>Open task</b>', 'Done task', 'New task']);

  element('#task-filter').value = 'open';
  await element('#task-filter').trigger('change');
  assert.deepEqual(titles(), ['<b>Open task</b>', 'New task']);
  const checkbox = rows()[0].children[1];
  checkbox.checked = true;
  await checkbox.trigger('change');
  assert.deepEqual(titles(), ['New task']);
  element('#task-filter').value = 'completed';
  await element('#task-filter').trigger('change');
  assert.deepEqual(titles(), ['<b>Open task</b>', 'Done task']);
  const completed = rows()[0].children[1];
  completed.checked = false;
  failUpdate = true;
  await completed.trigger('change');
  assert.equal(completed.checked, true);
  assert.equal(element('#error').textContent, 'Save failed');
  failUpdate = false;
  completed.checked = false;
  await completed.trigger('change');
  assert.deepEqual(titles(), ['Done task']);
  element('#task-filter').value = 'all';
  await element('#task-filter').trigger('change');
  assert.deepEqual(titles(), ['<b>Open task</b>', 'Done task', 'New task']);
});
