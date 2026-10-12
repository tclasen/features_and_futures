import test from 'node:test';
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
    return this.selectedValue ?? (this.tagName === 'select' ? this.children[0]?.textContent : '') ?? '';
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
async function projectPage(archived = false) {
  const app = new Element('main');
  const tasks = [];
  for (const priority of ['Low', 'Normal', 'High']) {
    for (const completed of [false, true]) {
      tasks.push({ id: tasks.length + 1, title: `${priority} ${completed ? 'done' : 'open'}`, completed, priority, dueDate: '' });
    }
  }
  tasks.push({ id: 7, title: 'Second high open', completed: false, priority: 'High', dueDate: '0001-01-01' });
  const requests = [];
  let nextError;
  const project = { id: 1, name: 'Project', archived, defaultPriority: 'Normal', totalCount: 7, completedCount: 3 };
  const context = {
    document: { querySelector: () => app, createElement: tag => new Element(tag) },
    location: { pathname: '/projects/1' },
    fetch: async (path, options) => {
      requests.push({ path, options });
      if (nextError) {
        const error = nextError;
        nextError = undefined;
        return { ok: false, json: async () => ({ error }) };
      }
      let data;
      if (options?.method === 'PATCH') {
        const target = path.includes('/tasks/') ? tasks.find(task => task.id === Number(path.split('/').at(-1))) : project;
        Object.assign(target, JSON.parse(options.body));
        data = target;
      } else if (path.endsWith('/tasks')) data = tasks;
      else data = project;
      return { ok: true, json: async () => structuredClone(data) };
    },
  };
  runInNewContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  const completion = app.querySelector('#task-filter');
  const priority = app.querySelector('#priority-filter');
  const rows = () => app.querySelector('#task-list').children;
  const titles = () => rows().map(row => row.children[0].textContent);
  async function select(element, value) { element.value = value; await element.trigger('change'); }
  return { app, tasks, project, requests, completion, priority, rows, titles, select,
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
