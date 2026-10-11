import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// A small DOM surface runs the shipped UI and its event handlers without dependencies.
class Node {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.disabled = false;
  }
  setAttribute(key, value) { this.attributes[key] = value; }
  get id() { return this.attributes.id; }
  get value() { return this.selectedValue ?? (this.tag === 'select' ? this.children[0]?.value : this.attributes.value) ?? ''; }
  set value(value) { this.selectedValue = value; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  focus() {}
  addEventListener(type, handler) { this.listeners[type] = handler; }
  async fire(type) { await this.listeners[type]({ preventDefault() {} }); }
  find(predicate) {
    if (predicate(this)) return this;
    for (const child of this.children) {
      const match = child.find(predicate);
      if (match) return match;
    }
  }
  querySelector(selector) {
    if (selector === '[role="alert"]') return this.find(node => node.attributes.role === 'alert');
    throw new Error(`Unsupported test selector: ${selector}`);
  }
}

async function projectPage(archived = false, defaultPriority = 'Normal', dates, otherProjects = []) {
  const app = new Node('main');
  const tasks = ['Low', 'Normal', 'High'].flatMap((priority, index) => [
    { id: index * 2 + 1, title: `${priority} open`, priority, completed: false, due_date: '' },
    { id: index * 2 + 2, title: `${priority} completed`, priority, completed: true, due_date: '2026-10-11' },
  ]);
  if (dates) tasks.forEach((task, index) => { task.due_date = dates[index]; });
  const mutations = [];
  const project = { id: 1, name: 'Example', archived: Number(archived), default_priority: defaultPriority, total: 6, completed: 3 };
  const document = {
    querySelector: () => app,
    createElement: tag => new Node(tag),
    getElementById: id => app.find(node => node.id === id),
  };
  runInNewContext(await readFile(new URL('../public/app.js', import.meta.url), 'utf8'), {
    document,
    window: { location: { pathname: '/projects/1' } },
    fetch: async (path, options) => {
      let data;
      if (options?.method === 'PATCH') {
        assert.equal(archived, false);
        const task = path === '/api/projects/1' ? project : tasks.find(task => task.id === Number(path.split('/').at(-1)));
        const changes = JSON.parse(options.body);
        if (changes.due_date === 'invalid date') {
          return { ok: false, json: async () => ({ error: 'Due date must be a valid YYYY-MM-DD date' }) };
        }
        mutations.push(changes);
        if (Object.hasOwn(changes, 'destination_project_id')) {
          assert.ok(otherProjects.some(project => project.id === changes.destination_project_id && !project.archived));
          tasks.splice(tasks.indexOf(task), 1);
        } else Object.assign(task, changes);
        data = task;
      } else if (options?.method === 'POST') {
        assert.equal(archived, false);
        data = { id: tasks.length + 1, title: JSON.parse(options.body).title, completed: false, priority: project.default_priority, due_date: '' };
        tasks.push(data);
      } else if (path === '/api/projects') {
        data = [project, ...otherProjects];
      } else if (path.endsWith('/tasks')) {
        data = tasks;
      } else {
        data = project;
      }
      return { ok: true, json: async () => JSON.parse(JSON.stringify(data)) };
    },
  });
  // Finish initial asynchronous project and task fetches.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.attributes['aria-busy'], 'false');
  const byId = id => document.getElementById(id);
  const list = app.find(node => node.attributes['aria-label'] === 'Tasks');
  const rows = () => list.children;
  const titles = () => rows().map(row => row.children.find(node => node.tag === 'span').textContent);
  const change = async (id, value) => {
    const control = byId(id);
    control.value = value;
    await control.fire('change');
  };
  return { app, project, tasks, mutations, byId, rows, titles, change };
}

