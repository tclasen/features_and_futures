import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesSearch, normalizeSearch } from '../search.js';

test('search trims query boundaries, folds ASCII only, and matches punctuation literally', () => {
  assert.equal(normalizeSearch(' \nTwo  words\t '), 'Two  words');
  assert.ok(matchesSearch('Before TWO  WORDS after', ' two  words '));
  assert.ok(matchesSearch('Anything', ' \n '));
  assert.ok(matchesSearch('Budget 100%_done', '%_'));
  assert.ok(matchesSearch('A <tag> & "quote"', '<TAG> & "QUOTE"'));
  assert.ok(matchesSearch('Two words', 'two  words'));
  assert.ok(!matchesSearch('Budget 100 done', '%_'));
  assert.ok(!matchesSearch('Éclair', 'éclair'));
});

test('search collapses runs of ASCII spaces and tabs in both operands only for matching', () => {
  for (const storedGap of [' ', '  ', '\t', '\t \t  ']) {
    for (const queryGap of [' ', '   ', '\t', ' \t\t ']) {
      assert.ok(matchesSearch(`Before TWO${storedGap}WORDS after`, ` \n two${queryGap}words \t`));
    }
  }
  assert.ok(!matchesSearch('Twowords', 'two words'));
  for (const gap of ['\n', '\r', '\v', '\f', '\u00a0', '\u2003']) {
    assert.ok(!matchesSearch(`Two${gap}words`, 'two words'));
    assert.ok(!matchesSearch('Two words', `two${gap}words`));
    assert.ok(matchesSearch(`Two${gap}words`, `two${gap}words`));
  }
  assert.equal(normalizeSearch(' \nMiXeD \t  spaces\t '), 'MiXeD \t  spaces');
});
