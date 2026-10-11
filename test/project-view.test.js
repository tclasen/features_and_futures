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
  // Simulated database positions must survive recreating the browser as well.
  const positions = pending.positions || (pending.positions = new Map());
  function remember(task, owner) {
    const key = `${owner}:${task.id}`;
    if (!positions.has(key)) {
      const slots = [...positions].filter(([key]) => key.startsWith(`${owner}:`)).map(([, slot]) => slot);
      positions.set(key, Math.max(0, ...slots) + 1);
    }
  }
  for (const task of tasks) remember(task, task.project_id ?? 1);
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
      if (options?.method === 'POST' && path === '/api/projects') {
        result = { id: Math.max(0, ...projects.map(project => project.id)) + 1,
          name: JSON.parse(options.body).name, archived: false,
          default_priority: 'Normal', total_count: 0, completed_count: 0 };
        projects.push(result);
      } else if (options?.method === 'POST' && path.endsWith('/tasks')) {
        const owner = projects.find(project => path === `/api/projects/${project.id}/tasks`);
        result = { id: Math.max(0, ...tasks.map(task => task.id)) + 1,
          project_id: owner.id, title: JSON.parse(options.body).title,
          completed: false, priority: owner.default_priority, notes: '' };
        tasks.push(result);
        remember(result, owner.id);
      } else if (options?.method === 'PATCH') {
        if (pending.wait) await pending.wait;
        const taskMatch = path.match(/\/tasks\/(\d+)$/);
        const item = taskMatch ? tasks.find(task => task.id === Number(taskMatch[1])) :
          projects.find(project => path === `/api/projects/${project.id}`);
        const input = JSON.parse(options.body);
        if (taskMatch && Object.hasOwn(input, 'destination_project_id')) {
          item.project_id = input.destination_project_id;
          remember(item, item.project_id);
          tasks.splice(tasks.indexOf(item), 1);
          tasks.push(item);
        } else {
          Object.assign(item, input);
        }
        result = { ...item };
      } else if (path === '/api/projects') {
        result = projects.map(item => ({ ...item }));
      } else if (path.endsWith('/tasks')) {
        const owner = Number(path.match(/projects\/(\d+)/)[1]);
        result = tasks.filter(task => task.project_id === undefined || task.project_id === owner)
          .sort((a, b) => positions.get(`${owner}:${a.id}`) - positions.get(`${owner}:${b.id}`))
          .map(task => ({ ...task }));
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

test('creating from a retained Archived view reveals the active project and supports archive/restore', async () => {
  const storage = new Map([['project-filter', 'Archived']]);
  const projects = [{ ...project(), archived: true }];
  let app = await browser(storage, projects);
  assert.equal(app.querySelector('select').value, 'Active');
  await filter(app, 'Archived');
  assert.equal(app.querySelector('select').value, 'Archived');
  const form = app.querySelector('form');
  form.querySelector('input').value = '   ';
  await form.emit('submit');
  assert.equal(projects.length, 1);
  assert.equal(app.querySelector('select').value, 'Archived');
  assert.equal(app.querySelector('[role="alert"]').textContent, 'Project name is required');
  form.querySelector('input').value = '  task-009 Calendar archival  ';
  await form.emit('submit');
  assert.equal(app.querySelector('select').value, 'Active');
  assert.equal(rows(app).length, 1);
  assert.equal(rows(app)[0].children[0].textContent, 'task-009 Calendar archival');
  assert.equal(control(rows(app)[0], '0/0 completed').dataset.testid, 'project-summary');
  assert.equal(projects[0].archived, true);
  app = await browser(storage, projects);
  assert.equal(rows(app)[0].children[0].textContent, 'task-009 Calendar archival');
  await control(rows(app)[0], 'Archive project').emit('click');
  assert.equal(rows(app).length, 0);
  await filter(app, 'Archived');
  assert.deepEqual(rows(app).map(row => row.children[0].textContent),
    ['Archive lifecycle', 'task-009 Calendar archival']);
  await control(rows(app)[1], 'Restore project').emit('click');
  await filter(app, 'Active');
  assert.equal(rows(app)[0].children[0].textContent, 'task-009 Calendar archival');
});

test('fresh loads ignore a stale Archived selection and show active transfer projects', async () => {
  const storage = new Map([['project-filter', 'Archived']]);
  const projects = [
    { ...project(), name: 'Transfer restart origin', total_count: 0, completed_count: 0 },
    { ...project(), id: 2, name: 'Transfer restart destination' },
    { ...project(), id: 3, name: 'Archived sentinel', archived: true },
  ];
  const pending = { tasks: [{ id: 1, project_id: 2, title: 'Moved task',
    completed: true, priority: 'High', due_date: '2024-02-29' }] };
  let app = await browser(storage, projects, pending);
  assert.equal(app.querySelector('select').value, 'Active');
  assert.deepEqual(rows(app).map(row => row.children[0].textContent),
    ['Transfer restart origin', 'Transfer restart destination']);
  await filter(app, 'Archived');
  app = await browser(storage, projects, pending);
  assert.equal(app.querySelector('select').value, 'Active');
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  assert.equal(rows(app).length, 0);
  await app.querySelector('#projects').emit('click');
  await settled();
  await control(rows(app)[1], 'Open project').emit('click');
  await settled();
  assert.equal(rows(app)[0].children[0].textContent, 'Moved task');
  assert.equal(rows(app)[0].querySelector('input').checked, true);
  assert.equal(rows(app)[0].querySelector('select').value, 'High');
  assert.equal(dueDateForm(rows(app)[0]).querySelector('input').value, '2024-02-29');
});

test('reload starts Active while opening an archived project and returning retains Archived', async () => {
  const storage = new Map();
  const projects = [{ ...project(), archived: true }];
  let app = await browser(storage, projects);
  assert.equal(app.querySelector('select').value, 'Active');
  assert.equal(rows(app).length, 0);
  await filter(app, 'Archived');
  assert.equal(rows(app).length, 1);
  app = await browser(storage, projects);
  assert.equal(app.querySelector('select').value, 'Active');
  assert.equal(rows(app).length, 0);
  await filter(app, 'Archived');
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


test('due date controls save independently while retaining filters and archive protection', async () => {
  const projects = [project()];
  const pending = { tasks: [
    { id: 1, title: 'Dated task', completed: true, priority: 'High', due_date: '' },
    { id: 2, title: 'Other task', completed: false, priority: 'Normal', due_date: '' },
  ] };
  const storage = new Map();
  let app = await browser(storage, projects, pending);
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  await filter(app, 'Completed');
  await priorityFilter(app, 'High');
  function dateForm(row) { return row.children.find(child => child.tag === 'form' && child.querySelector('button').textContent === 'Save due date'); }
  let form = dateForm(rows(app)[0]);
  let input = form.querySelector('input');
  assert.equal(input.attributes['aria-label'], 'Task due date');
  assert.equal(input.type, 'text');
  assert.equal(input.value, '');
  input.value = '0001-01-01';
  await form.emit('submit');
  assert.equal(dateForm(rows(app)[0]).querySelector('input').value, '0001-01-01');
  assert.equal(app.querySelector('#task-filter').value, 'Completed');
  assert.equal(app.querySelector('#priority-filter').value, 'High');
  assert.equal(rows(app).length, 1);
  assert.equal(pending.tasks[1].due_date, '');
  const rename = rows(app)[0].querySelector('form');
  rename.querySelector('input').value = 'Renamed dated task';
  await rename.emit('submit');
  assert.equal(dateForm(rows(app)[0]).querySelector('input').value, '0001-01-01');
  app = await browser(storage, projects, pending);
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  assert.equal(dateForm(rows(app)[0]).querySelector('input').value, '0001-01-01');
  await app.querySelector('#projects').emit('click');
  await settled();
  await control(rows(app)[0], 'Archive project').emit('click');
  await filter(app, 'Archived');
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  for (const row of rows(app)) {
    assert.equal(dateForm(row).querySelector('input').disabled, true);
    assert.equal(dateForm(row).querySelector('button').disabled, true);
  }
  await filter(app, 'Completed');
  await priorityFilter(app, 'High');
  assert.equal(rows(app).length, 1);
  await app.querySelector('#projects').emit('click');
  await settled();
  await control(rows(app)[0], 'Restore project').emit('click');
  await filter(app, 'Active');
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  form = dateForm(rows(app)[0]);
  assert.equal(form.querySelector('input').disabled, false);
  assert.equal(form.querySelector('button').disabled, false);
  assert.equal(form.querySelector('input').value, '0001-01-01');
  form.querySelector('input').value = '';
  await form.emit('submit');
  assert.equal(dateForm(rows(app)[0]).querySelector('input').value, '');
  assert.equal(rows(app)[0].querySelector('input').checked, true);
  assert.equal(rows(app)[0].querySelector('select').value, 'High');
});

async function dueRange(app, from, through) {
  app.querySelector('#due-from').value = from;
  app.querySelector('#due-through').value = through;
  await app.querySelector('#due-range-form').emit('submit');
}
const taskTitles = app => rows(app).map(row => row.children[0].textContent);
const dueDateForm = row => row.children.find(child => child.tag === 'form' &&
  child.querySelector('button').textContent === 'Save due date');
const moveForm = row => row.children.find(child => child.tag === 'form' &&
  child.querySelector('button').textContent === 'Move task');

test('move controls list eligible destinations and preserve source filters, order, and saved task values', async () => {
  const projects = [project(), { ...project(), id: 2, name: 'Renamed destination', default_priority: 'Low' },
    { ...project(), id: 3, name: 'Archived destination', archived: true },
    { ...project(), id: 4, name: 'Last destination' }];
  const pending = { tasks: [
    { id: 1, project_id: 1, title: 'Move me', completed: true, priority: 'High', due_date: '2024-02-29' },
    { id: 2, project_id: 1, title: 'Remaining', completed: true, priority: 'High', due_date: '2024-03-01' },
    { id: 3, project_id: 1, title: 'Hidden', completed: false, priority: 'Normal', due_date: '' },
    { id: 4, project_id: 2, title: 'Destination existing', completed: false, priority: 'Low', due_date: '' },
  ] };
  const original = { ...pending.tasks[0] };
  const app = await browser(new Map(), projects, pending);
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  await filter(app, 'Completed');
  await priorityFilter(app, 'High');
  await dueRange(app, '2024-02-29', '2024-03-01');
  const form = moveForm(rows(app)[0]);
  const destination = form.querySelector('select');
  assert.equal(destination.attributes['aria-label'], 'Destination project');
  assert.deepEqual(destination.children.map(option => [option.value, option.textContent]),
    [['2', 'Renamed destination'], ['4', 'Last destination']]);
  assert.equal(destination.disabled, false);
  assert.equal(form.querySelector('button').disabled, false);
  await form.emit('submit');
  assert.deepEqual(taskTitles(app), ['Remaining']);
  assert.equal(app.querySelector('h1').textContent, 'Archive lifecycle');
  assert.equal(app.querySelector('#task-filter').value, 'Completed');
  assert.equal(app.querySelector('#priority-filter').value, 'High');
  assert.equal(app.querySelector('#due-from').value, '2024-02-29');
  assert.equal(app.querySelector('#due-through').value, '2024-03-01');
  assert.deepEqual(pending.tasks.find(task => task.id === 1), { ...original, project_id: 2 });
  await filter(app, 'All');
  await priorityFilter(app, 'All');
  await dueRange(app, '', '');
  assert.deepEqual(taskTitles(app), ['Remaining', 'Hidden']);
  await app.querySelector('#projects').emit('click');
  await settled();
  await control(rows(app)[1], 'Open project').emit('click');
  await settled();
  assert.deepEqual(taskTitles(app), ['Destination existing', 'Move me']);
  assert.deepEqual(moveForm(rows(app)[1]).querySelector('select').children.map(option => option.value), ['1', '4']);
  await moveForm(rows(app)[1]).emit('submit');
  assert.deepEqual(taskTitles(app), ['Destination existing']);
  await app.querySelector('#projects').emit('click');
  await settled();
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  assert.deepEqual(taskTitles(app), ['Move me', 'Remaining', 'Hidden']);
});

test('move controls disable when no destination exists and on archived sources, then enable on restoration', async () => {
  const projects = [project(), { ...project(), id: 2, name: 'Other', archived: true }];
  const pending = { tasks: [{ id: 1, project_id: 1, title: 'Saved', completed: false, priority: 'Normal', due_date: '' }] };
  const storage = new Map();
  let app = await browser(storage, projects, pending);
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  let form = moveForm(rows(app)[0]);
  assert.equal(form.querySelector('select').children.length, 0);
  assert.equal(form.querySelector('select').disabled, true);
  assert.equal(form.querySelector('button').disabled, true);
  await form.emit('submit');
  assert.equal(rows(app).length, 1);
  projects[1].archived = false;
  projects[0].archived = true;
  app = await browser(storage, projects, pending);
  await filter(app, 'Archived');
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  form = moveForm(rows(app)[0]);
  assert.deepEqual(form.querySelector('select').children.map(option => option.value), ['2']);
  assert.equal(form.querySelector('select').disabled, true);
  assert.equal(form.querySelector('button').disabled, true);
  await app.querySelector('#projects').emit('click');
  await settled();
  await control(rows(app)[0], 'Restore project').emit('click');
  await filter(app, 'Active');
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  form = moveForm(rows(app)[0]);
  assert.equal(form.querySelector('select').disabled, false);
  assert.equal(form.querySelector('button').disabled, false);
  assert.equal(pending.tasks[0].due_date, '');
});

test('due ranges are inclusive, intersect both filters, validate calendars and preserve the applied range', async () => {
  const projects = [{ ...project(), total_count: 5, completed_count: 2 }];
  const pending = { tasks: [
    { id: 1, title: 'Undated', completed: false, priority: 'Normal', due_date: '' },
    { id: 2, title: 'Before', completed: true, priority: 'High', due_date: '2024-02-28' },
    { id: 3, title: 'Lower', completed: false, priority: 'High', due_date: '2024-02-29' },
    { id: 4, title: 'Upper', completed: true, priority: 'High', due_date: '2024-03-01' },
    { id: 5, title: 'After', completed: false, priority: 'Low', due_date: '2024-03-02' },
  ] };
  const original = structuredClone(pending.tasks);
  const app = await browser(new Map(), projects, pending);
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  assert.equal(app.querySelector('#due-from').value, '');
  assert.equal(app.querySelector('#due-through').value, '');
  await dueRange(app, ' 2024-02-29 ', ' 2024-03-01 ');
  assert.deepEqual(taskTitles(app), ['Lower', 'Upper']);
  assert.equal(app.querySelector('#due-from').value, '2024-02-29');
  await filter(app, 'Completed');
  await priorityFilter(app, 'High');
  assert.deepEqual(taskTitles(app), ['Upper']);
  for (const invalid of ['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29',
    '2023-02-29', '2024-04-31', '2024-00-01', '2024-13-01', '2024-01-00',
    '2024-1-01', '2024-01-1', '2024-01-01T00:00:00Z', 'nonsense']) {
    for (const [from, through] of [[invalid, ''], ['', invalid]]) {
      await dueRange(app, from, through);
      assert.match(app.querySelector('[role="alert"]').textContent, /Due range must use valid YYYY-MM-DD dates/);
      assert.equal(app.querySelector('[role="alert"]').hidden, false);
      assert.deepEqual(taskTitles(app), ['Upper']);
    }
  }
  await dueRange(app, '2024-03-02', '2024-02-29');
  assert.match(app.querySelector('[role="alert"]').textContent, /Due from must not be after Due through/);
  assert.deepEqual(taskTitles(app), ['Upper']);
  // Even with invalid draft fields, combobox changes use the last applied range.
  await filter(app, 'Open');
  assert.deepEqual(taskTitles(app), ['Lower']);
  await priorityFilter(app, 'All');
  await filter(app, 'All');
  await dueRange(app, '', '2024-02-29');
  assert.deepEqual(taskTitles(app), ['Before', 'Lower']);
  await dueRange(app, '2024-03-01', '');
  assert.deepEqual(taskTitles(app), ['Upper', 'After']);
  for (const date of ['0001-01-01', '0099-12-31', '2000-02-29', '9999-12-31']) {
    await dueRange(app, date, date);
    assert.equal(app.querySelector('[role="alert"]').hidden, true);
  }
  await dueRange(app, ' \t ', ' \n ');
  assert.deepEqual(taskTitles(app), original.map(task => task.title));
  assert.deepEqual(pending.tasks, original);
  await app.querySelector('#projects').emit('click');
  await settled();
  assert.ok(control(rows(app)[0], '2/5 completed'));
});

test('edits retain the applied range and selections, re-evaluate membership, and archived ranges remain usable', async () => {
  const projects = [{ ...project(), total_count: 2, completed_count: 0 }];
  const pending = { tasks: [
    { id: 1, title: 'First', completed: false, priority: 'High', due_date: '2024-02-29' },
    { id: 2, title: 'Second', completed: false, priority: 'High', due_date: '2024-03-01' },
  ] };
  const app = await browser(new Map(), projects, pending);
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  await filter(app, 'Open');
  await priorityFilter(app, 'High');
  await dueRange(app, '2024-02-29', '2024-03-01');
  const assertSelections = () => {
    assert.equal(app.querySelector('#task-filter').value, 'Open');
    assert.equal(app.querySelector('#priority-filter').value, 'High');
    assert.equal(app.querySelector('#due-from').value, '2024-02-29');
    assert.equal(app.querySelector('#due-through').value, '2024-03-01');
  };
  const renameTask = rows(app)[0].querySelector('form');
  renameTask.querySelector('input').value = 'Renamed';
  await renameTask.emit('submit');
  const renameProject = app.querySelector('#rename-form');
  renameProject.querySelector('input').value = 'Renamed project';
  await renameProject.emit('submit');
  const defaults = app.querySelector('#default-task-priority');
  defaults.value = 'High';
  await defaults.emit('change');
  const create = app.querySelector('form');
  create.querySelector('input').value = 'New undated';
  await create.emit('submit');
  assert.deepEqual(taskTitles(app), ['Renamed', 'Second']);
  assertSelections();
  let dateForm = dueDateForm(rows(app)[0]);
  dateForm.querySelector('input').value = '2024-03-02';
  await dateForm.emit('submit');
  assert.deepEqual(taskTitles(app), ['Second']);
  assertSelections();
  let priority = rows(app)[0].querySelector('select');
  priority.value = 'Low';
  await priority.emit('change');
  assert.equal(rows(app).length, 0);
  assertSelections();
  await priorityFilter(app, 'Low');
  const checkbox = rows(app)[0].querySelector('input');
  checkbox.checked = true;
  await checkbox.emit('change');
  assert.equal(rows(app).length, 0);
  await filter(app, 'Completed');
  assert.deepEqual(taskTitles(app), ['Second']);
  dateForm = dueDateForm(rows(app)[0]);
  dateForm.querySelector('input').value = '';
  await dateForm.emit('submit');
  assert.equal(rows(app).length, 0);
  await dueRange(app, '', '');
  assert.deepEqual(taskTitles(app), ['Second']);
  await app.querySelector('#projects').emit('click');
  await settled();
  await control(rows(app)[0], 'Archive project').emit('click');
  await filter(app, 'Archived');
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  assert.equal(app.querySelector('#due-from').value, '');
  assert.equal(app.querySelector('#due-through').value, '');
  assert.equal(app.querySelector('#due-range-form').querySelector('button').disabled, false);
  await dueRange(app, '2024-03-02', '2024-03-02');
  assert.deepEqual(taskTitles(app), ['Renamed']);
  const row = rows(app)[0];
  assert.equal(row.querySelector('input').disabled, true);
  assert.equal(row.querySelector('select').disabled, true);
  assert.equal(row.querySelector('form').querySelector('button').disabled, true);
  assert.equal(dueDateForm(row).querySelector('input').disabled, true);
  assert.equal(dueDateForm(row).querySelector('button').disabled, true);
  await filter(app, 'Open');
  await priorityFilter(app, 'High');
  assert.deepEqual(taskTitles(app), ['Renamed']);
  await app.querySelector('#projects').emit('click');
  await settled();
  await control(rows(app)[0], 'Restore project').emit('click');
  await filter(app, 'Active');
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  assert.equal(app.querySelector('#due-from').value, '');
  assert.equal(app.querySelector('#due-through').value, '');
  assert.equal(rows(app).length, 3);
  assert.equal(dueDateForm(rows(app)[0]).querySelector('input').value, '2024-03-02');
  assert.equal(dueDateForm(rows(app)[0]).querySelector('input').disabled, false);
});

async function search(app, kind, query) {
  app.querySelector(`#${kind}-search`).value = query;
  await app.querySelector(`#${kind}-search-form`).emit('submit');
}
const visibleNames = app => rows(app).map(row => row.children[0].textContent);

test('search normalizes stored space/tab runs without rewriting data or collapsing other whitespace', async () => {
  const names = ['MiXeD \t\t  Name', 'mixed\tname', 'Mixed\u00a0Name', 'Mixed\nName'];
  const projects = names.map((name, index) => ({ ...project(), id: index + 1, name }));
  const pending = { tasks: names.map((title, index) => ({
    id: index + 1, project_id: 1, title, completed: false, priority: 'Normal', due_date: '',
  })) };
  const savedProjects = structuredClone(projects);
  const savedTasks = structuredClone(pending.tasks);
  for (let reload = 0; reload < 2; reload++) {
    const app = await browser(new Map(), projects, pending);
    for (const query of ['mixed name', ' MIXED\t \tname ', 'mixed   name']) {
      await search(app, 'project', query);
      assert.deepEqual(visibleNames(app), names.slice(0, 2));
    }
    await search(app, 'project', '');
    assert.deepEqual(visibleNames(app), names);
    await control(rows(app)[0], 'Open project').emit('click');
    await settled();
    for (const query of ['mixed name', '\tMIXED\t \tNAME\t', 'mixed   name']) {
      await search(app, 'task', query);
      assert.deepEqual(visibleNames(app), names.slice(0, 2));
      assert.equal(rows(app)[0].querySelector('input').attributes['aria-label'], `Complete ${names[0]}`);
    }
    await search(app, 'task', '');
    assert.deepEqual(visibleNames(app), names);
    assert.deepEqual(projects, savedProjects);
    assert.deepEqual(pending.tasks, savedTasks);
  }
});

test('project search normalizes spaces and tabs, intersects archive filter and resets on return', async () => {
  const projects = [
    { ...project(), name: 'Alpha  PLAN' },
    { ...project(), id: 2, name: 'Alpha plan', total_count: 3, completed_count: 2 },
    { ...project(), id: 3, name: 'Archived PLAN', archived: true },
    { ...project(), id: 4, name: 'Ä PLAN' },
  ];
  const original = structuredClone(projects);
  const app = await browser(new Map(), projects);
  await search(app, 'project', '  pLaN \t');
  assert.deepEqual(visibleNames(app), ['Alpha  PLAN', 'Alpha plan', 'Ä PLAN']);
  assert.equal(rows(app)[1].children[1].textContent, '2/3 completed');
  await filter(app, 'Archived');
  assert.deepEqual(visibleNames(app), ['Archived PLAN']);
  assert.equal(app.querySelector('#project-search').value, 'pLaN');
  await filter(app, 'Active');
  await search(app, 'project', 'alpha plan');
  assert.deepEqual(visibleNames(app), ['Alpha  PLAN', 'Alpha plan']);
  await search(app, 'project', 'alpha  plan');
  assert.deepEqual(visibleNames(app), ['Alpha  PLAN', 'Alpha plan']);
  await search(app, 'project', ' \tALPHA \t\t plan\t ');
  assert.deepEqual(visibleNames(app), ['Alpha  PLAN', 'Alpha plan']);
  await search(app, 'project', 'ä');
  assert.deepEqual(visibleNames(app), []);
  await search(app, 'project', 'Ä');
  assert.deepEqual(visibleNames(app), ['Ä PLAN']);
  // Draft text does not become an applied query when another filter changes.
  app.querySelector('#project-search').value = 'missing';
  await filter(app, 'Active');
  assert.deepEqual(visibleNames(app), ['Ä PLAN']);
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  await app.querySelector('#projects').emit('click');
  await settled();
  assert.equal(app.querySelector('#project-search').value, '');
  assert.deepEqual(visibleNames(app), ['Alpha  PLAN', 'Alpha plan', 'Ä PLAN']);
  await search(app, 'project', ' \t ');
  assert.deepEqual(visibleNames(app), ['Alpha  PLAN', 'Alpha plan', 'Ä PLAN']);
  assert.deepEqual(projects, original);
});

test('task search intersects all filters, retains queries during edits and movement, and resets on opening', async () => {
  const projects = [project(), { ...project(), id: 2, name: 'Destination' }];
  const pending = { tasks: [
    { id: 1, project_id: 1, title: 'Plan  ONE', completed: false, priority: 'High', due_date: '2024-02-29' },
    { id: 2, project_id: 1, title: 'Plan two', completed: true, priority: 'High', due_date: '2024-03-01' },
    { id: 3, project_id: 1, title: 'Other', completed: false, priority: 'High', due_date: '2024-03-01' },
    { id: 4, project_id: 1, title: 'Plan three', completed: false, priority: 'Normal', due_date: '' },
    { id: 5, project_id: 1, title: 'Ä Plan', completed: false, priority: 'Low', due_date: '' },
  ] };
  const original = structuredClone(pending.tasks);
  const app = await browser(new Map(), projects, pending);
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  await search(app, 'task', 'plan one');
  assert.deepEqual(visibleNames(app), ['Plan  ONE']);
  await search(app, 'task', 'plan  one');
  assert.deepEqual(visibleNames(app), ['Plan  ONE']);
  await search(app, 'task', ' \tPLAN\t \tONE ');
  assert.deepEqual(visibleNames(app), ['Plan  ONE']);
  await search(app, 'task', '  pLaN  ');
  assert.deepEqual(visibleNames(app), ['Plan  ONE', 'Plan two', 'Plan three', 'Ä Plan']);
  await priorityFilter(app, 'High');
  await filter(app, 'Open');
  await dueRange(app, '2024-02-29', '2024-03-01');
  assert.deepEqual(visibleNames(app), ['Plan  ONE']);
  assert.deepEqual(pending.tasks, original);
  function retained() {
    assert.equal(app.querySelector('#task-search').value, 'pLaN');
    assert.equal(app.querySelector('#task-filter').value, 'Open');
    assert.equal(app.querySelector('#priority-filter').value, 'High');
    assert.equal(app.querySelector('#due-from').value, '2024-02-29');
    assert.equal(app.querySelector('#due-through').value, '2024-03-01');
  }
  let rename = rows(app)[0].querySelector('form');
  rename.querySelector('input').value = 'Plan renamed';
  await rename.emit('submit');
  retained();
  assert.deepEqual(visibleNames(app), ['Plan renamed']);
  const date = dueDateForm(rows(app)[0]);
  date.querySelector('input').value = '2024-03-02';
  await date.emit('submit');
  retained();
  assert.deepEqual(visibleNames(app), []);
  await dueRange(app, '', '');
  // Set completion explicitly: the DOM adapter does not toggle checkboxes on click.
  const checkbox = rows(app)[0].querySelector('input');
  checkbox.checked = true;
  await checkbox.emit('change');
  assert.deepEqual(visibleNames(app), []);
  await filter(app, 'Completed');
  assert.deepEqual(visibleNames(app), ['Plan renamed', 'Plan two']);
  const priority = rows(app)[0].querySelector('select');
  priority.value = 'Low';
  await priority.emit('change');
  assert.deepEqual(visibleNames(app), ['Plan two']);
  await moveForm(rows(app)[0]).emit('submit');
  assert.deepEqual(visibleNames(app), []);
  assert.equal(app.querySelector('#task-search').value, 'pLaN');
  await filter(app, 'Open');
  const defaults = app.querySelector('#default-task-priority');
  defaults.value = 'High';
  await defaults.emit('change');
  const create = app.querySelector('form');
  create.querySelector('input').value = 'New PLAN';
  await create.emit('submit');
  assert.deepEqual(visibleNames(app), ['New PLAN']);
  create.querySelector('input').value = 'Unmatched';
  await create.emit('submit');
  assert.deepEqual(visibleNames(app), ['New PLAN']);
  const projectRename = app.querySelector('#rename-form');
  projectRename.querySelector('input').value = 'Renamed project';
  await projectRename.emit('submit');
  assert.equal(app.querySelector('#task-search').value, 'pLaN');
  rename = rows(app)[0].querySelector('form');
  rename.querySelector('input').value = 'No match';
  await rename.emit('submit');
  assert.deepEqual(visibleNames(app), []);
  await search(app, 'task', ' \t ');
  assert.deepEqual(visibleNames(app), ['Other', 'No match', 'Unmatched']);
  await filter(app, 'All');
  await priorityFilter(app, 'All');
  await search(app, 'task', 'ä');
  assert.deepEqual(visibleNames(app), []);
  await search(app, 'task', 'Ä');
  assert.deepEqual(visibleNames(app), ['Ä Plan']);
  await search(app, 'task', 'plan one');
  assert.deepEqual(visibleNames(app), []);
  await app.querySelector('#projects').emit('click');
  await settled();
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  assert.equal(app.querySelector('#task-search').value, '');
  assert.equal(rows(app).length, 6);
  await app.querySelector('#projects').emit('click');
  await settled();
  await control(rows(app)[0], 'Archive project').emit('click');
  await filter(app, 'Archived');
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  await search(app, 'task', 'other');
  assert.deepEqual(visibleNames(app), ['Other']);
  assert.equal(app.querySelector('#task-search').disabled, false);
  assert.equal(rows(app)[0].querySelector('input').disabled, true);
  assert.equal(moveForm(rows(app)[0]).querySelector('button').disabled, true);
});

const notesForm = row => row.children.find(child => child.tag === 'form' &&
  child.querySelector('button').textContent === 'Save notes');

test('multiline notes retain literal text, filters, ownership, order, and archive readability', async () => {
  const projects = [project(), { ...project(), id: 2, name: 'Destination' }];
  const pending = { tasks: [
    { id: 1, project_id: 1, title: 'Plan first', completed: true, priority: 'High', due_date: '2024-02-29', notes: '' },
    { id: 2, project_id: 1, title: 'Plan second', completed: true, priority: 'High', due_date: '2024-03-01', notes: '' },
  ] };
  const original = structuredClone(pending.tasks);
  let app = await browser(new Map(), projects, pending);
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  await filter(app, 'Completed');
  await priorityFilter(app, 'High');
  await dueRange(app, '2024-02-29', '2024-03-01');
  await search(app, 'task', 'plan');
  const text = '  Leading spaces\n\t雪 😀 <script>literal</script>\nTrailing spaces  ';
  let form = notesForm(rows(app)[0]);
  assert.equal(form.querySelector('textarea').attributes['aria-label'], 'Task notes');
  assert.equal(form.querySelector('textarea').value, '');
  form.querySelector('textarea').value = text;
  await form.emit('submit');
  assert.deepEqual(pending.tasks, [{ ...original[0], notes: text }, original[1]]);
  assert.equal(notesForm(rows(app)[0]).querySelector('textarea').value, text);
  assert.deepEqual(taskTitles(app), ['Plan first', 'Plan second']);
  assert.equal(app.querySelector('#task-filter').value, 'Completed');
  assert.equal(app.querySelector('#priority-filter').value, 'High');
  assert.equal(app.querySelector('#due-from').value, '2024-02-29');
  assert.equal(app.querySelector('#due-through').value, '2024-03-01');
  assert.equal(app.querySelector('#task-search').value, 'plan');
  await search(app, 'task', 'literal');
  assert.equal(rows(app).length, 0);
  await search(app, 'task', 'plan');

  // Re-evaluate with filters selected while the notes request is pending.
  let release;
  pending.wait = new Promise(resolve => { release = resolve; });
  form = notesForm(rows(app)[0]);
  form.querySelector('textarea').value = text + '\nNext line';
  const save = form.emit('submit');
  await search(app, 'task', 'second');
  release();
  await save;
  delete pending.wait;
  assert.deepEqual(taskTitles(app), ['Plan second']);
  assert.equal(app.querySelector('#task-search').value, 'second');
  await search(app, 'task', 'plan');
  const savedText = text + '\nNext line';
  await moveForm(rows(app)[0]).emit('submit');
  assert.deepEqual(taskTitles(app), ['Plan second']);
  await app.querySelector('#projects').emit('click');
  await settled();
  await control(rows(app)[1], 'Open project').emit('click');
  await settled();
  assert.equal(notesForm(rows(app)[0]).querySelector('textarea').value, savedText);
  await moveForm(rows(app)[0]).emit('submit');
  await app.querySelector('#projects').emit('click');
  await settled();
  await control(rows(app)[0], 'Archive project').emit('click');
  await filter(app, 'Archived');
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  assert.deepEqual(taskTitles(app), ['Plan first', 'Plan second']);
  form = notesForm(rows(app)[0]);
  assert.equal(form.querySelector('textarea').value, savedText);
  assert.equal(form.querySelector('textarea').disabled, true);
  assert.equal(form.querySelector('button').disabled, true);
  await form.emit('submit');
  assert.equal(pending.tasks.find(task => task.id === 1).notes, savedText);
  await search(app, 'task', 'first');
  assert.deepEqual(taskTitles(app), ['Plan first']);
  await app.querySelector('#projects').emit('click');
  await settled();
  await control(rows(app)[0], 'Restore project').emit('click');
  await filter(app, 'Active');
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  form = notesForm(rows(app)[0]);
  assert.equal(form.querySelector('textarea').disabled, false);
  assert.equal(form.querySelector('button').disabled, false);
  form.querySelector('textarea').value = '';
  await form.emit('submit');
  assert.equal(notesForm(rows(app)[0]).querySelector('textarea').value, '');
  assert.deepEqual(pending.tasks.find(task => task.id === 1), original[0]);
  app = await browser(new Map(), projects, pending);
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  assert.deepEqual(taskTitles(app), ['Plan first', 'Plan second']);
  assert.equal(notesForm(rows(app)[0]).querySelector('textarea').value, '');
  const create = app.querySelector('form');
  create.querySelector('input').value = 'New task';
  await create.emit('submit');
  assert.equal(notesForm(rows(app)[2]).querySelector('textarea').value, '');
});

test('Deleted filter intersects all controls, restores reserved order and disables editing', async () => {
  const projects = [project(), { ...project(), id: 2, name: 'Destination' }];
  const pending = { tasks: [
    { id: 1, project_id: 1, title: 'Plan first', completed: true, priority: 'High', due_date: '2024-02-29', notes: '  Notes\n雪 <b>literal</b>  ', deleted: false },
    { id: 2, project_id: 1, title: 'Plan second', completed: false, priority: 'Low', due_date: '', notes: '', deleted: false },
    { id: 3, project_id: 1, title: 'Other', completed: false, priority: 'High', due_date: '2024-03-01', notes: '', deleted: false },
  ] };
  const originals = structuredClone(pending.tasks);
  const app = await browser(new Map(), projects, pending);
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  assert.deepEqual(app.querySelector('#task-filter').children.map(option => option.textContent),
    ['All', 'Open', 'Completed', 'Deleted']);
  await filter(app, 'Completed');
  await priorityFilter(app, 'High');
  await dueRange(app, '2024-02-29', '2024-03-01');
  await search(app, 'task', 'plan');
  await control(rows(app)[0], 'Delete task').emit('click');
  assert.equal(rows(app).length, 0);
  function retained(completion) {
    assert.equal(app.querySelector('#task-filter').value, completion);
    assert.equal(app.querySelector('#priority-filter').value, 'High');
    assert.equal(app.querySelector('#due-from').value, '2024-02-29');
    assert.equal(app.querySelector('#due-through').value, '2024-03-01');
    assert.equal(app.querySelector('#task-search').value, 'plan');
  }
  retained('Completed');
  assert.deepEqual(pending.tasks[0], { ...originals[0], deleted: true });
  await filter(app, 'All');
  assert.equal(rows(app).length, 0);
  await filter(app, 'Open');
  assert.equal(rows(app).length, 0);
  await filter(app, 'Deleted');
  assert.deepEqual(taskTitles(app), ['Plan first']);
  const deletedRow = rows(app)[0];
  function disabledControls(element) {
    for (const child of element.children) {
      if (['input', 'textarea', 'select', 'button'].includes(child.tag)) {
        assert.equal(child.disabled, child.textContent !== 'Restore task');
      }
      disabledControls(child);
    }
  }
  disabledControls(deletedRow);
  assert.equal(notesForm(deletedRow).querySelector('textarea').value, originals[0].notes);
  assert.equal(deletedRow.querySelector('input').checked, true);
  await notesForm(deletedRow).emit('submit');
  await moveForm(deletedRow).emit('submit');
  assert.deepEqual(pending.tasks[0], { ...originals[0], deleted: true });
  await priorityFilter(app, 'Low');
  assert.equal(rows(app).length, 0);
  await priorityFilter(app, 'High');
  await dueRange(app, '2024-03-01', '');
  assert.equal(rows(app).length, 0);
  await dueRange(app, '2024-02-29', '2024-03-01');
  await search(app, 'task', 'other');
  assert.equal(rows(app).length, 0);
  await search(app, 'task', 'plan');
  const defaults = app.querySelector('#default-task-priority');
  defaults.value = 'Low';
  await defaults.emit('change');
  const create = app.querySelector('form');
  create.querySelector('input').value = 'New task';
  await create.emit('submit');
  retained('Deleted');
  await control(rows(app)[0], 'Restore task').emit('click');
  assert.equal(rows(app).length, 0);
  retained('Deleted');
  assert.deepEqual(pending.tasks[0], originals[0]);
  await filter(app, 'Completed');
  assert.deepEqual(taskTitles(app), ['Plan first']);
  assert.equal(notesForm(rows(app)[0]).querySelector('textarea').disabled, false);
  await filter(app, 'All');
  await priorityFilter(app, 'All');
  await dueRange(app, '', '');
  await search(app, 'task', '');
  assert.deepEqual(taskTitles(app), ['Plan first', 'Plan second', 'Other', 'New task']);
  await control(rows(app)[0], 'Delete task').emit('click');
  await app.querySelector('#projects').emit('click');
  await settled();
  await control(rows(app)[0], 'Archive project').emit('click');
  await filter(app, 'Archived');
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  assert.equal(control(rows(app)[0], 'Delete task').disabled, true);
  await filter(app, 'Deleted');
  assert.deepEqual(taskTitles(app), ['Plan first']);
  assert.equal(control(rows(app)[0], 'Restore task').disabled, true);
  await control(rows(app)[0], 'Restore task').emit('click');
  assert.equal(pending.tasks[0].deleted, true);
  await search(app, 'task', 'plan');
  assert.deepEqual(taskTitles(app), ['Plan first']);
  await app.querySelector('#projects').emit('click');
  await settled();
  await control(rows(app)[0], 'Restore project').emit('click');
  await filter(app, 'Active');
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  await filter(app, 'Deleted');
  assert.equal(control(rows(app)[0], 'Restore task').disabled, false);
  await control(rows(app)[0], 'Restore task').emit('click');
  assert.equal(rows(app).length, 0);
  await filter(app, 'All');
  assert.deepEqual(taskTitles(app), ['Plan first', 'Plan second', 'Other', 'New task']);
  assert.deepEqual(pending.tasks.slice(0, 3), originals);
});
