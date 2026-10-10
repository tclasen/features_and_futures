import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { normalizeDueDate } from '../due-date.js';

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

async function page(archived = false, beforeSave = async () => {}, destinations = [
  { id: 2, name: 'Destination', archived: false },
  { id: 3, name: 'Archived destination', archived: true },
  { id: 4, name: 'Other destination', archived: false },
]) {
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
  await runInNewContext(`(async () => { ${source.replace("import { normalizeDueDate } from '/due-date.js';", '')} })()`, {
    normalizeDueDate,
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
      else if (path === '/api/projects') data = [project, ...destinations];
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

test('moving uses only eligible destinations and retains all source filters', async () => {
  const p = await page();
  const select = p.byId('destination-project-1');
  assert.deepEqual(select.children.map(node => [node.value, node.textContent]), [
    ['2', 'Destination'], ['4', 'Other destination'],
  ]);
  p.byId('task-due-date-1').value = '2024-02-29';
  await p.byId('task-due-date-1').parent.fire('submit');
  await new Promise(resolve => setImmediate(resolve));
  await p.choose('task-filter', 'Open');
  await p.choose('priority-filter', 'High');
  p.byId('due-from').value = '2024-02-01';
  p.byId('due-through').value = '2024-03-01';
  await p.byId('due-from').parent.fire('submit');
  const moveForm = p.byId('destination-project-1').parent;
  p.byId('destination-project-1').value = '4';
  await moveForm.fire('submit');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(p.writes, [{ due_date: '2024-02-29' }, { destination_project_id: 4 }]);
  assert.equal(p.byId('due-from').value, '2024-02-01');
  assert.equal(p.byId('due-through').value, '2024-03-01');
  assert.deepEqual(p.titles(), []);
  assert.equal(p.byId('task-filter').value, 'Open');
  assert.equal(p.byId('priority-filter').value, 'High');
  await p.choose('priority-filter', 'All');
  assert.deepEqual(p.titles(), []); // The applied range still excludes undated rows.
  p.byId('due-from').value = '';
  p.byId('due-through').value = '';
  await p.byId('due-from').parent.fire('submit');
  assert.deepEqual(p.titles(), ['Third']);
});

test('move controls disable without destinations or when archived; failures preserve rows', async () => {
  for (const p of [await page(false, undefined, []), await page(true)]) {
    for (const row of p.rows()) {
      const form = row.children.at(-1);
      assert.equal(form.children[1].disabled, true);
      assert.equal(form.children[2].disabled, true);
    }
  }
  const p = await page(false, async () => { throw new Error('Move failed'); });
  await p.byId('destination-project-1').parent.fire('submit');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(p.titles(), ['First', 'Second', 'Third', 'Fourth']);
  assert.equal(p.byId('destination-project-1').disabled, false);
  assert.equal(p.app.querySelector('[role="alert"]').textContent, 'Move failed');
});

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

async function applyDueRange(p, from, through) {
  p.byId('due-from').value = from;
  p.byId('due-through').value = through;
  await p.byId('due-from').parent.fire('submit');
}

async function saveDate(p, id, date) {
  const input = p.byId(`task-due-date-${id}`);
  input.value = date;
  await input.parent.fire('submit');
  await new Promise(resolve => setImmediate(resolve));
}

test('inclusive due ranges intersect all filters, with unbounded and undated rules', async () => {
  const p = await page();
  assert.equal(p.byId('due-from').value, '');
  assert.equal(p.byId('due-through').value, '');
  for (const [id, date] of [[1, '0001-01-01'], [2, '2024-02-29'], [4, '9999-12-31']]) {
    await saveDate(p, id, date);
  }
  const saved = structuredClone(p.tasks);
  for (const [from, through] of [['', ''], ['', '2024-02-29'], ['2024-02-29', ''],
    ['2024-02-29', '2024-02-29'], ['0001-01-01', '9999-12-31']]) {
    await applyDueRange(p, ` ${from} `, ` ${through} `);
    for (const completion of ['All', 'Open', 'Completed']) {
      await p.choose('task-filter', completion);
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        await p.choose('priority-filter', priority);
        assert.deepEqual(p.titles(), p.tasks.filter(task =>
          (completion === 'All' || task.completed === (completion === 'Completed')) &&
          (priority === 'All' || task.priority === priority) &&
          (!(from || through) || task.due_date) &&
          (!from || task.due_date >= from) && (!through || task.due_date <= through)
        ).map(task => task.title));
      }
    }
  }
  assert.deepEqual(p.tasks, saved);
});

test('invalid ranges preserve applied membership even when other filters change', async () => {
  const p = await page();
  await saveDate(p, 1, '2024-02-29');
  await applyDueRange(p, '2024-02-29', '2024-02-29');
  for (const [from, through, message] of [
    ['2023-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
    ['', '0000-01-01', 'Due range must use valid YYYY-MM-DD dates'],
    ['2024-2-01', '', 'Due range must use valid YYYY-MM-DD dates'],
    ['2024-03-01', '2024-02-29', 'Due from must not be after Due through'],
  ]) {
    await applyDueRange(p, from, through);
    assert.equal(p.app.querySelector('[role="alert"]').textContent, message);
    assert.deepEqual(p.titles(), ['First']);
    await p.choose('task-filter', 'Open');
    await p.choose('priority-filter', 'High');
    assert.deepEqual(p.titles(), ['First']);
  }
  await applyDueRange(p, '', '');
  assert.deepEqual(p.titles(), ['First']);
  await p.choose('priority-filter', 'All');
  assert.deepEqual(p.titles(), ['First', 'Third']);
});

test('task and project edits retain applied ranges and re-evaluate membership', async () => {
  const p = await page();
  await saveDate(p, 1, '2024-02-29');
  await p.choose('task-filter', 'Open');
  await p.choose('priority-filter', 'High');
  await applyDueRange(p, '2024-02-29', '2024-02-29');
  // Unapplied draft values must not affect editing or filter changes.
  p.byId('due-from').value = 'invalid draft';
  p.byId('new-task-title-1').value = 'Renamed';
  await p.byId('new-task-title-1').parent.fire('submit');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(p.titles(), ['Renamed']);
  p.byId('new-project-name').value = 'New project';
  await p.byId('new-project-name').parent.fire('submit');
  await p.choose('default-task-priority', 'High');
  p.byId('task-title').value = 'Undated new task';
  await p.byId('task-title').parent.fire('submit');
  assert.deepEqual(p.titles(), ['Renamed']);
  await p.choose('task-priority-1', 'Low');
  assert.deepEqual(p.titles(), []);
  await p.choose('priority-filter', 'Low');
  const checkbox = p.rows()[0].children[0];
  checkbox.checked = true;
  await checkbox.fire('change');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(p.titles(), []);
  await p.choose('task-filter', 'Completed');
  assert.deepEqual(p.titles(), ['Renamed']);
  await saveDate(p, 1, '2024-03-01');
  assert.deepEqual(p.titles(), []);
  await applyDueRange(p, '2024-03-01', '');
  assert.deepEqual(p.titles(), ['Renamed']);
  await saveDate(p, 1, '');
  assert.deepEqual(p.titles(), []);
  assert.equal(p.byId('task-filter').value, 'Completed');
  assert.equal(p.byId('priority-filter').value, 'Low');
});

test('archived due range controls stay usable; reopening initializes empty boundaries', async () => {
  const p = await page(true);
  for (const id of ['due-from', 'due-through']) {
    const input = p.byId(id);
    assert.equal(input.type, 'text');
    assert.ok(!input.disabled);
    assert.ok(p.app.all().some(node => node.tag === 'label' && node.htmlFor === id));
  }
  assert.ok(!p.byId('due-from').parent.children.at(-1).disabled);
  await applyDueRange(p, '0001-01-01', '9999-12-31');
  assert.deepEqual(p.titles(), []);
  await applyDueRange(p, '', '');
  assert.equal(p.rows().length, 4);
  assert.ok(p.rows().every(row => row.querySelectorAll('input, button, select').every(control => control.disabled)));
  assert.deepEqual(p.writes, []);
  const reopened = await page();
  assert.equal(reopened.byId('due-from').value, '');
  assert.equal(reopened.byId('due-through').value, '');
  assert.equal(reopened.rows().length, 4);
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

async function searchTasks(p, query) {
  p.byId('task-search').value = query;
  await p.byId('task-search').parent.fire('submit');
}

const settle = () => new Promise(resolve => setImmediate(resolve));

test('task search intersects filters and retains applied query through edits', async () => {
  const p = await page();
  assert.equal(p.byId('task-search').value, '');
  await searchTasks(p, '  IR  ');
  assert.deepEqual(p.titles(), ['First', 'Third']);
  p.byId('task-search').value = 'draft not applied';
  await p.choose('priority-filter', 'High');
  assert.deepEqual(p.titles(), ['First']);
  await p.choose('task-filter', 'Open');
  p.byId('task-due-date-1').value = '2024-02-29';
  await p.byId('task-due-date-1').parent.fire('submit');
  await settle();
  p.byId('due-from').value = '2024-02-29';
  p.byId('due-through').value = '2024-02-29';
  await p.byId('due-from').parent.fire('submit');
  assert.deepEqual(p.titles(), ['First']);
  await p.choose('default-task-priority', 'Low');
  p.byId('new-project-name').value = 'New project';
  await p.byId('new-project-name').parent.fire('submit');
  assert.deepEqual(p.titles(), ['First']);
  p.byId('new-task-title-1').value = 'No match';
  await p.byId('new-task-title-1').parent.fire('submit');
  await settle();
  assert.deepEqual(p.titles(), []);
  await searchTasks(p, '  ');
  assert.deepEqual(p.titles(), ['No match']);
  assert.equal(p.byId('task-filter').value, 'Open');
  assert.equal(p.byId('priority-filter').value, 'High');
  assert.equal(p.byId('due-from').value, '2024-02-29');
  await searchTasks(p, 'MATCH');
  await p.choose('task-priority-1', 'Low');
  assert.deepEqual(p.titles(), []);
  await p.choose('priority-filter', 'Low');
  assert.deepEqual(p.titles(), ['No match']);
  const checkbox = p.rows()[0].children[0];
  checkbox.checked = true;
  await checkbox.fire('change');
  await settle();
  assert.deepEqual(p.titles(), []);
  await p.choose('task-filter', 'Completed');
  p.byId('task-due-date-1').value = '';
  await p.byId('task-due-date-1').parent.fire('submit');
  await settle();
  assert.deepEqual(p.titles(), []);
});

test('search remains applied on creation and movement, preserves whitespace and ASCII semantics', async () => {
  const p = await page();
  await searchTasks(p, 'needle');
  p.byId('task-title').value = 'A NEEDLE  Ä';
  await p.byId('task-title').parent.fire('submit');
  assert.deepEqual(p.titles(), ['A NEEDLE  Ä']);
  await searchTasks(p, 'needle Ä');
  assert.deepEqual(p.titles(), []); // Internal double space is significant.
  await searchTasks(p, 'needle  ä');
  assert.deepEqual(p.titles(), []); // Non-ASCII letters are not case folded.
  await searchTasks(p, 'needle  Ä');
  assert.deepEqual(p.titles(), ['A NEEDLE  Ä']);
  await p.byId('destination-project-5').parent.fire('submit');
  await settle();
  assert.deepEqual(p.titles(), []);
  await p.choose('task-filter', 'Open');
  assert.deepEqual(p.titles(), []);
  await searchTasks(p, '');
  assert.deepEqual(p.titles(), ['First', 'Third']);
  const archived = await page(true);
  assert.ok(!archived.byId('task-search').disabled);
  await searchTasks(archived, 'SECOND');
  assert.deepEqual(archived.titles(), ['Second']);
  assert.ok(archived.rows()[0].querySelectorAll('input, button, select').every(control => control.disabled));
  assert.equal((await page()).byId('task-search').value, '');
});

test('project search intersects archive filter, preserves order and summaries, and resets on navigation', async () => {
  const projects = [
    { id: 1, name: 'Alpha  Ä', archived: false, total: 3, completed: 2 },
    { id: 2, name: 'Beta', archived: false, total: 0, completed: 0 },
    { id: 3, name: 'ALPHABET', archived: true, total: 2, completed: 1 },
    { id: 4, name: 'alpha last', archived: false, total: 1, completed: 1 },
  ];
  async function listPage() {
    const app = new Node('main');
    const window = { location: { pathname: '/' } };
    const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
    await runInNewContext(`(async () => { ${source.replace("import { normalizeDueDate } from '/due-date.js';", '')} })()`, {
      normalizeDueDate, window,
      document: { querySelector: () => app, createElement: tag => new Node(tag) },
      fetch: async (path, options) => {
        let data = projects;
        if (options?.method === 'PATCH') {
          data = projects.find(project => project.id === Number(path.split('/').at(-1)));
          Object.assign(data, JSON.parse(options.body));
        }
        return { ok: true, json: async () => structuredClone(data) };
      },
    });
    const byId = id => app.all().find(node => node.id === id);
    const rows = () => app.all().filter(node => node.dataset.testid === 'project-row');
    return { app, window, byId, rows, names: () => rows().map(row => row.children[0].textContent) };
  }
  const p = await listPage();
  assert.equal(p.byId('project-search').value, '');
  p.byId('project-search').value = '  ALPHA  ';
  await p.byId('project-search').parent.fire('submit');
  assert.deepEqual(p.names(), ['Alpha  Ä', 'alpha last']);
  assert.equal(p.rows()[0].children[1].textContent, '2/3 completed');
  p.byId('project-search').value = 'unapplied draft';
  p.byId('project-filter').value = 'Archived';
  await p.byId('project-filter').fire('change');
  assert.deepEqual(p.names(), ['ALPHABET']);
  await p.rows()[0].children.at(-1).fire('click'); // Restore matching project.
  assert.deepEqual(p.names(), []);
  p.byId('project-filter').value = 'Active';
  await p.byId('project-filter').fire('change');
  assert.deepEqual(p.names(), ['Alpha  Ä', 'ALPHABET', 'alpha last']);
  p.byId('project-search').value = 'alpha Ä';
  await p.byId('project-search').parent.fire('submit');
  assert.deepEqual(p.names(), []);
  p.byId('project-search').value = 'alpha  ä';
  await p.byId('project-search').parent.fire('submit');
  assert.deepEqual(p.names(), []);
  p.byId('project-search').value = 'alpha  Ä';
  await p.byId('project-search').parent.fire('submit');
  assert.deepEqual(p.names(), ['Alpha  Ä']);
  await p.rows()[0].children[2].fire('click');
  assert.equal(p.window.location.href, '/projects/1');
  const detail = await page();
  const back = detail.app.all().find(node => node.tag === 'button' && node.textContent === 'Projects');
  await back.fire('click');
  const reopened = await listPage();
  assert.equal(reopened.byId('project-search').value, '');
  assert.equal(reopened.names().length, 4);
});
