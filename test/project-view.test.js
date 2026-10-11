import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// Exercise the shipped browser script with a small DOM adapter and controlled
// requests. No browser package or application dependency is required.
class Element {
  constructor(tag, root = false) {
    this.tag = tag;
    this.root = root;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.value = '';
    this.textContent = '';
  }
  get isConnected() { return this.root || Boolean(this.parent?.isConnected); }
  append(...children) {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }
  replaceChildren(...children) {
    for (const child of this.children) child.parent = undefined;
    this.children = [];
    this.append(...children);
  }
  set innerHTML(html) {
    this.replaceChildren();
    const stack = [this];
    for (const token of html.match(/<[^>]+>|[^<]+/g) || []) {
      if (token.startsWith('</')) {
        const element = stack.pop();
        if (element.tag === 'select') element.value = element.children[0].textContent;
      } else if (token.startsWith('<')) {
        const tag = token.match(/^<(\w+)/)[1];
        const element = new Element(tag);
        for (const match of token.matchAll(/([\w-]+)="([^"]*)"/g)) {
          element.setAttribute(match[1], match[2]);
        }
        element.disabled = /\sdisabled[\s>]/.test(token);
        element.hidden = /\shidden[\s>]/.test(token);
        stack.at(-1).append(element);
        if (tag !== 'input') stack.push(element);
      } else {
        stack.at(-1).textContent += token.trim();
      }
    }
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  querySelector(selector) {
    for (const child of this.children) {
      if (selector.startsWith('#') ? child.attributes.id === selector.slice(1) :
          selector === '[role="alert"]' ? child.attributes.role === 'alert' : child.tag === selector) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  async emit(name) { await this.listeners[name]?.({ preventDefault() {} }); }
  focus() {}
}

const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const settled = () => new Promise(resolve => setImmediate(resolve));

async function browser(storage, projects, pending = {}) {
  const tasks = pending.tasks || [{ id: 1, title: 'Saved task', completed: true, priority: 'Normal' }];
  const app = new Element('main', true);
  const location = { pathname: '/' };
  const document = {
    querySelector: () => app,
    createElement: tag => new Element(tag),
  };
  runInNewContext(source, {
    document, location,
    history: { pushState(_state, _title, path) { location.pathname = path; } },
    window: { addEventListener() {} },
    sessionStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    fetch: async (path, options) => {
      let result;
      if (options?.method === 'POST' && path.endsWith('/tasks')) {
        const owner = projects.find(project => path === `/api/projects/${project.id}/tasks`);
        result = { id: Math.max(0, ...tasks.map(task => task.id)) + 1,
          project_id: owner.id, title: JSON.parse(options.body).title,
          completed: false, priority: owner.default_priority };
        tasks.push(result);
      } else if (options?.method === 'PATCH') {
        if (pending.wait) await pending.wait;
        const taskMatch = path.match(/\/tasks\/(\d+)$/);
        const item = taskMatch ? tasks.find(task => task.id === Number(taskMatch[1])) :
          projects.find(project => path === `/api/projects/${project.id}`);
        Object.assign(item, JSON.parse(options.body));
        result = { ...item };
      } else if (path === '/api/projects') {
        result = projects.map(item => ({ ...item }));
      } else if (path.endsWith('/tasks')) {
        result = tasks.map(task => ({ ...task }));
      } else {
        result = { ...projects.find(item => path === `/api/projects/${item.id}`) };
      }
      return { ok: true, json: async () => result };
    },
  });
  await settled();
  return app;
}

function rows(app) { return app.querySelector('ul').children; }
function control(row, label) { return row.children.find(child => child.textContent === label); }
async function filter(app, value) {
  app.querySelector('select').value = value;
  await app.querySelector('select').emit('change');
}
const project = () => ({ id: 1, name: 'Archive lifecycle', archived: false, default_priority: 'Normal', total_count: 1, completed_count: 1 });

async function priorityFilter(app, value) {
  const select = app.querySelector('#priority-filter');
  select.value = value;
  await select.emit('change');
}

test('project defaults affect only new tasks and preserve filters, rows, reload and archive state', async () => {
  const projects = [project(), { ...project(), id: 2, name: 'Independent project' }];
  const pending = { tasks: [
    { id: 1, title: 'Existing completed', completed: true, priority: 'Normal' },
    { id: 2, title: 'Existing open', completed: false, priority: 'High' },
  ] };
  const original = structuredClone(pending.tasks);
  const storage = new Map();
  let app = await browser(storage, projects, pending);
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  const defaults = app.querySelector('#default-task-priority');
  assert.deepEqual(defaults.children.map(option => option.textContent), ['Low', 'Normal', 'High']);
  assert.equal(defaults.value, 'Normal');
  assert.equal(defaults.disabled, false);
  await filter(app, 'Completed');
  await priorityFilter(app, 'Normal');
  const previousRow = rows(app)[0];
  defaults.value = 'High';
  await defaults.emit('change');
  assert.equal(rows(app)[0], previousRow);
  assert.equal(app.querySelector('#task-filter').value, 'Completed');
  assert.equal(app.querySelector('#priority-filter').value, 'Normal');
  assert.deepEqual(pending.tasks, original);
  assert.equal(projects[1].default_priority, 'Normal');
  const create = app.querySelector('form');
  create.querySelector('input').value = 'Inherits High';
  await create.emit('submit');
  assert.equal(pending.tasks[2].priority, 'High');
  assert.equal(rows(app)[0].children[0].textContent, 'Existing completed');
  assert.equal(rows(app)[0].querySelector('input').checked, true);
  assert.equal(rows(app).length, 1);
  assert.equal(app.querySelector('#task-filter').value, 'Completed');
  assert.equal(app.querySelector('#priority-filter').value, 'Normal');
  defaults.value = 'Low';
  await defaults.emit('change');
  assert.equal(pending.tasks[2].priority, 'High');
  await filter(app, 'Open');
  await priorityFilter(app, 'Low');
  create.querySelector('input').value = 'Inherits Low';
  await create.emit('submit');
  assert.deepEqual(rows(app).map(row => row.children[0].textContent), ['Inherits Low']);
  app = await browser(storage, projects, pending);
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  assert.equal(app.querySelector('#default-task-priority').value, 'Low');
  assert.equal(app.querySelector('#task-filter').value, 'All');
  assert.equal(app.querySelector('#priority-filter').value, 'All');
  await app.querySelector('#projects').emit('click');
  await settled();
  await control(rows(app)[0], 'Archive project').emit('click');
  await filter(app, 'Archived');
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  assert.equal(app.querySelector('#default-task-priority').disabled, true);
  assert.equal(app.querySelector('#default-task-priority').value, 'Low');
  await filter(app, 'Open');
  await priorityFilter(app, 'High');
  assert.equal(rows(app).length, 2);
  await app.querySelector('#projects').emit('click');
  await settled();
  await control(rows(app)[0], 'Restore project').emit('click');
  await filter(app, 'Active');
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  assert.equal(app.querySelector('#default-task-priority').disabled, false);
  assert.equal(app.querySelector('#default-task-priority').value, 'Low');
  assert.deepEqual(pending.tasks.slice(0, 2), original);
});

test('completion and priority filters intersect independently and preserve creation order and data', async () => {
  const projects = [{ ...project(), total_count: 6, completed_count: 3 }];
  const pending = { tasks: [
    { id: 1, title: 'Low open', completed: false, priority: 'Low' },
    { id: 2, title: 'High completed', completed: true, priority: 'High' },
    { id: 3, title: 'Normal open', completed: false, priority: 'Normal' },
    { id: 4, title: 'Low completed', completed: true, priority: 'Low' },
    { id: 5, title: 'High open', completed: false, priority: 'High' },
    { id: 6, title: 'Normal completed', completed: true, priority: 'Normal' },
  ] };
  const original = structuredClone(pending.tasks);
  const app = await browser(new Map(), projects, pending);
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  const priority = app.querySelector('#priority-filter');
  assert.deepEqual(priority.children.map(option => option.textContent), ['All', 'Low', 'Normal', 'High']);
  assert.equal(priority.value, 'All');
  const cases = [
    ['All', 'All', original.map(task => task.title)],
    ['All', 'Low', ['Low open', 'Low completed']],
    ['All', 'Normal', ['Normal open', 'Normal completed']],
    ['All', 'High', ['High completed', 'High open']],
    ['Open', 'All', ['Low open', 'Normal open', 'High open']],
    ['Open', 'Low', ['Low open']],
    ['Open', 'Normal', ['Normal open']],
    ['Open', 'High', ['High open']],
    ['Completed', 'All', ['High completed', 'Low completed', 'Normal completed']],
    ['Completed', 'Low', ['Low completed']],
    ['Completed', 'Normal', ['Normal completed']],
    ['Completed', 'High', ['High completed']],
  ];
  for (const [completion, value, titles] of cases) {
    const previousPriority = priority.value;
    await filter(app, completion);
    assert.equal(priority.value, previousPriority);
    await priorityFilter(app, value);
    assert.equal(app.querySelector('#task-filter').value, completion);
    assert.deepEqual(rows(app).map(row => row.children[0].textContent), titles);
  }
  assert.deepEqual(pending.tasks, original);
  await app.querySelector('#projects').emit('click');
  await settled();
  assert.ok(control(rows(app)[0], '3/6 completed'));
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  assert.equal(app.querySelector('#task-filter').value, 'All');
  assert.equal(app.querySelector('#priority-filter').value, 'All');
  assert.equal(rows(app).length, 6);
});

test('saved edits reapply both current filters, including filter changes during requests', async () => {
  const projects = [{ ...project(), total_count: 2, completed_count: 0 }];
  const pending = { tasks: [
    { id: 1, title: 'First', completed: false, priority: 'High' },
    { id: 2, title: 'Second', completed: false, priority: 'High' },
  ] };
  const storage = new Map();
  let app = await browser(storage, projects, pending);
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  await filter(app, 'Open');
  await priorityFilter(app, 'High');
  const rename = rows(app)[0].querySelector('form');
  rename.querySelector('input').value = '  Renamed  ';
  await rename.emit('submit');
  assert.equal(rows(app)[0].children[0].textContent, 'Renamed');
  assert.equal(rows(app)[0].querySelector('input').attributes['aria-label'], 'Complete Renamed');
  assert.equal(app.querySelector('#task-filter').value, 'Open');
  assert.equal(app.querySelector('#priority-filter').value, 'High');
  let priority = rows(app)[0].querySelector('select');
  priority.value = 'Low';
  await priority.emit('change');
  assert.deepEqual(rows(app).map(row => row.children[0].textContent), ['Second']);
  assert.equal(app.querySelector('#task-filter').value, 'Open');
  assert.equal(app.querySelector('#priority-filter').value, 'High');
  const checkbox = rows(app)[0].querySelector('input');
  checkbox.checked = true;
  await checkbox.emit('change');
  assert.equal(rows(app).length, 0);
  assert.equal(app.querySelector('#task-filter').value, 'Open');
  assert.equal(app.querySelector('#priority-filter').value, 'High');
  await filter(app, 'Completed');
  assert.equal(rows(app)[0].children[0].textContent, 'Second');
  let release;
  pending.wait = new Promise(resolve => { release = resolve; });
  priority = rows(app)[0].querySelector('select');
  priority.value = 'Normal';
  const save = priority.emit('change');
  await priorityFilter(app, 'Normal');
  assert.equal(rows(app).length, 0);
  release();
  await save;
  assert.equal(rows(app)[0].children[0].textContent, 'Second');
  assert.equal(app.querySelector('#task-filter').value, 'Completed');
  assert.equal(app.querySelector('#priority-filter').value, 'Normal');
  delete pending.wait;
  app = await browser(storage, projects, pending);
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  assert.deepEqual(rows(app).map(row => row.children[0].textContent), ['Renamed', 'Second']);
  assert.deepEqual(rows(app).map(row => row.querySelector('select').value), ['Low', 'Normal']);
  assert.deepEqual(rows(app).map(row => row.querySelector('input').checked), [false, true]);
});

test('both filters remain usable in archived projects and restoration preserves tasks', async () => {
  const projects = [{ ...project(), archived: true, total_count: 2 }];
  const pending = { tasks: [
    { id: 1, title: 'Open low', completed: false, priority: 'Low' },
    { id: 2, title: 'Completed high', completed: true, priority: 'High' },
  ] };
  const original = structuredClone(pending.tasks);
  const app = await browser(new Map(), projects, pending);
  await filter(app, 'Archived');
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  assert.equal(app.querySelector('#task-filter').disabled, false);
  assert.equal(app.querySelector('#priority-filter').disabled, false);
  await filter(app, 'Completed');
  await priorityFilter(app, 'Low');
  assert.equal(rows(app).length, 0);
  await priorityFilter(app, 'High');
  assert.equal(rows(app)[0].children[0].textContent, 'Completed high');
  assert.equal(rows(app)[0].querySelector('input').disabled, true);
  assert.equal(rows(app)[0].querySelector('select').disabled, true);
  assert.equal(rows(app)[0].querySelector('form').querySelector('input').disabled, true);
  assert.equal(rows(app)[0].querySelector('form').querySelector('button').disabled, true);
  await app.querySelector('#projects').emit('click');
  await settled();
  assert.ok(control(rows(app)[0], '1/2 completed'));
  await control(rows(app)[0], 'Restore project').emit('click');
  await filter(app, 'Active');
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  assert.equal(rows(app).length, 2);
  for (const row of rows(app)) assert.equal(row.querySelector('select').disabled, false);
  assert.deepEqual(pending.tasks, original);
});

test('archive and restore update the list even if the filter changes before the request finishes', async () => {
  const projects = [project()];
  let release;
  const pending = { wait: new Promise(resolve => { release = resolve; }) };
  const app = await browser(new Map(), projects, pending);
  assert.equal(app.querySelector('select').value, 'Active');
  const archive = control(rows(app)[0], 'Archive project').emit('click');
  await filter(app, 'Archived');
  assert.equal(rows(app).length, 0);
  release();
  await archive;
  assert.equal(rows(app).length, 1);
  assert.equal(control(rows(app)[0], '1/1 completed').dataset.testid, 'project-summary');
  pending.wait = new Promise(resolve => { release = resolve; });
  const restore = control(rows(app)[0], 'Restore project').emit('click');
  await filter(app, 'Active');
  assert.equal(rows(app).length, 0);
  release();
  await restore;
  assert.equal(rows(app).length, 1);
  assert.ok(control(rows(app)[0], 'Archive project'));
});

test('Archived filter survives reload and opening a read-only project then returning to Projects', async () => {
  const storage = new Map();
  const projects = [{ ...project(), archived: true }];
  let app = await browser(storage, projects);
  assert.equal(app.querySelector('select').value, 'Active');
  assert.equal(rows(app).length, 0);
  await filter(app, 'Archived');
  assert.equal(rows(app).length, 1);
  app = await browser(storage, projects);
  assert.equal(app.querySelector('select').value, 'Archived');
  assert.equal(rows(app).length, 1);
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  assert.equal(app.querySelector('h1').textContent, projects[0].name);
  assert.equal(app.querySelector('#archive-status').hidden, false);
  assert.equal(app.querySelector('#new-project-name').disabled, true);
  assert.equal(app.querySelector('#rename-form').querySelector('button').disabled, true);
  assert.equal(app.querySelector('form').querySelector('button').disabled, true);
  assert.equal(rows(app)[0].querySelector('input').disabled, true);
  assert.equal(rows(app)[0].querySelector('form').querySelector('input').disabled, true);
  assert.equal(rows(app)[0].querySelector('form').querySelector('button').disabled, true);
  assert.equal(rows(app)[0].querySelector('select').disabled, true);
  assert.equal(rows(app)[0].querySelector('select').value, 'Normal');
  await app.querySelector('#projects').emit('click');
  await settled();
  assert.equal(app.querySelector('select').value, 'Archived');
  assert.equal(rows(app).length, 1);
  await control(rows(app)[0], 'Restore project').emit('click');
  await filter(app, 'Active');
  assert.equal(rows(app).length, 1);
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  assert.equal(app.querySelector('form').querySelector('button').disabled, false);
  assert.equal(app.querySelector('#new-project-name').disabled, false);
  assert.equal(app.querySelector('#rename-form').querySelector('button').disabled, false);
  assert.equal(rows(app)[0].querySelector('input').disabled, false);
  assert.equal(rows(app)[0].querySelector('input').checked, true);
  assert.equal(rows(app)[0].querySelector('form').querySelector('input').disabled, false);
  assert.equal(rows(app)[0].querySelector('form').querySelector('button').disabled, false);
  assert.equal(rows(app)[0].querySelector('select').disabled, false);
  assert.equal(rows(app)[0].querySelector('select').value, 'Normal');
  await app.querySelector('#projects').emit('click');
  await settled();
  assert.equal(app.querySelector('select').value, 'Active');
});

test('rename validates input and updates the heading and list while preserving tasks', async () => {
  const projects = [project(), { ...project(), id: 2, name: 'Second project' }];
  const app = await browser(new Map(), projects);
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  const form = app.querySelector('#rename-form');
  const input = app.querySelector('#new-project-name');
  const savedRow = rows(app)[0];
  input.value = ' \t\n ';
  await form.emit('submit');
  assert.equal(app.querySelector('[role="alert"]').textContent, 'Project name is required');
  assert.equal(app.querySelector('[role="alert"]').hidden, false);
  assert.equal(app.querySelector('h1').textContent, 'Archive lifecycle');
  input.value = '  New project name  ';
  await form.emit('submit');
  assert.equal(app.querySelector('h1').textContent, 'New project name');
  assert.equal(app.querySelector('[role="alert"]').hidden, true);
  assert.equal(rows(app)[0], savedRow);
  assert.equal(savedRow.querySelector('input').checked, true);
  await app.querySelector('#projects').emit('click');
  await settled();
  assert.equal(rows(app)[0].children[0].textContent, 'New project name');
  assert.equal(rows(app)[1].children[0].textContent, 'Second project');
  assert.ok(control(rows(app)[0], '1/1 completed'));
});

test('task rename validates, preserves ordering and filter membership, and updates completion labels', async () => {
  const projects = [project()];
  const pending = { tasks: [
    { id: 1, title: 'Completed original', completed: true },
    { id: 2, title: 'Open original', completed: false },
  ] };
  let app = await browser(new Map(), projects, pending);
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  const form = rows(app)[0].querySelector('form');
  const input = form.querySelector('input');
  assert.equal(input.attributes['aria-label'], 'New task title');
  input.value = ' \t\n ';
  await form.emit('submit');
  assert.equal(app.querySelector('[role="alert"]').textContent, 'Task title is required');
  assert.equal(app.querySelector('[role="alert"]').hidden, false);
  assert.equal(rows(app)[0].children[0].textContent, 'Completed original');
  input.value = '  Completed renamed  ';
  await form.emit('submit');
  assert.equal(app.querySelector('[role="alert"]').hidden, true);
  assert.equal(rows(app)[0].children[0].textContent, 'Completed renamed');
  assert.equal(rows(app)[0].querySelector('input').attributes['aria-label'], 'Complete Completed renamed');
  assert.equal(rows(app)[0].querySelector('input').checked, true);
  assert.equal(rows(app)[1].children[0].textContent, 'Open original');
  await filter(app, 'Open');
  assert.equal(rows(app).length, 1);
  const openForm = rows(app)[0].querySelector('form');
  openForm.querySelector('input').value = '  Open renamed  ';
  await openForm.emit('submit');
  assert.equal(app.querySelector('select').value, 'Open');
  assert.equal(rows(app).length, 1);
  assert.equal(rows(app)[0].children[0].textContent, 'Open renamed');
  assert.equal(rows(app)[0].querySelector('input').checked, false);
  await filter(app, 'Completed');
  assert.equal(rows(app).length, 1);
  assert.equal(rows(app)[0].children[0].textContent, 'Completed renamed');
  app = await browser(new Map(), projects, pending);
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  assert.equal(app.querySelector('select').value, 'All');
  assert.deepEqual(rows(app).map(row => row.children[0].textContent), ['Completed renamed', 'Open renamed']);
  assert.equal(rows(app)[0].querySelector('input').checked, true);
  assert.equal(rows(app)[1].querySelector('input').checked, false);
});

test('priority options persist through filtering, renaming, reload, and archive/restore', async () => {
  const projects = [{ ...project(), total_count: 2 }];
  const pending = { tasks: [
    { id: 1, title: 'Completed task', completed: true, priority: 'Normal' },
    { id: 2, title: 'Open task', completed: false, priority: 'Normal' },
  ] };
  const storage = new Map();
  let app = await browser(storage, projects, pending);
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  let priority = rows(app)[0].querySelector('select');
  assert.equal(priority.attributes['aria-label'], 'Task priority');
  assert.deepEqual(priority.children.map(option => option.textContent), ['Low', 'Normal', 'High']);
  assert.equal(priority.value, 'Normal');
  priority.value = 'High';
  await priority.emit('change');
  assert.equal(rows(app)[0].querySelector('select').value, 'High');
  assert.equal(rows(app)[0].querySelector('input').checked, true);
  assert.equal(rows(app)[1].querySelector('select').value, 'Normal');
  await filter(app, 'Completed');
  assert.equal(rows(app).length, 1);
  assert.equal(rows(app)[0].querySelector('select').value, 'High');
  const rename = rows(app)[0].querySelector('form');
  rename.querySelector('input').value = 'Renamed completed task';
  await rename.emit('submit');
  assert.equal(rows(app)[0].querySelector('select').value, 'High');
  assert.equal(rows(app)[0].querySelector('input').checked, true);
  await filter(app, 'Open');
  priority = rows(app)[0].querySelector('select');
  priority.value = 'Low';
  await priority.emit('change');
  assert.equal(rows(app).length, 1);
  assert.equal(rows(app)[0].children[0].textContent, 'Open task');
  assert.equal(rows(app)[0].querySelector('input').checked, false);
  await app.querySelector('#projects').emit('click');
  await settled();
  assert.ok(control(rows(app)[0], '1/2 completed'));
  await control(rows(app)[0], 'Archive project').emit('click');
  await filter(app, 'Archived');
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  for (const row of rows(app)) assert.equal(row.querySelector('select').disabled, true);
  assert.deepEqual(rows(app).map(row => row.querySelector('select').value), ['High', 'Low']);
  await app.querySelector('#projects').emit('click');
  await settled();
  await control(rows(app)[0], 'Restore project').emit('click');
  await filter(app, 'Active');
  app = await browser(storage, projects, pending);
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  assert.deepEqual(rows(app).map(row => row.children[0].textContent), ['Renamed completed task', 'Open task']);
  assert.deepEqual(rows(app).map(row => row.querySelector('select').value), ['High', 'Low']);
  for (const row of rows(app)) assert.equal(row.querySelector('select').disabled, false);
});
