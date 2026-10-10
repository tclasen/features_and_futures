import { validDueDate } from '../public/date.js';
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
    'error', 'create-task', 'task-title', 'task-filter', 'priority-filter', 'tasks', 'back-to-projects', 'project-heading',
    'due-range', 'due-from', 'due-through', 'project-filter', 'archived-project', 'rename-project', 'new-project-name', 'default-task-priority',
    'search-projects', 'project-search', 'search-tasks', 'task-search'];
  const elements = new Map(ids.map((id) => [`#${id}`, new Element()]));
  elements.get('#create-task').append(new Element('button'));
  elements.get('#create-project').append(new Element('button'));
  elements.get('#rename-project').append(new Element('button'));
  elements.get('#task-filter').value = 'All';
  elements.get('#priority-filter').value = 'All';
  elements.get('#project-filter').value = 'Active';
  return elements;
}

async function loadPage(elements, pathname, fetch, assign = () => {}, destinations = []) {
  const source = (await readFile(new URL('../public/app.js', import.meta.url), 'utf8')).replace("import { validDueDate } from './date.js';", '');
  await runInNewContext(`(async () => { ${source} })()`, {
    document: {
      querySelector: (selector) => elements.get(selector),
      createElement: (tag) => new Element(tag),
    },
    fetch: (path, options) => pathname !== '/' && path === '/api/projects' && !options
      ? Promise.resolve({ ok: true, json: async () => structuredClone(destinations) })
      : fetch(path, options),
    validDueDate,
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

test('priority and completion filters combine in creation order on active and archived pages', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /<label for="priority-filter">Priority filter<\/label>/);
  const options = html.match(/<select id="priority-filter">([\s\S]*?)<\/select>/)[1];
  assert.deepEqual([...options.matchAll(/<option>(.*?)<\/option>/g)].map((match) => match[1]),
    ['All', 'Low', 'Normal', 'High']);

  const savedTasks = [
    { id: 1, title: 'Low open', completed: false, priority: 'Low' },
    { id: 2, title: 'High done', completed: true, priority: 'High' },
    { id: 3, title: 'Normal open', completed: false, priority: 'Normal' },
    { id: 4, title: 'Low done', completed: true, priority: 'Low' },
    { id: 5, title: 'High open', completed: false, priority: 'High' },
    { id: 6, title: 'Normal done', completed: true, priority: 'Normal' },
  ];
  const expected = {
    All: { All: [1, 2, 3, 4, 5, 6], Low: [1, 4], Normal: [3, 6], High: [2, 5] },
    Open: { All: [1, 3, 5], Low: [1], Normal: [3], High: [5] },
    Completed: { All: [2, 4, 6], Low: [4], Normal: [6], High: [2] },
  };
  for (const archived of [false, true]) {
    const elements = pageElements();
    await loadPage(elements, '/projects/7', async (path, options) => {
      assert.equal(options, undefined, 'Filtering must never write saved data');
      const data = path.endsWith('/tasks') ? savedTasks : { id: 7, name: 'Project', archived };
      return { ok: true, json: async () => structuredClone(data) };
    });
    const completion = elements.get('#task-filter');
    const priority = elements.get('#priority-filter');
    assert.equal(priority.value, 'All');
    assert.ok(!priority.disabled && !completion.disabled);
    for (const [completionValue, priorities] of Object.entries(expected)) {
      const previousPriority = priority.value;
      completion.value = completionValue;
      await completion.fire('change');
      assert.equal(priority.value, previousPriority);
      for (const [priorityValue, ids] of Object.entries(priorities)) {
        priority.value = priorityValue;
        await priority.fire('change');
        assert.equal(completion.value, completionValue);
        const rows = elements.get('#tasks').children;
        assert.deepEqual(rows.map((row) => Number(row.children[0].id.slice(5))), ids);
        for (const row of rows) {
          assert.equal(row.children[0].disabled, archived);
          assert.equal(row.children[2].children[1].children[0].disabled, archived);
          assert.equal(row.children[2].children[1].children[1].disabled, archived);
          assert.equal(row.children[3].children[1].disabled, archived);
        }
      }
    }
  }
});

test('saved edits re-evaluate both filters without resetting selections', async () => {
  let savedTasks = [
    { id: 1, title: 'First', completed: false, priority: 'High' },
    { id: 2, title: 'Second', completed: false, priority: 'High' },
    { id: 3, title: 'Third', completed: true, priority: 'Low' },
  ];
  const writes = [];
  const fetch = async (path, options) => {
    if (!options) {
      const data = path.endsWith('/tasks') ? savedTasks : { id: 7, name: 'Project', archived: false };
      return { ok: true, json: async () => structuredClone(data) };
    }
    const body = JSON.parse(options.body);
    writes.push(body);
    const id = Number(path.split('/').at(-1));
    const saved = { ...savedTasks.find((task) => task.id === id), ...body };
    savedTasks = savedTasks.map((task) => task.id === id ? saved : task);
    return { ok: true, json: async () => structuredClone(saved) };
  };
  const elements = pageElements();
  await loadPage(elements, '/projects/7', fetch);
  const completion = elements.get('#task-filter');
  const priority = elements.get('#priority-filter');
  const rows = () => elements.get('#tasks').children;
  const titles = () => rows().map((row) => row.children[1].textContent);
  async function filter(completionValue, priorityValue) {
    completion.value = completionValue;
    await completion.fire('change');
    priority.value = priorityValue;
    await priority.fire('change');
  }
  function selections(completionValue, priorityValue) {
    assert.equal(completion.value, completionValue);
    assert.equal(priority.value, priorityValue);
  }

  await filter('Open', 'High');
  const rename = rows()[0].children[2];
  rename.children[1].children[0].value = '  Renamed  ';
  await rename.fire('submit');
  selections('Open', 'High');
  assert.deepEqual(titles(), ['Renamed', 'Second']);
  assert.equal(rows()[0].children[0].attributes['aria-label'], 'Complete Renamed');
  assert.equal(rows()[0].children[3].children[1].value, 'High');

  const priorityEdit = rows()[0].children[3].children[1];
  priorityEdit.value = 'Low';
  await priorityEdit.fire('change');
  selections('Open', 'High');
  assert.deepEqual(titles(), ['Second']);
  const checkbox = rows()[0].children[0];
  checkbox.checked = true;
  await checkbox.fire('change');
  selections('Open', 'High');
  assert.deepEqual(titles(), []);

  await filter('Completed', 'High');
  assert.deepEqual(titles(), ['Second']);
  const completed = rows()[0].children[0];
  completed.checked = false;
  await completed.fire('change');
  selections('Completed', 'High');
  assert.deepEqual(titles(), []);
  await filter('Open', 'Low');
  assert.deepEqual(titles(), ['Renamed']);
  assert.deepEqual(writes, [
    { title: 'Renamed' }, { priority: 'Low' }, { completed: true }, { completed: false },
  ]);
  assert.deepEqual(savedTasks, [
    { id: 1, title: 'Renamed', completed: false, priority: 'Low' },
    { id: 2, title: 'Second', completed: false, priority: 'High' },
    { id: 3, title: 'Third', completed: true, priority: 'Low' },
  ]);

  const reopened = pageElements();
  await loadPage(reopened, '/projects/7', fetch);
  assert.equal(reopened.get('#priority-filter').value, 'All');
  assert.equal(reopened.get('#task-filter').value, 'All');
  assert.deepEqual(reopened.get('#tasks').children.map((row) => row.children[1].textContent),
    ['Renamed', 'Second', 'Third']);
});

test('project defaults preserve filtered rows, apply to new tasks, and follow archive state', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /<label for="default-task-priority">Default task priority<\/label>/);
  const options = html.match(/<select id="default-task-priority" disabled>([\s\S]*?)<\/select>/)[1];
  assert.deepEqual([...options.matchAll(/<option(?: selected)?>(.*?)<\/option>/g)].map((match) => match[1]),
    ['Low', 'Normal', 'High']);
  let project = { id: 7, name: 'Project', archived: 0, default_priority: 'Normal' };
  const savedTasks = [
    { id: 1, title: 'Done', completed: true, priority: 'Low' },
    { id: 2, title: 'Open', completed: false, priority: 'Normal' },
  ];
  const originalTasks = structuredClone(savedTasks);
  const writes = [];
  let rejectWrite = false;
  const fetch = async (path, requestOptions) => {
    let data;
    if (!requestOptions) {
      data = path.endsWith('/tasks') ? savedTasks : project;
    } else {
      const body = JSON.parse(requestOptions.body);
      writes.push({ path, body });
      if (rejectWrite) return { ok: false, json: async () => ({ error: 'Unable to save default' }) };
      if (requestOptions.method === 'POST') {
        data = { id: 3, title: body.title, completed: false, priority: project.default_priority };
        savedTasks.push(data);
      } else {
        project = { ...project, ...body };
        data = project;
      }
    }
    return { ok: true, json: async () => structuredClone(data) };
  };
  const elements = pageElements();
  await loadPage(elements, '/projects/7', fetch);
  const selector = elements.get('#default-task-priority');
  assert.equal(selector.value, 'Normal');
  assert.equal(selector.disabled, false);
  const completion = elements.get('#task-filter');
  const priority = elements.get('#priority-filter');
  completion.value = 'Completed';
  await completion.fire('change');
  priority.value = 'Low';
  await priority.fire('change');
  const originalRows = elements.get('#tasks').children;
  selector.value = 'High';
  await selector.fire('change');
  assert.deepEqual(writes, [{ path: '/api/projects/7', body: { default_priority: 'High' } }]);
  assert.equal(selector.value, 'High');
  assert.equal(selector.disabled, false);
  assert.equal(completion.value, 'Completed');
  assert.equal(priority.value, 'Low');
  assert.equal(elements.get('#tasks').children, originalRows);
  assert.deepEqual(savedTasks, originalTasks);

  rejectWrite = true;
  selector.value = 'Low';
  await selector.fire('change');
  assert.equal(selector.value, 'High');
  assert.equal(selector.disabled, false);
  assert.equal(elements.get('#error').textContent, 'Unable to save default');
  assert.equal(elements.get('#tasks').children, originalRows);
  rejectWrite = false;
  elements.get('#task-title').value = 'Inherited';
  await elements.get('#create-task').fire('submit');
  assert.equal(savedTasks[2].priority, 'High');
  assert.equal(completion.value, 'Completed');
  assert.equal(priority.value, 'Low');
  assert.deepEqual(elements.get('#tasks').children.map((row) => row.children[1].textContent), ['Done']);
  assert.deepEqual(savedTasks.slice(0, 2), originalTasks);

  for (const archived of [0, 1, 0]) {
    project.archived = archived;
    const reloaded = pageElements();
    await loadPage(reloaded, '/projects/7', fetch);
    const reloadedDefault = reloaded.get('#default-task-priority');
    assert.equal(reloadedDefault.value, 'High');
    assert.equal(reloadedDefault.disabled, Boolean(archived));
    assert.equal(reloaded.get('#task-filter').value, 'All');
    assert.equal(reloaded.get('#priority-filter').value, 'All');
    assert.deepEqual(reloaded.get('#tasks').children.map((row) => row.children[3].children[1].value),
      ['Low', 'Normal', 'High']);
    if (archived) {
      const count = writes.length;
      await reloadedDefault.fire('change');
      assert.equal(writes.length, count);
    }
  }
});

