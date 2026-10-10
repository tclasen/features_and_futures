import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDueDate } from '../due-date.js';

test('due dates are strict Gregorian calendar days, or empty to clear', () => {
  for (const date of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '1900-02-28']) {
    assert.equal(normalizeDueDate(` \t${date}\n`), date);
  }
  for (const value of ['', ' \t\n ']) assert.equal(normalizeDueDate(value), '');
  for (const value of [null, 123, {}, '0000-01-01', '10000-01-01', '1900-02-29',
    '2100-02-29', '2023-02-29', '2024-04-31', '2024-00-01', '2024-13-01',
    '2024-01-00', '2024-01-32', '2024-1-01', '24-01-01', '2024-01-01T00:00:00Z']) {
    assert.equal(normalizeDueDate(value), null, String(value));
  }
});
