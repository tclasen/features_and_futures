import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// A minimal DOM adapter exercises the client without external dependencies.
class Element {
  children = [];
  dataset = {};
  attributes = {};
  listeners = {};
  value = '';
  hidden = false;
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  async dispatch(name) { await this.listeners[name]({ preventDefault() {} }); }
  querySelector() { return this.button ??= new Element(); }
  focus() {}
  reset() {}
}

test('client renders task labels, filters in order, and updates completion', async () => {
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  element('#task-filter').value = 'all';
  let saved = [
    { id: 1, title: 'First', completed: false },
    { id: 2, title: '<b>Second</b>', completed: true },
    { id: 3, title: 'Third', completed: false },
  ];
  let writes = 0;
  const fetch = async (path, options) => {
    let body;
    if (!options) {
      body = path.endsWith('/tasks') ? saved : { id: 7, name: 'Example' };
    } else {
      writes++;
      const input = JSON.parse(options.body);
      if (options.method === 'POST') {
        body = { id: 4, title: input.title.trim(), completed: false };
        saved.push(body);
      } else {
        assert.match(path, /^\/api\/projects\/7\/tasks\/\d+$/);
        body = { ...saved.find(task => task.id === Number(path.split('/').at(-1))), completed: input.completed };
        saved = saved.map(task => task.id === body.id ? body : task);
      }
    }
    return { ok: true, json: async () => structuredClone(body) };
  };
  runInNewContext(await readFile(new URL('../public/app.js', import.meta.url), 'utf8'), {
    document: { querySelector: element, createElement: () => new Element() },
    window: { location: { pathname: '/projects/7' } }, fetch,
  });
  await new Promise(resolve => setImmediate(resolve));
  const rows = () => element('#tasks').children;
  const titles = () => rows().map(row => row.children[1].textContent);
  assert.equal(element('h1').textContent, 'Example');
  assert.deepEqual(titles(), ['First', '<b>Second</b>', 'Third']);
  assert.equal(rows()[0].dataset.testid, 'task-row');
  assert.equal(rows()[0].children[0].attributes['aria-label'], 'Complete First');
  assert.equal(rows()[1].children[0].checked, true);
  const filter = async value => {
    element('#task-filter').value = value;
    await element('#task-filter').dispatch('change');
  };
  await filter('open');
  assert.deepEqual(titles(), ['First', 'Third']);
  rows()[0].children[0].checked = true;
  await rows()[0].children[0].dispatch('change');
  assert.deepEqual(titles(), ['Third']);
  await filter('completed');
  assert.deepEqual(titles(), ['First', '<b>Second</b>']);
  rows()[0].children[0].checked = false;
  await rows()[0].children[0].dispatch('change');
  assert.deepEqual(titles(), ['<b>Second</b>']);
  element('#task-title').value = '   ';
  await element('#create-task').dispatch('submit');
  assert.equal(writes, 2);
  assert.equal(element('#alert').textContent, 'Task title is required');
  assert.equal(element('#alert').hidden, false);
  element('#task-title').value = '  Fourth  ';
  await element('#create-task').dispatch('submit');
  assert.deepEqual(titles(), ['<b>Second</b>']);
  await filter('all');
  assert.deepEqual(titles(), ['First', '<b>Second</b>', 'Third', 'Fourth']);
});
