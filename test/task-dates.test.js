import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDueDate, normalizeDueRange, INVALID_DUE_RANGE_MESSAGE, REVERSED_DUE_RANGE_MESSAGE } from '../task-dates.js';
import { openProjects } from '../projects.js';

test('due dates validate Gregorian boundaries, exact format and whitespace without rollover', () => {
  for (const date of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '1900-02-28', '2026-04-30']) {
    assert.equal(normalizeDueDate(` \t${date}\n `), date);
  }
  for (const date of ['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2025-02-29',
    '2026-04-31', '2026-02-30', '2026-00-01', '2026-13-01', '2026-01-00', '2026-01-32',
    '2026-1-01', '26-01-01', '2026/01/01', '2026-01-01T00:00:00Z', 'not a date', null, undefined, 20260101]) {
    assert.equal(normalizeDueDate(date), null, String(date));
  }
  assert.equal(normalizeDueDate(''), '');
  assert.equal(normalizeDueDate(' \t\n '), '');
});

test('due-date updates isolate tasks, preserve other fields and guard ownership and archival', () => {
  const projects = openProjects(':memory:');
  try {
    projects.create('First');
    projects.create('Second');
    projects.createTask(1, 'First task');
    projects.createTask(1, 'Next task');
    projects.createTask(2, 'Private');
    projects.setTaskPriority(1, 1, 'High');
    projects.setTaskCompleted(1, 1, true);
    const original = projects.listTasks(1).map((task) => ({ ...task }));
    const summary = projects.list();
    assert.equal(original[0].due_date, '');
    assert.equal(projects.setTaskDueDate(1, 1, ' 2000-02-29 '), true);
    const saved = [{ ...original[0], due_date: '2000-02-29' }, original[1]];
    assert.deepEqual(projects.listTasks(1).map((task) => ({ ...task })), saved);
    for (const [projectId, taskId, date] of [[1, 1, '1900-02-29'], [2, 1, '2026-01-01'], [1, 999, '2026-01-01']]) {
      assert.equal(projects.setTaskDueDate(projectId, taskId, date), false);
    }
    assert.deepEqual(projects.listTasks(1).map((task) => ({ ...task })), saved);
    assert.equal(projects.listTasks(2)[0].due_date, '');
    assert.deepEqual(projects.list(), summary);
    projects.renameTask(1, 1, 'Renamed');
    assert.equal(projects.listTasks(1)[0].due_date, '2000-02-29');
    projects.setArchived(1, true);
    assert.equal(projects.setTaskDueDate(1, 1, ''), false);
    assert.equal(projects.listTasks(1)[0].due_date, '2000-02-29');
    projects.setArchived(1, false);
    assert.equal(projects.setTaskDueDate(1, 1, ' \n '), true);
    assert.equal(projects.listTasks(1)[0].due_date, '');
  } finally {
    projects.close();
  }
});

test('due ranges intersect filters inclusively, exclude undated tasks only when bounded and preserve data', () => {
  const projects = openProjects(':memory:');
  try {
    projects.create('Dates');
    const dates = ['', '0001-01-01', '2024-02-28', '2024-02-29', '2024-03-01', '9999-12-31'];
    dates.forEach((date, index) => {
      projects.createTask(1, `Task ${index}`);
      projects.setTaskDueDate(1, index + 1, date);
      projects.setTaskCompleted(1, index + 1, index % 2 === 0);
      projects.setTaskPriority(1, index + 1, index % 2 === 0 ? 'High' : 'Low');
    });
    const original = projects.listTasks(1);
    const summary = projects.list();
    for (const [dueFrom, dueThrough, ids] of [
      ['', '', [1, 2, 3, 4, 5, 6]],
      ['2024-02-28', '2024-03-01', [3, 4, 5]],
      ['', '2024-02-29', [2, 3, 4]],
      ['2024-02-29', '', [4, 5, 6]],
      ['2024-02-29', '2024-02-29', [4]],
      ['0001-01-01', '9999-12-31', [2, 3, 4, 5, 6]],
    ]) {
      for (const completion of ['All', 'Open', 'Completed']) {
        for (const priority of ['All', 'Low', 'Normal', 'High']) {
          const expected = original.filter((task) => ids.includes(task.id) &&
            (completion === 'All' || Boolean(task.completed) === (completion === 'Completed')) &&
            (priority === 'All' || task.priority === priority));
          assert.deepEqual(projects.listTasks(1, completion, priority, { dueFrom, dueThrough }), expected);
        }
      }
    }
    assert.deepEqual(projects.listTasks(1), original);
    assert.deepEqual(projects.list(), summary);
  } finally {
    projects.close();
  }
});

test('due range normalization shares calendar rules and distinguishes reversed boundaries', () => {
  assert.deepEqual(normalizeDueRange(' 2024-02-29 ', ' 2024-03-01 '), {
    dueFrom: '2024-02-29', dueThrough: '2024-03-01',
  });
  assert.deepEqual(normalizeDueRange(' \t ', ''), { dueFrom: '', dueThrough: '' });
  for (const invalid of ['1900-02-29', '0000-01-01', '10000-01-01', '2024-2-29', '2024-04-31']) {
    assert.deepEqual(normalizeDueRange(invalid, ''), { error: INVALID_DUE_RANGE_MESSAGE });
    assert.deepEqual(normalizeDueRange('', invalid), { error: INVALID_DUE_RANGE_MESSAGE });
  }
  assert.deepEqual(normalizeDueRange('2024-03-01', '2024-02-29'), { error: REVERSED_DUE_RANGE_MESSAGE });
});
