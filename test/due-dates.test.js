import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDueDate } from '../due-dates.js';

test('optional dates use strict Gregorian calendar validation without timezones', () => {
  for (const date of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '1900-02-28', '2025-04-30']) {
    assert.equal(normalizeDueDate(` \t${date}\n`), date);
  }
  for (const date of ['', ' \t\n ']) assert.equal(normalizeDueDate(date), '');
  for (const date of [null, 123, {}, '0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29',
    '2025-02-29', '2024-02-30', '2025-04-31', '2025-00-01', '2025-13-01', '2025-01-00',
    '2025-1-01', '2025-01-1', '25-01-01', '2025-01-01T00:00:00Z', '2025/01/01']) {
    assert.equal(normalizeDueDate(date), null, String(date));
  }
});
