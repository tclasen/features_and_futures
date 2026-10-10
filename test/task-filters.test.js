import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesTaskFilters } from '../public/task-filters.js';

const priorities = ['Low', 'Normal', 'High'];
const tasks = priorities.flatMap((priority, index) => [
  { id: index * 2, title: `Open ${priority}`, completed: false, priority },
  { id: index * 2 + 1, title: `Completed ${priority}`, completed: true, priority },
]);

function visible(tasks, completion, priority) {
  return tasks.filter((task) => matchesTaskFilters(task, completion, priority));
}

test('every completion and priority combination retains order and leaves tasks unchanged', () => {
  const original = structuredClone(tasks);
  for (const completion of ['All', 'Open', 'Completed']) {
    for (const priority of ['All', ...priorities]) {
      const expected = tasks.filter((task) => {
        if (completion === 'Open' && task.completed) return false;
        if (completion === 'Completed' && !task.completed) return false;
        return priority === 'All' || task.priority === priority;
      });
      assert.deepEqual(visible(tasks, completion, priority), expected);
    }
  }
  assert.deepEqual(tasks, original);
});

test('edits re-evaluate both filters; renaming does not affect membership or other tasks', () => {
  const saved = structuredClone(tasks);
  const task = saved[0];
  const completion = 'Open';
  const priority = 'High';
  assert.deepEqual(visible(saved, completion, priority).map((task) => task.id), [4]);
  task.priority = 'High';
  assert.deepEqual(visible(saved, completion, priority).map((task) => task.id), [0, 4]);
  task.title = 'Renamed';
  assert.deepEqual(visible(saved, completion, priority).map((task) => task.id), [0, 4]);
  task.completed = true;
  assert.deepEqual(visible(saved, completion, priority).map((task) => task.id), [4]);
  assert.deepEqual(visible(saved, 'Completed', priority).map((task) => task.id), [0, 5]);
  task.completed = false;
  assert.deepEqual(visible(saved, completion, priority).map((task) => task.id), [0, 4]);
  task.priority = 'Normal';
  assert.deepEqual(visible(saved, completion, priority).map((task) => task.id), [4]);
  assert.deepEqual(saved.slice(1), tasks.slice(1));
});
