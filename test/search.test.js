import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesSearch, matchesProjectFilters } from '../public/search.js';
import { matchesTaskFilters } from '../public/task-filters.js';

test('search trims query edges, collapses spaces and tabs, and folds only ASCII case', () => {
  const cases = [
    ['Alpha BETA', '  bEt  ', true],
    ['Alpha BETA', '\t\n ', true],
    ['Alpha  Beta', 'alpha beta', true],
    ['Alpha  Beta', 'ALPHA  BETA', true],
    ['Alpha\tBeta', 'alpha beta', true],
    ['Alpha\tBeta', 'ALPHA\tBETA', true],
    ['Alpha \t \tBeta', ' \tALPHA\t  BETA\n', true],
    ['Alpha Beta', 'alpha \t  beta', true],
    ['Alpha\nBeta', 'alpha beta', false],
    ['Alpha\rBeta', 'alpha beta', false],
    ['Alpha\u00a0Beta', 'alpha beta', false],
    ['Alpha\vBeta', 'alpha beta', false],
    ['Café', 'CAFé', true],
    ['Café', 'CAFÉ', false],
    ['A project [draft].*', '[draft].*', true],
    ['A project [draft].*', '^A', false],
    ['Alpha BETA', 'missing', false],
  ];
  for (const [value, query, expected] of cases) {
    assert.equal(matchesSearch(value, query), expected, `${JSON.stringify(value)} / ${JSON.stringify(query)}`);
  }
});

test('project search intersects archive state in creation order without changing summaries', () => {
  const projects = [
    { id: 1, name: 'Alpha \t  project', archived: false, completedCount: 1, totalCount: 2 },
    { id: 2, name: 'Other', archived: false, completedCount: 0, totalCount: 0 },
    { id: 3, name: 'ALPHA\tproject archive', archived: true, completedCount: 2, totalCount: 3 },
    { id: 4, name: 'New alpha project', archived: false, completedCount: 0, totalCount: 1 },
  ];
  const original = structuredClone(projects);
  const visible = (filter, query) => projects.filter((project) => matchesProjectFilters(project, filter, query))
    .map((project) => project.id);
  assert.deepEqual(visible('Active', '  AlPhA  '), [1, 4]);
  assert.deepEqual(visible('Archived', '  AlPhA  '), [3]);
  assert.deepEqual(visible('Active', '  AlPhA\t project  '), [1, 4]);
  assert.deepEqual(visible('Archived', 'alpha project'), [3]);
  assert.deepEqual(visible('Active', ''), [1, 2, 4]);
  assert.deepEqual(visible('Archived', ''), [3]);
  assert.deepEqual(projects, original);
  projects[0].archived = true;
  assert.deepEqual(visible('Active', 'alpha'), [4]);
  assert.deepEqual(visible('Archived', 'alpha'), [1, 3]);
  projects[0].archived = false;
  projects[0].name = 'Renamed';
  assert.deepEqual(visible('Active', 'alpha'), [4]);
});

test('task search intersects completion, priority, and due range without changing task data or order', () => {
  const tasks = [];
  for (const title of ['Alpha task', 'Other task', 'ALPHA  task', 'Alpha \t\ttask']) {
    for (const completed of [false, true]) {
      for (const priority of ['Low', 'Normal', 'High']) {
        for (const dueDate of ['', '2026-10-09', '2026-10-10', '2026-10-12', '2026-10-13']) {
          tasks.push({ id: tasks.length + 1, title, completed, priority, dueDate });
        }
      }
    }
  }
  const original = structuredClone(tasks);
  for (const query of ['', ' alpha ', 'alpha task', 'alpha  task', 'alpha \t task', 'missing']) {
    const matchingTitles = {
      '': ['Alpha task', 'Other task', 'ALPHA  task', 'Alpha \t\ttask'],
      ' alpha ': ['Alpha task', 'ALPHA  task', 'Alpha \t\ttask'],
      'alpha task': ['Alpha task', 'ALPHA  task', 'Alpha \t\ttask'],
      'alpha  task': ['Alpha task', 'ALPHA  task', 'Alpha \t\ttask'],
      'alpha \t task': ['Alpha task', 'ALPHA  task', 'Alpha \t\ttask'],
      missing: [],
    }[query];
    for (const completion of ['All', 'Open', 'Completed']) {
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        for (const range of [
          { from: '', through: '' },
          { from: '2026-10-10', through: '2026-10-12' },
          { from: '', through: '2026-10-10' },
          { from: '2026-10-12', through: '' },
        ]) {
          const expected = tasks.filter((task) => matchingTitles.includes(task.title)
            && (completion === 'All' || task.completed === (completion === 'Completed'))
            && (priority === 'All' || task.priority === priority)
            && ((!range.from && !range.through) || (task.dueDate
              && (!range.from || task.dueDate >= range.from)
              && (!range.through || task.dueDate <= range.through))));
          const visible = tasks.filter((task) => matchesTaskFilters(task, completion, priority, range, query));
          assert.deepEqual(visible.map((task) => task.id), expected.map((task) => task.id));
        }
      }
    }
  }
  assert.deepEqual(tasks, original);
});

test('edits re-evaluate task membership with the same search and filters', () => {
  const range = { from: '2026-10-10', through: '2026-10-12' };
  const task = { title: 'Alpha task', completed: false, priority: 'High', dueDate: '2026-10-11' };
  const matches = () => matchesTaskFilters(task, 'Open', 'High', range, 'alpha');
  assert.equal(matches(), true);
  task.title = 'Other task';
  assert.equal(matches(), false);
  task.title = 'Renamed ALPHA';
  assert.equal(matches(), true);
  task.completed = true;
  assert.equal(matches(), false);
  task.completed = false;
  task.priority = 'Normal';
  assert.equal(matches(), false);
  task.priority = 'High';
  task.dueDate = '';
  assert.equal(matches(), false);
  task.dueDate = '2026-10-12';
  assert.equal(matches(), true);
  assert.deepEqual(range, { from: '2026-10-10', through: '2026-10-12' });
});
