import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { validDueDate } from '../public/dates.js';

// Minimal DOM harness: execute the shipped browser script and its event handlers.
class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.listeners = {};
    this.value = '';
    this.hidden = false;
    this.disabled = false;
  }
  append(...nodes) {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
    }
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  async fire(name) { await this.listeners[name]?.({ preventDefault() {} }); }
  focus() {}
  remove() { this.parent.children = this.parent.children.filter((node) => node !== this); }
  querySelector(selector) {
    return this.find((node) => selector === '[role="alert"]' && node.attributes.role === 'alert');
  }
  find(predicate) {
    for (const node of this.children) {
      if (predicate(node)) return node;
      const nested = node.find(predicate);
      if (nested) return nested;
    }
    return null;
  }
}

const source = (await readFile(new URL('../public/app.js', import.meta.url), 'utf8'))
  .replace("import { validDueDate } from './dates.js';", '');

test('project default UI preserves filters and existing tasks, inherits on creation, and disables when archived', async () => {
  const project = { id: 7, name: 'Project', archived: 0, default_task_priority: 'Normal' };
  const tasks = [
    { id: 1, project_id: 7, title: 'Existing', completed: false, priority: 'High' },
    { id: 2, project_id: 7, title: 'Completed', completed: true, priority: 'Low' },
  ];
  let failUpdate = false;
  let mutations = 0;
  const fetch = async (path, options = {}) => {
    if (options.method) mutations++;
    if (options.method === 'PATCH') {
      if (failUpdate) return { ok: false, json: async () => ({ error: 'Update failed' }) };
      Object.assign(project, JSON.parse(options.body));
      return jsonResponse(project);
    }
    if (options.method === 'POST') {
      const task = { id: tasks.length + 1, project_id: 7, title: JSON.parse(options.body).title,
        completed: false, priority: project.default_task_priority };
      tasks.push(task);
      return jsonResponse(task);
    }
    return jsonResponse(path === '/api/projects' ? [project] : path === '/api/projects/7' ? project : tasks);
  };
  const { app } = await renderUI('/projects/7', fetch);
  const control = app.find((node) => node.id === 'default-task-priority');
  assert.equal(app.find((node) => node.htmlFor === control.id).textContent, 'Default task priority');
  assert.deepEqual(control.children.map((option) => option.textContent), ['Low', 'Normal', 'High']);
  assert.equal(control.value, 'Normal');
  assert.equal(control.disabled, false);
  const completion = app.find((node) => node.id === 'task-filter');
  const priority = app.find((node) => node.id === 'priority-filter');
  const list = app.find((node) => node.attributes['aria-label'] === 'Tasks');
  completion.value = 'Open';
  await completion.fire('change');
  priority.value = 'High';
  await priority.fire('change');
  const original = JSON.stringify(tasks);
  for (const value of ['Low', 'Normal', 'High']) {
    control.value = value;
    await control.fire('change');
    assert.equal(project.default_task_priority, value);
    assert.equal(control.disabled, false);
    assert.equal(completion.value, 'Open');
    assert.equal(priority.value, 'High');
    assert.deepEqual(list.children.map((row) => row.children[0].textContent), ['Existing']);
    assert.equal(JSON.stringify(tasks), original);
  }
  failUpdate = true;
  control.value = 'Low';
  await control.fire('change');
  assert.equal(control.value, 'High');
  assert.equal(app.querySelector('[role="alert"]').textContent, 'Update failed');
  failUpdate = false;
  const title = app.find((node) => node.id === 'task-title');
  title.value = 'Inherited';
  await title.parent.fire('submit');
  assert.deepEqual(list.children.map((row) => row.children[0].textContent), ['Existing', 'Inherited']);
  assert.equal(tasks[2].priority, 'High');
  control.value = 'Low';
  await control.fire('change');
  assert.equal(tasks[2].priority, 'High');
  for (const archived of [0, 1, 0]) {
    project.archived = archived;
    const reloaded = await renderUI('/projects/7', fetch);
    const saved = reloaded.app.find((node) => node.id === control.id);
    assert.equal(saved.value, 'Low');
    assert.equal(saved.disabled, Boolean(archived));
    if (archived) {
      const before = mutations;
      await saved.fire('change');
      assert.equal(mutations, before);
    }
  }
});

test('task UI validation, labels, filtering, creation order, and completion changes', async () => {
  const app = new Element('main');
  let tasks = [
    { id: 1, project_id: 7, title: 'Open task', completed: false, priority: 'Normal' },
    { id: 2, project_id: 7, title: 'Done task', completed: true, priority: 'Normal' },
  ];
  const requests = [];
  await vm.runInNewContext(source, {
    validDueDate,
    document: {
      querySelector: () => app,
      createElement: (tag) => new Element(tag),
    },
    window: { location: { pathname: '/projects/7' } },
    fetch: async (path, options = {}) => {
      requests.push({ path, options });
      let body;
      if (path === '/api/projects') body = [{ id: 7, name: 'Project seven' }];
      else if (path === '/api/projects/7') body = { id: 7, name: 'Project seven' };
      else if (options.method === 'POST') {
        const input = JSON.parse(options.body);
        body = { id: tasks.length + 1, project_id: 7, title: input.title, completed: false, priority: 'Normal' };
        tasks.push(body);
      } else if (options.method === 'PATCH') {
        const task = tasks.find((task) => path.endsWith(`/${task.id}`));
        task.completed = JSON.parse(options.body).completed;
        body = task;
      } else body = tasks;
      return { ok: true, json: async () => JSON.parse(JSON.stringify(body)) };
    },
  });

  assert.equal(app.find((node) => node.tag === 'h1').textContent, 'Project seven');
  assert.equal(app.find((node) => node.tag === 'button').textContent, 'Projects');
  const form = app.find((node) => node.tag === 'form');
  const input = app.find((node) => node.id === 'task-title');
  const filter = app.find((node) => node.id === 'task-filter');
  const list = app.find((node) => node.attributes['aria-label'] === 'Tasks');
  const visibleTitles = () => list.children.filter((row) => !row.hidden).map((row) => row.children[0].textContent);
  assert.equal(app.find((node) => node.htmlFor === input.id).textContent, 'Task title');
  assert.equal(app.find((node) => node.htmlFor === filter.id).textContent, 'Task filter');
  assert.equal(form.children[2].textContent, 'Create task');
  assert.equal(filter.value, 'All');
  assert.deepEqual(filter.children.map((option) => option.textContent), ['All', 'Open', 'Completed']);
  assert.deepEqual(visibleTitles(), ['Open task', 'Done task']);
  assert.ok(list.children.every((row) => row.dataset.testid === 'task-row'));
  assert.equal(list.children[0].children[1].attributes['aria-label'], 'Complete Open task');
  assert.equal(list.children[0].children[1].checked, false);
  assert.equal(list.children[1].children[1].checked, true);

  for (const title of ['', ' \t\n ']) {
    input.value = title;
    await form.fire('submit');
    assert.equal(app.querySelector('[role="alert"]').textContent, 'Task title is required');
    assert.equal(tasks.length, 2);
    assert.equal(requests.length, 3);
  }
  filter.value = 'Open';
  await filter.fire('change');
  assert.deepEqual(visibleTitles(), ['Open task']);
  let checkbox = list.children[0].children[1];
  checkbox.checked = true;
  await checkbox.fire('change');
  assert.equal(tasks[0].completed, true);
  assert.deepEqual(visibleTitles(), []);
  filter.value = 'Completed';
  await filter.fire('change');
  assert.deepEqual(visibleTitles(), ['Open task', 'Done task']);
  checkbox = list.children[0].children[1];
  checkbox.checked = false;
  await checkbox.fire('change');
  assert.equal(tasks[0].completed, false);
  assert.deepEqual(visibleTitles(), ['Done task']);

  input.value = '  New task  ';
  await form.fire('submit');
  assert.equal(tasks[2].title, 'New task');
  assert.equal(tasks[2].completed, false);
  assert.equal(input.value, '');
  assert.equal(app.querySelector('[role="alert"]'), null);
  assert.deepEqual(visibleTitles(), ['Done task']);
  filter.value = 'Open';
  await filter.fire('change');
  assert.deepEqual(visibleTitles(), ['Open task', 'New task']);
  filter.value = 'All';
  await filter.fire('change');
  assert.deepEqual(visibleTitles(), ['Open task', 'Done task', 'New task']);
  assert.equal(requests.filter(({ options }) => options.method === 'PATCH').length, 2);
});

