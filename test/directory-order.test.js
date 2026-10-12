import assert from 'node:assert/strict';
import { test } from 'node:test';
import { orderDirectoryTasks } from '../directory-order.js';

test('directory ordering is stable across owners and never mutates Original data', () => {
  const tasks = [
    { id: 1, projectId: 1, title: 'Zulu', priority: 'Low', dueDate: '' },
    { id: 2, projectId: 1, title: 'alpha', priority: 'High', dueDate: '2024-03-01' },
    { id: 3, projectId: 2, title: 'ALPHA', priority: 'Normal', dueDate: '0001-01-01' },
    { id: 4, projectId: 2, title: 'Beta', priority: 'High', dueDate: '2024-03-01' },
    { id: 5, projectId: 3, title: 'beta', priority: 'Low', dueDate: '' },
  ];
  const before = structuredClone(tasks);
  for (const task of tasks) Object.freeze(task);
  Object.freeze(tasks);
  for (const [order, ids] of [
    ['Original', [1, 2, 3, 4, 5]],
    ['Priority', [2, 4, 3, 1, 5]],
    ['Due date', [3, 2, 4, 1, 5]],
    ['Title', [2, 3, 4, 5, 1]],
  ]) {
    const result = orderDirectoryTasks(tasks, order);
    assert.deepEqual(result.map((task) => task.id), ids);
    assert.notEqual(result, tasks);
  }
  assert.deepEqual(tasks, before);
  assert.deepEqual(orderDirectoryTasks([], 'Title'), []);
});

test('Title uses literal whitespace, ASCII-only case folding and Unicode code points', () => {
  const titles = ['\u{10000}', '\uE000', 'Ä', 'ä', 'a  b', 'A\tb', 'a b', 'a', 'A'];
  const tasks = titles.map((title) => ({ title }));
  assert.deepEqual(orderDirectoryTasks(tasks, 'Title').map((task) => task.title),
    ['a', 'A', 'A\tb', 'a  b', 'a b', 'Ä', 'ä', '\uE000', '\u{10000}']);
});
