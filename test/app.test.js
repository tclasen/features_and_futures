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
    'project-filter', 'archived-project', 'rename-project', 'new-project-name'];
  const elements = new Map(ids.map((id) => [`#${id}`, new Element()]));
  elements.get('#create-task').append(new Element('button'));
  elements.get('#create-project').append(new Element('button'));
  elements.get('#rename-project').append(new Element('button'));
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
  assert.equal(element('new-project-name').disabled, true);
  assert.equal(element('rename-project').querySelector('button').disabled, true);
  element('new-project-name').value = 'Blocked rename';
  await element('rename-project').fire('submit');
  assert.equal(rows().length, 2);
  assert.ok(rows().every((row) => row.children[0].disabled));
  for (const row of rows()) {
    const renameForm = row.children[2];
    assert.equal(renameForm.children[1].children[0].disabled, true);
    assert.equal(renameForm.children[1].children[1].disabled, true);
    await renameForm.fire('submit');
  }
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

test('active project renames trim input, preserve displayed tasks, and handle errors', async () => {
  const elements = pageElements();
  const element = (id) => elements.get(`#${id}`);
  let project = { id: 7, name: 'Original', archived: 0, completed: 1, total: 2 };
  const tasks = [
    { id: 1, title: 'Open', completed: false },
    { id: 2, title: 'Done', completed: true },
  ];
  const writes = [];
  let rejectWrite = false;
  let destination;
  await loadPage(elements, '/projects/7', async (path, options) => {
    if (!options) {
      return { ok: true, json: async () => path.endsWith('/tasks') ? tasks : project };
    }
    const body = JSON.parse(options.body);
    writes.push({ path, method: options.method, body });
    if (rejectWrite) return { ok: false, json: async () => ({ error: 'Archived project' }) };
    project = { ...project, name: body.name };
    return { ok: true, json: async () => project };
  }, (path) => { destination = path; });
  assert.equal(element('new-project-name').value, 'Original');
  assert.equal(element('new-project-name').disabled, false);
  assert.equal(element('rename-project').querySelector('button').disabled, false);
  const originalRows = element('tasks').children;
  for (const name of ['', ' \t\n ']) {
    element('new-project-name').value = name;
    await element('rename-project').fire('submit');
    assert.equal(element('error').textContent, 'Project name is required');
    assert.equal(element('error').hidden, false);
    assert.equal(element('project-heading').textContent, 'Original');
  }
  assert.equal(writes.length, 0);
  element('new-project-name').value = '  Renamed <project>  ';
  await element('rename-project').fire('submit');
  assert.deepEqual(writes, [{ path: '/api/projects/7', method: 'PATCH', body: { name: 'Renamed <project>' } }]);
  assert.equal(element('project-heading').textContent, 'Renamed <project>');
  assert.equal(element('new-project-name').value, 'Renamed <project>');
  assert.equal(element('error').hidden, true);
  assert.equal(destination, undefined);
  assert.equal(element('tasks').children, originalRows);
  assert.equal(originalRows[0].children[0].checked, false);
  assert.equal(originalRows[1].children[0].checked, true);
  rejectWrite = true;
  element('new-project-name').value = 'Rejected';
  await element('rename-project').fire('submit');
  assert.equal(element('project-heading').textContent, 'Renamed <project>');
  assert.equal(element('error').textContent, 'Archived project');
  assert.equal(element('rename-project').querySelector('button').disabled, false);
});

test('task renames validate titles, update checkbox names, and preserve order and filters', async () => {
  const elements = pageElements();
  const element = (id) => elements.get(`#${id}`);
  let savedTasks = [
    { id: 1, title: 'First', completed: true },
    { id: 2, title: 'Second', completed: false },
  ];
  const writes = [];
  let rejectWrite = false;
  const fetch = async (path, options) => {
    if (!options) {
      const data = path.endsWith('/tasks') ? savedTasks : { id: 7, name: 'Project', archived: 0 };
      return { ok: true, json: async () => JSON.parse(JSON.stringify(data)) };
    }
    const body = JSON.parse(options.body);
    writes.push({ path, method: options.method, body });
    if (rejectWrite) return { ok: false, json: async () => ({ error: 'Archived project' }) };
    const id = Number(path.split('/').at(-1));
    const saved = { ...savedTasks.find((task) => task.id === id), title: body.title };
    savedTasks = savedTasks.map((task) => task.id === id ? saved : task);
    return { ok: true, json: async () => saved };
  };
  await loadPage(elements, '/projects/7', fetch);
  const rows = () => element('tasks').children;
  const renameForm = () => rows()[0].children[2];
  const renameInput = () => renameForm().children[1].children[0];
  assert.equal(renameForm().children[0].textContent, 'New task title');
  assert.equal(renameForm().children[0].htmlFor, renameInput().id);
  assert.equal(renameInput().disabled, false);
  assert.equal(renameForm().children[1].children[1].textContent, 'Rename task');
  assert.equal(renameForm().children[1].children[1].disabled, false);
  for (const value of ['', ' \t\n ']) {
    renameInput().value = value;
    await renameForm().fire('submit');
    assert.equal(element('error').textContent, 'Task title is required');
    assert.equal(element('error').hidden, false);
    assert.equal(rows()[0].children[1].textContent, 'First');
    assert.equal(rows()[0].children[0].checked, true);
  }
  assert.equal(writes.length, 0);
  element('task-filter').value = 'Completed';
  await element('task-filter').fire('change');
  renameInput().value = '  Renamed <task>  ';
  await renameForm().fire('submit');
  assert.deepEqual(writes, [{ path: '/api/projects/7/tasks/1', method: 'PATCH', body: { title: 'Renamed <task>' } }]);
  assert.equal(rows().length, 1);
  assert.equal(rows()[0].children[1].textContent, 'Renamed <task>');
  assert.equal(rows()[0].children[0].attributes['aria-label'], 'Complete Renamed <task>');
  assert.equal(rows()[0].children[0].checked, true);
  assert.equal(element('error').hidden, true);
  rejectWrite = true;
  renameInput().value = 'Rejected';
  await renameForm().fire('submit');
  assert.equal(element('error').textContent, 'Archived project');
  assert.equal(rows()[0].children[1].textContent, 'Renamed <task>');
  assert.equal(renameForm().children[1].children[1].disabled, false);
  element('task-filter').value = 'Open';
  await element('task-filter').fire('change');
  assert.deepEqual(rows().map((row) => row.children[1].textContent), ['Second']);
  element('task-filter').value = 'All';
  await element('task-filter').fire('change');
  assert.deepEqual(rows().map((row) => row.children[1].textContent), ['Renamed <task>', 'Second']);
  const reloaded = pageElements();
  await loadPage(reloaded, '/projects/7', fetch);
  assert.equal(reloaded.get('#tasks').children[0].children[1].textContent, 'Renamed <task>');
  assert.equal(reloaded.get('#tasks').children[0].children[0].checked, true);
});

