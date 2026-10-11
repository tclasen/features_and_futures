import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { renderProject } from '../views.js';

const project = { id: 'project', name: 'Range intersections', default_task_priority: 'Normal', archived: false };
const task = { id: 'task', title: 'Range completed', completed: true, priority: 'High', due_date: '2029-01-15', notes: '', deleted: false };

function completionPage() {
  return renderProject(project, [task], 'Completed', '', 'High', { from: '2029-01-01', through: '2029-01-31' });
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

function browserHarness() {
  const timers = new Map();
  const requests = [];
  const navigations = [];
  const submissions = [];
  const alerts = [];
  let onSubmit;
  let nextTimer = 0;
  const context = {
    URLSearchParams,
    FormData: class {
      constructor(form) { this.fields = Object.entries(form.fields); }
      [Symbol.iterator]() { return this.fields[Symbol.iterator](); }
    },
    fetch(action, options) {
      return new Promise((resolve) => requests.push({ action, options, resolve }));
    },
    HTMLFormElement: { prototype: { submit() { submissions.push(this.action); } } },
    document: {
      addEventListener(type, listener) { assert.equal(type, 'submit'); onSubmit = listener; },
      createElement() { return { setAttribute() {} }; },
      querySelector() { return { prepend(alert) { alerts.push(alert.textContent); } }; },
    },
    window: { location: { assign(url) { navigations.push(url); } } },
    setTimeout(callback, delay) {
      assert.equal(delay, 150);
      timers.set(++nextTimer, callback);
      return nextTimer;
    },
    clearTimeout(timer) { timers.delete(timer); },
  };
  runInNewContext(completionPage().match(/<script>([\s\S]*?)<\/script>/)[1], context);
  return {
    context, timers, requests, navigations, submissions, alerts,
    submit(form) {
      let prevented = false;
      const result = onSubmit({ target: form, preventDefault() { prevented = true; } });
      assert.equal(prevented, true);
      return result;
    },
    resolve(index = 0, ok = true) { requests[index].resolve({ ok, url: '/projects/project?filter=Completed' }); },
    runTimer() {
      const [id, callback] = [...timers.entries()][0];
      timers.delete(id);
      return callback();
    },
  };
}

function completionForm(completed = '1') {
  return { action: '/projects/project/tasks/task', fields: { completed, filter: 'Completed', priorityFilter: 'High' } };
}

test('completion persistence starts immediately but navigation waits for native checkbox interaction', async () => {
  const browser = browserHarness();
  browser.context.deferCompletionSubmit(completionForm());
  assert.deepEqual(browser.navigations, []);
  await flush();
  assert.equal(browser.requests[0].options.body.get('completed'), '1');
  browser.resolve();
  await flush();
  assert.deepEqual(browser.navigations, []);
  await browser.runTimer();
  assert.deepEqual(browser.navigations, ['/projects/project?filter=Completed']);

  const html = completionPage();
  assert.match(html, /aria-label="Complete Range completed"[^>]*onchange="deferCompletionSubmit\(this.form\)"/);
  const form = html.match(/<form method="post" action="\/projects\/project\/tasks\/task">([\s\S]*?)<\/form>/)[1];
  for (const [name, value] of Object.entries({ filter: 'Completed', priorityFilter: 'High', dueFrom: '2029-01-01', dueThrough: '2029-01-31' })) {
    assert.ok(form.includes(`name="${name}" value="${value}"`));
  }
});

test('quick deletion, edits, filters and export wait for completion to be saved', async () => {
  for (const action of ['tasks/task/delete', 'tasks/task/priority', 'tasks/task/notes', 'export', '']) {
    const browser = browserHarness();
    browser.context.deferCompletionSubmit(completionForm());
    const nextAction = `/projects/project/${action}`;
    const submitting = browser.submit({ action: nextAction });
    await flush();
    assert.deepEqual(browser.submissions, [], 'later action must not overtake completion');
    assert.equal(browser.timers.size, 0, 'later action cancels delayed navigation');
    browser.resolve();
    await submitting;
    assert.deepEqual(browser.submissions, [nextAction]);
    assert.deepEqual(browser.navigations, []);
  }
});

test('a later form also wins while completion navigation is already waiting for its response', async () => {
  const browser = browserHarness();
  browser.context.deferCompletionSubmit(completionForm());
  await flush();
  const navigation = browser.runTimer();
  const deletion = browser.submit({ action: '/projects/project/tasks/task/delete' });
  browser.resolve();
  await Promise.all([navigation, deletion]);
  assert.deepEqual(browser.navigations, []);
  assert.deepEqual(browser.submissions, ['/projects/project/tasks/task/delete']);
});

test('rapid toggles save snapshots sequentially and later actions wait for the final state', async () => {
  const browser = browserHarness();
  const form = completionForm('1');
  browser.context.deferCompletionSubmit(form);
  form.fields.completed = '';
  browser.context.deferCompletionSubmit(form);
  assert.equal(browser.timers.size, 1);
  const deletion = browser.submit({ action: '/projects/project/tasks/task/delete' });
  await flush();
  assert.equal(browser.requests.length, 1);
  assert.equal(browser.requests[0].options.body.get('completed'), '1');
  browser.resolve();
  await flush();
  assert.equal(browser.requests.length, 2);
  assert.equal(browser.requests[1].options.body.get('completed'), '');
  assert.deepEqual(browser.submissions, []);
  browser.resolve(1);
  await deletion;
  assert.equal(browser.submissions.length, 1);
});

test('failed completion saves show an alert and do not permit a later action', async () => {
  const browser = browserHarness();
  browser.context.deferCompletionSubmit(completionForm());
  const deletion = browser.submit({ action: '/projects/project/tasks/task/delete' });
  await flush();
  browser.resolve(0, false);
  await deletion;
  assert.deepEqual(browser.submissions, []);
  assert.equal(browser.alerts.length, 1);
  assert.match(browser.alerts[0], /Could not save task completion/);
});

test('archived and deleted completion checkboxes remain disabled', () => {
  for (const [owner, record] of [[{ ...project, archived: true }, task], [project, { ...task, deleted: true }]]) {
    assert.match(renderProject(owner, [record]), /type="checkbox"[^>]* disabled[^>]*onchange="deferCompletionSubmit\(this.form\)"/);
  }
});
