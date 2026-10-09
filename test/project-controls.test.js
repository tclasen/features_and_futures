import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindProjectControls } from '../project-controls.js';

function fixture(fetchRequest, { checked = false, filterValue = 'all' } = {}) {
  const checkbox = Object.assign(new EventTarget(), { checked });
  const filter = Object.assign(new EventTarget(), { value: filterValue });
  const error = { hidden: true };
  let navigations = 0;
  let removals = 0;
  const filterForm = Object.assign(new EventTarget(), {
    requestSubmit() { this.dispatchEvent(new Event('submit', { cancelable: true })); },
    submit() { navigations++; },
  });
  const form = {
    action: 'http://localhost/projects/project/tasks/task',
    querySelector: () => checkbox,
    closest: () => ({ remove() { removals++; } }),
  };
  bindProjectControls({
    getElementById: (id) => ({
      'task-filter-form': filterForm, 'task-filter': filter, 'task-save-error': error,
    })[id],
    querySelectorAll: () => [form],
  }, fetchRequest);
  return {
    checkbox, filter, error,
    toggle(value) { checkbox.checked = value; checkbox.dispatchEvent(new Event('change')); },
    get navigations() { return navigations; },
    get removals() { return removals; },
  };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('rapid completion changes save in order without replacing the page', async () => {
  const requests = [];
  const ui = fixture((url, options) => new Promise((resolve) => requests.push({ options, resolve })));
  ui.toggle(true);
  ui.toggle(false);
  await settle();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.body.get('completed'), 'on');
  requests[0].resolve({ ok: true });
  await settle();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].options.body.has('completed'), false);
  requests[1].resolve({ ok: true });
  await settle();
  assert.equal(ui.checkbox.checked, false);
  assert.equal(ui.navigations, 0);
});

test('filter navigation waits for completion persistence', async () => {
  let finish;
  const ui = fixture(() => new Promise((resolve) => { finish = resolve; }), { checked: true });
  ui.toggle(false);
  ui.filter.value = 'open';
  ui.filter.dispatchEvent(new Event('change'));
  await settle();
  assert.equal(ui.navigations, 0);
  finish({ ok: true });
  await settle();
  assert.equal(ui.navigations, 1);
  assert.equal(ui.checkbox.checked, false);
});

test('failed saves restore persisted state and show an alert', async () => {
  const ui = fixture(async () => ({ ok: false }), { checked: true });
  ui.toggle(false);
  await settle();
  assert.equal(ui.checkbox.checked, true);
  assert.equal(ui.error.hidden, false);
  assert.match(ui.error.textContent, /Unable to save/);
});

test('success removes rows that no longer match the selected filter', async () => {
  const ui = fixture(async () => ({ ok: true }), { checked: true, filterValue: 'completed' });
  ui.toggle(false);
  await settle();
  assert.equal(ui.removals, 1);
});