test('both task filters intersect in creation order and remain independent on active and archived pages', async () => {
  for (const archived of [false, true]) {
    const page = await projectPage(archived);
    const original = structuredClone(page.tasks);
    assert.deepEqual(page.byId('priority-filter').children.map(option => option.value), ['All', 'Low', 'Normal', 'High']);
    assert.equal(page.byId('priority-filter').value, 'All');
    assert.equal(page.byId('task-filter').value, 'All');
    assert.equal(page.byId('priority-filter').disabled, false);
    assert.equal(page.byId('task-filter').disabled, false);
    for (const completion of ['All', 'Open', 'Completed']) {
      const previousPriority = page.byId('priority-filter').value;
      await page.change('task-filter', completion);
      assert.equal(page.byId('priority-filter').value, previousPriority);
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        await page.change('priority-filter', priority);
        assert.equal(page.byId('task-filter').value, completion);
        assert.deepEqual(page.titles(), page.tasks.filter(task =>
          (priority === 'All' || task.priority === priority) &&
          (completion === 'All' || task.completed === (completion === 'Completed'))
        ).map(task => task.title));
        for (const row of page.rows()) {
          assert.equal(row.attributes['data-testid'], 'task-row');
          assert.equal(row.children[0].disabled, archived);
          const select = row.find(node => node.tag === 'select');
          assert.equal(select.disabled, archived);
          const rename = row.find(node => node.tag === 'form');
          assert.equal(rename.find(node => node.tag === 'input').disabled, archived);
          assert.equal(rename.find(node => node.tag === 'button').disabled, archived);
          const dueInput = row.find(node => node.id?.startsWith('task-due-date-'));
          assert.equal(dueInput.disabled, archived);
          assert.equal(dueInput.value, page.tasks.find(task => `task-due-date-${task.id}` === dueInput.id).due_date);
          assert.equal(row.find(node => node.textContent === 'Save due date').disabled, archived);
        }
      }
      assert.equal(page.byId('priority-filter').value, 'High');
    }
    assert.deepEqual(page.tasks, original);
    assert.deepEqual(page.mutations, []);
  }
});

test('inclusive due ranges intersect both filters, preserve order, and remain usable when archived', async () => {
  const dates = ['', '0001-01-01', '2024-02-29', '2026-10-11', '2026-10-11', '9999-12-31'];
  for (const archived of [false, true]) {
    const page = await projectPage(archived, 'Normal', dates);
    const original = structuredClone(page.tasks);
    const form = page.app.find(node => node.attributes.class === 'due-range-form');
    for (const [id, label] of [['due-from', 'Due from'], ['due-through', 'Due through']]) {
      assert.equal(page.byId(id).value, '');
      assert.equal(page.byId(id).attributes.type, 'text');
      assert.equal(page.byId(id).disabled, false);
      assert.equal(page.app.find(node => node.attributes.for === id).textContent, label);
    }
    assert.equal(form.find(node => node.tag === 'button').textContent, 'Apply due range');
    assert.equal(form.find(node => node.tag === 'button').disabled, false);
    for (const [from, through] of [['', ''], ['0001-01-01', ''], ['', '9999-12-31'],
      ['', '2024-02-29'], ['2026-10-11', ''], ['2026-10-11', '2026-10-11']]) {
      page.byId('due-from').value = ` ${from} `;
      page.byId('due-through').value = ` ${through} `;
      const previousCompletion = page.byId('task-filter').value;
      const previousPriority = page.byId('priority-filter').value;
      await form.fire('submit');
      assert.equal(page.byId('task-filter').value, previousCompletion);
      assert.equal(page.byId('priority-filter').value, previousPriority);
      assert.equal(page.byId('due-from').value, from);
      assert.equal(page.byId('due-through').value, through);
      for (const completion of ['All', 'Open', 'Completed']) {
        await page.change('task-filter', completion);
        for (const priority of ['All', 'Low', 'Normal', 'High']) {
          await page.change('priority-filter', priority);
          assert.deepEqual(page.titles(), page.tasks.filter(task =>
            (completion === 'All' || task.completed === (completion === 'Completed')) &&
            (priority === 'All' || priority === task.priority) &&
            ((!from && !through) || (task.due_date && (!from || task.due_date >= from) && (!through || task.due_date <= through)))
          ).map(task => task.title));
          assert.equal(page.byId('due-from').value, from);
          assert.equal(page.byId('due-through').value, through);
        }
      }
    }
    assert.deepEqual(page.tasks, original);
    assert.deepEqual(page.mutations, []);
    assert.equal(page.project.total, 6);
    assert.equal(page.project.completed, 3);
  }
});

