import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterTasks } from '../public/task-filters.js';

const priorities = ['Low', 'Normal', 'High'];
const completions = ['All', 'Open', 'Completed'];

function fixtures() {
  return priorities.flatMap((priority, index) => [
    { id: index * 2 + 1, title: `Open ${priority}`, priority, completed: false },
    { id: index * 2 + 2, title: `Done ${priority}`, priority, completed: true },
  ]);
}

test('all twelve combined filters preserve creation order and do not mutate tasks', () => {
  const tasks = fixtures();
  const original = structuredClone(tasks);
  const expectedByPriority = { All: [1, 2, 3, 4, 5, 6], Low: [1, 2], Normal: [3, 4], High: [5, 6] };
  for (const completion of completions) {
    for (const priority of ['All', ...priorities]) {
      const expected = expectedByPriority[priority].filter((id) => (
        completion === 'All' || id % 2 === (completion === 'Completed' ? 0 : 1)
      ));
      assert.deepEqual(filterTasks(tasks, completion, priority).map((task) => task.id), expected);
    }
  }
  assert.deepEqual(tasks, original);
  assert.deepEqual(filterTasks([], 'All', 'All'), []);
});

test('edits re-evaluate both filters; renaming leaves membership and state unchanged', () => {
  const tasks = fixtures();
  const visible = () => filterTasks(tasks, 'Open', 'High').map((task) => task.id);
  assert.deepEqual(visible(), [5]);
  tasks[4].title = 'Renamed';
  assert.deepEqual(visible(), [5]);
  assert.equal(tasks[4].priority, 'High');
  assert.equal(tasks[4].completed, false);
  tasks[4].completed = true;
  assert.deepEqual(visible(), []);
  tasks[0].priority = 'High';
  assert.deepEqual(visible(), [1]);
  tasks[4].completed = false;
  assert.deepEqual(visible(), [1, 5]);
  tasks[0].priority = 'Normal';
  assert.deepEqual(visible(), [5]);
  assert.equal(tasks.filter((task) => task.completed).length, 3);
  assert.equal(tasks.length, 6);
});
