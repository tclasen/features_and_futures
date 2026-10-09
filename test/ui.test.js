import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// Small DOM boundary double: exercise the actual browser script without dependencies.
class Element {
  constructor() {
    this.children = [];
    this.listeners = {};
    this.dataset = {};
    this.attributes = {};
    this.value = '';
    this.hidden = true;
  }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  append(...children) { this.children.push(...children); }
  replaceChildren() { this.children = []; }
  setAttribute(name, value) { this.attributes[name] = value; }
  querySelector() { return this.button ??= new Element(); }
  focus() {}
  async trigger(name) { await this.listeners[name]({ preventDefault() {} }); }
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('project UI creates trimmed tasks, filters in order, and saves completion both ways', async () => {
  const elements = new Map();
  const element = (selector) => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  element('#task-filter').value = 'all';
  let storedTasks = [
    { id: 1, title: 'First', completed: false },
    { id: 2, title: '<b>Second</b>', completed: true },
  ];
  const requests = [];
  const context = {
    document: { querySelector: element, createElement: () => new Element() },
    window: { location: { pathname: '/projects/7', assign() {} } },
    fetch: async (path, options = {}) => {
      requests.push({ path, options });
      let data;
      if (path === '/api/projects/7') data = { id: 7, name: 'Project' };
      else if (options.method === 'POST') {
        data = { id: 3, ...JSON.parse(options.body), completed: false };
        storedTasks.push(data);
      } else if (options.method === 'PATCH') {
        const id = Number(path.split('/').at(-1));
        data = { ...storedTasks.find((task) => task.id === id), ...JSON.parse(options.body) };
        storedTasks = storedTasks.map((task) => task.id === id ? data : task);
      } else data = storedTasks;
      return { ok: true, json: async () => structuredClone(data) };
    },
  };
  runInNewContext(await readFile(new URL('../public/app.js', import.meta.url), 'utf8'), context);
  await settle();
  const rows = () => element('#tasks').children;
  const titles = () => rows().map((row) => row.children[0].textContent);
  assert.equal(element('#heading').textContent, 'Project');
  assert.deepEqual(titles(), ['First', '<b>Second</b>']);
  assert.equal(rows()[0].dataset.testid, 'task-row');
  assert.equal(rows()[0].children[1].attributes['aria-label'], 'Complete First');
  assert.equal(rows()[1].children[1].checked, true);

  element('#task-title').value = '  \t ';
  await element('#create-task').trigger('submit');
  assert.equal(element('#error').textContent, 'Task title is required');
  assert.equal(element('#error').hidden, false);
  assert.equal(requests.length, 2);
  assert.equal(rows().length, 2);

  element('#task-title').value = '  Third  ';
  await element('#create-task').trigger('submit');
  assert.deepEqual(titles(), ['First', '<b>Second</b>', 'Third']);
  assert.equal(element('#task-title').value, '');
  assert.equal(requests.at(-1).path, '/api/projects/7/tasks');

  element('#task-filter').value = 'open';
  await element('#task-filter').trigger('change');
  assert.deepEqual(titles(), ['First', 'Third']);
  const firstCheckbox = rows()[0].children[1];
  firstCheckbox.checked = true;
  await firstCheckbox.trigger('change');
  assert.equal(requests.at(-1).path, '/api/projects/7/tasks/1');
  assert.deepEqual(titles(), ['Third']);

  element('#task-filter').value = 'completed';
  await element('#task-filter').trigger('change');
  assert.deepEqual(titles(), ['First', '<b>Second</b>']);
  const reopenCheckbox = rows()[0].children[1];
  reopenCheckbox.checked = false;
  await reopenCheckbox.trigger('change');
  assert.deepEqual(titles(), ['<b>Second</b>']);

  element('#task-filter').value = 'all';
  await element('#task-filter').trigger('change');
  assert.deepEqual(titles(), ['First', '<b>Second</b>', 'Third']);
  assert.equal(rows()[0].children[1].checked, false);
});
