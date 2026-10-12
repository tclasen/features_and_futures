import test from 'node:test';
import { isValidDueDate } from '../public/dates.js';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// A small DOM harness runs the actual UI handlers without browser dependencies.
class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.listeners = {};
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  async trigger(name) { await this.listeners[name]({ preventDefault() {} }); }
  focus() {}
  get value() {
    return this.selectedValue ?? (this.tagName === 'select' ?
      this.children[0]?.value || this.children[0]?.textContent : '') ?? '';
  }
  set value(value) { this.selectedValue = value; }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0];
  }
  querySelectorAll(selector) {
    const matches = element => selector.startsWith('#') ? element.id === selector.slice(1) :
      selector === '[role="alert"]' ? element.attributes.role === 'alert' : element.tagName === selector;
    return this.children.flatMap(child => [ ...(matches(child) ? [child] : []), ...child.querySelectorAll(selector) ]);
  }
  set innerHTML(html) {
    this.children = [];
    const stack = [this];
    for (const token of html.match(/<[^>]+>|[^<]+/g)) {
      if (token.startsWith('</')) { stack.pop(); continue; }
      if (!token.startsWith('<')) { stack.at(-1).textContent = token.trim(); continue; }
      const element = new Element(token.match(/^<(\w+)/)[1]);
      for (const [, name, value] of token.matchAll(/([\w-]+)="([^"]*)"/g)) {
        element.setAttribute(name, value);
        if (name === 'id') element.id = value;
      }
      element.disabled = /\sdisabled[\s>]/.test(token);
      element.hidden = /\shidden[\s>]/.test(token);
      stack.at(-1).append(element);
      if (element.tagName !== 'input') stack.push(element);
    }
  }
}

const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const script = source.replace("import { isValidDueDate } from './dates.js';", '');
async function projectPage(archived = false, destinations = [
  { id: 2, name: 'Second project', archived: false },
  { id: 3, name: 'Archived destination', archived: true },
  { id: 4, name: 'Fourth project', archived: false },
], initialNotes = '', initialDeleted = false) {
  const app = new Element('main');
  const tasks = [];
  for (const priority of ['Low', 'Normal', 'High']) {
    for (const completed of [false, true]) {
      tasks.push({ id: tasks.length + 1, title: `${priority} ${completed ? 'done' : 'open'}`, completed, priority, dueDate: '', notes: '', deleted: false });
    }
  }
  tasks.push({ id: 7, title: 'Second high open', completed: false, priority: 'High', dueDate: '0001-01-01', notes: '', deleted: false });
  tasks[0].notes = initialNotes;
  tasks[0].deleted = initialDeleted;
  const requests = [];
  const navigation = [];
  let nextError;
  const project = { id: 1, name: 'Project', archived, defaultPriority: 'Normal', totalCount: 7, completedCount: 3 };
  const context = {
    isValidDueDate,
    document: { querySelector: () => app, createElement: tag => new Element(tag) },
    location: { pathname: '/projects/1', assign: path => navigation.push(path) },
    fetch: async (path, options) => {
      requests.push({ path, options });
      if (nextError) {
        const error = nextError;
        nextError = undefined;
        return { ok: false, json: async () => ({ error }) };
      }
      let data;
      if (options?.method === 'POST' && /\/(delete|restore)$/.test(path)) {
        data = tasks.find(task => task.id === Number(path.split('/').at(-2)));
        data.deleted = path.endsWith('/delete');
      } else if (options?.method === 'POST' && path.endsWith('/move')) {
        const taskId = Number(path.split('/').at(-2));
        data = tasks.splice(tasks.findIndex(task => task.id === taskId), 1)[0];
      } else if (options?.method === 'POST') {
        data = { id: tasks.length + 1, title: JSON.parse(options.body).title,
          completed: false, priority: project.defaultPriority, dueDate: '', notes: '', deleted: false };
        tasks.push(data);
      } else if (options?.method === 'PATCH') {
        const target = path.includes('/tasks/') ? tasks.find(task => task.id === Number(path.split('/').at(-1))) : project;
        Object.assign(target, JSON.parse(options.body));
        data = target;
      } else if (path === '/api/projects') data = [project, ...destinations];
      else if (path.endsWith('/tasks')) data = tasks;
      else data = project;
      return { ok: true, json: async () => structuredClone(data) };
    },
  };
  runInNewContext(script, context);
  await new Promise(resolve => setImmediate(resolve));
  const completion = app.querySelector('#task-filter');
  const priority = app.querySelector('#priority-filter');
  const rows = () => app.querySelector('#task-list').children;
  const titles = () => rows().map(row => row.children[0].textContent);
  async function select(element, value) { element.value = value; await element.trigger('change'); }
  return { app, tasks, project, requests, navigation, completion, priority, rows, titles, select,
    rejectNext: error => { nextError = error; } };
}

