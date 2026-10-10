import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { normalizeDueDate } from '../due-date.js';

// Minimal DOM adapter runs the actual browser event handlers without dependencies.
class Element {
  constructor(tag = 'div') {
    this.tag = tag;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.value = '';
    this.disabled = false;
  }
  append(...elements) { this.children.push(...elements); }
  replaceChildren(...elements) { this.children = elements; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  querySelector(tag) { return this.children.find((child) => child.tag === tag); }
  focus() {}
  async fire(name) { await this.listeners[name]({ preventDefault() {} }); }
}

async function page(archived = false, savedDates = {}, destinations = []) {
  const source = (await readFile(new URL('../public/app.js', import.meta.url), 'utf8'))
    .replace("import { normalizeDueDate } from './due-date.js';", '');
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  for (const id of ['create-project', 'rename-project', 'create-task']) {
    get(id).append(new Element('button'));
  }
  get('task-filter').value = 'all';
  get('priority-filter').value = 'all';
  get('project-filter').value = 'active';
  const tasks = [];
  for (const priority of ['Low', 'Normal', 'High']) {
    for (const completed of [false, true]) {
      tasks.push({ id: tasks.length + 1, title: `${priority} ${completed}`, priority, completed, dueDate: '' });
    }
  }
  for (const [index, date] of Object.entries(savedDates)) tasks[index].dueDate = date;
  const writes = [];
  let refresh;
  const project = { id: 1, name: 'Project', archived, defaultTaskPriority: 'Normal' };
  runInNewContext(source, {
    normalizeDueDate,
    document: { querySelector: (selector) => get(selector.slice(1)), createElement: (tag) => new Element(tag) },
    setInterval: (callback) => { refresh = callback; },
    window: { location: { pathname: '/projects/1' }, addEventListener() {} },
    fetch: async (path, options) => {
      let result;
      if (options) {
        writes.push({ path, ...options });
        const input = JSON.parse(options.body);
        let item;
        if (options.method === 'POST' && path.endsWith('/move')) {
          const index = tasks.findIndex((task) => task.id === Number(path.split('/').at(-2)));
          item = tasks.splice(index, 1)[0];
        } else if (options.method === 'POST' && path.endsWith('/tasks')) {
          item = { id: tasks.length + 1, title: input.title, completed: false, priority: project.defaultTaskPriority, dueDate: '' };
          tasks.push(item);
        } else {
          item = path === '/api/projects/1' ? project : tasks.find((item) => item.id === Number(path.split('/').at(-1)));
        }
        if (Object.hasOwn(input, 'dueDate')) {
          input.dueDate = normalizeDueDate(input.dueDate);
          if (input.dueDate === null) {
            return { ok: false, json: async () => ({ error: 'Due date must be a valid YYYY-MM-DD date' }) };
          }
        }
        Object.assign(item, input);
        result = item;
      } else if (path === '/api/projects') {
        result = [project, ...destinations];
      } else if (path.endsWith('/tasks')) {
        result = tasks;
      } else {
        result = project;
      }
      return { ok: true, json: async () => JSON.parse(JSON.stringify(result)) };
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  const rows = () => get('tasks').children;
  const titles = () => rows().map((row) => row.children[1].textContent);
  const filter = async (id, value) => {
    get(id).value = value;
    await get(id).fire('change');
  };
  return { get, tasks, rows, titles, filter, writes, refresh: () => refresh() };
}

test('move controls list only other active projects and preserve all applied filters', async () => {
  const destinations = [
    { id: 2, name: 'First destination', archived: false },
    { id: 3, name: 'Archived destination', archived: true },
    { id: 4, name: 'Renamed destination', archived: false },
  ];
  const view = await page(false, { 0: '2024-01-01', 1: '2024-01-01' }, destinations);
  await view.filter('priority-filter', 'Low');
  await view.filter('task-filter', 'open');
  view.get('due-from').value = '2024-01-01';
  view.get('due-through').value = '2024-01-01';
  await view.get('due-range').fire('submit');
  const moveForm = view.rows()[0].children[6];
  assert.equal(moveForm.children[0].textContent, 'Destination project');
  const select = moveForm.children[1];
  assert.deepEqual(select.children.map((option) => option.textContent), ['First destination', 'Renamed destination']);
  assert.deepEqual(select.children.map((option) => option.value), ['2', '4']);
  select.value = '4';
  await moveForm.fire('submit');
  assert.deepEqual(view.titles(), []);
  assert.equal(view.get('task-filter').value, 'open');
  assert.equal(view.get('priority-filter').value, 'Low');
  assert.equal(view.get('due-from').value, '2024-01-01');
  assert.equal(view.get('due-through').value, '2024-01-01');
  assert.equal(JSON.parse(view.writes[0].body).destinationProjectId, 4);
  await view.filter('task-filter', 'completed');
  assert.deepEqual(view.titles(), ['Low true']);
  await view.filter('priority-filter', 'Normal');
  assert.deepEqual(view.titles(), []); // The applied date range is still active.
  for (const disabledView of [await page(), await page(true, {}, destinations)]) {
    for (const row of disabledView.rows()) {
      assert.equal(row.children[6].children[1].disabled, true);
      assert.equal(row.children[6].children[2].disabled, true);
    }
  }
});

test('an open destination observes incoming tasks without resetting combined filters', async () => {
  const view = await page(false, { 4: '2033-01-01' });
  await view.filter('task-filter', 'open');
  await view.filter('priority-filter', 'High');
  await applyRange(view, '2033-01-01', '2033-01-01');
  const transferred = { id: 20, title: 'Transferred', completed: false, priority: 'High', dueDate: '2033-01-01' };
  view.tasks.push(transferred);
  await view.refresh();
  assert.deepEqual(view.titles(), ['High false', 'Transferred']);
  assert.equal(view.get('task-filter').value, 'open');
  assert.equal(view.get('priority-filter').value, 'High');
  assert.equal(view.get('due-from').value, '2033-01-01');
  assert.equal(view.get('due-through').value, '2033-01-01');
  view.tasks.splice(view.tasks.findIndex((task) => task.id === 20), 1);
  await view.refresh();
  assert.deepEqual(view.titles(), ['High false']);
  assert.equal(view.writes.length, 0);
});

test('destination selection survives task edits and background refreshes before moving', async () => {
  const view = await page(false, {}, [
    { id: 2, name: 'First', archived: false },
    { id: 3, name: 'Chosen', archived: false },
  ]);
  let row = view.rows()[0];
  const select = row.children[6].children[1];
  select.value = '3';
  await select.fire('change');
  row.children[5].children[1].value = '2033-01-01';
  await row.children[5].fire('submit');
  row = view.rows()[0];
  assert.equal(row.children[6].children[1].value, '3');
  view.tasks[1].title = 'Externally renamed';
  await view.refresh();
  row = view.rows()[0];
  assert.equal(row.children[6].children[1].value, '3');
  await row.children[6].fire('submit');
  assert.equal(JSON.parse(view.writes.at(-1).body).destinationProjectId, 3);
  assert.equal(view.titles().includes('Low false'), false);
});

test('unchanged polling snapshots do not disconnect due-date and completion handlers', async () => {
  const view = await page();
  const row = view.rows()[4];
  await view.refresh();
  const dateForm = row.children[5];
  dateForm.children[1].value = '2029-01-15';
  await dateForm.fire('submit');
  assert.equal(view.tasks[4].dueDate, '2029-01-15');
  assert.equal(view.rows()[4].children[5].children[1].value, '2029-01-15');
  await view.refresh();
  row.children[0].checked = true;
  await row.children[0].fire('change');
  assert.equal(view.rows()[4].children[0].checked, true);
  await view.filter('task-filter', 'completed');
  await view.filter('priority-filter', 'High');
  await applyRange(view, '2029-01-15', '2029-01-15');
  assert.deepEqual(view.titles(), ['High false']);
});

test('unrelated local and remote edits preserve due-date drafts and live row handlers', async () => {
  const view = await page();
  const row = view.rows()[0];
  const dateForm = row.children[5];
  dateForm.children[1].value = '2029-01-15';
  row.children[4].value = 'High';
  await row.children[4].fire('change');
  assert.equal(view.rows()[0], row);
  assert.equal(dateForm.children[1].value, '2029-01-15');
  view.tasks[1].title = 'Remote rename';
  await view.refresh();
  assert.equal(view.rows()[0], row);
  await dateForm.fire('submit');
  assert.equal(view.rows()[0].children[5].children[1].value, '2029-01-15');
  assert.equal(view.tasks[0].priority, 'High');
  assert.equal(view.titles()[1], 'Remote rename');
});

test('completion after polling still matches combined filters before moving', async () => {
  const view = await page(false, { 0: '2033-01-01' }, [
    { id: 2, name: 'Target', archived: false },
  ]);
  await view.refresh();
  let row = view.rows()[0];
  row.children[4].value = 'High';
  await row.children[4].fire('change');
  await view.refresh();
  row.children[0].checked = true;
  await row.children[0].fire('change');
  await view.filter('task-filter', 'completed');
  await view.filter('priority-filter', 'High');
  await applyRange(view, '2033-01-01', '2033-01-01');
  assert.deepEqual(view.titles(), ['Low false']);
  row = view.rows()[0];
  await row.children[6].fire('submit');
  assert.deepEqual(view.titles(), []);
  assert.equal(JSON.parse(view.writes.at(-1).body).destinationProjectId, 2);
  assert.equal(view.get('task-filter').value, 'completed');
  assert.equal(view.get('priority-filter').value, 'High');
  assert.equal(view.get('due-from').value, '2033-01-01');
});

test('combined filters intersect every completion and priority value in creation order without writes', async () => {
  const view = await page();
  assert.equal(view.get('priority-filter').value, 'all');
  assert.equal(view.rows().length, 6);
  for (const completion of ['all', 'open', 'completed']) {
    await view.filter('task-filter', completion);
    for (const priority of ['all', 'Low', 'Normal', 'High']) {
      await view.filter('priority-filter', priority);
      assert.equal(view.get('task-filter').value, completion);
      assert.deepEqual(view.titles(), view.tasks.filter((task) =>
        (completion === 'all' || task.completed === (completion === 'completed')) &&
        (priority === 'all' || task.priority === priority)).map((task) => task.title));
    }
  }
  await view.filter('task-filter', 'open');
  assert.equal(view.get('priority-filter').value, 'High');
  assert.equal(view.writes.length, 0);
});

test('priority, completion and rename edits retain filters and re-evaluate matching rows', async () => {
  const view = await page();
  await view.filter('task-filter', 'open');
  await view.filter('priority-filter', 'High');
  let row = view.rows()[0];
  const rename = row.children[2];
  rename.children[1].value = '  Renamed  ';
  await rename.fire('submit');
  assert.deepEqual(view.titles(), ['Renamed']);
  assert.equal(row.children[0].attributes['aria-label'], 'Complete Renamed');
  assert.equal(view.tasks[4].priority, 'High');
  const priority = row.children[4];
  priority.value = 'Low';
  await priority.fire('change');
  assert.deepEqual(view.titles(), []);
  assert.equal(view.get('task-filter').value, 'open');
  assert.equal(view.get('priority-filter').value, 'High');
  await view.filter('priority-filter', 'Low');
  assert.deepEqual(view.titles(), ['Low false', 'Renamed']);
  row = view.rows()[1];
  row.children[0].checked = true;
  await row.children[0].fire('change');
  assert.deepEqual(view.titles(), ['Low false']);
  assert.equal(view.get('task-filter').value, 'open');
  assert.equal(view.get('priority-filter').value, 'Low');
  await view.filter('task-filter', 'completed');
  assert.deepEqual(view.titles(), ['Low true', 'Renamed']);
  assert.equal(view.tasks[4].completed, true);
  assert.equal(view.tasks[4].priority, 'Low');
  assert.equal(view.writes.length, 3);
});

test('archived projects allow both filters while all row edits remain disabled', async () => {
  const view = await page(true);
  assert.equal(view.get('default-task-priority').disabled, true);
  assert.equal(view.get('default-task-priority').value, 'Normal');
  assert.equal(view.get('task-filter').disabled, false);
  assert.equal(view.get('priority-filter').disabled, false);
  await view.filter('task-filter', 'completed');
  await view.filter('priority-filter', 'Normal');
  assert.deepEqual(view.titles(), ['Normal true']);
  const row = view.rows()[0];
  for (const control of [row.children[0], row.children[2].children[1], row.children[2].children[2], row.children[4], row.children[5].children[1], row.children[5].children[2]]) {
    assert.equal(control.disabled, true);
  }
  assert.equal(view.writes.length, 0);
});

test('changing project defaults preserves selected filters and existing rows', async () => {
  const view = await page();
  const select = view.get('default-task-priority');
  assert.equal(select.value, 'Normal');
  assert.equal(select.disabled, false);
  await view.filter('task-filter', 'completed');
  await view.filter('priority-filter', 'Low');
  const before = JSON.stringify(view.tasks);
  const row = view.rows()[0];
  for (const priority of ['High', 'Low', 'Normal']) {
    select.value = priority;
    await select.fire('change');
    assert.equal(select.value, priority);
    assert.equal(select.disabled, false);
    assert.equal(view.get('task-filter').value, 'completed');
    assert.equal(view.get('priority-filter').value, 'Low');
    assert.deepEqual(view.titles(), ['Low true']);
    assert.equal(view.rows()[0], row);
    assert.equal(JSON.stringify(view.tasks), before);
    assert.deepEqual(JSON.parse(view.writes.at(-1).body), { defaultTaskPriority: priority });
  }
});

test('due-date controls save and clear without changing filters, matching rows or other task data', async () => {
  const view = await page();
  await view.filter('task-filter', 'completed');
  await view.filter('priority-filter', 'High');
  const row = view.rows()[0];
  const form = row.children[5];
  const [label, input, button] = form.children;
  assert.equal(label.textContent, 'Task due date');
  assert.equal(label.htmlFor, input.id);
  assert.equal(input.type, 'text');
  assert.equal(input.value, '');
  assert.equal(button.textContent, 'Save due date');
  assert.equal(input.disabled, false);
  assert.equal(button.disabled, false);
  const before = JSON.stringify(view.tasks.slice(0, 5));
  for (const dueDate of ['2024-02-29', '']) {
    input.value = dueDate;
    await form.fire('submit');
    assert.equal(view.tasks[5].dueDate, dueDate);
    assert.equal(input.value, dueDate);
    assert.equal(view.rows()[0].children[5].children[1].value, dueDate);
    assert.equal(view.get('task-filter').value, 'completed');
    assert.equal(view.get('priority-filter').value, 'High');
    assert.deepEqual(view.titles(), ['High true']);
    assert.equal(view.tasks[5].completed, true);
    assert.equal(view.tasks[5].priority, 'High');
    assert.equal(JSON.stringify(view.tasks.slice(0, 5)), before);
    assert.deepEqual(JSON.parse(view.writes.at(-1).body), { dueDate });
  }
});

test('invalid due dates show an alert and preserve saved data and filters', async () => {
  const view = await page();
  await view.filter('task-filter', 'open');
  await view.filter('priority-filter', 'Normal');
  const form = view.rows()[0].children[5];
  const input = form.children[1];
  input.value = ' 2024-02-29 ';
  await form.fire('submit');
  assert.equal(input.value, '2024-02-29');
  const before = JSON.stringify(view.tasks);
  input.value = '2025-02-29';
  await form.fire('submit');
  assert.equal(view.get('alert').hidden, false);
  assert.equal(view.get('alert').textContent, 'Due date must be a valid YYYY-MM-DD date');
  assert.equal(JSON.stringify(view.tasks), before);
  assert.equal(view.get('task-filter').value, 'open');
  assert.equal(view.get('priority-filter').value, 'Normal');
  assert.equal(form.children[2].disabled, false);
  await view.filter('priority-filter', 'all');
  await view.filter('priority-filter', 'Normal');
  assert.equal(view.rows()[0].children[5].children[1].value, '2024-02-29');
});

test('default priority has an accessible label and exact ordered options', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /<label for="default-task-priority">Default task priority<\/label>/);
  const select = html.match(/<select id="default-task-priority">([\s\S]*?)<\/select>/)[1];
  assert.deepEqual([...select.matchAll(/<option value="([^"]+)"( selected)?>([^<]+)<\/option>/g)]
    .map((match) => [match[1], Boolean(match[2]), match[3]]), [
    ['Low', false, 'Low'], ['Normal', true, 'Normal'], ['High', false, 'High'],
  ]);
});

async function applyRange(view, from, through) {
  view.get('due-from').value = from;
  view.get('due-through').value = through;
  await view.get('due-range').fire('submit');
}

async function seedDates(view) {
  const dates = ['', '0001-01-01', '2024-02-28', '2024-02-29', '2024-03-01', '9999-12-31'];
  for (let index = 0; index < dates.length; index++) {
    const form = view.rows()[index].children[5];
    form.children[1].value = dates[index];
    await form.fire('submit');
  }
}

test('due ranges intersect both filters inclusively, support unbounded sides and exclude undated tasks', async () => {
  const view = await page();
  assert.equal(view.get('due-from').value, '');
  assert.equal(view.get('due-through').value, '');
  await seedDates(view);
  const before = JSON.stringify(view.tasks);
  const writes = view.writes.length;
  for (const [from, through] of [
    ['', ''], ['2024-02-28', '2024-03-01'], ['2024-02-29', '2024-02-29'],
    ['', '2024-02-29'], ['2024-02-29', ''], ['0001-01-01', '9999-12-31'],
  ]) {
    await applyRange(view, ` ${from} `, ` ${through} `);
    assert.equal(view.get('due-from').value, from);
    assert.equal(view.get('due-through').value, through);
    for (const completion of ['all', 'open', 'completed']) {
      await view.filter('task-filter', completion);
      for (const priority of ['all', 'Low', 'Normal', 'High']) {
        await view.filter('priority-filter', priority);
        assert.deepEqual(view.titles(), view.tasks.filter((task) =>
          (completion === 'all' || task.completed === (completion === 'completed')) &&
          (priority === 'all' || task.priority === priority) &&
          (!(from || through) || Boolean(task.dueDate)) &&
          (!from || task.dueDate >= from) && (!through || task.dueDate <= through)
        ).map((task) => task.title));
      }
    }
  }
  assert.equal(JSON.stringify(view.tasks), before);
  assert.equal(view.writes.length, writes);
});

test('invalid range submissions preserve applied membership, including after other filter changes', async () => {
  const view = await page();
  await seedDates(view);
  await applyRange(view, '2024-02-28', '2024-03-01');
  const before = JSON.stringify(view.tasks);
  for (const [from, through, message] of [
    ['2025-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
    ['', '2024-04-31', 'Due range must use valid YYYY-MM-DD dates'],
    ['0000-01-01', '', 'Due range must use valid YYYY-MM-DD dates'],
    ['2024-2-29', '', 'Due range must use valid YYYY-MM-DD dates'],
    ['2024-03-01', '2024-02-29', 'Due from must not be after Due through'],
  ]) {
    await applyRange(view, from, through);
    assert.equal(view.get('alert').hidden, false);
    assert.equal(view.get('alert').textContent, message);
    assert.deepEqual(view.titles(), ['Normal false', 'Normal true', 'High false']);
    await view.filter('task-filter', 'completed');
    assert.deepEqual(view.titles(), ['Normal true']);
    await view.filter('task-filter', 'all');
    assert.equal(JSON.stringify(view.tasks), before);
  }
});

test('edits and creation retain the applied range and both selections while updating membership', async () => {
  const view = await page();
  await seedDates(view);
  await view.filter('task-filter', 'open');
  await view.filter('priority-filter', 'Normal');
  await applyRange(view, '2024-02-28', '2024-03-01');
  const assertFilters = () => {
    assert.equal(view.get('task-filter').value, 'open');
    assert.equal(view.get('priority-filter').value, 'Normal');
    assert.equal(view.get('due-from').value, '2024-02-28');
    assert.equal(view.get('due-through').value, '2024-03-01');
  };
  const rename = view.rows()[0].children[2];
  rename.children[1].value = 'Renamed';
  await rename.fire('submit');
  assert.deepEqual(view.titles(), ['Renamed']);
  view.get('new-project-name').value = 'New project';
  await view.get('rename-project').fire('submit');
  view.get('default-task-priority').value = 'High';
  await view.get('default-task-priority').fire('change');
  view.get('task-title').value = 'New undated task';
  await view.get('create-task').fire('submit');
  assert.deepEqual(view.titles(), ['Renamed']);
  assertFilters();
  // A draft range does not apply until submitted.
  view.get('due-from').value = '';
  view.get('due-through').value = '';
  let form = view.rows()[0].children[5];
  form.children[1].value = '2024-02-29';
  await form.fire('submit');
  assert.deepEqual(view.titles(), ['Renamed']);
  form = view.rows()[0].children[5];
  form.children[1].value = '';
  await form.fire('submit');
  assert.deepEqual(view.titles(), []);
  await applyRange(view, '', '');
  assert.deepEqual(view.titles(), ['Renamed']);
  await applyRange(view, '2024-02-28', '2024-03-01');
  await view.filter('priority-filter', 'High');
  let row = view.rows()[0];
  row.children[4].value = 'Normal';
  await row.children[4].fire('change');
  assert.deepEqual(view.titles(), []);
  await view.filter('priority-filter', 'Normal');
  row = view.rows()[0];
  row.children[0].checked = true;
  await row.children[0].fire('change');
  assert.deepEqual(view.titles(), []);
  assertFilters();
  await view.filter('task-filter', 'completed');
  assert.deepEqual(view.titles(), ['Normal true', 'High false']);
});

test('archived pages permit due range filtering but not task edits; reopening resets the range', async () => {
  const view = await page(true, { 3: '2024-02-29' });
  await applyRange(view, '2024-02-29', '2024-02-29');
  assert.deepEqual(view.titles(), ['Normal true']);
  for (const id of ['due-from', 'due-through', 'due-range']) assert.equal(view.get(id).disabled, false);
  const row = view.rows()[0];
  for (const control of [row.children[0], row.children[2].children[1], row.children[2].children[2], row.children[4], row.children[5].children[1], row.children[5].children[2]]) {
    assert.equal(control.disabled, true);
  }
  assert.equal(view.writes.length, 0);
  const reopened = await page();
  assert.equal(reopened.get('due-from').value, '');
  assert.equal(reopened.get('due-through').value, '');
  assert.equal(reopened.rows().length, 6);
});

test('due range controls have explicit accessible labels and text inputs', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /<label for="due-from">Due from<\/label>/);
  assert.match(html, /<label for="due-through">Due through<\/label>/);
  assert.match(html, /<input id="due-from" type="text"/);
  assert.match(html, /<input id="due-through" type="text"/);
  assert.match(html, /<button type="submit">Apply due range<\/button>/);
});

test('priority filter has an accessible label and exact ordered options', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /<label for="priority-filter">Priority filter<\/label>/);
  const select = html.match(/<select id="priority-filter">([\s\S]*?)<\/select>/)[1];
  assert.deepEqual([...select.matchAll(/<option value="([^"]+)"( selected)?>([^<]+)<\/option>/g)]
    .map((match) => [match[1], Boolean(match[2]), match[3]]), [
    ['all', true, 'All'], ['Low', false, 'Low'], ['Normal', false, 'Normal'], ['High', false, 'High'],
  ]);
});
