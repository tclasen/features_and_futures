import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const script = readFileSync(new URL('../public/tasks.js', import.meta.url), 'utf8');

function setup(filter = 'All', status = 200) {
  let handler;
  let saved = false;
  const row = { hidden: false };
  const checkbox = { type: 'checkbox', checked: true };
  const form = {
    action: 'http://localhost/projects/1/tasks/1',
    elements: { filter: { value: filter } },
    addEventListener: (event, callback) => { handler = callback; },
    requestSubmit: () => { form.submitted = true; },
    closest: () => row,
    append: alert => { form.alert = alert; }
  };
  runInNewContext(script, {
    document: {
      querySelectorAll: () => [form],
      createElement: () => ({ setAttribute() {} })
    },
    URLSearchParams,
    FormData: class {
      constructor() {
        return [['filter', filter], ...(checkbox.checked ? [['completed', '1']] : [])];
      }
    },
    XMLHttpRequest: class {
      status = status;
      open(method, url, async) {
        assert.equal(method, 'POST');
        assert.equal(url, form.action);
        assert.equal(async, false, 'saving must finish before an immediate reload');
      }
      setRequestHeader(name, value) {
        assert.equal(name, 'Content-Type');
        assert.equal(value, 'application/x-www-form-urlencoded');
      }
      send(body) {
        saved = new URLSearchParams(body).get('completed') === '1';
      }
    }
  });
  return { form, checkbox, row, change: target => handler({ target }), saved: () => saved };
}

test('checking and unchecking are saved before the interaction returns', () => {
  const ui = setup();
  ui.change(ui.checkbox);
  assert.equal(ui.saved(), true);
  assert.equal(ui.checkbox.checked, true);
  ui.checkbox.checked = false;
  ui.change(ui.checkbox);
  assert.equal(ui.saved(), false);
  assert.equal(ui.checkbox.checked, false);
  assert.equal(ui.form.submitted, undefined, 'completion must not start a cancellable navigation');
});

test('completed and open filters hide rows that no longer match', () => {
  const completed = setup('Completed');
  completed.checkbox.checked = false;
  completed.change(completed.checkbox);
  assert.equal(completed.row.hidden, true);
  const open = setup('Open');
  open.change(open.checkbox);
  assert.equal(open.row.hidden, true);
});

test('failed saves restore the checkbox and show an alert', () => {
  const ui = setup('All', 500);
  ui.change(ui.checkbox);
  assert.equal(ui.checkbox.checked, false);
  assert.match(ui.form.alert.textContent, /could not be saved/);
});

test('filter changes still submit the navigation form', () => {
  const ui = setup();
  ui.change({ type: 'select-one' });
  assert.equal(ui.form.submitted, true);
});
