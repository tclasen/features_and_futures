import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

// Exercise the browser script without external dependencies. This small DOM
// supports its labels, rows, and events; it does not verify browser layout.
class Element {
  constructor(tag) {
    this.tag = tag;
    this.attributes = {};
    this.children = [];
    this.listeners = new Map();
    this.value = '';
    this.disabled = false;
    this.checked = false;
    this.text = '';
  }
  set textContent(value) { this.text = value; this.children = []; }
  get textContent() { return this.text + this.children.map((child) => child.textContent).join(''); }
  setAttribute(name, value) {
    this.attributes[name] = value;
    if (name === 'value') this.value = value;
  }
  append(...children) {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
      if (this.tag === 'select' && this.children.length === 1) this.value = child.value;
    }
  }
  replaceChildren(...children) { this.text = ''; this.children = []; this.append(...children); }
  remove() { this.parent.children = this.parent.children.filter((child) => child !== this); }
  focus() {}
  addEventListener(event, handler) { this.listeners.set(event, handler); }
  async fire(event) {
    if (!this.disabled) await this.listeners.get(event)?.({ preventDefault() {} });
  }
  querySelector(selector) {
    assert.equal(selector, '[role="alert"]');
    return find(this, (node) => node.attributes.role === 'alert')[0] || null;
  }
}

function find(root, predicate) {
  return [root, ...root.children.flatMap((child) => find(child, () => true))].filter(predicate);
}

async function page(pathname, respond) {
  const app = new Element('main');
  const window = { location: { pathname, href: pathname } };
  const document = { createElement: (tag) => new Element(tag), querySelector: () => app };
  const calls = [];
  const fetch = async (path, options) => {
    calls.push({ path, options });
    const body = await respond(path, options);
    return { ok: true, json: async () => body };
  };
  await runInNewContext(`(async () => {\n${source}\n})()`, { document, window, fetch });
  return {
    app, window, calls,
    byId: (id) => find(app, (node) => node.attributes.id === id)[0],
    button: (text) => find(app, (node) => node.tag === 'button' && node.textContent === text)[0],
    rows: (type) => find(app, (node) => node.attributes['data-testid'] === `${type}-row`),
  };
}

test('project UI defaults to active and moves rows on archive and restore', async () => {
  const project = { id: 1, name: 'Alpha', archived: false, completedCount: 1, totalCount: 2 };
  const archived = { id: 2, name: 'Beta', archived: true, completedCount: 0, totalCount: 0 };
  const ui = await page('/', (path, options) => {
    if (!options) return [project, archived];
    assert.equal(options.method, 'PATCH');
    const target = path === '/api/projects/1' ? project : archived;
    return { ...target, ...JSON.parse(options.body) };
  });
  assert.equal(find(ui.app, (node) => node.tag === 'h1')[0].textContent, 'Workboard');
  const filter = ui.byId('project-filter');
  assert.equal(filter.value, 'Active');
  assert.deepEqual(filter.children.map((option) => option.textContent), ['Active', 'Archived']);
  assert.equal(find(ui.app, (node) => node.attributes.for === 'project-filter')[0].textContent, 'Project filter');
  assert.equal(ui.rows('project').length, 1);
  assert.equal(find(ui.rows('project')[0], (node) => node.attributes['data-testid'] === 'project-summary')[0].textContent, '1/2 completed');
  ui.byId('project-name').value = '   ';
  await find(ui.app, (node) => node.tag === 'form')[0].fire('submit');
  assert.equal(ui.app.querySelector('[role="alert"]').textContent, 'Project name is required');
  assert.equal(ui.calls.length, 1);
  await ui.button('Archive project').fire('click');
  assert.equal(ui.rows('project').length, 0);
  filter.value = 'Archived';
  await filter.fire('change');
  assert.equal(ui.rows('project').length, 2);
  assert.match(ui.rows('project')[0].textContent, /Alpha/);
  assert.match(ui.rows('project')[1].textContent, /Beta/);
  await ui.button('Open project').fire('click');
  assert.equal(ui.window.location.href, '/projects/1');
  await ui.button('Restore project').fire('click');
  assert.equal(ui.rows('project').length, 1);
  filter.value = 'Active';
  await filter.fire('change');
  assert.equal(ui.rows('project').length, 1);
  assert.match(ui.rows('project')[0].textContent, /Alpha/);
});

