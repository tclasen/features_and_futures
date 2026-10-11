import test from 'node:test';
import assert from 'node:assert/strict';
import { filterTasks, normalizeDueRange } from '../public/task-filters.js';

test('due ranges validate both boundaries before replacing the applied range', () => {
  assert.deepEqual(normalizeDueRange(' \t0001-01-01 ', ' 9999-12-31\n'),
    { from: '0001-01-01', through: '9999-12-31' });
  assert.deepEqual(normalizeDueRange(' ', '\t'), { from: '', through: '' });
  assert.deepEqual(normalizeDueRange('2000-02-29', ''), { from: '2000-02-29', through: '' });
  assert.deepEqual(normalizeDueRange('', '2000-02-29'), { from: '', through: '2000-02-29' });
  let applied = normalizeDueRange('2026-01-01', '2026-12-31');
  for (const invalid of ['2026-02-29', '1900-02-29', '0000-01-01', '10000-01-01', '2026-1-01', '2026-04-31']) {
    for (const boundaries of [[invalid, ''], ['', invalid], ['9999-12-31', invalid]]) {
      assert.throws(() => { applied = normalizeDueRange(...boundaries); },
        { message: 'Due range must use valid YYYY-MM-DD dates' });
      assert.deepEqual(applied, { from: '2026-01-01', through: '2026-12-31' });
    }
  }
  assert.throws(() => { applied = normalizeDueRange('2026-12-31', '2026-01-01'); },
    { message: 'Due from must not be after Due through' });
  assert.deepEqual(applied, { from: '2026-01-01', through: '2026-12-31' });
});

test('inclusive and unbounded due ranges intersect completion and priority, retaining order and data', () => {
  const tasks = [
    { id: 1, completed: false, priority: 'High', due_date: '' },
    { id: 2, completed: true, priority: 'Low', due_date: '0001-01-01' },
    { id: 3, completed: false, priority: 'High', due_date: '2024-02-29' },
    { id: 4, completed: true, priority: 'Normal', due_date: '2024-03-01' },
    { id: 5, completed: false, priority: 'Low', due_date: '9999-12-31' },
    { id: 6, completed: true, priority: 'High', due_date: '2024-02-29' },
  ];
  const original = structuredClone(tasks);
  const ranges = [
    ['', '', [1, 2, 3, 4, 5, 6]],
    ['0001-01-01', '9999-12-31', [2, 3, 4, 5, 6]],
    ['2024-02-29', '2024-03-01', [3, 4, 6]],
    ['2024-02-29', '2024-02-29', [3, 6]],
    ['', '2024-02-29', [2, 3, 6]],
    ['2024-03-01', '', [4, 5]],
    ['2025-01-01', '2025-12-31', []],
  ];
  for (const [from, through, dateIds] of ranges) {
    for (const completion of ['all', 'open', 'completed']) {
      for (const priority of ['all', 'Low', 'Normal', 'High']) {
        const expected = filterTasks(tasks, completion, priority).filter(task => dateIds.includes(task.id));
        assert.deepEqual(filterTasks(tasks, completion, priority, normalizeDueRange(from, through)), expected);
      }
    }
  }
  assert.deepEqual(tasks, original);
});

test('task edits re-evaluate all three filters using the same applied range', () => {
  const tasks = [
    { id: 1, title: 'First', completed: false, priority: 'High', due_date: '2026-03-01' },
    { id: 2, title: 'Second', completed: false, priority: 'High', due_date: '' },
  ];
  const range = normalizeDueRange('2026-03-01', '2026-03-31');
  const visible = () => filterTasks(tasks, 'open', 'High', range).map(task => task.id);
  assert.deepEqual(visible(), [1]);
  tasks[1].due_date = '2026-03-31';
  assert.deepEqual(visible(), [1, 2]);
  tasks[0].title = 'Renamed';
  assert.deepEqual(visible(), [1, 2]);
  tasks[0].due_date = '2026-04-01';
  assert.deepEqual(visible(), [2]);
  tasks[1].completed = true;
  assert.deepEqual(visible(), []);
  tasks[1].completed = false;
  tasks[1].priority = 'Low';
  assert.deepEqual(visible(), []);
  tasks[1].priority = 'High';
  assert.deepEqual(visible(), [2]);
  tasks[1].due_date = '';
  assert.deepEqual(visible(), []);
  assert.deepEqual(range, { from: '2026-03-01', through: '2026-03-31' });
});

