import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// Inline the shared module when running browser code in the dependency-free DOM harness.
async function appSource() {
  const [dates, app] = await Promise.all([
    readFile(new URL('../public/dates.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
  ]);
  return dates.replace('export function', 'function') + app.replace(/^import .*;\n/, '');
}

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
  const source = await appSource();
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  for (const form of ['#project-form', '#task-form', '#rename-form']) {
    element(form).button = new Element();
  }
  element('#task-filter').value = 'all';
  element('#priority-filter').value = 'all';
  const location = { pathname: '/projects/example' };
  const document = { querySelector: element, createElement: () => new Element() };
  const writes = [];
  let failNextWrite = false;
  await runInNewContext(source, {
    document,
    window: { location },
    fetch: async (path, options) => {
      if (path === '/api/projects' && !options) return { ok: true, json: async () => [] };
      if (!options) {
        const body = path.endsWith('/tasks')
          ? [{ id: 'task', title: 'Existing task', completed: true, priority: 'Normal' }]
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
  const source = await appSource();
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  element('#project-form').button = new Element();
  element('#task-form').button = new Element();
  element('#rename-form').button = new Element();
  element('#task-filter').value = 'all';
  element('#priority-filter').value = 'all';
  const savedTasks = [
    { id: 'one', title: 'First task', completed: false, priority: 'Normal' },
    { id: 'two', title: 'Second task', completed: true, priority: 'High' },
    { id: 'three', title: 'Third task', completed: false, priority: 'Low' },
  ];
  const writes = [];
  let failNextWrite = false;
  await runInNewContext(source, {
    document: { querySelector: element, createElement: () => new Element() },
    window: { location: { pathname: '/projects/example' } },
    fetch: async (path, options) => {
      if (path === '/api/projects' && !options) return { ok: true, json: async () => [] };
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
          body = { id: 'four', title: input.title, completed: false, priority: 'Normal' };
          savedTasks.push(body);
        } else {
          const task = savedTasks.find(task => path.endsWith(`/${task.id}`));
          Object.assign(task, input);
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
  assert.deepEqual(rows().map(row => row.children[3].value), ['Normal', 'High', 'Low']);
  for (const row of rows()) {
    const priority = row.children[3];
    assert.equal(priority.attributes['aria-label'], 'Task priority');
    assert.equal(priority.disabled, false);
    assert.deepEqual(priority.children.map(option => option.textContent), ['Low', 'Normal', 'High']);
  }
  const renameRow = rows()[1];
  const renameForm = renameRow.children[2];
  const [renameInput, renameButton] = renameForm.children;
  assert.equal(renameInput.attributes['aria-label'], 'New task title');
  assert.equal(renameButton.textContent, 'Rename task');
  assert.equal(renameInput.disabled, false);
  assert.equal(renameButton.disabled, false);
  for (const title of ['', ' \t ']) {
    renameInput.value = title;
    await renameForm.dispatch('submit');
    assert.equal(element('#task-alert').textContent, 'Task title is required');
    assert.equal(element('#task-alert').hidden, false);
    assert.equal(renameRow.children[1].textContent, 'Second task');
  }
  assert.equal(writes.length, 0);
  renameInput.value = '  Renamed task  ';
  await renameForm.dispatch('submit');
  assert.equal(writes[0].path, '/api/projects/example/tasks/two');
  assert.deepEqual(JSON.parse(writes[0].body), { title: 'Renamed task' });
  assert.equal(renameRow.children[1].textContent, 'Renamed task');
  assert.equal(renameRow.children[0].attributes['aria-label'], 'Complete Renamed task');
  assert.equal(renameRow.children[0].checked, true);
  assert.equal(renameRow.children[3].value, 'High');
  assert.deepEqual(titles(), ['First task', 'Renamed task', 'Third task']);
  failNextWrite = true;
  renameInput.value = 'Failed rename';
  await renameForm.dispatch('submit');
  assert.equal(renameRow.children[1].textContent, 'Renamed task');
  assert.equal(element('#task-alert').textContent, 'Save failed');
  assert.equal(renameInput.disabled, false);
  assert.equal(renameButton.disabled, false);
  element('#task-title').value = ' \t ';
  await element('#task-form').dispatch('submit');
  assert.equal(element('#task-alert').textContent, 'Task title is required');
  assert.equal(element('#task-alert').hidden, false);
  assert.equal(writes.length, 2);
  assert.equal(rows().length, 3);
  const priority = rows()[1].children[3];
  priority.value = 'Low';
  await priority.dispatch('change');
  assert.equal(writes.at(-1).path, '/api/projects/example/tasks/two');
  assert.deepEqual(JSON.parse(writes.at(-1).body), { priority: 'Low' });
  assert.equal(savedTasks[1].priority, 'Low');
  assert.equal(priority.value, 'Low');
  assert.equal(priority.disabled, false);
  assert.equal(renameRow.children[0].checked, true);
  assert.deepEqual(titles(), ['First task', 'Renamed task', 'Third task']);
  assert.equal(rows()[0].children[3].value, 'Normal');
  failNextWrite = true;
  priority.value = 'High';
  await priority.dispatch('change');
  assert.equal(priority.value, 'Low');
  assert.equal(priority.disabled, false);
  assert.equal(element('#task-alert').textContent, 'Save failed');
  await filter('open');
  assert.deepEqual(titles(), ['First task', 'Third task']);
  const firstCheckbox = rows()[0].children[0];
  firstCheckbox.checked = true;
  await firstCheckbox.dispatch('change');
  assert.equal(writes.at(-1).path, '/api/projects/example/tasks/one');
  assert.equal(savedTasks[0].completed, true);
  assert.deepEqual(titles(), ['Third task']);
  await filter('completed');
  assert.deepEqual(titles(), ['First task', 'Renamed task']);
  const completedCheckbox = rows()[0].children[0];
  completedCheckbox.checked = false;
  await completedCheckbox.dispatch('change');
  assert.equal(savedTasks[0].completed, false);
  assert.deepEqual(titles(), ['Renamed task']);
  assert.equal(rows()[0].children[3].value, 'Low');
  element('#task-title').value = '  Fourth task  ';
  await element('#task-form').dispatch('submit');
  assert.equal(savedTasks[3].title, 'Fourth task');
  assert.equal(savedTasks[3].completed, false);
  assert.deepEqual(titles(), ['Renamed task']);
  await filter('all');
  assert.deepEqual(titles(), ['First task', 'Renamed task', 'Third task', 'Fourth task']);
  assert.equal(rows()[3].children[3].value, 'Normal');
  failNextWrite = true;
  const checkbox = rows()[0].children[0];
  checkbox.checked = true;
  await checkbox.dispatch('change');
  assert.equal(checkbox.checked, false);
  assert.equal(checkbox.disabled, false);
  assert.equal(element('#task-alert').textContent, 'Save failed');
});

test('project UI filters, summarizes, archives, and restores rows in creation order', async () => {
  const source = await appSource();
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
  const source = await appSource();
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  element('#project-form').button = new Element();
  element('#task-form').button = new Element();
  element('#rename-form').button = new Element();
  element('#task-filter').value = 'all';
  element('#priority-filter').value = 'all';
  let writes = 0;
  await runInNewContext(source, {
    document: { querySelector: element, createElement: () => new Element() },
    window: { location: { pathname: '/projects/one' } },
    fetch: async (path, options) => {
      if (path === '/api/projects' && !options) return { ok: true, json: async () => [] };
      if (options) writes++;
      const body = path.endsWith('/tasks') ? [
        { id: 'a', title: 'Open task', completed: false, priority: 'Low' },
        { id: 'b', title: 'Done task', completed: true, priority: 'High' },
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
  assert.ok(rows().every(row => row.children[3].disabled));
  assert.deepEqual(rows().map(row => row.children[3].value), ['Low', 'High']);
  await rows()[0].children[3].dispatch('change');
  assert.ok(rows().every(row => row.children[2].children.every(control => control.disabled)));
  rows()[0].children[2].children[0].value = 'Blocked task rename';
  await rows()[0].children[2].dispatch('submit');
  element('#task-filter').value = 'completed';
  await element('#task-filter').dispatch('change');
  assert.equal(rows().length, 1);
  assert.equal(rows()[0].children[1].textContent, 'Done task');
  assert.equal(rows()[0].children[0].disabled, true);
  assert.equal(rows()[0].children[3].disabled, true);
  assert.equal(rows()[0].children[3].value, 'High');
  element('#task-filter').value = 'open';
  await element('#task-filter').dispatch('change');
  assert.equal(rows()[0].children[1].textContent, 'Open task');
  element('#task-title').value = 'Attempt';
  await element('#task-form').dispatch('submit');
  assert.equal(writes, 0);
});

test('combined filters retain selections and creation order across task edits and page loads', async () => {
  const source = await appSource();
  const savedTasks = [
    { id: 'a', title: 'Open low', completed: false, priority: 'Low' },
    { id: 'b', title: 'Done normal', completed: true, priority: 'Normal' },
    { id: 'c', title: 'Open high', completed: false, priority: 'High' },
    { id: 'd', title: 'Done low', completed: true, priority: 'Low' },
    { id: 'e', title: 'Open normal', completed: false, priority: 'Normal' },
    { id: 'f', title: 'Done high', completed: true, priority: 'High' },
  ];
  let writes = 0;
  const loadPage = async archived => {
    const elements = new Map();
    const element = selector => {
      if (!elements.has(selector)) elements.set(selector, new Element());
      return elements.get(selector);
    };
    for (const form of ['#project-form', '#task-form', '#rename-form']) {
      element(form).button = new Element();
    }
    element('#task-filter').value = 'all';
    element('#priority-filter').value = 'all';
    await runInNewContext(source, {
      document: { querySelector: element, createElement: () => new Element() },
      window: { location: { pathname: '/projects/example' } },
      fetch: async (path, options) => {
        if (path === '/api/projects' && !options) return { ok: true, json: async () => [] };
        if (!options) {
          const body = path.endsWith('/tasks') ? structuredClone(savedTasks)
            : { id: 'example', name: 'Example', archived };
          return { ok: true, json: async () => body };
        }
        writes++;
        assert.equal(archived, false);
        const task = savedTasks.find(task => path.endsWith(`/${task.id}`));
        Object.assign(task, JSON.parse(options.body));
        return { ok: true, json: async () => ({ ...task }) };
      },
    });
    return {
      element,
      rows: () => element('#task-list').children,
      titles: () => element('#task-list').children.map(row => row.children[1].textContent),
      async filter(selector, value) {
        element(selector).value = value;
        await element(selector).dispatch('change');
      },
    };
  };
  const page = await loadPage(false);
  for (const completion of ['all', 'open', 'completed']) {
    await page.filter('#task-filter', completion);
    for (const priority of ['all', 'Low', 'Normal', 'High']) {
      await page.filter('#priority-filter', priority);
      assert.equal(page.element('#task-filter').value, completion);
      assert.deepEqual(page.titles(), savedTasks.filter(task =>
        (completion === 'all' || task.completed === (completion === 'completed')) &&
        (priority === 'all' || task.priority === priority)
      ).map(task => task.title));
    }
  }
  assert.equal(writes, 0);
  await page.filter('#task-filter', 'open');
  assert.equal(page.element('#priority-filter').value, 'High');
  const rename = page.rows()[0].children[2];
  rename.children[0].value = '  Renamed high  ';
  await rename.dispatch('submit');
  assert.deepEqual(page.titles(), ['Renamed high']);
  assert.equal(page.rows()[0].children[0].attributes['aria-label'], 'Complete Renamed high');
  assert.equal(page.rows()[0].children[3].value, 'High');
  const priority = page.rows()[0].children[3];
  priority.value = 'Low';
  await priority.dispatch('change');
  assert.deepEqual(page.titles(), []);
  assert.equal(page.element('#task-filter').value, 'open');
  assert.equal(page.element('#priority-filter').value, 'High');
  await page.filter('#priority-filter', 'Low');
  assert.deepEqual(page.titles(), ['Open low', 'Renamed high']);
  const checkbox = page.rows()[0].children[0];
  checkbox.checked = true;
  await checkbox.dispatch('change');
  assert.deepEqual(page.titles(), ['Renamed high']);
  assert.equal(page.element('#task-filter').value, 'open');
  assert.equal(page.element('#priority-filter').value, 'Low');
  await page.filter('#task-filter', 'completed');
  assert.deepEqual(page.titles(), ['Open low', 'Done low']);
  const completedCheckbox = page.rows()[1].children[0];
  completedCheckbox.checked = false;
  await completedCheckbox.dispatch('change');
  assert.deepEqual(page.titles(), ['Open low']);
  assert.equal(page.element('#task-filter').value, 'completed');
  assert.equal(page.element('#priority-filter').value, 'Low');
  assert.equal(writes, 4);

  const archivedPage = await loadPage(true);
  assert.equal(archivedPage.element('#priority-filter').value, 'all');
  assert.equal(archivedPage.rows().length, 6);
  await archivedPage.filter('#task-filter', 'open');
  await archivedPage.filter('#priority-filter', 'Low');
  assert.deepEqual(archivedPage.titles(), ['Renamed high', 'Done low']);
  for (const row of archivedPage.rows()) {
    assert.equal(row.children[0].disabled, true);
    assert.equal(row.children[3].disabled, true);
    assert.ok(row.children[2].children.every(control => control.disabled));
  }
  assert.equal(writes, 4);
  const restoredPage = await loadPage(false);
  assert.equal(restoredPage.element('#priority-filter').value, 'all');
  assert.equal(restoredPage.rows().length, 6);
  assert.equal(restoredPage.rows()[2].children[3].value, 'Low');
  assert.equal(restoredPage.rows()[2].children[3].disabled, false);
});

test('priority filter has an accessible label and exactly the required ordered options', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /<label for="priority-filter">Priority filter<\/label>/);
  const select = html.match(/<select id="priority-filter">([\s\S]*?)<\/select>/)[1];
  assert.deepEqual([...select.matchAll(/<option[^>]*>([^<]+)<\/option>/g)].map(match => match[1]),
    ['All', 'Low', 'Normal', 'High']);
  assert.match(select, /<option value="all" selected>All<\/option>/);
});

test('default priority saves without changing filters or existing rows and loads in archived and restored pages', async () => {
  const source = await appSource();
  const project = { id: 'example', name: 'Example', archived: false, default_task_priority: 'Normal' };
  const savedTasks = [
    { id: 'one', title: 'Original', completed: false, priority: 'Normal' },
  ];
  let failNextWrite = false;
  const writes = [];
  const loadPage = async () => {
    const elements = new Map();
    const element = selector => {
      if (!elements.has(selector)) elements.set(selector, new Element());
      return elements.get(selector);
    };
    for (const form of ['#project-form', '#task-form', '#rename-form']) {
      element(form).button = new Element();
    }
    element('#task-filter').value = 'all';
    element('#priority-filter').value = 'all';
    await runInNewContext(source, {
      document: { querySelector: element, createElement: () => new Element() },
      window: { location: { pathname: '/projects/example' } },
      fetch: async (path, options) => {
        if (path === '/api/projects' && !options) return { ok: true, json: async () => [] };
        let body;
        if (!options) body = path.endsWith('/tasks') ? savedTasks : project;
        else {
          writes.push({ path, ...options });
          if (failNextWrite) {
            failNextWrite = false;
            return { ok: false, json: async () => ({ error: 'Save failed' }) };
          }
          assert.equal(project.archived, false);
          const input = JSON.parse(options.body);
          if (options.method === 'POST') {
            body = { id: 'two', title: input.title, completed: false, priority: project.default_task_priority };
            savedTasks.push(body);
          } else {
            Object.assign(project, input);
            body = project;
          }
        }
        return { ok: true, json: async () => structuredClone(body) };
      },
    });
    return element;
  };
  const element = await loadPage();
  const defaultPriority = element('#default-task-priority');
  assert.equal(defaultPriority.value, 'Normal');
  assert.equal(defaultPriority.disabled, false);
  element('#task-filter').value = 'open';
  await element('#task-filter').dispatch('change');
  element('#priority-filter').value = 'Normal';
  await element('#priority-filter').dispatch('change');
  const originalRow = element('#task-list').children[0];
  defaultPriority.value = 'High';
  await defaultPriority.dispatch('change');
  assert.equal(writes[0].path, '/api/projects/example');
  assert.deepEqual(JSON.parse(writes[0].body), { default_task_priority: 'High' });
  assert.equal(defaultPriority.value, 'High');
  assert.equal(defaultPriority.disabled, false);
  assert.equal(element('#task-filter').value, 'open');
  assert.equal(element('#priority-filter').value, 'Normal');
  assert.equal(element('#task-list').children[0], originalRow);
  assert.equal(originalRow.children[3].value, 'Normal');
  element('#task-title').value = 'Inherited';
  await element('#task-form').dispatch('submit');
  assert.equal(savedTasks[1].priority, 'High');
  assert.equal(element('#task-list').children.length, 1);
  assert.equal(element('#priority-filter').value, 'Normal');
  failNextWrite = true;
  defaultPriority.value = 'Low';
  await defaultPriority.dispatch('change');
  assert.equal(defaultPriority.value, 'High');
  assert.equal(defaultPriority.disabled, false);
  assert.equal(element('#task-alert').textContent, 'Save failed');
  assert.equal(element('#task-filter').value, 'open');
  assert.equal(element('#priority-filter').value, 'Normal');
  project.archived = true;
  const archived = await loadPage();
  assert.equal(archived('#default-task-priority').value, 'High');
  assert.equal(archived('#default-task-priority').disabled, true);
  const writeCount = writes.length;
  await archived('#default-task-priority').dispatch('change');
  assert.equal(writes.length, writeCount);
  project.archived = false;
  const restored = await loadPage();
  assert.equal(restored('#default-task-priority').value, 'High');
  assert.equal(restored('#default-task-priority').disabled, false);
  assert.deepEqual(restored('#task-list').children.map(row => row.children[3].value), ['Normal', 'High']);
});

test('default task priority has an accessible label and exactly the required ordered options', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /<label for="default-task-priority">Default task priority<\/label>/);
  const select = html.match(/<select id="default-task-priority" disabled>([\s\S]*?)<\/select>/)[1];
  assert.deepEqual([...select.matchAll(/<option[^>]*>([^<]+)<\/option>/g)].map(match => match[1]),
    ['Low', 'Normal', 'High']);
  assert.match(select, /<option value="Normal" selected>Normal<\/option>/);
});

test('due-date controls preserve filters, saved values, and archived restrictions across page loads', async () => {
  const source = await appSource();
  const tasks = [
    { id: 'a', title: 'First', completed: true, priority: 'High', due_date: '' },
    { id: 'b', title: 'Second', completed: false, priority: 'Low', due_date: '0001-01-01' },
  ];
  let archived = false;
  let writes = 0;
  const loadPage = async () => {
    const elements = new Map();
    const element = selector => {
      if (!elements.has(selector)) elements.set(selector, new Element());
      return elements.get(selector);
    };
    for (const form of ['#project-form', '#task-form', '#rename-form']) element(form).button = new Element();
    element('#task-filter').value = 'all';
    element('#priority-filter').value = 'all';
    await runInNewContext(source, {
      document: { querySelector: element, createElement: () => new Element() },
      window: { location: { pathname: '/projects/example' } },
      fetch: async (path, options) => {
        if (path === '/api/projects' && !options) return { ok: true, json: async () => [] };
        if (!options) return { ok: true, json: async () => path.endsWith('/tasks')
          ? structuredClone(tasks) : { id: 'example', name: 'Example', archived } };
        writes++;
        const input = JSON.parse(options.body);
        if (input.due_date === 'invalid') return { ok: false, json: async () => ({
          error: 'Due date must be a valid YYYY-MM-DD date',
        }) };
        const task = tasks.find(task => path.endsWith(`/${task.id}`));
        Object.assign(task, input);
        return { ok: true, json: async () => ({ ...task }) };
      },
    });
    return element;
  };
  let element = await loadPage();
  const rows = () => element('#task-list').children;
  assert.deepEqual(rows().map(row => row.children[4].children[0].value), ['', '0001-01-01']);
  for (const row of rows()) {
    const [input, button] = row.children[4].children;
    assert.equal(input.type, 'text');
    assert.equal(input.attributes['aria-label'], 'Task due date');
    assert.equal(button.textContent, 'Save due date');
    assert.equal(input.disabled, false);
    assert.equal(button.disabled, false);
  }
  element('#task-filter').value = 'completed';
  await element('#task-filter').dispatch('change');
  element('#priority-filter').value = 'High';
  await element('#priority-filter').dispatch('change');
  const form = rows()[0].children[4];
  form.children[0].value = '  2024-02-29  ';
  await form.dispatch('submit');
  assert.equal(form.children[0].value, '2024-02-29');
  assert.equal(tasks[0].due_date, '2024-02-29');
  form.children[0].value = 'invalid';
  await form.dispatch('submit');
  assert.equal(element('#task-alert').hidden, false);
  assert.equal(element('#task-alert').textContent, 'Due date must be a valid YYYY-MM-DD date');
  assert.equal(tasks[0].due_date, '2024-02-29');
  assert.equal(form.children[0].disabled, false);
  assert.equal(form.children[1].disabled, false);
  const rename = rows()[0].children[2];
  rename.children[0].value = 'Renamed';
  await rename.dispatch('submit');
  assert.equal(tasks[0].due_date, '2024-02-29');
  assert.equal(element('#task-filter').value, 'completed');
  assert.equal(element('#priority-filter').value, 'High');
  assert.equal(rows().length, 1);
  element = await loadPage();
  assert.equal(rows()[0].children[4].children[0].value, '2024-02-29');
  archived = true;
  element = await loadPage();
  assert.ok(rows().every(row => row.children[4].children.every(control => control.disabled)));
  const writeCount = writes;
  await rows()[0].children[4].dispatch('submit');
  assert.equal(writes, writeCount);
  archived = false;
  element = await loadPage();
  assert.equal(rows()[0].children[4].children[0].value, '2024-02-29');
  assert.ok(rows().every(row => row.children[4].children.every(control => !control.disabled)));
  rows()[0].children[4].children[0].value = ' \t ';
  await rows()[0].children[4].dispatch('submit');
  assert.equal(rows()[0].children[4].children[0].value, '');
  assert.equal(tasks[1].due_date, '0001-01-01');
  assert.equal(tasks[0].completed, true);
  assert.equal(tasks[0].priority, 'High');
  element = await loadPage();
  assert.equal(rows()[0].children[4].children[0].value, '');
});

test('due ranges intersect filters inclusively, validate without changing membership, and remain usable when archived', async () => {
  const source = await appSource();
  const savedTasks = [
    { id: 'a', title: 'Undated', completed: false, priority: 'Normal', due_date: '' },
    { id: 'b', title: 'Early', completed: false, priority: 'Low', due_date: '0001-01-01' },
    { id: 'c', title: 'From', completed: false, priority: 'High', due_date: '2024-02-29' },
    { id: 'd', title: 'Inside', completed: true, priority: 'High', due_date: '2024-03-01' },
    { id: 'e', title: 'Through', completed: true, priority: 'Normal', due_date: '2024-03-31' },
    { id: 'f', title: 'Late', completed: false, priority: 'Low', due_date: '9999-12-31' },
  ];
  const original = structuredClone(savedTasks);
  const loadPage = async archived => {
    const elements = new Map();
    const element = selector => {
      if (!elements.has(selector)) elements.set(selector, new Element());
      return elements.get(selector);
    };
    for (const form of ['#project-form', '#task-form', '#rename-form']) element(form).button = new Element();
    element('#task-filter').value = 'all';
    element('#priority-filter').value = 'all';
    await runInNewContext(source, {
      document: { querySelector: element, createElement: () => new Element() },
      window: { location: { pathname: '/projects/example' } },
      fetch: async (path, options) => {
        if (path === '/api/projects' && !options) return { ok: true, json: async () => [] };
        assert.equal(options, undefined, 'Filtering must not write saved data');
        return { ok: true, json: async () => path.endsWith('/tasks')
          ? structuredClone(savedTasks)
          : { id: 'example', name: 'Example', archived, default_task_priority: 'Normal' } };
      },
    });
    return element;
  };
  for (const archived of [false, true]) {
    const element = await loadPage(archived);
    const titles = () => element('#task-list').children.map(row => row.children[1].textContent);
    const apply = async (from, through) => {
      element('#due-from').value = from;
      element('#due-through').value = through;
      await element('#due-range-form').dispatch('submit');
    };
    assert.equal(element('#due-from').value, '');
    assert.equal(element('#due-through').value, '');
    assert.deepEqual(titles(), original.map(task => task.title));
    await apply(' 2024-02-29 ', '\t2024-03-31 ');
    assert.deepEqual(titles(), ['From', 'Inside', 'Through']);
    assert.equal(element('#due-from').value, '2024-02-29');
    assert.equal(element('#due-through').value, '2024-03-31');
    for (const completion of ['all', 'open', 'completed']) {
      element('#task-filter').value = completion;
      await element('#task-filter').dispatch('change');
      for (const priority of ['all', 'Low', 'Normal', 'High']) {
        element('#priority-filter').value = priority;
        await element('#priority-filter').dispatch('change');
        const expected = original.slice(2, 5).filter(task =>
          (completion === 'all' || task.completed === (completion === 'completed')) &&
          (priority === 'all' || task.priority === priority));
        assert.deepEqual(titles(), expected.map(task => task.title));
        assert.equal(element('#task-filter').value, completion);
        assert.equal(element('#due-from').value, '2024-02-29');
        assert.equal(element('#due-through').value, '2024-03-31');
      }
    }
    element('#task-filter').value = 'all';
    await element('#task-filter').dispatch('change');
    element('#priority-filter').value = 'all';
    await element('#priority-filter').dispatch('change');
    const invalidDates = ['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29',
      '2023-02-29', '2024-04-31', '2024-00-01', '2024-13-01', '2024-01-00',
      '2024-01-32', '2024-2-29', '2024-02-29T00:00:00Z', 'invalid'];
    for (const date of invalidDates) {
      for (const boundaries of [[date, ''], ['', date]]) {
        await apply(...boundaries);
        assert.equal(element('#due-range-alert').textContent, 'Due range must use valid YYYY-MM-DD dates');
        assert.equal(element('#due-range-alert').hidden, false);
        assert.deepEqual(titles(), ['From', 'Inside', 'Through']);
        // Changing a combobox uses the applied range, even with invalid draft fields.
        await element('#priority-filter').dispatch('change');
        assert.deepEqual(titles(), ['From', 'Inside', 'Through']);
      }
    }
    await apply('2024-04-01', '2024-03-31');
    assert.equal(element('#due-range-alert').textContent, 'Due from must not be after Due through');
    assert.deepEqual(titles(), ['From', 'Inside', 'Through']);
    await apply('2024-02-29', '2024-02-29');
    assert.deepEqual(titles(), ['From']);
    assert.equal(element('#due-range-alert').hidden, true);
    await apply('', '2024-02-29');
    assert.deepEqual(titles(), ['Early', 'From']);
    await apply('2024-03-31', '');
    assert.deepEqual(titles(), ['Through', 'Late']);
    await apply('0001-01-01', '9999-12-31');
    assert.deepEqual(titles(), original.slice(1).map(task => task.title));
    await apply('2000-02-29', '2000-02-29');
    assert.deepEqual(titles(), []);
    await apply(' \t ', '');
    assert.deepEqual(titles(), original.map(task => task.title));
    assert.ok(element('#task-list').children.every(row => row.children[0].disabled === archived));
    assert.deepEqual(savedTasks, original);
  }
});

test('task edits re-evaluate the applied range and preserve selections through creation and renames', async () => {
  const source = await appSource();
  const tasks = [
    { id: 'a', title: 'First', completed: false, priority: 'High', due_date: '2024-03-01' },
    { id: 'b', title: 'Second', completed: false, priority: 'High', due_date: '2024-03-15' },
    { id: 'c', title: 'Third', completed: false, priority: 'High', due_date: '2024-03-31' },
  ];
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  for (const form of ['#project-form', '#task-form', '#rename-form']) element(form).button = new Element();
  element('#task-filter').value = 'all';
  element('#priority-filter').value = 'all';
  await runInNewContext(source, {
    document: { querySelector: element, createElement: () => new Element() },
    window: { location: { pathname: '/projects/example' } },
    fetch: async (path, options) => {
      if (path === '/api/projects' && !options) return { ok: true, json: async () => [] };
      let body;
      if (!options) {
        body = path.endsWith('/tasks') ? structuredClone(tasks)
          : { id: 'example', name: 'Example', default_task_priority: 'Normal' };
      } else {
        const input = JSON.parse(options.body);
        if (options.method === 'POST') {
          body = { id: 'new', title: input.title, completed: false, priority: 'Normal', due_date: '' };
          tasks.push(body);
        } else if (path === '/api/projects/example') {
          body = { id: 'example', ...input };
        } else {
          const task = tasks.find(task => path.endsWith(`/${task.id}`));
          Object.assign(task, input);
          body = { ...task };
        }
      }
      return { ok: true, json: async () => body };
    },
  });
  const rows = () => element('#task-list').children;
  const titles = () => rows().map(row => row.children[1].textContent);
  element('#task-filter').value = 'open';
  await element('#task-filter').dispatch('change');
  element('#priority-filter').value = 'High';
  await element('#priority-filter').dispatch('change');
  element('#due-from').value = '2024-03-01';
  element('#due-through').value = '2024-03-31';
  await element('#due-range-form').dispatch('submit');
  const retained = () => {
    assert.equal(element('#task-filter').value, 'open');
    assert.equal(element('#priority-filter').value, 'High');
    assert.equal(element('#due-from').value, '2024-03-01');
    assert.equal(element('#due-through').value, '2024-03-31');
  };
  const rename = rows()[0].children[2];
  rename.children[0].value = 'Renamed';
  await rename.dispatch('submit');
  retained();
  assert.deepEqual(titles(), ['Renamed', 'Second', 'Third']);
  assert.equal(rows()[0].children[4].children[0].value, '2024-03-01');
  element('#new-project-name').value = 'Renamed project';
  await element('#rename-form').dispatch('submit');
  element('#default-task-priority').value = 'Low';
  await element('#default-task-priority').dispatch('change');
  element('#task-title').value = 'New task';
  await element('#task-form').dispatch('submit');
  retained();
  assert.deepEqual(titles(), ['Renamed', 'Second', 'Third']);
  // Unapplied text must not affect the membership used by edits.
  element('#due-from').value = '9999-12-31';
  const due = rows()[0].children[4];
  due.children[0].value = '2024-04-01';
  await due.dispatch('submit');
  assert.deepEqual(titles(), ['Second', 'Third']);
  element('#due-from').value = '2024-03-01';
  retained();
  const priority = rows()[0].children[3];
  priority.value = 'Low';
  await priority.dispatch('change');
  assert.deepEqual(titles(), ['Third']);
  retained();
  const checkbox = rows()[0].children[0];
  checkbox.checked = true;
  await checkbox.dispatch('change');
  assert.deepEqual(titles(), []);
  retained();
  element('#task-filter').value = 'completed';
  await element('#task-filter').dispatch('change');
  assert.deepEqual(titles(), ['Third']);
  const clear = rows()[0].children[4];
  clear.children[0].value = '';
  await clear.dispatch('submit');
  assert.deepEqual(titles(), []);
  element('#due-from').value = '';
  element('#due-through').value = '';
  await element('#due-range-form').dispatch('submit');
  assert.deepEqual(titles(), ['Third']);
  assert.equal(tasks[0].due_date, '2024-04-01');
  assert.equal(tasks[1].priority, 'Low');
  assert.equal(tasks[2].completed, true);
  assert.equal(tasks[2].due_date, '');
});

test('due-range textboxes and button have the required accessible labels', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  for (const [id, label] of [['due-from', 'Due from'], ['due-through', 'Due through']]) {
    assert.ok(html.includes(`<label for="${id}">${label}</label>`));
    assert.ok(html.includes(`<input id="${id}" type="text"`));
  }
  assert.match(html, /<button type="submit">Apply due range<\/button>/);
});

test('move controls list eligible destinations and preserve source filters, with disabled and error states', async () => {
  const source = await appSource();
  const projects = [
    { id: 'example', name: 'Source', archived: false },
    { id: 'first', name: 'Renamed destination', archived: false },
    { id: 'archived', name: 'Archived', archived: true },
    { id: 'last', name: 'Last', archived: false },
  ];
  for (const mode of ['active', 'archived', 'no destinations']) {
    const elements = new Map();
    const element = selector => {
      if (!elements.has(selector)) elements.set(selector, new Element());
      return elements.get(selector);
    };
    for (const form of ['#project-form', '#task-form', '#rename-form']) element(form).button = new Element();
    element('#task-filter').value = 'all';
    element('#priority-filter').value = 'all';
    const tasks = ['First', 'Second', 'Third'].map((title, index) => ({
      id: String(index), title, completed: false, priority: 'High', due_date: '2024-03-01',
    }));
    const writes = [];
    let fail = true;
    const location = { pathname: '/projects/example' };
    await runInNewContext(source, {
      document: { querySelector: element, createElement: () => new Element() },
      window: { location },
      fetch: async (path, options) => {
        if (!options) return { ok: true, json: async () => path === '/api/projects'
          ? structuredClone(mode === 'no destinations' ? projects.slice(0, 1) : projects)
          : path.endsWith('/tasks') ? structuredClone(tasks)
          : { ...projects[0], archived: mode === 'archived', default_task_priority: 'Normal' } };
        writes.push({ path, body: JSON.parse(options.body) });
        return { ok: !fail, json: async () => fail ? { error: 'Move failed' } : tasks[1] };
      },
    });
    const rows = () => element('#task-list').children;
    const move = rows()[1].children[5];
    const [select, button] = move.children;
    assert.equal(select.attributes['aria-label'], 'Destination project');
    assert.equal(button.textContent, 'Move task');
    assert.deepEqual(select.children.map(option => [option.value, option.textContent]),
      mode === 'no destinations' ? [] : [['first', 'Renamed destination'], ['last', 'Last']]);
    assert.equal(select.disabled, mode !== 'active');
    assert.equal(button.disabled, mode !== 'active');
    if (mode !== 'active') {
      await move.dispatch('submit');
      assert.equal(writes.length, 0);
      continue;
    }
    element('#task-filter').value = 'open';
    await element('#task-filter').dispatch('change');
    element('#priority-filter').value = 'High';
    await element('#priority-filter').dispatch('change');
    element('#due-from').value = '2024-03-01';
    element('#due-through').value = '2024-03-31';
    await element('#due-range-form').dispatch('submit');
    const currentMove = rows()[1].children[5];
    currentMove.children[0].value = 'last';
    await currentMove.dispatch('submit');
    assert.equal(element('#task-alert').textContent, 'Move failed');
    assert.equal(currentMove.children[0].disabled, false);
    assert.equal(currentMove.children[1].disabled, false);
    assert.equal(rows().length, 3);
    fail = false;
    await currentMove.dispatch('submit');
    assert.deepEqual(writes[1], {
      path: '/api/projects/example/tasks/1', body: { destination_project_id: 'last' },
    });
    assert.deepEqual(rows().map(row => row.children[1].textContent), ['First', 'Third']);
    assert.equal(element('#task-filter').value, 'open');
    assert.equal(element('#priority-filter').value, 'High');
    assert.equal(element('#due-from').value, '2024-03-01');
    assert.equal(element('#due-through').value, '2024-03-31');
    assert.equal(location.pathname, '/projects/example');
    assert.equal(location.href, undefined);
    // The applied range still filters when a combobox changes after moving.
    element('#priority-filter').value = 'all';
    await element('#priority-filter').dispatch('change');
    assert.equal(rows().length, 2);
  }
});