test('task priorities show saved values, preserve filters and renames, and disable archived edits', async () => {
  let archived = false;
  let savedTasks = [
    { id: 1, title: 'Done', completed: true, priority: 'Normal' },
    { id: 2, title: 'Open', completed: false, priority: 'Low' },
  ];
  let rejectWrite = false;
  const writes = [];
  const fetch = async (path, options) => {
    if (!options) {
      const data = path.endsWith('/tasks') ? savedTasks : { id: 7, name: 'Project', archived: Number(archived) };
      return { ok: true, json: async () => JSON.parse(JSON.stringify(data)) };
    }
    const body = JSON.parse(options.body);
    writes.push({ path, body });
    if (rejectWrite) return { ok: false, json: async () => ({ error: 'Unable to save priority' }) };
    const id = Number(path.split('/').at(-1));
    const saved = { ...savedTasks.find((task) => task.id === id), ...body };
    savedTasks = savedTasks.map((task) => task.id === id ? saved : task);
    return { ok: true, json: async () => saved };
  };
  const elements = pageElements();
  await loadPage(elements, '/projects/7', fetch);
  const rows = () => elements.get('#tasks').children;
  const priority = (row) => row.children[3].children[1];
  for (const row of rows()) {
    assert.equal(row.children[3].children[0].textContent, 'Task priority');
    assert.equal(row.children[3].children[0].htmlFor, priority(row).id);
    assert.deepEqual(priority(row).children.map((option) => option.textContent), ['Low', 'Normal', 'High']);
    assert.equal(priority(row).disabled, false);
  }
  assert.equal(priority(rows()[0]).value, 'Normal');
  assert.equal(priority(rows()[1]).value, 'Low');
  elements.get('#task-filter').value = 'Completed';
  await elements.get('#task-filter').fire('change');
  priority(rows()[0]).value = 'High';
  await priority(rows()[0]).fire('change');
  assert.deepEqual(writes, [{ path: '/api/projects/7/tasks/1', body: { priority: 'High' } }]);
  assert.equal(rows().length, 1);
  assert.equal(rows()[0].children[0].checked, true);
  assert.equal(rows()[0].children[1].textContent, 'Done');
  assert.equal(priority(rows()[0]).value, 'High');
  const renameForm = rows()[0].children[2];
  renameForm.children[1].children[0].value = 'Renamed';
  await renameForm.fire('submit');
  assert.equal(priority(rows()[0]).value, 'High');
  assert.equal(rows()[0].children[0].attributes['aria-label'], 'Complete Renamed');
  rejectWrite = true;
  priority(rows()[0]).value = 'Low';
  await priority(rows()[0]).fire('change');
  assert.equal(priority(rows()[0]).value, 'High');
  assert.equal(priority(rows()[0]).disabled, false);
  assert.equal(elements.get('#error').textContent, 'Unable to save priority');
  elements.get('#task-filter').value = 'All';
  await elements.get('#task-filter').fire('change');
  assert.deepEqual(rows().map((row) => priority(row).value), ['High', 'Low']);
  for (const isArchived of [true, false]) {
    archived = isArchived;
    const reloaded = pageElements();
    await loadPage(reloaded, '/projects/7', fetch);
    const reloadedRows = reloaded.get('#tasks').children;
    assert.deepEqual(reloadedRows.map((row) => priority(row).value), ['High', 'Low']);
    assert.ok(reloadedRows.every((row) => priority(row).disabled === isArchived));
    if (isArchived) {
      const count = writes.length;
      await priority(reloadedRows[0]).fire('change');
      assert.equal(writes.length, count);
    }
  }
});
