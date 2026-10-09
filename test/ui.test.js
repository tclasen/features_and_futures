import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// Minimal DOM adapter for exercising the application's browser event handlers.
class Element {
  constructor() {
    this.children = [];
    this.dataset = {};
    this.listeners = {};
    this.attributes = {};
    this.value = '';
    this.textContent = '';
  }
  append(...children) { this.children.push(...children); }
  replaceChildren() { this.children = []; }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  setAttribute(name, value) { this.attributes[name] = value; }
  querySelector() { return this.button ??= new Element(); }
  focus() {}
  async trigger(type) { await this.listeners[type]({ preventDefault() {} }); }
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('project task UI validates, filters, updates completion and rolls back errors', async () => {
  const elements = new Map();
  const element = (selector) => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  element('#task-filter').value = 'all';
  const tasks = [
    { id: 1, title: '<b>Open task</b>', completed: false },
    { id: 2, title: 'Done task', completed: true },
  ];
  let failUpdate = false;
  let creates = 0;
  const fetch = async (path, options) => {
    let data;
    let ok = true;
    if (options?.method === 'POST') {
      creates++;
      data = { id: 3, title: JSON.parse(options.body).title, completed: false };
      tasks.push(data);
    } else if (options?.method === 'PATCH') {
      if (failUpdate) {
        ok = false;
        data = { error: 'Save failed' };
      } else {
        const task = tasks.find((task) => path.endsWith(`/${task.id}`));
        task.completed = JSON.parse(options.body).completed;
        data = task;
      }
    } else {
      data = path.endsWith('/tasks') ? tasks : { id: 7, name: 'Project' };
    }
    return { ok, json: async () => structuredClone(data) };
  };
  runInNewContext(await readFile(new URL('../public/app.js', import.meta.url), 'utf8'), {
    document: { querySelector: element, createElement: () => new Element() },
    window: { location: { pathname: '/projects/7' } },
    fetch,
  });
  await settle();
  const rows = () => element('#tasks').children;
  const titles = () => rows().map((row) => row.children[0].textContent);
  assert.deepEqual(titles(), ['<b>Open task</b>', 'Done task']);
  assert.equal(rows()[0].dataset.testid, 'task-row');
  assert.equal(rows()[0].children[1].attributes['aria-label'], 'Complete <b>Open task</b>');
  assert.equal(rows()[0].children[1].checked, false);
  assert.equal(rows()[1].children[1].checked, true);

  element('#task-title').value = ' \t ';
  await element('#create-task').trigger('submit');
  assert.equal(creates, 0);
  assert.equal(element('#error').textContent, 'Task title is required');
  element('#task-title').value = '  New task  ';
  await element('#create-task').trigger('submit');
  assert.equal(creates, 1);
  assert.deepEqual(titles(), ['<b>Open task</b>', 'Done task', 'New task']);

  element('#task-filter').value = 'open';
  await element('#task-filter').trigger('change');
  assert.deepEqual(titles(), ['<b>Open task</b>', 'New task']);
  const checkbox = rows()[0].children[1];
  checkbox.checked = true;
  await checkbox.trigger('change');
  assert.deepEqual(titles(), ['New task']);
  element('#task-filter').value = 'completed';
  await element('#task-filter').trigger('change');
  assert.deepEqual(titles(), ['<b>Open task</b>', 'Done task']);
  const completed = rows()[0].children[1];
  completed.checked = false;
  failUpdate = true;
  await completed.trigger('change');
  assert.equal(completed.checked, true);
  assert.equal(element('#error').textContent, 'Save failed');
  failUpdate = false;
  completed.checked = false;
  await completed.trigger('change');
  assert.deepEqual(titles(), ['Done task']);
  element('#task-filter').value = 'all';
  await element('#task-filter').trigger('change');
  assert.deepEqual(titles(), ['<b>Open task</b>', 'Done task', 'New task']);
});

async function loadUI(pathname, fetch) {
  const elements = new Map();
  const element = (selector) => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  element('#project-filter').value = 'active';
  element('#task-filter').value = 'all';
  const window = { location: { pathname } };
  runInNewContext(await readFile(new URL('../public/app.js', import.meta.url), 'utf8'), {
    document: { querySelector: element, createElement: () => new Element() }, window, fetch,
  });
  await settle();
  return { element, window };
}

test('project list filters, summaries, archive, restore and navigation', async () => {
  const data = [
    { id: 1, name: 'First', archived: false, completed: 1, total: 2 },
    { id: 2, name: 'Second', archived: false, completed: 0, total: 0 },
  ];
  let fail = false;
  const { element, window } = await loadUI('/', async (path, options) => {
    if (fail) return { ok: false, json: async () => ({ error: 'Save failed' }) };
    let result = data;
    if (options?.method === 'PATCH') {
      result = data.find((project) => path.endsWith(`/${project.id}`));
      result.archived = JSON.parse(options.body).archived;
    }
    return { ok: true, json: async () => structuredClone(result) };
  });
  const rows = () => element('#projects').children;
  assert.equal(rows().length, 2);
  assert.equal(rows()[0].dataset.testid, 'project-row');
  assert.equal(rows()[0].children[1].dataset.testid, 'project-summary');
  assert.equal(rows()[0].children[1].textContent, '1/2 completed');
  assert.equal(rows()[1].children[1].textContent, '0/0 completed');
  fail = true;
  await rows()[0].children[3].trigger('click');
  assert.equal(rows().length, 2);
  assert.equal(element('#error').textContent, 'Save failed');
  fail = false;
  await rows()[0].children[3].trigger('click');
  assert.equal(rows().length, 1);
  assert.equal(rows()[0].children[0].textContent, 'Second');
  element('#project-filter').value = 'archived';
  await element('#project-filter').trigger('change');
  assert.equal(rows().length, 1);
  assert.equal(rows()[0].children[3].textContent, 'Restore project');
  await rows()[0].children[2].trigger('click');
  assert.equal(window.location.href, '/projects/1');
  await rows()[0].children[3].trigger('click');
  assert.equal(rows().length, 0);
  element('#project-filter').value = 'active';
  await element('#project-filter').trigger('change');
  assert.equal(rows().length, 2);
  assert.equal(rows()[0].children[0].textContent, 'First');
  assert.equal(rows()[0].children[1].textContent, '1/2 completed');
});

test('archived project is visibly read-only and task filtering remains usable', async () => {
  let writes = 0;
  const { element } = await loadUI('/projects/1', async (path, options) => {
    if (options) writes++;
    const data = path.endsWith('/tasks') ? [
      { id: 1, title: 'Open', completed: false },
      { id: 2, title: 'Done', completed: true },
    ] : { id: 1, name: 'Archived', archived: true };
    return { ok: true, json: async () => data };
  });
  assert.equal(element('#archived-notice').hidden, false);
  assert.equal(element('#create-task').querySelector('button').disabled, true);
  assert.equal(element('#new-project-name').disabled, true);
  assert.equal(element('#rename-project').querySelector('button').disabled, true);
  element('#new-project-name').value = 'Blocked rename';
  await element('#rename-project').trigger('submit');
  assert.equal(element('#tasks').children.length, 2);
  for (const row of element('#tasks').children) assert.equal(row.children[1].disabled, true);
  element('#task-title').value = 'Blocked';
  await element('#create-task').trigger('submit');
  await element('#tasks').children[0].children[1].trigger('change');
  assert.equal(writes, 0);
  element('#task-filter').value = 'completed';
  await element('#task-filter').trigger('change');
  assert.equal(element('#tasks').children.length, 1);
  assert.equal(element('#tasks').children[0].children[0].textContent, 'Done');
  assert.equal(element('#tasks').children[0].children[1].disabled, true);
});

test('rename UI validates, updates heading without navigation, and preserves tasks on errors', async () => {
  let writes = 0;
  let fail = false;
  const project = { id: 1, name: 'Original', archived: false };
  const { element, window } = await loadUI('/projects/1', async (path, options) => {
    if (options) {
      writes++;
      assert.equal(path, '/api/projects/1');
      assert.equal(options.method, 'PATCH');
      if (fail) return { ok: false, json: async () => ({ error: 'Save failed' }) };
      project.name = JSON.parse(options.body).name;
    }
    const data = path.endsWith('/tasks') ? [{ id: 3, title: 'Saved task', completed: true }] : project;
    return { ok: true, json: async () => structuredClone(data) };
  });
  assert.equal(element('#new-project-name').disabled, false);
  assert.equal(element('#rename-project').querySelector('button').disabled, false);
  element('#new-project-name').value = ' \t ';
  await element('#rename-project').trigger('submit');
  assert.equal(writes, 0);
  assert.equal(element('#error').textContent, 'Project name is required');
  assert.equal(element('#project-title').textContent, 'Original');
  element('#new-project-name').value = '  Renamed <project>  ';
  await element('#rename-project').trigger('submit');
  assert.equal(writes, 1);
  assert.equal(element('#project-title').textContent, 'Renamed <project>');
  assert.equal(window.location.pathname, '/projects/1');
  assert.equal(element('#tasks').children[0].children[0].textContent, 'Saved task');
  assert.equal(element('#tasks').children[0].children[1].checked, true);
  fail = true;
  element('#new-project-name').value = 'Failed rename';
  await element('#rename-project').trigger('submit');
  assert.equal(element('#project-title').textContent, 'Renamed <project>');
  assert.equal(element('#error').textContent, 'Save failed');
  assert.equal(element('#rename-project').querySelector('button').disabled, false);
});
