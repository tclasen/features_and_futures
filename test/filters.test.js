import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// A small DOM adapter runs the actual browser event handlers without dependencies.
class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.value = '';
    this.disabled = false;
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(event, handler) { this.listeners[event] = handler; }
  async dispatch(event) { await this.listeners[event]?.({ preventDefault() {} }); }
  querySelector(tag) {
    for (const child of this.children) {
      if (child.tagName === tag) return child;
      const nested = child.querySelector(tag);
      if (nested) return nested;
    }
    return null;
  }
  focus() {}
}

async function page(archived = false, otherProjects = []) {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const elements = new Map();
  for (const match of html.matchAll(/<(\w+)[^>]*\bid="([^"]+)"[^>]*>/g)) {
    const element = new Element(match[1]);
    elements.set(`#${match[2]}`, element);
    if (match[1] === 'form') element.append(new Element('button'));
  }
  for (const match of html.matchAll(/<select id="([^"]+)">([\s\S]*?)<\/select>/g)) {
    const select = elements.get(`#${match[1]}`);
    for (const option of match[2].matchAll(/<option>([^<]+)<\/option>/g)) {
      const element = new Element('option');
      element.textContent = element.value = option[1];
      select.append(element);
    }
    select.value = select.children[0].value;
  }
  const savedTasks = [];
  for (const priority of ['Low', 'Normal', 'High']) {
    for (const completed of [false, true]) {
      savedTasks.push({ id: savedTasks.length + 1, title: `${priority} ${completed ? 'done' : 'open'}`, priority, completed, due_date: '' });
    }
  }
  const writes = [];
  const project = { id: 1, name: 'Project', archived: Number(archived), default_priority: 'Normal' };
  const location = { pathname: '/projects/1' };
  const context = vm.createContext({
    document: { querySelector: (selector) => elements.get(selector), createElement: (tag) => new Element(tag) },
    location,
    history: { pushState: (_state, _title, path) => { location.pathname = path; } },
    window: { addEventListener() {} },
    fetch: async (path, options) => {
      let data;
      if (options) {
        assert.equal(project.archived, 0, 'archived projects must not edit tasks');
        const patch = JSON.parse(options.body);
        if (patch.due_date === 'invalid') {
          return { ok: false, json: async () => ({ error: 'Due date must be a valid YYYY-MM-DD date' }) };
        }
        if (Object.hasOwn(patch, 'due_date')) patch.due_date = patch.due_date.trim();
        if (path === '/api/projects/1') {
          writes.push(patch);
          Object.assign(project, patch);
          data = project;
        } else if (options.method === 'POST') {
          data = { id: savedTasks.length + 1, title: patch.title, priority: project.default_priority, completed: false };
          savedTasks.push(data);
          writes.push(patch);
        } else {
          const task = savedTasks.find((item) => path.endsWith(`/tasks/${item.id}`));
          assert.ok(task);
          writes.push(patch);
          if (Object.hasOwn(patch, 'project_id')) {
            savedTasks.splice(savedTasks.indexOf(task), 1);
          } else Object.assign(task, patch);
          data = task;
        }
      } else if (path.endsWith('/tasks')) data = savedTasks;
      else if (path === '/api/projects') {
        data = [{ ...project, total: savedTasks.length, completed: savedTasks.filter((task) => task.completed).length }, ...otherProjects];
      } else data = project;
      return { ok: true, json: async () => JSON.parse(JSON.stringify(data)) };
    },
  });
  vm.runInContext(readFileSync(new URL('../public/app.js', import.meta.url), 'utf8'), context);
  await vm.runInContext('render()', context);
  const get = (id) => elements.get(`#${id}`);
  const rows = () => get('task-list').children;
  const titles = () => rows().map((row) => row.children[0].children[1].textContent);
  const select = async (id, value) => {
    get(id).value = value;
    await get(id).dispatch('change');
  };
  return { get, rows, titles, select, savedTasks, writes, project, context, location };
}

