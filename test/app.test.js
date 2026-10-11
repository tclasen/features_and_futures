import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// Only the DOM operations used by the app are needed for these interaction checks.
class Element {
  children = [];
  dataset = {};
  attributes = {};
  listeners = {};
  value = '';
  hidden = false;
  textContent = '';
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  querySelector() { return this.button; }
  focus() {}
  async dispatch(name) { await this.listeners[name]({ preventDefault() {} }); }
}

test('project rename validates, updates the heading, preserves the URL and tasks, and reports save failures', async () => {
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  for (const form of ['#project-form', '#task-form', '#rename-form']) {
    element(form).button = new Element();
  }
  element('#task-filter').value = 'all';
  const location = { pathname: '/projects/example' };
  const document = { querySelector: element, createElement: () => new Element() };
  const writes = [];
  let failNextWrite = false;
  await runInNewContext(source, {
    document,
    window: { location },
    fetch: async (path, options) => {
      if (!options) {
        const body = path.endsWith('/tasks')
          ? [{ id: 'task', title: 'Existing task', completed: true }]
          : { id: 'example', name: 'Original', archived: false };
        return { ok: true, json: async () => body };
      }
      writes.push({ path, ...options });
      if (failNextWrite) return { ok: false, json: async () => ({ error: 'Save failed' }) };
      return { ok: true, json: async () => ({ id: 'example', name: JSON.parse(options.body).name }) };
    },
  });
  assert.equal(element('#rename-form').hidden, false);
  assert.equal(element('#rename-form').button.disabled, false);
  assert.equal(element('#new-project-name').disabled, false);
  for (const name of ['', ' \t ']) {
    element('#new-project-name').value = name;
    await element('#rename-form').dispatch('submit');
    assert.equal(element('#rename-alert').textContent, 'Project name is required');
    assert.equal(element('#rename-alert').hidden, false);
    assert.equal(element('#project-heading').textContent, 'Original');
  }
  assert.equal(writes.length, 0);
  element('#new-project-name').value = '  Renamed project  ';
  await element('#rename-form').dispatch('submit');
  assert.equal(writes[0].path, '/api/projects/example');
  assert.equal(writes[0].method, 'PATCH');
  assert.deepEqual(JSON.parse(writes[0].body), { name: 'Renamed project' });
  assert.equal(element('#project-heading').textContent, 'Renamed project');
  assert.equal(document.title, 'Renamed project · Workboard');
  assert.equal(location.pathname, '/projects/example');
  assert.equal(location.href, undefined);
  assert.equal(element('#rename-alert').hidden, true);
  assert.equal(element('#task-list').children[0].children[1].textContent, 'Existing task');
  assert.equal(element('#task-list').children[0].children[0].checked, true);
  failNextWrite = true;
  element('#new-project-name').value = 'Unsaved';
  await element('#rename-form').dispatch('submit');
  assert.equal(element('#project-heading').textContent, 'Renamed project');
  assert.equal(element('#rename-alert').textContent, 'Save failed');
  assert.equal(element('#rename-form').button.disabled, false);
});

test('task UI validates titles, filters in creation order, and saves checkbox changes', async () => {
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  element('#project-form').button = new Element();
  element('#task-form').button = new Element();
  element('#rename-form').button = new Element();
  element('#task-filter').value = 'all';
  const savedTasks = [
    { id: 'one', title: 'First task', completed: false },
    { id: 'two', title: 'Second task', completed: true },
    { id: 'three', title: 'Third task', completed: false },
  ];
  const writes = [];
  let failNextWrite = false;
  await runInNewContext(source, {
    document: { querySelector: element, createElement: () => new Element() },
    window: { location: { pathname: '/projects/example' } },
    fetch: async (path, options) => {
      let body;
      if (!options) {
        body = path.endsWith('/tasks') ? structuredClone(savedTasks) : { id: 'example', name: 'Example' };
      } else {
        writes.push({ path, ...options });
        if (failNextWrite) {
          failNextWrite = false;
          return { ok: false, json: async () => ({ error: 'Save failed' }) };
        }
        const input = JSON.parse(options.body);
        if (options.method === 'POST') {
          body = { id: 'four', title: input.title, completed: false };
          savedTasks.push(body);
        } else {
          const task = savedTasks.find(task => path.endsWith(`/${task.id}`));
          task.completed = input.completed;
          body = { ...task };
        }
      }
      return { ok: true, json: async () => body };
    },
  });
  const rows = () => element('#task-list').children;
  const titles = () => rows().map(row => row.children[1].textContent);
  const filter = async value => {
    element('#task-filter').value = value;
    await element('#task-filter').dispatch('change');
  };
  assert.equal(element('#project-heading').textContent, 'Example');
  assert.equal(element('#task-controls').hidden, false);
  assert.deepEqual(titles(), ['First task', 'Second task', 'Third task']);
  assert.ok(rows().every(row => row.dataset.testid === 'task-row'));
  assert.equal(rows()[0].children[0].attributes['aria-label'], 'Complete First task');
  assert.equal(rows()[1].children[0].checked, true);
  element('#task-title').value = ' \t ';
  await element('#task-form').dispatch('submit');
  assert.equal(element('#task-alert').textContent, 'Task title is required');
  assert.equal(element('#task-alert').hidden, false);
  assert.equal(writes.length, 0);
  assert.equal(rows().length, 3);
  await filter('open');
  assert.deepEqual(titles(), ['First task', 'Third task']);
  const firstCheckbox = rows()[0].children[0];
  firstCheckbox.checked = true;
  await firstCheckbox.dispatch('change');
  assert.equal(writes.at(-1).path, '/api/projects/example/tasks/one');
  assert.equal(savedTasks[0].completed, true);
  assert.deepEqual(titles(), ['Third task']);
  await filter('completed');
  assert.deepEqual(titles(), ['First task', 'Second task']);
  const completedCheckbox = rows()[0].children[0];
  completedCheckbox.checked = false;
  await completedCheckbox.dispatch('change');
  assert.equal(savedTasks[0].completed, false);
  assert.deepEqual(titles(), ['Second task']);
  element('#task-title').value = '  Fourth task  ';
  await element('#task-form').dispatch('submit');
  assert.equal(savedTasks[3].title, 'Fourth task');
  assert.equal(savedTasks[3].completed, false);
  assert.deepEqual(titles(), ['Second task']);
  await filter('all');
  assert.deepEqual(titles(), ['First task', 'Second task', 'Third task', 'Fourth task']);
  failNextWrite = true;
  const checkbox = rows()[0].children[0];
  checkbox.checked = true;
  await checkbox.dispatch('change');
  assert.equal(checkbox.checked, false);
  assert.equal(checkbox.disabled, false);
  assert.equal(element('#task-alert').textContent, 'Save failed');
});

