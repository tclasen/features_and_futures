import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSearch, matchesSearch } from '../src/search.js';

test('query preparation trims boundaries without rewriting internal whitespace', () => {
  assert.equal(normalizeSearch(' \tAlpha  beta\n'), 'Alpha  beta');
  assert.equal(normalizeSearch(' \tAlpha \t\t beta\n'), 'Alpha \t\t beta');
  assert.equal(normalizeSearch(null), '');
});

test('substring matching collapses ASCII spaces and tabs in both operands', () => {
  assert.equal(matchesSearch('One ALPHA  beta two', normalizeSearch(' alpha  BETA ')), true);
  assert.equal(matchesSearch('Alpha  beta', 'alpha beta'), true);
  assert.equal(matchesSearch('Alpha\t\t beta', 'ALPHA \tBETA'), true);
  assert.equal(matchesSearch('Alpha beta', 'alpha\t  \tbeta'), true);
  assert.equal(matchesSearch('Alpha\t beta  gamma', 'beta\tGAM'), true);
  assert.equal(matchesSearch('Alphabeta', 'alpha beta'), false);
  assert.equal(matchesSearch('Alpha\nbeta', 'alpha beta'), false);
  assert.equal(matchesSearch('Alpha\rbeta', 'alpha beta'), false);
  assert.equal(matchesSearch('Alpha\u00a0beta', 'alpha beta'), false);
  assert.equal(matchesSearch('Éclair', 'éclair'), false);
  assert.equal(matchesSearch('100%_done [x]', '%_'), true);
  assert.equal(matchesSearch('anything', '%'), false);
  assert.equal(matchesSearch('anything', ''), true);
});
