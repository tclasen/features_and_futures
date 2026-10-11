import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { normalizeDueDate } from '../due-date.js';

// Small DOM adapter for exercising the browser controller without dependencies.
class Node {
  constructor(tag, text) {
    this.tag = tag;
    this.textContent = text || '';
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.listeners = {};
    this.value = '';
  }
  append(...nodes) {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
      if (this.tag === 'select' && this.children.length === 1) this.value = node.value;
    }
  }
  prepend(node) { node.parent = this; this.children.unshift(node); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  focus() {}
  remove() { this.parent.children = this.parent.children.filter((child) => child !== this); }
  querySelector(selector) {
    return this.children.find((child) => selector === '[role="alert"]'
      ? child.attributes.role === 'alert' : child.tag === selector)
      || this.children.map((child) => child.querySelector(selector)).find(Boolean);
  }
  async fire(name) { await this.listeners[name]({ preventDefault() {} }); }
}

const browserSource = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const source = `${normalizeDueDate.toString()}\n${browserSource.replace("import { normalizeDueDate } from '/due-date.js';", '')}`;

test('directory is read-only, retains applied filters after invalid ranges, and resets on reopening', async () => {
  const tasks = [
    { id: 1, projectId: 1, projectName: 'Owner only', projectArchived: false, title: 'Alpha  \tTASK', completed: false, priority: 'High', dueDate: '2000-02-29', notes: '  α <b>literal</b>\nlast  ', deleted: false },
    { id: 2, projectId: 1, projectName: 'Owner only', projectArchived: false, title: 'Alpha task done', completed: true, priority: 'Normal', dueDate: '', notes: 'hidden keyword', deleted: false },
    { id: 3, projectId: 1, projectName: 'Owner only', projectArchived: false, title: 'Alpha task deleted', completed: true, priority: 'High', dueDate: '2000-02-29', notes: '', deleted: true },
    { id: 4, projectId: 2, projectName: 'Archived owner', projectArchived: true, title: 'Alpha task archived', completed: false, priority: 'High', dueDate: '2000-02-29', notes: '', deleted: false },
    { id: 5, projectId: 2, projectName: 'Archived owner', projectArchived: true, title: 'Alpha task archived deleted', completed: true, priority: 'High', dueDate: '2000-02-29', notes: '', deleted: true },
  ];
  const original = structuredClone(tasks);
  const navigations = [];
  function open() {
    const app = new Node('main');
    runInNewContext(source, {
      document: { querySelector: () => app, createElement: (tag) => new Node(tag) },
      location: { pathname: '/directory', assign(path) { navigations.push(path); } },
      async fetch(path, options) {
        assert.equal(options, undefined, 'Directory must never write');
        assert.equal(path, '/api/directory');
        return { ok: true, json: async () => structuredClone(tasks) };
      },
    });
    return app;
  }
  const app = open();
  await new Promise((resolve) => setImmediate(resolve));
  const scope = app.children.find((node) => node.className === 'project-filter').children[1];
  const filters = app.children.find((node) => node.className === 'task-filter');
  const completion = filters.children[1];
  const priority = filters.children[3];
  const range = formWithLabel(app, 'Due from');
  const search = formWithLabel(app, 'Directory search');
  const list = app.querySelector('ul');
  const titles = () => list.children.map((row) => row.children[0].textContent);
  assert.deepEqual(scope.children.map((node) => node.textContent), ['Active', 'Archived']);
  assert.deepEqual(completion.children.map((node) => node.textContent), ['All', 'Open', 'Completed', 'Deleted']);
  assert.deepEqual(priority.children.map((node) => node.textContent), ['All', 'Low', 'Normal', 'High']);
  assert.deepEqual(titles(), [tasks[0].title, tasks[1].title]);
  const row = list.children[0];
  assert.equal(row.dataset.testid, 'directory-task-row');
  assert.deepEqual(row.children.slice(0, 6).map((node) => node.dataset.testid), [
    'directory-task-title', 'directory-project-name', 'directory-task-completion',
    'directory-task-priority', 'directory-task-due-date', 'directory-task-notes',
  ]);
  assert.deepEqual(row.children.slice(0, 6).map((node) => node.textContent), [tasks[0].title, 'Owner only', 'Open', 'High', '2000-02-29', tasks[0].notes]);
  assert.ok(list.children.every((row) => row.children.every((node) => ['div', 'button'].includes(node.tag))));
  for (const query of ['hidden keyword', 'Owner only', '<b>']) {
    search.children[1].value = query;
    await search.fire('submit');
    assert.deepEqual(titles(), []);
  }
  search.children[1].value = '  ALPHA\t  TASK  ';
  await search.fire('submit');
  assert.deepEqual(titles(), [tasks[0].title, tasks[1].title]);
  completion.value = 'Open';
  await completion.fire('change');
  priority.value = 'High';
  await priority.fire('change');
  range.children[1].value = range.children[3].value = ' 2000-02-29 ';
  await range.fire('submit');
  assert.deepEqual(titles(), [tasks[0].title]);
  for (const [from, through] of [
    ['1900-02-29', '2000-03-01'],
    ['2000-02-01', '2046-02-30'],
    ['bad', ''],
  ]) {
    range.children[1].value = from;
    range.children[3].value = through;
    await range.fire('submit');
    assert.equal(app.querySelector('[role="alert"]').textContent, 'Due range must use valid YYYY-MM-DD dates');
    assert.equal(range.children[1].value, '2000-02-29');
    assert.equal(range.children[3].value, '2000-02-29');
    assert.deepEqual(titles(), [tasks[0].title]);
    assert.equal(completion.value, 'Open');
    assert.equal(priority.value, 'High');
    assert.equal(search.children[1].value, 'ALPHA\t  TASK');
  }
  range.children[1].value = '2000-03-01';
  await range.fire('submit');
  assert.equal(app.querySelector('[role="alert"]').textContent, 'Due from must not be after Due through');
  assert.equal(range.children[1].value, '2000-02-29');
  assert.equal(range.children[3].value, '2000-02-29');
  assert.deepEqual(titles(), [tasks[0].title]);
  completion.value = 'Deleted';
  await completion.fire('change');
  assert.deepEqual(titles(), [tasks[2].title]);
  scope.value = 'Archived';
  await scope.fire('change');
  assert.deepEqual(titles(), [tasks[4].title]);
  assert.equal(priority.value, 'High');
  assert.equal(completion.value, 'Deleted');
  assert.equal(range.children[1].value, '2000-02-29');
  assert.equal(search.children[1].value, 'ALPHA\t  TASK');
  await list.children[0].children[6].fire('click');
  await app.children.find((node) => node.textContent === 'Projects').fire('click');
  assert.deepEqual(navigations, ['/projects/2', '/']);
  const reopened = open();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(reopened.querySelector('ul').children.map((row) => row.children[0].textContent), [tasks[0].title, tasks[1].title]);
  assert.equal(formWithLabel(reopened, 'Directory search').children[1].value, '');
  assert.equal(formWithLabel(reopened, 'Due from').children[1].value, '');
  assert.equal(formWithLabel(reopened, 'Due from').children[3].value, '');
  assert.deepEqual(tasks, original);
});

