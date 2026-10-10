import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesTaskFilters } from '../public/task-filters.js';

const tasks = [
  { id: 1, title: 'Open high', completed: false, priority: 'High' },
  { id: 2, title: 'Completed low', completed: true, priority: 'Low' },
  { id: 3, title: 'Open normal', completed: false, priority: 'Normal' },
  { id: 4, title: 'Completed high', completed: true, priority: 'High' },
  { id: 5, title: 'Open low', completed: false, priority: 'Low' },
  { id: 6, title: 'Completed normal', completed: true, priority: 'Normal' },
];

test('all completion and priority combinations retain creation order and leave task data intact', () => {
  const original = structuredClone(tasks);
  const cases = [
    ['All', 'All', [1, 2, 3, 4, 5, 6]],
    ['All', 'Low', [2, 5]],
    ['All', 'Normal', [3, 6]],
    ['All', 'High', [1, 4]],
    ['Open', 'All', [1, 3, 5]],
    ['Open', 'Low', [5]],
    ['Open', 'Normal', [3]],
    ['Open', 'High', [1]],
    ['Completed', 'All', [2, 4, 6]],
    ['Completed', 'Low', [2]],
    ['Completed', 'Normal', [6]],
    ['Completed', 'High', [4]],
  ];
  for (const [completion, priority, expected] of cases) {
    const visible = tasks.filter((task) => matchesTaskFilters(task, completion, priority));
    assert.deepEqual(visible.map((task) => task.id), expected, `${completion} / ${priority}`);
  }
  assert.deepEqual(tasks, original);
});

test('saved edits change matching membership while renaming preserves it', () => {
  const task = { ...tasks[0] };
  assert.equal(matchesTaskFilters(task, 'Open', 'High'), true);
  task.title = 'Renamed high';
  assert.equal(matchesTaskFilters(task, 'Open', 'High'), true);
  task.dueDate = '2026-10-10';
  assert.equal(matchesTaskFilters(task, 'Open', 'High'), true);
  task.dueDate = '';
  assert.equal(matchesTaskFilters(task, 'Open', 'High'), true);
  task.priority = 'Low';
  assert.equal(matchesTaskFilters(task, 'Open', 'High'), false);
  assert.equal(matchesTaskFilters(task, 'Open', 'Low'), true);
  task.completed = true;
  assert.equal(matchesTaskFilters(task, 'Open', 'Low'), false);
  assert.equal(matchesTaskFilters(task, 'Completed', 'Low'), true);
  assert.equal(matchesTaskFilters(task, 'Completed', 'All'), true);
  assert.equal(matchesTaskFilters(task, 'All', 'High'), false);
});
