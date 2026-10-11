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

for (const archived of [false, true]) {
  test(`combined task filters: ${archived ? 'archived' : 'active'} project`, async () => {
    const app = new Node('main');
    const tasks = ['Low', 'Normal', 'High'].flatMap((priority, index) => [
      { id: index * 2 + 1, title: `${priority} open`, completed: false, priority },
      { id: index * 2 + 2, title: `${priority} done`, completed: true, priority },
    ]);
    const originalTasks = structuredClone(tasks);
    let writes = 0;
    const project = { id: 1, name: 'Example', archived, defaultTaskPriority: 'Normal' };
    let failDefault = false;
    runInNewContext(source, {
      document: { querySelector: () => app, createElement: (tag) => new Node(tag) },
      location: { pathname: '/projects/1', assign() {} },
      async fetch(path, options) {
        let data;
        if (path === '/api/projects/1') {
          if (options) {
            assert.equal(archived, false);
            if (failDefault) return { ok: false, json: async () => ({ error: 'Unable to save default' }) };
            Object.assign(project, JSON.parse(options.body));
          }
          data = { ...project };
        }
        else if (!options) data = tasks.map((task) => ({ ...task }));
        else {
          assert.equal(archived, false);
          writes++;
          const task = tasks.find((task) => path.endsWith(`/${task.id}`));
          Object.assign(task, JSON.parse(options.body));
          data = { ...task };
        }
        return { ok: true, json: async () => data };
      },
    });
    await new Promise((resolve) => setImmediate(resolve));
    const filters = app.children.find((node) => node.className === 'task-filter');
    const completion = filters.children[1];
    const priority = filters.children[3];
    const list = app.querySelector('ul');
    const titles = () => list.children.map((row) => row.children[1].textContent);
    assert.equal(filters.children[2].textContent, 'Priority filter');
    assert.equal(filters.children[2].htmlFor, priority.id);
    assert.equal(completion.value, 'All');
    assert.equal(priority.value, 'All');
    assert.deepEqual(priority.children.map((option) => option.textContent), ['All', 'Low', 'Normal', 'High']);
    assert.ok(!completion.disabled && !priority.disabled);
    // All twelve intersections preserve creation order and never write data.
    for (const completionValue of ['All', 'Open', 'Completed']) {
      completion.value = completionValue;
      await completion.fire('change');
      for (const priorityValue of ['All', 'Low', 'Normal', 'High']) {
        priority.value = priorityValue;
        await priority.fire('change');
        assert.equal(completion.value, completionValue);
        assert.deepEqual(titles(), tasks.filter((task) =>
          (completionValue === 'All' || task.completed === (completionValue === 'Completed'))
          && (priorityValue === 'All' || task.priority === priorityValue)).map((task) => task.title));
      }
      assert.equal(priority.value, 'High');
    }
    assert.equal(writes, 0);
    assert.deepEqual(tasks, originalTasks);
    const defaults = app.children.find((node) => node.children[0]?.textContent === 'Default task priority');
    const defaultSelect = defaults.children[1];
    assert.equal(defaults.children[0].htmlFor, defaultSelect.id);
    assert.deepEqual(defaultSelect.children.map((option) => option.textContent), ['Low', 'Normal', 'High']);
    assert.equal(defaultSelect.value, 'Normal');
    assert.equal(defaultSelect.disabled, archived);
    const visibleBeforeDefault = titles();
    if (archived) {
      await defaultSelect.fire('change');
      assert.equal(project.defaultTaskPriority, 'Normal');
    } else {
      defaultSelect.value = 'High';
      await defaultSelect.fire('change');
      assert.equal(project.defaultTaskPriority, 'High');
      assert.equal(defaultSelect.value, 'High');
      assert.equal(defaultSelect.disabled, false);
      failDefault = true;
      defaultSelect.value = 'Low';
      await defaultSelect.fire('change');
      assert.equal(defaultSelect.value, 'High');
      assert.equal(app.querySelector('[role="alert"]').textContent, 'Unable to save default');
    }
    assert.equal(completion.value, 'Completed');
    assert.equal(priority.value, 'High');
    assert.deepEqual(titles(), visibleBeforeDefault);
    assert.deepEqual(tasks, originalTasks);
    if (archived) {
      assert.equal(list.children.length, 1);
      const row = list.children[0];
      assert.equal(row.children[0].disabled, true);
      assert.equal(row.children[2].children[1].disabled, true);
      assert.equal(row.children[2].children[2].disabled, true);
      assert.equal(row.children[4].disabled, true);
      return;
    }
    completion.value = 'Open';
    await completion.fire('change');
    assert.equal(priority.value, 'High');
    const rename = list.children[0].children[2];
    rename.children[1].value = '  Renamed high  ';
    await rename.fire('submit');
    assert.deepEqual(titles(), ['Renamed high']);
    assert.equal(completion.value, 'Open');
    assert.equal(priority.value, 'High');
    assert.equal(list.children[0].children[0].attributes['aria-label'], 'Complete Renamed high');
    assert.equal(list.children[0].children[4].value, 'High');
    const taskPriority = list.children[0].children[4];
    taskPriority.value = 'Low';
    await taskPriority.fire('change');
    assert.deepEqual(titles(), []);
    assert.equal(completion.value, 'Open');
    assert.equal(priority.value, 'High');
    priority.value = 'Low';
    await priority.fire('change');
    assert.deepEqual(titles(), ['Low open', 'Renamed high']);
    const checkbox = list.children[1].children[0];
    checkbox.checked = true;
    await checkbox.fire('change');
    assert.deepEqual(titles(), ['Low open']);
    assert.equal(completion.value, 'Open');
    assert.equal(priority.value, 'Low');
    completion.value = 'Completed';
    await completion.fire('change');
    assert.deepEqual(titles(), ['Low done', 'Renamed high']);
    assert.equal(priority.value, 'Low');
    assert.deepEqual(tasks[4], { id: 5, title: 'Renamed high', completed: true, priority: 'Low' });
    assert.equal(writes, 3);
  });
}

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
    { id: 1, title: 'Open task', completed: false, priority: 'Low' },
    { id: 2, title: 'Done task', completed: true, priority: 'High' },
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
  const renameForm = app.children.find((node) => node.tag === 'form'
    && node.children[0].textContent === 'New project name');
  assert.equal(renameForm.children[1].disabled, true);
  assert.equal(renameForm.children[2].disabled, true);
  renameForm.children[1].value = 'Forbidden rename';
  await renameForm.fire('submit');
  assert.equal(app.querySelector('h1').textContent, 'Archived example');
  const form = app.children.find((node) => node.tag === 'form'
    && node.children[0].textContent === 'Task title');
  assert.equal(form.children[2].disabled, true);
  form.children[1].value = 'Not allowed';
  await form.fire('submit');
  const list = app.querySelector('ul');
  assert.equal(list.children.length, 2);
  assert.ok(list.children.every((row) => row.children[0].disabled));
  for (const row of list.children) {
    const priority = row.children[4];
    assert.equal(priority.disabled, true);
    assert.equal(priority.value, tasks.find((task) => task.title === row.children[1].textContent).priority);
    priority.value = 'Normal';
    await priority.fire('change');
    const rename = row.children[2];
    assert.equal(rename.children[1].disabled, true);
    assert.equal(rename.children[2].disabled, true);
    rename.children[1].value = 'Forbidden';
    await rename.fire('submit');
  }
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
        data = { id: tasks.length + 1, title: JSON.parse(options.body).title, completed: false, priority: 'Normal' };
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
  const form = app.children.find((node) => node.tag === 'form'
    && node.children[0].textContent === 'Task title');
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
  const priorityLabel = list.children[0].children[3];
  let priority = list.children[0].children[4];
  assert.equal(priorityLabel.textContent, 'Task priority');
  assert.equal(priorityLabel.htmlFor, priority.id);
  assert.deepEqual(priority.children.map((option) => option.textContent), ['Low', 'Normal', 'High']);
  assert.equal(priority.value, 'Normal');
  assert.equal(priority.disabled, false);
  priority.value = 'High';
  await priority.fire('change');
  assert.equal(tasks[0].priority, 'High');
  assert.equal(tasks[1].priority, 'Normal');
  assert.deepEqual(titles(), ['First', 'Second']);
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
  checkbox = list.children[0].children[0];
  checkbox.checked = true;
  await checkbox.fire('change');
  filter.value = 'Completed';
  await filter.fire('change');
  let rename = list.children[0].children[2];
  assert.equal(rename.children[0].textContent, 'New task title');
  assert.equal(rename.children[0].htmlFor, rename.children[1].id);
  assert.equal(rename.children[1].type, 'text');
  assert.equal(rename.children[1].disabled, false);
  assert.equal(rename.children[2].textContent, 'Rename task');
  assert.equal(rename.children[2].disabled, false);
  for (const title of ['', ' \t\n ']) {
    rename.children[1].value = title;
    await rename.fire('submit');
    assert.equal(app.querySelector('[role="alert"]').textContent, 'Task title is required');
    assert.deepEqual(titles(), ['First']);
  }
  rename.children[1].value = '  Renamed task  ';
  await rename.fire('submit');
  assert.equal(app.querySelector('[role="alert"]'), undefined);
  assert.deepEqual(titles(), ['Renamed task']);
  assert.equal(filter.value, 'Completed');
  assert.equal(list.children[0].children[0].checked, true);
  assert.equal(list.children[0].children[0].attributes['aria-label'], 'Complete Renamed task');
  priority = list.children[0].children[4];
  assert.equal(priority.value, 'High');
  priority.value = 'Low';
  await priority.fire('change');
  assert.equal(filter.value, 'Completed');
  assert.deepEqual(titles(), ['Renamed task']);
  assert.equal(list.children[0].children[0].checked, true);
  assert.equal(list.children[0].children[4].value, 'Low');
  filter.value = 'Open';
  await filter.fire('change');
  assert.deepEqual(titles(), ['Second']);
  filter.value = 'All';
  await filter.fire('change');
  assert.deepEqual(titles(), ['Renamed task', 'Second']);
});

