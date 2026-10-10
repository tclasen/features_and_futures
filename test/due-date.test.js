import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDueDate } from '../due-date.js';

test('canonical Gregorian dates, blank clearing, and year boundaries', () => {
  for (const date of ['0001-01-01', '0099-12-31', '9999-12-31', '2000-02-29', '2024-02-29', '2400-02-29']) {
    assert.equal(normalizeDueDate(` \t${date}\n `), date);
  }
  for (const blank of ['', ' \t\n ']) assert.equal(normalizeDueDate(blank), '');
  for (const invalid of [null, 42, {}, '0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2023-02-29', '2024-04-31', '2024-00-01', '2024-13-01', '2024-01-00', '2024-01-32', '2024-1-01', '2024-01-1', '2024-01-01T00:00:00Z', 'not a date']) {
    assert.equal(normalizeDueDate(invalid), null, String(invalid));
  }
});
