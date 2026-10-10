import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// Minimal DOM adapter for exercising the browser event handlers without dependencies.
class Element {
  constructor(tag = 'div') {
    this.tag = tag;
    this.children = [];
    this.listeners = {};
    this.dataset = {};
    this.attributes = {};
    this.value = '';
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(event, listener) { this.listeners[event] = listener; }
  setAttribute(name, value) { this.attributes[name] = value; }
  querySelector(tag) { return this.children.find((child) => child.tag === tag); }
  focus() {}
  async fire(event) { await this.listeners[event]({ preventDefault() {} }); }
}

test('project page creates tasks, names checkboxes, and filters saved completion', async () => {
  const ids = ['project-list', 'project-detail', 'projects', 'create-project', 'project-name',
    'error', 'create-task', 'task-title', 'task-filter', 'tasks', 'back-to-projects', 'project-heading'];
  const elements = new Map(ids.map((id) => [`#${id}`, new Element()]));
  const element = (id) => elements.get(`#${id}`);
  element('create-task').append(new Element('button'));
  element('create-project').append(new Element('button'));
  element('task-filter').value = 'All';
  let savedTasks = [
    { id: 1, title: 'Open task', completed: false },
    { id: 2, title: '<Completed task>', completed: true },
  ];
  const writes = [];
  const document = {
    querySelector: (selector) => elements.get(selector),
    createElement: (tag) => new Element(tag),
  };
  const fetch = async (path, options) => {
    let data;
    if (options) {
      const body = JSON.parse(options.body);
      writes.push({ path, ...options, body });
      if (options.method === 'POST') {
        data = { id: 3, title: body.title, completed: false };
        savedTasks.push(data);
      } else {
        const id = Number(path.split('/').at(-1));
        data = { ...savedTasks.find((task) => task.id === id), completed: body.completed };
        savedTasks = savedTasks.map((task) => task.id === id ? data : task);
      }
    } else {
      data = path.endsWith('/tasks') ? savedTasks : { id: 7, name: 'Project seven' };
    }
    return { ok: true, json: async () => JSON.parse(JSON.stringify(data)) };
  };
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  await runInNewContext(`(async () => { ${source} })()`, {
    document, fetch, window: { location: { pathname: '/projects/7' } },
  });
  const rows = () => element('tasks').children;
  const titles = () => rows().map((row) => row.children[1].textContent);
  assert.equal(element('project-heading').textContent, 'Project seven');
  assert.deepEqual(titles(), ['Open task', '<Completed task>']);
  assert.ok(rows().every((row) => row.dataset.testid === 'task-row'));
  assert.equal(rows()[0].children[0].attributes['aria-label'], 'Complete Open task');
  assert.equal(rows()[1].children[0].checked, true);

  element('task-title').value = ' \t ';
  await element('create-task').fire('submit');
  assert.equal(element('error').textContent, 'Task title is required');
  assert.equal(element('error').hidden, false);
  assert.equal(writes.length, 0);
  assert.equal(rows().length, 2);

  element('task-title').value = '  New task  ';
  await element('create-task').fire('submit');
  assert.equal(writes[0].body.title, 'New task');
  assert.equal(writes[0].path, '/api/projects/7/tasks');
  assert.deepEqual(titles(), ['Open task', '<Completed task>', 'New task']);
  assert.equal(rows()[2].children[0].checked, false);

  element('task-filter').value = 'Open';
  await element('task-filter').fire('change');
  assert.deepEqual(titles(), ['Open task', 'New task']);
  const checkbox = rows()[0].children[0];
  checkbox.checked = true;
  await checkbox.fire('change');
  assert.deepEqual(titles(), ['New task']);
  assert.equal(writes[1].body.completed, true);

  element('task-filter').value = 'Completed';
  await element('task-filter').fire('change');
  assert.deepEqual(titles(), ['Open task', '<Completed task>']);
  const completedCheckbox = rows()[0].children[0];
  completedCheckbox.checked = false;
  await completedCheckbox.fire('change');
  assert.deepEqual(titles(), ['<Completed task>']);
  assert.equal(writes[2].body.completed, false);

  element('task-filter').value = 'All';
  await element('task-filter').fire('change');
  assert.deepEqual(titles(), ['Open task', '<Completed task>', 'New task']);
});
