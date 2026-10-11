import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesSearch, filterProjects, filterTasks } from '../public/task-filters.js';

test('search trims query edges, preserves internal whitespace and ignores only ASCII case', () => {
  assert.equal(matchesSearch('Quarterly ROAD map', '\t road \n'), true);
  assert.equal(matchesSearch('ROAD  map', 'road map'), false);
  assert.equal(matchesSearch('ROAD  map', ' road  MAP '), true);
  assert.equal(matchesSearch('Résumé', 'résumé'), true);
  assert.equal(matchesSearch('Résumé', 'RÉSUMÉ'), false);
  assert.equal(matchesSearch('Item [One]', '[oNE]'), true);
  assert.equal(matchesSearch('Anything', ' \t\n '), true);
  assert.equal(matchesSearch('Anything', 'missing'), false);
});

test('project search intersects archive status, retains order and all-task summaries', () => {
  const projects = [
    { id: 1, name: 'Alpha plan', archived: 0, total: 4, completed: 2 },
    { id: 2, name: 'Other', archived: 0, total: 1, completed: 0 },
    { id: 3, name: 'ALPHA archive', archived: 1, total: 7, completed: 6 },
    { id: 4, name: 'Another alpha', archived: 0, total: 0, completed: 0 },
  ];
  const original = structuredClone(projects);
  const query = ' Alpha ';
  assert.deepEqual(filterProjects(projects, 'active', query), [projects[0], projects[3]]);
  assert.deepEqual(filterProjects(projects, 'archived', query), [projects[2]]);
  assert.deepEqual(filterProjects(projects, 'active', ''), [projects[0], projects[1], projects[3]]);
  assert.deepEqual(filterProjects(projects, 'active', 'absent'), []);
  assert.deepEqual(projects, original);
  projects[0].archived = 1;
  assert.deepEqual(filterProjects(projects, 'archived', query), [projects[0], projects[2]]);
  projects[0].archived = 0;
  assert.deepEqual(filterProjects(projects, 'active', query), [projects[0], projects[3]]);
});

test('task search intersects every completion, priority and due-range combination without changing data', () => {
  const tasks = [
    { id: 1, title: 'Plan first', completed: false, priority: 'High', due_date: '' },
    { id: 2, title: 'Second PLAN', completed: true, priority: 'Normal', due_date: '2026-05-01' },
    { id: 3, title: 'Unrelated', completed: false, priority: 'High', due_date: '2026-05-15' },
    { id: 4, title: 'Plan  fourth', completed: false, priority: 'High', due_date: '2026-05-31' },
    { id: 5, title: 'Plan fifth', completed: true, priority: 'Low', due_date: '2026-06-01' },
  ];
  const original = structuredClone(tasks);
  for (const completion of ['all', 'open', 'completed']) {
    for (const priority of ['all', 'Low', 'Normal', 'High']) {
      for (const range of [
        { from: '', through: '' },
        { from: '2026-05-01', through: '2026-05-31' },
        { from: '', through: '2026-05-01' },
        { from: '2026-05-31', through: '' },
      ]) {
        const otherMatches = filterTasks(tasks, completion, priority, range);
        assert.deepEqual(filterTasks(tasks, completion, priority, range, ' pLaN '),
          otherMatches.filter(task => task.id !== 3));
        assert.deepEqual(filterTasks(tasks, completion, priority, range, ' '), otherMatches);
      }
    }
  }
  assert.deepEqual(tasks, original);
});

test('edits and creation re-evaluate an applied query alongside unchanged filters', () => {
  const tasks = [
    { id: 1, title: 'Ship first', completed: false, priority: 'High', due_date: '2026-05-01' },
    { id: 2, title: 'Other second', completed: false, priority: 'High', due_date: '2026-05-31' },
  ];
  const range = { from: '2026-05-01', through: '2026-05-31' };
  const visible = () => filterTasks(tasks, 'open', 'High', range, 'ship').map(task => task.id);
  assert.deepEqual(visible(), [1]);
  tasks[1].title = 'SHIP second';
  assert.deepEqual(visible(), [1, 2]);
  tasks[0].title = 'Other first';
  assert.deepEqual(visible(), [2]);
  tasks[1].completed = true;
  assert.deepEqual(visible(), []);
  tasks[1].completed = false;
  tasks[1].priority = 'Low';
  assert.deepEqual(visible(), []);
  tasks[1].priority = 'High';
  tasks[1].due_date = '';
  assert.deepEqual(visible(), []);
  tasks[1].due_date = '2026-05-15';
  tasks.push({ id: 3, title: 'Ship third', completed: false, priority: 'High', due_date: '2026-05-20' });
  assert.deepEqual(visible(), [2, 3]);
  tasks.splice(1, 1); // Moving the matching task out retains remaining order.
  assert.deepEqual(visible(), [3]);
  assert.deepEqual(range, { from: '2026-05-01', through: '2026-05-31' });
});
