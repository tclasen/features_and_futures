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

async function mount(pathname, fetch) {
  const app = new Element('main');
  runInNewContext(await readFile(new URL('../public/app.js', import.meta.url), 'utf8'), {
    document: { querySelector: () => app, createElement: tag => new Element(tag) },
    window: { location: { pathname } }, fetch,
  });
  await new Promise(resolve => setImmediate(resolve));
  return app;
}

test('project list filters, summarizes, archives, and restores without changing creation order', async () => {
  const projects = [
    { id: 1, name: 'First', archived: 0, completed: 1, total: 3 },
    { id: 2, name: 'Second', archived: 0, completed: 0, total: 0 },
  ];
  const app = await mount('/', async (path, options = {}) => {
    let body = projects;
    if (options.method === 'PATCH') {
      body = projects.find(project => path === `/api/projects/${project.id}`);
      body.archived = Number(JSON.parse(options.body).archived);
    } else if (options.method === 'POST') {
      body = { id: 3, name: JSON.parse(options.body).name, archived: 0, completed: 0, total: 0 };
      projects.push(body);
    }
    return { ok: true, json: async () => structuredClone(body) };
  });
  const nodes = () => descendants(app);
  const rows = () => nodes().filter(node => node.attributes['data-testid'] === 'project-row');
  const names = () => rows().map(row => row.children[0].textContent);
  const filter = nodes().find(node => node.attributes.id === 'project-filter');
  const button = (row, text) => row.children.find(node => node.tag === 'button' && node.textContent === text);
  assert.ok(nodes().some(node => node.attributes.for === 'project-filter' && node.textContent === 'Project filter'));
  assert.deepEqual(filter.children.map(node => node.textContent), ['Active', 'Archived']);
  assert.equal(filter.value, 'Active');
  assert.deepEqual(names(), ['First', 'Second']);
  assert.deepEqual(rows().map(row => row.children.find(node => node.attributes['data-testid'] === 'project-summary').textContent), ['1/3 completed', '0/0 completed']);
  await button(rows()[0], 'Archive project').emit('click');
  assert.deepEqual(names(), ['Second']);
  filter.value = 'Archived';
  await filter.emit('change');
  assert.deepEqual(names(), ['First']);
  assert.ok(button(rows()[0], 'Open project'));
  const input = nodes().find(node => node.attributes.id === 'project-name');
  input.value = ' Third ';
  await nodes().find(node => node.tag === 'form').emit('submit');
  assert.deepEqual(names(), ['First']);
  await button(rows()[0], 'Restore project').emit('click');
  assert.deepEqual(names(), []);
  filter.value = 'Active';
  await filter.emit('change');
  assert.deepEqual(names(), ['First', 'Second', 'Third']);
  assert.equal(rows()[0].children.find(node => node.attributes['data-testid'] === 'project-summary').textContent, '1/3 completed');
});

test('archived project keeps tasks and filtering visible but disables editing', async () => {
  let writes = 0;
  const app = await mount('/projects/1', async (path, options = {}) => {
    if (options.method) writes++;
    const body = path === '/api/projects/1'
      ? { id: 1, name: 'Archived', archived: 1, total: 2, completed: 1 }
      : [{ id: 1, title: 'Done', completed: true }, { id: 2, title: 'Pending', completed: false }];
    return { ok: true, json: async () => structuredClone(body) };
  });
  const nodes = () => descendants(app);
  const rows = () => nodes().filter(node => node.attributes['data-testid'] === 'task-row');
  assert.ok(nodes().some(node => node.textContent === 'Archived project'));
  assert.equal(nodes().find(node => node.textContent === 'Create task').disabled, true);
  assert.equal(rows().length, 2);
  assert.ok(rows().every(row => row.children[0].disabled));
  const filter = nodes().find(node => node.attributes.id === 'task-filter');
  filter.value = 'Completed';
  await filter.emit('change');
  assert.equal(rows().length, 1);
  assert.equal(rows()[0].children[1].textContent, 'Done');
  assert.equal(rows()[0].children[0].disabled, true);
  filter.value = 'Open';
  await filter.emit('change');
  assert.equal(rows()[0].children[1].textContent, 'Pending');
  assert.equal(rows()[0].children[0].disabled, true);
  assert.equal(writes, 0);
});
