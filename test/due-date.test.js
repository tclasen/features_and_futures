import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeDueDate } from '../due-date.js';

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
