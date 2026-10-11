import test from 'node:test';
import assert from 'node:assert/strict';
import { filterTasks } from '../public/task-filters.js';

test('all combinations of completion and priority filters preserve creation order and saved data', () => {
  const tasks = [
    { id: 1, title: 'High open', completed: false, priority: 'High' },
    { id: 2, title: 'Low completed', completed: true, priority: 'Low' },
    { id: 3, title: 'Normal open', completed: false, priority: 'Normal' },
    { id: 4, title: 'High completed', completed: true, priority: 'High' },
    { id: 5, title: 'Low open', completed: false, priority: 'Low' },
    { id: 6, title: 'Normal completed', completed: true, priority: 'Normal' },
  ];
  const original = structuredClone(tasks);
  const expected = {
    all: { all: [1, 2, 3, 4, 5, 6], Low: [2, 5], Normal: [3, 6], High: [1, 4] },
    open: { all: [1, 3, 5], Low: [5], Normal: [3], High: [1] },
    completed: { all: [2, 4, 6], Low: [2], Normal: [6], High: [4] },
  };
  for (const [completion, priorities] of Object.entries(expected)) {
    for (const [priority, ids] of Object.entries(priorities)) {
      assert.deepEqual(filterTasks(tasks, completion, priority).map(task => task.id), ids,
        `${completion} and ${priority}`);
    }
  }
  assert.deepEqual(tasks, original);
});

test('edits re-evaluate both filters without changing order, and rename preserves membership', () => {
  const tasks = [
    { id: 1, title: 'First', completed: false, priority: 'High' },
    { id: 2, title: 'Second', completed: false, priority: 'High' },
    { id: 3, title: 'Third', completed: true, priority: 'Low' },
  ];
  const visible = () => filterTasks(tasks, 'open', 'High').map(task => task.id);
  assert.deepEqual(visible(), [1, 2]);
  tasks[0].title = 'Renamed';
  assert.deepEqual(visible(), [1, 2]);
  tasks[0].priority = 'Normal';
  assert.deepEqual(visible(), [2]);
  tasks[1].completed = true;
  assert.deepEqual(visible(), []);
  tasks[0].priority = 'High';
  tasks[1].completed = false;
  assert.deepEqual(visible(), [1, 2]);
  assert.equal(tasks.filter(task => task.completed).length, 1);
  assert.equal(tasks.length, 3);
});
