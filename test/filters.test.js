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
  for (const task of tasks) task.due_date = '';
  const project = { id: 1, name: 'Project', archived, default_priority: 'Normal' };
  const context = vm.createContext({
    document: { querySelector: () => app, createElement: tag => new Element(tag) },
    location: { pathname: '/projects/1' },
    fetch: async (path, options) => {
      let data;
      if (options) {
        const input = JSON.parse(options.body);
        if (path === '/api/projects/1') {
          Object.assign(project, input);
          data = project;
        } else if (path.endsWith('/tasks')) {
          data = { id: tasks.length + 1, ...input, completed: false, priority: project.default_priority, due_date: '' };
          tasks.push(data);
        } else {
          const task = tasks.find(task => task.id === Number(path.split('/').at(-1)));
          Object.assign(task, input);
          data = task;
        }
      } else data = path.endsWith('/tasks') ? tasks : project;
      return { ok: true, json: async () => structuredClone(data) };
    },
  });
  vm.runInContext(await readFile(new URL('../public/app.js', import.meta.url), 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  const byId = id => descendants(app).find(node => node.id === id);
  const rows = () => descendants(app).filter(node => node.dataset.testid === 'task-row');
  const titles = () => rows().map(row => row.children[0].textContent);
  return { app, tasks, project, byId, rows, titles };
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

test('project default changes preserve filters and existing tasks; creation inherits the default', async () => {
  const { app, tasks, project, byId, titles } = await page();
  const defaults = byId('default-task-priority');
  assert.equal(defaults.value, 'Normal');
  assert.deepEqual(defaults.children.map(option => option.textContent), ['Low', 'Normal', 'High']);
  assert.ok(!defaults.disabled);
  const completion = byId('task-filter');
  const priority = byId('priority-filter');
  completion.value = 'Open';
  await completion.fire('change');
  priority.value = 'High';
  await priority.fire('change');
  const originalTasks = structuredClone(tasks);
  defaults.value = 'High';
  await defaults.fire('change');
  assert.equal(project.default_priority, 'High');
  assert.deepEqual(tasks, originalTasks);
  assert.deepEqual(titles(), ['Third']);
  assert.equal(completion.value, 'Open');
  assert.equal(priority.value, 'High');
  const input = byId('task-title');
  input.value = 'Inherited';
  const form = descendants(app).find(node => node.tag === 'form' && node.children.includes(input));
  await form.fire('submit');
  assert.deepEqual(titles(), ['Third', 'Inherited']);
  assert.equal(tasks.at(-1).priority, 'High');
  defaults.value = 'Low';
  await defaults.fire('change');
  assert.equal(tasks.at(-1).priority, 'High');
  assert.deepEqual(titles(), ['Third', 'Inherited']);
  assert.equal(completion.value, 'Open');
  assert.equal(priority.value, 'High');
});

test('due date saves and clears preserve both filters and other task data', async () => {
  const { tasks, byId, rows, titles } = await page();
  const completion = byId('task-filter');
  const priority = byId('priority-filter');
  completion.value = 'Open';
  await completion.fire('change');
  priority.value = 'High';
  await priority.fire('change');
  const before = structuredClone(tasks);
  const input = byId('task-due-date-3');
  assert.equal(input.type, 'text');
  assert.equal(input.value, '');
  const form = rows()[0].children.find(node => node.tag === 'form' && node.children.includes(input));
  assert.equal(form.children[0].textContent, 'Task due date');
  assert.equal(form.children[2].textContent, 'Save due date');
  input.value = '2024-02-29';
  await form.fire('submit');
  assert.deepEqual(tasks, before.map(task => task.id === 3 ? { ...task, due_date: '2024-02-29' } : task));
  assert.deepEqual(titles(), ['Third']);
  assert.equal(completion.value, 'Open');
  assert.equal(priority.value, 'High');
  const renameForm = rows()[0].children.find(node => node.tag === 'form');
  renameForm.children[1].value = 'Renamed with date';
  await renameForm.fire('submit');
  assert.equal(tasks[2].due_date, '2024-02-29');
  assert.equal(input.value, '2024-02-29');
  input.value = '';
  await form.fire('submit');
  assert.equal(tasks[2].due_date, '');
  assert.equal(completion.value, 'Open');
  assert.equal(priority.value, 'High');
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
  assert.equal(byId('default-task-priority').disabled, true);
  assert.equal(byId('default-task-priority').value, 'Normal');
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
