import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeDueDate } from '../due-date.js';
import { openWorkboard } from '../database.js';

test('due dates validate Gregorian days without timezone conversion', () => {
  for (const date of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '0400-02-29']) {
    assert.equal(normalizeDueDate(` \t${date}\n`), date);
  }
  for (const value of ['', ' \t\n']) assert.equal(normalizeDueDate(value), '');
  for (const value of [
    '0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2023-02-29',
    '2024-02-30', '2024-04-31', '2024-06-31', '2024-09-31', '2024-11-31',
    '2024-00-01', '2024-13-01', '2024-01-00', '2024-01-32', '2024-1-01',
    '2024-01-1', '24-01-01', '2024/01/01', '2024-01-01T00:00:00Z',
    '2024-01-01 extra', 'not a date', null, undefined, 20240101,
  ]) assert.equal(normalizeDueDate(value), null, String(value));
  for (let month = 1; month <= 12; month++) {
    const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
    const prefix = `2023-${String(month).padStart(2, '0')}-`;
    assert.equal(normalizeDueDate(`${prefix}${days}`), `${prefix}${days}`);
    assert.equal(normalizeDueDate(`${prefix}${days + 1}`), null);
  }
});

test('due-date storage protects task ownership, archive state and other task fields', () => {
  const store = openWorkboard(':memory:');
  try {
    const first = store.create('First');
    const second = store.create('Second');
    const task = store.tasks.create(first.id, 'Original');
    const other = store.tasks.create(second.id, 'Independent');
    store.tasks.setCompleted(first.id, task.id, true);
    store.tasks.setPriority(first.id, task.id, 'high');
    const before = { ...store.tasks.list(first.id)[0] };
    const summary = store.list();
    assert.equal(before.due_date, '');
    assert.equal(store.tasks.setDueDate(first.id, task.id, ' 2000-02-29 '), true);
    assert.deepEqual({ ...store.tasks.list(first.id)[0] }, { ...before, due_date: '2000-02-29' });
    assert.equal(store.tasks.setDueDate(first.id, task.id, '1900-02-29'), false);
    assert.equal(store.tasks.setDueDate(second.id, task.id, '2025-01-01'), false);
    assert.equal(store.tasks.setDueDate(first.id, other.id, '2025-01-01'), false);
    assert.equal(store.tasks.setDueDate(first.id, 999, '2025-01-01'), false);
    assert.equal(store.tasks.list(second.id)[0].due_date, '');
    store.setArchived(first.id, true);
    assert.equal(store.tasks.setDueDate(first.id, task.id, ''), false);
    store.setArchived(first.id, false);
    store.tasks.rename(first.id, task.id, 'Renamed');
    assert.deepEqual({ ...store.tasks.list(first.id)[0] }, { ...before, title: 'Renamed', due_date: '2000-02-29' });
    assert.equal(store.tasks.setDueDate(first.id, task.id, ' \t '), true);
    assert.equal(store.tasks.list(first.id)[0].due_date, '');
    assert.deepEqual(store.list(), summary);
  } finally {
    store.close();
  }
});
