import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchesSearch } from '../search.js';

test('search trims query edges, matches substrings, and folds only ASCII letters', () => {
  for (const [value, query, expected] of [
    ['Alpha BETA', '  pHa be\t', true],
    ['Alpha  Beta', 'alpha beta', true],
    ['Alpha  Beta', ' ALPHA  BETA ', true],
    ['Anything', ' \t\n ', true],
    ['Café', 'CAFÉ', false],
    ['Café', 'CAFé', true],
    ['[Special].*', '].*', true],
    ['Alpha', 'missing', false],
  ]) assert.equal(matchesSearch(value, query), expected, `${value}: ${query}`);
});

test('search collapses ASCII space and tab runs on both sides without folding other whitespace', () => {
  for (const [value, query, expected] of [
    ['Alpha \t\t  BETA', 'alpha beta', true],
    ['Alpha Beta', ' \tALPHA\t \t BETA\n ', true],
    ['Alpha\tBeta', 'ha  \t be', true],
    ['Alpha\nBeta', 'alpha beta', false],
    ['Alpha\rBeta', 'alpha beta', false],
    ['Alpha\u00a0Beta', 'alpha beta', false],
    ['Alpha\u2003Beta', 'alpha beta', false],
    ['Alpha\nBeta', 'ALPHA\nBETA', true],
    ['Alpha \t Beta', 'alphabeta', false],
  ]) assert.equal(matchesSearch(value, query), expected, `${value}: ${query}`);
});
