import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Small DOM adapter executes the actual browser script without dependencies.
class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.listeners = {};
    this.value = '';
  }
  append(...nodes) {
    this.children.push(...nodes);
    if (this.tag === 'select' && !this.value) this.value = this.children[0].value;
  }
  prepend(...nodes) { this.children.unshift(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  focus() {}
  async fire(name) { await this.listeners[name]({ preventDefault() {} }); }
}
const descendants = node => [node, ...node.children.flatMap(descendants)];

async function page(archived = false) {
  const app = new Element('main');
  const tasks = [
    { id: 1, title: 'First', completed: false, priority: 'Low' },
    { id: 2, title: 'Second', completed: true, priority: 'High' },
    { id: 3, title: 'Third', completed: false, priority: 'High' },
    { id: 4, title: 'Fourth', completed: true, priority: 'Normal' },
  ];
  const context = vm.createContext({
    document: { querySelector: () => app, createElement: tag => new Element(tag) },
    location: { pathname: '/projects/1' },
    fetch: async (path, options) => {
      let data;
      if (options) {
        const task = tasks.find(task => task.id === Number(path.split('/').at(-1)));
        Object.assign(task, JSON.parse(options.body));
        data = task;
      } else data = path.endsWith('/tasks') ? tasks : { id: 1, name: 'Project', archived };
      return { ok: true, json: async () => structuredClone(data) };
    },
  });
  vm.runInContext(await readFile(new URL('../public/app.js', import.meta.url), 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  const byId = id => descendants(app).find(node => node.id === id);
  const rows = () => descendants(app).filter(node => node.dataset.testid === 'task-row');
  const titles = () => rows().map(row => row.children[0].textContent);
  return { app, tasks, byId, rows, titles };
}

test('combined filters retain selections, creation order, and re-evaluate edits', async () => {
  const { app, tasks, byId, rows, titles } = await page();
  const completion = byId('task-filter');
  const priority = byId('priority-filter');
  assert.equal(completion.value, 'All');
  assert.equal(priority.value, 'All');
  assert.deepEqual(priority.children.map(option => option.textContent), ['All', 'Low', 'Normal', 'High']);
  for (const status of ['All', 'Open', 'Completed']) {
    completion.value = status;
    await completion.fire('change');
    for (const level of ['All', 'Low', 'Normal', 'High']) {
      priority.value = level;
      await priority.fire('change');
      assert.equal(completion.value, status);
      assert.deepEqual(titles(), tasks.filter(task =>
        (status === 'All' || task.completed === (status === 'Completed')) &&
        (level === 'All' || task.priority === level)).map(task => task.title));
    }
  }
  completion.value = 'Open';
  await completion.fire('change');
  assert.equal(priority.value, 'High');
  const renameForm = rows()[0].children.find(node => node.tag === 'form');
  renameForm.children[1].value = '  Renamed  ';
  await renameForm.fire('submit');
  assert.deepEqual(titles(), ['Renamed']);
  assert.equal(rows()[0].children[1].attributes['aria-label'], 'Complete Renamed');
  assert.equal(completion.value, 'Open');
  assert.equal(priority.value, 'High');
  const taskPriority = byId('task-priority-3');
  taskPriority.value = 'Low';
  await taskPriority.fire('change');
  assert.deepEqual(titles(), []);
  assert.equal(priority.value, 'High');
  priority.value = 'Low';
  await priority.fire('change');
  assert.deepEqual(titles(), ['First', 'Renamed']);
  const checkbox = rows()[0].children[1];
  checkbox.checked = true;
  await checkbox.fire('change');
  assert.deepEqual(titles(), ['Renamed']);
  assert.equal(completion.value, 'Open');
  assert.equal(priority.value, 'Low');
  assert.equal(tasks[0].completed, true);
  assert.equal(tasks[2].priority, 'Low');
  assert.ok(descendants(app).every(node => node.attributes.role !== 'alert' || node.hidden));
});

test('archived projects keep both filters usable and all task edits disabled', async () => {
  const { byId, rows, titles } = await page(true);
  for (const row of rows()) {
    for (const node of descendants(row).filter(node => ['input', 'button', 'select'].includes(node.tag))) {
      assert.equal(node.disabled, true);
    }
  }
  const completion = byId('task-filter');
  const priority = byId('priority-filter');
  assert.ok(!completion.disabled && !priority.disabled);
  completion.value = 'Completed';
  await completion.fire('change');
  priority.value = 'High';
  await priority.fire('change');
  assert.deepEqual(titles(), ['Second']);
  assert.equal(completion.value, 'Completed');
  assert.equal(priority.value, 'High');
  const reopened = await page();
  assert.equal(reopened.byId('priority-filter').value, 'All');
});