test('invalid ranges preserve applied membership, including after combobox changes', async () => {
  const page = await projectPage();
  const form = page.app.find(node => node.attributes.class === 'due-range-form');
  page.byId('due-from').value = '2026-10-11';
  page.byId('due-through').value = '2026-10-11';
  await form.fire('submit');
  const expected = ['Low completed', 'Normal completed', 'High completed'];
  assert.deepEqual(page.titles(), expected);
  for (const value of ['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2023-02-29',
    '2024-04-31', '2024-00-01', '2024-13-01', '2024-01-00', '2024-01-32', '2024-1-01',
    '24-01-01', '2024-01-01T00:00:00Z', 'hello']) {
    for (const id of ['due-from', 'due-through']) {
      page.byId('due-from').value = '';
      page.byId('due-through').value = '';
      page.byId(id).value = value;
      await form.fire('submit');
      assert.equal(page.app.querySelector('[role="alert"]').textContent, 'Due range must use valid YYYY-MM-DD dates');
      assert.deepEqual(page.titles(), expected);
    }
  }
  page.byId('due-from').value = '2026-10-12';
  page.byId('due-through').value = '2026-10-11';
  await form.fire('submit');
  assert.equal(page.app.querySelector('[role="alert"]').textContent, 'Due from must not be after Due through');
  assert.deepEqual(page.titles(), expected);
  await page.change('priority-filter', 'High');
  assert.deepEqual(page.titles(), ['High completed']);
  await page.change('task-filter', 'Open');
  assert.deepEqual(page.titles(), []);
  for (const date of ['0001-01-01', '0096-02-29', '2000-02-29', '2024-02-29', '9999-12-31']) {
    page.byId('due-from').value = date;
    page.byId('due-through').value = date;
    await form.fire('submit');
    assert.equal(page.app.querySelector('[role="alert"]').hidden, true);
  }
  const reopened = await projectPage();
  assert.equal(reopened.byId('due-from').value, '');
  assert.equal(reopened.byId('due-through').value, '');
  assert.equal(reopened.rows().length, 6);
});

test('task edits refresh range membership while renames, defaults, and creation retain all filters', async () => {
  const page = await projectPage(false, 'Normal', ['', '', '', '', '2026-10-11', '2026-10-11']);
  const range = page.app.find(node => node.attributes.class === 'due-range-form');
  page.byId('due-from').value = '2026-10-11';
  page.byId('due-through').value = '2026-10-11';
  await range.fire('submit');
  await page.change('task-filter', 'Open');
  await page.change('priority-filter', 'High');
  assert.deepEqual(page.titles(), ['High open']);
  page.byId('new-task-title-5').value = 'Renamed';
  await page.rows()[0].find(node => node.attributes.class === 'task-rename-form').fire('submit');
  page.byId('new-project-name').value = 'Renamed project';
  await page.app.find(node => node.tag === 'form' && node.find(child => child.id === 'new-project-name')).fire('submit');
  await page.change('default-task-priority', 'High');
  page.byId('task-title').value = 'New undated';
  await page.app.find(node => node.tag === 'form' && node.find(child => child.id === 'task-title')).fire('submit');
  assert.deepEqual(page.titles(), ['Renamed']);
  page.byId('task-due-date-5').value = '2026-10-12';
  await page.rows()[0].find(node => node.attributes.class === 'task-due-form').fire('submit');
  assert.deepEqual(page.titles(), []);
  page.byId('due-through').value = '';
  await range.fire('submit');
  assert.deepEqual(page.titles(), ['Renamed']);
  await page.change('task-priority-5', 'Low');
  assert.deepEqual(page.titles(), []);
  await page.change('priority-filter', 'Low');
  assert.deepEqual(page.titles(), ['Renamed']);
  const checkbox = page.rows()[0].children[0];
  checkbox.checked = true;
  await checkbox.fire('change');
  assert.deepEqual(page.titles(), []);
  await page.change('task-filter', 'Completed');
  assert.deepEqual(page.titles(), ['Renamed']);
  page.byId('task-due-date-5').value = ' \n\t ';
  await page.rows()[0].find(node => node.attributes.class === 'task-due-form').fire('submit');
  assert.deepEqual(page.titles(), []);
  assert.equal(page.byId('task-filter').value, 'Completed');
  assert.equal(page.byId('priority-filter').value, 'Low');
  assert.equal(page.byId('due-from').value, '2026-10-11');
  assert.equal(page.byId('due-through').value, '');
  assert.equal(page.tasks[4].completed, true);
  assert.equal(page.tasks[4].priority, 'Low');
  assert.equal(page.tasks[4].due_date, '');
});

