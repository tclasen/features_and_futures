import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const script = await readFile(new URL('../project.js', import.meta.url), 'utf8');

function browser({ states = [false], selectedFilter = 'All' } = {}) {
  const requests = [];
  let alert;
  const empty = { hidden: states.length > 0 };
  const hiddenFilter = { value: selectedFilter };
  const location = { href: 'http://localhost/projects/1' };
  const rows = states.map(() => ({ hidden: false }));
  const checkboxes = states.map((completed, index) => ({
    checked: completed,
    disabled: false,
    form: { action: `http://localhost/projects/1/tasks/${index + 1}` },
    addEventListener(event, handler) { this[event] = handler; },
    closest: () => rows[index],
  }));
  const filter = {
    value: selectedFilter,
    addEventListener(event, handler) { this[event] = handler; },
  };
  runInNewContext(script, {
    URL, URLSearchParams,
    FormData: class {
      constructor(form) { this.checkbox = checkboxes.find((item) => item.form === form); }
      *[Symbol.iterator]() {
        yield ['filter', hiddenFilter.value];
        if (this.checkbox.checked && !this.checkbox.disabled) yield ['completed', '1'];
      }
    },
    fetch: (url, options) => new Promise((resolve, reject) => {
      requests.push({ url, options, resolve, reject });
    }),
    window: { location, history: { replaceState: (_state, _title, url) => { location.href = String(url); } } },
    document: {
      querySelectorAll: (selector) => selector === 'input[name="filter"]' ? [hiddenFilter] : checkboxes,
      querySelector: (selector) => {
        if (selector === '#task-filter') return filter;
        if (selector === '#tasks-empty') return empty;
        if (selector === '#completion-error') return alert;
        if (selector === '.task-list') return { before: (element) => { alert = element; } };
        throw new Error(`Unexpected selector: ${selector}`);
      },
      createElement: () => ({ setAttribute(name, value) { this[name] = value; } }),
    },
  });
  return {
    checkboxes, rows, filter, requests, location, hiddenFilter, empty,
    changeCompletion: (value, index = 0) => {
      checkboxes[index].checked = value;
      return checkboxes[index].change();
    },
    changeFilter: (value) => { filter.value = value; filter.change(); },
    get alert() { return alert; },
  };
}

test('checking then unchecking saves both states in place', async () => {
  const page = browser();
  const checking = page.changeCompletion(true);
  assert.equal(page.checkboxes[0].disabled, true);
  assert.equal(page.requests[0].options.body.get('completed'), '1');
  assert.equal(page.requests[0].options.keepalive, true);
  assert.equal(page.requests[0].options.headers.Accept, 'application/json');
  page.requests[0].resolve({ ok: true });
  await checking;
  assert.equal(page.checkboxes[0].checked, true);
  assert.equal(page.checkboxes[0].disabled, false);

  const unchecking = page.changeCompletion(false);
  assert.equal(page.requests[1].options.body.has('completed'), false);
  assert.equal(page.requests[1].options.method, 'POST');
  assert.equal(page.requests[1].url, 'http://localhost/projects/1/tasks/1');
  page.requests[1].resolve({ ok: true });
  await unchecking;
  assert.equal(page.checkboxes[0].checked, false);
  assert.equal(page.checkboxes[0].disabled, false);
  assert.equal(page.rows[0].hidden, false);
});

test('filters update immediately during a pending save and retain rows for All', async () => {
  const page = browser({ states: [false, false] });
  const saving = page.changeCompletion(true);
  page.changeFilter('Open');
  assert.deepEqual(page.rows.map((row) => row.hidden), [true, false]);
  assert.equal(page.location.href, 'http://localhost/projects/1?filter=Open');
  assert.equal(page.hiddenFilter.value, 'Open');
  page.changeFilter('Completed');
  assert.deepEqual(page.rows.map((row) => row.hidden), [false, true]);
  page.requests[0].resolve({ ok: true });
  await saving;
  page.changeFilter('All');
  assert.deepEqual(page.rows.map((row) => row.hidden), [false, false]);
  assert.equal(page.location.href, 'http://localhost/projects/1');
});

test('completion changes immediately hide nonmatching rows and update the empty message', async () => {
  for (const [filter, completed] of [['Open', false], ['Completed', true]]) {
    const page = browser({ states: [completed], selectedFilter: filter });
    const saving = page.changeCompletion(!completed);
    assert.equal(page.rows[0].hidden, true);
    assert.equal(page.empty.hidden, false);
    page.requests[0].resolve({ ok: true });
    await saving;
    assert.equal(page.rows[0].hidden, true);
    page.changeFilter('All');
    assert.equal(page.rows[0].hidden, false);
    assert.equal(page.empty.hidden, true);
  }
});

test('failed saves restore state and visibility under the current filter and display an alert', async () => {
  for (const failure of ['http', 'network']) {
    const page = browser({ states: [true] });
    const saving = page.changeCompletion(false);
    page.changeFilter('Completed');
    assert.equal(page.rows[0].hidden, true);
    if (failure === 'http') page.requests[0].resolve({ ok: false });
    else page.requests[0].reject(new Error('Connection failed'));
    await saving;
    assert.equal(page.checkboxes[0].checked, true);
    assert.equal(page.checkboxes[0].disabled, false);
    assert.equal(page.rows[0].hidden, false);
    assert.equal(page.empty.hidden, true);
    assert.equal(page.alert.role, 'alert');
    assert.match(page.alert.textContent, /could not be saved/);
  }
});