async function renderUI(pathname, fetch) {
  const app = new Element('main');
  const window = { location: { pathname } };
  await vm.runInNewContext(source, {
    validDueDate,
    document: {
      querySelector: () => app,
      createElement: (tag) => new Element(tag),
    },
    window,
    fetch,
  });
  return { app, window };
}

const jsonResponse = (body) => ({ ok: true, json: async () => JSON.parse(JSON.stringify(body)) });

test('delayed task edits and reverse moves retain other rows and selected destinations', async () => {
  const project = { id: 7, name: 'Holding', archived: 0, default_task_priority: 'Normal' };
  const projects = [
    { id: 1, name: 'Unrelated', archived: 0 },
    project,
    { id: 8, name: 'Original owner', archived: 0 },
  ];
  const tasks = [1, 2].map((id) => ({ id, project_id: 7, title: `Task ${id}`,
    completed: false, priority: 'Normal', due_date: '' }));
  let finishEdit;
  const moves = [];
  const fetch = async (path, options = {}) => {
    if (options.method === 'PATCH') {
      const input = JSON.parse(options.body);
      const task = tasks.find((candidate) => path.endsWith(`/${candidate.id}`));
      if (input.destination_project_id) {
        moves.push([task.id, input.destination_project_id]);
        return jsonResponse({ ...task, project_id: input.destination_project_id });
      }
      if (input.priority) await new Promise((resolve) => { finishEdit = resolve; });
      Object.assign(task, input);
      return jsonResponse(task);
    }
    return jsonResponse(path === '/api/projects' ? projects : path === '/api/projects/7' ? project : tasks);
  };
  const { app } = await renderUI('/projects/7', fetch);
  const list = app.find((node) => node.attributes['aria-label'] === 'Tasks');
  const originalRows = [...list.children];
  const destination1 = app.find((node) => node.id === 'destination-project-1');
  const destination2 = app.find((node) => node.id === 'destination-project-2');
  destination1.value = destination2.value = '8';
  const priority = app.find((node) => node.id === 'task-priority-1');
  priority.value = 'High';
  const pendingEdit = priority.fire('change');
  const due = app.find((node) => node.id === 'task-due-date-1');
  due.value = '2024-02-29';
  const rename = app.find((node) => node.id === 'new-task-title-2');
  rename.value = 'Current title';
  finishEdit();
  await pendingEdit;
  assert.deepEqual(list.children, originalRows);
  assert.equal(due.value, '2024-02-29');
  assert.equal(rename.value, 'Current title');
  assert.equal(destination1.value, '8');
  assert.equal(destination2.value, '8');
  await due.parent.fire('submit');
  await rename.parent.fire('submit');
  assert.equal(list.children[1].children[0].textContent, 'Current title');
  await destination2.parent.fire('submit');
  assert.equal(list.children[0], originalRows[0]);
  assert.equal(destination1.value, '8');
  await destination1.parent.fire('submit');
  assert.deepEqual(moves, [[2, 8], [1, 8]]);
  assert.equal(list.children.length, 0);
  assert.equal(tasks[0].priority, 'High');
  assert.equal(tasks[0].due_date, '2024-02-29');
  assert.equal(tasks[1].title, 'Current title');
});

test('large project lists reuse rows during creation and preserve whitespace through archive searches', async () => {
  const projects = Array.from({ length: 450 }, (_, index) => ({ id: index + 1,
    name: `Existing ${index}`, archived: 0, completed_count: 0, total_count: 0 }));
  const fetch = async (path, options = {}) => {
    if (options.method === 'POST') {
      const project = { id: projects.length + 1, name: JSON.parse(options.body).name.trim(),
        archived: 0, completed_count: 0, total_count: 0 };
      projects.push(project);
      return jsonResponse(project);
    }
    if (options.method === 'PATCH') {
      const project = projects.find((candidate) => path.endsWith(`/${candidate.id}`));
      Object.assign(project, JSON.parse(options.body));
      return jsonResponse(project);
    }
    return jsonResponse(projects);
  };
  const { app } = await renderUI('/', fetch);
  const list = app.find((node) => node.attributes['aria-label'] === 'Projects');
  const initialRows = [...list.children];
  const input = app.find((node) => node.id === 'project-name');
  input.value = 'Whitespace  Saved\t archived';
  await input.parent.fire('submit');
  assert.deepEqual(list.children.slice(0, 450), initialRows);
  const row = list.children[450];
  assert.equal(row.children[0].textContent, 'Whitespace  Saved\t archived');
  await row.children[3].fire('click');
  assert.equal(list.children.length, 450);
  const search = app.find((node) => node.id === 'project-search');
  search.value = ' whitespace\t saved ';
  await search.parent.fire('submit');
  assert.equal(list.children.length, 0);
  const filter = app.find((node) => node.id === 'project-filter');
  filter.value = 'Archived';
  await filter.fire('change');
  assert.equal(list.children[0], row);
  assert.equal(row.children[0].textContent, 'Whitespace  Saved\t archived');
  assert.equal(row.children[3].textContent, 'Restore project');
  await row.children[3].fire('click');
  assert.equal(list.children.length, 0);
  filter.value = 'Active';
  await filter.fire('change');
  assert.equal(list.children[0], row);
  assert.equal(row.children[3].textContent, 'Archive project');
  assert.equal(row.children[0].textContent, 'Whitespace  Saved\t archived');
});

test('due date UI saves, clears, reports invalid dates, and preserves filters and other task data', async () => {
  const project = { id: 7, name: 'Project', archived: 0 };
  const tasks = [
    { id: 1, project_id: 7, title: 'First', completed: true, priority: 'High', due_date: '' },
    { id: 2, project_id: 7, title: 'Second', completed: false, priority: 'Low', due_date: '' },
  ];
  let mutations = 0;
  const fetch = async (path, options = {}) => {
    if (options.method === 'PATCH') {
      mutations++;
      const input = JSON.parse(options.body);
      if (input.due_date === 'invalid') {
        return { ok: false, json: async () => ({ error: 'Due date must be a valid YYYY-MM-DD date' }) };
      }
      const task = tasks.find((task) => path === `/api/projects/7/tasks/${task.id}`);
      Object.assign(task, input);
      return jsonResponse(task);
    }
    return jsonResponse(path === '/api/projects' ? [project] : path === '/api/projects/7' ? project : tasks);
  };
  const { app } = await renderUI('/projects/7', fetch);
  const completion = app.find((node) => node.id === 'task-filter');
  const priority = app.find((node) => node.id === 'priority-filter');
  const list = app.find((node) => node.attributes['aria-label'] === 'Tasks');
  const dateInput = (root, id = 1) => root.find((node) => node.id === `task-due-date-${id}`);
  assert.equal(dateInput(app).type, 'text');
  assert.equal(dateInput(app).value, '');
  assert.equal(dateInput(app, 2).value, '');
  assert.equal(dateInput(app).parent.children[0].textContent, 'Task due date');
  assert.equal(dateInput(app).parent.children[0].htmlFor, dateInput(app).id);
  assert.equal(dateInput(app).parent.children[2].textContent, 'Save due date');
  completion.value = 'Completed';
  await completion.fire('change');
  priority.value = 'High';
  await priority.fire('change');
  const original = { ...tasks[0] };
  for (const [input, saved] of [['  0001-01-01  ', '0001-01-01'], ['invalid', '0001-01-01'],
    ['', ''], ['2024-02-29', '2024-02-29'], [' \t ', ''], ['9999-12-31', '9999-12-31']]) {
    dateInput(app).value = input;
    await dateInput(app).parent.fire('submit');
    assert.deepEqual(tasks[0], { ...original, due_date: saved });
    assert.equal(tasks[1].due_date, '');
    assert.equal(completion.value, 'Completed');
    assert.equal(priority.value, 'High');
    assert.deepEqual(list.children.map((row) => row.children[0].textContent), ['First']);
    if (input === 'invalid') {
      assert.equal(app.querySelector('[role="alert"]').textContent, 'Due date must be a valid YYYY-MM-DD date');
    } else {
      assert.equal(dateInput(app).value, saved);
      assert.equal(app.querySelector('[role="alert"]'), null);
    }
  }
  const rename = list.children[0].children[2];
  rename.children[1].value = 'Renamed';
  await rename.fire('submit');
  assert.equal(dateInput(app).value, '9999-12-31');
  assert.equal(completion.value, 'Completed');
  assert.equal(priority.value, 'High');
  for (const archived of [0, 1, 0]) {
    project.archived = archived;
    const reloaded = await renderUI('/projects/7', fetch);
    const input = dateInput(reloaded.app);
    assert.equal(input.value, '9999-12-31');
    assert.equal(input.disabled, Boolean(archived));
    assert.equal(input.parent.children[2].disabled, Boolean(archived));
    if (archived) {
      const before = mutations;
      input.value = '';
      await input.parent.fire('submit');
      assert.equal(mutations, before);
      assert.equal(tasks[0].due_date, '9999-12-31');
    }
  }
});

