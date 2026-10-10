import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// Minimal DOM harness: executes the actual browser code and its event handlers.
class Node {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.value = '';
    this.textContent = '';
    this.disabled = false;
  }
  setAttribute(key, value) {
    this.attributes[key] = value;
    if (key === 'id') this.id = value;
    if (key === 'value') this.value = value;
  }
  append(...nodes) {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
      if (this.tag === 'select' && this.children.length === 1) this.value = node.value;
    }
  }
  replaceChildren() { this.children = []; }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  async fire(type) { await this.listeners[type]?.({ preventDefault() {} }); }
  remove() { this.parent.children = this.parent.children.filter(node => node !== this); }
  focus() {}
  all() { return this.children.flatMap(node => [node, ...node.all()]); }
  querySelector() { return this.all().find(node => node.attributes.role === 'alert'); }
}

async function page(archived = false, destinations = [], pathname = '/projects/1') {
  const app = new Node('main');
  const project = { id: 1, name: 'Project', archived, default_priority: 'Normal' };
  const tasks = [
    { id: 1, title: 'First', completed: false, priority: 'High' },
    { id: 2, title: 'Second', completed: true, priority: 'Low' },
    { id: 3, title: 'Third', completed: false, priority: 'Normal' },
    { id: 4, title: 'Fourth', completed: true, priority: 'High' },
  ];
  const writes = [];
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  runInNewContext(source.replace(/render\(\);\s*$/, 'globalThis.ready = render();'), {
    document: { querySelector: () => app, createElement: tag => new Node(tag) },
    window: { location: { pathname } },
    fetch: async (path, options) => {
      let data;
      if (options) {
        let task = path === '/api/projects/1' ? project : tasks.find(item => item.id === Number(path.split('/').at(-1)));
        if (options.method === 'POST') {
          task = { id: tasks.length + 1, completed: false, priority: project.default_priority, due_date: '' };
          tasks.push(task);
        }
        const patch = JSON.parse(options.body);
        writes.push(patch);
        if (Object.hasOwn(patch, 'due_date')) {
          patch.due_date = patch.due_date.trim();
          if (patch.due_date === 'invalid') return { ok: false, json: async () => ({ error: 'Due date must be a valid YYYY-MM-DD date' }) };
        }
        if (Object.hasOwn(patch, 'destination_project_id')) {
          tasks.splice(tasks.indexOf(task), 1);
          task.project_id = patch.destination_project_id;
        } else Object.assign(task, patch);
        data = task;
      } else data = path === '/api/projects' ? [project, ...destinations] : path.endsWith('/tasks') ? tasks : project;
      return { ok: true, json: async () => structuredClone(data) };
    },
    get ready() { return undefined; },
    set ready(promise) { app.ready = promise; },
  });
  await app.ready;
  return {
    app, writes, tasks,
    control: id => app.all().find(node => node.id === id),
    rows: () => app.all().filter(node => node.attributes['data-testid'] === 'task-row'),
    titles: () => app.all().filter(node => node.attributes['data-testid'] === 'task-row').map(row => row.children[1].textContent),
  };
}

