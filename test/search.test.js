import test from 'node:test';
import assert from 'node:assert/strict';
import { filterProjects, matchesSearch, normalizeSearchQuery } from '../public/search.js';
import { filterTasks } from '../public/task-filters.js';

test('search trims edges, folds only ASCII letters, and preserves internal whitespace', () => {
  for (const [value, input, expected] of [
    ['Build Workboard', ' \tWORK\n ', true],
    ['Build Workboard', 'board', true],
    ['Build Workboard', 'build  work', false],
    ['Build  Workboard', 'BUILD  WORK', true],
    ['Build\tWorkboard', 'build work', false],
    ['Ä Team', 'ä team', false],
    ['Ä Team', 'Ä TEAM', true],
    ['Anything', ' \t\n ', true],
    ['<script> & [team]', '[TEAM]', true],
    ['Anything', 'missing', false],
  ]) {
    assert.equal(matchesSearch(value, normalizeSearchQuery(input)), expected);
  }
});

test('project search intersects archive state and retains order, summaries, and data', () => {
  const projects = [
    { id: 1, name: 'Team Alpha', archived: false, completed_count: 2, total_count: 3 },
    { id: 2, name: 'Other', archived: false, completed_count: 0, total_count: 0 },
    { id: 3, name: 'TEAM Archive', archived: true, completed_count: 1, total_count: 1 },
    { id: 4, name: 'Team Beta', archived: false, completed_count: 0, total_count: 2 },
  ];
  const original = structuredClone(projects);
  const query = normalizeSearchQuery(' TEAM ');
  const ids = (archive, search = query) => filterProjects(projects, archive, search).map((project) => project.id);
  assert.deepEqual(ids('active'), [1, 4]);
  assert.deepEqual(ids('archived'), [3]);
  assert.deepEqual(ids('active', ''), [1, 2, 4]);
  assert.deepEqual(projects, original);
  projects[0].archived = true;
  assert.deepEqual(ids('active'), [4]);
  assert.deepEqual(ids('archived'), [1, 3]);
  projects[0].archived = false;
  projects[0].name = 'Renamed';
  assert.deepEqual(ids('active'), [4]);
});

test('task search intersects all filters and re-evaluates edits without changing saved data', () => {
  const tasks = [
    { id: 8, title: 'Ship ALPHA', completed: false, priority: 'High', due_date: '2026-01-01' },
    { id: 2, title: 'Ship beta', completed: false, priority: 'High', due_date: '2026-01-01' },
    { id: 5, title: 'Alpha done', completed: true, priority: 'High', due_date: '2026-01-01' },
    { id: 4, title: 'Alpha low', completed: false, priority: 'Low', due_date: '2026-01-01' },
    { id: 3, title: 'Alpha undated', completed: false, priority: 'High', due_date: '' },
    { id: 9, title: 'Alpha later', completed: false, priority: 'High', due_date: '2026-01-02' },
  ];
  const original = structuredClone(tasks);
  const query = normalizeSearchQuery(' ALPHA ');
  const range = { from: '2026-01-01', through: '2026-01-01' };
  for (const completion of ['all', 'open', 'completed']) {
    for (const priority of ['all', 'Low', 'Normal', 'High']) {
      for (const dueRange of [range, { from: '', through: '' }]) {
        const expected = filterTasks(tasks, completion, priority, dueRange).filter((task) => task.id !== 2);
        assert.deepEqual(filterTasks(tasks, completion, priority, dueRange, query), expected);
      }
    }
  }
  assert.deepEqual(filterTasks(tasks, 'all', 'all', undefined, query).map((task) => task.id), [8, 5, 4, 3, 9]);
  assert.deepEqual(tasks, original);
  const visible = () => filterTasks(tasks, 'open', 'High', range, query).map((task) => task.id);
  assert.deepEqual(visible(), [8]);
  tasks[0].title = 'No longer matches';
  assert.deepEqual(visible(), []);
  tasks[1].title = 'New Alpha match';
  assert.deepEqual(visible(), [2]);
  tasks[1].completed = true;
  assert.deepEqual(visible(), []);
  tasks[1].completed = false;
  tasks[1].priority = 'Low';
  assert.deepEqual(visible(), []);
  tasks[1].priority = 'High';
  tasks[1].due_date = '';
  assert.deepEqual(visible(), []);
  tasks[1].due_date = range.from;
  assert.deepEqual(visible(), [2]);
  tasks.splice(1, 1); // Moving removes the task from the source's search results.
  assert.deepEqual(visible(), []);
  tasks.push({ id: 10, title: 'Created alpha', completed: false, priority: 'High', due_date: range.from });
  assert.deepEqual(visible(), [10]);
  assert.deepEqual(range, { from: '2026-01-01', through: '2026-01-01' });
  assert.equal(query, 'alpha');
});
