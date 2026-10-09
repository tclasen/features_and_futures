import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// A small DOM adapter exercises the shipped client without application dependencies.
class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attributes = {};
    this.events = {};
    this.value = '';
    this.hidden = false;
  }
  setAttribute(key, value) {
    this.attributes[key] = value;
    if (key === 'hidden') this.hidden = true;
    if (key === 'value') this.value = value;
  }
  append(...children) {
    this.children.push(...children);
    if (this.tag === 'select' && !this.value) this.value = children[0].value;
  }
  replaceChildren(...children) { this.children = children; }
  addEventListener(type, handler) { this.events[type] = handler; }
  focus() {}
  async emit(type) { await this.events[type]({ preventDefault() {} }); }
}

function descendants(node) {
  return [node, ...node.children.flatMap(descendants)];
}

test('project UI validates, creates, filters, and toggles tasks with accessible controls', async () => {
  const app = new Element('main');
  const tasks = [];
  let creates = 0;
  let writes = 0;
  const document = {
    querySelector: () => app,
    createElement: tag => new Element(tag),
  };
  const fetch = async (path, options = {}) => {
    let body;
    if (path === '/api/projects/1') body = { id: 1, name: 'Project' };
    else {
      assert.ok(path.startsWith('/api/projects/1/tasks'));
      if (options.method === 'POST') {
        creates++;
        body = { id: tasks.length + 1, title: JSON.parse(options.body).title, completed: false };
        tasks.push(body);
      } else if (options.method === 'PATCH') {
        writes++;
        body = tasks.find(task => task.id === Number(path.split('/').at(-1)));
        body.completed = JSON.parse(options.body).completed;
      } else body = tasks;
    }
    return { ok: true, json: async () => structuredClone(body) };
  };
  runInNewContext(await readFile(new URL('../public/app.js', import.meta.url), 'utf8'), {
    document, window: { location: { pathname: '/projects/1' } }, fetch,
  });
  await new Promise(resolve => setImmediate(resolve));
  const byId = id => descendants(app).find(node => node.attributes.id === id);
  const rows = () => descendants(app).filter(node => node.attributes['data-testid'] === 'task-row');
  const titles = () => rows().map(row => row.children[1].textContent);
  const form = descendants(app).find(node => node.tag === 'form');
  const input = byId('task-title');
  const filter = byId('task-filter');
  const alert = descendants(app).find(node => node.attributes.role === 'alert');
  assert.equal(descendants(app).find(node => node.tag === 'h1').textContent, 'Project');
  assert.ok(descendants(app).some(node => node.attributes.for === 'task-title' && node.textContent === 'Task title'));
  assert.ok(descendants(app).some(node => node.attributes.for === 'task-filter' && node.textContent === 'Task filter'));
  assert.ok(descendants(app).some(node => node.tag === 'button' && node.textContent === 'Create task'));
  assert.deepEqual(filter.children.map(node => node.textContent), ['All', 'Open', 'Completed']);
  assert.equal(filter.value, 'All');
  for (const value of ['', '   ', '\t\n']) {
    input.value = value;
    await form.emit('submit');
    assert.equal(alert.hidden, false);
    assert.match(alert.textContent, /Task title is required/);
    assert.equal(rows().length, 0);
  }
  assert.equal(creates, 0);
  for (const value of ['  First task  ', 'Second task']) {
    input.value = value;
    await form.emit('submit');
  }
  assert.equal(alert.hidden, true);
  assert.deepEqual(titles(), ['First task', 'Second task']);
  assert.equal(rows()[0].children[0].attributes['aria-label'], 'Complete First task');
  assert.equal(rows()[0].children[0].checked, false);
  rows()[0].children[0].checked = true;
  await rows()[0].children[0].emit('change');
  filter.value = 'Open';
  await filter.emit('change');
  assert.deepEqual(titles(), ['Second task']);
  filter.value = 'Completed';
  await filter.emit('change');
  assert.deepEqual(titles(), ['First task']);
  rows()[0].children[0].checked = false;
  await rows()[0].children[0].emit('change');
  assert.deepEqual(titles(), []);
  filter.value = 'All';
  await filter.emit('change');
  assert.deepEqual(titles(), ['First task', 'Second task']);
  assert.equal(rows()[0].children[0].checked, false);
  assert.equal(writes, 2);
});