test('due date controls preserve filters and saved data, report invalid dates, and follow archive state', async () => {
  let archived = false;
  let savedTasks = [
    { id: 1, title: 'Done', completed: true, priority: 'High', due_date: '' },
    { id: 2, title: 'Other', completed: false, priority: 'Low', due_date: '2027-01-02' },
  ];
  const writes = [];
  const message = 'Due date must be a valid YYYY-MM-DD date';
  const fetch = async (path, options) => {
    if (!options) {
      const data = path.endsWith('/tasks') ? savedTasks : { id: 7, name: 'Project', archived };
      return { ok: true, json: async () => structuredClone(data) };
    }
    const body = JSON.parse(options.body);
    writes.push(body);
    if (body.due_date === 'invalid') return { ok: false, json: async () => ({ error: message }) };
    const id = Number(path.split('/').at(-1));
    const saved = { ...savedTasks.find((task) => task.id === id), ...body };
    savedTasks = savedTasks.map((task) => task.id === id ? saved : task);
    return { ok: true, json: async () => structuredClone(saved) };
  };
  const elements = pageElements();
  await loadPage(elements, '/projects/7', fetch);
  const rows = () => elements.get('#tasks').children;
  const dateForm = (row) => row.children[4];
  const dateInput = (row) => dateForm(row).children[1].children[0];
  const dateButton = (row) => dateForm(row).children[1].children[1];
  assert.equal(dateForm(rows()[0]).children[0].textContent, 'Task due date');
  assert.equal(dateForm(rows()[0]).children[0].htmlFor, dateInput(rows()[0]).id);
  assert.equal(dateInput(rows()[0]).type, 'text');
  assert.equal(dateInput(rows()[0]).value, '');
  assert.equal(dateButton(rows()[0]).textContent, 'Save due date');
  assert.equal(dateInput(rows()[1]).value, '2027-01-02');
  elements.get('#task-filter').value = 'Completed';
  await elements.get('#task-filter').fire('change');
  elements.get('#priority-filter').value = 'High';
  await elements.get('#priority-filter').fire('change');
  dateInput(rows()[0]).value = '  0001-01-01  ';
  await dateForm(rows()[0]).fire('submit');
  assert.deepEqual(writes, [{ due_date: '0001-01-01' }]);
  assert.equal(dateInput(rows()[0]).value, '0001-01-01');
  const original = structuredClone(savedTasks);
  dateInput(rows()[0]).value = 'invalid';
  await dateForm(rows()[0]).fire('submit');
  assert.equal(elements.get('#error').textContent, message);
  assert.equal(elements.get('#error').hidden, false);
  assert.equal(dateButton(rows()[0]).disabled, false);
  assert.deepEqual(savedTasks, original);
  const renameForm = rows()[0].children[2];
  renameForm.children[1].children[0].value = 'Renamed';
  await renameForm.fire('submit');
  assert.equal(dateInput(rows()[0]).value, '0001-01-01');
  dateInput(rows()[0]).value = ' \t ';
  await dateForm(rows()[0]).fire('submit');
  assert.equal(dateInput(rows()[0]).value, '');
  assert.equal(elements.get('#error').hidden, true);
  assert.equal(elements.get('#task-filter').value, 'Completed');
  assert.equal(elements.get('#priority-filter').value, 'High');
  assert.equal(rows().length, 1);
  assert.equal(rows()[0].children[0].checked, true);
  assert.equal(rows()[0].children[1].textContent, 'Renamed');
  assert.equal(rows()[0].children[3].children[1].value, 'High');
  assert.deepEqual(savedTasks[1], original[1]);
  for (const state of [true, false]) {
    archived = state;
    const reloaded = pageElements();
    await loadPage(reloaded, '/projects/7', fetch);
    const reloadedRows = reloaded.get('#tasks').children;
    assert.deepEqual(reloadedRows.map((row) => dateInput(row).value), ['', '2027-01-02']);
    assert.ok(reloadedRows.every((row) => dateInput(row).disabled === state && dateButton(row).disabled === state));
    if (state) {
      const count = writes.length;
      await dateForm(reloadedRows[0]).fire('submit');
      assert.equal(writes.length, count);
    }
  }
});

