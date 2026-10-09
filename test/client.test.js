import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// A small DOM double exercises the actual client script without external dependencies.
class Element {
  constructor() {
    this.children = [];
    this.listeners = {};
    this.dataset = {};
    this.value = '';
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  querySelector() { return this.button ??= new Element(); }
  focus() {}
  async emit(name) { await this.listeners[name]({ preventDefault() {} }); }
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('project client trims titles, filters in order, and saves completion', async () => {
  const elements = new Map();
  const element = (selector) => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  element('#task-filter').value = 'all';
  const tasks = [
    { id: 1, title: 'First', completed: false },
    { id: 2, title: 'Second', completed: true },
  ];
  const requests = [];
  let failUpdate = false;
  runInNewContext(await readFile(new URL('../public/app.js', import.meta.url), 'utf8'), {
    document: { querySelector: element, createElement: () => new Element() },
    window: { location: { pathname: '/projects/7' } },
    fetch: async (path, options = {}) => {
      requests.push({ path, ...options });
      let result;
      if (options.method === 'POST') {
        result = { id: tasks.length + 1, ...JSON.parse(options.body), completed: false };
        tasks.push(result);
      } else if (options.method === 'PATCH') {
        if (failUpdate) return { ok: false, json: async () => ({ error: 'Save failed' }) };
        result = tasks.find((task) => path.endsWith(`/${task.id}`));
        Object.assign(result, JSON.parse(options.body));
      } else {
        result = path.endsWith('/tasks') ? tasks : { id: 7, name: 'Pilot' };
      }
      return { ok: true, json: async () => JSON.parse(JSON.stringify(result)) };
    },
  });
  await settle();
  const rows = () => element('#tasks').children;
  const titles = () => rows().map((row) => row.children[0].children[1].textContent);
  const filter = async (value) => {
    element('#task-filter').value = value;
    await element('#task-filter').emit('change');
  };
  assert.equal(element('#heading').textContent, 'Pilot');
  assert.deepEqual(titles(), ['First', 'Second']);
  assert.equal(rows()[0].dataset.testid, 'task-row');
  assert.equal(rows()[0].children[0].children[0]['aria-label'], 'Complete First');
  await filter('open');
  assert.deepEqual(titles(), ['First']);
  const checkbox = rows()[0].children[0].children[0];
  checkbox.checked = true;
  await checkbox.emit('change');
  assert.deepEqual(titles(), []);
  assert.equal(requests.at(-1).path, '/api/projects/7/tasks/1');
  await filter('completed');
  assert.deepEqual(titles(), ['First', 'Second']);
  const completed = rows()[0].children[0].children[0];
  completed.checked = false;
  await completed.emit('change');
  assert.deepEqual(titles(), ['Second']);
  await filter('all');
  element('#task-title').value = ' \t ';
  const count = requests.length;
  await element('#create-task').emit('submit');
  assert.equal(requests.length, count);
  assert.equal(element('#alert').textContent, 'Task title is required');
  element('#task-title').value = '  Third  ';
  await element('#create-task').emit('submit');
  assert.deepEqual(titles(), ['First', 'Second', 'Third']);
  assert.equal(JSON.parse(requests.at(-1).body).title, 'Third');
  failUpdate = true;
  const failed = rows()[0].children[0].children[0];
  failed.checked = true;
  await failed.emit('change');
  assert.equal(failed.checked, false);
  assert.equal(failed.disabled, false);
  assert.equal(element('#alert').textContent, 'Save failed');
});

test('project list filters archive state and renders summaries and restore actions', async () => {
  const elements = new Map();
  const element = (selector) => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  element('#project-filter').value = 'active';
  const projects = [
    { id: 1, name: 'First', archived: false, completed_count: 1, total_count: 2 },
    { id: 2, name: 'Second', archived: false, completed_count: 0, total_count: 0 },
  ];
  let destination;
  runInNewContext(await readFile(new URL('../public/app.js', import.meta.url), 'utf8'), {
    document: { querySelector: element, createElement: () => new Element() },
    window: { location: { pathname: '/', assign: (path) => { destination = path; } } },
    fetch: async (path, options = {}) => {
      let result = projects;
      if (options.method === 'PATCH') {
        result = projects.find((project) => path.endsWith(`/${project.id}`));
        Object.assign(result, JSON.parse(options.body));
      }
      return { ok: true, json: async () => JSON.parse(JSON.stringify(result)) };
    },
  });
  await settle();
  const rows = () => element('#projects').children;
  assert.equal(rows().length, 2);
  assert.equal(rows()[0].dataset.testid, 'project-row');
  assert.equal(rows()[0].children[1].dataset.testid, 'project-summary');
  assert.equal(rows()[0].children[1].textContent, '1/2 completed');
  assert.equal(rows()[1].children[1].textContent, '0/0 completed');
  assert.equal(rows()[0].children[3].textContent, 'Archive project');
  await rows()[0].children[3].emit('click');
  assert.equal(rows().length, 1);
  assert.equal(rows()[0].children[0].textContent, 'Second');
  element('#project-filter').value = 'archived';
  await element('#project-filter').emit('change');
  assert.equal(rows().length, 1);
  assert.equal(rows()[0].children[3].textContent, 'Restore project');
  await rows()[0].children[2].emit('click');
  assert.equal(destination, '/projects/1');
  await rows()[0].children[3].emit('click');
  assert.equal(rows().length, 0);
  element('#project-filter').value = 'active';
  await element('#project-filter').emit('change');
  assert.deepEqual(rows().map((row) => row.children[0].textContent), ['First', 'Second']);
});

test('archived project is read-only while task filtering remains available', async () => {
  const elements = new Map();
  const element = (selector) => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  element('#task-filter').value = 'all';
  let requests = 0;
  runInNewContext(await readFile(new URL('../public/app.js', import.meta.url), 'utf8'), {
    document: { querySelector: element, createElement: () => new Element() },
    window: { location: { pathname: '/projects/1' } },
    fetch: async (path) => {
      requests++;
      const result = path.endsWith('/tasks')
        ? [{ id: 1, title: 'Open task', completed: false }, { id: 2, title: 'Done task', completed: true }]
        : { id: 1, name: 'Archived', archived: true };
      return { ok: true, json: async () => result };
    },
  });
  await settle();
  assert.equal(element('#archived-notice').hidden, false);
  assert.equal(element('#create-task').querySelector('button').disabled, true);
  assert.equal(element('#tasks').children.length, 2);
  for (const row of element('#tasks').children) assert.equal(row.children[0].children[0].disabled, true);
  element('#task-filter').value = 'completed';
  await element('#task-filter').emit('change');
  assert.equal(element('#tasks').children.length, 1);
  assert.equal(element('#tasks').children[0].children[0].children[1].textContent, 'Done task');
  element('#task-title').value = 'Blocked';
  await element('#create-task').emit('submit');
  assert.equal(requests, 2);
});
