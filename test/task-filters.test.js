import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterTasks } from '../public/task-filters.js';

const tasks = Object.freeze([
  { id: 1, title: 'First', completed: false, priority: 'High' },
  { id: 2, title: 'Second', completed: true, priority: 'Low' },
  { id: 3, title: 'Third', completed: false, priority: 'Normal' },
  { id: 4, title: 'Fourth', completed: true, priority: 'High' },
  { id: 5, title: 'Fifth', completed: false, priority: 'Low' },
  { id: 6, title: 'Sixth', completed: true, priority: 'Normal' },
].map(Object.freeze));

test('both task filters intersect, retain creation order, and leave saved data intact', () => {
  const expected = {
    All: { All: [1, 2, 3, 4, 5, 6], Low: [2, 5], Normal: [3, 6], High: [1, 4] },
    Open: { All: [1, 3, 5], Low: [5], Normal: [3], High: [1] },
    Completed: { All: [2, 4, 6], Low: [2], Normal: [6], High: [4] },
  };
  const original = structuredClone(tasks);
  for (const [completion, priorities] of Object.entries(expected)) {
    for (const [priority, ids] of Object.entries(priorities)) {
      assert.deepEqual(filterTasks(tasks, completion, priority).map((task) => task.id), ids);
    }
  }
  assert.deepEqual(tasks, original);
  assert.deepEqual(filterTasks([], 'All', 'All'), []);
});

test('saved priority and completion edits change membership while renames preserve it', () => {
  const completionFilter = 'Open';
  const priorityFilter = 'High';
  let savedTasks = structuredClone(tasks);
  const visibleIds = () => filterTasks(savedTasks, completionFilter, priorityFilter).map((task) => task.id);
  const save = (id, changes) => {
    savedTasks = savedTasks.map((task) => task.id === id ? { ...task, ...changes } : task);
  };

  assert.deepEqual(visibleIds(), [1]);
  save(1, { title: 'Renamed first' });
  assert.deepEqual(visibleIds(), [1]);
  save(1, { priority: 'Low' });
  assert.deepEqual(visibleIds(), []);
  save(3, { priority: 'High' });
  assert.deepEqual(visibleIds(), [3]);
  save(4, { completed: false });
  assert.deepEqual(visibleIds(), [3, 4]);
  save(3, { completed: true });
  assert.deepEqual(visibleIds(), [4]);
  assert.equal(savedTasks[0].title, 'Renamed first');
  assert.equal(savedTasks[0].completed, false);
  assert.deepEqual(savedTasks.map((task) => task.id), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(filterTasks(savedTasks, 'Completed', priorityFilter).map((task) => task.id), [3]);
  assert.deepEqual(visibleIds(), [4]);
});
