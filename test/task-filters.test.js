import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// Minimal DOM harness: executes the actual browser code and its event handlers.
class Node {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.value = '';
    this.textContent = '';
    this.disabled = false;
  }
  setAttribute(key, value) {
    this.attributes[key] = value;
    if (key === 'id') this.id = value;
    if (key === 'value') this.value = value;
  }
  append(...nodes) {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
      if (this.tag === 'select' && this.children.length === 1) this.value = node.value;
    }
  }
  replaceChildren() { this.children = []; }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  async fire(type) { await this.listeners[type]?.({ preventDefault() {} }); }
  remove() { this.parent.children = this.parent.children.filter(node => node !== this); }
  focus() {}
  all() { return this.children.flatMap(node => [node, ...node.all()]); }
  querySelector() { return this.all().find(node => node.attributes.role === 'alert'); }
}

async function page(archived = false) {
  const app = new Node('main');
  const project = { id: 1, name: 'Project', archived };
  const tasks = [
    { id: 1, title: 'First', completed: false, priority: 'High' },
    { id: 2, title: 'Second', completed: true, priority: 'Low' },
    { id: 3, title: 'Third', completed: false, priority: 'Normal' },
    { id: 4, title: 'Fourth', completed: true, priority: 'High' },
  ];
  const writes = [];
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  runInNewContext(source.replace(/render\(\);\s*$/, 'globalThis.ready = render();'), {
    document: { querySelector: () => app, createElement: tag => new Node(tag) },
    window: { location: { pathname: '/projects/1' } },
    fetch: async (path, options) => {
      let data;
      if (options) {
        const task = tasks.find(item => item.id === Number(path.split('/').at(-1)));
        const patch = JSON.parse(options.body);
        writes.push(patch);
        Object.assign(task, patch);
        data = task;
      } else data = path.endsWith('/tasks') ? tasks : project;
      return { ok: true, json: async () => structuredClone(data) };
    },
    get ready() { return undefined; },
    set ready(promise) { app.ready = promise; },
  });
  await app.ready;
  return {
    app, writes, tasks,
    control: id => app.all().find(node => node.id === id),
    rows: () => app.all().filter(node => node.attributes['data-testid'] === 'task-row'),
    titles: () => app.all().filter(node => node.attributes['data-testid'] === 'task-row').map(row => row.children[1].textContent),
  };
}

test('combined filters preserve selections, order, and re-evaluate task edits', async () => {
  const ui = await page();
  const completion = ui.control('task-filter');
  const priority = ui.control('priority-filter');
  assert.deepEqual(priority.children.map(option => option.textContent), ['All', 'Low', 'Normal', 'High']);
  assert.equal(priority.value, 'All');
  const original = structuredClone(ui.tasks);
  for (const state of ['All', 'Open', 'Completed']) {
    completion.value = state;
    await completion.fire('change');
    for (const level of ['All', 'Low', 'Normal', 'High']) {
      priority.value = level;
      await priority.fire('change');
      assert.equal(completion.value, state);
      assert.deepEqual(ui.titles(), original.filter(task =>
        (state === 'All' || task.completed === (state === 'Completed')) &&
        (level === 'All' || task.priority === level)).map(task => task.title));
    }
  }
  assert.deepEqual(ui.tasks, original);
  assert.deepEqual(ui.writes, []);
  completion.value = 'Open';
  await completion.fire('change');
  assert.equal(priority.value, 'High');
  assert.deepEqual(ui.titles(), ['First']);
  const rename = ui.control('new-task-title-1');
  rename.value = ' Renamed ';
  await rename.parent.fire('submit');
  assert.deepEqual(ui.titles(), ['Renamed']);
  assert.equal(ui.rows()[0].children[0].attributes['aria-label'], 'Complete Renamed');
  assert.equal(completion.value, 'Open');
  assert.equal(priority.value, 'High');
  const selector = ui.control('task-priority-1');
  selector.value = 'Low';
  await selector.fire('change');
  assert.deepEqual(ui.titles(), []);
  assert.equal(completion.value, 'Open');
  assert.equal(priority.value, 'High');
  priority.value = 'Low';
  await priority.fire('change');
  assert.deepEqual(ui.titles(), ['Renamed']);
  const checkbox = ui.rows()[0].children[0];
  checkbox.checked = true;
  await checkbox.fire('change');
  assert.deepEqual(ui.titles(), []);
  assert.equal(completion.value, 'Open');
  assert.equal(priority.value, 'Low');
  completion.value = 'Completed';
  await completion.fire('change');
  assert.deepEqual(ui.titles(), ['Renamed', 'Second']);
  assert.deepEqual(ui.writes, [{ title: 'Renamed' }, { priority: 'Low' }, { completed: true }]);
});

test('archived projects keep both filters usable and editing controls disabled', async () => {
  const ui = await page(true);
  const completion = ui.control('task-filter');
  const priority = ui.control('priority-filter');
  assert.equal(completion.disabled, false);
  assert.equal(priority.disabled, false);
  completion.value = 'Completed';
  await completion.fire('change');
  priority.value = 'High';
  await priority.fire('change');
  assert.deepEqual(ui.titles(), ['Fourth']);
  const row = ui.rows()[0];
  for (const node of [row, ...row.all()].filter(node => ['input', 'button', 'select'].includes(node.tag))) {
    assert.equal(node.disabled, true);
  }
  assert.deepEqual(ui.writes, []);
});
