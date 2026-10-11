import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

async function client(matching) {
  const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const script = source.match(/<script>([\s\S]*?)<\/script>/)[1];
  let change, settle, saved, removed = false;
  const state = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2029-01-01', dueThrough: '2029-01-31', search: 'range' };
  const row = { dataset: { taskId: '1' }, isConnected: true, remove() { removed = true; } };
  runInNewContext(script, {
    URLSearchParams,
    FormData: class { constructor(form) { return Object.entries(form.fields); } },
    document: {
      addEventListener(type, callback) { assert.equal(type, 'change'); change = callback; },
      querySelector() { throw new Error('Must not replace the page or its controls'); }
    },
    setTimeout(callback, delay) { assert.ok(delay >= 100); settle = callback; },
    fetch: async (url, options) => {
      saved = { url, method: options.method, fields: Object.fromEntries(options.body) };
      return { ok: true, text: async () => '<main>Saved tasks</main>' };
    },
    DOMParser: class {
      parseFromString() {
        return { querySelector(selector) {
          assert.equal(selector, '[data-task-id="1"]');
          return matching ? {} : null;
        } };
      }
    }
  });
  const checkbox = {
    checked: false,
    matches: () => true,
    closest: () => row,
    form: { action: '/projects/1/tasks/1', fields: state }
  };
  const saving = change({ target: checkbox });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(checkbox.checked, false);
  assert.equal(removed, false, 'row must stay attached during checkbox action');
  assert.deepEqual(saved, { url: '/projects/1/tasks/1', method: 'POST', fields: state });
  return { finish: async () => { settle(); await saving; return removed; }, row };
}

test('completion removes only its own filtered-out row after the click settles', async () => {
  const saving = await client(false);
  assert.equal(await saving.finish(), true);
});

test('completion preserves matching rows and all current controls instead of replacing a stale page snapshot', async () => {
  const saving = await client(true);
  assert.equal(await saving.finish(), false);
});

test('completion response cannot modify a row from an obsolete page after another navigation', async () => {
  const saving = await client(false);
  saving.row.isConnected = false;
  assert.equal(await saving.finish(), false);
});
