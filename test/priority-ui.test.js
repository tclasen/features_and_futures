import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Minimal DOM surface for testing priority controls without browser dependencies.
class Element {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.listeners = {};
    this.attributes = {};
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  querySelector() { return null; }
}

async function setup(fetch) {
  const app = new Element('main');
  const context = vm.createContext({
    document: {
      querySelector: () => app,
      createElement: tag => new Element(tag),
    },
    location: { pathname: '/' },
    fetch,
  });
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  vm.runInContext(`${source}\nglobalThis.priorityControl = taskPriorityControl;`, context);
  return context.priorityControl;
}

test('priority UI labels options, saves changes, and rolls back failed changes', async () => {
  const requests = [];
  let fail = false;
  const control = await setup(async (path, options) => {
    if (!options) return { ok: true, json: async () => [] };
    requests.push({ path, body: JSON.parse(options.body), method: options.method });
    return {
      ok: !fail,
      json: async () => fail ? { error: 'Unable to save' } : { priority: JSON.parse(options.body).priority },
    };
  });
  const task = { id: 7, title: 'Keep title', completed: true, priority: 'Normal' };
  const [label, select] = control({ archived: false }, task, '/api/projects/2/tasks').children;
  assert.equal(label.textContent, 'Task priority');
  assert.equal(label.htmlFor, select.id);
  assert.deepEqual(Array.from(select.children, option => option.textContent), ['Low', 'Normal', 'High']);
  assert.equal(select.value, 'Normal');
  assert.equal(select.disabled, false);
  select.value = 'High';
  await select.listeners.change();
  assert.deepEqual(requests, [{ path: '/api/projects/2/tasks/7', body: { priority: 'High' }, method: 'PATCH' }]);
  assert.deepEqual(task, { id: 7, title: 'Keep title', completed: true, priority: 'High' });
  assert.equal(select.value, 'High');
  assert.equal(select.disabled, false);
  fail = true;
  select.value = 'Low';
  await select.listeners.change();
  assert.equal(task.priority, 'High');
  assert.equal(select.value, 'High');
  assert.equal(select.disabled, false);
});

test('archived priority controls are disabled and restoration keeps their value', async () => {
  const control = await setup(async () => ({ ok: true, json: async () => [] }));
  const task = { id: 3, priority: 'Low' };
  const archived = control({ archived: true }, task, '/api/projects/1/tasks').children[1];
  assert.equal(archived.disabled, true);
  assert.equal(archived.value, 'Low');
  const restored = control({ archived: false }, task, '/api/projects/1/tasks').children[1];
  assert.equal(restored.disabled, false);
  assert.equal(restored.value, 'Low');
});
