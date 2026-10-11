import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDueDate } from '../task-dates.js';
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
