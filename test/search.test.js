import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSearch, matchesSearch } from '../search.js';

test('search trims query edges and ignores runs of ASCII spaces and tabs when matching', () => {
  assert.equal(normalizeSearch(' \t Alpha  Beta \n'), 'Alpha  Beta');
  assert.equal(normalizeSearch(null), '');
  assert.equal(matchesSearch('Alpha  Beta', normalizeSearch('  aLPHa  bE  ')), true);
  for (const separator of [' ', '  ', '\t', '\t\t', ' \t  \t ']) {
    assert.equal(matchesSearch(`Alpha${separator}Beta`, 'aLPHa bE'), true);
    assert.equal(matchesSearch('Alpha Beta', normalizeSearch(` \t aLPHa${separator}bE \n`)), true);
  }
  assert.equal(matchesSearch('Alpha\t  Beta', 'ha \t b'), true);
  assert.equal(matchesSearch('AlphaBeta', 'Alpha Beta'), false);
  assert.equal(matchesSearch('Alpha Beta', 'AlphaBeta'), false);
  assert.equal(normalizeSearch(' \t Alpha \t  Beta \n'), 'Alpha \t  Beta');
});

test('search leaves other whitespace and non-ASCII case significant and matches punctuation literally', () => {
  for (const separator of ['\n', '\r', '\v', '\f', '\u00a0', '\u2003']) {
    assert.equal(matchesSearch(`Alpha${separator}Beta`, 'Alpha Beta'), false);
    assert.equal(matchesSearch('Alpha Beta', `Alpha${separator}Beta`), false);
    assert.equal(matchesSearch(`Alpha${separator}Beta`, `aLPHa${separator}bE`), true);
  }
  assert.equal(matchesSearch('ÄLPHA', 'älpha'), false);
  assert.equal(matchesSearch('ÄLPHA', 'Älpha'), true);
  assert.equal(matchesSearch('100%_done [a]', '%_'), true);
  assert.equal(matchesSearch('anything', normalizeSearch(' \t ')), true);
  assert.equal(matchesSearch('anything', 'missing'), false);
});