test('combined filters preserve selections, order, and re-evaluate task edits', async () => {
  const ui = await page();
  const completion = ui.control('task-filter');
  const priority = ui.control('priority-filter');
  assert.deepEqual(priority.children.map(option => option.textContent), ['All', 'Low', 'Normal', 'High']);
  assert.equal(priority.value, 'All');
  const original = structuredClone(ui.tasks);
  for (const state of ['All', 'Open', 'Completed']) {
    completion.value = state;
    await completion.fire('change');
    for (const level of ['All', 'Low', 'Normal', 'High']) {
      priority.value = level;
      await priority.fire('change');
      assert.equal(completion.value, state);
      assert.deepEqual(ui.titles(), original.filter(task =>
        (state === 'All' || task.completed === (state === 'Completed')) &&
        (level === 'All' || task.priority === level)).map(task => task.title));
    }
  }
  assert.deepEqual(ui.tasks, original);
  assert.deepEqual(ui.writes, []);
  completion.value = 'Open';
  await completion.fire('change');
  assert.equal(priority.value, 'High');
  assert.deepEqual(ui.titles(), ['First']);
  const rename = ui.control('new-task-title-1');
  rename.value = ' Renamed ';
  await rename.parent.fire('submit');
  assert.deepEqual(ui.titles(), ['Renamed']);
  assert.equal(ui.rows()[0].children[0].attributes['aria-label'], 'Complete Renamed');
  assert.equal(completion.value, 'Open');
  assert.equal(priority.value, 'High');
  const selector = ui.control('task-priority-1');
  selector.value = 'Low';
  await selector.fire('change');
  assert.deepEqual(ui.titles(), []);
  assert.equal(completion.value, 'Open');
  assert.equal(priority.value, 'High');
  priority.value = 'Low';
  await priority.fire('change');
  assert.deepEqual(ui.titles(), ['Renamed']);
  const checkbox = ui.rows()[0].children[0];
  checkbox.checked = true;
  await checkbox.fire('change');
  assert.deepEqual(ui.titles(), []);
  assert.equal(completion.value, 'Open');
  assert.equal(priority.value, 'Low');
  completion.value = 'Completed';
  await completion.fire('change');
  assert.deepEqual(ui.titles(), ['Renamed', 'Second']);
  assert.deepEqual(ui.writes, [{ title: 'Renamed' }, { priority: 'Low' }, { completed: true }]);
});

test('changing project default preserves both filters and all existing rows', async () => {
  const ui = await page();
  const defaults = ui.control('default-task-priority');
  assert.deepEqual(defaults.children.map(option => option.textContent), ['Low', 'Normal', 'High']);
  assert.equal(defaults.value, 'Normal');
  const completion = ui.control('task-filter');
  const priority = ui.control('priority-filter');
  completion.value = 'Completed';
  await completion.fire('change');
  priority.value = 'High';
  await priority.fire('change');
  const original = structuredClone(ui.tasks);
  defaults.value = 'Low';
  await defaults.fire('change');
  assert.equal(defaults.value, 'Low');
  assert.equal(defaults.disabled, false);
  assert.equal(completion.value, 'Completed');
  assert.equal(priority.value, 'High');
  assert.deepEqual(ui.titles(), ['Fourth']);
  assert.deepEqual(ui.tasks, original);
  assert.deepEqual(ui.writes, [{ default_priority: 'Low' }]);
});

test('due-date controls save and clear without resetting filters or changing matching rows', async () => {
  const ui = await page();
  const completion = ui.control('task-filter');
  const priority = ui.control('priority-filter');
  completion.value = 'Open';
  await completion.fire('change');
  priority.value = 'High';
  await priority.fire('change');
  const due = ui.control('task-due-date-1');
  assert.equal(due.attributes.type, 'text');
  assert.equal(due.value, '');
  assert.equal(due.parent.children[0].textContent, 'Task due date');
  assert.equal(due.parent.children[2].textContent, 'Save due date');
  due.value = ' 2024-02-29 ';
  await due.parent.fire('submit');
  assert.equal(due.value, '2024-02-29');
  due.value = 'invalid';
  await due.parent.fire('submit');
  assert.equal(due.value, '2024-02-29');
  assert.match(ui.app.querySelector().textContent, /Due date must be a valid YYYY-MM-DD date/);
  const rename = ui.control('new-task-title-1');
  rename.value = 'Renamed';
  await rename.parent.fire('submit');
  assert.equal(ui.tasks[0].due_date, '2024-02-29');
  assert.deepEqual(ui.titles(), ['Renamed']);
  assert.equal(completion.value, 'Open');
  assert.equal(priority.value, 'High');
  due.value = '   ';
  await due.parent.fire('submit');
  assert.equal(due.value, '');
  assert.equal(ui.tasks[0].due_date, '');
  assert.equal(ui.tasks[1].due_date, undefined);
  assert.equal(completion.value, 'Open');
  assert.equal(priority.value, 'High');
  assert.deepEqual(ui.titles(), ['Renamed']);
});