test('due ranges intersect filters inclusively and invalid applications retain the applied range', async () => {
  const savedTasks = [
    { id: 1, title: 'Undated', completed: false, priority: 'High', due_date: '' },
    { id: 2, title: 'Start', completed: false, priority: 'High', due_date: '2024-02-29' },
    { id: 3, title: 'Middle', completed: true, priority: 'High', due_date: '2024-03-01' },
    { id: 4, title: 'End', completed: false, priority: 'Low', due_date: '2024-03-02' },
    { id: 5, title: 'Later', completed: false, priority: 'High', due_date: '9999-12-31' },
    { id: 6, title: 'Early', completed: false, priority: 'Normal', due_date: '0001-01-01' },
  ];
  const original = structuredClone(savedTasks);
  const fetch = async (path, options) => {
    assert.equal(options, undefined, 'Filtering must not write saved data');
    return { ok: true, json: async () => structuredClone(path.endsWith('/tasks')
      ? savedTasks : { id: 7, name: 'Project', archived: false, default_priority: 'Normal' }) };
  };
  const elements = pageElements();
  await loadPage(elements, '/projects/7', fetch);
  const element = (id) => elements.get(`#${id}`);
  const titles = () => element('tasks').children.map((row) => row.children[1].textContent);
  const apply = async (from, through) => {
    element('due-from').value = from;
    element('due-through').value = through;
    await element('due-range').fire('submit');
  };
  assert.equal(element('due-from').value, '');
  assert.equal(element('due-through').value, '');
  assert.equal(titles().length, 6);
  await apply(' 2024-02-29 ', ' 2024-03-02 ');
  assert.deepEqual(titles(), ['Start', 'Middle', 'End']);
  assert.equal(element('due-from').value, '2024-02-29');
  element('task-filter').value = 'Open';
  await element('task-filter').fire('change');
  assert.deepEqual(titles(), ['Start', 'End']);
  element('priority-filter').value = 'High';
  await element('priority-filter').fire('change');
  assert.deepEqual(titles(), ['Start']);
  for (const invalid of ['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2023-02-29',
    '2024-04-31', '2024-13-01', '2024-00-01', '2024-01-00', '2024-01-32', '2024-2-29', '2024-02-29T00:00:00Z']) {
    for (const bounds of [[invalid, ''], ['', invalid]]) {
      await apply(...bounds);
      assert.equal(element('error').textContent, 'Due range must use valid YYYY-MM-DD dates');
      assert.equal(element('error').hidden, false);
      assert.deepEqual(titles(), ['Start']);
    }
  }
  await apply('2024-03-02', '2024-02-29');
  assert.equal(element('error').textContent, 'Due from must not be after Due through');
  assert.deepEqual(titles(), ['Start']);
  element('task-filter').value = 'Completed';
  await element('task-filter').fire('change');
  assert.deepEqual(titles(), ['Middle']);
  assert.equal(element('priority-filter').value, 'High');
  await apply('2024-03-01', '2024-03-01');
  assert.deepEqual(titles(), ['Middle']);
  assert.equal(element('error').hidden, true);
  element('task-filter').value = 'All';
  element('priority-filter').value = 'All';
  await apply('', '2024-02-29');
  assert.deepEqual(titles(), ['Start', 'Early']);
  await apply('2024-03-02', '');
  assert.deepEqual(titles(), ['End', 'Later']);
  await apply('0001-01-01', '9999-12-31');
  assert.deepEqual(titles(), ['Start', 'Middle', 'End', 'Later', 'Early']);
  await apply(' \t ', ' ');
  assert.deepEqual(titles(), original.map((task) => task.title));
  assert.deepEqual(savedTasks, original);
});