test('project UI archive/restore, summaries, filtering, creation, and navigation', async () => {
  const projects = [
    { id: 1, name: 'First', archived: 0, completed_count: 1, total_count: 2 },
    { id: 2, name: 'Second', archived: 0, completed_count: 0, total_count: 0 },
    { id: 3, name: 'Third', archived: 1, completed_count: 2, total_count: 2 },
  ];
  const { app, window } = await renderUI('/', async (path, options = {}) => {
    if (options.method === 'PATCH') {
      const project = projects.find((project) => path === `/api/projects/${project.id}`);
      project.archived = Number(JSON.parse(options.body).archived);
      return jsonResponse(project);
    }
    if (options.method === 'POST') {
      const project = { id: 4, name: JSON.parse(options.body).name, archived: 0, completed_count: 0, total_count: 0 };
      projects.push(project);
      return jsonResponse(project);
    }
    return jsonResponse(projects);
  });
  const filter = app.find((node) => node.id === 'project-filter');
  const list = app.find((node) => node.attributes['aria-label'] === 'Projects');
  const names = () => list.children.map((row) => row.children[0].textContent);
  const button = (row, text) => row.find((node) => node.tag === 'button' && node.textContent === text);
  assert.equal(app.find((node) => node.htmlFor === filter.id).textContent, 'Project filter');
  assert.deepEqual(filter.children.map((option) => option.textContent), ['Active', 'Archived']);
  assert.equal(filter.value, 'Active');
  assert.deepEqual(names(), ['First', 'Second']);
  assert.ok(list.children.every((row) => row.dataset.testid === 'project-row'));
  assert.equal(list.children[0].children[1].dataset.testid, 'project-summary');
  assert.equal(list.children[0].children[1].textContent, '1/2 completed');
  assert.equal(list.children[1].children[1].textContent, '0/0 completed');
  await button(list.children[0], 'Archive project').fire('click');
  assert.deepEqual(names(), ['Second']);
  filter.value = 'Archived';
  await filter.fire('change');
  assert.deepEqual(names(), ['First', 'Third']);
  assert.equal(list.children[0].children[1].textContent, '1/2 completed');
  assert.equal(list.children[1].children[1].textContent, '2/2 completed');
  await button(list.children[0], 'Open project').fire('click');
  assert.equal(window.location.href, '/projects/1');
  await button(list.children[0], 'Restore project').fire('click');
  assert.deepEqual(names(), ['Third']);
  filter.value = 'Active';
  await filter.fire('change');
  assert.deepEqual(names(), ['First', 'Second']);
  const form = app.find((node) => node.tag === 'form');
  const input = app.find((node) => node.id === 'project-name');
  input.value = ' \t ';
  await form.fire('submit');
  assert.equal(app.querySelector('[role="alert"]').textContent, 'Project name is required');
  assert.equal(projects.length, 3);
  input.value = '  Fourth  ';
  await form.fire('submit');
  assert.deepEqual(names(), ['First', 'Second', 'Fourth']);
  assert.equal(list.children[2].children[1].textContent, '0/0 completed');
  assert.equal(app.querySelector('[role="alert"]'), null);
});

test('archived project UI keeps tasks filterable and disables all task mutations', async () => {
  const requests = [];
  const { app, window } = await renderUI('/projects/7', async (path, options = {}) => {
    requests.push({ path, options });
    return jsonResponse(path === '/api/projects' ? [] : path === '/api/projects/7'
      ? { id: 7, name: 'Archived seven', archived: 1 }
      : [
        { id: 1, title: 'Open task', completed: false, priority: 'Normal' },
        { id: 2, title: 'Done task', completed: true, priority: 'Normal' },
      ]);
  });
  assert.ok(app.find((node) => node.textContent === 'Archived project'));
  const renameInput = app.find((node) => node.id === 'new-project-name');
  const renameButton = app.find((node) => node.textContent === 'Rename project');
  assert.equal(renameInput.disabled, true);
  assert.equal(renameButton.disabled, true);
  renameInput.value = 'Blocked rename';
  await renameInput.parent.fire('submit');
  const form = app.find((node) => node.tag === 'form');
  assert.equal(form.children[2].textContent, 'Create task');
  assert.equal(form.children[2].disabled, true);
  const list = app.find((node) => node.attributes['aria-label'] === 'Tasks');
  const filter = app.find((node) => node.id === 'task-filter');
  assert.equal(filter.disabled, false);
  assert.equal(list.children.length, 2);
  assert.ok(list.children.every((row) => row.children[1].disabled));
  for (const row of list.children) {
    const renameForm = row.children[2];
    assert.equal(renameForm.children[0].textContent, 'New task title');
    assert.equal(renameForm.children[1].disabled, true);
    assert.equal(renameForm.children[2].textContent, 'Rename task');
    assert.equal(renameForm.children[2].disabled, true);
    renameForm.children[1].value = 'Blocked title';
    await renameForm.fire('submit');
    const priority = row.find((node) => node.tag === 'select');
    assert.equal(priority.disabled, true);
    await priority.fire('change');
  }
  assert.equal(list.children[1].children[1].checked, true);
  await list.children[0].children[1].fire('change');
  await form.fire('submit');
  assert.equal(requests.length, 3);
  for (const [value, title] of [['Open', 'Open task'], ['Completed', 'Done task']]) {
    filter.value = value;
    await filter.fire('change');
    assert.equal(list.children.length, 1);
    assert.equal(list.children[0].children[0].textContent, title);
    assert.equal(list.children[0].children[1].disabled, true);
  }
  await app.find((node) => node.textContent === 'Projects').fire('click');
  assert.equal(window.location.href, '/');
});

test('priority UI saves each task independently and preserves filtering, renaming, and reload state', async () => {
  const project = { id: 7, name: 'Project', archived: 0 };
  const tasks = [
    { id: 1, project_id: 7, title: 'Open task', completed: false, priority: 'Normal' },
    { id: 2, project_id: 7, title: 'Done task', completed: true, priority: 'Normal' },
  ];
  let rejectUpdate = false;
  const fetch = async (path, options = {}) => {
    if (options.method === 'PATCH') {
      if (rejectUpdate) return { ok: false, json: async () => ({ error: 'Update failed' }) };
      const task = tasks.find((task) => path === `/api/projects/7/tasks/${task.id}`);
      Object.assign(task, JSON.parse(options.body));
      return jsonResponse(task);
    }
    return jsonResponse(path === '/api/projects' ? [project] : path === '/api/projects/7' ? project : tasks);
  };
  const { app } = await renderUI('/projects/7', fetch);
  const list = app.find((node) => node.attributes['aria-label'] === 'Tasks');
  const filter = app.find((node) => node.id === 'task-filter');
  const priorityFor = (row) => row.find((node) => node.tag === 'select');
  for (const row of list.children) {
    const priority = priorityFor(row);
    assert.equal(row.find((node) => node.htmlFor === priority.id).textContent, 'Task priority');
    assert.deepEqual(priority.children.map((option) => option.textContent), ['Low', 'Normal', 'High']);
    assert.equal(priority.value, 'Normal');
    assert.equal(priority.disabled, false);
  }
  assert.notEqual(priorityFor(list.children[0]).id, priorityFor(list.children[1]).id);
  filter.value = 'Completed';
  await filter.fire('change');
  let priority;
  for (const value of ['Low', 'Normal', 'High']) {
    priority = priorityFor(list.children[0]);
    priority.value = value;
    await priority.fire('change');
    assert.equal(priority.value, value);
    assert.equal(priority.disabled, false);
    assert.equal(tasks[1].priority, value);
    assert.equal(tasks[0].priority, 'Normal');
    assert.equal(list.children.length, 1);
    assert.equal(list.children[0].children[0].textContent, 'Done task');
    assert.equal(list.children[0].children[1].checked, true);
  }
  rejectUpdate = true;
  priority = priorityFor(list.children[0]);
  priority.value = 'Low';
  await priority.fire('change');
  assert.equal(priority.value, 'High');
  assert.equal(priority.disabled, false);
  assert.equal(app.querySelector('[role="alert"]').textContent, 'Update failed');
  rejectUpdate = false;
  const renameForm = list.children[0].children[2];
  renameForm.children[1].value = '  Renamed done  ';
  await renameForm.fire('submit');
  assert.equal(priorityFor(list.children[0]).value, 'High');
  assert.equal(list.children[0].children[1].attributes['aria-label'], 'Complete Renamed done');
  filter.value = 'All';
  await filter.fire('change');
  assert.deepEqual(list.children.map((row) => row.children[0].textContent), ['Open task', 'Renamed done']);
  assert.deepEqual(list.children.map((row) => priorityFor(row).value), ['Normal', 'High']);
  for (const archived of [0, 1, 0]) {
    project.archived = archived;
    const reloaded = await renderUI('/projects/7', fetch);
    const rows = reloaded.app.find((node) => node.attributes['aria-label'] === 'Tasks').children;
    assert.deepEqual(rows.map((row) => priorityFor(row).value), ['Normal', 'High']);
    assert.ok(rows.every((row) => priorityFor(row).disabled === Boolean(archived)));
    assert.deepEqual(rows.map((row) => row.children[1].checked), [false, true]);
  }
});