test('due range is inclusive, intersects filters, and retains the last valid application', async () => {
  const ui = await page();
  const from = ui.control('due-from');
  const through = ui.control('due-through');
  assert.equal(from.value, '');
  assert.equal(through.value, '');
  assert.equal(from.attributes.type, 'text');
  assert.equal(through.attributes.type, 'text');
  assert.equal(from.parent.children.at(-1).textContent, 'Apply due range');
  async function range(a, b) {
    from.value = a;
    through.value = b;
    await from.parent.fire('submit');
  }
  for (const [id, date] of [[1, '2024-02-28'], [2, '2024-02-29'], [4, '2024-03-01']]) {
    const input = ui.control(`task-due-date-${id}`);
    input.value = date;
    await input.parent.fire('submit');
  }
  const original = structuredClone(ui.tasks);
  const writes = ui.writes.length;
  await range(' 2024-02-28 ', ' 2024-02-29 ');
  assert.equal(from.value, '2024-02-28');
  assert.deepEqual(ui.titles(), ['First', 'Second']);
  for (const bad of ['2023-02-29', '1900-02-29', '2024-04-31', '0000-01-01', '10000-01-01', '2024-2-28', '2024-01-01T00:00:00Z']) {
    await range(bad, '');
    assert.match(ui.app.querySelector().textContent, /Due range must use valid YYYY-MM-DD dates/);
    assert.deepEqual(ui.titles(), ['First', 'Second']);
    await range('', bad);
    assert.deepEqual(ui.titles(), ['First', 'Second']);
  }
  await range('2024-03-01', '2024-02-29');
  assert.match(ui.app.querySelector().textContent, /Due from must not be after Due through/);
  assert.deepEqual(ui.titles(), ['First', 'Second']);
  const completion = ui.control('task-filter');
  const priority = ui.control('priority-filter');
  completion.value = 'Completed';
  await completion.fire('change');
  assert.deepEqual(ui.titles(), ['Second']);
  priority.value = 'High';
  await priority.fire('change');
  assert.deepEqual(ui.titles(), []);
  await range('', '2024-03-01');
  assert.deepEqual(ui.titles(), ['Fourth']);
  assert.equal(completion.value, 'Completed');
  assert.equal(priority.value, 'High');
  priority.value = 'All';
  await priority.fire('change');
  completion.value = 'All';
  await completion.fire('change');
  await range('2024-02-29', '');
  assert.deepEqual(ui.titles(), ['Second', 'Fourth']);
  await range('2024-02-29', '2024-02-29');
  assert.deepEqual(ui.titles(), ['Second']);
  await range('0001-01-01', '9999-12-31');
  assert.deepEqual(ui.titles(), ['First', 'Second', 'Fourth']);
  await range('2000-02-29', '2000-02-29');
  assert.deepEqual(ui.titles(), []);
  await range(' ', ' ');
  assert.deepEqual(ui.titles(), ['First', 'Second', 'Third', 'Fourth']);
  assert.deepEqual(ui.tasks, original);
  assert.equal(ui.writes.length, writes);
});

