import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesTaskFilters, normalizeDueRange } from '../public/task-filters.js';

test('every combination of completion and priority filters matches their intersection', () => {
  for (const completed of [false, true]) {
    for (const priority of ['Low', 'Normal', 'High']) {
      const task = Object.freeze({ title: 'Task', completed, priority });
      for (const completionFilter of ['all', 'open', 'completed']) {
        for (const priorityFilter of ['all', 'Low', 'Normal', 'High']) {
          const expectedCompletion = completionFilter === 'all'
            || completionFilter === (completed ? 'completed' : 'open');
          const expectedPriority = priorityFilter === 'all' || priorityFilter === priority;
          assert.equal(
            matchesTaskFilters(task, completionFilter, priorityFilter),
            expectedCompletion && expectedPriority,
            `${completed}, ${priority}, ${completionFilter}, ${priorityFilter}`,
          );
        }
      }
    }
  }
});

test('filtered rows retain creation order and re-evaluate edited data without altering other tasks', () => {
  const tasks = [
    { id: 1, title: 'First', completed: false, priority: 'High' },
    { id: 2, title: 'Second', completed: true, priority: 'High' },
    { id: 3, title: 'Third', completed: false, priority: 'Low' },
    { id: 4, title: 'Fourth', completed: false, priority: 'High' },
  ];
  const original = structuredClone(tasks);
  const rows = (completion, priority) => tasks
    .filter((task) => matchesTaskFilters(task, completion, priority))
    .map((task) => task.id);
  assert.deepEqual(rows('all', 'all'), [1, 2, 3, 4]);
  assert.deepEqual(rows('open', 'High'), [1, 4]);
  assert.deepEqual(rows('completed', 'Low'), []);
  assert.deepEqual(tasks, original);

  tasks[0].title = 'Renamed';
  assert.deepEqual(rows('open', 'High'), [1, 4]);
  tasks[0].priority = 'Normal';
  assert.deepEqual(rows('open', 'High'), [4]);
  tasks[2].priority = 'High';
  assert.deepEqual(rows('open', 'High'), [3, 4]);
  tasks[2].completed = true;
  assert.deepEqual(rows('open', 'High'), [4]);
  assert.deepEqual(rows('completed', 'High'), [2, 3]);
  tasks[1].completed = false;
  assert.deepEqual(rows('open', 'High'), [2, 4]);
  assert.deepEqual(tasks[3], original[3]);
});

test('due ranges trim and validate both boundaries before checking their order', () => {
  for (const [from, through] of [
    ['', ''], ['0001-01-01', '9999-12-31'], ['2000-02-29', '2000-02-29'],
    ['', '2026-10-10'], ['2026-10-10', ''],
  ]) {
    assert.deepEqual(normalizeDueRange(` \t${from} `, ` ${through}\n`), { from, through });
  }
  for (const invalid of [
    '0000-01-01', '10000-01-01', '1900-02-29', '2026-04-31', '2026-1-01',
    '2026-01-1', '2026/01/01', '2026-10-10T00:00:00Z', 'bad', null,
  ]) {
    assert.throws(() => normalizeDueRange(invalid, ''), {
      message: 'Due range must use valid YYYY-MM-DD dates',
    });
    assert.throws(() => normalizeDueRange('9999-12-31', invalid), {
      message: 'Due range must use valid YYYY-MM-DD dates',
    });
  }
  assert.throws(() => normalizeDueRange('2026-10-11', '2026-10-10'), {
    message: 'Due from must not be after Due through',
  });
});

test('inclusive due ranges intersect every completion and priority filter without changing data', () => {
  const dates = ['', '0001-01-01', '2024-02-28', '2024-02-29', '2024-03-01', '9999-12-31'];
  const ranges = [
    { from: '', through: '' },
    { from: '2024-02-29', through: '' },
    { from: '', through: '2024-02-29' },
    { from: '2024-02-29', through: '2024-02-29' },
    { from: '0001-01-01', through: '9999-12-31' },
  ];
  const expectedDates = [dates, dates.slice(3), dates.slice(1, 4), [dates[3]], dates.slice(1)];
  for (const completed of [false, true]) {
    for (const priority of ['Low', 'Normal', 'High']) {
      for (const dueDate of dates) {
        const task = Object.freeze({ completed, priority, dueDate });
        for (const completionFilter of ['all', 'open', 'completed']) {
          for (const priorityFilter of ['all', 'Low', 'Normal', 'High']) {
            ranges.forEach((range, index) => {
              assert.equal(matchesTaskFilters(task, completionFilter, priorityFilter, Object.freeze(range)),
                (completionFilter === 'all' || completionFilter === (completed ? 'completed' : 'open'))
                && (priorityFilter === 'all' || priorityFilter === priority)
                && expectedDates[index].includes(dueDate),
                `${completed}, ${priority}, ${dueDate}, ${completionFilter}, ${priorityFilter}, ${index}`);
            });
          }
        }
      }
    }
  }
});

test('applied ranges survive invalid drafts and task edits re-evaluate membership in creation order', () => {
  const tasks = [
    { id: 1, title: 'First', completed: false, priority: 'High', dueDate: '2026-10-10' },
    { id: 2, title: 'Second', completed: false, priority: 'High', dueDate: '' },
    { id: 3, title: 'Third', completed: true, priority: 'High', dueDate: '2026-10-10' },
    { id: 4, title: 'Fourth', completed: false, priority: 'Low', dueDate: '2026-10-10' },
    { id: 5, title: 'Fifth', completed: false, priority: 'High', dueDate: '2026-10-11' },
  ];
  let range = normalizeDueRange('2026-10-10', '2026-10-10');
  const rows = (completion = 'open', priority = 'High') => tasks
    .filter((task) => matchesTaskFilters(task, completion, priority, range))
    .map((task) => task.id);
  assert.deepEqual(rows(), [1]);
  for (const draft of [['bad', ''], ['2026-10-11', '2026-10-10']]) {
    assert.throws(() => { range = normalizeDueRange(...draft); });
    assert.deepEqual(rows(), [1]);
  }
  tasks[0].title = 'Renamed';
  assert.deepEqual(rows(), [1]);
  tasks[1].dueDate = '2026-10-10';
  assert.deepEqual(rows(), [1, 2]);
  tasks[0].dueDate = '';
  assert.deepEqual(rows(), [2]);
  tasks[2].completed = false;
  assert.deepEqual(rows(), [2, 3]);
  tasks[3].priority = 'High';
  assert.deepEqual(rows(), [2, 3, 4]);
  tasks[4].dueDate = '2026-10-10';
  assert.deepEqual(rows(), [2, 3, 4, 5]);
  assert.deepEqual(rows('all', 'all'), [2, 3, 4, 5]);
  tasks[4].dueDate = '2026-10-09';
  assert.deepEqual(rows(), [2, 3, 4]);
  tasks.push({ id: 6, title: 'New task', completed: false, priority: 'High', dueDate: '' });
  assert.deepEqual(rows(), [2, 3, 4]);
  range = normalizeDueRange('', '');
  assert.deepEqual(rows(), [1, 2, 3, 4, 5, 6]);
});
