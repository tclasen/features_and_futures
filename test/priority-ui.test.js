import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { isValidDueDate } from '../date-validation.js';

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

async function setup(fetch, keepProjectList = false) {
  const app = new Element('main');
  const context = vm.createContext({
    document: {
      querySelector: () => app,
      createElement: tag => new Element(tag),
    },
    location: { pathname: '/' },
    fetch,
    isValidDueDate,
  });
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  vm.runInContext(`${source.replace(/^import .*;\n/, '')}\nglobalThis.priorityControl = taskPriorityControl;\nglobalThis.renderTasks = renderTasks;`, context);
  // Let the initial project-list render finish before exercising project controls.
  await new Promise(resolve => setImmediate(resolve));
  if (!keepProjectList) app.replaceChildren();
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

async function projectUI(archived = false, dueDates = [], projects = []) {
  const tasks = [
    { id: 1, title: 'High open', priority: 'High', completed: false },
    { id: 2, title: 'Low done', priority: 'Low', completed: true },
    { id: 3, title: 'Normal open', priority: 'Normal', completed: false },
    { id: 4, title: 'High done', priority: 'High', completed: true },
    { id: 5, title: 'Low open', priority: 'Low', completed: false },
    { id: 6, title: 'Normal done', priority: 'Normal', completed: true },
  ];
  tasks.forEach((task, index) => { task.due_date = dueDates[index] ?? ''; });
  const requests = [];
  const { app, renderTasks } = await setup(async (path, options) => {
    let body = [];
    if (path.endsWith('/tasks')) body = tasks;
    if (path === '/api/projects') body = projects;
    if (options) {
      const changes = JSON.parse(options.body);
      requests.push({ path, changes });
      body = options.method === 'POST'
        ? { id: tasks.length + 1, ...changes, priority: 'Normal', completed: false, due_date: '' }
        : { ...tasks.find(task => path.endsWith(`/${task.id}`)), ...changes };
    }
    return { ok: true, json: async () => body };
  });
  const project = { id: 1, archived, default_priority: 'Normal' };
  await renderTasks(project);
  const nodes = () => descendants(app);
  const byId = id => nodes().find(node => node.id === id);
  const rows = () => nodes().filter(node => node.dataset.testid === 'task-row');
  const titles = () => rows().map(row => row.children[0].textContent);
  const change = async (id, value) => {
    const control = byId(id);
    control.value = value;
    await control.listeners.change();
  };
  return { app, project, tasks, requests, nodes, byId, rows, titles, change };
}

test('move controls list only eligible destinations and retain source filters after moving', async () => {
  const projects = [
    { id: 1, name: 'Source', archived: false },
    { id: 2, name: 'Renamed destination', archived: false },
    { id: 3, name: 'Archived', archived: true },
    { id: 4, name: 'Last destination', archived: false },
  ];
  const ui = await projectUI(false, ['2024-01-01', '', '', '2024-01-02'], projects);
  await ui.change('task-filter', 'All');
  await ui.change('priority-filter', 'High');
  ui.byId('due-from').value = '2024-01-01';
  ui.byId('due-through').value = '2024-01-02';
  const rangeForm = ui.nodes().find(node => node.children.includes(ui.byId('due-from')));
  rangeForm.listeners.submit({ preventDefault() {} });
  assert.deepEqual(ui.titles(), ['High open', 'High done']);
  const select = ui.byId('destination-project-1');
  const moveForm = ui.rows()[0].children.find(node => node.children.includes(select));
  assert.equal(moveForm.children[0].textContent, 'Destination project');
  assert.equal(moveForm.children[0].htmlFor, select.id);
  assert.deepEqual(Array.from(select.children, option => [option.value, option.textContent]),
    [['2', 'Renamed destination'], ['4', 'Last destination']]);
  assert.equal(select.disabled, false);
  assert.equal(moveForm.children[2].textContent, 'Move task');
  select.value = '4';
  await moveForm.listeners.submit({ preventDefault() {} });
  assert.deepEqual(ui.requests, [{ path: '/api/projects/1/tasks/1/move', changes: { destination_project_id: 4 } }]);
  assert.deepEqual(ui.titles(), ['High done']);
  assert.equal(ui.byId('task-filter').value, 'All');
  assert.equal(ui.byId('priority-filter').value, 'High');
  assert.equal(ui.byId('due-from').value, '2024-01-01');
  assert.equal(ui.byId('due-through').value, '2024-01-02');
  await ui.change('priority-filter', 'All');
  assert.deepEqual(ui.titles(), ['High done']);
  for (const disabledUI of [await projectUI(true, [], projects), await projectUI(false, [], projects.slice(0, 1))]) {
    for (const row of disabledUI.rows()) {
      const form = row.children.find(node => node.children[0]?.textContent === 'Destination project');
      assert.equal(form.children[1].disabled, true);
      assert.equal(form.children[2].disabled, true);
      await form.listeners.submit({ preventDefault() {} });
    }
    assert.equal(disabledUI.requests.length, 0);
  }
  const restored = await projectUI(false, [], projects);
  assert.equal(restored.byId('destination-project-1').disabled, false);
});

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

test('due-date controls save and clear without resetting filters', async () => {
  const ui = await projectUI();
  await ui.change('task-filter', 'Open');
  await ui.change('priority-filter', 'High');
  const input = ui.byId('task-due-date-1');
  const form = ui.rows()[0].children.find(node => node.children.includes(input));
  assert.equal(input.type, 'text');
  assert.equal(input.value, '');
  assert.equal(form.children[0].textContent, 'Task due date');
  assert.equal(form.children[0].htmlFor, input.id);
  assert.equal(form.children[2].textContent, 'Save due date');
  for (const value of ['2024-02-29', '']) {
    input.value = value;
    await form.listeners.submit({ preventDefault() {} });
    assert.equal(ui.tasks[0].due_date, value);
    assert.equal(input.value, value);
    assert.deepEqual(ui.titles(), ['High open']);
    assert.equal(ui.byId('task-due-date-1').value, value);
    assert.equal(ui.byId('task-filter').value, 'Open');
    assert.equal(ui.byId('priority-filter').value, 'High');
  }
  const rename = ui.rows()[0].children.find(node => node.tagName === 'form');
  input.value = '2025-01-01';
  await form.listeners.submit({ preventDefault() {} });
  rename.children[1].value = 'Renamed';
  await rename.listeners.submit({ preventDefault() {} });
  assert.equal(ui.byId('task-due-date-1').value, '2025-01-01');
  assert.equal(ui.tasks[0].priority, 'High');
  assert.equal(ui.tasks[0].completed, false);
  const archived = await projectUI(true);
  for (const row of archived.rows()) {
    const dueForm = row.children.find(node => node.children.some(child => child.name === 'due_date'));
    assert.equal(dueForm.children[1].disabled, true);
    assert.equal(dueForm.children[2].disabled, true);
  }
});

test('invalid due-date saves display an alert and preserve the saved value', async () => {
  const task = { id: 1, title: 'Saved', completed: false, priority: 'Normal', due_date: '2024-02-29' };
  const { app, renderTasks } = await setup(async (path, options) => ({
    ok: !options,
    json: async () => options ? { error: 'Due date must be a valid YYYY-MM-DD date' } :
      path.endsWith('/tasks') ? [task] : [],
  }));
  await renderTasks({ id: 1, archived: false, default_priority: 'Normal' });
  const input = descendants(app).find(node => node.name === 'due_date');
  const form = descendants(app).find(node => node.children.includes(input));
  input.value = '2023-02-29';
  await form.listeners.submit({ preventDefault() {} });
  assert.equal(input.value, '2024-02-29');
  assert.equal(task.due_date, '2024-02-29');
  assert.equal(form.children[2].disabled, false);
  assert.equal(descendants(app).find(node => node.attributes.role === 'alert').textContent,
    'Due date must be a valid YYYY-MM-DD date');
});

test('project default control saves independently without changing tasks or filters', async () => {
  const ui = await projectUI();
  const select = ui.byId('default-task-priority');
  assert.equal(ui.nodes().find(node => node.htmlFor === select.id).textContent, 'Default task priority');
  assert.deepEqual(Array.from(select.children, option => option.textContent), ['Low', 'Normal', 'High']);
  assert.equal(select.value, 'Normal');
  assert.equal(select.disabled, false);
  await ui.change('task-filter', 'Open');
  await ui.change('priority-filter', 'High');
  const original = JSON.stringify(ui.tasks);
  const rows = ui.rows();
  await ui.change(select.id, 'Low');
  assert.equal(ui.project.default_priority, 'Low');
  assert.equal(select.value, 'Low');
  assert.equal(select.disabled, false);
  assert.equal(ui.byId('task-filter').value, 'Open');
  assert.equal(ui.byId('priority-filter').value, 'High');
  assert.deepEqual(ui.rows(), rows);
  assert.equal(JSON.stringify(ui.tasks), original);
  assert.deepEqual(ui.requests, [{ path: '/api/projects/1', changes: { default_priority: 'Low' } }]);
});

test('default control rolls back failed saves and displays restored values', async () => {
  const { app, renderTasks } = await setup(async (path, options) => ({
    ok: !options,
    json: async () => options ? { error: 'Unable to save' } : [],
  }));
  const project = { id: 1, archived: false, default_priority: 'High' };
  await renderTasks(project);
  let select = descendants(app).find(node => node.id === 'default-task-priority');
  assert.equal(select.value, 'High');
  select.value = 'Low';
  await select.listeners.change();
  assert.equal(select.value, 'High');
  assert.equal(project.default_priority, 'High');
  assert.equal(select.disabled, false);
  app.replaceChildren();
  await renderTasks({ ...project, archived: true });
  select = descendants(app).find(node => node.id === 'default-task-priority');
  assert.equal(select.value, 'High');
  assert.equal(select.disabled, true);
  app.replaceChildren();
  await renderTasks(project);
  select = descendants(app).find(node => node.id === 'default-task-priority');
  assert.equal(select.value, 'High');
  assert.equal(select.disabled, false);
});

test('archived projects keep both filters usable and task editing disabled', async () => {
  const ui = await projectUI(true);
  const original = JSON.stringify(ui.tasks);
  assert.equal(ui.byId('default-task-priority').disabled, true);
  assert.equal(ui.byId('default-task-priority').value, 'Normal');
  assert.notEqual(ui.byId('task-filter').disabled, true);
  assert.notEqual(ui.byId('priority-filter').disabled, true);
  await ui.change('task-filter', 'Completed');
  await ui.change('priority-filter', 'Normal');
  assert.deepEqual(ui.titles(), ['Normal done']);
  const controls = descendants(ui.rows()[0]).filter(node =>
    ['input', 'button', 'select'].includes(node.tagName));
  assert.equal(controls.length, 8);
  assert.ok(controls.every(control => control.disabled));
  assert.equal(JSON.stringify(ui.tasks), original);
  assert.equal(ui.requests.length, 0);
});

function applyRange(ui, from, through) {
  ui.byId('due-from').value = from;
  ui.byId('due-through').value = through;
  const form = ui.nodes().find(node => node.children.includes(ui.byId('due-from')));
  form.listeners.submit({ preventDefault() {} });
}

async function saveDate(ui, id, value) {
  const input = ui.byId(`task-due-date-${id}`);
  input.value = value;
  const form = ui.nodes().find(node => node.children.includes(input));
  await form.listeners.submit({ preventDefault() {} });
}

const dates = ['2024-02-28', '', '2024-02-29', '2024-03-01', '0001-01-01', '9999-12-31'];

test('inclusive due ranges intersect both filters without changing task data', async () => {
  const ui = await projectUI(false, dates);
  const original = JSON.stringify(ui.tasks);
  for (const [id, label] of [['due-from', 'Due from'], ['due-through', 'Due through']]) {
    assert.equal(ui.byId(id).value, '');
    assert.equal(ui.byId(id).type, 'text');
    assert.equal(ui.nodes().find(node => node.htmlFor === id).textContent, label);
  }
  assert.ok(ui.nodes().some(node => node.textContent === 'Apply due range' && node.type === 'submit'));
  for (const [from, through] of [['', ''], ['2024-02-28', '2024-03-01'],
    ['2024-02-29', '2024-02-29'], ['', '2024-02-29'], ['2024-03-01', ''],
    ['0001-01-01', '9999-12-31']]) {
    for (const completion of ['All', 'Open', 'Completed']) {
      await ui.change('task-filter', completion);
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        await ui.change('priority-filter', priority);
        applyRange(ui, from, through);
        assert.equal(ui.byId('task-filter').value, completion);
        assert.equal(ui.byId('priority-filter').value, priority);
        assert.deepEqual(ui.titles(), ui.tasks.filter(task =>
          (completion === 'All' || task.completed === (completion === 'Completed')) &&
          (priority === 'All' || task.priority === priority) &&
          (!(from || through) || (task.due_date && (!from || task.due_date >= from) &&
            (!through || task.due_date <= through)))).map(task => task.title));
      }
    }
  }
  assert.equal(JSON.stringify(ui.tasks), original);
  assert.equal(ui.requests.length, 0);
});

