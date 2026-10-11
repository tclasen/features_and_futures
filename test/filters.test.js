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

async function projectPage(archived = false, defaultPriority = 'Normal', dates) {
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
        Object.assign(task, changes);
        data = task;
      } else if (options?.method === 'POST') {
        assert.equal(archived, false);
        data = { id: tasks.length + 1, title: JSON.parse(options.body).title, completed: false, priority: project.default_priority, due_date: '' };
        tasks.push(data);
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
