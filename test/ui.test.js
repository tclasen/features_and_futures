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

test('project list: active default, archive/restore, summaries, and creation in either filter', async () => {
  const app = new Node('main');
  const projects = [
    { id: 1, name: 'First', archived: false, completedCount: 1, totalCount: 2 },
    { id: 2, name: 'Second', archived: false, completedCount: 0, totalCount: 0 },
  ];
  let destination;
  runInNewContext(source, {
    document: { querySelector: () => app, createElement: (tag) => new Node(tag) },
    location: { pathname: '/', assign(path) { destination = path; } },
    async fetch(path, options) {
      let data;
      if (!options) data = projects.map((project) => ({ ...project }));
      else if (options.method === 'POST') {
        data = { id: projects.length + 1, name: JSON.parse(options.body).name,
          archived: false, completedCount: 0, totalCount: 0 };
        projects.push({ ...data });
      } else {
        const project = projects.find((project) => path.endsWith(`/${project.id}`));
        Object.assign(project, JSON.parse(options.body));
        data = { ...project };
      }
      return { ok: true, json: async () => data };
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  const filter = app.querySelector('select');
  const list = app.querySelector('ul');
  const names = () => list.children.map((row) => row.children[0].textContent);
  assert.equal(filter.value, 'Active');
  assert.deepEqual(filter.children.map((option) => option.textContent), ['Active', 'Archived']);
  assert.deepEqual(names(), ['First', 'Second']);
  assert.equal(list.children[0].dataset.testid, 'project-row');
  assert.equal(list.children[0].children[1].dataset.testid, 'project-summary');
  assert.equal(list.children[0].children[1].textContent, '1/2 completed');
  assert.equal(list.children[1].children[1].textContent, '0/0 completed');
  assert.equal(list.children[0].children[3].textContent, 'Archive project');
  await list.children[0].children[3].fire('click');
  assert.deepEqual(names(), ['Second']);
  filter.value = 'Archived';
  await filter.fire('change');
  assert.deepEqual(names(), ['First']);
  assert.equal(list.children[0].children[3].textContent, 'Restore project');
  await list.children[0].children[2].fire('click');
  assert.equal(destination, '/projects/1');
  const form = app.querySelector('form');
  form.children[1].value = '  Third  ';
  await form.fire('submit');
  assert.deepEqual(names(), ['First']);
  await list.children[0].children[3].fire('click');
  assert.deepEqual(names(), []);
  filter.value = 'Active';
  await filter.fire('change');
  assert.deepEqual(names(), ['First', 'Second', 'Third']);
  assert.equal(list.children[0].children[1].textContent, '1/2 completed');
});

test('archived project is read-only while task filters still work', async () => {
  const app = new Node('main');
  const tasks = [
    { id: 1, title: 'Open task', completed: false },
    { id: 2, title: 'Done task', completed: true },
  ];
  runInNewContext(source, {
    document: { querySelector: () => app, createElement: (tag) => new Node(tag) },
    location: { pathname: '/projects/1', assign() {} },
    async fetch(path, options) {
      assert.equal(options, undefined);
      const data = path === '/api/projects/1'
        ? { id: 1, name: 'Archived example', archived: true } : tasks;
      return { ok: true, json: async () => data };
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(app.querySelector('p').textContent, 'Archived project');
  const form = app.querySelector('form');
  assert.equal(form.children[2].disabled, true);
  form.children[1].value = 'Not allowed';
  await form.fire('submit');
  const list = app.querySelector('ul');
  assert.equal(list.children.length, 2);
  assert.ok(list.children.every((row) => row.children[0].disabled));
  const filter = app.querySelector('select');
  for (const [value, title] of [['Open', 'Open task'], ['Completed', 'Done task']]) {
    filter.value = value;
    await filter.fire('change');
    assert.equal(list.children.length, 1);
    assert.equal(list.children[0].children[1].textContent, title);
    assert.equal(list.children[0].children[0].disabled, true);
  }
});

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