for (const scenario of ['active', 'archived', 'no destinations']) {
  test(`task move controls: ${scenario}`, async () => {
    const app = new Node('main');
    const archived = scenario === 'archived';
    const projects = [
      { id: 1, name: 'Source', archived, defaultTaskPriority: 'Normal' },
      { id: 2, name: 'Renamed destination', archived: scenario === 'no destinations' },
      { id: 3, name: 'Archived destination', archived: true },
      { id: 4, name: 'Last destination', archived: scenario === 'no destinations' },
    ];
    const tasks = [1, 2].map((id) => ({
      id, title: `Task ${id}`, completed: true, priority: 'High', dueDate: '2000-02-29',
    }));
    const moves = [];
    runInNewContext(source, {
      document: { querySelector: () => app, createElement: (tag) => new Node(tag) },
      location: { pathname: '/projects/1', assign() { assert.fail('Moving must not navigate'); } },
      async fetch(path, options) {
        let data;
        if (!options) data = path === '/api/projects' ? projects
          : path === '/api/projects/1' ? projects[0] : tasks.map((task) => ({ ...task }));
        else {
          const changes = JSON.parse(options.body);
          moves.push({ path, ...changes });
          data = { ...tasks[0] };
        }
        return { ok: true, json: async () => data };
      },
    });
    await new Promise((resolve) => setImmediate(resolve));
    const filters = app.children.find((node) => node.className === 'task-filter');
    filters.children[1].value = 'Completed';
    await filters.children[1].fire('change');
    filters.children[3].value = 'High';
    await filters.children[3].fire('change');
    const range = app.children.find((node) => node.children[0]?.textContent === 'Due from');
    range.children[1].value = range.children[3].value = '2000-02-29';
    await range.fire('submit');
    const list = app.querySelector('ul');
    const moveForm = list.children[0].children[6];
    const [label, select, button] = moveForm.children;
    assert.equal(label.textContent, 'Destination project');
    assert.equal(label.htmlFor, select.id);
    assert.equal(button.textContent, 'Move task');
    assert.deepEqual(select.children.map((option) => option.textContent), scenario === 'no destinations'
      ? [] : ['Renamed destination', 'Last destination']);
    assert.deepEqual(select.children.map((option) => option.value), scenario === 'no destinations' ? [] : ['2', '4']);
    assert.equal(select.disabled, scenario !== 'active');
    assert.equal(button.disabled, scenario !== 'active');
    select.value = '4';
    await moveForm.fire('submit');
    if (scenario === 'active') {
      assert.deepEqual(moves, [{ path: '/api/projects/1/tasks/1', destinationProjectId: 4 }]);
      assert.deepEqual(list.children.map((row) => row.children[1].textContent), ['Task 2']);
    } else {
      assert.equal(moves.length, 0);
      assert.equal(list.children.length, 2);
    }
    assert.equal(filters.children[1].value, 'Completed');
    assert.equal(filters.children[3].value, 'High');
    assert.equal(range.children[1].value, '2000-02-29');
    assert.equal(range.children[3].value, '2000-02-29');
    filters.children[3].value = 'All';
    await filters.children[3].fire('change');
    assert.equal(list.children.length, scenario === 'active' ? 1 : 2);
  });
}

for (const archived of [false, true]) {
  test(`inclusive due ranges intersect filters (${archived ? 'archived' : 'active'})`, async () => {
    const app = new Node('main');
    const tasks = [
      { id: 1, title: 'Undated', completed: false, priority: 'High', dueDate: '' },
      { id: 2, title: 'Early', completed: false, priority: 'High', dueDate: '0001-01-01' },
      { id: 3, title: 'Leap', completed: false, priority: 'High', dueDate: '2000-02-29' },
      { id: 4, title: 'Done', completed: true, priority: 'High', dueDate: '2000-02-29' },
      { id: 5, title: 'Normal', completed: false, priority: 'Normal', dueDate: '2000-02-29' },
      { id: 6, title: 'Late', completed: false, priority: 'High', dueDate: '9999-12-31' },
    ];
    const original = structuredClone(tasks);
    const project = { id: 1, name: 'Ranges', archived, defaultTaskPriority: 'High' };
    let writes = 0;
    runInNewContext(source, {
      document: { querySelector: () => app, createElement: (tag) => new Node(tag) },
      location: { pathname: '/projects/1', assign() {} },
      async fetch(path, options) {
        let data;
        if (!options) data = path === '/api/projects/1' ? { ...project } : tasks.map((task) => ({ ...task }));
        else {
          writes++;
          const changes = JSON.parse(options.body);
          if (path === '/api/projects/1') {
            Object.assign(project, changes);
            data = { ...project };
          } else if (options.method === 'POST') {
            data = { id: 7, ...changes, priority: project.defaultTaskPriority, completed: false, dueDate: '' };
            tasks.push({ ...data });
          } else {
            const task = tasks.find((task) => path.endsWith(`/${task.id}`));
            Object.assign(task, changes);
            data = { ...task };
          }
        }
        return { ok: true, json: async () => data };
      },
    });
    await new Promise((resolve) => setImmediate(resolve));
    const filters = app.children.find((node) => node.className === 'task-filter');
    const completion = filters.children[1];
    const priority = filters.children[3];
    const range = app.children.find((node) => node.children[0]?.textContent === 'Due from');
    const from = range.children[1];
    const through = range.children[3];
    const titles = () => app.querySelector('ul').children.map((row) => row.children[1].textContent);
    const apply = async (start, end) => {
      from.value = start;
      through.value = end;
      await range.fire('submit');
    };
    assert.equal(from.value, '');
    assert.equal(through.value, '');
    assert.equal(from.type, 'text');
    assert.equal(through.type, 'text');
    assert.equal(range.children[0].htmlFor, from.id);
    assert.equal(range.children[2].textContent, 'Due through');
    assert.equal(range.children[2].htmlFor, through.id);
    assert.equal(range.children[4].textContent, 'Apply due range');
    assert.ok(!from.disabled && !through.disabled && !range.children[4].disabled);
    assert.deepEqual(titles(), tasks.map((task) => task.title));
    await apply('', '0001-01-01');
    assert.deepEqual(titles(), ['Early']);
    await apply('9999-12-31', '');
    assert.deepEqual(titles(), ['Late']);
    await apply(' 2000-02-29 ', ' 2000-02-29 ');
    assert.equal(from.value, '2000-02-29');
    assert.equal(through.value, '2000-02-29');
    assert.deepEqual(titles(), ['Leap', 'Done', 'Normal']);
    completion.value = 'Open';
    await completion.fire('change');
    priority.value = 'High';
    await priority.fire('change');
    assert.deepEqual(titles(), ['Leap']);
    for (const invalid of ['1900-02-29', '0000-01-01', '2000-2-29', '2000-04-31', 'bad']) {
      await apply(invalid, '');
      assert.equal(app.querySelector('[role="alert"]').textContent, 'Due range must use valid YYYY-MM-DD dates');
      assert.deepEqual(titles(), ['Leap']);
    }
    await apply('', '2001-02-29');
    assert.equal(app.querySelector('[role="alert"]').textContent, 'Due range must use valid YYYY-MM-DD dates');
    await apply('2000-03-01', '2000-02-29');
    assert.equal(app.querySelector('[role="alert"]').textContent, 'Due from must not be after Due through');
    assert.deepEqual(titles(), ['Leap']);
    // Draft (including invalid) boundaries do not replace the applied range.
    priority.value = 'All';
    await priority.fire('change');
    assert.deepEqual(titles(), ['Leap', 'Normal']);
    assert.equal(completion.value, 'Open');
    assert.equal(writes, 0);
    assert.deepEqual(tasks, original);
    if (!archived) {
      priority.value = 'High';
      await priority.fire('change');
      const row = () => app.querySelector('ul').children[0];
      const rename = row().children[2];
      rename.children[1].value = 'Renamed';
      await rename.fire('submit');
      assert.deepEqual(titles(), ['Renamed']);
      const renameProject = app.children.find((node) => node.children[0]?.textContent === 'New project name');
      renameProject.children[1].value = 'New name';
      await renameProject.fire('submit');
      const defaults = app.children.find((node) => node.children[0]?.textContent === 'Default task priority');
      defaults.children[1].value = 'Low';
      await defaults.children[1].fire('change');
      const create = app.children.find((node) => node.children[0]?.textContent === 'Task title');
      create.children[1].value = 'New undated';
      await create.fire('submit');
      assert.deepEqual(titles(), ['Renamed']);
      const date = row().children[5];
      date.children[1].value = '2000-03-01';
      await date.fire('submit');
      assert.deepEqual(titles(), []);
      await apply('2000-03-01', '2000-03-01');
      assert.deepEqual(titles(), ['Renamed']);
      const taskPriority = row().children[4];
      taskPriority.value = 'Low';
      await taskPriority.fire('change');
      assert.deepEqual(titles(), []);
      priority.value = 'Low';
      await priority.fire('change');
      assert.deepEqual(titles(), ['Renamed']);
      const checkbox = row().children[0];
      checkbox.checked = true;
      await checkbox.fire('change');
      assert.deepEqual(titles(), []);
      completion.value = 'Completed';
      await completion.fire('change');
      assert.deepEqual(titles(), ['Renamed']);
      assert.equal(priority.value, 'Low');
      assert.equal(from.value, '2000-03-01');
      assert.equal(through.value, '2000-03-01');
    }
    await apply('  ', '\t');
    completion.value = 'All';
    await completion.fire('change');
    priority.value = 'All';
    await priority.fire('change');
    assert.deepEqual(titles(), tasks.map((task) => task.title));
  });
}

