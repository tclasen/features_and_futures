import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDueDate, normalizeDueRange } from '../src/due-date.js';

test('due dates use strict Gregorian calendar days with four-digit nonzero years', () => {
  for (const date of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '2400-02-29', '1900-02-28', '2026-04-30']) {
    assert.equal(normalizeDueDate(` \t${date}\n`), date);
  }
  for (const date of ['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2025-02-29', '0001-02-29',
    '2026-04-31', '2026-01-32', '2026-00-10', '2026-13-10', '2026-01-00', '2026-1-01', '26-01-01',
    '2026-01-1', '2026-01-01T00:00:00Z', '2026-01-01 extra', '<script>', 'not a date']) {
    assert.equal(normalizeDueDate(date), null, date);
  }
  assert.equal(normalizeDueDate(''), '');
  assert.equal(normalizeDueDate(' \t\n '), '');
});

test('due ranges normalize unbounded and inclusive dates and reject invalid or reversed boundaries', () => {
  assert.deepEqual(normalizeDueRange(' \t ', ''), { dueFrom: '', dueThrough: '' });
  assert.deepEqual(normalizeDueRange(' 0001-01-01 ', '9999-12-31 '), { dueFrom: '0001-01-01', dueThrough: '9999-12-31' });
  assert.deepEqual(normalizeDueRange('2000-02-29', '2000-02-29'), { dueFrom: '2000-02-29', dueThrough: '2000-02-29' });
  for (const [from, through] of [['2026-02-29', ''], ['', '1900-02-29'], ['2026-1-01', '2026-01-01'], ['0000-01-01', '9999-12-31']]) {
    assert.deepEqual(normalizeDueRange(from, through), { error: 'Due range must use valid YYYY-MM-DD dates' });
  }
  assert.deepEqual(normalizeDueRange('2026-01-02', '2026-01-01'), { error: 'Due from must not be after Due through' });
});