test('priority, completion, and rename edits refresh matching rows without resetting filters', async () => {
  const page = await projectPage();
  await page.change('task-filter', 'Open');
  await page.change('priority-filter', 'High');
  assert.deepEqual(page.titles(), ['High open']);
  await page.change('task-priority-5', 'Low');
  assert.deepEqual(page.titles(), []);
  assert.equal(page.tasks[4].priority, 'Low');
  assert.equal(page.byId('task-filter').value, 'Open');
  assert.equal(page.byId('priority-filter').value, 'High');
  await page.change('priority-filter', 'Low');
  assert.deepEqual(page.titles(), ['Low open', 'High open']);
  const renameInput = page.byId('new-task-title-5');
  renameInput.value = '  Renamed task  ';
  await page.rows()[1].find(node => node.tag === 'form').fire('submit');
  assert.deepEqual(page.titles(), ['Low open', 'Renamed task']);
  assert.equal(page.rows()[1].children[0].attributes['aria-label'], 'Complete Renamed task');
  assert.equal(page.byId('task-filter').value, 'Open');
  assert.equal(page.byId('priority-filter').value, 'Low');
  assert.equal(page.tasks[4].completed, false);
  assert.equal(page.tasks[4].priority, 'Low');
  const checkbox = page.rows()[1].children[0];
  checkbox.checked = true;
  await checkbox.fire('change');
  assert.deepEqual(page.titles(), ['Low open']);
  assert.equal(page.byId('task-filter').value, 'Open');
  assert.equal(page.byId('priority-filter').value, 'Low');
  await page.change('task-filter', 'Completed');
  assert.deepEqual(page.titles(), ['Low completed', 'Renamed task']);
  assert.equal(page.byId('priority-filter').value, 'Low');
  const completed = page.rows()[1].children[0];
  completed.checked = false;
  await completed.fire('change');
  assert.deepEqual(page.titles(), ['Low completed']);
  assert.equal(page.byId('task-filter').value, 'Completed');
  assert.equal(page.byId('priority-filter').value, 'Low');
  assert.deepEqual(page.mutations, [
    { priority: 'Low' }, { title: 'Renamed task' }, { completed: true }, { completed: false },
  ]);
});


