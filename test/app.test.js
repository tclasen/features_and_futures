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
  element('#priority-filter').value = 'all';
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
  element('#priority-filter').value = 'all';
  let writes = 0;
  await runInNewContext(source, {
    document: { querySelector: element, createElement: () => new Element() },
    window: { location: { pathname: '/projects/one' } },
    fetch: async (path, options) => {
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
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
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
