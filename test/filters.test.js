import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// A small DOM surface runs the shipped UI and its event handlers without dependencies.
class Node {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.disabled = false;
  }
  setAttribute(key, value) { this.attributes[key] = value; }
  get id() { return this.attributes.id; }
  get value() { return this.selectedValue ?? (this.tag === 'select' ? this.children[0]?.value : this.attributes.value) ?? ''; }
  set value(value) { this.selectedValue = value; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  focus() {}
  addEventListener(type, handler) { this.listeners[type] = handler; }
  async fire(type) { await this.listeners[type]({ preventDefault() {} }); }
  find(predicate) {
    if (predicate(this)) return this;
    for (const child of this.children) {
      const match = child.find(predicate);
      if (match) return match;
    }
  }
  querySelector(selector) {
    if (selector === '[role="alert"]') return this.find(node => node.attributes.role === 'alert');
    throw new Error(`Unsupported test selector: ${selector}`);
  }
}

async function projectPage(archived = false, defaultPriority = 'Normal') {
  const app = new Node('main');
  const tasks = ['Low', 'Normal', 'High'].flatMap((priority, index) => [
    { id: index * 2 + 1, title: `${priority} open`, priority, completed: false },
    { id: index * 2 + 2, title: `${priority} completed`, priority, completed: true },
  ]);
  const mutations = [];
  const project = { id: 1, name: 'Example', archived: Number(archived), default_priority: defaultPriority, total: 6, completed: 3 };
  const document = {
    querySelector: () => app,
    createElement: tag => new Node(tag),
    getElementById: id => app.find(node => node.id === id),
  };
  runInNewContext(await readFile(new URL('../public/app.js', import.meta.url), 'utf8'), {
    document,
    window: { location: { pathname: '/projects/1' } },
    fetch: async (path, options) => {
      let data;
      if (options?.method === 'PATCH') {
        assert.equal(archived, false);
        const task = path === '/api/projects/1' ? project : tasks.find(task => task.id === Number(path.split('/').at(-1)));
        const changes = JSON.parse(options.body);
        mutations.push(changes);
        Object.assign(task, changes);
        data = task;
      } else if (options?.method === 'POST') {
        assert.equal(archived, false);
        data = { id: tasks.length + 1, title: JSON.parse(options.body).title, completed: false, priority: project.default_priority };
        tasks.push(data);
      } else if (path.endsWith('/tasks')) {
        data = tasks;
      } else {
        data = project;
      }
      return { ok: true, json: async () => JSON.parse(JSON.stringify(data)) };
    },
  });
  // Finish initial asynchronous project and task fetches.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.attributes['aria-busy'], 'false');
  const byId = id => document.getElementById(id);
  const list = app.find(node => node.attributes['aria-label'] === 'Tasks');
  const rows = () => list.children;
  const titles = () => rows().map(row => row.children.find(node => node.tag === 'span').textContent);
  const change = async (id, value) => {
    const control = byId(id);
    control.value = value;
    await control.fire('change');
  };
  return { app, project, tasks, mutations, byId, rows, titles, change };
}

test('both task filters intersect in creation order and remain independent on active and archived pages', async () => {
  for (const archived of [false, true]) {
    const page = await projectPage(archived);
    const original = structuredClone(page.tasks);
    assert.deepEqual(page.byId('priority-filter').children.map(option => option.value), ['All', 'Low', 'Normal', 'High']);
    assert.equal(page.byId('priority-filter').value, 'All');
    assert.equal(page.byId('task-filter').value, 'All');
    assert.equal(page.byId('priority-filter').disabled, false);
    assert.equal(page.byId('task-filter').disabled, false);
    for (const completion of ['All', 'Open', 'Completed']) {
      const previousPriority = page.byId('priority-filter').value;
      await page.change('task-filter', completion);
      assert.equal(page.byId('priority-filter').value, previousPriority);
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        await page.change('priority-filter', priority);
        assert.equal(page.byId('task-filter').value, completion);
        assert.deepEqual(page.titles(), page.tasks.filter(task =>
          (priority === 'All' || task.priority === priority) &&
          (completion === 'All' || task.completed === (completion === 'Completed'))
        ).map(task => task.title));
        for (const row of page.rows()) {
          assert.equal(row.attributes['data-testid'], 'task-row');
          assert.equal(row.children[0].disabled, archived);
          const select = row.find(node => node.tag === 'select');
          assert.equal(select.disabled, archived);
          const rename = row.find(node => node.tag === 'form');
          assert.equal(rename.find(node => node.tag === 'input').disabled, archived);
          assert.equal(rename.find(node => node.tag === 'button').disabled, archived);
        }
      }
      assert.equal(page.byId('priority-filter').value, 'High');
    }
    assert.deepEqual(page.tasks, original);
    assert.deepEqual(page.mutations, []);
  }
});