async function applyRange(ui, from, through) {
  ui.get('due-from').value = from;
  ui.get('due-through').value = through;
  await ui.get('due-range-form').dispatch('submit');
}

async function dateFixture(ui) {
  const dates = ['', '0001-01-01', '2000-02-29', '2026-01-15', '2026-01-15', '9999-12-31'];
  ui.savedTasks.forEach((task, index) => { task.due_date = dates[index]; });
  await vm.runInContext('render()', ui.context);
}

test('inclusive due ranges intersect completion and priority, retain order, and never save data', async () => {
  const ui = await page();
  await dateFixture(ui);
  assert.equal(ui.get('due-from').value, '');
  assert.equal(ui.get('due-through').value, '');
  const original = structuredClone(ui.savedTasks);
  for (const [from, through] of [
    ['', ''], ['0001-01-01', ''], ['', '9999-12-31'], ['2026-01-15', '2026-01-15'],
    ['2000-02-29', '2026-01-15'], ['', '2000-02-29'], ['9999-12-31', ''],
  ]) {
    await applyRange(ui, ` ${from} `, `\t${through} `);
    for (const completion of ['All', 'Open', 'Completed']) {
      await ui.select('task-filter', completion);
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        await ui.select('priority-filter', priority);
        const expected = original.filter((task) =>
          (completion === 'All' || task.completed === (completion === 'Completed')) &&
          (priority === 'All' || task.priority === priority) &&
          ((!from && !through) || (task.due_date && (!from || task.due_date >= from) && (!through || task.due_date <= through))));
        assert.deepEqual(ui.titles(), expected.map((task) => task.title));
        assert.equal(ui.get('task-filter').value, completion);
        assert.equal(ui.get('due-from').value, from);
        assert.equal(ui.get('due-through').value, through);
      }
    }
  }
  assert.deepEqual(ui.savedTasks, original);
  assert.deepEqual(ui.writes, []);
});

test('invalid range applications preserve previous membership and applied boundaries', async () => {
  const ui = await page();
  await dateFixture(ui);
  await applyRange(ui, '2026-01-15', '2026-01-15');
  assert.deepEqual(ui.titles(), ['Normal done', 'High open']);
  for (const value of [
    '0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2026-02-29',
    '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '2026-01-32',
    '2026-1-01', '26-01-01', '2026/01/01', '2026-01-01T00:00:00Z', 'tomorrow',
  ]) {
    for (const [from, through] of [[value, ''], ['', value]]) {
      const rows = ui.rows();
      await applyRange(ui, from, through);
      assert.equal(ui.get('detail-error').hidden, false);
      assert.equal(ui.get('detail-error').textContent, 'Due range must use valid YYYY-MM-DD dates');
      assert.deepEqual(ui.rows(), rows);
      await ui.select('priority-filter', 'All');
      assert.deepEqual(ui.titles(), ['Normal done', 'High open']);
    }
  }
  await applyRange(ui, '2026-01-16', '2026-01-15');
  assert.equal(ui.get('detail-error').textContent, 'Due from must not be after Due through');
  await ui.select('task-filter', 'Open');
  assert.deepEqual(ui.titles(), ['High open']);
  for (const leap of ['0004-02-29', '1600-02-29', '2000-02-29', '2024-02-29']) {
    await applyRange(ui, leap, leap);
    assert.equal(ui.get('detail-error').hidden, true);
  }
  assert.deepEqual(ui.writes, []);
});

