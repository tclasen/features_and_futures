import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesSearch, normalizeSearch } from '../search.js';

test('search trims query boundaries, folds ASCII only, and matches literal substrings', () => {
  assert.equal(normalizeSearch(' \nTwo  words\t '), 'Two  words');
  assert.ok(matchesSearch('Before TWO  WORDS after', ' two  words '));
  assert.ok(matchesSearch('Anything', ' \n '));
  assert.ok(matchesSearch('Budget 100%_done', '%_'));
  assert.ok(matchesSearch('A <tag> & "quote"', '<TAG> & "QUOTE"'));
  assert.ok(!matchesSearch('Two words', 'two  words'));
  assert.ok(!matchesSearch('Budget 100 done', '%_'));
  assert.ok(!matchesSearch('Éclair', 'éclair'));
});