test('default changes preserve both filters and existing tasks, and new tasks inherit the saved default', async () => {
  const page = await projectPage();
  const select = page.byId('default-task-priority');
  assert.deepEqual(select.children.map(option => option.value), ['Low', 'Normal', 'High']);
  assert.equal(select.value, 'Normal');
  assert.equal(select.disabled, false);
  const label = page.app.find(node => node.attributes.for === select.id);
  assert.equal(label.textContent, 'Default task priority');
  await page.change('task-filter', 'Open');
  await page.change('priority-filter', 'High');
  const original = structuredClone(page.tasks);
  await page.change('default-task-priority', 'High');
  assert.equal(page.project.default_priority, 'High');
  assert.equal(page.byId('task-filter').value, 'Open');
  assert.equal(page.byId('priority-filter').value, 'High');
  assert.deepEqual(page.tasks, original);
  assert.deepEqual(page.titles(), ['High open']);
  assert.equal(page.project.total, 6);
  assert.equal(page.project.completed, 3);
  page.byId('task-title').value = '  Inherited high  ';
  const form = page.app.find(node => node.tag === 'form' && node.find(child => child.id === 'task-title'));
  await form.fire('submit');
  assert.deepEqual(page.titles(), ['High open', 'Inherited high']);
  assert.equal(page.tasks.at(-1).priority, 'High');
  await page.change('default-task-priority', 'Low');
  assert.equal(page.tasks.at(-1).priority, 'High');
  assert.deepEqual(page.titles(), ['High open', 'Inherited high']);
  assert.equal(page.byId('task-filter').value, 'Open');
  assert.equal(page.byId('priority-filter').value, 'High');
  const archived = await projectPage(true, 'High');
  assert.equal(archived.byId('default-task-priority').disabled, true);
  assert.equal(archived.byId('default-task-priority').value, 'High');
});

test('due-date saves, errors, clearing, and renaming preserve both filters and task data', async () => {
  const page = await projectPage();
  await page.change('task-filter', 'Completed');
  await page.change('priority-filter', 'High');
  const original = structuredClone(page.tasks);
  const input = page.byId('task-due-date-6');
  assert.equal(input.attributes.type, 'text');
  assert.equal(page.app.find(node => node.attributes.for === input.id).textContent, 'Task due date');
  assert.equal(input.value, '2026-10-11');
  const form = page.rows()[0].find(node => node.attributes.class === 'task-due-form');
  input.value = '  0001-01-01  ';
  await form.fire('submit');
  assert.equal(input.value, '0001-01-01');
  original[5].due_date = '0001-01-01';
  assert.deepEqual(page.tasks, original);
  input.value = 'invalid date';
  await form.fire('submit');
  assert.equal(page.app.querySelector('[role="alert"]').textContent, 'Due date must be a valid YYYY-MM-DD date');
  assert.deepEqual(page.tasks, original);
  assert.equal(page.rows()[0].find(node => node.textContent === 'Save due date').disabled, false);
  page.byId('new-task-title-6').value = 'Renamed dated task';
  await page.rows()[0].find(node => node.attributes.class === 'task-rename-form').fire('submit');
  assert.equal(page.byId('task-due-date-6').value, '0001-01-01');
  original[5].title = 'Renamed dated task';
  assert.deepEqual(page.tasks, original);
  page.byId('task-due-date-6').value = ' \n\t ';
  await page.rows()[0].find(node => node.attributes.class === 'task-due-form').fire('submit');
  assert.equal(page.byId('task-due-date-6').value, '');
  original[5].due_date = '';
  assert.deepEqual(page.tasks, original);
  assert.equal(page.byId('task-filter').value, 'Completed');
  assert.equal(page.byId('priority-filter').value, 'High');
  assert.deepEqual(page.titles(), ['Renamed dated task']);
  assert.equal(page.project.total, 6);
  assert.equal(page.project.completed, 3);
});