test('combined filters preserve selections, creation order and data across all combinations', async () => {
  const page = await projectPage();
  assert.equal(page.completion.value, 'All');
  assert.equal(page.priority.value, 'All');
  assert.deepEqual(page.priority.children.map(option => option.textContent), ['All', 'Low', 'Normal', 'High']);
  const original = structuredClone(page.tasks);
  for (const completion of ['All', 'Open', 'Completed']) {
    await page.select(page.completion, completion);
    for (const priority of ['All', 'Low', 'Normal', 'High']) {
      await page.select(page.priority, priority);
      assert.equal(page.completion.value, completion);
      assert.deepEqual(page.titles(), original.filter(task =>
        (completion === 'All' || task.completed === (completion === 'Completed')) &&
        (priority === 'All' || task.priority === priority)).map(task => task.title));
    }
  }
  await page.select(page.completion, 'Open');
  assert.equal(page.priority.value, 'High');
  assert.deepEqual(page.tasks, original);
  assert.ok(page.requests.every(request => !request.options));
});

test('Download project stays enabled and preserves current filters, drafts and visible rows', async () => {
  for (const archived of [false, true]) {
    const page = await projectPage(archived, undefined, 'Saved notes', true);
    await page.select(page.completion, 'Deleted');
    await page.select(page.priority, 'Low');
    await applyRange(page, '0001-01-01', '9999-12-31');
    await searchTasks(page, 'Low');
    page.app.querySelector('#due-from').value = 'unapplied draft';
    page.app.querySelector('#task-search').value = 'unapplied query';
    const rows = [...page.rows()];
    const tasks = structuredClone(page.tasks);
    const project = structuredClone(page.project);
    const requests = page.requests.length;
    const control = page.app.querySelector('#download-project');
    assert.equal(control.textContent, 'Download project');
    assert.equal(control.disabled, false);
    await control.trigger('click');
    assert.deepEqual(page.navigation, ['/api/projects/1/export']);
    assert.equal(page.completion.value, 'Deleted');
    assert.equal(page.priority.value, 'Low');
    assert.equal(page.app.querySelector('#due-from').value, 'unapplied draft');
    assert.equal(page.app.querySelector('#due-through').value, '9999-12-31');
    assert.equal(page.app.querySelector('#task-search').value, 'unapplied query');
    assert.deepEqual(page.rows(), rows);
    assert.deepEqual(page.tasks, tasks);
    assert.deepEqual(page.project, project);
    assert.equal(page.requests.length, requests);
    await applyRange(page, '', '');
    assert.deepEqual(page.titles(), ['Low open']);
  }
});

test('priority, completion and rename handlers keep both filters and update matching rows', async () => {
  const page = await projectPage();
  await page.select(page.completion, 'Open');
  await page.select(page.priority, 'High');
  const rename = page.rows()[0].querySelector('form');
  rename.querySelector('input').value = '  Renamed high task  ';
  await rename.trigger('submit');
  assert.deepEqual(page.titles(), ['Renamed high task', 'Second high open']);
  assert.equal(page.rows()[0].querySelector('input').attributes['aria-label'], 'Complete Renamed high task');
  assert.equal(page.tasks[4].priority, 'High');
  const priority = page.rows()[0].querySelector('select');
  await page.select(priority, 'Low');
  assert.deepEqual(page.titles(), ['Second high open']);
  const checkbox = page.rows()[0].querySelector('input');
  checkbox.checked = true;
  await checkbox.trigger('change');
  assert.deepEqual(page.titles(), []);
  assert.equal(page.completion.value, 'Open');
  assert.equal(page.priority.value, 'High');
  await page.select(page.completion, 'Completed');
  assert.deepEqual(page.titles(), ['High done', 'Second high open']);
  await page.select(page.priority, 'Low');
  await page.select(page.completion, 'Open');
  assert.deepEqual(page.titles(), ['Low open', 'Renamed high task']);
  assert.equal(page.tasks[4].completed, false);
  assert.equal(page.tasks[6].priority, 'High');
});

test('archived pages allow both filters while disabling editing; fresh pages default to All', async () => {
  const page = await projectPage(true);
  assert.equal(page.completion.disabled, false);
  assert.equal(page.priority.disabled, false);
  assert.equal(page.app.querySelector('#default-task-priority').disabled, true);
  assert.equal(page.app.querySelector('#default-task-priority').value, 'Normal');
  await page.select(page.completion, 'Completed');
  await page.select(page.priority, 'Normal');
  assert.deepEqual(page.titles(), ['Normal done']);
  for (const tag of ['input', 'select', 'button']) {
    assert.ok(page.rows()[0].querySelectorAll(tag).every(control => control.disabled));
  }
  const restored = await projectPage(false);
  assert.equal(restored.completion.value, 'All');
  assert.equal(restored.priority.value, 'All');
  assert.equal(restored.rows().length, 7);
  assert.equal(restored.app.querySelector('#default-task-priority').disabled, false);
  for (const tag of ['input', 'select', 'button']) {
    assert.ok(restored.rows()[0].querySelectorAll(tag).every(control => !control.disabled));
  }
});

