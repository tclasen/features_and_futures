import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

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
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  async fire(name) { await this.listeners[name]({ preventDefault() {} }); }
  focus() {}
  get value() { return this._value ?? (this.tag === 'select' ? this.children[0]?.textContent : '') ?? ''; }
  set value(value) { this._value = value; }
  querySelector(selector) {
    for (const child of this.children) {
      if (selector.startsWith('#') ? child.id === selector.slice(1) : child.tag === selector) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
  set innerHTML(html) {
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

async function fixture(archived = false) {
  const app = new Element('main');
  const tasks = [
    { id: 1, title: 'First', completed: false, priority: 'High' },
    { id: 2, title: 'Second', completed: true, priority: 'Normal' },
    { id: 3, title: 'Third', completed: true, priority: 'High' },
    { id: 4, title: 'Fourth', completed: false, priority: 'Low' },
  ];
  const requests = [];
  const project = { id: 1, archived, default_priority: 'Normal' };
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const context = {
    document: { querySelector: () => app, createElement: tag => new Element(tag) },
    fetch: async (path, options) => {
      if (!options) return { ok: true, json: async () => structuredClone(tasks) };
      requests.push(options);
      if (path === '/api/projects/1') {
        Object.assign(project, JSON.parse(options.body));
        return { ok: true, json: async () => structuredClone(project) };
      }
      if (options.method === 'POST') {
        const task = { id: tasks.length + 1, ...JSON.parse(options.body), completed: false, priority: project.default_priority };
        tasks.push(task);
        return { ok: true, json: async () => structuredClone(task) };
      }
      const task = tasks.find(item => item.id === Number(path.split('/').at(-1)));
      Object.assign(task, JSON.parse(options.body));
      return { ok: true, json: async () => structuredClone(task) };
    },
  };
  runInNewContext(source.slice(0, source.lastIndexOf('\nrender().catch')) + '\nthis.renderTasks = renderTasks;', context);
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
  }
  await choose(f.priority, 'High');
  await choose(f.completion, 'Completed');
  assert.deepEqual(f.titles(), ['Third']);
  assert.equal(f.requests.length, 0);
  assert.equal((await fixture()).priority.value, 'All');
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
