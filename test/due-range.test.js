import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterTasks, normalizeDueRange } from '../public/task-filters.js';

const tasks = [
  { id: 1, completed: false, priority: 'High', due_date: '' },
  { id: 2, completed: false, priority: 'High', due_date: '2024-02-28' },
  { id: 3, completed: true, priority: 'High', due_date: '2024-02-29' },
  { id: 4, completed: false, priority: 'Low', due_date: '2024-03-01' },
  { id: 5, completed: false, priority: 'High', due_date: '9999-12-31' },
];
const ids = (range, completion = 'All', priority = 'All', source = tasks) =>
  filterTasks(source, completion, priority, range).map((task) => task.id);

test('inclusive, one-sided and empty ranges intersect both filters without mutation', () => {
  const original = structuredClone(tasks);
  assert.deepEqual(ids(normalizeDueRange(' ', '')), [1, 2, 3, 4, 5]);
  assert.deepEqual(ids(normalizeDueRange(' 2024-02-28 ', '2024-03-01 ')), [2, 3, 4]);
  assert.deepEqual(ids(normalizeDueRange('', '2024-02-29')), [2, 3]);
  assert.deepEqual(ids(normalizeDueRange('2024-03-01', '')), [4, 5]);
  assert.deepEqual(ids(normalizeDueRange('2024-02-29', '2024-02-29')), [3]);
  const range = normalizeDueRange('0001-01-01', '9999-12-31');
  for (const completion of ['All', 'Open', 'Completed']) {
    for (const priority of ['All', 'Low', 'Normal', 'High']) {
      const expected = tasks.filter((task) => task.due_date &&
        (completion === 'All' || task.completed === (completion === 'Completed')) &&
        (priority === 'All' || task.priority === priority)).map((task) => task.id);
      assert.deepEqual(ids(range, completion, priority), expected);
    }
  }
  assert.deepEqual(tasks, original);
});

test('invalid applications preserve previously applied range and membership', () => {
  let applied = normalizeDueRange('2024-02-29', '2024-03-01');
  for (const [from, through] of [
    ['2023-02-29', ''], ['', '2024-04-31'], ['0000-01-01', ''],
    ['10000-01-01', ''], ['2024-2-01', ''], ['date', ''],
  ]) {
    assert.throws(() => { applied = normalizeDueRange(from, through); },
      /Due range must use valid YYYY-MM-DD dates/);
    assert.deepEqual(ids(applied), [3, 4]);
  }
  assert.throws(() => { applied = normalizeDueRange('2024-03-01', '2024-02-29'); },
    /Due from must not be after Due through/);
  assert.deepEqual(ids(applied), [3, 4]);
});

test('saved date, priority and completion edits re-evaluate the same range and selections', () => {
  const source = structuredClone(tasks);
  const range = normalizeDueRange('2024-02-28', '2024-02-29');
  const visible = () => ids(range, 'Open', 'High', source);
  assert.deepEqual(visible(), [2]);
  source[0].due_date = '2024-02-29';
  assert.deepEqual(visible(), [1, 2]);
  source[1].due_date = '';
  assert.deepEqual(visible(), [1]);
  source[0].priority = 'Low';
  assert.deepEqual(visible(), []);
  source[2].completed = false;
  assert.deepEqual(visible(), [3]);
  source[2].title = 'Renamed';
  assert.deepEqual(visible(), [3]);
  source.push({ id: 6, completed: false, priority: 'High', due_date: '' });
  assert.deepEqual(visible(), [3]);
  assert.deepEqual(range, { from: '2024-02-28', through: '2024-02-29' });
});