test('edits re-evaluate due ranges, retain all filters, and archived or reopened pages filter safely', async () => {
  let project = { id: 7, name: 'Project', archived: false, default_priority: 'Normal' };
  let savedTasks = [
    { id: 1, title: 'First', completed: false, priority: 'High', due_date: '2026-10-10' },
    { id: 2, title: 'Second', completed: false, priority: 'High', due_date: '2026-10-11' },
    { id: 3, title: 'Third', completed: false, priority: 'High', due_date: '2026-10-12' },
    { id: 4, title: 'Undated', completed: false, priority: 'High', due_date: '' },
  ];
  const fetch = async (path, options) => {
    let data;
    if (!options) data = path.endsWith('/tasks') ? savedTasks : project;
    else {
      const body = JSON.parse(options.body);
      if (!path.includes('/tasks')) data = project = { ...project, ...body };
      else if (options.method === 'POST') {
        data = { id: 5, ...body, completed: false, priority: project.default_priority, due_date: '' };
        savedTasks.push(data);
      } else {
        const id = Number(path.split('/').at(-1));
        data = { ...savedTasks.find((task) => task.id === id), ...body };
        savedTasks = savedTasks.map((task) => task.id === id ? data : task);
      }
    }
    return { ok: true, json: async () => structuredClone(data) };
  };
  const elements = pageElements();
  await loadPage(elements, '/projects/7', fetch);
  const element = (id) => elements.get(`#${id}`);
  const rows = () => element('tasks').children;
  const titles = () => rows().map((row) => row.children[1].textContent);
  element('task-filter').value = 'Open';
  element('priority-filter').value = 'High';
  element('due-from').value = '2026-10-10';
  element('due-through').value = '2026-10-12';
  await element('due-range').fire('submit');
  const checkFilters = () => {
    assert.equal(element('task-filter').value, 'Open');
    assert.equal(element('priority-filter').value, 'High');
    assert.equal(element('due-from').value, '2026-10-10');
    assert.equal(element('due-through').value, '2026-10-12');
  };
  const rename = rows()[0].children[2];
  rename.children[1].children[0].value = 'Renamed';
  await rename.fire('submit');
  assert.deepEqual(titles(), ['Renamed', 'Second', 'Third']);
  const dueForm = rows()[0].children[4];
  dueForm.children[1].children[0].value = '2026-10-13';
  await dueForm.fire('submit');
  assert.deepEqual(titles(), ['Second', 'Third']);
  const priority = rows()[0].children[3].children[1];
  priority.value = 'Low';
  await priority.fire('change');
  assert.deepEqual(titles(), ['Third']);
  rows()[0].children[0].checked = true;
  await rows()[0].children[0].fire('change');
  assert.deepEqual(titles(), []);
  element('new-project-name').value = 'Changed project';
  await element('rename-project').fire('submit');
  element('default-task-priority').value = 'High';
  await element('default-task-priority').fire('change');
  element('task-title').value = 'New undated';
  await element('create-task').fire('submit');
  assert.deepEqual(titles(), []);
  checkFilters();
  element('priority-filter').value = 'All';
  await element('priority-filter').fire('change');
  assert.deepEqual(titles(), ['Second']);
  element('task-filter').value = 'All';
  await element('task-filter').fire('change');
  assert.deepEqual(titles(), ['Second', 'Third']);
  const clearForm = rows()[0].children[4];
  clearForm.children[1].children[0].value = '';
  await clearForm.fire('submit');
  assert.deepEqual(titles(), ['Third']);

  for (const archived of [true, false]) {
    project.archived = archived;
    const reopened = pageElements();
    await loadPage(reopened, '/projects/7', fetch);
    assert.equal(reopened.get('#due-from').value, '');
    assert.equal(reopened.get('#due-through').value, '');
    assert.equal(reopened.get('#task-filter').value, 'All');
    assert.equal(reopened.get('#priority-filter').value, 'All');
    assert.equal(reopened.get('#tasks').children.length, 5);
    reopened.get('#due-from').value = '2026-10-12';
    reopened.get('#due-through').value = '2026-10-13';
    await reopened.get('#due-range').fire('submit');
    const filtered = reopened.get('#tasks').children;
    assert.deepEqual(filtered.map((row) => row.children[1].textContent), ['Renamed', 'Third']);
    for (const row of filtered) {
      assert.equal(row.children[0].disabled, archived);
      assert.equal(row.children[3].children[1].disabled, archived);
      for (const index of [2, 4]) {
        assert.equal(row.children[index].children[1].children[0].disabled, archived);
        assert.equal(row.children[index].children[1].children[1].disabled, archived);
      }
    }
  }
});

