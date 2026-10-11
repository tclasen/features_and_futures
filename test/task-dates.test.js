import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDueDate, normalizeDueRange, matchesDueRange } from '../task-dates.js';

test('due dates validate Gregorian calendar boundaries without timezone conversion', () => {
  for (const value of ['', ' \t\n ']) assert.equal(normalizeDueDate(value), '');
  for (const date of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '1900-02-28', '2026-04-30']) {
    assert.equal(normalizeDueDate(` \t${date}\n `), date);
  }
  for (const date of [
    '0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2026-02-29',
    '2026-04-31', '2026-01-32', '2026-00-01', '2026-13-01', '2026-01-00',
    '2026-1-01', '26-01-01', '2026-01-1', '2026/01/01', '2026-01-01T00:00:00Z',
    '2026- 01-01', '<script>',
  ]) assert.equal(normalizeDueDate(date), null, date);
});

test('due ranges trim and validate each boundary and include dated endpoints only', () => {
  assert.deepEqual(normalizeDueRange(' 2000-02-29 ', ' 2000-02-29 '), {
    from: '2000-02-29', through: '2000-02-29',
  });
  for (const [from, through] of [['1900-02-29', ''], ['', '0000-01-01'], ['2026-1-01', '']]) {
    assert.equal(normalizeDueRange(from, through).error, 'Due range must use valid YYYY-MM-DD dates');
  }
  assert.equal(normalizeDueRange('2026-02-01', '2026-01-31').error, 'Due from must not be after Due through');
  for (const [from, through, expected] of [
    ['', '', [true, true, true, true]],
    ['2000-02-29', '', [false, false, true, true]],
    ['', '2000-02-29', [false, true, true, false]],
    ['2000-02-29', '2000-02-29', [false, false, true, false]],
    ['0001-01-01', '9999-12-31', [false, true, true, true]],
  ]) {
    const range = normalizeDueRange(from, through);
    assert.deepEqual(['', '0001-01-01', '2000-02-29', '9999-12-31'].map((date) => matchesDueRange(date, range)), expected);
  }
});
