import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// Exercise the browser's actual rendering and event handlers without dependencies.
class Node {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attributes = {};
    this.events = {};
    this.value = '';
    this.disabled = false;
  }
  setAttribute(key, value) {
    this.attributes[key] = value;
    if (key === 'id') this.id = value;
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  addEventListener(event, handler) { this.events[event] = handler; }
  focus() {}
  async dispatch(event) { await this.events[event]({ preventDefault() {} }); }
}

function descendants(node) {
  return [node, ...node.children.flatMap(descendants)];
}
const find = (node, predicate) => descendants(node).find(predicate);
const byId = (node, id) => find(node, (child) => child.id === id);
const rows = (app) => descendants(app).filter((node) => node.attributes['data-testid'] === 'task-row');
const titles = (app) => rows(app).map((row) => row.children.find((node) => node.tag === 'span').textContent);
const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

async function page(archived = false) {
  const app = new Node('main');
  const tasks = ['Low', 'Normal', 'High'].flatMap((priority, index) => [false, true].map((completed, offset) => ({
    id: index * 2 + offset + 1, project_id: 1, title: `${priority} ${completed ? 'completed' : 'open'}`,
    priority, completed,
  })));
  const writes = [];
  const project = { id: 1, name: 'Filters', archived, default_task_priority: 'Normal', total_count: 6, completed_count: 3 };
  const context = {
    document: { querySelector: () => app, createElement: (tag) => new Node(tag) },
    window: { location: { pathname: '/projects/1' } },
    fetch: async (path, options) => {
      let result;
      if (options) {
        assert.equal(archived, false, 'archived filtering must never edit data');
        const input = JSON.parse(options.body);
        writes.push({ path, input });
        if (options.method === 'POST') {
          result = { id: tasks.length + 1, project_id: 1, title: input.title.trim(), completed: false, priority: project.default_task_priority };
          tasks.push(result);
        } else if (path === '/api/projects/1') {
          Object.assign(project, input);
          result = project;
        } else {
          result = tasks.find((task) => task.id === Number(path.split('/').at(-1)));
          Object.assign(result, input);
        }
      } else if (path.endsWith('/tasks')) result = tasks;
      else result = project;
      return { ok: true, json: async () => structuredClone(result) };
    },
  };
  runInNewContext(source, context);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(app.attributes['aria-busy'], 'false');
  return { app, tasks, writes };
}

test('both filters intersect in creation order, retain each selection, and never write data', async () => {
  for (const archived of [false, true]) {
    const { app, tasks, writes } = await page(archived);
    const completion = byId(app, 'task-filter');
    const priority = byId(app, 'priority-filter');
    assert.equal(completion.value, 'All');
    assert.equal(priority.value, 'All');
    assert.deepEqual(priority.children.map((node) => node.textContent), ['All', 'Low', 'Normal', 'High']);
    assert.equal(find(app, (node) => node.attributes.for === 'priority-filter').textContent, 'Priority filter');
    for (const status of ['All', 'Open', 'Completed']) {
      completion.value = status;
      await completion.dispatch('change');
      for (const level of ['All', 'Low', 'Normal', 'High']) {
        priority.value = level;
        await priority.dispatch('change');
        assert.equal(completion.value, status);
        const expected = tasks.filter((task) => (status === 'All' || task.completed === (status === 'Completed')) &&
          (level === 'All' || task.priority === level));
        assert.deepEqual(titles(app), expected.map((task) => task.title));
        for (const row of rows(app)) {
          const editingControls = descendants(row).filter((node) => ['input', 'select', 'button'].includes(node.tag));
          for (const control of editingControls) assert.equal(control.disabled, archived);
        }
      }
      completion.value = 'All';
      await completion.dispatch('change');
      assert.equal(priority.value, 'High');
    }
    assert.equal(completion.disabled, false);
    assert.equal(priority.disabled, false);
    assert.deepEqual(writes, []);
  }
});