test('move controls list only other active projects and moving retains all source filters', async () => {
  const destinations = [
    { id: 2, name: 'Renamed destination', archived: 0 },
    { id: 3, name: 'Archived destination', archived: 1 },
    { id: 4, name: 'Last destination', archived: 0 },
  ];
  const page = await projectPage(false, 'Normal', undefined, destinations);
  const select = page.byId('destination-project-1');
  assert.equal(page.app.find(node => node.attributes.for === select.id).textContent, 'Destination project');
  assert.deepEqual(select.children.map(option => [option.value, option.textContent]), [
    ['2', 'Renamed destination'], ['4', 'Last destination'],
  ]);
  assert.equal(select.disabled, false);
  await page.change('task-filter', 'Completed');
  await page.change('priority-filter', 'High');
  page.byId('due-from').value = '2026-10-11';
  page.byId('due-through').value = '2026-10-11';
  await page.app.find(node => node.attributes.class === 'due-range-form').fire('submit');
  assert.deepEqual(page.titles(), ['High completed']);
  const before = structuredClone(page.tasks);
  page.byId('destination-project-6').value = '4';
  const move = page.rows()[0].find(node => node.attributes.class === 'task-move-form');
  assert.equal(move.find(node => node.tag === 'button').textContent, 'Move task');
  assert.equal(move.find(node => node.tag === 'button').disabled, false);
  await move.fire('submit');
  assert.deepEqual(page.titles(), []);
  assert.deepEqual(page.tasks, before.slice(0, -1));
  assert.deepEqual(page.mutations, [{ destination_project_id: 4 }]);
  assert.equal(page.byId('task-filter').value, 'Completed');
  assert.equal(page.byId('priority-filter').value, 'High');
  assert.equal(page.byId('due-from').value, '2026-10-11');
  assert.equal(page.byId('due-through').value, '2026-10-11');
  await page.change('task-filter', 'All');
  await page.change('priority-filter', 'All');
  page.byId('due-from').value = '';
  page.byId('due-through').value = '';
  await page.app.find(node => node.attributes.class === 'due-range-form').fire('submit');
  assert.deepEqual(page.titles(), before.slice(0, -1).map(task => task.title));
});

test('moves are disabled for archived sources and when no active destination exists', async () => {
  for (const [archived, destinations] of [
    [true, [{ id: 2, name: 'Active', archived: 0 }]],
    [false, []],
    [false, [{ id: 2, name: 'Archived', archived: 1 }]],
  ]) {
    const page = await projectPage(archived, 'Normal', undefined, destinations);
    for (const row of page.rows()) {
      const form = row.find(node => node.attributes.class === 'task-move-form');
      assert.equal(form.find(node => node.tag === 'select').disabled, true);
      assert.equal(form.find(node => node.tag === 'button').disabled, true);
      await form.fire('submit');
    }
    assert.deepEqual(page.mutations, []);
  }
  const restored = await projectPage(false, 'Normal', undefined, [{ id: 2, name: 'Active', archived: 0 }]);
  assert.equal(restored.byId('destination-project-1').disabled, false);
});

test('task search intersects every filter, uses ASCII case only, and remains usable when archived', async () => {
  for (const archived of [false, true]) {
    const page = await projectPage(archived);
    const search = page.byId('task-search');
    const form = page.app.find(node => node.tag === 'form' && node.find(child => child.id === search.id));
    assert.equal(search.attributes.type, 'text');
    assert.equal(search.disabled, false);
    assert.equal(search.value, '');
    assert.equal(page.app.find(node => node.attributes.for === search.id).textContent, 'Task search');
    assert.equal(form.find(node => node.tag === 'button').textContent, 'Search tasks');
    const original = structuredClone(page.tasks);
    search.value = '  oP  ';
    await form.fire('submit');
    assert.deepEqual(page.titles(), ['Low open', 'Normal open', 'High open']);
    // Typing does not apply a new query until submitting.
    search.value = 'completed';
    await page.change('priority-filter', 'High');
    assert.deepEqual(page.titles(), ['High open']);
    page.byId('due-from').value = '2026-10-11';
    await page.app.find(node => node.attributes.class === 'due-range-form').fire('submit');
    assert.deepEqual(page.titles(), []);
    await form.fire('submit');
    assert.deepEqual(page.titles(), ['High completed']);
    await page.change('task-filter', 'Open');
    assert.deepEqual(page.titles(), []);
    search.value = ' \t ';
    await form.fire('submit');
    assert.deepEqual(page.titles(), []);
    await page.change('task-filter', 'Completed');
    assert.deepEqual(page.titles(), ['High completed']);
    assert.equal(page.byId('priority-filter').value, 'High');
    assert.equal(page.byId('due-from').value, '2026-10-11');
    assert.deepEqual(page.tasks, original);
    assert.deepEqual(page.mutations, []);
  }
  const page = await projectPage();
  const title = 'ÉCHO  \t\t Mixed';
  page.byId('new-task-title-1').value = title;
  await page.rows()[0].find(node => node.attributes.class === 'task-rename-form').fire('submit');
  const form = page.app.find(node => node.tag === 'form' && node.find(child => child.id === 'task-search'));
  for (const [query, expected] of [
    ['écho', []], ['ÉcHo  mIX', [title]], ['ÉCHO Mixed', [title]],
    [' \tÉCHO\t \tMiXeD\t ', [title]], ['ÉCHO\nMixed', []],
    ['ÉCHO\u00a0Mixed', []], ['', page.tasks.map(task => task.title)],
  ]) {
    page.byId('task-search').value = query;
    await form.fire('submit');
    assert.deepEqual(page.titles(), expected);
    assert.equal(page.tasks[0].title, title);
  }
});