test('task edits re-evaluate the applied range and preserve all filter selections', async () => {
  const ui = await page();
  await dateFixture(ui);
  await ui.select('task-filter', 'Open');
  await ui.select('priority-filter', 'High');
  await applyRange(ui, '2026-01-15', '2026-01-15');
  const assertFilters = () => {
    assert.equal(ui.get('task-filter').value, 'Open');
    assert.equal(ui.get('priority-filter').value, 'High');
    assert.equal(ui.get('due-from').value, '2026-01-15');
    assert.equal(ui.get('due-through').value, '2026-01-15');
  };
  const rename = ui.rows()[0].children[2];
  rename.querySelector('input').value = 'Renamed';
  await rename.dispatch('submit');
  assert.deepEqual(ui.titles(), ['Renamed']);
  ui.get('new-project-name').value = 'New project';
  await ui.get('rename-form').dispatch('submit');
  await ui.select('default-task-priority', 'High');
  ui.get('task-title').value = 'Undated new task';
  await ui.get('task-form').dispatch('submit');
  assert.deepEqual(ui.titles(), ['Renamed']);
  assertFilters();
  let due = ui.rows()[0].children[3];
  due.querySelector('input').value = '2026-01-16';
  await due.dispatch('submit');
  assert.deepEqual(ui.titles(), []);
  assertFilters();
  await applyRange(ui, '', '');
  due = ui.rows()[0].children[3];
  due.querySelector('input').value = '2026-01-15';
  await due.dispatch('submit');
  await applyRange(ui, '2026-01-15', '2026-01-15');
  const priority = ui.rows()[0].querySelector('select');
  priority.value = 'Low';
  await priority.dispatch('change');
  assert.deepEqual(ui.titles(), []);
  assertFilters();
  await ui.select('priority-filter', 'Low');
  const checkbox = ui.rows()[0].querySelector('input');
  checkbox.checked = true;
  await checkbox.dispatch('change');
  assert.deepEqual(ui.titles(), []);
  await ui.select('task-filter', 'Completed');
  assert.deepEqual(ui.titles(), ['Renamed']);
  due = ui.rows()[0].children[3];
  due.querySelector('input').value = '  ';
  await due.dispatch('submit');
  assert.deepEqual(ui.titles(), []);
  assert.equal(ui.get('task-filter').value, 'Completed');
  assert.equal(ui.get('priority-filter').value, 'Low');
  ui.location.pathname = '/';
  await vm.runInContext('render()', ui.context);
  assert.equal(ui.get('project-list').children[0].children[0].children[1].textContent, '4/7 completed');
  ui.location.pathname = '/projects/1';
  await vm.runInContext('render()', ui.context);
  assert.equal(ui.get('due-from').value, '');
  assert.equal(ui.get('due-through').value, '');
  assert.equal(ui.rows().length, 7);
});

test('archived projects allow range filtering and retain dates after restoration', async () => {
  const ui = await page(true);
  await dateFixture(ui);
  const original = structuredClone(ui.savedTasks);
  await ui.select('task-filter', 'Completed');
  await ui.select('priority-filter', 'Normal');
  await applyRange(ui, '2026-01-15', '2026-01-15');
  assert.deepEqual(ui.titles(), ['Normal done']);
  assert.equal(ui.get('due-from').disabled, false);
  assert.equal(ui.get('due-through').disabled, false);
  assert.equal(ui.get('due-range-form').querySelector('button').disabled, false);
  const row = ui.rows()[0];
  assert.equal(row.querySelector('input').disabled, true);
  assert.equal(row.querySelector('select').disabled, true);
  assert.equal(row.children[3].querySelector('input').disabled, true);
  assert.equal(row.children[3].querySelector('button').disabled, true);
  assert.deepEqual(ui.writes, []);
  ui.project.archived = 0;
  await vm.runInContext('render()', ui.context);
  assert.deepEqual(ui.savedTasks, original);
  assert.equal(ui.rows()[3].children[3].querySelector('input').value, '2026-01-15');
  assert.equal(ui.rows()[3].children[3].querySelector('input').disabled, false);
});

