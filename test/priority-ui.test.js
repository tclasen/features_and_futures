import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Minimal DOM surface for testing task controls without browser dependencies.
class Element {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.listeners = {};
    this.attributes = {};
    this.dataset = {};
    this.value = '';
  }
  append(...children) {
    this.children.push(...children);
    if (this.tagName === 'select' && !this.value && children.length) {
      this.value = children[0].value;
    }
  }
  focus() {}
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  querySelector() { return null; }
}

async function setup(fetch) {
  const app = new Element('main');
  const context = vm.createContext({
    document: {
      querySelector: () => app,
      createElement: tag => new Element(tag),
    },
    location: { pathname: '/' },
    fetch,
  });
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  vm.runInContext(`${source}\nglobalThis.priorityControl = taskPriorityControl;\nglobalThis.renderTasks = renderTasks;`, context);
  // Let the initial project-list render finish before exercising project controls.
  await new Promise(resolve => setImmediate(resolve));
  app.replaceChildren();
  return { control: context.priorityControl, renderTasks: context.renderTasks, app };
}

test('priority UI labels options, saves changes, and rolls back failed changes', async () => {
  const requests = [];
  let fail = false;
  const { control } = await setup(async (path, options) => {
    if (!options) return { ok: true, json: async () => [] };
    requests.push({ path, body: JSON.parse(options.body), method: options.method });
    return {
      ok: !fail,
      json: async () => fail ? { error: 'Unable to save' } : { priority: JSON.parse(options.body).priority },
    };
  });
  const task = { id: 7, title: 'Keep title', completed: true, priority: 'Normal' };
  let changes = 0;
  const [label, select] = control({ archived: false }, task, '/api/projects/2/tasks', () => changes++).children;
  assert.equal(label.textContent, 'Task priority');
  assert.equal(label.htmlFor, select.id);
  assert.deepEqual(Array.from(select.children, option => option.textContent), ['Low', 'Normal', 'High']);
  assert.equal(select.value, 'Normal');
  assert.equal(select.disabled, false);
  select.value = 'High';
  await select.listeners.change();
  assert.deepEqual(requests, [{ path: '/api/projects/2/tasks/7', body: { priority: 'High' }, method: 'PATCH' }]);
  assert.deepEqual(task, { id: 7, title: 'Keep title', completed: true, priority: 'High' });
  assert.equal(select.value, 'High');
  assert.equal(select.disabled, false);
  fail = true;
  select.value = 'Low';
  await select.listeners.change();
  assert.equal(task.priority, 'High');
  assert.equal(changes, 1);
  assert.equal(select.value, 'High');
  assert.equal(select.disabled, false);
});

test('archived priority controls are disabled and restoration keeps their value', async () => {
  const { control } = await setup(async () => ({ ok: true, json: async () => [] }));
  const task = { id: 3, priority: 'Low' };
  const archived = control({ archived: true }, task, '/api/projects/1/tasks').children[1];
  assert.equal(archived.disabled, true);
  assert.equal(archived.value, 'Low');
  const restored = control({ archived: false }, task, '/api/projects/1/tasks').children[1];
  assert.equal(restored.disabled, false);
  assert.equal(restored.value, 'Low');
});

function descendants(node) {
  return node.children.flatMap(child => [child, ...descendants(child)]);
}

async function projectUI(archived = false) {
  const tasks = [
    { id: 1, title: 'High open', priority: 'High', completed: false },
    { id: 2, title: 'Low done', priority: 'Low', completed: true },
    { id: 3, title: 'Normal open', priority: 'Normal', completed: false },
    { id: 4, title: 'High done', priority: 'High', completed: true },
    { id: 5, title: 'Low open', priority: 'Low', completed: false },
    { id: 6, title: 'Normal done', priority: 'Normal', completed: true },
  ];
  const requests = [];
  const { app, renderTasks } = await setup(async (path, options) => {
    let body = [];
    if (path.endsWith('/tasks')) body = tasks;
    if (options) {
      const changes = JSON.parse(options.body);
      requests.push({ path, changes });
      body = { ...tasks.find(task => path.endsWith(`/${task.id}`)), ...changes };
    }
    return { ok: true, json: async () => body };
  });
  await renderTasks({ id: 1, archived });
  const nodes = () => descendants(app);
  const byId = id => nodes().find(node => node.id === id);
  const rows = () => nodes().filter(node => node.dataset.testid === 'task-row');
  const titles = () => rows().map(row => row.children[0].textContent);
  const change = async (id, value) => {
    const control = byId(id);
    control.value = value;
    await control.listeners.change();
  };
  return { app, tasks, requests, nodes, byId, rows, titles, change };
}

