import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { normalizeDueRange, matchesDueRange } from '../due-date.js';

const source = (await readFile(new URL('../public/app.js', import.meta.url), 'utf8'))
  .replace(/^import .* from '\.\/due-date\.js';\n/, '');

// Exercise the browser script without external dependencies. This small DOM
// supports its labels, rows, and events; it does not verify browser layout.
class Element {
  constructor(tag) {
    this.tag = tag;
    this.attributes = {};
    this.children = [];
    this.listeners = new Map();
    this.value = '';
    this.disabled = false;
    this.checked = false;
    this.text = '';
  }
  set textContent(value) { this.text = value; this.children = []; }
  get textContent() { return this.text + this.children.map((child) => child.textContent).join(''); }
  setAttribute(name, value) {
    this.attributes[name] = value;
    if (name === 'value') this.value = value;
  }
  append(...children) {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
      if (this.tag === 'select' && this.children.length === 1) this.value = child.value;
    }
  }
  replaceChildren(...children) { this.text = ''; this.children = []; this.append(...children); }
  remove() { this.parent.children = this.parent.children.filter((child) => child !== this); }
  focus() {}
  addEventListener(event, handler) { this.listeners.set(event, handler); }
  async fire(event) {
    if (!this.disabled) await this.listeners.get(event)?.({ preventDefault() {} });
  }
  querySelector(selector) {
    assert.equal(selector, '[role="alert"]');
    return find(this, (node) => node.attributes.role === 'alert')[0] || null;
  }
}

function find(root, predicate) {
  return [root, ...root.children.flatMap((child) => find(child, () => true))].filter(predicate);
}

function taskTitle(row) {
  return find(row, (node) => node.tag === 'span')[0].textContent;
}

async function applyDueRange(ui, from, through) {
  ui.byId('due-from').value = from;
  ui.byId('due-through').value = through;
  await find(ui.app, (node) => node.attributes.class === 'due-range')[0].fire('submit');
}

