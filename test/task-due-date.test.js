import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDueDate } from '../public/task-due-date.js';

test('due dates trim, clear, and validate Gregorian calendar boundaries without timezones', () => {
  for (const date of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '0100-03-01', '2026-04-30']) {
    assert.equal(normalizeDueDate(` \t${date}\n `), date);
  }
  for (const blank of ['', ' \t\n ']) assert.equal(normalizeDueDate(blank), '');
  for (const invalid of [
    '0000-01-01', '10000-01-01', '1900-02-29', '0100-02-29', '2025-02-29',
    '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '2026-01-32',
    '2026-1-01', '26-01-01', '2026-01-1', '2026/01/01', '2026-01-01T00:00:00Z',
    'tomorrow', null, 20260101, {}, [], true,
  ]) {
    assert.throws(() => normalizeDueDate(invalid), {
      message: 'Due date must be a valid YYYY-MM-DD date', status: 400,
    });
  }
});
