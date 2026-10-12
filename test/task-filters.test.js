import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// A small DOM adapter exercises the actual application event handlers without
// adding browser or application dependencies. It supports the markup used here.
class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.listeners = {};
    this.value = '';
    this.disabled = false;
  }
  append(...children) {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
      if (this.tag === 'select' && this.children.length === 1) this.value = child.value;
    }
  }
  replaceChildren() { this.children = []; }
  setAttribute(key, value) { this.attributes[key] = value; }
  remove() { this.parent.children = this.parent.children.filter((child) => child !== this); }
  focus() {}
  addEventListener(event, listener) { this.listeners[event] = listener; }
  async fire(event) { await this.listeners[event]?.({ preventDefault() {} }); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  querySelectorAll(selector) {
    const matches = (element) => selector.startsWith('#') ? element.id === selector.slice(1)
      : selector === '[role="alert"]' ? element.attributes.role === 'alert'
      : element.tag === selector;
    return this.children.flatMap((child) => [
      ...(matches(child) ? [child] : []), ...child.querySelectorAll(selector),
    ]);
  }
  set innerHTML(markup) {
    this.replaceChildren();
    const stack = [this];
    for (const token of markup.match(/<[^>]+>|[^<]+/g) ?? []) {
      if (token.startsWith('</')) { stack.pop(); continue; }
      if (!token.startsWith('<')) {
        stack.at(-1).textContent = (stack.at(-1).textContent ?? '') + token.trim();
        continue;
      }
      const tag = token.match(/^<(\w+)/)[1];
      const element = new Element(tag);
      for (const [, key, value] of token.matchAll(/([\w-]+)="([^"]*)"/g)) {
        element.setAttribute(key, value);
        if (['id', 'value', 'type'].includes(key)) element[key] = value;
        if (key === 'for') element.htmlFor = value;
      }
      element.disabled = /\sdisabled(?:\s|>)/.test(token);
      stack.at(-1).append(element);
      if (tag !== 'input') stack.push(element);
    }
  }
}

async function projectPage(archived = false) {
  const project = { id: 1, name: 'Project', archived, total: 6, completed: 3, default_priority: 'Normal' };
  const tasks = ['Low', 'Normal', 'High'].flatMap((priority, index) => [
    { id: index * 2 + 1, title: `${priority} open`, completed: false, priority },
    { id: index * 2 + 2, title: `${priority} completed`, completed: true, priority },
  ]);
  const app = new Element('main');
  const document = { querySelector: () => app, createElement: (tag) => new Element(tag) };
  const writes = [];
  const fetch = async (path, options) => {
    if (options) {
      assert.equal(archived, false, 'Archived controls must not write task data');
      const change = JSON.parse(options.body);
      if (Object.hasOwn(change, 'default_priority')) {
        writes.push(change);
        Object.assign(project, change);
        return { ok: true, json: async () => structuredClone(project) };
      }
      const task = tasks.find((task) => task.id === Number(path.split('/').at(-1)));
      if (change.title !== undefined) change.title = change.title.trim();
      writes.push(change);
      Object.assign(task, change);
      return { ok: true, json: async () => structuredClone(task) };
    }
    return { ok: true, json: async () => structuredClone(path.endsWith('/tasks') ? tasks : project) };
  };
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  await runInNewContext(source, {
    document, fetch, window: { location: { pathname: '/projects/1' } },
  });
  const completion = app.querySelector('#task-filter');
  const priority = app.querySelector('#priority-filter');
  const rows = () => app.querySelector('#tasks').children;
  const titles = () => rows().map((row) => row.children[0].textContent);
  const select = async (element, value) => { element.value = value; await element.fire('change'); };
  return { app, completion, priority, rows, titles, select, tasks, writes, project };
}