test('project UI filters, summarizes, archives, and restores rows in creation order', async () => {
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  element('#project-form').button = new Element();
  element('#task-form').button = new Element();
  element('#rename-form').button = new Element();
  element('#project-filter').value = 'active';
  const projects = [
    { id: 'one', name: 'First', archived: false, completed: 1, total: 2 },
    { id: 'two', name: 'Second', archived: false, completed: 0, total: 0 },
  ];
  const location = { pathname: '/' };
  await runInNewContext(source, {
    document: { querySelector: element, createElement: () => new Element() },
    window: { location },
    fetch: async (path, options) => {
      if (!options) return { ok: true, json: async () => structuredClone(projects) };
      const project = projects.find(project => path.endsWith(`/${project.id}`));
      project.archived = JSON.parse(options.body).archived;
      return { ok: true, json: async () => ({ ...project }) };
    },
  });
  const rows = () => element('#project-list').children;
  assert.deepEqual(rows().map(row => row.children[0].textContent), ['First', 'Second']);
  assert.equal(rows()[0].dataset.testid, 'project-row');
  assert.equal(rows()[0].children[1].dataset.testid, 'project-summary');
  assert.equal(rows()[0].children[1].textContent, '1/2 completed');
  assert.equal(rows()[1].children[1].textContent, '0/0 completed');
  assert.equal(rows()[0].children[3].textContent, 'Archive project');
  await rows()[0].children[3].dispatch('click');
  assert.deepEqual(rows().map(row => row.children[0].textContent), ['Second']);
  element('#project-filter').value = 'archived';
  await element('#project-filter').dispatch('change');
  assert.equal(rows().length, 1);
  assert.equal(rows()[0].children[1].textContent, '1/2 completed');
  assert.equal(rows()[0].children[2].textContent, 'Open project');
  await rows()[0].children[2].dispatch('click');
  assert.equal(location.href, '/projects/one');
  assert.equal(rows()[0].children[3].textContent, 'Restore project');
  await rows()[0].children[3].dispatch('click');
  assert.equal(rows().length, 0);
  element('#project-filter').value = 'active';
  await element('#project-filter').dispatch('change');
  assert.deepEqual(rows().map(row => row.children[0].textContent), ['First', 'Second']);
});

test('archived project UI disables task changes while keeping filters usable', async () => {
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  element('#project-form').button = new Element();
  element('#task-form').button = new Element();
  element('#rename-form').button = new Element();
  element('#task-filter').value = 'all';
  let writes = 0;
  await runInNewContext(source, {
    document: { querySelector: element, createElement: () => new Element() },
    window: { location: { pathname: '/projects/one' } },
    fetch: async (path, options) => {
      if (options) writes++;
      const body = path.endsWith('/tasks') ? [
        { id: 'a', title: 'Open task', completed: false },
        { id: 'b', title: 'Done task', completed: true },
      ] : { id: 'one', name: 'Archived example', archived: true };
      return { ok: true, json: async () => body };
    },
  });
  const rows = () => element('#task-list').children;
  assert.equal(element('#archived-message').hidden, false);
  assert.equal(element('#task-form').button.disabled, true);
  assert.equal(element('#rename-form').hidden, false);
  assert.equal(element('#rename-form').button.disabled, true);
  assert.equal(element('#new-project-name').disabled, true);
  element('#new-project-name').value = 'Blocked rename';
  await element('#rename-form').dispatch('submit');
  assert.equal(rows().length, 2);
  assert.ok(rows().every(row => row.children[0].disabled));
  element('#task-filter').value = 'completed';
  await element('#task-filter').dispatch('change');
  assert.equal(rows().length, 1);
  assert.equal(rows()[0].children[1].textContent, 'Done task');
  assert.equal(rows()[0].children[0].disabled, true);
  element('#task-filter').value = 'open';
  await element('#task-filter').dispatch('change');
  assert.equal(rows()[0].children[1].textContent, 'Open task');
  element('#task-title').value = 'Attempt';
  await element('#task-form').dispatch('submit');
  assert.equal(writes, 0);
});