test('saving a project default leaves task rows and both filters unchanged', async () => {
  const page = await projectPage();
  const control = page.app.querySelector('#default-task-priority');
  assert.deepEqual(control.children.map(option => option.textContent), ['Low', 'Normal', 'High']);
  assert.equal(control.value, 'Normal');
  await page.select(page.completion, 'Open');
  await page.select(page.priority, 'High');
  const originalTasks = structuredClone(page.tasks);
  const originalRows = [...page.rows()];
  for (const value of ['Low', 'High', 'Normal']) {
    await page.select(control, value);
    assert.equal(control.value, value);
    assert.equal(page.project.defaultPriority, value);
    assert.equal(control.disabled, false);
    assert.equal(page.completion.value, 'Open');
    assert.equal(page.priority.value, 'High');
    assert.deepEqual(page.tasks, originalTasks);
    assert.deepEqual(page.rows(), originalRows);
    assert.equal(page.project.totalCount, 7);
    assert.equal(page.project.completedCount, 3);
  }
});

test('due date controls save, clear and report errors while preserving rows and filters', async () => {
  const page = await projectPage();
  await page.select(page.completion, 'Open');
  await page.select(page.priority, 'High');
  const originalTasks = structuredClone(page.tasks);
  const originalRows = [...page.rows()];
  const input = page.app.querySelector('#task-due-date-5');
  assert.equal(input.type, 'text');
  assert.equal(input.value, '');
  const form = page.rows()[0].querySelectorAll('form')[1];
  assert.equal(form.querySelector('label').textContent, 'Task due date');
  assert.equal(form.querySelector('button').textContent, 'Save due date');
  for (const value of ['  2000-02-29  ', ' \t ', '9999-12-31']) {
    input.value = value;
    await form.trigger('submit');
    originalTasks[4].dueDate = value.trim();
    assert.equal(input.value, value.trim());
    assert.deepEqual(page.tasks, originalTasks);
    assert.deepEqual(page.rows(), originalRows);
    assert.equal(page.completion.value, 'Open');
    assert.equal(page.priority.value, 'High');
    assert.equal(page.project.totalCount, 7);
    assert.equal(page.project.completedCount, 3);
  }
  input.value = '1900-02-29';
  page.rejectNext('Due date must be a valid YYYY-MM-DD date');
  await form.trigger('submit');
  const alert = page.app.querySelector('[role="alert"]');
  assert.equal(alert.hidden, false);
  assert.equal(alert.textContent, 'Due date must be a valid YYYY-MM-DD date');
  assert.deepEqual(page.tasks, originalTasks);
  assert.equal(form.querySelector('button').disabled, false);
  const rename = page.rows()[0].querySelector('form');
  rename.querySelector('input').value = 'Renamed dated task';
  await rename.trigger('submit');
  assert.equal(page.tasks[4].dueDate, '9999-12-31');
  await page.select(page.priority, 'All');
  assert.equal(page.app.querySelector('#task-due-date-5').value, '9999-12-31');
  assert.equal(page.app.querySelector('#task-due-date-7').value, '0001-01-01');
});

async function applyRange(page, from, through) {
  page.app.querySelector('#due-from').value = from;
  page.app.querySelector('#due-through').value = through;
  await page.app.querySelector('#due-range').trigger('submit');
}

async function saveDate(page, taskId, value) {
  const input = page.app.querySelector(`#task-due-date-${taskId}`);
  const row = page.rows().find(row => row.querySelector(`#task-due-date-${taskId}`));
  input.value = value;
  await row.querySelectorAll('form')[1].trigger('submit');
}

test('inclusive date ranges intersect both filters, preserve order and exclude undated tasks', async () => {
  const page = await projectPage();
  assert.equal(page.app.querySelector('#due-from').value, '');
  assert.equal(page.app.querySelector('#due-through').value, '');
  for (const [id, date] of [[1, '2024-02-28'], [2, '2024-02-29'], [3, '2024-03-01'],
    [4, '2024-02-29'], [5, '9999-12-31']]) await saveDate(page, id, date);
  const original = structuredClone(page.tasks);
  const requestCount = page.requests.length;
  for (const [from, through] of [['', ''], ['', '2024-02-29'], ['2024-02-29', ''],
    ['2024-02-29', '2024-02-29'], ['0001-01-01', '9999-12-31']]) {
    await applyRange(page, ` ${from} `, ` ${through} `);
    for (const completion of ['All', 'Open', 'Completed']) {
      await page.select(page.completion, completion);
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        await page.select(page.priority, priority);
        assert.deepEqual(page.titles(), original.filter(task =>
          (completion === 'All' || task.completed === (completion === 'Completed')) &&
          (priority === 'All' || task.priority === priority) &&
          ((!from && !through) || (task.dueDate && (!from || task.dueDate >= from) &&
            (!through || task.dueDate <= through)))).map(task => task.title));
        assert.equal(page.completion.value, completion);
        assert.equal(page.priority.value, priority);
      }
    }
  }
  assert.deepEqual(page.tasks, original);
  assert.equal(page.requests.length, requestCount);
});

test('invalid range applications preserve previous membership and applied boundaries', async () => {
  const page = await projectPage();
  await saveDate(page, 5, '2000-02-29');
  await applyRange(page, '2000-02-29', '2000-02-29');
  const original = structuredClone(page.tasks);
  for (const invalid of ['0000-01-01', '1900-02-29', '2024-04-31', '2024-1-01',
    '10000-01-01', '2024-01-01T00:00:00Z', '2024-13-01', '2024-01-00']) {
    for (const bounds of [[invalid, ''], ['', invalid]]) {
      await applyRange(page, ...bounds);
      assert.deepEqual(page.titles(), ['High open']);
      assert.equal(page.app.querySelector('[role="alert"]').hidden, false);
      assert.equal(page.app.querySelector('[role="alert"]').textContent,
        'Due range must use valid YYYY-MM-DD dates');
    }
  }
  await applyRange(page, '2024-03-01', '2024-02-29');
  assert.equal(page.app.querySelector('[role="alert"]').textContent,
    'Due from must not be after Due through');
  await page.select(page.priority, 'High');
  assert.deepEqual(page.titles(), ['High open']);
  assert.deepEqual(page.tasks, original);
});