test('combined filters retain order and selections and re-evaluate after saved task edits', async () => {
  const ui = await page();
  assert.deepEqual(ui.get('priority-filter').children.map((option) => option.textContent), ['All', 'Low', 'Normal', 'High']);
  assert.equal(ui.get('task-filter').value, 'All');
  assert.equal(ui.get('priority-filter').value, 'All');
  const original = structuredClone(ui.savedTasks);
  for (const completion of ['All', 'Open', 'Completed']) {
    await ui.select('task-filter', completion);
    for (const priority of ['All', 'Low', 'Normal', 'High']) {
      await ui.select('priority-filter', priority);
      assert.equal(ui.get('task-filter').value, completion);
      assert.deepEqual(ui.titles(), original.filter((task) =>
        (completion === 'All' || task.completed === (completion === 'Completed')) &&
        (priority === 'All' || task.priority === priority)).map((task) => task.title));
    }
  }
  assert.deepEqual(ui.savedTasks, original);
  assert.deepEqual(ui.writes, []);
  await ui.select('task-filter', 'Open');
  assert.equal(ui.get('priority-filter').value, 'High');
  let row = ui.rows()[0];
  const renameForm = row.children[2];
  renameForm.querySelector('input').value = '  Renamed high task  ';
  await renameForm.dispatch('submit');
  assert.deepEqual(ui.titles(), ['Renamed high task']);
  assert.equal(ui.rows()[0].querySelector('input').attributes['aria-label'], 'Complete Renamed high task');
  row = ui.rows()[0];
  const priority = row.querySelector('select');
  priority.value = 'Low';
  await priority.dispatch('change');
  assert.deepEqual(ui.titles(), []);
  assert.equal(ui.get('task-filter').value, 'Open');
  assert.equal(ui.get('priority-filter').value, 'High');
  await ui.select('priority-filter', 'Low');
  assert.deepEqual(ui.titles(), ['Low open', 'Renamed high task']);
  const checkbox = ui.rows()[1].querySelector('input');
  checkbox.checked = true;
  await checkbox.dispatch('change');
  assert.deepEqual(ui.titles(), ['Low open']);
  assert.equal(ui.get('priority-filter').value, 'Low');
  assert.equal(ui.get('task-filter').value, 'Open');
  await ui.select('task-filter', 'Completed');
  assert.deepEqual(ui.titles(), ['Low done', 'Renamed high task']);
  ui.location.pathname = '/';
  await vm.runInContext('render()', ui.context);
  assert.equal(ui.get('project-list').children[0].children[0].children[1].textContent, '4/6 completed');
  ui.location.pathname = '/projects/1';
  await vm.runInContext('render()', ui.context);
  assert.equal(ui.get('task-filter').value, 'All');
  assert.equal(ui.get('priority-filter').value, 'All');
  assert.equal(ui.rows().length, 6);
});

test('due-date controls save and clear without changing filters, and respect archived state', async () => {
  const ui = await page();
  await ui.select('task-filter', 'Completed');
  await ui.select('priority-filter', 'High');
  const before = structuredClone(ui.savedTasks);
  let form = ui.rows()[0].children[3];
  assert.equal(form.children[0].textContent, 'Task due date');
  assert.equal(form.querySelector('input').type, 'text');
  assert.equal(form.querySelector('input').value, '');
  assert.equal(form.querySelector('button').textContent, 'Save due date');
  form.querySelector('input').value = '  2000-02-29  ';
  await form.dispatch('submit');
  assert.deepEqual(ui.savedTasks, before.map((task) => task.id === 6 ? { ...task, due_date: '2000-02-29' } : task));
  assert.equal(ui.get('task-filter').value, 'Completed');
  assert.equal(ui.get('priority-filter').value, 'High');
  assert.deepEqual(ui.titles(), ['High done']);
  form = ui.rows()[0].children[3];
  assert.equal(form.querySelector('input').value, '2000-02-29');
  form.querySelector('input').value = 'invalid';
  await form.dispatch('submit');
  assert.equal(ui.get('detail-error').hidden, false);
  assert.equal(ui.get('detail-error').textContent, 'Due date must be a valid YYYY-MM-DD date');
  assert.equal(ui.savedTasks[5].due_date, '2000-02-29');
  const rename = ui.rows()[0].children[2];
  rename.querySelector('input').value = 'New title';
  await rename.dispatch('submit');
  assert.equal(ui.rows()[0].children[3].querySelector('input').value, '2000-02-29');
  assert.equal(ui.get('task-filter').value, 'Completed');
  assert.equal(ui.get('priority-filter').value, 'High');
  ui.project.archived = 1;
  await vm.runInContext('render()', ui.context);
  for (const row of ui.rows()) {
    assert.equal(row.children[3].querySelector('input').disabled, true);
    assert.equal(row.children[3].querySelector('button').disabled, true);
  }
  ui.project.archived = 0;
  await vm.runInContext('render()', ui.context);
  form = ui.rows()[5].children[3];
  assert.equal(form.querySelector('input').disabled, false);
  assert.equal(form.querySelector('button').disabled, false);
  assert.equal(form.querySelector('input').value, '2000-02-29');
  form.querySelector('input').value = ' \t ';
  await form.dispatch('submit');
  assert.equal(ui.rows()[5].children[3].querySelector('input').value, '');
  ui.location.pathname = '/';
  await vm.runInContext('render()', ui.context);
  assert.equal(ui.get('project-list').children[0].children[0].children[1].textContent, '3/6 completed');
});