test('applied task search survives edits, creation, defaults, and movement and re-evaluates renames', async () => {
  const page = await projectPage(false, 'Normal', undefined, [{ id: 2, name: 'Destination', archived: 0 }]);
  const search = page.app.find(node => node.tag === 'form' && node.find(child => child.id === 'task-search'));
  page.byId('task-search').value = 'HIGH';
  await search.fire('submit');
  await page.change('task-filter', 'Completed');
  await page.change('priority-filter', 'High');
  page.byId('due-from').value = '2026-10-11';
  const range = page.app.find(node => node.attributes.class === 'due-range-form');
  await range.fire('submit');
  assert.deepEqual(page.titles(), ['High completed']);
  page.byId('new-task-title-6').value = 'No longer matching';
  await page.rows()[0].find(node => node.attributes.class === 'task-rename-form').fire('submit');
  assert.deepEqual(page.titles(), []);
  assert.equal(page.app.querySelector('[role="alert"]').hidden, true);
  page.byId('new-project-name').value = 'Renamed project';
  await page.app.find(node => node.tag === 'form' && node.find(child => child.id === 'new-project-name')).fire('submit');
  await page.change('default-task-priority', 'High');
  page.byId('task-title').value = 'High newly created';
  await page.app.find(node => node.tag === 'form' && node.find(child => child.id === 'task-title')).fire('submit');
  assert.deepEqual(page.titles(), []);
  await page.change('task-filter', 'Open');
  page.byId('due-from').value = '';
  await range.fire('submit');
  assert.deepEqual(page.titles(), ['High open', 'High newly created']);
  await page.change('task-priority-5', 'Low');
  assert.deepEqual(page.titles(), ['High newly created']);
  const checkbox = page.rows()[0].children[0];
  checkbox.checked = true;
  await checkbox.fire('change');
  assert.deepEqual(page.titles(), []);
  await page.change('task-filter', 'Completed');
  page.byId('task-due-date-7').value = '2026-10-12';
  await page.rows()[0].find(node => node.attributes.class === 'task-due-form').fire('submit');
  page.byId('due-from').value = '2026-10-12';
  await range.fire('submit');
  assert.deepEqual(page.titles(), ['High newly created']);
  await page.rows()[0].find(node => node.attributes.class === 'task-move-form').fire('submit');
  assert.deepEqual(page.titles(), []);
  assert.equal(page.byId('task-search').value, 'HIGH');
  assert.equal(page.byId('task-filter').value, 'Completed');
  assert.equal(page.byId('priority-filter').value, 'High');
  assert.equal(page.byId('due-from').value, '2026-10-12');
  assert.equal((await projectPage()).byId('task-search').value, '');
});

