import test from 'node:test';
import assert from 'node:assert/strict';
import { directoryOrder, orderDirectoryTasks } from '../task-directory-order.js';

test('directory ordering is stable across owners and does not mutate the original sequence', () => {
  const tasks = [
    { title: 'beta', priority: 'Low', due_date: '' },
    { title: 'Alpha', priority: 'High', due_date: '2028-02-29' },
    { title: 'alpha', priority: 'Normal', due_date: '0001-01-01' },
    { title: 'ALPHA', priority: 'High', due_date: '2028-02-29' },
    { title: 'Zeta', priority: 'Normal', due_date: '' },
  ].map((task, id) => Object.freeze({ ...task, id }));
  Object.freeze(tasks);
  for (const [order, expected] of [
    ['Original', [0, 1, 2, 3, 4]],
    ['Priority', [1, 3, 2, 4, 0]],
    ['Due date', [2, 1, 3, 0, 4]],
    ['Title', [1, 2, 3, 0, 4]],
  ]) {
    assert.deepEqual(orderDirectoryTasks(tasks, order).map((task) => task.id), expected);
    assert.equal(directoryOrder(order), order);
  }
  assert.deepEqual(tasks.map((task) => task.id), [0, 1, 2, 3, 4]);
  for (const value of [undefined, '', 'priority', 'Unknown', 'toString']) {
    assert.equal(directoryOrder(value), 'Original');
  }
  assert.deepEqual(orderDirectoryTasks([], 'Title'), []);
});

test('title ordering folds only ASCII letters and compares literal Unicode code points', () => {
  const titles = ['𐀀', '\uE000', 'ä', 'Ä', 'a  b', 'a b', 'a\tb', 'A', 'a', 'aa', 'a\nb'];
  const tasks = titles.map((title) => ({ title }));
  assert.deepEqual(orderDirectoryTasks(tasks, 'Title').map((task) => task.title),
    ['A', 'a', 'a\tb', 'a\nb', 'a  b', 'a b', 'aa', 'Ä', 'ä', '\uE000', '𐀀']);
  assert.deepEqual(tasks.map((task) => task.title), titles);
});
