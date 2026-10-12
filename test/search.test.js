import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchesSearch } from '../search.js';

test('search trims query edges, matches substrings, and folds only ASCII letters', () => {
  for (const [value, query, expected] of [
    ['Alpha BETA', '  pHa be\t', true],
    ['Alpha  Beta', 'alpha beta', false],
    ['Alpha  Beta', ' ALPHA  BETA ', true],
    ['Anything', ' \t\n ', true],
    ['Café', 'CAFÉ', false],
    ['Café', 'CAFé', true],
    ['[Special].*', '].*', true],
    ['Alpha', 'missing', false],
  ]) assert.equal(matchesSearch(value, query), expected, `${value}: ${query}`);
});
