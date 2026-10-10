import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDueRange, matchesDueRange } from '../dates.js';

test('due ranges validate Gregorian boundaries and compare inclusively', () => {
  const range = normalizeDueRange(' 0001-01-01 ', ' 9999-12-31 ');
  assert.deepEqual(range, { from: '0001-01-01', through: '9999-12-31' });
  assert.equal(matchesDueRange('0001-01-01', range), true);
  assert.equal(matchesDueRange('9999-12-31', range), true);
  assert.equal(matchesDueRange('', range), false);
  assert.equal(matchesDueRange('', normalizeDueRange(' ', '')), true);
  assert.equal(matchesDueRange('2000-02-29', normalizeDueRange('', '2000-02-29')), true);
  assert.equal(matchesDueRange('2000-03-01', normalizeDueRange('', '2000-02-29')), false);
  assert.equal(matchesDueRange('2000-02-28', normalizeDueRange('2000-02-29', '')), false);
  for (const date of ['0000-01-01', '10000-01-01', '1900-02-29', '2025-04-31', '2025-1-01', '<script>']) {
    for (const pair of [[date, ''], ['', date]]) {
      assert.throws(() => normalizeDueRange(...pair), /Due range must use valid YYYY-MM-DD dates/);
    }
  }
  assert.throws(() => normalizeDueRange('2025-02-02', '2025-02-01'), /Due from must not be after Due through/);
  assert.deepEqual(normalizeDueRange('2000-02-29', '2000-02-29'), { from: '2000-02-29', through: '2000-02-29' });
});
