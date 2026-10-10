import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchesSearch, normalizeSearchQuery } from '../search.js';

test('search trims query edges, folds only ASCII case, and preserves internal whitespace', () => {
  assert.equal(normalizeSearchQuery(' \tMix  Ed\n'), 'Mix  Ed');
  assert.equal(normalizeSearchQuery(null), '');
  for (const [text, query, expected] of [
    ['Before ALPHA after', ' \talpha\n', true],
    ['Alpha  Beta', 'a  b', true],
    ['Alpha  Beta', 'alpha beta', false],
    ['Alpha\tBeta', 'alpha beta', false],
    ['Anything', ' \n\t ', true],
    ['ÉCLAIR', 'éclair', false],
    ['ÉCLAIR', 'Éclair', true],
    ['100%_literal', '%_', true],
    ['<script>&"', '<SCRIPT>&"', true],
  ]) assert.equal(matchesSearch(text, query), expected, `${text} / ${query}`);
});