test('invalid ranges preserve applied membership and drafts do not affect other filters', async () => {
  const ui = await projectUI(false, dates);
  applyRange(ui, ' 2024-02-28 ', ' 2024-03-01 ');
  assert.equal(ui.byId('due-from').value, '2024-02-28');
  assert.equal(ui.byId('due-through').value, '2024-03-01');
  for (const [from, through, error] of [
    ...['0000-01-01', '10000-01-01', '1900-02-29', '2024-04-31', '2024-2-29',
      '2024-01-00', '2024-13-01', '2024-02-29T00:00:00Z', 'invalid'].flatMap(date =>
      [[date, '', 'Due range must use valid YYYY-MM-DD dates'],
        ['', date, 'Due range must use valid YYYY-MM-DD dates']]),
    ['2024-03-01', '2024-02-29', 'Due from must not be after Due through'],
  ]) {
    const before = ui.rows();
    applyRange(ui, from, through);
    assert.deepEqual(ui.rows(), before);
    assert.equal(ui.nodes().filter(node => node.attributes.role === 'alert').at(-1).textContent, error);
  }
  await ui.change('task-filter', 'Open');
  assert.deepEqual(ui.titles(), ['High open', 'Normal open']);
  await ui.change('priority-filter', 'Normal');
  assert.deepEqual(ui.titles(), ['Normal open']);
  ui.byId('due-from').value = '9999-12-31';
  await ui.change('priority-filter', 'All');
  assert.deepEqual(ui.titles(), ['High open', 'Normal open']);
  applyRange(ui, '  ', '');
  assert.deepEqual(ui.titles(), ['High open', 'Normal open', 'Low open']);
});

