import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// Small DOM adapter for exercising the browser controller without dependencies.
class Node {
  constructor(tag, text) {
    this.tag = tag;
    this.textContent = text || '';
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.listeners = {};
    this.value = '';
  }
  append(...nodes) {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
      if (this.tag === 'select' && this.children.length === 1) this.value = node.value;
    }
  }
  prepend(node) { node.parent = this; this.children.unshift(node); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  focus() {}
  remove() { this.parent.children = this.parent.children.filter((child) => child !== this); }
  querySelector(selector) {
    return this.children.find((child) => selector === '[role="alert"]'
      ? child.attributes.role === 'alert' : child.tag === selector)
      || this.children.map((child) => child.querySelector(selector)).find(Boolean);
  }
  async fire(name) { await this.listeners[name]({ preventDefault() {} }); }
}

const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

test('project task UI: labels, validation, completion, and filters in creation order', async () => {
  const app = new Node('main');
  const tasks = [];
  const context = {
    document: {
      querySelector: () => app,
      createElement: (tag) => new Node(tag),
    },
    location: { pathname: '/projects/1', assign() {} },
    async fetch(path, options) {
      let data;
      if (path === '/api/projects/1') data = { id: 1, name: 'Example' };
      else if (!options) data = tasks.map((task) => ({ ...task }));
      else if (options.method === 'POST') {
        data = { id: tasks.length + 1, title: JSON.parse(options.body).title, completed: false };
        tasks.push({ ...data });
      } else {
        const task = tasks.find((task) => path.endsWith(`/${task.id}`));
        Object.assign(task, JSON.parse(options.body));
        data = { ...task };
      }
      return { ok: true, json: async () => data };
    },
  };
  runInNewContext(source, context);
  // The controller's initial render completes through promise microtasks.
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(app.querySelector('h1').textContent, 'Example');
  const form = app.querySelector('form');
  const [label, input, button] = form.children;
  assert.equal(label.textContent, 'Task title');
  assert.equal(label.htmlFor, input.id);
  assert.equal(button.textContent, 'Create task');
  const filter = app.querySelector('select');
  assert.equal(filter.value, 'All');
  assert.deepEqual(filter.children.map((option) => option.textContent), ['All', 'Open', 'Completed']);
  const list = app.querySelector('ul');
  input.value = ' \t\n ';
  await form.fire('submit');
  assert.equal(app.querySelector('[role="alert"]').textContent, 'Task title is required');
  assert.equal(list.children.length, 0);
  for (const title of ['  First  ', 'Second']) {
    input.value = title;
    await form.fire('submit');
  }
  assert.equal(app.querySelector('[role="alert"]'), undefined);
  const titles = () => list.children.map((row) => row.children[1].textContent);
  assert.deepEqual(titles(), ['First', 'Second']);
  assert.ok(list.children.every((row) => row.dataset.testid === 'task-row'));
  let checkbox = list.children[0].children[0];
  assert.equal(checkbox.attributes['aria-label'], 'Complete First');
  assert.equal(checkbox.checked, false);
  checkbox.checked = true;
  await checkbox.fire('change');
  assert.equal(tasks[0].completed, true);
  filter.value = 'Open';
  await filter.fire('change');
  assert.deepEqual(titles(), ['Second']);
  filter.value = 'Completed';
  await filter.fire('change');
  assert.deepEqual(titles(), ['First']);
  checkbox = list.children[0].children[0];
  checkbox.checked = false;
  await checkbox.fire('change');
  assert.equal(tasks[0].completed, false);
  assert.deepEqual(titles(), []);
  filter.value = 'All';
  await filter.fire('change');
  assert.deepEqual(titles(), ['First', 'Second']);
});
