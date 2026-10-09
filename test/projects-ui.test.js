import test from 'node:test';
import assert from 'node:assert/strict';

class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.listeners = {};
    this.value = '';
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  async dispatch(name) { await this.listeners[name]({ preventDefault() {} }); }
  focus() {}
}
function all(element, predicate) {
  return [...(predicate(element) ? [element] : []), ...element.children.flatMap((child) => all(child, predicate))];
}

test('project list filters, summarizes, archives, restores, and opens archived pages', async () => {
  const keys = ['document', 'window', 'location', 'history', 'fetch'];
  const previous = keys.map((key) => [key, globalThis[key]]);
  const app = new Element('main');
  const projects = [
    { id: 1, name: 'First', archived: 0, completed_count: 1, total_count: 2 },
    { id: 2, name: 'Second', archived: 0, completed_count: 0, total_count: 0 },
  ];
  globalThis.document = { createElement: (tag) => new Element(tag), querySelector: () => app };
  globalThis.window = { addEventListener() {} };
  globalThis.location = { pathname: '/' };
  globalThis.history = { pushState(_state, _title, path) { location.pathname = path; } };
  globalThis.fetch = async (path, options) => {
    let data;
    if (path === '/api/projects') data = projects;
    else if (path.endsWith('/tasks')) data = [{ id: 1, title: 'Done', completed: true }];
    else {
      const project = projects.find((entry) => path === `/api/projects/${entry.id}`);
      assert.ok(project);
      if (options) project.archived = Number(JSON.parse(options.body).archived);
      data = project;
    }
    return { ok: true, json: async () => structuredClone(data) };
  };
  const find = (predicate) => all(app, predicate)[0];
  const rows = () => all(app, (element) => element.dataset.testid === 'project-row');
  const rowButton = (row, text) => all(row, (element) => element.tag === 'button' && element.textContent === text)[0];
  async function settled() {
    for (let attempt = 0; attempt < 50; attempt++) {
      if (app.attributes['aria-busy'] === 'false') return;
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    assert.fail('Render did not finish');
  }
  try {
    await import('../public/app.js');
    await settled();
    let filter = find((element) => element.id === 'project-filter');
    assert.equal(filter.value, 'Active');
    assert.equal(find((element) => element.htmlFor === filter.id).textContent, 'Project filter');
    assert.deepEqual(filter.children.map((option) => option.textContent), ['Active', 'Archived']);
    assert.deepEqual(rows().map((row) => row.children[0].textContent), ['First', 'Second']);
    assert.deepEqual(all(app, (element) => element.dataset.testid === 'project-summary').map((element) => element.textContent), ['1/2 completed', '0/0 completed']);
    await rowButton(rows()[0], 'Archive project').dispatch('click');
    assert.deepEqual(rows().map((row) => row.children[0].textContent), ['Second']);
    filter.value = 'Archived';
    await filter.dispatch('change');
    assert.equal(rows().length, 1);
    assert.equal(rows()[0].children[0].textContent, 'First');
    await rowButton(rows()[0], 'Open project').dispatch('click');
    await settled();
    assert.equal(location.pathname, '/projects/1');
    assert.equal(find((element) => element.tag === 'h1').textContent, 'First');
    assert.ok(find((element) => element.textContent === 'Archived project'));
    assert.equal(find((element) => element.textContent === 'Create task').disabled, true);
    assert.equal(find((element) => element.type === 'checkbox').disabled, true);
    await find((element) => element.textContent === 'Projects').dispatch('click');
    await settled();
    filter = find((element) => element.id === 'project-filter');
    assert.equal(filter.value, 'Active');
    filter.value = 'Archived';
    await filter.dispatch('change');
    await rowButton(rows()[0], 'Restore project').dispatch('click');
    assert.equal(rows().length, 0);
    filter.value = 'Active';
    await filter.dispatch('change');
    assert.deepEqual(rows().map((row) => row.children[0].textContent), ['First', 'Second']);
    assert.equal(rows()[0].children[1].textContent, '1/2 completed');
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
