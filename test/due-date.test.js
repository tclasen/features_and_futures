import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeDueDate } from '../due-date.js';

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
