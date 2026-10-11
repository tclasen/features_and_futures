import test from 'node:test';
import assert from 'node:assert/strict';
import { renderDirectory } from '../public/directory.js';

test('directory rejects invalid ranges and restores displayed applied boundaries without resetting filters', async () => {
  class Element {
    value = '';
    children = [];
    dataset = {};
    listeners = new Map();
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    addEventListener(event, callback) { this.listeners.set(event, callback); }
    dispatch(event) { this.listeners.get(event)({ preventDefault() {} }); }
  }
  const elements = new Map();
  const originalDocument = globalThis.document;
  globalThis.document = {
    getElementById: id => elements.get(id),
    createElement: () => new Element(),
  };
  const app = {
    set innerHTML(html) {
      elements.clear();
      for (const [, id] of html.matchAll(/id="([^"]+)"/g)) elements.set(id, new Element());
      for (const [id, value] of [['project-scope', 'active'], ['task-filter', 'all'], ['priority-filter', 'all']]) {
        elements.get(id).value = value;
      }
    },
  };
  const tasks = [
    { title: 'Review early', project_name: 'Owner', project_archived: false,
      completed: false, priority: 'High', due_date: '2046-03-01', notes: '' },
    { title: 'Review later', project_name: 'Owner', project_archived: false,
      completed: false, priority: 'High', due_date: '2046-04-01', notes: '' },
  ];
  const get = id => elements.get(id);
  const titles = () => get('directory-tasks').children.map(row => row.children[0].textContent);
  let alert;
  try {
    await renderDirectory(app, async () => tasks, message => { alert = message; });
    get('task-filter').value = 'open';
    get('task-filter').dispatch('change');
    get('priority-filter').value = 'High';
    get('priority-filter').dispatch('change');
    get('directory-search').value = 'Review';
    get('directory-search-form').dispatch('submit');
    get('due-from').value = ' 2046-03-01 ';
    get('due-through').value = '2046-03-31';
    get('due-range-form').dispatch('submit');
    assert.deepEqual(titles(), ['Review early']);

    for (const [from, through, expected] of [
      ['2046-02-30', '2046-04-30', 'Due range must use valid YYYY-MM-DD dates'],
      ['2046-03-01', 'not a date', 'Due range must use valid YYYY-MM-DD dates'],
      ['2046-04-30', '2046-03-01', 'Due from must not be after Due through'],
    ]) {
      get('due-from').value = from;
      get('due-through').value = through;
      get('due-range-form').dispatch('submit');
      assert.equal(alert, expected);
      assert.equal(get('due-from').value, '2046-03-01');
      assert.equal(get('due-through').value, '2046-03-31');
      assert.equal(get('project-scope').value, 'active');
      assert.equal(get('task-filter').value, 'open');
      assert.equal(get('priority-filter').value, 'High');
      assert.equal(get('directory-search').value, 'Review');
      assert.deepEqual(titles(), ['Review early']);
    }

    await renderDirectory(app, async () => tasks, message => { alert = message; });
    assert.equal(get('due-from').value, '');
    assert.equal(get('due-through').value, '');
    assert.equal(get('directory-search').value, '');
    assert.equal(get('task-filter').value, 'all');
    assert.equal(get('priority-filter').value, 'all');
    assert.deepEqual(titles(), ['Review early', 'Review later']);
    get('due-from').value = '2046-02-30';
    get('due-range-form').dispatch('submit');
    assert.equal(get('due-from').value, '');
    assert.equal(get('due-through').value, '');
    assert.deepEqual(titles(), ['Review early', 'Review later']);
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});
