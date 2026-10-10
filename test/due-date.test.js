import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDueDate, normalizeDueRange } from '../due-date.js';

test('accepts canonical Gregorian days, trims whitespace, and clears blank dates', () => {
  for (const date of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '1900-02-28', '2026-04-30']) {
    assert.equal(normalizeDueDate(` \t${date}\n `), date);
  }
  for (const blank of ['', ' \t\n ']) assert.equal(normalizeDueDate(blank), '');
});

test('rejects impossible days, noncanonical formats, out-of-range years, and nonstrings', () => {
  for (const value of [
    '0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2025-02-29',
    '2024-02-30', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00',
    '2026-01-32', '2026-1-01', '26-01-01', '2026-01-1', '2026/01/01',
    '2026-01-01T00:00:00Z', 'not a date', null, 20260101, true, {}, [],
  ]) {
    assert.equal(normalizeDueDate(value), null, String(value));
  }
});

test('normalizes empty, one-sided, inclusive, and full calendar-domain ranges', () => {
  for (const [from, through, expected] of [
    [' \t ', '', { from: '', through: '' }],
    [' 0001-01-01 ', '', { from: '0001-01-01', through: '' }],
    ['', ' 9999-12-31 ', { from: '', through: '9999-12-31' }],
    ['2000-02-29', '2000-02-29', { from: '2000-02-29', through: '2000-02-29' }],
    ['0001-01-01', '9999-12-31', { from: '0001-01-01', through: '9999-12-31' }],
  ]) assert.deepEqual(normalizeDueRange(from, through), expected);
});

test('invalid ranges distinguish date errors from reversed valid boundaries', () => {
  for (const invalid of ['2026-04-31', '1900-02-29', '0000-01-01', '2026-1-01', 'invalid', null]) {
    assert.throws(() => normalizeDueRange(invalid, ''), {
      message: 'Due range must use valid YYYY-MM-DD dates',
    });
    assert.throws(() => normalizeDueRange('2026-01-01', invalid), {
      message: 'Due range must use valid YYYY-MM-DD dates',
    });
  }
  assert.throws(() => normalizeDueRange('2026-10-11', '2026-10-10'), {
    message: 'Due from must not be after Due through',
  });
});
