import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDueDate } from '../tasks.js';

test('due dates use Gregorian calendar rules across the full supported year range', () => {
  for (const date of ['0001-01-01', '0004-02-29', '0400-02-29', '2000-02-29', '2024-02-29', '2025-04-30', '9999-12-31']) {
    assert.equal(normalizeDueDate(` \t${date}\n `), date);
  }
  assert.equal(normalizeDueDate(''), '');
  assert.equal(normalizeDueDate(' \t\n '), '');
  for (const value of ['0000-01-01', '10000-01-01', '0100-02-29', '1900-02-29', '2023-02-29', '2024-02-30', '2024-04-31', '2024-00-01', '2024-13-01', '2024-01-00', '2024-01-32', '2024-1-01', '24-01-01', '2024/01/01', '2024-01-01Z', 'abcd-ef-gh', null, undefined, 20240101, {}, ['2024-01-01']]) {
    assert.throws(() => normalizeDueDate(value), {
      message: 'Due date must be a valid YYYY-MM-DD date',
      status: 400,
    });
  }
});
