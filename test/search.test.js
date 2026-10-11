import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesSearch, normalizeSearch } from '../search.js';
import { renderProjects, renderProject } from '../views.js';

test('search trims query boundaries and folds only ASCII letters and space/tab runs', () => {
  assert.equal(normalizeSearch(' \t Alpha  Beta \n'), 'Alpha  Beta');
  assert.equal(normalizeSearch(null), '');
  for (const [value, query, expected] of [
    ['Alpha  Beta', 'alpha  b', true],
    ['Alpha  Beta', 'alpha b', true],
    ['Alpha \t \tBeta', 'ALPHA\t\t B', true],
    ['Alpha Beta', 'alpha \t beta', true],
    ['Alpha\nBeta', 'alpha beta', false],
    ['Alpha\rBeta', 'alpha beta', false],
    ['Alpha\u00a0Beta', 'alpha beta', false],
    ['Alpha Beta', 'alphabeta', false],
    ['Éclair', 'éclair', false],
    ['Anything', '', true],
    ['100%_[x]', '%_[', true],
  ]) assert.equal(matchesSearch(value, query), expected);
});

test('search UI escapes queries and carries applied state in every editing form', () => {
  const query = '"<find>&';
  const escaped = '&quot;&lt;find&gt;&amp;';
  const projects = renderProjects([{ id: 'p', name: 'Project', archived: 0, total_count: 0, completed_count: 0 }], 'Active', '', query);
  assert.match(projects, /<label for="project-search">Project search<\/label>/);
  assert.match(projects, />Search projects<\/button>/);
  for (const form of projects.matchAll(/<form[^>]+(?:method="post"|class="project-filter")[\s\S]*?<\/form>/g)) {
    assert.ok(form[0].includes(`name="query" value="${escaped}"`));
  }
  const project = { id: 'p', name: 'Project', archived: 1, default_task_priority: 'Normal' };
  const html = renderProject(project, [{ id: 't', title: 'Task', completed: 0, priority: 'Normal', due_date: '' }], 'Open', '', 'High', { from: '2026-01-01', through: '' }, [], query);
  assert.match(html, /<label for="task-search">Task search<\/label>/);
  assert.match(html, /<button type="submit">Search tasks<\/button>/);
  for (const form of html.matchAll(/<form[\s\S]*?<\/form>/g)) {
    if (form[0].includes('action="/"') || form[0].includes('action="/projects/p/export"')) continue;
    assert.ok(form[0].includes(`name="query" value="${escaped}"`));
  }
});