test('rename UI validates names, updates heading, and preserves navigation and tasks after reload', async () => {
  const project = { id: 7, name: 'Original', archived: 0, completed_count: 1, total_count: 2 };
  const tasks = [
    { id: 1, title: 'Open task', completed: false, priority: 'Normal' },
    { id: 2, title: 'Done task', completed: true, priority: 'Normal' },
  ];
  const requests = [];
  const fetch = async (path, options = {}) => {
    requests.push({ path, options });
    if (options.method === 'PATCH') project.name = JSON.parse(options.body).name;
    return jsonResponse(path === '/api/projects' ? [project] : path === '/api/projects/7' ? project : tasks);
  };
  const { app, window } = await renderUI('/projects/7', fetch);
  const input = app.find((node) => node.id === 'new-project-name');
  const form = input.parent;
  const heading = app.find((node) => node.tag === 'h1');
  const list = app.find((node) => node.attributes['aria-label'] === 'Tasks');
  assert.equal(app.find((node) => node.htmlFor === input.id).textContent, 'New project name');
  assert.equal(input.disabled, false);
  assert.equal(form.children[2].textContent, 'Rename project');
  assert.equal(form.children[2].disabled, false);
  for (const name of ['', ' \t\n ']) {
    input.value = name;
    await form.fire('submit');
    assert.equal(app.querySelector('[role="alert"]').textContent, 'Project name is required');
    assert.equal(heading.textContent, 'Original');
    assert.equal(requests.length, 3);
  }
  input.value = '  Renamed project  ';
  await form.fire('submit');
  assert.equal(heading.textContent, 'Renamed project');
  assert.equal(project.name, 'Renamed project');
  assert.equal(window.location.pathname, '/projects/7');
  assert.equal(app.querySelector('[role="alert"]'), null);
  assert.equal(input.value, '');
  assert.deepEqual(list.children.map((row) => row.children[0].textContent), ['Open task', 'Done task']);
  assert.deepEqual(list.children.map((row) => row.children[1].checked), [false, true]);
  const reloaded = await renderUI('/projects/7', fetch);
  assert.equal(reloaded.app.find((node) => node.tag === 'h1').textContent, 'Renamed project');
  const home = await renderUI('/', async () => jsonResponse([project]));
  const row = home.app.find((node) => node.dataset.testid === 'project-row');
  assert.equal(row.children[0].textContent, 'Renamed project');
  assert.equal(row.children[1].textContent, '1/2 completed');
  await row.find((node) => node.textContent === 'Open project').fire('click');
  assert.equal(home.window.location.href, '/projects/7');
});

test('task rename updates title and checkbox label while preserving filters, order, and reload state', async () => {
  const project = { id: 7, name: 'Project', archived: 0, completed_count: 1, total_count: 2 };
  const tasks = [
    { id: 1, project_id: 7, title: 'Open task', completed: false, priority: 'Normal' },
    { id: 2, project_id: 7, title: 'Done task', completed: true, priority: 'Normal' },
  ];
  const requests = [];
  const fetch = async (path, options = {}) => {
    requests.push({ path, options });
    if (options.method === 'PATCH') {
      const task = tasks.find((task) => path === `/api/projects/7/tasks/${task.id}`);
      task.title = JSON.parse(options.body).title;
      return jsonResponse(task);
    }
    return jsonResponse(path === '/api/projects' ? [project] : path === '/api/projects/7' ? project : tasks);
  };
  const { app } = await renderUI('/projects/7', fetch);
  const list = app.find((node) => node.attributes['aria-label'] === 'Tasks');
  const filter = app.find((node) => node.id === 'task-filter');
  for (const row of list.children) {
    const form = row.children[2];
    assert.equal(form.children[0].textContent, 'New task title');
    assert.equal(form.children[0].htmlFor, form.children[1].id);
    assert.equal(form.children[1].disabled, false);
    assert.equal(form.children[2].textContent, 'Rename task');
    assert.equal(form.children[2].disabled, false);
  }
  assert.notEqual(list.children[0].children[2].children[1].id, list.children[1].children[2].children[1].id);
  filter.value = 'Completed';
  await filter.fire('change');
  const form = list.children[0].children[2];
  for (const title of ['', ' \t\n ']) {
    form.children[1].value = title;
    await form.fire('submit');
    assert.equal(app.querySelector('[role="alert"]').textContent, 'Task title is required');
    assert.equal(list.children[0].children[0].textContent, 'Done task');
    assert.equal(requests.length, 3);
  }
  form.children[1].value = '  Renamed <task>  ';
  await form.fire('submit');
  assert.equal(list.children.length, 1);
  assert.equal(list.children[0].children[0].textContent, 'Renamed <task>');
  assert.equal(list.children[0].children[1].attributes['aria-label'], 'Complete Renamed <task>');
  assert.equal(list.children[0].children[1].checked, true);
  assert.equal(app.querySelector('[role="alert"]'), null);
  filter.value = 'Open';
  await filter.fire('change');
  assert.deepEqual(list.children.map((row) => row.children[0].textContent), ['Open task']);
  filter.value = 'All';
  await filter.fire('change');
  assert.deepEqual(list.children.map((row) => row.children[0].textContent), ['Open task', 'Renamed <task>']);
  const reloaded = await renderUI('/projects/7', fetch);
  const reloadedList = reloaded.app.find((node) => node.attributes['aria-label'] === 'Tasks');
  assert.deepEqual(reloadedList.children.map((row) => row.children[0].textContent), ['Open task', 'Renamed <task>']);
  assert.deepEqual(reloadedList.children.map((row) => row.children[1].checked), [false, true]);
  project.archived = 1;
  const archived = await renderUI('/projects/7', fetch);
  assert.equal(archived.app.find((node) => node.id === 'new-task-title-2').disabled, true);
  project.archived = 0;
  const restored = await renderUI('/projects/7', fetch);
  assert.equal(restored.app.find((node) => node.id === 'new-task-title-2').disabled, false);
  const home = await renderUI('/', async () => jsonResponse([project]));
  assert.equal(home.app.find((node) => node.dataset.testid === 'project-summary').textContent, '1/2 completed');
});

test('combined filters cover every completion and priority pair in active and archived projects', async () => {
  const project = { id: 7, name: 'Project', archived: 0, completed_count: 3, total_count: 6 };
  const tasks = [
    { id: 1, title: 'High open', completed: false, priority: 'High' },
    { id: 2, title: 'Low done', completed: true, priority: 'Low' },
    { id: 3, title: 'Normal open', completed: false, priority: 'Normal' },
    { id: 4, title: 'High done', completed: true, priority: 'High' },
    { id: 5, title: 'Low open', completed: false, priority: 'Low' },
    { id: 6, title: 'Normal done', completed: true, priority: 'Normal' },
  ];
  const original = JSON.stringify(tasks);
  let mutations = 0;
  const fetch = async (path, options = {}) => {
    if (options.method) mutations++;
    return jsonResponse(path === '/api/projects' ? [project] : path === '/api/projects/7' ? project : tasks);
  };
  for (const archived of [0, 1, 0]) {
    project.archived = archived;
    const { app } = await renderUI('/projects/7', fetch);
    const completion = app.find((node) => node.id === 'task-filter');
    const priority = app.find((node) => node.id === 'priority-filter');
    const list = app.find((node) => node.attributes['aria-label'] === 'Tasks');
    assert.equal(app.find((node) => node.htmlFor === priority.id).textContent, 'Priority filter');
    assert.deepEqual(priority.children.map((option) => option.textContent), ['All', 'Low', 'Normal', 'High']);
    assert.equal(priority.value, 'All');
    assert.equal(completion.value, 'All');
    assert.equal(priority.disabled, false);
    assert.equal(completion.disabled, false);
    for (const completionValue of ['All', 'Open', 'Completed']) {
      const previousPriority = priority.value;
      completion.value = completionValue;
      await completion.fire('change');
      assert.equal(priority.value, previousPriority);
      for (const priorityValue of ['All', 'Low', 'Normal', 'High']) {
        priority.value = priorityValue;
        await priority.fire('change');
        assert.equal(completion.value, completionValue);
        const expected = tasks.filter((task) =>
          (completionValue === 'All' || task.completed === (completionValue === 'Completed')) &&
          (priorityValue === 'All' || task.priority === priorityValue));
        assert.deepEqual(list.children.map((row) => row.children[0].textContent), expected.map((task) => task.title));
        for (const row of list.children) {
          assert.equal(row.children[1].disabled, Boolean(archived));
          assert.equal(row.children[2].children[1].disabled, Boolean(archived));
          assert.equal(row.children[2].children[2].disabled, Boolean(archived));
          assert.equal(row.find((node) => node.tag === 'select').disabled, Boolean(archived));
        }
      }
    }
  }
  assert.equal(mutations, 0);
  assert.equal(JSON.stringify(tasks), original);
  const home = await renderUI('/', async () => jsonResponse([project]));
  assert.equal(home.app.find((node) => node.dataset.testid === 'project-summary').textContent, '3/6 completed');
});