test('all combinations of completion and priority filters preserve creation order and saved data', () => {
  const tasks = [
    { id: 1, title: 'High open', completed: false, priority: 'High' },
    { id: 2, title: 'Low completed', completed: true, priority: 'Low' },
    { id: 3, title: 'Normal open', completed: false, priority: 'Normal' },
    { id: 4, title: 'High completed', completed: true, priority: 'High' },
    { id: 5, title: 'Low open', completed: false, priority: 'Low' },
    { id: 6, title: 'Normal completed', completed: true, priority: 'Normal' },
  ];
  const original = structuredClone(tasks);
  const expected = {
    all: { all: [1, 2, 3, 4, 5, 6], Low: [2, 5], Normal: [3, 6], High: [1, 4] },
    open: { all: [1, 3, 5], Low: [5], Normal: [3], High: [1] },
    completed: { all: [2, 4, 6], Low: [2], Normal: [6], High: [4] },
  };
  for (const [completion, priorities] of Object.entries(expected)) {
    for (const [priority, ids] of Object.entries(priorities)) {
      assert.deepEqual(filterTasks(tasks, completion, priority).map(task => task.id), ids,
        `${completion} and ${priority}`);
    }
  }
  assert.deepEqual(tasks, original);
});

test('edits re-evaluate both filters without changing order, and rename preserves membership', () => {
  const tasks = [
    { id: 1, title: 'First', completed: false, priority: 'High' },
    { id: 2, title: 'Second', completed: false, priority: 'High' },
    { id: 3, title: 'Third', completed: true, priority: 'Low' },
  ];
  const visible = () => filterTasks(tasks, 'open', 'High').map(task => task.id);
  assert.deepEqual(visible(), [1, 2]);
  tasks[0].title = 'Renamed';
  assert.deepEqual(visible(), [1, 2]);
  tasks[0].priority = 'Normal';
  assert.deepEqual(visible(), [2]);
  tasks[1].completed = true;
  assert.deepEqual(visible(), []);
  tasks[0].priority = 'High';
  tasks[1].completed = false;
  assert.deepEqual(visible(), [1, 2]);
  assert.equal(tasks.filter(task => task.completed).length, 1);
  assert.equal(tasks.length, 3);
});


test('Deleted intersects priority, inclusive due range and title search while live filters exclude deleted tasks', () => {
  const tasks = [
    { id: 1, title: 'Review  REPORT', completed: true, priority: 'High', due_date: '2026-10-11', deleted: true },
    { id: 2, title: 'Review report', completed: false, priority: 'High', due_date: '', deleted: true },
    { id: 3, title: 'Review report', completed: false, priority: 'Low', due_date: '2026-10-12', deleted: true },
    { id: 4, title: 'Review report', completed: true, priority: 'High', due_date: '2026-10-11', deleted: false },
    { id: 5, title: 'Unrelated', notes: 'Review report', completed: false, priority: 'High', due_date: '2026-10-11', deleted: true },
  ];
  const original = structuredClone(tasks);
  const range = normalizeDueRange('2026-10-11', '2026-10-12');
  for (const completion of ['all', 'open', 'completed', 'deleted']) {
    for (const priority of ['all', 'Low', 'Normal', 'High']) {
      for (const dueRange of [{ from: '', through: '' }, range]) {
        for (const query of ['', ' review\treport ']) {
          const expected = tasks.filter(task =>
            (completion === 'deleted' ? task.deleted : !task.deleted) &&
            (completion !== 'open' || !task.completed) &&
            (completion !== 'completed' || task.completed) &&
            (priority === 'all' || priority === task.priority) &&
            (!dueRange.from || (task.due_date >= dueRange.from && task.due_date <= dueRange.through)) &&
            (!query || task.id !== 5));
          assert.deepEqual(filterTasks(tasks, completion, priority, dueRange, query), expected);
        }
      }
    }
  }
  assert.deepEqual(tasks, original);
  const visibleDeleted = () => filterTasks(tasks, 'deleted', 'High', range, 'Review report').map(task => task.id);
  assert.deepEqual(visibleDeleted(), [1]);
  tasks[0].deleted = false;
  assert.deepEqual(visibleDeleted(), []);
  assert.deepEqual(filterTasks(tasks, 'completed', 'High', range, 'Review report').map(task => task.id), [1, 4]);
  tasks[3].deleted = true;
  assert.deepEqual(visibleDeleted(), [4]);
});