test('edits and creation retain applied range and selections while reevaluating membership', async () => {
  const page = await projectPage();
  await saveDate(page, 5, '2024-02-29');
  await saveDate(page, 7, '2024-02-29');
  await page.select(page.completion, 'Open');
  await page.select(page.priority, 'High');
  await applyRange(page, '2024-02-29', '2024-02-29');
  const rename = page.rows()[0].querySelector('form');
  rename.querySelector('input').value = 'Renamed';
  await rename.trigger('submit');
  const renameProject = page.app.querySelector('#rename-project');
  renameProject.querySelector('input').value = 'Renamed project';
  await renameProject.trigger('submit');
  await page.select(page.app.querySelector('#default-task-priority'), 'High');
  const create = page.app.querySelector('#create-task');
  create.querySelector('input').value = 'New undated task';
  await create.trigger('submit');
  assert.deepEqual(page.titles(), ['Renamed', 'Second high open']);
  await saveDate(page, 5, '2024-03-01');
  assert.deepEqual(page.titles(), ['Second high open']);
  await page.select(page.rows()[0].querySelector('select'), 'Low');
  assert.deepEqual(page.titles(), []);
  await page.select(page.priority, 'Low');
  assert.deepEqual(page.titles(), ['Second high open']);
  const checkbox = page.rows()[0].querySelector('input');
  checkbox.checked = true;
  await checkbox.trigger('change');
  assert.deepEqual(page.titles(), []);
  assert.equal(page.completion.value, 'Open');
  assert.equal(page.priority.value, 'Low');
  await page.select(page.completion, 'Completed');
  assert.deepEqual(page.titles(), ['Second high open']);
  await saveDate(page, 7, '   ');
  assert.deepEqual(page.titles(), []);
  await applyRange(page, '', '');
  assert.deepEqual(page.titles(), ['Low done', 'Second high open']);
  const reopened = await projectPage();
  assert.equal(reopened.app.querySelector('#due-from').value, '');
  assert.equal(reopened.app.querySelector('#due-through').value, '');
});

test('archived projects allow date ranges while task edits stay disabled', async () => {
  const page = await projectPage(true);
  for (const tag of ['input', 'button']) {
    assert.ok(page.app.querySelector('#due-range').querySelectorAll(tag).every(control => !control.disabled));
  }
  await applyRange(page, '0001-01-01', '0001-01-01');
  assert.deepEqual(page.titles(), ['Second high open']);
  for (const tag of ['input', 'select', 'button']) {
    assert.ok(page.rows()[0].querySelectorAll(tag).every(control => control.disabled));
  }
  await applyRange(page, '', '');
  assert.equal(page.rows().length, 7);
  assert.equal(page.requests.length, 3);
});

test('moving retains source filters and range, lists eligible destinations and removes only the moved row', async () => {
  const page = await projectPage();
  await saveDate(page, 5, '2024-02-29');
  await saveDate(page, 7, '2024-02-29');
  await page.select(page.completion, 'Open');
  await page.select(page.priority, 'High');
  await applyRange(page, '2024-02-29', '2024-02-29');
  const form = page.rows()[0].querySelectorAll('form')[2];
  const destination = form.querySelector('select');
  assert.equal(form.querySelector('label').textContent, 'Destination project');
  assert.equal(form.querySelector('button').textContent, 'Move task');
  assert.deepEqual(destination.children.map(option => [option.value, option.textContent]),
    [['2', 'Second project'], ['4', 'Fourth project']]);
  destination.value = '4';
  await form.trigger('submit');
  assert.deepEqual(page.titles(), ['Second high open']);
  assert.equal(page.completion.value, 'Open');
  assert.equal(page.priority.value, 'High');
  assert.equal(page.app.querySelector('#due-from').value, '2024-02-29');
  assert.equal(page.app.querySelector('#due-through').value, '2024-02-29');
  const last = page.requests.at(-1);
  assert.equal(last.path, '/api/projects/1/tasks/5/move');
  assert.deepEqual(JSON.parse(last.options.body), { destinationProjectId: 4 });
  await page.select(page.priority, 'All');
  assert.deepEqual(page.titles(), ['Second high open']);
});

test('move controls disable without eligible destinations and failures preserve source rows', async () => {
  for (const page of [await projectPage(false, []), await projectPage(true)]) {
    for (const row of page.rows()) {
      const form = row.querySelectorAll('form')[2];
      assert.equal(form.querySelector('select').disabled, true);
      assert.equal(form.querySelector('button').disabled, true);
    }
  }
  const page = await projectPage();
  const before = page.titles();
  const form = page.rows()[0].querySelectorAll('form')[2];
  page.rejectNext('Archived project');
  await form.trigger('submit');
  assert.deepEqual(page.titles(), before);
  assert.equal(page.app.querySelector('[role="alert"]').textContent, 'Archived project');
  assert.equal(form.querySelector('button').disabled, false);
});