test('archived projects retain usable combined filters while editing stays disabled', async () => {
  const ui = await page(true);
  await ui.select('task-filter', 'Completed');
  await ui.select('priority-filter', 'Normal');
  assert.deepEqual(ui.titles(), ['Normal done']);
  const row = ui.rows()[0];
  assert.equal(row.querySelector('input').disabled, true);
  assert.equal(row.querySelector('select').disabled, true);
  assert.equal(row.children[2].querySelector('input').disabled, true);
  assert.equal(row.children[2].querySelector('button').disabled, true);
  assert.equal(ui.get('task-form').querySelector('button').disabled, true);
  assert.equal(ui.get('priority-filter').disabled, false);
  assert.equal(ui.get('task-filter').disabled, false);
  assert.deepEqual(ui.writes, []);
  const original = structuredClone(ui.savedTasks);
  ui.project.archived = 0;
  await vm.runInContext('render()', ui.context);
  assert.deepEqual(ui.savedTasks, original);
  for (const row of ui.rows()) {
    assert.equal(row.querySelector('input').disabled, false);
    assert.equal(row.querySelector('select').disabled, false);
    assert.equal(row.children[2].querySelector('input').disabled, false);
    assert.equal(row.children[2].querySelector('button').disabled, false);
  }
});

test('project defaults save without resetting filters or editing existing rows', async () => {
  const ui = await page();
  const control = ui.get('default-task-priority');
  assert.deepEqual(control.children.map((option) => option.textContent), ['Low', 'Normal', 'High']);
  assert.equal(control.value, 'Normal');
  assert.equal(control.disabled, false);
  await ui.select('task-filter', 'Open');
  await ui.select('priority-filter', 'High');
  const original = structuredClone(ui.savedTasks);
  const originalRow = ui.rows()[0];
  await ui.select('default-task-priority', 'High');
  assert.equal(ui.project.default_priority, 'High');
  assert.deepEqual(ui.savedTasks, original);
  assert.equal(ui.rows()[0], originalRow);
  assert.equal(ui.get('task-filter').value, 'Open');
  assert.equal(ui.get('priority-filter').value, 'High');
  ui.get('task-title').value = '  Inherited high  ';
  await ui.get('task-form').dispatch('submit');
  assert.deepEqual(ui.titles(), ['High open', 'Inherited high']);
  assert.equal(ui.savedTasks.at(-1).priority, 'High');
  await ui.select('default-task-priority', 'Low');
  ui.get('task-title').value = 'Inherited low';
  await ui.get('task-form').dispatch('submit');
  assert.deepEqual(ui.titles(), ['High open', 'Inherited high']);
  assert.equal(ui.savedTasks.at(-1).priority, 'Low');
  assert.equal(ui.savedTasks.at(-2).priority, 'High');
  assert.equal(ui.get('task-filter').value, 'Open');
  assert.equal(ui.get('priority-filter').value, 'High');
  ui.get('new-project-name').value = 'Renamed project';
  await ui.get('rename-form').dispatch('submit');
  assert.equal(control.value, 'Low');
  ui.project.archived = 1;
  await vm.runInContext('render()', ui.context);
  assert.equal(control.value, 'Low');
  assert.equal(control.disabled, true);
  await ui.select('task-filter', 'Completed');
  await ui.select('priority-filter', 'Normal');
  assert.deepEqual(ui.titles(), ['Normal done']);
  ui.project.archived = 0;
  await vm.runInContext('render()', ui.context);
  assert.equal(control.disabled, false);
  assert.equal(control.value, 'Low');
  assert.deepEqual(ui.savedTasks.slice(0, original.length), original);
  ui.location.pathname = '/';
  await vm.runInContext('render()', ui.context);
  assert.equal(ui.get('project-list').children[0].children[0].children[1].textContent, '3/8 completed');
});

