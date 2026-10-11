import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidDueDate } from '../dates.js';

test('due dates use strict Gregorian calendar days and four-digit positive years', () => {
  for (const value of ['0001-01-01', '0099-12-31', '9999-12-31', '2000-02-29', '2024-02-29', '2400-02-29', '2025-04-30']) {
    assert.equal(isValidDueDate(value), true, value);
  }
  for (const value of ['', '0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2025-02-29', '2024-02-30', '2025-04-31', '2025-00-01', '2025-13-01', '2025-01-00', '2025-01-32', '2025-1-01', '2025-01-1', ' 2025-01-01', '2025-01-01\n', '2025-01-01T00:00:00Z']) {
    assert.equal(isValidDueDate(value), false, JSON.stringify(value));
  }
});
