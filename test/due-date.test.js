import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeDueDate, normalizeDueRange } from '../due-date.js';

test('due dates validate Gregorian days and canonical four-digit years', () => {
  for (const date of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29',
    '1900-02-28', '2026-04-30', '2026-01-31']) {
    assert.equal(normalizeDueDate(` \t${date}\n `), date);
  }
  for (const date of ['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29',
    '2025-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00',
    '2026-01-32', '2026-1-01', '26-01-01', '2026-01-1', '2026/01/01',
    '2026-01-01T00:00:00Z', '2026- 01-01', 'not a date']) {
    assert.equal(normalizeDueDate(date), null, date);
  }
  for (const value of ['', ' \t\n ']) assert.equal(normalizeDueDate(value), '');
});

test('due ranges normalize optional inclusive boundaries and distinguish invalid dates from reversed ranges', () => {
  for (const [from, through, expected] of [
    ['', ' \t ', { dueFrom: '', dueThrough: '' }],
    [' 0001-01-01 ', '9999-12-31', { dueFrom: '0001-01-01', dueThrough: '9999-12-31' }],
    ['2000-02-29', '2000-02-29', { dueFrom: '2000-02-29', dueThrough: '2000-02-29' }],
    ['', '2026-01-01', { dueFrom: '', dueThrough: '2026-01-01' }],
    ['2026-01-01', '', { dueFrom: '2026-01-01', dueThrough: '' }],
  ]) assert.deepEqual(normalizeDueRange(from, through), expected);
  for (const [from, through] of [['1900-02-29', ''], ['', '0000-01-01'],
    ['2026-1-01', '2026-01-01'], ['2026-04-31', '2026-01-01']]) {
    assert.deepEqual(normalizeDueRange(from, through), { error: 'Due range must use valid YYYY-MM-DD dates' });
  }
  assert.deepEqual(normalizeDueRange('2026-01-02', '2026-01-01'), {
    error: 'Due from must not be after Due through',
  });
});
