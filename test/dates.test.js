import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidDueDate, dueRangeError, matchesDueRange } from '../dates.js';

test('due ranges validate and match inclusive calendar-day boundaries', () => {
  assert.equal(dueRangeError('', ''), '');
  assert.equal(dueRangeError('0001-01-01', '9999-12-31'), '');
  assert.match(dueRangeError('1900-02-29', ''), /valid YYYY-MM-DD/);
  assert.match(dueRangeError('', '2025-04-31'), /valid YYYY-MM-DD/);
  assert.match(dueRangeError('2025-03-02', '2025-03-01'), /must not be after/);
  const range = { from: '2025-03-01', through: '2025-03-03' };
  for (const date of ['2025-03-01', '2025-03-02', '2025-03-03']) {
    assert.equal(matchesDueRange(date, range), true);
  }
  for (const date of ['', '2025-02-28', '2025-03-04']) {
    assert.equal(matchesDueRange(date, range), false);
  }
  assert.equal(matchesDueRange('', { from: '', through: '' }), true);
  assert.equal(matchesDueRange('', { from: '', through: '9999-12-31' }), false);
  assert.equal(matchesDueRange('0001-01-01', { from: '', through: '0001-01-01' }), true);
  assert.equal(matchesDueRange('9999-12-31', { from: '9999-12-31', through: '' }), true);
});

test('due dates require exact Gregorian calendar days in years 0001–9999', () => {
  for (const value of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '1900-02-28', '2025-04-30']) {
    assert.equal(isValidDueDate(value), true, value);
  }
  for (const value of ['', '0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2025-02-29', '2024-02-30', '2025-04-31', '2025-00-01', '2025-13-01', '2025-01-00', '2025-01-32', '2025-1-01', '25-01-01', '2025-01-1', '2025-01-01T00:00:00Z', '2025-01-01\n']) {
    assert.equal(isValidDueDate(value), false, value);
  }
});
