import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const script = await readFile(new URL('../project.js', import.meta.url), 'utf8');

function browser({ completed = false, selectedFilter = 'All' } = {}) {
  const requests = [];
  const checkboxListeners = {};
  const filterListeners = {};
  let removed = false;
  let submitted = false;
  let alert;
  const checkbox = {
    checked: completed,
    disabled: false,
    form: { action: 'http://localhost/projects/1/tasks/1' },
    addEventListener: (event, handler) => { checkboxListeners[event] = handler; },
    closest: () => ({ remove: () => { removed = true; } }),
  };
  const filter = {
    value: selectedFilter,
    form: { requestSubmit: () => { submitted = true; } },
    addEventListener: (event, handler) => { filterListeners[event] = handler; },
  };
  runInNewContext(script, {
    URLSearchParams,
    FormData: class {
      *[Symbol.iterator]() {
        yield ['filter', filter.value];
        if (checkbox.checked && !checkbox.disabled) yield ['completed', '1'];
      }
    },
    fetch: (url, options) => new Promise((resolve, reject) => {
      requests.push({ url, options, resolve, reject });
    }),
    document: {
      querySelectorAll: () => [checkbox],
      querySelector: (selector) => {
        if (selector === '#task-filter') return filter;
        if (selector === '#completion-error') return alert;
        if (selector === '.task-list') return { before: (element) => { alert = element; } };
        throw new Error(`Unexpected selector: ${selector}`);
      },
      createElement: () => ({ setAttribute(name, value) { this[name] = value; } }),
    },
  });
  return {
    checkbox, filter, requests,
    changeCompletion: (value) => {
      checkbox.checked = value;
      return checkboxListeners.change();
    },
    changeFilter: (value) => {
      filter.value = value;
      return filterListeners.change();
    },
    get removed() { return removed; },
    get submitted() { return submitted; },
    get alert() { return alert; },
  };
}

test('checking then unchecking saves both states without navigating or replacing the checkbox', async () => {
  const page = browser();
  const checking = page.changeCompletion(true);
  assert.equal(page.checkbox.disabled, true);
  assert.equal(page.requests[0].options.body.get('completed'), '1');
  assert.equal(page.requests[0].options.keepalive, true);
  page.requests[0].resolve({ ok: true });
  await checking;
  assert.equal(page.checkbox.checked, true);
  assert.equal(page.checkbox.disabled, false);

  const unchecking = page.changeCompletion(false);
  assert.equal(page.requests[1].options.body.has('completed'), false);
  assert.equal(page.requests[1].options.method, 'POST');
  assert.equal(page.requests[1].url, 'http://localhost/projects/1/tasks/1');
  page.requests[1].resolve({ ok: true });
  await unchecking;
  assert.equal(page.checkbox.checked, false);
  assert.equal(page.checkbox.disabled, false);
  assert.equal(page.submitted, false);
  assert.equal(page.removed, false);
});

test('filter navigation waits until a pending completion save finishes', async () => {
  const page = browser();
  const saving = page.changeCompletion(true);
  const filtering = page.changeFilter('Completed');
  await Promise.resolve();
  assert.equal(page.submitted, false);
  page.requests[0].resolve({ ok: true });
  await Promise.all([saving, filtering]);
  assert.equal(page.submitted, true);
});

test('completed and open filters remove rows only after successful saves', async () => {
  for (const [filter, completed] of [['Open', false], ['Completed', true]]) {
    const page = browser({ completed, selectedFilter: filter });
    const saving = page.changeCompletion(!completed);
    assert.equal(page.removed, false);
    page.requests[0].resolve({ ok: true });
    await saving;
    assert.equal(page.removed, true);
  }
});

test('failed saves restore the prior checkbox state and display an alert', async () => {
  for (const failure of ['http', 'network']) {
    const page = browser({ completed: true });
    const saving = page.changeCompletion(false);
    if (failure === 'http') page.requests[0].resolve({ ok: false });
    else page.requests[0].reject(new Error('Connection failed'));
    await saving;
    assert.equal(page.checkbox.checked, true);
    assert.equal(page.checkbox.disabled, false);
    assert.equal(page.removed, false);
    assert.equal(page.alert.role, 'alert');
    assert.match(page.alert.textContent, /could not be saved/);
  }
});
