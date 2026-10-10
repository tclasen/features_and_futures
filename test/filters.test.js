import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

test('combined filters retain selections and reevaluate completion, priority and rename edits', async () => {
  // Execute the actual page scripts with a DOM-shaped fixture.
  const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const scripts = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  function control(value) {
    return { value, disabled: false, addEventListener(type, handler) { this[type] = handler; } };
  }
  const completionFilter = control('All');
  const priorityFilter = control('All');
  const alert = { textContent: '' };
  const defaultPriority = Object.assign(control('Normal'), {
    dataset: { defaultUrl: '/default-priority', savedPriority: 'Normal' }
  });
  const rows = [
    [false, 'Low'], [true, 'Normal'], [false, 'High'], [true, 'High'], [false, 'Normal']
  ].map(([completed, priority], index) => {
    const checkbox = Object.assign(control(''), {
      checked: completed, dataset: { completionUrl: `/completion/${index}` },
      setAttribute(name, value) { this[name] = value; }
    });
    const select = Object.assign(control(priority), { dataset: { savedPriority: priority, priorityUrl: `/priority/${index}` } });
    const span = { textContent: `Task ${index}` };
    const button = control('');
    const row = { hidden: false, checkbox, select, span,
      querySelector: selector => selector === '[data-priority-url]' ? select : selector === 'span' ? span : checkbox
    };
    row.form = Object.assign(control(''), {
      action: `/rename/${index}`, elements: { title: control(span.textContent) },
      querySelector: () => button, closest: () => row
    });
    return row;
  });
  let saveOk = true;
  const context = {
    URLSearchParams,
    fetch: async () => ({ ok: saveOk }),
    document: {
      getElementById: id => id === 'task-filter' ? completionFilter : id === 'priority-filter' ? priorityFilter : id === 'default-task-priority' ? defaultPriority : alert,
      querySelectorAll: selector => ({
        '[data-testid="task-row"]': rows,
        '[data-completion-url]': rows.map(row => row.checkbox),
        '[data-priority-url]': rows.map(row => row.select),
        '[data-task-rename]': rows.map(row => row.form)
      })[selector]
    }
  };
  runInNewContext(scripts.join('\n'), context);
  const visible = () => rows.flatMap((row, index) => row.hidden ? [] : [index]);
  for (const completion of ['All', 'Open', 'Completed']) {
    completionFilter.value = completion;
    completionFilter.change();
    for (const priority of ['All', 'Low', 'Normal', 'High']) {
      priorityFilter.value = priority;
      priorityFilter.change();
      assert.equal(completionFilter.value, completion);
      assert.deepEqual(visible(), rows.flatMap((row, index) =>
        (completion === 'All' || row.checkbox.checked === (completion === 'Completed')) &&
        (priority === 'All' || row.select.value === priority) ? [index] : []));
    }
  }
  completionFilter.value = 'Open';
  priorityFilter.value = 'High';
  completionFilter.change();
  assert.deepEqual(visible(), [2]);
  defaultPriority.value = 'Low';
  await defaultPriority.change();
  assert.equal(defaultPriority.dataset.savedPriority, 'Low');
  assert.equal(defaultPriority.disabled, false);
  assert.equal(completionFilter.value, 'Open');
  assert.equal(priorityFilter.value, 'High');
  assert.deepEqual(visible(), [2]);
  rows[2].form.elements.title.value = '  Renamed task  ';
  await rows[2].form.submit({ preventDefault() {} });
  assert.equal(rows[2].span.textContent, 'Renamed task');
  assert.equal(rows[2].checkbox['aria-label'], 'Complete Renamed task');
  assert.deepEqual(visible(), [2]);
  rows[2].select.value = 'Low';
  await rows[2].select.change();
  assert.deepEqual(visible(), []);
  rows[0].select.value = 'High';
  await rows[0].select.change();
  assert.deepEqual(visible(), [0]);
  rows[0].checkbox.checked = true;
  await rows[0].checkbox.change();
  assert.deepEqual(visible(), []);
  saveOk = false;
  defaultPriority.value = 'High';
  await defaultPriority.change();
  assert.equal(defaultPriority.value, 'Low');
  assert.deepEqual(visible(), []);
  rows[4].select.value = 'High';
  await rows[4].select.change();
  assert.equal(rows[4].select.value, 'Normal');
  assert.deepEqual(visible(), []);
  assert.equal(completionFilter.value, 'Open');
  assert.equal(priorityFilter.value, 'High');
  // Read-only archived rows can still be filtered without enabling their editors.
  rows.forEach(row => { row.checkbox.disabled = true; row.select.disabled = true; });
  completionFilter.value = 'Completed';
  completionFilter.change();
  assert.deepEqual(visible(), [0, 3]);
  assert.ok(rows.every(row => row.checkbox.disabled && row.select.disabled));
  assert.match(source, /<label for="priority-filter">Priority filter<\/label>\s*<select id="priority-filter">\s*<option>All<\/option><option>Low<\/option><option>Normal<\/option><option>High<\/option>/);
});