async function searchTasks(page, query) {
  page.app.querySelector('#task-search').value = query;
  await page.app.querySelector('#task-search-form').trigger('submit');
}

test('task search intersects every filter and only applied queries affect rows', async () => {
  const page = await projectPage();
  assert.equal(page.app.querySelector('#task-search').value, '');
  await saveDate(page, 5, '2024-02-29');
  await saveDate(page, 7, '2024-02-29');
  const original = structuredClone(page.tasks);
  const requests = page.requests.length;
  await searchTasks(page, ' \tHiGH \n');
  assert.deepEqual(page.titles(), ['High open', 'High done', 'Second high open']);
  await page.select(page.completion, 'Open');
  await page.select(page.priority, 'High');
  await applyRange(page, '2024-02-29', '2024-02-29');
  assert.deepEqual(page.titles(), ['High open', 'Second high open']);
  page.app.querySelector('#task-search').value = 'not applied';
  await page.select(page.priority, 'All');
  assert.deepEqual(page.titles(), ['High open', 'Second high open']);
  await searchTasks(page, 'high  open');
  assert.deepEqual(page.titles(), ['High open', 'Second high open']);
  await searchTasks(page, 'SECOND');
  assert.deepEqual(page.titles(), ['Second high open']);
  await searchTasks(page, ' \t ');
  assert.deepEqual(page.titles(), ['High open', 'Second high open']);
  assert.equal(page.completion.value, 'Open');
  assert.equal(page.priority.value, 'All');
  assert.equal(page.app.querySelector('#due-from').value, '2024-02-29');
  assert.equal(page.app.querySelector('#due-through').value, '2024-02-29');
  assert.deepEqual(page.tasks, original);
  assert.equal(page.requests.length, requests);
});

test('task edits retain search and other filters, including rename membership and movement', async () => {
  const page = await projectPage();
  await searchTasks(page, 'HIGH');
  await page.select(page.completion, 'Open');
  await page.select(page.priority, 'High');
  const rename = page.rows()[0].querySelector('form');
  rename.querySelector('input').value = 'No longer matches';
  await rename.trigger('submit');
  assert.deepEqual(page.titles(), ['Second high open']);
  assert.equal(page.tasks[4].title, 'No longer matches');
  await saveDate(page, 7, '2024-02-29');
  await applyRange(page, '2024-02-29', '2024-02-29');
  const projectRename = page.app.querySelector('#rename-project');
  projectRename.querySelector('input').value = 'Renamed project';
  await projectRename.trigger('submit');
  await page.select(page.app.querySelector('#default-task-priority'), 'High');
  const create = page.app.querySelector('#create-task');
  create.querySelector('input').value = 'New high task';
  await create.trigger('submit');
  assert.deepEqual(page.titles(), ['Second high open']);
  await saveDate(page, 7, '2024-03-01');
  assert.deepEqual(page.titles(), []);
  await applyRange(page, '', '');
  assert.deepEqual(page.titles(), ['Second high open', 'New high task']);
  await page.select(page.rows()[0].querySelector('select'), 'Low');
  assert.deepEqual(page.titles(), ['New high task']);
  const checkbox = page.rows()[0].querySelector('input');
  checkbox.checked = true;
  await checkbox.trigger('change');
  assert.deepEqual(page.titles(), []);
  await page.select(page.completion, 'Completed');
  assert.deepEqual(page.titles(), ['High done', 'New high task']);
  await page.rows()[0].querySelectorAll('form')[2].trigger('submit');
  assert.deepEqual(page.titles(), ['New high task']);
  assert.equal(page.app.querySelector('#task-search').value, 'HIGH');
  assert.equal(page.completion.value, 'Completed');
  assert.equal(page.priority.value, 'High');
  const reopened = await projectPage();
  assert.equal(reopened.app.querySelector('#task-search').value, '');
  assert.equal(reopened.rows().length, 7);
});

test('archived task search stays usable and preserves non-ASCII case and displayed whitespace', async () => {
  const page = await projectPage();
  const rename = page.rows()[0].querySelector('form');
  rename.querySelector('input').value = 'ÄBC  work';
  await rename.trigger('submit');
  await searchTasks(page, 'äbc');
  assert.deepEqual(page.titles(), []);
  await searchTasks(page, 'Äbc  WORK');
  assert.deepEqual(page.titles(), ['ÄBC  work']);
  await searchTasks(page, 'Äbc work');
  assert.deepEqual(page.titles(), ['ÄBC  work']);
  const archived = await projectPage(true);
  for (const tag of ['input', 'button']) {
    assert.ok(archived.app.querySelector('#task-search-form').querySelectorAll(tag).every(control => !control.disabled));
  }
  await searchTasks(archived, 'NORMAL');
  await archived.select(archived.completion, 'Completed');
  assert.deepEqual(archived.titles(), ['Normal done']);
  for (const tag of ['input', 'select', 'button']) {
    assert.ok(archived.rows()[0].querySelectorAll(tag).every(control => control.disabled));
  }
  await searchTasks(archived, '');
  assert.deepEqual(archived.titles(), ['Low done', 'Normal done', 'High done']);
  assert.equal(archived.requests.length, 3);
});

