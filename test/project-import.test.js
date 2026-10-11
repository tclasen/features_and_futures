import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProjectImport } from '../project-import.js';

const task = { title: '  Original\t title  ', completed: true, priority: 'High', dueDate: '2000-02-29', notes: '  α <b>\r\nline\r  ', deleted: false };
const document = { format: 'workboard-project', version: 1, project: { name: 'Original', archived: false, defaultPriority: 'Low', tasks: [task] } };

test('portable import preserves exact titles and normalizes only notes line endings', () => {
  const input = structuredClone(document);
  input.project.id = 99;
  input.project.tasks[0].id = 123;
  input.project.tasks[0].position = -1;
  const result = parseProjectImport(JSON.stringify(input));
  assert.deepEqual(result, { ...document.project, tasks: [{ ...task, notes: '  α <b>\nline\n  ' }] });
  assert.deepEqual(parseProjectImport(JSON.stringify({ ...document, project: { ...document.project, tasks: [] } })), { ...document.project, tasks: [] });
});

test('portable import rejects malformed documents and every invalid required field', () => {
  for (const text of [null, 42, '', '{', 'null', '[]', 'true']) assert.equal(parseProjectImport(text), null);
  const mutations = [
    (value) => { value.format = 'other'; },
    (value) => { value.version = '1'; },
    (value) => { value.version = 1.5; },
    (value) => { value.version = 2; },
    (value) => { value.project = []; },
    (value) => { value.project.name = ' \t\n'; },
    (value) => { value.project.archived = 0; },
    (value) => { value.project.defaultPriority = 'normal'; },
    (value) => { value.project.tasks = {}; },
  ];
  for (const field of ['format', 'version', 'project']) mutations.push((value) => { delete value[field]; });
  for (const field of ['name', 'archived', 'defaultPriority', 'tasks']) mutations.push((value) => { delete value.project[field]; });
  for (const field of Object.keys(task)) mutations.push((value) => { delete value.project.tasks[0][field]; });
  for (const [field, invalidValues] of Object.entries({
    title: ['', ' \t\n', null, 42], completed: ['true', 1, null], priority: ['normal', '', null],
    dueDate: ['1900-02-29', '2025-02-29', '0000-01-01', '10000-01-01', '2024-04-31', '2024-1-01', ' 2000-02-29 ', ' ', null],
    notes: [null, 42, {}], deleted: [0, 'false', null],
  })) for (const invalid of invalidValues) mutations.push((value) => { value.project.tasks[0][field] = invalid; });
  for (const mutate of mutations) {
    const input = structuredClone(document);
    mutate(input);
    assert.equal(parseProjectImport(JSON.stringify(input)), null, JSON.stringify(input));
  }
  for (const dueDate of ['', '0001-01-01', '9999-12-31', '2400-02-29']) {
    const input = structuredClone(document);
    input.project.tasks[0].dueDate = dueDate;
    assert.equal(parseProjectImport(JSON.stringify(input)).tasks[0].dueDate, dueDate);
  }
});
