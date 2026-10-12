import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSearch, matchesSearch } from '../src/search.js';

test('search trims only boundaries and matches literal substrings with ASCII case folding', () => {
  assert.equal(normalizeSearch(' \tAlpha  beta\n'), 'Alpha  beta');
  assert.equal(normalizeSearch(null), '');
  assert.equal(matchesSearch('One ALPHA  beta two', normalizeSearch(' alpha  BETA ')), true);
  assert.equal(matchesSearch('Alpha  beta', 'alpha beta'), false);
  assert.equal(matchesSearch('Éclair', 'éclair'), false);
  assert.equal(matchesSearch('100%_done [x]', '%_'), true);
  assert.equal(matchesSearch('anything', '%'), false);
  assert.equal(matchesSearch('anything', ''), true);
});
