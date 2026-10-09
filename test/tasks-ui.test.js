import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaskPanel } from '../public/tasks.js';

// A small DOM double exercises panel behavior without third-party dependencies.
class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.listeners = {};
    this.value = '';
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  async dispatch(name) { await this.listeners[name]({ preventDefault() {} }); }
  focus() {}
}

function find(element, predicate) {
  if (predicate(element)) return element;
  for (const child of element.children) {
    const result = find(child, predicate);
    if (result) return result;
  }
}

function taskRows(element) {
  return element.children.flatMap((child) => child.dataset.testid === 'task-row' ? [child] : taskRows(child));
}

function titles(panel) {
  return taskRows(panel).map((row) => row.children[1].textContent);
}

test('archived task panel is read-only while retaining filtering', async () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new Element(tag) };
  const calls = [];
  async function api(path, options) {
    calls.push({ path, options });
    return [
      { id: 1, title: 'Done', completed: true },
      { id: 2, title: 'Pending', completed: false },
    ];
  }
  try {
    const panel = await createTaskPanel(7, api, true);
    const form = find(panel, (element) => element.tag === 'form');
    const submit = find(form, (element) => element.tag === 'button');
    const filter = find(panel, (element) => element.id === 'task-filter');
    assert.equal(submit.disabled, true);
    assert.deepEqual(titles(panel), ['Done', 'Pending']);
    assert.ok(taskRows(panel).every((row) => row.children[0].disabled));
    await taskRows(panel)[0].children[0].dispatch('change');
    find(panel, (element) => element.id === 'task-title').value = 'Blocked';
    await form.dispatch('submit');
    assert.equal(calls.length, 1);
    filter.value = 'Open';
    await filter.dispatch('change');
    assert.deepEqual(titles(panel), ['Pending']);
    assert.equal(taskRows(panel)[0].children[0].disabled, true);
    filter.value = 'Completed';
    await filter.dispatch('change');
    assert.deepEqual(titles(panel), ['Done']);
    assert.equal(taskRows(panel)[0].children[0].disabled, true);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('task panel creates, validates, filters, toggles, and handles save failures', async () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new Element(tag) };
  const stored = [{ id: 1, title: 'Existing', completed: true }];
  let failSave = false;
  const calls = [];
  async function api(path, options) {
    calls.push({ path, options });
    if (!options) return structuredClone(stored);
    const body = JSON.parse(options.body);
    if (options.method === 'POST') {
      const task = { id: stored.length + 1, title: body.title.trim(), completed: false };
      stored.push(task);
      return { ...task };
    }
    if (failSave) throw new Error('Save failed');
    const task = stored.find((entry) => path.endsWith(`/${entry.id}`));
    task.completed = body.completed;
    return { ...task };
  }
  try {
    const panel = await createTaskPanel(7, api);
    const form = find(panel, (element) => element.tag === 'form');
    const input = find(panel, (element) => element.id === 'task-title');
    const filter = find(panel, (element) => element.id === 'task-filter');
    const alert = find(panel, (element) => element.attributes.role === 'alert');
    assert.equal(find(panel, (element) => element.htmlFor === input.id).textContent, 'Task title');
    assert.equal(find(form, (element) => element.tag === 'button').textContent, 'Create task');
    assert.equal(find(panel, (element) => element.htmlFor === filter.id).textContent, 'Task filter');
    assert.deepEqual(filter.children.map((option) => option.textContent), ['All', 'Open', 'Completed']);
    assert.equal(filter.value, 'All');
    assert.deepEqual(titles(panel), ['Existing']);
    input.value = ' \t ';
    await form.dispatch('submit');
    assert.equal(alert.hidden, false);
    assert.match(alert.textContent, /Task title is required/);
    assert.equal(calls.length, 1);
    input.value = '  New task  ';
    await form.dispatch('submit');
    assert.deepEqual(titles(panel), ['Existing', 'New task']);
    assert.equal(input.value, '');
    assert.equal(alert.hidden, true);
    filter.value = 'Open';
    await filter.dispatch('change');
    assert.deepEqual(titles(panel), ['New task']);
    let checkbox = taskRows(panel)[0].children[0];
    assert.equal(checkbox.attributes['aria-label'], 'Complete New task');
    assert.equal(checkbox.checked, false);
    checkbox.checked = true;
    await checkbox.dispatch('change');
    assert.deepEqual(titles(panel), []);
    assert.equal(stored[1].completed, true);
    filter.value = 'Completed';
    await filter.dispatch('change');
    assert.deepEqual(titles(panel), ['Existing', 'New task']);
    checkbox = taskRows(panel)[1].children[0];
    checkbox.checked = false;
    await checkbox.dispatch('change');
    assert.deepEqual(titles(panel), ['Existing']);
    filter.value = 'All';
    await filter.dispatch('change');
    assert.deepEqual(titles(panel), ['Existing', 'New task']);
    failSave = true;
    checkbox = taskRows(panel)[1].children[0];
    checkbox.checked = true;
    await checkbox.dispatch('change');
    assert.equal(checkbox.checked, false);
    assert.equal(checkbox.disabled, false);
    assert.match(alert.textContent, /Save failed/);
    assert.ok(calls.every((call) => call.path.startsWith('/api/projects/7/tasks')));
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
