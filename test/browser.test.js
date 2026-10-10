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
  querySelectorAll(selector) {
    const tags = selector.split(',').map(tag => tag.trim());
    return this.all().slice(1).filter(node => tags.includes(node.tag));
  }
  all() { return [this, ...this.children.flatMap(node => node.all())]; }
}

async function page(archived = false, beforeSave = async () => {}) {
  const app = new Node('main');
  const tasks = [
    { id: 1, title: 'First', completed: false, priority: 'High' },
    { id: 2, title: 'Second', completed: true, priority: 'Low' },
    { id: 3, title: 'Third', completed: false, priority: 'Normal' },
    { id: 4, title: 'Fourth', completed: true, priority: 'High' },
  ].map(task => ({ ...task, due_date: '' }));
  const writes = [];
  const project = { id: 1, name: 'Example', archived, default_priority: 'Normal' };
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  await runInNewContext(`(async () => { ${source} })()`, {
    document: { querySelector: () => app, createElement: tag => new Node(tag) },
    window: { location: { pathname: '/projects/1' } },
    fetch: async (path, options) => {
      let data;
      if (options?.method === 'PATCH') {
        await beforeSave();
        const target = path.includes('/tasks/')
          ? tasks.find(task => task.id === Number(path.split('/').at(-1)))
          : project;
        const changes = JSON.parse(options.body);
        writes.push(changes);
        Object.assign(target, changes);
        data = target;
      } else if (options?.method === 'POST' && path.endsWith('/tasks')) {
        data = { id: tasks.length + 1, title: JSON.parse(options.body).title,
          completed: false, priority: project.default_priority, due_date: '' };
        tasks.push(data);
      } else if (path.endsWith('/tasks')) data = tasks;
      else data = project;
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
  return { app, project, tasks, writes, byId, rows, titles, choose };
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
  assert.deepEqual(p.tasks[0], { id: 1, title: 'Renamed', completed: true, priority: 'Low', due_date: '' });
});

test('completion edits keep the clicked checkbox attached until saving finishes', async () => {
  for (const completion of ['Open', 'Completed']) {
    let finishSave;
    const saving = new Promise(resolve => { finishSave = resolve; });
    const p = await page(false, () => saving);
    await p.choose('task-filter', completion);
    await p.choose('priority-filter', 'High');
    const row = p.rows()[0];
    const checkbox = row.children[0];
    checkbox.checked = completion === 'Open';
    await checkbox.fire('change');

    assert.equal(p.rows()[0], row);
    assert.equal(p.rows()[0].children[0], checkbox);
    assert.equal(checkbox.checked, completion === 'Open');
    assert.ok(row.querySelectorAll('input, button, select').every(control => control.disabled));
    assert.equal(p.byId('task-filter').value, completion);
    assert.equal(p.byId('priority-filter').value, 'High');

    finishSave();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(p.titles(), []);
    assert.equal(p.byId('task-filter').value, completion);
    assert.equal(p.byId('priority-filter').value, 'High');
    await p.choose('task-filter', completion === 'Open' ? 'Completed' : 'Open');
    assert.ok(p.titles().includes(row.children[1].textContent));
  }
});

test('failed completion saves restore saved state and enable editing', async () => {
  const p = await page(false, async () => { throw new Error('Save failed'); });
  await p.choose('task-filter', 'Open');
  await p.choose('priority-filter', 'High');
  const checkbox = p.rows()[0].children[0];
  checkbox.checked = true;
  await checkbox.fire('change');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(p.titles(), ['First']);
  assert.equal(p.rows()[0].children[0].checked, false);
  assert.ok(p.rows()[0].querySelectorAll('input, button, select').every(control => !control.disabled));
  assert.equal(p.app.querySelector('[role="alert"]').textContent, 'Save failed');
  assert.equal(p.byId('task-filter').value, 'Open');
  assert.equal(p.byId('priority-filter').value, 'High');
  assert.deepEqual(p.writes, []);
});

test('default priority saves without changing existing tasks or selected filters', async () => {
  const p = await page();
  const defaults = p.byId('default-task-priority');
  assert.equal(defaults.value, 'Normal');
  assert.deepEqual(defaults.children.map(node => node.textContent), ['Low', 'Normal', 'High']);
  assert.ok(p.app.all().some(node => node.tag === 'label' &&
    node.textContent === 'Default task priority' && node.htmlFor === defaults.id));
  const originalTasks = structuredClone(p.tasks);
  await p.choose('task-filter', 'Open');
  await p.choose('priority-filter', 'High');
  await p.choose('default-task-priority', 'Low');
  assert.equal(p.project.default_priority, 'Low');
  assert.equal(defaults.disabled, false);
  assert.deepEqual(p.tasks, originalTasks);
  assert.deepEqual(p.titles(), ['First']);
  assert.equal(p.byId('task-filter').value, 'Open');
  assert.equal(p.byId('priority-filter').value, 'High');
  p.byId('task-title').value = 'New task';
  await p.byId('task-title').parent.fire('submit');
  assert.equal(p.tasks.at(-1).priority, 'Low');
  assert.deepEqual(p.titles(), ['First']);
  await p.choose('priority-filter', 'Low');
  assert.deepEqual(p.titles(), ['New task']);
});

test('failed default saves restore the saved selection without affecting filters', async () => {
  const p = await page(false, async () => { throw new Error('Save failed'); });
  await p.choose('task-filter', 'Completed');
  await p.choose('priority-filter', 'Low');
  await p.choose('default-task-priority', 'High');
  assert.equal(p.byId('default-task-priority').value, 'Normal');
  assert.equal(p.byId('default-task-priority').disabled, false);
  assert.equal(p.byId('task-filter').value, 'Completed');
  assert.equal(p.byId('priority-filter').value, 'Low');
  assert.deepEqual(p.titles(), ['Second']);
  assert.equal(p.app.querySelector('[role="alert"]').textContent, 'Save failed');
});

test('archived projects keep both filters usable and all task edits disabled', async () => {
  const p = await page(true);
  assert.equal(p.byId('default-task-priority').value, 'Normal');
  assert.equal(p.byId('default-task-priority').disabled, true);
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


test('due date saves and clears preserve selected filters and other task fields', async () => {
  const p = await page();
  await p.choose('task-filter', 'Open');
  await p.choose('priority-filter', 'High');
  const original = { ...p.tasks[0] };
  for (const value of ['2024-02-29', '']) {
    const input = p.byId('task-due-date-1');
    assert.equal(input.type, 'text');
    assert.ok(p.app.all().some(node => node.textContent === 'Task due date' && node.htmlFor === input.id));
    assert.equal(input.parent.children.at(-1).textContent, 'Save due date');
    input.value = value;
    await input.parent.fire('submit');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(p.byId(input.id).value, value);
    assert.deepEqual(p.tasks[0], { ...original, due_date: value });
    assert.equal(p.byId('task-filter').value, 'Open');
    assert.equal(p.byId('priority-filter').value, 'High');
    assert.deepEqual(p.titles(), ['First']);
  }
});

test('failed due date saves show an alert and restore the saved date', async () => {
  const p = await page(false, async () => { throw new Error('Due date must be a valid YYYY-MM-DD date'); });
  const input = p.byId('task-due-date-1');
  input.value = '2024-02-30';
  await input.parent.fire('submit');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(p.byId(input.id).value, '');
  assert.equal(p.byId(input.id).disabled, false);
  assert.equal(p.app.querySelector('[role="alert"]').textContent, 'Due date must be a valid YYYY-MM-DD date');
  assert.deepEqual(p.writes, []);
});
