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
    { id: 1, project_id: 7, title: 'Open task', completed: false },
    { id: 2, project_id: 7, title: 'Done task', completed: true },
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
        body = { id: tasks.length + 1, project_id: 7, title: input.title, completed: false };
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
        { id: 1, title: 'Open task', completed: false },
        { id: 2, title: 'Done task', completed: true },
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

test('rename UI validates names, updates heading, and preserves navigation and tasks after reload', async () => {
  const project = { id: 7, name: 'Original', archived: 0, completed_count: 1, total_count: 2 };
  const tasks = [
    { id: 1, title: 'Open task', completed: false },
    { id: 2, title: 'Done task', completed: true },
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