test('saved edits reapply all filters while retaining the applied range', async () => {
  const ui = await projectUI(false, dates);
  applyRange(ui, '2024-02-28', '2024-03-01');
  await ui.change('task-filter', 'Open');
  await ui.change('priority-filter', 'High');
  const rename = ui.rows()[0].children.find(node => node.tagName === 'form');
  rename.children[1].value = 'Renamed high';
  await rename.listeners.submit({ preventDefault() {} });
  assert.deepEqual(ui.titles(), ['Renamed high']);
  assert.equal(ui.tasks[0].due_date, dates[0]);
  await ui.change('default-task-priority', 'Low');
  const createForm = ui.nodes().find(node => node.children.includes(ui.byId('task-title')));
  ui.byId('task-title').value = 'New undated';
  await createForm.listeners.submit({ preventDefault() {} });
  assert.deepEqual(ui.titles(), ['Renamed high']);
  await saveDate(ui, 1, '2024-03-02');
  assert.deepEqual(ui.titles(), []);
  await ui.change('priority-filter', 'All');
  assert.deepEqual(ui.titles(), ['Normal open']);
  await saveDate(ui, 3, '');
  assert.deepEqual(ui.titles(), []);
  applyRange(ui, '', '');
  await saveDate(ui, 3, '2024-02-29');
  applyRange(ui, '2024-02-28', '2024-03-01');
  await ui.change('task-priority-3', 'High');
  await ui.change('priority-filter', 'High');
  assert.deepEqual(ui.titles(), ['Normal open']);
  const checkbox = ui.rows()[0].children[1];
  checkbox.checked = true;
  await checkbox.listeners.change();
  assert.deepEqual(ui.titles(), []);
  await ui.change('task-filter', 'Completed');
  assert.deepEqual(ui.titles(), ['Normal open', 'High done']);
  await ui.change('task-priority-3', 'Low');
  assert.deepEqual(ui.titles(), ['High done']);
  assert.equal(ui.byId('task-filter').value, 'Completed');
  assert.equal(ui.byId('priority-filter').value, 'High');
  assert.equal(ui.byId('due-from').value, '2024-02-28');
  assert.equal(ui.byId('due-through').value, '2024-03-01');
});

