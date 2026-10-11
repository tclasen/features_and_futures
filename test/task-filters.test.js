import test from 'node:test';
import assert from 'node:assert/strict';
import { filterTasks, normalizeDueRange } from '../public/task-filters.js';

const tasks = [
  { id: 1, title: 'First', completed: false, priority: 'High' },
  { id: 2, title: 'Second', completed: true, priority: 'Low' },
  { id: 3, title: 'Third', completed: false, priority: 'Normal' },
  { id: 4, title: 'Fourth', completed: true, priority: 'High' },
  { id: 5, title: 'Fifth', completed: false, priority: 'Low' },
  { id: 6, title: 'Sixth', completed: true, priority: 'Normal' },
];

test('all completion and priority combinations retain creation order without changing data', () => {
  const original = structuredClone(tasks);
  const expected = {
    all: { all: [1, 2, 3, 4, 5, 6], Low: [2, 5], Normal: [3, 6], High: [1, 4] },
    open: { all: [1, 3, 5], Low: [5], Normal: [3], High: [1] },
    completed: { all: [2, 4, 6], Low: [2], Normal: [6], High: [4] },
  };
  for (const [completion, priorities] of Object.entries(expected)) {
    for (const [priority, ids] of Object.entries(priorities)) {
      assert.deepEqual(filterTasks(tasks, completion, priority).map((task) => task.id), ids);
    }
  }
  assert.deepEqual(tasks, original);
  assert.deepEqual(filterTasks([], 'all', 'all'), []);
});

test('edits re-evaluate combined membership while renaming preserves it', () => {
  const savedTasks = structuredClone(tasks);
  const visibleIds = () => filterTasks(savedTasks, 'open', 'High').map((task) => task.id);
  assert.deepEqual(visibleIds(), [1]);
  savedTasks[0].priority = 'Low';
  assert.deepEqual(visibleIds(), []);
  savedTasks[2].priority = 'High';
  assert.deepEqual(visibleIds(), [3]);
  savedTasks[2].title = 'Renamed third';
  assert.deepEqual(visibleIds(), [3]);
  savedTasks[2].completed = true;
  assert.deepEqual(visibleIds(), []);
  assert.deepEqual(filterTasks(savedTasks, 'completed', 'High').map((task) => task.id), [3, 4]);
  savedTasks[2].completed = false;
  assert.deepEqual(visibleIds(), [3]);
});

test('due range validation trims boundaries and applies Gregorian calendar rules', () => {
  assert.deepEqual(normalizeDueRange(' \t ', '\n'), { from: '', through: '' });
  assert.deepEqual(normalizeDueRange(' 0001-01-01 ', ' 9999-12-31 '), { from: '0001-01-01', through: '9999-12-31' });
  assert.deepEqual(normalizeDueRange('2000-02-29', '2000-02-29'), { from: '2000-02-29', through: '2000-02-29' });
  for (const invalid of ['0000-01-01', '10000-01-01', '1900-02-29', '2023-02-29', '2024-04-31', '2024-1-01', '2024-01-00', '2024-13-01', '2024-01-01T00:00:00Z', null, undefined]) {
    assert.throws(() => normalizeDueRange(invalid, ''), { message: 'Due range must use valid YYYY-MM-DD dates' });
    assert.throws(() => normalizeDueRange('', invalid), { message: 'Due range must use valid YYYY-MM-DD dates' });
  }
  assert.throws(() => normalizeDueRange('2025-01-02', '2025-01-01'), { message: 'Due from must not be after Due through' });
});

const datedTasks = tasks.map((task, index) => ({
  ...task,
  due_date: ['', '0001-01-01', '2024-02-29', '2024-02-29', '2025-01-01', '9999-12-31'][index],
}));

test('Deleted intersects priority, range, and title search while live filters exclude deleted tasks', () => {
  const saved = datedTasks.map((task) => ({ ...task, deleted: task.id % 2 === 0, notes: 'Not a title match' }));
  const original = structuredClone(saved);
  const ids = (completion, priority = 'all', range, query) => filterTasks(saved, completion, priority, range, query).map((task) => task.id);
  assert.deepEqual(ids('all'), [1, 3, 5]);
  assert.deepEqual(ids('open'), [1, 3, 5]);
  assert.deepEqual(ids('completed'), []);
  assert.deepEqual(ids('deleted'), [2, 4, 6]);
  assert.deepEqual(ids('deleted', 'High'), [4]);
  assert.deepEqual(ids('deleted', 'Normal'), [6]);
  assert.deepEqual(ids('deleted', 'all', normalizeDueRange('', '2024-02-29')), [2, 4]);
  const range = normalizeDueRange('2024-02-29', '2024-02-29');
  assert.deepEqual(ids('deleted', 'High', range, 'four'), [4]);
  assert.deepEqual(ids('deleted', 'High', range, 'not a title match'), []);
  assert.deepEqual(saved, original);
  saved[3].deleted = false;
  assert.deepEqual(ids('deleted', 'High', range, 'four'), []);
  assert.deepEqual(ids('completed', 'High', range, 'four'), [4]);
});

test('inclusive and unbounded ranges intersect every completion and priority combination', () => {
  const original = structuredClone(datedTasks);
  const ranges = [
    ['', '', [1, 2, 3, 4, 5, 6]],
    ['0001-01-01', '9999-12-31', [2, 3, 4, 5, 6]],
    ['2024-02-29', '2024-02-29', [3, 4]],
    ['2024-02-29', '', [3, 4, 5, 6]],
    ['', '2024-02-29', [2, 3, 4]],
    ['2024-03-01', '2024-12-31', []],
    ['', '0001-01-01', [2]],
    ['9999-12-31', '', [6]],
  ];
  for (const [from, through, ids] of ranges) {
    for (const completion of ['all', 'open', 'completed']) {
      for (const priority of ['all', 'Low', 'Normal', 'High']) {
        const expected = filterTasks(datedTasks, completion, priority)
          .filter((task) => ids.includes(task.id)).map((task) => task.id);
        assert.deepEqual(filterTasks(datedTasks, completion, priority, normalizeDueRange(from, through))
          .map((task) => task.id), expected);
      }
    }
  }
  assert.deepEqual(datedTasks, original);
});

test('date, priority, completion, and title edits re-evaluate all filters together', () => {
  const saved = structuredClone(datedTasks);
  const range = normalizeDueRange('2024-02-29', '2024-02-29');
  const visible = () => filterTasks(saved, 'open', 'High', range).map((task) => task.id);
  assert.deepEqual(visible(), []);
  saved[0].due_date = '2024-02-29';
  assert.deepEqual(visible(), [1]);
  saved[2].priority = 'High';
  assert.deepEqual(visible(), [1, 3]);
  saved[0].due_date = '';
  assert.deepEqual(visible(), [3]);
  saved[2].title = 'Renamed';
  assert.deepEqual(visible(), [3]);
  saved[2].completed = true;
  assert.deepEqual(visible(), []);
  saved[2].completed = false;
  assert.deepEqual(visible(), [3]);
  saved[2].due_date = '2024-03-01';
  assert.deepEqual(visible(), []);
  assert.deepEqual(range, { from: '2024-02-29', through: '2024-02-29' });
});
