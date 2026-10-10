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

async function page(archived = false) {
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
      savedTasks.push({ id: savedTasks.length + 1, title: `${priority} ${completed ? 'done' : 'open'}`, priority, completed });
    }
  }
  const writes = [];
  const project = { id: 1, name: 'Project', archived: Number(archived) };
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
        const task = savedTasks.find((item) => path.endsWith(`/tasks/${item.id}`));
        assert.ok(task);
        writes.push(patch);
        Object.assign(task, patch);
        data = task;
      } else if (path.endsWith('/tasks')) data = savedTasks;
      else if (path === '/api/projects') {
        data = [{ ...project, total: savedTasks.length, completed: savedTasks.filter((task) => task.completed).length }];
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
