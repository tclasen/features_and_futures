import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// Minimal DOM adapter runs the actual browser entry point without dependencies.
class Node {
  constructor(tag, text = '') {
    this.tag = tag;
    this.textContent = text;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.value = '';
  }
  append(...nodes) {
    this.children.push(...nodes);
    for (const node of nodes) node.parent = this;
    if (this.tag === 'select' && !this.value) this.value = this.children[0].value;
  }
  prepend(node) { this.children.unshift(node); node.parent = this; }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(event, listener) { this.listeners[event] = listener; }
  async fire(event) { await this.listeners[event]?.({ preventDefault() {} }); }
  focus() {}
  remove() { this.parent.children = this.parent.children.filter(node => node !== this); }
  querySelector(selector) {
    return this.all().find(node => selector === '[role="alert"]' && node.attributes.role === 'alert');
  }
  all() { return [this, ...this.children.flatMap(node => node.all())]; }
}

async function page(archived = false) {
  const app = new Node('main');
  const tasks = [
    { id: 1, title: 'First', completed: false, priority: 'High' },
    { id: 2, title: 'Second', completed: true, priority: 'Low' },
    { id: 3, title: 'Third', completed: false, priority: 'Normal' },
    { id: 4, title: 'Fourth', completed: true, priority: 'High' },
  ];
  const writes = [];
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  await runInNewContext(`(async () => { ${source} })()`, {
    document: { querySelector: () => app, createElement: tag => new Node(tag) },
    window: { location: { pathname: '/projects/1' } },
    fetch: async (path, options) => {
      let data;
      if (options?.method === 'PATCH') {
        const task = tasks.find(task => task.id === Number(path.split('/').at(-1)));
        const changes = JSON.parse(options.body);
        writes.push(changes);
        Object.assign(task, changes);
        data = task;
      } else if (path.endsWith('/tasks')) data = tasks;
      else data = { id: 1, name: 'Example', archived };
      return { ok: true, json: async () => structuredClone(data) };
    },
  });
  const byId = id => app.all().find(node => node.id === id);
  const rows = () => app.all().filter(node => node.dataset.testid === 'task-row');
  const titles = () => rows().map(row => row.children[1].textContent);
  async function choose(id, value) {
    const select = byId(id);
    select.value = value;
    await select.fire('change');
    // Task event handlers start asynchronous saves without returning their promise.
    await new Promise(resolve => setImmediate(resolve));
  }
  return { app, tasks, writes, byId, rows, titles, choose };
}

test('priority and completion filters intersect in creation order and retain each selection', async () => {
  const p = await page();
  assert.equal(p.byId('priority-filter').value, 'All');
  assert.deepEqual(p.byId('priority-filter').children.map(node => node.textContent), ['All', 'Low', 'Normal', 'High']);
  for (const completion of ['All', 'Open', 'Completed']) {
    await p.choose('task-filter', completion);
    for (const priority of ['All', 'Low', 'Normal', 'High']) {
      await p.choose('priority-filter', priority);
      assert.equal(p.byId('task-filter').value, completion);
      assert.deepEqual(p.titles(), p.tasks.filter(task =>
        (completion === 'All' || task.completed === (completion === 'Completed')) &&
        (priority === 'All' || task.priority === priority)).map(task => task.title));
    }
    assert.equal(p.byId('priority-filter').value, 'High');
  }
  assert.deepEqual(p.writes, []);
});

test('task edits re-evaluate both filters without resetting them; rename retains membership', async () => {
  const p = await page();
  await p.choose('task-filter', 'Open');
  await p.choose('priority-filter', 'High');
  const rename = p.rows()[0].children.find(node => node.tag === 'form');
  rename.children.find(node => node.tag === 'input').value = '  Renamed  ';
  await rename.fire('submit');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(p.titles(), ['Renamed']);
  assert.equal(p.rows()[0].children[0].attributes['aria-label'], 'Complete Renamed');
  await p.choose('task-priority-1', 'Low');
  assert.deepEqual(p.titles(), []);
  assert.equal(p.byId('task-filter').value, 'Open');
  assert.equal(p.byId('priority-filter').value, 'High');
  await p.choose('priority-filter', 'Low');
  const checkbox = p.rows()[0].children[0];
  checkbox.checked = true;
  await checkbox.fire('change');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(p.titles(), []);
  assert.equal(p.byId('task-filter').value, 'Open');
  assert.equal(p.byId('priority-filter').value, 'Low');
  await p.choose('task-filter', 'Completed');
  assert.deepEqual(p.titles(), ['Renamed', 'Second']);
  assert.deepEqual(p.tasks[0], { id: 1, title: 'Renamed', completed: true, priority: 'Low' });
});

test('archived projects keep both filters usable and all task edits disabled', async () => {
  const p = await page(true);
  assert.ok(!p.byId('task-filter').disabled);
  assert.ok(!p.byId('priority-filter').disabled);
  await p.choose('task-filter', 'Completed');
  await p.choose('priority-filter', 'High');
  assert.deepEqual(p.titles(), ['Fourth']);
  for (const node of p.rows()[0].all().filter(node => ['input', 'button', 'select'].includes(node.tag))) {
    assert.equal(node.disabled, true);
  }
  assert.deepEqual(p.writes, []);
});