test('task moves list eligible projects, retain source filters, and recover from rejected moves', async () => {
  const destinations = [
    { id: 7, name: 'Source', archived: 0 },
    { id: 2, name: 'Renamed destination', archived: 0 },
    { id: 9, name: 'Archived destination', archived: 1 },
    { id: 12, name: 'Last destination', archived: 0 },
  ];
  let savedTasks = [
    { id: 1, title: 'First', completed: true, priority: 'High', due_date: '2026-10-10' },
    { id: 2, title: 'Second', completed: true, priority: 'High', due_date: '2026-10-11' },
    { id: 3, title: 'Hidden', completed: false, priority: 'Low', due_date: '' },
  ];
  let rejectMove = true;
  const writes = [];
  const fetch = async (path, options) => {
    if (!options) return { ok: true, json: async () => structuredClone(path.endsWith('/tasks')
      ? savedTasks : { id: 7, name: 'Source', archived: 0 }) };
    const body = JSON.parse(options.body);
    writes.push({ path, body });
    if (rejectMove) return { ok: false, json: async () => ({ error: 'Archived project' }) };
    const task = savedTasks.find((task) => task.id === Number(path.split('/').at(-1)));
    savedTasks = savedTasks.filter((item) => item.id !== task.id);
    return { ok: true, json: async () => structuredClone(task) };
  };
  const elements = pageElements();
  await loadPage(elements, '/projects/7', fetch, () => assert.fail('Moving must stay on the source page'), destinations);
  const element = (id) => elements.get(`#${id}`);
  const rows = () => element('tasks').children;
  const moveForm = (row) => row.children[5];
  const destination = (row) => moveForm(row).children[1].children[0];
  const button = (row) => moveForm(row).children[1].children[1];
  assert.equal(moveForm(rows()[0]).children[0].textContent, 'Destination project');
  assert.equal(moveForm(rows()[0]).children[0].htmlFor, destination(rows()[0]).id);
  assert.deepEqual(destination(rows()[0]).children.map((option) => [option.value, option.textContent]),
    [['2', 'Renamed destination'], ['12', 'Last destination']]);
  assert.equal(destination(rows()[0]).value, '2');
  assert.equal(button(rows()[0]).textContent, 'Move task');
  element('task-filter').value = 'Completed';
  element('priority-filter').value = 'High';
  element('due-from').value = '2026-10-10';
  element('due-through').value = '2026-10-11';
  await element('due-range').fire('submit');
  destination(rows()[0]).value = '12';
  await moveForm(rows()[0]).fire('submit');
  assert.equal(element('error').textContent, 'Archived project');
  assert.equal(destination(rows()[0]).disabled, false);
  assert.equal(button(rows()[0]).disabled, false);
  assert.equal(rows().length, 2);
  rejectMove = false;
  await moveForm(rows()[0]).fire('submit');
  assert.deepEqual(writes[1], { path: '/api/projects/7/tasks/1', body: { destination_project_id: 12 } });
  assert.deepEqual(rows().map((row) => row.children[1].textContent), ['Second']);
  assert.equal(element('task-filter').value, 'Completed');
  assert.equal(element('priority-filter').value, 'High');
  assert.equal(element('due-from').value, '2026-10-10');
  assert.equal(element('due-through').value, '2026-10-11');
  assert.equal(element('error').hidden, true);
  // Changing another filter still uses the applied range after the move.
  element('task-filter').value = 'All';
  element('priority-filter').value = 'All';
  await element('priority-filter').fire('change');
  assert.deepEqual(rows().map((row) => row.children[1].textContent), ['Second']);

  for (const [archived, available, disabled] of [
    [true, destinations, true], [false, destinations.slice(0, 1), true], [false, destinations, false],
  ]) {
    const reopened = pageElements();
    const read = async (path) => ({ ok: true, json: async () => structuredClone(path.endsWith('/tasks')
      ? savedTasks : { id: 7, name: 'Source', archived }) });
    await loadPage(reopened, '/projects/7', read, () => {}, available);
    for (const row of reopened.get('#tasks').children) {
      assert.equal(destination(row).disabled, disabled);
      assert.equal(button(row).disabled, disabled);
      if (available.length === 1) assert.equal(destination(row).children.length, 0);
      if (disabled) {
        await moveForm(row).fire('submit');
        assert.equal(writes.length, 2);
      }
    }
  }
});

