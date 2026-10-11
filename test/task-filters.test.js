import test from 'node:test';
import assert from 'node:assert/strict';
import { filterTasks } from '../public/task-filters.js';

const tasks = [
  { id: 1, title: 'First', completed: false, priority: 'High' },
  { id: 2, title: 'Second', completed: true, priority: 'Low' },
  { id: 3, title: 'Third', completed: false, priority: 'Normal' },
  { id: 4, title: 'Fourth', completed: true, priority: 'High' },
  { id: 5, title: 'Fifth', completed: false, priority: 'Low' },
  { id: 6, title: 'Sixth', completed: true, priority: 'Normal' },
];

test('all completion and priority combinations retain creation order without changing data', () => {
  const original = structuredClone(tasks);
  const expected = {
    all: { all: [1, 2, 3, 4, 5, 6], Low: [2, 5], Normal: [3, 6], High: [1, 4] },
    open: { all: [1, 3, 5], Low: [5], Normal: [3], High: [1] },
    completed: { all: [2, 4, 6], Low: [2], Normal: [6], High: [4] },
  };
  for (const [completion, priorities] of Object.entries(expected)) {
    for (const [priority, ids] of Object.entries(priorities)) {
      assert.deepEqual(filterTasks(tasks, completion, priority).map((task) => task.id), ids);
    }
  }
  assert.deepEqual(tasks, original);
  assert.deepEqual(filterTasks([], 'all', 'all'), []);
});

test('edits re-evaluate combined membership while renaming preserves it', () => {
  const savedTasks = structuredClone(tasks);
  const visibleIds = () => filterTasks(savedTasks, 'open', 'High').map((task) => task.id);
  assert.deepEqual(visibleIds(), [1]);
  savedTasks[0].priority = 'Low';
  assert.deepEqual(visibleIds(), []);
  savedTasks[2].priority = 'High';
  assert.deepEqual(visibleIds(), [3]);
  savedTasks[2].title = 'Renamed third';
  assert.deepEqual(visibleIds(), [3]);
  savedTasks[2].completed = true;
  assert.deepEqual(visibleIds(), []);
  assert.deepEqual(filterTasks(savedTasks, 'completed', 'High').map((task) => task.id), [3, 4]);
  savedTasks[2].completed = false;
  assert.deepEqual(visibleIds(), [3]);
});
