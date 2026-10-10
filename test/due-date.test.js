import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDueDate } from '../due-date.js';

test('due dates accept only real Gregorian days in the four-digit year range', () => {
  for (const date of [
    '0001-01-01', '0099-12-31', '9999-12-31', '2000-02-29', '2024-02-29',
    '2400-02-29', '1900-02-28', '2026-04-30', '2026-01-31',
  ]) {
    assert.equal(parseDueDate(date), date);
    assert.equal(parseDueDate(` \t${date}\n `), date);
  }
  for (const date of [
    '0000-01-01', '10000-01-01', '2026-00-01', '2026-13-01', '2026-01-00',
    '2026-01-32', '2026-04-31', '2026-02-29', '1900-02-29', '2100-02-29',
    '2024-02-30', '2026-1-01', '2026-01-1', '26-01-01', '-001-01-01',
    '2026/01/01', '2026-01-01T00:00:00Z', '2026- 01-01', 'not a date',
  ]) {
    assert.equal(parseDueDate(date), null, date);
  }
  assert.equal(parseDueDate(''), '');
  assert.equal(parseDueDate(' \t\n '), '');
});
