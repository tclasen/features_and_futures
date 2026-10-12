import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderDirectoryTasks } from '../public/directory-order.js';

test('directory ordering is global, stable, literal and leaves original data unchanged', () => {
  const tasks = [
    { id: 1, project_id: 1, title: 'z', priority: 'Low', due_date: '' },
    { id: 2, project_id: 1, title: 'Alpha  B', priority: 'High', due_date: '2024-02-29' },
    { id: 3, project_id: 2, title: 'alpha\tB', priority: 'Normal', due_date: '0001-01-01' },
    { id: 4, project_id: 2, title: 'ALPHA  b', priority: 'High', due_date: '2024-02-29' },
    { id: 5, project_id: 2, title: 'Alpha B', priority: 'Low', due_date: '' },
    { id: 6, project_id: 3, title: '\u{10000}', priority: 'Normal', due_date: '9999-12-31' },
    { id: 7, project_id: 3, title: '\ue000', priority: 'Normal', due_date: '' },
    { id: 8, project_id: 3, title: 'Ä', priority: 'Low', due_date: '' },
    { id: 9, project_id: 3, title: 'ä', priority: 'Low', due_date: '' },
  ];
  const before = structuredClone(tasks);
  const ids = (order) => orderDirectoryTasks(tasks, order).map((task) => task.id);
  assert.deepEqual(ids('original'), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(ids('priority'), [2, 4, 3, 6, 7, 1, 5, 8, 9]);
  assert.deepEqual(ids('due-date'), [3, 2, 4, 6, 1, 5, 7, 8, 9]);
  assert.deepEqual(ids('title'), [3, 2, 4, 5, 1, 8, 9, 7, 6]);
  assert.deepEqual(tasks, before);
  assert.deepEqual(orderDirectoryTasks([], 'title'), []);
});
