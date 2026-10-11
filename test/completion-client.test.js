import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

test('completion saves without navigation and lets the checkbox action settle before removing rows', async () => {
  const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const script = source.match(/<script>([\s\S]*?)<\/script>/)[1];
  let change, settle, replacement, saved, location;
  const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2029-01-01', dueThrough: '2029-01-31', search: 'range' };
  const main = { replaceWith(value) { replacement = value; } };
  runInNewContext(script, {
    URLSearchParams,
    FormData: class { constructor(form) { return Object.entries(form.fields); } },
    document: {
      addEventListener(type, callback) { assert.equal(type, 'change'); change = callback; },
      querySelector() { return main; }
    },
    setTimeout(callback, delay) { assert.ok(delay >= 100); settle = callback; },
    fetch: async (url, options) => {
      saved = { url, method: options.method, fields: Object.fromEntries(options.body) };
      return { text: async () => '<main>No matching tasks.</main>', url: '/projects/1?retained-filters' };
    },
    DOMParser: class { parseFromString(html) { return { querySelector: () => html }; } },
    history: { replaceState(_state, _title, url) { location = url; } }
  });
  const checkbox = {
    checked: false,
    matches: () => true,
    form: { action: '/projects/1/tasks/1', fields: state }
  };
  const saving = change({ target: checkbox });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(checkbox.checked, false);
  assert.equal(replacement, undefined, 'row must stay attached during checkbox action');
  assert.deepEqual(saved, { url: '/projects/1/tasks/1', method: 'POST', fields: state });
  settle();
  await saving;
  assert.equal(replacement, '<main>No matching tasks.</main>');
  assert.equal(location, '/projects/1?retained-filters');
  assert.doesNotMatch(source, /type="checkbox"[^>]*onchange=/);
});
