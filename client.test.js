import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const script = await readFile(new URL('./client.js', import.meta.url), 'utf8');

function browser({ ok = true, completed = true } = {}) {
  let submit;
  let finishRequest;
  let request;
  let replacement;
  let alert;
  const frames = [];
  const checkbox = { checked: completed, defaultChecked: !completed, disabled: false };
  const fields = { filter: completed ? 'Open' : 'Completed', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-03-01' };
  if (completed) fields.completed = '1';
  const form = {
    action: 'http://localhost/projects/1/tasks/2', isConnected: true,
    matches: selector => selector === 'form.task-completion',
    querySelector: () => checkbox,
    prepend: element => { alert = element; },
  };
  const updatedTasks = {};
  const document = {
    addEventListener: (type, listener) => { assert.equal(type, 'submit'); submit = listener; },
    querySelector: selector => {
      assert.equal(selector, 'section[aria-label="Tasks"]');
      return { replaceWith: tasks => { replacement = tasks; } };
    },
    createElement: () => ({ setAttribute(name, value) { this[name] = value; } }),
  };
  runInNewContext(script, {
    document, URLSearchParams,
    FormData: class { constructor() { return Object.entries(fields); } },
    DOMParser: class {
      parseFromString() { return { querySelector: () => updatedTasks }; }
    },
    requestAnimationFrame: callback => frames.push(callback),
    fetch: (url, options) => {
      request = { url, options };
      return new Promise(resolve => { finishRequest = () => resolve({ ok, text: async () => '<section></section>' }); });
    },
  });
  return {
    checkbox, form, fields, frames, updatedTasks,
    submit: event => submit(event),
    finishRequest: () => finishRequest(),
    get request() { return request; },
    get replacement() { return replacement; },
    get alert() { return alert; },
  };
}

test('completion saves asynchronously without navigation and retains completion, priority, and due-range filters', async () => {
  for (const completed of [true, false]) {
    const page = browser({ completed });
    let prevented = false;
    const saving = page.submit({ target: page.form, preventDefault: () => { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(page.checkbox.checked, completed);
    assert.equal(page.form.isConnected, true);
    assert.equal(page.replacement, undefined);
    assert.equal(page.request.url, page.form.action);
    assert.equal(page.request.options.method, 'POST');
    assert.deepEqual(Object.fromEntries(page.request.options.body), page.fields);
    page.finishRequest();
    await saving;
    assert.equal(page.replacement, undefined);
    page.frames.shift()();
    assert.equal(page.replacement, undefined);
    page.frames.shift()();
    assert.equal(page.replacement, page.updatedTasks);
  }
});

test('failed completion saves restore the previous state and display an alert', async () => {
  const page = browser({ ok: false });
  const saving = page.submit({ target: page.form, preventDefault() {} });
  page.finishRequest();
  await saving;
  assert.equal(page.checkbox.checked, false);
  assert.equal(page.checkbox.disabled, false);
  assert.equal(page.alert.role, 'alert');
  assert.match(page.alert.textContent, /Unable to save task completion/);
  assert.equal(page.replacement, undefined);
});

test('other forms retain their normal submission behavior', async () => {
  const page = browser();
  await page.submit({ target: { matches: () => false }, preventDefault() { assert.fail('Unexpected interception'); } });
  assert.equal(page.request, undefined);
});