test('due ranges intersect both filters, retain applied bounds, and reject invalid applications without writes', async () => {
  const project = { id: 1, name: 'Dates', archived: false, defaultPriority: 'Normal' };
  const tasks = [
    { id: 1, title: 'Undated', completed: false, priority: 'High', dueDate: '' },
    { id: 2, title: 'Before', completed: false, priority: 'High', dueDate: '2024-02-28' },
    { id: 3, title: 'From', completed: false, priority: 'High', dueDate: '2024-02-29' },
    { id: 4, title: 'Through', completed: true, priority: 'High', dueDate: '2024-03-01' },
    { id: 5, title: 'Other priority', completed: false, priority: 'Low', dueDate: '2024-03-01' },
    { id: 6, title: 'After', completed: false, priority: 'High', dueDate: '2024-03-02' },
  ];
  const respond = (path) => structuredClone(path.endsWith('/tasks') ? tasks : project);
  const ui = await page('/projects/1', respond);
  for (const [id, label] of [['due-from', 'Due from'], ['due-through', 'Due through']]) {
    assert.equal(ui.byId(id).attributes.type, 'text');
    assert.equal(ui.byId(id).value, '');
    assert.equal(find(ui.app, (node) => node.attributes.for === id)[0].textContent, label);
  }
  assert.deepEqual(ui.rows('task').map(taskTitle), tasks.map((task) => task.title));
  const completion = ui.byId('task-filter');
  const priority = ui.byId('priority-filter');
  completion.value = 'Open';
  await completion.fire('change');
  priority.value = 'High';
  await priority.fire('change');
  await applyDueRange(ui, ' 2024-02-29 ', '\t2024-03-01\n');
  assert.equal(ui.byId('due-from').value, '2024-02-29');
  assert.equal(ui.byId('due-through').value, '2024-03-01');
  assert.equal(completion.value, 'Open');
  assert.equal(priority.value, 'High');
  assert.deepEqual(ui.rows('task').map(taskTitle), ['From']);
  for (const [from, through, error] of [
    ['1900-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
    ['', '2024-04-31', 'Due range must use valid YYYY-MM-DD dates'],
    ['2024-2-29', '', 'Due range must use valid YYYY-MM-DD dates'],
    ['2024-03-01', '2024-02-29', 'Due from must not be after Due through'],
  ]) {
    const rows = ui.rows('task');
    await applyDueRange(ui, from, through);
    assert.equal(ui.app.querySelector('[role="alert"]').textContent, error);
    assert.deepEqual(ui.rows('task'), rows);
    assert.equal(completion.value, 'Open');
    assert.equal(priority.value, 'High');
  }
  // Edited or invalid draft boundaries never replace the applied range.
  ui.byId('due-from').value = '';
  ui.byId('due-through').value = '';
  completion.value = 'All';
  await completion.fire('change');
  assert.deepEqual(ui.rows('task').map(taskTitle), ['From', 'Through']);
  priority.value = 'All';
  await priority.fire('change');
  assert.deepEqual(ui.rows('task').map(taskTitle), ['From', 'Through', 'Other priority']);
  for (const [from, through, titles] of [
    ['2024-03-01', '', ['Through', 'Other priority', 'After']],
    ['', '2024-02-29', ['Before', 'From']],
    ['2024-02-29', '2024-02-29', ['From']],
    [' \t', '\n ', tasks.map((task) => task.title)],
  ]) {
    await applyDueRange(ui, from, through);
    assert.deepEqual(ui.rows('task').map(taskTitle), titles);
    assert.equal(ui.app.querySelector('[role="alert"]'), null);
  }
  assert.equal(ui.calls.length, 2);
  const reopened = await page('/projects/1', respond);
  assert.equal(reopened.byId('due-from').value, '');
  assert.equal(reopened.byId('due-through').value, '');
  assert.equal(reopened.byId('task-filter').value, 'All');
  assert.equal(reopened.byId('priority-filter').value, 'All');
});

test('saved task edits re-evaluate the combined filters while renames, defaults, and creation retain them', async () => {
  const project = { id: 1, name: 'Dates', archived: false, defaultPriority: 'Normal' };
  const tasks = [1, 2, 3, 4].map((id) => ({
    id, title: `Task ${id}`, completed: false, priority: 'High', dueDate: '2024-02-29',
  }));
  const respond = (path, options) => {
    if (!options) return structuredClone(path.endsWith('/tasks') ? tasks : project);
    const body = JSON.parse(options.body);
    if (path === '/api/projects/1') {
      Object.assign(project, body);
      return { ...project };
    }
    if (options.method === 'POST') {
      const task = { id: 5, ...body, completed: false, priority: project.defaultPriority, dueDate: '' };
      tasks.push(task);
      return { ...task };
    }
    const task = tasks.find((task) => path.endsWith(`/${task.id}`));
    if (Object.hasOwn(body, 'dueDate')) body.dueDate = body.dueDate.trim();
    Object.assign(task, body);
    return { ...task };
  };
  const ui = await page('/projects/1', respond);
  ui.byId('task-filter').value = 'Open';
  await ui.byId('task-filter').fire('change');
  ui.byId('priority-filter').value = 'High';
  await ui.byId('priority-filter').fire('change');
  await applyDueRange(ui, '2024-02-29', '2024-03-01');
  const assertFilters = () => {
    assert.equal(ui.byId('task-filter').value, 'Open');
    assert.equal(ui.byId('priority-filter').value, 'High');
    assert.equal(ui.byId('due-from').value, '2024-02-29');
    assert.equal(ui.byId('due-through').value, '2024-03-01');
  };
  const rowForm = (id, className) => find(ui.rows('task').find((row) =>
    find(row, (node) => node.attributes.id === `new-task-title-${id}`).length),
  (node) => node.attributes.class === className)[0];
  ui.byId('new-task-title-1').value = ' Renamed ';
  await rowForm(1, 'task-rename').fire('submit');
  assert.deepEqual(ui.rows('task').map(taskTitle), ['Renamed', 'Task 2', 'Task 3', 'Task 4']);
  assert.equal(ui.byId('task-due-date-1').value, '2024-02-29');
  assertFilters();
  ui.byId('new-project-name').value = 'Renamed project';
  await find(ui.app, (node) => node.attributes.class === 'project-rename')[0].fire('submit');
  assertFilters();
  ui.byId('default-task-priority').value = 'Low';
  await ui.byId('default-task-priority').fire('change');
  assertFilters();
  ui.byId('task-title').value = 'New undated';
  await find(ui.app, (node) => node.tag === 'form' && node.children.some((child) => child.attributes.id === 'task-title'))[0].fire('submit');
  assert.deepEqual(ui.rows('task').map(taskTitle), ['Renamed', 'Task 2', 'Task 3', 'Task 4']);
  assertFilters();
  ui.byId('task-due-date-1').value = '2024-03-02';
  await rowForm(1, 'task-due-date').fire('submit');
  assert.deepEqual(ui.rows('task').map(taskTitle), ['Task 2', 'Task 3', 'Task 4']);
  assertFilters();
  ui.byId('task-due-date-2').value = ' \t ';
  await rowForm(2, 'task-due-date').fire('submit');
  assert.deepEqual(ui.rows('task').map(taskTitle), ['Task 3', 'Task 4']);
  assertFilters();
  ui.byId('task-priority-3').value = 'Low';
  await ui.byId('task-priority-3').fire('change');
  assert.deepEqual(ui.rows('task').map(taskTitle), ['Task 4']);
  assertFilters();
  const checkbox = find(ui.rows('task')[0], (node) => node.attributes.type === 'checkbox')[0];
  checkbox.checked = true;
  await checkbox.fire('change');
  assert.equal(ui.rows('task').length, 0);
  assertFilters();
  await applyDueRange(ui, '', '');
  assert.deepEqual(ui.rows('task').map(taskTitle), ['Renamed', 'Task 2']);
  assert.equal(tasks[0].dueDate, '2024-03-02');
  assert.equal(tasks[1].dueDate, '');
  assert.equal(tasks[2].priority, 'Low');
  assert.equal(tasks[3].completed, true);
});

test('archived project ranges remain usable while all task editing controls remain disabled', async () => {
  const project = { id: 1, name: 'Archived dates', archived: true, defaultPriority: 'Normal' };
  const tasks = [
    { id: 1, title: 'Undated', completed: false, priority: 'High', dueDate: '' },
    { id: 2, title: 'Dated', completed: false, priority: 'High', dueDate: '2024-02-29' },
  ];
  const respond = (path) => structuredClone(path.endsWith('/tasks') ? tasks : project);
  const ui = await page('/projects/1', respond);
  assert.equal(ui.byId('due-from').disabled, false);
  assert.equal(ui.byId('due-through').disabled, false);
  assert.equal(ui.button('Apply due range').disabled, false);
  await applyDueRange(ui, '2024-02-29', '2024-02-29');
  ui.byId('task-filter').value = 'Open';
  await ui.byId('task-filter').fire('change');
  ui.byId('priority-filter').value = 'High';
  await ui.byId('priority-filter').fire('change');
  assert.deepEqual(ui.rows('task').map(taskTitle), ['Dated']);
  for (const control of find(ui.rows('task')[0], (node) => ['input', 'button', 'select'].includes(node.tag))) {
    assert.equal(control.disabled, true);
  }
  assert.equal(ui.calls.length, 2);
  project.archived = false;
  const restored = await page('/projects/1', respond);
  assert.equal(restored.byId('task-due-date-2').value, '2024-02-29');
  assert.equal(restored.byId('due-from').value, '');
  await applyDueRange(restored, '2024-02-29', '2024-02-29');
  assert.deepEqual(restored.rows('task').map(taskTitle), ['Dated']);
  for (const control of find(restored.rows('task')[0], (node) => ['input', 'button', 'select'].includes(node.tag))) {
    assert.equal(control.disabled, false);
  }
});

test('task rename validates, trims, updates accessible names, and preserves order and filtering', async () => {
  const project = { id: 1, name: 'Alpha', archived: false, defaultPriority: 'Normal' };
  const tasks = [
    { id: 1, title: 'Original', completed: true, priority: 'High' },
    { id: 2, title: 'Open task', completed: false, priority: 'Normal' },
  ];
  const ui = await page('/projects/1', (path, options) => {
    if (!options) return path.endsWith('/tasks') ? tasks : project;
    assert.equal(path, '/api/projects/1/tasks/1');
    assert.equal(options.method, 'PATCH');
    const body = JSON.parse(options.body);
    assert.deepEqual(body, { title: '<b>New title</b>' });
    return { ...tasks[0], ...body };
  });
  const row = ui.rows('task')[0];
  const input = ui.byId('new-task-title-1');
  const form = find(row, (node) => node.tag === 'form')[0];
  assert.equal(find(row, (node) => node.attributes.for === input.attributes.id)[0].textContent, 'New task title');
  assert.equal(input.disabled, false);
  assert.equal(ui.button('Rename task').disabled, false);
  input.value = ' \t\n ';
  await form.fire('submit');
  assert.equal(ui.app.querySelector('[role="alert"]').textContent, 'Task title is required');
  assert.equal(taskTitle(ui.rows('task')[0]), 'Original');
  assert.equal(ui.calls.length, 2);
  input.value = '  <b>New title</b> \n';
  await form.fire('submit');
  assert.equal(ui.app.querySelector('[role="alert"]'), null);
  assert.deepEqual(ui.rows('task').map(taskTitle), ['<b>New title</b>', 'Open task']);
  assert.equal(ui.byId('new-task-title-1').value, '<b>New title</b>');
  const checkbox = find(ui.rows('task')[0], (node) => node.attributes.type === 'checkbox')[0];
  assert.equal(checkbox.attributes['aria-label'], 'Complete <b>New title</b>');
  assert.equal(checkbox.checked, true);
  assert.equal(ui.byId('task-priority-1').value, 'High');
  const filter = ui.byId('task-filter');
  for (const [value, titles] of [['Open', ['Open task']], ['Completed', ['<b>New title</b>']], ['All', ['<b>New title</b>', 'Open task']]]) {
    filter.value = value;
    await filter.fire('change');
    assert.deepEqual(ui.rows('task').map(taskTitle), titles);
  }
  assert.equal(ui.window.location.href, '/projects/1');
});

async function page(pathname, respond) {
  const app = new Element('main');
  const window = { location: { pathname, href: pathname } };
  const document = { createElement: (tag) => new Element(tag), querySelector: () => app };
  const calls = [];
  const fetch = async (path, options) => {
    calls.push({ path, options });
    const body = await respond(path, options);
    return { ok: true, json: async () => body };
  };
  await runInNewContext(`(async () => {\n${source}\n})()`, { document, window, fetch, normalizeDueRange, matchesDueRange });
  return {
    app, window, calls,
    byId: (id) => find(app, (node) => node.attributes.id === id)[0],
    button: (text) => find(app, (node) => node.tag === 'button' && node.textContent === text)[0],
    rows: (type) => find(app, (node) => node.attributes['data-testid'] === `${type}-row`),
  };
}

test('project UI defaults to active and moves rows on archive and restore', async () => {
  const project = { id: 1, name: 'Alpha', archived: false, defaultPriority: 'Normal', completedCount: 1, totalCount: 2 };
  const archived = { id: 2, name: 'Beta', archived: true, defaultPriority: 'Normal', completedCount: 0, totalCount: 0 };
  const ui = await page('/', (path, options) => {
    if (!options) return [project, archived];
    assert.equal(options.method, 'PATCH');
    const target = path === '/api/projects/1' ? project : archived;
    return { ...target, ...JSON.parse(options.body) };
  });
  assert.equal(find(ui.app, (node) => node.tag === 'h1')[0].textContent, 'Workboard');
  const filter = ui.byId('project-filter');
  assert.equal(filter.value, 'Active');
  assert.deepEqual(filter.children.map((option) => option.textContent), ['Active', 'Archived']);
  assert.equal(find(ui.app, (node) => node.attributes.for === 'project-filter')[0].textContent, 'Project filter');
  assert.equal(ui.rows('project').length, 1);
  assert.equal(find(ui.rows('project')[0], (node) => node.attributes['data-testid'] === 'project-summary')[0].textContent, '1/2 completed');
  ui.byId('project-name').value = '   ';
  await find(ui.app, (node) => node.tag === 'form')[0].fire('submit');
  assert.equal(ui.app.querySelector('[role="alert"]').textContent, 'Project name is required');
  assert.equal(ui.calls.length, 1);
  await ui.button('Archive project').fire('click');
  assert.equal(ui.rows('project').length, 0);
  filter.value = 'Archived';
  await filter.fire('change');
  assert.equal(ui.rows('project').length, 2);
  assert.match(ui.rows('project')[0].textContent, /Alpha/);
  assert.match(ui.rows('project')[1].textContent, /Beta/);
  await ui.button('Open project').fire('click');
  assert.equal(ui.window.location.href, '/projects/1');
  await ui.button('Restore project').fire('click');
  assert.equal(ui.rows('project').length, 1);
  filter.value = 'Active';
  await filter.fire('change');
  assert.equal(ui.rows('project').length, 1);
  assert.match(ui.rows('project')[0].textContent, /Alpha/);
});

test('archived project UI shows saved tasks and keeps controls disabled through filtering', async () => {
  const project = { id: 1, name: 'Archived Alpha', archived: true, defaultPriority: 'Normal' };
  const tasks = [
    { id: 1, title: 'Done task', completed: true, priority: 'High' },
    { id: 2, title: 'Open task', completed: false, priority: 'Low' },
  ];
  const ui = await page('/projects/1', (path) => path.endsWith('/tasks') ? tasks : project);
  assert.equal(find(ui.app, (node) => node.tag === 'h1')[0].textContent, project.name);
  assert.ok(find(ui.app, (node) => node.tag === 'p' && node.textContent === 'Archived project').length);
  assert.equal(ui.button('Create task').disabled, true);
  assert.equal(ui.byId('new-project-name').disabled, true);
  assert.equal(ui.button('Rename project').disabled, true);
  ui.byId('new-project-name').value = 'Cannot rename';
  await find(ui.app, (node) => node.tag === 'form' && node.attributes.class === 'project-rename')[0].fire('submit');
  assert.equal(find(ui.app, (node) => node.attributes.for === 'task-title')[0].textContent, 'Task title');
  const filter = ui.byId('task-filter');
  assert.equal(filter.value, 'All');
  assert.deepEqual(filter.children.map((option) => option.textContent), ['All', 'Open', 'Completed']);
  for (const [value, titles] of [['All', ['Done task', 'Open task']], ['Open', ['Open task']], ['Completed', ['Done task']]]) {
    filter.value = value;
    await filter.fire('change');
    assert.deepEqual(ui.rows('task').map(taskTitle), titles);
    for (const row of ui.rows('task')) {
      const checkbox = find(row, (node) => node.attributes.type === 'checkbox')[0];
      assert.equal(checkbox.disabled, true);
      assert.equal(checkbox.attributes['aria-label'], `Complete ${taskTitle(row)}`);
      assert.equal(checkbox.checked, taskTitle(row) === 'Done task');
      const renameInput = find(row, (node) => node.attributes.name === 'title')[0];
      const renameButton = find(row, (node) => node.tag === 'button')[0];
      assert.equal(renameInput.disabled, true);
      assert.equal(renameButton.disabled, true);
      const priority = find(row, (node) => node.tag === 'select')[0];
      assert.equal(priority.disabled, true);
      assert.equal(priority.value, taskTitle(row) === 'Done task' ? 'High' : 'Low');
      await priority.fire('change');
      renameInput.value = 'Cannot rename';
      await find(row, (node) => node.tag === 'form')[0].fire('submit');
    }
  }
  ui.byId('task-title').value = 'Cannot create';
  await find(ui.app, (node) => node.tag === 'form' && node.children.some((child) => child.attributes.id === 'task-title'))[0].fire('submit');
  assert.equal(ui.calls.length, 2);
  await ui.button('Projects').fire('click');
  assert.equal(ui.window.location.href, '/');
});

test('active project UI validates and trims renames without changing its URL or tasks', async () => {
  const project = { id: 1, name: 'Original', archived: false, defaultPriority: 'Normal' };
  const tasks = [{ id: 1, title: 'Saved task', completed: true, priority: 'Normal' }];
  const ui = await page('/projects/1', (path, options) => {
    if (!options) return path.endsWith('/tasks') ? tasks : project;
    assert.equal(path, '/api/projects/1');
    assert.equal(options.method, 'PATCH');
    assert.deepEqual(JSON.parse(options.body), { name: 'New name' });
    return { ...project, name: 'New name' };
  });
  const input = ui.byId('new-project-name');
  const form = find(ui.app, (node) => node.tag === 'form' && node.attributes.class === 'project-rename')[0];
  assert.equal(find(ui.app, (node) => node.attributes.for === 'new-project-name')[0].textContent, 'New project name');
  assert.equal(input.disabled, false);
  assert.equal(ui.button('Rename project').disabled, false);
  input.value = ' \t\n ';
  await form.fire('submit');
  assert.equal(ui.app.querySelector('[role="alert"]').textContent, 'Project name is required');
  assert.equal(find(ui.app, (node) => node.tag === 'h1')[0].textContent, 'Original');
  assert.equal(ui.calls.length, 2);
  input.value = '  New name \n';
  await form.fire('submit');
  assert.equal(find(ui.app, (node) => node.tag === 'h1')[0].textContent, 'New name');
  assert.equal(input.value, 'New name');
  assert.equal(ui.app.querySelector('[role="alert"]'), null);
  assert.equal(ui.window.location.href, '/projects/1');
  assert.deepEqual(ui.rows('task').map(taskTitle), ['Saved task']);
  assert.equal(find(ui.rows('task')[0], (node) => node.attributes.type === 'checkbox')[0].checked, true);
});

test('task priority options save independently and survive completion filtering', async () => {
  const project = { id: 1, name: 'Alpha', archived: false, defaultPriority: 'Normal' };
  const tasks = [
    { id: 1, title: 'Done', completed: true, priority: 'Normal' },
    { id: 2, title: 'Open', completed: false, priority: 'Low' },
  ];
  const ui = await page('/projects/1', (path, options) => {
    if (!options) return path.endsWith('/tasks') ? tasks : project;
    assert.equal(path, '/api/projects/1/tasks/1');
    assert.equal(options.method, 'PATCH');
    assert.deepEqual(JSON.parse(options.body), { priority: 'High' });
    return { ...tasks[0], priority: 'High' };
  });
  const priority = ui.byId('task-priority-1');
  assert.equal(find(ui.rows('task')[0], (node) => node.attributes.for === priority.attributes.id)[0].textContent, 'Task priority');
  assert.deepEqual(priority.children.map((option) => option.textContent), ['Low', 'Normal', 'High']);
  assert.equal(priority.value, 'Normal');
  assert.equal(priority.disabled, false);
  priority.value = 'High';
  await priority.fire('change');
  assert.equal(priority.value, 'High');
  assert.equal(priority.disabled, false);
  assert.equal(ui.byId('task-priority-2').value, 'Low');
  assert.deepEqual(ui.rows('task').map(taskTitle), ['Done', 'Open']);
  assert.equal(find(ui.rows('task')[0], (node) => node.attributes.type === 'checkbox')[0].checked, true);
  const filter = ui.byId('task-filter');
  filter.value = 'Open';
  await filter.fire('change');
  assert.deepEqual(ui.rows('task').map(taskTitle), ['Open']);
  filter.value = 'Completed';
  await filter.fire('change');
  assert.deepEqual(ui.rows('task').map(taskTitle), ['Done']);
  assert.equal(ui.byId('task-priority-1').value, 'High');
  const restored = await page('/projects/1', (path) => path.endsWith('/tasks') ? tasks : project);
  assert.equal(restored.byId('task-priority-1').disabled, false);
  assert.equal(restored.byId('task-priority-1').value, 'High');
});

test('failed priority writes show an alert and restore the saved selection', async () => {
  const project = { id: 1, name: 'Alpha', archived: false, defaultPriority: 'Normal' };
  const tasks = [{ id: 1, title: 'Task', completed: false, priority: 'Normal' }];
  const ui = await page('/projects/1', (path, options) => {
    if (!options) return path.endsWith('/tasks') ? tasks : project;
    throw new Error('Unable to save priority');
  });
  const priority = ui.byId('task-priority-1');
  priority.value = 'High';
  await priority.fire('change');
  assert.equal(priority.value, 'Normal');
  assert.equal(priority.disabled, false);
  assert.equal(ui.app.querySelector('[role="alert"]').textContent, 'Unable to save priority');
});

test('completion and priority filters combine in creation order without writes, including archived projects', async () => {
  const tasks = [
    { id: 1, title: 'Low open', completed: false, priority: 'Low' },
    { id: 2, title: 'High done', completed: true, priority: 'High' },
    { id: 3, title: 'Normal open', completed: false, priority: 'Normal' },
    { id: 4, title: 'Low done', completed: true, priority: 'Low' },
    { id: 5, title: 'High open', completed: false, priority: 'High' },
    { id: 6, title: 'Normal done', completed: true, priority: 'Normal' },
    { id: 7, title: 'Low open later', completed: false, priority: 'Low' },
  ];
  const expected = {
    All: {
      All: tasks.map((task) => task.title),
      Low: ['Low open', 'Low done', 'Low open later'],
      Normal: ['Normal open', 'Normal done'],
      High: ['High done', 'High open'],
    },
    Open: {
      All: ['Low open', 'Normal open', 'High open', 'Low open later'],
      Low: ['Low open', 'Low open later'], Normal: ['Normal open'], High: ['High open'],
    },
    Completed: {
      All: ['High done', 'Low done', 'Normal done'],
      Low: ['Low done'], Normal: ['Normal done'], High: ['High done'],
    },
  };
  const original = structuredClone(tasks);
  for (const archived of [false, true, false]) {
    const project = { id: 1, name: 'Alpha', archived, defaultPriority: 'Normal', totalCount: 7, completedCount: 3 };
    const ui = await page('/projects/1', (path, options) => {
      assert.equal(options, undefined);
      return path.endsWith('/tasks') ? structuredClone(tasks) : project;
    });
    const completion = ui.byId('task-filter');
    const priority = ui.byId('priority-filter');
    assert.equal(completion.value, 'All');
    assert.equal(priority.value, 'All');
    assert.equal(priority.disabled, false);
    assert.equal(find(ui.app, (node) => node.attributes.for === 'priority-filter')[0].textContent, 'Priority filter');
    assert.deepEqual(priority.children.map((option) => option.textContent), ['All', 'Low', 'Normal', 'High']);
    for (const completionValue of ['All', 'Open', 'Completed']) {
      const priorPriority = priority.value;
      completion.value = completionValue;
      await completion.fire('change');
      assert.equal(priority.value, priorPriority);
      for (const priorityValue of ['All', 'Low', 'Normal', 'High']) {
        priority.value = priorityValue;
        await priority.fire('change');
        assert.equal(completion.value, completionValue);
        assert.deepEqual(ui.rows('task').map(taskTitle), expected[completionValue][priorityValue]);
        for (const row of ui.rows('task')) {
          for (const control of find(row, (node) => ['input', 'button', 'select'].includes(node.tag))) {
            assert.equal(control.disabled, archived);
          }
        }
      }
    }
    assert.equal(ui.calls.length, 2);
    assert.deepEqual(tasks, original);
  }
});

test('task edits re-evaluate both filters and renames preserve selections and matching membership', async () => {
  const project = { id: 1, name: 'Alpha', archived: false, defaultPriority: 'Normal' };
  const savedTasks = [
    { id: 1, title: 'First', completed: false, priority: 'High' },
    { id: 2, title: 'Second', completed: false, priority: 'High' },
    { id: 3, title: 'Third', completed: true, priority: 'Low' },
  ];
  const respond = (path, options) => {
    if (!options) {
      if (path.endsWith('/tasks')) return structuredClone(savedTasks);
      const summary = { ...project, totalCount: 3, completedCount: savedTasks.filter((task) => task.completed).length };
      return path === '/api/projects' ? [summary] : summary;
    }
    assert.equal(options.method, 'PATCH');
    const task = savedTasks.find((task) => path.endsWith(`/${task.id}`));
    Object.assign(task, JSON.parse(options.body));
    return { ...task };
  };
  const ui = await page('/projects/1', respond);
  const completion = ui.byId('task-filter');
  const priority = ui.byId('priority-filter');
  const assertFilters = () => {
    assert.equal(completion.value, 'Open');
    assert.equal(priority.value, 'High');
  };
  completion.value = 'Open';
  await completion.fire('change');
  priority.value = 'High';
  await priority.fire('change');
  assert.deepEqual(ui.rows('task').map(taskTitle), ['First', 'Second']);

  ui.byId('new-task-title-1').value = '  Renamed first  ';
  await find(ui.rows('task')[0], (node) => node.tag === 'form')[0].fire('submit');
  assertFilters();
  assert.deepEqual(ui.rows('task').map(taskTitle), ['Renamed first', 'Second']);
  assert.equal(ui.byId('task-priority-1').value, 'High');
  const checkbox = find(ui.rows('task')[0], (node) => node.attributes.type === 'checkbox')[0];
  assert.equal(checkbox.attributes['aria-label'], 'Complete Renamed first');
  assert.equal(checkbox.checked, false);
  checkbox.checked = true;
  await checkbox.fire('change');
  assertFilters();
  assert.deepEqual(ui.rows('task').map(taskTitle), ['Second']);

  const taskPriority = ui.byId('task-priority-2');
  taskPriority.value = 'Low';
  await taskPriority.fire('change');
  assertFilters();
  assert.deepEqual(ui.rows('task').map(taskTitle), []);
  assert.deepEqual(savedTasks, [
    { id: 1, title: 'Renamed first', completed: true, priority: 'High' },
    { id: 2, title: 'Second', completed: false, priority: 'Low' },
    { id: 3, title: 'Third', completed: true, priority: 'Low' },
  ]);
  priority.value = 'Low';
  await priority.fire('change');
  assert.deepEqual(ui.rows('task').map(taskTitle), ['Second']);
  completion.value = 'Completed';
  await completion.fire('change');
  assert.equal(priority.value, 'Low');
  assert.deepEqual(ui.rows('task').map(taskTitle), ['Third']);
  const completedCheckbox = find(ui.rows('task')[0], (node) => node.attributes.type === 'checkbox')[0];
  completedCheckbox.checked = false;
  await completedCheckbox.fire('change');
  assert.equal(completion.value, 'Completed');
  assert.equal(priority.value, 'Low');
  assert.deepEqual(ui.rows('task').map(taskTitle), []);

  const reloaded = await page('/projects/1', respond);
  assert.equal(reloaded.byId('task-filter').value, 'All');
  assert.equal(reloaded.byId('priority-filter').value, 'All');
  assert.deepEqual(reloaded.rows('task').map(taskTitle), ['Renamed first', 'Second', 'Third']);
  assert.equal(reloaded.byId('task-priority-2').value, 'Low');
  const list = await page('/', respond);
  const summary = find(list.rows('project')[0], (node) => node.attributes['data-testid'] === 'project-summary')[0];
  assert.equal(summary.textContent, '1/3 completed');
});

test('default priority saves without changing filters or existing rows and new tasks inherit it', async () => {
  const savedProject = { id: 1, name: 'Alpha', archived: false, defaultPriority: 'Normal' };
  const savedTasks = [
    { id: 1, title: 'Done', completed: true, priority: 'High' },
    { id: 2, title: 'Open', completed: false, priority: 'Normal' },
  ];
  const respond = (path, options) => {
    if (!options) return structuredClone(path.endsWith('/tasks') ? savedTasks : savedProject);
    const body = JSON.parse(options.body);
    if (options.method === 'PATCH') {
      assert.equal(path, '/api/projects/1');
      assert.deepEqual(body, { defaultPriority: 'Low' });
      savedProject.defaultPriority = body.defaultPriority;
      return { ...savedProject };
    }
    assert.equal(options.method, 'POST');
    assert.equal(path, '/api/projects/1/tasks');
    const task = { id: 3, title: body.title, completed: false, priority: savedProject.defaultPriority };
    savedTasks.push(task);
    return { ...task };
  };
  const ui = await page('/projects/1', respond);
  const select = ui.byId('default-task-priority');
  assert.equal(find(ui.app, (node) => node.attributes.for === 'default-task-priority')[0].textContent, 'Default task priority');
  assert.deepEqual(select.children.map((option) => option.textContent), ['Low', 'Normal', 'High']);
  assert.equal(select.value, 'Normal');
  assert.equal(select.disabled, false);
  const completion = ui.byId('task-filter');
  const priority = ui.byId('priority-filter');
  completion.value = 'Open';
  await completion.fire('change');
  priority.value = 'Normal';
  await priority.fire('change');
  const originalRows = ui.rows('task');
  select.value = 'Low';
  await select.fire('change');
  assert.equal(select.value, 'Low');
  assert.equal(select.disabled, false);
  assert.equal(completion.value, 'Open');
  assert.equal(priority.value, 'Normal');
  assert.deepEqual(ui.rows('task'), originalRows);
  assert.deepEqual(savedTasks.map((task) => task.priority), ['High', 'Normal']);
  ui.byId('task-title').value = 'Inherited low';
  await find(ui.app, (node) => node.tag === 'form' && node.children.some((child) => child.attributes.id === 'task-title'))[0].fire('submit');
  assert.equal(completion.value, 'Open');
  assert.equal(priority.value, 'Normal');
  assert.deepEqual(ui.rows('task').map(taskTitle), ['Open']);
  priority.value = 'Low';
  await priority.fire('change');
  assert.deepEqual(ui.rows('task').map(taskTitle), ['Inherited low']);
  assert.equal(ui.byId('task-priority-3').value, 'Low');
  for (const archived of [true, false]) {
    savedProject.archived = archived;
    const reloaded = await page('/projects/1', respond);
    const defaultSelect = reloaded.byId('default-task-priority');
    assert.equal(defaultSelect.value, 'Low');
    assert.equal(defaultSelect.disabled, archived);
    assert.deepEqual(reloaded.rows('task').map(taskTitle), ['Done', 'Open', 'Inherited low']);
    if (archived) {
      defaultSelect.value = 'High';
      await defaultSelect.fire('change');
      assert.equal(reloaded.calls.length, 2);
      assert.equal(savedProject.defaultPriority, 'Low');
    }
  }
});

test('failed default priority writes restore saved selection and preserve filters and tasks', async () => {
  const project = { id: 1, name: 'Alpha', archived: false, defaultPriority: 'High' };
  const tasks = [{ id: 1, title: 'Task', completed: false, priority: 'Normal' }];
  const ui = await page('/projects/1', (path, options) => {
    if (!options) return path.endsWith('/tasks') ? tasks : project;
    throw new Error('Unable to save default');
  });
  ui.byId('task-filter').value = 'Open';
  await ui.byId('task-filter').fire('change');
  ui.byId('priority-filter').value = 'Normal';
  await ui.byId('priority-filter').fire('change');
  const rows = ui.rows('task');
  const select = ui.byId('default-task-priority');
  select.value = 'Low';
  await select.fire('change');
  assert.equal(select.value, 'High');
  assert.equal(select.disabled, false);
  assert.equal(ui.byId('task-filter').value, 'Open');
  assert.equal(ui.byId('priority-filter').value, 'Normal');
  assert.deepEqual(ui.rows('task'), rows);
  assert.equal(ui.app.querySelector('[role="alert"]').textContent, 'Unable to save default');
});

test('due date controls save and clear without changing filters, membership, or other data', async () => {
  const project = { id: 1, name: 'Dates', archived: false, defaultPriority: 'Normal' };
  const tasks = [
    { id: 1, title: 'First', completed: true, priority: 'High', dueDate: '' },
    { id: 2, title: 'Second', completed: false, priority: 'Normal', dueDate: '2025-12-31' },
  ];
  const respond = (path, options) => {
    if (!options) return structuredClone(path.endsWith('/tasks') ? tasks : project);
    assert.equal(path, '/api/projects/1/tasks/1');
    const body = JSON.parse(options.body);
    if (body.dueDate === '2025-02-29') throw new Error('Due date must be a valid YYYY-MM-DD date');
    tasks[0].dueDate = body.dueDate.trim();
    return { ...tasks[0] };
  };
  const ui = await page('/projects/1', respond);
  assert.equal(ui.byId('task-due-date-1').value, '');
  assert.equal(ui.byId('task-due-date-2').value, '2025-12-31');
  ui.byId('task-filter').value = 'Completed';
  await ui.byId('task-filter').fire('change');
  ui.byId('priority-filter').value = 'High';
  await ui.byId('priority-filter').fire('change');
  const rows = ui.rows('task');
  const input = ui.byId('task-due-date-1');
  assert.equal(input.attributes.type, 'text');
  assert.equal(find(rows[0], (node) => node.attributes.for === input.attributes.id)[0].textContent, 'Task due date');
  for (const [value, expected] of [['  2024-02-29  ', '2024-02-29'], ['2025-02-29', '2024-02-29'], [' \t ', '']]) {
    ui.byId('task-due-date-1').value = value;
    const form = find(ui.rows('task')[0], (node) => node.attributes.class === 'task-due-date')[0];
    await form.fire('submit');
    assert.equal(tasks[0].dueDate, expected);
    if (value === '2025-02-29') {
      assert.equal(ui.app.querySelector('[role="alert"]').textContent, 'Due date must be a valid YYYY-MM-DD date');
    } else {
      assert.equal(ui.byId('task-due-date-1').value, expected);
      assert.equal(ui.app.querySelector('[role="alert"]'), null);
    }
    assert.deepEqual(ui.rows('task').map(taskTitle), ['First']);
    assert.equal(ui.byId('task-filter').value, 'Completed');
    assert.equal(ui.byId('priority-filter').value, 'High');
    assert.equal(ui.button('Save due date').disabled, false);
    assert.equal(tasks[0].title, 'First');
    assert.equal(tasks[0].completed, true);
    assert.equal(tasks[0].priority, 'High');
    assert.equal(tasks[1].dueDate, '2025-12-31');
  }
  for (const archived of [true, false]) {
    project.archived = archived;
    const reloaded = await page('/projects/1', respond);
    assert.equal(reloaded.byId('task-due-date-2').value, '2025-12-31');
    assert.equal(reloaded.byId('task-due-date-1').disabled, archived);
    assert.equal(reloaded.button('Save due date').disabled, archived);
    if (archived) {
      reloaded.byId('task-due-date-1').value = '2024-02-29';
      await find(reloaded.rows('task')[0], (node) => node.attributes.class === 'task-due-date')[0].fire('submit');
      assert.equal(reloaded.calls.length, 2);
    }
  }
});