test('task edits re-evaluate combined filters and rename preserves selections and saved state', async () => {
  const project = { id: 7, name: 'Project', archived: 0 };
  const tasks = [
    { id: 1, project_id: 7, title: 'First', completed: false, priority: 'High' },
    { id: 2, project_id: 7, title: 'Second', completed: false, priority: 'Low' },
    { id: 3, project_id: 7, title: 'Third', completed: true, priority: 'High' },
  ];
  let failUpdate = false;
  const fetch = async (path, options = {}) => {
    if (options.method === 'PATCH') {
      if (failUpdate) return { ok: false, json: async () => ({ error: 'Update failed' }) };
      const task = tasks.find((task) => path === `/api/projects/7/tasks/${task.id}`);
      Object.assign(task, JSON.parse(options.body));
      return jsonResponse(task);
    }
    return jsonResponse(path === '/api/projects' ? [project] : path === '/api/projects/7' ? project : tasks);
  };
  const { app } = await renderUI('/projects/7', fetch);
  const completion = app.find((node) => node.id === 'task-filter');
  const priority = app.find((node) => node.id === 'priority-filter');
  const list = app.find((node) => node.attributes['aria-label'] === 'Tasks');
  const titles = () => list.children.map((row) => row.children[0].textContent);
  const assertSelections = () => {
    assert.equal(completion.value, 'Open');
    assert.equal(priority.value, 'High');
  };
  completion.value = 'Open';
  await completion.fire('change');
  priority.value = 'High';
  await priority.fire('change');
  assert.deepEqual(titles(), ['First']);
  const renameForm = list.children[0].children[2];
  renameForm.children[1].value = '  Renamed first  ';
  await renameForm.fire('submit');
  assertSelections();
  assert.deepEqual(titles(), ['Renamed first']);
  assert.equal(list.children[0].children[1].attributes['aria-label'], 'Complete Renamed first');
  let taskPriority = list.children[0].find((node) => node.tag === 'select');
  failUpdate = true;
  taskPriority.value = 'Low';
  await taskPriority.fire('change');
  assertSelections();
  assert.deepEqual(titles(), ['Renamed first']);
  assert.equal(taskPriority.value, 'High');
  failUpdate = false;
  taskPriority.value = 'Low';
  await taskPriority.fire('change');
  assertSelections();
  assert.deepEqual(titles(), []);
  priority.value = 'Low';
  await priority.fire('change');
  assert.deepEqual(titles(), ['Renamed first', 'Second']);
  taskPriority = list.children[0].find((node) => node.tag === 'select');
  taskPriority.value = 'High';
  await taskPriority.fire('change');
  assert.deepEqual(titles(), ['Second']);
  priority.value = 'High';
  await priority.fire('change');
  const checkbox = list.children[0].children[1];
  checkbox.checked = true;
  await checkbox.fire('change');
  assertSelections();
  assert.deepEqual(titles(), []);
  completion.value = 'Completed';
  await completion.fire('change');
  assert.deepEqual(titles(), ['Renamed first', 'Third']);
  const reloaded = await renderUI('/projects/7', fetch);
  assert.equal(reloaded.app.find((node) => node.id === 'priority-filter').value, 'All');
  const rows = reloaded.app.find((node) => node.attributes['aria-label'] === 'Tasks').children;
  assert.deepEqual(rows.map((row) => row.children[0].textContent), ['Renamed first', 'Second', 'Third']);
  assert.deepEqual(rows.map((row) => row.children[1].checked), [true, false, true]);
  assert.deepEqual(rows.map((row) => row.find((node) => node.tag === 'select').value), ['High', 'Low', 'High']);
  assert.deepEqual(tasks.map((task) => task.project_id), [7, 7, 7]);
});

test('due ranges intersect completion and priority, include boundaries, and work when archived', async () => {
  const project = { id: 7, name: 'Project', archived: 0, completed_count: 2, total_count: 5 };
  const tasks = [
    { id: 1, title: 'Undated', completed: false, priority: 'High', due_date: '' },
    { id: 2, title: 'Before', completed: true, priority: 'Low', due_date: '2024-02-28' },
    { id: 3, title: 'From', completed: false, priority: 'High', due_date: '2024-02-29' },
    { id: 4, title: 'Through', completed: true, priority: 'High', due_date: '2024-03-01' },
    { id: 5, title: 'After', completed: false, priority: 'Normal', due_date: '2024-03-02' },
  ];
  const original = JSON.stringify(tasks);
  let mutations = 0;
  const fetch = async (path, options = {}) => {
    if (options.method) mutations++;
    return jsonResponse(path === '/api/projects' ? [project] : path === '/api/projects/7' ? project : tasks);
  };
  for (const archived of [0, 1, 0]) {
    project.archived = archived;
    const { app } = await renderUI('/projects/7', fetch);
    const from = app.find((node) => node.id === 'due-from');
    const through = app.find((node) => node.id === 'due-through');
    const completion = app.find((node) => node.id === 'task-filter');
    const priority = app.find((node) => node.id === 'priority-filter');
    const list = app.find((node) => node.attributes['aria-label'] === 'Tasks');
    for (const [input, label] of [[from, 'Due from'], [through, 'Due through']]) {
      assert.equal(input.type, 'text');
      assert.equal(input.value, '');
      assert.equal(input.disabled, false);
      assert.equal(app.find((node) => node.htmlFor === input.id).textContent, label);
    }
    const apply = app.find((node) => node.textContent === 'Apply due range');
    assert.equal(apply.disabled, false);
    const ranges = [
      ['', '', [1, 2, 3, 4, 5]],
      ['2024-02-29', '', [3, 4, 5]],
      ['', '2024-03-01', [2, 3, 4]],
      ['2024-02-29', '2024-03-01', [3, 4]],
      ['2024-02-29', '2024-02-29', [3]],
      ['0001-01-01', '9999-12-31', [2, 3, 4, 5]],
      ['2025-01-01', '', []],
    ];
    for (const [lower, upper, ids] of ranges) {
      for (const completed of ['All', 'Open', 'Completed']) {
        for (const selectedPriority of ['All', 'Low', 'Normal', 'High']) {
          completion.value = completed;
          await completion.fire('change');
          priority.value = selectedPriority;
          await priority.fire('change');
          from.value = ` ${lower} `;
          through.value = ` ${upper} `;
          await from.parent.fire('submit');
          assert.equal(from.value, lower);
          assert.equal(through.value, upper);
          assert.equal(completion.value, completed);
          assert.equal(priority.value, selectedPriority);
          const expected = tasks.filter((task) => ids.includes(task.id) &&
            (completed === 'All' || task.completed === (completed === 'Completed')) &&
            (selectedPriority === 'All' || task.priority === selectedPriority));
          assert.deepEqual(list.children.map((row) => row.children[0].textContent), expected.map((task) => task.title));
          for (const row of list.children) {
            assert.equal(row.children[1].disabled, Boolean(archived));
            assert.equal(row.find((node) => node.id?.startsWith('task-due-date-')).disabled, Boolean(archived));
          }
        }
      }
    }
    const reloaded = await renderUI('/projects/7', fetch);
    assert.equal(reloaded.app.find((node) => node.id === 'due-from').value, '');
    assert.equal(reloaded.app.find((node) => node.id === 'due-through').value, '');
    assert.equal(reloaded.app.find((node) => node.attributes['aria-label'] === 'Tasks').children.length, 5);
  }
  assert.equal(mutations, 0);
  assert.equal(JSON.stringify(tasks), original);
  const home = await renderUI('/', async () => jsonResponse([project]));
  assert.equal(home.app.find((node) => node.dataset.testid === 'project-summary').textContent, '2/5 completed');
});

