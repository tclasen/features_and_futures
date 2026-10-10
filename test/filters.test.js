import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

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

async function page(archived = false) {
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
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
      tasks.push({ id: tasks.length + 1, title: `${priority} ${completed}`, priority, completed });
    }
  }
  const writes = [];
  const project = { id: 1, name: 'Project', archived, defaultTaskPriority: 'Normal' };
  runInNewContext(source, {
    document: { querySelector: (selector) => get(selector.slice(1)), createElement: (tag) => new Element(tag) },
    window: { location: { pathname: '/projects/1' } },
    fetch: async (path, options) => {
      let result;
      if (options) {
        writes.push({ path, ...options });
        const item = path === '/api/projects/1' ? project : tasks.find((item) => item.id === Number(path.split('/').at(-1)));
        Object.assign(item, JSON.parse(options.body));
        result = item;
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
  return { get, tasks, rows, titles, filter, writes };
}

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
  for (const control of [row.children[0], row.children[2].children[1], row.children[2].children[2], row.children[4]]) {
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

test('default priority has an accessible label and exact ordered options', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /<label for="default-task-priority">Default task priority<\/label>/);
  const select = html.match(/<select id="default-task-priority">([\s\S]*?)<\/select>/)[1];
  assert.deepEqual([...select.matchAll(/<option value="([^"]+)"( selected)?>([^<]+)<\/option>/g)]
    .map((match) => [match[1], Boolean(match[2]), match[3]]), [
    ['Low', false, 'Low'], ['Normal', true, 'Normal'], ['High', false, 'High'],
  ]);
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
