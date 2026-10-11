import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDueDate } from '../due-date.js';

test('due dates accept only real Gregorian days with four-digit years', () => {
  for (const date of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '1900-02-28', '2026-04-30']) {
    assert.equal(normalizeDueDate(` \t${date}\n `), date);
  }
  for (const date of [
    '0000-01-01', '10000-01-01', '2026-2-01', '26-02-01', '2026-02-1',
    '1900-02-29', '2100-02-29', '2026-02-29', '2024-02-30',
    '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '2026-01-32',
    '2026-01-01T00:00:00Z', '2026/01/01', 'today', null, 20260101,
  ]) {
    assert.equal(normalizeDueDate(date), null, String(date));
  }
  assert.equal(normalizeDueDate(''), '');
  assert.equal(normalizeDueDate(' \t\n '), '');
});