test('priority, completion, rename, and creation re-evaluate rows without resetting filters', async () => {
  const { app, tasks } = await page();
  const completion = byId(app, 'task-filter');
  const priority = byId(app, 'priority-filter');
  async function select(status, level) {
    completion.value = status;
    await completion.dispatch('change');
    priority.value = level;
    await priority.dispatch('change');
  }
  const assertFilters = (status, level) => {
    assert.equal(completion.value, status);
    assert.equal(priority.value, level);
  };
  await select('Open', 'High');
  const title = byId(app, 'new-task-title-5');
  title.value = 'Renamed high';
  await find(rows(app)[0], (node) => node.tag === 'form').dispatch('submit');
  assertFilters('Open', 'High');
  assert.deepEqual(titles(app), ['Renamed high']);
  assert.equal(find(rows(app)[0], (node) => node.attributes.type === 'checkbox').attributes['aria-label'], 'Complete Renamed high');
  const editPriority = byId(app, 'task-priority-5');
  editPriority.value = 'Low';
  await editPriority.dispatch('change');
  assertFilters('Open', 'High');
  assert.deepEqual(titles(app), []);
  assert.equal(tasks[4].priority, 'Low');
  assert.equal(tasks[4].completed, false);
  await select('Open', 'Low');
  assert.deepEqual(titles(app), ['Low open', 'Renamed high']);
  const checkbox = find(rows(app)[1], (node) => node.attributes.type === 'checkbox');
  checkbox.checked = true;
  await checkbox.dispatch('change');
  assertFilters('Open', 'Low');
  assert.deepEqual(titles(app), ['Low open']);
  await select('Completed', 'Low');
  assert.deepEqual(titles(app), ['Low completed', 'Renamed high']);
  await select('Open', 'High');
  byId(app, 'task-title').value = 'New normal task';
  await find(app, (node) => node.tag === 'form' && descendants(node).some((child) => child.id === 'task-title')).dispatch('submit');
  assertFilters('Open', 'High');
  assert.deepEqual(titles(app), []);
  await select('Open', 'Normal');
  assert.deepEqual(titles(app), ['Normal open', 'New normal task']);
});

test('project default control saves independently of filters and existing task rows', async () => {
  const { app, tasks, writes } = await page();
  const completion = byId(app, 'task-filter');
  const priority = byId(app, 'priority-filter');
  completion.value = 'Open';
  await completion.dispatch('change');
  priority.value = 'High';
  await priority.dispatch('change');
  const before = structuredClone(tasks);
  const defaultPriority = byId(app, 'default-task-priority');
  assert.equal(defaultPriority.value, 'Normal');
  assert.equal(defaultPriority.disabled, false);
  assert.equal(find(app, (node) => node.attributes.for === defaultPriority.id).textContent, 'Default task priority');
  assert.deepEqual(defaultPriority.children.map((node) => node.textContent), ['Low', 'Normal', 'High']);
  defaultPriority.value = 'High';
  await defaultPriority.dispatch('change');
  assert.equal(defaultPriority.value, 'High');
  assert.deepEqual(tasks, before);
  assert.deepEqual(titles(app), ['High open']);
  assert.deepEqual(writes, [{ path: '/api/projects/1', input: { default_task_priority: 'High' } }]);
  byId(app, 'task-title').value = 'Inherited high';
  await find(app, (node) => node.tag === 'form' && descendants(node).some((child) => child.id === 'task-title')).dispatch('submit');
  assert.equal(completion.value, 'Open');
  assert.equal(priority.value, 'High');
  assert.deepEqual(titles(app), ['High open', 'Inherited high']);
  defaultPriority.value = 'Low';
  await defaultPriority.dispatch('change');
  assert.equal(completion.value, 'Open');
  assert.equal(priority.value, 'High');
  assert.deepEqual(titles(app), ['High open', 'Inherited high']);
  assert.equal(tasks.at(-1).priority, 'High');
  const archived = await page(true);
  assert.equal(byId(archived.app, 'default-task-priority').value, 'Normal');
  assert.equal(byId(archived.app, 'default-task-priority').disabled, true);
});