test('task edits re-evaluate all filters while rename and defaults preserve applied range', async () => {
  const ui = await page();
  const due = ui.control('task-due-date-1');
  due.value = '2024-02-29';
  await due.parent.fire('submit');
  const from = ui.control('due-from');
  const through = ui.control('due-through');
  from.value = '2024-02-29';
  through.value = '2024-02-29';
  await from.parent.fire('submit');
  const completion = ui.control('task-filter');
  const priority = ui.control('priority-filter');
  completion.value = 'Open';
  await completion.fire('change');
  priority.value = 'High';
  await priority.fire('change');
  const rename = ui.control('new-task-title-1');
  rename.value = 'Renamed';
  await rename.parent.fire('submit');
  const projectRename = ui.control('new-project-name');
  projectRename.value = 'New project';
  await projectRename.parent.fire('submit');
  const defaults = ui.control('default-task-priority');
  defaults.value = 'Low';
  await defaults.fire('change');
  assert.deepEqual(ui.titles(), ['Renamed']);
  assert.equal(completion.value, 'Open');
  assert.equal(priority.value, 'High');
  const newTask = ui.control('task-title');
  newTask.value = 'New undated task';
  await newTask.parent.fire('submit');
  assert.deepEqual(ui.titles(), ['Renamed']);
  assert.equal(ui.tasks.at(-1).priority, 'Low');
  assert.equal(completion.value, 'Open');
  assert.equal(priority.value, 'High');
  // Editing an unapplied field must not affect the active range.
  from.value = '2025-01-01';
  const selector = ui.control('task-priority-1');
  selector.value = 'Low';
  await selector.fire('change');
  assert.deepEqual(ui.titles(), []);
  priority.value = 'Low';
  await priority.fire('change');
  assert.deepEqual(ui.titles(), ['Renamed']);
  const checkbox = ui.rows()[0].children[0];
  checkbox.checked = true;
  await checkbox.fire('change');
  assert.deepEqual(ui.titles(), []);
  completion.value = 'Completed';
  await completion.fire('change');
  assert.deepEqual(ui.titles(), ['Renamed']);
  const savedDue = ui.control('task-due-date-1');
  savedDue.value = '2024-03-01';
  await savedDue.parent.fire('submit');
  assert.deepEqual(ui.titles(), []);
  assert.equal(completion.value, 'Completed');
  assert.equal(priority.value, 'Low');
  from.value = '';
  through.value = '';
  await from.parent.fire('submit');
  const clear = ui.control('task-due-date-1');
  clear.value = '';
  await clear.parent.fire('submit');
  from.value = '0001-01-01';
  await from.parent.fire('submit');
  assert.deepEqual(ui.titles(), []);
  const reopened = await page();
  assert.equal(reopened.control('due-from').value, '');
  assert.equal(reopened.control('due-through').value, '');
});

test('move controls list only eligible destinations and retain all source filters', async () => {
  const ui = await page(false, [
    { id: 2, name: 'Renamed destination', archived: 0 },
    { id: 3, name: 'Archived destination', archived: 1 },
    { id: 4, name: 'Last destination', archived: 0 },
  ]);
  ui.control('task-due-date-1').value = '2024-02-01';
  await ui.control('task-due-date-1').parent.fire('submit');
  ui.control('task-due-date-4').value = '2024-02-02';
  await ui.control('task-due-date-4').parent.fire('submit');
  ui.writes.length = 0;
  const completion = ui.control('task-filter');
  completion.value = 'Open';
  await completion.fire('change');
  const priority = ui.control('priority-filter');
  priority.value = 'High';
  await priority.fire('change');
  const from = ui.control('due-from');
  const through = ui.control('due-through');
  from.value = '2024-02-01';
  through.value = '2024-02-29';
  await from.parent.fire('submit');
  const destination = ui.control('destination-project-1');
  assert.deepEqual(destination.children.map(node => [node.textContent, node.value]), [
    ['Renamed destination', '2'], ['Last destination', '4'],
  ]);
  destination.value = '4';
  await ui.rows()[0].children.at(-1).fire('click');
  assert.deepEqual(ui.titles(), []);
  assert.equal(completion.value, 'Open');
  assert.equal(priority.value, 'High');
  assert.equal(from.value, '2024-02-01');
  assert.equal(through.value, '2024-02-29');
  assert.deepEqual(ui.writes, [{ destination_project_id: 4 }]);
  completion.value = 'Completed';
  await completion.fire('change');
  assert.deepEqual(ui.titles(), ['Fourth']);
  const noDestinations = await page();
  assert.equal(noDestinations.control('destination-project-1').children.length, 0);
  assert.equal(noDestinations.control('destination-project-1').disabled, true);
  assert.equal(noDestinations.rows()[0].children.at(-1).disabled, true);
  const archived = await page(true, [{ id: 2, name: 'Active', archived: 0 }]);
  assert.equal(archived.control('destination-project-1').disabled, true);
  assert.equal(archived.rows()[0].children.at(-1).disabled, true);
});

