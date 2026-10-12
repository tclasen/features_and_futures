import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDueDate } from '../src/due-date.js';

test('due dates use strict Gregorian calendar days with four-digit nonzero years', () => {
  for (const date of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '2400-02-29', '1900-02-28', '2026-04-30']) {
    assert.equal(normalizeDueDate(` \t${date}\n`), date);
  }
  for (const date of ['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2025-02-29', '0001-02-29',
    '2026-04-31', '2026-01-32', '2026-00-10', '2026-13-10', '2026-01-00', '2026-1-01', '26-01-01',
    '2026-01-1', '2026-01-01T00:00:00Z', '2026-01-01 extra', '<script>', 'not a date']) {
    assert.equal(normalizeDueDate(date), null, date);
  }
  assert.equal(normalizeDueDate(''), '');
  assert.equal(normalizeDueDate(' \t\n '), '');
});
