import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// Exercise the shipped browser script with a small DOM adapter and controlled
// requests. No browser package or application dependency is required.
class Element {
  constructor(tag, root = false) {
    this.tag = tag;
    this.root = root;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.value = '';
    this.textContent = '';
  }
  get isConnected() { return this.root || Boolean(this.parent?.isConnected); }
  append(...children) {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }
  replaceChildren(...children) {
    for (const child of this.children) child.parent = undefined;
    this.children = [];
    this.append(...children);
  }
  set innerHTML(html) {
    this.replaceChildren();
    const stack = [this];
    for (const token of html.match(/<[^>]+>|[^<]+/g) || []) {
      if (token.startsWith('</')) {
        stack.pop();
      } else if (token.startsWith('<')) {
        const tag = token.match(/^<(\w+)/)[1];
        const element = new Element(tag);
        for (const match of token.matchAll(/([\w-]+)="([^"]*)"/g)) {
          element.setAttribute(match[1], match[2]);
        }
        element.disabled = /\sdisabled[\s>]/.test(token);
        element.hidden = /\shidden[\s>]/.test(token);
        stack.at(-1).append(element);
        if (tag !== 'input') stack.push(element);
      } else {
        stack.at(-1).textContent += token.trim();
      }
    }
    const select = this.querySelector('select');
    if (select) select.value = select.children[0].textContent;
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  querySelector(selector) {
    for (const child of this.children) {
      if (selector.startsWith('#') ? child.attributes.id === selector.slice(1) :
          selector === '[role="alert"]' ? child.attributes.role === 'alert' : child.tag === selector) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  async emit(name) { await this.listeners[name]?.({ preventDefault() {} }); }
  focus() {}
}

const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const settled = () => new Promise(resolve => setImmediate(resolve));

async function browser(storage, projects, pending = {}) {
  const tasks = pending.tasks || [{ id: 1, title: 'Saved task', completed: true }];
  const app = new Element('main', true);
  const location = { pathname: '/' };
  const document = {
    querySelector: () => app,
    createElement: tag => new Element(tag),
  };
  runInNewContext(source, {
    document, location,
    history: { pushState(_state, _title, path) { location.pathname = path; } },
    window: { addEventListener() {} },
    sessionStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    fetch: async (path, options) => {
      let result;
      if (options?.method === 'PATCH') {
        if (pending.wait) await pending.wait;
        const taskMatch = path.match(/\/tasks\/(\d+)$/);
        const item = taskMatch ? tasks.find(task => task.id === Number(taskMatch[1])) :
          projects.find(project => path === `/api/projects/${project.id}`);
        Object.assign(item, JSON.parse(options.body));
        result = { ...item };
      } else if (path === '/api/projects') {
        result = projects.map(item => ({ ...item }));
      } else if (path.endsWith('/tasks')) {
        result = tasks.map(task => ({ ...task }));
      } else {
        result = { ...projects.find(item => path === `/api/projects/${item.id}`) };
      }
      return { ok: true, json: async () => result };
    },
  });
  await settled();
  return app;
}

function rows(app) { return app.querySelector('ul').children; }
function control(row, label) { return row.children.find(child => child.textContent === label); }
async function filter(app, value) {
  app.querySelector('select').value = value;
  await app.querySelector('select').emit('change');
}
const project = () => ({ id: 1, name: 'Archive lifecycle', archived: false, total_count: 1, completed_count: 1 });

test('archive and restore update the list even if the filter changes before the request finishes', async () => {
  const projects = [project()];
  let release;
  const pending = { wait: new Promise(resolve => { release = resolve; }) };
  const app = await browser(new Map(), projects, pending);
  assert.equal(app.querySelector('select').value, 'Active');
  const archive = control(rows(app)[0], 'Archive project').emit('click');
  await filter(app, 'Archived');
  assert.equal(rows(app).length, 0);
  release();
  await archive;
  assert.equal(rows(app).length, 1);
  assert.equal(control(rows(app)[0], '1/1 completed').dataset.testid, 'project-summary');
  pending.wait = new Promise(resolve => { release = resolve; });
  const restore = control(rows(app)[0], 'Restore project').emit('click');
  await filter(app, 'Active');
  assert.equal(rows(app).length, 0);
  release();
  await restore;
  assert.equal(rows(app).length, 1);
  assert.ok(control(rows(app)[0], 'Archive project'));
});

test('Archived filter survives reload and opening a read-only project then returning to Projects', async () => {
  const storage = new Map();
  const projects = [{ ...project(), archived: true }];
  let app = await browser(storage, projects);
  assert.equal(app.querySelector('select').value, 'Active');
  assert.equal(rows(app).length, 0);
  await filter(app, 'Archived');
  assert.equal(rows(app).length, 1);
  app = await browser(storage, projects);
  assert.equal(app.querySelector('select').value, 'Archived');
  assert.equal(rows(app).length, 1);
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  assert.equal(app.querySelector('h1').textContent, projects[0].name);
  assert.equal(app.querySelector('#archive-status').hidden, false);
  assert.equal(app.querySelector('#new-project-name').disabled, true);
  assert.equal(app.querySelector('#rename-form').querySelector('button').disabled, true);
  assert.equal(app.querySelector('form').querySelector('button').disabled, true);
  assert.equal(rows(app)[0].querySelector('input').disabled, true);
  assert.equal(rows(app)[0].querySelector('form').querySelector('input').disabled, true);
  assert.equal(rows(app)[0].querySelector('form').querySelector('button').disabled, true);
  await app.querySelector('#projects').emit('click');
  await settled();
  assert.equal(app.querySelector('select').value, 'Archived');
  assert.equal(rows(app).length, 1);
  await control(rows(app)[0], 'Restore project').emit('click');
  await filter(app, 'Active');
  assert.equal(rows(app).length, 1);
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  assert.equal(app.querySelector('form').querySelector('button').disabled, false);
  assert.equal(app.querySelector('#new-project-name').disabled, false);
  assert.equal(app.querySelector('#rename-form').querySelector('button').disabled, false);
  assert.equal(rows(app)[0].querySelector('input').disabled, false);
  assert.equal(rows(app)[0].querySelector('input').checked, true);
  assert.equal(rows(app)[0].querySelector('form').querySelector('input').disabled, false);
  assert.equal(rows(app)[0].querySelector('form').querySelector('button').disabled, false);
  await app.querySelector('#projects').emit('click');
  await settled();
  assert.equal(app.querySelector('select').value, 'Active');
});

test('rename validates input and updates the heading and list while preserving tasks', async () => {
  const projects = [project(), { ...project(), id: 2, name: 'Second project' }];
  const app = await browser(new Map(), projects);
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  const form = app.querySelector('#rename-form');
  const input = app.querySelector('#new-project-name');
  const savedRow = rows(app)[0];
  input.value = ' \t\n ';
  await form.emit('submit');
  assert.equal(app.querySelector('[role="alert"]').textContent, 'Project name is required');
  assert.equal(app.querySelector('[role="alert"]').hidden, false);
  assert.equal(app.querySelector('h1').textContent, 'Archive lifecycle');
  input.value = '  New project name  ';
  await form.emit('submit');
  assert.equal(app.querySelector('h1').textContent, 'New project name');
  assert.equal(app.querySelector('[role="alert"]').hidden, true);
  assert.equal(rows(app)[0], savedRow);
  assert.equal(savedRow.querySelector('input').checked, true);
  await app.querySelector('#projects').emit('click');
  await settled();
  assert.equal(rows(app)[0].children[0].textContent, 'New project name');
  assert.equal(rows(app)[1].children[0].textContent, 'Second project');
  assert.ok(control(rows(app)[0], '1/1 completed'));
});

test('task rename validates, preserves ordering and filter membership, and updates completion labels', async () => {
  const projects = [project()];
  const pending = { tasks: [
    { id: 1, title: 'Completed original', completed: true },
    { id: 2, title: 'Open original', completed: false },
  ] };
  let app = await browser(new Map(), projects, pending);
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  const form = rows(app)[0].querySelector('form');
  const input = form.querySelector('input');
  assert.equal(input.attributes['aria-label'], 'New task title');
  input.value = ' \t\n ';
  await form.emit('submit');
  assert.equal(app.querySelector('[role="alert"]').textContent, 'Task title is required');
  assert.equal(app.querySelector('[role="alert"]').hidden, false);
  assert.equal(rows(app)[0].children[0].textContent, 'Completed original');
  input.value = '  Completed renamed  ';
  await form.emit('submit');
  assert.equal(app.querySelector('[role="alert"]').hidden, true);
  assert.equal(rows(app)[0].children[0].textContent, 'Completed renamed');
  assert.equal(rows(app)[0].querySelector('input').attributes['aria-label'], 'Complete Completed renamed');
  assert.equal(rows(app)[0].querySelector('input').checked, true);
  assert.equal(rows(app)[1].children[0].textContent, 'Open original');
  await filter(app, 'Open');
  assert.equal(rows(app).length, 1);
  const openForm = rows(app)[0].querySelector('form');
  openForm.querySelector('input').value = '  Open renamed  ';
  await openForm.emit('submit');
  assert.equal(app.querySelector('select').value, 'Open');
  assert.equal(rows(app).length, 1);
  assert.equal(rows(app)[0].children[0].textContent, 'Open renamed');
  assert.equal(rows(app)[0].querySelector('input').checked, false);
  await filter(app, 'Completed');
  assert.equal(rows(app).length, 1);
  assert.equal(rows(app)[0].children[0].textContent, 'Completed renamed');
  app = await browser(new Map(), projects, pending);
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  assert.equal(app.querySelector('select').value, 'All');
  assert.deepEqual(rows(app).map(row => row.children[0].textContent), ['Completed renamed', 'Open renamed']);
  assert.equal(rows(app)[0].querySelector('input').checked, true);
  assert.equal(rows(app)[1].querySelector('input').checked, false);
});