test('move controls list eligible destinations and retain source filters and matching row order', async () => {
  const destinations = [
    { id: 2, name: 'First destination', archived: 0 },
    { id: 3, name: 'Archived destination', archived: 1 },
    { id: 4, name: 'Second destination', archived: 0 },
  ];
  const ui = await page(false, destinations);
  await dateFixture(ui);
  await ui.select('task-filter', 'Completed');
  await ui.select('priority-filter', 'All');
  await applyRange(ui, '0001-01-01', '9999-12-31');
  assert.deepEqual(ui.titles(), ['Low done', 'Normal done', 'High done']);
  const moveForm = ui.rows()[1].children[4];
  assert.equal(moveForm.children[0].textContent, 'Destination project');
  const destination = moveForm.querySelector('select');
  assert.deepEqual(destination.children.map((option) => [option.value, option.textContent]),
    [['2', 'First destination'], ['4', 'Second destination']]);
  assert.equal(destination.disabled, false);
  assert.equal(moveForm.querySelector('button').textContent, 'Move task');
  destination.value = '4';
  await moveForm.dispatch('submit');
  assert.deepEqual(ui.writes, [{ project_id: 4 }]);
  assert.equal(ui.location.pathname, '/projects/1');
  assert.deepEqual(ui.titles(), ['Low done', 'High done']);
  assert.equal(ui.get('task-filter').value, 'Completed');
  assert.equal(ui.get('priority-filter').value, 'All');
  assert.equal(ui.get('due-from').value, '0001-01-01');
  assert.equal(ui.get('due-through').value, '9999-12-31');
  await ui.select('priority-filter', 'Low');
  assert.deepEqual(ui.titles(), ['Low done']);
  assert.equal(ui.get('due-from').value, '0001-01-01');
  destinations[0].name = 'Renamed destination';
  await vm.runInContext('render()', ui.context);
  assert.equal(ui.rows()[0].children[4].querySelector('select').children[0].textContent, 'Renamed destination');
});

test('move controls disable without destinations or when archived, then enable after restoration', async () => {
  const empty = await page();
  for (const row of empty.rows()) {
    const form = row.children[4];
    assert.equal(form.querySelector('select').children.length, 0);
    assert.equal(form.querySelector('select').disabled, true);
    assert.equal(form.querySelector('button').disabled, true);
    await form.dispatch('submit');
  }
  assert.deepEqual(empty.writes, []);
  const ui = await page(true, [{ id: 2, name: 'Destination', archived: 0 }]);
  for (const row of ui.rows()) {
    const form = row.children[4];
    assert.equal(form.querySelector('select').disabled, true);
    assert.equal(form.querySelector('button').disabled, true);
    await form.dispatch('submit');
  }
  assert.deepEqual(ui.writes, []);
  const original = structuredClone(ui.savedTasks);
  ui.project.archived = 0;
  await vm.runInContext('render()', ui.context);
  assert.deepEqual(ui.savedTasks, original);
  for (const row of ui.rows()) {
    assert.equal(row.children[4].querySelector('select').disabled, false);
    assert.equal(row.children[4].querySelector('button').disabled, false);
  }
});