test('completion and priority filters intersect in creation order, including archived projects', async () => {
  for (const archived of [false, true]) {
    const page = await projectPage(archived);
    const { app, completion, priority, select, titles, tasks, rows } = page;
    assert.equal(completion.value, 'all');
    assert.equal(priority.value, 'all');
    assert.deepEqual(priority.children.map((option) => option.textContent), ['All', 'Low', 'Normal', 'High']);
    assert.equal(app.querySelectorAll('label').find((label) => label.htmlFor === 'priority-filter').textContent, 'Priority filter');
    for (const completed of ['all', 'open', 'completed']) {
      await select(completion, completed);
      for (const prioritized of ['all', 'Low', 'Normal', 'High']) {
        await select(priority, prioritized);
        assert.equal(completion.value, completed);
        assert.deepEqual(titles(), tasks.filter((task) =>
          (completed === 'all' || task.completed === (completed === 'completed')) &&
          (prioritized === 'all' || task.priority === prioritized)).map((task) => task.title));
        for (const row of rows()) {
          assert.equal(row.dataset.testid, 'task-row');
          assert.equal(row.querySelector('select').disabled, archived);
          assert.equal(row.querySelector('input').disabled, archived);
          assert.equal(row.querySelector('form').querySelector('input').disabled, archived);
          assert.equal(row.querySelector('form').querySelector('button').disabled, archived);
        }
      }
      await select(completion, 'all');
      assert.equal(priority.value, 'High');
    }
    assert.equal(completion.disabled, false);
    assert.equal(priority.disabled, false);
    assert.deepEqual(page.writes, []);
    assert.deepEqual(page.project, { id: 1, name: 'Project', archived, total: 6, completed: 3, default_priority: 'Normal' });
  }
});

test('default priority saves without changing filters or existing rows and is disabled when archived', async () => {
  for (const archived of [false, true]) {
    const { app, select, completion, priority, titles, tasks, project, writes } = await projectPage(archived);
    const defaultPriority = app.querySelector('#default-task-priority');
    assert.equal(app.querySelectorAll('label').find((label) => label.htmlFor === defaultPriority.id).textContent, 'Default task priority');
    assert.deepEqual(defaultPriority.children.map((option) => option.textContent), ['Low', 'Normal', 'High']);
    assert.equal(defaultPriority.value, 'Normal');
    assert.equal(defaultPriority.disabled, archived);
    await select(completion, 'completed');
    await select(priority, 'Low');
    const before = structuredClone(tasks);
    if (archived) {
      await defaultPriority.fire('change');
      assert.deepEqual(writes, []);
    } else {
      await select(defaultPriority, 'High');
      assert.deepEqual(writes, [{ default_priority: 'High' }]);
      assert.equal(project.default_priority, 'High');
      assert.equal(defaultPriority.value, 'High');
    }
    assert.equal(defaultPriority.disabled, archived);
    assert.equal(completion.value, 'completed');
    assert.equal(priority.value, 'Low');
    assert.deepEqual(titles(), ['Low completed']);
    assert.deepEqual(tasks, before);
    assert.equal(project.completed, 3);
    assert.equal(project.total, 6);
  }
});

test('task edits re-evaluate both filters and renaming preserves selections and membership', async () => {
  const page = await projectPage();
  const { app, completion, priority, select, titles, rows, tasks } = page;
  await select(completion, 'open');
  await select(priority, 'Low');
  assert.deepEqual(titles(), ['Low open']);
  const rowPriority = rows()[0].querySelector('select');
  await select(rowPriority, 'High');
  assert.deepEqual(titles(), []);
  assert.equal(app.querySelector('#empty-tasks').hidden, false);
  assert.equal(completion.value, 'open');
  assert.equal(priority.value, 'Low');
  assert.deepEqual(tasks[0], { id: 1, title: 'Low open', completed: false, priority: 'High' });
  await select(priority, 'High');
  assert.deepEqual(titles(), ['Low open', 'High open']);
  const checkbox = rows()[0].querySelector('input');
  checkbox.checked = true;
  await checkbox.fire('change');
  assert.deepEqual(titles(), ['High open']);
  assert.equal(completion.value, 'open');
  assert.equal(priority.value, 'High');
  await select(completion, 'completed');
  assert.deepEqual(titles(), ['Low open', 'High completed']);
  const rename = rows()[0].querySelector('form');
  rename.querySelector('input').value = '  Renamed task  ';
  await rename.fire('submit');
  assert.deepEqual(titles(), ['Renamed task', 'High completed']);
  assert.equal(rows()[0].querySelector('input').attributes['aria-label'], 'Complete Renamed task');
  assert.equal(completion.value, 'completed');
  assert.equal(priority.value, 'High');
  assert.deepEqual(tasks[0], { id: 1, title: 'Renamed task', completed: true, priority: 'High' });
  assert.deepEqual(page.writes, [{ priority: 'High' }, { completed: true }, { title: 'Renamed task' }]);
});