test('project search intersects archives, trims only outer whitespace, and resets on return', async () => {
  let projects = [
    { id: 1, name: 'Alpha  Plan', archived: 0, completed: 1, total: 3 },
    { id: 2, name: 'alpha Plan', archived: 0, completed: 0, total: 0 },
    { id: 3, name: 'ALPHA  Archived', archived: 1, completed: 2, total: 2 },
    { id: 4, name: 'ÄLPHA', archived: 0, completed: 0, total: 0 },
  ];
  const fetch = async (path, options) => {
    let data = projects;
    if (options) {
      const body = JSON.parse(options.body);
      if (options.method === 'POST') {
        data = { id: 5, ...body, archived: 0, completed: 0, total: 0 };
        projects.push(data);
      } else {
        const id = Number(path.split('/').at(-1));
        data = { ...projects.find((project) => project.id === id), archived: Number(body.archived) };
        projects = projects.map((project) => project.id === id ? data : project);
      }
    }
    return { ok: true, json: async () => structuredClone(data) };
  };
  const elements = pageElements();
  const element = (id) => elements.get(`#${id}`);
  await loadPage(elements, '/', fetch);
  const rows = () => element('projects').children;
  const names = () => rows().map((row) => row.children[0].textContent);
  const search = async (query) => {
    element('project-search').value = query;
    await element('search-projects').fire('submit');
  };
  assert.equal(element('project-search').value, '');
  await search(' \tAlPhA  \n');
  assert.deepEqual(names(), ['Alpha  Plan', 'alpha Plan']);
  assert.equal(rows()[0].children[1].textContent, '1/3 completed');
  await search('alpha  '); // Outer spaces are trimmed; internal spaces remain significant.
  await search(' alpha  p ');
  assert.deepEqual(names(), ['Alpha  Plan']);
  await search('alpha');
  element('project-search').value = 'unapplied draft';
  element('project-filter').value = 'Archived';
  await element('project-filter').fire('change');
  assert.deepEqual(names(), ['ALPHA  Archived']);
  await rows()[0].children[3].fire('click');
  assert.deepEqual(names(), []);
  element('project-filter').value = 'Active';
  await element('project-filter').fire('change');
  assert.deepEqual(names(), ['Alpha  Plan', 'alpha Plan', 'ALPHA  Archived']);
  element('project-name').value = 'Unmatched';
  await element('create-project').fire('submit');
  assert.deepEqual(names(), ['Alpha  Plan', 'alpha Plan', 'ALPHA  Archived']);
  await search('älpha');
  assert.deepEqual(names(), [], 'Non-ASCII case must remain significant');
  await search('Älpha');
  assert.deepEqual(names(), ['ÄLPHA']);
  await search(' \t ');
  assert.deepEqual(names(), projects.map((project) => project.name));
  const reopened = pageElements();
  await loadPage(reopened, '/', fetch);
  assert.equal(reopened.get('#project-search').value, '');
  assert.equal(reopened.get('#projects').children.length, 5);
});