test('archived project UI shows saved tasks and keeps controls disabled through filtering', async () => {
  const project = { id: 1, name: 'Archived Alpha', archived: true };
  const tasks = [
    { id: 1, title: 'Done task', completed: true },
    { id: 2, title: 'Open task', completed: false },
  ];
  const ui = await page('/projects/1', (path) => path.endsWith('/tasks') ? tasks : project);
  assert.equal(find(ui.app, (node) => node.tag === 'h1')[0].textContent, project.name);
  assert.ok(find(ui.app, (node) => node.tag === 'p' && node.textContent === 'Archived project').length);
  assert.equal(ui.button('Create task').disabled, true);
  assert.equal(ui.byId('new-project-name').disabled, true);
  assert.equal(ui.button('Rename project').disabled, true);
  ui.byId('new-project-name').value = 'Cannot rename';
  await find(ui.app, (node) => node.tag === 'form' && node.attributes.class === 'project-rename')[0].fire('submit');
  assert.equal(find(ui.app, (node) => node.attributes.for === 'task-title')[0].textContent, 'Task title');
  const filter = ui.byId('task-filter');
  assert.equal(filter.value, 'All');
  assert.deepEqual(filter.children.map((option) => option.textContent), ['All', 'Open', 'Completed']);
  for (const [value, titles] of [['All', ['Done task', 'Open task']], ['Open', ['Open task']], ['Completed', ['Done task']]]) {
    filter.value = value;
    await filter.fire('change');
    assert.deepEqual(ui.rows('task').map((row) => row.textContent), titles);
    for (const row of ui.rows('task')) {
      const checkbox = find(row, (node) => node.attributes.type === 'checkbox')[0];
      assert.equal(checkbox.disabled, true);
      assert.equal(checkbox.attributes['aria-label'], `Complete ${row.textContent}`);
      assert.equal(checkbox.checked, row.textContent === 'Done task');
    }
  }
  ui.byId('task-title').value = 'Cannot create';
  await find(ui.app, (node) => node.tag === 'form' && node.children.some((child) => child.attributes.id === 'task-title'))[0].fire('submit');
  assert.equal(ui.calls.length, 2);
  await ui.button('Projects').fire('click');
  assert.equal(ui.window.location.href, '/');
});

test('active project UI validates and trims renames without changing its URL or tasks', async () => {
  const project = { id: 1, name: 'Original', archived: false };
  const tasks = [{ id: 1, title: 'Saved task', completed: true }];
  const ui = await page('/projects/1', (path, options) => {
    if (!options) return path.endsWith('/tasks') ? tasks : project;
    assert.equal(path, '/api/projects/1');
    assert.equal(options.method, 'PATCH');
    assert.deepEqual(JSON.parse(options.body), { name: 'New name' });
    return { ...project, name: 'New name' };
  });
  const input = ui.byId('new-project-name');
  const form = find(ui.app, (node) => node.tag === 'form' && node.attributes.class === 'project-rename')[0];
  assert.equal(find(ui.app, (node) => node.attributes.for === 'new-project-name')[0].textContent, 'New project name');
  assert.equal(input.disabled, false);
  assert.equal(ui.button('Rename project').disabled, false);
  input.value = ' \t\n ';
  await form.fire('submit');
  assert.equal(ui.app.querySelector('[role="alert"]').textContent, 'Project name is required');
  assert.equal(find(ui.app, (node) => node.tag === 'h1')[0].textContent, 'Original');
  assert.equal(ui.calls.length, 2);
  input.value = '  New name \n';
  await form.fire('submit');
  assert.equal(find(ui.app, (node) => node.tag === 'h1')[0].textContent, 'New name');
  assert.equal(input.value, 'New name');
  assert.equal(ui.app.querySelector('[role="alert"]'), null);
  assert.equal(ui.window.location.href, '/projects/1');
  assert.deepEqual(ui.rows('task').map((row) => row.textContent), ['Saved task']);
  assert.equal(find(ui.rows('task')[0], (node) => node.attributes.type === 'checkbox')[0].checked, true);
});
