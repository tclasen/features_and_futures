import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

test('combined filters retain selections and reevaluate completion, priority and rename edits', async () => {
  // Execute the actual page scripts with a DOM-shaped fixture.
  const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const validator = source.match(/function validDueDate\(value\) \{[\s\S]*?\n\}/)[0];
  const searchMatcher = source.match(/function matchesSearch\(value, query\) \{[\s\S]*?\n\}/)[0];
  const scripts = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]
    .replace('${validDueDate.toString()}', validator)
    .replace('${matchesSearch.toString()}', searchMatcher));
  function control(value) {
    return { value, disabled: false, addEventListener(type, handler) { this[type] = handler; } };
  }
  const completionFilter = control('All');
  const priorityFilter = control('All');
  const alert = { textContent: '' };
  const dueFrom = control('');
  const dueThrough = control('');
  const range = control('');
  const search = control('');
  const searchForm = control('');
  const create = control('');
  const renameProject = Object.assign(control(''), {
    action: '/project-rename', elements: { name: control('') }, querySelector: () => control('')
  });
  Object.assign(create, {
    action: '/task-create', elements: { title: control('') }, querySelector: () => control('')
  });
  const heading = { textContent: 'Original project' };
  let sectionReplaced = false;
  const section = { replaceWith() { sectionReplaced = true; } };
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
      querySelector: selector => selector === '[data-saved-date]' ? row.dueDateForm.elements.due_date : selector === '[data-priority-url]' ? select : selector === 'span' ? span : checkbox
    };
    row.remove = () => { row.removed = true; };
    row.moveForm = Object.assign(control(''), {
      action: `/move/${index}`, elements: { destination_id: control('2') },
      querySelector: () => button, closest: () => row
    });
    row.dueDateForm = Object.assign(control(''), {
      action: `/due-date/${index}`, elements: { due_date: Object.assign(control(''), { dataset: { savedDate: '' } }) },
      querySelector: () => button
    });
    row.form = Object.assign(control(''), {
      action: `/rename/${index}`, elements: { title: control(span.textContent) },
      querySelector: () => button, closest: () => row
    });
    return row;
  });
  let saveOk = true;
  let responseStatus = 204;
  const context = {
    URLSearchParams,
    fetch: async () => ({ ok: saveOk, status: responseStatus, text: async () => '<section></section>' }),
    DOMParser: class { parseFromString() { return { querySelector: () => section }; } },
    document: {
      querySelector: selector => selector === 'h1' ? heading : section,
      getElementById: id => id === 'task-filter' ? completionFilter : id === 'priority-filter' ? priorityFilter : id === 'default-task-priority' ? defaultPriority : ({ 'due-from': dueFrom, 'due-through': dueThrough, 'due-range': range, 'task-search': search, 'task-search-form': searchForm, 'task-create': create, 'project-rename': renameProject })[id] || alert,
      querySelectorAll: selector => ({
        '[data-testid="task-row"]': rows.filter(row => !row.removed),
        '[data-task-move]': rows.map(row => row.moveForm),
        '[data-completion-url]': rows.map(row => row.checkbox),
        '[data-priority-url]': rows.map(row => row.select),
        '[data-task-rename]': rows.map(row => row.form),
        '[data-task-due-date]': rows.map(row => row.dueDateForm)
      })[selector]
    }
  };
  runInNewContext(scripts.join('\n'), context);
  const visible = () => rows.flatMap((row, index) => row.hidden || row.removed ? [] : [index]);
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
  rows[2].dueDateForm.elements.due_date.value = '  2024-02-29  ';
  await rows[2].dueDateForm.submit({ preventDefault() {} });
  assert.equal(rows[2].dueDateForm.elements.due_date.value, '2024-02-29');
  assert.equal(completionFilter.value, 'Open');
  assert.equal(priorityFilter.value, 'High');
  assert.deepEqual(visible(), [2]);
  responseStatus = 422;
  rows[2].dueDateForm.elements.due_date.value = '2023-02-29';
  await rows[2].dueDateForm.submit({ preventDefault() {} });
  assert.equal(alert.textContent, 'Due date must be a valid YYYY-MM-DD date');
  assert.deepEqual(visible(), [2]);
  responseStatus = 204;
  rows[2].dueDateForm.elements.due_date.value = '  ';
  await rows[2].dueDateForm.submit({ preventDefault() {} });
  assert.equal(rows[2].dueDateForm.elements.due_date.value, '');
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
  saveOk = true;
  responseStatus = 204;
  completionFilter.value = 'All';
  priorityFilter.value = 'All';
  const applyRange = (from, through) => {
    dueFrom.value = from;
    dueThrough.value = through;
    range.submit({ preventDefault() {} });
  };
  rows[0].dueDateForm.elements.due_date.dataset.savedDate = '0001-01-01';
  rows[1].dueDateForm.elements.due_date.dataset.savedDate = '2024-02-29';
  rows[2].dueDateForm.elements.due_date.dataset.savedDate = '2024-02-29';
  rows[3].dueDateForm.elements.due_date.dataset.savedDate = '9999-12-31';
  applyRange(' 2024-02-29 ', '2024-02-29 ');
  assert.deepEqual(visible(), [1, 2]);
  for (const invalid of ['2023-02-29', '1900-02-29', '0000-01-01', '2024-2-29', '2024-04-31']) {
    applyRange(invalid, '');
    assert.equal(alert.textContent, 'Due range must use valid YYYY-MM-DD dates');
    assert.deepEqual(visible(), [1, 2]);
  }
  applyRange('2025-01-01', '2024-02-29');
  assert.equal(alert.textContent, 'Due from must not be after Due through');
  assert.deepEqual(visible(), [1, 2]);
  renameProject.elements.name.value = '  Renamed project  ';
  await renameProject.submit({ preventDefault() {}, currentTarget: renameProject });
  assert.equal(heading.textContent, 'Renamed project');
  assert.deepEqual(visible(), [1, 2]);
  create.elements.title.value = '  Created task  ';
  await create.submit({ preventDefault() {}, currentTarget: create });
  assert.equal(sectionReplaced, true);
  assert.equal(create.elements.title.value, '');
  assert.deepEqual(visible(), [1, 2]);
  assert.equal(completionFilter.value, 'All');
  assert.equal(priorityFilter.value, 'All');
  priorityFilter.value = 'High';
  priorityFilter.change();
  assert.deepEqual(visible(), []);
  rows[2].select.value = 'High';
  await rows[2].select.change();
  assert.deepEqual(visible(), [2]);
  rows[2].dueDateForm.elements.due_date.value = '2025-01-01';
  await rows[2].dueDateForm.submit({ preventDefault() {} });
  assert.deepEqual(visible(), []);
  applyRange('', '2024-02-29');
  assert.deepEqual(visible(), [0]);
  applyRange('2024-02-29', '');
  assert.deepEqual(visible(), [2, 3]);
  applyRange('', '');
  assert.deepEqual(visible(), [0, 2, 3]);
  completionFilter.value = 'Completed';
  applyRange('9999-12-31', '9999-12-31');
  assert.deepEqual(visible(), [3]);
  saveOk = false;
  await rows[3].moveForm.submit({ preventDefault() {} });
  assert.deepEqual(visible(), [3]);
  assert.match(alert.textContent, /Could not move task/);
  saveOk = true;
  await rows[3].moveForm.submit({ preventDefault() {} });
  assert.deepEqual(visible(), []);
  assert.equal(completionFilter.value, 'Completed');
  assert.equal(priorityFilter.value, 'High');
  priorityFilter.change();
  assert.deepEqual(visible(), []); // The applied range still excludes the remaining rows.
  applyRange('', '');
  // Read-only archived rows can still be filtered without enabling their editors.
  rows.forEach(row => { row.checkbox.disabled = true; row.select.disabled = true; });
  completionFilter.value = 'Completed';
  completionFilter.change();
  assert.deepEqual(visible(), [0]);
  assert.ok(rows.every(row => row.checkbox.disabled && row.select.disabled));
  // Search intersects every filter and preserves applied selections during edits.
  rows.forEach(row => { row.checkbox.disabled = false; row.select.disabled = false; });
  completionFilter.value = 'All';
  priorityFilter.value = 'All';
  applyRange('', '');
  const applySearch = query => {
    search.value = query;
    searchForm.submit({ preventDefault() {} });
  };
  applySearch('  rENAMED TASK  ');
  assert.equal(search.value, 'rENAMED TASK');
  assert.deepEqual(visible(), [2]);
  priorityFilter.value = 'Low';
  priorityFilter.change();
  assert.deepEqual(visible(), []);
  priorityFilter.value = 'High';
  priorityFilter.change();
  assert.deepEqual(visible(), [2]);
  applyRange('2025-01-01', '2025-01-01');
  assert.deepEqual(visible(), [2]);
  rows[2].form.elements.title.value = 'Different title';
  await rows[2].form.submit({ preventDefault() {} });
  assert.deepEqual(visible(), []);
  assert.equal(priorityFilter.value, 'High');
  applySearch('different');
  assert.deepEqual(visible(), [2]);
  defaultPriority.value = 'Normal';
  await defaultPriority.change();
  create.elements.title.value = 'Another task';
  await create.submit({ preventDefault() {}, currentTarget: create });
  assert.deepEqual(visible(), [2]);
  rows[2].dueDateForm.elements.due_date.value = '';
  await rows[2].dueDateForm.submit({ preventDefault() {} });
  assert.deepEqual(visible(), []);
  applyRange('', '');
  assert.deepEqual(visible(), [2]);
  completionFilter.value = 'Completed';
  completionFilter.change();
  assert.deepEqual(visible(), []);
  rows[2].checkbox.checked = true;
  await rows[2].checkbox.change();
  assert.deepEqual(visible(), [2]);
  applySearch('Different  title');
  assert.deepEqual(visible(), []); // Internal whitespace is significant.
  applySearch('  ');
  assert.deepEqual(visible(), [0, 2]);
  rows[2].span.textContent = 'École';
  applySearch('école');
  assert.deepEqual(visible(), []); // Only ASCII case is folded.
  applySearch('ÉCOLE');
  assert.deepEqual(visible(), [2]);
  rows.forEach(row => { row.checkbox.disabled = true; row.select.disabled = true; });
  applySearch('');
  assert.deepEqual(visible(), [0, 2]);
  assert.ok(rows.every(row => row.checkbox.disabled && row.select.disabled));
  assert.match(source, /<label for="priority-filter">Priority filter<\/label>\s*<select id="priority-filter">\s*<option>All<\/option><option>Low<\/option><option>Normal<\/option><option>High<\/option>/);
});