for (const archived of [false, true]) {
  test(`due date controls preserve filters and saved values (${archived ? 'archived' : 'active'})`, async () => {
    const app = new Node('main');
    const task = { id: 1, title: 'Task', completed: true, priority: 'High', dueDate: '2000-02-29' };
    let writes = 0;
    runInNewContext(source, {
      document: { querySelector: () => app, createElement: (tag) => new Node(tag) },
      location: { pathname: '/projects/1', assign() {} },
      async fetch(path, options) {
        if (path === '/api/projects/1') return { ok: true, json: async () => ({ id: 1, name: 'Dates', archived, defaultTaskPriority: 'Normal' }) };
        if (!options) return { ok: true, json: async () => [{ ...task }] };
        writes++;
        const changes = JSON.parse(options.body);
        if (changes.dueDate === 'bad') return { ok: false, json: async () => ({ error: 'Due date must be a valid YYYY-MM-DD date' }) };
        Object.assign(task, changes);
        return { ok: true, json: async () => ({ ...task }) };
      },
    });
    await new Promise((resolve) => setImmediate(resolve));
    const filters = app.children.find((node) => node.className === 'task-filter');
    filters.children[1].value = 'Completed';
    await filters.children[1].fire('change');
    filters.children[3].value = 'High';
    await filters.children[3].fire('change');
    const dateForm = () => app.querySelector('ul').children[0].children[5];
    assert.equal(dateForm().children[0].textContent, 'Task due date');
    assert.equal(dateForm().children[0].htmlFor, dateForm().children[1].id);
    assert.equal(dateForm().children[1].type, 'text');
    assert.equal(dateForm().children[1].value, '2000-02-29');
    assert.equal(dateForm().children[2].textContent, 'Save due date');
    assert.equal(dateForm().children[1].disabled, archived);
    assert.equal(dateForm().children[2].disabled, archived);
    if (archived) {
      await dateForm().fire('submit');
      assert.equal(writes, 0);
      return;
    }
    for (const [input, expected] of [[' 0001-01-01 ', '0001-01-01'], ['bad', '0001-01-01'], [' \t ', '']]) {
      dateForm().children[1].value = input;
      await dateForm().fire('submit');
      assert.equal(dateForm().children[1].value, expected);
      assert.equal(task.dueDate, expected);
      assert.equal(filters.children[1].value, 'Completed');
      assert.equal(filters.children[3].value, 'High');
      assert.equal(app.querySelector('ul').children.length, 1);
      if (input === 'bad') assert.equal(app.querySelector('[role="alert"]').textContent, 'Due date must be a valid YYYY-MM-DD date');
    }
    assert.equal(task.completed, true);
    assert.equal(task.priority, 'High');
    assert.equal(writes, 3);
  });
}