test('invalid due ranges retain applied membership even after other filters change', async () => {
  const tasks = [
    { id: 1, title: 'Inside', completed: false, priority: 'High', due_date: '2024-02-29' },
    { id: 2, title: 'Outside', completed: true, priority: 'High', due_date: '2024-03-01' },
    { id: 3, title: 'Undated', completed: false, priority: 'Low', due_date: '' },
  ];
  const { app } = await renderUI('/projects/7', async (path) => jsonResponse(
    path === '/api/projects' ? [] : path === '/api/projects/7' ? { id: 7, name: 'Project' } : tasks));
  const from = app.find((node) => node.id === 'due-from');
  const through = app.find((node) => node.id === 'due-through');
  const list = app.find((node) => node.attributes['aria-label'] === 'Tasks');
  const completion = app.find((node) => node.id === 'task-filter');
  const titles = () => list.children.map((row) => row.children[0].textContent);
  from.value = through.value = '2024-02-29';
  await from.parent.fire('submit');
  assert.deepEqual(titles(), ['Inside']);
  from.value = through.value = '';
  completion.value = 'Open';
  await completion.fire('change');
  assert.deepEqual(titles(), ['Inside']);
  completion.value = 'All';
  await completion.fire('change');
  for (const invalid of ['2023-02-29', '1900-02-29', '2024-04-31', '0000-01-01',
    '10000-01-01', '2024-00-01', '2024-13-01', '2024-01-00', '2024-2-29', 'invalid']) {
    for (const side of ['from', 'through']) {
      from.value = side === 'from' ? invalid : '2024-02-29';
      through.value = side === 'through' ? invalid : '2024-02-29';
      await from.parent.fire('submit');
      assert.equal(app.querySelector('[role="alert"]').textContent, 'Due range must use valid YYYY-MM-DD dates');
      assert.deepEqual(titles(), ['Inside']);
      completion.value = 'Completed';
      await completion.fire('change');
      assert.deepEqual(titles(), []);
      completion.value = 'All';
      await completion.fire('change');
      assert.deepEqual(titles(), ['Inside']);
    }
  }
  from.value = '2024-03-01';
  through.value = '2024-02-29';
  await from.parent.fire('submit');
  assert.equal(app.querySelector('[role="alert"]').textContent, 'Due from must not be after Due through');
  assert.deepEqual(titles(), ['Inside']);
  from.value = through.value = ' \t ';
  await from.parent.fire('submit');
  assert.deepEqual(titles(), ['Inside', 'Outside', 'Undated']);
  assert.equal(app.querySelector('[role="alert"]'), null);
});

test('task edits re-evaluate due ranges while creation, renames, and defaults retain every filter', async () => {
  const project = { id: 7, name: 'Project', archived: 0, default_task_priority: 'High' };
  const tasks = [
    { id: 1, project_id: 7, title: 'First', completed: false, priority: 'High', due_date: '2024-02-29' },
    { id: 2, project_id: 7, title: 'Second', completed: false, priority: 'High', due_date: '2024-03-01' },
  ];
  const fetch = async (path, options = {}) => {
    if (options.method === 'PATCH') {
      const target = path === '/api/projects' ? [project] : path === '/api/projects/7' ? project : tasks.find((task) => path.endsWith(`/tasks/${task.id}`));
      Object.assign(target, JSON.parse(options.body));
      return jsonResponse(target);
    }
    if (options.method === 'POST') {
      const task = { id: 3, project_id: 7, title: JSON.parse(options.body).title, completed: false,
        priority: project.default_task_priority, due_date: '' };
      tasks.push(task);
      return jsonResponse(task);
    }
    return jsonResponse(path === '/api/projects' ? [project] : path === '/api/projects/7' ? project : tasks);
  };
  const { app } = await renderUI('/projects/7', fetch);
  const from = app.find((node) => node.id === 'due-from');
  const through = app.find((node) => node.id === 'due-through');
  const completion = app.find((node) => node.id === 'task-filter');
  const priority = app.find((node) => node.id === 'priority-filter');
  const list = app.find((node) => node.attributes['aria-label'] === 'Tasks');
  const titles = () => list.children.map((row) => row.children[0].textContent);
  completion.value = 'Open';
  await completion.fire('change');
  priority.value = 'High';
  await priority.fire('change');
  from.value = '2024-02-29';
  through.value = '2024-03-01';
  await from.parent.fire('submit');
  const assertFilters = () => {
    assert.equal(completion.value, 'Open');
    assert.equal(priority.value, 'High');
    assert.equal(from.value, '2024-02-29');
    assert.equal(through.value, '2024-03-01');
  };
  for (const [id, value] of [['new-task-title-1', 'Renamed'], ['new-project-name', 'Renamed project']]) {
    const input = app.find((node) => node.id === id);
    input.value = value;
    await input.parent.fire('submit');
    assertFilters();
    assert.deepEqual(titles(), ['Renamed', 'Second']);
  }
  const defaultPriority = app.find((node) => node.id === 'default-task-priority');
  defaultPriority.value = 'Low';
  await defaultPriority.fire('change');
  assertFilters();
  assert.deepEqual(titles(), ['Renamed', 'Second']);
  const title = app.find((node) => node.id === 'task-title');
  title.value = 'New undated';
  await title.parent.fire('submit');
  assertFilters();
  assert.deepEqual(titles(), ['Renamed', 'Second']);
  const due = app.find((node) => node.id === 'task-due-date-1');
  due.value = '2024-03-02';
  await due.parent.fire('submit');
  assertFilters();
  assert.deepEqual(titles(), ['Second']);
  const taskPriority = app.find((node) => node.id === 'task-priority-2');
  taskPriority.value = 'Low';
  await taskPriority.fire('change');
  assertFilters();
  assert.deepEqual(titles(), []);
  priority.value = 'Low';
  await priority.fire('change');
  assert.deepEqual(titles(), ['Second']);
  const checkbox = list.children[0].children[1];
  checkbox.checked = true;
  await checkbox.fire('change');
  assert.deepEqual(titles(), []);
  completion.value = 'Completed';
  await completion.fire('change');
  assert.deepEqual(titles(), ['Second']);
  const clear = app.find((node) => node.id === 'task-due-date-2');
  clear.value = ' ';
  await clear.parent.fire('submit');
  assert.deepEqual(titles(), []);
  from.value = through.value = '';
  await from.parent.fire('submit');
  assert.deepEqual(titles(), ['Second']);
  assert.equal(tasks[0].due_date, '2024-03-02');
  assert.equal(tasks[1].due_date, '');
  assert.equal(tasks[1].completed, true);
});

