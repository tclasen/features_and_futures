import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesSearch } from '../public/search.js';
import { filterProjects } from '../public/project-filters.js';
import { filterTasks, normalizeDueRange } from '../public/task-filters.js';

const ids = (rows) => rows.map((row) => row.id);

test('substring search trims query edges, folds ASCII only, and treats query literally', () => {
  for (const [text, query, expected] of [
    ['Alpha Beta', '  pHA b  ', true],
    ['Alpha Beta', '\t\n ', true],
    ['Alpha  Beta', 'alpha beta', false],
    ['Alpha  Beta', 'a  b', true],
    ['Alpha\tBeta', 'a b', false],
    ['Alpha\tBeta', 'a\tb', true],
    ['ÄBC', 'äbc', false],
    ['ÄBC', 'Äbc', true],
    ['Project [a.*]', '[a.*]', true],
    ['Project Alpha', 'a.*', false],
    ['', 'missing', false],
  ]) {
    assert.equal(matchesSearch(text, query), expected, `${JSON.stringify(text)} / ${JSON.stringify(query)}`);
  }
});

test('project search intersects archive filter without changing order, names, or summaries', () => {
  const projects = [
    { id: 1, name: 'Pilot One', archived: false, total_count: 3, completed_count: 1 },
    { id: 2, name: 'Other', archived: false, total_count: 0, completed_count: 0 },
    { id: 3, name: 'PILOT Two', archived: true, total_count: 4, completed_count: 4 },
    { id: 4, name: 'pilot Three', archived: false, total_count: 2, completed_count: 1 },
  ];
  const original = structuredClone(projects);
  assert.deepEqual(ids(filterProjects(projects, 'Active', '  pILot ')), [1, 4]);
  assert.deepEqual(ids(filterProjects(projects, 'Archived', '  pILot ')), [3]);
  assert.deepEqual(ids(filterProjects(projects, 'Active', '')), [1, 2, 4]);
  assert.deepEqual(ids(filterProjects(projects, 'Archived', 'missing')), []);
  assert.deepEqual(projects, original);
  projects[0].archived = true;
  assert.deepEqual(ids(filterProjects(projects, 'Archived', 'pilot')), [1, 3]);
  projects[2].archived = false;
  assert.deepEqual(ids(filterProjects(projects, 'Active', 'pilot')), [3, 4]);
  projects[2].name = 'Renamed';
  assert.deepEqual(ids(filterProjects(projects, 'Active', 'pilot')), [4]);
});

test('task search intersects every completion, priority, and range combination without mutation', () => {
  const tasks = [];
  for (const priority of ['Low', 'Normal', 'High']) {
    for (const completed of [false, true]) {
      for (const due_date of ['', '2024-02-28', '2024-02-29', '2024-03-01']) {
        for (const title of ['Match this', 'Other', 'MATCH  this']) {
          tasks.push({ id: tasks.length + 1, title, priority, completed, due_date });
        }
      }
    }
  }
  const original = structuredClone(tasks);
  for (const completion of ['All', 'Open', 'Completed']) {
    for (const priority of ['All', 'Low', 'Normal', 'High']) {
      for (const range of [
        normalizeDueRange('', ''), normalizeDueRange('2024-02-29', ''),
        normalizeDueRange('', '2024-02-29'), normalizeDueRange('2024-02-28', '2024-02-29'),
      ]) {
        for (const query of ['', ' match ', 'match this', 'missing']) {
          const expected = tasks.filter((task) =>
            (completion === 'All' || task.completed === (completion === 'Completed')) &&
            (priority === 'All' || task.priority === priority) &&
            ((!range.from && !range.through) || (task.due_date &&
              (!range.from || task.due_date >= range.from) &&
              (!range.through || task.due_date <= range.through))) &&
            task.title.toLowerCase().includes(query.trim()));
          assert.deepEqual(ids(filterTasks(tasks, completion, priority, range, query)), ids(expected));
        }
      }
    }
  }
  assert.deepEqual(tasks, original);
});

test('task edits, creation and movement re-evaluate the retained query and filters', () => {
  let tasks = [
    { id: 1, title: 'Alpha', priority: 'High', completed: false, due_date: '2024-02-29' },
    { id: 2, title: 'Other', priority: 'High', completed: false, due_date: '2024-02-29' },
    { id: 3, title: 'Alpha later', priority: 'High', completed: false, due_date: '2024-03-01' },
  ];
  const range = normalizeDueRange('2024-02-29', '2024-02-29');
  const visible = () => ids(filterTasks(tasks, 'Open', 'High', range, 'alpha'));
  assert.deepEqual(visible(), [1]);
  tasks[0].title = 'Not matching';
  assert.deepEqual(visible(), []);
  tasks[1].title = 'New ALPHA';
  assert.deepEqual(visible(), [2]);
  tasks[2].due_date = '2024-02-29';
  assert.deepEqual(visible(), [2, 3]);
  tasks[1].priority = 'Low';
  assert.deepEqual(visible(), [3]);
  tasks[2].completed = true;
  assert.deepEqual(visible(), []);
  tasks.push({ id: 4, title: 'Alpha created', priority: 'High', completed: false, due_date: '' });
  assert.deepEqual(visible(), []);
  tasks[3].due_date = '2024-02-29';
  assert.deepEqual(visible(), [4]);
  const moved = tasks[3];
  tasks = tasks.filter((task) => task !== moved);
  assert.deepEqual(visible(), []);
  tasks.push(moved);
  assert.deepEqual(visible(), [4]);
  assert.deepEqual(ids(filterTasks(tasks, 'Open', 'High', range, '')), [1, 4]);
  assert.deepEqual(range, { from: '2024-02-29', through: '2024-02-29' });
});