for (const archived of [false, true]) {
  test(`combined task filters: ${archived ? 'archived' : 'active'} project`, async () => {
    const app = new Node('main');
    const tasks = ['Low', 'Normal', 'High'].flatMap((priority, index) => [
      { id: index * 2 + 1, title: `${priority} open`, completed: false, priority },
      { id: index * 2 + 2, title: `${priority} done`, completed: true, priority },
    ]);
    const originalTasks = structuredClone(tasks);
    let writes = 0;
    const project = { id: 1, name: 'Example', archived, defaultTaskPriority: 'Normal' };
    let failDefault = false;
    runInNewContext(source, {
      document: { querySelector: () => app, createElement: (tag) => new Node(tag) },
      location: { pathname: '/projects/1', assign() {} },
      async fetch(path, options) {
        let data;
        if (path === '/api/projects/1') {
          if (options) {
            assert.equal(archived, false);
            if (failDefault) return { ok: false, json: async () => ({ error: 'Unable to save default' }) };
            Object.assign(project, JSON.parse(options.body));
          }
          data = { ...project };
        }
        else if (!options) data = tasks.map((task) => ({ ...task }));
        else {
          assert.equal(archived, false);
          writes++;
          const task = tasks.find((task) => path.endsWith(`/${task.id}`));
          Object.assign(task, JSON.parse(options.body));
          data = { ...task };
        }
        return { ok: true, json: async () => data };
      },
    });
    await new Promise((resolve) => setImmediate(resolve));
    const filters = app.children.find((node) => node.className === 'task-filter');
    const completion = filters.children[1];
    const priority = filters.children[3];
    const list = app.querySelector('ul');
    const titles = () => list.children.map((row) => row.children[1].textContent);
    assert.equal(filters.children[2].textContent, 'Priority filter');
    assert.equal(filters.children[2].htmlFor, priority.id);
    assert.equal(completion.value, 'All');
    assert.equal(priority.value, 'All');
    assert.deepEqual(priority.children.map((option) => option.textContent), ['All', 'Low', 'Normal', 'High']);
    assert.ok(!completion.disabled && !priority.disabled);
    // All twelve intersections preserve creation order and never write data.
    for (const completionValue of ['All', 'Open', 'Completed']) {
      completion.value = completionValue;
      await completion.fire('change');
      for (const priorityValue of ['All', 'Low', 'Normal', 'High']) {
        priority.value = priorityValue;
        await priority.fire('change');
        assert.equal(completion.value, completionValue);
        assert.deepEqual(titles(), tasks.filter((task) =>
          (completionValue === 'All' || task.completed === (completionValue === 'Completed'))
          && (priorityValue === 'All' || task.priority === priorityValue)).map((task) => task.title));
      }
      assert.equal(priority.value, 'High');
    }
    assert.equal(writes, 0);
    assert.deepEqual(tasks, originalTasks);
    const defaults = app.children.find((node) => node.children[0]?.textContent === 'Default task priority');
    const defaultSelect = defaults.children[1];
    assert.equal(defaults.children[0].htmlFor, defaultSelect.id);
    assert.deepEqual(defaultSelect.children.map((option) => option.textContent), ['Low', 'Normal', 'High']);
    assert.equal(defaultSelect.value, 'Normal');
    assert.equal(defaultSelect.disabled, archived);
    const visibleBeforeDefault = titles();
    if (archived) {
      await defaultSelect.fire('change');
      assert.equal(project.defaultTaskPriority, 'Normal');
    } else {
      defaultSelect.value = 'High';
      await defaultSelect.fire('change');
      assert.equal(project.defaultTaskPriority, 'High');
      assert.equal(defaultSelect.value, 'High');
      assert.equal(defaultSelect.disabled, false);
      failDefault = true;
      defaultSelect.value = 'Low';
      await defaultSelect.fire('change');
      assert.equal(defaultSelect.value, 'High');
      assert.equal(app.querySelector('[role="alert"]').textContent, 'Unable to save default');
    }
    assert.equal(completion.value, 'Completed');
    assert.equal(priority.value, 'High');
    assert.deepEqual(titles(), visibleBeforeDefault);
    assert.deepEqual(tasks, originalTasks);
    if (archived) {
      assert.equal(list.children.length, 1);
      const row = list.children[0];
      assert.equal(row.children[0].disabled, true);
      assert.equal(row.children[2].children[1].disabled, true);
      assert.equal(row.children[2].children[2].disabled, true);
      assert.equal(row.children[4].disabled, true);
      return;
    }
    completion.value = 'Open';
    await completion.fire('change');
    assert.equal(priority.value, 'High');
    const rename = list.children[0].children[2];
    rename.children[1].value = '  Renamed high  ';
    await rename.fire('submit');
    assert.deepEqual(titles(), ['Renamed high']);
    assert.equal(completion.value, 'Open');
    assert.equal(priority.value, 'High');
    assert.equal(list.children[0].children[0].attributes['aria-label'], 'Complete Renamed high');
    assert.equal(list.children[0].children[4].value, 'High');
    const taskPriority = list.children[0].children[4];
    taskPriority.value = 'Low';
    await taskPriority.fire('change');
    assert.deepEqual(titles(), []);
    assert.equal(completion.value, 'Open');
    assert.equal(priority.value, 'High');
    priority.value = 'Low';
    await priority.fire('change');
    assert.deepEqual(titles(), ['Low open', 'Renamed high']);
    const checkbox = list.children[1].children[0];
    checkbox.checked = true;
    await checkbox.fire('change');
    assert.deepEqual(titles(), ['Low open']);
    assert.equal(completion.value, 'Open');
    assert.equal(priority.value, 'Low');
    completion.value = 'Completed';
    await completion.fire('change');
    assert.deepEqual(titles(), ['Low done', 'Renamed high']);
    assert.equal(priority.value, 'Low');
    assert.deepEqual(tasks[4], { id: 5, title: 'Renamed high', completed: true, priority: 'Low' });
    assert.equal(writes, 3);
  });
}

