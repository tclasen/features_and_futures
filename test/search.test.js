import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesSearch, normalizeSearchQuery } from '../search.js';
import { openProjects } from '../projects.js';

test('search trims only query edges, folds ASCII case and treats substrings literally', () => {
  assert.equal(normalizeSearchQuery(' \tTwo  words\n '), 'Two  words');
  for (const [value, query, expected] of [
    ['Alpha BETA', ' beta ', true], ['Two  words', 'two words', false],
    ['Two  words', ' TWO  WORDS ', true], ['Anything', ' \t ', true],
    ['100%_done', '%_', true], ['100 percent', '%', false],
    ['Éclair', 'éclair', false], ['ÉCLAIR', 'Éclair', true],
    ['a.b [x]', '[x]', true], ['a.b', 'a*b', false],
  ]) assert.equal(matchesSearch(value, query), expected, `${value}: ${query}`);
});

test('search intersects ownership, archive, completion, priority and dates without changing summaries or positions', () => {
  const projects = openProjects(':memory:');
  try {
    for (const name of ['Alpha one', 'Other', 'ALPHA  two']) projects.create(name);
    projects.setArchived(3, true);
    assert.deepEqual(projects.list('Active', ' ALPHA ').map((p) => p.id), [1]);
    assert.deepEqual(projects.list('Archived', 'alpha').map((p) => p.id), [3]);
    for (const title of ['Match first', 'MATCH  second', 'Other', 'Match undated']) projects.createTask(1, title);
    projects.createTask(2, 'Match private');
    for (const id of [1, 2]) {
      projects.setTaskPriority(1, id, 'High');
      projects.setTaskDueDate(1, id, '2024-02-29');
    }
    projects.setTaskCompleted(1, 2, true);
    const options = { search: ' match ', dueFrom: '2024-02-29', dueThrough: '2024-02-29' };
    const summary = projects.list();
    assert.deepEqual(projects.listTasks(1, 'Open', 'High', options).map((t) => t.id), [1]);
    assert.deepEqual(projects.listTasks(1, 'Completed', 'High', options).map((t) => t.id), [2]);
    assert.deepEqual(projects.listTasks(1, 'All', 'All', { search: 'match ' }).map((t) => t.id), [1, 2, 4]);
    assert.deepEqual(projects.listTasks(1, 'All', 'All', { search: 'match second' }), []);
    assert.deepEqual(projects.list(), summary);
    projects.moveTask(1, 1, 2);
    projects.moveTask(2, 1, 1);
    assert.deepEqual(projects.listTasks(1, 'All', 'All', { search: 'match' }).map((t) => t.id), [1, 2, 4]);
  } finally {
    projects.close();
  }
});