test('move controls list eligible projects, retain filters, recover from errors, and disable when unavailable', async () => {
  const project = { id: 7, name: 'Source', archived: 0, default_task_priority: 'Normal' };
  const projects = [project,
    { id: 8, name: 'Renamed destination', archived: 0 },
    { id: 9, name: 'Archived destination', archived: 1 },
    { id: 10, name: 'Last destination', archived: 0 }];
  let tasks = [
    { id: 1, project_id: 7, title: 'Move me', completed: true, priority: 'High', due_date: '2024-02-29' },
    { id: 2, project_id: 7, title: 'Keep me', completed: true, priority: 'High', due_date: '2024-02-29' },
    { id: 3, project_id: 7, title: 'Filtered', completed: false, priority: 'Low', due_date: '' },
  ];
  let failMove = true;
  let mutation;
  const fetch = async (path, options = {}) => {
    if (options.method === 'PATCH') {
      mutation = JSON.parse(options.body);
      if (failMove) return { ok: false, json: async () => ({ error: 'Move failed' }) };
      const task = tasks.find((candidate) => path.endsWith(`/${candidate.id}`));
      tasks = tasks.filter((candidate) => candidate !== task);
      return jsonResponse({ ...task, project_id: mutation.destination_project_id });
    }
    return jsonResponse(path === '/api/projects' ? projects : path === '/api/projects/7' ? project : tasks);
  };
  const { app, window } = await renderUI('/projects/7', fetch);
  const completion = app.find((node) => node.id === 'task-filter');
  const priority = app.find((node) => node.id === 'priority-filter');
  const from = app.find((node) => node.id === 'due-from');
  const through = app.find((node) => node.id === 'due-through');
  const list = app.find((node) => node.attributes['aria-label'] === 'Tasks');
  completion.value = 'Completed';
  await completion.fire('change');
  priority.value = 'High';
  await priority.fire('change');
  from.value = through.value = '2024-02-29';
  await from.parent.fire('submit');
  const destination = app.find((node) => node.id === 'destination-project-1');
  assert.equal(app.find((node) => node.htmlFor === destination.id).textContent, 'Destination project');
  assert.deepEqual(destination.children.map((node) => [node.value, node.textContent]),
    [['8', 'Renamed destination'], ['10', 'Last destination']]);
  assert.equal(destination.disabled, false);
  assert.equal(destination.parent.children[2].textContent, 'Move task');
  destination.value = '10';
  await destination.parent.fire('submit');
  assert.equal(app.querySelector('[role="alert"]').textContent, 'Move failed');
  assert.equal(destination.disabled, false);
  assert.equal(destination.parent.children[2].disabled, false);
  assert.equal(list.children.length, 2);
  failMove = false;
  await destination.parent.fire('submit');
  assert.equal(mutation.destination_project_id, 10);
  assert.equal(window.location.pathname, '/projects/7');
  assert.equal(completion.value, 'Completed');
  assert.equal(priority.value, 'High');
  assert.equal(from.value, '2024-02-29');
  assert.equal(through.value, '2024-02-29');
  assert.deepEqual(list.children.map((row) => row.children[0].textContent), ['Keep me']);
  assert.equal(app.querySelector('[role="alert"]'), null);
  // Changing other filters still uses the applied due range.
  completion.value = priority.value = 'All';
  await completion.fire('change');
  assert.deepEqual(list.children.map((row) => row.children[0].textContent), ['Keep me']);
  for (const archived of [1, 0]) {
    project.archived = archived;
    const reloaded = await renderUI('/projects/7', fetch);
    const select = reloaded.app.find((node) => node.id === 'destination-project-2');
    assert.equal(select.disabled, Boolean(archived));
    assert.equal(select.parent.children[2].disabled, Boolean(archived));
  }
  projects[1].archived = projects[3].archived = 1;
  const unavailable = await renderUI('/projects/7', fetch);
  const select = unavailable.app.find((node) => node.id === 'destination-project-2');
  assert.equal(select.children.length, 0);
  assert.equal(select.disabled, true);
  assert.equal(select.parent.children[2].disabled, true);
});

test('project search normalizes spaces and tabs, preserves names and archive filter, and resets on entry', async () => {
  const projects = [
    { id: 1, name: 'Alpha  Beta', archived: 0, completed_count: 1, total_count: 3 },
    { id: 2, name: 'alpha Beta', archived: 0, completed_count: 0, total_count: 0 },
    { id: 3, name: 'ALPHA archive', archived: 1, completed_count: 2, total_count: 2 },
    { id: 4, name: 'Älpha', archived: 0, completed_count: 0, total_count: 0 },
  ];
  let mutations = 0;
  const fetch = async (path, options = {}) => {
    if (options.method) mutations++;
    if (options.method === 'PATCH') {
      const project = projects.find((candidate) => path.endsWith(`/${candidate.id}`));
      Object.assign(project, JSON.parse(options.body));
      return jsonResponse(project);
    }
    if (options.method === 'POST') {
      const project = { id: 5, name: JSON.parse(options.body).name, archived: 0, completed_count: 0, total_count: 0 };
      projects.push(project);
      return jsonResponse(project);
    }
    return jsonResponse(projects);
  };
  const { app, window } = await renderUI('/', fetch);
  const search = app.find((node) => node.id === 'project-search');
  const filter = app.find((node) => node.id === 'project-filter');
  const list = app.find((node) => node.attributes['aria-label'] === 'Projects');
  const names = () => list.children.map((row) => row.children[0].textContent);
  assert.equal(search.type, 'text');
  assert.equal(search.value, '');
  assert.equal(app.find((node) => node.htmlFor === search.id).textContent, 'Project search');
  assert.equal(search.parent.children[2].textContent, 'Search projects');
  assert.deepEqual(names(), ['Alpha  Beta', 'alpha Beta', 'Älpha']);
  for (const [query, expected] of [
    [' \tALPHA\n ', ['Alpha  Beta', 'alpha Beta']],
    ['alpha  b', ['Alpha  Beta', 'alpha Beta']],
    ['alpha\t \tb', ['Alpha  Beta', 'alpha Beta']],
    ['alpha b', ['Alpha  Beta', 'alpha Beta']],
    ['älpha', []], ['ÄLPHA', ['Älpha']], [' \t ', ['Alpha  Beta', 'alpha Beta', 'Älpha']],
  ]) {
    search.value = query;
    await search.parent.fire('submit');
    assert.deepEqual(names(), expected);
  }
  assert.equal(mutations, 0);
  search.value = 'alpha';
  await search.parent.fire('submit');
  search.value = 'unapplied';
  filter.value = 'Archived';
  await filter.fire('change');
  assert.deepEqual(names(), ['ALPHA archive']);
  assert.equal(list.children[0].children[3].textContent, 'Restore project');
  await list.children[0].children[3].fire('click');
  assert.deepEqual(names(), []);
  filter.value = 'Active';
  await filter.fire('change');
  assert.deepEqual(names(), ['Alpha  Beta', 'alpha Beta', 'ALPHA archive']);
  assert.equal(list.children[0].children[1].textContent, '1/3 completed');
  const create = app.find((node) => node.id === 'project-name');
  create.value = 'Unrelated';
  await create.parent.fire('submit');
  assert.deepEqual(names(), ['Alpha  Beta', 'alpha Beta', 'ALPHA archive']);
  await list.children[0].children[2].fire('click');
  assert.equal(window.location.href, '/projects/1');
  const reopened = await renderUI('/', fetch);
  assert.equal(reopened.app.find((node) => node.id === search.id).value, '');
  assert.equal(reopened.app.find((node) => node.attributes['aria-label'] === 'Projects').children.length, 5);
});

test('task search intersects every filter, retains applied query, and stays usable when archived', async () => {
  const project = { id: 7, name: 'Project', archived: 0, default_task_priority: 'Normal' };
  const tasks = [
    { id: 1, title: 'ALPHA  first', completed: false, priority: 'High', due_date: '2024-02-29' },
    { id: 2, title: 'alpha second', completed: true, priority: 'Low', due_date: '2024-03-01' },
    { id: 3, title: 'Other', completed: false, priority: 'High', due_date: '2024-02-29' },
    { id: 4, title: 'Alpha undated', completed: true, priority: 'High', due_date: '' },
    { id: 5, title: 'ÄLPHA', completed: false, priority: 'Normal', due_date: '' },
  ];
  const original = JSON.stringify(tasks);
  let mutations = 0;
  const fetch = async (path, options = {}) => {
    if (options.method) mutations++;
    return jsonResponse(path === '/api/projects' ? [project] : path === '/api/projects/7' ? project : tasks);
  };
  for (const archived of [0, 1, 0]) {
    project.archived = archived;
    const { app, window } = await renderUI('/projects/7', fetch);
    const search = app.find((node) => node.id === 'task-search');
    const completion = app.find((node) => node.id === 'task-filter');
    const priority = app.find((node) => node.id === 'priority-filter');
    const from = app.find((node) => node.id === 'due-from');
    const through = app.find((node) => node.id === 'due-through');
    const list = app.find((node) => node.attributes['aria-label'] === 'Tasks');
    const titles = () => list.children.map((row) => row.children[0].textContent);
    assert.equal(search.type, 'text');
    assert.equal(search.value, '');
    assert.equal(search.disabled, false);
    assert.equal(app.find((node) => node.htmlFor === search.id).textContent, 'Task search');
    assert.equal(search.parent.children[2].textContent, 'Search tasks');
    assert.equal(search.parent.children[2].disabled, false);
    for (const query of ['alpha', 'alpha  ', 'alpha  f', 'alpha\t \tf', 'alpha s', 'älpha', 'Älpha', ' \t ']) {
      for (const completed of ['All', 'Open', 'Completed']) {
        for (const selectedPriority of ['All', 'Low', 'Normal', 'High']) {
          completion.value = completed;
          await completion.fire('change');
          priority.value = selectedPriority;
          await priority.fire('change');
          from.value = through.value = '2024-02-29';
          await from.parent.fire('submit');
          search.value = ` ${query} `;
          await search.parent.fire('submit');
          const fold = (text) => text.replace(/[ \t]+/g, ' ').replace(/[A-Z]/g, (letter) => letter.toLowerCase());
          const expected = tasks.filter((task) => task.due_date === '2024-02-29' &&
            (completed === 'All' || task.completed === (completed === 'Completed')) &&
            (selectedPriority === 'All' || task.priority === selectedPriority) &&
            fold(task.title).includes(fold(query.trim())));
          assert.deepEqual(titles(), expected.map((task) => task.title));
          assert.equal(completion.value, completed);
          assert.equal(priority.value, selectedPriority);
          assert.equal(from.value, '2024-02-29');
          assert.equal(through.value, '2024-02-29');
          for (const row of list.children) assert.equal(row.children[1].disabled, Boolean(archived));
        }
      }
    }
    search.value = ' ALPHA ';
    await search.parent.fire('submit');
    search.value = 'unapplied';
    completion.value = priority.value = 'All';
    await completion.fire('change');
    await priority.fire('change');
    assert.deepEqual(titles(), ['ALPHA  first']);
    from.value = through.value = '';
    await from.parent.fire('submit');
    assert.deepEqual(titles(), ['ALPHA  first', 'alpha second', 'Alpha undated']);
    search.value = '';
    await search.parent.fire('submit');
    assert.deepEqual(titles(), tasks.map((task) => task.title));
    await app.find((node) => node.textContent === 'Projects').fire('click');
    assert.equal(window.location.href, '/');
    const reopened = await renderUI('/projects/7', fetch);
    assert.equal(reopened.app.find((node) => node.id === search.id).value, '');
    assert.equal(reopened.app.find((node) => node.attributes['aria-label'] === 'Tasks').children.length, 5);
  }
  assert.equal(mutations, 0);
  assert.equal(JSON.stringify(tasks), original);
});