test('project list: active default, archive/restore, summaries, and creation in either filter', async () => {
  const app = new Node('main');
  const projects = [
    { id: 1, name: 'First', archived: false, completedCount: 1, totalCount: 2 },
    { id: 2, name: 'Second', archived: false, completedCount: 0, totalCount: 0 },
  ];
  let destination;
  runInNewContext(source, {
    document: { querySelector: () => app, createElement: (tag) => new Node(tag) },
    location: { pathname: '/', assign(path) { destination = path; } },
    async fetch(path, options) {
      let data;
      if (!options) data = projects.map((project) => ({ ...project }));
      else if (options.method === 'POST') {
        data = { id: projects.length + 1, name: JSON.parse(options.body).name,
          archived: false, completedCount: 0, totalCount: 0 };
        projects.push({ ...data });
      } else {
        const project = projects.find((project) => path.endsWith(`/${project.id}`));
        Object.assign(project, JSON.parse(options.body));
        data = { ...project };
      }
      return { ok: true, json: async () => data };
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  const filter = app.querySelector('select');
  const list = app.querySelector('ul');
  const names = () => list.children.map((row) => row.children[0].textContent);
  assert.equal(filter.value, 'Active');
  assert.deepEqual(filter.children.map((option) => option.textContent), ['Active', 'Archived']);
  assert.deepEqual(names(), ['First', 'Second']);
  assert.equal(list.children[0].dataset.testid, 'project-row');
  assert.equal(list.children[0].children[1].dataset.testid, 'project-summary');
  assert.equal(list.children[0].children[1].textContent, '1/2 completed');
  assert.equal(list.children[1].children[1].textContent, '0/0 completed');
  assert.equal(list.children[0].children[3].textContent, 'Archive project');
  await list.children[0].children[3].fire('click');
  assert.deepEqual(names(), ['Second']);
  filter.value = 'Archived';
  await filter.fire('change');
  assert.deepEqual(names(), ['First']);
  assert.equal(list.children[0].children[3].textContent, 'Restore project');
  await list.children[0].children[2].fire('click');
  assert.equal(destination, '/projects/1');
  const form = app.querySelector('form');
  form.children[1].value = '  Third  ';
  await form.fire('submit');
  assert.deepEqual(names(), ['First']);
  await list.children[0].children[3].fire('click');
  assert.deepEqual(names(), []);
  filter.value = 'Active';
  await filter.fire('change');
  assert.deepEqual(names(), ['First', 'Second', 'Third']);
  assert.equal(list.children[0].children[1].textContent, '1/2 completed');
});

test('archived project is read-only while task filters still work', async () => {
  const app = new Node('main');
  const tasks = [
    { id: 1, title: 'Open task', completed: false, priority: 'Low' },
    { id: 2, title: 'Done task', completed: true, priority: 'High' },
  ];
  runInNewContext(source, {
    document: { querySelector: () => app, createElement: (tag) => new Node(tag) },
    location: { pathname: '/projects/1', assign() {} },
    async fetch(path, options) {
      assert.equal(options, undefined);
      const data = path === '/api/projects/1'
        ? { id: 1, name: 'Archived example', archived: true } : tasks;
      return { ok: true, json: async () => data };
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(app.querySelector('p').textContent, 'Archived project');
  const renameForm = app.children.find((node) => node.tag === 'form'
    && node.children[0].textContent === 'New project name');
  assert.equal(renameForm.children[1].disabled, true);
  assert.equal(renameForm.children[2].disabled, true);
  renameForm.children[1].value = 'Forbidden rename';
  await renameForm.fire('submit');
  assert.equal(app.querySelector('h1').textContent, 'Archived example');
  const form = app.children.find((node) => node.tag === 'form'
    && node.children[0].textContent === 'Task title');
  assert.equal(form.children[2].disabled, true);
  form.children[1].value = 'Not allowed';
  await form.fire('submit');
  const list = app.querySelector('ul');
  assert.equal(list.children.length, 2);
  assert.ok(list.children.every((row) => row.children[0].disabled));
  for (const row of list.children) {
    const priority = row.children[4];
    assert.equal(priority.disabled, true);
    assert.equal(priority.value, tasks.find((task) => task.title === row.children[1].textContent).priority);
    priority.value = 'Normal';
    await priority.fire('change');
    const rename = row.children[2];
    assert.equal(rename.children[1].disabled, true);
    assert.equal(rename.children[2].disabled, true);
    rename.children[1].value = 'Forbidden';
    await rename.fire('submit');
  }
  const filter = app.querySelector('select');
  for (const [value, title] of [['Open', 'Open task'], ['Completed', 'Done task']]) {
    filter.value = value;
    await filter.fire('change');
    assert.equal(list.children.length, 1);
    assert.equal(list.children[0].children[1].textContent, title);
    assert.equal(list.children[0].children[0].disabled, true);
  }
});

test('project task UI: labels, validation, completion, and filters in creation order', async () => {
  const app = new Node('main');
  const tasks = [];
  const context = {
    document: {
      querySelector: () => app,
      createElement: (tag) => new Node(tag),
    },
    location: { pathname: '/projects/1', assign() {} },
    async fetch(path, options) {
      let data;
      if (path === '/api/projects/1') data = { id: 1, name: 'Example' };
      else if (!options) data = tasks.map((task) => ({ ...task }));
      else if (options.method === 'POST') {
        data = { id: tasks.length + 1, title: JSON.parse(options.body).title, completed: false, priority: 'Normal' };
        tasks.push({ ...data });
      } else {
        const task = tasks.find((task) => path.endsWith(`/${task.id}`));
        Object.assign(task, JSON.parse(options.body));
        data = { ...task };
      }
      return { ok: true, json: async () => data };
    },
  };
  runInNewContext(source, context);
  // The controller's initial render completes through promise microtasks.
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(app.querySelector('h1').textContent, 'Example');
  const form = app.children.find((node) => node.tag === 'form'
    && node.children[0].textContent === 'Task title');
  const [label, input, button] = form.children;
  assert.equal(label.textContent, 'Task title');
  assert.equal(label.htmlFor, input.id);
  assert.equal(button.textContent, 'Create task');
  const filter = app.querySelector('select');
  assert.equal(filter.value, 'All');
  assert.deepEqual(filter.children.map((option) => option.textContent), ['All', 'Open', 'Completed', 'Deleted']);
  const list = app.querySelector('ul');
  input.value = ' \t\n ';
  await form.fire('submit');
  assert.equal(app.querySelector('[role="alert"]').textContent, 'Task title is required');
  assert.equal(list.children.length, 0);
  for (const title of ['  First  ', 'Second']) {
    input.value = title;
    await form.fire('submit');
  }
  assert.equal(app.querySelector('[role="alert"]'), undefined);
  const titles = () => list.children.map((row) => row.children[1].textContent);
  assert.deepEqual(titles(), ['First', 'Second']);
  assert.ok(list.children.every((row) => row.dataset.testid === 'task-row'));
  const priorityLabel = list.children[0].children[3];
  let priority = list.children[0].children[4];
  assert.equal(priorityLabel.textContent, 'Task priority');
  assert.equal(priorityLabel.htmlFor, priority.id);
  assert.deepEqual(priority.children.map((option) => option.textContent), ['Low', 'Normal', 'High']);
  assert.equal(priority.value, 'Normal');
  assert.equal(priority.disabled, false);
  priority.value = 'High';
  await priority.fire('change');
  assert.equal(tasks[0].priority, 'High');
  assert.equal(tasks[1].priority, 'Normal');
  assert.deepEqual(titles(), ['First', 'Second']);
  let checkbox = list.children[0].children[0];
  assert.equal(checkbox.attributes['aria-label'], 'Complete First');
  assert.equal(checkbox.checked, false);
  checkbox.checked = true;
  await checkbox.fire('change');
  assert.equal(tasks[0].completed, true);
  filter.value = 'Open';
  await filter.fire('change');
  assert.deepEqual(titles(), ['Second']);
  filter.value = 'Completed';
  await filter.fire('change');
  assert.deepEqual(titles(), ['First']);
  checkbox = list.children[0].children[0];
  checkbox.checked = false;
  await checkbox.fire('change');
  assert.equal(tasks[0].completed, false);
  assert.deepEqual(titles(), []);
  filter.value = 'All';
  await filter.fire('change');
  assert.deepEqual(titles(), ['First', 'Second']);
  checkbox = list.children[0].children[0];
  checkbox.checked = true;
  await checkbox.fire('change');
  filter.value = 'Completed';
  await filter.fire('change');
  let rename = list.children[0].children[2];
  assert.equal(rename.children[0].textContent, 'New task title');
  assert.equal(rename.children[0].htmlFor, rename.children[1].id);
  assert.equal(rename.children[1].type, 'text');
  assert.equal(rename.children[1].disabled, false);
  assert.equal(rename.children[2].textContent, 'Rename task');
  assert.equal(rename.children[2].disabled, false);
  for (const title of ['', ' \t\n ']) {
    rename.children[1].value = title;
    await rename.fire('submit');
    assert.equal(app.querySelector('[role="alert"]').textContent, 'Task title is required');
    assert.deepEqual(titles(), ['First']);
  }
  rename.children[1].value = '  Renamed task  ';
  await rename.fire('submit');
  assert.equal(app.querySelector('[role="alert"]'), undefined);
  assert.deepEqual(titles(), ['Renamed task']);
  assert.equal(filter.value, 'Completed');
  assert.equal(list.children[0].children[0].checked, true);
  assert.equal(list.children[0].children[0].attributes['aria-label'], 'Complete Renamed task');
  priority = list.children[0].children[4];
  assert.equal(priority.value, 'High');
  priority.value = 'Low';
  await priority.fire('change');
  assert.equal(filter.value, 'Completed');
  assert.deepEqual(titles(), ['Renamed task']);
  assert.equal(list.children[0].children[0].checked, true);
  assert.equal(list.children[0].children[4].value, 'Low');
  filter.value = 'Open';
  await filter.fire('change');
  assert.deepEqual(titles(), ['Second']);
  filter.value = 'All';
  await filter.fire('change');
  assert.deepEqual(titles(), ['Renamed task', 'Second']);
});

test('renaming validates, updates the heading, and preserves the route and task UI', async () => {
  const app = new Node('main');
  const project = { id: 7, name: 'Original', archived: false, totalCount: 1, completedCount: 1 };
  const document = { querySelector: () => app, createElement: (tag) => new Node(tag) };
  let failRename = false;
  const calls = [];
  runInNewContext(source, {
    document,
    location: { pathname: '/projects/7', assign() { assert.fail('Rename must not navigate'); } },
    async fetch(path, options) {
      if (options) {
        calls.push({ path, ...JSON.parse(options.body) });
        assert.equal(options.method, 'PATCH');
        if (failRename) return { ok: false, json: async () => ({ error: 'Unable to rename' }) };
        Object.assign(project, JSON.parse(options.body));
      }
      const data = path === '/api/projects' ? [{ ...project }] : path.endsWith('/tasks')
        ? [{ id: 3, title: 'Saved task', completed: true }] : { ...project };
      return { ok: true, json: async () => data };
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  const form = app.children.find((node) => node.tag === 'form'
    && node.children[0].textContent === 'New project name');
  const [label, input, button] = form.children;
  assert.equal(label.htmlFor, input.id);
  assert.equal(input.type, 'text');
  assert.equal(input.disabled, false);
  assert.equal(button.textContent, 'Rename project');
  assert.equal(button.disabled, false);
  const list = app.querySelector('ul');
  const originalRow = list.children[0];
  const filter = app.querySelector('select');
  filter.value = 'Completed';
  for (const name of ['', ' \t\n ']) {
    input.value = name;
    await form.fire('submit');
    assert.equal(app.querySelector('[role="alert"]').textContent, 'Project name is required');
    assert.equal(app.querySelector('h1').textContent, 'Original');
  }
  assert.equal(calls.length, 0);
  input.value = '  New name  ';
  await form.fire('submit');
  assert.deepEqual(calls, [{ path: '/api/projects/7', name: 'New name' }]);
  assert.equal(app.querySelector('h1').textContent, 'New name');
  assert.equal(document.title, 'New name — Workboard');
  assert.equal(app.querySelector('[role="alert"]'), undefined);
  assert.equal(input.value, '');
  assert.equal(filter.value, 'Completed');
  assert.equal(list.children[0], originalRow);
  assert.equal(originalRow.children[0].checked, true);
  failRename = true;
  input.value = 'Failed name';
  await form.fire('submit');
  assert.equal(app.querySelector('[role="alert"]').textContent, 'Unable to rename');
  assert.equal(app.querySelector('h1').textContent, 'New name');
  assert.equal(button.disabled, false);
});

function searchPage(pathname, projects, tasks = []) {
  const app = new Node('main');
  const writes = [];
  const navigations = [];
  runInNewContext(source, {
    document: { querySelector: () => app, createElement: (tag) => new Node(tag) },
    location: { pathname, assign(path) { navigations.push(path); } },
    async fetch(path, options) {
      let data;
      if (!options) data = path === '/api/projects' ? projects
        : path === '/api/projects/1' ? projects[0] : tasks.map((task) => ({ ...task }));
      else {
        const changes = JSON.parse(options.body);
        writes.push({ path, ...changes });
        if (path === '/api/projects' || path === '/api/projects/1/tasks') {
          data = path === '/api/projects'
            ? { id: projects.length + 1, archived: false, totalCount: 0, completedCount: 0, ...changes }
            : { id: tasks.length + 1, completed: false, priority: projects[0].defaultTaskPriority, dueDate: '', ...changes };
        } else if (path === '/api/projects/1') {
          Object.assign(projects[0], changes);
          data = { ...projects[0] };
        } else {
          const task = tasks.find((task) => path.endsWith(`/${task.id}`));
          Object.assign(task, changes);
          data = { ...task };
        }
      }
      return { ok: true, json: async () => data };
    },
  });
  return { app, writes, navigations };
}

for (const kind of ['project', 'task']) {
  test(`${kind} search collapses only spaces/tabs and preserves original display on reopening`, async () => {
    const originals = ['MiXeD \t  Space', 'mixed space', 'mixed\nspace', 'mixed\u00a0space', 'MIXED\t\tSPACE'];
    const projects = kind === 'project'
      ? originals.map((name, index) => ({ id: index + 1, name, archived: false, completedCount: 0, totalCount: 0 }))
      : [{ id: 1, name: 'Project', archived: false, defaultTaskPriority: 'Normal' }];
    const tasks = kind === 'task'
      ? originals.map((title, index) => ({ id: index + 1, title, completed: false, priority: 'Normal', dueDate: '' }))
      : [];
    const pathname = kind === 'project' ? '/' : '/projects/1';
    const { app, writes } = searchPage(pathname, projects, tasks);
    await new Promise((resolve) => setImmediate(resolve));
    const search = formWithLabel(app, kind === 'project' ? 'Project search' : 'Task search');
    const displayed = (page) => page.querySelector('ul').children.map((row) => row.children[kind === 'project' ? 0 : 1].textContent);
    for (const query of ['mixed space', '\t MiXeD\t \tSPACE \n', 'mixed   space']) {
      await applySearch(search, query);
      assert.deepEqual(displayed(app), [originals[0], originals[1], originals[4]]);
    }
    await applySearch(search, 'mixed\nspace');
    assert.deepEqual(displayed(app), [originals[2]]);
    await applySearch(search, 'mixed\u00a0space');
    assert.deepEqual(displayed(app), [originals[3]]);
    await applySearch(search, '\t  ');
    assert.deepEqual(displayed(app), originals);
    assert.equal(writes.length, 0);
    assert.deepEqual(kind === 'project' ? projects.map((project) => project.name) : tasks.map((task) => task.title), originals);
    const reopened = searchPage(pathname, projects, tasks);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(displayed(reopened.app), originals);
  });
}

for (const archived of [false, true]) {
  test(`multiline notes are plain text and preserve all filters (${archived ? 'archived' : 'active'})`, async () => {
    const project = { id: 1, name: 'Project', archived, defaultTaskPriority: 'Normal' };
    const task = { id: 1, title: 'Matching title', completed: true, priority: 'High', dueDate: '2028-02-29', notes: '' };
    const { app, writes } = searchPage('/projects/1', [project], [task]);
    await new Promise((resolve) => setImmediate(resolve));
    const filters = app.children.find((node) => node.className === 'task-filter');
    filters.children[1].value = 'Completed';
    await filters.children[1].fire('change');
    filters.children[3].value = 'High';
    await filters.children[3].fire('change');
    const range = formWithLabel(app, 'Due from');
    range.children[1].value = range.children[3].value = '2028-02-29';
    await range.fire('submit');
    const search = formWithLabel(app, 'Task search');
    await applySearch(search, 'MATCHING');
    const notesForm = () => app.querySelector('ul').children[0].children.find((node) => node.children[0]?.textContent === 'Task notes');
    assert.equal(notesForm().children[0].htmlFor, notesForm().children[1].id);
    assert.equal(notesForm().children[1].tag, 'textarea');
    assert.equal(notesForm().children[1].value, '');
    assert.equal(notesForm().children[2].textContent, 'Save notes');
    assert.equal(notesForm().children[1].disabled, archived);
    assert.equal(notesForm().children[2].disabled, archived);
    const text = '  Unicode 雪\n\n<script>notes-only</script>\n trailing  ';
    notesForm().children[1].value = text;
    await notesForm().fire('submit');
    if (archived) {
      assert.equal(writes.length, 0);
      assert.equal(task.notes, '');
      return;
    }
    assert.equal(task.notes, text);
    assert.equal(notesForm().children[1].value, text);
    assert.equal(notesForm().children[1].children.length, 0);
    assert.deepEqual(writes, [{ path: '/api/projects/1/tasks/1', notes: text }]);
    assert.equal(filters.children[1].value, 'Completed');
    assert.equal(filters.children[3].value, 'High');
    assert.equal(range.children[1].value, '2028-02-29');
    assert.equal(range.children[3].value, '2028-02-29');
    assert.equal(search.children[1].value, 'MATCHING');
    await applySearch(search, 'notes-only');
    assert.equal(app.querySelector('ul').children.length, 0);
    await applySearch(search, 'matching');
    notesForm().children[1].value = '';
    await notesForm().fire('submit');
    assert.equal(notesForm().children[1].value, '');
    assert.deepEqual(task, { id: 1, title: 'Matching title', completed: true, priority: 'High', dueDate: '2028-02-29', notes: '' });
  });
}

for (const archived of [false, true]) {
  test(`deleted tasks intersect filters and are read-only (${archived ? 'archived' : 'active'})`, async () => {
    const projects = [
      { id: 1, name: 'Source', archived, defaultTaskPriority: 'Low' },
      { id: 2, name: 'Destination', archived: false },
    ];
    const tasks = [
      { id: 1, title: 'Matching first', completed: true, priority: 'High', dueDate: '2028-02-29', notes: '  saved\n雪 ', deleted: false },
      { id: 2, title: 'Matching second', completed: false, priority: 'High', dueDate: '2028-02-29', notes: '', deleted: true },
      { id: 3, title: 'Other', completed: true, priority: 'Low', dueDate: '', notes: '', deleted: true },
    ];
    const { app, writes } = searchPage('/projects/1', projects, tasks);
    await new Promise((resolve) => setImmediate(resolve));
    const list = app.querySelector('ul');
    const filters = app.children.find((node) => node.className === 'task-filter');
    const completion = filters.children[1];
    const priority = filters.children[3];
    const titles = () => list.children.map((row) => row.children[1].textContent);
    assert.deepEqual(titles(), ['Matching first']);
    const deleteButton = list.children[0].children.at(-1);
    assert.equal(deleteButton.textContent, 'Delete task');
    assert.equal(deleteButton.disabled, archived);
    if (!archived) {
      await deleteButton.fire('click');
      assert.deepEqual(titles(), []);
    }
    for (const value of ['Open', 'Completed']) {
      completion.value = value;
      await completion.fire('change');
      assert.deepEqual(titles(), archived && value === 'Completed' ? ['Matching first'] : []);
    }
    completion.value = 'Deleted';
    await completion.fire('change');
    priority.value = 'High';
    await priority.fire('change');
    const range = formWithLabel(app, 'Due from');
    range.children[1].value = range.children[3].value = '2028-02-29';
    await range.fire('submit');
    const search = formWithLabel(app, 'Task search');
    await applySearch(search, 'MATCHING');
    assert.deepEqual(titles(), archived ? ['Matching second'] : ['Matching first', 'Matching second']);
    const row = list.children[0];
    assert.equal(row.children[0].disabled, true);
    assert.equal(row.children[4].disabled, true);
    for (const index of [2, 5, 6, 7]) {
      assert.equal(row.children[index].children[1].disabled, true);
      assert.equal(row.children[index].children[2].disabled, true);
    }
    const restoreButton = row.children.at(-1);
    assert.equal(restoreButton.textContent, 'Restore task');
    assert.equal(restoreButton.disabled, archived);
    await restoreButton.fire('click');
    if (archived) {
      assert.equal(writes.length, 0);
      assert.deepEqual(titles(), ['Matching second']);
    } else {
      assert.deepEqual(titles(), ['Matching second']);
      assert.deepEqual(writes, [
        { path: '/api/projects/1/tasks/1', deleted: true },
        { path: '/api/projects/1/tasks/1', deleted: false },
      ]);
      assert.equal(completion.value, 'Deleted');
      assert.equal(priority.value, 'High');
      assert.equal(range.children[1].value, '2028-02-29');
      assert.equal(range.children[3].value, '2028-02-29');
      assert.equal(search.children[1].value, 'MATCHING');
      completion.value = 'Completed';
      await completion.fire('change');
      assert.deepEqual(titles(), ['Matching first']);
      assert.equal(list.children[0].children[7].children[1].value, '  saved\n雪 ');
      assert.equal(list.children[0].children[7].children[1].disabled, false);
    }
  });
}

for (const archived of [false, true]) {
  test(`project download is available independently of filters (${archived ? 'archived' : 'active'})`, async () => {
    const projects = [{ id: 1, name: 'Export', archived, defaultTaskPriority: 'Normal' }];
    const tasks = [{ id: 1, title: 'Saved', completed: true, priority: 'High', dueDate: '2028-02-29', notes: '雪', deleted: true }];
    const { app, writes, navigations } = searchPage('/projects/1', projects, tasks);
    await new Promise((resolve) => setImmediate(resolve));
    const download = app.children.find((node) => node.tag === 'button' && node.textContent === 'Download project');
    assert.ok(download);
    assert.equal(download.type, 'button');
    assert.ok(!download.disabled);
    const filters = app.children.find((node) => node.className === 'task-filter');
    filters.children[1].value = 'Deleted';
    await filters.children[1].fire('change');
    filters.children[3].value = 'High';
    await filters.children[3].fire('change');
    const range = formWithLabel(app, 'Due from');
    range.children[1].value = range.children[3].value = '2028-02-29';
    await range.fire('submit');
    await applySearch(formWithLabel(app, 'Task search'), 'no match');
    assert.equal(app.querySelector('ul').children.length, 0);
    await download.fire('click');
    assert.deepEqual(navigations, ['/api/projects/1/export']);
    assert.ok(app.children.includes(download));
    assert.ok(!download.disabled);
    assert.equal(filters.children[1].value, 'Deleted');
    assert.equal(filters.children[3].value, 'High');
    assert.equal(range.children[1].value, '2028-02-29');
    assert.equal(range.children[3].value, '2028-02-29');
    assert.equal(formWithLabel(app, 'Task search').children[1].value, 'no match');
    assert.equal(writes.length, 0);
  });
}

const formWithLabel = (app, label) => app.children.find((node) => node.children[0]?.textContent === label);
async function applySearch(form, query) {
  form.children[1].value = query;
  await form.fire('submit');
}

test('project search is applied, ASCII-only, ordered and intersects archive filter', async () => {
  const projects = [
    { id: 1, name: 'Alpha  PLAN', archived: false, completedCount: 1, totalCount: 2 },
    { id: 2, name: 'alpha plan', archived: false, completedCount: 0, totalCount: 0 },
    { id: 3, name: 'Alpha  archived', archived: true, completedCount: 2, totalCount: 2 },
    { id: 4, name: 'Älpha', archived: false, completedCount: 0, totalCount: 0 },
  ];
  const { app, writes } = searchPage('/', projects);
  await new Promise((resolve) => setImmediate(resolve));
  const search = formWithLabel(app, 'Project search');
  const filter = app.children.find((node) => node.className === 'project-filter').children[1];
  const names = () => app.querySelector('ul').children.map((row) => row.children[0].textContent);
  assert.equal(search.children[1].value, '');
  assert.equal(search.children[0].htmlFor, search.children[1].id);
  assert.equal(search.children[1].type, 'text');
  assert.equal(search.children[2].textContent, 'Search projects');
  await applySearch(search, '  ALPHA  ');
  assert.deepEqual(names(), ['Alpha  PLAN', 'alpha plan']);
  assert.equal(app.querySelector('ul').children[0].children[1].textContent, '1/2 completed');
  filter.value = 'Archived';
  await filter.fire('change');
  assert.deepEqual(names(), ['Alpha  archived']);
  assert.equal(search.children[1].value, 'ALPHA');
  filter.value = 'Active';
  await filter.fire('change');
  await applySearch(search, 'alpha  ');
  await applySearch(search, 'alpha \t  p');
  assert.deepEqual(names(), ['Alpha  PLAN', 'alpha plan']);
  search.children[1].value = 'draft';
  await filter.fire('change');
  assert.deepEqual(names(), ['Alpha  PLAN', 'alpha plan']);
  await applySearch(search, 'älpha');
  assert.deepEqual(names(), []);
  await applySearch(search, 'ÄLPHA');
  assert.deepEqual(names(), ['Älpha']);
  await applySearch(search, ' \t ');
  assert.deepEqual(names(), ['Alpha  PLAN', 'alpha plan', 'Älpha']);
  assert.equal(writes.length, 0);
  await applySearch(search, 'alpha');
  await app.querySelector('ul').children[0].children[3].fire('click');
  assert.deepEqual(names(), ['alpha plan']);
  const reopened = searchPage('/', projects);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(formWithLabel(reopened.app, 'Project search').children[1].value, '');
  assert.deepEqual(reopened.app.querySelector('ul').children.map((row) => row.children[0].textContent), ['alpha plan', 'Älpha']);
});

for (const archived of [false, true]) {
  test(`task search intersects all filters and retains applied state (${archived ? 'archived' : 'active'})`, async () => {
    const project = { id: 1, name: 'Project', archived, defaultTaskPriority: 'High' };
    const tasks = [
      { id: 1, title: 'Alpha  PLAN', completed: false, priority: 'High', dueDate: '2000-02-29' },
      { id: 2, title: 'alpha plan', completed: true, priority: 'High', dueDate: '2000-02-29' },
      { id: 3, title: 'Other', completed: false, priority: 'Normal', dueDate: '' },
    ];
    const { app, writes } = searchPage('/projects/1', [project, { id: 2, name: 'Destination', archived: false }], tasks);
    await new Promise((resolve) => setImmediate(resolve));
    const search = formWithLabel(app, 'Task search');
    const range = formWithLabel(app, 'Due from');
    const filters = app.children.find((node) => node.className === 'task-filter');
    const completion = filters.children[1];
    const priority = filters.children[3];
    const titles = () => app.querySelector('ul').children.map((row) => row.children[1].textContent);
    const row = () => app.querySelector('ul').children[0];
    assert.equal(search.children[1].value, '');
    assert.equal(search.children[0].htmlFor, search.children[1].id);
    assert.equal(search.children[2].textContent, 'Search tasks');
    await applySearch(search, ' ALPHA ');
    assert.deepEqual(titles(), ['Alpha  PLAN', 'alpha plan']);
    completion.value = 'Open';
    await completion.fire('change');
    priority.value = 'High';
    await priority.fire('change');
    range.children[1].value = range.children[3].value = '2000-02-29';
    await range.fire('submit');
    assert.deepEqual(titles(), ['Alpha  PLAN']);
    await applySearch(search, 'alpha \t p');
    assert.deepEqual(titles(), ['Alpha  PLAN']);
    await applySearch(search, '   ');
    assert.deepEqual(titles(), ['Alpha  PLAN']);
    await applySearch(search, 'alpha');
    assert.equal(writes.length, 0);
    if (archived) {
      assert.equal(row().children[2].children[1].disabled, true);
      assert.equal(row().children[4].disabled, true);
      assert.equal(row().children[5].children[1].disabled, true);
      assert.equal(row().children[6].children[2].disabled, true);
    } else {
      await applySearch(row().children[2], 'Alpha renamed');
      assert.deepEqual(titles(), ['Alpha renamed']);
      await applySearch(formWithLabel(app, 'New project name'), 'Renamed project');
      const defaults = formWithLabel(app, 'Default task priority').children[1];
      defaults.value = 'Low';
      await defaults.fire('change');
      await applySearch(formWithLabel(app, 'Task title'), 'Alpha new');
      assert.deepEqual(titles(), ['Alpha renamed']);
      await applySearch(row().children[2], 'No match');
      assert.deepEqual(titles(), []);
      await applySearch(search, 'no match');
      assert.deepEqual(titles(), ['No match']);
      await applySearch(row().children[5], '2000-03-01');
      assert.deepEqual(titles(), []);
      range.children[3].value = '2000-03-01';
      await range.fire('submit');
      const taskPriority = row().children[4];
      taskPriority.value = 'Low';
      await taskPriority.fire('change');
      assert.deepEqual(titles(), []);
      priority.value = 'Low';
      await priority.fire('change');
      row().children[0].checked = true;
      await row().children[0].fire('change');
      assert.deepEqual(titles(), []);
      completion.value = 'Completed';
      await completion.fire('change');
      assert.deepEqual(titles(), ['No match']);
      await row().children[6].fire('submit');
      assert.deepEqual(titles(), []);
      assert.equal(search.children[1].value, 'no match');
    }
    assert.equal(range.children[1].value, '2000-02-29');
    assert.equal(range.children[3].value, archived ? '2000-02-29' : '2000-03-01');
    assert.equal(completion.value, archived ? 'Open' : 'Completed');
    assert.equal(priority.value, archived ? 'High' : 'Low');
    const reopened = searchPage('/projects/1', [project], tasks);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(formWithLabel(reopened.app, 'Task search').children[1].value, '');
  });
}

test('home import labels, rejected-input retention, and successful navigation', async () => {
  const app = new Node('main');
  const writes = [];
  const navigations = [];
  let accepted = false;
  runInNewContext(source, {
    document: { querySelector: () => app, createElement: (tag) => new Node(tag) },
    location: { pathname: '/', assign(path) { navigations.push(path); } },
    async fetch(path, options) {
      if (!options) return { ok: true, json: async () => [] };
      writes.push({ path, body: JSON.parse(options.body) });
      return { ok: accepted, json: async () => accepted ? { id: 42 } : { error: 'Invalid project JSON' } };
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  const form = formWithLabel(app, 'Project JSON');
  const [jsonLabel, jsonInput, nameLabel, nameInput, button] = form.children;
  assert.equal(jsonInput.tag, 'textarea');
  assert.equal(jsonLabel.htmlFor, jsonInput.id);
  assert.equal(nameLabel.textContent, 'Imported project name');
  assert.equal(nameLabel.htmlFor, nameInput.id);
  assert.equal(button.textContent, 'Import project');
  jsonInput.value = '{broken\nJSON';
  nameInput.value = ' \t ';
  await form.fire('submit');
  assert.equal(app.querySelector('[role="alert"]').textContent, 'Project name is required');
  assert.equal(writes.length, 0);
  nameInput.value = '  Imported  ';
  await form.fire('submit');
  assert.equal(app.querySelector('[role="alert"]').textContent, 'Invalid project JSON');
  assert.equal(jsonInput.value, '{broken\nJSON');
  assert.equal(nameInput.value, '  Imported  ');
  assert.equal(button.disabled, false);
  assert.equal(app.querySelector('ul').children.length, 0);
  assert.deepEqual(writes, [{ path: '/api/projects/import', body: { name: 'Imported', projectJson: '{broken\nJSON' } }]);
  assert.deepEqual(navigations, []);
  accepted = true;
  jsonInput.value = '{"valid":"document"}';
  await form.fire('submit');
  assert.deepEqual(navigations, ['/projects/42']);
  assert.equal(app.querySelector('[role="alert"]'), undefined);
  const directory = app.children.find((node) => node.textContent === 'Task directory');
  assert.equal(directory.tag, 'button');
  await directory.fire('click');
  assert.deepEqual(navigations, ['/projects/42', '/directory']);
});
