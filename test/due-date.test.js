import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDueDate, parseDueRange, matchesDueRange } from '../due-date.js';

test('due dates accept only real Gregorian days in the four-digit year range', () => {
  for (const date of [
    '0001-01-01', '0099-12-31', '9999-12-31', '2000-02-29', '2024-02-29',
    '2400-02-29', '1900-02-28', '2026-04-30', '2026-01-31',
  ]) {
    assert.equal(parseDueDate(date), date);
    assert.equal(parseDueDate(` \t${date}\n `), date);
  }
  for (const date of [
    '0000-01-01', '10000-01-01', '2026-00-01', '2026-13-01', '2026-01-00',
    '2026-01-32', '2026-04-31', '2026-02-29', '1900-02-29', '2100-02-29',
    '2024-02-30', '2026-1-01', '2026-01-1', '26-01-01', '-001-01-01',
    '2026/01/01', '2026-01-01T00:00:00Z', '2026- 01-01', 'not a date',
  ]) {
    assert.equal(parseDueDate(date), null, date);
  }
  assert.equal(parseDueDate(''), '');
  assert.equal(parseDueDate(' \t\n '), '');
});

test('due ranges validate boundaries and match inclusive calendar dates', () => {
  assert.deepEqual(parseDueRange(' 2024-02-29 ', ' 9999-12-31 '),
    { from: '2024-02-29', through: '9999-12-31' });
  for (const [from, through] of [['2023-02-29', ''], ['', '0000-01-01'], ['2024-1-01', '2025-01-01']]) {
    assert.equal(parseDueRange(from, through).error, 'Due range must use valid YYYY-MM-DD dates');
  }
  assert.equal(parseDueRange('2025-01-01', '2024-12-31').error, 'Due from must not be after Due through');
  const dates = ['', '0001-01-01', '2024-02-28', '2024-02-29', '2024-03-01', '9999-12-31'];
  for (const [from, through, expected] of [
    ['', '', dates],
    ['2024-02-29', '', dates.slice(3)],
    ['', '2024-02-29', dates.slice(1, 4)],
    ['2024-02-29', '2024-02-29', ['2024-02-29']],
    ['0001-01-01', '9999-12-31', dates.slice(1)],
  ]) {
    assert.deepEqual(dates.filter((date) => matchesDueRange(date, parseDueRange(from, through))), expected);
  }
});