test('project search intersects archive state, preserves summaries and order, and resets on opening', async () => {
  async function openList() {
    const app = new Node('main');
    const projects = [
      { id: 1, name: 'Alpha  Team', archived: false, completed: 2, total: 3 },
      { id: 2, name: 'ALPHA Team', archived: true, completed: 1, total: 4 },
      { id: 3, name: 'Other', archived: false, completed: 0, total: 0 },
      { id: 4, name: 'Last alpha  team', archived: false, completed: 5, total: 5 },
      { id: 5, name: 'ÉCHO', archived: false, completed: 0, total: 0 },
    ];
    const location = { pathname: '/' };
    const mutations = [];
    runInNewContext(await readFile(new URL('../public/app.js', import.meta.url), 'utf8'), {
      document: { querySelector: () => app, createElement: tag => new Node(tag) },
      window: { location },
      fetch: async (path, options) => {
        let data = projects;
        if (options?.method === 'PATCH') {
          data = projects.find(project => project.id === Number(path.split('/').at(-1)));
          const change = JSON.parse(options.body);
          mutations.push(change);
          Object.assign(data, change);
        }
        return { ok: true, json: async () => structuredClone(data) };
      },
    });
    await new Promise(resolve => setImmediate(resolve));
    const byId = id => app.find(node => node.id === id);
    const rows = () => app.find(node => node.attributes['aria-label'] === 'Projects').children;
    const names = () => rows().map(row => row.children[0].textContent);
    const form = app.find(node => node.tag === 'form' && node.find(child => child.id === 'project-search'));
    const search = async query => { byId('project-search').value = query; await form.fire('submit'); };
    return { app, byId, rows, names, form, search, projects, location, mutations };
  }
  const page = await openList();
  assert.equal(page.byId('project-search').value, '');
  assert.equal(page.app.find(node => node.attributes.for === 'project-search').textContent, 'Project search');
  assert.equal(page.form.find(node => node.tag === 'button').textContent, 'Search projects');
  await page.search('  ALpHa  ');
  assert.deepEqual(page.names(), ['Alpha  Team', 'Last alpha  team']);
  assert.deepEqual(page.rows().map(row => row.children[1].textContent), ['2/3 completed', '5/5 completed']);
  const filter = page.byId('project-filter');
  filter.value = 'Archived';
  await filter.fire('change');
  assert.deepEqual(page.names(), ['ALPHA Team']);
  await page.rows()[0].find(node => node.textContent === 'Restore project').fire('click');
  assert.deepEqual(page.names(), []);
  filter.value = 'Active';
  await filter.fire('change');
  assert.deepEqual(page.names(), ['Alpha  Team', 'ALPHA Team', 'Last alpha  team']);
  await page.search('alpha  team');
  assert.deepEqual(page.names(), ['Alpha  Team', 'ALPHA Team', 'Last alpha  team']);
  await page.search(' \tALPHA\t \tTEAM\t ');
  assert.deepEqual(page.names(), ['Alpha  Team', 'ALPHA Team', 'Last alpha  team']);
  await page.search('alpha\nteam');
  assert.deepEqual(page.names(), []);
  await page.search('alpha\u00a0team');
  assert.deepEqual(page.names(), []);
  await page.search('alpha team');
  await page.rows()[0].find(node => node.textContent === 'Archive project').fire('click');
  assert.deepEqual(page.names(), ['ALPHA Team', 'Last alpha  team']);
  await page.rows()[1].find(node => node.textContent === 'Open project').fire('click');
  assert.equal(page.location.href, '/projects/4');
  await page.search('écho');
  assert.deepEqual(page.names(), []);
  await page.search('Écho');
  assert.deepEqual(page.names(), ['ÉCHO']);
  await page.search(' \t ');
  assert.deepEqual(page.names(), ['ALPHA Team', 'Other', 'Last alpha  team', 'ÉCHO']);
  assert.deepEqual(page.mutations, [{ archived: false }, { archived: true }]);
  const reopened = await openList();
  assert.equal(reopened.byId('project-search').value, '');
  assert.equal(reopened.byId('project-filter').value, 'Active');
});