test('task search collapses mixed spaces and tabs without changing saved titles or filters', async () => {
  const page = await projectPage();
  await page.select(page.completion, 'Open');
  await page.select(page.priority, 'Low');
  await saveDate(page, 1, '2024-02-29');
  await applyRange(page, '2024-02-01', '2024-02-29');
  const rename = page.rows()[0].querySelector('form');
  const title = 'MiXeD \t\t  Space\tTitle';
  rename.querySelector('input').value = title;
  await rename.trigger('submit');
  const saved = structuredClone(page.tasks);
  const requests = page.requests.length;
  for (const query of ['mixed space title', ' \tMIXED\t \tSPACE  TITLE\n', 'space\t\ttitle']) {
    await searchTasks(page, query);
    assert.deepEqual(page.titles(), [title]);
    assert.equal(page.rows()[0].querySelector('input').attributes['aria-label'], `Complete ${title}`);
  }
  await searchTasks(page, 'mixed\nspace');
  assert.deepEqual(page.titles(), []);
  await searchTasks(page, ' \t ');
  assert.deepEqual(page.titles(), [title]);
  assert.deepEqual(page.tasks, saved);
  assert.equal(page.requests.length, requests);
  assert.equal(page.completion.value, 'Open');
  assert.equal(page.priority.value, 'Low');
  assert.equal(page.app.querySelector('#due-from').value, '2024-02-01');
  assert.equal(page.app.querySelector('#due-through').value, '2024-02-29');
});

async function projectListPage() {
  const app = new Element('main');
  const projects = ['Alpha  Work', 'Other', 'ALPHA archived', 'ÄBC work', 'Alpha later'].map((name, index) => ({
    id: index + 1, name, archived: index === 2, totalCount: index + 2, completedCount: index,
  }));
  const requests = [];
  const navigation = [];
  runInNewContext(script, {
    isValidDueDate,
    document: { querySelector: () => app, createElement: tag => new Element(tag) },
    location: { pathname: '/', assign: path => navigation.push(path) },
    fetch: async (path, options) => {
      requests.push({ path, options });
      let data = projects;
      if (options?.method === 'PATCH') {
        data = projects.find(project => project.id === Number(path.split('/').at(-1)));
        Object.assign(data, JSON.parse(options.body));
      } else if (options?.method === 'POST') {
        data = { id: projects.length + 1, name: JSON.parse(options.body).name,
          archived: false, totalCount: 0, completedCount: 0 };
        projects.push(data);
      }
      return { ok: true, json: async () => structuredClone(data) };
    },
  });
  await new Promise(resolve => setImmediate(resolve));
  const rows = () => app.querySelector('#project-list').children;
  const names = () => rows().map(row => row.children[0].textContent);
  async function search(query) {
    app.querySelector('#project-search').value = query;
    await app.querySelector('#project-search-form').trigger('submit');
  }
  async function filter(value) {
    const control = app.querySelector('#project-filter');
    control.value = value;
    await control.trigger('change');
  }
  return { app, projects, requests, navigation, rows, names, search, filter };
}

test('project search intersects archive state, retains order and summaries, and resets on returning', async () => {
  const page = await projectListPage();
  assert.equal(page.app.querySelector('#project-search').value, '');
  const original = structuredClone(page.projects);
  await page.search(' \tAlPhA \n');
  assert.deepEqual(page.names(), ['Alpha  Work', 'Alpha later']);
  assert.deepEqual(page.rows().map(row => row.children[1].textContent), ['0/2 completed', '4/6 completed']);
  await page.filter('Archived');
  assert.deepEqual(page.names(), ['ALPHA archived']);
  await page.rows()[0].querySelectorAll('button')[1].trigger('click');
  assert.deepEqual(page.names(), []);
  await page.filter('Active');
  assert.deepEqual(page.names(), ['Alpha  Work', 'ALPHA archived', 'Alpha later']);
  assert.deepEqual(page.projects, original.map(project => ({ ...project, archived: false })));
  await page.search('alpha work');
  assert.deepEqual(page.names(), ['Alpha  Work']);
  await page.search('alpha  WORK');
  assert.deepEqual(page.names(), ['Alpha  Work']);
  await page.search('äbc');
  assert.deepEqual(page.names(), []);
  await page.search('Äbc');
  assert.deepEqual(page.names(), ['ÄBC work']);
  await page.search('alpha');
  const create = page.app.querySelector('form');
  create.querySelector('input').value = 'New unrelated project';
  await create.trigger('submit');
  assert.deepEqual(page.names(), ['Alpha  Work', 'ALPHA archived', 'Alpha later']);
  create.querySelector('input').value = 'Alpha newest';
  await create.trigger('submit');
  assert.deepEqual(page.names(), ['Alpha  Work', 'ALPHA archived', 'Alpha later', 'Alpha newest']);
  await page.search(' \t ');
  assert.equal(page.rows().length, 7);
  await page.rows()[0].querySelector('button').trigger('click');
  assert.deepEqual(page.navigation, ['/projects/1']);
  assert.equal(page.requests.length, 4);
  const reopened = await projectListPage();
  assert.equal(reopened.app.querySelector('#project-search').value, '');
  assert.deepEqual(reopened.names(), ['Alpha  Work', 'Other', 'ÄBC work', 'Alpha later']);
});

