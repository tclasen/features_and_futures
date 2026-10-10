import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDueDate } from '../due-date.js';

test('due dates accept only real Gregorian calendar days and trim or clear text', () => {
  for (const date of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '1900-02-28', '2025-04-30']) {
    assert.equal(normalizeDueDate(` \t${date}\n `), date);
  }
  for (const value of ['', ' \t\n ']) assert.equal(normalizeDueDate(value), '');
  for (const value of [null, 20250101, {}, '0000-01-01', '10000-01-01', '1900-02-29',
    '2100-02-29', '2025-02-29', '2024-02-30', '2025-04-31', '2025-00-01', '2025-13-01',
    '2025-01-00', '2025-01-32', '2025-1-01', '25-01-01', '2025/01/01', '2025-01-01T00:00:00Z']) {
    assert.equal(normalizeDueDate(value), null, JSON.stringify(value));
  }
});