test('archived projects keep both filters usable and editing controls disabled', async () => {
  const ui = await page(true);
  const completion = ui.control('task-filter');
  const priority = ui.control('priority-filter');
  assert.equal(ui.control('default-task-priority').value, 'Normal');
  assert.equal(ui.control('default-task-priority').disabled, true);
  assert.equal(completion.disabled, false);
  assert.equal(priority.disabled, false);
  const from = ui.control('due-from');
  const through = ui.control('due-through');
  assert.equal(from.disabled, false);
  assert.equal(through.disabled, false);
  assert.equal(from.parent.children.at(-1).disabled, false);
  from.value = '2024-01-01';
  await from.parent.fire('submit');
  assert.deepEqual(ui.titles(), []);
  from.value = '';
  await from.parent.fire('submit');
  completion.value = 'Completed';
  await completion.fire('change');
  priority.value = 'High';
  await priority.fire('change');
  assert.deepEqual(ui.titles(), ['Fourth']);
  const row = ui.rows()[0];
  for (const node of [row, ...row.all()].filter(node => ['input', 'button', 'select'].includes(node.tag))) {
    assert.equal(node.disabled, true);
  }
  assert.deepEqual(ui.writes, []);
});

test('project search trims, normalizes spaces and tabs, folds only ASCII and intersects archive filter', async () => {
  const ui = await page(false, [
    { id: 2, name: 'ALPHA \t  Beta', archived: 0, total: 3, completed: 1 },
    { id: 3, name: 'alpha Beta', archived: 1, total: 2, completed: 2 },
    { id: 4, name: 'Älpha', archived: 0, total: 0, completed: 0 },
  ], '/');
  const search = ui.control('project-search');
  const filter = ui.control('project-filter');
  const rows = () => ui.app.all().filter(node => node.attributes['data-testid'] === 'project-row');
  const names = () => rows().map(row => row.children[0].textContent);
  assert.equal(search.value, '');
  assert.equal(search.parent.children.at(-1).textContent, 'Search projects');
  assert.deepEqual(names(), ['Project', 'ALPHA \t  Beta', 'Älpha']);
  search.value = '  AlPhA  ';
  await search.parent.fire('submit');
  assert.deepEqual(names(), ['ALPHA \t  Beta']);
  assert.equal(rows()[0].children[1].textContent, '1/3 completed');
  filter.value = 'Archived';
  await filter.fire('change');
  assert.deepEqual(names(), ['alpha Beta']);
  search.value = 'alpha \t beta';
  await search.parent.fire('submit');
  assert.deepEqual(names(), ['alpha Beta']);
  filter.value = 'Active';
  await filter.fire('change');
  assert.deepEqual(names(), ['ALPHA \t  Beta']);
  search.value = 'älpha';
  await search.parent.fire('submit');
  assert.deepEqual(names(), []);
  search.value = 'ÄLPHA';
  await search.parent.fire('submit');
  assert.deepEqual(names(), ['Älpha']);
  search.value = '   ';
  await search.parent.fire('submit');
  assert.deepEqual(names(), ['Project', 'ALPHA \t  Beta', 'Älpha']);
  assert.deepEqual(ui.writes, []);
});