test('archived due ranges remain usable and reopening starts with empty boundaries', async () => {
  const ui = await projectUI(true, dates);
  const original = JSON.stringify(ui.tasks);
  assert.notEqual(ui.byId('due-from').disabled, true);
  assert.notEqual(ui.byId('due-through').disabled, true);
  assert.notEqual(ui.nodes().find(node => node.textContent === 'Apply due range').disabled, true);
  applyRange(ui, '2024-02-29', '2024-03-01');
  await ui.change('task-filter', 'Completed');
  await ui.change('priority-filter', 'High');
  assert.deepEqual(ui.titles(), ['High done']);
  assert.ok(descendants(ui.rows()[0]).filter(node =>
    ['input', 'button', 'select'].includes(node.tagName)).every(node => node.disabled));
  assert.equal(JSON.stringify(ui.tasks), original);
  assert.equal(ui.requests.length, 0);
  const reopened = await projectUI(false, dates);
  assert.equal(reopened.byId('due-from').value, '');
  assert.equal(reopened.byId('due-through').value, '');
  assert.equal(reopened.byId('task-filter').value, 'All');
  assert.equal(reopened.byId('priority-filter').value, 'All');
  assert.equal(reopened.rows().length, 6);
});

function submitSearch(app, kind, query) {
  const input = descendants(app).find(node => node.id === `${kind}-search`);
  input.value = query;
  const form = descendants(app).find(node => node.children.includes(input));
  form.listeners.submit({ preventDefault() {} });
  return input;
}

