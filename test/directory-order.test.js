import assert from 'node:assert/strict';
import { test } from 'node:test';
import { directoryOrders, directoryOrder, orderDirectoryTasks } from '../directory-order.js';

test('directory ordering is stable, literal, code-point based and view-only', () => {
  const tasks = [
    { title: 'Z', priority: 'Low', due_date: '' },
    { title: 'a  b', priority: 'High', due_date: '9999-12-31' },
    { title: 'A\tb', priority: 'Normal', due_date: '0001-01-01' },
    { title: 'A  B', priority: 'High', due_date: '9999-12-31' },
    { title: '\u{10000}', priority: 'Low', due_date: '' },
    { title: '\uE000', priority: 'Normal', due_date: '2024-02-29' },
  ];
  const before = structuredClone(tasks);
  const indices = (order) => orderDirectoryTasks(tasks, order).map((task) => tasks.indexOf(task));
  assert.deepEqual(directoryOrders, ['Original', 'Priority', 'Due date', 'Title']);
  assert.equal(directoryOrder('invalid'), 'Original');
  assert.deepEqual(indices('Original'), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(indices('Priority'), [1, 3, 2, 5, 0, 4]);
  assert.deepEqual(indices('Due date'), [2, 5, 1, 3, 0, 4]);
  assert.deepEqual(indices('Title'), [2, 1, 3, 0, 5, 4]);
  assert.deepEqual(tasks, before);
});