test('project search collapses mixed spaces and tabs and keeps original names', async () => {
  const page = await projectListPage();
  const create = page.app.querySelector('form');
  const name = 'MiXeD\t \tSpaces  Project';
  create.querySelector('input').value = name;
  await create.trigger('submit');
  const saved = structuredClone(page.projects);
  const requests = page.requests.length;
  for (const query of ['mixed spaces project', ' \tMIXED  SPACES\t\tPROJECT\n', 'spaces\t project']) {
    await page.search(query);
    assert.deepEqual(page.names(), [name]);
  }
  await page.filter('Archived');
  assert.deepEqual(page.names(), []);
  await page.filter('Active');
  assert.deepEqual(page.names(), [name]);
  await page.search('mixed\nspaces');
  assert.deepEqual(page.names(), []);
  await page.search('');
  assert.equal(page.names().at(-1), name);
  assert.deepEqual(page.projects, saved);
  assert.equal(page.requests.length, requests);
});

function notesForm(row) {
  return row.querySelectorAll('form').find(form => form.querySelector('textarea'));
}

async function saveNotes(page, row, text) {
  const form = notesForm(row);
  form.querySelector('textarea').value = text;
  await form.trigger('submit');
}

test('notes UI saves exact plain text and retains intersecting filters and search', async () => {
  const page = await projectPage();
  const form = notesForm(page.rows()[0]);
  const textarea = form.querySelector('textarea');
  assert.equal(textarea.value, '');
  assert.equal(form.querySelector('label').textContent, 'Task notes');
  assert.equal(form.querySelector('label').htmlFor, textarea.id);
  assert.equal(form.querySelector('button').textContent, 'Save notes');
  const notes = '  Unrelated keyword\n\tUnicode 日本語 🌱\n<script>literal markup</script>  \n';
  await saveNotes(page, page.rows()[0], notes);
  assert.equal(page.rows()[0].querySelector('textarea').value, notes);
  await searchTasks(page, 'Unrelated keyword');
  assert.deepEqual(page.titles(), []);
  await searchTasks(page, 'low');
  await page.select(page.completion, 'Open');
  await page.select(page.priority, 'Low');
  await saveDate(page, 1, '2024-02-29');
  await applyRange(page, '2024-02-01', '2024-02-29');
  const before = structuredClone(page.tasks);
  const summary = structuredClone(page.project);
  for (const value of [notes, ' \t\n ', '']) {
    await saveNotes(page, page.rows()[0], value);
    assert.deepEqual(page.titles(), ['Low open']);
    assert.deepEqual(page.tasks, before.map(task => task.id === 1 ? { ...task, notes: value } : task));
    assert.equal(page.rows()[0].querySelector('textarea').value, value);
    assert.equal(page.completion.value, 'Open');
    assert.equal(page.priority.value, 'Low');
    assert.equal(page.app.querySelector('#due-from').value, '2024-02-01');
    assert.equal(page.app.querySelector('#due-through').value, '2024-02-29');
    assert.equal(page.app.querySelector('#task-search').value, 'low');
    assert.deepEqual(page.project, summary);
    assert.deepEqual(JSON.parse(page.requests.at(-1).options.body), { notes: value });
  }
  const failed = notesForm(page.rows()[0]);
  failed.querySelector('textarea').value = 'Unsaved draft';
  page.rejectNext('Unable to complete request');
  await failed.trigger('submit');
  assert.equal(page.tasks[0].notes, '');
  assert.equal(failed.querySelector('textarea').value, 'Unsaved draft');
  assert.equal(failed.querySelector('button').disabled, false);
  assert.equal(page.app.querySelector('[role="alert"]').textContent, 'Unable to complete request');
});

test('archived notes remain visible and disabled; restoring enables editing', async () => {
  const savedNotes = '  Saved notes\n<b>literal</b>  ';
  const archived = await projectPage(true, undefined, savedNotes);
  const form = notesForm(archived.rows()[0]);
  assert.equal(form.querySelector('textarea').value, savedNotes);
  assert.equal(form.querySelector('textarea').disabled, true);
  assert.equal(form.querySelector('button').disabled, true);
  const count = archived.requests.length;
  await form.trigger('submit');
  assert.equal(archived.requests.length, count);
  await searchTasks(archived, 'Low');
  assert.deepEqual(archived.titles(), ['Low open', 'Low done']);
  const restored = await projectPage(false, undefined, savedNotes);
  const restoredForm = notesForm(restored.rows()[0]);
  assert.equal(restoredForm.querySelector('textarea').value, savedNotes);
  assert.equal(restoredForm.querySelector('textarea').disabled, false);
  assert.equal(restoredForm.querySelector('button').disabled, false);
  await saveNotes(restored, restored.rows()[0], 'Restored notes\n  ');
  assert.equal(restored.rows()[0].querySelector('textarea').value, 'Restored notes\n  ');
});