test('priority and completion filters intersect in creation order without changing data', async () => {
  const ui = await projectUI();
  const original = JSON.stringify(ui.tasks);
  assert.equal(ui.byId('task-filter').value, 'All');
  assert.equal(ui.byId('priority-filter').value, 'All');
  assert.equal(ui.nodes().find(node => node.htmlFor === 'priority-filter').textContent, 'Priority filter');
  assert.deepEqual(Array.from(ui.byId('priority-filter').children, option => option.textContent),
    ['All', 'Low', 'Normal', 'High']);
  for (const completion of ['All', 'Open', 'Completed']) {
    await ui.change('task-filter', completion);
    for (const priority of ['All', 'Low', 'Normal', 'High']) {
      await ui.change('priority-filter', priority);
      assert.equal(ui.byId('task-filter').value, completion);
      assert.deepEqual(ui.titles(), ui.tasks.filter(task =>
        (completion === 'All' || task.completed === (completion === 'Completed')) &&
        (priority === 'All' || task.priority === priority)).map(task => task.title));
    }
  }
  await ui.change('task-filter', 'Open');
  assert.equal(ui.byId('priority-filter').value, 'High');
  assert.equal(JSON.stringify(ui.tasks), original);
  assert.equal(ui.requests.length, 0);
});

test('task edits reapply both filters while retaining their selected values', async () => {
  const ui = await projectUI();
  await ui.change('task-filter', 'Open');
  await ui.change('priority-filter', 'High');
  const renameForm = ui.rows()[0].children.find(node => node.tagName === 'form');
  renameForm.children[1].value = 'Renamed high';
  await renameForm.listeners.submit({ preventDefault() {} });
  assert.deepEqual(ui.titles(), ['Renamed high']);
  assert.equal(ui.rows()[0].children[1].attributes['aria-label'], 'Complete Renamed high');
  assert.equal(ui.tasks[0].priority, 'High');
  assert.equal(ui.tasks[0].completed, false);
  await ui.change('task-priority-1', 'Low');
  assert.deepEqual(ui.titles(), []);
  assert.equal(ui.byId('task-filter').value, 'Open');
  assert.equal(ui.byId('priority-filter').value, 'High');
  await ui.change('priority-filter', 'Low');
  assert.deepEqual(ui.titles(), ['Renamed high', 'Low open']);
  const checkbox = ui.rows()[0].children[1];
  checkbox.checked = true;
  await checkbox.listeners.change();
  assert.deepEqual(ui.titles(), ['Low open']);
  assert.equal(ui.byId('task-filter').value, 'Open');
  assert.equal(ui.byId('priority-filter').value, 'Low');
  await ui.change('task-filter', 'Completed');
  assert.deepEqual(ui.titles(), ['Renamed high', 'Low done']);
  assert.equal(ui.tasks[0].completed, true);
  assert.equal(ui.tasks[0].priority, 'Low');
  assert.equal(ui.requests.length, 3);
});

test('archived projects keep both filters usable and task editing disabled', async () => {
  const ui = await projectUI(true);
  const original = JSON.stringify(ui.tasks);
  assert.notEqual(ui.byId('task-filter').disabled, true);
  assert.notEqual(ui.byId('priority-filter').disabled, true);
  await ui.change('task-filter', 'Completed');
  await ui.change('priority-filter', 'Normal');
  assert.deepEqual(ui.titles(), ['Normal done']);
  const controls = descendants(ui.rows()[0]).filter(node =>
    ['input', 'button', 'select'].includes(node.tagName));
  assert.equal(controls.length, 4);
  assert.ok(controls.every(control => control.disabled));
  assert.equal(JSON.stringify(ui.tasks), original);
  assert.equal(ui.requests.length, 0);
});