test('project search is applied, ASCII-only, and intersects archive filtering', async () => {
  const projects = [
    { id: 1, name: 'Alpha  Team', archived: false, total: 2, completed: 1 },
    { id: 2, name: 'ALPHA Team', archived: false, total: 0, completed: 0 },
    { id: 3, name: 'Alpha archive', archived: true, total: 3, completed: 2 },
    { id: 4, name: 'Älpha', archived: false, total: 0, completed: 0 },
  ];
  const fetch = async () => ({ ok: true, json: async () => projects });
  const { app } = await setup(fetch, true);
  const rows = () => descendants(app).filter(node => node.dataset.testid === 'project-row');
  const names = () => rows().map(row => row.children[0].textContent);
  assert.deepEqual(names(), ['Alpha  Team', 'ALPHA Team', 'Älpha']);
  const input = descendants(app).find(node => node.id === 'project-search');
  assert.equal(input.type, 'text');
  assert.equal(descendants(app).find(node => node.htmlFor === input.id).textContent, 'Project search');
  input.value = 'not applied';
  assert.equal(rows().length, 3);
  submitSearch(app, 'project', '  aLpHa  ');
  assert.deepEqual(names(), ['Alpha  Team', 'ALPHA Team']);
  assert.equal(rows()[0].children[1].textContent, '1/2 completed');
  const filter = descendants(app).find(node => node.id === 'project-filter');
  filter.value = 'Archived';
  filter.listeners.change();
  assert.deepEqual(names(), ['Alpha archive']);
  assert.equal(input.value, 'aLpHa');
  filter.value = 'Active';
  filter.listeners.change();
  submitSearch(app, 'project', 'alpha  team');
  assert.deepEqual(names(), ['Alpha  Team']);
  submitSearch(app, 'project', 'älpha');
  assert.deepEqual(names(), []);
  submitSearch(app, 'project', '  ');
  assert.equal(rows().length, 3);
  const reopened = await setup(fetch, true);
  assert.equal(descendants(reopened.app).find(node => node.id === 'project-search').value, '');
});

test('task search intersects all filters and edits reapply the retained query', async () => {
  const ui = await projectUI(false, ['2024-01-01', '', '', '2024-01-02']);
  const original = JSON.stringify(ui.tasks);
  const input = submitSearch(ui.app, 'task', '  hIGh  ');
  assert.equal(input.value, 'hIGh');
  assert.deepEqual(ui.titles(), ['High open', 'High done']);
  assert.equal(JSON.stringify(ui.tasks), original);
  await ui.change('task-filter', 'Open');
  await ui.change('priority-filter', 'High');
  ui.byId('due-from').value = '2024-01-01';
  const range = ui.nodes().find(node => node.children.includes(ui.byId('due-from')));
  range.listeners.submit({ preventDefault() {} });
  assert.deepEqual(ui.titles(), ['High open']);
  const rename = ui.rows()[0].children.find(node => node.tagName === 'form');
  rename.children[1].value = 'No longer matches';
  await rename.listeners.submit({ preventDefault() {} });
  assert.deepEqual(ui.titles(), []);
  assert.equal(input.value, 'hIGh');
  assert.equal(ui.byId('task-filter').value, 'Open');
  assert.equal(ui.byId('priority-filter').value, 'High');
  assert.equal(ui.byId('due-from').value, '2024-01-01');
  submitSearch(ui.app, 'task', '   ');
  assert.deepEqual(ui.titles(), ['No longer matches']);
  submitSearch(ui.app, 'task', 'no  longer');
  assert.deepEqual(ui.titles(), []);
  const archived = await projectUI(true);
  submitSearch(archived.app, 'task', 'LOW');
  assert.deepEqual(archived.titles(), ['Low done', 'Low open']);
  assert.equal(archived.byId('task-search').disabled, undefined);
  const reopened = await projectUI();
  assert.equal(reopened.byId('task-search').value, '');
  assert.equal(reopened.rows().length, 6);
});
