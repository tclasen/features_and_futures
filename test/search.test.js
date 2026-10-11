import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSearch, matchesSearch } from '../search.js';

test('search trims only query edges, matches literal substrings and folds only ASCII case', () => {
  assert.equal(normalizeSearch(' \t Alpha  Beta \n'), 'Alpha  Beta');
  assert.equal(normalizeSearch(null), '');
  assert.equal(matchesSearch('Alpha  Beta', normalizeSearch('  aLPHa  bE  ')), true);
  assert.equal(matchesSearch('Alpha  Beta', 'Alpha Beta'), false);
  assert.equal(matchesSearch('Alpha Beta', 'Alpha  Beta'), false);
  assert.equal(matchesSearch('ÄLPHA', 'älpha'), false);
  assert.equal(matchesSearch('ÄLPHA', 'Älpha'), true);
  assert.equal(matchesSearch('100%_done [a]', '%_'), true);
  assert.equal(matchesSearch('anything', normalizeSearch(' \t ')), true);
  assert.equal(matchesSearch('anything', 'missing'), false);
});