async function search(ui, kind, query) {
  ui.get(`${kind}-search`).value = query;
  await ui.get(`${kind}-search-form`).dispatch('submit');
}

const projectNames = (ui) => ui.get('project-list').children.map((row) => row.children[0].children[0].textContent);

test('project search applies ASCII substring matching, intersects archive filter, and clears on returning', async () => {
  const ui = await page(false, [
    { id: 2, name: 'ALPHA  Plan', archived: 0, completed: 2, total: 3 },
    { id: 3, name: 'Alpha Plan', archived: 0, completed: 0, total: 0 },
    { id: 4, name: 'Old alpha  plan', archived: 1, completed: 1, total: 2 },
    { id: 5, name: 'Équipe', archived: 0, completed: 0, total: 0 },
  ]);
  ui.location.pathname = '/';
  await vm.runInContext('render()', ui.context);
  await search(ui, 'project', '  aLpHa  pL  ');
  assert.deepEqual(projectNames(ui), ['ALPHA  Plan']);
  assert.equal(ui.get('project-search').value, 'aLpHa  pL');
  assert.equal(ui.get('project-list').children[0].children[0].children[1].textContent, '2/3 completed');
  ui.get('project-search').value = 'unapplied draft';
  await ui.select('project-filter', 'Archived');
  assert.deepEqual(projectNames(ui), ['Old alpha  plan']);
  await ui.select('project-filter', 'Active');
  assert.deepEqual(projectNames(ui), ['ALPHA  Plan']);
  await search(ui, 'project', 'é');
  assert.deepEqual(projectNames(ui), [], 'non-ASCII characters remain case sensitive');
  await search(ui, 'project', 'É');
  assert.deepEqual(projectNames(ui), ['Équipe']);
  await search(ui, 'project', '  \t ');
  assert.deepEqual(projectNames(ui), ['Project', 'ALPHA  Plan', 'Alpha Plan', 'Équipe']);
  await search(ui, 'project', 'project');
  ui.location.pathname = '/projects/1';
  await vm.runInContext('render()', ui.context);
  await ui.get('back').dispatch('click');
  await vm.runInContext('render()', ui.context);
  assert.equal(ui.get('project-search').value, '');
  assert.deepEqual(projectNames(ui), ['Project', 'ALPHA  Plan', 'Alpha Plan', 'Équipe']);
  assert.deepEqual(ui.writes, []);
});

test('task search intersects every filter, distinguishes internal whitespace, and stays usable when archived', async () => {
  const ui = await page(true);
  await dateFixture(ui);
  ui.savedTasks[4].title = 'High  OPEN';
  ui.savedTasks[5].title = 'É High done';
  await vm.runInContext('render()', ui.context);
  const original = structuredClone(ui.savedTasks);
  await search(ui, 'task', '  hIgH  ');
  assert.deepEqual(ui.titles(), ['High  OPEN', 'É High done']);
  await ui.select('task-filter', 'Open');
  await ui.select('priority-filter', 'High');
  await applyRange(ui, '2026-01-15', '2026-01-15');
  assert.deepEqual(ui.titles(), ['High  OPEN']);
  await search(ui, 'task', 'high open');
  assert.deepEqual(ui.titles(), []);
  await search(ui, 'task', 'high  open');
  assert.deepEqual(ui.titles(), ['High  OPEN']);
  ui.get('task-search').value = 'unapplied draft';
  await ui.select('priority-filter', 'All');
  assert.deepEqual(ui.titles(), ['High  OPEN']);
  await search(ui, 'task', '  ');
  assert.deepEqual(ui.titles(), ['High  OPEN']);
  await ui.select('task-filter', 'All');
  await applyRange(ui, '', '');
  await search(ui, 'task', 'é');
  assert.deepEqual(ui.titles(), []);
  await search(ui, 'task', 'É');
  assert.deepEqual(ui.titles(), ['É High done']);
  assert.equal(ui.rows()[0].querySelector('input').disabled, true);
  assert.deepEqual(ui.savedTasks, original);
  assert.deepEqual(ui.writes, []);
  await vm.runInContext('render()', ui.context);
  assert.equal(ui.get('task-search').value, '');
  assert.equal(ui.titles().length, 6);
});

