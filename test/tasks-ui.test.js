import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

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

const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

test('task UI validation, labels, filtering, creation order, and completion changes', async () => {
  const app = new Element('main');
  let tasks = [
    { id: 1, project_id: 7, title: 'Open task', completed: false, priority: 'Normal' },
    { id: 2, project_id: 7, title: 'Done task', completed: true, priority: 'Normal' },
  ];
  const requests = [];
  await vm.runInNewContext(source, {
    document: {
      querySelector: () => app,
      createElement: (tag) => new Element(tag),
    },
    window: { location: { pathname: '/projects/7' } },
    fetch: async (path, options = {}) => {
      requests.push({ path, options });
      let body;
      if (path === '/api/projects/7') body = { id: 7, name: 'Project seven' };
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
    assert.equal(requests.length, 2);
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
    return jsonResponse(path === '/api/projects/7'
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
  assert.equal(requests.length, 2);
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
    return jsonResponse(path === '/api/projects/7' ? project : tasks);
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
    return jsonResponse(path === '/api/projects/7' ? project : tasks);
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
    assert.equal(requests.length, 2);
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
    return jsonResponse(path === '/api/projects/7' ? project : tasks);
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
    assert.equal(requests.length, 2);
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
    return jsonResponse(path === '/api/projects/7' ? project : tasks);
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
    return jsonResponse(path === '/api/projects/7' ? project : tasks);
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