test('priority, completion, and rename edits refresh matching rows without resetting filters', async () => {
  const page = await projectPage();
  await page.change('task-filter', 'Open');
  await page.change('priority-filter', 'High');
  assert.deepEqual(page.titles(), ['High open']);
  await page.change('task-priority-5', 'Low');
  assert.deepEqual(page.titles(), []);
  assert.equal(page.tasks[4].priority, 'Low');
  assert.equal(page.byId('task-filter').value, 'Open');
  assert.equal(page.byId('priority-filter').value, 'High');
  await page.change('priority-filter', 'Low');
  assert.deepEqual(page.titles(), ['Low open', 'High open']);
  const renameInput = page.byId('new-task-title-5');
  renameInput.value = '  Renamed task  ';
  await page.rows()[1].find(node => node.tag === 'form').fire('submit');
  assert.deepEqual(page.titles(), ['Low open', 'Renamed task']);
  assert.equal(page.rows()[1].children[0].attributes['aria-label'], 'Complete Renamed task');
  assert.equal(page.byId('task-filter').value, 'Open');
  assert.equal(page.byId('priority-filter').value, 'Low');
  assert.equal(page.tasks[4].completed, false);
  assert.equal(page.tasks[4].priority, 'Low');
  const checkbox = page.rows()[1].children[0];
  checkbox.checked = true;
  await checkbox.fire('change');
  assert.deepEqual(page.titles(), ['Low open']);
  assert.equal(page.byId('task-filter').value, 'Open');
  assert.equal(page.byId('priority-filter').value, 'Low');
  await page.change('task-filter', 'Completed');
  assert.deepEqual(page.titles(), ['Low completed', 'Renamed task']);
  assert.equal(page.byId('priority-filter').value, 'Low');
  const completed = page.rows()[1].children[0];
  completed.checked = false;
  await completed.fire('change');
  assert.deepEqual(page.titles(), ['Low completed']);
  assert.equal(page.byId('task-filter').value, 'Completed');
  assert.equal(page.byId('priority-filter').value, 'Low');
  assert.deepEqual(page.mutations, [
    { priority: 'Low' }, { title: 'Renamed task' }, { completed: true }, { completed: false },
  ]);
});


test('default changes preserve both filters and existing tasks, and new tasks inherit the saved default', async () => {
  const page = await projectPage();
  const select = page.byId('default-task-priority');
  assert.deepEqual(select.children.map(option => option.value), ['Low', 'Normal', 'High']);
  assert.equal(select.value, 'Normal');
  assert.equal(select.disabled, false);
  const label = page.app.find(node => node.attributes.for === select.id);
  assert.equal(label.textContent, 'Default task priority');
  await page.change('task-filter', 'Open');
  await page.change('priority-filter', 'High');
  const original = structuredClone(page.tasks);
  await page.change('default-task-priority', 'High');
  assert.equal(page.project.default_priority, 'High');
  assert.equal(page.byId('task-filter').value, 'Open');
  assert.equal(page.byId('priority-filter').value, 'High');
  assert.deepEqual(page.tasks, original);
  assert.deepEqual(page.titles(), ['High open']);
  assert.equal(page.project.total, 6);
  assert.equal(page.project.completed, 3);
  page.byId('task-title').value = '  Inherited high  ';
  const form = page.app.find(node => node.tag === 'form' && node.find(child => child.id === 'task-title'));
  await form.fire('submit');
  assert.deepEqual(page.titles(), ['High open', 'Inherited high']);
  assert.equal(page.tasks.at(-1).priority, 'High');
  await page.change('default-task-priority', 'Low');
  assert.equal(page.tasks.at(-1).priority, 'High');
  assert.deepEqual(page.titles(), ['High open', 'Inherited high']);
  assert.equal(page.byId('task-filter').value, 'Open');
  assert.equal(page.byId('priority-filter').value, 'High');
  const archived = await projectPage(true, 'High');
  assert.equal(archived.byId('default-task-priority').disabled, true);
  assert.equal(archived.byId('default-task-priority').value, 'High');
});
