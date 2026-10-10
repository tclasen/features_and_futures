import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSearchQuery, matchesSearch, matchesProjectFilters } from '../public/search.js';
import { matchesTaskFilters, normalizeDueRange } from '../public/task-filters.js';

test('search trims only query edges, matches substrings, and folds only ASCII case', () => {
  assert.equal(normalizeSearchQuery(' \t Alpha  BETA \n'), 'Alpha  BETA');
  assert.equal(matchesSearch('The ALPHA  beta project', 'alpha  BETA'), true);
  assert.equal(matchesSearch('Alpha beta', 'alpha  beta'), false);
  assert.equal(matchesSearch('café', 'CAFÉ'), false);
  assert.equal(matchesSearch('café', 'CAFé'), true);
  assert.equal(matchesSearch('anything', normalizeSearchQuery('  ')), true);
});

test('project search intersects archive state without changing order or summaries', () => {
  const projects = [
    { id: 1, name: 'Alpha', archived: false, completed: 1, total: 3 },
    { id: 2, name: 'ALPHABET', archived: true, completed: 2, total: 2 },
    { id: 3, name: 'Other', archived: false, completed: 0, total: 0 },
    { id: 4, name: 'alpha again', archived: false, completed: 0, total: 1 },
  ];
  const original = structuredClone(projects);
  const visible = (filter, query) => projects.filter((p) => matchesProjectFilters(p, filter, query)).map((p) => p.id);
  assert.deepEqual(visible('Active', 'alpha'), [1, 4]);
  assert.deepEqual(visible('Archived', 'alpha'), [2]);
  assert.deepEqual(visible('Active', ''), [1, 3, 4]);
  assert.deepEqual(projects, original);
});

test('task search intersects all filters and re-evaluates current titles and fields', () => {
  const tasks = [
    { id: 1, title: 'Alpha plan', completed: false, priority: 'High', due_date: '2026-02-01' },
    { id: 2, title: 'ALPHA build', completed: true, priority: 'High', due_date: '2026-02-02' },
    { id: 3, title: 'Alpha review', completed: false, priority: 'Normal', due_date: '' },
    { id: 4, title: 'Other', completed: false, priority: 'High', due_date: '2026-02-01' },
  ];
  const original = structuredClone(tasks);
  for (const completion of ['All', 'Open', 'Completed']) {
    for (const priority of ['All', 'Low', 'Normal', 'High']) {
      for (const range of [normalizeDueRange('', ''), normalizeDueRange('2026-02-01', '2026-02-01')]) {
        const actual = tasks.filter((t) => matchesTaskFilters(t, completion, priority, range, 'alpha'));
        const expected = tasks.filter((t) => t.id !== 4
          && (completion === 'All' || t.completed === (completion === 'Completed'))
          && (priority === 'All' || priority === t.priority)
          && (!range.from || t.due_date === range.from));
        assert.deepEqual(actual, expected);
      }
    }
  }
  assert.deepEqual(tasks, original);
  const range = normalizeDueRange('2026-02-01', '2026-02-01');
  const visible = () => tasks.filter((t) => matchesTaskFilters(t, 'Open', 'High', range, 'alpha')).map((t) => t.id);
  assert.deepEqual(visible(), [1]);
  tasks[3].title = 'New Alpha';
  assert.deepEqual(visible(), [1, 4]);
  tasks[0].completed = true;
  assert.deepEqual(visible(), [4]);
  tasks[3].priority = 'Low';
  assert.deepEqual(visible(), []);
  tasks[3].priority = 'High';
  tasks[3].due_date = '';
  assert.deepEqual(visible(), []);
  assert.deepEqual(tasks.filter((t) => matchesTaskFilters(t, 'All', 'All', normalizeDueRange('', ''), '')).map((t) => t.id), [1, 2, 3, 4]);
});