function deletionButton(row) {
  return row.querySelectorAll('button').find(button => ['Delete task', 'Restore task'].includes(button.textContent));
}

test('delete and restore keep filters, range and search and expose deleted rows read-only', async () => {
  const page = await projectPage();
  assert.deepEqual(page.completion.children.map(option => option.textContent), ['All', 'Open', 'Completed', 'Deleted']);
  const range = page.app.querySelector('#due-range');
  page.app.querySelector('#due-from').value = '0001-01-01';
  page.app.querySelector('#due-through').value = '0001-01-01';
  await range.trigger('submit');
  const search = page.app.querySelector('#task-search-form');
  page.app.querySelector('#task-search').value = '  SECOND\t high  ';
  await search.trigger('submit');
  await page.select(page.priority, 'High');
  await page.select(page.completion, 'Open');
  const original = structuredClone(page.tasks[6]);
  const assertSelections = () => {
    assert.equal(page.priority.value, 'High');
    assert.equal(page.app.querySelector('#due-from').value, '0001-01-01');
    assert.equal(page.app.querySelector('#due-through').value, '0001-01-01');
    assert.equal(page.app.querySelector('#task-search').value, '  SECOND\t high  ');
  };
  await deletionButton(page.rows()[0]).trigger('click');
  assert.deepEqual(page.titles(), []);
  assert.equal(page.completion.value, 'Open');
  assertSelections();
  for (const filter of ['All', 'Open', 'Completed']) {
    await page.select(page.completion, filter);
    assert.deepEqual(page.titles(), []);
  }
  await page.select(page.completion, 'Deleted');
  assert.deepEqual(page.titles(), ['Second high open']);
  assert.deepEqual(page.tasks[6], { ...original, deleted: true });
  const row = page.rows()[0];
  for (const tag of ['input', 'select', 'textarea']) {
    assert.ok(row.querySelectorAll(tag).every(control => control.disabled));
  }
  assert.ok(row.querySelectorAll('form').every(form => form.querySelector('button').disabled));
  assert.equal(deletionButton(row).textContent, 'Restore task');
  assert.equal(deletionButton(row).disabled, false);
  await page.select(page.priority, 'Low');
  assert.deepEqual(page.titles(), []);
  await page.select(page.priority, 'High');
  page.app.querySelector('#due-from').value = '0001-01-02';
  page.app.querySelector('#due-through').value = '';
  await range.trigger('submit');
  assert.deepEqual(page.titles(), []);
  page.app.querySelector('#due-from').value = '0001-01-01';
  page.app.querySelector('#due-through').value = '0001-01-01';
  await range.trigger('submit');
  page.app.querySelector('#task-search').value = 'not a match';
  await search.trigger('submit');
  assert.deepEqual(page.titles(), []);
  page.app.querySelector('#task-search').value = '  SECOND\t high  ';
  await search.trigger('submit');
  await deletionButton(page.rows()[0]).trigger('click');
  assert.deepEqual(page.titles(), []);
  assert.equal(page.completion.value, 'Deleted');
  assertSelections();
  await page.select(page.completion, 'Open');
  assert.deepEqual(page.titles(), ['Second high open']);
  assert.deepEqual(page.tasks[6], original);
  assert.ok(page.rows()[0].querySelectorAll('form').every(form => !form.querySelector('button').disabled));
});

test('deletion failures leave membership intact and archived projects disable both actions', async () => {
  const page = await projectPage();
  const originalTitles = page.titles();
  page.rejectNext('Unable to delete');
  await deletionButton(page.rows()[0]).trigger('click');
  assert.deepEqual(page.titles(), originalTitles);
  assert.equal(page.tasks[0].deleted, false);
  assert.equal(deletionButton(page.rows()[0]).disabled, false);
  assert.equal(page.app.querySelector('[role="alert"]').textContent, 'Unable to delete');
  await deletionButton(page.rows()[0]).trigger('click');
  await deletionButton(page.rows()[0]).trigger('click');
  await page.select(page.completion, 'Deleted');
  assert.deepEqual(page.titles(), ['Low open', 'Low done']);
  page.rejectNext('Unable to restore');
  await deletionButton(page.rows()[0]).trigger('click');
  assert.deepEqual(page.titles(), ['Low open', 'Low done']);
  await deletionButton(page.rows()[1]).trigger('click');
  await deletionButton(page.rows()[0]).trigger('click');
  await page.select(page.completion, 'All');
  assert.deepEqual(page.titles(), originalTitles);
  const archived = await projectPage(true, undefined, '', true);
  assert.equal(deletionButton(archived.rows()[0]).disabled, true);
  await archived.select(archived.completion, 'Deleted');
  assert.deepEqual(archived.titles(), ['Low open']);
  assert.equal(deletionButton(archived.rows()[0]).textContent, 'Restore task');
  assert.ok(archived.rows()[0].querySelectorAll('button').every(button => button.disabled));
  const requests = archived.requests.length;
  await deletionButton(archived.rows()[0]).trigger('click');
  assert.equal(archived.requests.length, requests);
  for (const id of ['task-filter', 'priority-filter', 'due-range', 'task-search-form']) {
    const control = archived.app.querySelector(`#${id}`);
    assert.equal(control.disabled, false);
  }
});