test('renaming validates, updates the heading, and preserves the route and task UI', async () => {
  const app = new Node('main');
  const project = { id: 7, name: 'Original', archived: false, totalCount: 1, completedCount: 1 };
  const document = { querySelector: () => app, createElement: (tag) => new Node(tag) };
  let failRename = false;
  const calls = [];
  runInNewContext(source, {
    document,
    location: { pathname: '/projects/7', assign() { assert.fail('Rename must not navigate'); } },
    async fetch(path, options) {
      if (options) {
        calls.push({ path, ...JSON.parse(options.body) });
        assert.equal(options.method, 'PATCH');
        if (failRename) return { ok: false, json: async () => ({ error: 'Unable to rename' }) };
        Object.assign(project, JSON.parse(options.body));
      }
      const data = path.endsWith('/tasks')
        ? [{ id: 3, title: 'Saved task', completed: true }] : { ...project };
      return { ok: true, json: async () => data };
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  const form = app.children.find((node) => node.tag === 'form'
    && node.children[0].textContent === 'New project name');
  const [label, input, button] = form.children;
  assert.equal(label.htmlFor, input.id);
  assert.equal(input.type, 'text');
  assert.equal(input.disabled, false);
  assert.equal(button.textContent, 'Rename project');
  assert.equal(button.disabled, false);
  const list = app.querySelector('ul');
  const originalRow = list.children[0];
  const filter = app.querySelector('select');
  filter.value = 'Completed';
  for (const name of ['', ' \t\n ']) {
    input.value = name;
    await form.fire('submit');
    assert.equal(app.querySelector('[role="alert"]').textContent, 'Project name is required');
    assert.equal(app.querySelector('h1').textContent, 'Original');
  }
  assert.equal(calls.length, 0);
  input.value = '  New name  ';
  await form.fire('submit');
  assert.deepEqual(calls, [{ path: '/api/projects/7', name: 'New name' }]);
  assert.equal(app.querySelector('h1').textContent, 'New name');
  assert.equal(document.title, 'New name — Workboard');
  assert.equal(app.querySelector('[role="alert"]'), undefined);
  assert.equal(input.value, '');
  assert.equal(filter.value, 'Completed');
  assert.equal(list.children[0], originalRow);
  assert.equal(originalRow.children[0].checked, true);
  failRename = true;
  input.value = 'Failed name';
  await form.fire('submit');
  assert.equal(app.querySelector('[role="alert"]').textContent, 'Unable to rename');
  assert.equal(app.querySelector('h1').textContent, 'New name');
  assert.equal(button.disabled, false);
});
