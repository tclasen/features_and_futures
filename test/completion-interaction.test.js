import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { renderProject } from '../views.js';

const project = { id: 'project', name: 'Range intersections', default_task_priority: 'Normal', archived: false };
const task = { id: 'task', title: 'Range completed', completed: true, priority: 'High', due_date: '2029-01-15', notes: '', deleted: false };

function completionPage() {
  return renderProject(project, [task], 'Completed', '', 'High', { from: '2029-01-01', through: '2029-01-31' });
}

test('completion navigation waits for the checkbox interaction and submits its final state', () => {
  const html = completionPage();
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const timers = new Map();
  let nextTimer = 0;
  const context = {
    setTimeout(callback, delay) {
      assert.equal(delay, 150);
      timers.set(++nextTimer, callback);
      return nextTimer;
    },
    clearTimeout(timer) { timers.delete(timer); },
  };
  runInNewContext(script, context);
  const submissions = [];
  const checkbox = { checked: false };
  const form = { requestSubmit() { submissions.push(checkbox.checked); } };

  assert.match(html, /aria-label="Complete Range completed"[^>]*onchange="deferCompletionSubmit\(this.form\)"/);
  context.deferCompletionSubmit(form);
  assert.deepEqual(submissions, [], 'navigation must not run during the checkbox change event');
  checkbox.checked = true;
  context.deferCompletionSubmit(form);
  assert.equal(timers.size, 1, 'rapid toggles submit only the final checkbox state');
  checkbox.checked = false;
  context.deferCompletionSubmit(form);
  assert.equal(timers.size, 1);
  [...timers.values()][0]();
  assert.deepEqual(submissions, [false]);

  const completionForm = html.match(/<form method="post" action="\/projects\/project\/tasks\/task">([\s\S]*?)<\/form>/)[1];
  for (const [name, value] of Object.entries({ filter: 'Completed', priorityFilter: 'High', dueFrom: '2029-01-01', dueThrough: '2029-01-31' })) {
    assert.ok(completionForm.includes(`name="${name}" value="${value}"`));
  }
});

test('archived and deleted completion checkboxes remain disabled', () => {
  for (const [owner, record] of [[{ ...project, archived: true }, task], [project, { ...task, deleted: true }]]) {
    const html = renderProject(owner, [record]);
    assert.match(html, /type="checkbox"[^>]* disabled[^>]*onchange="deferCompletionSubmit\(this.form\)"/);
  }
});