test('task search intersects all filters and re-evaluates edits while preserving queries', async () => {
  let project = { id: 7, name: 'Source', archived: 0, default_priority: 'High' };
  let savedTasks = [
    { id: 1, title: 'Alpha  First', completed: false, priority: 'High', due_date: '2026-10-10' },
    { id: 2, title: 'ALPHA Second', completed: false, priority: 'High', due_date: '2026-10-11' },
    { id: 3, title: 'Alpha done', completed: true, priority: 'High', due_date: '2026-10-10' },
    { id: 4, title: 'Alpha low', completed: false, priority: 'Low', due_date: '2026-10-10' },
    { id: 5, title: 'Alpha undated', completed: false, priority: 'High', due_date: '' },
    { id: 6, title: 'Other', completed: false, priority: 'High', due_date: '2026-10-10' },
    { id: 7, title: 'ÄLPHA', completed: false, priority: 'High', due_date: '' },
  ];
  const writes = [];
  const fetch = async (path, options) => {
    let data;
    if (!options) data = path.endsWith('/tasks') ? savedTasks : project;
    else {
      const body = JSON.parse(options.body);
      writes.push(body);
      if (!path.includes('/tasks')) data = project = { ...project, ...body };
      else if (options.method === 'POST') {
        data = { id: 8, ...body, completed: false, priority: project.default_priority, due_date: '' };
        savedTasks.push(data);
      } else {
        const id = Number(path.split('/').at(-1));
        data = { ...savedTasks.find((task) => task.id === id), ...body };
        savedTasks = Object.hasOwn(body, 'destination_project_id')
          ? savedTasks.filter((task) => task.id !== id)
          : savedTasks.map((task) => task.id === id ? data : task);
      }
    }
    return { ok: true, json: async () => structuredClone(data) };
  };
  const elements = pageElements();
  const element = (id) => elements.get(`#${id}`);
  await loadPage(elements, '/projects/7', fetch, () => assert.fail('Must stay on source'),
    [{ id: 9, name: 'Destination', archived: 0 }]);
  const rows = () => element('tasks').children;
  const titles = () => rows().map((row) => row.children[1].textContent);
  const search = async (query) => {
    element('task-search').value = query;
    await element('search-tasks').fire('submit');
  };
  await search('  aLpHa  f  ');
  assert.deepEqual(titles(), ['Alpha  First']);
  await search('älpha');
  assert.deepEqual(titles(), []);
  await search('Älpha');
  assert.deepEqual(titles(), ['ÄLPHA']);
  await search(' \tALPHA\n ');
  assert.equal(element('task-search').value, 'ALPHA');
  assert.equal(writes.length, 0, 'Search must never write stored data');
  element('task-filter').value = 'Open';
  await element('task-filter').fire('change');
  element('priority-filter').value = 'High';
  await element('priority-filter').fire('change');
  element('due-from').value = '2026-10-10';
  element('due-through').value = '2026-10-11';
  await element('due-range').fire('submit');
  assert.deepEqual(titles(), ['Alpha  First', 'ALPHA Second']);
  const checkFilters = () => {
    assert.equal(element('task-search').value, 'ALPHA');
    assert.equal(element('task-filter').value, 'Open');
    assert.equal(element('priority-filter').value, 'High');
    assert.equal(element('due-from').value, '2026-10-10');
    assert.equal(element('due-through').value, '2026-10-11');
  };
  let rename = rows()[0].children[2];
  rename.children[1].children[0].value = 'Alpha renamed';
  await rename.fire('submit');
  assert.deepEqual(titles(), ['Alpha renamed', 'ALPHA Second']);
  rename = rows()[0].children[2];
  rename.children[1].children[0].value = 'No match';
  await rename.fire('submit');
  assert.deepEqual(titles(), ['ALPHA Second']);
  const date = rows()[0].children[4];
  date.children[1].children[0].value = '2026-10-12';
  await date.fire('submit');
  assert.deepEqual(titles(), []);
  element('new-project-name').value = 'Renamed source';
  await element('rename-project').fire('submit');
  element('default-task-priority').value = 'Normal';
  await element('default-task-priority').fire('change');
  element('task-title').value = 'Alpha new';
  await element('create-task').fire('submit');
  assert.deepEqual(titles(), []);
  checkFilters();
  element('due-from').value = '';
  element('due-through').value = '';
  await element('due-range').fire('submit');
  assert.deepEqual(titles(), ['ALPHA Second', 'Alpha undated']);
  const priority = rows()[0].children[3].children[1];
  priority.value = 'Low';
  await priority.fire('change');
  assert.deepEqual(titles(), ['Alpha undated']);
  rows()[0].children[0].checked = true;
  await rows()[0].children[0].fire('change');
  assert.deepEqual(titles(), []);
  element('task-filter').value = 'All';
  await element('task-filter').fire('change');
  assert.deepEqual(titles(), ['Alpha done', 'Alpha undated']);
  await rows()[0].children[5].fire('submit');
  assert.deepEqual(titles(), ['Alpha undated']);
  element('task-search').value = 'unapplied draft';
  element('priority-filter').value = 'All';
  await element('priority-filter').fire('change');
  assert.deepEqual(titles(), ['ALPHA Second', 'Alpha low', 'Alpha undated', 'Alpha new']);
  await search(' \t ');
  assert.deepEqual(titles(), savedTasks.map((task) => task.title));

  for (const archived of [1, 0]) {
    project.archived = archived;
    const reopened = pageElements();
    await loadPage(reopened, '/projects/7', fetch);
    assert.equal(reopened.get('#task-search').value, '');
    assert.equal(reopened.get('#tasks').children.length, savedTasks.length);
    reopened.get('#task-search').value = 'alpha';
    await reopened.get('#search-tasks').fire('submit');
    assert.deepEqual(reopened.get('#tasks').children.map((row) => row.children[1].textContent),
      ['ALPHA Second', 'Alpha low', 'Alpha undated', 'Alpha new']);
    for (const row of reopened.get('#tasks').children) {
      assert.equal(row.children[0].disabled, Boolean(archived));
      assert.equal(row.children[3].children[1].disabled, Boolean(archived));
      for (const index of [2, 4]) {
        assert.equal(row.children[index].children[1].children[0].disabled, Boolean(archived));
        assert.equal(row.children[index].children[1].children[1].disabled, Boolean(archived));
      }
      assert.equal(row.children[5].children[1].children[1].disabled, true, 'No destinations on reopened page');
    }
  }
});