test('search collapses only ASCII spaces and tabs and displays original saved names and titles', async () => {
  const names = ['MiXeD \t  Case', 'mixed case', 'mixed\ncase', 'mixed\u00a0case'];
  const projects = names.map((name, index) => ({ id: index + 1, name, archived: 0,
    completed_count: 0, total_count: 0, default_task_priority: 'Normal' }));
  const tasks = names.map((title, index) => ({ id: index + 1, project_id: 1, title,
    completed: false, priority: 'Normal', due_date: '' }));
  const original = JSON.stringify({ projects, tasks });
  const fetch = async (path, options = {}) => {
    assert.equal(options.method, undefined, 'Search must not write stored data');
    return jsonResponse(path === '/api/projects' ? projects : path === '/api/projects/1' ? projects[0] : tasks);
  };
  for (const [path, searchId, listLabel] of [
    ['/', 'project-search', 'Projects'], ['/projects/1', 'task-search', 'Tasks'],
  ]) {
    const { app } = await renderUI(path, fetch);
    const search = app.find((node) => node.id === searchId);
    const list = app.find((node) => node.attributes['aria-label'] === listLabel);
    for (const [query, expected] of [
      [' \tMIXED  \t CASE\n', names.slice(0, 2)],
      ['mixed case', names.slice(0, 2)],
      ['mixed\ncase', [names[2]]],
      ['mixed\u00a0case', [names[3]]],
      [' \t ', names],
    ]) {
      search.value = query;
      await search.parent.fire('submit');
      assert.deepEqual(list.children.map((row) => row.children[0].textContent), expected);
      assert.equal(JSON.stringify({ projects, tasks }), original);
    }
    const reloaded = await renderUI(path, fetch);
    assert.deepEqual(reloaded.app.find((node) => node.attributes['aria-label'] === listLabel)
      .children.map((row) => row.children[0].textContent), names);
  }
});

test('task mutations re-evaluate search while preserving all applied filters and current data', async () => {
  const project = { id: 7, name: 'Project', archived: 0, default_task_priority: 'High' };
  const destinationProject = { id: 8, name: 'Destination', archived: 0 };
  let tasks = [
    { id: 1, project_id: 7, title: 'Match first', completed: false, priority: 'High', due_date: '2024-02-29' },
    { id: 2, project_id: 7, title: 'Other', completed: false, priority: 'High', due_date: '2024-02-29' },
  ];
  const fetch = async (path, options = {}) => {
    if (options.method === 'PATCH') {
      const input = JSON.parse(options.body);
      const target = path === '/api/projects/7' ? project : tasks.find((task) => path.endsWith(`/tasks/${task.id}`));
      if (input.destination_project_id) {
        tasks = tasks.filter((task) => task !== target);
        target.project_id = input.destination_project_id;
      } else Object.assign(target, input);
      return jsonResponse(target);
    }
    if (options.method === 'POST') {
      const task = { id: 3, project_id: 7, title: JSON.parse(options.body).title,
        completed: false, priority: project.default_task_priority, due_date: '' };
      tasks.push(task);
      return jsonResponse(task);
    }
    return jsonResponse(path === '/api/projects' ? [project, destinationProject] : path === '/api/projects/7' ? project : tasks);
  };
  const { app } = await renderUI('/projects/7', fetch);
  const search = app.find((node) => node.id === 'task-search');
  const completion = app.find((node) => node.id === 'task-filter');
  const priority = app.find((node) => node.id === 'priority-filter');
  const from = app.find((node) => node.id === 'due-from');
  const through = app.find((node) => node.id === 'due-through');
  const list = app.find((node) => node.attributes['aria-label'] === 'Tasks');
  const titles = () => list.children.map((row) => row.children[0].textContent);
  completion.value = 'Open';
  await completion.fire('change');
  priority.value = 'High';
  await priority.fire('change');
  from.value = through.value = '2024-02-29';
  await from.parent.fire('submit');
  search.value = 'mAtCh';
  await search.parent.fire('submit');
  let expectedQuery = 'mAtCh';
  const assertFilters = () => {
    assert.equal(search.value, expectedQuery);
    assert.equal(completion.value, 'Open');
    assert.equal(priority.value, 'High');
    assert.equal(from.value, '2024-02-29');
    assert.equal(through.value, '2024-02-29');
  };
  const submitInput = async (id, value) => {
    const input = app.find((node) => node.id === id);
    input.value = value;
    await input.parent.fire('submit');
    assertFilters();
  };
  await submitInput('new-project-name', 'Renamed project');
  const defaultPriority = app.find((node) => node.id === 'default-task-priority');
  defaultPriority.value = 'Low';
  await defaultPriority.fire('change');
  assertFilters();
  assert.deepEqual(titles(), ['Match first']);
  await submitInput('new-task-title-1', 'No longer matches');
  // The substring still matches "matches".
  assert.deepEqual(titles(), ['No longer matches']);
  await submitInput('new-task-title-1', 'Removed');
  assert.deepEqual(titles(), []);
  search.value = '';
  await search.parent.fire('submit');
  expectedQuery = '';
  await submitInput('new-task-title-2', 'Match second');
  search.value = expectedQuery = 'mAtCh';
  await search.parent.fire('submit');
  assert.deepEqual(titles(), ['Match second']);
  await submitInput('task-title', 'Match created');
  assert.deepEqual(titles(), ['Match second']);
  assert.equal(tasks[2].priority, 'Low');
  await submitInput('task-due-date-2', '2024-03-01');
  assert.deepEqual(titles(), []);
  through.value = '2024-03-01';
  await from.parent.fire('submit');
  assert.deepEqual(titles(), ['Match second']);
  // Restore the original boundary before subsequent edit checks.
  through.value = '2024-02-29';
  await from.parent.fire('submit');
  search.value = expectedQuery = '';
  await search.parent.fire('submit');
  await submitInput('task-due-date-1', '2024-02-29');
  search.value = expectedQuery = 'removed';
  await search.parent.fire('submit');
  const taskPriority = app.find((node) => node.id === 'task-priority-1');
  taskPriority.value = 'Low';
  await taskPriority.fire('change');
  assertFilters();
  assert.deepEqual(titles(), []);
  priority.value = 'Low';
  await priority.fire('change');
  assert.deepEqual(titles(), ['Removed']);
  const checkbox = list.children[0].children[1];
  checkbox.checked = true;
  await checkbox.fire('change');
  assert.equal(search.value, 'removed');
  assert.deepEqual(titles(), []);
  completion.value = 'Completed';
  await completion.fire('change');
  assert.deepEqual(titles(), ['Removed']);
  const destination = app.find((node) => node.id === 'destination-project-1');
  await destination.parent.fire('submit');
  assert.deepEqual(titles(), []);
  assert.equal(search.value, 'removed');
  assert.equal(completion.value, 'Completed');
  assert.equal(priority.value, 'Low');
  assert.equal(from.value, '2024-02-29');
  assert.equal(through.value, '2024-02-29');
  search.value = '';
  await search.parent.fire('submit');
  assert.deepEqual(titles(), []);
});
