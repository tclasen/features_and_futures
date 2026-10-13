import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const script = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

// Exercise the browser event handler with deferred responses: HTTP integration
// tests separately verify saved fields, matching rows, summaries and restarts.
function browser() {
  const listeners = {};
  const requests = [];
  const controls = [{ disabled: false }, { disabled: true }];
  const announcement = { hidden: false };
  const main = {
    busy: false,
    querySelectorAll: () => controls,
    setAttribute() { this.busy = true; },
    removeAttribute() { this.busy = false; },
    replaceWith(next) { state.main = next; },
    prepend(alert) { state.alert = alert; },
  };
  const state = { main, title: 'Before', parsed: '', alert: null };
  const location = { href: 'http://localhost/directory', reload() { state.reloaded = true; } };
  const document = {
    addEventListener(name, listener) { listeners[name] = listener; },
    querySelector: () => state.main,
    getElementById: () => announcement,
    createElement: () => ({ setAttribute() {} }),
    get title() { return state.title; },
    set title(value) { state.title = value; },
  };
  runInNewContext(script, {
    document, location, URL, URLSearchParams,
    FormData: class { constructor(form) { return form.fields; } },
    DOMParser: class {
      parseFromString(html) {
        state.parsed = html;
        return { title: 'Resolved', querySelector: () => ({ ...main, resolved: true }) };
      }
    },
    history: { pushState(_state, _title, url) { location.href = url; } },
    window: { addEventListener(name, listener) { listeners[name] = listener; } },
    fetch(url, options) {
      return new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }));
    },
  });
  const submit = (path, method = 'post', fields = []) => {
    const event = {
      target: { action: new URL(path, location.href).href, method, fields },
      prevented: false,
      preventDefault() { this.prevented = true; },
    };
    return { event, finished: listeners.submit(event) };
  };
  const resolve = (index, url, html = 'Saved result') => requests[index].resolve({
    url: new URL(url, location.href).href, text: async () => html,
  });
  return { controls, announcement, state, main, location, listeners, requests, submit, resolve };
}

test('form updates capture values before disabling controls and wait for resolved saved results', async () => {
  const ui = browser();
  const save = ui.submit('/projects/1/tasks/2?filter=Completed', 'post', [['completed', '1']]);
  assert.equal(save.event.prevented, true);
  assert.equal(ui.requests[0].options.body.get('completed'), '1');
  assert.equal(ui.requests[0].options.keepalive, true);
  assert.ok(ui.controls.every(control => control.disabled));
  assert.equal(ui.main.busy, true);
  assert.equal(ui.announcement.hidden, true);
  assert.equal(ui.state.main, ui.main);
  // A second navigation cannot overtake or cancel the pending write.
  const navigation = ui.submit('/', 'get');
  await navigation.finished;
  assert.equal(navigation.event.prevented, true);
  assert.equal(ui.requests.length, 1);
  ui.resolve(0, '/projects/1?filter=Completed');
  await save.finished;
  assert.equal(ui.state.main.resolved, true);
  assert.equal(ui.state.title, 'Resolved');
  assert.equal(ui.location.href, 'http://localhost/projects/1?filter=Completed');
  const nextNavigation = ui.submit('/', 'get');
  assert.equal(ui.requests.length, 2);
  assert.equal(ui.requests[1].options.method, 'GET');
  assert.equal(ui.requests[1].options.body, undefined);
  ui.resolve(1, '/');
  await nextNavigation.finished;
  assert.equal(ui.location.href, 'http://localhost/');
});

test('filter updates retain submitted intersections and hide empty announcements while loading', async () => {
  const ui = browser();
  const filtering = ui.submit('/directory?old=discarded', 'get', [
    ['scope', 'Archived'], ['filter', 'Deleted'], ['order', 'Title'],
    ['priorityFilter', 'High'], ['dueFrom', '2056-01-01'], ['search', 'Mixed\t query'],
  ]);
  const params = ui.requests[0].url.searchParams;
  assert.equal(params.get('old'), null);
  assert.equal(params.get('scope'), 'Archived');
  assert.equal(params.get('filter'), 'Deleted');
  assert.equal(params.get('order'), 'Title');
  assert.equal(params.get('priorityFilter'), 'High');
  assert.equal(params.get('dueFrom'), '2056-01-01');
  assert.equal(params.get('search'), 'Mixed\t query');
  assert.equal(ui.announcement.hidden, true);
  ui.resolve(0, ui.requests[0].url.href, '0/0 completed; No matching tasks');
  await filtering.finished;
  assert.equal(ui.state.parsed, '0/0 completed; No matching tasks');
});

test('server validation pages replace results; transport failures retain values and protected controls', async () => {
  const ui = browser();
  const invalid = ui.submit('/projects/import', 'post', [['json', 'invalid'], ['name', 'Copy']]);
  ui.resolve(0, '/projects/import', 'Invalid project JSON; retained submitted fields');
  await invalid.finished;
  assert.equal(ui.state.parsed, 'Invalid project JSON; retained submitted fields');

  const failedUi = browser();
  const failed = failedUi.submit('/projects/1/tasks/2/delete');
  failedUi.requests[0].reject(new Error('Network unavailable'));
  await failed.finished;
  assert.deepEqual(failedUi.controls.map(control => control.disabled), [false, true]);
  assert.equal(failedUi.state.main, failedUi.main);
  assert.equal(failedUi.main.busy, false);
  assert.equal(failedUi.announcement.hidden, false);
  assert.match(failedUi.state.alert.textContent, /Please try again/);
});

test('downloads keep native attachment handling and browser history reloads saved views', async () => {
  const ui = browser();
  const download = ui.submit('/projects/1/export', 'get');
  await download.finished;
  assert.equal(download.event.prevented, false);
  assert.equal(ui.requests.length, 0);
  ui.listeners.popstate();
  assert.equal(ui.state.reloaded, true);
});
