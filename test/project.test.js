import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import test from 'node:test';
import { installTaskCompletion, saveCompletion } from '../project.js';

function pageFixture(filter = 'All') {
  const listeners = new Map();
  const alert = { hidden: true, textContent: '' };
  const row = { removed: false, remove() { this.removed = true; } };
  const checkbox = {
    checked: false,
    disabled: false,
    matches: () => true,
    form: {
      action: '/projects/1/tasks/2/completion',
      elements: { filter: { value: filter } },
      closest: () => row,
    },
  };
  const document = {
    querySelector: () => alert,
    addEventListener: (name, handler) => listeners.set(name, handler),
  };
  return { document, listeners, alert, checkbox, row };
}

test('completion requests explicitly save both directions and survive navigation', async () => {
  for (const completed of [true, false]) {
    let request;
    await saveCompletion('/projects/1/tasks/2/completion', completed, 'All', async (action, options) => {
      request = { action, ...options };
      return { ok: true };
    });
    assert.equal(request.action, '/projects/1/tasks/2/completion');
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.Accept, 'application/json');
    assert.equal(request.body.get('completed'), completed ? '1' : null);
    assert.equal(request.body.get('filter'), 'All');
    assert.equal(request.keepalive, true);
  }
  await assert.rejects(saveCompletion('/missing', false, 'All', async () => ({ ok: false })), /could not be saved/);
});

test('filter navigation waits for the unchecked state to finish saving', async () => {
  const fixture = pageFixture();
  let finishSave;
  installTaskCompletion(fixture.document, (action, completed) => {
    assert.equal(completed, false);
    return new Promise((resolve) => { finishSave = resolve; });
  });
  fixture.listeners.get('change')({ target: fixture.checkbox });
  assert.equal(fixture.checkbox.disabled, true);
  let navigations = 0;
  let prevented = false;
  const submitter = {};
  const navigation = fixture.listeners.get('submit')({
    target: { requestSubmit(button) { assert.equal(button, submitter); navigations++; } },
    submitter,
    preventDefault() { prevented = true; },
  });
  assert.equal(prevented, true);
  assert.equal(navigations, 0);
  finishSave();
  await navigation;
  assert.equal(navigations, 1);
  assert.equal(fixture.checkbox.checked, false);
  assert.equal(fixture.checkbox.disabled, false);
});

test('a completed-filter row disappears only after unchecking is saved', async () => {
  const fixture = pageFixture('Completed');
  let finishSave;
  installTaskCompletion(fixture.document, () => new Promise((resolve) => { finishSave = resolve; }));
  fixture.listeners.get('change')({ target: fixture.checkbox });
  assert.equal(fixture.row.removed, false);
  finishSave();
  await setImmediate();
  assert.equal(fixture.row.removed, true);
});

test('failed saves restore completion and prevent queued navigation', async () => {
  const fixture = pageFixture('Completed');
  let failSave;
  installTaskCompletion(fixture.document, () => new Promise((resolve, reject) => { failSave = reject; }));
  fixture.listeners.get('change')({ target: fixture.checkbox });
  let navigated = false;
  const navigation = fixture.listeners.get('submit')({
    target: { requestSubmit() { navigated = true; } },
    preventDefault() {},
  });
  failSave(new Error('Network unavailable'));
  await navigation;
  assert.equal(navigated, false);
  assert.equal(fixture.checkbox.checked, true);
  assert.equal(fixture.checkbox.disabled, false);
  assert.equal(fixture.row.removed, false);
  assert.equal(fixture.alert.hidden, false);
  assert.match(fixture.alert.textContent, /could not be saved/);
});