test('task search remains applied through renames, edits, creation, defaults and movement', async () => {
  const ui = await page(false, [{ id: 2, name: 'Destination', archived: 0 }]);
  await dateFixture(ui);
  await ui.select('task-filter', 'Open');
  await ui.select('priority-filter', 'High');
  await applyRange(ui, '2026-01-15', '2026-01-15');
  await search(ui, 'task', '  HIGH  ');
  const assertFilters = () => {
    assert.equal(ui.get('task-search').value, 'HIGH');
    assert.equal(ui.get('task-filter').value, 'Open');
    assert.equal(ui.get('priority-filter').value, 'High');
    assert.equal(ui.get('due-from').value, '2026-01-15');
    assert.equal(ui.get('due-through').value, '2026-01-15');
  };
  let rename = ui.rows()[0].children[2];
  rename.querySelector('input').value = 'High revised';
  await rename.dispatch('submit');
  assert.deepEqual(ui.titles(), ['High revised']);
  assert.equal(ui.rows()[0].querySelector('input').attributes['aria-label'], 'Complete High revised');
  ui.get('new-project-name').value = 'Renamed project';
  await ui.get('rename-form').dispatch('submit');
  await ui.select('default-task-priority', 'High');
  ui.get('task-title').value = 'High new';
  await ui.get('task-form').dispatch('submit');
  assert.deepEqual(ui.titles(), ['High revised']);
  let due = ui.rows()[0].children[3];
  due.querySelector('input').value = '2026-01-16';
  await due.dispatch('submit');
  assert.deepEqual(ui.titles(), []);
  assertFilters();
  await applyRange(ui, '', '');
  due = ui.rows()[0].children[3];
  due.querySelector('input').value = '2026-01-15';
  await due.dispatch('submit');
  await applyRange(ui, '2026-01-15', '2026-01-15');
  let priority = ui.rows()[0].querySelector('select');
  priority.value = 'Low';
  await priority.dispatch('change');
  assert.deepEqual(ui.titles(), []);
  assertFilters();
  await ui.select('priority-filter', 'Low');
  const checkbox = ui.rows()[0].querySelector('input');
  checkbox.checked = true;
  await checkbox.dispatch('change');
  assert.deepEqual(ui.titles(), []);
  await ui.select('task-filter', 'Completed');
  rename = ui.rows()[0].children[2];
  rename.querySelector('input').value = 'No longer matching';
  await rename.dispatch('submit');
  assert.deepEqual(ui.titles(), []);
  await search(ui, 'task', 'no longer');
  await ui.rows()[0].children[4].dispatch('submit');
  assert.deepEqual(ui.titles(), []);
  assert.equal(ui.location.pathname, '/projects/1');
  assert.equal(ui.get('task-search').value, 'no longer');
  assert.equal(ui.get('task-filter').value, 'Completed');
  assert.equal(ui.get('priority-filter').value, 'Low');
  assert.equal(ui.get('due-from').value, '2026-01-15');
  assert.equal(ui.get('due-through').value, '2026-01-15');
  ui.location.pathname = '/';
  await vm.runInContext('render()', ui.context);
  assert.equal(ui.get('project-list').children[0].children[0].children[1].textContent, '3/6 completed');
});
