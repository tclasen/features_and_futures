import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesTaskFilters } from '../public/task-filters.js';

test('every combination of completion and priority filters matches their intersection', () => {
  for (const completed of [false, true]) {
    for (const priority of ['Low', 'Normal', 'High']) {
      const task = Object.freeze({ title: 'Task', completed, priority });
      for (const completionFilter of ['all', 'open', 'completed']) {
        for (const priorityFilter of ['all', 'Low', 'Normal', 'High']) {
          const expectedCompletion = completionFilter === 'all'
            || completionFilter === (completed ? 'completed' : 'open');
          const expectedPriority = priorityFilter === 'all' || priorityFilter === priority;
          assert.equal(
            matchesTaskFilters(task, completionFilter, priorityFilter),
            expectedCompletion && expectedPriority,
            `${completed}, ${priority}, ${completionFilter}, ${priorityFilter}`,
          );
        }
      }
    }
  }
});

test('filtered rows retain creation order and re-evaluate edited data without altering other tasks', () => {
  const tasks = [
    { id: 1, title: 'First', completed: false, priority: 'High' },
    { id: 2, title: 'Second', completed: true, priority: 'High' },
    { id: 3, title: 'Third', completed: false, priority: 'Low' },
    { id: 4, title: 'Fourth', completed: false, priority: 'High' },
  ];
  const original = structuredClone(tasks);
  const rows = (completion, priority) => tasks
    .filter((task) => matchesTaskFilters(task, completion, priority))
    .map((task) => task.id);
  assert.deepEqual(rows('all', 'all'), [1, 2, 3, 4]);
  assert.deepEqual(rows('open', 'High'), [1, 4]);
  assert.deepEqual(rows('completed', 'Low'), []);
  assert.deepEqual(tasks, original);

  tasks[0].title = 'Renamed';
  assert.deepEqual(rows('open', 'High'), [1, 4]);
  tasks[0].priority = 'Normal';
  assert.deepEqual(rows('open', 'High'), [4]);
  tasks[2].priority = 'High';
  assert.deepEqual(rows('open', 'High'), [3, 4]);
  tasks[2].completed = true;
  assert.deepEqual(rows('open', 'High'), [4]);
  assert.deepEqual(rows('completed', 'High'), [2, 3]);
  tasks[1].completed = false;
  assert.deepEqual(rows('open', 'High'), [2, 4]);
  assert.deepEqual(tasks[3], original[3]);
});