test('task search intersects all filters and rename immediately re-evaluates membership', async () => {
  const ui = await page(false, [{ id: 2, name: 'Destination', archived: 0 }]);
  const search = ui.control('task-search');
  const completion = ui.control('task-filter');
  const priority = ui.control('priority-filter');
  assert.equal(search.value, '');
  assert.equal(search.parent.children.at(-1).textContent, 'Search tasks');
  search.value = '  iR  ';
  await search.parent.fire('submit');
  assert.deepEqual(ui.titles(), ['First', 'Third']);
  assert.deepEqual(ui.writes, []);
  // Unsubmitted text is not the applied query.
  search.value = 'Fourth';
  priority.value = 'High';
  await priority.fire('change');
  assert.deepEqual(ui.titles(), ['First']);
  const due = ui.control('task-due-date-1');
  due.value = '2024-02-29';
  await due.parent.fire('submit');
  const from = ui.control('due-from');
  const through = ui.control('due-through');
  from.value = '2024-02-29';
  through.value = '2024-02-29';
  await from.parent.fire('submit');
  completion.value = 'Open';
  await completion.fire('change');
  const rename = ui.control('new-task-title-1');
  rename.value = 'No match';
  await rename.parent.fire('submit');
  assert.deepEqual(ui.titles(), []);
  assert.equal(completion.value, 'Open');
  assert.equal(priority.value, 'High');
  assert.equal(from.value, '2024-02-29');
  assert.equal(through.value, '2024-02-29');
  search.value = '  MATCH ';
  await search.parent.fire('submit');
  assert.deepEqual(ui.titles(), ['No match']);
  const checkbox = ui.rows()[0].children[0];
  checkbox.checked = true;
  await checkbox.fire('change');
  assert.deepEqual(ui.titles(), []);
  completion.value = 'Completed';
  await completion.fire('change');
  assert.deepEqual(ui.titles(), ['No match']);
  await ui.rows()[0].children.at(-1).fire('click');
  assert.deepEqual(ui.titles(), []);
  search.value = '';
  await search.parent.fire('submit');
  assert.deepEqual(ui.titles(), []); // Remaining tasks still fail the due range.
  assert.equal((await page()).control('task-search').value, '');
});

test('archived task search is usable and clearing retains other filters', async () => {
  const ui = await page(true);
  const search = ui.control('task-search');
  assert.equal(search.disabled, false);
  assert.equal(search.parent.children.at(-1).disabled, false);
  ui.control('task-filter').value = 'Completed';
  await ui.control('task-filter').fire('change');
  search.value = ' FoUr ';
  await search.parent.fire('submit');
  assert.deepEqual(ui.titles(), ['Fourth']);
  for (const control of ui.rows()[0].all().filter(node => ['input', 'button', 'select'].includes(node.tag))) {
    assert.equal(control.disabled, true);
  }
  search.value = '  ';
  await search.parent.fire('submit');
  assert.deepEqual(ui.titles(), ['Second', 'Fourth']);
  assert.deepEqual(ui.writes, []);
});


test('task search normalizes only spaces and tabs without changing saved titles or filters', async () => {
  const ui = await page();
  const title = 'MiXeD  \t  SpAcEs';
  const rename = ui.control('new-task-title-1');
  rename.value = title;
  await rename.parent.fire('submit');
  const completion = ui.control('task-filter');
  const priority = ui.control('priority-filter');
  completion.value = 'Open';
  await completion.fire('change');
  priority.value = 'High';
  await priority.fire('change');
  const search = ui.control('task-search');
  const saved = structuredClone(ui.tasks);
  for (const query of ['mixed spaces', '  MIXED\t \tSPACES  ', 'mixed  spaces']) {
    search.value = query;
    await search.parent.fire('submit');
    assert.deepEqual(ui.titles(), [title]);
    assert.equal(ui.rows()[0].children[0].attributes['aria-label'], `Complete ${title}`);
    assert.equal(ui.control('new-task-title-1').value, title);
    assert.equal(completion.value, 'Open');
    assert.equal(priority.value, 'High');
  }
  // Other internal whitespace is not collapsed.
  for (const query of ['mixed\nspaces', 'mixed\u00a0spaces']) {
    search.value = query;
    await search.parent.fire('submit');
    assert.deepEqual(ui.titles(), []);
  }
  search.value = ' \t ';
  await search.parent.fire('submit');
  assert.deepEqual(ui.titles(), [title]);
  assert.deepEqual(ui.tasks, saved);
  assert.deepEqual(ui.writes, [{ title }]);
});
