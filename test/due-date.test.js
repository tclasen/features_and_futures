import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeDueDate, normalizeDueRange, matchesDueRange } from '../due-date.js';

test('due dates accept only real Gregorian days and normalize whitespace', () => {
  for (const date of ['0001-01-01', '0096-02-29', '0400-02-29', '2000-02-29', '2024-02-29', '2025-04-30', '9999-12-31']) {
    assert.equal(normalizeDueDate(` \t${date}\n`), date);
  }
  for (const date of ['', ' \t\n ']) assert.equal(normalizeDueDate(date), '');
  for (const date of [
    '0000-01-01', '10000-01-01', '0100-02-29', '1900-02-29', '2025-02-29',
    '2024-02-30', '2025-04-31', '2025-00-01', '2025-13-01', '2025-01-00',
    '2025-01-32', '2025-1-01', '25-01-01', '2025/01/01', '2025-01-01T00:00:00Z',
    'tomorrow', null, 20250101, true, {}, [],
  ]) assert.equal(normalizeDueDate(date), null, String(date));
});

test('due ranges normalize boundaries and distinguish invalid dates from reversed ranges', () => {
  assert.deepEqual(normalizeDueRange(' \t', '\n'), { from: '', through: '' });
  assert.deepEqual(normalizeDueRange(' 0001-01-01 ', ' 9999-12-31 '), {
    from: '0001-01-01', through: '9999-12-31',
  });
  assert.deepEqual(normalizeDueRange('2000-02-29', '2000-02-29'), {
    from: '2000-02-29', through: '2000-02-29',
  });
  for (const invalid of ['1900-02-29', '2024-04-31', '0000-01-01', '2024-1-01']) {
    for (const boundaries of [[invalid, ''], ['', invalid], ['9999-12-31', invalid]]) {
      assert.deepEqual(normalizeDueRange(...boundaries), { error: 'Due range must use valid YYYY-MM-DD dates' });
    }
  }
  assert.deepEqual(normalizeDueRange('2024-03-01', '2024-02-29'), {
    error: 'Due from must not be after Due through',
  });
});

test('due range membership is inclusive, supports one-sided bounds, and excludes undated tasks only when bounded', () => {
  const dates = ['', '0001-01-01', '2024-02-28', '2024-02-29', '2024-03-01', '9999-12-31'];
  for (const [from, through, expected] of [
    ['', '', dates],
    ['2024-02-29', '', dates.slice(3)],
    ['', '2024-02-29', dates.slice(1, 4)],
    ['2024-02-29', '2024-02-29', ['2024-02-29']],
    ['0001-01-01', '9999-12-31', dates.slice(1)],
  ]) {
    assert.deepEqual(dates.filter((date) => matchesDueRange(date, { from, through })), expected);
  }
});
