import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchesSearch, normalizeSearchQuery } from '../search.js';

test('search trims query edges and normalizes only ASCII case, spaces and tabs for matching', () => {
  assert.equal(normalizeSearchQuery(' \tMix  Ed\n'), 'Mix  Ed');
  assert.equal(normalizeSearchQuery(null), '');
  for (const [text, query, expected] of [
    ['Before ALPHA after', ' \talpha\n', true],
    ['Alpha  Beta', 'a  b', true],
    ['Alpha  Beta', 'alpha beta', true],
    ['Alpha\tBeta', 'alpha beta', true],
    ['Alpha \t \tBeta', ' \tALPHA\t  beta\n', true],
    ['Alpha Beta', 'alpha \t\t beta', true],
    ['Alpha\nBeta', 'alpha beta', false],
    ['Alpha\rBeta', 'alpha beta', false],
    ['Alpha\u00a0Beta', 'alpha beta', false],
    ['AlphaBeta', 'alpha beta', false],
    ['Anything', ' \n\t ', true],
    ['ÉCLAIR', 'éclair', false],
    ['ÉCLAIR', 'Éclair', true],
    ['100%_literal', '%_', true],
    ['<script>&"', '<SCRIPT>&"', true],
  ]) assert.equal(matchesSearch(text, query), expected, `${text} / ${query}`);
});
