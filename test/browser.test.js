import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

test('rapid automatic filter changes preserve drafts and propagate the latest selection', async () => {
  const handlers = {};
  const hidden = [{ name: 'filter', value: 'All' }, { name: 'priorityFilter', value: 'All' },
    { name: 'order', value: 'Original' }];
  const drafts = { search: 'Hit', dueFrom: '2025-01-01', dueThrough: '2025-12-31' };
  const selected = { filter: 'All', priorityFilter: 'All', order: 'Original' };
  const requests = [];
  const replacements = [];
  const locations = [];
  const form = { method: 'get', action: 'http://localhost/projects/1' };
  const announcement = { hidden: false };
  const buttons = [{ disabled: false }, { disabled: false }];
  let busy = false;
  const results = {
    replaceChildren: (...children) => replacements.push(children),
    setAttribute: () => { busy = true; },
    removeAttribute: () => { busy = false; },
    querySelectorAll: (selector) => selector === '[data-directory-empty]' ? [announcement] : buttons,
  };
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  runInNewContext(source, {
    document: {
      addEventListener: (name, handler) => { handlers[name] = handler; },
      querySelector: () => results,
      querySelectorAll: () => hidden,
    },
    URL, URLSearchParams, AbortController,
    FormData: class { constructor() { return Object.entries({ ...selected, search: '' })[Symbol.iterator](); } },
    history: { replaceState: (_state, _title, url) => locations.push(String(url)) },
    location: { assign: () => assert.fail('Unexpected fallback navigation') },
    DOMParser: class { parseFromString(html) { return { querySelector: () => ({ childNodes: [html] }) }; } },
    fetch: (url, options) => new Promise((resolve) => requests.push({ url, options, resolve })),
  });
  const change = (name, value) => {
    selected[name] = value;
    return handlers.change({ target: { name, value, form, matches: () => true } });
  };
  handlers.submit();
  assert.equal(announcement.hidden, true);
  assert.ok(buttons.every((button) => !button.disabled), 'submission must retain the clicked button name/value');
  announcement.hidden = false;
  const first = change('filter', 'Deleted');
  assert.equal(busy, true);
  assert.equal(announcement.hidden, true);
  assert.ok(buttons.every((button) => button.disabled));
  const second = change('priorityFilter', 'High');
  assert.equal(hidden[0].value, 'Deleted');
  assert.equal(hidden[1].value, 'High');
  assert.equal(requests[0].options.signal.aborted, true);
  assert.match(locations[1], /filter=Deleted&priorityFilter=High/);
  requests[1].resolve({ ok: true, text: async () => 'latest rows' });
  await second;
  assert.equal(busy, false);
  requests[0].resolve({ ok: true, text: async () => 'stale rows' });
  await first;
  assert.deepEqual(replacements, [['latest rows']]);
  assert.deepEqual(drafts, { search: 'Hit', dueFrom: '2025-01-01', dueThrough: '2025-12-31' });

  const third = change('order', 'Due date');
  assert.equal(hidden[2].value, 'Due date');
  assert.equal(requests[2].url.searchParams.get('filter'), 'Deleted');
  assert.equal(requests[2].url.searchParams.get('priorityFilter'), 'High');
  assert.equal(requests[2].url.searchParams.get('order'), 'Due date');
  handlers.submit();
  assert.equal(requests[2].options.signal.aborted, true);
  requests[2].resolve({ ok: true, text: async () => 'discarded rows' });
  await third;
  assert.equal(replacements.length, 1);
});
