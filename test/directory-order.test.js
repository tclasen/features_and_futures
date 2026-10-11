import test from 'node:test';
import assert from 'node:assert/strict';
import { directoryOrder, orderDirectoryTasks } from '../directory-order.js';

const task = (id, title, priority = 'Normal', due_date = '') => ({ id, title, priority, due_date });
const ids = (tasks) => tasks.map((item) => item.id);

test('directory order defaults and stable global priority/date ordering never mutate input', () => {
  assert.equal(directoryOrder(undefined), 'Original');
  assert.equal(directoryOrder('invalid'), 'Original');
  for (const order of ['Original', 'Priority', 'Due date', 'Title']) assert.equal(directoryOrder(order), order);
  const tasks = [
    task(1, 'z', 'Low', '9999-12-31'),
    task(2, 'b', 'High'),
    task(3, 'a', 'Normal', '0001-01-01'),
    task(4, 'c', 'High', '0001-01-01'),
    task(5, 'd', 'Low'),
  ];
  const before = structuredClone(tasks);
  assert.deepEqual(ids(orderDirectoryTasks(tasks, 'Original')), [1, 2, 3, 4, 5]);
  assert.deepEqual(ids(orderDirectoryTasks(tasks, 'Priority')), [2, 4, 3, 1, 5]);
  assert.deepEqual(ids(orderDirectoryTasks(tasks, 'Due date')), [3, 4, 1, 2, 5]);
  assert.deepEqual(tasks, before);
  assert.notEqual(orderDirectoryTasks(tasks, 'Original'), tasks);
});

test('title ordering uses ASCII-only folding and Unicode code points, not search normalization or locale', () => {
  const tasks = [
    task(1, 'Alpha'), task(2, 'ALPHA'), task(3, 'a  b'), task(4, 'a b'),
    task(5, 'a\tb'), task(6, 'Ä'), task(7, 'ä'), task(8, '😀'), task(9, '\uE000'),
  ];
  assert.deepEqual(ids(orderDirectoryTasks(tasks, 'Title')), [5, 3, 4, 1, 2, 6, 7, 9, 8]);
  assert.deepEqual(orderDirectoryTasks([], 'Due date'), []);
});
