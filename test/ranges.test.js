import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueRangeError, matchesDueRange } from '../dates.js';

test('due ranges validate Gregorian boundaries and compare inclusive calendar days', () => {
  for (const date of ['0001-01-01', '2000-02-29', '9999-12-31']) {
    assert.equal(dueRangeError(date, date), '');
    assert.equal(matchesDueRange(date, { from: date, through: date }), true);
  }
  for (const date of ['0000-01-01', '1900-02-29', '2025-04-31', '2025-1-01', '10000-01-01']) {
    assert.equal(dueRangeError(date, ''), 'Due range must use valid YYYY-MM-DD dates');
    assert.equal(dueRangeError('', date), 'Due range must use valid YYYY-MM-DD dates');
  }
  assert.equal(dueRangeError('2025-02-01', '2025-01-31'), 'Due from must not be after Due through');
  assert.equal(matchesDueRange(null, { from: '', through: '' }), true);
  assert.equal(matchesDueRange(null, { from: '0001-01-01', through: '' }), false);
  assert.equal(matchesDueRange(null, { from: '', through: '9999-12-31' }), false);
  assert.equal(matchesDueRange('2025-01-01', { from: '2025-01-02', through: '' }), false);
  assert.equal(matchesDueRange('2025-01-03', { from: '', through: '2025-01-02' }), false);
});
