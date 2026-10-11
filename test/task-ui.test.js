import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { setImmediate } from 'node:timers/promises';
import { filterTasks, normalizeDueRange } from '../public/task-filters.js';
import { filterProjects, normalizeSearchQuery } from '../public/search.js';

// A small DOM surface runs the real app's event handlers without browser dependencies.
class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.listeners = {};
    this.value = '';
    this.disabled = false;
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  focus() {}
  async emit(name) { await this.listeners[name]?.({ preventDefault() {} }); }
  querySelector(selector) { return this.querySelectorAll(selector)[0]; }
  querySelectorAll(selector) {
    const matches = (element) => selector.startsWith('#')
      ? element.id === selector.slice(1)
      : selector.startsWith('[')
        ? element.attributes.role === 'alert'
        : element.tagName === selector;
    return this.children.flatMap((child) => [
      ...(matches(child) ? [child] : []), ...child.querySelectorAll(selector),
    ]);
  }
  set innerHTML(html) {
    this.children = [];
    const stack = [this];
    for (const token of html.match(/<[^>]+>|[^<]+/g) || []) {
      if (token.startsWith('</')) { stack.pop(); continue; }
      if (!token.startsWith('<')) {
        stack.at(-1).textContent = token.trim();
        continue;
      }
      const tag = token.match(/^<(\w+)/)[1];
      const element = new Element(tag);
      for (const match of token.matchAll(/([\w-]+)="([^"]*)"/g)) {
        element.setAttribute(match[1], match[2]);
        if (match[1] === 'id' || match[1] === 'value') element[match[1]] = match[2];
      }
      element.disabled = /\sdisabled(?:\s|>)/.test(token);
      const parent = stack.at(-1);
      parent.append(element);
      if (tag === 'option' && parent.children.length === 1) parent.value = element.value;
      if (!['input', 'br'].includes(tag)) stack.push(element);
    }
  }
}

async function openProject() {
  const app = new Element('main');
  const project = { id: 1, name: 'Source', archived: false, default_task_priority: 'Normal' };
  let task = { id: 1, title: 'Hit one', completed: false, priority: 'Normal', due_date: '', notes: '', deleted: false };
  let releasePriority;
  const pendingPriority = new Promise((resolve) => { releasePriority = resolve; });
  let releaseCompletion;
  const pendingCompletion = new Promise((resolve) => { releaseCompletion = resolve; });
  const fetch = async (path, options) => {
    let body;
    if (!options) {
      body = path === '/api/projects/1' ? project
        : path === '/api/projects' ? [project] : [task];
    } else {
      const change = JSON.parse(options.body);
      task = { ...task, ...change };
      body = structuredClone(task);
      if (path.endsWith('/priority')) await pendingPriority;
      if (path === '/api/projects/1/tasks/1') await pendingCompletion;
    }
    return { ok: true, json: async () => structuredClone(body) };
  };
  const document = {
    createElement: (tag) => new Element(tag),
    querySelector: (selector) => selector === '#app' ? app : app.querySelector(selector),
  };
  const source = (await readFile(new URL('../public/app.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\n/gm, '');
  runInNewContext(source, {
    document, location: { pathname: '/projects/1' }, fetch,
    filterTasks, normalizeDueRange, filterProjects, normalizeSearchQuery,
  });
  await setImmediate();
  const row = () => app.querySelector('#tasks').children[0];
  const control = (label, element = row()) => element.querySelectorAll('label')
    .map((candidate) => candidate.textContent === label ? element.querySelector(`#${candidate.htmlFor}`) : null)
    .find(Boolean);
  return { app, row, control, releasePriority, releaseCompletion, savedTask: () => task };
}

test('pending priority save preserves due-date drafts and deleted filter intersections', async () => {
  const { app, row, control, releasePriority, savedTask } = await openProject();
  const originalRow = row();
  const priority = control('Task priority');
  priority.value = 'High';
  const savingPriority = priority.emit('change');
  const dueDate = control('Task due date');
  dueDate.value = '2026-10-11';
  releasePriority();
  await savingPriority;
  assert.equal(control('Task due date').value, '2026-10-11', 'a completed priority edit must not discard a date being entered');
  assert.equal(row(), originalRow, 'unrelated saves retain the row and its handlers');
  await row().querySelectorAll('form').find((form) => form.className === 'task-due-date').emit('submit');
  assert.equal(savedTask().due_date, '2026-10-11');
  await row().querySelectorAll('button').find((button) => button.textContent === 'Delete task').emit('click');
  const filter = app.querySelector('#task-filter');
  filter.value = 'deleted';
  await filter.emit('change');
  const priorityFilter = app.querySelector('#priority-filter');
  priorityFilter.value = 'High';
  await priorityFilter.emit('change');
  app.querySelector('#due-from').value = '2026-10-11';
  app.querySelector('#due-through').value = '2026-10-11';
  await app.querySelector('#due-range').emit('submit');
  app.querySelector('#task-search').value = ' hit ';
  await app.querySelector('#task-search-form').emit('submit');
  assert.equal(row().querySelector('input').attributes['aria-label'], 'Complete Hit one');
  assert.equal(control('Task due date').value, '2026-10-11');
  assert.equal(control('Task due date').disabled, true);
  assert.equal(filter.value, 'deleted');
  await row().querySelectorAll('button').find((button) => button.textContent === 'Restore task').emit('click');
  assert.equal(app.querySelector('#tasks').children.length, 0);
  assert.equal(filter.value, 'deleted');
});

test('a delayed completion response cannot undo a newer deletion in the UI', async () => {
  const { app, row, releaseCompletion, savedTask } = await openProject();
  const checkbox = row().querySelector('input');
  checkbox.checked = true;
  const savingCompletion = checkbox.emit('change');
  await row().querySelectorAll('button').find((button) => button.textContent === 'Delete task').emit('click');
  releaseCompletion();
  await savingCompletion;
  assert.equal(app.querySelector('#tasks').children.length, 0);
  const filter = app.querySelector('#task-filter');
  filter.value = 'deleted';
  await filter.emit('change');
  assert.equal(savedTask().deleted, true);
  assert.equal(row().querySelector('input').checked, true);
  assert.equal(row().querySelector('input').disabled, true);
  assert.ok(row().querySelectorAll('button').find((button) => button.textContent === 'Restore task'));
});
