import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesSearch } from '../search.js';

test('search trims query edges, folds ASCII only, and preserves internal whitespace', () => {
  assert.equal(matchesSearch('Alpha  BETA', ' \tPHA  be\n '), true);
  assert.equal(matchesSearch('Alpha  BETA', 'alpha beta'), false);
  assert.equal(matchesSearch('Anything', ' \t\n '), true);
  assert.equal(matchesSearch('École', 'école'), false);
  assert.equal(matchesSearch('ÉCOLE', 'École'), true);
  assert.equal(matchesSearch('Literal [a].*', '[a].*'), true);
  assert.equal(matchesSearch('Literal abc', '[a].*'), false);
});
