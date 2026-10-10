import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesTaskFilters, normalizeDueRange } from '../public/task-filters.js';

const tasks = [
  { id: 1, title: 'Undated', completed: false, priority: 'High', due_date: '' },
  { id: 2, title: 'Before', completed: false, priority: 'Low', due_date: '2024-02-28' },
  { id: 3, title: 'Start', completed: true, priority: 'Normal', due_date: '2024-02-29' },
  { id: 4, title: 'End', completed: false, priority: 'High', due_date: '2024-03-01' },
  { id: 5, title: 'After', completed: true, priority: 'High', due_date: '2024-03-02' },
];
const ids = (rows, completion, priority, range) => rows
  .filter((task) => matchesTaskFilters(task, completion, priority, range))
  .map((task) => task.id);

test('range validation trims and accepts blank, extreme and equal boundaries', () => {
  assert.deepEqual(normalizeDueRange(' \t', ''), { from: '', through: '' });
  assert.deepEqual(normalizeDueRange(' 0001-01-01 ', ' 9999-12-31 '),
    { from: '0001-01-01', through: '9999-12-31' });
  assert.deepEqual(normalizeDueRange('2024-02-29', '2024-02-29'),
    { from: '2024-02-29', through: '2024-02-29' });
  for (const invalid of ['0000-01-01', '10000-01-01', '1900-02-29', '2024-04-31',
    '2024-2-29', '2024-02-29T00:00:00Z', null]) {
    assert.throws(() => normalizeDueRange(invalid, ''), /Due range must use valid YYYY-MM-DD dates/);
    assert.throws(() => normalizeDueRange('', invalid), /Due range must use valid YYYY-MM-DD dates/);
  }
  assert.throws(() => normalizeDueRange('2024-03-01', '2024-02-29'),
    /Due from must not be after Due through/);
});

test('inclusive, one-sided and blank ranges intersect every completion and priority selection', () => {
  const original = structuredClone(tasks);
  const ranges = [
    ['', '', [1, 2, 3, 4, 5]],
    ['2024-02-29', '', [3, 4, 5]],
    ['', '2024-03-01', [2, 3, 4]],
    ['2024-02-29', '2024-03-01', [3, 4]],
    ['2024-02-29', '2024-02-29', [3]],
    ['0001-01-01', '9999-12-31', [2, 3, 4, 5]],
  ];
  for (const [from, through, expectedIds] of ranges) {
    for (const completion of ['All', 'Open', 'Completed']) {
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        const expected = tasks.filter((task) => expectedIds.includes(task.id)
          && (completion === 'All' || task.completed === (completion === 'Completed'))
          && (priority === 'All' || task.priority === priority)).map((task) => task.id);
        assert.deepEqual(ids(tasks, completion, priority, normalizeDueRange(from, through)), expected);
      }
    }
  }
  assert.deepEqual(tasks, original);
});

test('invalid application preserves range; saved edits re-evaluate without changing selections', () => {
  const rows = structuredClone(tasks);
  const completion = 'Open';
  const priority = 'High';
  let range = normalizeDueRange('2024-02-29', '2024-03-01');
  const visible = () => ids(rows, completion, priority, range);
  assert.deepEqual(visible(), [4]);
  for (const boundaries of [['bad', ''], ['2024-03-02', '2024-03-01']]) {
    assert.throws(() => { range = normalizeDueRange(...boundaries); });
    assert.deepEqual(visible(), [4]);
  }
  rows[0].due_date = '2024-02-29';
  assert.deepEqual(visible(), [1, 4]);
  rows[0].title = 'Renamed';
  assert.deepEqual(visible(), [1, 4]);
  rows[0].priority = 'Low';
  assert.deepEqual(visible(), [4]);
  rows[3].completed = true;
  assert.deepEqual(visible(), []);
  rows[3].completed = false;
  rows[3].due_date = '';
  assert.deepEqual(visible(), []);
  rows.push({ id: 6, title: 'New task', completed: false, priority: 'High', due_date: '' });
  assert.deepEqual(visible(), []);
  assert.deepEqual(range, { from: '2024-02-29', through: '2024-03-01' });
});
