import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// Only the DOM operations used by the app are needed for these interaction checks.
class Element {
  children = [];
  dataset = {};
  attributes = {};
  listeners = {};
  value = '';
  hidden = false;
  textContent = '';
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  querySelector() { return this.button; }
  focus() {}
  async dispatch(name) { await this.listeners[name]({ preventDefault() {} }); }
}

test('task UI validates titles, filters in creation order, and saves checkbox changes', async () => {
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  element('#project-form').button = new Element();
  element('#task-form').button = new Element();
  element('#task-filter').value = 'all';
  const savedTasks = [
    { id: 'one', title: 'First task', completed: false },
    { id: 'two', title: 'Second task', completed: true },
    { id: 'three', title: 'Third task', completed: false },
  ];
  const writes = [];
  let failNextWrite = false;
  await runInNewContext(source, {
    document: { querySelector: element, createElement: () => new Element() },
    window: { location: { pathname: '/projects/example' } },
    fetch: async (path, options) => {
      let body;
      if (!options) {
        body = path.endsWith('/tasks') ? structuredClone(savedTasks) : { id: 'example', name: 'Example' };
      } else {
        writes.push({ path, ...options });
        if (failNextWrite) {
          failNextWrite = false;
          return { ok: false, json: async () => ({ error: 'Save failed' }) };
        }
        const input = JSON.parse(options.body);
        if (options.method === 'POST') {
          body = { id: 'four', title: input.title, completed: false };
          savedTasks.push(body);
        } else {
          const task = savedTasks.find(task => path.endsWith(`/${task.id}`));
          task.completed = input.completed;
          body = { ...task };
        }
      }
      return { ok: true, json: async () => body };
    },
  });
  const rows = () => element('#task-list').children;
  const titles = () => rows().map(row => row.children[1].textContent);
  const filter = async value => {
    element('#task-filter').value = value;
    await element('#task-filter').dispatch('change');
  };
  assert.equal(element('#project-heading').textContent, 'Example');
  assert.equal(element('#task-controls').hidden, false);
  assert.deepEqual(titles(), ['First task', 'Second task', 'Third task']);
  assert.ok(rows().every(row => row.dataset.testid === 'task-row'));
  assert.equal(rows()[0].children[0].attributes['aria-label'], 'Complete First task');
  assert.equal(rows()[1].children[0].checked, true);
  element('#task-title').value = ' \t ';
  await element('#task-form').dispatch('submit');
  assert.equal(element('#task-alert').textContent, 'Task title is required');
  assert.equal(element('#task-alert').hidden, false);
  assert.equal(writes.length, 0);
  assert.equal(rows().length, 3);
  await filter('open');
  assert.deepEqual(titles(), ['First task', 'Third task']);
  const firstCheckbox = rows()[0].children[0];
  firstCheckbox.checked = true;
  await firstCheckbox.dispatch('change');
  assert.equal(writes.at(-1).path, '/api/projects/example/tasks/one');
  assert.equal(savedTasks[0].completed, true);
  assert.deepEqual(titles(), ['Third task']);
  await filter('completed');
  assert.deepEqual(titles(), ['First task', 'Second task']);
  const completedCheckbox = rows()[0].children[0];
  completedCheckbox.checked = false;
  await completedCheckbox.dispatch('change');
  assert.equal(savedTasks[0].completed, false);
  assert.deepEqual(titles(), ['Second task']);
  element('#task-title').value = '  Fourth task  ';
  await element('#task-form').dispatch('submit');
  assert.equal(savedTasks[3].title, 'Fourth task');
  assert.equal(savedTasks[3].completed, false);
  assert.deepEqual(titles(), ['Second task']);
  await filter('all');
  assert.deepEqual(titles(), ['First task', 'Second task', 'Third task', 'Fourth task']);
  failNextWrite = true;
  const checkbox = rows()[0].children[0];
  checkbox.checked = true;
  await checkbox.dispatch('change');
  assert.equal(checkbox.checked, false);
  assert.equal(checkbox.disabled, false);
  assert.equal(element('#task-alert').textContent, 'Save failed');
});
