import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// Minimal DOM adapter for exercising the browser event handlers without dependencies.
class Element {
  constructor(tag = 'div') {
    this.tag = tag;
    this.children = [];
    this.listeners = {};
    this.dataset = {};
    this.attributes = {};
    this.value = '';
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(event, listener) { this.listeners[event] = listener; }
  setAttribute(name, value) { this.attributes[name] = value; }
  querySelector(tag) { return this.children.find((child) => child.tag === tag); }
  focus() {}
  async fire(event) { await this.listeners[event]({ preventDefault() {} }); }
}

function pageElements() {
  const ids = ['project-list', 'project-detail', 'projects', 'create-project', 'project-name',
    'error', 'create-task', 'task-title', 'task-filter', 'tasks', 'back-to-projects', 'project-heading',
    'project-filter', 'archived-project'];
  const elements = new Map(ids.map((id) => [`#${id}`, new Element()]));
  elements.get('#create-task').append(new Element('button'));
  elements.get('#create-project').append(new Element('button'));
  elements.get('#task-filter').value = 'All';
  elements.get('#project-filter').value = 'Active';
  return elements;
}

async function loadPage(elements, pathname, fetch, assign = () => {}) {
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  await runInNewContext(`(async () => { ${source} })()`, {
    document: {
      querySelector: (selector) => elements.get(selector),
      createElement: (tag) => new Element(tag),
    },
    fetch,
    window: { location: { pathname, assign } },
  });
}

test('project page creates tasks, names checkboxes, and filters saved completion', async () => {
  const elements = pageElements();
  const element = (id) => elements.get(`#${id}`);
  let savedTasks = [
    { id: 1, title: 'Open task', completed: false },
    { id: 2, title: '<Completed task>', completed: true },
  ];
  const writes = [];
  const fetch = async (path, options) => {
    let data;
    if (options) {
      const body = JSON.parse(options.body);
      writes.push({ path, ...options, body });
      if (options.method === 'POST') {
        data = { id: 3, title: body.title, completed: false };
        savedTasks.push(data);
      } else {
        const id = Number(path.split('/').at(-1));
        data = { ...savedTasks.find((task) => task.id === id), completed: body.completed };
        savedTasks = savedTasks.map((task) => task.id === id ? data : task);
      }
    } else {
      data = path.endsWith('/tasks') ? savedTasks : { id: 7, name: 'Project seven' };
    }
    return { ok: true, json: async () => JSON.parse(JSON.stringify(data)) };
  };
  await loadPage(elements, '/projects/7', fetch);
  const rows = () => element('tasks').children;
  const titles = () => rows().map((row) => row.children[1].textContent);
  assert.equal(element('project-heading').textContent, 'Project seven');
  assert.deepEqual(titles(), ['Open task', '<Completed task>']);
  assert.ok(rows().every((row) => row.dataset.testid === 'task-row'));
  assert.equal(rows()[0].children[0].attributes['aria-label'], 'Complete Open task');
  assert.equal(rows()[1].children[0].checked, true);

  element('task-title').value = ' \t ';
  await element('create-task').fire('submit');
  assert.equal(element('error').textContent, 'Task title is required');
  assert.equal(element('error').hidden, false);
  assert.equal(writes.length, 0);
  assert.equal(rows().length, 2);

  element('task-title').value = '  New task  ';
  await element('create-task').fire('submit');
  assert.equal(writes[0].body.title, 'New task');
  assert.equal(writes[0].path, '/api/projects/7/tasks');
  assert.deepEqual(titles(), ['Open task', '<Completed task>', 'New task']);
  assert.equal(rows()[2].children[0].checked, false);

  element('task-filter').value = 'Open';
  await element('task-filter').fire('change');
  assert.deepEqual(titles(), ['Open task', 'New task']);
  const checkbox = rows()[0].children[0];
  checkbox.checked = true;
  await checkbox.fire('change');
  assert.deepEqual(titles(), ['New task']);
  assert.equal(writes[1].body.completed, true);

  element('task-filter').value = 'Completed';
  await element('task-filter').fire('change');
  assert.deepEqual(titles(), ['Open task', '<Completed task>']);
  const completedCheckbox = rows()[0].children[0];
  completedCheckbox.checked = false;
  await completedCheckbox.fire('change');
  assert.deepEqual(titles(), ['<Completed task>']);
  assert.equal(writes[2].body.completed, false);

  element('task-filter').value = 'All';
  await element('task-filter').fire('change');
  assert.deepEqual(titles(), ['Open task', '<Completed task>', 'New task']);
});

test('project list filters archives, restores projects, and shows completion summaries', async () => {
  const elements = pageElements();
  const element = (id) => elements.get(`#${id}`);
  let projects = [
    { id: 1, name: 'First', archived: 0, completed: 1, total: 2 },
    { id: 2, name: 'Second', archived: 0, completed: 0, total: 0 },
    { id: 3, name: 'Third', archived: 1, completed: 2, total: 3 },
  ];
  let destination;
  await loadPage(elements, '/', async (path, options) => {
    let data = projects;
    if (options) {
      const id = Number(path.split('/').at(-1));
      data = { ...projects.find((project) => project.id === id), archived: Number(JSON.parse(options.body).archived) };
      projects = projects.map((project) => project.id === id ? data : project);
    }
    return { ok: true, json: async () => JSON.parse(JSON.stringify(data)) };
  }, (path) => { destination = path; });
  const rows = () => element('projects').children;
  const names = () => rows().map((row) => row.children[0].textContent);
  assert.deepEqual(names(), ['First', 'Second']);
  assert.ok(rows().every((row) => row.dataset.testid === 'project-row'));
  assert.equal(rows()[0].children[1].dataset.testid, 'project-summary');
  assert.equal(rows()[0].children[1].textContent, '1/2 completed');
  assert.equal(rows()[1].children[1].textContent, '0/0 completed');
  assert.equal(rows()[0].children[3].textContent, 'Archive project');
  await rows()[0].children[3].fire('click');
  assert.deepEqual(names(), ['Second']);
  element('project-filter').value = 'Archived';
  await element('project-filter').fire('change');
  assert.deepEqual(names(), ['First', 'Third']);
  assert.equal(rows()[0].children[1].textContent, '1/2 completed');
  assert.equal(rows()[0].children[3].textContent, 'Restore project');
  await rows()[0].children[2].fire('click');
  assert.equal(destination, '/projects/1');
  await rows()[0].children[3].fire('click');
  assert.deepEqual(names(), ['Third']);
  element('project-filter').value = 'Active';
  await element('project-filter').fire('change');
  assert.deepEqual(names(), ['First', 'Second']);
  assert.equal(rows()[0].children[1].textContent, '1/2 completed');
});

test('archived project disables task writes while preserving task filters', async () => {
  const elements = pageElements();
  const element = (id) => elements.get(`#${id}`);
  await loadPage(elements, '/projects/1', async (path, options) => {
    assert.equal(options, undefined, 'Archived pages must not write tasks');
    const data = path.endsWith('/tasks') ? [
      { id: 1, title: 'Open', completed: false },
      { id: 2, title: 'Done', completed: true },
    ] : { id: 1, name: 'Archived example', archived: 1 };
    return { ok: true, json: async () => data };
  });
  const rows = () => element('tasks').children;
  assert.equal(element('archived-project').hidden, false);
  assert.equal(element('create-task').querySelector('button').disabled, true);
  assert.equal(rows().length, 2);
  assert.ok(rows().every((row) => row.children[0].disabled));
  element('task-title').value = 'Blocked';
  await element('create-task').fire('submit');
  await rows()[0].children[0].fire('change');
  element('task-filter').value = 'Completed';
  await element('task-filter').fire('change');
  assert.deepEqual(rows().map((row) => row.children[1].textContent), ['Done']);
  assert.equal(rows()[0].children[0].disabled, true);
  element('task-filter').value = 'Open';
  await element('task-filter').fire('change');
  assert.deepEqual(rows().map((row) => row.children[1].textContent), ['Open']);
});
